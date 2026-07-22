---
phase: 01-hardening-da-superf-cie-p-blica
plan: 08
subsystem: database
tags: [postgres, rls, policy, multi-tenant, cross-tenant, supabase, migrations, ledger]

# Dependency graph
requires:
  - phase: 01-hardening-da-superf-cie-p-blica (plano 01-04)
    provides: "REVOKE total de anon + o método correto de aplicar DDL no Cloud (execute_sql + INSERT no ledger) — e a regra de que apply_migration está proibido"
  - phase: 01-hardening-da-superf-cie-p-blica (plano 01-05)
    provides: "A auditoria que NOMEOU estas duas policies e escreveu o procedimento de fechamento em docs/PENDENCIAS.md"
  - phase: 01-hardening-da-superf-cie-p-blica (plano 01-07)
    provides: "Teardown da fixture org_teste_integracao_booking — sem ele, a contagem de tenants desta prova mediria o próprio andaime da fase"
  - phase: 01-hardening-da-superf-cie-p-blica (plano 01-06)
    provides: "Linha de base estável da Definition of Done: 13 arquivos / 198 testes"
provides:
  - "Leitura cross-tenant de catálogo e agenda de funcionamento ENCERRADA: sob role authenticated, a consulta devolve 1 tenant onde devolvia 2"
  - "Armadilha carregada desarmada: sem policy pré-escrita TO anon, um GRANT futuro não reabre nada sozinho"
  - "Padrão de PROVA de RLS sem navegador: transação revertida com role local authenticated + claim org_id injetado, e um tenant vizinho DESCARTÁVEL criado dentro da própria transação para que a contagem prove algo"
  - "DDL e escrita no ledger na MESMA transação — fecha a janela de desalinhamento que a suposição A-SEG-01 apontava"
  - "Ledger alinhado em 18 versions = 18 arquivos, com a version do próprio arquivo"
affects: [01-09, phase-02-agenda, qualquer-fase-que-crie-policy]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Policies são PERMISSIVAS e se somam por OR: uma policy compartilhada sem cláusula de tenant ANULA o escopo da tenant-scoped que convive com ela"
    - "Prova de RLS por transação revertida: begin → insert do vizinho descartável → set_config('request.jwt.claims') → set local role authenticated → contar → rollback"
    - "Contrafactual dentro da transação: quando o banco de dev tem um tenant só, criar o vizinho ali dentro converte um veredito INCONCLUSIVO num conclusivo sem persistir nada"
    - "DDL + INSERT no ledger numa única chamada de execute_sql: atômico, em vez de dois passos com janela de drift entre eles"

key-files:
  created:
    - supabase/migrations/20260722145948_fecha_policies_residuais_servicos_horarios.sql
  modified:
    - supabase/schemas/02_servicos.sql
    - supabase/schemas/03_horarios_funcionamento.sql

key-decisions:
  - "DROP puro, sem substituta: a policy 1b (TO authenticated, tenant-scoped) pré-existe desde a 20260709165703 e cobre o próprio tenant INCLUSIVE as linhas inativas — a D-07 não se aplica e uma segunda policy seria redundância"
  - "A medição 3 NÃO foi registrada como INCONCLUSIVA: o banco de dev tem um tenant só, então um tenant vizinho descartável foi criado dentro da transação revertida — o contraste 2→1 virou prova conclusiva em vez de dedução a partir de pg_policies"
  - "DDL e INSERT no ledger emitidos numa única chamada de execute_sql, portanto na mesma transação — a suposição A-SEG-01 apontava exatamente a ausência de garantia transacional entre os dois"
  - "Migration escrita à mão: delta de duas instruções, e forçar db diff subiria shadow database em Docker e emitiria privilégio invertido (precedente do 01-04)"
  - "mcp__supabase__apply_migration NÃO foi chamado em momento algum — está pré-aprovado nas permissões mas é proibido por regra do projeto"
  - "docs/PENDENCIAS.md deliberadamente NÃO editado: dono único no gap closure é o plano 01-09, que escreve só depois de reexecutar as provas"

patterns-established:
  - "Prova de que o dashboard não regrediu depois de um DROP POLICY: contar as linhas INATIVAS do próprio tenant visíveis sob role authenticated — é o caso que sustenta reativação e o RETURNING, e o único que a policy removida cobria a mais"
  - "Quando a linha de base do banco tornaria a medição inconclusiva, fabricar o contraste DENTRO da transação revertida em vez de aceitar o veredito fraco"

