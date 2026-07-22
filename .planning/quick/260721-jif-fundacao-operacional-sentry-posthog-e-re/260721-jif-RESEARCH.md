# Quick Task 260721-jif: Fundação operacional — Research

**Pesquisado:** 2026-07-21
**Confiança geral:** ALTA nos pontos decisivos (fonte local do Next 16.2.10 e código real do SDK do Resend lidos em disco); MÉDIA no custo de bundle do Sentry.

Legenda de proveniência: `[VERIFICADO]` = confirmado em fonte executável (código em
`node_modules/`, tarball do npm, `npm view`) · `[CITADO: url]` = doc oficial ·
`[INFERIDO]` = raciocínio meu, não confirmado nesta sessão.

---

## Versões

| Pacote | Versão atual | Nota |
|---|---|---|
| `@sentry/nextjs` | **10.67.0** | `peerDependencies.next = "^13.2.0 \|\| ^14.0 \|\| ^15.0.0-rc.0 \|\| ^16.0.0-0"` — **Next 16 é suportado oficialmente** `[VERIFICADO: npm view @sentry/nextjs]` |
| `resend` | **6.18.0** | deps: `postal-mime`, `standardwebhooks` `[VERIFICADO: npm view resend]` |

Instalação: `pnpm add @sentry/nextjs resend`.

---

## 1. Sentry em Next.js 16

### 1.1 Divergências vs. conhecimento de treinamento (registrar)

| O que eu "lembrava" | O que a doc/código diz hoje |
|---|---|
| `sentry.client.config.ts` no root | **Morreu.** O client vive em `src/instrumentation-client.ts` (convenção do Next, `v15.3+`) `[CITADO: docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup]` + `[VERIFICADO: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation-client.md]` |
| `sentry.server.config.ts` / `sentry.edge.config.ts` morreram | **Continuam existindo**, mas agora são importados dinamicamente de dentro do `register()` do `instrumentation.ts` `[CITADO: manual-setup]` |
| `sendDefaultPii: false` é a trava canônica | **`sendDefaultPii` está DEPRECADO** e sai no próximo major; o substituto é `dataCollection` (granular). O default do SDK já é conservador. `[CITADO: docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options]` |
| `treeshake` reduz o bundle | **No-op sob Turbopack** — junto com `autoInstrumentServerFunctions`, `autoInstrumentMiddleware`, `excludeServerRoutes`, `automaticVercelMonitors`, `reactComponentAnnotation` `[CITADO: .../configuration/build]` |

**Consequência para a decisão #2 do CONTEXT:** manter `sendDefaultPii: false` **explícito**
continua correto (funciona, é o default, documenta a intenção no código versionado), mas o
plano deve **acrescentar** o bloco `dataCollection` — é a API viva e é ela que sobrevive ao
próximo major. Escrever só `sendDefaultPii: false` deixa uma dívida de deprecação nascendo.

### 1.2 Instalação sem wizard — arquivos exatos

Quatro arquivos. Como o projeto usa `src/`, os dois arquivos de convenção do Next **têm que
ficar em `src/`** `[VERIFICADO: node_modules/next/dist/docs/01-app/02-guides/instrumentation.md:43]`.
Os dois `sentry.*.config.ts` são import relativo comum — podem morar ao lado.

**`src/instrumentation.ts`**
```ts
import * as Sentry from '@sentry/nextjs'
import { validarEnvObrigatorio } from './lib/env'

export async function register() {
    // Fail-fast de config ANTES de qualquer init de terceiro.
    validarEnvObrigatorio()

    if (process.env.NEXT_RUNTIME === 'nodejs') {
        await import('./sentry.server.config')
    }
    if (process.env.NEXT_RUNTIME === 'edge') {
        await import('./sentry.edge.config')
    }
}

export const onRequestError = Sentry.captureRequestError
```

O `await import()` dinâmico **não é cosmético**: `@sentry/node` precisa inicializar antes que
as libs instrumentadas (http, undici, pg) sejam carregadas. Inlinear o `Sentry.init()` direto
no `register()` com import estático no topo do arquivo quebra essa ordem. `[INFERIDO a partir
da ordem exigida pelo OTel; a doc só mostra o padrão com import dinâmico]`

**`src/instrumentation-client.ts`** — roda **depois do HTML carregar e antes da hidratação**
`[VERIFICADO: instrumentation-client.md:82-88]`. É o arquivo que vai rodar no `/book/[slug]`.

**Sim, `register()` e a validação de env convivem no mesmo arquivo** (resposta direta à
discretion "se são o mesmo arquivo"): são o mesmo `register()`, e a ordem importa — validar
primeiro, para que um env faltando derrube o boot com a mensagem certa em vez de estourar
dentro do init do Sentry.

### 1.3 No-op sem DSN

> "dsn — If this is not set, the SDK will not send any events."
> `[CITADO: .../configuration/options]`

