---
phase: 03-anti-abuso-no-booking-p-blico
plan: 03
subsystem: security
tags: [rate-limit, upstash, sliding-window, sentry-issue, posthog, anti-pii, server-actions]

requires:
  - phase: 03-01
    provides: "verificarLimite, hashChaveRateLimit, o tipo CamadaRateLimit com as quatro camadas declaradas e o discriminante muitas_tentativas"
  - phase: 03-02
    provides: "logOperacionalAguardando + atributos camada/chaveHash na allowlist fechada e o código ratelimit.bloqueio"
  - phase: quick-260724-observabilidade-mensageria
    provides: "reportarFalhaSilenciosaAguardando e a regra de Issue sintética ESTÁTICA"
provides:
  - "Camada escrita_telefone (slidingWindow 5/'1 h', prefix rl:escrita:tel) com chave composta telefone+tenant"
  - "Camada teto_tenant (slidingWindow 30/'1 h', prefix rl:escrita:tenant) — desacelerador do ataque distribuído"
  - "Checagem composta em Promise.all na action pública, entre a resolução do slug e a consulta de serviço"
  - "Código sintético novo de Sentry Issue: ratelimit:teto_tenant_atingido (o único bloqueio da fase que escala)"
  - "Captura das configs de limiter na suíte: as constantes de calibração passaram a ser verificáveis de fora"
affects: [03-04-leitura-e-env, 03-05-honeypot, 03-06-fechamento]

tech-stack:
  added: []
  patterns:
    - "Camada nova de rate limit = uma entrada em LIMITERS + uma linha em verificarLimite; nenhuma mudança estrutural (o tracer do 03-01 pagou por isso)"
    - "Prefixo do limiter viajando no mock como segundo argumento — com um limitMock compartilhado, é o que distingue 'consultou o Redis' de 'consultou a camada certa'"
    - "Constante de calibração provada por asserção sobre a config instanciada: número que ninguém consegue ler de fora é número que muda sozinho na próxima edição"

key-files:
  created: []
  modified:
    - src/lib/rate-limit.ts
    - src/lib/__tests__/rate-limit.test.ts
    - src/app/actions/public-booking.ts
    - src/app/actions/__tests__/public-booking-validacao.test.ts

key-decisions:
  - "5 tentativas/h implementa o '~3 agendamentos/h' do D-08: limit() é check-then-consume sem refund, e a família que perde uma corrida de double-booking já gastou 4 tokens antes da terceira criança"
  - "Telefone e tenant rodam PÓS-resolução do slug: a chave exata só nasce ali, e usar o slug dobraria o orçamento de cada tenant pelos dois namespaces (slug e slug_gratuito abrem a MESMA agenda)"
  - "A Issue do teto por tenant mora na AÇÃO, não no módulo de rate limit: o módulo só abre Issue quando o FORNECEDOR falha, senão o mesmo alarme de ataque apareceria no caminho de leitura, onde não significa nada"
  - "capturarEventoTenant (e não Servidor) nas duas camadas novas — invertendo a escolha do 03-02 — porque aqui o tenant_id já existe e a taxa POR TENANT é o que responde 'esta agenda está sendo atacada?'"
  - "A Issue é ACRÉSCIMO à telemetria de rotina, nunca substituição: alarme sem o log e a taxa chegaria sem o histórico que permite dimensionar o ataque"

patterns-established:
  - "Prova negativa de PII exige mock que não carregue o valor cru: um hash falso do tipo `hash:${valor}` faz a asserção acusar o próprio mock e dá falso-vermelho"

requirements-completed: []

