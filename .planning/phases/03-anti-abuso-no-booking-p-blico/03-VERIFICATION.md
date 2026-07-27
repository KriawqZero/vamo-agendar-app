---
phase: 03-anti-abuso-no-booking-p-blico
verified: 2026-07-27T23:41:55Z
status: human_needed
score: 11/14 must-haves verificados (o 12º passou a CUMPRIDO por revisão do must_have, não por mudança de código)
behavior_unverified: 3
overrides_applied: 1
override_log:
  - date: 2026-07-27
    by: owner
    target: "gap #1 — desvio do D-10 pelo WR-03 (c6c43c2)"
    decision: ratified
    rationale: "Apresentado ao owner pelo orquestrador com os dois lados medidos. A premissa do D-10 ('quem é barrado de verdade é script que não lê tela') vale para o atacante e falha para várias pessoas reais atrás do mesmo IP (CGNAT, wifi corporativo) — para essas, a caixa genérica atribui a causa errada. O owner escolheu a honestidade da causa sobre o 'zero copy nova'. Custos aceitos e nomeados no 03-CONTEXT.md §D-10: copy pública a mais para manter, o bloqueio revela ao atacante que existe limite e sua janela, e o botão com contagem é fricção visível — aceita porque só aparece DEPOIS do bloqueio, nunca no caminho feliz, que é o que a Fricção Zero protege."
    recorded_in:
      - ".planning/phases/03-anti-abuso-no-booking-p-blico/03-CONTEXT.md (§D-10, anotação datada ao lado do texto original — nunca reescrita, precedente da Phase 01)"
      - ".planning/phases/03-anti-abuso-no-booking-p-blico/03-01-PLAN.md (must_haves das linhas 154 e 208-209 marcados SUPERSEDIDO)"
      - ".planning/phases/03-anti-abuso-no-booking-p-blico/03-04-PLAN.md (truth do must_have e <done> anotados)"
    reversibility: "reversible — `git revert c6c43c2` restaura COPY_ERRO_SLOTS e o botão sem contagem"
    orchestrator_note: "O orquestrador revisou as quatro asserções de teste alteradas pelo fixer e APROVOU esta sem conferir contra o D-10. O agente de fix não recebeu o 03-CONTEXT.md e não tinha como saber que mexia numa decisão do owner; a checagem era do orquestrador. Registrado porque foi a suíte verde deixando de sinalizar a divergência — o mesmo mecanismo de falso-verde que esta fase existe para não repetir."
gaps:
  - truth: "Bloqueio de LEITURA reusa a caixa de erro existente da Phase 01 com zero copy nova — o mesmo discriminante mapeia para a copy existente de erro de slots (must_have 03-01 e 03-04, D-10)"
    status: resolved-by-ratification
    resolution: "RATIFICADO pelo owner em 2026-07-27 — ver `override_log` acima. O must_have foi revisado, o código NÃO mudou. O achado abaixo fica como estava: descreve corretamente o estado que motivou a decisão."
    reason: "Desvio deliberado introduzido DEPOIS dos SUMMARYs, pelo WR-03 da revisão de código (commit c6c43c2). `COPIA_DA_CAIXA_DE_HORARIOS.muitas_tentativas` passou a apontar para `COPY_MUITAS_TENTATIVAS` e o botão 'Tentar de novo' vira 'Aguarde Ns' desabilitado por 10 s. O argumento do fixer é bom (a copy antiga informava causa errada ao visitante bloqueado), mas contradiz a letra de uma decisão do OWNER (D-10) e nenhuma ratificação do owner foi registrada — ao contrário do desvio do D-06, que TEM ratificação escrita de 2026-07-27. A asserção de teste que pinava o comportamento antigo foi reescrita para pinar o novo, então a suíte verde agora certifica o oposto do must_have."
    artifacts:
      - path: "src/app/book/[slug]/mensagens.ts"
        issue: "linha 169 — `muitas_tentativas: COPY_MUITAS_TENTATIVAS` no Record da caixa de horários; o must_have exigia `COPY_ERRO_SLOTS`"
      - path: "src/app/book/[slug]/etapas/EtapaDataHora.tsx"
        issue: "linhas 137-147 — botão desabilitado com contagem regressiva 'Aguarde Ns'; elemento de UI novo no caminho de falha, que o D-10 pedia que não existisse"
      - path: "src/app/book/__tests__/mensagens.test.ts"
        issue: "asserção alterada para pinar a copy nova — a suíte deixou de ser capaz de detectar o desvio"
    missing: []
    missing_resolved:
      - "✅ Decisão do owner: RATIFICAR o desvio — tomada em 2026-07-27, registrada no `override_log` do frontmatter"
      - "✅ Ratificação registrada em 03-CONTEXT.md junto do D-10, no mesmo formato do D-06"