Passar `dsn: process.env.NEXT_PUBLIC_SENTRY_DSN` e deixar `undefined` em dev **já é no-op de
envio**. Mas `enabled: false` "doesn't prevent all overhead from Sentry instrumentation" — a
doc recomenda **não chamar `Sentry.init()`** quando se quer desligar de verdade. Padrão
alinhado ao `client.ts:25` do PostHog (guard-clause antes do init):

```ts
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
if (dsn) {
    Sentry.init({ dsn, /* ... */ })
}
```

### 1.4 Config anti-PII — código real

O que o SDK **já não manda por padrão**, sem nenhuma config nossa
`[CITADO: .../data-management/data-collected]`:
- cookies — não enviados
- IP do usuário — não enviado sem `dataCollection`/`sendDefaultPii`
- corpo da requisição — "Sentry only sends the body size inferred from the `content-length`
  header, not the body content itself"
- headers **são** enviados (com scrub automático de `auth`, `token`, `password`)

Ou seja: **o corpo da Server Action não vaza por default**. O `beforeSend` da decisão #2 é
defesa em profundidade, não a única barreira — vale escrever isso no comentário do código
para a próxima sessão não achar que é a trava única.

Os vetores reais que sobram no client do `/book/[slug]`: **querystring na URL**, **breadcrumbs
de DOM** (clique/keypress) e **breadcrumbs de console** (se algum `console.error` nosso
imprimir telefone).

```ts
// src/instrumentation-client.ts
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
    Sentry.init({
        dsn,
        environment: process.env.NODE_ENV,

        // Session Replay: NÃO instalado. replayIntegration nunca é importada —
        // não existe toggle de painel capaz de ligá-la.
        // (mesma regra de client.ts:35 do PostHog)

        sendDefaultPii: false, // deprecado, mas explícito documenta a intenção
        dataCollection: {
            userInfo: false,
            httpBodies: [],
            httpHeaders: { deny: ['cookie', 'authorization', 'x-forwarded-for'] },
            cookies: [],
            queryParams: [],
        },

        tracesSampleRate: 0, // sem tracing nesta etapa: só erro
        maxBreadcrumbs: 20,

        integrations: [
            Sentry.breadcrumbsIntegration({
                dom: false,     // clique/keypress na página onde o cliente digita nome+telefone
                console: false, // nossos console.error carregam contexto de negócio
                fetch: true,
                history: true,
                xhr: true,
                sentry: true,
            }),
        ],

        beforeSend(event) {
            if (event.request?.url) {
                event.request.url = event.request.url.split('?')[0]
            }
            delete event.request?.query_string
            delete event.request?.data
            delete event.request?.cookies
            delete event.user
            return event
        },

        beforeBreadcrumb(breadcrumb) {
            // fetch/xhr guardam a URL completa em data.url
            if (typeof breadcrumb.data?.url === 'string') {
                breadcrumb.data.url = breadcrumb.data.url.split('?')[0]
            }
            return breadcrumb
        },
    })
}
```

Notas de precisão sobre esse bloco:

- `breadcrumbsIntegration({ dom, console, fetch, history, xhr, sentry })` — assinatura e
  semântica `[CITADO: .../configuration/integrations/breadcrumbs]`. A doc afirma que o
  breadcrumb de DOM captura **id/classe do elemento, não o valor do input** — logo
  `dom: false` é **cinto e suspensório**, não correção de um vazamento conhecido.
  Registrando honestamente: não encontrei fonte que diga que o valor vaza.
- Alternativa mais agressiva citada pela doc: `integrations: (defaults) => defaults.filter(i => i.name !== 'Breadcrumbs')`.
  Prefiro a versão granular — mantém o breadcrumb de navegação, que é o que dá contexto útil.
- `beforeSend` roda **depois** do scope aplicado; retornar `null` descarta o evento
  `[CITADO: .../configuration/options]`.
- O mesmo bloco de `beforeSend`/`dataCollection` deve ser repetido em `sentry.server.config.ts`
  (a action pública recebe nome/telefone no server). **Extrair para um módulo compartilhado**
  (ex.: `src/lib/observabilidade/sanitizacao.ts`, função pura, testável em `src/lib/__tests__/`)
  — é a única parte disso que dá para cobrir com Vitest.

### 1.5 Custo no bundle do `/book/[slug]`

| Configuração | Tamanho (min+gzip) | Fonte |
|---|---|---|
| Sentry mínimo, sem default integrations, sem tracing | **< 20 KB** | `[CITADO: mintlify.com/getsentry/sentry-javascript/guides/best-practices/bundle-size]` |
| `@sentry/browser` + tracing (bundle CDN ES6) | **28,16 KB** | idem |
| + Session Replay | **~69,5 KB** (replay sozinho ~50 KB) | idem |

Sem Replay, a faixa realista é **20–30 KB gzip**. `[MÉDIA confiança — números do
`@sentry/browser` puro; o `@sentry/nextjs` adiciona o wrapper de rotas.]`

**Aviso importante:** sob Turbopack, `withSentryConfig({ webpack: { treeshake: { removeTracing }}})`
é **no-op** `[CITADO: .../configuration/build]`. Ou seja: `tracesSampleRate: 0` **para o
tráfego, mas o código do tracing continua no bundle.** Não dá para chegar aos "< 20 KB"
por configuração no Next 16 hoje.

