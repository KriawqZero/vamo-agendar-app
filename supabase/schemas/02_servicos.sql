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
-- 1. Leitura pública para quem vai realizar o agendamento
CREATE POLICY "Permitir SELECT público para todos" 
ON servicos FOR SELECT TO anon, authenticated
USING (ativo = true);

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
