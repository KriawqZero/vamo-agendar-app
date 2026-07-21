---
phase: quick-260721-jif
verified: 2026-07-21T20:04:36Z
status: human_needed
score: 8/12 must-haves verificados
behavior_unverified: 4
overrides_applied: 0
behavior_unverified_items:
  - truth: "Uma exceção lançada por Server Action em produção vira evento no projeto do Sentry do owner, com rota e stack (OPE-02)"
    test: "Com DSN provisionado, provocar uma exceção numa Server Action e abrir Issues no projeto do Sentry"
    expected: "Issue nova com rota e stack; sem IP, sem cookie, sem querystring, sem corpo de requisição no payload"
    why_human: "O mecanismo (onRequestError + init guardado por DSN) está no código e foi lido linha a linha, mas nenhum comando prova que um evento CHEGOU ao projeto — depende de conta de terceiro e de secret que o executor não tem. É o Gate 2."
  - truth: "As variáveis novas estão no .env.example"
    test: "Colar o bloco de 260721-jif-ENV-BLOCO.md no fim do .env.example e confirmar"
    expected: "NEXT_PUBLIC_SENTRY_DSN e RESEND_API_KEY (e as três de analytics, se ainda não estiverem) presentes com valor vazio"
    why_human: "O executor não tem permissão de leitura nem de escrita em .env* nesta sessão — verificado: o arquivo real não aparece em `git diff 82db24e..HEAD`. Só o owner enxerga o arquivo. É o item (a) do Gate 1."
  - truth: "Um e-mail real sai de naoresponda@mail.vamoagendar.com.br identificado como '<Estabelecimento> via VamoAgendar', com resposta indo ao profissional, e chega à caixa do owner (SC 4 do ROADMAP)"
    test: "node --env-file=.env.local scripts/smoke-fundacao.mjs SEU-EMAIL@exemplo.com"
    expected: "E-mail na caixa, remetente '... via VamoAgendar', responder endereça o reply-to; anotar em qual aba caiu (Principal/Promoções/Spam)"
    why_human: "Entrega de e-mail só existe na caixa de quem recebe. O wrapper está coberto por teste unitário; o que falta é credencial, DNS e entrega — Gate 2."
  - truth: "Um evento real de funil aparece no projeto do PostHog do owner (SC 6 do ROADMAP)"
    test: "Com pnpm dev rodando e a chave provisionada, abrir / em aba anônima e olhar Activity no PostHog"
    expected: "landing_viewed aparece em segundos"
    why_human: "O endpoint do PostHog responde 200 {\"status\":\"Ok\"} até com api_key inválida — nenhum comando consegue afirmar que o evento chegou. Gate 2."
human_verification:
  - test: "Gate 1 — criar projetos (Sentry, PostHog), conferir mail.vamoagendar.com.br Verified no Resend, colar o bloco no .env.example e provisionar as treze obrigatórias no .env.local e no Railway"
    expected: "Resposta 'configurado' com (a) confirmação do .env.example, (b) região do PostHog, (c) slugs de org/projeto do Sentry"
    why_human: "Depende de conta em terceiro e de acesso a .env.local/Railway que o executor não tem. ⚠️ Bloqueante para o próximo deploy: as quatro variáveis novas entraram na lista de obrigatórias e deploy antes dos secrets derruba o boot (registrado em docs/PENDENCIAS.md, WR-02)."
  - test: "Gate 2 — evento no PostHog, issue no Sentry sem PII, e-mail do smoke test na caixa"
    expected: "'verificado' informando os três resultados e a aba em que o e-mail caiu"
    why_human: "Nenhum comando automatizado afirma que um evento chegou; entrega de e-mail só existe na caixa do destinatário."
---

# Quick Task 260721-jif: Fundação operacional — Verification Report

**Objetivo:** entregar a etapa preparatória "Fundação operacional" — error tracking, funil e canal de e-mail de pé antes da Phase 1 começar, com a ausência de configuração em produção deixando de ser silenciosa.
**Verificado:** 2026-07-21T20:04:36Z
**Status:** human_needed
**Re-verificação:** Não — verificação inicial (após os 12 commits de correção da revisão, `2867428`..`b80c408`)