**Recomendação:** aceitar ~30 KB e **medir de fato** com a saída do `pnpm build` (First Load JS
da rota `/book/[slug]`) antes e depois, em vez de confiar nesta tabela. É um número de 30
segundos e vira critério de aceite verificável.

### 1.6 Tier gratuito do Sentry (Developer)

`[CITADO: sentry.io/pricing]` — 5.000 erros/mês · 5M spans · 50 replays · **1 usuário** ·
retenção 30 dias · projetos ilimitados.

O que acontece ao estourar não está escrito na página de pricing. `[INFERIDO]`: eventos acima
da cota são descartados até o ciclo virar, salvo pay-as-you-go ativado. Duas consequências
práticas para o plano:

- **1 usuário** = o owner. Não dá para adicionar o sócio no Free.
- 5.000 erros/mês só estoura com erro em loop. Com `tracesSampleRate: 0` não há consumo de
  span. Vale ligar o alerta de spike do próprio Sentry (grátis, e-mail).

### 1.7 `withSentryConfig` e o `next.config.ts` atual

```ts
export default withSentryConfig(nextConfig, {
    org: '<slug>',
    project: '<slug>',
    silent: !process.env.CI,
})
```
`[CITADO: manual-setup]`

A função **recebe o `nextConfig` existente e o estende** — `images.remotePatterns` e
`experimental.serverActions.bodySizeLimit` seguem intactos. `[INFERIDO a partir da assinatura
e do exemplo oficial "Your existing Next.js configuration"; não executei o build para provar.
Se o planner quiser prova, é um `pnpm build` + inspeção do upload de imagem.]`

**Não passar** `disableLogger`, `automaticVercelMonitors` nem `webpack.*`: são no-ops sob
Turbopack e emitem warning de deprecação.

### 1.8 `tunnelRoute` — armadilha específica deste repo

Ad blockers bloqueiam requisições para `*.sentry.io`. No `/book/[slug]`, que é público e
recebe tráfego de campanha, isso significa perder uma fração dos eventos de client — a
superfície que motivou a decisão #2. O `tunnelRoute` resolve roteando pelo próprio servidor.

Mas: *"If using Turbopack with middleware, you must set a fixed string path and configure your
middleware to exclude that route, or client-side event recording will fail."*
`[CITADO: .../configuration/build]`

Este projeto tem `src/proxy.ts` com um matcher que captura quase tudo. Duas saídas:

1. **Não usar `tunnelRoute` nesta etapa** (recomendação). Aceita perda parcial de evento de
   client, zero risco de quebrar o gate do Clerk. Reavaliar quando houver dado real.
2. Usar `tunnelRoute: '/monitoring'` + adicionar `'/monitoring'` ao `isPublicRoute` **e**
   verificar se basta (a doc pede *exclude*, não *public*) — exige teste manual com ad
   blocker ligado.

Se o planner escolher (2), isso é um `checkpoint:human-verify`, não uma task normal.

### 1.9 Source maps

`[CITADO: manual-setup]` — requer `authToken: process.env.SENTRY_AUTH_TOKEN` +
`widenClientFileUpload: true` no `withSentryConfig`, e o token no ambiente de build (Railway).

**Recomendação — o mínimo que ainda dá stack trace útil:** *não subir source maps nesta etapa.*
Erro de **servidor** (Server Actions, engine de slots, webhooks) já chega com stack trace
legível sem source map, porque o build de servidor do Next não minifica agressivamente e é o
lugar onde estão as regras de negócio. `[INFERIDO — confiança média]` O que fica ilegível é o
stack de **client**, e o valor imediato do client aqui é saber *que* quebrou e em qual rota,
não a linha exata. Subir source maps acrescenta um secret (`SENTRY_AUTH_TOKEN`), um passo de
build e um modo de falha novo (build quebra se o upload falhar) numa etapa cujo objetivo é
justamente ter fundação estável. Ligar depois é um PR de 5 linhas.

### 1.10 Incompatibilidades conhecidas Next 16 / React 19 / Turbopack

- **Cache Components + Sentry:** existe issue aberta —
  `Sentry.captureException` quebra o prerender com Cache Components ligado
  (`getsentry/sentry-javascript#21333`); e o OTel do Sentry usa `Math.random()` para span id,
  o que o Next 16 barra durante prerender (`vercel/next.js#94753`).
  **NÃO SE APLICA A ESTE PROJETO:** `cacheComponents` é **opt-in** — precisa de
  `cacheComponents: true` no `next.config.ts` `[VERIFICADO:
  node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/cacheComponents.md]`,
  e o `next.config.ts` atual não o tem. Anotar como restrição futura: **ligar Cache Components
  depois exige revisitar o Sentry.**
