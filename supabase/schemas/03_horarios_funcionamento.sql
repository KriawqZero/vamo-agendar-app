CREATE TABLE horarios_funcionamento (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id text NOT NULL,
    dia_semana integer NOT NULL CHECK (dia_semana BETWEEN 0 AND 6), -- 0 = Domingo, 1 = Segunda, ..., 6 = Sábado
    hora_inicio time without time zone NOT NULL DEFAULT '08:00:00',
    hora_fim time without time zone NOT NULL DEFAULT '18:00:00',
    ativo boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES perfis_empresas(tenant_id) ON DELETE CASCADE,
    CONSTRAINT uq_tenant_dia_semana UNIQUE (tenant_id, dia_semana) -- Apenas um registro de configuração por dia para o mesmo tenant
);

-- Habilitar RLS
ALTER TABLE horarios_funcionamento ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
-- 1. Leitura pública para quem vai realizar o agendamento
CREATE POLICY "Permitir SELECT público para todos" 
ON horarios_funcionamento FOR SELECT TO anon, authenticated
USING (ativo = true);

-- 2. Escrita protegida para o tenant dono do horário
CREATE POLICY "Permitir INSERT para donos da org autenticados" 
ON horarios_funcionamento FOR INSERT TO authenticated
WITH CHECK (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

CREATE POLICY "Permitir UPDATE para donos da org autenticados" 
ON horarios_funcionamento FOR UPDATE TO authenticated
USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'))
WITH CHECK (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

CREATE POLICY "Permitir DELETE para donos da org autenticados" 
ON horarios_funcionamento FOR DELETE TO authenticated
USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

-- Comentários
COMMENT ON TABLE horarios_funcionamento IS 'Define os horários comerciais padrão de funcionamento de cada tenant.';
COMMENT ON COLUMN horarios_funcionamento.dia_semana IS 'Dia da semana codificado (0=Domingo, 1=Segunda, ..., 6=Sábado).';
COMMENT ON COLUMN horarios_funcionamento.hora_inicio IS 'Horário de abertura de atendimento.';
COMMENT ON COLUMN horarios_funcionamento.hora_fim IS 'Horário de encerramento de atendimento.';
