-- Sincroniza o banco com o schema declarativo das Phases 4 e 5 e fecha os
-- CR-01/CR-02 das duas revisões de código.
--
-- Origem: `supabase db diff --local`. O delta bruto veio acompanhado de dezenas
-- de `revoke ... from authenticated/service_role` e `grant references|trigger|
-- truncate ... to anon`, que o migra emite porque não enxerga os REVOKE de
-- privilégio escritos à mão nas migrations 20260709193156, 20260722044858,
-- 20260722060000 e 20260722183153. Aplicá-los reabriria a Data API que a Phase 1
-- fechou. Removidos deliberadamente — é o caso que o CLAUDE.md descreve ao dizer
-- que privilégio não passa por `db diff`. Conferido no banco: `tb_email_log` não
-- concede nada a anon nem a authenticated (só service_role), como esperado.

-- ── Phase 5 / CR-02: o índice de e-mail precisa ser ÚNICO ───────────────────
-- Como índice simples, o EXCEPTION WHEN unique_violation da RPC era inalcançável
-- pelo eixo de e-mail: duas requisições e-mail-only concorrentes criavam duas
-- linhas para a mesma pessoa (regressão AGE-05/D-01).
drop index if exists "public"."idx_clientes_tenant_email";

CREATE UNIQUE INDEX idx_clientes_tenant_email
    ON public.clientes USING btree (tenant_id, lower(email))
    WHERE (email IS NOT NULL);

-- ── Phase 4 / CR-02: status terminal para falha permanente ──────────────────
-- Sem 'descartado', toda falha permanente (sem chave de API, domínio não
-- verificado, endereço malformado) gravava 'falhou', que o índice parcial trata
-- como retentável — e o gatilho no layout do dashboard recriava a linha e batia
-- no Resend a cada renderização de servidor.
alter table "public"."tb_email_log" drop constraint "tb_email_log_status_check";

alter table "public"."tb_email_log"
    add constraint "tb_email_log_status_check"
    CHECK ((status = ANY (ARRAY['pendente'::text, 'enviado'::text, 'falhou'::text, 'descartado'::text])))
    not valid;

alter table "public"."tb_email_log" validate constraint "tb_email_log_status_check";

-- Idempotência agora escopada por tenant (a chave é construída pela aplicação e
-- não deve depender de unicidade global) e com 'descartado' DENTRO do predicado,
-- para a chave seguir travada no caso permanente.
drop index if exists "public"."idx_email_log_chave_idempotencia_ativa";

CREATE UNIQUE INDEX idx_email_log_chave_idempotencia_ativa
    ON public.tb_email_log USING btree (tenant_id, chave_idempotencia)
    WHERE (status <> 'falhou'::text);

-- ── Phase 4: RLS explícita em tb_email_log ──────────────────────────────────
-- A tabela tinha RLS habilitada apenas por efeito colateral do event trigger
-- rls_auto_enable (que engole exceção), e nenhuma policy. Hoje a role
-- authenticated não tem privilégio de tabela aqui — a escrita do fluxo
-- transacional passa por service_role —, então estas policies são a rede que já
-- estará no lugar se algum dia o dashboard passar a ler o log de entregabilidade.
-- Granulares por ação e nunca FOR ALL; sem nada para anon. Não há policy de
-- DELETE: o log é append-only.
create policy "Permitir SELECT para membros da org autenticados"
    on "public"."tb_email_log"
    as permissive for select to authenticated
    using ((tenant_id = ( SELECT (auth.jwt() ->> 'org_id'::text))));

create policy "Permitir INSERT para membros da org autenticados"
    on "public"."tb_email_log"
    as permissive for insert to authenticated
    with check ((tenant_id = ( SELECT (auth.jwt() ->> 'org_id'::text))));

create policy "Permitir UPDATE para membros da org autenticados"
    on "public"."tb_email_log"
    as permissive for update to authenticated
    using ((tenant_id = ( SELECT (auth.jwt() ->> 'org_id'::text))))
    with check ((tenant_id = ( SELECT (auth.jwt() ->> 'org_id'::text))));