⚠️ **O SUMMARY.md está desatualizado em relação ao código.** Ele foi escrito depois de `b8eff7d` e afirma `9 arquivos / 122 testes`; o repositório de hoje tem `11 arquivos / 164 testes` e três módulos que o SUMMARY não lista (`src/lib/observabilidade/dsn.ts`, `src/lib/observabilidade/erro-supabase.ts`, e os testes `reportar.test.ts` / `erro-supabase.test.ts`). Nada aqui foi verificado contra as afirmações do SUMMARY — só contra o código.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidência |
|---|-------|--------|-----------|
| 1 | Exceção de Server Action em produção vira evento no Sentry do owner (OPE-02) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `src/instrumentation.ts:40` exporta `onRequestError = Sentry.captureRequestError`; `sentry.server.config.ts:16` inicializa sob guard de DSN. Mecanismo presente e ligado; **nenhum evento observado** — depende dos Gates 1/2 |
| 2 | As 7 falhas que hoje morrem no console viram evento no Sentry | ✓ VERIFIED | Ponto a ponto: `whatsapp-helper.ts:95` (`whatsapp:falha_transporte` + `statusCode`), `:104` (`whatsapp:erro_rede`), `:124` (`qstash:sem_token`), `notificacoes-agendamento.ts:159` (catch de topo), `webhooks/lembrete/route.ts:200` (catch de topo, **aguardado** com flush), `public-booking.ts:135/159/185` (as três perdas de causa raiz). O comportamento do reporter é provado por `reportar.test.ts` |
| 3 | Condição esperada NÃO vira evento no Sentry (D-05) | ✓ VERIFIED | `notificacoes-agendamento.ts:68-83` (`whatsapp_desconectado`) e `route.ts:66-79/85-94/135` (`agendamento_cancelado`, `plano_sem_whatsapp`) só chamam `registrarDisparo` + analytics. Grep confirma: nesses dois arquivos `reportar*` só aparece nos catches de topo |
| 4 | Nenhum evento carrega nome, telefone, e-mail, querystring, corpo de Server Action, cookie ou identidade — trava por asserção de teste sobre o objeto versionado (D-02) | ✓ VERIFIED | Ver seção "A allowlist é allowlist de verdade?" abaixo. 24 asserções em `opcoes-sentry.test.ts` sobre `opcoesBaseSentry` e sobre as duas funções puras |
| 5 | Sem `RESEND_API_KEY`, `enviarEmail` devolve `{ ok: false, motivo: 'desativado' }`, não lança e não registra erro (EML-05) | ✓ VERIFIED | `enviar.ts:57`; teste `email-enviar.test.ts:48` assere `construtorMock` não chamado, `enviarMock` não chamado e `console.error` não chamado. Confirmado também pela saída real do smoke: `resend: desativado` |
| 6 | `enviarEmail` nunca lança em nenhum caminho e nenhuma string interna do Resend atravessa a fronteira (D-04) | ✓ VERIFIED | 13 casos em `email-enviar.test.ts` cobrem: sem chave, params faltando (×4), sucesso, `validation_error`, cota, **SDK lançando**, 403, 422, `invalid_from_address`. O mock reproduz o construtor real lançando sem chave (`dist/index.mjs:1150`) |
| 7 | Em produção variável ausente derruba o boot com a lista COMPLETA; `pnpm build` local sem secrets continua passando (D-03) | ✓ VERIFIED | `env.ts:57-66` + `instrumentation.ts:19` (primeira linha de `register()`). Verificado no fonte do Next instalado: `instrumentation-globals.external.js:54` retorna cedo em `phase-production-build`, e `:64` reprefixa e **relança** com `An error occurred while loading instrumentation hook:` — a mesma mensagem documentada. `pnpm build` exit 0 sem secrets |
| 8 | A etapa preparatória existe no ROADMAP com Goal, Requirements, Success Criteria e Notas, e a Phase 1 depende dela | ✓ VERIFIED | `ROADMAP.md:113-137` (seção completa, sem número); `:141` — `**Depends on**: Etapa preparatória "Fundação operacional"` dentro do bloco da Phase 1 |
| 9 | OPE-02 e EML-05 apontam para a etapa nas DUAS tabelas do REQUIREMENTS; OPE-03 fica na Phase 11; total segue 56 | ✓ VERIFIED | Tabela 1: `EML-05 \| Etapa preparatória`, `OPE-02 \| Etapa preparatória`, `OPE-03 \| Phase 11`. Tabela `### Por fase:208`: linha `— \| Etapa preparatória \| EML-05, OPE-02 \| 2`. Soma por `awk` = **56**; `Coverage: 56 total / Mapped: 56 / Unmapped: 0` |
| 10 | As variáveis novas estão no `.env.example` | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | O artefato `260721-jif-ENV-BLOCO.md` existe e está completo (os 5 nomes, sem valor real, sem `DEBUG_QSTASH`). O arquivo real **não** aparece em `git diff 82db24e..HEAD` — item (a) do Gate 1 |
| 11 | (SC 4 do ROADMAP) E-mail real de `naoresponda@…` chega à caixa do owner | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `montarRemetente` + `replyTo` provados por teste; entrega depende de credencial e DNS — Gate 2 |
| 12 | (SC 6 do ROADMAP) Evento real de funil aparece no PostHog do owner | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `src/lib/analytics/` intocado (correto por decisão); falta projeto/chave — Gate 2 |

