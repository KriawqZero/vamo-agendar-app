---
phase: 01-hardening-da-superf-cie-p-blica
plan: 15
subsystem: banco-de-dados
tags: [privilegios, default-privileges, postgrest, rpc, harness, code-review, wr-02, wr-08]

requires:
    - phase: 01-hardening-da-superf-cie-p-blica (plano 01-04)
      provides: 'A default privilege de TABLES/SEQUENCES e o precedente do `for role postgres` — esta migration é a irmã dela para FUNCTIONS'
    - phase: 01-hardening-da-superf-cie-p-blica (plano 01-01)
      provides: 'O método de aplicação D-06 (DDL + INSERT no ledger numa única chamada de `execute_sql`)'
    - phase: 01-hardening-da-superf-cie-p-blica (plano 01-12)
      provides: '`scripts/verificar-superficie-anon.sh` na forma em que foi usado como sinal FRACO — é o defeito que este plano conserta'
provides:
    - 'Função criada pelo role `postgres` nasce sem `EXECUTE` para `PUBLIC` (portanto para a chave publicável), com `service_role` preservado — provado por função descartável e por chamada RPC real'
    - 'A forma CORRETA do comando, medida contra a forma que o code review prescreveu: a revogação de FUNCTIONS tem de ser GLOBAL, sem `in schema`'
    - '`docs/03` §"Privilégios da Data API" cobrindo function/RPC, com as duas armadilhas escritas'
    - 'Harness de superfície anônima que exige código específico, reprova nome desconhecido e reprova tabela declarada sem checagem'
affects: [banco-de-dados, documentacao, phase-02, phase-07, phase-09]

tech-stack:
    added: []
    patterns:
        - 'Default privilege de FUNCTIONS é GLOBAL por obrigação do Postgres: por-schema só ADICIONA, nunca REMOVE privilégio global (doc oficial do PG 17)'
        - 'Prova de privilégio é dupla: catálogo (`has_function_privilege`) e rede (`POST /rest/v1/rpc/<nome>` com a chave publicável)'
        - 'Objeto descartável criado ANTES e DEPOIS do conserto é o contrafactual que distingue "fechou" de "sempre esteve assim"'
        - 'Lista de alvos de harness derivada da fonte da verdade (schemas declarativos), com piso de sanidade que aborta em vez de ficar verde'
        - 'Constante de veredito protegida por trava anti-afrouxamento: editar o código do erro para o harness passar é denunciado pelo próprio harness'

key-files:
    created:
        - supabase/migrations/20260722183153_fecha_data_api_para_funcoes_futuras.sql
    modified:
        - docs/03-PADROES_DE_BANCO_DE_DADOS.md
        - scripts/verificar-superficie-anon.sh

key-decisions:
    - 'O SQL prescrito pelo plano e pelo code review (`alter default privileges ... in schema public revoke all on functions from public`) foi APLICADO, MEDIDO e REPROVADO: é um no-op. A doc do PostgreSQL 17 traz esse caso exato como exemplo de comando ineficaz — "per-schema default privileges can only add, not remove, global privileges". A forma aplicada é a global (`for role postgres`, sem `in schema`)'
    - 'O `GRANT EXECUTE ... TO service_role` continua por schema (`in schema public`): por-schema ADICIONA, e adicionar é exatamente o que se quer ali. Escopo mínimo onde ele pode ser mínimo'
    - 'Custo aceito e registrado: como a revogação é global, função criada pelo `postgres` em QUALQUER schema (extensão inclusive) nasce sem `EXECUTE` para `PUBLIC`. A falha é alta e clara (`permission denied for function`), nunca silenciosa'
    - 'As duas funções preexistentes não foram tocadas — ACL comparado antes e depois, idêntico. Mexer nelas degradaria o dashboard em silêncio (Pitfall 3 da fase)'
    - 'Nome de tabela desconhecido REPROVA em vez de ficar INCONCLUSIVO: um inconclusivo não derruba o exit code, e o defeito do WR-08 é exatamente uma checagem que fica verde para sempre'
    - 'O veredito COBERTURA é pulado quando há filtro na linha de comando — execução de escopo reduzido não pode reprovar por cobertura'

requirements-completed: []
requirements-advanced: [SEG-03, SEG-04]

metrics:
    duration: ~50min
    tasks: 2
    files-created: 1
    files-modified: 2
    tests-before: 217
    tests-after: 217
    completed: 2026-07-22
status: complete
---

# Phase 01 Plano 15: A porta de RPC fechada de verdade, e o instrumento recalibrado — Summary