requirements-completed: [SEG-02, SEG-04]

coverage:
  - id: D1
    description: "As duas policies de SELECT compartilhadas com anon não existem mais no banco em servicos nem em horarios_funcionamento"
    requirement: SEG-02
    verification:
      - kind: integration
        ref: "mcp__supabase__execute_sql sobre pg_policies (schemaname public, as duas tabelas): 8 linhas restantes, TODAS com roles {authenticated}; nenhuma com nome 'Permitir SELECT público para todos'"
        status: pass
    human_judgment: false
  - id: D2
    description: "Leitura cross-tenant por conta autenticada encerrada em servicos: 2 tenants distintos visíveis antes, 1 depois, com o vizinho presente nas DUAS medições"
    requirement: SEG-02
    verification:
      - kind: integration
        ref: "transação revertida: set local role authenticated + claim org_id de tenant real, com tenant vizinho descartável criado na mesma transação — ANTES tenants_distintos_visiveis=2; DEPOIS=1"
        status: pass
    human_judgment: false
  - id: D3
    description: "Leitura cross-tenant encerrada também em horarios_funcionamento"
    requirement: SEG-02
    verification:
      - kind: integration
        ref: "mesmo protocolo sobre horarios_funcionamento: tenants_distintos_visiveis=1, quais_tenants = só o próprio"
        status: pass
    human_judgment: false
  - id: D4
    description: "O dashboard NÃO regrediu: a linha inativa do próprio tenant continua visível sob role authenticated — é o que sustenta reativar um serviço e o RETURNING do .select()"
    verification:
      - kind: integration
        ref: "transação revertida pós-DROP: servicos inativas_do_proprio_tenant_visiveis=1; horarios_funcionamento inativas_do_proprio_tenant_visiveis=2"
        status: pass
    human_judgment: false
  - id: D5
    description: "Armadilha carregada desarmada: não sobrou policy pré-escrita TO anon nessas tabelas para um GRANT futuro destravar"
    requirement: SEG-04
    verification:
      - kind: integration
        ref: "pg_policies pós-DROP: zero linhas com a role anon em servicos e horarios_funcionamento"
        status: pass
    human_judgment: false
  - id: D6
    description: "A migration não contém nenhum privilégio — a default privilege da 20260722060000 continua intacta"
    requirement: SEG-04
    verification:
      - kind: integration
        ref: "grep -v '^--' <migration> | grep -ic 'grant\\|revoke' → 0; service_role em linha executável → 0 (as 2 ocorrências estão em comentário)"
        status: pass
    human_judgment: false
  - id: D7
    description: "Repo e ledger alinhados, com a version do próprio arquivo preservada"
    verification:
      - kind: integration
        ref: "mcp__supabase__list_migrations → 18 versions, a mais nova 20260722145948/fecha_policies_residuais_servicos_horarios; ls supabase/migrations/*.sql | wc -l → 18"
        status: pass
    human_judgment: false
  - id: D8
    description: "Superfície anônima continua fechada depois do DROP e a Definition of Done passa"
    verification:
      - kind: integration
        ref: "bash scripts/verificar-superficie-anon.sh && pnpm lint && pnpm test && pnpm build → exit 0; harness com 11 checagens, 0 reprovadas, 0 inconclusivas; 13 arquivos / 198 testes"
        status: pass
    human_judgment: false
  - id: D9
    description: "Dashboard percorrido por olho humano sob o regime pós-DROP (agenda, serviços incluindo reativação de um inativo, horários de funcionamento)"
    verification: []
    human_judgment: true
    rationale: "A prova SQL mostra que a linha inativa passa no SELECT sob a role authenticated, que é a condição que a policy removida cobria a mais. Ela não prova a tela renderizando — e o Pitfall 3 desta fase é justamente que policy quebrada degrada EM SILÊNCIO. Permanece em docs/PENDENCIAS.md §'UAT humano pendente da Phase 1'."

# Metrics
duration: ~22min
completed: 2026-07-22
status: complete
---

# Phase 01 Plano 08: As policies residuais de `servicos` e `horarios_funcionamento` deixaram de existir — Summary

