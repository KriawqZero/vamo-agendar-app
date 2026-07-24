CREATE TABLE clientes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id text NOT NULL,
    nome text NOT NULL,
    telefone text NOT NULL,
    email text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES perfis_empresas(tenant_id) ON DELETE CASCADE,
    -- Dedupe atômico por telefone dentro do tenant. Nome explícito e idêntico ao
    -- da migration à mão para o db diff futuro não propor dropar/recriar (o nome
    -- que o Postgres geraria — clientes_tenant_id_telefone_key — seria diferente).
    CONSTRAINT clientes_tenant_telefone_key UNIQUE (tenant_id, telefone)
);

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
CREATE OR REPLACE FUNCTION public.reaproveitar_ou_criar_cliente(
    p_tenant_id text, p_telefone text, p_nome text, p_email text DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
    INSERT INTO public.clientes (tenant_id, telefone, nome, email)
    VALUES (p_tenant_id, p_telefone, p_nome, p_email)
    ON CONFLICT (tenant_id, telefone) DO UPDATE
        SET nome  = COALESCE(public.clientes.nome,  EXCLUDED.nome),
            email = COALESCE(public.clientes.email, EXCLUDED.email)
    RETURNING id;
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
'Upsert atômico de cliente por (tenant_id, telefone): cria se não existe, senão preenche só o que falta com COALESCE (nome curado nunca é sobrescrito; email vazio é completado). Substitui o select-then-insert não-atômico do booking público, fechando a corrida que duplicava clientes (AGE-05, D-01). SECURITY INVOKER: preserva o RLS de clientes no fluxo walk-in authenticated; o público roda com service_role (RLS bypassado por design). GRANT só a authenticated/service_role, nunca anon.';
