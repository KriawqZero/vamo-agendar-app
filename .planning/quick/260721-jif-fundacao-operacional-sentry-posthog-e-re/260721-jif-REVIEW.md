---
quick_id: 260721-jif
reviewed: 2026-07-21
depth: quick (eixo 1 aprofundado)
commits: 711f14e, 60542dd, b8eff7d
files_reviewed: 22
files_reviewed_list:
  - src/instrumentation.ts
  - src/instrumentation-client.ts
  - src/sentry.server.config.ts
  - src/sentry.edge.config.ts
  - src/lib/env.ts
  - src/lib/observabilidade/opcoes-sentry.ts
  - src/lib/observabilidade/reportar.ts
  - src/lib/observabilidade/sanitizacao.ts
  - src/lib/email/enviar.ts
  - src/lib/email/classificar.ts
  - src/lib/email/remetente.ts
  - src/lib/whatsapp-helper.ts
  - src/lib/notificacoes-agendamento.ts
  - src/app/actions/public-booking.ts
  - src/app/api/webhooks/lembrete/route.ts
  - scripts/smoke-fundacao.mjs
  - next.config.ts
  - src/lib/__tests__/env.test.ts
  - src/lib/__tests__/opcoes-sentry.test.ts
  - src/lib/__tests__/email-enviar.test.ts
  - src/lib/__tests__/email-classificar.test.ts
  - src/lib/__tests__/email-remetente.test.ts
findings:
  blocker: 5
  warning: 11
  info: 4
  total: 20
status: issues_found
---

# Fundação operacional — Code Review

**Revisado:** 2026-07-21
**Profundidade:** quick, com o eixo 1 (PII) aprofundado até o código do SDK instalado
**Status:** issues_found

## Resumo

O trabalho é cuidadoso e a maior parte das travas está no lugar certo. Três coisas
foram verificadas contra o fonte do SDK e **confirmadas corretas**: (1) `register()`
realmente não roda durante `next build` (`instrumentation-globals.external.js:54`
retorna cedo em `NEXT_PHASE === 'phase-production-build'`), então o build local sem
secrets continua livre; (2) `beforeSend` deletando `request.data` é a barreira que de
fato pega o corpo de Server Action, porque `requestdata.js:29` força
`include.data: true` independentemente de `httpBodies: []`; (3) `stackFrameVariables:
false` e `databaseQueryData: false` fecham dois vazamentos reais que a pesquisa não
tinha visto.

Mas o invariante "nunca PII" **não está de pé**. A resposta direta à pergunta do
eixo 1: **a sanitização é denylist**, e a denylist tem furos que não são hipotéticos.
Os três achados de PII (CR-01, CR-02, CR-03) foram confirmados lendo o código do
`@sentry/core@10.67.0` e do `@sentry/node-core@10.67.0` instalados, não a documentação.

O eixo 4 (regressão) está limpo: o diff contra `1ef02eb` mostra que quase toda a
mudança nos quatro arquivos existentes é reformatação do Prettier. O WhatsApp continua
falhando em silêncio, o webhook continua checando `cancelado` (`route.ts:66`) e o
gating Pro (`route.ts:85`), e `dispararNotificacoesAgendamento` continua engolindo tudo.

`pnpm test` roda verde: 9 arquivos, 122 testes.

---

## BLOCKERS

### CR-01: breadcrumb de `console` está LIGADO no servidor e no edge — e é lá que a PII mora

**Arquivos:** `src/sentry.server.config.ts:11-19`, `src/sentry.edge.config.ts:9-16`,
`src/lib/observabilidade/sanitizacao.ts:63-68`

`instrumentation-client.ts:36` desliga o breadcrumb de console no browser com o
comentário certo: *"ESTA é a trava real: os `console.error` do projeto carregam
contexto de negócio."* O raciocínio está correto — e não foi aplicado onde a PII
realmente está. `sentry.server.config.ts` e `sentry.edge.config.ts` não passam
`integrations`, então valem os defaults, e `consoleIntegration()` é default confirmado
em `@sentry/node-core/build/cjs/sdk/index.js` (lista `getDefaultIntegrations`).