**Sob a role `authenticated` com o claim de um tenant, a consulta a `servicos` devolvia 2 tenants distintos e agora devolve 1 — com a linha inativa do próprio tenant continuando visível, que é o caso que sustenta reativar um serviço e o `RETURNING`.**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-07-22T14:57:00Z (aprox.)
- **Completed:** 2026-07-22T15:19:00Z (aprox.)
- **Tasks:** 3 de 3
- **Files modified:** 3 (1 criado, 2 modificados)

## Accomplishments

- **O Gap 3 fecha, e fecha medido.** A leitura cross-tenant de catálogo e agenda de funcionamento por qualquer conta Clerk self-service acabou nas duas tabelas. Não foi deduzida da leitura da policy: foi medida antes e depois, com uma sessão autenticada simulada.
- **A armadilha carregada foi desarmada na raiz.** As duas policies traziam a cláusula `TO anon` pré-escrita. Enquanto existissem, um único `GRANT ... TO anon` futuro — inclusive acidental, ou copiado de um snippet — reexporia toda linha com `ativo = true` sem que nenhuma policy nova precisasse ser criada. Agora não sobrou o que o GRANT errado destrave.
- **O risco documentado pelo 01-05 deixou de ser documentado e passou a ser inexistente.** Aquele plano registrou em vez de fechar porque o executor não tinha acesso ao banco; este tinha, e a única coisa que faltava era isso.
- **A suposição A-SEG-01 saiu mais forte do que entrou.** O plano previa DDL e ledger em passos separados, com instrução de PARAR se o segundo falhasse. Os dois foram emitidos numa **única chamada de `execute_sql`**, portanto na mesma transação — a janela de desalinhamento não existiu.

## Task Commits

1. **Task 1 (tracer): Medir a linha de base e escrever a mudança** — `facbbf5` (feat)
2. **Task 2: Aplicar por `execute_sql`, alinhar o ledger e provar por `pg_policies`** — sem artefato de repo. O que esta task produz é **estado no banco** (as duas policies removidas + a linha no ledger); a migration já havia sido commitada na Task 1. Mesmo formato da Task 3 do plano 01-04.
3. **Task 3: Regressão da superfície anônima e Definition of Done** — sem artefato de repo. Verificação pura; `git status --porcelain` ficou vazio.

## Files Created/Modified

- `supabase/migrations/20260722145948_fecha_policies_residuais_servicos_horarios.sql` — **criado.** 62 linhas, das quais **2 executáveis**: um `drop policy if exists` por tabela. O cabeçalho cobre por que a migration existe (o OR permissivo e a armadilha carregada), por que é DROP puro (a `1b` pré-existe), o raio de alcance real (só o dashboard; o caminho público usa service role) e o que explicitamente não é tocado (nenhum privilégio).
- `supabase/schemas/02_servicos.sql` — bloco `1.` substituído por comentário em pt-BR registrando a remoção, a migration responsável, e por que **não há substituta de propósito**.
- `supabase/schemas/03_horarios_funcionamento.sql` — idem. A função `substituir_horarios_funcionamento` não foi tocada (`grep -c` continua em **4**, valor idêntico ao de antes da edição).

## Provas — saída real

### Precondição: MCP responde e o ledger está alinhado

```
mcp__supabase__list_migrations  → 17 versions
ls supabase/migrations/*.sql | wc -l → 17
```

### Medição 1 — `pg_policies` ANTES

```
horarios_funcionamento | Permitir SELECT público para todos            | SELECT | {anon,authenticated} | (ativo = true)
horarios_funcionamento | Permitir SELECT do próprio tenant p/ autent.  | SELECT | {authenticated}      | (tenant_id = (SELECT (auth.jwt() ->> 'org_id')))
servicos               | Permitir SELECT público para todos            | SELECT | {anon,authenticated} | (ativo = true)
servicos               | Permitir SELECT do próprio tenant p/ autent.  | SELECT | {authenticated}      | (tenant_id = (SELECT (auth.jwt() ->> 'org_id')))
```

(10 linhas no total nas duas tabelas, incluindo INSERT/UPDATE/DELETE.)

### Medição 2 — linha de base do banco, e a conferência da fixture do 01-07

```
tenants_com_servico_ativo    | 1
tenants_com_servico_qualquer | 1
linhas_da_fixture_01_07      | 0     ← org_teste_integracao_booking ausente: o teardown do 01-07 rodou
```

**Um tenant só.** Pelo plano, isso tornaria a medição 3 INCONCLUSIVA. Ver "Decisions Made" — em vez de aceitar o veredito fraco, o contraste foi fabricado dentro da transação revertida.

