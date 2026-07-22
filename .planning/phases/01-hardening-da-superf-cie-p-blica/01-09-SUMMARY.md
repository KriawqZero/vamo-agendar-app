---
phase: 01-hardening-da-superf-cie-p-blica
plan: 09
subsystem: documentacao
tags: [gap-closure, seg-05, requirements, roadmap, pendencias, uat, hermeticidade]

# Dependency graph
requires:
    - phase: 01-hardening-da-superf-cie-p-blica (plano 01-06)
      provides: 'scripts/verificar-fail-fast-boot.sh com os quatro vereditos — a prova que autoriza corrigir a redação de SEG-05 e do critério 5'
    - phase: 01-hardening-da-superf-cie-p-blica (plano 01-07)
      provides: 'pnpm test:integracao — a prova do caminho de escrita, e o exclude condicional que mantém pnpm test hermético'
    - phase: 01-hardening-da-superf-cie-p-blica (plano 01-08)
      provides: 'A migration de policies residuais, a version no ledger e as evidências que o registro de fechamento nomeia'
provides:
    - 'Documentação da Phase 1 coerente com o que a máquina mede: SEG-05 completo, critério 5 com o comando que o prova'
    - 'Registro de fechamento das duas policies residuais, com migration, version e três evidências'
    - 'Regra viva de hermeticidade do pnpm test, escrita onde alguém tropeça nela'
    - 'Sete itens de UAT humano abertos e mais precisos — três com o que a automação NÃO cobre dito em primeiro lugar'
affects: [phase-02-agenda, deploy-de-producao, qualquer-fase-que-rode-a-definition-of-done]

# Tech tracking
tech-stack:
    added: []
    patterns:
        - 'Gate de reexecução: nenhum documento é editado antes de as provas passarem sobre o HEAD final'
        - 'Correção de requisito preserva uma frase registrando que o critério foi medido como falso e por qual plano foi fechado'
        - 'Item parcialmente coberto diz, em PRIMEIRO lugar, o que a automação não cobre'

key-files:
    created:
        - .planning/phases/01-hardening-da-superf-cie-p-blica/01-09-SUMMARY.md
    modified:
        - .planning/REQUIREMENTS.md
        - .planning/ROADMAP.md
        - docs/09-OBSERVABILIDADE_E_EMAIL.md
        - docs/PENDENCIAS.md

key-decisions:
    - 'A Task 1 foi tratada como gate absoluto: as quatro provas rodaram antes de qualquer Edit, e o primeiro commit de documentação só existiu depois dos quatro exit 0'
    - 'O veredito WEBHOOK foi consumido do harness do 01-06, sem redigitar nenhuma sonda de curl — a propriedade é daquele plano'
    - 'O item WR-02 já estava correto (o 01-06 o atualizou): reconferido e mantido em vez de reescrito por obrigação de plano'
    - 'Dois blocos fora do texto literal do plano foram corrigidos porque descreviam como aberto o que o 01-08 fechou, ou afirmavam algo falso sobre o repo — deixá-los seria o defeito que este plano existe para combater'
    - 'Nenhum dos sete itens de UAT foi marcado; a contagem 7 abertas / 0 marcadas foi conferida antes e depois do hook de prettier'

patterns-established:
    - 'Documento de pendências registra fechamento com tabela de evidências, preservando a análise que justificou a mudança para que ninguém a reverta por engano'
    - 'Regra de infraestrutura de teste mora no documento que o próximo desenvolvedor lê, não no SUMMARY de um plano'

requirements-completed: [SEG-01, SEG-02, SEG-03, SEG-04, SEG-05]

