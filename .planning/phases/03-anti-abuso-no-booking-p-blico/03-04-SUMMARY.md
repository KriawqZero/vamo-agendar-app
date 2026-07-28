---
phase: 03-anti-abuso-no-booking-p-blico
plan: 04
subsystem: security
tags: [rate-limit, upstash, sliding-window, leitura-publica, fail-fast, env, anti-pii]

requires:
  - phase: 03-01
    provides: "verificarLimite, ipDoVisitante, hashChaveRateLimit, o tipo CamadaRateLimit e o discriminante muitas_tentativas já roteado nos dois Record de copy"
  - phase: 03-02
    provides: "logOperacionalAguardando com camada/chaveHash na allowlist fechada e o código ratelimit.bloqueio"
  - phase: 01-fechar-a-superficie-anonima
    provides: "o padrão 01-18 (validar na fronteira ANTES de createAdminClient) e o retorno discriminado no lugar de throw"
provides:
  - "Camada leitura_ip (slidingWindow 60/'1 m', prefix rl:leitura:ip) — a quarta e última do desenho da fase"
  - "Teto de leitura na fronteira de obterSlotsPublicos, antes de createAdminClient, com telemetria de rotina e zero copy nova"
  - "Decisão de manter obterDadosBookingPublico FORA do teto escrita no próprio código e travada por teste"
  - "UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN em OBRIGATORIAS_EM_PRODUCAO (D-04) — fecha o falso-verde do rate limiter desligado em silêncio"
affects: [03-05-honeypot, 03-06-fechamento]

tech-stack:
  added: []
  patterns:
    - "Camada de rate limit sobre LEITURA só é viável onde existe canal de erro discriminado; onde o contrato é null→notFound(), o teto vira 404 e a defesa fica pior que a ausência dela"
    - "Erro assimétrico de calibração declarado no código: folgado demais reduz proteção (reversível), apertado demais adiciona fricção a cliente real (dano irreversível)"

key-files:
  created: []
  modified:
    - src/lib/rate-limit.ts
    - src/lib/__tests__/rate-limit.test.ts
    - src/app/actions/public-booking.ts
    - src/app/actions/__tests__/public-booking-validacao.test.ts
    - src/lib/env.ts
    - src/lib/__tests__/env.test.ts

key-decisions:
  - "obterDadosBookingPublico fica FORA do teto (desvio do D-06 ratificado pelo owner em 2026-07-27): o contrato null→notFound() converteria bloqueio em 'estabelecimento não existe' para visitante legítimo sob CGNAT — indistinguível de link quebrado"
  - "60/min é o teto mais folgado dos quatro e a folga é o REQUISITO, não uma concessão: quem 60/min barra é o script que varre a grade sem ler tela (D-10)"
  - "MotivoSlotsPublicos alargado no alias PRÓPRIO; MotivoLeituraPublica segue com exatamente dois membros — a resolução de perfil não sabe produzir estouro de rate limit"
  - "As duas env vars do Upstash são o caso mais puro do critério (a) da lista de obrigatórias: a ausência não FALHA, ela LIBERA tudo em silêncio"
  - "A garantia 'camada sem limiter é PASSE' migrou de leitura_ip para um nome fora do mapa — com as quatro instanciadas, o teste antigo provaria algo que deixou de ser verdade"

patterns-established:
  - "Decisão de NÃO proteger uma superfície mora em comentário no topo da própria função protegida-de-menos, e é travada por teste que falha se alguém a 'consertar' por simetria"

requirements-completed: []