A default privilege passou a cobrir funções, e a prova empírica exigida pelo plano fez o
que prova empírica serve para fazer: **reprovou o conserto na primeira tentativa**. O SQL
que o code review (WR-02) e o plano prescreviam é um no-op documentado pelo próprio
PostgreSQL. A forma que funciona é global, foi aplicada, e o buraco foi medido pelos dois
lados — catálogo e rede. Em paralelo, o harness de superfície anônima deixou de classificar
qualquer não-200 como esperado, e as três reprovações novas foram vistas vermelhas antes do
commit.

## O achado principal: o conserto prescrito era um no-op

O plano e o WR-08 do `01-REVIEW.md` prescreviam:

```sql
alter default privileges for role postgres in schema public
  revoke all on functions from public;
```

Foi exatamente isso que se aplicou primeiro. A entrada em `pg_default_acl` ficou correta —
sem `PUBLIC`:

```
papel     | schema | tipo | acl_padrao
postgres  | public | f    | postgres=X/postgres | service_role=X/postgres
```

E mesmo assim a função descartável criada **depois** nasceu com `=X` (a concessão a
`PUBLIC`):

```
proname                          | acl                                                        | anon_executa
zz_descartavel_prova_wr02_01_15  | =X/postgres | postgres=X/postgres | service_role=X/postgres | true
zz_descartavel_prova_wr02_segunda| =X/postgres | postgres=X/postgres | service_role=X/postgres | true
```

A documentação oficial do PostgreSQL 17
([sql-alterdefaultprivileges](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html))
traz o caso como exemplo nomeado de comando **ineficaz**:

> **Ineffective Revoke of Default EXECUTE Privilege in a Schema**
> `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;`
> This command has no effect unless it is undoing a matching GRANT, as **per-schema default
> privileges can only add, not remove, global privileges.**

Ou seja: para tabela e sequence o `in schema` funciona (não há concessão global a `PUBLIC`
para remover — o que se revoga ali são `GRANT`s explícitos anteriores). Para **function**,
a concessão de `EXECUTE` a `PUBLIC` é global e embutida, e só um `ALTER DEFAULT PRIVILEGES
FOR ROLE ... ` **sem** `IN SCHEMA` a remove. A migration aplicada:

```sql
alter default privileges for role postgres
  revoke all on functions from public;

alter default privileges for role postgres in schema public
  grant execute on functions to service_role;
```

Se este plano tivesse aceitado "a migration existe" como evidência — que é o tipo de prova
que já reprovou esta fase uma vez —, o item WR-02 teria sido fechado com o buraco aberto,
e a próxima RPC da Phase 2, 7 ou 9 nasceria pública.

## Task 1 — Prova por função descartável

### (a) Inventário de pré-voo (antes de qualquer DDL)

```
proname                            | args              | prokind | acl
rls_auto_enable                    |                   | f       | postgres=X/postgres
substituir_horarios_funcionamento  | p_horarios jsonb  | f       | postgres=X/postgres
                                                                   authenticated=X/postgres
```

Exatamente as duas funções previstas pelo planejamento. **Nenhuma terceira função com
`EXECUTE` para `PUBLIC` ou `anon`** — nada a registrar como achado.

### (b) Ledger

Contagem de arquivos em `supabase/migrations/`: **18 → 19** (critério relativo: +1).
`list_migrations` na entrada: 18 versions. Na saída, 19 — a igualdade é o gate:

```
$ ls supabase/migrations/*.sql | wc -l
19
```

```
mcp__supabase__list_migrations (últimas 4 de 19):
  20260722055941  fecha_policies_anon
  20260722060000  fecha_data_api_para_anon
  20260722145948  fecha_policies_residuais_servicos_horarios
  20260722183153  fecha_data_api_para_funcoes_futuras   ← nova
```

Version idêntica ao prefixo do arquivo (`20260722183153_fecha_data_api_para_funcoes_futuras.sql`),
timestamp estritamente maior que `20260722145948`. Aplicação pelo método D-06: DDL +
`INSERT` no ledger numa **única** chamada de `execute_sql`, portanto na mesma transação.
`apply_migration` não foi usado.

### (c) Prova empírica de catálogo — depois do conserto correto

```
proname                             | acl                                     | anon | authenticated | service_role
zz_descartavel_prova_wr02_terceira  | postgres=X/postgres|service_role=X/postgres | false |     false     |     true
```

E, com o conteúdo literal do arquivo commitado (`revoke all`, não `revoke execute`):

```
proname                  | acl                                        | anon_executa | service_role_executa | descartaveis_restantes
zz_prova_final_arquivo   | postgres=X/postgres | service_role=X/postgres |    false     |         true         |           0
```