### Medição 3 — ANTES: o dano medido, não deduzido

Transação revertida, tenant vizinho **descartável** criado dentro dela, `set local role authenticated` e claim `org_id` de um tenant **real**:

```
role_efetiva               | authenticated
claim_org_id               | org_3GQ4o…                      (um tenant só)
linhas_visiveis            | 2
tenants_distintos_visiveis | 2                                ← o dano
quais_tenants              | org_3GQ4o… | org_probe_vizinho_0108
```

Rollback conferido logo depois: `perfis_residuais=0`, `servicos_residuais=0`, `tenants_no_banco=1`.

### Aplicação — `execute_sql`, com o ledger na MESMA transação

Uma única chamada, três instruções: os dois `drop policy if exists` mais o `insert` em `supabase_migrations.schema_migrations`. O formato do `name` e do `statements` foi copiado das duas linhas mais recentes do ledger, observadas antes de escrever nele.

**`mcp__supabase__apply_migration` não foi chamado em nenhum momento.** A ferramenta usada foi `mcp__supabase__execute_sql`.

### Conferência do ledger — DEPOIS

```
mcp__supabase__list_migrations  → 18 versions
  … 20260722060000  fecha_data_api_para_anon
      20260722145948  fecha_policies_residuais_servicos_horarios   ← a version do próprio arquivo

ls supabase/migrations/*.sql | wc -l → 18
```

**18 = 18.** Nenhum timestamp que não corresponda a um arquivo do repo.

### Medição 1 — `pg_policies` DEPOIS

8 linhas nas duas tabelas, **todas com roles `{authenticated}`**. Nenhuma linha com o nome da policy removida; a `1b` presente nas duas:

```
horarios_funcionamento | Permitir SELECT do próprio tenant para autenticados | SELECT | {authenticated} | (tenant_id = (SELECT (auth.jwt() ->> 'org_id')))
servicos               | Permitir SELECT do próprio tenant para autenticados | SELECT | {authenticated} | (tenant_id = (SELECT (auth.jwt() ->> 'org_id')))
```

### Medição 3 — DEPOIS, e a prova de que o dashboard não regrediu (mesma transação)

O vizinho descartável foi recriado com serviço **ativo** (se o cross-tenant persistisse, ele apareceria) e um serviço **inativo** do tenant real foi criado junto:

```
role_efetiva                        | authenticated
claim_org_id                        | org_3GQ4o…
linhas_visiveis                     | 2
tenants_distintos_visiveis          | 1     ← era 2. Cross-tenant encerrado.
inativas_do_proprio_tenant_visiveis | 1     ← a 1b cobre o que a compartilhada não cobria
quais_tenants                       | org_3GQ4o…    (só o próprio)
```

Mesmo protocolo em `horarios_funcionamento`:

```
linhas_visiveis                     | 8
tenants_distintos_visiveis          | 1
inativas_do_proprio_tenant_visiveis | 2
quais_tenants                       | org_3GQ4o…
```

Rollback conferido nas duas: zero resíduo, banco de volta a 1 tenant, `servicos_total=1`, `horarios_total=7`.

`mcp__supabase__get_advisors(security)` → `{"lints": []}` — baseline do 01-04 preservado.

### Critérios de aceite da Task 1, por comando

```
policy removida em 02 (esperado 0):                        0
policy removida em 03 (esperado 0):                        0
substituta 1b em 02 (esperado 1):                          1
substituta 1b em 03 (esperado 1):                          1
grant/revoke executável na migration (esperado 0):         0
service_role em linha EXECUTÁVEL (esperado 0):             0   (2 ocorrências, ambas em comentário)
substituir_horarios_funcionamento em 03 (baseline 4):      4
timestamp do arquivo:                           20260722145948
estritamente maior que 20260722060000:                   SIM
```

Corpo executável da migration, na íntegra:

```sql
drop policy if exists "Permitir SELECT público para todos" on public.servicos;
drop policy if exists "Permitir SELECT público para todos" on public.horarios_funcionamento;
```

### Task 3 — regressão da superfície anônima

