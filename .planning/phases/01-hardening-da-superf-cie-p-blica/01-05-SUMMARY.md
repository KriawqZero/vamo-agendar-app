---
phase: 01-hardening-da-superf-cie-p-blica
plan: 05
subsystem: verificacao
tags: [portao-de-saida, verificacao-integrada, fail-fast, boot, uat, handoff, seguranca]
status: complete

# Dependency graph
requires:
  - phase: 01-01
    provides: "scripts/verificar-superficie-anon.sh (harness com três vereditos) + linha de base medida"
  - phase: 01-02
    provides: "caminho público inteiro no cliente privilegiado, contrato por slug, org_id fora do payload"
  - phase: 01-03
    provides: "webhook autenticado por assinatura do QStash + QSTASH_NEXT_SIGNING_KEY na lista de boot"
  - phase: 01-04
    provides: "revoke total de anon na Data API + default privileges invertidas + policies substitutas"
provides:
  - "Prova empírica da assunção A1 — e a refutação da sua forma forte: o boot NÃO morre, o processo sobrevive servindo 500 em toda rota"
  - "Invariante A1 do UI-SPEC reconferida pós-integração no dev server E no build de produção: nenhum org_ do Clerk no payload de /book/[slug]"
  - "Webhook 401 reprovado também contra o BUILD DE PRODUÇÃO (o 01-03 provou contra o dev server)"
  - "docs/PENDENCIAS.md com os handoffs da fase: Pitfall 8, superfície remanescente, correção do WR-02 e checklist de UAT pendente"
  - "Decisão registrada sobre as duas policies residuais de servicos/horarios_funcionamento"
affects: [phase-02-integridade-da-agenda, phase-03-rate-limit, phase-07-cobranca, phase-09-asaas, deploy-de-producao]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fail-fast de env em Next 16 NÃO mata o processo: register() lançando produz 'Failed to prepare server' + unhandledRejection, e o servidor segue escutando e respondendo 500 — healthcheck precisa ser por HTTP, não por liveness de processo"
    - "Contrafactual de env como método: rodar o mesmo build com e sem a variável isola a causa do 500; sem o controle, um 500 poderia ser build quebrado"
    - "Assertiva de vazamento por PADRÃO, não por substring: grep 'org_' falseia em produção por causa da baggage do Sentry (sentry-org_id=N) — o assert correto é o formato do id do Clerk"

key-files:
  created:
    - .planning/phases/01-hardening-da-superf-cie-p-blica/01-05-SUMMARY.md
  modified:
    - docs/PENDENCIAS.md

key-decisions:
  - "As duas policies residuais de servicos/horarios_funcionamento são REGISTRADAS, não fechadas neste plano: o executor não tinha acesso a banco, e migration não aplicada criaria drift 18 arquivos × 17 versions no ledger — trocar risco latente conhecido por drift real no pipeline é mau negócio"
  - "A refutação da A1 NÃO virou mudança de código: alterar a semântica de boot (process.exit(1) no register) é decisão de arquitetura e o plano manda escalar em vez de improvisar"
  - "Critério 5 do ROADMAP considerado satisfeito na substância e registrado como insatisfeito na forma — com as duas camadas de defesa nomeadas e o risco operacional escrito onde o deploy vai procurar"

patterns-established:
  - "Portão de saída não repete prova já rodada no mesmo HEAD: cita a evidência e gasta o orçamento no que ninguém verificou ainda"
  - "UAT não executado se escreve como não executado, com o motivo — 'pendente' honesto é saída válida; passe fabricado não é"

requirements-completed: [SEG-01, SEG-02, SEG-03, SEG-04, SEG-05]

