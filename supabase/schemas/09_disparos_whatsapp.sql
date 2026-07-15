CREATE TABLE disparos_whatsapp (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id text NOT NULL,
    agendamento_id uuid,          -- NULL para tipo 'teste'
    tipo text NOT NULL CHECK (tipo IN ('confirmacao', 'lembrete', 'teste')),
    status text NOT NULL CHECK (status IN ('enviado', 'agendado', 'executado', 'falha', 'ignorado', 'cancelado')),
    motivo text,                  -- código curto do motivo; NUNCA conteúdo de mensagem ou telefone
    qstash_message_id text,       -- id do job no QStash (apenas para lembretes agendados)
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES perfis_empresas(tenant_id) ON DELETE CASCADE,
    CONSTRAINT fk_agendamento FOREIGN KEY (agendamento_id) REFERENCES agendamentos(id) ON DELETE CASCADE
);

CREATE INDEX idx_disparos_whatsapp_tenant_created ON disparos_whatsapp (tenant_id, created_at DESC);
CREATE INDEX idx_disparos_whatsapp_agendamento ON disparos_whatsapp (agendamento_id);

-- Habilitar RLS
ALTER TABLE disparos_whatsapp ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS (B2B - Apenas donos do Tenant). Log append-only:
-- não há UPDATE nem DELETE pela aplicação; sem qualquer política para anon.
CREATE POLICY "Permitir SELECT para membros da org autenticados"
ON disparos_whatsapp FOR SELECT TO authenticated
USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

CREATE POLICY "Permitir INSERT para membros da org autenticados"
ON disparos_whatsapp FOR INSERT TO authenticated
WITH CHECK (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

-- Comentários
COMMENT ON TABLE disparos_whatsapp IS 'Log append-only de disparos de mensageria WhatsApp (confirmação, lembrete e teste) por tenant. Registra apenas metadados de auditoria — nunca o conteúdo da mensagem nem o telefone do destinatário.';
COMMENT ON COLUMN disparos_whatsapp.agendamento_id IS 'Agendamento relacionado ao disparo; NULL para disparos do tipo teste.';
COMMENT ON COLUMN disparos_whatsapp.tipo IS 'Natureza do disparo: confirmacao (síncrono ao criar agendamento), lembrete (assíncrono via QStash) ou teste (envio manual pelo profissional).';
COMMENT ON COLUMN disparos_whatsapp.status IS 'Resultado do disparo. confirmacao: enviado|falha. lembrete: agendado|executado|falha|ignorado|cancelado. teste: enviado|falha.';
COMMENT ON COLUMN disparos_whatsapp.motivo IS 'Código curto explicando falha/ignorado (ex.: agendamento_cancelado, plano_sem_whatsapp, whatsapp_desconectado, erro_rede, http_<código>). Nunca conteúdo de mensagem.';
COMMENT ON COLUMN disparos_whatsapp.qstash_message_id IS 'Identificador da mensagem no QStash, guardado no lembrete agendado para permitir cancelamento posterior.';
COMMENT ON POLICY "Permitir SELECT para membros da org autenticados" ON disparos_whatsapp IS 'Cada tenant só enxerga seus próprios disparos (auditoria no dashboard).';
COMMENT ON POLICY "Permitir INSERT para membros da org autenticados" ON disparos_whatsapp IS 'Registro de disparos restrito ao próprio tenant autenticado; escrita real de metadados feita pela aplicação.';
