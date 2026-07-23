-- Escrita à MÃO por obrigação, não por preferência: esta migration mistura
-- CREATE EXTENSION, EXCLUDE constraint, GRANT/REVOKE e uma função — nenhum deles
-- é emitido corretamente por `supabase db diff`. O diff sobe um shadow database
-- em Docker (única exceção de container do projeto, que exige aprovação prévia do
-- owner) e, forçado a diffar privilégio, gera o CONTRÁRIO do desejado
-- (revoke service_role, grant anon), porque compara o banco real com um shadow
-- construído só a partir de supabase/schemas/, que não contém GRANT nenhum.
-- Precedentes de escrita manual: 20260709193156, 20260722044858, 20260722060000,
-- 20260722145948, 20260722183153 e 20260722185755.
--
-- ⚠️ Esta migration NÃO foi aplicada no plano que a escreveu (02-02). O apply é o
-- plano 02-05 ([BLOCKING]), que roda o PRÉ-VOO abaixo, limpa os agendamentos de
-- teste do dev (D-06, preservando o tenant do owner), aplica este arquivo via
-- `execute_sql` (DDL + INSERT no ledger na MESMA transação) e realinha
-- version/name em supabase_migrations.schema_migrations (apply_migration do MCP
-- não preserva a version — Pitfall 5). Este arquivo é a FONTE que o 02-05 aplica.
--
-- ── Por que esta migration existe (Phase 2 — integridade da agenda) ───────
-- Fecha quatro buracos de integridade sobre dados que já existem:
--   AGE-01/AGE-02: a duração congela no ato da reserva (data_hora_fim), imune a
--                  edições posteriores da duração do serviço.
--   AGE-03:        double-booking atômico via exclusion constraint (fecha o TOCTOU
--                  que a validação da engine deixa aberto).
--   AGE-05:        dedupe de cliente por (tenant_id, telefone) + upsert COALESCE.
--
-- ── 🚨 PRÉ-VOO OBRIGATÓRIO — rodar e registrar ZEROS ANTES do apply (02-05) ─
-- Constraint sobre dado sujo falha no meio e deixa o arquivo no repositório sem
-- version no ledger. `NOT VALID` NÃO existe para EXCLUDE nem para UNIQUE — a
-- única saída é terreno limpo. As DUAS consultas abaixo têm de voltar VAZIAS
-- (o 02-05 registra o resultado no próprio plano, como fez a 20260722185755):
--
--   (a) Duplicatas de telefone no mesmo tenant (bloqueiam a UNIQUE de clientes):
--       SELECT tenant_id, telefone, count(*) FROM public.clientes
--       GROUP BY tenant_id, telefone HAVING count(*) > 1;
--
--   (b) Sobreposições ativas pós-backfill (bloqueiam a EXCLUDE). Rodar DEPOIS do
--       passo 2 (backfill de data_hora_fim), senão a coluna nem existe:
--       SELECT a.id, b.id FROM public.agendamentos a
--       JOIN public.agendamentos b
--         ON a.tenant_id = b.tenant_id AND a.id < b.id
--        AND a.status <> 'cancelado' AND b.status <> 'cancelado'
--        AND tstzrange(a.data_hora, a.data_hora_fim, '[)')
--            && tstzrange(b.data_hora, b.data_hora_fim, '[)');
--
--   Baseline informativo medido no dev em 2026-07-23 durante a autoria (02-02):
--   a consulta (a) voltou VAZIA (0 duplicatas). A (b) não é medível antes do
--   backfill; é o 02-05 quem a roda de forma autoritativa, após a limpeza D-06.
--
-- ── 🚨 service_role NUNCA entra em linha de REVOKE ────────────────────────
-- Todo o caminho público (perfil, plano, serviços, engine, lookup de cliente,
-- escrita do agendamento) roda com createAdminClient() (service_role) desde a
-- D-02. Revogar sem conceder a service_role quebraria a próxima chamada da RPC
-- com um `permission denied` que ninguém associa à causa. Abaixo, service_role
-- só aparece em GRANT, jamais em REVOKE.
--
-- ── Pitfall 3: btree_gist e o search_path do DDL ──────────────────────────
-- A EXCLUDE referencia a operator class de = para text (fornecida pelo
-- btree_gist). Se o schema `extensions` não estiver no search_path no momento do
-- DDL, o Postgres não acha a opclass e falha com "data type text has no default
-- operator class for access method gist". Por isso o `SET search_path` abaixo
-- inclui extensions. Tudo o mais é schema-qualificado (public.*).

set search_path = public, extensions;

-- ─────────────────────────────────────────────────────────────────────────
-- ORDEM OBRIGATÓRIA (ROADMAP): coluna nullable → backfill → NOT NULL+CHECK →
-- extension+periodo+EXCLUDE → UNIQUE+RPC+GRANT → COMMENTs. Aplicar periodo/EXCLUDE
-- antes do NOT NULL produz range de limite infinito (Pitfall 1) e recusa tudo.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Coluna nullable. A partir daqui a action grava data_hora_fim em toda reserva
--    nova; o NOT NULL só vem depois de o backfill preencher as linhas antigas.
alter table public.agendamentos
  add column data_hora_fim timestamptz;

-- 2. Backfill — RODA EM PRODUÇÃO NO GO-LIVE, por isso precisa existir e ser
--    correto. servico_id é ON DELETE RESTRICT: nunca há agendamento órfão de
--    serviço, então o join sempre acha a duração. Congela o término a partir da
--    duração vigente do serviço no momento da migração.
update public.agendamentos a
set data_hora_fim = a.data_hora + (s.duracao_minutos * interval '1 minute')
from public.servicos s
where a.servico_id = s.id and a.data_hora_fim is null;

