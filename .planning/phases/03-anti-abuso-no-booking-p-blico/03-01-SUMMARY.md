---
phase: 03-anti-abuso-no-booking-p-blico
plan: 01
subsystem: security
tags: [rate-limit, upstash, redis, sliding-window, server-actions, fail-open, next16]

requires:
  - phase: 01-fechar-a-superficie-anonima
    provides: "retorno discriminado (`{ ok, motivo }`) no lugar de throw, copy no cliente em mensagens.ts, e o padrão 01-18 de validar na fronteira ANTES de createAdminClient()"
  - phase: quick-260724-observabilidade-mensageria
    provides: "reportarFalhaSilenciosaAguardando (Sentry.flush) e a regra de mensagem de Issue sintética e estática"
provides:
  - "src/lib/rate-limit.ts — único ponto do código que conhece @upstash/*: verificarLimite, ipDoVisitante, hashChaveRateLimit"
  - "Camada escrita_ip (slidingWindow 10/10min) barrando flood na fronteira de criarAgendamentoPublico antes de qualquer I/O"
  - "Fail-open completo nos dois modos de falha do fornecedor (rejeição rápida e timeout de 500 ms), com Issue sintética ratelimit:redis_unavailable"
  - "Discriminante muitas_tentativas em MotivoPublico + COPY_MUITAS_TENTATIVAS nos dois Records exaustivos"
  - "Tipo CamadaRateLimit com as quatro camadas declaradas — as três restantes devolvem passe até os planos 03-03/03-04"
affects: [03-02-telemetria-de-bloqueio, 03-03-camadas-telefone-e-tenant, 03-04-leitura-e-env, 03-05-honeypot]

tech-stack:
  added: ["@upstash/ratelimit@2.0.8", "@upstash/redis@1.38.0"]
  patterns:
    - "Guarda de abuso como função de domínio (verificarLimite), nunca a lib crua nas actions — a reversibilidade costly do D-01 fica localizada num arquivo só"
    - "Chave de rate limit pseudonimizada dentro do próprio módulo (chamador passa valor cru e não consegue esquecer de hashear)"
    - "Fail-open com reporte: true cobre passou / no-op / falha do fornecedor; só false muda o fluxo do booking"

key-files:
  created:
    - src/lib/rate-limit.ts
    - src/lib/__tests__/rate-limit.test.ts
  modified:
    - src/app/actions/public-booking.ts
    - src/app/actions/__tests__/public-booking-validacao.test.ts
    - src/app/book/[slug]/mensagens.ts
    - src/app/book/__tests__/mensagens.test.ts
    - package.json
    - pnpm-lock.yaml

key-decisions:
  - "Assunção A1 do RESEARCH CONFIRMADA no fonte instalado: Ratelimit.limit() é try/finally SEM catch (node_modules/@upstash/ratelimit/dist/index.mjs:799-812), então erro de rede/credencial REJEITA a Promise — o try/catch do fail-open não é redundância defensiva, é o único tratamento desse modo de falha"
  - "A guarda de IP fica DEPOIS das validações síncronas baratas e ANTES de createAdminClient(): payload lixo não gasta comando no Redis, e flood não gasta consulta no Supabase"
  - "Rótulo da Issue é IDÊNTICO nos dois modos de falha (ratelimit:redis_unavailable); a distinção vive no contexto (motivo: 'erro' | 'timeout'), porque é o mesmo problema e agrupar junto é o desenho"
  - "CamadaRateLimit já declara as quatro camadas com Partial<Record<...>> de limiters: camada sem instância devolve PASSE, nunca bloqueio acidental"
  - "public-booking-validacao.test.ts mocka @/lib/rate-limit INTEIRO — o módulo real importa next/headers e quebraria a hermeticidade da suíte; o contrato do módulo é provado na suíte própria"

patterns-established:
  - "Cabeçalho-contrato numerado no topo do módulo de infraestrutura (5 itens), no formato de reportar.ts/log.ts"
  - "Asserção NEGATIVA como prova de ausência de PII: o valor cru de fixture não pode aparecer no argumento enviado ao fornecedor terceiro"
  - "Recarga de módulo por caso (vi.resetModules + import dinâmico) quando a decisão testada acontece no LOAD em escopo de módulo"

