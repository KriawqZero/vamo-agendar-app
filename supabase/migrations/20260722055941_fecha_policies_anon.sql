-- Gerada por `npx supabase db diff -f fecha_policies_anon` a partir dos schemas
-- declarativos (supabase/schemas/01, 04, 06, 07, 08) e depois PODADA À MÃO.
-- Ver "O QUE FOI REMOVIDO DO DIFF" no fim deste cabeçalho.
--
-- Por que de negócio: cinco policies compartilhavam a role anônima SEM par
-- autenticado — a única coisa entre a chave publicável e ler/escrever nessas
-- tabelas era a boa vontade da policy. Cada DROP abaixo vem com o CREATE
-- substituto TO authenticated no mesmo arquivo: dropar sem recriar quebraria o
-- dashboard EM SILÊNCIO (agenda vazia, nenhum erro), e o `.select()` do
-- supabase-js depende de INSERT/UPDATE ... RETURNING, que exige que a linha
-- passe também na policy de SELECT.
--
-- Os cinco pontos de escrita autenticada com RETURNING conferidos antes desta
-- migration (todos gravam tenant_id = orgId vindo de auth(), portanto passam
-- nas policies novas):
--   agendamentos.ts:302 (clientes), agendamentos.ts:334 (agendamentos),
--   perfis-empresas.ts:66 (upsert de provisionamento), perfis-empresas.ts:235
--   (upsert do formulário de perfil), agenda.ts:205 (excecoes_agenda).
--
-- A leitura pública dessas tabelas já roda com cliente privilegiado desde o
-- plano 01-02 — por isso nenhum caminho do booking depende da role anônima
-- quando este DDL chega ao banco.
--
-- ⚠️ O QUE FOI REMOVIDO DO DIFF (não reintroduzir):
-- O migra emitiu, além das policies, ~250 linhas de privilégio comparando o
-- banco real com o shadow criado só a partir dos schemas declarativos — que
-- não contêm GRANT nenhum. O efeito seria desfazer a migration 20260709161817:
-- `revoke ... from service_role` em TODAS as tabelas (quebra createAdminClient()
-- e o booking público inteiro), `revoke ... from authenticated` (quebra o
-- dashboard inteiro) e `grant truncate/references/trigger to anon, authenticated`
-- (TRUNCATE ignora RLS). Privilégio NÃO é gerenciado por diff neste projeto: é
-- migration escrita à mão (docs/SUPABASE_DECLARATIVE-DATABASE-SCHEMA.md e
-- docs/03-PADROES_DE_BANCO_DE_DADOS.md §"Privilégios da Data API"). A parte de
-- privilégio deste plano está em 20260722060000_fecha_data_api_para_anon.sql.
--
-- Os COMMENT ON POLICY também foram acrescentados à mão: o migra não os emite
-- (caveat conhecido), mas os schemas declarativos os têm.

drop policy "Permitir SELECT público para todos" on "public"."perfis_empresas";

create policy "Permitir SELECT do próprio tenant para autenticados"
on "public"."perfis_empresas"
as permissive
for select
to authenticated
using ((tenant_id = ( SELECT (auth.jwt() ->> 'org_id'::text))));

comment on policy "Permitir SELECT do próprio tenant para autenticados" on "public"."perfis_empresas" is
'O perfil é a identidade pública do estabelecimento, mas a LISTA de estabelecimentos não é pública: com SELECT liberado para a role anônima, qualquer um com a chave publicável raspava nome, telefone_contato e o org_id do Clerk de todos os profissionais da plataforma. A página pública lê o perfil pelo servidor com cliente privilegiado, resolvendo o tenant a partir do slug.';

drop policy "Permitir SELECT público para todos" on "public"."excecoes_agenda";

create policy "Permitir SELECT do próprio tenant para autenticados"
on "public"."excecoes_agenda"
as permissive
for select
to authenticated
using ((tenant_id = ( SELECT (auth.jwt() ->> 'org_id'::text))));

comment on policy "Permitir SELECT do próprio tenant para autenticados" on "public"."excecoes_agenda" is
'Bloqueios da agenda são dado do profissional (o campo motivo é texto livre e pode ser sensível). A página pública lê exceções pelo servidor com cliente privilegiado, nunca pela role anônima.';

drop policy "Permitir INSERT público para visitantes" on "public"."clientes";

create policy "Permitir INSERT para membros da org autenticados"
on "public"."clientes"
as permissive
for insert
to authenticated
with check ((tenant_id = ( SELECT (auth.jwt() ->> 'org_id'::text))));

comment on policy "Permitir INSERT para membros da org autenticados" on "public"."clientes" is
'Cadastro de cliente pelo agendamento manual do dashboard. A criação pelo cliente final passa pela Server Action pública, que resolve o tenant a partir do slug, sanitiza o telefone e escreve com privilégio de serviço — a policy anterior aceitava qualquer tenant_id não nulo vindo da role anônima, o que permitia injetar cliente na base de qualquer profissional.';

drop policy "Permitir SELECT público para todos" on "public"."agendamentos";

create policy "Permitir SELECT do próprio tenant para autenticados"
on "public"."agendamentos"
as permissive
for select
to authenticated
using ((tenant_id = ( SELECT (auth.jwt() ->> 'org_id'::text))));

comment on policy "Permitir SELECT do próprio tenant para autenticados" on "public"."agendamentos" is
'A agenda é dado operacional do tenant. O fluxo público de booking obtém ocupação pelo servidor, não pela role anônima.';

drop policy "Permitir INSERT público para visitantes" on "public"."agendamentos";

create policy "Permitir INSERT para membros da org autenticados"
on "public"."agendamentos"
as permissive
for insert
to authenticated
with check ((tenant_id = ( SELECT (auth.jwt() ->> 'org_id'::text))));

comment on policy "Permitir INSERT para membros da org autenticados" on "public"."agendamentos" is
'Agendamento manual do dashboard. A criação pelo cliente final passa pela Server Action pública, que valida slot contra double-booking e escreve com privilégio de serviço.';

-- Sem substituta: a role anônima não tem privilégio nenhum em assinaturas desde
-- 20260722044858_revoga_anon_assinaturas, então esta policy já era código morto
-- (sem privilégio a policy nunca chega a ser avaliada). A leitura do próprio
-- tenant continua coberta por "Permitir SELECT do próprio tenant para
-- autenticados", que permanece intacta na tabela.
drop policy "Permitir SELECT público para verificação de recursos" on "public"."assinaturas";

comment on policy "Permitir SELECT do próprio tenant para autenticados" on "public"."assinaturas" is
'Leitura restrita ao tenant; escrita reservada ao backend (SQL manual/webhook Asaas), sem política para roles de API. A role anônima não tem privilégio nesta tabela desde a Phase 1: o plano vigente da página pública é lido pelo cliente privilegiado.';
