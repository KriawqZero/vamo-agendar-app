---
phase: 01-hardening-da-superf-cie-p-blica
plan: 06
subsystem: boot
tags: [fail-fast, boot, deploy, instrumentation, edge-runtime, harness, seg-05]

# Dependency graph
requires:
  - phase: 01-hardening-da-superf-cie-p-blica (plano 01-03)
    provides: "QSTASH_NEXT_SIGNING_KEY na lista de obrigatórias + webhook autenticado por assinatura (as sondas 401 do veredito WEBHOOK)"
  - phase: 01-hardening-da-superf-cie-p-blica (plano 01-05)
    provides: "A medição que refutou a assunção A1 — o boot NÃO morria — e que este plano corrige"
  - phase: 01-hardening-da-superf-cie-p-blica (plano 01-07)
    provides: "exclude condicional no vitest.config.ts, que mantém o pnpm test da Definition of Done hermético"
provides:
  - "Boot de produção que ENCERRA o processo (código 1) quando falta variável obrigatória"
  - "scripts/verificar-fail-fast-boot.sh — harness com quatro vereditos (BUILD, MORTE, CONTROLE, WEBHOOK), exit code como veredito"
  - "Veredito WEBHOOK reutilizável: as quatro sondas do webhook de lembrete viram um exit code só"
  - "Contrato de encerramento (mensagem antes da saída, código 1) pinado em teste unitário"
affects: [01-08, 01-09, deploy-de-producao, phase-03-rate-limit]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Harness de boot: job control (set -m) para o servidor ganhar grupo de processos próprio, wait no PID para colher o status DO SERVIDOR, curl 7 (recusa de conexão) como asserção de porta morta"
    - "Contrafactual isolado: complemento de env idêntico nas duas execuções, para que o único delta entre MORTE e CONTROLE seja a variável alvo"
    - "Prova de mutação como higiene de critério: cada teste novo foi verificado quebrando a implementação de propósito"

key-files:
  created:
    - scripts/verificar-fail-fast-boot.sh
  modified:
    - src/lib/env.ts
    - src/instrumentation.ts
    - src/lib/__tests__/env.test.ts
    - docs/PENDENCIAS.md

key-decisions:
  - "O harness nasceu ANTES do conserto e a primeira execução reprovou MORTE — sem isso ele não provaria que mediria a falha"
  - "Complemento de env obrigatório: quatro das quatorze não existem no .env.local de dev, e sem injetá-las o CONTROLE seria impossível de passar e a mensagem do MORTE listaria cinco nomes em vez de um"
  - "Os três diagnósticos de Edge Runtime introduzidos pelo plano foram REGISTRADOS, não silenciados — aliasar process por globalThis esconderia o sinal"
  - "Prova do pnpm dev feita numa cópia da árvore dentro do repo: o Next 16 recusa um segundo dev server no mesmo diretório e o servidor do owner não podia ser derrubado"
  - "Gate do tracer aplicado por re-execução do verify (o plano é autonomous e o verify é 100% automatizado), como o plano 01-07 fez na wave anterior"

patterns-established:
  - "Veredito de infraestrutura mora no plano que o constrói; planos seguintes consomem o exit code em vez de redigitar as sondas"
  - "Critério de aceite carrega o valor de HOJE ao lado do EXIGIDO, e a mudança é conferida contra os dois"

requirements-completed: [SEG-05]