coverage:
  - id: D1
    description: "O mesmo telefone normalizado no mesmo tenant é barrado ao exceder 5 tentativas na janela deslizante de 1h"
    requirement: "ABU-01"
    verification:
      - kind: unit
        ref: "src/lib/__tests__/rate-limit.test.ts#usa slidingWindow de 5 tentativas por hora no prefixo rl:escrita:tel"
        status: pass
      - kind: unit
        ref: "src/lib/__tests__/rate-limit.test.ts#BLOQUEIA quando a janela do telefone estourou, sem abrir Issue"
        status: pass
      - kind: unit
        ref: "src/app/actions/__tests__/public-booking-validacao.test.ts#bloqueio por TELEFONE devolve muitas_tentativas e fica em log + PostHog (D-11)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Criações além de 30 na mesma hora do mesmo tenant são barradas e o estouro escala Issue sintética estática pela variante aguardada, com tenant só pseudonimizado"
    requirement: "ABU-03"
    verification:
      - kind: unit
        ref: "src/lib/__tests__/rate-limit.test.ts#usa slidingWindow de 30 criações por hora no prefixo rl:escrita:tenant"
        status: pass
      - kind: unit
        ref: "src/app/actions/__tests__/public-booking-validacao.test.ts#estouro do TETO por tenant escala Issue sintética estática com tenantHash (D-12)"
        status: pass
    human_judgment: false
  - id: D3
    description: "As camadas rodam DEPOIS da resolução do slug (chave exata por tenant_id) e ANTES da consulta de serviço/engine/RPC/INSERT"
    requirement: "ABU-01"
    verification:
      - kind: unit
        ref: "src/app/actions/__tests__/public-booking-validacao.test.ts#consulta as duas camadas com as chaves exatas, depois da resolução"
        status: pass
      - kind: unit
        ref: "src/app/actions/__tests__/public-booking-validacao.test.ts#bloqueio acontece ANTES da consulta de serviço (não paga o resto do caminho)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Bloqueio por telefone fica só em log+PostHog; a Issue é exclusiva do teto por tenant e da falha do Redis"
    verification:
      - kind: unit
        ref: "src/app/actions/__tests__/public-booking-validacao.test.ts#bloqueio por TELEFONE devolve muitas_tentativas e fica em log + PostHog (D-11)"
        status: pass
      - kind: unit
        ref: "src/lib/__tests__/rate-limit.test.ts#BLOQUEIA quando o teto do tenant estourou"
        status: pass
    human_judgment: false
  - id: D5
    description: "As duas checagens pós-resolução rodam em paralelo — nenhum atraso perceptível adicionado ao caminho legítimo"
    requirement: "ABU-02"
    verification:
      - kind: unit
        ref: "src/app/actions/__tests__/public-booking-validacao.test.ts#com as três camadas liberando, o fluxo segue idêntico ao baseline"
        status: pass
    human_judgment: false
    rationale: "O `Promise.all` é verificável por leitura e o controle positivo prova que nenhuma camada nova vira bloqueio acidental; a latência REAL só se mede com Upstash provisionado."
  - id: D6
    description: "Telefone e tenant crus NUNCA entram em telemetria nem como chave no Redis"
    verification:
      - kind: unit
        ref: "src/lib/__tests__/rate-limit.test.ts#hasheia cada parte separadamente e une por \":\""
        status: pass
      - kind: unit
        ref: "src/app/actions/__tests__/public-booking-validacao.test.ts#estouro do TETO por tenant escala Issue sintética estática com tenantHash (D-12)"
        status: pass
    human_judgment: false
  - id: D7
    description: "A calibração 5/1h e 30/1h barra ataque real sem barrar cliente legítimo (caso família, salão em dia excepcional)"
    verification: []
    human_judgment: true
    rationale: "A suíte prova que os números são os escritos, nunca que são os CERTOS. A conversão do D-08 (3 agendamentos → 5 tentativas) é hipótese de calibração sobre um comportamento — retry de double-booking — cuja frequência real ninguém mediu ainda. Só tráfego com Upstash provisionado responde, e o owner é quem decide se 5 é folgado ou apertado."

metrics:
  duration: ~20min
  completed: 2026-07-27

status: complete
---

# Phase 3 Plano 03: Camadas de telefone e teto por tenant — Summary