`descartaveis_restantes = 0`: todas as funções de teste foram removidas, e o schema
temporário `zz_isolado_wr02` também.

### (d) Prova empírica de REDE — o contrafactual que distingue os dois mundos

Duas funções descartáveis chamadas como RPC com a chave publicável: uma criada **antes** do
conserto correto, outra **depois**.

```
--- POST /rest/v1/rpc/zz_descartavel_prova_wr02_01_15 (chave publicavel, role anon) ---
HTTP 200
42
--- POST /rest/v1/rpc/zz_descartavel_prova_wr02_terceira (chave publicavel, role anon) ---
HTTP 401
{"code":"42501","details":null,"hint":null,"message":"permission denied for function zz_descartavel_prova_wr02_terceira"}
```

O buraco do WR-02 era real e alcançável pelo bundle do navegador: `HTTP 200` devolvendo o
retorno da função. Depois da migration, `42501 permission denied`.

### (e) As duas funções preexistentes, antes e depois

| Função | ACL antes | ACL depois |
|---|---|---|
| `rls_auto_enable()` | `postgres=X/postgres` | `postgres=X/postgres` |
| `substituir_horarios_funcionamento(jsonb)` | `postgres=X/postgres`, `authenticated=X/postgres` | `postgres=X/postgres`, `authenticated=X/postgres` |

Idênticos. `has_function_privilege('anon', …)` = `false` nas duas, como já era.

### (f) Estado final de `pg_default_acl` para o role `postgres`

```
papel     | schema                   | tipo | acl_padrao
postgres  | (GLOBAL — sem IN SCHEMA) | f    | postgres=X/postgres
postgres  | public                   | f    | postgres=X/postgres | service_role=X/postgres
postgres  | public                   | r    | postgres=arwdDxtm/postgres | service_role=arwdDxtm/postgres
postgres  | public                   | S    | postgres=rwU/postgres | service_role=rwU/postgres
```

A linha GLOBAL/`f` é a que este plano criou e é a que faz o conserto valer.

### (g) Critérios de `grep` da Task 1

| Critério | Piso | Medido |
|---|---|---|
| `ls supabase/migrations/*.sql \| wc -l` | 19 | **19** |
| `grep -icE 'revoke all on functions from public'` na migration | 1 | **1** |
| `grep -icE 'grant execute on functions to service_role'` na migration | 1 | **1** |
| `grep -vE '^\s*--' migration \| grep -icE 'revoke.*service_role'` | 0 | **0** |
| `grep -ciE 'function\|rpc' docs/03` | ≥ 4 (inicial 0) | **15** |
| `grep -ci 'PUBLIC' docs/03` | > 3 (inicial 3) | **11** |

Verify automatizado da task: `VERIFY OK (exit 0)`.

### (h) `docs/03` — linhas casadas

Alínea **a** (linhas 82-96): tabela comparando as duas migrations irmãs, a frase de que
function é superfície de rede igual a tabela, e o bloco 🚨 com as **duas armadilhas**
(revogar de `anon` em vez de `PUBLIC`; usar `in schema` na linha de function), com a citação
da doc do PG 17 e a menção de que a versão por schema foi medida e reprovada. Alínea **b**
(linhas 106-111): exemplo de `grant execute on function public.<funcao>(<tipos>) to
authenticated`, apontando `03_horarios_funcionamento.sql:101-102` como o padrão que já
existe. Alínea **e** (linhas 134-139): checklist novo "ao criar function/RPC nova no schema
`public`" com quatro itens.

## Task 2 — O harness recalibrado

### Linha de base, antes de editar

```
Resumo: 11 checagem(ns), 0 reprovada(s) — a role anon não devolveu linha nenhuma.
EXIT: 0
```
Todas as 11 devolviam `42501`, mas eram classificadas como ESPERADO apenas por "não é 200".

### Contagens antes → depois

| Critério | Inicial (medido) | Final |
|---|---|---|
| `grep -c 'supabase/schemas'` | 0 | **2** |
| `grep -vE '^\s*#' \| grep -c '42501'` | 0 | **2** |
| `grep -ci 'COBERTURA'` | 0 | **12** |
| `grep -cE 'SUPABASE_SECRET_KEY\|SERVICE_ROLE'` | 0 | **0** (continua sem tocar segredo) |

As duas ocorrências executáveis de `42501` são a constante `CODIGO_PERMISSAO_NEGADA` e a
**trava anti-afrouxamento**: o script aborta com código 2 se a constante for editada — é a
resposta à proibição "nunca afrouxar um veredito para fazê-lo passar".

### Derivação isolada — exatamente as nove tabelas operacionais

