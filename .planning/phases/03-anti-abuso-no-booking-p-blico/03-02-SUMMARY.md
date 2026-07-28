---
phase: 03-anti-abuso-no-booking-p-blico
plan: 02
subsystem: observability
tags: [sentry-logs, posthog, rate-limit, anti-pii, server-actions, flush]

requires:
  - phase: 03-01
    provides: "ponto de bloqueio da camada escrita_ip em criarAgendamentoPublico, hashChaveRateLimit e o discriminante muitas_tentativas"
  - phase: quick-260724-observabilidade-mensageria
    provides: "logOperacional, allowlist fechada de atributos, e o precedente de variante AGUARDADA (reportarExcecaoAguardando) com Sentry.flush"
provides:
  - "logOperacionalAguardando — logger de entrega garantida (Sentry.flush(2000)) para os quatro níveis, consumível por todos os pontos de bloqueio das expansões 03-03/03-04/03-05"
  - "Atributos camada e chaveHash na allowlist fechada de AtributosLogOperacional"
  - "Códigos sintéticos ratelimit.bloqueio e honeypot.captura em MENSAGENS_LOG"
  - "Bloqueio da camada de IP visível nos dois pilares: Sentry Log pesquisável + evento agregado booking_rate_limited no PostHog"
affects: [03-03-camadas-telefone-e-tenant, 03-04-leitura-e-env, 03-05-honeypot]

tech-stack:
  added: []
  patterns:
    - "Par fire-and-forget / AGUARDADA como forma padrão dos módulos de observabilidade — log.ts agora espelha reportar.ts, e a escolha entre os dois é uma pergunta só: o processo pode congelar na linha seguinte?"
    - "Miolo compartilhado (prepararLog/entregarAoLogger) entre as duas variantes: a allowlist anti-PII é aplicada em UM lugar, nunca copiada"
    - "Telemetria de bloqueio embrulhada em try/catch que só faz console.error — o valor de retorno da action é inviolável (mesmo padrão do ramo 23P01)"

key-files:
  created: []
  modified:
    - src/lib/observabilidade/log.ts
    - src/lib/observabilidade/__tests__/log.test.ts
    - src/app/actions/public-booking.ts
    - src/app/actions/__tests__/public-booking-validacao.test.ts

key-decisions:
  - "Sentry Issue NÃO é destino do bloqueio de IP: bloqueio em endpoint público é condição esperada, igual à perda de corrida 23P01 — Issue de rotina é como o owner para de olhar a ferramenta. A Issue segue reservada ao teto por tenant (03-03) e à falha do Redis (03-01)"
  - "capturarEventoServidor (e não capturarEventoTenant) porque o bloqueio acontece ANTES da resolução do slug: não existe tenant_id para atribuir o evento neste ponto do fluxo"
  - "O chaveHash do log é o MESMO hashChaveRateLimit da chave do contador — correlaciona Sentry ↔ Redis sem que o IP exista em nenhum dos dois"
  - "O DSN virou mock MUTÁVEL em log.test.ts: o contrato 'no-op sem DSN' era indemonstrável com a constante anterior"

patterns-established:
  - "Prova anti-PII por asserção dupla: toEqual do conjunto permitido + not.toContain do valor cru serializado, com uma chave legítima na mesma entrada para provar que a barreira filtra por CHAVE e não descarta o objeto inteiro"

requirements-completed: []

