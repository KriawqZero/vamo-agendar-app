# 09 — Observabilidade e e-mail transacional

Entregue pela etapa preparatória **"Fundação operacional"** (quick task `260721-jif`,
2026-07-21), pré-requisito obrigatório da Phase 1.

Três peças que nascem juntas de propósito: sem o Sentry, o wrapper do Resend nasceria
reportando com `console.error` — que no Railway é linha de log que ninguém lê — e a Phase 4
herdaria a dívida de trocar depois.

---

## ⛔ Nunca rode os wizards

`npx @sentry/wizard` e `npx @posthog/wizard` **não devem ser executados neste projeto**.
Ambas as integrações já existem, e os defaults dos wizards são exatamente o que foi
desligado de propósito aqui.

O wizard do Sentry foi rodado em 2026-07-21 e o que ele gerou teve de ser mesclado à mão
(`924dc51`). O que ele quis fazer:

| O que traz | Por que não serve |
|---|---|
| `sentry.server.config.ts` / `sentry.edge.config.ts` na **raiz** | Duplicam os de `src/`. O SDK **não** os auto-carrega (não há referência a `sentry.server.config` em `@sentry/nextjs/build/`); quem carrega é o `import` explícito de `src/instrumentation.ts`. Ficam como código morto com DSN hardcoded — armadilha para quem editar "o arquivo de config" errado |
| `dataCollection: {}` com `userInfo: false` comentado | Definir o objeto **inverte a base para os defaults permissivos** do SDK (`resolveDataCollectionOptions.js:18`): todo campo omitido passa a coletar |
| `tunnelRoute` | Colide com o matcher amplo de `src/proxy.ts` — o comentário que o próprio wizard gera avisa disso |
| bloco `webpack` | No-op sob Turbopack, com aviso de deprecação |
| `enableLogs: true`, `tracesSampleRate: 1` | Não foram decisões nossas; 100% de tracing queima o tier gratuito |

O wizard do **PostHog** (v2.46.0) foi rodado em 2026-07-21 e **teve de ser revertido por
inteiro**. Não é previsão — é o registro do que ele fez, em 13 arquivos:

| O que fez | Efeito |
|---|---|
| **Apagou `inicializarAnalytics()` de `src/lib/analytics/client.ts`** | Sumiram de uma vez `autocapture: false`, `disable_session_recording: true`, `person_profiles: 'identified_only'`, `capture_pageview: false` e `disable_surveys: true`. Session recording voltou a depender do **toggle do painel** — exatamente o que o comentário daquele arquivo manda não fazer |
| Inicializou o PostHog **dentro de `src/instrumentation-client.ts`** | O arquivo do Sentry, onde vivem as travas anti-PII |
| `capture_exceptions: true` no client e `enableExceptionAutocapture: true` no server | Segundo caminho de captura de exceção, que **não passa** por `sanitizarEventoSentry` nem por `beforeSend` |
| Renomeou `NEXT_PUBLIC_POSTHOG_KEY` → `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` | Quebra `docs/08`, o `.env.example`, o Railway e a lista de `src/lib/env.ts` |
| Removeu `$process_person_profile: false` dos eventos de servidor | Evento server-side passaria a criar perfil de pessoa, contrariando decisão documentada em `analytics/server.ts` |
| Trocou o `fetch` direto por `posthog-node` | Dependência nova e um cliente instanciado por evento |
| Pôs `NEXT_PUBLIC_POSTHOG_HOST` como obrigatória em produção | Sem critério — a região é US, onde ela é opcional por ter default |

Nada foi commitado, então `git checkout -- src/ package.json pnpm-lock.yaml` + `pnpm install`
restaurou tudo. **Se acontecer de novo, é esse o procedimento.**

O que ele propôs de bom foram seis nomes de evento, sem PII nas propriedades. Estão guardados
em `docs/PENDENCIAS.md` para entrarem por decisão, não por wizard.

**Do painel, copie à mão apenas o que é credencial ou identificador.** Nada mais.

---

## Sentry

### Onde vive

| Arquivo | Papel |
|---|---|
| `src/instrumentation.ts` | `register()`: valida env, depois importa **dinamicamente** o config do runtime (ordem obrigatória — o SDK de Node precisa inicializar antes de `http`/`undici`/`pg`). Exporta `onRequestError` |
| `src/instrumentation-client.ts` | Browser. Exporta `onRouterTransitionStart` (sem ele o App Router não é instrumentado) |
| `src/sentry.server.config.ts`, `src/sentry.edge.config.ts` | `Sentry.init` por runtime |
| `src/lib/observabilidade/opcoes-sentry.ts` | Opções compartilhadas e as travas anti-PII |
| `src/lib/observabilidade/sanitizacao.ts` | `beforeSend` / `beforeBreadcrumb` |
| `src/lib/observabilidade/reportar.ts` | API que o resto do código usa |
| `src/lib/observabilidade/dsn.ts` | Fonte única do DSN |
| `src/lib/observabilidade/erro-supabase.ts` | Reduz `PostgrestError` a `supabase:<code>` |
| `src/app/global-error.tsx` | Erro de render na raiz da árvore React, que o `onRequestError` não alcança |