**Score:** 8/12 truths verificados (4 presentes, comportamento não exercido — todos dependentes dos gates do owner)

### A allowlist é allowlist de verdade, ou denylist renomeada?

Resposta direta: **é allowlist de verdade nos três campos onde o projeto e o SDK de fato escrevem PII**, e a parte que continua sendo denylist está declarada como tal no próprio código, não escondida.

| Campo | Mecanismo | Prova |
|---|---|---|
| `event.request` | **ALLOWLIST** — `CAMPOS_DE_REQUISICAO_PERMITIDOS = {method, url, headers}`; tudo o mais é apagado por `manterSomente` | `opcoes-sentry.test.ts:158` injeta um campo que o SDK "pode passar a mandar amanhã" (`env: { REMOTE_ADDR }`) e assere que ele cai fora. Uma denylist passaria |
| `event.request.headers` | **ALLOWLIST** insensível a caixa — `{content-type, accept-language, user-agent}` | `:177` injeta `x-real-ip`, `cf-connecting-ip`, `true-client-ip`, `x-forwarded-for`, `Forwarded`, `cookie`, `authorization` e assere que o JSON inteiro do evento não contém o IP. Fecha o CR-03(a) — o `deny` antigo **substituía** o `PII_HEADER_SNIPPETS` embutido do SDK em vez de somar |
| `event.extra` | **ALLOWLIST** — `{fluxo, etapa, rotulo, statusCode, motivo, tenantHash}` | `:135` injeta `email`, `telefone`, `clienteNome` (o que uma fase futura escreveria sem ninguém notar) e assere que somem. Fecha o CR-02 |
| `dataCollection.httpHeaders` | **ALLOWLIST** no próprio SDK (`request.allow` / `response.allow`), não `deny` | `:34` e `:43` |
| `event.user` | substituído por `{ ip_address: null }`, não apagado | `:107` — apagar devolveria a decisão de inferir IP ao toggle do painel (WR-06) |
| breadcrumbs | **denylist de categoria** (`{console}`) + transformação de URL | `:230` e `:253` provam o descarte com os dois payloads reais: a URL do QStash com `?secret=<chave de assinatura>` e o corpo de erro da Evolution com telefone e nome. Declarada como "allowlist invertida" no comentário de `sanitizacao.ts:104` |
| `message`, `exception.values[].value`, `contexts`, `tags` | **não filtrados**, por decisão registrada | `sanitizacao.ts:112-123` explica (filtrar quebra o agrupamento) e aponta a barreira de origem: `erroSinteticoSupabase` reduz `PostgrestError` a `supabase:<code>` (`public-booking.ts:135/159/185`). O limite e o gatilho para expandir estão em `docs/PENDENCIAS.md` |