coverage:
  - id: D1
    description: "Bloqueio de IP emite Sentry Log warn com código estático e atributos da allowlist, entregue por variante AGUARDADA antes do return"
    requirement: "ABU-03"
    verification:
      - kind: unit
        ref: "src/app/actions/__tests__/public-booking-validacao.test.ts#emite Sentry Log com código estático e chave PSEUDONIMIZADA — nunca o IP cru"
        status: pass
      - kind: unit
        ref: "src/lib/observabilidade/__tests__/log.test.ts#emite o log com título amigável + código e AGUARDA o flush antes de resolver"
        status: pass
    human_judgment: false
  - id: D2
    description: "Bloqueio de IP emite booking_rate_limited no PostHog pela variante pré-tenant"
    requirement: "ABU-03"
    verification:
      - kind: unit
        ref: "src/app/actions/__tests__/public-booking-validacao.test.ts#emite o evento agregado `booking_rate_limited` no PostHog"
        status: pass
    human_judgment: false
  - id: D3
    description: "Atributo fora da allowlist (telefone, ip, orgId) não atravessa sanitizarAtributosLog"
    verification:
      - kind: unit
        ref: "src/lib/observabilidade/__tests__/log.test.ts#NÃO deixa passar telefone, IP nem orgId — a allowlist continua FECHADA"
        status: pass
    human_judgment: false
  - id: D4
    description: "Telemetria protegida: falha de Sentry ou PostHog não altera o retorno do visitante"
    verification:
      - kind: unit
        ref: "src/app/actions/__tests__/public-booking-validacao.test.ts#falha da telemetria NÃO muda o retorno do visitante (padrão 23P01)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Bloqueio de IP não abre Sentry Issue"
    verification:
      - kind: unit
        ref: "src/app/actions/__tests__/public-booking-validacao.test.ts#NÃO abre Sentry Issue — bloqueio é rotina esperada, não incidente"
        status: pass
    human_judgment: false
  - id: D6
    description: "Com Sentry e PostHog REAIS, o owner consegue de fato responder 'o limite está barrando gente legítima?' a partir do que sai daqui"
    verification: []
    human_judgment: true
    rationale: "A suíte é hermética por desenho: prova o que a aplicação MANDA, nunca o que o painel do fornecedor mostra. A leitura do sinal exige DSN e chave do PostHog configurados, o Upstash provisionado (user_setup pendente do 03-01) e tráfego real — e só uma camada das quatro está instrumentada até aqui."

metrics:
  duration: ~12min
  completed: 2026-07-27

status: complete
---

# Phase 3 Plano 02: Telemetria do bloqueio de rate limit — Summary

**O bloqueio por IP deixou de ser mudo: cada recusa vira um Sentry Log pesquisável com chave pseudonimizada e um evento agregado no PostHog, entregues com `flush` antes de a Server Action retornar — e nada disso pode mudar o que o visitante recebe.**

## Performance

- **Duration:** ~12 min
- **Tasks:** 2 (ambas TDD, 4 commits — RED e GREEN separados por task)
- **Files modified:** 4 (0 criados, 4 modificados)
- **Testes:** 296 → 307 (11 novos, zero regressão)

## Accomplishments

- **`logOperacionalAguardando` fecha a lacuna que o incidente 260724 abriu.** `reportar.ts` já tinha o par fire-and-forget / aguardada desde a quick task; `log.ts` não tinha, e o primeiro ponto que precisava dele era justamente este — emissão a uma linha do `return` de uma Server Action. Agora os dois módulos de observabilidade têm a mesma forma, e a escolha entre variantes é uma pergunta só.
- **A allowlist cresceu duas chaves e continua fechada.** `camada` e `chaveHash` entraram com prova explícita de que `telefone`, `ip` e `orgId` continuam do lado de fora — e a prova coloca uma chave legítima na mesma entrada, para demonstrar que a barreira filtra por chave em vez de simplesmente descartar o objeto inteiro quando vê algo estranho.
- **A correlação log ↔ contador existe sem que o IP exista.** O `chaveHash` do log é literalmente o mesmo `hashChaveRateLimit` que compõe a chave no Redis: dá para pegar um bloqueio no Sentry e achar o balde correspondente no Upstash, e em nenhum dos dois lugares há dado pessoal.
- **A ausência da Sentry Issue é decisão registrada, não esquecimento** — e está coberta por teste que falha se alguém acrescentar `reportarExcecao` neste ramo no futuro.

## Task Commits

1. **Task 1: `logOperacionalAguardando` + códigos e atributos novos** — `17d0a10` (test, RED) → `2310aa0` (feat, GREEN)
2. **Task 2: instrumentar o bloqueio da camada de IP** — `37bdbae` (test, RED) → `96f4d8e` (feat, GREEN)

**Plan metadata:** ver commit de fechamento (`docs(03-02)`).

## Files Created/Modified