requirements-completed: [ABU-01, ABU-02]

coverage:
  - id: D1
    description: "Flood de escrita por IP único é recusado na fronteira com muitas_tentativas, sem instanciar o admin client"
    requirement: "ABU-01"
    verification:
      - kind: unit
        ref: "src/app/actions/__tests__/public-booking-validacao.test.ts#recusa com `muitas_tentativas` SEM tocar o banco quando a janela estourou"
        status: pass
      - kind: unit
        ref: "src/app/actions/__tests__/public-booking-validacao.test.ts#consulta a camada `escrita_ip` com o IP do visitante"
        status: pass
    human_judgment: false
  - id: D2
    description: "Redis indisponível (rejeição) ou lento (timeout 500 ms) deixa a requisição PASSAR e vira Issue sintética estática"
    requirement: "ABU-02"
    verification:
      - kind: unit
        ref: "src/lib/__tests__/rate-limit.test.ts#PASSA quando limit() REJEITA (rede/credencial) e reporta a Issue sintética"
        status: pass
      - kind: unit
        ref: "src/lib/__tests__/rate-limit.test.ts#PASSA quando a lib libera por TIMEOUT e reporta a MESMA Issue sintética"
        status: pass
    human_judgment: false
  - id: D3
    description: "Dev sem as env vars do Upstash opera em no-op com aviso de console, sem quebrar nem bloquear o fluxo público"
    verification:
      - kind: unit
        ref: "src/lib/__tests__/rate-limit.test.ts#devolve PASSE e não consulta o fornecedor"
        status: pass
    human_judgment: false
  - id: D4
    description: "Nenhum valor cru de IP entra como chave no Redis — toda parte de chave passa por sha256 + ANALYTICS_TENANT_SALT truncado a 16"
    verification:
      - kind: unit
        ref: "src/lib/__tests__/rate-limit.test.ts#não envia o valor cru da chave ao fornecedor"
        status: pass
    human_judgment: false
  - id: D5
    description: "Copy do D-07 travada byte a byte e roteada para as duas superfícies (envio = copy nova, caixa de horários = COPY_ERRO_SLOTS)"
    verification:
      - kind: unit
        ref: "src/app/book/__tests__/mensagens.test.ts#mantém a cópia de rate limit byte a byte"
        status: pass
      - kind: unit
        ref: "src/app/book/__tests__/mensagens.test.ts#roteia `muitas_tentativas` para copias diferentes nas duas superficies"
        status: pass
    human_judgment: false
  - id: D6
    description: "A camada de IP com Redis REAL barra um flood real sem barrar cliente legítimo (calibração 10/10min contra CGNAT e rajada de divulgação)"
    verification: []
    human_judgment: true
    rationale: "A suíte é hermética por desenho — prova a decisão sobre a resposta do fornecedor, nunca a resposta do fornecedor. A calibração só se avalia com database Upstash provisionado (user_setup ainda pendente) e tráfego real; nenhum executor fecha isto."

duration: ~35min
completed: 2026-07-27
status: complete
---

# Phase 3 Plano 01: Camada de IP do rate limit na escrita pública — Summary

**`criarAgendamentoPublico` recusa flood por IP com `slidingWindow` do Upstash antes de instanciar o cliente privilegiado, e o Redis fora do ar libera a requisição em vez de derrubar o booking.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-07-27T14:10Z (aprox.)
- **Completed:** 2026-07-27T14:45Z (aprox.)
- **Tasks:** 2 (1 checkpoint resolvido pelo orquestrador + 1 tracer)
- **Files modified:** 8 (2 criados, 6 modificados)

## Accomplishments