coverage:
  - id: D1
    description: "Com uma obrigatória vazia, o next start de produção encerra com código ≠ 0 e a porta deixa de aceitar conexão"
    requirement: SEG-05
    verification:
      - kind: integration
        ref: "bash scripts/verificar-fail-fast-boot.sh — veredito MORTE (código 1, curl 7)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A mensagem em stderr nomeia a variável ausente antes do encerramento"
    requirement: SEG-05
    verification:
      - kind: integration
        ref: "veredito MORTE: grep da literal 'Variáveis obrigatórias ausentes em produção: QSTASH_NEXT_SIGNING_KEY' no stderr capturado"
        status: pass
      - kind: unit
        ref: "src/lib/__tests__/env.test.ts#escreve a mensagem em stderr ANTES de encerrar, com o código combinado"
        status: pass
    human_judgment: false
  - id: D3
    description: "Código de saída é 1 — código 0 reintroduziria o falso verde"
    requirement: SEG-05
    verification:
      - kind: unit
        ref: "src/lib/__tests__/env.test.ts#usa código de saída 1 — zero devolveria o falso verde por outro caminho"
        status: pass
    human_judgment: false
  - id: D4
    description: "O encerramento acontece só no runtime nodejs; no edge o comportamento anterior (relançar) é preservado"
    requirement: SEG-05
    verification:
      - kind: static
        ref: "grep -c \"NEXT_RUNTIME === 'nodejs'\" src/instrumentation.ts → 2 (era 1); o catch relança fora do nodejs"
        status: pass
    human_judgment: false
  - id: D5
    description: "pnpm build sem a variável continua saindo 0"
    requirement: SEG-05
    verification:
      - kind: integration
        ref: "veredito BUILD do harness (pnpm build com a alvo vazia, exit 0)"
        status: pass
    human_judgment: false
  - id: D6
    description: "pnpm dev continua subindo com a variável ausente"
    requirement: SEG-05
    verification:
      - kind: integration
        ref: "next dev (NODE_ENV=development) com QSTASH_NEXT_SIGNING_KEY vazia em cópia isolada da árvore → GET / = 200, processo vivo"
        status: pass
    human_judgment: false
  - id: D7
    description: "As três sondas inválidas do webhook de lembrete devolvem 401 contra build de produção, e o controle GET / devolve 200"
    requirement: SEG-05
    verification:
      - kind: integration
        ref: "veredito WEBHOOK do harness — 401,401,401,200"
        status: pass
    human_judgment: false
  - id: D8
    description: "O JSDoc de src/instrumentation.ts deixa de afirmar o que a Phase 1 mediu ser falso"
    requirement: SEG-05
    verification:
      - kind: static
        ref: "grep 'sobe e mata o' → 0 (era 1); busca normalizada por 'mata o boot' → 0 (era 1)"
        status: pass
    human_judgment: false
  - id: D9
    description: "Comportamento sob orquestrador real (Railway reiniciando em loop) e com mais de uma obrigatória ausente ao mesmo tempo"
    verification: []
    human_judgment: true
    rationale: "Suposição A-SEG-05, declarada não resolvida pelo próprio plano. O harness mede uma variável isolada num processo solto; não há Railway no laço."

# Metrics
duration: ~50min
completed: 2026-07-22
status: complete
---

# Phase 01 Plan 06: Fail-fast de boot que morre de verdade Summary

**Com uma variável obrigatória vazia, o `next start` de produção agora encerra com código 1 e a porta recusa conexão — provado por um harness de quatro vereditos que, rodado antes do conserto, reprovava exatamente o veredito que este plano mudou.**

## Performance

- **Duration:** ~50 min
- **Completed:** 2026-07-22
- **Tasks:** 2
- **Files modified:** 5 (1 criado, 4 modificados)

## Accomplishments

