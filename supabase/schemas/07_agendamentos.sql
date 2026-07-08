CREATE TABLE agendamentos (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id text NOT NULL,
    cliente_id uuid NOT NULL,
    servico_id uuid NOT NULL,
    data_hora timestamp with time zone NOT NULL,
    status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'confirmado', 'concluido', 'cancelado')),
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES perfis_empresas(tenant_id) ON DELETE CASCADE,
    CONSTRAINT fk_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
    CONSTRAINT fk_servico FOREIGN KEY (servico_id) REFERENCES servicos(id) ON DELETE RESTRICT
);

-- Habilitar RLS
ALTER TABLE agendamentos ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
-- 1. Leitura pública para busca de slots ocupados (B2C)
CREATE POLICY "Permitir SELECT público para todos" 
ON agendamentos FOR SELECT TO anon, authenticated
USING (true);

-- 2. Inserção pública para agendamentos anônimos (B2C)
CREATE POLICY "Permitir INSERT público para visitantes" 
ON agendamentos FOR INSERT TO anon, authenticated
WITH CHECK (tenant_id IS NOT NULL);

-- 3. Edição e cancelamento restritos ao profissional (B2B)
CREATE POLICY "Permitir UPDATE para membros da org autenticados" 
ON agendamentos FOR UPDATE TO authenticated
USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'))
WITH CHECK (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

CREATE POLICY "Permitir DELETE para membros da org autenticados" 
ON agendamentos FOR DELETE TO authenticated
USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

-- Comentários
COMMENT ON TABLE agendamentos IS 'Registra os agendamentos realizados pelos clientes finais.';
COMMENT ON COLUMN agendamentos.tenant_id IS 'Identificador do tenant dono deste agendamento.';
COMMENT ON COLUMN agendamentos.status IS 'Status da reserva (pendente, confirmado, concluido, cancelado).';
COMMENT ON COLUMN agendamentos.data_hora IS 'Data e hora em que o atendimento está marcado.';