coverage:
  - id: D1
    description: "Critério 1 do ROADMAP — curl anônimo em perfis_empresas não devolve a lista de profissionais, nem telefone_contato, nem o org_id do Clerk"
    requirement: SEG-02
    verification:
      - kind: integration
        ref: "scripts/verificar-superficie-anon.sh (rodado pelo orquestrador neste HEAD): perfis_empresas ?select=* e ?select=tenant_id,telefone_contato → HTTP 401 / 42501"
        status: pass
    human_judgment: false
  - id: D2
    description: "Critério 2 — POST anônimo em agendamentos e clientes rejeitado, e o booking público continua funcionando"
    requirement: SEG-01
    verification:
      - kind: integration
        ref: "harness: POST anônimo nas duas tabelas → 401 / 42501 (a baseline era 409/23503, barrado por FK e não pelo portão)"
        status: pass
      - kind: e2e
        ref: "canário de slug: /book/avantis → 200 e /book/ozm317u4 → 404, no dev server e no build de produção"
        status: pass
      - kind: manual_procedural
        ref: "wizard completo serviço → data/hora → contato → tela de sucesso"
        status: unknown
    human_judgment: true
    rationale: "O 200 e o canário provam que a página resolve o tenant pago pelo cliente privilegiado e que o payload monta com dados reais. O percurso até a tela de sucesso é a regressão obrigatória do CONTEXT §specifics e NÃO foi percorrido — o owner não estava presente e o executor não simula UAT"
  - id: D3
    description: "Critério 3 — curl anônimo em agendamentos e excecoes_agenda não devolve cliente_id nem o texto livre de motivo"
    requirement: SEG-03
    verification:
      - kind: integration
        ref: "harness, varredura completa: 11 checagens, 0 reprovadas, 0 INCONCLUSIVAS, exit 0 — satisfaz o critério com folga (perda total da Data API, per D-01)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Critério 4 — tabela nova no schema public não aparece na Data API sem GRANT explícito"
    requirement: SEG-04
    verification:
      - kind: integration
        ref: "tabela descartável teste_superficie (01-04): role_table_grants só com postgres e service_role, zero linhas para anon e authenticated; curl anônimo → 401 / 42501; drop ao final"
        status: pass
    human_judgment: false
  - id: D5
    description: "Critério 5 — POST sem assinatura válida do QStash rejeitado com 401, inclusive com o secret antigo em query string"
    requirement: SEG-05
    verification:
      - kind: integration
        ref: "contra o BUILD DE PRODUÇÃO (novo neste plano): sem header → 401; ?secret=secret-key → 401; Upstash-Signature forjado → 401; corpo da resposta {\"error\":\"Não autorizado.\"}"
        status: pass
      - kind: integration
        ref: "01-03, contra o dev server: as três acima + POST com o secret REAL na query string → 401 (a prova de que o caminho de query string morreu de fato)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Critério 5, segunda metade — a aplicação não sobe sem as chaves de assinatura configuradas (assunção A1)"
    requirement: SEG-05
    verification:
      - kind: integration
        ref: "next start com QSTASH_NEXT_SIGNING_KEY vazia: mensagem nomeia a variável, TODA rota responde 500, controle com as 14 presentes responde 200 — mas o PROCESSO SOBREVIVE"
        status: partial
    human_judgment: true
    rationale: "A forma forte da A1 é FALSA: o processo não morre. A garantia de segurança se mantém por duas camadas (aplicação não serve nada; verificarAssinaturaQstash lança sem chave), mas o modo de falha é silencioso para orquestrador de deploy. Registrado em docs/PENDENCIAS.md §WR-02; a correção é decisão de arquitetura de boot e não foi improvisada aqui"
  - id: D7
    description: "Invariante A1 do UI-SPEC — o payload RSC de /book/[slug] não contém org_ do Clerk, reconferido pós-integração"
    requirement: SEG-03
    verification:
      - kind: integration
        ref: "dev server: grep -c 'org_' = 0 e grep -c 'tenant_id' = 0 em 119 KB de payload que renderiza o tenant real; build de produção: nenhum token no formato do id do Clerk (único match é a literal 'org_id' da baggage do Sentry)"
        status: pass
    human_judgment: false
  - id: D8
    description: "Handoffs escritos onde a próxima fase vai procurar (Definition of Done, regra 6)"
    verification:
      - kind: integration
        ref: "grep em docs/PENDENCIAS.md: 'assume 30 minutos' + 'booking-engine.ts:303' (:711/:716), tabela das duas policies residuais (:655), 'fechado na Phase 1' em seis pontos"
        status: pass
    human_judgment: false
  - id: D9
    description: "Regressão manual obrigatória do booking e do dashboard (Task 3, checkpoint)"
    verification:
      - kind: manual_procedural
        ref: "checklist completo em docs/PENDENCIAS.md §'UAT humano pendente da Phase 1'"
        status: unknown
    human_judgment: true
    rationale: "NÃO EXECUTADO. O owner não estava presente e instruiu explicitamente que a execução não parasse à espera de aprovação. Verificação visual não pode ser simulada nem inferida de curl — foi registrada como pendência aberta, item a item, com o motivo de cada uma degradar em silêncio"