- `src/lib/observabilidade/log.ts` — `camada`/`chaveHash` em `AtributosLogOperacional` e em `CHAVES_PERMITIDAS_LOG`; `ratelimit.bloqueio` e `honeypot.captura` em `MENSAGENS_LOG`; extração de `prepararLog`/`entregarAoLogger`; `emitirLogSentryAguardando` (`await import` + `await Sentry.flush(2000)`) e o export `logOperacionalAguardando` com os quatro níveis
- `src/lib/observabilidade/__tests__/log.test.ts` — DSN e SDK viraram mocks configuráveis; 7 casos novos (allowlist estendida, prova anti-PII, frases dos dois códigos, emissão + flush, não-lançamento sob rejeição, no-op sem DSN, quatro níveis aguardáveis)
- `src/app/actions/public-booking.ts` — no ramo de bloqueio `escrita_ip`: `logOperacionalAguardando.warn` aguardado + `capturarEventoServidor`, ambos dentro de try/catch que só faz `console.error`; comentário em pt-BR explicando os dois destinos e a ausência do terceiro
- `src/app/actions/__tests__/public-booking-validacao.test.ts` — mock de `@/lib/rate-limit` ganhou `hashChaveRateLimit`; mocks novos de `@/lib/observabilidade/log`, `@/lib/analytics/server` e `@/lib/observabilidade/reportar`; 4 casos novos

## Decisions Made

**Bloqueio de IP não abre Sentry Issue, e a razão é a mesma que a Phase 02 já tinha escrito.** O ramo `23P01` (perda de corrida no double-booking) documenta que reportar condição esperada inundaria o Sentry; bloqueio por rate limit num endpoint público é da mesma natureza — sob ataque, é justamente quando ele acontece muito. O sinal fica no Log (pesquisável, agrupável, sem alerta) e na taxa do PostHog. A Issue continua reservada ao que exige ação humana: teto por tenant estourado (03-03) e Redis indisponível (03-01).

**Variante `capturarEventoServidor`, não `capturarEventoTenant`.** O bloqueio de IP roda antes de `resolverPerfilPublicoPorSlug` — não existe `tenant_id` neste ponto, e forçar um exigiria mover a guarda para depois da consulta ao banco, desfazendo a economia que motivou a posição dela no 03-01. O evento sai com `distinctId: 'server'`, que é o desenho da variante anônima.

**O mock do DSN em `log.test.ts` precisou virar função mutável.** A suíte antiga fixava o DSN numa arrow constante, o que tornava o contrato 2 do módulo ("no-op sem DSN") indemonstrável — ele existia no código e não tinha uma linha de prova. Mudança de infraestrutura de teste, não de comportamento.

**A extração de `prepararLog`/`entregarAoLogger` não é estética.** Duas cópias da sanitização é como uma delas envelhece sem a outra: alguém acrescenta uma chave à allowlist e só um dos caminhos passa a respeitá-la. Com o miolo único, a barreira anti-PII é uma só para as duas variantes.

## Deviations from Plan

### 1. [Rule 2 — Correção] ABU-03 NÃO foi marcado como concluído em REQUIREMENTS.md

- **Encontrado durante:** fechamento do plano (etapa de state updates)
- **Questão:** o fluxo padrão manda marcar como completos os requisitos do frontmatter (`requirements: [ABU-03]`)
- **Por que não foi feito:** ABU-03 ("owner consegue ver se o limite está barrando gente legítima") é reivindicado também pelos planos 03-03, 03-05 e 03-06. Marcá-lo agora afirmaria que o owner enxerga a operação da guarda — quando **uma** das quatro camadas está instrumentada, a leitura pública ainda não tem teto, o honeypot tem código de log mas nenhum ponto de disparo, e o rate limit inteiro segue em no-op por falta das env vars do Upstash. É o mesmo falso-verde que o 03-01 evitou pelo mesmo motivo, e que a Phase 01 reprovou quatro vezes.
- **Ação:** ABU-03 segue `[ ] / Pending`; quem fecha é o último plano da fase que o reivindica, com a evidência da fase inteira
- **Arquivos modificados:** nenhum (a deviation é a AUSÊNCIA de uma escrita)