Pior que só a mensagem: `@sentry/core/build/cjs/integrations/console.js:32-41` monta o
breadcrumb com **os dois campos**:

```js
const breadcrumb = {
  category: 'console',
  data: { arguments: args, logger: 'console' },   // <- os objetos crus
  message: formatConsoleArgs(args),               // <- o texto formatado
}
```

`sanitizarBreadcrumb` só olha `breadcrumb.data.url`. Num breadcrumb de console
`data.url` é `undefined`, então a função **retorna o breadcrumb intacto**, com
`data.arguments` e `message` inteiros.

**Cenário concreto 1 — nome e telefone do cliente final** (`src/lib/whatsapp-helper.ts:87-97`):

```
Evolution devolve 400 para um número inválido
→ linha 88: console.error('Erro ao disparar WhatsApp via Evolution (400):', await response.text())
   (o corpo de erro da Evolution ecoa o payload: `number` e `text`;
    `text` é a mensagem de confirmação renderizada, que contém {{cliente}})
→ breadcrumb 'console' entra no isolation scope da requisição
→ linha 95: reportarFalhaSilenciosa('whatsapp:falha_transporte', { statusCode })
→ evento sobe ao Sentry COM o breadcrumb anexado
→ nome + telefone do cliente final no Sentry
```

O contexto do `reportarFalhaSilenciosa` está exemplarmente limpo (só `statusCode`). Não
adianta: sete linhas acima o breadcrumb já carregou tudo.

**Cenário concreto 2 — a chave de assinatura do QStash** (`src/lib/whatsapp-helper.ts:132,149-152`):
`publishUrl` embute `?secret=${QSTASH_CURRENT_SIGNING_KEY}`. A linha 149 loga
`await response.text()` do QStash, que ecoa a URL de destino. Esse breadcrumb fica no
scope e é anexado ao próximo evento capturado na mesma requisição — que existe:
`reportarExcecao(err, { fluxo: 'notificacoes_agendamento' })` em
`notificacoes-agendamento.ts:159`. Chave de assinatura em texto claro no Sentry.

**Cenário concreto 3** (`public-booking.ts:129` e `:153`): `console.error('Erro ao
buscar cliente existente:', cError.message)` vira breadcrumb imediatamente antes do
`reportarExcecao` da linha 133.

**Fix:**

```ts
// sentry.server.config.ts e sentry.edge.config.ts
import { consoleIntegration } from '@sentry/nextjs'

Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    ...opcoesBaseSentry,
    integrations: (defaults) => defaults.filter((i) => i.name !== 'Console'),
    beforeSend: sanitizarEventoSentry,
    beforeBreadcrumb: sanitizarBreadcrumb,
})
```

E acrescentar ao `opcoes-sentry.test.ts` a asserção de que os três arquivos de init
removem a integração `Console` — a trava tem que quebrar o teste, não o cliente final.

---

### CR-02: `sanitizarEventoSentry` é DENYLIST e não cobre os campos onde o projeto de fato escreve

**Arquivo:** `src/lib/observabilidade/sanitizacao.ts:45-56`

A função remove exatamente cinco coisas: `request.url` (querystring), `request.query_string`,
`request.data`, `request.cookies` e `user`. Não toca em:

| Campo do evento | Quem escreve nele neste projeto |
|---|---|
| `extra` | **`reportarExcecao` por construção** — `captureException(erro, { extra: contexto })` (`reportar.ts:30`) |
| `exception.values[].value` | mensagem do erro — inclusive `PostgrestError.message`, texto controlado pelo Postgres |
| `message` | qualquer `captureMessage` futuro |
| `request.headers` | o SDK, sempre (ver CR-03) |
| `breadcrumbs[]` | o SDK, sempre (ver CR-01) |
| `contexts`, `tags` | qualquer `setTag`/`setContext` futuro |

