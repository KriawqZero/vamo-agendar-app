# Phase 1: Hardening da superfície pública - Pattern Map

**Mapped:** 2026-07-21
**Files analyzed:** 12 novos/modificados
**Analogs found:** 11 / 12 (único sem analog direto: migration manual de REVOKE total — mas há precedente parcial)

> ⚠️ **Correção ao RESEARCH (achado desta sessão):** `src/instrumentation.ts` **já existe** (Sentry + fail-fast) e `src/lib/env.ts` **já existe** com a lista `OBRIGATORIAS_EM_PRODUCAO` — que **já contém `QSTASH_CURRENT_SIGNING_KEY`** e cujo comentário (item b) diz literalmente: *"A Phase 1 (SEG-05) acrescenta `QSTASH_NEXT_SIGNING_KEY` a esta mesma lista. Não inventar um segundo caminho."* A questão em aberto do CONTEXT ("throw em instrumentation.ts ou no módulo") está resolvida pelo próprio código: **acrescentar uma linha em `OBRIGATORIAS_EM_PRODUCAO`**, nada mais. O Padrão 4 do RESEARCH (criar `instrumentation.ts` do zero) NÃO deve ser seguido. Nota do arquivo existente: o hook **não roda no `next build`** (verificado no Next 16.2.10) e só age com `NODE_ENV === 'production'` — `pnpm build` e dev continuam passando sem as chaves.

## File Classification

| Arquivo novo/modificado | Role | Data Flow | Analog mais próximo | Qualidade |
|---|---|---|---|---|
| `supabase/schemas/01_perfis_empresas.sql` (policies substitutas) | schema/RLS | — | `supabase/schemas/03_horarios_funcionamento.sql` policy 1b | exact |
| `supabase/schemas/05_excecoes_agenda.sql` (idem) | schema/RLS | — | idem | exact |
| `supabase/schemas/07_agendamentos.sql` (idem, SELECT+INSERT) | schema/RLS | — | idem + código pronto no RESEARCH §Code Examples | exact |
| `supabase/schemas/06_clientes.sql` (INSERT substituto) | schema/RLS | — | `03_horarios_funcionamento.sql` policy "Permitir INSERT" | exact |
| `supabase/migrations/<ts>_fecha_data_api_para_anon.sql` (manual, novo) | migration (privilégios) | — | `20260709193156_restringe_colunas_assinaturas_anon.sql` (precedente manual) + `20260709161817` (o que inverte) | role-match |
| `src/app/actions/public-booking.ts` | server action | request-response | ele mesmo (trechos que já usam `createAdminClient()` + projeção explícita, linhas 117-179) | exact |
| `src/app/book/[slug]/page.tsx` | server component | request-response | ele mesmo (projeção de `perfil` nas linhas 63-72 é o padrão a estender) | exact |
| `src/app/book/[slug]/BookingApp.tsx` | client component | request-response | ele mesmo (troca `perfil.tenant_id` → `slug` nas linhas 20, 148, 173, 261) | exact |
| `src/app/api/webhooks/lembrete/route.ts` | route handler (webhook) | request-response | ele mesmo + Padrão 3 do RESEARCH (`Receiver`) | exact |
| `src/lib/whatsapp-helper.ts` (linha 131, fallback) | utility | request-response | ele mesmo | exact |
| `src/lib/env.ts` (uma linha) | config | boot | ele mesmo — mecanismo pronto | exact |
| `src/lib/supabase/admin.ts` (só JSDoc) | utility | — | ele mesmo | exact |

## Pattern Assignments

### Policies substitutas (`01_perfis_empresas.sql`, `05_excecoes_agenda.sql`, `07_agendamentos.sql`, `06_clientes.sql`)