coverage:
  - id: D1
    description: "Estouro do teto de leitura devolve muitas_tentativas ANTES de createAdminClient, sem virar slug_invalido"
    requirement: "ABU-01"
    verification:
      - kind: unit
        ref: "src/app/actions/__tests__/public-booking-validacao.test.ts#recusa com `muitas_tentativas` SEM tocar o banco quando a janela estourou"
        status: pass
      - kind: unit
        ref: "src/app/actions/__tests__/public-booking-validacao.test.ts#consulta a camada `leitura_ip` com o IP do visitante"
        status: pass
    human_judgment: false
  - id: D2
    description: "obterDadosBookingPublico NÃO consulta rate limit — bloqueio de leitura nunca vira notFound()/404"
    requirement: "ABU-02"
    verification:
      - kind: unit
        ref: "src/app/actions/__tests__/public-booking-validacao.test.ts#obterDadosBookingPublico NÃO passa pelo rate limit — bloqueio nunca vira 404"
        status: pass
    human_judgment: false
  - id: D3
    description: "A calibração é 60/'1 m' no prefixo rl:leitura:ip, com o mesmo fail-open e no-op das demais camadas"
    verification:
      - kind: unit
        ref: "src/lib/__tests__/rate-limit.test.ts#usa slidingWindow de 60 leituras por minuto no prefixo rl:leitura:ip"
        status: pass
      - kind: unit
        ref: "src/lib/__tests__/rate-limit.test.ts#PASSA com Issue sintética quando o fornecedor REJEITA (fail-open, D-02)"
        status: pass
      - kind: unit
        ref: "src/lib/__tests__/rate-limit.test.ts#devolve PASSE sem credenciais do Upstash (no-op, D-04)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Entrada malformada continua recusada pelos discriminantes existentes ANTES de gastar comando no Redis"
    verification:
      - kind: unit
        ref: "src/app/actions/__tests__/public-booking-validacao.test.ts#entrada malformada é recusada ANTES de gastar comando no Redis"
        status: pass
    human_judgment: false
  - id: D5
    description: "Bloqueio de leitura fica em log + PostHog, sem Issue, e o IP não aparece cru em nenhum argumento"
    verification:
      - kind: unit
        ref: "src/app/actions/__tests__/public-booking-validacao.test.ts#emite log pseudonimizado + evento agregado, e NENHUMA Issue"
        status: pass
    human_judgment: false
  - id: D6
    description: "Produção sem as duas vars do Upstash derruba o boot nomeando ambas; fora de produção não lança e pnpm build local segue verde"
    requirement: "ABU-02"
    verification:
      - kind: unit
        ref: "src/lib/__tests__/env.test.ts#em produção sem as DUAS do Upstash lança nomeando ambas na mesma mensagem"
        status: pass
      - kind: unit
        ref: "src/lib/__tests__/env.test.ts#fora de produção, ausência das do Upstash NÃO lança (no-op declarado — D-04)"
        status: pass
      - kind: build
        ref: "pnpm build local sem as vars — exit 0, 14 rotas"
        status: pass
    human_judgment: false
  - id: D7
    description: "Cliente legítimo navegando o calendário (dezenas de chamadas em minutos) nunca esbarra em 60/min"
    verification: []
    human_judgment: true
    rationale: "Backstop declarado no próprio plano. A suíte prova que o número é o escrito, jamais que é o certo — e a pergunta 'quantas consultas de grade uma sessão real dispara' nunca foi medida com tráfego. Só se responde com Upstash provisionado e uso real; o owner é quem decide se 60 é folgado."

metrics:
  duration: ~18min
  completed: 2026-07-27

status: complete
---

# Phase 3 Plano 04: Teto de leitura e fail-fast das credenciais do Upstash — Summary

**A grade de slots ganhou o quarto e mais folgado teto da fase, e a ausência das credenciais do Redis deixou de ser um detalhe de configuração para virar motivo de o boot de produção não subir.**

## Performance

- **Duration:** ~18 min
- **Tasks:** 2 (ambas TDD, 4 commits — RED e GREEN separados por task)
- **Files modified:** 6 (0 criados, 6 modificados)
- **Testes:** 321 → 336 (15 novos, zero regressão)

## Accomplishments

- **O eixo que faltava está coberto.** As três camadas anteriores protegem ESCRITA — o abuso que lota a agenda. Esta protege LEITURA, onde o abuso não cria nada: só martela o banco e mapeia a agenda alheia. São problemas diferentes e por isso o número é outro (60/min contra 10/10 min da escrita por IP).
- **A decisão de NÃO proteger uma superfície ficou tão explícita quanto as que protegem.** `obterDadosBookingPublico` tem hoje, no topo, um comentário que explica por que o teto não está lá — e um teste que falha se alguém o acrescentar "por simetria". Ausência sem registro é indistinguível de esquecimento; com registro, é desenho.
- **O falso-verde estrutural da fase inteira foi fechado.** Até este plano, as quatro camadas podiam estar perfeitamente implementadas e provadas e, em produção, não bloquear absolutamente nada — porque sem `UPSTASH_REDIS_REST_URL`/`_TOKEN` o módulo inteiro entra em no-op. Agora produção não sobe sem elas.
- **Nenhuma copy nova, nenhuma tela nova, nenhuma fricção nova.** O discriminante `muitas_tentativas` já estava roteado nos dois `Record` desde o 03-01, então o bloqueio de leitura reusa a caixa de erro existente da Phase 01 — a UI não foi tocada neste plano (D-10).