O modo de falha da denylist é exatamente o previsto: **campo novo passa em silêncio.**
Hoje o único produtor de `extra` é o `contexto: Record<string, string|number|boolean|null>`
do `reportarExcecao`, e os quatro call sites atuais estão disciplinados. Mas a
disciplina vive só em comentário (`reportar.ts:8-9`) — nada no tipo nem no `beforeSend`
impede que a Phase 4 escreva `reportarExcecao(err, { email: destinatario })`. O tipo
`Record<string, …>` aceita qualquer chave.

**Fix (allowlist no `beforeSend`, não confiança no chamador):**

```ts
const CHAVES_EXTRA_PERMITIDAS = new Set(['fluxo', 'etapa', 'statusCode', 'rotulo'])

export function sanitizarEventoSentry<T extends FormatoDeEvento>(evento: T): T {
    // ... o que já existe ...
    delete evento.request?.headers
    if (evento.extra) {
        for (const chave of Object.keys(evento.extra)) {
            if (!CHAVES_EXTRA_PERMITIDAS.has(chave)) delete evento.extra[chave]
        }
    }
    return evento
}
```

Uma chave nova passa a exigir uma linha explícita nesta allowlist — que é a revisão
que a regra "nunca PII" precisa ter.

---

### CR-03: definir `dataCollection` DESLIGA os defaults seguros do SDK, e o `deny` de headers SUBSTITUI o filtro de PII embutido

**Arquivo:** `src/lib/observabilidade/opcoes-sentry.ts:30-52`

`@sentry/core/build/cjs/utils/data-collection/resolveDataCollectionOptions.js:18`:

```js
const base = options.dataCollection != null
    ? DEFAULTS                                       // permissivo
    : defaultPiiToCollectionOptions(options.sendDefaultPii)   // seguro
```

Ou seja: **no momento em que `dataCollection` é definido, a base deixa de ser o conjunto
de `sendDefaultPii: false` e passa a ser o conjunto permissivo.** Todo campo omitido cai
no lado permissivo, não no seguro. O comentário do arquivo diz que "`sendDefaultPii` é
ignorado quando `dataCollection` está definido" — correto, mas a consequência não foi
seguida até o fim.

Consequências concretas do que ficou de fora:

**(a) Filtro de IP perdido.** Com `sendDefaultPii: false` puro, o SDK aplicaria
`httpHeaders.request = { deny: PII_HEADER_SNIPPETS }`, onde
`PII_HEADER_SNIPPETS = ['forwarded', '-ip', 'remote-', 'via', '-user']`
(`filtering-snippets.js:4`). O `deny` do projeto — `['cookie', 'authorization',
'x-forwarded-for']` — **substitui** essa lista (`filterKeyValueData.js:11` só mescla
`SENSITIVE_KEY_SNIPPETS`, nunca `PII_HEADER_SNIPPETS`).

Resultado: `x-real-ip`, `cf-connecting-ip`, `true-client-ip`, `x-client-ip` e o header
`Forwarded` (RFC 7239) deixam de ser filtrados. O Railway coloca `x-real-ip` em toda
requisição. **O IP do cliente final é dado pessoal sob a LGPD** e vai em todo evento de
servidor originado em `/book/[slug]`. E `sanitizarEventoSentry` não remove
`request.headers` (CR-02), então não há segunda barreira.

**(b)** `genAI: { inputs: true, outputs: true }` — vinha `false/false` no conjunto
seguro. Inócuo hoje (não há IA no projeto), mas é uma trava que foi desligada sem
ninguém decidir.

**Fix:**

