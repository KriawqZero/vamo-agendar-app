CREATE TABLE excecoes_agenda (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id text NOT NULL,
    data date NOT NULL,
    hora_inicio time without time zone, -- Se nulo, representa o dia inteiro bloqueado
    hora_fim time without time zone,     -- Se nulo, representa o dia inteiro bloqueado
    bloqueado boolean NOT NULL DEFAULT true, -- Se true, o horário está indisponível para agendamento
    motivo text, -- Ex: 'Feriado', 'Médico', 'Almoço estendido'
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES perfis_empresas(tenant_id) ON DELETE CASCADE
);

-- Habilitar RLS
ALTER TABLE excecoes_agenda ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
-- 1. Leitura pública para quem vai realizar o agendamento
CREATE POLICY "Permitir SELECT público para todos" 
ON excecoes_agenda FOR SELECT TO anon, authenticated
USING (true);

-- 2. Escrita protegida para o tenant dono do bloqueio
CREATE POLICY "Permitir INSERT para donos da org autenticados" 
ON excecoes_agenda FOR INSERT TO authenticated
WITH CHECK (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

CREATE POLICY "Permitir UPDATE para donos da org autenticados" 
ON excecoes_agenda FOR UPDATE TO authenticated
USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'))
WITH CHECK (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

CREATE POLICY "Permitir DELETE para donos da org autenticados" 
ON excecoes_agenda FOR DELETE TO authenticated
USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

-- Comentários
COMMENT ON TABLE excecoes_agenda IS 'Armazena bloqueios manuais e exceções de horário da agenda para cada tenant.';
COMMENT ON COLUMN excecoes_agenda.data IS 'Data específica da exceção.';
COMMENT ON COLUMN excecoes_agenda.bloqueado IS 'Indica se a janela está bloqueada (true) ou liberada extraordinariamente (false).';
COMMENT ON COLUMN excecoes_agenda.hora_inicio IS 'Horário de início da exceção (nulo indica o dia inteiro).';
COMMENT ON COLUMN excecoes_agenda.hora_fim IS 'Horário de fim da exceção (nulo indica o dia inteiro).';
