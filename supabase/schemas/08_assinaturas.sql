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

-- A role anônima NÃO tem — e não volta a ter — privilégio nenhum nesta tabela
-- desde a Phase 1 (migration 20260722044858_revoga_anon_assinaturas). O GRANT
-- por coluna que existia aqui (tenant_id/plano/status) protegia os campos de
-- pagamento mas deixava `GET /rest/v1/assinaturas?select=tenant_id` devolver o
-- org_id do Clerk de todo tenant pagante — enumeração em massa com a chave
-- publicável. Não há como fechar isso por coluna: o Postgres exige SELECT em
-- qualquer coluna referenciada na query, inclusive no WHERE, e a leitura do
-- plano filtra por tenant_id.
--
-- Com isso a policy "Permitir SELECT público para verificação de recursos"
-- ficou morta (sem privilégio a policy nunca chega a ser avaliada — o portão
-- fecha antes do porteiro) e foi removida pela Phase 1. A leitura pública do
-- plano vigente é servida pelo cliente privilegiado em obterPlanoVigentePublico,
-- com o tenant resolvido no servidor a partir do slug.
--
-- Os privilégios da Data API não moram no schema declarativo: `supabase db diff`
-- não emite GRANT/REVOKE. Ver docs/03-PADROES_DE_BANCO_DE_DADOS.md
-- §"Privilégios da Data API".

-- Comentários
COMMENT ON TABLE assinaturas IS 'Assinatura de plano pago (plus/pro) de cada tenant, no formato da integração Asaas. Plano Gratuito = ausência de linha vigente.';
COMMENT ON COLUMN assinaturas.ciclo IS 'Ciclo de cobrança no enum do Asaas (MONTHLY/YEARLY).';
COMMENT ON COLUMN assinaturas.status IS 'ativa = em dia; inadimplente = mantém benefícios + banner de pagamento pendente; cancelada = volta ao Gratuito.';
COMMENT ON COLUMN assinaturas.url_fatura_pendente IS 'invoiceUrl da cobrança em atraso no Asaas, usada no banner de inadimplência.';
COMMENT ON POLICY "Permitir SELECT do próprio tenant para autenticados" ON assinaturas IS 'Leitura restrita ao tenant; escrita reservada ao backend (SQL manual/webhook Asaas), sem política para roles de API. A role anônima não tem privilégio nesta tabela desde a Phase 1: o plano vigente da página pública é lido pelo cliente privilegiado.';
