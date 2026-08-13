CREATE TABLE clientes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id text NOT NULL,
    nome text NOT NULL,
    -- Nullable desde a Phase 5 (BOO-01): o cliente final agenda com WhatsApp OU
    -- e-mail. O par de contatos é obrigatório em conjunto, nunca individualmente
    -- — quem garante isso é ck_clientes_contato_obrigatorio, abaixo.
    telefone text,
    email text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES perfis_empresas(tenant_id) ON DELETE CASCADE,
    -- Dedupe atômico por telefone dentro do tenant. Nome explícito e idêntico ao
    -- da migration à mão para o db diff futuro não propor dropar/recriar (o nome
    -- que o Postgres geraria — clientes_tenant_id_telefone_key — seria diferente).
    CONSTRAINT clientes_tenant_telefone_key UNIQUE (tenant_id, telefone),
    CONSTRAINT ck_clientes_contato_obrigatorio CHECK (telefone IS NOT NULL OR email IS NOT NULL)
);

-- Gêmeo do clientes_tenant_telefone_key para o eixo e-mail (Phase 5). ÚNICO, não
-- simples: é ele o alvo de inferência que faz o EXCEPTION WHEN unique_violation da
-- RPC disparar quando duas requisições e-mail-only concorrentes tentam criar o
-- mesmo cliente. Com um índice comum, aquele handler é código morto e a corrida
-- volta a duplicar linha — a regressão AGE-05/D-01 que a UNIQUE de telefone fecha.
-- Parcial porque email é nullable e NULL não colide; lower() porque e-mail não
-- distingue caixa e o lookup da RPC compara lower(email).
CREATE UNIQUE INDEX idx_clientes_tenant_email
    ON clientes (tenant_id, lower(email))
    WHERE email IS NOT NULL;

-- Habilitar RLS
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
-- 1. Leitura protegida para o profissional (B2B)
CREATE POLICY "Permitir SELECT para membros da org autenticados" 
ON clientes FOR SELECT TO authenticated
USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