- **O Gap 1 da `01-VERIFICATION.md` fecha.** Antes: o processo imprimia `✓ Ready`, seguia escutando e respondia 500 em toda rota — deploy verde com 100% do tráfego falhando. Agora: encerra com código 1, nomeando a variável em `stderr`, e a porta para de aceitar conexão. É a diferença entre um modo de falha silencioso e um que dispara rollback automático.
- **A prova saiu do relato e virou comando.** `bash scripts/verificar-fail-fast-boot.sh` sobe um `next start` real na porta 3991 e emite quatro vereditos, com o exit code como veredito.
- **O veredito `WEBHOOK` mora aqui, não no 01-09.** As quatro sondas (sem assinatura, secret legado em query, assinatura forjada, controle) não existiam em forma literal em lugar nenhum do repositório — o `01-05-SUMMARY.md` descreve os resultados em prosa e tem zero invocações de `curl`. Dobradas em veredito, viram um exit code exercitado a cada execução; o 01-09 consome, não redigita.
- **Achado novo, registrado em vez de silenciado:** o Turbopack passou a imprimir três diagnósticos de Edge Runtime por build (`process.stderr` ×2, `process.exit` ×1). Não é falha — o build sai 0 —, mas é ruído introduzido por este plano e está em `docs/PENDENCIAS.md` com as saídas possíveis e a que foi explicitamente recusada.

## Task Commits

1. **Task 1 (tracer): Fatia ponta a ponta — o processo morre, e um harness mede** — `bc6a98b` (feat)
2. **Task 2: Pinar o contrato de encerramento em teste unitário** — `c9a42cf` (test)

## Files Created/Modified

- `scripts/verificar-fail-fast-boot.sh` — **criado.** Quatro vereditos, porta fixa 3991, `trap` matando o grupo de processos, `PULAR_BUILD=1` e `VARIAVEL_ALVO=<nome>` como escapes, exit 0/1/2.
- `src/lib/env.ts` — `CODIGO_SAIDA_ENV_AUSENTE` (`1`) e `encerrarBootPorEnvAusente(mensagem): never`. Saída por `process.stderr.write`, sem import nenhum no topo do arquivo.
- `src/instrumentation.ts` — `try/catch` em torno de `validarEnvObrigatorio()`, guarda por `NEXT_RUNTIME === 'nodejs'`, relançamento preservado no edge; JSDoc corrigido.
- `src/lib/__tests__/env.test.ts` — bloco `describe('encerrarBootPorEnvAusente')` com dois casos (8 → 10).
- `docs/PENDENCIAS.md` — WR-02 atualizado (a decisão de boot foi tomada) e item novo dos diagnósticos de Edge Runtime.

## Provas — saída real

### 1. O harness ANTES do conserto (a prova de que ele mede algo)

Rodado com a árvore intocada, antes de qualquer edição em `env.ts`/`instrumentation.ts`:

```
Verificação do fail-fast de boot em produção
Variável alvo: QSTASH_NEXT_SIGNING_KEY   |   Porta: 3991

  … rodando pnpm build com QSTASH_NEXT_SIGNING_KEY vazia (pode levar ~1 min)
  [APROVADO]  BUILD      pnpm build saiu 0 com QSTASH_NEXT_SIGNING_KEY vazia
  [REPROVADO] MORTE      o processo continuou VIVO após 20s servindo HTTP 500 — deploy verde com 100% do tráfego falhando
  [APROVADO]  CONTROLE   com as quatorze presentes, GET / devolveu 200 e o processo seguiu vivo
  [APROVADO]  WEBHOOK    sem assinatura 401 | secret em query 401 | assinatura forjada 401 | GET / 200

Resumo: 4 vereditos, 1 REPROVADO(S):
  - MORTE — o processo continuou VIVO após 20s servindo HTTP 500 — deploy verde com 100% do tráfego falhando
HARNESS_EXIT=1
```

Exatamente o previsto: três vereditos descrevem o estado atual do repositório e passar já era o correto; só `MORTE` media o que este plano ia mudar.

### 2. O harness DEPOIS do conserto (HEAD commitado, execução final)