- **Server Actions não são instrumentadas automaticamente** sob Turbopack — "don't emit OTel
  spans we can hook into" `[CITADO: blog.sentry.io/turbopack-support-next-js-sdk]`. Erro que a
  action **lança** ainda chega via `onRequestError` (`routeType: 'action'`
  `[VERIFICADO: instrumentation.md:110]`). Erro que a action **engole** (que é o padrão deste
  repo: `console.error` + `throw new Error('mensagem amigável')`) chega como a mensagem
  amigável, perdendo a causa raiz. **Isso é uma descoberta que muda o plano:** para OPE-02
  valer alguma coisa, os `catch` das actions precisam chamar
  `Sentry.captureException(errOriginal)` antes do `throw` amigável. Sem isso o Sentry recebe
  "Não foi possível salvar o serviço" e nada mais.

### 1.11 Vitest 4

`@sentry/nextjs` importado em um módulo sob teste resolve, em ambiente Node, para o build de
servidor → puxa `@sentry/node` + instrumentações OTel. Não deve lançar (não há env obrigatória
no load) `[INFERIDO]`, mas é import pesado e desnecessário.

**Recomendação que evita a questão inteira:** manter o import do Sentry **fora** dos módulos
puros. Concretamente:
- `src/lib/email/classificar.ts` → função pura `classificarErroResend(error)`, zero imports,
  testável direto.
- `src/lib/observabilidade/sanitizacao.ts` → `beforeSend`/`beforeBreadcrumb` como funções
  puras, zero imports, testáveis direto.
- O `Sentry.captureException` fica só na borda (o wrapper que chama a API, os arquivos de
  init) — não coberto por unit test, coberto pelo gate manual do owner.

Assim **nenhum `env` novo entra no `vitest.config.ts`**, e o padrão de env-stub existente
(linhas 9–13) continua servindo só ao que já servia.

---

## 2. Wrapper do Resend

### 2.1 O ROADMAP:213 está CORRETO — mas incompleto

**Confirmado lendo o código do pacote** `[VERIFICADO: resend@6.18.0, dist/index.mjs:1220-1285]`:
`fetchRequest` envolve **tudo** em `try/catch`. Falha de rede/DNS/timeout **não lança** —
retorna:

```js
{ data: null, error: { name: 'application_error', statusCode: null,
                       message: 'Unable to fetch data. The request could not be resolved.' },
  headers: null }
```

**O que o ROADMAP não diz e é um bug esperando acontecer:** o **construtor lança**.

```js
// dist/index.mjs:1203  [VERIFICADO]
if (!key) {
    if (typeof process !== 'undefined' && process.env) this.key = process.env.RESEND_API_KEY
    if (!this.key) throw new Error('Missing API key. Pass it to the constructor `new Resend("re_123")`')
}
```

Consequência direta para o wrapper: **nunca instanciar `new Resend()` no top-level do módulo.**
Um `const resend = new Resend(process.env.RESEND_API_KEY)` no escopo do arquivo derruba o
import inteiro em dev sem credencial — exatamente o oposto do EML-05. O client tem que ser
construído **depois** do guard de `desativado`, em função.

Bônus verificado: o SDK faz `console.error('[Resend API Error]:', ...)` internamente, mas
**só quando `NODE_ENV !== 'production'`** `[VERIFICADO: dist/index.mjs, método `logError`]` —
não vaza mensagem do Resend em log de produção.

### 2.2 Tipos reais (colar no wrapper)

```ts
// [VERIFICADO: resend@6.18.0, dist/index.d.mts:120-135]
type Response<T> =
    ({ data: T; error: null } | { error: ErrorResponse; data: null })
    & { headers: Record<string, string> | null }

type ErrorResponse = {
    message: string
    statusCode: number | null
    name: RESEND_ERROR_CODE_KEY
}

type CreateEmailResponseSuccess = { id: string }
```

`RESEND_ERROR_CODE_KEY` é uma **união fechada de 21 literais** — o SDK já dá vocabulário
tipado, o que torna o mapeamento para `MotivoFalhaEmail` exaustivo e verificável pelo
compilador.

### 2.3 Rejeitado vs. falha de transporte — a distinção da decisão #4

Tabela completa `[VERIFICADO: união de tipos do SDK]` + `[CITADO: resend.com/docs/api-reference/errors]`:

| `error.name` | HTTP | `MotivoFalhaEmail` | Por quê |
|---|---|---|---|
| `validation_error` | 400/403 | `rejeitado` | campo inválido, domínio não verificado |
| `invalid_from_address` | 422 | `rejeitado` | remetente errado |
| `missing_required_field` | 422 | `config_ausente` | erro de programação nosso |
| `invalid_parameter` | 422 | `config_ausente` | idem |
| `invalid_attachment` | 422 | `config_ausente` | idem |
| `missing_api_key` / `invalid_api_key` / `restricted_api_key` | 401/403 | `config_ausente` | credencial errada — merece Sentry |
| `invalid_idempotency_key` | 400 | `config_ausente` | |
| `invalid_idempotent_request` / `concurrent_idempotent_requests` | 409 | `rejeitado` | |
| `daily_quota_exceeded` / `monthly_quota_exceeded` | 429 | `falha_transporte` | **cota estourada — tem que gritar no Sentry** |
| `rate_limit_exceeded` | 429 | `falha_transporte` | retentável |
| `security_error` | 451 | `rejeitado` | |
| `application_error` / `internal_server_error` | 500 **ou `statusCode: null`** | `falha_transporte` | 5xx **e também a falha de rede** |
| `not_found` / `method_not_allowed` | 404/405 | `config_ausente` | rota errada = bug nosso |