behavior_unverified_items:
  - truth: "SC1 — script repetindo requisições para de conseguir criar agendamentos ao bater o teto (pela Server Action)"
    test: "Com as credenciais de DEV do Upstash no ambiente, subir `next start` e rodar um script repetindo POSTs de criação contra o mesmo slug"
    expected: "Os primeiros criam; a partir do teto a resposta vira `muitas_tentativas` e nenhum agendamento novo entra na agenda. Conferir também que os contadores aparecem no database de dev, e NÃO no de produção"
    why_human: "Sem `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` o objeto `LIMITERS` é `{}` e as quatro camadas devolvem PASSE — hoje nenhuma requisição é barrada em ambiente nenhum. A suíte prova a DECISÃO do app sobre a resposta do fornecedor (limiter mockado); nunca prova a resposta do fornecedor. Provisionamento é ação exclusiva do owner, registrada como gate de deploy em docs/PENDENCIAS.md"
  - truth: "SC2 — o cliente legítimo não percebe nada, INCLUSIVE nos dois falsos-positivos (autofill preenchendo o honeypot; CGNAT barrando gente real)"
    test: "(1) Salvar endereço no autofill e conferir que `info_adicional` continua vazio ao autopreencher; (2) percorrer a etapa de contato só pelo teclado; (3) abrir /book/<slug> em celular e desktop conferindo que nada se deslocou; (4) com Redis real, medir a latência acrescentada ao caminho de sucesso (são 3 idas ao Redis: escrita_ip, o Promise.all telefone+tenant, e o consumo do teto_tenant DEPOIS do INSERT); (5) depois de abrir ao público, acompanhar a taxa de `booking_honeypot`"
    expected: "Campo vazio, foco pulando direto de WhatsApp para o CTA, zero deslocamento de layout, atraso imperceptível, e taxa de honeypot compatível com tráfego de bot"
    why_human: "A suíte prova a FORMA dos atributos lendo o fonte do disco; nunca o comportamento de um motor de layout nem de uma heurística de autofill proprietária. E os dois falsos-positivos FALHAM EM SILÊNCIO: ninguém reclama de página que barrou, e muito menos de um agendamento que a tela confirmou"
  - truth: "SC3 — o owner consegue ver quantas requisições foram barradas e por qual chave"
    test: "Provocar um bloqueio real e conferir nos painéis: Sentry Log `ratelimit.bloqueio` com `camada` e `chaveHash` (e SEM IP/telefone crus); PostHog `booking_rate_limited` e `booking_honeypot` no Activity; Sentry Issue `ratelimit:teto_tenant_atingido` carregando só `tenantHash`"
    why_human: "Em no-op nada é barrado, logo nada é emitido. E teste verde NÃO fecha observabilidade — é a lição literal da quick task 260724, cujo incidente de origem era exatamente 'nada apareceu em painel nenhum'. Sentry Logs é produto separado de Issues: DSN válido não garante log ingerido"
human_verification:
  - test: "✅ RESOLVIDO 2026-07-27 — Ratificar ou reverter o desvio do D-10 (ver `gaps` acima)"
    expected: "Decisão registrada — override no frontmatter, ou revert do commit c6c43c2"
    why_human: "É decisão de produto do owner sobre a experiência de um cliente real barrado, não defeito de código"
    resolution: "Owner RATIFICOU o desvio. Um item de tela NASCE desta decisão e entra no UAT: ver de fato a copy nova e o botão com contagem regressiva em navegador real (mobile e desktop), confirmando que a contagem não trava o visitante além da janela nem desloca o layout"
  - test: "Provisionar os 2 databases Redis na Upstash e as env vars no Railway ANTES do próximo deploy de produção"
    expected: "Boot de produção sobe; sem elas o boot cai listando as duas (D-04)"
    why_human: "Ação de painel, exclusiva do owner. Gate de DEPLOY já registrado em docs/PENDENCIAS.md"
  - test: "Medir qual header de IP a Railway realmente entrega: `curl -H 'X-Forwarded-For: 1.2.3.4' -H 'X-Real-IP: 5.6.7.8'` contra o deploy, comparando o `chaveHash` do Sentry Log com o hash de cada candidato"
    expected: "O app enxerga 5.6.7.8. E a Issue `ratelimit:ip_indeterminavel` NÃO aparece em produção"
    why_human: "Item (d) aberto pelo CR-01. A ordem `x-real-ip` → última entrada do XFF é estritamente mais difícil de forjar que a anterior, mas continua sendo inferência: a fonte da garantia era fórum oficial, não doc formal, e duas das quatro camadas dependem dela"
  - test: "Calibração com dado real: uma sessão legítima de escolha de horário chega perto de 60 consultas/min? Um salão movimentado divulgando o link estoura 10 escritas/10 min no mesmo IP?"
    expected: "Folga confortável nos dois. Se chegar perto, o número SOBE"
    why_human: "O erro é assimétrico: folgado demais reduz proteção e é reversível; apertado demais adiciona fricção a cliente real e o dano é irreversível"
