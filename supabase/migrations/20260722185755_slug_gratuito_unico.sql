-- Escrita à MÃO por preferência de projeto, não por limitação da ferramenta: o
-- delta é UMA constraint. Forçar `supabase db diff` aqui sobe um shadow database
-- em Docker — única exceção de container do projeto, que exige aprovação prévia
-- do owner, ausente nesta sessão — e, pior, tende a emitir privilégio invertido
-- (`revoke ... from service_role`, `grant ... to anon`), porque compara o banco
-- real com um shadow construído só a partir de supabase/schemas/, que não contém
-- GRANT nenhum. Foi o que aconteceu no plano 01-04 e o bloco teve de ser podado
-- à mão. Precedentes de escrita manual: 20260709193156, 20260722044858,
-- 20260722060000, 20260722145948 e 20260722183153.
--
-- ── Por que esta migration existe (CR-03 do 01-REVIEW) ────────────────────
-- `slug` sempre foi NOT NULL UNIQUE; `slug_gratuito` era apenas NOT NULL. As
-- duas colunas, porém, são lidas pela MESMA URL pública (/book/<slug>), o que
-- faz delas dois membros de um só namespace — e o namespace não tinha dono.
--
-- O cenário concreto, passo a passo:
--   1. Tenant B (pago) escolhe `slug = 'bela-unhas'`; o `slug_gratuito` dele
--      continua sendo o aleatório do provisionamento, digamos 'k3f9x2ab'.
--   2. B cancela a assinatura. Pelo `obterSlugEfetivo`, o link que passa a valer
--      — e que B divulga — é 'k3f9x2ab'. A coluna `slug` de B segue 'bela-unhas'.
--   3. Tenant A, concorrente, grava `slug = 'k3f9x2ab'`. O UNIQUE de `slug` não
--      reclama: ninguém tem esse valor EM `slug`.
--   4. Uma visita a /book/k3f9x2ab casa na PRIMEIRA query do resolver, encontra
--      A, e a página de A é servida. Os agendamentos de B — com nome e telefone
--      dos clientes finais de B — passam a cair na base de A. Nada na UI de B
--      dá sinal.
--
-- E o caso degenerado, que não precisa de má-fé nenhuma: sem UNIQUE, dois
-- tenants com o mesmo `slug_gratuito` fazem o `.maybeSingle()` do fallback errar
-- por múltiplas linhas, e os DOIS links viram 404.
--
-- ── Por que o nome da constraint não é livre ──────────────────────────────
-- `perfis_empresas_slug_gratuito_key` é EXATAMENTE o nome que o Postgres geraria
-- para o `UNIQUE` inline agora declarado em supabase/schemas/01_perfis_empresas.sql.
-- Com qualquer outro nome (o review sugeria `uq_perfis_empresas_slug_gratuito`),
-- todo `db diff` futuro veria drift e proporia dropar e recriar a constraint.
--
-- ── Pré-voo, antes de aplicar ─────────────────────────────────────────────
-- Constraint sobre dado sujo falha no meio e deixa o arquivo no repositório sem
-- version no ledger. As duas consultas obrigatórias foram rodadas e voltaram
-- VAZIAS: (a) grupos de `slug_gratuito` com count > 1; (b) self-join de
-- `a.slug = b.slug_gratuito` com `tenant_id` diferente. Nenhuma linha existente
-- precisou ser alterada.
--
-- ── O que esta migration explicitamente NÃO faz ───────────────────────────
-- NENHUM privilégio: não há `grant` nem `revoke` neste arquivo, e `service_role`
-- não aparece em lugar nenhum. Os `ALTER DEFAULT PRIVILEGES for role postgres`
-- das 20260722060000 (tabelas) e 20260722183153 (funções) continuam intactos —
-- uma linha de privilégio aqui poderia revertê-los sem que ninguém notasse.
-- Também não fecha sozinha o CR-03: a colisão `slug` × `slug_gratuito` é ENTRE
-- LINHAS e nenhuma constraint a expressa. As outras duas camadas estão em
-- src/app/actions/perfis-empresas.ts (recusa na escrita) e em
-- src/app/actions/public-booking.ts (recusa de ambiguidade na leitura).

alter table public.perfis_empresas
  add constraint perfis_empresas_slug_gratuito_key unique (slug_gratuito);

comment on constraint perfis_empresas_slug_gratuito_key on public.perfis_empresas is
'`slug` e `slug_gratuito` não são duas colunas independentes: são dois membros de UM namespace público — o identificador do tenant na URL /book/<slug>. Sem esta constraint, dois tenants podiam carregar o mesmo `slug_gratuito` e os DOIS links viravam 404 (o maybeSingle do fallback erra com múltiplas linhas). Ela é a camada de baixo de três: a colisão `slug` de um tenant contra `slug_gratuito` de OUTRO é entre linhas e não cabe em constraint — fica em salvarPerfilEmpresa (recusa na escrita) e em resolverPerfilPublicoPorSlug (recusa de ambiguidade na leitura). O furo que as três fecham: o tenant A reivindicava o link de provisionamento do tenant B e passava a receber os agendamentos de B, com nome e telefone dos clientes finais dele.';