```ts
httpHeaders: {
    // Allowlist: só o que serve para depurar. Mantém 'forwarded'/'-ip'/'remote-'
    // fora por construção, e não depende de lembrar de um header novo.
    request: { allow: ['content-type', 'accept-language', 'user-agent'] },
    response: { allow: ['content-type'] },
},
genAI: { inputs: false, outputs: false },
```

E acrescentar ao `opcoes-sentry.test.ts` uma asserção de que `x-real-ip` **não** é
coletado — o teste atual (`opcoes-sentry.test.ts:31-36`) só confere que os três nomes
escritos à mão estão no `deny`, o que passa mesmo com o furo aberto.

---

### CR-04: `montarRemetente` não escapa `,` `(` `)` `:` `;` `@` — nome de tenant com vírgula quebra o header e o e-mail morre em silêncio

**Arquivo:** `src/lib/email/remetente.ts:32-45`

A sanitização remove só `<`, `>`, `"` e caracteres de controle. Os *specials* do RFC 5322
são `( ) < > [ ] : ; @ \ , . "` — e o display name é montado **sem aspas**, como átomo.
A vírgula é a perigosa: num header de endereço ela é o separador de lista.

**Cenário concreto:**

```
tenant.nome_estabelecimento = 'Studio Bela, Sobrancelhas'
→ montarRemetente devolve: 'Studio Bela, Sobrancelhas via VamoAgendar <naoresponda@mail.vamoagendar.com.br>'
→ o parser lê DOIS endereços: 'Studio Bela' e 'Sobrancelhas via VamoAgendar <naoresponda@…>'
→ Resend recusa com validation_error / invalid_from_address
→ classificarErroResend → 'rejeitado'
→ NÃO vai ao Sentry (enviar.ts:74), NÃO vira console.error
→ esse tenant nunca recebe nenhum e-mail e ninguém fica sabendo
```

`(Centro)` também: parênteses são comentário no RFC 5322. `Studio Bela Ltda.` idem
(ponto é special). Nomes assim são comuns no público-alvo.

O teste `email-remetente.test.ts` não cobre nenhum special além de `<>"` — passa verde
com o bug presente.

**Fix — citar o display name, que é o que o RFC manda:**

