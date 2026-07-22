---
phase: 01-hardening-da-superf-cie-p-blica
plan: 14
subsystem: banco-de-dados
tags: [isolamento-multi-tenant, slug, namespace-publico, constraint, code-review, cr-03]

requires:
    - phase: 01-hardening-da-superf-cie-p-blica (plano 01-15)
      provides: '`scripts/verificar-superficie-anon.sh` recalibrado (WR-08) — sem ele o portão de não-regressão deste plano seria instrumento descalibrado; e a 19ª migration, que fixa a numeração da 20ª'
    - phase: 01-hardening-da-superf-cie-p-blica (plano 01-01)
      provides: 'O método de aplicação D-06 (DDL + INSERT no ledger numa única chamada de `execute_sql`)'
    - phase: 01-hardening-da-superf-cie-p-blica (plano 01-02)
      provides: '`resolverPerfilPublicoPorSlug` como única porta do caminho público — é a função onde a recusa de ambiguidade entra'
    - phase: 01-hardening-da-superf-cie-p-blica (plano 01-08)
      provides: 'O padrão do tenant vizinho DESCARTÁVEL criado dentro da própria prova, com teardown no `finally`'
provides:
    - '`perfis_empresas.slug_gratuito` com `UNIQUE` — o namespace público de slug tem dono no banco'
    - '`salvarPerfilEmpresa` recusa slug que colide com o `slug_gratuito` de OUTRO tenant, antes do upsert'
    - '`resolverPerfilPublicoPorSlug` recusa resolução ambígua em vez de servir o primeiro que a query encontrar'
    - 'Teste de integração que reproduz o sequestro do CR-03 e exige recusa — visto VERMELHO servindo a página do sequestrador'
affects: [banco-de-dados, booking-publico, dashboard, phase-07]

tech-stack:
    added: []
    patterns:
        - 'Constraint nomeada com o padrão `<tabela>_<coluna>_key` de propósito: é o nome que o Postgres daria ao `UNIQUE` inline do schema declarativo, e é o que impede `db diff` futuro de ver drift'
        - 'Regra que é ENTRE LINHAS não cabe em constraint: fica em três camadas (banco fecha o que consegue, action fecha a escrita, resolver fecha a leitura das linhas que já existem)'
        - 'Checagem cross-tenant sob RLS é decorativa por construção: a policy do próprio tenant faz a consulta voltar vazia. Cliente privilegiado com projeção de uma coluna e `head: true` — sai o veredito, nunca o dado do vizinho'
        - 'Duas consultas `.eq()` em paralelo, nunca filtro `or(...)` com dado de URL — desambiguar não pode custar uma injeção de filtro no PostgREST'
        - 'Contrafactual de prova: o teste foi visto vermelho com o resolver antigo (servindo o sequestrador) e com a constraint derrubada — as duas camadas medidas separadamente'

key-files:
    created:
        - supabase/migrations/20260722185755_slug_gratuito_unico.sql
    modified:
        - supabase/schemas/01_perfis_empresas.sql
        - src/app/actions/perfis-empresas.ts
        - src/app/actions/public-booking.ts
        - src/app/actions/__tests__/public-booking-escrita.test.ts

key-decisions:
    - 'A checagem cruzada usa `createAdminClient()` (saída (i) do plano). A saída (ii) — confiar no `23505` — foi descartada com motivo escrito no código: a constraint é `slug_gratuito` contra `slug_gratuito`, e esta colisão é `slug` contra `slug_gratuito`, que constraint nenhuma cobre. Sob RLS a consulta voltaria SEMPRE vazia: verde e inútil, a pior forma de falha'
    - 'O nome da constraint contraria o que o review sugeriu (`uq_perfis_empresas_slug_gratuito`) e segue o plano: `perfis_empresas_slug_gratuito_key`, o nome que o Postgres gera para um `UNIQUE` inline. Nome divergente faria todo `db diff` futuro propor dropar e recriar'
    - 'A assinatura `pro` do tenant vizinho no teste é parte da PROVA, não cenário: sem plano com link personalizado, `obterSlugEfetivo` do sequestrador devolveria o `slug_gratuito` dele, a resolução recusaria por outro motivo e o caso ficaria verde sem provar nada'
    - 'A ambiguidade é reportada ao Sentry SEM slug e SEM `tenant_id` — só `fluxo`/`etapa` e o rótulo. Quem investiga roda o self-join de pré-voo da migration; o invariante "nunca PII/identificador em telemetria" não abre exceção para diagnóstico'
    - 'As duas buscas correm em `Promise.all`: o custo assumido é de conexão, não de latência somada'

