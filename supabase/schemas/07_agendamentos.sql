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
-- 1. Leitura restrita ao profissional dono da agenda. A página pública lê a
--    ocupação pelo servidor com cliente privilegiado — a role anônima não
--    precisa (e não deve) enxergar agendamento nenhum: cliente_id e servico_id
--    permitem pivotar a agenda de qualquer tenant.
CREATE POLICY "Permitir SELECT do próprio tenant para autenticados"
ON agendamentos FOR SELECT TO authenticated
USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

-- 2. Criação restrita ao profissional (agendamento manual do dashboard).
--    O booking público (B2C) escreve pela Server Action com createAdminClient()
--    após validar tenant, serviço e slot — nunca pela Data API.
CREATE POLICY "Permitir INSERT para membros da org autenticados"
ON agendamentos FOR INSERT TO authenticated
WITH CHECK (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

-- 3. Edição e cancelamento restritos ao profissional (B2B)
CREATE POLICY "Permitir UPDATE para membros da org autenticados" 
ON agendamentos FOR UPDATE TO authenticated
USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'))
WITH CHECK (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

CREATE POLICY "Permitir DELETE para membros da org autenticados" 
ON agendamentos FOR DELETE TO authenticated
USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

-- Comentários
COMMENT ON POLICY "Permitir SELECT do próprio tenant para autenticados" ON agendamentos IS
'A agenda é dado operacional do tenant. O fluxo público de booking obtém ocupação pelo servidor, não pela role anônima.';
COMMENT ON POLICY "Permitir INSERT para membros da org autenticados" ON agendamentos IS
'Agendamento manual do dashboard. A criação pelo cliente final passa pela Server Action pública, que valida slot contra double-booking e escreve com privilégio de serviço.';

COMMENT ON TABLE agendamentos IS 'Registra os agendamentos realizados pelos clientes finais.';
COMMENT ON COLUMN agendamentos.tenant_id IS 'Identificador do tenant dono deste agendamento.';
COMMENT ON COLUMN agendamentos.status IS 'Status da reserva (pendente, confirmado, concluido, cancelado).';
COMMENT ON COLUMN agendamentos.data_hora IS 'Data e hora em que o atendimento está marcado.';