```ts
function sanitizarNome(nome: string): string {
    const semControle = Array.from(nome)
        .map((c) => (ehControle(c) ? ' ' : c))
        .join('')
    // Dentro de quoted-string só `"` e `\` precisam sair; todo o resto (vírgula,
    // parêntese, ponto, dois-pontos) passa a ser literal e seguro.
    return semControle.replace(/[\\"]/g, '').replace(/\s+/g, ' ').trim()
}

export function montarRemetente(nomeEstabelecimento: string): string {
    const limpo = sanitizarNome(nomeEstabelecimento ?? '')
    const exibicao = limpo.length > 0 ? limpo : ROTULO_GENERICO
    return `"${exibicao}${SUFIXO_EXIBICAO}" <${ENDERECO_REMETENTE}>`
}
```

Acrescentar casos de teste para `'Studio Bela, Sobrancelhas'`, `'Studio (Centro)'` e
`'Bela Ltda.'`.

---

### CR-05: domínio do Resend perder verificação = 100% dos e-mails morrem sem nenhum sinal

**Arquivo:** `src/lib/email/classificar.ts:16-21` combinado com `src/lib/email/enviar.ts:74`

`validation_error`, `invalid_from_address` e `security_error` são classificados como
`rejeitado`, e `rejeitado` deliberadamente **não vai ao Sentry**, com a justificativa
"é dado ruim de entrada, não defeito nosso".

A justificativa não se aplica ao remetente. `ENDERECO_REMETENTE` é **constante de
produto** (`remetente.ts:9`) — não vem de input nenhum. Se o `from` for recusado, a
causa é nossa, não do chamador.

**Cenário concreto:**

```
o registro DKIM de mail.vamoagendar.com.br é alterado/expira, ou o Resend
suspende o domínio
→ toda chamada a resend.emails.send devolve { name: 'validation_error',
   statusCode: 403, message: 'Domain is not verified…' }
   (é exatamente o par nome/mensagem usado em email-enviar.test.ts:61)
→ classificarErroResend → 'rejeitado'
→ nenhum reportarExcecao, nenhum console.error, nenhuma linha de log
→ 100% dos e-mails transacionais param, e a descoberta acontece quando um
   profissional reclamar — que é o oposto declarado de OPE-02
```

O DNS deixou de ser gate justamente ontem (`82db24e`); a fragilidade dele agora é
totalmente invisível.

**Fix:** separar rejeição-do-destinatário de rejeição-do-remetente.

```ts
case 'invalid_from_address':
case 'security_error':
    // O `from` é constante de produto: se ele foi recusado, o defeito é nosso.
    return 'config_ausente'
case 'validation_error':
    return 'rejeitado'
```

E, em `enviar.ts`, reportar `rejeitado` ao Sentry quando o `statusCode` for 403
(domínio não verificado é 403; endereço malformado é 422) — ou, mais simples e sem
depender de heurística, contar `rejeitado` num contador e deixar o painel da Phase 11
alarmar. O mínimo aceitável agora é `config_ausente` nos dois nomes acima.

---

## WARNINGS

### WR-01: acesso literal a `NEXT_PUBLIC_SENTRY_DSN` congela o DSN no build — o `env.ts` documenta esse modo de falha e depois o comete

**Arquivos:** `src/sentry.server.config.ts:9`, `src/sentry.edge.config.ts:7`,
`src/lib/observabilidade/reportar.ts:21`

`env.ts:25-34` (nota **e**) está certo: acesso literal a `NEXT_PUBLIC_*` é substituído
por valor em tempo de build. `validarEnvObrigatorio` faz o acesso dinâmico correto
(`ambiente[nome]`). Os três arquivos acima fazem o acesso literal.

**Cenário:** build roda sem `NEXT_PUBLIC_SENTRY_DSN` (Dockerfile multi-stage, cache de
build, CI separado do deploy), runtime tem a variável.
→ `validarEnvObrigatorio` lê `process.env` no runtime, encontra o DSN, **não lança**
→ `sentry.server.config.ts:9` foi inlined como `undefined` no build → `Sentry.init`
   nunca roda → `reportar.ts:20` também é `undefined` → todo `reportarExcecao` é no-op
→ o fail-fast reporta tudo verde e o Sentry está morto. OPE-02 falso, sem sintoma.

O `env.ts` declara a premissa ("o Railway usa o mesmo env em build e em runtime") e ela
é verdadeira hoje. O problema é que a premissa está a uma mudança de infra de derrubar
a fase inteira em silêncio.

**Fix:** usar variável de servidor separada (`SENTRY_DSN`) nos dois configs de servidor
e em `reportar.ts`, deixando `NEXT_PUBLIC_SENTRY_DSN` só para `instrumentation-client.ts`.
São dois nomes na lista de obrigatórias em vez de um, e a confusão deixa de ser possível.

### WR-02: a lista de obrigatórias derruba o próximo deploy de produção enquanto os gates manuais estão abertos

**Arquivo:** `src/lib/env.ts:37-51`

`NEXT_PUBLIC_SENTRY_DSN`, `RESEND_API_KEY`, `NEXT_PUBLIC_POSTHOG_KEY` e
`ANALYTICS_TENANT_SALT` entraram na lista. Os gates 1 e 2 do CONTEXT (criar projeto no
Sentry/PostHog, inserir secrets no Railway) **ainda não foram executados**.

**Cenário:** o owner faz deploy antes de fechar os gates → `register()` lança →
`next-server.js:573` propaga no `prepareImpl` → boot morre → crash loop no Railway →
**o produto inteiro fica fora do ar por falta de credencial de observabilidade.**

Isso contraria o invariante "falha de observabilidade nunca quebra o produto" na sua
forma mais literal. O fail-fast é a decisão certa do owner, mas a ordem importa:
secrets primeiro, lista depois.

**Fix:** ou (a) documentar de forma explícita e verificável no SUMMARY que este commit
não pode ir a produção antes dos gates 1 e 2, ou (b) entrar em duas etapas — as dez
variáveis que já existem agora, as três novas junto com os secrets.

### WR-03: `enviarEmail` nunca devolve `config_ausente` para destinatário/reply-to faltando, contrariando o contrato documentado

**Arquivo:** `src/lib/email/enviar.ts:41-65`

O CONTEXT (decisão 4) define `config_ausente` como *"faltou remetente/destinatário —
erro de programação"*. Não existe validação nenhuma de `params.para`, `params.replyTo`
nem `params.assunto`.

**Cenário:** Phase 4 chama `enviarEmail({ ..., para: perfil.email_contato ?? '' })` com
o campo nulo no banco → vai para o Resend → `validation_error` → `rejeitado` → sem
Sentry, sem log. Um bug de programação vira falha silenciosa classificada como culpa do
dado de entrada.

**Fix:** guard clause antes do `try`:

```ts
if (!params.para?.trim() || !params.replyTo?.trim() || !params.assunto?.trim()) {
    reportarExcecao(new Error('email:config_ausente'), { fluxo: 'enviar_email' })
    return { ok: false, motivo: 'config_ausente' }
}
```

### WR-04: nenhum `Sentry.flush()` e o `import().then()` é fire-and-forget

**Arquivo:** `src/lib/observabilidade/reportar.ts:27-35`

`void import('@sentry/nextjs').then(...)` não é aguardado por ninguém. No webhook
(`route.ts:196-200`) o `NextResponse.json` é devolvido na linha seguinte. Em processo
Node de vida longa (Railway) o evento normalmente sai; num runtime que congela após a
resposta (edge, serverless) o evento é perdido — e o edge tem `sentry.edge.config.ts`,
ou seja, o cenário está no repositório.

**Fix:** para os pontos que terminam a requisição, usar `after()` do `next/server` —
que é o padrão que `analytics/server.ts` já adotou — ou expor uma variante
`await reportarExcecaoAguardando()` com `Sentry.flush(2000)` para o webhook.

### WR-05: `classificarErroResend` não tem a garantia de compilador que o teste afirma ter

**Arquivos:** `src/lib/email/classificar.ts:12`, `src/lib/__tests__/email-classificar.test.ts:5-8`

O comentário do teste diz *"a tabela veio da união fechada de literais do SDK
(`RESEND_ERROR_CODE_KEY`), então o mapeamento é exaustivo e conferível pelo compilador"*.
A assinatura é `classificarErroResend(nome: string)`. **String não é a união** — o `tsc`
não confere nada, e o teste assere sobre 21 literais copiados à mão.

**Cenário:** o Resend acrescenta `suppressed_recipient` na versão 6.19 → nenhum erro de
compilação, nenhum teste vermelho, o código cai no `default` e vira `falha_transporte`.
Nesse caso específico o default é seguro, mas a afirmação de segurança escrita no
arquivo é falsa e vai ser usada como premissa por quem mexer nisso depois.

**Fix:** tipar pelo SDK e forçar a exaustividade:

```ts
import type { ErrorResponse } from 'resend'
type CodigoResend = NonNullable<ErrorResponse['error']>['name']

export function classificarErroResend(nome: CodigoResend | (string & {})): MotivoFalhaEmail {
```

com um `const _exaustivo: Record<CodigoResend, MotivoFalhaEmail>` — aí o compilador
quebra de verdade quando o vocabulário mudar. Ou, no mínimo, corrigir o comentário para
não prometer o que não entrega.

### WR-06: `delete evento.user` delega a supressão de IP a um toggle de painel

**Arquivo:** `src/lib/observabilidade/sanitizacao.ts:54`

Apagar `user` deixa o campo ausente. A forma documentada de instruir a ingestão do
Sentry a **não** guardar o IP é enviar `user.ip_address = null` explicitamente. Do jeito
atual, se a inferência de IP estiver ligada no projeto, ela vale — e a decisão passa a
morar no painel, exatamente o que o CONTEXT proíbe ("a trava vive no código versionado,
nunca em toggle de painel").

**Fix:** `evento.user = { ip_address: null }` no lugar do `delete`, com o teste
correspondente ajustado.

### WR-07: o smoke test inicializa o Sentry sem `opcoesBaseSentry`, quebrando a "fonte única"

**Arquivo:** `scripts/smoke-fundacao.mjs:106`

```js
Sentry.init({ dsn, tracesSampleRate: 0, sendDefaultPii: false })
```

Sem `dataCollection`, sem `beforeSend`, sem `beforeBreadcrumb`. `opcoes-sentry.ts:5-8`
afirma que os arquivos de init consomem o objeto por spread e que o teste unitário
protege isso — o script é um quarto ponto de init que escapa da afirmação. O risco real
é baixo (erro sintético, execução manual do owner), mas o próximo a copiar esse trecho
vai copiar a versão sem trava.

**Fix adicional:** o envio de evento ao Sentry está condicionado a `destinatario`
(linha 100), que é o e-mail do smoke test. Não dá para validar o Sentry sem também
disparar um e-mail. Separar as duas flags.

### WR-08: `semQuerystring` não remove fragmento nem userinfo da URL

**Arquivo:** `src/lib/observabilidade/sanitizacao.ts:36-38`

`url.split('?')[0]` corta a query. Não corta `#…` nem `https://user:senha@host`. No
browser, `request.url` e `breadcrumb.data.url` saem de `location.href` / do argumento do
fetch, que incluem o fragmento. Hoje o wizard de `/book/[slug]` não usa hash state — o
achado é sobre a barreira, não sobre um vazamento ativo.

**Fix:** `url.split(/[?#]/)[0]`.

### WR-09: `reportarExcecao(cError, …)` manda o `PostgrestError` cru; a mensagem é texto controlado pelo Postgres

**Arquivo:** `src/app/actions/public-booking.ts:133`, `:154`, `:180`

Verificado: `PostgrestError` estende `Error` (`postgrest-js/dist/index.cjs:71`), então
`details` e `hint` **não** são anexados por default (`extraErrorDataIntegration` não é
integração padrão) — o risco é menor do que parece à primeira vista. Mas o `.message`
vai como `exception.values[].value`, e mensagem do Postgres embute literais do input em
vários casos (`invalid input syntax for type timestamp with time zone: "…"` recebe o
`dataHora` que veio do cliente). `sanitizarEventoSentry` não olha esse campo (CR-02).

O comentário da linha 130-132 diz "sem nenhum dado do cliente no contexto" — verdade
sobre o `contexto`, falso sobre o objeto de erro que é o primeiro argumento.

**Fix:** reportar um erro sintético e mandar só o código do Postgres, que é enum:

```ts
reportarExcecao(new Error(`supabase:${cError.code}`), {
    fluxo: 'booking_publico',
    etapa: 'buscar_cliente',
})
```

### WR-10: `reportar.ts` não tem `import 'server-only'`

**Arquivo:** `src/lib/observabilidade/reportar.ts`

O módulo é importado hoje só por código de servidor. Nada impede que uma ilha client
o importe — e aí o `import('@sentry/nextjs')` dinâmico entra no bundle do browser,
com o DSN de servidor junto. Custo do fix: uma linha.

### WR-11: o webhook devolve `err.message` cru ao chamador (pré-existente, arquivo tocado)

**Arquivo:** `src/app/api/webhooks/lembrete/route.ts:198`

```ts
{ error: err instanceof Error && err.message ? err.message : 'Erro interno.' }
```

Mensagem interna (inclusive de erro do Supabase) na resposta HTTP. A rota exige o
secret, então a exposição é limitada — mas contraria a regra do próprio projeto
("nunca vazar erro cru do Supabase"), e agora que o Sentry recebe o erro não há mais
motivo nenhum para devolvê-lo. Trocar por `'Erro interno.'` fixo.

---

## INFO

- **IN-01** — `enviarEmail` não tem nenhum chamador em `src/` (verificado por grep).
  Está correto pelo plano (Phase 4 consome), mas significa que o caminho real do SDK
  nunca foi exercitado: os testes usam mock e o smoke test chama o Resend direto, sem
  passar pelo wrapper.
- **IN-02** — `email-enviar.test.ts` não cobre o ramo `!data?.id` (`enviar.ts:83-86`),
  que é o único que reporta `resend:resposta_sem_id`.
- **IN-03** — `pnpm build && pnpm start` local sem secrets agora morre no boot
  (`NODE_ENV=production` no `next start`). O comentário de `instrumentation.ts:8-13`
  cobre corretamente o `build`, mas não menciona o `start`. Vale uma linha no
  `docs/PENDENCIAS.md`.
- **IN-04** — `next.config.ts:41-42` passa `org: ''` / `project: ''`. Sem
  `SENTRY_AUTH_TOKEN` não há upload, e foi **verificado** que `.next/static` contém 0
  arquivos `.map` — não há exposição de source map de cliente. Não é achado.

---

## Categorias sem achado (declarado explicitamente)

- **Regressão nos quatro arquivos reescritos (eixo 4):** nenhuma. O diff contra
  `1ef02eb` é reformatação do Prettier mais as chamadas de `reportar*`. Confirmado item
  a item: WhatsApp segue falhando em silêncio para o cliente final
  (`whatsapp-helper.ts:98,105` continuam devolvendo `{ ok: false }` sem lançar); o
  webhook segue checando `status === 'cancelado'` antes de disparar (`route.ts:66`); o
  gating Pro segue de pé nos dois pontos (`route.ts:85` e
  `notificacoes-agendamento.ts:64,68`); `dispararNotificacoesAgendamento` segue com
  `catch` de topo que não relança.
- **Condição de corrida:** nenhuma encontrada no código alterado. A revalidação de slot
  contra double-booking não foi tocada.
- **`catch` vazio / erro engolido não intencional:** nenhum. Os dois `catch` vazios de
  `reportar.ts:32,33` são o contrato "nunca lança", documentados no cabeçalho, e
  corretos.
- **Tipo `any` / promise sem await por engano:** nenhum `any` nos arquivos revisados. A
  única promise não aguardada é a de `reportar.ts:28`, coberta em WR-04.
- **Teste que testa o mock:** nenhum caso grave. `email-enviar.test.ts` mocka o SDK, o
  que é a decisão certa, e a asserção do construtor (`:44`) prova comportamento real do
  wrapper. A fraqueza real de teste está em WR-05 (afirmação de exaustividade que o
  compilador não sustenta) e no `email-remetente.test.ts`, que só testa os specials que
  o código já trata (CR-04).
- **Segredo hardcoded:** `QSTASH_CURRENT_SIGNING_KEY || 'secret-key'`
  (`whatsapp-helper.ts:131`, `route.ts:19`) é pré-existente e está fora do escopo desta
  etapa por decisão registrada (SEG-05, Phase 1). Em produção o fallback passou a ser
  inalcançável, porque a variável entrou na lista de obrigatórias — melhora real
  entregue de graça por esta etapa.

---

_Revisado: 2026-07-21_
_Revisor: Claude (gsd-code-reviewer)_
_Profundidade: quick, eixo 1 aprofundado até o fonte de @sentry/core@10.67.0_
