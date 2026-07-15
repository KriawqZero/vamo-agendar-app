CREATE TABLE whatsapp_configs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id text NOT NULL UNIQUE,
    instance_name text NOT NULL UNIQUE,
    instance_token text, -- O apikey de autenticação retornado pela Evolution API para esta instância
    status text NOT NULL DEFAULT 'desconectado' CHECK (status IN ('desconectado', 'conectando', 'aguardando_qrcode', 'conectado', 'instavel', 'falha')),
    ultima_verificacao_em timestamp with time zone, -- Última sincronização de status com o gateway (Evolution API)
    mensagem_confirmacao text NOT NULL DEFAULT 'Olá {{cliente}}, seu agendamento em {{empresa}} para {{data_hora}} está confirmado!',
    mensagem_lembrete text NOT NULL DEFAULT 'Olá {{cliente}}, passando para lembrar do seu agendamento em {{empresa}} no dia {{data}} às {{hora}}.',
    tempo_lembrete_minutos integer NOT NULL DEFAULT 120, -- Padrão de 2 horas antes
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES perfis_empresas(tenant_id) ON DELETE CASCADE
);

-- Habilitar RLS
ALTER TABLE whatsapp_configs ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS (B2B - Apenas donos do Tenant)
CREATE POLICY "Permitir SELECT para membros da org autenticados" 
ON whatsapp_configs FOR SELECT TO authenticated
USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

CREATE POLICY "Permitir INSERT para membros da org autenticados" 
ON whatsapp_configs FOR INSERT TO authenticated
WITH CHECK (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

CREATE POLICY "Permitir UPDATE para membros da org autenticados" 
ON whatsapp_configs FOR UPDATE TO authenticated
USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'))
WITH CHECK (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

CREATE POLICY "Permitir DELETE para membros da org autenticados" 
ON whatsapp_configs FOR DELETE TO authenticated
USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

-- Comentários
COMMENT ON TABLE whatsapp_configs IS 'Armazena as configurações de integração e instâncias do WhatsApp da Evolution API para cada tenant.';
COMMENT ON COLUMN whatsapp_configs.instance_name IS 'Nome fantasia da instância criada no gateway.';
COMMENT ON COLUMN whatsapp_configs.instance_token IS 'Chave de autenticação (hash.apikey) retornado na criação da instância.';
COMMENT ON COLUMN whatsapp_configs.status IS 'Estado da conexão sincronizado com o gateway: desconectado (sem instância ativa); conectando (instância criada, gateway ainda estabelecendo sessão); aguardando_qrcode (QR Code gerado, aguardando pareamento pelo profissional); conectado (sessão WhatsApp ativa e confirmada pelo gateway); instavel (não foi possível confirmar o estado com o gateway agora — indisponibilidade temporária); falha (instância inexistente no gateway ou erro definitivo que exige reconexão).';
COMMENT ON COLUMN whatsapp_configs.ultima_verificacao_em IS 'Timestamp da última sincronização de status bem-sucedida com o gateway (Evolution API).';