```
Verificação da superfície anônima da Data API
Escopo: todas as tabelas operacionais

  [ESPERADO]     perfis_empresas — GET ?select=*                        HTTP 401: {"code":"42501",…
  [ESPERADO]     perfis_empresas — GET ?select=tenant_id,telefone_contato HTTP 401: {"code":"42501",…
  [ESPERADO]     agendamentos — POST anônimo                            HTTP 401: {"code":"42501",…
  [ESPERADO]     clientes — POST anônimo                                HTTP 401: {"code":"42501",…
  [ESPERADO]     agendamentos — GET ?select=cliente_id                  HTTP 401: {"code":"42501",…
  [ESPERADO]     excecoes_agenda — GET ?select=motivo                   HTTP 401: {"code":"42501",…
  [ESPERADO]     servicos — GET ?select=tenant_id&limit=1               HTTP 401: {"code":"42501",…
  [ESPERADO]     horarios_funcionamento — GET ?select=tenant_id&limit=1 HTTP 401: {"code":"42501",…
  [ESPERADO]     assinaturas — GET ?select=tenant_id&limit=1            HTTP 401: {"code":"42501",…
  [ESPERADO]     whatsapp_configs — GET ?select=tenant_id&limit=1       HTTP 401: {"code":"42501",…
  [ESPERADO]     disparos_whatsapp — GET ?select=tenant_id&limit=1      HTTP 401: {"code":"42501",…

Resumo: 11 checagem(ns), 0 reprovada(s) — a role anon não devolveu linha nenhuma.
HARNESS_EXIT=0
```

**0 reprovadas e nenhuma seção de INCONCLUSIVAS impressa** — o script só imprime aquele bloco quando `INCONCLUSIVAS > 0`. Idêntico à linha de base do 01-VERIFICATION.

### Definition of Done — encadeada por `&&`, como o critério exige

O `<verify>` foi rodado como um comando só, para que nenhum exit code intermediário fosse descartado:

```
$ bash scripts/verificar-superficie-anon.sh && pnpm lint && pnpm test && pnpm build

Resumo: 11 checagem(ns), 0 reprovada(s) — a role anon não devolveu linha nenhuma.
$ eslint
$ vitest run

 Test Files  13 passed (13)
      Tests  198 passed (198)
   Start at  11:04:53
   Duration  422ms (transform 812ms, setup 0ms, import 1.26s, tests 270ms, environment 1ms)

$ next build
✓ Compiled successfully in 5.1s
✓ Generating static pages using 11 workers (14/14) in 413ms

Route (app)
┌ ƒ /
├ ○ /_not-found
├ ƒ /api/webhooks/lembrete
├ ƒ /book/[slug]
├ ƒ /dashboard
├ ƒ /dashboard/agenda
├ ƒ /dashboard/plano
├ ƒ /dashboard/servicos
├ ƒ /dashboard/whatsapp
├ ● /para/[nicho]
├ ƒ /sign-in/[[...sign-in]]
└ ƒ /sign-up/[[...sign-up]]

ƒ Proxy (Middleware)

VERIFY_TASK3_EXIT=0
```

**13 arquivos / 198 testes — idêntico ao HEAD anterior**, como tinha de ser: este plano não toca `src/`. O `pnpm build` imprime os **3 diagnósticos de Edge Runtime** (`process.exit` e `process.stderr` em `src/lib/env.ts`); é o ruído introduzido e registrado pelo plano 01-06 em `docs/PENDENCIAS.md`, o build sai 0, e não é regressão deste plano.

Hermeticidade confirmada de passagem: `pnpm vitest list | grep -c 'public-booking-escrita'` → **0**. A suíte de integração do 01-07 não foi coletada e nada escreveu no banco enquanto o DDL era aplicado.

### Escopo do diff

```
$ git status --porcelain
(vazio — tudo commitado na Task 1)

$ git diff --stat HEAD~1 HEAD
 ..._fecha_policies_residuais_servicos_horarios.sql | 62 ++++++++++++++++++++++
 supabase/schemas/02_servicos.sql                   | 23 ++++++--
 supabase/schemas/03_horarios_funcionamento.sql     | 24 +++++++--
 3 files changed, 101 insertions(+), 8 deletions(-)
```

Exatamente os três caminhos de `files_modified`, nada mais.

## Decisions Made

