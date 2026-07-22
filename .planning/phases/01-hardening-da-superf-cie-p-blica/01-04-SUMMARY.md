---
phase: 01-hardening-da-superf-cie-p-blica
plan: 04
subsystem: database
tags: [postgres, grant, revoke, default-privileges, rls, postgrest, supabase, data-api]
status: complete

# Dependency graph
requires:
  - phase: 01-01
    provides: "scripts/verificar-superficie-anon.sh (harness de curl anônimo com três vereditos) + linha de base medida + pipeline de aplicação de DDL no Cloud"
  - phase: 01-02
    provides: "todo o caminho público lendo por createAdminClient() com tenant resolvido por slug — é o que torna o REVOKE seguro por ordem, não por sorte"
provides:
  - "Role anônima sem NENHUM privilégio na Data API — 11/11 checagens em HTTP 401 / 42501, zero inconclusivas"
  - "Default privileges invertidas: tabela nova no schema public nasce fora da Data API para anon E authenticated, com service_role preservado"
  - "Cinco policies compartilhadas SUBSTITUÍDAS por versões tenant-scoped TO authenticated (nenhum DROP sem CREATE)"
  - "docs/03 §'Privilégios da Data API (portão antes do porteiro)' — a regra que a Phase 7 e a Phase 9 vão precisar"
  - "Prova empírica de SEG-04 com tabela descartável (não assumida)"
  - "Método correto de aplicação de migration no Cloud: execute_sql + INSERT manual no ledger (apply_migration está proibido)"
affects: [01-05, phase-07-cobranca, phase-09-asaas, qualquer-fase-que-crie-tabela]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "GRANT é o portão, RLS é o porteiro: fechar no privilégio torna o estado seguro por construção — policy permissiva criada por engano depois não reabre nada"
    - "ALTER DEFAULT PRIVILEGES for role postgres: superfície não cresce por acidente; tabela nova exige GRANT manual deliberado"
    - "Saída de `supabase db diff` é rascunho, não artefato: privilégio mora em migration escrita à mão porque o migra gera o CONTRÁRIO do desejado"
    - "Aplicação de DDL no Cloud por execute_sql + INSERT no ledger com a version do arquivo (apply_migration desalinha)"

key-files:
  created:
    - supabase/migrations/20260722055941_fecha_policies_anon.sql
    - supabase/migrations/20260722060000_fecha_data_api_para_anon.sql
  modified:
    - supabase/schemas/01_perfis_empresas.sql
    - supabase/schemas/04_excecoes_agenda.sql
    - supabase/schemas/06_clientes.sql
    - supabase/schemas/07_agendamentos.sql
    - supabase/schemas/08_assinaturas.sql
    - docs/03-PADROES_DE_BANCO_DE_DADOS.md

key-decisions:
  - "Default privileges revogadas para anon E authenticated (opção mais fechada da D-03): o custo é uma migration manual de GRANT por tabela nova, a partir da Phase 7"
  - "As ~250 linhas de privilégio que o `db diff` emitiu foram PODADAS à mão — aplicá-las teria revogado service_role em todas as tabelas e concedido truncate a anon"
  - "`mcp__supabase__apply_migration` está proibido neste projeto: o método correto é execute_sql + INSERT no ledger com a version do arquivo"
  - "`supabase db diff` roda shadow database em Docker — é a única exceção de container do projeto e exige aprovação prévia"

patterns-established:
  - "Nenhuma policy compartilhada é dropada sem o CREATE ... TO authenticated substituto no MESMO arquivo (D-07) — o sintoma de dropar sem recriar é agenda vazia sem erro"
  - "Prova de default privilege por tabela descartável: criar, medir role_table_grants, curl anônimo, dropar — assunção A4 virou fato"
  - "Veredito INCONCLUSIVO como métrica de qualidade da prova: 5 → 0 é o que distingue 'fechado por privilégio' de 'fechado por a tabela estar vazia'"

requirements-completed: [SEG-01, SEG-02, SEG-03, SEG-04]

