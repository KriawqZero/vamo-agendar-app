# 09 — Observabilidade e e-mail transacional

Entregue pela etapa preparatória **"Fundação operacional"** (quick task `260721-jif`,
2026-07-21), pré-requisito obrigatório da Phase 1.

Três peças que nascem juntas de propósito: sem o Sentry, o wrapper do Resend nasceria
reportando com `console.error` — que no Railway é linha de log que ninguém lê — e a Phase 4
herdaria a dívida de trocar depois.

---

## Wizard é fonte de diff, não de verdade

`npx @sentry/wizard` e `npx @posthog/wizard` **podem ser rodados**. O que não pode é
aceitar o que eles geram sem reendurecer.

A regra tem duas metades, e ignorar qualquer uma delas dá errado:

**Adote a arquitetura deles.** Os dois wizards trouxeram decisões melhores que as nossas.
O do PostHog em particular: init em `instrumentation-client.ts` (antes da hidratação, e não
num `useEffect` que só roda depois) e `posthog-node` no servidor no lugar de um `fetch`
artesanal para `/i/v0/e/`. Eles conhecem o SDK melhor do que a gente vai conhecer lendo a
doc por uma tarde, e nós tínhamos escrito as duas coisas do jeito pior sem saber.

**Reaplique as travas por cima, sempre.** O wizard não tem como saber que `/book/[slug]` é
público e sem login, e que quem digita nome e telefone ali é um desconhecido que nunca
criou conta. Ele configura para o caso normal — um app onde todo usuário é cadastrado. O
que reendurecer, toda vez:

| Trava | Onde |
|---|---|
| `capture_pageview: false`, `person_profiles: 'identified_only'`, `autocapture: false`, `disable_session_recording: true`, `disable_surveys: true` | `src/lib/analytics/opcoes-posthog.ts` |
| `capture_exceptions: false` (client) e `enableExceptionAutocapture: false` (server) | idem — error tracking é do Sentry, e o caminho do PostHog não passa por `sanitizarEventoSentry` nem pelo `beforeSend` |
| `$process_person_profile: false` nos eventos de servidor | `src/lib/analytics/server.ts` |
| Nome das variáveis: `NEXT_PUBLIC_POSTHOG_KEY`, host **opcional** com default US | `opcoes-posthog.ts`, `src/lib/env.ts` |
| Fallback fire-and-forget quando `after()` lança fora de contexto de request | `src/lib/analytics/server.ts` |

**O que faz a regra funcionar não é este documento — é teste.** Documento não impede
nada: as cinco flags já estavam documentadas quando o wizard as apagou, duas vezes.
`src/lib/__tests__/opcoes-posthog.test.ts` e `opcoes-sentry.test.ts` afirmam sobre o objeto
de opções versionado e sobre o conteúdo dos arquivos de init. O próximo wizard vai apagar
as travas de novo; agora o CI fica vermelho quando ele apagar.

Corolário prático: **rode o wizard num working tree limpo e trate o `git diff` dele como
proposta**, nunca como commit. É o diff que mostra o que ele sabe e a gente não.

### O que o wizard do Sentry propôs (2026-07-21, mesclado em `924dc51`)

| O que traz | Por que não serve |
|---|---|
| `sentry.server.config.ts` / `sentry.edge.config.ts` na **raiz** | Duplicam os de `src/`. O SDK **não** os auto-carrega (não há referência a `sentry.server.config` em `@sentry/nextjs/build/`); quem carrega é o `import` explícito de `src/instrumentation.ts`. Ficam como código morto com DSN hardcoded — armadilha para quem editar "o arquivo de config" errado |
| `dataCollection: {}` com `userInfo: false` comentado | Definir o objeto **inverte a base para os defaults permissivos** do SDK (`resolveDataCollectionOptions.js:18`): todo campo omitido passa a coletar |
| `tunnelRoute` | Colide com o matcher amplo de `src/proxy.ts` — o comentário que o próprio wizard gera avisa disso |
| bloco `webpack` | No-op sob Turbopack, com aviso de deprecação |
| `tunnelRoute` | Colide com o matcher amplo de `src/proxy.ts` — o comentário que o próprio wizard gera avisa disso |
| `webpack` | No-op sob Turbopack, com aviso de deprecação |
| `tracesSampleRate: 1` | 100% de tracing queima o tier gratuito — mantido em 0 |