**O breadcrumb de `console` está desligado no servidor e no edge?** Sim, e por dois caminhos independentes: `semIntegracaoDeConsole` passado como `integrations` em `sentry.server.config.ts:25` e `sentry.edge.config.ts:17` (remove a integração default), **e** `sanitizarBreadcrumb` devolvendo `null` para `category === 'console'`. O teste `opcoes-sentry.test.ts:284-308` lê os três arquivos de init do disco e assere que a linha existe — a configuração quebra o CI antes de quebrar o cliente final, que é o pedido explícito do CR-01.

### Required Artifacts

| Artefato | Esperado | Status | Detalhes |
|---|---|---|---|
| `src/lib/observabilidade/sanitizacao.ts` | Sanitização anti-PII pura | ✓ VERIFIED | 175 linhas, zero imports, consumido pelos 3 inits |
| `src/lib/observabilidade/opcoes-sentry.ts` | Fonte única das travas | ✓ VERIFIED | Consumido por spread nos 3 inits; `stackFrameVariables` e `databaseQueryData` desligados |
| `src/lib/observabilidade/dsn.ts` | Leitura runtime do DSN (WR-01) | ✓ VERIFIED | Não estava no plano; nasceu da revisão. Acesso dinâmico primeiro, literal como fallback de browser |
| `src/lib/observabilidade/erro-supabase.ts` | Erro sintético `supabase:<code>` (WR-09) | ✓ VERIFIED | Não estava no plano; nasceu da revisão. Usado nos 3 pontos do booking |
| `src/lib/observabilidade/reportar.ts` | Borda de reporte, nunca lança, no-op sem DSN | ✓ VERIFIED | + `reportarExcecaoAguardando` com `flush(2000)` (WR-04) |
| `src/lib/env.ts` | Fail-fast, 13 nomes, acesso dinâmico | ✓ VERIFIED | Teste assere 13 sem duplicata e ausência de `CLERK` |
| `src/instrumentation.ts` | `register()` + `onRequestError` | ✓ VERIFIED | `validarEnvObrigatorio()` é a primeira linha; imports dinâmicos por `NEXT_RUNTIME` |
| `src/instrumentation-client.ts` | Sentry de browser, `dom:false`/`console:false`, sem Replay | ✓ VERIFIED | + `onRouterTransitionStart`. `grep -rqiE 'replayintegration\|replayCanvas\|Sentry\.Replay' src` não casa |
| `src/sentry.server.config.ts` / `.edge.config.ts` | Init guardado, opções da fonte única | ✓ VERIFIED | Ambos com `integrations: semIntegracaoDeConsole` |
| `src/lib/email/enviar.ts` | União discriminada, nunca lança | ✓ VERIFIED | Client construído dentro do guard; guard de params antes (WR-03) |
| `src/lib/email/remetente.ts` | Header `from` seguro | ✓ VERIFIED | Quoted-string (CR-04); controle filtrado por `codePointAt`, sem bytes literais no fonte |
| `src/lib/email/classificar.ts` | Vocabulário fechado | ✓ VERIFIED | `Record<CodigoResend, MotivoFalhaEmail>` — exaustividade real do compilador (WR-05); 21 literais |
| `scripts/smoke-fundacao.mjs` | Smoke do owner, nunca lança | ✓ VERIFIED | Saída real sem credencial: `resend: desativado` / `sentry: desativado`, exit 0. Sentry e e-mail separados por `--sentry` (WR-07) |
| `260721-jif-ENV-BLOCO.md` | Bloco exato, sem valores | ✓ VERIFIED | 5 nomes, sem `DEBUG_QSTASH`, com as 13 obrigatórias listadas |
| `.planning/ROADMAP.md` | Etapa + prosa coerente | ✓ VERIFIED | Prosa corrigida ("um destino", "quatro destinos"); tabelas de Cobertura e Progress atualizadas |
| `.planning/REQUIREMENTS.md` | Remapeamento | ✓ VERIFIED | Ver truth 9 |