coverage:
  - id: D1
    description: "POST anônimo em /rest/v1/agendamentos e /rest/v1/clientes rejeitado por privilégio revogado E policy permissiva substituída"
    requirement: SEG-01
    verification:
      - kind: integration
        ref: "bash scripts/verificar-superficie-anon.sh — POST anônimo em agendamentos e clientes: HTTP 401 / 42501 (baseline era 409/23503, barrado por FK e não pelo portão)"
        status: pass
    human_judgment: false
  - id: D2
    description: "perfis_empresas não enumerável pela chave publicável — nem a lista, nem telefone_contato, nem o org_id do Clerk"
    requirement: SEG-02
    verification:
      - kind: integration
        ref: "scripts/verificar-superficie-anon.sh: perfis_empresas ?select=* e ?select=tenant_id,telefone_contato → HTTP 401 / 42501"
        status: pass
    human_judgment: false
  - id: D3
    description: "agendamentos e excecoes_agenda não devolvem coluna nenhuma para a role anônima — Data API perdida por completo (satisfaz o critério 3 com folga, per D-01)"
    requirement: SEG-03
    verification:
      - kind: integration
        ref: "scripts/verificar-superficie-anon.sh, varredura completa: 11 checagens, 0 reprovadas, 0 inconclusivas, exit 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "Tabela nova no schema public nasce sem acesso via Data API, com service_role preservado — provado empiricamente, não assumido"
    requirement: SEG-04
    verification:
      - kind: integration
        ref: "create table public.teste_superficie → information_schema.role_table_grants devolve APENAS postgres e service_role (zero linhas para anon e authenticated); curl anônimo em /rest/v1/teste_superficie?select=* → HTTP 401 / 42501; drop table ao final"
        status: pass
    human_judgment: false
  - id: D5
    description: "Regra operacional da D-03 escrita onde a Phase 7 (perfis_cobranca) e a Phase 9 (eventos_asaas) vão procurá-la"
    requirement: SEG-04
    verification:
      - kind: manual_procedural
        ref: "docs/03-PADROES_DE_BANCO_DE_DADOS.md §'Privilégios da Data API (portão antes do porteiro)', itens (a) a (e) + checklist de tabela nova"
        status: pass
    human_judgment: false
  - id: D6
    description: "Dashboard coberto por policies tenant-scoped substitutas — nenhuma policy dropada sem substituta, e as escritas com RETURNING continuam enxergando a própria linha"
    verification:
      - kind: integration
        ref: "gates de grep nos cinco schemas: 'TO anon' = 0 em todos; 'TO authenticated' >= 4 em 01/04/06/07; cinco pontos de .insert/.upsert(...).select() conferidos gravando tenant_id = orgId"
        status: pass
      - kind: manual_procedural
        ref: "UAT do dashboard (agenda, agendamento manual, exceção, perfil) — NÃO executado neste plano, escopo do 01-05"
        status: unknown
    human_judgment: true
    rationale: "Pitfall 3: policy tenant-scoped quebrada degrada EM SILÊNCIO — a agenda aparece vazia e nada estoura. Os greps provam que as substitutas existem e que o tenant_id gravado bate com o claim, mas só o percurso humano no dashboard prova que a linha volta do RETURNING em cada uma das quatro telas"
  - id: D7
    description: "Booking público intacto depois do REVOKE total"
    verification:
      - kind: e2e
        ref: "curl /book/avantis → 200 e /book/ozm317u4 → 404 (contrafactual de slug: a inversão delataria a falha da leitura privilegiada)"
        status: pass
      - kind: manual_procedural
        ref: "wizard completo serviço → data/hora → nome+WhatsApp → confirmação → tela de sucesso — NÃO percorrido, escopo do 01-05"
        status: unknown
    human_judgment: true
    rationale: "O contrafactual prova que a leitura do plano seguiu funcionando pelo cliente privilegiado, mas a regressão obrigatória do CONTEXT §specifics é o wizard inteiro — agravada pelo 01-02, que trocou o identificador das duas actions públicas (tenantId → slug)"
  - id: D8
    description: "supabase_migrations.schema_migrations batendo 1:1 com os arquivos do repositório"
    verification:
      - kind: manual_procedural
        ref: "list_migrations = 17 versions; ls supabase/migrations/*.sql | wc -l = 17; três mais novas: 20260722060000/fecha_data_api_para_anon, 20260722055941/fecha_policies_anon, 20260722044858/revoga_anon_assinaturas"
        status: pass
    human_judgment: false