- **A medição 3 NÃO foi registrada como INCONCLUSIVA.** O plano autorizava: com um tenant só no banco de dev, contar `distinct tenant_id` antes e depois devolveria 1 nos dois casos, e a prova recairia sobre a ausência da policy em `pg_policies` — evidência boa, mas dedutiva. A Task 2(f) já autorizava criar uma linha inativa dentro da transação revertida quando o tenant não tivesse uma; aplicar o mesmo raciocínio ao **tenant vizinho** transforma o veredito fraco num conclusivo sem persistir nada. O resultado é o contraste que interessa: **2 → 1**, com o vizinho presente nas duas medições. Esta fase inteira gastou dois planos aprendendo que "0 inconclusivas" é a métrica de qualidade da prova (01-04 §"o número que fecha a fase não é o 0 reprovadas"); aceitar uma inconclusiva evitável seria andar para trás.
- **DDL e ledger numa única chamada de `execute_sql`.** O plano os tratava como passos (b) e (c) separados, com instrução explícita de PARAR e escalar se o INSERT falhasse — mitigação escrita porque a suposição A-SEG-01 apontava que **não há garantia transacional entre a aplicação do DDL e a escrita no ledger**. Emitindo os três statements juntos, eles caem na mesma transação e a janela deixa de existir. A conferência por `list_migrations` foi feita mesmo assim, porque é ela que pega o modo de falha do `apply_migration`, não o do INSERT.
- **`DROP` puro, sem substituta, e o motivo escrito em três lugares.** A `1b` (`TO authenticated USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'))`) existe desde a migration `20260709165703` e cobre o próprio tenant inclusive as linhas inativas. A D-07 ("nenhuma policy compartilhada é dropada sem substituta") não se aplica **porque a substituta pré-existe** — não porque a regra tenha sido afrouxada. O raciocínio está no cabeçalho da migration e no comentário dos dois schemas, para que a próxima pessoa que ler o arquivo não reintroduza a policy achando que faltou algo.
- **A prova de não-regressão do dashboard mede a linha INATIVA, e só ela.** Contar linhas ativas não distinguiria nada: elas passavam pelas duas policies. A única coisa que a policy removida cobria e a `1b` precisa continuar cobrindo é o caso do próprio tenant — e o caso que a `1b` cobre **a mais** é a linha inativa, que é o que sustenta reativar um serviço e o que faz o `INSERT/UPDATE … RETURNING` do `.select()` funcionar. Por isso a asserção é sobre `count(*) filter (where not ativo)`.
- **Gate do tracer aplicado por re-execução do `<verify>`, não por checkpoint humano.** O plano declara `autonomous: true`, não contém nenhuma task de checkpoint, e o `<verify>` da Task 1 é um `ls` encadeado a um `grep` — não há nada visual para um humano avaliar. O verify foi re-executado sobre o HEAD commitado antes da Task 2 (exit 0); se tivesse falhado, o plano teria parado ali. Mesmo critério que os planos 01-07 e 01-06 registraram nas waves anteriores desta serialização.
- **`docs/PENDENCIAS.md` NÃO foi editado, de propósito** — ver a seção dedicada abaixo.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Medição 3 fortalecida em vez de declarada INCONCLUSIVA**

- **Found during:** Task 1, medição 2
- **Issue:** o banco de dev tem **um único tenant** com serviço ativo (a fixture do 01-07 já removida). O plano previa esse caso e mandava registrar a medição 3 como INCONCLUSIVA, apoiando a prova na ausência da policy em `pg_policies`. Isso é dedução: `pg_policies` mostra que a policy sumiu, não que a leitura cross-tenant parou.
- **Fix:** um tenant vizinho **descartável** (`org_probe_vizinho_0108`) com um serviço ativo foi criado **dentro da transação revertida**, nas duas medições — antes e depois. O contraste virou **2 → 1** e a prova virou empírica. Nenhuma linha persistiu: rollback conferido por consulta explícita nas duas vezes (`perfis_residuais=0`, `servicos_residuais=0`, `horarios_residuais=0`).
- **Files modified:** nenhum (medição, não código)
- **Verification:** as duas consultas de conferência pós-rollback estão coladas acima; `tenants_no_banco` voltou a 1 e `servicos_total` a 1 nas duas.
- **Committed in:** não aplicável — nenhuma alteração de arquivo

**2. [Rule 2 - Missing Critical] Prova estendida a `horarios_funcionamento`**