**A escrita pública passou a ter três camadas com papéis distintos — IP folgado, telefone apertado, teto por tenant — e só a última abre Sentry Issue, porque só ela significa ataque em andamento.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 2 (ambas TDD, 4 commits — RED e GREEN separados por task)
- **Files modified:** 4 (0 criados, 4 modificados)
- **Testes:** 307 → 321 (14 novos, zero regressão)

## Accomplishments

- **As três camadas agora fazem trabalhos diferentes, e é por isso que são três.** IP (10/10 min) barra o script ingênuo sem punir CGNAT; telefone (5/1 h por tenant) impede encher a agenda com um número só; teto por tenant (30/1 h) desacelera quem já derrotou as duas rotacionando IP e telefone. Uma camada única calibrada no meio seria frouxa contra o ataque e apertada contra o cliente real.
- **A conversão do D-08 está escrita no código, não escondida nele.** A decisão fala em "~3 agendamentos/h" e o limiter diz 5 — e a diferença tem um parágrafo explicando por quê, porque número no código que diverge da decisão sem justificativa vira "provavelmente um erro" na próxima leitura.
- **A Issue do teto por tenant é o alarme do cenário "ataque às 3h da manhã".** Sem ela, o profissional descobre pela agenda lotada de nomes falsos no dia seguinte. Com ela, o owner recebe um sinal raro e acionável — raro por construção, porque tudo o que é rotina foi mantido fora do Sentry Issues nos planos anteriores.
- **As constantes de calibração viraram verificáveis de fora.** A suíte captura a config de cada limiter instanciado, então mudar 5 para 50 quebra um teste com nome explícito em vez de passar despercebido num diff.

## Task Commits

1. **Task 1: instâncias `escrita_telefone` e `teto_tenant`** — `da087ce` (test, RED) → `5d5c6d3` (feat, GREEN)
2. **Task 2: checagem composta na action + Issue do teto** — `96ac887` (test, RED) → `e69dd24` (feat, GREEN)

**Plan metadata:** ver commit de fechamento (`docs(03-03)`).

## Files Created/Modified

- `src/lib/rate-limit.ts` — duas entradas novas em `LIMITERS` (`escrita_telefone`: `slidingWindow(5, '1 h')`, prefix `rl:escrita:tel`; `teto_tenant`: `slidingWindow(30, '1 h')`, prefix `rl:escrita:tenant`), ambas com `timeout: 500` e o mesmo `verificarLimite` fail-open; comentário-conversão do D-08 e declaração do papel PARCIAL do teto (D-09)
- `src/lib/__tests__/rate-limit.test.ts` — o fake do `Ratelimit` passou a registrar as configs instanciadas e a repassar o prefixo no `limit()`; 8 casos novos (calibração + roteamento + bloqueio + fail-open de cada camada), o caso de "camada sem limiter" migrou para `leitura_ip`, e o caso de chave composta virou asserção sobre o que de fato viajou ao fornecedor
- `src/app/actions/public-booking.ts` — `Promise.all` das duas camadas logo após `const tenantId`, antes da consulta de serviço; ramo de telefone com log aguardado + `capturarEventoTenant`; ramo do teto com os mesmos dois destinos **mais** `reportarFalhaSilenciosaAguardando('ratelimit:teto_tenant_atingido', …)`; ambos protegidos por try/catch que só faz `console.error`
- `src/app/actions/__tests__/public-booking-validacao.test.ts` — `adminQueResolveTenant()` (o fake vazio anterior parava em `slug_invalido`, antes das camadas novas), helper `respostaPorCamada`, `hashTenantId` REAL importado, 5 casos novos

## Decisions Made

**A posição das duas camadas é pós-resolução, e a alternativa era pior de um jeito específico.** Checar na fronteira (como manda o padrão 01-18) exigiria usar o slug como chave — e `slug` e `slug_gratuito` são dois textos que abrem a **mesma** agenda. Um script alternando entre os dois teria o dobro do orçamento de graça. Trocar exatidão por antecedência aqui seria trocar a defesa pela aparência dela. O custo assumido é que o ataque distribuído — o único que chega até essa linha — paga as duas consultas indexadas da resolução; o que o bloqueio economiza é tudo o que vem depois, onde mora o custo real: serviço, engine, RPC e INSERT.