## Task Commits

1. **Task 1: teto de leitura por IP em `obterSlotsPublicos`** — `8c8e89a` (test, RED) → `898b912` (feat, GREEN)
2. **Task 2: credenciais do Upstash na lista de obrigatórias (D-04)** — `8584663` (test, RED) → `2f41fc1` (feat, GREEN)

**Plan metadata:** ver commit de fechamento (`docs(03-04)`).

## Files Created/Modified

- `src/lib/rate-limit.ts` — entrada `leitura_ip` em `LIMITERS` (`slidingWindow(60, '1 m')`, prefix `rl:leitura:ip`, `timeout: 500`), com o racional da folga e do erro assimétrico de calibração escrito junto; comentários de topo do `CamadaRateLimit` e do `LIMITERS` atualizados (as quatro camadas passam a ter instância)
- `src/lib/__tests__/rate-limit.test.ts` — bloco novo de 5 casos para `leitura_ip` (calibração, roteamento por prefixo com chave hasheada, bloqueio sem Issue, fail-open por rejeição, no-op sem credenciais); o caso "camada sem limiter" migrou de `leitura_ip` para um nome fora do mapa via `as CamadaRateLimit`
- `src/app/actions/public-booking.ts` — `MotivoSlotsPublicos` alargado com `'muitas_tentativas'`; guarda `verificarLimite('leitura_ip', [ip])` em `obterSlotsPublicos` depois das validações de `dateStr`/`duracaoMinutos` e antes de `createAdminClient()`, com log aguardado + `capturarEventoServidor` protegidos por try/catch; comentário de decisão no topo de `obterDadosBookingPublico`
- `src/app/actions/__tests__/public-booking-validacao.test.ts` — bloco novo de 7 casos para `obterSlotsPublicos` (bloqueio sem tocar o banco + asserção negativa de `slug_invalido`, argumentos da camada, telemetria com prova negativa de PII, telemetria falhando sem mudar o retorno, entrada malformada sem gastar Redis, controle positivo, e a trava do `obterDadosBookingPublico`)
- `src/lib/env.ts` — as duas vars do Upstash em `OBRIGATORIAS_EM_PRODUCAO` (14 → 16); comentário (b) registra o precedente da Phase 3 e por que o caso delas é o critério (a) na forma mais pura; contagem do comentário (e) corrigida de "quatorze" para "dezesseis"
- `src/lib/__tests__/env.test.ts` — contagem atualizada, caso das duas credenciais na lista, caso da mensagem nomeando ambas em produção, caso do não-lançamento fora de produção

## Decisions Made

**`obterDadosBookingPublico` ficou de fora, e a razão não é custo — é o formato do canal de erro.** Aquela função devolve `null` e `page.tsx` converte em `notFound()`. Um teto ali não teria como dizer "muitas tentativas": o bloqueio sairia como 404. Um visitante legítimo atrás de CGNAT de operadora móvel — o cenário que a fase inteira teme — veria "estabelecimento não existe" e concluiria que o link do profissional está quebrado. É o pior desfecho possível, e pior que a ausência da proteção. O vetor real de varredura também não é o page load: é uma requisição por visita, contra dezenas de consultas de grade na mesma sessão. Desvio do D-06 ratificado pelo owner durante o plan-phase; o registro está no código, não só aqui.

**A folga do 60/min é requisito, e o erro de calibração foi escolhido de propósito para um lado.** Calibrar folgado demais só reduz proteção contra o script — reversível, e o script continua limitado pelas outras três camadas quando tenta escrever. Calibrar apertado demais adiciona fricção a cliente real, que é dano irreversível: quem vê "muitas tentativas" escolhendo horário fecha a aba e não volta. Como a escolha é assimétrica, ela está escrita como assimétrica no comentário do limiter, e não como um número solto.