prohibitions_flagged:
  - statement: "O rate limit NUNCA devolve sucesso falso — sucesso falso é EXCLUSIVO do honeypot (D-07)"
    disposition: "judgment-tier — veredito NÃO-AUTORITATIVO de leitura de código: CUMPRIDA. Os quatro pontos de bloqueio devolvem `{ ok: false, motivo: 'muitas_tentativas' }`; o único `ok: true` mentiroso do arquivo é o do honeypot. unverified-prohibition — human review recommended"
  - statement: "Telefone, IP e org_id crus NUNCA entram em telemetria nem como chave no Redis — somente hash com salt (D-11)"
    disposition: "judgment-tier — veredito NÃO-AUTORITATIVO: CUMPRIDA no código lido (`montarChave` hasheia cada parte; allowlist do log valida forma 16-hex desde o WR-07; props do PostHog carregam só `camada`; `capturarEventoTenant` hasheia o org_id). A confirmação de que nenhum valor cru chega ao painel é o item (b). unverified-prohibition — human review recommended"
  - statement: "O campo armadilha NUNCA é perceptível a usuário real"
    disposition: "judgment-tier — veredito NÃO-AUTORITATIVO: cumprida na FORMA (off-screen por style inline, aria-hidden duplo, tabIndex -1, autoComplete off, nome fora do vocabulário de autofill, sem label). O comportamento real de navegador é o item (c). unverified-prohibition — human review recommended"
---

# Phase 3: Anti-abuso no booking público — Relatório de Verificação

**Goal (ROADMAP):** Um script repetindo requisições não consegue lotar a agenda de um profissional, e o cliente legítimo não percebe absolutamente nada
**Verificado em:** 2026-07-27T23:41:55Z, sobre `f274599` (branch `gsd/phase-03-anti-abuso-no-booking-p-blico`)
**Status:** gaps_found
**Re-verificação:** Não — verificação inicial

---

## Veredito sobre a recusa dos executores

Os seis executores se recusaram a fechar ABU-01, ABU-02 e ABU-03, e o plano 03-06 escreveu
o porquê dentro de cada linha de `REQUIREMENTS.md`. **A recusa está correta e é bem
fundamentada.** Ela não é evasão: é a leitura certa do próprio mecanismo que eles
construíram.

O argumento se sustenta em fato verificável, não em opinião. `src/lib/rate-limit.ts:101`
constrói o objeto `LIMITERS` a partir de um ternário sobre `redis`, que por sua vez só
existe quando as duas variáveis do Upstash estão no ambiente. Sem elas, `LIMITERS` é `{}`,
`verificarLimite` cai no `if (!limiter) return true` da linha 437 e **as quatro camadas
devolvem PASSE**. Não é degradação parcial — é ausência total de bloqueio, por desenho
(D-04), e nenhum executor tinha como mudar isso: provisionar é ação de painel do owner.

Onde a recusa merece ser refinada é na granularidade, e é isso que este relatório entrega:
os três requisitos não estão todos abertos pela mesma razão, e tratá-los como um bloco só
esconde quanto trabalho está de fato pronto.

**Fechado por código, nada mais falta:** as quatro camadas de `slidingWindow` com chave
pseudonimizada e teto de latência; o fail-open nos dois modos de falha do fornecedor; o
no-op declarado em dev com fail-fast de boot em produção; o honeypot com sucesso falso —
que é a única defesa da fase **ativa hoje**, porque não consulta Redis; a assimetria
erro-honesto-no-rate-limit / sucesso-falso-só-no-honeypot; o teto por tenant contando
criações e não tentativas; e os quatro pontos de emissão de telemetria fora do caminho da
resposta. Nada disso é promessa: são 381 testes verdes em 23 arquivos, e a maioria deles
exercita comportamento (bloqueio, fail-open, throttle, ausência de I/O no caminho de
rejeição), não presença de símbolo.

