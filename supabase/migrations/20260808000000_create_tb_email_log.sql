-- Phase 4: Canal de e-mail transacional - Tabela de log e idempotência de envios de e-mail
CREATE TABLE IF NOT EXISTS tb_email_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    chave_idempotencia TEXT NOT NULL,
    tipo_email TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pendente', 'enviado', 'falhou')),
    resend_id TEXT,
    erro TEXT,
    tentativas INTEGER NOT NULL DEFAULT 1,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice único parcial: impede múltiplos envios ativos/pendentes para a mesma chave de idempotência,
-- mas permite novas tentativas caso um envio anterior tenha atingido status 'falhou'.
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_log_chave_idempotencia_ativa
ON tb_email_log (chave_idempotencia)
WHERE status != 'falhou';

-- Índice por resend_id para busca rápida no processamento de webhooks
CREATE INDEX IF NOT EXISTS idx_email_log_resend_id ON tb_email_log (resend_id) WHERE resend_id IS NOT NULL;