**A pegadinha central:** `application_error` é usado tanto para 5xx quanto para falha de rede
(`statusCode: null`) quanto para resposta ilegível. Classificar só por `name` funciona
(ambos são `falha_transporte`), mas se em algum momento o plano quiser distinguir "servidor
do Resend caiu" de "nosso container não tem rede", o discriminante é `statusCode === null`.

**Recomendação para a assinatura:** classificar por `name`, com `default: 'falha_transporte'`
no switch. Um `name` desconhecido (SDK novo) deve cair no lado que vai ao Sentry, não no lado
silencioso.

**Nota importante para a decisão #4:** `rejeitado` **não significa bounce**. Bounce é
assíncrono — acontece depois do `202`. O `rejeitado` do wrapper cobre rejeição *síncrona*
(endereço malformado, domínio não verificado). Ver 2.6.

### 2.4 `from` com nome e `replyTo`

`[VERIFICADO: JSDoc em dist/index.d.mts, CreateEmailBaseOptions]`

```ts
/** Sender email address. To include a friendly name, use the format `"Your Name <sender@domain.com>"` */
from: string
/** Reply-to email address. For multiple addresses, send as an array of strings. */
replyTo?: string | string[]
```

Ou seja, o EML-04 é literalmente:
```ts
from: `${nomeEstabelecimento} via VamoAgendar <naoresponda@mail.vamoagendar.com.br>`,
replyTo: emailDoProfissional,
```

⚠️ `nomeEstabelecimento` vem do banco e é input do usuário. `<`, `>` e `"` no nome quebram o
header. **Sanitizar** (remover `<>"` e control chars) antes de interpolar — função pura,
testável, mora junto do wrapper. Não achei doc do Resend sobre isso `[INFERIDO — mas é
propriedade do formato RFC 5322, não do Resend]`.

Atenção ao camelCase: a doc é explícita — *"All SDK parameters, such as `replyTo` and
`scheduledAt`, must use camelCase"* `[CITADO: resend.com/docs/send-with-encore-ts]`. O snake_case
`reply_to` é da API HTTP crua, não do SDK.

### 2.5 Idempotency key — sim, o SDK suporta

```ts
// [VERIFICADO: dist/index.d.mts:1793 + dist/index.mjs, método post]
send(payload: CreateEmailOptions, options?: CreateEmailRequestOptions): Promise<CreateEmailResponse>
// CreateEmailRequestOptions extends IdempotentRequest → { idempotencyKey?: string }
// no runtime: headers.set('Idempotency-Key', options.idempotencyKey)
```

```ts
await resend.emails.send(payload, { idempotencyKey: `boas-vindas/${tenantId}` })
```

**Vale usar já?** `[Recomendação]` **Sim, e o custo é uma linha.** Justificativa concreta:
Server Action com retry do usuário (duplo clique) ou re-execução de um handler é o cenário
que gera e-mail duplicado, e duplicata queima reputação de domínio novo — que é exatamente a
preocupação do goal da Phase 4. A chave tem que ser **determinística por intenção de negócio**
(`boas-vindas/<tenantId>`), não um UUID aleatório, senão não protege nada. Limite: 1–256
chars (`invalid_idempotency_key` = 400).

Contraponto honesto: a Phase 4 é quem define quais e-mails existem, então a *chave* é
responsabilidade dela. O que esta etapa entrega é o wrapper **aceitar** um parâmetro
`idempotencyKey` opcional e repassá-lo. Colocar o parâmetro agora custa nada; adicioná-lo
depois muda a assinatura pública.

### 2.6 Bounce e supressão — o Resend já faz sozinho

**Descoberta que muda o escopo da EML-06 (Phase 4):**

> "When sending to an email address results in a hard bounce or spam complaint, Resend places
> this address on the Suppression List. Future emails to addresses on the list will be marked
> as suppressed and won't be delivered until the address is removed."
> `[CITADO: resend.com/docs/knowledge-base/why-are-my-emails-landing-on-the-suppression-list]`

E o SDK expõe a lista como API de primeira classe `[VERIFICADO: dist/index.d.mts:1919-1956]`:

```ts
resend.suppressions.add({ email })
resend.suppressions.list({ origin?: 'bounce' | 'complaint' | 'manual' })
resend.suppressions.get(idOrEmail)
resend.suppressions.remove(idOrEmail)
```

Há também o evento de webhook `EmailSuppressedEvent` (e `EmailBouncedEvent`,
`EmailComplainedEvent`) tipado no SDK.

**Consequência:** a EML-06 provavelmente **não precisa de tabela nossa nem de webhook**. O
critério "endereço que deu hard bounce entra em supressão e não recebe novo envio" já é
verdade por construção do Resend. Isso é insumo para a Phase 4, **fora do escopo desta etapa** —
mas registrar aqui evita que a Phase 4 planeje uma tabela `emails_suprimidos` desnecessária.