**Bloqueado em provisionamento do owner (não é gap de código):** o SC1 pela Server Action.
Entre o HEAD e esse critério ser verdade existem exatamente duas variáveis de ambiente e um
script de prova. Nenhum plano novo fecha isso.

**Só olho humano fecha:** o SC3 inteiro (painel), a metade de falso-positivo do SC2
(autofill, layout, CGNAT), e a calibração dos números. A lição da quick task 260724 está
escrita no próprio plano e vale literalmente: teste verde não fecha observabilidade.

**A metade do SC1 que ninguém precisa esperar já está fechada:** o vetor da Data API foi
fechado na Phase 1 (`supabase/migrations/20260722060000_fecha_data_api_para_anon.sql`), e é
por isso que o rate limit na Server Action não é teatro contornável — a dependência que o
próprio ROADMAP registra entre Phase 1 e Phase 3 foi honrada.

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidência |
|---|---|---|---|
| 1 | **SC1a** — Script não consegue criar agendamento escrevendo direto na Data API | ✓ VERIFIED | `supabase/migrations/20260722060000_fecha_data_api_para_anon.sql` presente; todo o caminho público usa `createAdminClient()` no servidor. Fechado pela Phase 1, dependência declarada no ROADMAP |
| 2 | **SC1b** — Script repetindo requisições para de criar agendamentos ao bater o teto (Server Action) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Código completo e ligado: `rate-limit.ts:111-193` (4 limiters), consumidos em `public-booking.ts:575`, `:666-672`, `:912`, `:1116`. Mas `LIMITERS = {}` sem as env vars → toda requisição passa. Nenhuma execução contra Redis real |
| 3 | **SC2a** — Nenhum CAPTCHA, nenhum campo visível a mais, nenhuma etapa nova no fluxo legítimo | ✓ VERIFIED | Zero ocorrência de captcha/turnstile/hcaptcha em `src/` (única menção é o comentário que os proíbe). Honeypot off-screen por `style` inline + `aria-hidden` + `tabIndex={-1}`. Etapas do wizard inalteradas. Campo vazio/ausente segue fluxo normal (controle positivo na suíte) |
| 4 | **SC2b** — O cliente legítimo não percebe nada TAMBÉM nos falsos-positivos (autofill, CGNAT, latência) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Asserção de FONTE prova a forma dos atributos, nunca o motor de layout nem a heurística de autofill. Latência acrescentada (3 idas ao Redis no caminho de sucesso) nunca medida. Calibração (10/10min, 5/1h, 30/1h, 60/1min) é escolha defensável, não medição |
| 5 | **SC3** — O owner vê quantas requisições foram barradas e por qual chave | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Os quatro pontos de emissão existem e estão ligados (tabela abaixo). Em no-op nada é barrado, logo nada é emitido; e ingestão de painel nunca foi conferida |
| 6 | Fail-open nos dois modos de falha do fornecedor (rejeição e timeout), com Issue sintética estática | ✓ VERIFIED | `rate-limit.ts:445-460` e `:493-505`; 6 testes nomeados cobrindo `limit()` rejeitando, `reason: 'timeout'` e o timeout próprio de `getRemaining` |
| 7 | No-op sem env não quebra nenhum fluxo; produção NÃO sobe sem as duas variáveis | ✓ VERIFIED | `rate-limit.ts:79-87` (aviso único), `env.ts:57-58` na `OBRIGATORIAS_EM_PRODUCAO`, invocado no boot por `instrumentation.ts:36`. Testes: "em produção sem as DUAS do Upstash lança nomeando ambas" e "fora de produção NÃO lança" |
| 8 | Invariante nunca-PII: nenhum IP, telefone ou org_id cru em chave do Redis, Sentry Log, Issue ou PostHog | ✓ VERIFIED | `montarChave` hasheia cada parte (`rate-limit.ts:348-353`); `hashComSal` separa domínio e abre Issue sem salt; allowlist do log valida a FORMA (16 hex) desde o WR-07; props do PostHog carregam só `camada`; `capturarEventoTenant` hasheia o org_id |
| 9 | O rate limit nunca devolve sucesso falso — sucesso falso é exclusivo do honeypot | ✓ VERIFIED | Os quatro pontos de bloqueio retornam `{ ok: false, motivo: 'muitas_tentativas' }` (`:616`, `:700`, `:750`, `:1138`). Único `ok: true` mentiroso do arquivo: `:508-516`, no honeypot |
| 10 | Honeypot devolve sucesso plausível sem tocar banco, engine, cliente ou mensageria | ✓ VERIFIED | Primeira instrução do corpo da action (`:454`), retorna antes de `createAdminClient()` (`:623`). 7 testes, incluindo "sem tocar em NADA", "payload LIXO sem lançar" e os dois controles positivos (campo ausente / vazio) |
| 11 | `teto_tenant` conta CRIAÇÕES, não tentativas | ✓ VERIFIED | `verificarLimiteSemConsumir` decide antes (`:671`), `verificarLimite` consome depois do INSERT (`:912`). Teste: "tentativa bloqueada pelo TELEFONE não queima o token do tenant" |
| 12 | ~~Bloqueio de LEITURA reusa a caixa de erro da Phase 01 com **zero copy nova** (D-10)~~ → **must_have REVISADO**: bloqueio de leitura mostra copy própria (`COPY_MUITAS_TENTATIVAS`) com pausa no botão | ✓ CUMPRIDO (por ratificação) | Medição original inalterada: `mensagens.ts:169` mapeia para `COPY_MUITAS_TENTATIVAS`, `EtapaDataHora.tsx:137-147` tem botão desabilitado com contagem. Era desvio do WR-03 (`c6c43c2`) **sem** ratificação; o owner RATIFICOU em 2026-07-27 e o D-10 foi revisado (`override_log` no frontmatter + `03-CONTEXT.md` §D-10). O código não mudou — mudou o critério. A verificação em tela nasce como item de UAT |
| 13 | Alternativa RPC no Postgres documentada como não escolhida + PENDENCIAS com gate de deploy e risco aceito | ✓ VERIFIED | `docs/01-ARQUITETURA_E_STACK.md:144` §"Alternativa considerada e NÃO escolhida"; `docs/PENDENCIAS.md:944` (provisionamento), `:978` (cota Free), `:1019-1077` (itens manuais a–d) |
| 14 | O caminho de rejeição não faz I/O de terceiro aguardado na frente da resposta | ✓ VERIFIED | `apos-resposta.ts` (`after()` do Next com fallback), `emissao.ts` (throttle por chave estática), PostHog já sob `after()` em `analytics/server.ts:67`. Testes de throttle por camada e por tenant |