# Metrics
duration: ~45min
completed: 2026-07-22
---

# Phase 01 Plano 05: Portão de saída — o que ficou provado, o que não ficou, e o que a fase aprendeu

**Os cinco critérios do ROADMAP estão provados por comando contra o sistema vivo, com uma ressalva medida e não maquiada: o critério 5 se cumpre na substância mas não na forma — sem as chaves, a aplicação não serve nada, mas o processo não morre, fica de pé respondendo 500 em toda rota. A regressão visual do booking e do dashboard continua pendente de olho humano e está escrita como pendente, não como aprovada.**

## Performance

- **Duration:** ~45 min
- **Tasks:** 2 de 3 executadas; a Task 3 é checkpoint de UAT humano e foi registrada como pendente (ver abaixo)
- **Files modified:** 1 (`docs/PENDENCIAS.md`, +223/−30)
- **Commits:** 1 de task + 1 de bookkeeping

## 1. O que ficou provado por máquina

Consolidado dos cinco planos, tudo medido contra o HEAD atual. Nenhuma linha aqui é afirmação sem comando rodado — é a exigência literal do `CONTEXT` §specifics: *"afirmação de que fechou sem o `curl` rodado não conta"*.

| Critério do ROADMAP | Evidência | Onde foi provado |
|---|---|---|
| **1.** `perfis_empresas` não enumerável — nem `telefone_contato`, nem o `org_id` do Clerk | `?select=*` e `?select=tenant_id,telefone_contato` → **HTTP 401 / 42501** | harness, 01-04 |
| **2.** POST anônimo em `agendamentos` e `clientes` rejeitado, booking intacto | POST anônimo → **401 / 42501**; canário `/book/avantis` **200** × `/book/ozm317u4` **404** | harness + curl, 01-02/01-04/01-05 |
| **3.** `agendamentos` e `excecoes_agenda` sem `cliente_id` nem `motivo` para anon | Data API perdida por completo (D-01) — **401 / 42501** | harness, 01-04 |
| **4.** Tabela nova nasce fora da Data API | tabela descartável `teste_superficie`: grants **só** para `postgres` e `service_role`, **zero** para `anon` e `authenticated`; curl anônimo **401 / 42501**; `drop` ao final | prova empírica, 01-04 |
| **5.** Webhook rejeita POST sem assinatura | sem header → **401**; `?secret=secret-key` → **401**; `Upstash-Signature` forjado → **401**; **secret REAL em query string → 401** | 01-03 (dev) + **01-05 (build de produção)** |
| **5.** *(segunda metade)* aplicação não sobe sem as chaves | **satisfeito na substância, não na forma** — seção 3 | 01-05 |

**Números que fecham a fase:**