Não confirmei o que a API retorna ao tentar enviar para endereço já suprimido `[LACUNA]` — é
questão da Phase 4, não desta.

### 2.7 Limites do Free

O CONTEXT afirma 100/dia, 3.000/mês, 1 domínio. **Não localizei página oficial de pricing que
confirme esses números nesta sessão** — mantenho como `[ASSUMIDO, herdado do CONTEXT]`.

O que **está verificado** é o comportamento ao estourar
`[CITADO: resend.com/docs/api-reference/errors]`:
- `daily_quota_exceeded` — 429 — "You have reached your daily email quota."
- `monthly_quota_exceeded` — 429 — "You have reached your monthly email quota."
- `rate_limit_exceeded` — 429 — limite padrão **5 req/s por team**
  `[CITADO: resend.com/docs/send-with-nodejs]`

Os três chegam como `{ data: null, error: {...} }` normalmente, sem lançar. **A cota estourada
é indistinguível de sucesso se ninguém olhar o `error`** — que é precisamente o modo de falha
silencioso descrito em `ROADMAP.md:390` e a razão de o wrapper existir.

### 2.8 Esqueleto do wrapper

```ts
// src/lib/email/enviar.ts
import { Resend } from 'resend'
import { classificarErroResend } from './classificar' // puro, testável

export type MotivoFalhaEmail =
    | 'desativado' | 'config_ausente' | 'rejeitado' | 'falha_transporte'

export type ResultadoEmail =
    | { ok: true; id: string }
    | { ok: false; motivo: MotivoFalhaEmail }

export async function enviarEmail(params: ParamsEmail): Promise<ResultadoEmail> {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) return { ok: false, motivo: 'desativado' } // EML-05, no-op silencioso

    try {
        // construção DENTRO do guard: new Resend(undefined) LANÇA (dist/index.mjs:1203)
        const resend = new Resend(apiKey)
        const { data, error } = await resend.emails.send(
            { from: ..., to: ..., replyTo: ..., subject: ..., html: ... },
            params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined
        )
        if (error) {
            const motivo = classificarErroResend(error.name)
            if (motivo === 'falha_transporte' || motivo === 'config_ausente') {
                reportarExcecao(new Error(`resend:${error.name}`), { statusCode: error.statusCode })
            }
            return { ok: false, motivo }
        }
        return { ok: true, id: data!.id }
    } catch (err) {
        // O SDK documentadamente não lança no send; este catch é a garantia
        // do contrato "o wrapper nunca lança", não um caminho esperado.
        reportarExcecao(err)
        return { ok: false, motivo: 'falha_transporte' }
    }
}
```

Repare: **`error.message` do Resend nunca atravessa a fronteira** — só o `name` (enum fechado)
vira parte da mensagem enviada ao Sentry, e nada disso chega à UI. É a decisão #4 cumprida
literalmente.

---

## 3. Fail-fast de env no boot

### 3.1 As respostas, verificadas na fonte local

**Roda em quais runtimes?** Node.js e Edge; discriminar com `process.env.NEXT_RUNTIME`
`[VERIFICADO: node_modules/next/dist/docs/.../instrumentation.md:127-145]`.

**Roda durante `next build`?** **NÃO.** Verificado no código do Next 16.2.10 instalado:

```js
// node_modules/next/dist/server/lib/router-utils/instrumentation-globals.external.js:52-56
async function registerInstrumentation(projectDir, distDir) {
    // Ensure registerInstrumentation is not called in production build
    if (process.env.NEXT_PHASE === 'phase-production-build') { return }
    ...
}
```
Mesmo guard no runtime edge (`node_modules/next/dist/server/web/globals.js:34`), e
`process.env.NEXT_PHASE = PHASE_PRODUCTION_BUILD` é setado em
`node_modules/next/dist/build/index.js:1131`. `[VERIFICADO — três arquivos lidos em disco]`

**Consequência direta:** o plano **não precisa** de guard por `NEXT_PHASE`. Build local sem
secrets continua funcionando de graça. Isso valida a decisão #3 do CONTEXT ("validação no
build foi descartada") — mas por um motivo mais forte do que o registrado: não é escolha
nossa, é comportamento do framework.

**Lançar derruba o processo em `next start`?** Sim.
```js
// instrumentation-globals.external.js:61-68
try { await instrumentation.register(); afterRegistration() }
catch (err) {
    err.message = `An error occurred while loading instrumentation hook: ${err.message}`
    throw err
}
```
E `ensureInstrumentationRegistered` é awaited em `prepareImpl()`
(`node_modules/next/dist/server/next-server.js:570-573`) — ou seja, **antes de servir a
primeira requisição**. A rejeição sobe e mata o boot. `[VERIFICADO]`

No Railway isso vira crash-loop com a mensagem
`An error occurred while loading instrumentation hook: <nossa mensagem>` no log — que é
exatamente o comportamento pedido pela decisão #3. Vale escrever a mensagem no formato
`Variáveis obrigatórias ausentes em produção: RESEND_API_KEY, QSTASH_CURRENT_SIGNING_KEY`
(lista completa de uma vez, não a primeira que falta — senão o owner descobre uma por deploy).