requirements-completed: []
requirements-advanced: [SEG-02]

metrics:
    duration: ~35min
    tasks: 3
    files-created: 1
    files-modified: 4
    tests-before: 217 herméticos + 5 de integração
    tests-after: 217 herméticos + 8 de integração
    completed: 2026-07-22
status: complete
---

# Phase 01 Plano 14: O namespace público de slug ganha dono — Summary

`slug` e `slug_gratuito` nunca foram duas colunas independentes: são lidas pela mesma
URL, logo são dois membros de **um** namespace — e o namespace não tinha dono. O plano
fechou isso em três camadas, e a camada de cima (a recusa de ambiguidade na leitura) foi
vista **vermelha servindo a página do sequestrador**, com o nome dele no corpo da
resposta. A constraint foi vista vermelha separadamente, com ela derrubada do banco.

## Task 1 — Pré-voo, migration à mão e ledger

### (a) Pré-voo, ANTES de qualquer DDL

Duplicatas de `slug_gratuito`:

```sql
select slug_gratuito, count(*) as quantidade, array_agg(tenant_id) as tenants
from public.perfis_empresas
group by slug_gratuito
having count(*) > 1;
```
```
[]
```

Colisões cruzadas já existentes (`slug` de um tenant == `slug_gratuito` de outro):

```sql
select a.tenant_id as tenant_do_slug, a.slug as slug_reivindicado,
       b.tenant_id as tenant_do_slug_gratuito
from public.perfis_empresas a
join public.perfis_empresas b
  on a.slug = b.slug_gratuito and a.tenant_id <> b.tenant_id;
```
```
[]
```

**As duas voltaram vazias.** Nenhuma decisão de dado foi tomada, nenhuma linha existente
foi alterada, e o plano não precisou parar. (`select count(*) from perfis_empresas` → 1
linha, o único tenant do banco de dev.)

### (b) e (c) Schema declarativo e migration

`supabase/schemas/01_perfis_empresas.sql` linha 4 passou a declarar o `UNIQUE` inline,
exatamente como `slug` já fazia na linha acima:

```
4:    slug_gratuito text NOT NULL UNIQUE, -- Slug aleatório gerado na criação; …
```

Mais `COMMENT ON CONSTRAINT perfis_empresas_slug_gratuito_key` e a atualização do
`COMMENT ON COLUMN`. A migration é `supabase/migrations/20260722185755_slug_gratuito_unico.sql`,
escrita à mão no molde da `20260722145948`, com o cenário de ataque no cabeçalho.

**Nenhum comando de infraestrutura local foi executado.** `supabase db diff`,
`supabase db push`, `supabase start`/`stop` e `docker` não foram usados — o owner não
estava na sessão para aprovar o shadow database em container, e o delta é uma constraint
com cinco precedentes de escrita manual no repositório.

### (d) Ledger — contagens e saída

| Medida | Antes | Depois |
|---|---|---|
| `ls supabase/migrations/*.sql \| wc -l` | 19 | **20** |
| `list_migrations` → versions | 19 | **20** |

A igualdade entre as duas é o gate, e ela vale. Aplicação pelo método D-06: o
`ALTER TABLE`, o `COMMENT ON CONSTRAINT` e o `INSERT` no ledger numa **única** chamada de
`mcp__supabase__execute_sql`, portanto na mesma transação. `apply_migration` **não** foi
usado.

```
mcp__supabase__list_migrations (últimas 4 de 20):
  20260722060000  fecha_data_api_para_anon
  20260722145948  fecha_policies_residuais_servicos_horarios
  20260722183153  fecha_data_api_para_funcoes_futuras
  20260722185755  slug_gratuito_unico            ← nova
```

Version idêntica ao prefixo do arquivo, e estritamente maior que a do 01-15
(`20260722185755` > `20260722183153`).

### (e) Confirmação no catálogo

```
conname                            | contype | definicao              | tem_comment
perfis_empresas_slug_gratuito_key  | u       | UNIQUE (slug_gratuito) | true
perfis_empresas_slug_key           | u       | UNIQUE (slug)          | false
```

### Critérios de `grep` da Task 1

| Critério | Esperado | Medido |
|---|---|---|
| verify automatizado da task (20 arquivos + grep do schema + arquivo existe) | exit 0 | **exit 0** |
| `grep -vE '^\s*--' migration \| grep -icE 'grant\|revoke'` | 0 | **0** |
| `grep -c 'comment on constraint' migration` | 1 | **1** |
| `grep -n 'slug_gratuito text NOT NULL UNIQUE' schema` | casa | **linha 4** |