- `bash scripts/verificar-superficie-anon.sh` → **exit 0, 11 checagens, 0 reprovadas, 0 INCONCLUSIVAS**. A linha de base do 01-01, antes das migrations, era **6 reprovadas + 5 inconclusivas**.
- Ledger de migrations: **17 versions = 17 arquivos** em `supabase/migrations/`.
- `mcp__supabase__get_advisors` (security): **`{"lints": []}`** — zero findings.
- Definition of Done sobre este HEAD, com saída real:
  - `pnpm lint` → **exit 0**, nenhuma linha de saída
  - `pnpm test` → **13 arquivos, 196 testes passando**, 377 ms, exit 0
  - `pnpm build` → **exit 0**, 14 rotas geradas, `ƒ /api/webhooks/lembrete` compilada

### Por que o `0 inconclusivas` é o número que importa

Não é o `0 reprovadas`. A linha de base tinha **cinco checagens que *pareciam* passar**: três `200 []` (a role `anon` enxergava a tabela; ela é que estava vazia num banco de dev) e duas `409/23503` (a escrita anônima foi barrada pela *foreign key*, não pelo portão — com um `tenant_id` real teria gravado). Se o harness tivesse ficado com os dois vereditos que a especificação original pedia, esses cinco casos contariam como ESPERADO desde o começo e **SEG-01 poderia ter sido declarado fechado sobre uma tabela vazia**. O terceiro veredito, que o 01-01 acrescentou por conta própria, é o que torna a diferença visível.

### O que este plano acrescentou de novo (não é reexecução)

Três provas que nenhum plano anterior tinha feito:

**a) Payload RSC de `/book/[slug]`, pós-integração.** 119.454 bytes servidos pelo dev server: `grep -c 'org_'` → **0**, `grep -c 'tenant_id'` → **0**, com a página renderizando o tenant real (`nome_estabelecimento` e `duracao_minutos` presentes — o zero não é página vazia).

**b) Webhook contra o build de produção.** O 01-03 provou os 401 contra o dev server. Repetido contra `next start`: as três formas inválidas devolvem **401** com corpo `{"error":"Não autorizado."}` — sem vazar detalhe interno. Slug inexistente → **404**.

**c) Uma armadilha de assertiva, achada e registrada.** O plano prescrevia `curl … | grep -c 'org_'` = 0. **No build de produção esse grep devolve 1** — e é *falso positivo*: a meta tag de baggage do Sentry emite `sentry-org_id=N`. Varredura por token (`grep -oE 'org_[A-Za-z0-9]+'`) devolve só a literal `org_id`, nenhum id do Clerk (formato `org_` + ~27 alfanuméricos). **A assertiva correta é sobre o formato do id, não sobre a substring** — quem repetir o grep cru numa auditoria futura vai abrir incidente à toa.

## 2. O que continua pendente de UAT humano — não executado, e por quê

**Nada abaixo foi verificado. Nada abaixo deve ser lido como aprovado.** O owner não estava presente e instruiu que a execução não parasse à espera de aprovação; a saída correta nessa situação é registrar a pendência, não simular o passe. Verificação visual não se infere de código HTTP.

O checklist completo, item a item, foi escrito em `docs/PENDENCIAS.md` §"🧪 UAT humano pendente da Phase 1". Resumo:

| Item | Estado | Por que só olho humano pega |
|---|---|---|
| Wizard completo de `/book/[slug]` até "Horário confirmado!" | **não executado** | agravado pelo 01-02, que trocou o identificador das duas actions públicas (`tenantId` → `slug`); automação só prova que a página monta |
| Recuperação de double-booking (duas abas no mesmo slot) | **não executado** | o comportamento certo é voltar à etapa de data/hora com aviso âmbar, não caixa vermelha estática |
| Dashboard sob as policies novas (agenda, agendamento manual, exceção, perfil, serviços) | **não executado** | Pitfall 3: policy substituta errada deixa a **tela vazia sem estourar erro** |
| Personalização por plano (Pro × gratuito) | **não executado** | com o RLS bypassado, a sanitização virou **defesa única** — regressão silenciosa nas duas pontas |
| Lembrete do QStash ponta a ponta | **não executado** | mensageria falha em silêncio por design; um 401 legítimo por mismatch de URL não gera reclamação, gera lembrete que não chega |
| Caixa de erro de slots com a copy do 01-02 | **não executado** | a copy está em `public-booking.ts:373` e compila; nunca foi vista na tela |
| Backstops visuais UI#6/13/17/22/24/31 | **não executado** | exigem dado extremo (20+ serviços, horizonte 30 dias, textos longos) |