**Convive com o `register()` do Sentry?** Sim, mesmo arquivo, mesma função — ver 1.2.

⚠️ `onRequestError` é diferente: erro dentro dele é engolido
(`console.error('Error in instrumentation.onRequestError:', err)` e segue)
`[VERIFICADO: instrumentation-globals.external.js:70-79]`. Não dá para usar `onRequestError`
como caminho de fail-fast.

### 3.2 Zod vs. TypeScript puro

**Recomendação: TypeScript puro. Não instalar zod.**

O que a validação precisa fazer, na prática: para uma lista de nomes, checar se
`process.env[nome]` é string não vazia, e em produção lançar com a lista dos ausentes. São
~20 linhas:

```ts
// src/lib/env.ts
const OBRIGATORIAS_EM_PRODUCAO = [
    'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY',
    'QSTASH_TOKEN', 'QSTASH_URL', 'QSTASH_CURRENT_SIGNING_KEY',
    'EVOLUTION_API_URL', 'EVOLUTION_GLOBAL_API_KEY',
    'APP_URL', 'ANALYTICS_TENANT_SALT', 'RESEND_API_KEY',
] as const

export function validarEnvObrigatorio(): void {
    if (process.env.NODE_ENV !== 'production') return
    const ausentes = OBRIGATORIAS_EM_PRODUCAO.filter((n) => !process.env[n]?.trim())
    if (ausentes.length > 0) {
        throw new Error(`Variáveis obrigatórias ausentes em produção: ${ausentes.join(', ')}`)
    }
}
```

Trade-off honesto, sem torcer para o lado que eu já escolhi:

- **A favor do zod:** dá coerção e tipagem derivada (`z.infer`), valida formato (URL válida,
  `re_` no começo da key), e é o padrão que a maioria dos projetos Next usa. Se em 6 meses a
  lista de env virar 25 nomes com regras de formato, o TS puro vira um arquivo feio.
- **Contra:** hoje a regra é uma só ("existe e não é vazio"), e ela não se beneficia de nada
  do zod. O tipo derivado não ajuda porque o resto do código lê `process.env.X` direto — para
  colher o benefício de tipagem seria preciso refatorar todos os call sites para um objeto
  `env` importado, e isso **é** a camada de abstração que o `CLAUDE.md` manda justificar.
  Um pacote a mais no bundle de servidor por 20 linhas de `filter`.

O gatilho para reverter está claro: **quando a primeira variável exigir validação de formato,
e não só de presença, instale zod.** Registrar isso no comentário do arquivo.

⚠️ Atenção com `ANALYTICS_TENANT_SALT` nessa lista: hoje ela é **opcional por design**
(`tenant.ts:13` cai para string vazia, documentado em `docs/08:20`). Torná-la obrigatória é
uma mudança de contrato — defensável (o próprio doc diz "configure em produção"), mas o plano
deve declarar isso explicitamente, não deixar acontecer de lado. E o doc avisa: **trocar o
salt depois desconecta os `distinct_id` históricos.**

---

## 4. PostHog — o que falta

**Li os três arquivos. Nada no código impede um evento real de chegar.** Confirmações:

| Suspeita levantada | Verificação |
|---|---|
| `ANALYTICS_TENANT_SALT` ausente derruba `hashTenantId`? | **Não.** `tenant.ts:13` — `?? ''`. Nunca lança. Comportamento documentado em `docs/08:20`. |
| Host errado? | `client.ts:28` e `server.ts:19` usam `https://us.i.posthog.com` como default. Correto para PostHog Cloud US. Se o projeto for criado na região **EU**, `NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com` é obrigatório — **gate para o owner na criação do projeto**. |
| Endpoint `/i/v0/e/` ainda é atual? | **Sim.** `[CITADO: posthog.com/docs/api/capture]` — "/i/v0/e and /batch endpoints are the main way to send events to PostHog". `server.ts:26` está correto. |
| `capturarEventoServidor` guarda por `NEXT_PUBLIC_POSTHOG_KEY` no servidor? | Sim (`server.ts:60`), e uma var `NEXT_PUBLIC_*` está disponível no servidor também. Correto. |

**Único item real: as chaves.** Criar projeto, colar `NEXT_PUBLIC_POSTHOG_KEY` (e `HOST` se EU)
em `.env.local` e no Railway.

### Caminho mais curto para o owner confirmar visualmente

1. PostHog → menu lateral → **Activity** (feed de eventos ao vivo, antigo "Live events").
2. Abrir a landing `/` em aba anônima → deve aparecer `landing_viewed` com `nicho: 'geral'`.
3. Latência esperada: **segundos a ~1 minuto** `[INFERIDO — não achei SLA publicado]`. Se não
   aparecer em 2 minutos, é key/host errado.

⚠️ **O 200 não prova nada.** O endpoint de ingestão responde `200 {"status":"Ok"}` mesmo com
api_key inválida — já documentado em `docs/08:22-25` e confirmado nesta pesquisa
`[CITADO: github.com/PostHog/posthog/issues/54670]`. O log de `server.ts:43` **não** detecta
key errada. A validação é olhar o painel — por isso é gate manual, não task automatizável.