-- 2. Criação restrita ao profissional (cadastro pelo agendamento manual do
--    dashboard). O cadastro vindo do booking público (B2C) passa pela Server
--    Action com cliente privilegiado, depois de validar tenant e sanitizar o
--    telefone — nunca pela Data API.
CREATE POLICY "Permitir INSERT para membros da org autenticados"
ON clientes FOR INSERT TO authenticated
WITH CHECK (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

-- 3. Atualização e remoção restritas ao profissional (B2B)
CREATE POLICY "Permitir UPDATE para membros da org autenticados" 
ON clientes FOR UPDATE TO authenticated
USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'))
WITH CHECK (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

CREATE POLICY "Permitir DELETE para membros da org autenticados" 
ON clientes FOR DELETE TO authenticated
USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

-- Comentários
COMMENT ON POLICY "Permitir INSERT para membros da org autenticados" ON clientes IS
'Cadastro de cliente pelo agendamento manual do dashboard. A criação pelo cliente final passa pela Server Action pública, que resolve o tenant a partir do slug, sanitiza o telefone e escreve com privilégio de serviço — a policy anterior aceitava qualquer tenant_id não nulo vindo da role anônima, o que permitia injetar cliente na base de qualquer profissional.';

COMMENT ON TABLE clientes IS 'Armazena os contatos e dados básicos de clientes de cada tenant.';
COMMENT ON COLUMN clientes.tenant_id IS 'Identificador do tenant dono deste registro de cliente.';
COMMENT ON COLUMN clientes.telefone IS 'WhatsApp/Contato telefônico do cliente.';

COMMENT ON CONSTRAINT clientes_tenant_telefone_key ON clientes IS
'Garante que dois clientes com o mesmo telefone no mesmo tenant nunca virem registros duplicados (AGE-05). É o pré-requisito do upsert atômico reaproveitar_ou_criar_cliente: sem esta UNIQUE, o ON CONFLICT (tenant_id, telefone) não tem alvo de inferência e duas requisições simultâneas com o mesmo telefone criam duas linhas. Escopo (tenant_id, telefone), nunca só telefone — o mesmo cliente pode existir em tenants diferentes. Insumo da Phase 5, quando telefone vira nullable com CHECK (telefone IS NOT NULL OR email IS NOT NULL).';

-- Reaproveita o cliente existente (por tenant_id + telefone) ou cria um novo,
-- de forma ATÔMICA. Substitui o select-then-insert não-atômico do fluxo público
-- (public-booking.ts): duas requisições simultâneas com o mesmo telefone
-- criavam duas linhas na janela entre o SELECT e o INSERT. O supabase-js
-- .upsert() não serve porque faz overwrite da linha inteira (EXCLUDED.*) — não
-- expressa COALESCE-on-conflict. Como clientes.nome é NOT NULL, o COALESCE
-- sempre mantém o nome já curado no dashboard; email (nullable) só é preenchido
-- quando estava vazio (insumo da Phase 5). Serve os dois fluxos: público
-- (service_role, RLS bypassado) e walk-in (authenticated, RLS de clientes
-- preservada por ser SECURITY INVOKER). Analog: substituir_horarios_funcionamento
-- em 03_horarios_funcionamento.sql — mesma família de operação atômica que o
-- supabase-js não expressa e por isso vive no banco.
-- Phase 5: passou a resolver por DOIS eixos (WhatsApp primeiro, e-mail como
-- fallback), o que não cabe num único ON CONFLICT — a inferência aponta para uma
-- constraint só. Daí o lookup explícito seguido de INSERT, com a corrida coberta
-- pelo EXCEPTION: ambos os eixos têm índice ÚNICO (clientes_tenant_telefone_key e
-- idx_clientes_tenant_email), então duas requisições concorrentes terminam com uma
-- inserindo e a outra caindo em unique_violation, que re-consulta e devolve a linha
-- vencedora. Sem o índice único do e-mail este handler é inalcançável por aquele
-- eixo — foi assim que a fase nasceu, e é o que o CR-02 da revisão apontou.
CREATE OR REPLACE FUNCTION public.reaproveitar_ou_criar_cliente(
    p_tenant_id text, p_telefone text, p_nome text, p_email text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
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
$function$;

-- GRANT explícito é OBRIGATÓRIO: a default privilege global de EXECUTE para
-- PUBLIC foi revogada em 20260722183153; função nova nasce sem EXECUTE e falha
-- com "permission denied for function" (alto e claro, nunca silencioso) sem isto.
-- NADA para anon — o cliente final não tem Data API; o público chama via
-- service_role. NUNCA definida como DEFINER: reabriria a porta de um
-- authenticated gravar em tenant alheio (o tenant_id viria de argumento, sem
-- checagem de RLS). Por isso INVOKER, sempre.
REVOKE ALL ON FUNCTION public.reaproveitar_ou_criar_cliente(text, text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reaproveitar_ou_criar_cliente(text, text, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.reaproveitar_ou_criar_cliente(text, text, text, text) IS
'Reaproveita ou cria cliente resolvendo por dois eixos dentro do tenant: WhatsApp primeiro, e-mail (sem distinção de caixa) como fallback — BOO-03. Preenche só o que falta com COALESCE: nome curado no dashboard nunca é sobrescrito pelo que o visitante digitou. A corrida que duplicava clientes (AGE-05, D-01) é fechada pelos índices ÚNICOS dos DOIS eixos mais o EXCEPTION WHEN unique_violation, que re-consulta e devolve a linha do vencedor; quando a re-consulta não acha nada, a exceção original sobe em vez de virar NULL (que a Server Action leria como erro_interno opaco). SECURITY INVOKER: preserva o RLS de clientes no fluxo walk-in authenticated; o público roda com service_role (RLS bypassado por design). GRANT só a authenticated/service_role, nunca anon.';

COMMENT ON CONSTRAINT ck_clientes_contato_obrigatorio ON clientes IS
'Todo cliente tem pelo menos um meio de contato (BOO-01). É a contraparte no banco da regra que a Server Action pública aplica: telefone e e-mail são individualmente opcionais, mas o conjunto vazio é recusado. Sem ela, uma escrita fora da action criaria cliente inalcançável — presente na agenda do profissional e impossível de avisar.';

COMMENT ON INDEX idx_clientes_tenant_email IS
'Gêmeo de clientes_tenant_telefone_key no eixo e-mail. ÚNICO por necessidade, não por otimização: é o alvo de inferência que faz o EXCEPTION WHEN unique_violation da RPC disparar no caminho e-mail-only. Como índice simples (estado em que a Phase 5 nasceu), duas requisições e-mail-only concorrentes criavam duas linhas para a mesma pessoa e o histórico do cliente se partia em dois no dashboard.';