- **A arquitetura inteira da fase atravessada de ponta a ponta com um caminho só** — lib nova → fronteira da Server Action → discriminante do tipo fechado → copy nos dois `Record` exaustivos → prova hermética. As camadas seguintes (telefone, tenant, leitura) são instâncias novas no mesmo `Partial<Record<CamadaRateLimit, Ratelimit>>`, sem mudança estrutural.
- **Fail-open provado nos DOIS modos de falha, que é a parte fácil de fazer pela metade.** O `timeout: 500` nativo cobre Redis lento; a rejeição rápida (rede/credencial) só é coberta pelo `try/catch` externo — e a leitura do fonte instalado confirmou que ela existe de verdade.
- **Invariante nunca-PII estendido ao store do fornecedor terceiro.** A pseudonimização mora DENTRO de `verificarLimite`, não no chamador: quem consome passa o IP cru e não tem como esquecer de hashear.
- **Zero fricção nova para o cliente legítimo:** nenhum campo novo na tela, nenhuma etapa, nenhum CAPTCHA. O único efeito visível é a copy honesta no caso raro de bloqueio.

## Task Commits

1. **Task 1: Verificar legitimidade de `@upstash/ratelimit` antes do install ([SUS])** — checkpoint `blocking-human`, **resolvido pelo owner com "aprovado"** antes deste executor rodar (sem commit próprio; ver §Checkpoint abaixo)
2. **Task 2: Camada de IP na escrita ponta a ponta** — `06a0d3e` (feat)

**Plan metadata:** ver commit de fechamento (`docs(03-01)`).

## Checkpoint de legitimidade do pacote (Task 1) — RESOLVIDO

O RESEARCH marcou `@upstash/ratelimit` como **[SUS]** por um motivo único: o campo `repository` está ausente no metadado da última publish. O orquestrador levou a evidência ao owner, que aprovou explicitamente. Registro do que sustentou a aprovação:

- `pnpm view @upstash/ratelimit` → versão **2.0.8** (satisfaz `^2.0.8`), tarball em `https://registry.npmjs.org/@upstash/ratelimit/-/ratelimit-2.0.8.tgz`, `repository` **vazio** (a única razão do rótulo).
- `pnpm view @upstash/redis` → **1.38.0**, tarball em `registry.npmjs.org`.
- **A evidência decisiva, além do que o plano pedia:** o array `maintainers` de `@upstash/ratelimit` é **byte-idêntico** ao de `@upstash/qstash` (8 mantenedores, mesma ordem) — e `@upstash/qstash@^2.11.2` já é dependência de produção deste repositório. É a mesma conta publicadora que o projeto já confia.
- Nenhum dos dois declara `postinstall`, `preinstall` ou `prepare`.
- O contraste que fecha o caso: `@upstash/qstash` **tem** `repository` preenchido. A ausência em `ratelimit` é inconsistência de publicação da Upstash, não terceiro se passando pelo escopo.

Nota de método: foi usado `pnpm view` (e não `npm view`, como o plano escreveu) porque o CLAUDE.md do projeto exige pnpm exclusivamente. Consulta equivalente ao mesmo registro.

## Files Created/Modified

- `src/lib/rate-limit.ts` (novo, 186 linhas) — cabeçalho-contrato de 5 itens; `Redis`/`Ratelimit` em escopo de módulo (preserva o `ephemeralCache` default); `CamadaRateLimit`; `hashChaveRateLimit`; `ipDoVisitante`; `verificarLimite`
- `src/lib/__tests__/rate-limit.test.ts` (novo, 11 casos) — no-op, camada sem limiter, bloqueio, passe, fail-open por rejeição, fail-open por timeout, chave sem PII, composição da chave, e três de `ipDoVisitante`
- `src/app/actions/public-booking.ts` — `| 'muitas_tentativas'` em `MotivoPublico`; guarda de IP entre a validação de data e `createAdminClient()`, com o racional escrito em pt-BR
- `src/app/actions/__tests__/public-booking-validacao.test.ts` — mock hoisted de `@/lib/rate-limit` + 3 casos novos (recusa sem tocar o banco, argumentos da camada, não-regressão do caminho liberado)
- `src/app/book/[slug]/mensagens.ts` — `COPY_MUITAS_TENTATIVAS` + entrada nos dois `Record`
- `src/app/book/__tests__/mensagens.test.ts` — copy travada byte a byte, roteamento das duas superfícies, membro novo em `TODOS_OS_MOTIVOS`
- `package.json` / `pnpm-lock.yaml` — duas dependências novas

