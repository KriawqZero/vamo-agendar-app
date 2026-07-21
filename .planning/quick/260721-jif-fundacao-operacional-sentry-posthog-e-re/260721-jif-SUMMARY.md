---
quick_id: 260721-jif
phase: quick-260721-jif
plan: 01
subsystem: observabilidade-e-email
status: complete
tags: [sentry, resend, posthog, observabilidade, env, anti-pii]
requirements: [OPE-02, EML-05]
completed: 2026-07-21
tasks_completed: 4
tasks_total: 6
gates_pendentes: [Gate 1, Gate 2]
commits:
  - 1ef02eb  # T1 — ROADMAP + REQUIREMENTS
  - 711f14e  # T2 — Sentry + fail-fast de env
  - 60542dd  # T3a — wrapper do Resend + instrumentação
  - b8eff7d  # T3b — smoke test, docs, bloco de env
key-files:
  created:
    - src/instrumentation.ts
    - src/instrumentation-client.ts
    - src/sentry.server.config.ts
    - src/sentry.edge.config.ts
    - src/lib/env.ts
    - src/lib/observabilidade/opcoes-sentry.ts
    - src/lib/observabilidade/sanitizacao.ts
    - src/lib/observabilidade/reportar.ts
    - src/lib/observabilidade/dsn.ts
    - src/lib/observabilidade/erro-supabase.ts
    - src/lib/email/classificar.ts
    - src/lib/email/remetente.ts
    - src/lib/email/enviar.ts
    - scripts/smoke-fundacao.mjs
    - .planning/quick/260721-jif-fundacao-operacional-sentry-posthog-e-re/260721-jif-ENV-BLOCO.md
  modified:
    - .planning/ROADMAP.md
    - .planning/REQUIREMENTS.md
    - next.config.ts
    - pnpm-workspace.yaml
    - src/lib/whatsapp-helper.ts
    - src/lib/notificacoes-agendamento.ts
    - src/app/api/webhooks/lembrete/route.ts
    - src/app/actions/public-booking.ts
    - docs/01-ARQUITETURA_E_STACK.md
    - docs/08-ANALYTICS_E_FUNIL.md
    - docs/PENDENCIAS.md
    - CLAUDE.md
tech-stack:
  added:
    - "@sentry/nextjs@10.67.0"
    - "resend@6.17.2"
---

# Quick Task 260721-jif: Fundação operacional — Summary

Sentry (servidor + browser) com as travas anti-PII no código versionado, fail-fast de
configuração no boot e wrapper do Resend que nunca lança — mais a etapa preparatória
deixando de ser referência órfã no ROADMAP.

**Escopo desta execução:** as quatro tarefas `auto` (T1, T2, T3a, T3b). Os dois gates
dependem de ação do owner e **não** foram executados.

## Definition of Done — saída real

Estado **final**, depois dos 12 commits de correção da revisão (`2867428`..`b80c408`).
Executado pelo orquestrador na árvore principal, não relatado pelo executor.

```
$ pnpm lint
$ eslint
exit=0                     (sem saída = sem violação)

$ pnpm test
$ vitest run
 RUN  v4.1.10 /mnt/Files/VamoAgendar/vamo-agendar-app
 Test Files  11 passed (11)
      Tests  164 passed (164)
   Duration  346ms
exit=0

$ pnpm build
✓ Compiled successfully
  Finished TypeScript
✓ Generating static pages using 11 workers (14/14)
  Route (app) — 14 rotas, tabela completa
exit=0
```

Ao fim das quatro tarefas `auto` eram 9 arquivos / 122 testes; os 42 testes acrescentados
depois cobrem os cinco blockers e os warnings da revisão, cada um verificado falhando antes
do fix.

Conferência do config resolvido: `next.config preservado: images e serverActions intactos`
— a suposição A3 da pesquisa (`withSentryConfig` preserva `images.remotePatterns` e
`bodySizeLimit: '6mb'`) virou **fato verificado**, não crença.

## First Load JS de `/book/[slug]` — antes e depois

⚠️ **O Next 16 removeu as métricas `size` e `First Load JS` do output do `next build`**
(verificado em `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md:1000` —
o time do Next as considerou imprecisas em arquitetura com RSC). O número pedido pelo plano
não existe mais nessa forma. Substituí por uma medida equivalente e reproduzível: a soma
dos chunks JS de cliente que a rota carrega, lidos do `build-manifest` por rota que o
próprio Next emite (`.next/server/app/book/[slug]/page/build-manifest.json`).

| Momento | Arquivos | Bruto | **Gzip** |
|---|---|---|---|
| Antes do Sentry | 8 | 556,3 KB | **168,8 KB** |
| Depois do Sentry | 9 | 786,4 KB | **242,4 KB** |
| **Custo do Sentry** | +1 | +230,1 KB | **+73,6 KB** |

**+73,6 KB gzip é bem acima dos 20–30 KB que a pesquisa estimou (suposição A2 — errada).**
A causa está na própria pesquisa: sob Turbopack o `treeshake` do `withSentryConfig` é
no-op, então não existe configuração capaz de reduzir isso, e os números da tabela do
Sentry eram do `@sentry/browser` puro, sem o wrapper de rotas do `@sentry/nextjs`.

