-- Phase 4: canal de e-mail transacional.
-- Duas funções numa tabela só: trava de idempotência (impede que o mesmo e-mail
-- saia duas vezes) e auditoria por tenant. Segue a família de disparos_whatsapp —
-- append-only do ponto de vista da aplicação, sem PII: nunca guarda destinatário,
-- assunto nem corpo da mensagem, só metadados e códigos curtos de motivo.
CREATE TABLE tb_email_log (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id text NOT NULL,
    chave_idempotencia text NOT NULL,
    tipo_email text NOT NULL,
    -- 'descartado' é terminal e distinto de 'falhou': marca a falha PERMANENTE
    -- (chave de API ausente, domínio não verificado, endereço malformado), que
    -- retentar não conserta. Ver o índice de idempotência abaixo.
    status text NOT NULL CHECK (status IN ('pendente', 'enviado', 'falhou', 'descartado')),
    resend_id text,
    erro text,
    tentativas integer NOT NULL DEFAULT 1,
    criado_em timestamptz NOT NULL DEFAULT now(),
    atualizado_em timestamptz NOT NULL DEFAULT now()
);

-- A trava de idempotência. Parcial de propósito: só 'falhou' — falha TRANSITÓRIA,
-- que uma nova tentativa pode resolver — libera a chave. 'descartado' fica dentro
-- do predicado e mantém a chave travada, senão o gatilho de envio renasce a cada
-- renderização de servidor e vira uma linha nova (e uma chamada ao Resend) por page
-- view, repetindo rejeição contra o mesmo endereço — o oposto do EML-06.
-- Escopo (tenant_id, chave_idempotencia), nunca só a chave: a chave é construída
-- pela aplicação e não pode depender de unicidade global para não vazar entre tenants.
CREATE UNIQUE INDEX idx_email_log_chave_idempotencia_ativa
    ON tb_email_log (tenant_id, chave_idempotencia)
    WHERE status <> 'falhou';

-- Caminho do webhook do Resend: evento chega com o id do envio e precisa achar o
-- tenant para creditar a supressão a quem é de direito.
CREATE INDEX idx_email_log_resend_id ON tb_email_log (resend_id) WHERE resend_id IS NOT NULL;

-- Habilitar RLS
ALTER TABLE tb_email_log ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS (B2B — apenas o dono do tenant). Log append-only: a aplicação
-- não faz DELETE, e o UPDATE existe só para fechar o ciclo de vida do próprio
-- registro (pendente → enviado/falhou/descartado), sempre dentro do tenant.
-- Nenhuma política para anon: o cliente final não tem nada que ver aqui.
-- A escrita real do fluxo transacional passa por createAdminClient (service_role),
-- que ignora RLS por design — estas policies são a defesa da Data API.
CREATE POLICY "Permitir SELECT para membros da org autenticados"
ON tb_email_log FOR SELECT TO authenticated
USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

CREATE POLICY "Permitir INSERT para membros da org autenticados"
ON tb_email_log FOR INSERT TO authenticated
WITH CHECK (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

CREATE POLICY "Permitir UPDATE para membros da org autenticados"
ON tb_email_log FOR UPDATE TO authenticated
USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'))
WITH CHECK (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

-- Comentários
COMMENT ON TABLE tb_email_log IS
'Log de disparos de e-mail transacional por tenant. Acumula dois papéis: trava de idempotência (via idx_email_log_chave_idempotencia_ativa, que impede o mesmo e-mail sair duas vezes) e auditoria de entregabilidade. NUNCA-PII: não guarda destinatário, assunto nem corpo — só metadados, o id do Resend e um código curto de erro.';

COMMENT ON COLUMN tb_email_log.chave_idempotencia IS
'Identificador lógico do envio, construído pela aplicação (ex.: boas-vindas/<tenantId>). Único por tenant enquanto o status não for falhou.';

COMMENT ON COLUMN tb_email_log.tipo_email IS
'Natureza do disparo (ex.: boas-vindas, confirmacao-agendamento). Serve de recorte na auditoria.';

COMMENT ON COLUMN tb_email_log.status IS
'Ciclo de vida do envio. pendente: gravado antes de chamar o Resend. enviado: aceito pelo provedor. falhou: falha TRANSITÓRIA — libera a chave para nova tentativa. descartado: falha PERMANENTE (sem chave de API, domínio não verificado, endereço malformado) — mantém a chave travada, porque retentar só repete a rejeição e queima reputação de domínio.';

COMMENT ON COLUMN tb_email_log.erro IS
'Código curto do motivo da falha (ex.: desativado, rejeitado, erro_rede). Nunca a mensagem crua do provedor, nunca o endereço do destinatário.';

COMMENT ON COLUMN tb_email_log.tentativas IS
'Quantas vezes este envio foi tentado. Incrementado a cada retentativa e usado como teto para a falha transitória não virar laço infinito.';

COMMENT ON COLUMN tb_email_log.resend_id IS
'Identificador do envio no Resend. É por ele que o webhook de supressão/bounce reencontra o tenant dono da mensagem.';

COMMENT ON INDEX idx_email_log_chave_idempotencia_ativa IS
'A trava que impede envio duplicado. Parcial: apenas status falhou (transitório) libera a chave. Se descartado ficasse de fora do predicado, todo gatilho recorrente — como o do layout do dashboard, que roda a cada render de servidor — recriaria a linha e chamaria o Resend por page view enquanto a causa permanente não fosse resolvida.';

COMMENT ON POLICY "Permitir SELECT para membros da org autenticados" ON tb_email_log IS
'Cada tenant só enxerga os próprios disparos de e-mail (auditoria de entregabilidade).';

COMMENT ON POLICY "Permitir INSERT para membros da org autenticados" ON tb_email_log IS
'Registro restrito ao próprio tenant. A escrita do fluxo transacional passa por service_role; esta policy fecha a Data API para o resto.';

COMMENT ON POLICY "Permitir UPDATE para membros da org autenticados" ON tb_email_log IS
'Permite fechar o ciclo de vida do próprio registro (pendente → enviado/falhou/descartado) dentro do tenant. Não há policy de DELETE: o log é append-only.';