## Task 2 — Escrita recusa a colisão, leitura recusa a ambiguidade

### (a) Checagem cruzada em `salvarPerfilEmpresa`

Entra entre a decisão de `slugFinal` e o `upsert`, e só roda quando `slugFinal` difere do
`slug_gratuito` do próprio tenant — o que preserva os dois casos que ela **não pode**
barrar: o profissional do plano Gratuito salvando com o próprio `slug_gratuito` (é o valor
que o formulário devolve) e o pago re-salvando o próprio `slug` sem alteração.

**Saída escolhida: (i), `createAdminClient()`.** A saída (ii) não fecha nada, e o motivo
está escrito junto do código: a constraint é `slug_gratuito` contra `slug_gratuito`, e
esta colisão é `slug` contra `slug_gratuito` — nenhuma constraint a cobre. E com o client
sob RLS a consulta seria pior que inútil: a policy de SELECT de `perfis_empresas` é
`tenant_id = org_id do JWT`, então uma busca por linhas de OUTROS tenants voltaria
**sempre** vazia e a checagem ficaria verde para sempre. O privilégio é usado no escopo
mínimo possível: projeção de UMA coluna (`tenant_id`), `head: true` (nenhuma linha
trafega) e `.neq('tenant_id', orgId)`. O que sai da função é o veredito.

`COPY_SLUG_EM_USO` nasceu em `perfis-empresas.ts`, junto das outras mensagens do
dashboard, e as duas rotas (o `23505` da constraint e a checagem nova) passaram a usá-la —
para o profissional é o mesmo fato, e a mensagem não revela nada do outro tenant.

### (b) Recusa de ambiguidade em `resolverPerfilPublicoPorSlug`

As duas buscas deixaram de ser encadeadas: são feitas **sempre**, em `Promise.all`. Se as
duas devolvem linha e os `tenant_id` divergem, a resolução recusa com
`{ ok: false, motivo: 'slug_invalido' }` e reporta ao Sentry por
`reportarFalhaSilenciosa('booking:namespace_slug_ambiguo', …)` — é sintoma, não condição
de negócio. Mesmo tenant nas duas colunas segue normalmente (é quem nunca personalizou o
link). Nem o slug nem os `tenant_id` entram no contexto do reporte.

Duas consultas `.eq()` separadas, **nenhum** filtro `or(...)`: o slug é dado do visitante,
e interpolar valor de URL em filtro do PostgREST é injeção de filtro — fechar o sequestro
abrindo isso seria o pior resultado possível da rodada.

### Contagens antes → depois

| Critério | Inicial (medido nesta task) | Final | Piso |
|---|---|---|---|
| `grep -c 'slug_gratuito' perfis-empresas.ts` | 6 | **13** | sobe |
| `grep -c 'COPY_SLUG_EM_USO' perfis-empresas.ts` | 0 | **3** | ≥ 1 |
| `grep -c 'COPY_SLUG_EM_USO' book/[slug]/mensagens.ts` | 0 | **0** | = 0 |
| `grep -cE '\.or\(' public-booking.ts` | 0 | **0** | = 0 (não-regressão) |
| `grep -c 'tenant_id !==' public-booking.ts` | 0 | **1** | ≥ 1 |
| `grep -c 'reportarExcecao(' public-booking.ts` | 4 | **4** | ≥ 4 (invariante) |

## Task 3 — O invariante do namespace, e as duas medições VERMELHAS

Três casos novos na suíte de integração (5 → **8**), reusando a fixture e o teardown
existentes.

### O caso central, visto VERMELHO com o resolver antigo

O tenant vizinho **descartável** grava em `slug` o `slug_gratuito` da fixture — o link que
a fixture divulga, por estar no plano gratuito. Com o fallback encadeado restaurado
temporariamente, `obterDadosBookingPublico(<slug_gratuito da fixture>)` devolveu:

```
AssertionError: A resolução devolveu um perfil para um slug ambíguo — é o sequestro do CR-03.
- Expected: null
+ Received: {
    "perfil": {
      "nome_estabelecimento": "Vizinho descartável — sequestro de link",
      "slug": "teste-integracao-booking-gratuito",
      "slug_gratuito": "teste-integracao-booking-vizinho-gratuito",
      "tenant_id": "org_teste_integracao_booking_vizinho",
      …
    },
    "servicos": [],
  }

 Test Files  1 failed (1)
      Tests  1 failed | 7 passed (8)
```

