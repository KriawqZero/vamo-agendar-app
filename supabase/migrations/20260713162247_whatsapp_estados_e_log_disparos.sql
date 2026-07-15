-- Gerada via `supabase db diff -f whatsapp_estados_e_log_disparos` e editada
-- manualmente para remover GRANT/REVOKE espúrios emitidos pelo migra (caveat
-- documentado em docs/SUPABASE_DECLARATIVE-DATABASE-SCHEMA.md — os privilégios
-- default do Supabase não devem ser tocados) e para acrescentar os COMMENTs,
-- que o diff não rastreia.

-- 1. Novos estados de conexão do WhatsApp
alter table "public"."whatsapp_configs" drop constraint "whatsapp_configs_status_check";

alter table "public"."whatsapp_configs" add constraint "whatsapp_configs_status_check" CHECK ((status = ANY (ARRAY['desconectado'::text, 'conectando'::text, 'aguardando_qrcode'::text, 'conectado'::text, 'instavel'::text, 'falha'::text]))) not valid;

alter table "public"."whatsapp_configs" validate constraint "whatsapp_configs_status_check";

alter table "public"."whatsapp_configs" add column "ultima_verificacao_em" timestamp with time zone;

-- 2. Log append-only de disparos de mensageria
create table "public"."disparos_whatsapp" (
    "id" uuid not null default gen_random_uuid(),
    "tenant_id" text not null,
    "agendamento_id" uuid,
    "tipo" text not null,
    "status" text not null,
    "motivo" text,
    "qstash_message_id" text,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now())
);

alter table "public"."disparos_whatsapp" enable row level security;

CREATE UNIQUE INDEX disparos_whatsapp_pkey ON public.disparos_whatsapp USING btree (id);

CREATE INDEX idx_disparos_whatsapp_agendamento ON public.disparos_whatsapp USING btree (agendamento_id);

CREATE INDEX idx_disparos_whatsapp_tenant_created ON public.disparos_whatsapp USING btree (tenant_id, created_at DESC);

alter table "public"."disparos_whatsapp" add constraint "disparos_whatsapp_pkey" PRIMARY KEY using index "disparos_whatsapp_pkey";

alter table "public"."disparos_whatsapp" add constraint "disparos_whatsapp_status_check" CHECK ((status = ANY (ARRAY['enviado'::text, 'agendado'::text, 'executado'::text, 'falha'::text, 'ignorado'::text, 'cancelado'::text]))) not valid;

alter table "public"."disparos_whatsapp" validate constraint "disparos_whatsapp_status_check";

alter table "public"."disparos_whatsapp" add constraint "disparos_whatsapp_tipo_check" CHECK ((tipo = ANY (ARRAY['confirmacao'::text, 'lembrete'::text, 'teste'::text]))) not valid;

alter table "public"."disparos_whatsapp" validate constraint "disparos_whatsapp_tipo_check";

alter table "public"."disparos_whatsapp" add constraint "fk_agendamento" FOREIGN KEY (agendamento_id) REFERENCES public.agendamentos(id) ON DELETE CASCADE not valid;

alter table "public"."disparos_whatsapp" validate constraint "fk_agendamento";

alter table "public"."disparos_whatsapp" add constraint "fk_tenant" FOREIGN KEY (tenant_id) REFERENCES public.perfis_empresas(tenant_id) ON DELETE CASCADE not valid;

alter table "public"."disparos_whatsapp" validate constraint "fk_tenant";

create policy "Permitir INSERT para membros da org autenticados"
on "public"."disparos_whatsapp"
as permissive
for insert
to authenticated
with check ((tenant_id = ( SELECT (auth.jwt() ->> 'org_id'::text))));

create policy "Permitir SELECT para membros da org autenticados"
on "public"."disparos_whatsapp"
as permissive
for select
to authenticated
using ((tenant_id = ( SELECT (auth.jwt() ->> 'org_id'::text))));

-- 3. Comentários (não rastreados pelo diff — mantidos em sincronia com
-- supabase/schemas/05_whatsapp_configs.sql e 09_disparos_whatsapp.sql)
COMMENT ON COLUMN whatsapp_configs.status IS 'Estado da conexão sincronizado com o gateway: desconectado (sem instância ativa); conectando (instância criada, gateway ainda estabelecendo sessão); aguardando_qrcode (QR Code gerado, aguardando pareamento pelo profissional); conectado (sessão WhatsApp ativa e confirmada pelo gateway); instavel (não foi possível confirmar o estado com o gateway agora — indisponibilidade temporária); falha (instância inexistente no gateway ou erro definitivo que exige reconexão).';
COMMENT ON COLUMN whatsapp_configs.ultima_verificacao_em IS 'Timestamp da última sincronização de status bem-sucedida com o gateway (Evolution API).';

COMMENT ON TABLE disparos_whatsapp IS 'Log append-only de disparos de mensageria WhatsApp (confirmação, lembrete e teste) por tenant. Registra apenas metadados de auditoria — nunca o conteúdo da mensagem nem o telefone do destinatário.';
COMMENT ON COLUMN disparos_whatsapp.agendamento_id IS 'Agendamento relacionado ao disparo; NULL para disparos do tipo teste.';
COMMENT ON COLUMN disparos_whatsapp.tipo IS 'Natureza do disparo: confirmacao (síncrono ao criar agendamento), lembrete (assíncrono via QStash) ou teste (envio manual pelo profissional).';
COMMENT ON COLUMN disparos_whatsapp.status IS 'Resultado do disparo. confirmacao: enviado|falha. lembrete: agendado|executado|falha|ignorado|cancelado. teste: enviado|falha.';
COMMENT ON COLUMN disparos_whatsapp.motivo IS 'Código curto explicando falha/ignorado (ex.: agendamento_cancelado, plano_sem_whatsapp, whatsapp_desconectado, erro_rede, http_<código>). Nunca conteúdo de mensagem.';
COMMENT ON COLUMN disparos_whatsapp.qstash_message_id IS 'Identificador da mensagem no QStash, guardado no lembrete agendado para permitir cancelamento posterior.';
COMMENT ON POLICY "Permitir SELECT para membros da org autenticados" ON disparos_whatsapp IS 'Cada tenant só enxerga seus próprios disparos (auditoria no dashboard).';
COMMENT ON POLICY "Permitir INSERT para membros da org autenticados" ON disparos_whatsapp IS 'Registro de disparos restrito ao próprio tenant autenticado; escrita real de metadados feita pela aplicação.';