# Metrics
duration: ~35min
completed: 2026-07-22
---

# Phase 01 Plano 04: A role anônima perdeu a Data API inteira — Summary

**As onze checagens anônimas da Data API passaram de "6 reprovadas + 5 inconclusivas" para 11 × `HTTP 401 / 42501 permission denied`: o portão agora está fechado por privilégio, não por a tabela estar vazia — e uma tabela descartável provou que a próxima tabela do projeto já nasce assim, com `service_role` intacto.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 3 de 3
- **Files modified:** 8 (2 criados, 6 modificados)
- **Commits do plano:** 2 de task + 2 de correção de ambiente (incidente do Docker)

## O resultado que importa, e por que a forma dele importa

A varredura completa — `bash scripts/verificar-superficie-anon.sh`, **exit 0** — devolve **11 checagens, 0 reprovadas e 0 INCONCLUSIVAS**, todas em `HTTP 401 / 42501`. Tabelas cobertas: `perfis_empresas` (`select=*` e `select=tenant_id,telefone_contato`), `agendamentos` (GET e POST anônimo), `clientes` (POST anônimo), `excecoes_agenda`, `servicos`, `horarios_funcionamento`, `assinaturas`, `whatsapp_configs`, `disparos_whatsapp`.

O número que fecha a fase não é o `0 reprovadas` — é o **`0 inconclusivas`**. A linha de base do 01-01 tinha cinco checagens que *pareciam* passar: três `200 []` (a role anônima enxergava a tabela; ela é que estava sem linha num banco de dev) e dois `409/23503` (a escrita anônima foi barrada pela *foreign key*, não pelo portão — com um `tenant_id` real teria gravado). Nenhuma delas provava coisa alguma. Agora as onze devolvem negação de privilégio de verdade.

Isso é consequência direta do terceiro veredito que o 01-01 acrescentou ao harness por conta própria. Se a especificação original de dois vereditos tivesse sido mantida, esses cinco casos teriam contado como ESPERADO desde o começo, a diferença entre "fechado por privilégio" e "fechado por coincidência do estado dos dados" seria invisível, e **SEG-01 poderia ter sido declarado fechado sobre uma tabela vazia**.

## Prova empírica de SEG-04 (a que não podia ser pulada)

`create table public.teste_superficie (id int primary key);` e então:

| Medição | Resultado |
|---|---|
| `information_schema.role_table_grants` | grants **apenas** para `postgres` e `service_role` — **zero linhas** para `anon`, **zero** para `authenticated` |
| `curl` anônimo em `/rest/v1/teste_superficie?select=*` | **HTTP 401 / 42501** `permission denied for table teste_superficie` |
| Limpeza | `drop table public.teste_superficie;` |

As duas linhas juntas provam as duas metades da D-03: o `ALTER DEFAULT PRIVILEGES ... FOR ROLE postgres` **pegou** para objetos futuros, e o `service_role` **sobreviveu** — exatamente o item que o snippet oficial da Supabase erra e que já derrubou o acesso via PostgREST neste repositório uma vez (`20260709161817`). A assunção A4 do RESEARCH deixou de ser assunção.

## Task Commits

1. **Task 1: Substituir as policies compartilhadas nos schemas declarativos e gerar a migration por diff** — `18d040c` (feat)
2. **Task 2: Migration manual de privilégios + regra escrita em docs/03** — `f9f3fb4` (feat)
3. **Task 3: Aplicar as duas migrations no Supabase Cloud e provar SEG-01..04 contra o banco vivo** — sem arquivo novo; executada e verificada pelo orquestrador (ver abaixo)