Não é o teste "reprovando genericamente": é a página do **sequestrador** sendo servida
para quem visitou o link da vítima, com o nome dele no corpo. Depois da medição, o arquivo
foi restaurado a partir de um backup e conferido (`diff -q` → idêntico; `git status
--short` só com o arquivo de teste modificado).

**A assinatura `pro` do vizinho é parte da prova.** Sem plano com link personalizado,
`obterSlugEfetivo` do sequestrador devolveria o `slug_gratuito` dele, o slug acessado não
seria o efetivo, e a resolução recusaria por outro motivo — o caso ficaria verde sem
provar nada. É o plano pago que torna o sequestro alcançável, exatamente como no CR-03.

### O caso de constraint, visto VERMELHO com ela derrubada

A constraint foi dropada do banco só para a medição (o ledger **não** foi tocado):

```
AssertionError: O INSERT com `slug_gratuito` duplicado passou — a constraint
perfis_empresas_slug_gratuito_key não está no banco.: expected null not to be null

 Test Files  1 failed (1)
      Tests  1 failed | 7 passed (8)
```

Restaurada em seguida com o mesmo DDL e o mesmo `COMMENT ON` da migration, e reconferida
no catálogo (`contype = 'u'`, `tem_comment = true`). O caso assere pelo SQLSTATE `23505`,
nunca pelo texto do erro — texto de erro do Postgres muda entre versões.

### O caso de CONTROLE

`CONTROLE: sem vizinho, o slug da fixture continua resolvendo o mesmo perfil` — assere
`dados.perfil.tenant_id === TENANT_TESTE` e que os serviços continuam vindo. Sem ele, um
resolver quebrado que recusasse **tudo** passaria nos dois casos acima.

### O vizinho não sobrevive à suíte

| Momento | `count(*)` em `perfis_empresas` | linhas `org_teste_integracao%` |
|---|---|---|
| Antes de tudo | 1 | 0 |
| Depois da última execução | **1** | **0** |

Teardown no `finally` de cada caso e também dentro de `limparTenantDeTeste` (que roda
`beforeAll` e `afterAll`) — cinto de segurança para a execução que morre no meio.

## Verificação — os nove comandos, com a saída real

```
=== 1. Pré-voo (duas consultas) ===
[]   e   []                                            ← as duas vazias

=== 2. list_migrations ===
20 versions  ==  20 arquivos em supabase/migrations/
nova: 20260722185755 / slug_gratuito_unico             ← prefixo do arquivo

=== 3. pg_constraint ===
perfis_empresas_slug_gratuito_key | u | UNIQUE (slug_gratuito) | tem_comment: true

=== 4. pnpm test:integracao ===
$ EXIGIR_INTEGRACAO=1 vitest run src/app/actions/__tests__/public-booking-escrita.test.ts
 Test Files  1 passed (1)
      Tests  8 passed (8)
   Duration  7.03s
INTEGRACAO EXIT: 0

=== 5. pnpm test ===
 Test Files  14 passed (14)
      Tests  217 passed (217)
   Duration  409ms
TEST EXIT: 0

=== 6. pnpm lint ===
$ eslint
LINT EXIT: 0

=== 7. pnpm build ===
ƒ Proxy (Middleware)
○  (Static)   prerendered as static content
●  (SSG)      prerendered as static HTML (uses generateStaticParams)
ƒ  (Dynamic)  server-rendered on demand
BUILD EXIT: 0

=== 8. bash scripts/verificar-superficie-anon.sh ===
  [COBERTURA]    todas as tabelas declaradas   9 declarada(s), 9 coberta(s) por pelo menos uma checagem
Resumo: 11 checagem(ns), 0 reprovada(s) — a role anon não devolveu linha nenhuma.
SUPERFICIE EXIT: 0

=== 9. bash scripts/verificar-travessia-server-action.sh ===
  [APROVADO]  PREPARO           ids derivados de .next/server/server-reference-manifest.json
  [APROVADO]  CONTROLE          GET / devolveu 200 e o processo seguiu vivo
  [APROVADO]  SLOTS_ERRO        o corpo carrega `slug_invalido` e nenhum `digest` opaco
  [APROVADO]  ESCRITA_VALIDACAO o corpo carrega `campos_obrigatorios` e nenhum `digest` opaco
  [APROVADO]  SEM_VAZAMENTO     nenhum corpo carrega o slug do visitante, org_, PGRST ou tenant_id
Resumo: 5 vereditos, 0 reprovados
TRAVESSIA EXIT: 0
```

E, fora da lista dos nove, o quarto comando da Definition of Done do projeto:

```
=== npx tsc --noEmit ===
TSC EXIT: 0
```