-- 3. Aperta: término obrigatório e sempre depois do início.
alter table public.agendamentos
  alter column data_hora_fim set not null;

alter table public.agendamentos
  add constraint ck_agendamento_fim_apos_inicio check (data_hora_fim > data_hora);

-- 4. Extension + coluna periodo GENERATED + exclusion constraint.
--    A forma GENERATED (não trigger) foi decidida por sonda empírica DDL neste
--    banco (PostgreSQL 17.6) no plano 02-02: um CREATE TEMP TABLE com
--    `GENERATED ALWAYS AS (tstzrange(a, b, '[)')) STORED` foi aceito e produziu o
--    range esperado — o construtor tstzrange é imutável aqui. Fallback trigger
--    (set_periodo_agendamento BEFORE INSERT OR UPDATE) ficaria se a sonda
--    falhasse; não falhou.
create extension if not exists btree_gist with schema extensions;

alter table public.agendamentos
  add column periodo tstzrange
  generated always as (tstzrange(data_hora, data_hora_fim, '[)')) stored;

-- tenant_id WITH = é obrigatório (a checagem bypassa RLS por design; sem ele um
-- visitante mapearia a agenda de qualquer tenant). WHERE status <> 'cancelado' é
-- obrigatório (senão horário cancelado bloqueia o slot para sempre).
alter table public.agendamentos
  add constraint ag_sem_sobreposicao
  exclude using gist (tenant_id with =, periodo with &&) where (status <> 'cancelado');

-- 5. UNIQUE de cliente + função de upsert atômico + privilégio explícito.
--    Nome da constraint idêntico ao declarado em supabase/schemas/06_clientes.sql
--    (clientes_tenant_telefone_key) para o db diff futuro não propor recriá-la.
alter table public.clientes
  add constraint clientes_tenant_telefone_key unique (tenant_id, telefone);

-- Upsert atômico: cria o cliente ou preenche só o que falta (COALESCE). Substitui
-- o select-then-insert não-atômico do booking público. SECURITY INVOKER preserva
-- o RLS de clientes no walk-in authenticated; o público chama via service_role
-- (RLS bypassado). NUNCA definida como DEFINER (escalaria privilégio de tenant).
create or replace function public.reaproveitar_ou_criar_cliente(
    p_tenant_id text, p_telefone text, p_nome text, p_email text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $function$
    insert into public.clientes (tenant_id, telefone, nome, email)
    values (p_tenant_id, p_telefone, p_nome, p_email)
    on conflict (tenant_id, telefone) do update
        set nome  = coalesce(public.clientes.nome,  excluded.nome),
            email = coalesce(public.clientes.email, excluded.email)
    returning id;
$function$;

-- Privilégio explícito: a default privilege global de EXECUTE para PUBLIC foi
-- revogada em 20260722183153 — função nova nasce sem EXECUTE. Sem o GRANT, falha
-- com "permission denied for function" (alta e clara). NADA para anon (sem Data
-- API). service_role no GRANT, NUNCA no REVOKE.
revoke all on function public.reaproveitar_ou_criar_cliente(text, text, text, text) from public, anon;
grant execute on function public.reaproveitar_ou_criar_cliente(text, text, text, text) to authenticated, service_role;

-- 6. COMMENT ON de negócio em tudo que é novo (Definition of Done do projeto).
comment on column public.agendamentos.data_hora_fim is
'Término congelado no ato da reserva (data_hora + duração do serviço no momento). Imune a edições posteriores da duração do serviço — a engine de disponibilidade lê a ocupação daqui, não do join com servicos (AGE-01/AGE-02, D-02).';

comment on column public.agendamentos.periodo is
'Intervalo [data_hora, data_hora_fim) derivado por coluna GENERATED — integridade por construção, nunca escrito pela aplicação. É o que a exclusion constraint ag_sem_sobreposicao compara.';

comment on constraint ck_agendamento_fim_apos_inicio on public.agendamentos is
'Garante data_hora_fim > data_hora, impedindo que o construtor tstzrange da coluna periodo receba limites invertidos. Análogo ao ck_hora_fim_apos_inicio de horarios_funcionamento.';

comment on constraint ag_sem_sobreposicao on public.agendamentos is
'Impede que duas requisições simultâneas resultem em dois agendamentos ativos sobrepostos no mesmo tenant (AGE-03). Fecha a janela TOCTOU que a validação da engine deixa aberta. tenant_id WITH = isola por tenant (a checagem bypassa RLS por design); WHERE status <> cancelado libera o slot de um horário cancelado. A perda de corrida devolve o SQLSTATE 23P01, discriminado nas actions.';

comment on constraint clientes_tenant_telefone_key on public.clientes is
'Garante que dois clientes com o mesmo telefone no mesmo tenant nunca virem registros duplicados (AGE-05). Pré-requisito do upsert atômico reaproveitar_ou_criar_cliente. Escopo (tenant_id, telefone) — o mesmo cliente pode existir em tenants diferentes.';

comment on function public.reaproveitar_ou_criar_cliente(text, text, text, text) is
'Upsert atômico de cliente por (tenant_id, telefone): cria se não existe, senão preenche só o que falta com COALESCE (nome curado nunca é sobrescrito; email vazio é completado). Substitui o select-then-insert não-atômico do booking público, fechando a corrida que duplicava clientes (AGE-05, D-01). SECURITY INVOKER; GRANT só a authenticated/service_role, nunca anon.';