Não mudei a decisão por conta própria: server+client foi decisão explícita do owner (D-02),
com justificativa de produto. O custo está registrado em `docs/PENDENCIAS.md` com gatilho —
se a conversão do booking mostrar sensibilidade a peso de página, reavaliar.

## `dataCollection` existe? Sim — e com forma diferente da que a pesquisa supôs

A pesquisa marcou este ponto como `[CITADO: doc]`, não verificado. Conferido em
`@sentry/core@10.67.0` (`build/types/types/datacollection.d.ts`): **existe**, e o plano de
escrever `sendDefaultPii: false` + o bloco granular está correto. Três divergências reais
em relação ao esboço da pesquisa, todas corrigidas:

| Esboço da pesquisa | API real |
|---|---|
| `queryParams: []` | `queryParams` está **deprecado**; o vivo é `urlQueryParams`, e o tipo é `CollectBehavior` (`false`), não array |
| `cookies: []` | `cookies` é `CollectBehavior` → `false` |
| `httpHeaders: { deny: [...] }` | é aninhado: `{ request?: CollectBehavior; response?: CollectBehavior }` |

Achado relevante que **não estava em lugar nenhum** (pesquisa nem plano) e que desliguei
por conta própria — são vetores diretos de PII e a ausência violaria o invariante
"nunca PII", então entram como correção obrigatória, não como escopo novo:

- **`stackFrameVariables`** (default `true`): captura o valor das variáveis locais nos
  frames do stack. Numa exceção dentro de `criarAgendamentoPublico`, isso é literalmente
  `nome` e `telefone` do cliente final.
- **`databaseQueryData`** (default `true`): inclui parâmetros de query e **dados
  retornados** — ou seja, a linha de `clientes` vinda do Supabase.

Registro honesto de uma sutileza da API: quando `dataCollection` está definido,
**`sendDefaultPii` é ignorado** (documentado no `.d.ts` do SDK). Ele fica no objeto como
documentação de intenção; quem governa de fato é o bloco granular. O teste afirma sobre os
dois.

## Lista fechada de pontos instrumentados

O que as fases seguintes **já podem considerar coberto**:

| Ponto | Arquivo | Rótulo no Sentry |
|---|---|---|
| Exceção não tratada de Server Action / rota | `src/instrumentation.ts` | via `onRequestError` |
| Lembrete com env faltando | `src/lib/whatsapp-helper.ts` | `qstash:sem_token` |
| Falha de transporte da Evolution (HTTP) | `src/lib/whatsapp-helper.ts` | `whatsapp:falha_transporte` + `statusCode` |
| Falha de rede da Evolution | `src/lib/whatsapp-helper.ts` | `whatsapp:erro_rede` |
| Catch de topo das notificações | `src/lib/notificacoes-agendamento.ts` | `fluxo: notificacoes_agendamento` |
| Catch de topo do webhook de lembrete | `src/app/api/webhooks/lembrete/route.ts` | `fluxo: webhook_lembrete` |
| Booking público — buscar cliente | `src/app/actions/public-booking.ts` | `etapa: buscar_cliente` |
| Booking público — cadastrar cliente | `src/app/actions/public-booking.ts` | `etapa: cadastrar_cliente` |
| Booking público — criar agendamento | `src/app/actions/public-booking.ts` | `etapa: criar_agendamento` |
| Cota do Resend estourada | `src/lib/email/enviar.ts` | `resend:<nome_do_erro>` (nasce instrumentado) |

**Deliberadamente FORA** (D-05 — ruído é como o owner para de olhar a ferramenta):
`whatsapp_desconectado`, `plano_sem_whatsapp` e `agendamento_cancelado` são condição de
negócio, não defeito.

**Herança explícita, não lacuna:** fila do Asaas pausada (**Phase 9**, não existe código
hoje) e os ~105 demais `throw new Error` das actions B2B — cada um já produz evento via
`onRequestError`; instrumentar a causa raiz é ganho de mensagem, e cabe à fase que tocar
cada action.

## Confirmação do owner sobre o `.env.example`

> **Bloco F — variáveis novas no `.env.example`: PENDENTE.**
> _(a preencher no Gate 1 — resposta do owner: ____)_

O executor **não tem permissão de leitura nem de escrita em `.env*`** nesta sessão, então
nenhum comando deste plano tocou o arquivo real. O entregável saiu como artefato
versionado: `260721-jif-ENV-BLOCO.md`. **Este item só fecha com a confirmação explícita do
owner.** A Phase 1 (SEG-05) vai estender essa mesma lista de obrigatórias e precisa saber
se o `.env.example` está em dia sem ter que perguntar de novo.

Também a preencher no Gate 1/2: região do PostHog (US ou EU), slugs de org e projeto do
Sentry, e a aba em que o e-mail de teste caiu (insumo da Phase 4).

## Desvios do plano