### Key Link Verification

| De | Para | Via | Status |
|---|---|---|---|
| `src/instrumentation.ts` | `src/lib/env.ts` | `validarEnvObrigatorio()` como **primeira** linha de `register()`, antes dos imports dinâmicos | ✓ WIRED |
| `src/instrumentation.ts` | Next runtime | `export const onRequestError = Sentry.captureRequestError` | ✓ WIRED |
| `opcoesBaseSentry` | 3 arquivos de init | spread `...opcoesBaseSentry` em todos os três | ✓ WIRED (fonte única preservada; o 4º init, o smoke `.mjs`, é duplicata declarada com o motivo — Node cru não transpila TS) |
| `src/lib/email/enviar.ts` | `resend` | `await import('resend')` **dentro** do guard de `desativado` | ✓ WIRED |
| `src/lib/observabilidade/reportar.ts` | `@sentry/nextjs` | import dinâmico dentro da função | ✓ WIRED (a suíte não puxa `@sentry/node`; `vitest.config.ts` intocado) |
| `.planning/ROADMAP.md` Phase 1 | Etapa preparatória | `**Depends on**` no bloco da Phase 1 (`:141`) | ✓ WIRED |

### Behavioral Spot-Checks

| Comportamento | Comando | Resultado | Status |
|---|---|---|---|
| Suíte completa | `pnpm exec vitest run` | 11 arquivos, **164 testes**, 0 falhas | ✓ PASS |
| Smoke sem credencial não lança e prova o no-op pela saída | `node scripts/smoke-fundacao.mjs` | `resend: desativado` / `sentry: desativado`, exit 0 | ✓ PASS |
| `withSentryConfig` preserva o config (A3 da pesquisa) | `node -e` sobre `.next/required-server-files.json` | `imagens-perfis: true \| 6mb: true` | ✓ PASS |
| `register()` não roda em build | `grep phase-production-build` no Next 16.2.10 instalado | `instrumentation-globals.external.js:54` retorna cedo | ✓ PASS |
| Rejeição de `register()` mata o boot | leitura do mesmo arquivo, `:60-68` | reprefixa com `An error occurred while loading instrumentation hook:` e **relança**; `next-server.js:573` chama no `prepareImpl` | ✓ PASS |
| Session Replay ausente de `src/` | `! grep -rqiE 'replayintegration\|replayCanvas\|Sentry\.Replay' src` | sem casamento | ✓ PASS |
| Nenhum `.env*` tocado | `git diff --name-only 82db24e..HEAD \| grep -i '\.env'` | vazio | ✓ PASS |
| Artefatos da Phase 1 intactos | `git diff --stat 82db24e..HEAD -- .planning/phases/01-.../` | vazio | ✓ PASS |
| 12 fases numeradas 1–12, etapa sem número | `grep -cE '^### Phase (1\|…\|12):'` = 12 + header `### Etapa preparatória` | confirmado | ✓ PASS |
| Soma da coluna Qtd = 56 | `awk` da tabela `### Por fase` | `soma: 56` | ✓ PASS |
| Evento chega ao Sentry / PostHog / caixa de e-mail | — | — | ? SKIP (exige credencial de terceiro — Gates 1 e 2) |

`pnpm lint` (exit 0), `pnpm test` (11/164) e `pnpm build` (exit 0, TypeScript limpo, 14/14 páginas) foram executados pelo owner antes desta verificação; `pnpm test` foi reexecutado aqui e bate com o relatado.

### Requirements Coverage

| Requisito | Descrição | Status | Evidência |
|---|---|---|---|
| OPE-02 | Exceção não tratada chega ao owner sem alguém reclamar | ? NEEDS HUMAN | Mecanismo completo e ligado no código (truths 1, 2, 3); a prova de que o evento chega é o Gate 2 |
| EML-05 | Produto funciona sem credencial de e-mail (no-op silencioso) | ✓ SATISFIED | `enviar.ts:57` + 13 casos de teste + saída real do smoke |
| OPE-03 | Funil verificado com tráfego real | — fora de escopo | Continua mapeado para a Phase 11 (conferido na tabela) |