coverage:
    - id: D1
      description: 'A superfície anônima continua fechada no HEAD final: 11 checagens, 0 reprovadas, 0 inconclusivas'
      requirement: SEG-01
      verification:
          - kind: integration
            ref: 'bash scripts/verificar-superficie-anon.sh → exit 0'
            status: pass
      human_judgment: false
    - id: D2
      description: 'O boot de produção encerra sem a chave obrigatória e o webhook segue fechado — quatro vereditos aprovados'
      requirement: SEG-05
      verification:
          - kind: integration
            ref: 'bash scripts/verificar-fail-fast-boot.sh → exit 0 (BUILD, MORTE, CONTROLE, WEBHOOK 401/401/401/200)'
            status: pass
      human_judgment: false
    - id: D3
      description: 'O caminho de escrita do booking público funciona sob as policies pós-Phase 1, sem nenhum caso pulado'
      requirement: SEG-01
      verification:
          - kind: integration
            ref: 'pnpm test:integracao → exit 0, 6 testes passando, 0 skipped'
            status: pass
      human_judgment: false
    - id: D4
      description: 'Definition of Done do projeto verde no HEAD final, com pnpm test hermético em 13 arquivos / 198 testes'
      verification:
          - kind: integration
            ref: 'pnpm lint / pnpm test / pnpm build → exit 0; EXIGIR_INTEGRACAO= pnpm vitest list | grep -c public-booking-escrita → 0'
            status: pass
      human_judgment: false
    - id: D5
      description: 'REQUIREMENTS.md descreve SEG-05 como completo e a rastreabilidade não tem nenhuma linha Partial'
      requirement: SEG-05
      verification:
          - kind: static
            ref: 'grep -c "^- \[x\] \*\*SEG-05" → 1; grep -c "Partial" → 0; grep -c "| Complete |" → 5'
            status: pass
      human_judgment: false
    - id: D6
      description: 'ROADMAP e docs/09 nomeiam o harness que prova o critério 5, com o diff restrito à Phase 1'
      requirement: SEG-05
      verification:
          - kind: static
            ref: 'grep -c verificar-fail-fast-boot em ROADMAP.md → 1 e em docs/09 → 1; git diff mostra 3 linhas acrescentadas em Notas de execução da Phase 1'
            status: pass
      human_judgment: false
    - id: D7
      description: 'docs/PENDENCIAS.md registra o fechamento das policies residuais e mantém os sete itens de UAT abertos'
      requirement: SEG-02
      verification:
          - kind: static
            ref: 'grep -c fecha_policies_residuais → 3; grep -c "^- \[ \]" → 7; grep -ci "^- \[x\]" → 0 (conferido antes e depois do hook de prettier)'
            status: pass
      human_judgment: false
    - id: D8
      description: 'A hermeticidade do pnpm test está escrita como regra viva, com o ponto de entrada e a consequência de reincluir a suíte'
      verification:
          - kind: static
            ref: 'grep -c "test:integracao" docs/PENDENCIAS.md → 3; grep -c EXIGIR_INTEGRACAO → 2'
            status: pass
      human_judgment: false
    - id: D9
      description: 'Os sete itens de UAT humano executados no navegador pelo owner'
      verification: []
      human_judgment: true
      rationale: 'Nenhum executor pode fechá-los — verificação visual não se infere de código HTTP nem de teste de integração. Permanecem em docs/PENDENCIAS.md §"UAT humano pendente da Phase 1", agora com o que a automação não cobre dito em primeiro lugar.'

# Metrics
duration: ~35min
completed: 2026-07-22
status: complete
---

# Phase 01 Plan 09: Gate de reexecução e reparo da documentação Summary

**As quatro provas da fase rodaram sobre o HEAD final e passaram juntas; só então quatro documentos foram corrigidos para dizer o que a máquina mede — com os sete itens de UAT humano continuando abertos, e três deles agora dizendo em primeiro lugar o que a automação não cobre.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-07-22
- **Tasks:** 3
- **Files modified:** 4 documentos (nenhum arquivo em `src/`, `supabase/` ou `scripts/`)

## Accomplishments

- **A ordem foi respeitada, e é o valor do plano.** Nenhum `Edit` aconteceu antes das quatro provas saírem exit 0. O primeiro commit de documentação (`c8aa343`) é posterior às quatro execuções coladas abaixo.
- **Os três gaps da `01-VERIFICATION.md` estão fechados por código e agora refletidos na documentação.** `REQUIREMENTS.md` deixou de descrever SEG-05 como parcialmente falso, `ROADMAP.md` nomeia o comando que prova o critério 5, `docs/09` descreve o fail-fast como encerramento real, e `docs/PENDENCIAS.md` registra o fechamento das duas policies residuais.
- **O veredito `WEBHOOK` foi consumido, não redigitado.** As quatro sondas HTTP entraram por um exit code só, como o 01-06 determinou. Nenhuma linha de `curl` foi escrita neste plano.
- **A lista do que falta ficou mais precisa em vez de mais curta.** Os sete itens de UAT continuam abertos; três ganharam a frase que começa pelo que a automação **não** cobre; o do dashboard virou "reforçado, não coberto"; e uma nota no topo impede ler "parcialmente coberto" como "pode pular".