**Atenuante medido, que não substitui a verificação:** o dashboard foi auditado via `pg_policies` — toda tabela operacional tem SELECT/INSERT/UPDATE/DELETE `TO authenticated` com `tenant_id = (SELECT auth.jwt() ->> 'org_id')`, e o SELECT de `agendamentos` está presente e correto. Isso torna o modo de falha "agenda silenciosamente vazia" **improvável**. Improvável não é verificado.

## 3. 🔬 A assunção A1 é falsa na forma forte — e o modo de falha real é pior de detectar

Esta é a descoberta do plano, e ela contradiz o que estava escrito em dois lugares do projeto.

O `RESEARCH` marcou como confiança **MÉDIA** que um `throw` dentro de `register()` derruba o boot, e mandou verificar empiricamente. `docs/PENDENCIAS.md` §WR-02 afirmava que o produto "cai em crash loop". Medido contra o build de produção (`next start`, Next 16.2.10), com apenas `QSTASH_NEXT_SIGNING_KEY` ausente:

```
✓ Ready in 87ms
Failed to prepare server Error: An error occurred while loading instrumentation hook:
Variáveis obrigatórias ausentes em produção: QSTASH_NEXT_SIGNING_KEY
⨯ unhandledRejection: ...
```

| Medição | Resultado |
|---|---|
| Mensagem nomeia a variável | ✅ literalmente `QSTASH_NEXT_SIGNING_KEY`, e só ela no teste isolado |
| Processo morre | ❌ **não** — segue vivo e **escutando na porta** |
| `/` | **500** |
| `/book/avantis` | **500** |
| `/api/webhooks/lembrete` | **500** |
| Controle: mesmo build com as quatorze presentes | `/` **200**, `/book/avantis` **200** |

O controle é o que fecha o raciocínio: sem ele, um 500 poderia ser build quebrado. Com ele, o 500 é atribuível à variável ausente e a nada mais.

**Por que isso é pior que um crash loop, e não uma tecnicalidade:** crash loop é *ruidoso* — o Railway marca o deploy como falho e faz rollback. Um processo vivo servindo 500 é *silencioso*: healthcheck baseado em "o processo está de pé" reporta saudável, o deploy é dado como bem-sucedido, e o produto fica no ar com 100% de erro. É o mesmo padrão de degradação silenciosa que esta fase inteira combateu no banco, agora na camada de deploy.

**O critério 5 continua satisfeito na substância, por duas camadas independentes:**

1. A aplicação não serve nada sem as chaves — o webhook responde 500 e **nunca alcança o handler**.
2. `verificarAssinaturaQstash` (`src/lib/qstash-assinatura.ts:42`) **lança** se qualquer das duas chaves estiver ausente. Não existe caminho permissivo, mesmo que a camada 1 fosse contornada. É exatamente a "guarda adicional" que a mitigação da A1 pedia — e ela já existia, entregue pelo 01-03.

**O que NÃO foi feito, deliberadamente:** mudar a semântica de boot (`process.exit(1)` depois do throw) é decisão de arquitetura, e o plano manda **escalar em vez de improvisar** quando a A1 falha. Registrado em `docs/PENDENCIAS.md` §WR-02 com as duas saídas: exigir healthcheck **por HTTP** no deploy (path que precise devolver 2xx), ou fazer o processo morrer de verdade. Decisão do owner.