**Score:** 10/14 truths verificados (3 presentes com comportamento não exercido, 1 falhou)

---

### Required Artifacts

| Artifact | Esperado | Status | Detalhes |
|---|---|---|---|
| `src/lib/rate-limit.ts` | 4 camadas slidingWindow + ipDoVisitante + hash + fail-open | ✓ VERIFIED | 507 linhas, importado e consumido em `public-booking.ts` |
| `src/lib/__tests__/rate-limit.test.ts` | Prova de no-op, bloqueio, fail-open, timeout, PII, chave inválida | ✓ VERIFIED | 41 casos nomeados |
| `src/app/book/[slug]/mensagens.ts` | `COPY_MUITAS_TENTATIVAS` nos dois Records exaustivos | ⚠️ Presente com desvio | A copy existe e está travada byte a byte; o **roteamento** na caixa de horários diverge do must_have (T12) |
| `src/app/book/[slug]/etapas/EtapaContato.tsx` | Input armadilha invisível `info_adicional` | ✓ VERIFIED | Off-screen por style inline (não classe Tailwind), `aria-hidden` no wrapper e no input, `tabIndex={-1}`, `autoComplete="off"`, sem `<label>` |
| `src/app/book/__tests__/honeypot-campo.test.ts` | Asserção de fonte dos atributos + fio até a action | ✓ VERIFIED | 10 casos, incluindo o negativo "não usa vocabulário que as heurísticas de autofill reconhecem" |
| `src/app/actions/public-booking.ts` | 4 camadas ligadas + honeypot como primeira checagem | ✓ VERIFIED | 1168 linhas |
| `src/lib/observabilidade/log.ts` | `logOperacionalAguardando` + códigos + allowlist estendida | ✓ VERIFIED | Allowlist valida CHAVE **e** VALOR (16 hex) desde o WR-07 |
| `src/lib/observabilidade/emissao.ts` | Throttle por processo | ✓ VERIFIED | Novo no ciclo de correção; consumido em `rate-limit.ts`, `public-booking.ts` e `hash.ts` |
| `src/lib/observabilidade/apos-resposta.ts` | `emitirDepoisDaResposta` com `after()` | ✓ VERIFIED | Novo; 3 consumidores |
| `src/lib/env.ts` | As duas do Upstash em `OBRIGATORIAS_EM_PRODUCAO` | ✓ VERIFIED | Linhas 57-58, ligado ao boot |
| `docs/01-ARQUITETURA_E_STACK.md` | Seção de anti-abuso com D-01 e alternativa recusada | ✓ VERIFIED | §"Anti-abuso do booking público", linha 50 |
| `docs/PENDENCIAS.md` | Provisionamento, risco da cota, verificações manuais | ⚠️ VERIFIED com imprecisão | Todo o conteúdo está lá; as contagens de suíte estão desatualizadas (ver Anti-Patterns) |