**A garantia "camada sem limiter é PASSE" precisou mudar de sujeito.** O 03-03 já a havia migrado de `teto_tenant` para `leitura_ip` pelo mesmo motivo que agora obriga a migrar de novo: a camada usada como prova ganhou instância. Com as quatro instanciadas, manter o teste em qualquer nome real seria provar algo falso. Passou a usar `'camada_futura' as CamadaRateLimit`. O teste não é decorativo — é ele que impede um plano futuro de declarar uma camada em `CamadaRateLimit` e, sem instanciá-la, introduzir bloqueio acidental.

**As duas vars do Upstash são o exemplo canônico do critério (a) da lista.** O critério diz "a ausência falha em silêncio ou falha tarde". No caso delas é mais forte que isso: a ausência não falha de jeito nenhum — ela LIBERA. O produto sobe anunciando quatro camadas de proteção e não bloqueia nada, e nenhum sintoma aparece até alguém atacar. Nenhuma outra variável da lista tem esse formato.

## Deviations from Plan

### 1. [Rule 1 — Doc desatualizada no código] Contagem "quatorze" no comentário (e) de `env.ts`

- **Encontrado durante:** Task 2
- **Issue:** o comentário (e) do arquivo dizia "Quatro das quatorze são `NEXT_PUBLIC_*`". Com as duas entradas novas, a lista passou a ter 16 e a frase virou falsa
- **Fix:** "quatorze" → "dezesseis" (as quatro `NEXT_PUBLIC_*` seguem quatro)
- **Arquivos modificados:** `src/lib/env.ts`
- **Commit:** `2f41fc1` (junto do GREEN, por ser a mesma edição)
- **Por que corrigir e não ignorar:** aquele comentário é o que explica por que o acesso a `process.env` precisa ser dinâmico. Número errado nele é a primeira coisa que faz um leitor futuro desconfiar do resto do parágrafo — e o resto do parágrafo é a única defesa documentada contra o modo de falha W7

### 2. [Rule 2 — Correção] ABU-01 e ABU-02 continuam NÃO marcados em REQUIREMENTS.md

- **Encontrado durante:** fechamento do plano
- **Por que não foi feito:** mesma razão registrada no 03-01, 03-02 e 03-03, e ela ficou mais forte com este plano, não mais fraca. As quatro camadas agora existem, mas o honeypot é do 03-05 e — sobretudo — **as env vars do Upstash seguem não provisionadas**, então nada bloqueia em execução real. Marcar ABU-01 agora afirmaria que "script repetindo requisições não consegue lotar a agenda" está satisfeito num ambiente onde toda requisição passa. É o falso-verde que a Phase 01 reprovou quatro vezes
- **Ação:** ambos seguem `[ ] / Pending`; quem fecha é o 03-06, com a evidência da fase inteira e as credenciais provisionadas
- **Arquivos modificados:** nenhum (a deviation é a ausência de uma escrita)

---

**Total de deviations:** 2 (1 correção de comentário desatualizado, 1 correção que evita afirmação falsa de conclusão)
**Impacto no plano:** nenhum no escopo. Todo o comportamento pedido foi implementado como escrito.

Três acréscimos dentro do escopo declarado:

1. **Teste travando `obterDadosBookingPublico` fora do rate limit.** O `<behavior>` do plano não o pedia — pedia só que a função não fosse tocada. Sem o teste, a decisão viveria num comentário, e comentário não impede ninguém de "consertar a assimetria" num plano futuro. Como a decisão é um desvio ratificado de uma decisão anterior (D-06), ela merece trava executável.
2. **Caso de telemetria falhando sem mudar o retorno** na leitura, espelhando o que já existia na escrita: o try/catch protegido é fácil de perder num refactor e o efeito seria transformar Sentry fora do ar em erro para o visitante.
3. **Caso de no-op sem credenciais para `leitura_ip`.** O `<behavior>` pedia "no-op igual às demais camadas"; sem um caso próprio, o D-04 valeria comprovadamente para as três de escrita e por analogia para a quarta.

## Issues Encountered

Nenhum. Os dois ciclos RED/GREEN se comportaram como previsto: 8 falhas na RED da Task 1 (as demais passam trivialmente por serem controles positivos e de no-op), 3 na RED da Task 2.