## Task Commits

1. **Task 1: Gate — reexecutar as três provas sobre o HEAD final** — sem artefato de repo. O que a task produz é **medição**; as quatro saídas estão coladas abaixo.
2. **Task 2: Reparar REQUIREMENTS, ROADMAP e docs/09** — `c8aa343` (docs)
3. **Task 3: Fechar em docs/PENDENCIAS.md o que fechou e escrever com precisão o que continua aberto** — `27649bf` (docs)

## Task 1 — as quatro provas, saída real

### Prova 1: `bash scripts/verificar-superficie-anon.sh`

```
Verificação da superfície anônima da Data API
Alvo: https://cimeiteyueeolwmlouxi.supabase.co
Escopo: todas as tabelas operacionais

  [ESPERADO]     perfis_empresas — GET ?select=*                       HTTP 401: {"code":"42501",…
  [ESPERADO]     perfis_empresas — GET ?select=tenant_id,telefone_contato HTTP 401: {"code":"42501",…
  [ESPERADO]     agendamentos — POST anônimo                          HTTP 401: {"code":"42501",…
  [ESPERADO]     clientes — POST anônimo                              HTTP 401: {"code":"42501",…
  [ESPERADO]     agendamentos — GET ?select=cliente_id                 HTTP 401: {"code":"42501",…
  [ESPERADO]     excecoes_agenda — GET ?select=motivo                  HTTP 401: {"code":"42501",…
  [ESPERADO]     servicos — GET ?select=tenant_id&limit=1              HTTP 401: {"code":"42501",…
  [ESPERADO]     horarios_funcionamento — GET ?select=tenant_id&limit=1 HTTP 401: {"code":"42501",…
  [ESPERADO]     assinaturas — GET ?select=tenant_id&limit=1           HTTP 401: {"code":"42501",…
  [ESPERADO]     whatsapp_configs — GET ?select=tenant_id&limit=1      HTTP 401: {"code":"42501",…
  [ESPERADO]     disparos_whatsapp — GET ?select=tenant_id&limit=1     HTTP 401: {"code":"42501",…

Resumo: 11 checagem(ns), 0 reprovada(s) — a role anon não devolveu linha nenhuma.
HARNESS_ANON_EXIT=0
```

**11 checagens — idêntico à linha de base da `01-VERIFICATION.md`.** Nenhuma diferença de contagem para apontar. **Zero reprovadas e nenhuma seção de INCONCLUSIVAS impressa** — o script só imprime aquele bloco quando há inconclusiva, e é essa a métrica que importa.

### Prova 2: `bash scripts/verificar-fail-fast-boot.sh`

```
Verificação do fail-fast de boot em produção
Variável alvo: QSTASH_NEXT_SIGNING_KEY   |   Porta: 3991

  … rodando pnpm build com QSTASH_NEXT_SIGNING_KEY vazia (pode levar ~1 min)
  [APROVADO]  BUILD      pnpm build saiu 0 com QSTASH_NEXT_SIGNING_KEY vazia
  [APROVADO]  MORTE      o processo do next encerrou com código 1, nomeou QSTASH_NEXT_SIGNING_KEY em stderr e a porta recusou conexão (curl 7)
  [APROVADO]  CONTROLE   com as quatorze presentes, GET / devolveu 200 e o processo seguiu vivo
  [APROVADO]  WEBHOOK    sem assinatura 401 | secret em query 401 | assinatura forjada 401 | GET / 200

Resumo: 4 vereditos, 0 reprovados — o boot morre de verdade e o webhook segue fechado.
HARNESS_BOOT_EXIT=0
```

**Os quatro vereditos aprovados, nomeados na saída.** Do veredito `WEBHOOK`, os quatro códigos exigidos pelo critério de aceite: **401** (sem cabeçalho de assinatura), **401** (secret legado em query string), **401** (assinatura forjada) e **200** (controle `GET /`). O harness recebido do 01-06 emitiu o veredito, então não houve motivo para parar nem para reimplementar sonda nenhuma.

### Prova 3: `pnpm test:integracao`