### Key Link Verification

| From | To | Via | Status |
|---|---|---|---|
| `public-booking.ts` | `rate-limit.ts` | `verificarLimite('escrita_ip', [ip])` na fronteira | ✓ WIRED (`:575`) |
| `public-booking.ts` | `rate-limit.ts` | `escrita_telefone` + `teto_tenant` em `Promise.all` pós-resolução | ✓ WIRED (`:666-672`) |
| `public-booking.ts` | `rate-limit.ts` | `verificarLimite('leitura_ip', [ip])` em `obterSlotsPublicos` | ✓ WIRED (`:1116`) |
| `public-booking.ts` | `observabilidade/log.ts` | `logOperacionalAguardando.warn` sob `after()` + throttle | ✓ WIRED (4 pontos) |
| `public-booking.ts` | `analytics/server.ts` | `booking_rate_limited` / `booking_honeypot` | ✓ WIRED |
| `public-booking.ts` | `observabilidade/reportar.ts` | `ratelimit:teto_tenant_atingido` aguardado sob `after()` | ✓ WIRED (`:736`) |
| `BookingApp.tsx` | `public-booking.ts` | lê `info_adicional` do FormData e repassa como `infoAdicional` | ✓ WIRED (`:301`, `:317`) |
| `mensagens.ts` | `public-booking.ts` | `muitas_tentativas` nos dois Records exaustivos | ✓ WIRED — porém com o roteamento divergente do T12 |
| `instrumentation.ts` | `env.ts` | `validarEnvObrigatorio()` no boot | ✓ WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Variável | Fonte | Produz dado real? | Status |
|---|---|---|---|---|
| `rate-limit.ts` → `LIMITERS` | `redis` | `process.env.UPSTASH_REDIS_REST_*` | **Não hoje** — `null` sem as vars → `LIMITERS = {}` | ⚠️ HOLLOW por configuração, não por código. É o achado central da fase, e está declarado no próprio código como comportamento pretendido (D-04) |
| `EtapaContato` → `info_adicional` | FormData do submit | Navegador | Sim — chega à action e decide o sucesso falso | ✓ FLOWING |
| `public-booking` → telemetria | `camada`, `chaveHash`, `tenantHash` | hash salgado local | Sim quando há bloqueio; hoje nunca há bloqueio | ⚠️ Depende do mesmo provisionamento |

### Behavioral Spot-Checks

| Comportamento | Comando | Resultado | Status |
|---|---|---|---|
| Suíte completa sobre o HEAD | `pnpm test` | 23 arquivos / 381 testes, todos verdes, 847 ms | ✓ PASS — confirma o número do orquestrador |
| Testes de rate limit existem e cobrem transição de estado | `npx vitest list \| grep rate-limit` | 41 casos nomeados (bloqueio, fail-open, timeout, no-op, PII, throttle, chave inválida) | ✓ PASS |
| Testes de honeypot existem | `npx vitest list \| grep honeypot` | 17 casos (7 de comportamento na action + 10 de forma do campo) | ✓ PASS |
| Ausência de CAPTCHA | `grep -i "captcha\|turnstile\|hcaptcha" src/` | Só o comentário que os proíbe | ✓ PASS |
| Data API fechada para `anon` | `grep REVOKE supabase/migrations/` | `20260722060000_fecha_data_api_para_anon.sql` presente | ✓ PASS |
| Bloqueio real contra Redis | — | Impossível sem credenciais e sem servidor | ? SKIP → verificação humana (a) |