Commits de ambiente, no meio do plano: `41caf76` e `934d2ae` (incidente do Docker, detalhado adiante).

## Files Created/Modified

- `supabase/migrations/20260722055941_fecha_policies_anon.sql` (criado) — gerada por `db diff` e **podada à mão**; DROP + CREATE das cinco policies, com os cinco pontos de escrita com `RETURNING` conferidos no cabeçalho.
- `supabase/migrations/20260722060000_fecha_data_api_para_anon.sql` (criado) — `revoke all` de anon em tabelas e sequences; `alter default privileges for role postgres` revogando anon **e** authenticated em objetos futuros; `grant all` reafirmado para `service_role`. 46 linhas de cabeçalho explicando por que é manual e por que `service_role` nunca entra em revoke.
- `supabase/schemas/01_perfis_empresas.sql`, `04_excecoes_agenda.sql`, `06_clientes.sql`, `07_agendamentos.sql` (modificados) — policy compartilhada substituída por `TO authenticated` tenant-scoped, com `COMMENT ON POLICY` pt-BR. Gates: `TO anon` = **0** nos quatro; `TO authenticated` = **4** nos quatro.
- `supabase/schemas/08_assinaturas.sql` (modificado) — policy pública morta removida (ficou sem efeito quando o 01-01 revogou o privilégio) e o bloco decorativo de privilégio por coluna trocado por um comentário registrando o estado real.
- `docs/03-PADROES_DE_BANCO_DE_DADOS.md` (modificado) — seção nova "🚪 Privilégios da Data API (portão antes do porteiro)", itens (a) a (e) e checklist de tabela nova.

## Task 3 — o que foi rodado contra o banco vivo

Aplicação e verificação executadas pelo orquestrador (o executor não tem acesso a `mcp__supabase__*`).

- **Duas migrations aplicadas** no Supabase Cloud. Ledger com **17 versions**, batendo com `ls supabase/migrations/*.sql | wc -l` = 17. As três mais novas: `20260722060000 / fecha_data_api_para_anon`, `20260722055941 / fecha_policies_anon`, `20260722044858 / revoga_anon_assinaturas`.
- **Superfície anônima:** `bash scripts/verificar-superficie-anon.sh` → **exit 0**, 11 checagens, 0 reprovadas, 0 inconclusivas.
- **SEG-04:** tabela descartável, tabela acima.
- **Regressão do booking:** `/book/avantis` → **200**; `/book/ozm317u4` → **404**. O contrafactual não se inverteu, ou seja, o tenant pago continua sendo resolvido pelo cliente privilegiado depois do REVOKE total.
- **`get_advisors` (security):** `{"lints": []}` — zero findings, baseline preservado.
- **Definition of Done sobre o HEAD atual:** `pnpm lint` exit 0; `pnpm test` **13 arquivos, 196 testes** passando, exit 0; `pnpm build` exit 0.

## 🚨 Regra de pipeline confirmada pela segunda vez: `apply_migration` está proibido

O plano mandava aplicar via `mcp__supabase__apply_migration` com `name` igual ao nome do arquivo, "preservando a version". **Isso não funciona, e o 01-01 já tinha provado.** O `apply_migration` ignora o timestamp do arquivo, carimba uma version própria (o relógio da chamada) e joga o nome inteiro do arquivo no campo `name`. No 01-01 o resultado foi repo em `20260722044858` contra ledger em `20260722051428` — desalinhamento que quebra qualquer `db diff` futuro — e exigiu reparo por DML.

Neste plano o orquestrador usou o **método correto**: `execute_sql` para o DDL, mais um `INSERT` manual em `supabase_migrations.schema_migrations` com a version do próprio arquivo. **Nenhum drift, nenhum reparo.**

Isso agora é regra permanente do pipeline D-06, com duas confirmações independentes em dois planos, e está registrada em três lugares: aqui, no `CLAUDE.md` (§"Infraestrutura: tudo é gerenciado, nada roda local") e na memória durável do projeto.

## Decisões tomadas