## 4. As duas policies residuais — o que são, e a decisão tomada

Auditoria de `pg_policies` depois do 01-04 encontrou duas policies de SELECT ainda compartilhadas com a role `anon`:

| Tabela | Policy | Cmd | Roles | Expressão |
|---|---|---|---|---|
| `servicos` | "Permitir SELECT público para todos" | SELECT | `{anon,authenticated}` | `(ativo = true)` |
| `horarios_funcionamento` | "Permitir SELECT público para todos" | SELECT | `{anon,authenticated}` | `(ativo = true)` |

**Estavam legitimamente fora do escopo do 01-04.** Aquele plano executava a D-07 — substituir as policies compartilhadas que **não tinham par autenticado**, porque dropar sem recriar quebraria o dashboard em silêncio. Estas duas **têm** par autenticado (a policy `1b`), então não entravam naquele recorte.

**Dois riscos, um de cada horizonte:**

1. **Vale hoje:** a expressão é `ativo = true`, sem cláusula de tenant. Qualquer profissional logado lê os serviços e horários ativos de **todos os outros tenants**. Não expõe cliente, agendamento nem telefone — expõe catálogo e agenda de funcionamento da concorrência. É **pré-existente**; a Phase 1 não introduziu nem agravou.
2. **Vale no futuro, e é a parte incômoda:** para `anon` estas policies são inertes *hoje* apenas porque sem privilégio uma policy nunca é avaliada. Mas o cabeçalho da própria migration `20260722060000_fecha_data_api_para_anon.sql` argumenta que o portão precisa ser fechado no privilégio porque *"uma policy criada por engano em qualquer fase futura reabre tudo"*. **Aqui a policy já existe, pré-carregada.** Um único `GRANT ... TO anon` futuro — inclusive acidental, ou copiado de um snippet — reexpõe toda linha com `ativo = true` a quem tiver a chave publicável. **Nenhuma policy nova precisa ser escrita para o buraco reabrir.**

### Decisão: registrar, não fechar aqui — e o trade-off explícito

O fechamento é trivial em SQL. O que não é trivial é aplicá-lo: **o executor deste plano não teve acesso ao banco** (sem MCP do Supabase, sem `psql`). Escrever a migration sem poder aplicá-la deixaria o repositório com **18 arquivos contra 17 versions no ledger** — exatamente o desalinhamento que quebra qualquer `db diff` futuro, e que esta fase gastou dois planos aprendendo a evitar. **Trocar um risco latente, conhecido e documentado por drift real e imediato no pipeline é mau negócio**, ainda mais no plano cujo trabalho é fechar a fase.

Registrado em `docs/PENDENCIAS.md` §"Superfície remanescente depois do hardening da Phase 1", com o gatilho e o procedimento de fechamento.

**Achado adicional, que simplifica o conserto:** a D-07 **não se aplica** a estas duas. A substituta já existe — policy `1b`, "Permitir SELECT do próprio tenant para autenticados", `TO authenticated USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'))`, em `supabase/schemas/02_servicos.sql:27` e `03_horarios_funcionamento.sql:29`, cobrindo as linhas do próprio tenant **inclusive as inativas** (é o que permite reativar um serviço e o que faz o `RETURNING` funcionar). Policies são permissivas e se somam por `OR`: removendo a compartilhada, sobra exatamente o escopo desejado. O conserto é **`DROP` puro, sem `CREATE` substituto** — escrever uma seria redundância. Isso está no PENDENCIAS para que ninguém reabra a discussão da D-07 na próxima sessão.

## 5. Regras de pipeline aprendidas na fase (a saída durável além do fix de segurança)

Quatro, todas com custo já pago:

1. **`mcp__supabase__apply_migration` está proibido neste projeto.** Não preserva a version do arquivo: carimba o relógio da chamada e joga o nome inteiro do arquivo no campo `name`. Confirmado de forma independente em **dois planos** (01-01, que precisou reparar por DML, e 01-04, que já usou o método correto). **Método correto:** `execute_sql` para o DDL + `INSERT` manual em `supabase_migrations.schema_migrations` com a version do próprio arquivo. Já escrito no `CLAUDE.md`.

2. **Saída de `supabase db diff` é rascunho, não artefato — revisar antes de commitar.** No 01-04 o migra emitiu **~250 linhas de privilégio** que reverteriam a `20260709161817`: `revoke ... from service_role` em todas as tabelas (derrubaria `createAdminClient()` e, com ele, o booking público inteiro), `revoke ... from authenticated` (derrubaria o dashboard) e `grant truncate/references/trigger to anon` — **abriria** exatamente o que a migration existia para fechar. Causa: o shadow database é construído só de `supabase/schemas/`, que não contém `GRANT` nenhum, então o migra conclui que precisa revogar tudo que existe no banco real. Privilégio mora em migration escrita à mão.

3. **O harness tem três vereditos, e o terceiro é o que dá valor à prova.** `INCONCLUSIVO` existe porque `200 []` (tabela vazia) e `409/23503` (rejeição por FK) **não provam portão fechado**. A métrica de sucesso real é **zero inconclusivas**, não zero reprovadas.

4. **Docker:** `docker/evolution/` saiu do repositório para `../obsoleto-docker-evolution/` e o `.dockerignore` órfão foi removido (`41caf76`, `934d2ae`). O shadow database efêmero do `db diff` é a única utilização legítima de Docker no projeto, e exige aprovação prévia.

## Task Commits

1. **Task 1: Verificação integrada — os cinco critérios contra o sistema vivo** — sem arquivo modificado (execução de provas); evidência registrada neste SUMMARY
2. **Task 2: Registrar handoffs e observações em `docs/PENDENCIAS.md`** — `69a0696` (docs)
3. **Task 3: Checkpoint de regressão manual** — **não executado**, registrado como pendência (seção 2)

## Files Created/Modified

- `docs/PENDENCIAS.md` (+223/−30) — cinco blocos: (a) hardening da Data API marcado como fechado na Phase 1, com a prova e o motivo de a direção "GRANT por coluna" ter sido descartada pela D-01; (b) handoff da Phase 2 sobre o repro do "assume 30 minutos"; (c) seção nova sobre a superfície remanescente; (d) correção medida do WR-02 sobre o boot; (e) checklist de UAT humano pendente.

## Deviations from Plan

### Registradas, não auto-corrigidas

**1. [Regra 4 — decisão de arquitetura] A assunção A1 é falsa e o plano manda escalar**

- **Encontrado em:** Task 1, item 4
- **Problema:** o plano instruía "se o processo SOBREVIVER (A1 falsa), PARAR e registrar: a fase não fecha o critério 5 sem guarda adicional — escalar em vez de improvisar". O processo sobrevive.
- **O que foi feito:** apurado o comportamento exato com teste isolado + controle; verificado que **a guarda adicional pedida pela mitigação já existe** (`verificarAssinaturaQstash` lança sem chave, entregue pelo 01-03), portanto o critério 5 não fica sem defesa; registrada a diferença entre substância e forma, e o risco operacional, em `docs/PENDENCIAS.md` §WR-02.
- **O que NÃO foi feito:** nenhuma mudança de código no caminho de boot. Escalar era a instrução; com o owner ausente, escalar significa **escrever onde o deploy vai ler**, não improvisar `process.exit(1)` num plano de verificação.

**2. [Escopo] As duas policies residuais não foram fechadas**

Ver seção 4 — decisão registrada com o trade-off (drift no ledger × risco latente documentado).

**3. [Ambiente] A Task 3 é checkpoint e não houve a quem perguntar**