### Probe Execution

Nenhum probe declarado para esta fase; `find scripts -path '*/tests/probe-*.sh'` não retorna
nada relevante ao anti-abuso. A trava executável herdada e ainda válida é
`scripts/verificar-travessia-server-action.sh` (Phase 01), fora do escopo desta verificação.

---

## Requirements Coverage

| Requisito | Plano(s) | Descrição | Status | Evidência |
|---|---|---|---|---|
| ABU-01 | 03-01, 03-03, 03-04, 03-05, 03-06 | Script repetindo requisições não consegue lotar a agenda | **PARCIAL — bloqueado em provisionamento** | Data API fechada (Phase 1) ✓; 4 camadas + honeypot escritos, ligados e testados ✓; nenhuma bloqueia em runtime sem as env vars ✗ |
| ABU-02 | 03-01, 03-04, 03-05, 03-06 | Cliente legítimo não percebe nenhuma fricção nova | **PARCIAL — só olho humano fecha** | Sem CAPTCHA, sem campo visível, sem etapa nova ✓; erro honesto em vez de sucesso falso ✓; autofill/layout/CGNAT/latência não exercidos ✗; o T12 acrescentou um elemento de UI no caminho de falha que precisa de decisão do owner |
| ABU-03 | 03-02, 03-03, 03-05, 03-06 | Owner consegue ver se o limite está barrando gente legítima | **PARCIAL — só olho humano fecha** | Quatro pontos de emissão ligados ✓; nada emitido em no-op ✗; ingestão de painel nunca conferida ✗ |

Nenhum requisito órfão: `REQUIREMENTS.md:222` mapeia exatamente ABU-01/02/03 à Phase 3, e os
planos declaram exatamente esses três IDs. As três linhas (`:40-42`) estão abertas com o
motivo escrito — e este relatório confirma que os motivos escritos são verdadeiros.

---

## Anti-Patterns Found

| Arquivo | Linha | Padrão | Severidade | Impacto |
|---|---|---|---|---|
| `docs/PENDENCIAS.md` | 920, 1013 | Contagem de suíte desatualizada — afirma "22 arquivos / 353 testes" e "353 testes em 22 arquivos" como "saída real observada sobre o HEAD final da fase" | ⚠️ Warning | O HEAD final é `f274599` e mede **23 / 381**. O número foi escrito no 03-06, antes das 11 correções de revisão, e o commit `25997ce` (WR-08) atualizou outras afirmações do mesmo arquivo sem tocar esta. É um número falso num bloco que existe justamente para ser confiável depois |
| `src/app/actions/public-booking.ts` | 1148 | `console.error('Slug público não resolvido…')` num endpoint público sem teto de leitura quando o IP é indeterminável | ℹ️ Info | É o IN-01 da revisão, deixado fora do escopo. O REVIEW-FIX registra corretamente que ele ficou **mais** relevante depois do CR-04. Não vaza dado (só o discriminante) |
| `src/app/actions/public-booking.ts` | 512-514 | Honeypot ecoa `dataHora` do payload sem validar | ℹ️ Info | IN-03, fora do escopo. Só o próprio bot recebe o eco, e React escapa na renderização. Sem vetor de terceiro |

**Marcadores de dívida:** nenhum. Todas as ocorrências de `TODO` nos arquivos da fase são a
palavra portuguesa "TODOS"/"TODO cliente real" dentro de comentários — verificadas uma a uma.
Zero `TBD`, `FIXME`, `XXX`, `HACK` ou `PLACEHOLDER`.

---

## Onde a revisão de código melhorou o resultado (crédito devido)

Não é praxe do relatório, mas ignorar isto daria uma leitura errada do estado do código.
Quatro das onze correções fecharam defeitos que teriam produzido exatamente o falso-verde
que este projeto já pagou caro:

- **CR-02** — o `teto_tenant` contava tentativas. 30 requisições com `servicoId` lixo negavam
  agendamento a um tenant inteiro por uma hora, sem criar nada: a defesa virava um caminho
  barato de negação de serviço contra o Core Value do produto.
- **CR-04** — o balde `'desconhecido'` fazia um header ausente somar **todos** os visitantes de
  **todos** os tenants em 10 escritas/10 min. Um problema de infra derrubaria o booking
  público inteiro, em silêncio.
- **CR-03** — o `Sentry.flush(2000)` aguardado no caminho de rejeição fazia rejeitar custar
  mais que aceitar, num endpoint cujo volume quem escolhe é o atacante.
