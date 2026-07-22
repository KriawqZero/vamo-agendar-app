CREATE TABLE servicos (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id text NOT NULL, -- Vinculado ao org_id do Clerk
    nome text NOT NULL,
    descricao text,
    preco numeric(10,2) NOT NULL DEFAULT 0.00,
    duracao_minutos integer NOT NULL DEFAULT 30,
    ativo boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES perfis_empresas(tenant_id) ON DELETE CASCADE
);

-- Habilitar RLS
ALTER TABLE servicos ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
-- 1. REMOVIDA na Phase 1 pela migration
--    20260722145948_fecha_policies_residuais_servicos_horarios.sql.
--    Era uma policy de SELECT concedida a anon e authenticated com a expressão
--    `ativo = true`, sem cláusula de tenant. Como policies são permissivas e se
--    somam por OR, o predicado efetivo de qualquer conta logada virava
--    `(ativo = true) OR (tenant_id = próprio)` — ou seja, qualquer profissional
--    lia o catálogo (e o tenant_id) de todos os outros. Para a role anônima ela
--    já era inerte desde a 20260722060000 (sem privilégio, policy não é avaliada),
--    mas continuava pré-carregada: um único GRANT ... TO anon futuro reabriria o
--    buraco sem que nenhuma policy nova precisasse existir.
--
--    NÃO HÁ SUBSTITUTA, de propósito: o bloco 1b logo abaixo já cobre o próprio
--    tenant INCLUSIVE as linhas inativas — é o que permite reativar um serviço e
--    o que faz o INSERT/UPDATE ... RETURNING funcionar. Uma segunda policy seria
--    redundância pura (a D-07 não se aplica aqui justamente porque a 1b pré-existe).
--
--    Nada anônimo depende disto: desde o plano 01-02 toda a leitura pública desta
--    tabela acontece pelo createAdminClient() (service role, RLS bypassado), com o
--    tenant resolvido no servidor a partir do slug.

-- 1b. O dono precisa enxergar também os serviços inativos (para reativá-los),
-- e INSERT/UPDATE ... RETURNING (usado pelo .select() do supabase-js) exige
-- que a linha passe no SELECT — sem esta política, desativar um serviço falharia.
CREATE POLICY "Permitir SELECT do próprio tenant para autenticados"
ON servicos FOR SELECT TO authenticated
USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

-- 2. Escrita protegida para o tenant dono do serviço
CREATE POLICY "Permitir INSERT para donos da org autenticados" 
ON servicos FOR INSERT TO authenticated
WITH CHECK (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

CREATE POLICY "Permitir UPDATE para donos da org autenticados" 
ON servicos FOR UPDATE TO authenticated
USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'))
WITH CHECK (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

CREATE POLICY "Permitir DELETE para donos da org autenticados" 
ON servicos FOR DELETE TO authenticated
USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

-- Comentários
COMMENT ON TABLE servicos IS 'Armazena os serviços oferecidos por cada estabelecimento (tenant).';
COMMENT ON COLUMN servicos.tenant_id IS 'Identificador do tenant (Clerk org_id) dono deste serviço.';
COMMENT ON COLUMN servicos.duracao_minutos IS 'Duração padrão do serviço em minutos, usada para calcular slots.';
COMMENT ON COLUMN servicos.preco IS 'Valor cobrado pelo serviço.';