- **Found during:** Task 2(e)/(f)
- **Issue:** o plano exige a contagem sob role `authenticated` apenas em `servicos`, mas a migration remove policy em **duas** tabelas e as `truths` do plano falam das duas. Provar uma e assumir a outra é exatamente o modo de falha que a fase combate.
- **Fix:** o mesmo protocolo (vizinho descartável + linha inativa + role local + claim) foi repetido em `horarios_funcionamento`: `tenants_distintos_visiveis=1`, `inativas_do_proprio_tenant_visiveis=2`.
- **Files modified:** nenhum
- **Verification:** saída colada acima; rollback conferido (`horarios_residuais=0`, `horarios_total=7`).
- **Committed in:** não aplicável

**3. [Melhoria de garantia] DDL e ledger na mesma transação**

- **Found during:** Task 2(b)/(c)
- **Issue:** os passos (b) e (c) do plano são chamadas separadas, com a suposição A-SEG-01 reconhecendo que entre elas não há garantia transacional — se a segunda falhasse, o repo ficaria desalinhado.
- **Fix:** os dois `drop policy` e o `insert` no ledger foram emitidos numa única chamada de `execute_sql`, caindo na mesma transação. A conferência obrigatória por `list_migrations` foi feita normalmente depois.
- **Files modified:** nenhum
- **Verification:** `list_migrations` → 18 versions, a mais nova com a version do arquivo; `ls | wc -l` → 18.
- **Committed in:** não aplicável

---

**Total deviations:** 3 (2 missing critical no rigor da prova, 1 melhoria de garantia transacional)
**Impact on plan:** nenhum critério de aceite foi afrouxado — os três desvios ENDURECEM a prova em relação ao que o plano exigia. Nenhum arquivo fora de `files_modified`, nenhuma dependência nova, nenhum privilégio tocado, nenhuma linha persistida no banco além das duas policies removidas e da linha no ledger.

## `docs/PENDENCIAS.md` NÃO foi editado — e por quê

A seção **"Superfície remanescente depois do hardening da Phase 1 (registrado, não fechado)"** está **pronta para ser marcada como fechada**, mas a edição pertence ao plano **01-09**, que é o dono único daquele arquivo no gap closure e só escreve depois de reexecutar as três provas. Escrever aqui adiantaria a conclusão antes do gate — que é precisamente o modo de falha que esta fase existe para combater.

O que o 01-09 precisa para fazer a edição, já apurado:

| Item | Valor |
|---|---|
| Migration aplicada | `supabase/migrations/20260722145948_fecha_policies_residuais_servicos_horarios.sql` |
| Version no ledger | `20260722145948` / `fecha_policies_residuais_servicos_horarios` |
| Evidência de `pg_policies` | 8 linhas nas duas tabelas, **todas** `{authenticated}`; zero com o nome da policy removida |
| Evidência do dano encerrado | `tenants_distintos_visiveis` 2 → 1 sob role `authenticated`, com vizinho descartável presente nas duas medições |
| Evidência de não-regressão | linha **inativa** do próprio tenant visível: 1 em `servicos`, 2 em `horarios_funcionamento` |
| Passo 3 do procedimento | **não seguido de propósito** — o procedimento escrito no 01-05 dizia "gerar por `supabase db diff` e revisar antes de commitar"; a migration foi escrita à mão, como o plano 01-08 determinou e como `docs/03` item (b) recomenda para delta pequeno. Vale corrigir a redação do procedimento junto |

## Issues Encountered

**Nenhum bloqueio.** Dois pontos que exigiram cuidado:

- **A precondição do plano era real e foi conferida antes de criar arquivo.** `list_migrations` respondeu e devolveu 17 versions contra 17 arquivos. Se qualquer um dos dois tivesse falhado, o plano mandava PARAR sem criar nada — porque uma migration escrita e não aplicada deixa 18 arquivos contra 17 versions, que é o desalinhamento que quebra todo `db diff` futuro e o motivo pelo qual o 01-05 registrou em vez de fechar.
- **`grep -c 'service_role'` na migration devolve 2, e isso está correto.** As duas ocorrências estão no cabeçalho, explicando por que `service_role` nunca entra em linha de revoke. A proibição do plano é sobre **linha de revoke**, e a asserção que importa (`grep -v '^--' | grep -ic 'service_role'`) devolve **0**. É o mesmo cuidado que o 01-06 registrou com `vi.mock`/`vi.mocked`: a asserção precisa medir a coisa certa, não a substring conveniente.

## Known Stubs

Nenhum. Nenhum valor vazio codificado, nenhum `TODO`/`FIXME`, nenhum teste pulado, nenhum `<verify>` deixado sem rodar. As duas instruções da migration foram aplicadas contra o banco real e conferidas por `pg_policies`.