```
agendamentos
assinaturas
clientes
disparos_whatsapp
excecoes_agenda
horarios_funcionamento
perfis_empresas
servicos
whatsapp_configs
-- quantidade: 9
```

`00_funcoes_sistema.sql` não declara tabela e corretamente não entra.

### Execução completa, depois do conserto

```
Verificação da superfície anônima da Data API
Alvo: https://cimeiteyueeolwmlouxi.supabase.co
Escopo: todas as tabelas operacionais
Tabelas derivadas de supabase/schemas/*.sql (9): agendamentos assinaturas clientes disparos_whatsapp excecoes_agenda horarios_funcionamento perfis_empresas servicos whatsapp_configs
ESPERADO exige 42501 no corpo, ou PGRST205/404 em nome declarado.

  [ESPERADO]     perfis_empresas — GET ?select=*                       HTTP 401/42501: {"code":"42501",...
  [ESPERADO]     perfis_empresas — GET ?select=tenant_id,telefone_contato HTTP 401/42501: {"code":"42501",...
  [ESPERADO]     agendamentos — POST anônimo                          HTTP 401/42501: {"code":"42501",...
  [ESPERADO]     clientes — POST anônimo                              HTTP 401/42501: {"code":"42501",...
  [ESPERADO]     agendamentos — GET ?select=cliente_id                 HTTP 401/42501: {"code":"42501",...
  [ESPERADO]     excecoes_agenda — GET ?select=motivo                  HTTP 401/42501: {"code":"42501",...
  [ESPERADO]     servicos — GET ?select=tenant_id&limit=1              HTTP 401/42501: {"code":"42501",...
  [ESPERADO]     horarios_funcionamento — GET ?select=tenant_id&limit=1 HTTP 401/42501: {"code":"42501",...
  [ESPERADO]     assinaturas — GET ?select=tenant_id&limit=1           HTTP 401/42501: {"code":"42501",...
  [ESPERADO]     whatsapp_configs — GET ?select=tenant_id&limit=1      HTTP 401/42501: {"code":"42501",...
  [ESPERADO]     disparos_whatsapp — GET ?select=tenant_id&limit=1     HTTP 401/42501: {"code":"42501",...

  [COBERTURA]    todas as tabelas declaradas                             9 declarada(s), 9 coberta(s) por pelo menos uma checagem

Resumo: 11 checagem(ns), 0 reprovada(s) — a role anon não devolveu linha nenhuma.
EXIT: 0
```

11 checagens, 0 reprovadas, **0 inconclusivas** — mesma linha de base da reverificação, agora
com veredito por código específico.

### As três provas de reprovação, todas vistas VERMELHAS

**(i) Nome de tabela desconhecido — o cenário literal do WR-08** (typo `whatsapp_config`,
sem o `s`):

```
Resumo: 12 checagem(ns), 1 REPROVADA(S) — a superfície segue aberta:
  - whatsapp_config — GET ?select=tenant_id&limit=1 — HTTP 404/PGRST205 e 'whatsapp_config' NÃO consta de supabase/schemas/*.sql — a checagem não prova fechamento nenhum
EXIT: 1
```

Antes deste plano, essa mesma checagem sairia `[ESPERADO] HTTP 404` e ficaria verde para
sempre.

**(ii) Tabela declarada sem checagem — veredito `COBERTURA`** (removendo
`disparos_whatsapp` da bateria, sem removê-la dos schemas):

```
  [REPROVADO]    COBERTURA — disparos_whatsapp                         declarada em supabase/schemas/*.sql e sem nenhuma checagem nesta bateria

Resumo: 11 checagem(ns), 1 REPROVADA(S) — a superfície segue aberta:
  - COBERTURA — disparos_whatsapp — declarada em supabase/schemas/*.sql e sem nenhuma checagem nesta bateria
EXIT: 1
```

**(iii) Derivação truncada — aborta com código 2** (um arquivo de schema fora do caminho):

```
ERRO: a derivação encontrou 8 tabela(s) em supabase/schemas/*.sql, menos que o piso de 9 — lista truncada torna todo veredito acaso.
EXIT: 2
```

Nos três casos o arquivo foi restaurado e conferido por `diff` contra o backup (`identico`)
antes do commit; o arquivo de schema foi devolvido e `git status --short supabase/schemas/`
saiu vazio.

### Caminho com filtro — cobertura pulada, não reprovada

```
$ bash scripts/verificar-superficie-anon.sh assinaturas
  [ESPERADO]     assinaturas — GET ?select=tenant_id&limit=1           HTTP 401/42501: ...
COBERTURA pulada — execução com filtro (assinaturas); escopo reduzido não reprova por cobertura.
Resumo: 1 checagem(ns), 0 reprovada(s)
EXIT: 0
```