A contagem de testes herméticos ficou intacta em 217/14 arquivos: os casos novos são de
integração e continuam fora do glob padrão do `pnpm test`.

## Deviations from Plan

### 1. [Rule 3 - Bloqueio] O plano fala em "19 versions" onde o ledger diz 20

- **Problema:** o `<done>` da Task 1 e o item 2 da `<verification>` dizem "ledger com 19
  versions alinhadas a 19 arquivos". O parágrafo de serialização do mesmo plano, o
  critério de aceite ("`18` no HEAD `0ed1125`, portanto `19` → `20` nesta task, depois do
  01-15") e o `<automated>` da própria task (`-eq 20`) dizem o contrário
- **Decisão:** seguido o LEDGER medido e os critérios de aceite — 19 arquivos na entrada,
  **20** na saída, version `20260722185755`. É o mesmo resíduo da troca das waves 5 e 6 que
  o 01-15 registrou como desvio 3 dele; a residual aqui é a imagem espelhada
- **Impacto:** nenhum no banco. `list_migrations` e `ls` batem em 20

### 2. [Rule 1 - Decisão de nome] O nome de constraint do review foi descartado

- **Problema:** o CR-03 propõe `create unique index uq_perfis_empresas_slug_gratuito`
- **Decisão:** seguido o plano — `alter table … add constraint
  perfis_empresas_slug_gratuito_key unique (slug_gratuito)`, que é o objeto e o nome que o
  Postgres gera para o `UNIQUE` inline agora declarado no schema. Com o nome do review,
  todo `db diff` futuro veria drift e proporia dropar e recriar a constraint
- **Arquivos:** `supabase/migrations/20260722185755_slug_gratuito_unico.sql` (o cabeçalho
  registra o porquê, para ninguém "corrigir" de volta para o do review)

### 3. [Registro, sem conserto] O CHECK sugerido pelo review é um placeholder e não foi escrito

O próprio review admite (`check (slug = slug_gratuito or true); -- placeholder`) que a
checagem cruzada não cabe num CHECK de linha. Nada foi escrito no lugar: a regra é entre
linhas e ficou nas duas camadas de aplicação, como o plano determinou.

## Dívida aceita, e escrita como tal

A decisão `add-alongside` do plano continua valendo, com o gatilho de promoção registrado.
O que ela **não** cobre: manter mais de um alias vivo (redirecionar link antigo depois de
uma troca de slug) e um terceiro identificador público (domínio próprio, alias por
campanha). Qualquer um dos dois virar requisito força a promoção para uma tabela de
identificadores públicos — **não** uma terceira coluna. O comentário do bloco de testes
diz isso em voz alta, no lugar onde quem for reintroduzir a suposição singular vai bater.

## Achados registrados, não consertados

Nenhum. O pré-voo não achou colisão nem duplicata, e nenhum drift fora do `files_modified`
apareceu durante a execução.

## Known Stubs

Nenhum. Nenhum valor vazio, placeholder ou caminho não ligado foi introduzido.

## Threat Flags

Nenhuma superfície nova. Este plano **remove** superfície: `T-01-14-01` (elevation of
privilege pelo namespace) e `T-01-14-02` (vazamento de PII entre tenants) foram fechados
pelas três camadas e provados pelo caso vermelho; `T-01-14-03` (os dois links virando 404)
foi eliminado pela constraint; `T-01-14-04` (injeção de filtro) está travado por critério
de `grep` com valor 0 e pela implementação em duas consultas `.eq()`; `T-01-14-05` (ledger)
e `T-01-14-06` (constraint em dado sujo) foram controlados pelo método D-06 e pelo
pré-voo.

O único ponto de atenção para quem vier depois, e ele é consequência declarada da escolha
(i): `salvarPerfilEmpresa` passou a usar o cliente privilegiado numa consulta. O escopo é
uma coluna, `head: true` e um `.neq` — mas é um ponto a mais onde `createAdminClient()`
aparece fora do fluxo público, e merece o olho de qualquer revisão futura de privilégio.

## Self-Check: PASSED

- `supabase/migrations/20260722185755_slug_gratuito_unico.sql` — FOUND
- `supabase/schemas/01_perfis_empresas.sql` — FOUND
- `src/app/actions/perfis-empresas.ts` — FOUND
- `src/app/actions/public-booking.ts` — FOUND
- `src/app/actions/__tests__/public-booking-escrita.test.ts` — FOUND
- commit `2a1ce3d` (Task 1) — FOUND
- commit `aa8f26e` (Task 2) — FOUND
- commit `960978b` (Task 3) — FOUND
</content>