### Sentry + PostHog coexistindo

Não encontrei conflito conhecido. Existe integração oficial de link entre os dois (erro do
Sentry ↔ sessão do PostHog), mas ela **depende de session replay**, que está travado desligado
por decisão de produto (`client.ts:35`). **Sinalizado e descartado** — não é escopo, e com
replay desligado o ganho é marginal.

---

## 5. Pegadinhas específicas deste codebase — resumo acionável

| # | Pegadinha | Ação no plano |
|---|---|---|
| 1 | `new Resend(undefined)` **lança** | construir o client dentro do guard, nunca no top-level do módulo |
| 2 | Actions fazem `catch → throw new Error('amigável')`; Turbopack não instrumenta Server Action | `Sentry.captureException(errOriginal)` nos `catch` das actions, senão OPE-02 entrega mensagem amigável sem causa raiz |
| 3 | `tunnelRoute` + `src/proxy.ts` (matcher amplo) | **não usar tunnelRoute nesta etapa**; se usar, é `checkpoint:human-verify` com ad blocker |
| 4 | `webpack.treeshake` é no-op sob Turbopack | não prometer bundle < 20 KB; medir com `pnpm build` |
| 5 | `sendDefaultPii` deprecado | usar **também** `dataCollection`, não só `sendDefaultPii: false` |
| 6 | `ANALYTICS_TENANT_SALT` hoje é opcional por design | se entrar na lista de obrigatórias, declarar a mudança de contrato e atualizar `docs/08` |
| 7 | Nome do estabelecimento vai no header `from` | sanitizar `<>"` e control chars — função pura testável |
| 8 | Cache Components + Sentry tem issue aberta | não aplicável hoje (`cacheComponents` não está ligado); anotar como restrição futura |
| 9 | Import de `@sentry/nextjs` em módulo puro | manter classificador e sanitizador sem imports; nenhum env novo no `vitest.config.ts` |
| 10 | Free do Sentry = **1 usuário** | o sócio não entra sem plano pago |

---

## Registro de suposições

| # | Afirmação | Onde | Risco se estiver errada |
|---|---|---|---|
| A1 | Free do Resend = 100/dia, 3.000/mês, 1 domínio | §2.7 | herdado do CONTEXT, não reconfirmado — só afeta planejamento de volume, não código |
| A2 | Bundle do Sentry client ~20–30 KB gzip | §1.5 | números do `@sentry/browser`, não do `@sentry/nextjs`; mitigado medindo no `pnpm build` |
| A3 | `withSentryConfig` preserva `images`/`experimental` | §1.7 | se errado, quebra upload de imagem — pega no primeiro `pnpm build` |
| A4 | Stack de servidor é legível sem source map | §1.9 | se errado, o custo é subir source maps depois (PR pequeno) |
| A5 | Sentry acima da cota descarta eventos até o ciclo virar | §1.6 | não muda decisão de código |
| A6 | Latência do Activity do PostHog ~1 min | §4 | só afeta a instrução do gate manual |

## Lacunas

1. **O que a API do Resend retorna ao enviar para endereço já suprimido** — não localizado.
   Questão da Phase 4 (EML-06), não desta etapa.
2. **Preço/limite oficial do Free do Resend** — não localizei página primária nesta sessão.

## Fontes

**Primárias (ALTA)**
- `node_modules/next/dist/server/lib/router-utils/instrumentation-globals.external.js:52-79`
- `node_modules/next/dist/server/web/globals.js:32-34`
- `node_modules/next/dist/build/index.js:1131`
- `node_modules/next/dist/server/next-server.js:568-573`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation-client.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/cacheComponents.md`
- `resend@6.18.0` — `dist/index.mjs:1182-1290`, `dist/index.d.mts:120-135, 540-610, 1919-1956`
- `npm view @sentry/nextjs` / `npm view resend`
- Repo: `src/lib/analytics/{client,server,tenant}.ts`, `next.config.ts`, `vitest.config.ts`, `src/proxy.ts`, `docs/08-ANALYTICS_E_FUNIL.md`

**Secundárias (MÉDIA — doc oficial)**
- https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup
- https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options
- https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/build/
- https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/integrations/breadcrumbs/
- https://docs.sentry.io/platforms/javascript/guides/nextjs/data-management/data-collected/
- https://blog.sentry.io/turbopack-support-next-js-sdk/
- https://sentry.io/pricing/
- https://resend.com/docs/api-reference/errors
- https://resend.com/docs/send-with-nodejs
- https://resend.com/docs/knowledge-base/why-are-my-emails-landing-on-the-suppression-list
- https://posthog.com/docs/api/capture

**Terciárias (BAIXA)**
- github.com/getsentry/sentry-javascript#21333, github.com/vercel/next.js#94753 (Cache Components — não aplicável hoje)
- github.com/PostHog/posthog#54670 (200 com key inválida — corrobora `docs/08`)