```
 ✓ … > sentinela da suíte de integração > reprova (em vez de pular) quando EXIGIR_INTEGRACAO=1 e não há credenciais 1ms
 ✓ … > cria cliente novo e grava o agendamento, devolvendo a linha pelo RETURNING 1682ms
 ✓ … > reaproveita o cliente existente pelo telefone, em vez de duplicar a linha 1598ms
 ✓ … > rejeita horário já ocupado sem gravar nada, com a mensagem que a UI reconhece 1087ms
 ✓ … > mantém o acoplamento de string casando nas DUAS pontas (action ↔ BookingApp) 2ms
 ✓ … > produz a cópia exata da caixa de erro de slots quando o slug não resolve 290ms

 Test Files  1 passed (1)
      Tests  6 passed (6)
   Duration  6.30s

INTEGRACAO_EXIT=0
```

**6 passando, nenhum pulado.** A linha de resumo do vitest não traz `skipped` — se trouxesse, significaria credencial ausente e o plano teria parado aqui.

### Prova 4: Definition of Done do projeto

```
########## pnpm lint ##########
$ eslint
LINT_EXIT=0

########## pnpm test ##########
 Test Files  13 passed (13)
      Tests  198 passed (198)
   Duration  405ms (transform 917ms, setup 0ms, import 1.19s, tests 254ms, environment 1ms)
TEST_EXIT=0

########## pnpm build ##########
✓ Compiled successfully in 5.1s
✓ Generating static pages using 11 workers (14/14) in 468ms

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
│ ├ /para/designer-de-sobrancelhas
│ ├ /para/lash-designer
│ ├ /para/manicure
│ └ /para/barbeiro
├ ƒ /sign-in/[[...sign-in]]
└ ƒ /sign-up/[[...sign-up]]

ƒ Proxy (Middleware)
BUILD_EXIT=0
```

**13 arquivos / 198 testes.** A linha de base da fase era 196; o delta de **+2** é nominal e vem do plano 01-06 (`describe('encerrarBootPorEnvAusente')`, dois casos). Os 5 casos de integração do 01-07 **não** entram nesta conta por desenho — são contados pela prova 3 — e a hermeticidade foi conferida de novo:

```
$ EXIGIR_INTEGRACAO= pnpm vitest list | grep -c 'public-booking-escrita'
0
```

A suíte não é coletada pelo glob padrão, então este `pnpm test` não escreveu no Supabase de dev.

O `pnpm build` imprime os **3 diagnósticos de Edge Runtime** já conhecidos, capturados na íntegra:

```
Turbopack build encountered 3 warnings:
./src/lib/env.ts:96:5
A Node.js API is used (process.exit at line: 96) which is not supported in the Edge Runtime.
  Import traces:
    Edge Instrumentation: ./src/lib/env.ts → ./src/instrumentation.ts
```

Build sai **0**, o código nunca executa no edge (guarda `NEXT_RUNTIME === 'nodejs'`), e a decisão do owner está registrada em `docs/PENDENCIAS.md` pelo plano 01-06. Não foi consertado aqui — está fora do escopo deste plano e a redação existente foi conferida como correta.

## Task 2 — o que mudou em requisito, roadmap e observabilidade

**Escrito depois de a prova 2 sair `HARNESS_BOOT_EXIT=0`** com os quatro vereditos aprovados. Sem esse número, a Task 2 não teria rodado.

- **`.planning/REQUIREMENTS.md`** — SEG-05 passou de `[~]` para `[x]`. O texto novo descreve o comportamento real (webhook só com assinatura válida; em produção, obrigatória ausente encerra o processo com código 1 depois de nomear a variável em `stderr`) e **preserva o histórico**: registra que a segunda metade foi medida como falsa na primeira verificação da fase e fechada pelo plano 01-06, nomeando o harness e os dois vereditos que provam cada metade. Na tabela §Traceability, `Partial — …` virou `Complete`.
- **`.planning/ROADMAP.md`** — três linhas acrescentadas em "Notas de execução" da Phase 1: o comando que prova o critério 5 com os quatro vereditos descritos; o registro de que a primeira medição encontrou o processo sobrevivendo e de que a semântica de boot foi alterada por decisão do owner; e a ordem em que os quatro planos de gap closure rodaram. O texto do critério 5 **não** foi alterado — ele descrevia o comportamento correto e passou a ser verdade.
- **`docs/09-OBSERVABILIDADE_E_EMAIL.md`** — a semântica de fail-fast deixou de ser "derruba o boot" no sentido vago: agora nomeia `encerrarBootPorEnvAusente()` (`src/lib/env.ts`), o `process.exit(1)`, o harness que prova, as **duas guardas** (só em produção, só no runtime `nodejs`) e o efeito colateral estático dos três diagnósticos do Turbopack. O aviso de ordem de operação ganhou a consequência maior. A instrução de acrescentar à lista toda variável nova que falharia em silêncio ficou intacta.