## Decisions Made

**A assunção A1 do RESEARCH foi confirmada por leitura do fonte, não assumida.** `limit()` em `node_modules/@upstash/ratelimit/dist/index.mjs:799-812` é `try { … } finally { clearTimeout }` — sem `catch`. Qualquer rejeição do cliente Redis (fetch falhando, credencial inválida, endpoint fora do ar) sobe intacta para o chamador. O `try/catch` do módulo, que o plano mandava manter "inócuo nas duas hipóteses", é na verdade **o único** tratamento desse modo de falha: sem ele, o Upstash fora do ar derrubaria toda tentativa de agendamento — o oposto exato do D-02.

**A guarda ficou entre a validação de data e `createAdminClient()`, e a posição tem dois lados.** Depois das validações síncronas porque elas são de graça e payload lixo não merece gastar comando no Redis; antes do cliente privilegiado porque é a diferença entre recusar de graça e recusar depois de pagar consulta no Supabase (padrão 01-18).

**O rótulo da Issue é o mesmo nos dois modos de falha.** `ratelimit:redis_unavailable` para rejeição e para timeout, com a distinção em `motivo` no contexto. São o mesmo problema operacional ("o fornecedor não respondeu") e separar em dois rótulos estilhaçaria o agrupamento — o erro que a quick task 260724 pagou para não repetir.

**`analytics` da lib ficou no default (`false`).** O CONTEXT veda a flag como substituto do D-11, e ligá-la custaria comandos extras no Redis mais a obrigação de aguardar o `pending`.

**A suíte de validação mocka `@/lib/rate-limit` inteiro.** O módulo real importa `next/headers`, que não existe fora de contexto de requisição — carregá-lo quebraria a hermeticidade que é regra viva do projeto. O contrato do módulo é provado na suíte própria, com `@upstash/*`, `next/headers` e o reporte todos mockados.

## Deviations from Plan

### 1. [Rule 2 — Correção] ABU-01 e ABU-02 NÃO foram marcados como concluídos em REQUIREMENTS.md

- **Encontrado durante:** fechamento do plano (etapa de state updates)
- **Questão:** o fluxo padrão manda marcar como completos os requisitos do frontmatter (`requirements: [ABU-01, ABU-02]`)
- **Por que não foi feito:** os MESMOS dois requisitos são reivindicados também pelos planos 03-03, 03-04, 03-05 e 03-06 desta fase. Marcá-los agora afirmaria que "script repetindo requisições não consegue lotar a agenda" está satisfeito — quando existe **uma** das três camadas, a leitura pública segue sem teto, o honeypot não existe e o rate limit inteiro está em no-op por falta das env vars. É exatamente o falso-verde que a Phase 01 reprovou quatro vezes e que o 02-02 já evitou pelo mesmo motivo ("requisitos ainda não marcados — falso-verde evitado")
- **Ação:** os três ABU seguem `[ ] / Pending` em `.planning/REQUIREMENTS.md`; quem fecha é o último plano da fase que os reivindica, com a evidência da fase inteira
- **Arquivos modificados:** nenhum (a deviation é a AUSÊNCIA de uma escrita)

---

**Total de deviations:** 1 (Rule 2 — correção que evita afirmação falsa de conclusão)
**Impacto no plano:** nenhum no código. Todo o escopo técnico foi executado como escrito.

Três acréscimos dentro do escopo declarado, nenhum deles mudança de comportamento pedido:

1. Três casos de teste para `ipDoVisitante` (primeira entrada de `x-forwarded-for`, header ausente, `headers()` lançando). O plano lista a função como artefato mas não a cobria no `<behavior>`; sem eles o fallback `'desconhecido'` ficaria sem prova.
2. Dois casos extras em `rate-limit.test.ts` (passe dentro da janela sem reporte; camada declarada sem limiter devolvendo passe) — o segundo é o que impede um plano futuro de introduzir bloqueio acidental ao registrar uma camada nova.
3. Um caso extra em `public-booking-validacao.test.ts` provando os argumentos exatos passados a `verificarLimite`.