> [!NOTE]
> **Sentry Logs (SDK @sentry/nextjs 10.67.0)**:
> O Sentry Logs foi ativado com `enableLogs: true` e `beforeSendLog: sanitizarLogSentry` em `src/lib/observabilidade/opcoes-sentry.ts`. O logger estruturado `logOperacional` (`src/lib/observabilidade/log.ts`) emite logs com códigos estáticos e allowlist de atributos (`fluxo`, `etapa`, `operacao`, `resultado`, `provider`, `motivo`, `statusCode`, `tenantHash`, `agendamentoHash`, `runtime`, `tentativa`, `retry`, `duracaoMs`). Nenhuma PII é coletada.

Rodado duas vezes no mesmo dia. Na primeira, revertido por inteiro — **erro nosso**: a
arquitetura dele era melhor que a nossa e jogamos fora junto com os defaults ruins. Na
segunda, commitado cru (`5df0671`) e reendurecido por cima, que é o fluxo certo.

**Adotado (o que ele sabia e a gente não):**

| O que trouxe | Por que ficou |
|---|---|
| Init em `src/instrumentation-client.ts` | Roda **antes da hidratação**. A nossa init estava num `useEffect` de provider, ou seja, depois — e o intervalo entre o HTML pintar e o React hidratar é onde o cliente de celular lento começa a mexer no wizard de agendamento |
| `posthog-node` no servidor | Substitui um `fetch` artesanal para `/i/v0/e/`. Endpoint não documentado que a gente teria de manter sozinho |
| `flushAt: 1` + `flushInterval: 0` + `await shutdown()` | Route handler e Server Action do Next morrem por invocação. Evento enfileirado sem flush é evento perdido **em silêncio** |
| Seis eventos de funil do dashboard | Nomes bons, propriedades sem PII. O lado B2B do funil não existia |

**Reendurecido por cima (o que ele não tinha como saber):**

| O que ele fez | O que passou a valer |
|---|---|
| Apagou `inicializarAnalytics()` e com ela as cinco flags de PII | Voltaram, agora em `src/lib/analytics/opcoes-posthog.ts`, **travadas por teste**. Foi a segunda vez que ele apagou exatamente essas cinco linhas |
| `capture_exceptions: true` / `enableExceptionAutocapture: true` | `false` nos dois. Segundo caminho de exceção que não passa por `sanitizarEventoSentry` nem por `beforeSend` — stack de Server Action pública tem `nome` e `telefone` como variáveis locais |
| `if (posthogKey && posthogHost)` | Host voltou a ser **opcional** com default US. Tratar host ausente como "desligado" transforma um env faltando no pior modo de falha do PostHog: nenhum erro, nenhum log, zero evento |
| `after()` cru, sem `try/catch` | Fallback fire-and-forget restaurado. `after()` **lança** fora de contexto de request, e o webhook do lembrete é esse caso |
| `defaults: '2026-01-30'` | Removido. Snapshot datado flipa opções que ninguém avaliou, e justo esse não inclui `disable_capture_url_hashes` — cada opção agora é nomeada e explícita |
| `capture_heatmaps` / `capture_dead_clicks` / `rageclick` implícitos | `false` explícito. `undefined` nessas três significa **o painel decide** (remote config) — mesmo furo que `disable_session_recording` fecha |
| Deixou `AnalyticsProvider` como stub vazio | Removido. Com a init em `instrumentation-client.ts` ele não tem função, e stub sem importador é código morto que a próxima sessão tenta entender |

Ele **não** renomeou `NEXT_PUBLIC_POSTHOG_KEY` na segunda rodada (na primeira, sim, para
`NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`) e **preservou** `$process_person_profile: false`. As
duas coisas continuam cobertas por teste, porque "não fez desta vez" não é garantia.

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