Critérios por comando:

```
grep -c "^- \[~\] \*\*SEG-05" .planning/REQUIREMENTS.md:   0   (exigido 0)
grep -c "^- \[x\] \*\*SEG-05" .planning/REQUIREMENTS.md:   1   (exigido 1)
grep -c "Partial" .planning/REQUIREMENTS.md:               0   (exigido 0)
grep -c "| Complete |" .planning/REQUIREMENTS.md:          5   (exigido 5)
grep -c verificar-fail-fast-boot .planning/ROADMAP.md:     1   (exigido ≥1)
grep -c verificar-fail-fast-boot docs/09-…:                1   (exigido ≥1)
```

O diff do `ROADMAP.md` foi **lido**, não presumido: três linhas acrescentadas no bloco "Notas de execução" da Phase 1 (contexto `@@ -188,6 +188,9 @@`), nenhuma outra fase tocada. A lista de planos da fase já trazia 01-06 a 01-09 com as waves desde o planejamento do gap closure; a contagem `Plans: n/9` é atualizada pelo `roadmap update-plan-progress` no fechamento.

## Task 3 — `docs/PENDENCIAS.md`

**(a) Superfície remanescente — de aberta para fechada.** O título virou `~~…~~ — ✅ Fechada (plano 01-08, 2026-07-22)`, com aviso logo abaixo de que as duas policies não existem mais. **A análise dos dois riscos foi preservada** (com os tempos verbais corrigidos: "valia até 2026-07-22", "desarmada em 2026-07-22") porque é o registro de por que a mudança foi feita — sem ela, alguém recria a policy achando que faltou algo. A nota de que a **D-07 não se aplicava** e de que o conserto foi `DROP` puro também ficou, com a instrução explícita de não recriar. O bloco de decisão ("registrar, não fechar aqui") e o procedimento de quatro passos foram substituídos por uma tabela de registro de fechamento: migration, version no ledger (18 = 18), corpo executável, `pg_policies` depois, o contraste 2 → 1, a não-regressão do dashboard (linha inativa visível) e o harness anônimo verde depois do DROP.

**A correção de redação sinalizada pelo 01-08 foi feita:** o procedimento antigo mandava gerar por `supabase db diff`; o registro novo diz que a migration foi escrita à mão, que é o caminho do item (b) de `docs/03` para delta pequeno, e por quê (o diff sobe shadow database em Docker e, com privilégio no caminho, emite o inverso do desejado — precedente do 01-04). Também registra que o DDL e o `INSERT` no ledger foram emitidos na mesma transação e que `apply_migration` continua proibido.

**(b) WR-02 — reconferido, não reescrito.** O plano previa corrigir um item que ainda afirmasse que o processo sobrevive. Ele **já estava correto**: o plano 01-06 o atualizou com o bloco `✅ RESOLVIDO`, o mecanismo, o harness, as duas guardas e o alerta de que a ordem do deploy passou a ter consequência maior. O mesmo vale para o IN-03 e para o item dos diagnósticos de Edge Runtime. Reescrever por obrigação de plano só produziria churn — a conferência está registrada aqui e `grep -c verificar-fail-fast-boot docs/PENDENCIAS.md` devolve 1.

**(c) UAT humano — o ponto mais delicado, e nada foi marcado.**

```
grep -c '^- \[ \]' docs/PENDENCIAS.md:   7   (exigido 7, medido antes e depois do hook)
grep -ci '^- \[x\]' docs/PENDENCIAS.md:  0   (exigido 0, medido antes e depois do hook)
```

Os três itens parcialmente cobertos agora começam pela negativa — `**Não cobre:** …` — antes de dizer o que a automação cobre, e cada um traz o "o que fazer" para o owner:

- **Wizard completo** — não cobre as telas do navegador, a ausência de fricção nova, a transição para "Horário confirmado!" e a linha aparecendo na agenda. Cobre, desde o 01-07, a escrita ponta a ponta no servidor: resolução por slug, criação de cliente, sanitização de telefone, INSERT com `RETURNING`.
- **Recuperação de double-booking** — não cobre o aviso âmbar renderizado, a grade refeita e o cliente voltando à etapa de data/hora. Cobre o acoplamento de string nas duas pontas e a rejeição sem gravar nada.
- **Caixa de erro de slots** — não cobre a cópia aparecendo na caixa vermelha com `role="alert"` nem o botão "Tentar de novo". Cobre a igualdade estrita da string e a ausência de vazamento técnico.
- **Dashboard tela a tela** — *reforçado, não coberto*. O 01-08 provou por SQL que o próprio tenant enxerga inclusive as linhas inativas depois do DROP (1 em `servicos`, 2 em `horarios_funcionamento`), o que torna "tela vazia sem erro" ainda mais improvável; o item continua aberto e ganhou o caso de **reativar um serviço inativo**.
- **Personalização por plano**, **lembrete do QStash** e **backstops visuais** — sem mudança nenhuma.

No topo da seção entrou o aviso de que "parcialmente coberto" **não** é "pode pular": a cobertura reduz a probabilidade, não fecha o item, e só o owner pode fechá-lo.

**(d) Hermeticidade do `pnpm test` como regra viva.** Bloco novo em §"Qualidade e testes", escrito com lista `-` simples e **sem nenhuma caixa de seleção** — a contagem de sete caixas é o controle automatizado que impede fechar item de UAT por engano, e introduzir caixinha ali quebraria a trava por motivo benigno. O bloco diz: `pnpm test` não toca rede nem banco e assim deve continuar; a suíte de integração escreve e apaga no Supabase de dev e fica fora do glob padrão pelo `exclude` condicional; `pnpm test:integracao` é o único ponto de entrada, destravado por `EXIGIR_INTEGRACAO=1`; reincluí-la no glob faria **toda** execução da Definition of Done, em toda fase futura, escrever no banco de dev, com duas execuções concorrentes apagando a fixture uma da outra; e `CAMINHO_ENV_LOCAL` existe só para provar que o comando reprova sem credenciais, sem nunca mover ou escrever no `.env.local` real.

## Decisions Made

- **A Task 1 foi gate de verdade, não formalidade.** As quatro provas rodaram antes do primeiro `Edit`. É a diferença entre este plano e o modo de falha que a `01-VERIFICATION.md` apontou — critério lido como satisfeito enquanto a medição dizia o contrário.
- **O veredito `WEBHOOK` foi consumido do harness do 01-06.** Nenhuma sonda de `curl` foi redigitada. As invocações literais não existem em forma copiável no repositório, e reconstruí-las de memória seria o elo mais fraco no portão mais forte da fase.
- **WR-02 foi reconferido em vez de reescrito.** O plano foi escrito antes de o 01-06 executar; quando cheguei, o item já descrevia o encerramento real. Reescrever produziria diff sem informação nova.
- **A frase "não cobre" vem primeiro em cada item parcialmente coberto.** Ordem importa: quem lê em diagonal precisa bater primeiro no que falta, não no que já está feito.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Bloco "🔴 Enumeração de `org_id` por conta autenticada" também descrevia como aberto o que o 01-08 fechou**

- **Found during:** Task 3, ao varrer `docs/PENDENCIAS.md` atrás de tudo que o gap closure tornou falso
- **Issue:** o plano nomeava apenas a seção "Superfície remanescente", mas o mesmo arquivo tem, em §"Decisões registradas", um bloco marcado 🔴 descrevendo a mesma leitura cross-tenant como vetor **aberto**, com o conserto listado como a fazer e a justificativa de por que não fora feito. Deixá-lo assim faria o documento contradizer a si mesmo a poucos parágrafos de distância — e a versão errada é a que está marcada em vermelho, ou seja, a mais visível.
- **Fix:** título riscado com `✅ Fechada (plano 01-08, 2026-07-22)`, nota apontando que o relato descreve o estado até aquela data, e bloco de fechamento no fim nomeando a migration, a transação única com o ledger e o contraste 2 → 1, com ponteiro para a seção que tem as evidências completas.
- **Files modified:** `docs/PENDENCIAS.md`
- **Commit:** `27649bf`