### Anti-Patterns Found

| Arquivo | Linha | Padrão | Severidade | Impacto |
|---|---|---|---|---|
| — | — | Nenhum `TODO`/`FIXME`/`XXX`/`TBD`/`HACK`/`PLACEHOLDER` nos arquivos novos ou alterados por esta task | — | Nenhum |
| `src/lib/observabilidade/reportar.ts:32,33` | — | `catch {}` vazio | ℹ️ Info | É o contrato "nunca lança", documentado no cabeçalho — não é erro engolido por descuido |
| `next.config.ts:41-42` | — | `org: ''` / `project: ''` | ℹ️ Info | Sem `SENTRY_AUTH_TOKEN` não há upload de source map; o owner preenche no Gate 1. Não afeta o build |

### Achados da revisão — status de fechamento

Todos os 5 BLOCKERS foram fechados **no código**, com teste que quebra se alguém afrouxar. Os 11 WARNINGS: 8 fechados, 3 diferidos com gatilho escrito em `docs/PENDENCIAS.md` (commit `b80c408`).

| Achado | Fechado por | Prova |
|---|---|---|
| CR-01 breadcrumb de console ligado no servidor/edge | `2867428` | `semIntegracaoDeConsole` nos dois inits + descarte em `sanitizarBreadcrumb`; testes com os payloads reais (`?secret=` do QStash e telefone/nome da Evolution) |
| CR-02 sanitização era denylist | `15ad6c8` | Allowlist em `request`, `headers` e `extra` + teste com campo injetado |
| CR-03 `dataCollection` desligou os defaults seguros | `7e63ca1` | `httpHeaders` por `allow`, `genAI: false/false`; teste assere que nenhum header de IP é coletável |
| CR-04 `montarRemetente` não escapava specials | `e44c16b` | Quoted-string; 7 casos de special + o caso da vírgula fora das aspas |
| CR-05 domínio sem verificação morria em silêncio | `dd4525b` | `invalid_from_address`/`security_error` → `config_ausente`; `validation_error` com 403 vai ao Sentry mantendo o motivo `rejeitado` (D-04 intacto) |
| WR-01 DSN congelado no build | `d367c7e`, `465a1d6` | `dsn.ts` com acesso dinâmico + teste "lê o DSN em runtime" |
| WR-03 `config_ausente` inalcançável | `a5d580f` | Guard antes do `try`, 4 casos parametrizados |
| WR-04 sem flush | `465a1d6` | `reportarExcecaoAguardando` no webhook; teste assere `flush(2000)` |
| WR-05 exaustividade falsa | `be02ce0` | `Record<CodigoResend, …>` |
| WR-06 `delete evento.user` | `15ad6c8` | `{ ip_address: null }` + teste |
| WR-07 smoke sem as travas | `c168833` | Init do smoke com `dataCollection` fechado + `--sentry` separado do e-mail |
| WR-08 fragmento na URL | `15ad6c8` | `split(/[?#]/)` + teste |
| WR-09 `PostgrestError` cru | `923981c` | `erroSinteticoSupabase` nos 3 pontos |
| WR-11 `err.message` cru na resposta | `465a1d6` | `route.ts:204` devolve `'Erro interno.'` fixo |
| WR-02 lista derruba o próximo deploy | **diferido com gatilho** | `docs/PENDENCIAS.md` — conferir as 4 novas no Railway antes do próximo deploy. É a razão de o Gate 1 ser bloqueante |
| WR-10 `import 'server-only'` | **diferido com gatilho** | `docs/PENDENCIAS.md` — o pacote lança fora da condição `react-server` e quebraria a suíte; DSN é identificador público por design |
| IN-03 `pnpm start` local morre sem secrets | **diferido, documentado** | `docs/PENDENCIAS.md` com a saída (`--env-file` ou `NODE_ENV=development pnpm start`) |

### Human Verification Required

#### 1. Gate 1 — Owner cria os projetos e provisiona os secrets