## Issues Encountered

Nenhum. `pnpm test` (296/296, 21 arquivos), `npx tsc --noEmit` (exit 0), `pnpm lint` (exit 0) e `pnpm build` (14 rotas) rodaram verdes na primeira tentativa sobre o HEAD final.

Baseline preservado: 280 testes em 20 arquivos antes, 296 em 21 depois — os 16 novos, zero regressão.

## User Setup Required

**Duas env vars ainda não provisionadas** (`user_setup` do plano, não fechado por código):

- `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` (Upstash Console → Redis → database → REST API)
- Criar os dois databases Redis (prod e dev) na mesma conta do QStash — isolamento físico dos contadores (D-05). Se o plano cobrar pelo segundo, dev opera em no-op e só o de prod é criado.
- **Provisionar as duas no Railway ANTES do próximo deploy de produção.** O plano 03-04 acrescenta as duas à lista de obrigatórias de `src/lib/env.ts`, e a partir de lá o boot cai sem elas — ampliando a janela de crash-loop já registrada nos Blockers do STATE.

Enquanto não existirem, o rate limit inteiro está em **no-op** com aviso único no console em dev. Isso é o comportamento desejado nesta fase e está provado por teste — mas significa que **nenhuma proteção real está ativa ainda**.

## Known Stubs

`escrita_telefone`, `teto_tenant` e `leitura_ip` estão declaradas em `CamadaRateLimit` e devolvem **passe** — não têm limiter instanciado. É intencional e faz parte do desenho do tracer: o plano 03-03 preenche telefone e tenant, o 03-04 preenche a leitura. Documentado em comentário no próprio `LIMITERS` e coberto pelo teste "devolve PASSE para as camadas ainda sem limiter próprio", que existe justamente para que a ausência seja um fato provado e não um esquecimento silencioso.

## Threat Flags

Nenhuma superfície nova fora do `<threat_model>` do plano. Os quatro riscos registrados foram tratados como previsto: T-03-01-01 (camada `escrita_ip` na fronteira), T-03-01-02 (fail-open duplo + timeout + Issue aguardada), T-03-01-03 (`hashChaveRateLimit` em toda parte de chave), T-03-01-SC (checkpoint humano antes do install). T-03-01-04 (`x-forwarded-for` forjável) segue **aceito e nomeado** — se a assunção A2 falhar, quem segura o ataque são as camadas de telefone e tenant do plano 03-03.

## Next Phase Readiness

Pronto para o **03-02** (telemetria de bloqueio): o ponto exato de emissão já existe e é o `return { ok: false, motivo: 'muitas_tentativas' }` da action; falta o `logOperacional` + PostHog do D-11, com a variante de entrega garantida (Pitfall 3).

Pronto para o **03-03** (telefone + tenant): as duas camadas entram como entradas novas em `LIMITERS`, consumidas por `verificarLimite` sem mudança estrutural, logo após `resolverPerfilPublicoPorSlug` — que é onde o `tenant_id` nasce.

Bloqueio conhecido para o **03-04**: acrescentar as env vars à lista de obrigatórias em produção só é seguro depois de elas existirem no Railway.

## Self-Check: PASSED

- `src/lib/rate-limit.ts` — FOUND
- `src/lib/__tests__/rate-limit.test.ts` — FOUND
- `src/app/actions/public-booking.ts` — FOUND (contém `'muitas_tentativas'` e `verificarLimite('escrita_ip'` antes de `createAdminClient()` na linha 415)
- `src/app/book/[slug]/mensagens.ts` — FOUND (contém `COPY_MUITAS_TENTATIVAS` e a entrada nos dois `Record`)
- Commit `06a0d3e` — FOUND

---
*Phase: 03-anti-abuso-no-booking-p-blico*
*Completed: 2026-07-27*