**2. [Rule 2 - Missing Critical] §"Qualidade e testes" afirmava que não há framework de testes no repositório**

- **Found during:** Task 3(d), ao escolher onde colocar o bloco de hermeticidade
- **Issue:** a seção abria com "Não há framework de testes configurado no repositório" e fechava com "Decisão pendente: escolher o runner (Vitest é o candidato natural)". Vitest está configurado, roda 198 testes em 13 arquivos e é a Definition of Done do projeto. Escrever a regra de hermeticidade do `pnpm test` logo abaixo de uma frase dizendo que o runner não existe seria absurdo — e a frase é justamente do tipo que faz alguém reabrir uma decisão já tomada.
- **Fix:** a abertura passou a nomear o Vitest e o `vitest.config.ts`, mantendo o princípio de testes proporcionais ao risco; a linha de "decisão pendente" saiu e deu lugar ao bloco de hermeticidade.
- **Files modified:** `docs/PENDENCIAS.md`
- **Commit:** `27649bf`

---

**Total deviations:** 2 (ambas de coerência documental, dentro de `files_modified`)
**Impact on plan:** nenhum critério de aceite foi afrouxado; nenhum arquivo fora dos quatro declarados; nenhuma dependência nova; nenhum item de UAT marcado.

## Issues Encountered

**Nenhum bloqueio.** Dois pontos de atenção:

- **A contagem de caixas foi conferida duas vezes**, antes e depois do commit, porque o hook de prettier reformata o arquivo inteiro e poderia, em tese, mexer na indentação das listas. Continuou 7 abertas / 0 marcadas, e os cinco greps de aceite mantiveram os mesmos valores depois da reformatação.
- **O `pnpm build` da prova 4 foi rodado duas vezes** — a primeira com `tail` (para o resumo de rotas e o exit code) e a segunda com `head` (para capturar os três diagnósticos de Edge Runtime, que aparecem no começo da saída). As duas saíram 0. Registrar o diagnóstico de memória seria exatamente o tipo de afirmação sem prova que esta fase combate.

## Known Stubs

Nenhum. Nenhum arquivo de código foi tocado, nenhum teste foi pulado, nenhum `<verify>` ficou sem rodar, e nenhuma afirmação de documentação foi escrita sem o comando correspondente ter sido executado.

## Suposições do probe de edge — rollup final da fase

Nenhuma aresta sumiu em silêncio. Estado ao fim da Phase 1:

| Aresta | Disposição final |
|---|---|
| **A-SEG-01** (`concurrency`) | **NÃO RESOLVIDA, sinalizada.** Duas requisições simultâneas no mesmo slot ainda podem gerar dois agendamentos ativos: a janela vai da leitura da engine ao INSERT. É AGE-03 na Phase 2, com constraint de exclusão no banco. Registrada em `docs/PENDENCIAS.md` §"Prevenção atômica de double-booking". Resolvida apenas no caso específico do 01-08 (DDL + ledger na mesma transação) |
| **A-SEG-02** | **PARCIALMENTE ENDEREÇADA.** Enumerabilidade com a chave publicável: fechada e verificada (harness, 11 checagens). Enumeração de `tenant_id` por conta autenticada: fechada e **medida** pelo 01-08 nas duas tabelas residuais; continua não resolvida para as demais tabelas, onde `authenticated` mantém privilégio por desenho e a defesa é o RLS tenant-scoped — auditado, não exaustivamente provado por probe |
| **A-SEG-03** | **NÃO RESOLVIDA, sinalizada.** O harness prova 401/42501 nas colunas sensíveis, e a perda total da Data API por `anon` satisfaz o requisito com folga. Permanece suposição a **durabilidade**: nada impede uma fase futura de conceder `GRANT` de coluna e reabrir. A trava é a regra escrita em `docs/03` mais o harness rodando em toda fase |
| **A-SEG-04** | **NÃO RESOLVIDA, sinalizada.** "Tabela nova nasce fora da Data API" foi provado uma vez, empiricamente, com tabela descartável no 01-04. O mecanismo é o `ALTER DEFAULT PRIVILEGES for role postgres`; a migration do 01-08 foi conferida como isenta de privilégio. A prova volta a valer a pena na Phase 7, quando nascer a primeira tabela nova de verdade |
| **A-SEG-05** | **RESOLVIDA no que importa, sinalizada no resto.** "O processo morre mesmo?" virou medição: veredito `MORTE`, código 1, `curl` 7. Continua não resolvida para encerramento sob orquestrador real (Railway em crash-loop) e para o caso de várias obrigatórias ausentes ao mesmo tempo — a mensagem lista todas, mas o teste isola uma |

