CREATE TABLE clientes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id text NOT NULL,
    nome text NOT NULL,
    telefone text NOT NULL,
    email text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES perfis_empresas(tenant_id) ON DELETE CASCADE
);

-- Habilitar RLS
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
-- 1. Leitura protegida para o profissional (B2B)
CREATE POLICY "Permitir SELECT para membros da org autenticados" 
ON clientes FOR SELECT TO authenticated
USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

-- 2. Inserção pública para novos clientes se cadastrando no booking (B2C)
CREATE POLICY "Permitir INSERT público para visitantes" 
ON clientes FOR INSERT TO anon, authenticated
WITH CHECK (tenant_id IS NOT NULL);

-- 3. Atualização e remoção restritas ao profissional (B2B)
CREATE POLICY "Permitir UPDATE para membros da org autenticados" 
ON clientes FOR UPDATE TO authenticated
USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'))
WITH CHECK (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

CREATE POLICY "Permitir DELETE para membros da org autenticados" 
ON clientes FOR DELETE TO authenticated
USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

-- Comentários
COMMENT ON TABLE clientes IS 'Armazena os contatos e dados básicos de clientes de cada tenant.';
COMMENT ON COLUMN clientes.tenant_id IS 'Identificador do tenant dono deste registro de cliente.';
COMMENT ON COLUMN clientes.telefone IS 'WhatsApp/Contato telefônico do cliente.';