## Suposições do probe de edge — estado após este plano

- **[A-SEG-02 — `unclassified`, PARCIALMENTE resolvida]** A enumeração de `tenant_id` **por conta autenticada** está fechada nestas duas tabelas, e agora medida. Continua **não resolvida** para as demais tabelas operacionais, onde `authenticated` mantém privilégio por desenho e a defesa é o RLS tenant-scoped — auditado no 01-04, mas não exaustivamente provado por probe. Nada aqui altera a superfície `anon`, que segue fechada por privilégio (harness exit 0).
- **[A-SEG-04 — `unclassified`, NÃO resolvida]** "Tabela nova nasce fora da Data API" depende do `ALTER DEFAULT PRIVILEGES for role postgres` da `20260722060000`. Esta migration **não contém `grant` nem `revoke`** (grep negativo colado acima), então não pôde revertê-lo. A aresta permanece sinalizada: a prova completa foi feita uma vez, com tabela descartável, no plano 01-04.
- **[A-SEG-01 — `concurrency`, RESOLVIDA para o caso deste plano]** A aresta era a ausência de garantia transacional entre o DDL e a escrita no ledger. Emitindo os três statements numa única chamada de `execute_sql`, eles caem na mesma transação — não há mais janela. Continua não resolvida no sentido geral (concorrência de escrita no booking, escopo de AGE-03 na Phase 2).

## Threat Flags

Nenhuma superfície nova. Este plano fecha `T-01-27` (leitura cross-tenant por conta autenticada — medida antes e depois), `T-01-28` (armadilha carregada: sem policy pré-escrita `TO anon`, não há o que um GRANT futuro destrave) e `T-01-30` (ledger desalinhado — evitado por construção, DDL e INSERT na mesma transação, conferido por `list_migrations`). `T-01-29` (dashboard degradando em silêncio depois do DROP) está mitigado e **provado no lado do banco** — a linha inativa do próprio tenant continua visível —, mas a verificação **na tela** é humana e permanece aberta (item D9 do `coverage`).

`T-01-31` (migration reintroduzindo privilégio) não se materializou: zero `grant`/`revoke` executável, `service_role` fora de qualquer linha executável. `T-01-SC` (supply chain) não se aplica: nenhum install, diff restrito a três arquivos `.sql`.

## User Setup Required

Nenhum. O `user_setup` do plano era autenticar o MCP do Supabase, e ele já estava autenticado — `list_migrations` respondeu na primeira chamada.

## Next Phase Readiness

**Pronto para o plano 01-09**, último da serialização estrita (01-07 → 01-06 → 01-08 → **01-09**).

- **O 01-09 é o dono de `docs/PENDENCIAS.md`** e tem, na tabela acima, tudo o que precisa para marcar a seção como fechada: nome da migration, version no ledger e as três evidências. Inclui uma correção de redação: o passo 3 do procedimento manda gerar por `db diff`, e o caminho correto para um delta de duas instruções é escrever à mão.
- **Banco e ledger em estado limpo:** 18 versions = 18 arquivos, advisors `{"lints": []}`, zero resíduo das transações de prova, `servicos` com 1 tenant e `horarios_funcionamento` com 7 linhas — exatamente como antes deste plano, à exceção das duas policies removidas.
- **`.next/` num estado normal** (o último `pnpm build` da Definition of Done saiu 0) e `git status` limpo.
- **Blocker novo:** nenhum. O que continua aberto é o UAT humano da Phase 1, agora com um item a mais no escopo do dashboard: percorrer serviços e horários sob o regime pós-DROP, incluindo **reativar um serviço inativo** — o caso que a prova SQL cobre no banco e não na tela.

## Self-Check: PASSED

Arquivos declarados, conferidos por existência no disco:

```
FOUND: supabase/migrations/20260722145948_fecha_policies_residuais_servicos_horarios.sql
FOUND: supabase/schemas/02_servicos.sql
FOUND: supabase/schemas/03_horarios_funcionamento.sql
```

Commits declarados, conferidos por `git log`:

```
FOUND: facbbf5   (Task 1 — tracer)
```

`git diff --diff-filter=D --name-only HEAD~1 HEAD` → vazio: nenhuma deleção de arquivo rastreado.

---
*Phase: 01-hardening-da-superf-cie-p-blica*
*Completed: 2026-07-22*