## Definition of Done — saída real sobre o HEAD final (`501130b`)

```
=== pnpm lint ===
$ eslint
LINT EXIT: 0

=== pnpm test ===
 Test Files  14 passed (14)
      Tests  217 passed (217)
   Duration  416ms
TEST EXIT: 0

=== npx tsc --noEmit ===
TSC EXIT: 0

=== pnpm build ===
ƒ Proxy (Middleware)
○  (Static)   prerendered as static content
●  (SSG)      prerendered as static HTML (uses generateStaticParams)
ƒ  (Dynamic)  server-rendered on demand
BUILD EXIT: 0

=== pnpm test:integracao ===
 Test Files  1 passed (1)
      Tests  5 passed (5)
   Duration  6.51s
INTEGRACAO EXIT: 0
```

Contagem de testes preservada (217, 14 arquivos) — a hermeticidade do `pnpm test` continua
valendo. A suíte de integração passando é a prova de que o `createAdminClient()` não
regrediu: se o `GRANT EXECUTE ... TO service_role` tivesse ficado de fora, ela é a primeira
a cair.

## Deviations from Plan

### 1. [Rule 1 - Bug] O SQL prescrito pelo plano era um no-op; aplicado o de escopo global

- **Encontrado em:** Task 1, alínea (d) — a prova empírica exigida pelo próprio plano
- **Problema:** `alter default privileges ... in schema public revoke all on functions from
  public` não remove a concessão global de `EXECUTE` a `PUBLIC`. Medido duas vezes (schema
  `public` e um schema isolado descartável) e confirmado pela doc do PostgreSQL 17, que
  nomeia esse comando como ineficaz
- **Conserto:** revogação global (`for role postgres`, sem `in schema`), mantendo o
  `GRANT EXECUTE ... TO service_role` por schema. Aplicado, e o resultado provado por
  catálogo e por chamada RPC real
- **Arquivos:** `supabase/migrations/20260722183153_fecha_data_api_para_funcoes_futuras.sql`
  (o cabeçalho registra a armadilha em (iii), para que ninguém "simplifique" de volta),
  `docs/03-PADROES_DE_BANCO_DE_DADOS.md`
- **Commit:** `bc2e132`
- **Custo colateral aceito e registrado:** o escopo global vale para função criada pelo
  `postgres` em qualquer schema, extensão inclusive. A falha é alta e clara
  (`permission denied for function ...`), nunca silenciosa, e o conserto é o `GRANT`
  explícito já previsto pela D-03

### 2. [Rule 3 - Bloqueio] Contradição interna do plano sobre a ordem do timestamp

- **Problema:** a alínea (b) da Task 1 manda o timestamp ser "estritamente maior que o da
  migration do plano 01-14", mas a seção "Por que este plano vem ANTES do 01-14" e o
  critério de aceite dizem o contrário (esta é a 19ª, a do 01-14 será a 20ª)
- **Decisão:** seguido o critério de aceite e a troca de waves — timestamp
  `20260722183153`, estritamente maior que `20260722145948` e necessariamente menor que o
  da migration do 01-14, que ainda não existe
- **Impacto:** nenhum no banco; apenas a numeração fica coerente com a ordem de execução

### 3. [Registro, sem conserto] O `<done>` da Task 1 fala em "ledger com 20 versions"

Resíduo da mesma troca de waves. O estado correto e medido é **19 versions = 19 arquivos**.
Nada foi feito para "chegar a 20".

## Achados registrados, não consertados

Nenhum. O inventário de pré-voo não encontrou terceira função, e nenhum drift fora do
`files_modified` apareceu durante a execução.

## Known Stubs

Nenhum. Nenhum valor vazio, placeholder ou caminho não ligado foi introduzido.

## Threat Flags

Nenhuma superfície nova. Este plano **remove** superfície (`T-01-15-01`, elevation of
privilege via RPC futura) e endurece o instrumento de prova (`T-01-15-03`). O
`T-01-15-02` (negação de serviço no `createAdminClient()`) foi controlado pelo `grep`
proibindo `service_role` em linha de revoke e pela suíte de integração verde.

## Self-Check: PASSED

- `supabase/migrations/20260722183153_fecha_data_api_para_funcoes_futuras.sql` — FOUND
- `docs/03-PADROES_DE_BANCO_DE_DADOS.md` — FOUND
- `scripts/verificar-superficie-anon.sh` — FOUND
- commit `bc2e132` — FOUND
- commit `501130b` — FOUND