## Threat Flags

Nenhuma superfície nova de rede, auth, acesso a arquivo ou schema. Sobre o registro do próprio plano:

- **T-01-32** (documentação afirmando fechado o que não foi medido) — **mitigado por construção**: as quatro provas rodaram antes de qualquer `Edit`, com saída real colada acima e código de saída registrado.
- **T-01-33** (item de UAT marcado por um executor) — **mitigado e conferido por comando**, antes e depois do hook: 7 abertas, 0 marcadas. O bloco novo de hermeticidade foi escrito com lista `-` simples justamente para não inflar a contagem.
- **T-01-34** (escrita de arquivo inteiro no `ROADMAP.md`) — **não se materializou**: as edições foram por substituição de trecho e o diff foi lido, mostrando três linhas acrescentadas numa única janela da Phase 1.
- **T-01-35** (correção apagando o histórico do erro) — **mitigado**: SEG-05 preserva a frase sobre a medição falsa e o plano que fechou; a seção de superfície remanescente preserva a análise dos dois riscos e a nota da D-07.
- **T-01-SC** (supply chain) — não se aplica: nenhum install, `pnpm-lock.yaml` intocado, diff restrito a quatro arquivos de documentação.

## User Setup Required

Nenhum para desenvolver. **Para o owner, o que ficou aberto e nomeado:**

1. **Os sete itens de UAT humano** em `docs/PENDENCIAS.md` §"🧪 UAT humano pendente da Phase 1" — três deles com o lado servidor já coberto, todos os sete ainda exigindo olho na tela.
2. **A decisão sobre os três diagnósticos de Edge Runtime** no `pnpm build`, registrada pelo 01-06 com as saídas possíveis e a explicitamente recusada. Não bloqueia nada; gatilho é o go-live ou o primeiro uso da saída do build como gate de CI.
3. **A ordem do próximo deploy de produção (WR-02)** — com o boot encerrando de verdade, conferir que as quatorze obrigatórias existem no Railway **antes** de subir deixou de ser recomendação e virou pré-requisito.

## Next Phase Readiness

**A Phase 1 pode ser reverificada.** Os três gaps da `01-VERIFICATION.md` estão fechados por código e refletidos na documentação, na ordem certa. O que continua não verificado está escrito com mais precisão do que antes: sete itens de UAT humano abertos, três com cobertura parcial nomeada pelo que **não** cobre, cinco arestas de probe com disposição final e uma decisão de owner pendente que não bloqueia nada.

**Para a Phase 2:** o handoff sobre o repro do "assume 30 minutos" continua em `docs/PENDENCIAS.md` e é leitura obrigatória antes de escrever teste de AGE-01/AGE-02 — o fallback deixou de disparar no caminho público desde que a leitura passou a usar o cliente privilegiado. A corrida de double-booking (AGE-03) segue aberta e nenhum teste de concorrência foi escrito aqui, de propósito.

## Self-Check: PASSED

Arquivos declarados, conferidos por existência no disco:

```
FOUND: .planning/REQUIREMENTS.md
FOUND: .planning/ROADMAP.md
FOUND: docs/09-OBSERVABILIDADE_E_EMAIL.md
FOUND: docs/PENDENCIAS.md
FOUND: .planning/phases/01-hardening-da-superf-cie-p-blica/01-09-SUMMARY.md
```

Commits declarados, conferidos por `git log`:

```
FOUND: c8aa343   (Task 2)
FOUND: 27649bf   (Task 3)
```

Nenhuma deleção de arquivo rastreado em nenhum dos dois commits (`git diff --diff-filter=D --name-only HEAD~1 HEAD` vazio nas duas verificações).

---

_Phase: 01-hardening-da-superf-cie-p-blica_
_Completed: 2026-07-22_