Em `NODE_ENV=production`, variável obrigatória ausente faz o processo **encerrar**: a
mensagem sai em `stderr` listando todos os nomes faltantes de uma vez e, logo em seguida,
`encerrarBootPorEnvAusente()` (`src/lib/env-boot.ts`) chama `process.exit(1)`. Não é "derruba o
boot" no sentido vago de logar e continuar de pé — a porta para de aceitar conexão, e é isso
que permite ao orquestrador reiniciar ou fazer rollback em vez de marcar como saudável um
deploy que responde 500 em toda rota. Em desenvolvimento e em teste, no-op.

Até o plano 01-06 da Phase 1 o comportamento era o outro: o `throw` saído de `register()`
virava `unhandledRejection` no Next 16 e o servidor **seguia escutando**. A Phase 1 mediu
isso, o owner decidiu mudar a semântica, e a prova virou comando:
`bash scripts/verificar-fail-fast-boot.sh` — veredito `MORTE` (código de saída ≠ 0, variável
nomeada em `stderr`, `curl` 7 = recusa de conexão).

**Duas guardas mantêm o resto funcionando** e as duas são necessárias: o encerramento só
acontece com `NODE_ENV=production` (a validação retorna na primeira linha fora dele, então
`pnpm dev` continua subindo com variável ausente) e só no runtime `nodejs`
(`NEXT_RUNTIME === 'nodejs'` em `src/instrumentation.ts`) — fora dele a exceção é relançada
como antes, porque `process.exit` não existe no Edge Runtime. Por isso as APIs só-Node
(`process.exit`/`process.stderr`) vivem em `src/lib/env-boot.ts`, carregado por `import()`
**dinâmico** só nesse branch `nodejs`: assim o módulo não entra no bundle da Edge
Instrumentation e o Turbopack não acusa uso de API Node no edge. `src/lib/env.ts` fica só com
a lista e `validarEnvObrigatorio` (ambos edge-safe — só leem `process.env`) e segue importado
estaticamente. Até 2026-07-23 os dois símbolos moravam em `env.ts` e o Turbopack emitia três
diagnósticos estáticos de Edge Runtime por build; a separação eliminou o ruído (ver a
pendência RESOLVIDA correspondente em `docs/PENDENCIAS.md`).

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

⚠️ **Risco de ordem de operação:** a lista já está ativa, e agora encerra o processo de
verdade. Deploy de produção antes de provisionar as variáveis novas derruba o boot de
propósito — o comportamento pedido, mas isso torna obrigatório conferir que todas as
obrigatórias existem no Railway **antes** de subir, ou remover o nome da lista no mesmo
commit. Ver `docs/PENDENCIAS.md` §WR-02.

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

Contrato de eventos e arquitetura em `docs/08-ANALYTICS_E_FUNIL.md`. As travas de PII
vivem em `src/lib/analytics/opcoes-posthog.ts` e são asseguradas por
`src/lib/__tests__/opcoes-posthog.test.ts` — mesma estrutura do par
`opcoes-sentry.ts` / `opcoes-sentry.test.ts`, e pelo mesmo motivo: trava que mora dentro
da função de init some quando alguém reescreve a init.

`NEXT_PUBLIC_POSTHOG_KEY` e `ANALYTICS_TENANT_SALT` são obrigatórias em produção
(`src/lib/env.ts`). `NEXT_PUBLIC_POSTHOG_HOST` **não entra nessa lista**: é opcional por
ter default (`https://us.i.posthog.com`, região do projeto).

⚠️ Se o projeto migrar para a região **EU**, `NEXT_PUBLIC_POSTHOG_HOST` passa a ser
obrigatória de fato — errar isso faz nenhum evento aparecer, **sem nenhuma mensagem de
erro**. É o mesmo motivo pelo qual host ausente **não** desliga o SDK: falha silenciosa é
o pior modo de falha possível numa ferramenta cujo sintoma de erro é "o número ficou
menor".

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