**Test:** Criar projeto no Sentry (plataforma Next.js) e no PostHog; conferir `mail.vamoagendar.com.br` como **Verified** no Resend e criar API Key de envio; colar o bloco de `260721-jif-ENV-BLOCO.md` no fim do `.env.example`; provisionar as treze obrigatórias no `.env.local` e no Railway.
**Expected:** Resposta "configurado" com (a) confirmação de que as variáveis foram para o `.env.example`, (b) região do PostHog (US ou EU), (c) slugs de organização e projeto do Sentry.
**Why human:** Depende de conta em terceiro e de acesso a `.env.local`/Railway. O executor não tem permissão em `.env*` — verificado: nenhum arquivo `.env` aparece em `git diff 82db24e..HEAD`.
⚠️ **Ordem importa:** as quatro variáveis novas já estão na lista de obrigatórias. Deploy de produção antes de provisioná-las derruba o boot em crash loop — por falta de credencial de observabilidade, que é o oposto do invariante "observabilidade nunca quebra o produto". Está registrado em `docs/PENDENCIAS.md` (WR-02) com a saída de emergência (remover as quatro da lista no mesmo commit do deploy).

#### 2. Gate 2 — Owner confirma visualmente que evento, erro e e-mail chegaram

**Test:** (a) `pnpm dev` + abrir `/` em aba anônima e olhar **Activity** no PostHog; (b) `node --env-file=.env.local scripts/smoke-fundacao.mjs SEU-EMAIL@exemplo.com` e abrir **Issues** no Sentry; (c) conferir a caixa de entrada.
**Expected:** `landing_viewed` aparece em segundos; issue nova no Sentry **sem IP, sem cookie, sem querystring e sem corpo de requisição** no payload; e-mail de `naoresponda@mail.vamoagendar.com.br` com nome `"… via VamoAgendar"` e responder endereçando o profissional — **anotando em qual aba caiu** (insumo direto da Phase 4).
**Why human:** O endpoint do PostHog responde `200 {"status":"Ok"}` até com api_key inválida, e entrega de e-mail só existe na caixa de quem recebe. Nenhum comando afirma que um evento chegou.

### Gaps Summary

**Nenhum gap real.** Nada foi encontrado que exija replanejamento ou correção de código:

- Os 5 blockers da revisão estão fechados no código versionado, cada um com teste que quebra o CI se alguém afrouxar — não com comentário prometendo disciplina.
- A pergunta central ("a allowlist é allowlist de verdade?") tem resposta **sim** nos três campos onde PII de fato aparece, provada por testes que injetam campos novos e asserem que eles somem. O que continua sendo denylist (categoria de breadcrumb) e o que não é filtrado (`message`, `exception.value`, `contexts`, `tags`) está declarado no código, protegido na origem por `erroSinteticoSupabase`, e tem gatilho de expansão escrito em `docs/PENDENCIAS.md`.
- As quatro invariantes de preservação (artefatos da Phase 1, numeração 1–12, total 56, `.env*` intocado) são todas verificadas por comando, não por leitura.

**O que falta é ação do owner, não código:** os quatro itens não verificados dependem inteiramente dos Gates 1 e 2 — criar contas de terceiro, provisionar secrets e olhar três painéis. Isso é o desenho do plano, não uma falha da execução.

**Dois pontos de higiene, sem bloquear:**
1. O `260721-jif-SUMMARY.md` está desatualizado (afirma 9 arquivos/122 testes; hoje são 11/164) e não lista `dsn.ts` nem `erro-supabase.ts`, que nasceram na revisão. Vale atualizar quando os gates fecharem, junto com os campos que o próprio SUMMARY deixou em branco (região do PostHog, slugs, aba do e-mail, confirmação do `.env.example`).
2. `docs/PENDENCIAS.md` já registra WR-02 como ordem obrigatória do próximo deploy — é o item mais consequente desta etapa e não pode ser lido só como pendência de rotina.

---

_Verificado: 2026-07-21T20:04:36Z_
_Verificador: Claude (gsd-verifier)_
