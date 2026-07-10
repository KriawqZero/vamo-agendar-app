CREATE TABLE assinaturas (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id text NOT NULL,
    plano text NOT NULL CHECK (plano IN ('plus', 'pro')),
    ciclo text NOT NULL CHECK (ciclo IN ('MONTHLY', 'YEARLY')), -- enum idêntico ao cycle do Asaas
    valor numeric(10,2) NOT NULL,
    status text NOT NULL CHECK (status IN ('ativa', 'inadimplente', 'cancelada')),
    asaas_customer_id text,      -- cus_..., preenchido quando o checkout Asaas existir
    asaas_subscription_id text,  -- sub_..., idem
    proximo_vencimento date,     -- espelho do nextDueDate do Asaas
    url_fatura_pendente text,    -- invoiceUrl do pagamento em atraso (banner de inadimplência)
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES perfis_empresas(tenant_id) ON DELETE CASCADE
);

-- Uma única assinatura vigente (ativa ou inadimplente) por tenant
CREATE UNIQUE INDEX uq_assinatura_vigente_por_tenant
ON assinaturas (tenant_id)
WHERE status IN ('ativa', 'inadimplente');

-- Habilitar RLS
ALTER TABLE assinaturas ENABLE ROW LEVEL SECURITY;

-- Política: o tenant autenticado só LÊ a própria assinatura.
-- Não há políticas de INSERT/UPDATE/DELETE para authenticated/anon de propósito:
-- quem escreve é o dono do banco (SQL manual na fase de testes; webhook Asaas com
-- service_role no futuro). Isso torna o plano infraudável pelo cliente.
CREATE POLICY "Permitir SELECT do próprio tenant para autenticados"
ON assinaturas FOR SELECT TO authenticated
USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

-- Política: o fluxo público de booking (role anon) precisa saber se o tenant
-- tem WhatsApp habilitado no plano vigente para decidir se dispara mensagens.
CREATE POLICY "Permitir SELECT público para verificação de recursos"
ON assinaturas FOR SELECT TO anon
USING (true);

-- O GRANT por coluna restringe anon a tenant_id/plano/status: campos de
-- pagamento (valor, ids Asaas, url de fatura) nunca ficam legíveis sem login.
REVOKE SELECT ON assinaturas FROM anon;
GRANT SELECT (tenant_id, plano, status) ON assinaturas TO anon;

-- Comentários
COMMENT ON TABLE assinaturas IS 'Assinatura de plano pago (plus/pro) de cada tenant, no formato da integração Asaas. Plano Gratuito = ausência de linha vigente.';
COMMENT ON COLUMN assinaturas.ciclo IS 'Ciclo de cobrança no enum do Asaas (MONTHLY/YEARLY).';
COMMENT ON COLUMN assinaturas.status IS 'ativa = em dia; inadimplente = mantém benefícios + banner de pagamento pendente; cancelada = volta ao Gratuito.';
COMMENT ON COLUMN assinaturas.url_fatura_pendente IS 'invoiceUrl da cobrança em atraso no Asaas, usada no banner de inadimplência.';
COMMENT ON POLICY "Permitir SELECT do próprio tenant para autenticados" ON assinaturas IS 'Leitura restrita ao tenant; escrita reservada ao backend (SQL manual/webhook Asaas), sem política para roles de API.';
COMMENT ON POLICY "Permitir SELECT público para verificação de recursos" ON assinaturas IS 'O fluxo público de booking precisa saber se o tenant tem WhatsApp habilitado no plano. O GRANT por coluna limita anon a tenant_id/plano/status — campos de pagamento ficam invisíveis sem login.';