## Verificação de fechamento

Rodada sobre o HEAD final (`2f41fc1`), com saída real observada:

- `pnpm test` — **336 passed (336)**, 21 arquivos, exit 0
- `npx tsc --noEmit` — exit 0
- `pnpm lint` — exit 0, sem saída
- `pnpm build` — exit 0, 14 rotas geradas (local, **sem** as vars do Upstash: confirma que a validação é de runtime de produção e não de build)

## Known Stubs

Nenhum stub de código introduzido por este plano — `leitura_ip` era o último e foi preenchido aqui. `honeypot.captura` segue em `MENSAGENS_LOG` sem ponto de disparo (stub herdado do 03-02, resolvido no 03-05).

**O stub que continua importando não é de código, e este plano mudou a natureza dele:** sem `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` provisionadas, as quatro camadas seguem em no-op e nenhum bloqueio acontece em execução real. A diferença é que agora isso deixou de ser um estado silencioso e passou a ser um estado que impede o deploy de produção de subir — que é exatamente o ponto do D-04.

## User Setup Required

**Provisionar as duas credenciais no Railway ANTES do próximo deploy de produção.** A partir deste plano, o boot de produção sem elas encerra com código 1 nomeando ambas — de propósito. É a **ampliação deliberada** da janela de crash-loop já registrada nos Blockers do STATE: um deploy feito antes do provisionamento não sobe.

- Upstash Console → Redis → database → REST API (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`)
- Criar os databases na mesma conta do QStash; dois (prod e dev) se o plano permitir, senão só o de produção — dev opera em no-op declarado (D-05)
- Dev local continua sem elas por desenho: `pnpm build` e `pnpm dev` seguem funcionando

**Backstop de calibração (D7 do coverage):** com tráfego real, conferir se sessão legítima de escolha de horário chega perto de 60 consultas de grade por minuto. Se chegar, o número sobe — o erro para o folgado é o lado seguro.

## Threat Flags

Nenhuma superfície nova fora do `<threat_model>` do plano.

- **T-03-04-01** (varredura da grade) — mitigado: `leitura_ip` na fronteira, antes de qualquer I/O.
- **T-03-04-02** (falso positivo sob CGNAT virando 404/erro) — mitigado nas duas frentes: teto folgado de 60/min **e** page load deliberadamente fora do limite, com trava de teste.
- **T-03-04-03** (rate limit desligado em silêncio em produção) — mitigado: boot fail-fast com as duas vars na lista.
- **T-03-04-04** (cota do Upstash Free esgotada jogando tudo em fail-open) — segue **aceito** com detector, como registrado; a economia de comando por entrada malformada (Pitfall 8) está provada por teste, e o registro em PENDENCIAS é do 03-06.

## Next Phase Readiness

Pronto para o **03-05** (honeypot): nada deste plano o bloqueia, e a superfície de escrita já tem os três pontos de telemetria no formato que ele vai reusar.

Para o **03-06** (fechamento): as quatro camadas estão implementadas e provadas. O que falta para os ABU serem marcáveis não é código — é o provisionamento das credenciais mais o honeypot. A entrada de PENDENCIAS sobre a cota do Upstash Free (T-03-04-04) também é dele.

## Self-Check: PASSED

- `src/lib/rate-limit.ts` — FOUND (contém `slidingWindow(60, '1 m')` com `prefix: 'rl:leitura:ip'`)
- `src/lib/__tests__/rate-limit.test.ts` — FOUND
- `src/app/actions/public-booking.ts` — FOUND (contém `verificarLimite('leitura_ip'` antes do `createAdminClient()` de `obterSlotsPublicos`; `MotivoLeituraPublica` segue com dois membros; `obterDadosBookingPublico` sem `verificarLimite`)
- `src/app/actions/__tests__/public-booking-validacao.test.ts` — FOUND
- `src/lib/env.ts` — FOUND (contém `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`, 16 entradas)
- `src/lib/__tests__/env.test.ts` — FOUND
- Commits `8c8e89a`, `898b912`, `8584663`, `2f41fc1` — FOUND

---
*Phase: 03-anti-abuso-no-booking-p-blico*
*Completed: 2026-07-27*
</content>
</invoke>
