CREATE TABLE perfis_empresas (
    tenant_id text PRIMARY KEY, -- O org_id do Clerk
    slug text NOT NULL UNIQUE, -- O slug para o link público, ex: 'barbearia-do-ze'
    nome_estabelecimento text NOT NULL,
    descricao text,
    telefone_contato text,
    cor_marca text,  -- cor de destaque da página pública (recurso Plus+; ainda não consumido pelo booking)
    logo_url text,   -- URL do logo na página pública (recurso Pro; ainda não consumido pelo booking)
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS
ALTER TABLE perfis_empresas ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
-- 1. Leitura pública para quem vai realizar o agendamento
CREATE POLICY "Permitir SELECT público para todos" 
ON perfis_empresas FOR SELECT TO anon, authenticated
USING (true);

-- 2. Escrita protegida para o tenant autenticado
CREATE POLICY "Permitir INSERT para donos da org autenticados" 
ON perfis_empresas FOR INSERT TO authenticated
WITH CHECK (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

CREATE POLICY "Permitir UPDATE para donos da org autenticados" 
ON perfis_empresas FOR UPDATE TO authenticated
USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'))
WITH CHECK (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

CREATE POLICY "Permitir DELETE para donos da org autenticados" 
ON perfis_empresas FOR DELETE TO authenticated
USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

-- Comentários
COMMENT ON TABLE perfis_empresas IS 'Armazena as informações públicas de perfil de cada estabelecimento/tenant.';
COMMENT ON COLUMN perfis_empresas.tenant_id IS 'Identificador único da organização no Clerk (tenant).';
COMMENT ON COLUMN perfis_empresas.slug IS 'Slug único utilizado na URL pública de agendamento.';
COMMENT ON COLUMN perfis_empresas.nome_estabelecimento IS 'Nome fantasia exibido no cabeçalho do agendamento.';
COMMENT ON COLUMN perfis_empresas.cor_marca IS 'Cor de destaque da página pública de booking (recurso do plano Plus+). Ainda não aplicada na UI pública.';
COMMENT ON COLUMN perfis_empresas.logo_url IS 'URL do logo exibido na página pública de booking (recurso do plano Pro). Ainda não aplicada na UI pública.';