O plano marca `autonomous: false` e a Task 3 é `checkpoint:human-verify` com gate `blocking`. O owner instruiu explicitamente que a execução não parasse. Resolvido registrando o checklist inteiro como pendência aberta, com o motivo de cada item degradar em silêncio — em vez de aprovar por conta própria ou travar a fase indefinidamente.

### Correção de documentação encontrada de passagem

`docs/PENDENCIAS.md` §WR-02 afirmava crash loop; a medição contradiz. Corrigido no mesmo commit, com o log real citado. Não é scope creep: a afirmação errada mora exatamente no item que governa o próximo deploy de produção.

## Prohibitions respeitadas

- **Não consertar de passagem o bug do "assume 30 minutos"** (`booking-engine.ts:303`). Nenhuma linha de `src/` foi tocada por este plano — `git diff` do commit toca só `docs/PENDENCIAS.md`. O handoff foi **escrito**, não implementado, exatamente como a Deferred Idea do CONTEXT pede.

## Known Stubs

Nenhum. Este plano não escreveu código.

## Threat Flags

Nenhuma superfície nova. Estado do registro do plano:

| Threat | Estado |
|---|---|
| `T-01-16` (lembrete rejeitado por mismatch de URL atrás de proxy) | **não verificado** — depende do UAT ponta a ponta; sintoma e plano B documentados |
| `T-01-17` (personalização paga vazando para tenant gratuito) | **não verificado** — depende do UAT comparando Pro × gratuito |
| `T-01-18` (dashboard degradando em silêncio) | **mitigado por construção**, confirmado por auditoria de `pg_policies`; verificação visual **não executada** |

Ameaça registrada de novo, fora do STRIDE original: **deploy de produção sem env obrigatória sobe um processo vivo servindo 500**, indistinguível de saudável para healthcheck por liveness. Ver seção 3.

## Pendências deixadas por este plano

1. **O UAT humano inteiro** (seção 2) — sete itens, escritos em `docs/PENDENCIAS.md`.
2. **As duas policies residuais** (seção 4) — gatilho e procedimento escritos.
3. **Decisão sobre a semântica de boot** (seção 3) — healthcheck por HTTP ou falha dura.
4. **`?secret=` na URL de publicação do QStash** — Deferred do CONTEXT, reavaliar quando a fila drenar (14 dias a partir de 2026-07-22). Conferido que consta; não duplicado.

## Next Phase Readiness

A **Phase 2** herda:

- Superfície anônima fechada e provada — o INSERT `anon` direto que contornava a Server Action **não existe mais**, o que muda o desenho do rate limit da Phase 3 (deixa de ser teatro) e o da proteção atômica de double-booking (a corrida que resta é entre duas chamadas legítimas da action).
- **O repro do "assume 30 minutos" mudou de lugar** — ponteiro correto `booking-engine.ts:303`, e o fallback **não dispara mais pelo caminho público** porque o service role bypassa o RLS que escondia o serviço desativado. AGE-01/AGE-02 continuam necessários; o teste da Phase 2 **não pode** depender do sintoma antigo no fluxo público.
- As quatro regras de pipeline da seção 5.
- Uma dívida de UAT que não é da Phase 2, mas que a antecede: se o wizard estiver quebrado, a Phase 2 vai depurar em cima de terreno não verificado.

## Self-Check: PASSED

- `docs/PENDENCIAS.md` — FOUND (modificado, commitado)
- `.planning/phases/01-hardening-da-superf-cie-p-blica/01-05-SUMMARY.md` — FOUND
- Commit `69a0696` — presente em `git log`
- `git diff --diff-filter=D HEAD~1 HEAD` → vazio (nenhuma deleção de arquivo)
- `pnpm lint` exit 0 / `pnpm test` 13 arquivos, 196 testes / `pnpm build` exit 0 — os três rodados neste plano com saída real

---
*Phase: 01-hardening-da-superficie-publica*
*Completed: 2026-07-22*