```
$ bash scripts/verificar-fail-fast-boot.sh && echo "harness aprovado (exit 0)"

Verificação do fail-fast de boot em produção
Variável alvo: QSTASH_NEXT_SIGNING_KEY   |   Porta: 3991

  … rodando pnpm build com QSTASH_NEXT_SIGNING_KEY vazia (pode levar ~1 min)
  [APROVADO]  BUILD      pnpm build saiu 0 com QSTASH_NEXT_SIGNING_KEY vazia
  [APROVADO]  MORTE      o processo do next encerrou com código 1, nomeou QSTASH_NEXT_SIGNING_KEY em stderr e a porta recusou conexão (curl 7)
  [APROVADO]  CONTROLE   com as quatorze presentes, GET / devolveu 200 e o processo seguiu vivo
  [APROVADO]  WEBHOOK    sem assinatura 401 | secret em query 401 | assinatura forjada 401 | GET / 200

Resumo: 4 vereditos, 0 reprovados — o boot morre de verdade e o webhook segue fechado.
harness aprovado (exit 0)
```

Executado três vezes verdes no total: uma logo após o conserto, uma como gate do tracer e a final acima, sobre o HEAD commitado.

### 3. As linhas que lançam o servidor e colhem o status

O código de saída assertado no veredito `MORTE` é o do processo `next`, não o de um envoltório:

```
161:    set -m
162:    env "$@" pnpm exec next start --port "$PORTA" >"$saida" 2>"$erro" &
163:    PID=$!
164:    set +m
...
218:    wait "$PID"
```

`set -m` dá ao job em background um grupo de processos próprio cujo PGID é igual ao PID capturado em `$!` — daí `kill -- -"$PID"` limpar a árvore inteira e `wait "$PID"` devolver o status do servidor. `setsid` não aparece em nenhuma linha de código (só no cabeçalho, explicando por que foi rejeitado).

### 4. Critérios de aceite, um por comando (HOJE → EXIGIDO)

```
grep -c "set -m":                       2  (>=1)
grep -cE "PID=\$!":                     1  (>=1)
grep -cE "wait +\"?\$\{?PID":           3  (>=1)
setsid fora de comentario:              0  (=0)
NEXT_RUNTIME nodejs em instrumentation: 2  (=2, HOJE era 1)
encerrarBootPorEnvAusente:              2  (>=1, HOJE era 0)
catch:                                  2  (>=1, HOJE era 0)
"sobe e mata o":                        0  (=0, HOJE era 1)
normalizado "mata o boot":              0  (=0, HOJE era 1)
node:fs em env.ts (sem comentario):     0  (=0)
from 'node: em env.ts:                  0  (=0)
grep -c encerrarBoot no teste:          3  (>=2)
git diff --stat package.json pnpm-lock.yaml: (vazio)
```

Os valores de HOJE foram medidos na árvore intocada **antes** da primeira edição, e batem um a um com o que o plano declarava — inclusive os dois greps do JSDoc, que era onde a versão anterior do critério nascia verde.

### 5. `pnpm dev` continua subindo com a variável ausente

Não foi possível rodar um segundo `pnpm dev` no diretório do projeto: o Next 16 mantém um lockfile de dev server por diretório e o servidor do owner está de pé há mais de nove horas (PID 2132544). Derrubá-lo não era opção. A prova foi feita numa cópia da árvore (`git archive HEAD`) dentro do repo, com `.env.local` por **symlink** (nenhum valor copiado para lugar nenhum) e a alvo forçada vazia:

```
RESULTADO: next dev (NODE_ENV=development) com QSTASH_NEXT_SIGNING_KEY vazia -> GET / = 200 | processo vivo = sim
▲ Next.js 16.2.10 (Turbopack)
- Local:         http://localhost:3992
- Environments: .env.local
✓ Ready in 239ms
```

A cópia foi removida em seguida; `git status` ficou limpo. O gate estrutural é o mesmo de sempre: `validarEnvObrigatorio()` retorna na primeira linha quando `NODE_ENV !== 'production'`, e o caminho novo fica atrás dele.

### 6. Os testes novos não nascem verdes — prova por mutação

Cada um dos dois casos foi verificado quebrando a implementação de propósito, com `git checkout` revertendo em seguida:

```
=== MUTACAO A: CODIGO_SAIDA_ENV_AUSENTE = 0 ===
     × usa código de saída 1 — zero devolveria o falso verde por outro caminho 4ms
      Tests  1 failed | 9 passed (10)

=== MUTACAO B: process.exit ANTES das escritas em stderr ===
     × escreve a mensagem em stderr ANTES de encerrar, com o código combinado 4ms
      Tests  1 failed | 9 passed (10)
```

Cada mutação quebra exatamente o teste correspondente e nenhum outro.

### 7. Definition of Done do projeto

```
########## pnpm vitest run src/lib/__tests__/env.test.ts ##########
 Test Files  1 passed (1)
      Tests  10 passed (10)
   Duration  139ms
VITEST_EXIT=0

########## pnpm lint ##########
$ eslint
LINT_EXIT=0

########## pnpm test ##########
 Test Files  13 passed (13)
      Tests  198 passed (198)
   Start at  10:49:17
   Duration  473ms (transform 918ms, setup 0ms, import 1.36s, tests 309ms, environment 1ms)
TEST_EXIT=0

########## pnpm build ##########
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

**198 testes em 13 arquivos** — os 196 da linha de base da fase mais os 2 desta task. A contagem de arquivos não cresceu: a suíte de integração do plano 01-07 continua fora do glob padrão, e o `pnpm test` segue hermético.

Um `pnpm build` intermediário falhou com `Failed to fetch 'Geist' from Google Fonts` — falha de rede transitória, não de código; a execução seguinte, sem nenhuma alteração, saiu 0.

## Decisions Made

- **O complemento de env não era opcional — era a condição para o contrafactual existir.** Quatro das quatorze obrigatórias (`APP_URL`, `ANALYTICS_TENANT_SALT`, `NEXT_PUBLIC_SENTRY_DSN`, `RESEND_API_KEY`) não existem no `.env.local` deste projeto. Sem tratá-las, **toda** execução de `next start` cairia na validação: o veredito `CONTROLE` seria impossível de passar, e a mensagem do `MORTE` listaria cinco nomes em vez de um, quebrando a asserção literal exigida. O harness injeta valores obviamente falsos para essas quatro, **idênticos nas duas execuções**, de forma que o único delta entre `MORTE` e `CONTROLE` seja a variável alvo. É o mesmo controle que o plano 01-05 usou ("mesmo build com as quatorze presentes"), agora escrito no script em vez de improvisado na linha de comando. Nenhuma delas entra no `pnpm build`: o artefato do veredito `BUILD` é o build normal do projeto.
- **`setsid` rejeitado, e a rejeição documentada no cabeçalho.** O mecanismo é `set -m` + `&` + `$!` + `wait`, e o cabeçalho explica por que a alternativa foi descartada — o grep de proibição filtra comentários exatamente para permitir essa explicação.
- **Os três diagnósticos de Edge Runtime foram registrados, não silenciados.** Havia uma saída fácil (aliasar `process` por `globalThis` para o analisador não enxergar) e ela foi recusada: esconderia o sinal em vez de resolvê-lo. As duas saídas reais — mover o encerrador para módulo próprio, ou aceitar e documentar o ruído — contrariam o contrato deste plano (que fixa os dois símbolos em `src/lib/env.ts` e pina `process.stderr.write` em teste) e por isso viraram decisão do owner em `docs/PENDENCIAS.md`.
- **Gate do tracer aplicado por re-execução do `verify`, não por checkpoint humano.** O plano é `autonomous: true` e o `<verify>` é um comando cujo exit code é o veredito — não há nada visual para um humano avaliar. O `verify` foi re-executado ponta a ponta antes da Task 2; se tivesse falhado, o plano teria parado ali. Mesmo critério que o plano 01-07 aplicou na wave anterior.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Complemento de env no harness**

- **Found during:** Task 1, ao desenhar o veredito CONTROLE
- **Issue:** quatro das quatorze obrigatórias não existem no `.env.local`; o CONTROLE seria impossível de passar depois do conserto e a asserção literal do MORTE ("...ausentes em produção: QSTASH_NEXT_SIGNING_KEY") nunca casaria.
- **Fix:** constante `COMPLEMENTO_DEV` no script, injetada identicamente nas duas execuções de `next start` e em nenhum `pnpm build`. Motivo escrito na nota 4 do cabeçalho.
- **Files modified:** `scripts/verificar-fail-fast-boot.sh`
- **Committed in:** `bc6a98b`

**2. [Rule 2 - Missing Critical] `docs/PENDENCIAS.md` atualizado (item 6 da Definition of Done do `CLAUDE.md`)**

- **Found during:** Task 2
- **Issue:** o plano não listava `docs/PENDENCIAS.md` em `files_modified`, mas o §WR-02 afirmava textualmente que fazer o `register()` chamar `process.exit(1)` era "decisão de arquitetura de boot, **não tocada pela Phase 1 de propósito**" — exatamente o que este plano acabou de fazer. Deixar assim faria o documento mentir sobre o estado do produto, que é o modo de falha que esta fase inteira combate. O item IN-03 ("morre no boot") também descrevia um comportamento que só agora é literal.
- **Fix:** WR-02 ganhou o bloco `✅ RESOLVIDO (plano 01-06)` com o mecanismo, o harness e o alerta de que a ordem do deploy passou a ter consequência maior; IN-03 ganhou nota de atualização; e foi acrescentado o item novo dos diagnósticos de Edge Runtime.
- **Files modified:** `docs/PENDENCIAS.md`
- **Committed in:** `c9a42cf`
- **Verification:** `pnpm lint` / `pnpm test` / `pnpm build` verdes depois da alteração

**3. [Rule 1 - Descoberta] Três diagnósticos de Edge Runtime no build**

- **Found during:** Task 1, na prova do `pnpm dev`
- **Issue:** `env.ts` passou a usar `process.stderr` (linhas 91-92) e `process.exit` (linha 96), e o arquivo é importado por `instrumentation.ts`, que também é empacotado para o edge. O Turbopack imprime três blocos `A Node.js API is used ... not supported in the Edge Runtime` por build.
- **Medição:** num build **bem-sucedido**, `pnpm build` sai **0** e o resumo de rotas é impresso normalmente. Os três diagnósticos apontam exclusivamente para linhas introduzidas por este plano. O código nunca executa no edge — a guarda `NEXT_RUNTIME === 'nodejs'` impede; o analisador é estático e não a enxerga.
- **Fix:** nenhum no código — registrado em `docs/PENDENCIAS.md` com as saídas possíveis e a explicitamente recusada (aliasar `process`). Um conserto real exigiria partir o módulo, o que contraria o contrato de artefatos deste plano.
- **Committed in:** `c9a42cf` (a documentação)

---

**Total deviations:** 3 (1 blocking auto-fix, 1 missing critical, 1 achado documentado)
**Impact on plan:** nenhum critério de aceite foi afrouxado; nenhuma dependência nova; nenhuma linha de `package.json` ou `pnpm-lock.yaml` tocada.

## Issues Encountered

- **O `pnpm dev` de prova não pôde rodar no diretório do projeto.** O Next 16 mantém lockfile de dev server por diretório e o servidor do owner (PID 2132544, 9h+ de uptime, respondendo 200) não podia ser derrubado. Três rotas foram tentadas antes da que funcionou: segundo `pnpm dev` no mesmo dir (recusado pelo lock), cópia em `/tmp` com `node_modules` por symlink (o `pnpm` tentou **purgar o diretório de módulos** — abortou sozinho por falta de TTY, e o symlink foi removido imediatamente; o `node_modules` real foi conferido intacto logo depois), e cópia em `/tmp` com symlinks por entrada (o Turbopack não resolveu a raiz do workspace). A que funcionou foi a cópia dentro do próprio repo, onde `node_modules` resolve subindo um nível de verdade.
- **`pnpm build` falhou uma vez por rede** (`Failed to fetch 'Geist' from Google Fonts`), não por código. A execução seguinte, sem alteração nenhuma, saiu 0.

## Known Stubs

Nenhum. Nenhum valor vazio codificado, nenhum `TODO`/`FIXME`, nenhum teste pulado. O harness executa `pnpm build` e `next start` de verdade a cada execução.

## Suposições do probe de edge — estado após este plano

- **[A-SEG-05 — `unclassified`, PARCIALMENTE resolvida]** A aresta central — *"o processo morre mesmo?"* — deixou de ser suposição e virou medição: veredito `MORTE`, código 1, `curl` 7. Continua **não resolvida** para o que o harness não cobre e continua declarado: encerramento sob orquestrador real (Railway reiniciando em loop) e comportamento com mais de uma obrigatória ausente ao mesmo tempo — a mensagem lista todas, mas o teste isolado exercita uma.

## Threat Flags

Nenhuma superfície nova de rede, auth ou schema. Duas notas sobre o registro do próprio plano:

- **T-01-21 (harness com `.env.local` carregado) — mitigação implementada e conferida.** O script não lê, não sourceia e não referencia arquivo de env; `next start` o carrega sozinho. Nenhum valor de variável aparece em ramo nenhum do relatório, só nomes. O secret da sonda legada é uma literal inválida escrita no próprio script.
- **T-01-22 (runtime edge quebrado por API só-Node) — mitigada quanto ao import, com resíduo estático registrado.** Nenhum `import` de módulo só-Node entrou em `env.ts` (`grep` por `node:fs` e por `from 'node:` devolve 0 e 0), e a guarda de runtime impede execução no edge. O resíduo são os três diagnósticos estáticos do Turbopack, documentados em `docs/PENDENCIAS.md`.