### 1. [Rule 3 — bloqueio] `First Load JS` não existe mais no Next 16
Encontrado no passo 0 da T2. O plano mandava anotar o número da saída do `pnpm build`; a
métrica foi removida no Next 16. Substituída por medição do `build-manifest` por rota
(bruto + gzip), documentada acima. Sem essa substituição o passo 0 não teria produto.

### 2. [Rule 3 — bloqueio] `@sentry/cli` derrubava todo `pnpm exec`
O postinstall do `@sentry/cli` entrou como "build ignorado", e isso faz o `pnpm install`
implícito sair com código 1 — quebrando o hook de lint/prettier do projeto a cada escrita.
Resolvido marcando `'@sentry/cli': false` em `pnpm-workspace.yaml`, com o porquê no
comentário: o binário serve só ao upload de source maps, deliberadamente fora desta etapa.
A alternativa (aprovar o build) instalaria um binário baixado da rede sem uso.

### 3. [Rule 2 — segurança] `stackFrameVariables` e `databaseQueryData` desligados
Detalhado acima. Vetores de PII que nem a pesquisa nem o plano listaram, ligados por padrão
no SDK. Deixá-los ligados violaria o invariante "nunca PII" com Sentry client no
`/book/[slug]`.

### 4. [Rule 2 — correção] `onRouterTransitionStart` exportado
O build imprimia `ACTION REQUIRED` do próprio SDK: sem esse hook, navegação do App Router
não é instrumentada. `/book/[slug]` é um wizard — erro que só aparece depois da primeira
transição de etapa ficaria invisível, que é exatamente a classe de falha que motivou a
decisão do owner de ligar o Sentry no client. Commit `b8eff7d`.

### 5. [Rule 1 — correção] `resend` resolveu 6.17.2, não 6.18.0
A pesquisa verificou a API contra 6.18.0. O ambiente tem política de supply-chain com
cooldown por idade de release, e a 6.18.0 foi publicada **5 horas antes** desta execução —
o pnpm resolveu 6.17.2 (13 dias). Não forcei a versão nova: a política é um bom padrão de
segurança. Em vez disso **reconferi os fatos que sustentam o wrapper na versão instalada**:
constructor lançando sem chave (`dist/index.mjs:1150`), união `RESEND_ERROR_CODE_KEY`,
`replyTo` e `idempotencyKey`. Todos confirmados.

### 6. [Rule 1 — correção] A tabela de erros do Resend cobria 19 de 21 literais
`invalid_access` e `invalid_region` existem na união do SDK e não estavam na tabela do
plano. Cairiam no `default` (`falha_transporte`), o que é seguro mas impreciso: os dois são
problema de credencial/parâmetro **nosso**. Mapeados como `config_ausente`. O `default`
continua existindo e continua apontando para `falha_transporte`, como o plano exige.

### 7. [Rule 1 — bug] Escapes de controle viraram bytes literais no fonte
Ao escrever a sanitização do header `from`, `\x00-\x1F\x7F` foi gravado como **bytes de
controle reais** dentro do arquivo — semanticamente correto, mas invisível em revisão e
frágil a qualquer ferramenta que reformate. Reescrito com filtro por `codePointAt`, e
verificado por grep que não sobrou nenhum byte de controle no fonte.

### 8. Ajuste no contrato do smoke test
O plano pedia "sem argumento não envia nada, só imprime o uso", mas a verificação
automatizada roda o script **sem argumento** esperando `resend: desativado`. Como escrito,
os dois não podiam ser verdade juntos. Resolvido separando diagnóstico de envio: sem
destinatário o script imprime o uso **e** o diagnóstico por produto, e não envia nada. Os
dois intentos ficam satisfeitos.

## Decisões preservadas (não foram tocadas)

- `tunnelRoute` e source maps continuam fora, com gatilho em `docs/PENDENCIAS.md`
- `DEBUG_QSTASH` continua diferido e **não** aparece no bloco de env (verificado por grep negativo)
- Nenhuma linha de `src/lib/analytics/` foi reescrita
- Nenhuma variável nova em `vitest.config.ts` (arquivo intocado, conferido por `git status`)
- Os quatro artefatos da Phase 1 seguem sem modificação
- 12 fases numeradas 1 a 12; soma da coluna Qtd = **56**, conferida por `awk`
- Nenhum secret passou pelo chat, pelo repositório ou pelas mãos do executor

## Gates pendentes do owner

- **Gate 1 (bloqueante):** criar projeto no Sentry e no PostHog, colar o bloco de
  `260721-jif-ENV-BLOCO.md` no `.env.example`, e provisionar as treze obrigatórias no
  `.env.local` e no Railway **antes do próximo deploy** — a partir desta etapa, variável
  ausente derruba o boot de propósito.
- **Gate 2 (bloqueante):** confirmar visualmente que evento chega ao PostHog, issue chega
  ao Sentry sem PII no payload, e o e-mail do smoke test chega à caixa (anotando a aba).

## Self-Check: PASSED

Arquivos criados conferidos por `test -f`; commits conferidos por `git log`; invariantes de
preservação conferidos por `git status --porcelain` e `awk`.