- **Default privileges fechadas para as duas roles de API, não só para `anon`** (opção mais restritiva da D-03, escolha do owner). Tabela nova não aparece na Data API para ninguém sem GRANT deliberado. O custo é real e está datado: a primeira migration manual de GRANT chega na Phase 7 (`perfis_cobranca`).
- **`authenticated` mantém os privilégios nas tabelas EXISTENTES.** O dashboard B2B opera via Data API com o JWT do Clerk e o RLS tenant-scoped é a defesa ali, por desenho. A restrição vale só para objetos futuros.
- **A saída do `db diff` é rascunho.** Ver a deviation 1 abaixo — a versão crua da migration teria derrubado o produto inteiro.
- **A policy pública de `assinaturas` foi removida, não substituída.** É a única exceção à D-07 e é deliberada: não existe leitura autenticada dessa tabela que precisasse de substituta; a leitura pública do plano vigente já roda no cliente privilegiado desde o 01-01.

## Deviations from Plan

### Auto-fixed Issues

**1. [Regra 1 - Bug crítico] O `supabase db diff` emitiu ~250 linhas de privilégio que desfariam a `20260709161817`**

- **Encontrado em:** Task 1, ao gerar `20260722055941_fecha_policies_anon.sql`
- **Problema:** o migra compara o banco real com um shadow database construído **só** a partir de `supabase/schemas/`, que não contém `GRANT` nenhum. Como o shadow "não tem" privilégio nenhum, ele conclui que precisa revogar tudo o que existe no banco real: emitiu `revoke ... from service_role` em **todas** as tabelas (quebraria `createAdminClient()` e, com ele, o booking público inteiro), `revoke ... from authenticated` (quebraria o dashboard inteiro) e `grant truncate/references/trigger to anon, authenticated` — ou seja, **abriria** para a role anônima exatamente o que este plano existe para fechar. Aplicar o diff cru teria produzido o Pitfall 4 na mesma migration que deveria preveni-lo.
- **Correção:** todo o bloco de privilégio foi podado à mão; a migration ficou só com os DROP/CREATE de policy. O aviso "⚠️ O QUE FOI REMOVIDO DO DIFF (não reintroduzir)" está escrito no cabeçalho do arquivo, e a regra geral entrou em `docs/03` item (b).
- **Verificação:** `grep -v '^--' <migration> | grep -Ei 'grant|revoke'` → 0 linhas executáveis. Depois de aplicada, `service_role` e `authenticated` seguem com grants no `information_schema.role_table_grants` e o dashboard não perdeu privilégio.
- **Committed in:** `18d040c`
- **Regra que fica:** **saída de `db diff` neste projeto se revisa antes de commitar.** Não é artefato, é rascunho.

### Nota de escopo (não é deviation deste plano)

Os commits `41caf76` e `934d2ae` não têm prefixo `01-04` porque não são código da fase: são a correção do incidente do Docker, descrita abaixo.

---

**Total deviations:** 1 auto-fixed (Regra 1)
**Impact on plan:** a poda impediu que a própria migration de hardening derrubasse o produto. Sem scope creep: nenhuma tabela extra tocada, nenhum privilégio de `authenticated` alterado em tabela existente.

## Issues Encountered

**1. `supabase db diff` subiu Docker e disparou prompt de permissão — a documentação do projeto estava errada**

A Task 1 mandava rodar `supabase db diff` para gerar a migration de policies, e o comando levanta um shadow database em container. Isso tropeçou no classificador de permissões e exigiu intervenção do owner no meio da execução.

A causa não foi julgamento do executor: o `CLAUDE.md` documentava literalmente `supabase stop && supabase db diff` na seção de Comandos — que é o fluxo de *stack local* — e nada avisava que aquilo depende de Docker. O executor seguiu a documentação que existia.

Resolvido pelo orquestrador em `41caf76` e `934d2ae`:

- `docker/evolution/` (stack local obsoleta da Evolution API, que hoje roda na Railway) movida para fora do repositório, para `../obsoleto-docker-evolution/`, levando junto o `.env` não versionado que morava lá dentro
- `.dockerignore` órfão removido — não há Dockerfile neste projeto
- `CLAUDE.md` ganhou a seção **"Infraestrutura: tudo é gerenciado, nada roda local"**, registrando que o shadow database efêmero do `db diff` é a única exceção legítima de Docker e precisa de aprovação prévia
- `docs/06` e `docs/RESET_AMBIENTE_DEV.md` corrigidos

**2. Executor sem `mcp__supabase__*` (herdado do 01-01, e desta vez sem tentativa de contorno)**

Mesma causa apurada no 01-01: o override de `.claude/agents/gsd-executor.md` só vale a partir da próxima sessão. A Task 3 foi executada por hand-off com o orquestrador. Nenhuma tentativa de `psql` pelo pooler e nenhuma leitura de `.env.local` foram feitas.

## Known Stubs

Nenhum. Não há caminho meio-ligado: as policies substitutas existem para todas as escritas do dashboard, e todo o caminho público roda pelo cliente privilegiado desde o 01-02.

## Threat Flags

Nenhuma superfície nova. Este plano fecha `T-01-11` (GRANT remanescente de anon), `T-01-12` (INSERT anônimo direto contornando a Server Action), `T-01-13` (`service_role` perdendo default privileges — mitigado *e provado* na tabela descartável) e `T-01-14` (tabela futura nascendo exposta). `T-01-15` (dashboard degradando em silêncio) está mitigado por construção — cada DROP veio com CREATE substituto — mas sua **verificação** é humana e vai para o 01-05.

## Herança para o plano 01-05

### Já provado — não refazer

| Item | Prova |
|---|---|
| Superfície anônima da Data API fechada | `verificar-superficie-anon.sh` exit 0, 11 checagens, 0 reprovadas, **0 inconclusivas** |
| SEG-04 / assunção A4 | tabela descartável: `role_table_grants` sem as roles de API, com `service_role`; curl 401/42501 |
| Ledger de migrations alinhado | 17 versions = 17 arquivos |
| Advisors de segurança | `{"lints": []}` |
| Leitura do plano vigente pelo cliente privilegiado | contrafactual `/book/avantis` 200 + `/book/ozm317u4` 404 |
| Definition of Done sobre este HEAD | lint exit 0, 196 testes, build exit 0 |

### Continua pendente — é UAT humano, e é o escopo do 01-05

1. **Wizard público completo:** serviço → data/hora → nome + WhatsApp → confirmação → tela de sucesso, com o agendamento caindo na agenda. Regressão obrigatória do CONTEXT §specifics; nunca percorrida à mão nesta fase e **agravada pelo 01-02**, que trocou o identificador recebido pelas duas actions públicas (`tenantId` → `slug`).
2. **Dashboard sob as policies novas — as quatro telas, uma a uma:** agenda carrega os agendamentos do tenant; agendamento manual grava **e a linha volta** (`RETURNING` depende de passar na policy de SELECT); exceção de agenda salva; formulário de perfil salva. É o Pitfall 3 e o motivo de o D6 ser `human_judgment: true`: se uma substituta estiver errada, **a tela aparece vazia e nada estoura**.
3. **Caixa de erro de slots** com a copy nova do 01-02 ("Não foi possível carregar os horários. Tente de novo.") — teste barato: `obterSlotsPublicos('slug-inexistente', …)`.
4. **UAT do lembrete QStash ponta a ponta** e prova empírica do fail-fast de boot (herdados do 01-03).

## Self-Check: PASSED

Arquivos conferidos em disco: `supabase/migrations/20260722055941_fecha_policies_anon.sql`, `supabase/migrations/20260722060000_fecha_data_api_para_anon.sql`, `docs/03-PADROES_DE_BANCO_DE_DADOS.md`, `01-04-SUMMARY.md`.
Commits conferidos no git: `18d040c`, `f9f3fb4`.
Zero deleções de arquivo nos commits do plano (`git diff --diff-filter=D` vazio nos dois).

---
*Phase: 01-hardening-da-superf-cie-p-blica*
*Completed: 2026-07-22*