**Analog:** `supabase/schemas/03_horarios_funcionamento.sql`, linhas 28-44 — a policy 1b é o modelo exato apontado no CONTEXT (D-07 e Claude's Discretion).

```sql
-- SELECT do próprio tenant (linhas 28-30)
CREATE POLICY "Permitir SELECT do próprio tenant para autenticados"
ON horarios_funcionamento FOR SELECT TO authenticated
USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

-- INSERT (linhas 33-35)
CREATE POLICY "Permitir INSERT para donos da org autenticados"
ON horarios_funcionamento FOR INSERT TO authenticated
WITH CHECK (tenant_id = (SELECT auth.jwt() ->> 'org_id'));
```

**Padrão de COMMENT ON POLICY** (obrigatório — analog em `08_assinaturas.sql:49-50`):

```sql
COMMENT ON POLICY "Permitir SELECT do próprio tenant para autenticados" ON assinaturas IS
'Leitura restrita ao tenant; escrita reservada ao backend (SQL manual/webhook Asaas), sem política para roles de API.';
```

Para `07_agendamentos.sql`, o RESEARCH §Code Examples ("Fechar `agendamentos`") já traz o SQL completo com os dois COMMENTs — copiar de lá.

**Regras não negociáveis:** `auth.jwt()` sempre em subquery; granular por ação (nunca `FOR ALL`); role explícita; nomes de policy em pt-BR seguindo o padrão "Permitir <AÇÃO> ..." dos schemas existentes. Cada `DROP POLICY` de policy compartilhada vem com o `CREATE POLICY ... TO authenticated` **na mesma mudança** (D-07). Nota do próprio analog (comentário 1b, linhas 25-27): `INSERT/UPDATE ... RETURNING` exige que a linha passe no SELECT — conferir `agendamentos.ts:318-320`, `agendamentos.ts:285-286`, `perfis-empresas.ts:234-238`.

### Migration manual de privilégios (`<ts>_fecha_data_api_para_anon.sql`)

**Analog 1 (precedente de migration manual):** `supabase/migrations/20260709193156_restringe_colunas_assinaturas_anon.sql` — todo o arquivo (10 linhas): comentário-cabeçalho em pt-BR explicando o porquê + `revoke`/`grant` em minúsculas + `comment on policy` junto.

**Analog 2 (o que inverter, e o anti-exemplo do service_role):** `supabase/migrations/20260709161817_restaura_privilegios_dml_roles_api.sql`:

```sql
-- Tabelas existentes
revoke all on all tables in schema public from anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant all on all tables in schema public to service_role;

-- Tabelas futuras criadas pelo role postgres (via migrations)
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges for role postgres in schema public grant all on tables to service_role;
```

A nova migration usa exatamente esta sintaxe (`for role postgres` incluso), invertendo os GRANTs de `anon`/`authenticated` conforme D-01/D-03 e **reafirmando** os dois `grant all ... to service_role` (D-03 🚨). O SQL alvo completo está no RESEARCH §Padrão 2. O cabeçalho deve citar `20260709161817` como precedente do que acontece quando `service_role` entra no REVOKE. Exceção documental: `08_assinaturas.sql:41-42` mostra o padrão de manter o bloco de privilégio também no schema declarativo (decorativo para o diff).

**Aplicação:** `psql` via pooler `aws-1-sa-east-1.pooler.supabase.com:5432` + INSERT da `version` em `supabase_migrations.schema_migrations` (D-06) — permissão do owner é pré-requisito.

### `src/app/actions/public-booking.ts` (server action, request-response)

**Analog:** o próprio arquivo — a metade de escrita já pratica o padrão-alvo; a fase o estende às leituras.

**Padrão a replicar — comentário + admin client** (linhas 112-117):

```typescript
// A partir daqui as ESCRITAS usam o cliente PRIVILEGIADO (somente servidor): ...
const admin = createAdminClient()
```

**Padrão de projeção explícita já existente** (linha 55): `select('tenant_id, timezone, antecedencia_minima_minutos, horizonte_maximo_dias')` — os dois `select('*')` de `perfis_empresas` (linhas 234-248) e o de `servicos` (linha 263) trocam para listas de colunas; as constantes `COLUNAS_PERFIL_PUBLICO`/`COLUNAS_SERVICO_PUBLICO` estão prontas no RESEARCH §Code Examples. Verificação: `grep -rn "select('\*')" src/app/actions/public-booking.ts` vazio.

**Padrão de erro** (linhas 129-140): `console.error('Erro ao X:', error.message)` + `reportarExcecao(erroSinteticoSupabase(...), { fluxo, etapa })` **antes** do `throw new Error('<pt-BR amigável>')`. Manter em toda função tocada.

**Mudança de contrato (D-04):** `criarAgendamentoPublico` e `obterSlotsPublicos` recebem `slug` e resolvem `tenant_id` no servidor — o lookup por slug com fallback `slug_gratuito` + validação `obterSlugEfetivo` já existe em `obterDadosBookingPublico` (linhas 233-258) e é o padrão a reutilizar/fatorar. Todo `.eq('tenant_id', ...)` continua presente em toda query (mitigação 1 da D-02).

### `src/app/book/[slug]/page.tsx` + `BookingApp.tsx`

**Analog:** os próprios. `page.tsx:63-72` já projeta `perfil` campo a campo — remover `tenant_id: perfil.tenant_id` (linha 65) e passar `slug`. Em `BookingApp.tsx`, os quatro pontos que consomem `perfil.tenant_id` (linhas 20, 148, 173, 261) passam a usar o `slug` recebido. `tenantHash` (`page.tsx:76`) continua calculado no servidor — não muda.

### `src/app/api/webhooks/lembrete/route.ts` (route handler)

**Analog:** o próprio arquivo + Padrão 3 do RESEARCH. O que muda é **só o bloco 1** (linhas 16-32):

Atual (a remover — fallback inseguro na linha 19):

```typescript
const secret = searchParams.get('secret')
const qstashSecret = process.env.QSTASH_CURRENT_SIGNING_KEY || 'secret-key'
if (secret !== qstashSecret) { ... 401 }
const body = await req.json()
```

Substituto (RESEARCH §Padrão 3, pronto para copiar): `Receiver` de `@upstash/qstash` no escopo de módulo, `const corpoCru = await req.text()` (body cru, uma vez), `receiver.verify({ signature, body: corpoCru, url: req.url })`, depois `JSON.parse(corpoCru)`. **`url: req.url` é obrigatório** para não matar lembretes em voo publicados com `?secret=` (Pitfall 6). Manter intactos: o `try/catch` externo com `reportarExcecaoAguardando(err, { fluxo: 'webhook_lembrete' })` (linhas 191-205), os `registrarDisparo` e o `console.warn` em pt-BR no 401 (linha 22 — mesmo tom).

### `src/lib/whatsapp-helper.ts` (linhas 131-132)

**Analog:** o próprio. Segundo fallback `|| 'secret-key'`:

```typescript
const secret = process.env.QSTASH_CURRENT_SIGNING_KEY || 'secret-key'
const webhookUrl = `${APP_URL}/api/webhooks/lembrete?secret=${secret}`
```

O `?secret=` na URL de publicação **fica** nesta fase (Deferred) — só o fallback `|| 'secret-key'` sai. Padrão de falha silenciosa com reporte já presente no arquivo (linhas 118-126): `console.warn` + `reportarFalhaSilenciosa('qstash:...')` + `return { ok: false, motivo }`.

### `src/lib/env.ts` (config, boot)

**Analog:** o próprio — mudança é acrescentar `'QSTASH_NEXT_SIGNING_KEY'` a `OBRIGATORIAS_EM_PRODUCAO` (linhas 37-51; `QSTASH_CURRENT_SIGNING_KEY` já está na linha 43) e ajustar o comentário (b) que anunciava esta fase. **Não criar `instrumentation.ts`** — já existe e chama `validarEnvObrigatorio()`.

### `src/lib/supabase/admin.ts` (só JSDoc)

**Analog:** o próprio JSDoc (linhas 3-20). Atualizar "restrito a dois pontos do fluxo público" para incluir as leituras públicas de `public-booking.ts` (mitigação 3 da D-02), mantendo o tom: enumeração numerada, justificativa de negócio por ponto, aviso final "Nunca importe este módulo em client components".

### `vitest.config.ts` (config)

**Analog:** o próprio bloco `env` (linhas 9-13) — acrescentar `QSTASH_CURRENT_SIGNING_KEY` e `QSTASH_NEXT_SIGNING_KEY` com valores de teste, no mesmo bloco e com o mesmo racional já comentado (constantes de módulo avaliadas no import).

## Shared Patterns

### RLS por tenant com initPlan
**Fonte:** `supabase/schemas/03_horarios_funcionamento.sql:28-44`
**Aplicar a:** todas as policies substitutas
`tenant_id = (SELECT auth.jwt() ->> 'org_id')` — sempre em subquery; granular por ação; role explícita; `COMMENT ON POLICY` em pt-BR.

### Erro em Server Action
**Fonte:** `src/app/actions/public-booking.ts:129-140`
**Aplicar a:** toda função tocada em `public-booking.ts`
`console.error` com contexto pt-BR → `reportarExcecao(erroSinteticoSupabase(err), { fluxo, etapa })` → `throw new Error('<amigável pt-BR>')`. Nunca vazar erro cru do Supabase.

### Falha silenciosa de mensageria com reporte
**Fonte:** `src/lib/whatsapp-helper.ts:118-126` e `route.ts:191-205`
**Aplicar a:** webhook e publicação QStash
Cliente final nunca vê erro; `reportarFalhaSilenciosa`/`reportarExcecaoAguardando` garantem detector.

### Estilo Prettier do projeto
`tabWidth: 4`, `semi: false`, `singleQuote: true`, `printWidth: 100`. SQL de migration em minúsculas (analogs `20260709161817` e `20260709193156`); SQL de schema declarativo em MAIÚSCULAS (analogs `03_`, `08_`). Comentários em pt-BR explicando intenção de negócio, sempre.

## No Analog Found

| Arquivo | Role | Data Flow | Motivo |
|---|---|---|---|
| — | — | — | Todos os arquivos têm analog. O uso do `Receiver` de `@upstash/qstash` não tem precedente no repo (QStash hoje é `fetch` cru), mas o RESEARCH §Padrão 3 traz o código pronto e a skill `.agents/skills/upstash/` cobre a API. |

## Metadata

**Escopo da busca:** `src/app/actions/`, `src/app/api/webhooks/`, `src/app/book/`, `src/lib/`, `supabase/schemas/`, `supabase/migrations/`
**Arquivos lidos:** 12
**Data:** 2026-07-21