**`onRequestError` é o que faz exceção de Server Action chegar ao painel.** Sem essa linha,
OPE-02 é falso mesmo com o SDK instalado e o DSN configurado. Não remover.

### O contrato anti-PII

`/book/[slug]` é público e é onde o cliente final digita nome e telefone. As travas vivem no
**código versionado e são asseguradas por teste** — nunca em toggle de painel, que qualquer
pessoa com acesso pode desfazer sem deixar rastro no git.

- **Session Replay não é instalado.** A integração não é importada nem adicionada em
  `integrations`, então não existe configuração remota capaz de ligá-la.
- **Breadcrumb de `console` é descartado**, por dois caminhos independentes: a integração sai
  dos defaults nos inits de servidor e edge, **e** `sanitizarBreadcrumb` descarta a categoria.
  Motivo concreto: `whatsapp-helper.ts` loga o corpo de resposta da Evolution (que ecoa
  telefone e o texto já com `{{cliente}}` substituído) e `notificacoes-agendamento.ts` loga a
  URL do QStash, que carrega `?secret=<chave de assinatura>`.
- **Allowlist**, não denylist, em `request` (`method`/`url`/`headers`), `request.headers`
  (`content-type`/`accept-language`/`user-agent`) e `extra` (`fluxo`, `etapa`, `rotulo`,
  `statusCode`, `motivo`, `tenantHash`). Campo novo que o SDK passe a mandar cai fora **por
  construção** — há teste que injeta um campo inventado só para provar isso.
- **`dataCollection.httpHeaders` usa `allow`, não `deny`.** Um `deny` **substitui** a lista
  interna `PII_HEADER_SNIPPETS` em vez de somar a ela, e `x-real-ip` — que o Railway põe em
  toda requisição — deixaria de ser filtrado.

**O que continua sem filtro, e por quê:** `message`, `exception.values[].value`, `contexts` e
`tags`. Filtrá-los quebraria o agrupamento de eventos e a utilidade do stack trace. A proteção
deles é **na origem**: por isso `erroSinteticoSupabase()` reduz o erro do Postgres a
`supabase:<SQLSTATE>` antes de reportar — a `.message` do Postgres embute o input do cliente.
Gatilho para revisitar em `docs/PENDENCIAS.md`: quando o projeto usar `setTag`/`setContext` ou
precisar mandar erro de terceiro cru.

### O que reportar e o que não reportar

```ts
reportarExcecao(erro, { fluxo, etapa })     // exceção inesperada
reportarFalhaSilenciosa(msg, { fluxo })     // falha que nunca vira exceção
```

**Condição esperada de negócio não vai ao Sentry** — WhatsApp desconectado, tenant sem plano
Pro, e-mail desativado por falta de credencial. Ruído é como um painel de erro volta a ser
ignorado em seis semanas, e aí OPE-02 vira falso de novo sem ninguém perceber.

A instrumentação cobre uma **lista fechada** de pontos onde o erro morre ou onde a causa raiz
é apagada num fluxo sem sessão: 2 em `whatsapp-helper.ts`, o catch de topo de
`notificacoes-agendamento.ts`, o do webhook de lembrete e 3 em `public-booking.ts`. Os demais
`throw` do projeto já são capturados pelo `onRequestError` — instrumentar onde o erro já é
visível não acrescenta nada.

### Source maps

Ligados (`next.config.ts`), com `sourcemaps.deleteSourcemapsAfterUpload: true` — **sem essa
opção os `.map` ficam servidos em `/_next/` e o código-fonte do produto vira reconstruível a
partir do bundle**. Exigem `SENTRY_AUTH_TOKEN` no ambiente de build; sem ele o plugin apenas
avisa e o build segue. `@sentry/cli` precisa estar liberado em `pnpm-workspace.yaml`.

### Custo conhecido

O SDK client custa **+73,6 KB gzip** em `/book/[slug]` (168,8 → 242,4). Sob Turbopack o
`treeshake` é no-op — não existe configuração que reduza. Está aceito com gatilho de
reavaliação em `docs/PENDENCIAS.md`.

---

## Fail-fast de configuração (`src/lib/env.ts`)

Em `NODE_ENV=production`, variável obrigatória ausente **derruba o boot** listando todos os
nomes faltantes de uma vez. Em desenvolvimento e em teste, no-op.

Disparado por `register()` em `src/instrumentation.ts`, **antes** de qualquer import de
terceiro — invertido, um env faltando estouraria dentro do init do Sentry com a mensagem
errada.

