-- Escrita à MÃO por necessidade: `supabase db diff` NÃO emite GRANT/REVOKE nem
-- ALTER DEFAULT PRIVILEGES (exceção documentada em
-- docs/SUPABASE_DECLARATIVE-DATABASE-SCHEMA.md; mesmo precedente de
-- 20260709193156_restringe_colunas_assinaturas_anon.sql e de
-- 20260722044858_revoga_anon_assinaturas.sql).
--
-- Não é só "o diff não gera": quando forçado a diffar privilégio, o migra gera
-- o CONTRÁRIO do desejado — ao gerar a migration de policies deste mesmo plano
-- (20260722055941) ele emitiu `revoke ... from service_role` em todas as
-- tabelas e `grant truncate to anon`, porque compara o banco real com um shadow
-- construído só a partir dos schemas declarativos, que não contêm GRANT nenhum.
-- Aquele bloco foi podado à mão. Privilégio mora AQUI, nunca no diff.
--
-- ── Por que de negócio ────────────────────────────────────────────────────
-- GRANT é o portão; RLS é o porteiro. Sem privilégio, a policy nunca chega a
-- ser avaliada. Hoje a única coisa entre a chave publicável e escrever em sete
-- tabelas é a ausência de policy permissiva — uma policy criada por engano em
-- qualquer fase futura reabre tudo. Fechar no portão torna o estado seguro por
-- construção, e a default privilege torna o futuro seguro por padrão.
--
-- Esta migration INVERTE a 20260709161817_restaura_privilegios_dml_roles_api,
-- que concedia SELECT/INSERT/UPDATE/DELETE a anon e authenticated em tudo. A
-- role anônima não tem mais consumidor legítimo: todo o caminho público (perfil,
-- plano, serviços, engine de disponibilidade, lookup de cliente, escrita do
-- agendamento) roda com createAdminClient() desde o plano 01-02, com o tenant
-- resolvido no servidor a partir do slug e projeção explícita de colunas.
--
-- ── 🚨 service_role NUNCA entra em linha de revoke ────────────────────────
-- O snippet que a documentação da Supabase publica inclui service_role no
-- ALTER DEFAULT PRIVILEGES ... REVOKE, porque assume o modelo "zero client DB
-- access", em que o backend usa conexão direta. Aqui o backend usa a Data API
-- com a secret key. Copiar o snippet cru não quebra nada HOJE: quebra a PRÓXIMA
-- tabela criada (Phase 7: perfis_cobranca; Phase 9: eventos_asaas), que nasceria
-- inacessível ao createAdminClient() e derrubaria o booking público inteiro com
-- um `permission denied` que ninguém associa à causa. A migration 20260709161817
-- existe justamente porque um ALTER DEFAULT PRIVILEGES amplo demais já derrubou
-- todo o acesso via PostgREST neste repositório uma vez.
--
-- ── Custo aceito (D-03) ───────────────────────────────────────────────────
-- Toda tabela nova passa a exigir uma migration manual de GRANT para que o
-- dashboard a enxergue pela Data API. A primeira conta chega na Phase 7. A
-- regra está escrita em docs/03-PADROES_DE_BANCO_DE_DADOS.md
-- §"Privilégios da Data API (portão antes do porteiro)".
--
-- ── Escopo do que NÃO é tocado ────────────────────────────────────────────
-- `authenticated` mantém os privilégios nas tabelas EXISTENTES: o dashboard B2B
-- opera via Data API com o JWT do Clerk e o RLS tenant-scoped é a defesa ali,
-- por desenho. A restrição de authenticated vale só para objetos FUTUROS.

-- 1. Tabelas e sequences existentes: a role anônima perde tudo.
--    Idempotente sobre assinaturas, já fechada por 20260722044858.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- 2. Tabelas futuras criadas pelo role postgres (é o role que aplica migrations).
--    Default privileges valem SÓ para objetos criados pelo role indicado e NÃO
--    são herdadas por membership — por isso o `for role postgres` é obrigatório.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;

-- 3. service_role continua com tudo nos objetos futuros — o createAdminClient()
--    depende disso, e é o item que o snippet oficial da Supabase erra.
alter default privileges for role postgres in schema public
  grant all on tables to service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to service_role;