**A Issue do teto mora na ação, não no módulo de rate limit.** Tentar centralizá-la em `verificarLimite` pareceu mais limpo por um instante, mas o mesmo `teto_tenant` não existe só aqui: o módulo é consumido por qualquer camada, e o plano 03-04 acrescenta a leitura. Issue disparada de dentro do módulo apareceria também onde bloqueio não significa ataque. O módulo abre Issue por **falha do fornecedor**; a ação abre Issue por **significado de negócio**. São duas perguntas diferentes e cada uma fica com quem sabe respondê-la.

**A variante do PostHog inverteu em relação ao 03-02, e a inversão é o desenho.** Lá era `capturarEventoServidor` porque o bloqueio de IP acontece antes de existir tenant; aqui é `capturarEventoTenant` porque o `tenant_id` já foi resolvido — e a taxa por tenant é o que permite ao owner distinguir "o produto inteiro está sob pressão" de "esta agenda específica está sendo atacada".

**5 tentativas/h em vez de 3 agendamentos/h.** `limit()` consome o token na tentativa, antes de o agendamento existir, e `slidingWindow` não faz refund. O caso que o D-08 protege — mãe agendando três serviços com o mesmo número — gasta 4 tokens se uma tentativa perder a corrida de double-booking e for repetida. Com 3, a terceira criança ficaria de fora por causa de uma colisão de horário. O "~" da decisão é margem explícita, e a conversão está registrada no código para o owner conseguir revisar o número real.

## Deviations from Plan

### 1. [Rule 1 — Bug no próprio teste] Hash falso do mock carregava o valor cru e dava falso-vermelho

- **Encontrado durante:** GREEN da Task 2 (a implementação estava correta e um caso continuou vermelho)
- **Issue:** o mock de `hashChaveRateLimit` foi escrito como `` `hash:${valor}` `` para dar retornos distintos por valor. A prova negativa de PII (`expect(enviado).not.toContain('11999998888')`) então acusava o **próprio mock**, não o código — o telefone aparecia no argumento porque o hash falso o continha por construção
- **Fix:** o mock virou um mapa de valores fixos (`'11999998888' → 'hash-do-telefone'`), preservando a distinção por valor sem carregar o valor cru
- **Arquivos modificados:** `src/app/actions/__tests__/public-booking-validacao.test.ts`
- **Commit:** `e69dd24` (junto do GREEN, por ser correção de artefato de teste e não de comportamento)
- **Lição que fica:** prova negativa de PII só vale se o **duplê** também respeitar o invariante — mock que embute o valor cru transforma a asserção mais importante da suíte numa asserção sobre si mesma

### 2. [Rule 2 — Correção] ABU-01/ABU-02/ABU-03 continuam NÃO marcados em REQUIREMENTS.md

- **Encontrado durante:** fechamento do plano
- **Por que não foi feito:** mesma razão registrada no 03-01 e no 03-02, ainda válida — a leitura pública segue sem teto (03-04), o honeypot não existe (03-05) e **o rate limit inteiro continua em no-op por falta das env vars do Upstash**. Marcar agora afirmaria que "script repetindo requisições não consegue lotar a agenda" está satisfeito quando nenhuma proteção está de fato ativa em execução. É o falso-verde que a Phase 01 reprovou quatro vezes
- **Ação:** os três seguem `[ ] / Pending`; quem fecha é o último plano da fase, com a evidência da fase inteira
- **Arquivos modificados:** nenhum (a deviation é a ausência de uma escrita)

---

**Total de deviations:** 2 (1 bug de teste corrigido, 1 correção que evita afirmação falsa de conclusão)
**Impacto no plano:** nenhum no escopo. Todo o comportamento pedido foi implementado como escrito.

Dois acréscimos dentro do escopo declarado:

1. Caso extra em `rate-limit.test.ts` provando o no-op das **duas** camadas novas sem credenciais — o `<behavior>` pedia o no-op genérico, e sem isto o D-04 valeria comprovadamente só para a camada de IP.
2. Migração do caso "camada sem limiter" de `teto_tenant` para `leitura_ip`. Não é acréscimo opcional: `teto_tenant` ganhou limiter neste plano, então o caso teria virado prova de algo falso. `leitura_ip` é a última camada sem instância e mantém viva a garantia de que camada nova nasce como PASSE.

## Issues Encountered

Um falso-vermelho, documentado como deviation 1. Fora dele, os dois ciclos RED/GREEN se comportaram como previsto: 9 falhas na RED da Task 1, 4 na RED da Task 2 (o quinto caso, o controle positivo, passa trivialmente por ser guarda de não-regressão).

## Verificação de fechamento

Rodada sobre o HEAD final (`e69dd24`), com saída real observada:

- `pnpm test` — **321 passed (321)**, 21 arquivos, exit 0
- `npx tsc --noEmit` — exit 0
- `pnpm lint` — exit 0, sem saída
- `pnpm build` — exit 0, 14 rotas geradas

## Known Stubs

`leitura_ip` continua declarada em `CamadaRateLimit` sem limiter — devolve PASSE, e o plano 03-04 a preenche. É o último resquício do stub herdado do 03-01, coberto pelo teste "devolve PASSE para as camadas ainda sem limiter próprio", que existe para que a ausência seja fato provado e não esquecimento.

`honeypot.captura` segue em `MENSAGENS_LOG` sem ponto de disparo (stub herdado do 03-02, resolvido no 03-05).

**O stub que mais importa não é de código:** sem `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` provisionadas, as três camadas estão em no-op e **nenhum bloqueio acontece em execução real**. As três existem, estão provadas e não protegem nada até o `user_setup` do 03-01 ser feito.

## Threat Flags

Nenhuma superfície nova fora do `<threat_model>` do plano. T-03-03-01 (ench-agenda com telefone único) mitigado pela camada de 5/1 h com chave telefone+tenant; T-03-03-02 (ataque distribuído) mitigado parcialmente e **por desenho** — o teto desacelera e a Issue alerta, e o enchimento total do horizonte segue como risco ACEITO pelo owner com detector; T-03-03-03 (telefone cru em chave/telemetria) mitigado por hash dentro do módulo + allowlist fechada + prova negativa (que este plano teve de aprender a fazer direito); T-03-03-04 (falso positivo no caso família) mitigado pela conversão 3 → 5 tentativas.

## Next Phase Readiness

Pronto para o **03-04** (leitura + env): `leitura_ip` é a última entrada a criar em `LIMITERS`, com o mesmo formato das três existentes, e o ponto de consumo é `obterSlotsPublicos`. Atenção ao item já registrado duas vezes: acrescentar as env vars do Upstash à lista de obrigatórias de `src/lib/env.ts` só é seguro depois de elas existirem no Railway, senão o boot de produção entra em crash-loop.

Pronto para o **03-05** (honeypot): nada deste plano o bloqueia.

Para o **03-06** (fechamento): os três ABU seguem abertos de propósito e a evidência acumulada de 03-01 a 03-05 é o que os fecha.

## Self-Check: PASSED

- `src/lib/rate-limit.ts` — FOUND (contém `slidingWindow(5, '1 h')` com `rl:escrita:tel` e `slidingWindow(30, '1 h')` com `rl:escrita:tenant`)
- `src/lib/__tests__/rate-limit.test.ts` — FOUND
- `src/app/actions/public-booking.ts` — FOUND (contém o `Promise.all` das duas camadas e `reportarFalhaSilenciosaAguardando('ratelimit:teto_tenant_atingido'` com `tenantHash`)
- `src/app/actions/__tests__/public-booking-validacao.test.ts` — FOUND
- Commits `da087ce`, `5d5c6d3`, `96ac887`, `e69dd24` — FOUND

---
*Phase: 03-anti-abuso-no-booking-p-blico*
*Completed: 2026-07-27*