**Não roda durante `next build`** — o Next retorna cedo quando
`NEXT_PHASE === 'phase-production-build'`. Isso é comportamento do framework, não escolha
nossa, e é o que mantém `pnpm build` local sem secrets funcionando de graça.

**Acesso a `process.env` é dinâmico** (`process.env[nome]`), não literal: acesso literal a
`NEXT_PUBLIC_*` é substituído em build time e a validação passaria a conferir o valor
congelado. Pressuposto declarado: o Railway usa o mesmo env em build e runtime.

**Critério para entrar na lista:** *a ausência falha em silêncio ou falha tarde*. Por isso o
Clerk fica de fora — ele falha alto e imediato, e duplicar só criaria risco de errar o nome.
A Phase 1 (SEG-05) acrescenta as chaves de assinatura do QStash a esta mesma lista.

⚠️ **Risco de ordem de operação:** a lista já está ativa. Deploy de produção antes de
provisionar as variáveis novas derruba o boot de propósito. Ver `docs/PENDENCIAS.md`.

---

## E-mail — o wrapper do Resend

**Nunca chame o SDK direto.** `new Resend(undefined)` **lança** (verificado em
`dist/index.mjs`), então instanciar no topo de um módulo derruba o import inteiro em
desenvolvimento sem credencial — o oposto exato do EML-05. O wrapper instancia
preguiçosamente.

```ts
enviarEmail(...): Promise<ResultadoEmail>   // NUNCA lança

type ResultadoEmail =
    | { ok: true; id: string }
    | { ok: false; motivo: MotivoFalhaEmail }

type MotivoFalhaEmail =
    | 'desativado'       // sem RESEND_API_KEY — esperado, silencioso, não vai ao Sentry
    | 'config_ausente'   // defeito NOSSO (remetente recusado, param faltando) — vai ao Sentry
    | 'rejeitado'        // o Resend recusou o destinatário — do chamador, não vai ao Sentry
    | 'falha_transporte' // rede/5xx — inesperado, vai ao Sentry
```

O TypeScript obriga o chamador a tratar a falha antes de usar o `id`, e `motivo` é vocabulário
**nosso**: nenhuma string interna do Resend ("Domain is not verified", "Rate limit exceeded")
atravessa a fronteira nem chega à tela de ninguém.

A distinção entre `rejeitado` e `falha_transporte` é o que a supressão de bounce (EML-06,
Phase 4) vai consumir. **Nota para a Phase 4:** o Resend já suprime hard bounce e complaint
automaticamente e expõe `resend.suppressions.*` — provavelmente não é preciso tabela própria
nem webhook.

`403` no envio é sempre permissão nossa (é assim que "Domain is not verified" chega) e por
isso é reportado; `422` é endereço ruim do chamador e não é.

**Remetente** (`src/lib/email/remetente.ts`): `naoresponda@mail.vamoagendar.com.br`, display
name `"<Estabelecimento> via VamoAgendar"` como **quoted-string RFC 5322** — sem as aspas, um
tenant chamado `Studio Bela, Sobrancelhas` vira dois endereços e o envio é recusado. `reply-to`
vai para o profissional.

DNS: `mail.vamoagendar.com.br` verificado, DKIM propagado. Subdomínio dedicado isola a
reputação do domínio raiz. **Não há MX em lugar nenhum** — correto para `naoresponda@`, mas
significa que nenhum endereço do domínio *recebe* e-mail; o canal de suporte da Phase 10 exige
provedor de caixa próprio.

Teto do Free: 100 e-mails/dia, 3.000/mês, 1 domínio. Ao estourar, a API devolve 429 com
`daily_quota_exceeded`/`monthly_quota_exceeded` — sem lançar.

---

## PostHog

O código **já existia e está correto** — esta etapa não reescreveu nenhuma linha de
`src/lib/analytics/`. Contrato de eventos em `docs/08-ANALYTICS_E_FUNIL.md`.

O que mudou: `NEXT_PUBLIC_POSTHOG_KEY` e `ANALYTICS_TENANT_SALT` passaram de opcionais a
obrigatórias em produção (mudança de contrato declarada em `docs/08`).

⚠️ Se o projeto for da região **EU**, `NEXT_PUBLIC_POSTHOG_HOST` deixa de ser opcional —
errar isso faz nenhum evento aparecer, **sem nenhuma mensagem de erro**.

⚠️ `ANALYTICS_TENANT_SALT` **nunca pode ser trocada** depois de definida: trocar desconecta os
`distinct_id` históricos.

`OPE-03` (evento real de funil verificado em produção) continua na Phase 11 — exige tráfego
real e não é provável aqui.

---

## Smoke test

```bash
node scripts/smoke-fundacao.mjs            # prova o no-op sem credencial
node scripts/smoke-fundacao.mjs --sentry   # valida o Sentry sem gastar e-mail do teto Free
```

Nunca sai com código diferente de 0 — o valor está na **saída**, não no exit code.