---

**Total de deviations:** 1 (Rule 2 — correção que evita afirmação falsa de conclusão)
**Impacto no plano:** nenhum no código. Todo o escopo técnico foi executado como escrito.

Dois acréscimos dentro do escopo declarado, nenhum deles comportamento novo:

1. Caso extra em `log.test.ts` provando que os quatro níveis da variante aguardada existem e todos aguardam o flush — o `<behavior>` só citava `warn`, e sem isso `info`/`error`/`fatal` entrariam nas expansões seguintes sem prova.
2. Caso extra em `public-booking-validacao.test.ts` afirmando que `capturarEventoTenant` **não** é chamada no bloqueio — a escolha da variante pré-tenant fica pinada, não só documentada em comentário.

## Issues Encountered

Nenhum. Os dois ciclos RED/GREEN se comportaram como previsto: 7 falhas na RED da Task 1 (export inexistente), 2 na RED da Task 2 (as duas asserções positivas; as duas negativas passam trivialmente por serem guardas de não-regressão).

## Verificação de fechamento

Rodada sobre o HEAD final (`96f4d8e`), com saída real observada:

- `pnpm test` — **307 passed (307)**, 21 arquivos, exit 0
- `npx tsc --noEmit` — exit 0
- `pnpm lint` — exit 0, sem saída
- `pnpm build` — exit 0, 14 rotas geradas

## Known Stubs

`honeypot.captura` existe em `MENSAGENS_LOG` **sem nenhum ponto de disparo** — o código nasceu aqui por instrução explícita do plano, e o campo armadilha que o emite entra no plano 03-05. É stub intencional e declarado, com custo zero: uma entrada num `Record` de mensagens não afeta comportamento algum enquanto ninguém a invoca.

As camadas `escrita_telefone`, `teto_tenant` e `leitura_ip` seguem sem telemetria porque seguem sem limiter (stub herdado do 03-01, resolvido em 03-03/03-04).

## Threat Flags

Nenhuma superfície nova fora do `<threat_model>` do plano. T-03-02-01 (vazamento de dado do visitante na telemetria) mitigado por allowlist fechada + `chaveHash` + teste anti-PII com asserção negativa sobre o valor cru; T-03-02-02 (bloqueio invisível ao owner) mitigado pela variante aguardada com `flush`; T-03-02-03 (flood de log sob ataque) segue **aceito** por decisão do owner registrada no plano — código estático e atributos enxutos mantêm o volume barato, e o volume em si é o sinal desejado.

## Next Phase Readiness

Pronto para o **03-03** (telefone + tenant): `logOperacionalAguardando` e o atributo `camada` já existem, então cada camada nova instrumenta com uma chamada só, trocando o valor de `camada` e a origem do `chaveHash`. Atenção a uma diferença de desenho: o teto por tenant **é** caso de Sentry Issue (ao contrário deste), e ali `capturarEventoTenant` passa a ser a variante certa, porque o `tenant_id` já foi resolvido naquele ponto.

Pronto para o **03-05** (honeypot): o código `honeypot.captura` já está declarado; falta o campo armadilha e a chamada.

Continua bloqueado o mesmo item do 03-01: sem `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` provisionadas, nenhum bloqueio acontece — e portanto nenhuma telemetria de bloqueio é emitida em execução real.

## Self-Check: PASSED

- `src/lib/observabilidade/log.ts` — FOUND (contém `export const logOperacionalAguardando`, `flush(2000)`, `ratelimit.bloqueio`, `honeypot.captura`, `camada`, `chaveHash`)
- `src/lib/observabilidade/__tests__/log.test.ts` — FOUND
- `src/app/actions/public-booking.ts` — FOUND (contém `logOperacionalAguardando.warn('ratelimit.bloqueio'` e `capturarEventoServidor('booking_rate_limited'`)
- `src/app/actions/__tests__/public-booking-validacao.test.ts` — FOUND
- Commits `17d0a10`, `2310aa0`, `37bdbae`, `96f4d8e` — FOUND

---
*Phase: 03-anti-abuso-no-booking-p-blico*
*Completed: 2026-07-27*