-- ── Phase 5 / CR-02: RPC devolve erro em vez de NULL silencioso ─────────────
set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.reaproveitar_ou_criar_cliente(p_tenant_id text, p_telefone text, p_nome text, p_email text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
DECLARE
    v_cliente_id uuid;
BEGIN
    -- 1. WhatsApp tem precedência: é o contato que o produto trata como primário.
    IF p_telefone IS NOT NULL AND p_telefone <> '' THEN
        SELECT id INTO v_cliente_id
        FROM public.clientes
        WHERE tenant_id = p_tenant_id AND telefone = p_telefone
        LIMIT 1;
    END IF;

    -- 2. E-mail como fallback, comparado sem distinção de caixa (igual ao índice).
    IF v_cliente_id IS NULL AND p_email IS NOT NULL AND p_email <> '' THEN
        SELECT id INTO v_cliente_id
        FROM public.clientes
        WHERE tenant_id = p_tenant_id AND lower(email) = lower(p_email)
        LIMIT 1;
    END IF;

    -- 3. Achou: completa só o que falta. COALESCE na ordem (banco, argumento) —
    --    nome curado no dashboard nunca é sobrescrito pelo que o visitante digitou.
    IF v_cliente_id IS NOT NULL THEN
        UPDATE public.clientes
        SET nome     = COALESCE(public.clientes.nome, p_nome),
            telefone = COALESCE(public.clientes.telefone, p_telefone),
            email    = COALESCE(public.clientes.email, p_email)
        WHERE id = v_cliente_id;

        RETURN v_cliente_id;
    END IF;

    INSERT INTO public.clientes (tenant_id, telefone, nome, email)
    VALUES (p_tenant_id, p_telefone, p_nome, p_email)
    RETURNING id INTO v_cliente_id;

    RETURN v_cliente_id;
EXCEPTION WHEN unique_violation THEN
    -- Corrida perdida: alguém inseriu entre o nosso SELECT e o nosso INSERT.
    -- Re-consulta pelos mesmos dois eixos e devolve a linha do vencedor.
    IF p_telefone IS NOT NULL AND p_telefone <> '' THEN
        SELECT id INTO v_cliente_id
        FROM public.clientes
        WHERE tenant_id = p_tenant_id AND telefone = p_telefone
        LIMIT 1;
    END IF;
    IF v_cliente_id IS NULL AND p_email IS NOT NULL AND p_email <> '' THEN
        SELECT id INTO v_cliente_id
        FROM public.clientes
        WHERE tenant_id = p_tenant_id AND lower(email) = lower(p_email)
        LIMIT 1;
    END IF;

    -- Se a re-consulta não achou nada, a unique_violation veio de OUTRA constraint
    -- e devolver NULL aqui viraria `erro_interno` opaco na Server Action, com o
    -- agendamento perdido e uma Issue sem causa. Deixar o erro original subir é o
    -- lado certo do erro: falha alta e clara, com a constraint no texto.
    IF v_cliente_id IS NULL THEN
        RAISE;
    END IF;

    RETURN v_cliente_id;
END;
$function$
;

-- Comentários do schema declarativo que o migra não emite.
COMMENT ON TABLE public.tb_email_log IS
'Log de disparos de e-mail transacional por tenant. Acumula dois papéis: trava de idempotência (via idx_email_log_chave_idempotencia_ativa, que impede o mesmo e-mail sair duas vezes) e auditoria de entregabilidade. NUNCA-PII: não guarda destinatário, assunto nem corpo — só metadados, o id do Resend e um código curto de erro.';

COMMENT ON COLUMN public.tb_email_log.status IS
'Ciclo de vida do envio. pendente: gravado antes de chamar o Resend. enviado: aceito pelo provedor. falhou: falha TRANSITÓRIA — libera a chave para nova tentativa. descartado: falha PERMANENTE (sem chave de API, domínio não verificado, endereço malformado) — mantém a chave travada, porque retentar só repete a rejeição e queima reputação de domínio.';

COMMENT ON COLUMN public.perfis_empresas.email_contato IS
'E-mail do profissional usado como replyTo dos e-mails transacionais enviados ao cliente final (EML-04): a mensagem sai de naoresponda@mail.vamoagendar.com.br, mas responder chega ao estabelecimento, não ao VamoAgendar. Opcional — quando vazio, o replyTo cai no endereço institucional. Validado na action (formato + teto RFC 5321), sem CHECK no banco.';

COMMENT ON CONSTRAINT ck_clientes_contato_obrigatorio ON public.clientes IS
'Todo cliente tem pelo menos um meio de contato (BOO-01). É a contraparte no banco da regra que a Server Action pública aplica: telefone e e-mail são individualmente opcionais, mas o conjunto vazio é recusado. Sem ela, uma escrita fora da action criaria cliente inalcançável — presente na agenda do profissional e impossível de avisar.';

COMMENT ON INDEX public.idx_clientes_tenant_email IS
'Gêmeo de clientes_tenant_telefone_key no eixo e-mail. ÚNICO por necessidade, não por otimização: é o alvo de inferência que faz o EXCEPTION WHEN unique_violation da RPC disparar no caminho e-mail-only. Como índice simples (estado em que a Phase 5 nasceu), duas requisições e-mail-only concorrentes criavam duas linhas para a mesma pessoa e o histórico do cliente se partia em dois no dashboard.';