## User Setup Required

Nenhum para desenvolver. **Para o deploy de produção, a ordem do WR-02 passou a ser obrigatória e não opcional:** com o boot morrendo, uma obrigatória mal provisionada no Railway derruba o deploy inteiro — que é o comportamento desejado (habilita rollback automático), mas exige conferir que as quatorze existem antes de subir, ou remover nomes da lista no mesmo commit.

## Next Phase Readiness

**Pronto para o plano 01-08** (serialização estrita: 01-07 → 01-06 → 01-08 → 01-09).

- **01-08** roda `pnpm build` na Definition of Done: nada aqui o impede, e `.next/` está num estado normal (o último build do harness foi seguido do build limpo da Definition of Done).
- **01-09** consome o veredito `WEBHOOK` executando `bash scripts/verificar-fail-fast-boot.sh` e lendo o exit code — **nenhuma sonda de `curl` deve ser redigitada lá**. O 01-09 também é quem corrige a redação do critério 5 em `REQUIREMENTS.md` e `ROADMAP.md`, agora que ele é literalmente verdadeiro.
- **Blocker novo:** nenhum. Uma decisão do owner ficou aberta (os três diagnósticos de Edge Runtime), registrada em `docs/PENDENCIAS.md` com gatilho — não bloqueia nenhum plano.

## Self-Check: PASSED

Arquivos declarados, conferidos por existência no disco:

```
FOUND: scripts/verificar-fail-fast-boot.sh
FOUND: src/lib/env.ts
FOUND: src/instrumentation.ts
FOUND: src/lib/__tests__/env.test.ts
FOUND: docs/PENDENCIAS.md
```

Commits declarados, conferidos por `git log`:

```
FOUND: bc6a98b   (Task 1 — tracer)
FOUND: c9a42cf   (Task 2)
```

Nenhuma deleção de arquivo rastreado em nenhum dos dois commits (`git diff --diff-filter=D HEAD~1 HEAD` vazio nas duas verificações).

---
*Phase: 01-hardening-da-superf-cie-p-blica*
*Completed: 2026-07-22*