- **WR-07** — a allowlist "fechada" do log validava a chave e nunca o valor: `chaveHash`
  aceitava qualquer string, inclusive um telefone.

O código verificado aqui é materialmente melhor que o descrito nos seis SUMMARYs, e três das
quatro asserções de teste alteradas pinavam defeito, não contrato.

---

## Gaps Summary

Existe **um** gap, e ele não é falta de código: é uma decisão de produto pendente. O WR-03
trocou, na caixa de horários, a copy genérica de falha de carregamento pela copy honesta de
"muitas tentativas", e acrescentou uma espera de 10 s no botão "Tentar de novo". O argumento
é sólido — a fase inteira sustenta que CGNAT faz cliente real dividir IP, e foi por isso que
o caminho de escrita ganhou copy honesta; manter a assimetria era dar ao leitor real uma
informação falsa sobre a causa, debaixo de um botão que o convidava a queimar outro token.

Mas o D-10 é decisão do **owner**, e ele dizia o contrário. O desvio do D-06, na mesma fase,
foi ratificado explicitamente e por escrito; este não foi. Além disso, a asserção de teste
que travava o comportamento antigo foi reescrita para travar o novo — ou seja, a suíte verde
deixou de ser capaz de sinalizar a divergência. Fechar a fase sem essa decisão significa
absorver, sem que ninguém veja, uma mudança na experiência do cliente barrado numa fase cujo
critério de aceite é literalmente "o cliente legítimo não percebe absolutamente nada".

**Resolução esperada: decisão, não plano novo.** Para ratificar, acrescente ao frontmatter
desta VERIFICATION:

```yaml
overrides:
  - must_have: "Bloqueio de LEITURA reusa a caixa de erro existente da Phase 01 com zero copy nova (D-10)"
    reason: "Copy honesta na caixa de horários serve melhor ao ABU-02 do que a copy genérica: informa a causa certa ao cliente real barrado por CGNAT, sem UI nova além do estado do botão que já existia"
    accepted_by: "<owner>"
    accepted_at: "<ISO timestamp>"
```

Para reverter, `git revert c6c43c2`.

---

### ✅ RESOLVIDO em 2026-07-27 — o owner RATIFICOU

A análise acima fica inteira porque é o que sustentou a decisão. O que aconteceu depois
dela:

O orquestrador apresentou os dois lados ao owner com a medição de cada um — o que o
visitante vê em cada cenário, quem de fato chega a ver (o limite de leitura é 60/min: robô,
que não lê tela, ou várias pessoas reais atrás de um IP compartilhado), e o custo de cada
escolha. **O owner escolheu manter a mudança do WR-03.**

O registro seguiu o formato do D-06 e o precedente da Phase 01 (*"correção de decisão
registrada é anotação datada e atribuída, nunca reescrita"*): o texto original do D-10
permanece intacto em `03-CONTEXT.md`, com a revisão anotada ao lado; os `must_haves` de
03-01 e 03-04 foram marcados SUPERSEDIDO apontando para ela; e o `override_log` deste
frontmatter carrega a decisão, os três custos aceitos e a reversibilidade.

**O que a ratificação NÃO apaga**, e por isso está escrito aqui: a asserção de teste
reescrita fez a suíte verde deixar de sinalizar a divergência, e foi o orquestrador quem
aprovou essa asserção sem conferir contra o D-10 (o agente de fix nunca recebeu o CONTEXT e
não tinha como saber). O gap não foi encontrado por teste — foi encontrado pelo verificador
lendo o must_have contra o código. É o mesmo mecanismo de falso-verde que esta fase existe
para não repetir, e o registro é o que impede a lição de se perder junto com o gap.

**Um item de UAT NASCE desta decisão:** ver a copy nova e o botão com contagem em navegador
real (mobile e desktop) — que a contagem não trave o visitante além da janela e não desloque
o layout. Nenhum executor pode marcá-lo.

O resto do que impede os três requisitos de fechar **não é gap**: são as duas variáveis de
ambiente do Upstash (ação de painel do owner, gate de deploy já registrado) e quatro
verificações manuais que nenhum comando alcança. Estão em `behavior_unverified_items` e em
`human_verification`, e correspondem um a um aos itens (a)–(d) de `docs/PENDENCIAS.md`.

---

_Verificado em: 2026-07-27T23:41:55Z_
_Verificador: Claude (gsd-verifier)_
