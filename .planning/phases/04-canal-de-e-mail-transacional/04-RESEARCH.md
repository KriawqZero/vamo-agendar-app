# Phase 4: Canal de e-mail transacional — Pesquisa

**Pesquisado:** 2026-08-07
**Domínio:** E-mail transacional (Resend + React Email), webhook assinado, idempotência em Postgres, trabalho pós-resposta no Next.js 16
**Confiança geral:** ALTA — quase tudo foi verificado lendo o código instalado em `node_modules/` e os arquivos do repo nesta sessão; o que não foi está marcado `[ASSUMIDO]`.

---

<user_constraints>
## Restrições do usuário (de 04-CONTEXT.md)

### Decisões travadas

- **D-01:** o endereço vem do **Clerk por padrão** (e-mail de quem criou a organização —
  `clerkClient` já é usado em `perfis-empresas.ts:79`), com uma coluna nova
  `perfis_empresas.email_contato` (nullable) que **ganha quando preenchida**, exposta como
  campo opcional na tela de perfil do dashboard. O Clerk garante endereço verificado desde
  o primeiro segundo (bounce é o que queima domínio novo); o override existe porque o
  e-mail de login frequentemente não é o e-mail que a pessoa lê.
  — **Reversibility:** costly.
- **D-02:** **nenhum `reply-to`**. O remetente `naoresponda@` é literal: mensagem
  automática do produto não é para ser respondida, e responder não entra no escopo desta
  fase nem de fase futura. Decisão explícita do owner. — **Reversibility:** reversible.
- **D-03:** consequência direta de D-02 — `enviarEmail` (`src/lib/email/enviar.ts:48`)
  passa a aceitar `replyTo` **opcional**. Hoje ele recusa o envio sem esse campo, tratando
  a ausência como erro de programação. É alteração cirúrgica no wrapper da etapa
  preparatória, não reescrita; a guarda de `para`/`assunto` permanece intacta.
  — **Reversibility:** reversible.
- **D-04:** ⚠️ **o Success Criteria 2 da fase é dividido.** A metade "chega identificado
  pelo estabelecimento" fecha aqui (já pronta em `montarRemetente`). A metade "responder
  vai para o profissional, não para o VamoAgendar" **migra para a Phase 5**, onde o
  destinatário é o cliente final e responder-e-cair-no-salão é o comportamento certo.
  EML-04 passa a ser fechado em duas fases. — **Reversibility:** reversible.
- **D-05:** **tabela nova de auditoria de e-mails transacionais**, no espírito da
  `disparos_whatsapp` já existente. Custo aceito: migration + RLS + policies granulares por
  ação nesta fase, e não na seguinte. — **Reversibility:** one-way.
- **D-06:** a trava contra reenvio é uma coluna `chave_idempotencia` com restrição
  **UNIQUE**, cujo valor é exatamente a MESMA string que já vai ao Resend no parâmetro
  `idempotencyKey` do wrapper (`boas-vindas/<tenant_id>`; na Phase 5 vira
  `confirmacao/<agendamento_id>`). Grava primeiro, envia depois: se a linha já existe, o
  banco recusa e o e-mail nem é tentado. — **Reversibility:** costly.
- **D-07:** falha de envio **não** consome a trava: a restrição de unicidade é **índice
  único parcial sobre status `enviado`**. Linha com status `falhou` não bloqueia nova
  tentativa, e a próxima abertura do dashboard tenta de novo sozinha. A alternativa
  ("apaga a linha") foi recusada porque tabela de auditoria que apaga o próprio histórico
  deixa de ser auditoria. — **Reversibility:** reversible.
- **D-08:** a tabela **não grava o endereço de destino** — mesma regra da
  `disparos_whatsapp`. Grava: `tenant_id`, tipo do e-mail, `chave_idempotencia`, status
  (`enviado` / `falhou` / `rejeitado` / `sem_destinatario`), o id devolvido pelo Resend e a
  data. — **Reversibility:** reversible.
- **D-09:** o gatilho é o **auto-provisionamento em `obterPerfilEmpresa()`**
  (`src/app/actions/perfis-empresas.ts:75-95`). ⚠️ A função roda em **toda** página do
  dashboard, para sempre — é D-06 que impede o reenvio, não a posição da chamada. O envio
  não pode bloquear a primeira carga do dashboard (usar o padrão `after()` já estabelecido
  no projeto para `capturarEventoTenant`). — **Reversibility:** reversible.
- **D-10:** sem endereço utilizável (busca no Clerk falha, ou nenhum e-mail verificado):
  **não envia, registra `sem_destinatario` e segue** — o dashboard abre normalmente. A
  falha vira reporte ao Sentry pela variante **aguardada**
  (`reportarFalhaSilenciosaAguardando`). — **Reversibility:** reversible.
- **D-11:** o Success Criteria 3 **já é verdade pelo fornecedor**. **Nenhuma lista de
  supressão nossa é construída.** O que a fase constrói é o *saber*, não o *bloquear*.
  — **Reversibility:** reversible.
- **D-12:** rota nova `POST /api/webhooks/resend` escutando o evento **`suppression.added`**,
  com **verificação de assinatura** (o Resend assina por Svix — mesmo princípio da
  assinatura do QStash que a Phase 1 implementou no webhook de lembrete). A rota precisa
  constar em `isPublicRoute` de `src/proxy.ts`. O segredo de assinatura entra na lista de
  obrigatórias em produção de `src/lib/env.ts`. — **Reversibility:** costly.
- **D-13:** o tenant afetado é identificado **cruzando o `source_id` do payload com o id do
  Resend já gravado na tabela de auditoria (D-08)** — nunca pelo endereço. O payload traz o
  endereço em claro: ele é usado para o cruzamento em memória se necessário e **descartado**
  — não é persistido, não vai a log, não vai ao Sentry. — **Reversibility:** reversible.
- **D-14:** ao receber a supressão: registra o estado na tabela e abre **Sentry Issue
  acionável** com mensagem **sintética e estática** (ex.: `email:endereco_suprimido`),
  variante aguardada, tenant apenas como `tenantHash`. — **Reversibility:** reversible.
- **D-15:** **React Email** (`@react-email/components` + `@react-email/render`),
  dependências novas do mesmo fornecedor do `resend` já instalado. Escolhido sobre função
  pura em TS porque elimina trabalho real e repetido e porque dá pré-visualização local.
  — **Reversibility:** costly.
- **D-16:** **visual completo com a identidade da marca** (azul `#3DBAED`→`#3961D5`, roxo
  `#4219B0`, logo de `artes-aprovadas-design/`). Escolha do owner, feita com o custo
  nomeado. — **Reversibility:** reversible.
- **D-17:** a capa é **faixa de cor sólida montada em HTML + logo pequeno por cima** —
  **não** banner de imagem única, e **não** gradiente via VML. — **Reversibility:** reversible.

### Discricionariedade do Claude

- **Hospedagem do logo do e-mail** — bucket público `imagens-perfis` já existente,
  domínio próprio, ou embutido. Preferir URL absoluta estável e servida pelo próprio
  domínio do app; e-mail não pode depender de path relativo.
- **Copy do e-mail de boas-vindas** — o que ele diz além do link. Regras que valem:
  `docs/05-PRODUTO_E_VISAO.md` para tom, e a rule global de texto público. O link
  `/book/[slug]` do profissional é o núcleo da peça, não um detalhe.
- **Teto de 100 e-mails/dia e 3.000/mês do plano Free do Resend** — avaliar se o
  `classificar.ts` basta ou se merece Issue própria com mensagem sintética distinta.
- **Nomes exatos** da tabela, das colunas, dos tipos de e-mail, do código sintético da
  Issue e das env vars do webhook.
- **Forma dos testes** — `pnpm test` é hermético por desenho; prova que toca serviço
  externo é opt-in (`EXIGIR_INTEGRACAO=1`).
- **Verificação do Success Criteria 4** é **UAT humano** — nenhum executor pode marcar.

### Ideias adiadas (FORA DE ESCOPO)

- **Avisar o próprio profissional, no dashboard, que os e-mails não estão chegando nele** —
  candidata à **Phase 11**. Gatilho: mais de uma dúzia de profissionais ativos.
- **Caixa de entrada real no domínio** (`contato@vamoagendar.com.br`) — já no escopo da
  **Phase 10**; não bloqueia nada aqui, dado D-02.

</user_constraints>

---

<phase_requirements>
## Requisitos da fase

| ID | Descrição | Achado da pesquisa que viabiliza |
|----|-----------|----------------------------------|
| **EML-01** | Profissional recebe e-mail de boas-vindas com o link de agendamento pronto para compartilhar | `after()` é estável no Next 16 e usável a partir de `obterPerfilEmpresa` (§4); e-mail do criador da org obtido por `organization.createdBy` → `users.getUser()` (§5); trava de reenvio por índice único parcial (§3) |
| **EML-04** | E-mails chegam identificados pelo estabelecimento, com resposta indo para o profissional | Metade "identificado" já pronta em `montarRemetente`; `replyTo` é **opcional no SDK** (`CreateEmailBaseOptions.replyTo?`), então D-03 é mudança só na nossa guarda (§2) |
| **EML-06** | Endereço inválido não degrada a reputação do domínio (supressão de bounce) | `suppression.added` existe e traz `source_id` cruzável com o id do envio (§2); verificação de assinatura já disponível **sem dependência nova** via `resend.webhooks.verify` (§2) |

</phase_requirements>

---

## Resumo

A boa notícia é que quase nada aqui precisa ser construído do zero. O transporte de e-mail
já existe e está testado; a verificação de assinatura do webhook do Resend **já vem dentro
do SDK que o projeto tem instalado** (`resend.webhooks.verify`, que por baixo usa
`standardwebhooks`, não `svix`); o índice único parcial que D-07 pede já tem precedente
literal no repo (`uq_assinatura_vigente_por_tenant`); e `after()` é API estável do Next 16,
importada de `next/server`, com o padrão já em uso em `src/lib/analytics/server.ts:67`.

A má notícia são três descobertas que mexem com a letra (não com o espírito) das decisões
travadas, e por isso estão numa seção própria logo abaixo: **(1)** os pacotes que D-15 nomeia
— `@react-email/components` e todos os `@react-email/*` de componente — foram
**descontinuados no npm**; a instalação oficial hoje é o pacote único `react-email`.
**(2)** O `resend@6.17.2` instalado **não conhece** `suppression.added`: o evento só entra
no tipo `WebhookEvent` a partir do `6.18.1`, então a fase precisa subir o SDK (o que é
seguro — a tabela dos 21 códigos de erro é byte a byte idêntica nas duas versões, logo
`classificar.ts` não quebra). **(3)** O maior risco silencioso da fase é o `after()` rodando
em contexto de Server Component: ali `cookies()`/`headers()` **lançam** dentro do callback,
o que proíbe `auth()` e o `createClient()` do projeto dentro do trabalho pós-resposta.

**Recomendação primária:** capturar `orgId` e o nome do estabelecimento **antes** do
`after()`, e dentro do callback usar exclusivamente `createAdminClient()` (service role, sem
cookies) e um cliente Clerk resolvido por `CLERK_SECRET_KEY`. Fazer o INSERT otimista com
status `enviado` **antes** do envio (é isso que faz o índice parcial de D-07 servir de trava),
e rebaixar a linha para `falhou`/`rejeitado` se o envio não der certo.

---

## ⚠️ Conflitos com decisões travadas

Nenhuma decisão é contrariada em substância. Três precisam de ajuste de letra, e o planner
não pode decidir isso sozinho — cada uma merece um `checkpoint:human-verify` ou uma nota
explícita no PLAN.

### C-01 — D-15 nomeia pacotes descontinuados (ALTA prioridade)

D-15 diz "`@react-email/components` + `@react-email/render`". Medido nesta sessão:

```
$ npm view @react-email/components deprecated
Package no longer supported. Contact Support at https://www.npmjs.com/support for more info.
$ npm view @react-email/button deprecated
Package no longer supported. …
$ npm view @react-email/html deprecated
Package no longer supported. …
$ npm view @react-email/tailwind deprecated
Package no longer supported. …
$ npm view @react-email/render deprecated
(vazio — NÃO descontinuado)
```
`[VERIFICADO: registro npm, 2026-08-07]`

A causa é consolidação, não abandono: o `react-email@6.9.2` passou a ser o pacote único.
Verificado lendo os tipos publicados:

- `react-email@6.9.2` → `dist/index.d.mts:25` contém `export * from "@react-email/render";`
  e a linha 26 exporta `Body, Button, Column, Container, Font, Head, Heading, Hr, Html, Img,
  Link, Markdown, Preview, Row, Section, Tailwind, Text, …` `[VERIFICADO: cdn.jsdelivr.net/npm/react-email@6.9.2/dist/index.d.mts:25-26]`
- O mesmo pacote é o CLI: `"bin": { "email": "./dist/cli/index.mjs" }` `[VERIFICADO: cdn.jsdelivr.net/npm/react-email@6.9.2/package.json]`
- A doc oficial de instalação manual manda exatamente isso: `npm install @react-email/ui -D -E`
  e `npm install react-email react react-dom -E` `[CITADO: https://react.email/docs/getting-started/manual-setup]`

**Recomendação:** trocar os nomes dos pacotes de D-15 por `react-email@^6.9.2` (dependência
de produção) + `@react-email/ui@^6.9.2` (devDependency, é o app de preview). A substância de
D-15 ("usar React Email, não função pura em TS") fica intacta; só o nome do pacote muda.
Instalar um pacote deprecado por fidelidade literal ao texto seria escolher a forma contra a
intenção.

### C-02 — `suppression.added` exige subir o `resend` (MÉDIA prioridade)

O SDK instalado é o `6.17.2`, e o seu `WebhookEvent` não tem o evento que D-12 pede:

```ts
// node_modules/resend/dist/index.d.mts:2055 (6.17.2 — instalado)
type WebhookEvent = 'email.sent' | 'email.scheduled' | 'email.delivered' | 'email.delivery_delayed' | 'email.complained' | 'email.bounced' | 'email.opened' | 'email.clicked' | 'email.received' | 'email.failed' | 'email.suppressed' | 'contact.created' | 'contact.updated' | 'contact.deleted' | 'domain.created' | 'domain.updated' | 'domain.deleted';
```
`[VERIFICADO: node_modules/resend/dist/index.d.mts:2055]`

No `6.18.1` o mesmo tipo termina com `| 'suppression.added' | 'suppression.removed'`, e existe
`interface SuppressionAddedEvent { type: 'suppression.added'; created_at: string; data: SuppressionEventData; }`
`[VERIFICADO: cdn.jsdelivr.net/npm/resend@6.18.1/dist/index.d.mts:2144,2320-2323]`

Sem o upgrade, `payload.type === 'suppression.added'` é **erro de compilação** (`tsc` acusa
comparação sem sobreposição), e o gate `tsc --noEmit` do projeto reprova.

**O upgrade é seguro para `classificar.ts`.** O `Record<CodigoResend, …>` daquele arquivo tem
garantia de compilador justamente para quebrar quando o SDK ganha código de erro novo — e as
duas versões têm a **mesma** lista de 21 códigos, literal por literal:

```ts
type RESEND_ERROR_CODE_KEY = 'invalid_idempotency_key' | 'validation_error' | 'missing_api_key' | 'restricted_api_key' | 'invalid_api_key' | 'not_found' | 'method_not_allowed' | 'invalid_idempotent_request' | 'concurrent_idempotent_requests' | 'invalid_attachment' | 'invalid_from_address' | 'invalid_access' | 'invalid_parameter' | 'invalid_region' | 'missing_required_field' | 'monthly_quota_exceeded' | 'daily_quota_exceeded' | 'rate_limit_exceeded' | 'security_error' | 'application_error' | 'internal_server_error';
```
`[VERIFICADO: node_modules/resend/dist/index.d.mts:121 (6.17.2) e cdn.jsdelivr.net/npm/resend@6.18.1/dist/index.d.mts:121 — idênticas]`

**Recomendação:** `pnpm add resend@^6.18.1` como tarefa própria do plano, com `pnpm test`
+ `tsc --noEmit` como prova de que `classificar.ts` sobreviveu.

### C-03 — ✅ RESOLVIDO em 2026-08-07: D-03 foi ampliada pelo owner

D-03 é explícita: em `enviarEmail`, "**`replyTo` passa a ser opcional. Nada mais.**"

Mas o SDK aceita `html` **e** `text` no mesmo envio
(`interface EmailRenderOptions { react; html: string; text: string }`, exigido como
`RequireAtLeastOne`) `[VERIFICADO: node_modules/resend/dist/index.d.mts:2003-2023]`, e a
própria doc do Resend lista a versão em texto puro como item de entregabilidade: *"Including
a plain text version of your email ensures accessibility for all recipients"*
`[CITADO: resend.com/docs — Deliverability Insights > Attention Insights]`. O
`@react-email/render` já produz esse texto de graça (`render(node, { plainText: true })`).

Ou seja: mandar só HTML deixa um ganho barato de SC4 na mesa, e mandar HTML+texto exige uma
**segunda** alteração no wrapper (`text?: string` em `ParamsEmail`) que D-03 não autorizou.

**Resolução (2026-08-07, decisão do owner):** D-03 foi ampliada — ver **D-03a** em
`04-CONTEXT.md`. O wrapper recebe **duas** alterações autorizadas (`replyTo?` e `text?`) e
o e-mail sai com HTML + versão em texto puro, gerada por
`render(node, { plainText: true })`. **Não abrir checkpoint sobre isto** — está decidido.

---

## Mapa de responsabilidade arquitetural

| Capacidade | Camada primária | Camada secundária | Por quê |
|------------|-----------------|-------------------|---------|
| Decidir "esta conta nunca recebeu boas-vindas" | Banco (índice único parcial) | — | Duas abas simultâneas são decididas por constraint, nunca por leitura-depois-escrita; mesmo racional da exclusion constraint da Phase 2 |
| Disparar o boas-vindas | Server Action (`obterPerfilEmpresa`) via `after()` | — | Único ponto do código que sabe que uma conta nasceu (sem webhook do Clerk, por decisão de arquitetura) |
| Resolver o endereço de destino | Server Action + Clerk Backend API | Coluna `email_contato` (override) | O Clerk é a fonte do endereço verificado; a coluna só ganha quando preenchida (D-01) |
| Renderizar o HTML | Módulo puro de template (`src/emails/`) | — | Nenhuma dependência de request; testável e pré-visualizável fora do app |
| Transportar | `src/lib/email/enviar.ts` (já existe) | Resend | A fase consome, não reescreve |
| Receber a supressão | Route Handler (`/api/webhooks/resend`) | — | Exceção autorizada à regra "sem rotas REST": webhook de terceiro |
| Bloquear envio a endereço suprimido | **Resend (fornecedor)** | — | D-11: SC3 já é verdade pelo fornecedor; nós só passamos a *saber* |
| Auditar | Banco (tabela nova, append-only + rebaixamento de status) | Sentry Issue / Log | Auditoria por tenant sem PII, no molde de `disparos_whatsapp` |
| Alertar o owner | Sentry Issue sintética estática | — | Volume baixo; contato direto do owner é proporcional (D-14) |

---

## Stack padrão

### Novas dependências

| Pacote | Versão | Onde | Propósito |
|--------|--------|------|-----------|
| `react-email` | `^6.9.2` | `dependencies` | Componentes (`Html`, `Body`, `Container`, `Section`, `Img`, `Link`, `Text`, `Preview`…) **e** o `render()`, reexportado de `@react-email/render`. É também o CLI `email`. `[VERIFICADO: registro npm + cdn.jsdelivr.net/npm/react-email@6.9.2/dist/index.d.mts:25-26]` |
| `@react-email/ui` | `^6.9.2` | `devDependencies` | App de pré-visualização local (`email dev`). Descrição no registro: `"A live preview of your emails right in your browser."` `[VERIFICADO: registro npm]` |
| `resend` | `^6.18.1` (upgrade de `^6.17.2`) | `dependencies` (já existe) | Traz `suppression.added`/`SuppressionAddedEvent`. Ver C-02. `[VERIFICADO: cdn.jsdelivr.net/npm/resend@6.18.1/dist/index.d.mts:2144]` |

**Instalação:**
```bash
pnpm add react-email@^6.9.2 resend@^6.18.1
pnpm add -D @react-email/ui@^6.9.2
```

### Pacotes que NÃO devem ser instalados

| Pacote | Por quê não |
|--------|-------------|
| `svix` | **Desnecessário.** O `resend@6.17.2` já embute a verificação: `verify(payload) { return new Webhook(payload.webhookSecret).verify(...) }`, com `import { Webhook } from "standardwebhooks"` no topo do bundle. `[VERIFICADO: node_modules/resend/dist/index.mjs:2,1111-1117]` |
| `standardwebhooks` (direto) | Já está no store como dependência transitiva do `resend` (`"standardwebhooks": "1.0.0"` em `node_modules/resend/package.json`) `[VERIFICADO: node_modules/resend/package.json]`. Sob pnpm ele **não** é importável direto do código do app (testado: `require('standardwebhooks')` falha na raiz do projeto). Usar `resend.webhooks.verify` evita declarar a dependência. |
| `@react-email/components`, `@react-email/button`, `@react-email/html`, `@react-email/tailwind` | Descontinuados. Ver C-01. |
| `@react-email/render` (separado) | Redundante: `react-email` já o reexporta e o traz como dependência (`"@react-email/render": ">=2.1.0"`) `[VERIFICADO: registro npm, react-email@6.9.2 dependencies]` |

### Alternativas consideradas

| Em vez de | Poderia usar | Trade-off |
|-----------|--------------|-----------|
| `react-email` em `dependencies` | `react-email` só em `devDependencies` | A árvore do `react-email` inclui `esbuild`, `socket.io`, `chokidar`, `prismjs`, `tailwindcss` `[VERIFICADO: registro npm, react-email@6.9.2 dependencies]` — é o servidor de preview. Mas os **componentes** vêm do mesmo pacote, então em devDep o build de produção quebra. O peso é de `node_modules`/imagem, não do bundle servido (o CLI só é alcançável pelo `bin`). Fica em `dependencies`. |
| `resend.webhooks.verify` | `svix` direto | `svix@1.99.1` seria dependência nova de ~centenas de KB para reimplementar o que já está instalado. Só valeria se o Resend deixasse de expor `verify`. |
| Faixa de cor em HTML (D-17) | `<Tailwind>` do React Email | O `<Tailwind>` do React Email carrega Tailwind **v3** por padrão (há uma dist-tag `tailwindv4` separada em `@react-email/components`), e o projeto está em v4 — mismatch gratuito num template de ~40 linhas. Usar `style={{}}` inline. |

---

## Auditoria de legitimidade de pacotes

Executada com `gsd-tools query package-legitimacy check --ecosystem npm` nesta sessão.

| Pacote | Registro | Publicação da última versão | Downloads/semana | Repositório | Veredito | Disposição |
|--------|----------|------------------------------|------------------|-------------|----------|------------|
| `react-email` | npm | 2026-08-07 | 3.313.334 | `github.com/resend/react-email` | **SUS** (`too-new`) | Aprovado — ver nota |
| `@react-email/ui` | npm | 2026-08-07 | 692.732 | `github.com/resend/react-email` | **SUS** (`too-new`) | Aprovado — ver nota |
| `@react-email/render` | npm | 2026-07-10 | 10.300.236 | `github.com/resend/react-email` | **SUS** (`too-new`) | Não instalado diretamente (vem por `react-email`) |
| `@react-email/components` | npm | 2026-04-09 | 4.855.707 | `github.com/resend/react-email` | **SUS** (`deprecated`) | **REMOVIDO** — descontinuado (C-01) |
| `resend` | npm | já instalado desde a etapa preparatória | — | `github.com/resend/resend-node` | OK | Aprovado (upgrade de versão) |

**Nota sobre os vereditos `too-new`:** o sinal é a data da **última publicação**, não a idade
do pacote. Os três são do mesmo repositório oficial (`resend/react-email`) do fornecedor cujo
SDK (`resend`) já é dependência do projeto desde a etapa preparatória, foram descobertos via
Context7 `/resend/react-email` e via a doc oficial `react.email/docs`, têm entre 700 mil e 10
milhões de downloads semanais, e **nenhum tem script `postinstall`** (`"postinstall": null`
nos três). Não há sinal de slopsquatting.

**Pacotes removidos por veredito de descontinuação:** `@react-email/components` e a família
`@react-email/*` de componentes.

**Pacotes marcados SUS:** `react-email`, `@react-email/ui`. Pelo protocolo, o planner insere
um `checkpoint:human-verify` antes do `pnpm add` — o owner confirma a instalação vendo esta
tabela. Não é motivo para descartar; é motivo para o owner olhar antes.

**⚠️ `prettier` vira dependência de runtime.** `@react-email/render@2.1.0` traz
`"prettier": "^3.5.3"` em `dependencies` `[VERIFICADO: registro npm]`. O projeto já tem
prettier como devDep; agora ele passa a existir também em produção (só é exercitado com
`render(node, { pretty: true })` — que **não** deve ser usado em produção).

---

## Padrões de arquitetura

### Diagrama do sistema

```
┌── FLUXO A: primeiro acesso ao dashboard (EML-01) ────────────────────────────┐
│                                                                              │
│  Profissional abre /dashboard                                                │
│         │                                                                    │
│         ▼                                                                    │
│  page.tsx (Server Component) ── await obterPerfilEmpresa()                    │
│         │                                                                    │
│         ├─► perfil existe? ──sim──► devolve; agenda after() mesmo assim*      │
│         │                                                                    │
│         └─► não: upsert cria o perfil (auto-provisionamento)                  │
│                    │                                                         │
│                    ▼                                                         │
│         captura orgId + nomeEstabelecimento + slug  ◄── ANTES do after()      │
│                    │                                                         │
│                    ▼                                                         │
│              after(() => …)  ──── resposta HTML já foi enviada ao browser ────┤
│                    │                                                         │
│                    ▼                                                         │
│        ┌───────────────────────────────────────────────┐                     │
│        │ 1. INSERT auditoria (status='enviado')        │                     │
│        │    chave = "boas-vindas/<tenant_id>"          │                     │
│        │       │                                        │                     │
│        │       ├── 23505 ──► JÁ ENVIADO: encerra em silêncio                 │
│        │       │                                        │                     │
│        │       ▼ ok (a linha é a RESERVA da trava)      │                     │
│        │ 2. resolve destinatário                        │                     │
│        │    email_contato ?? Clerk(createdBy).primário verificado             │
│        │       │                                        │                     │
│        │       ├── nenhum ──► UPDATE status='sem_destinatario'                │
│        │       │              + reportarFalhaSilenciosaAguardando (D-10)      │
│        │       ▼                                        │                     │
│        │ 3. render(<BoasVindas slug=… />)  → html       │                     │
│        │ 4. enviarEmail({ …, idempotencyKey: chave })   │                     │
│        │       │                                        │                     │
│        │       ├── ok  ──► UPDATE resend_id=<id>  (trava CONSUMADA)           │
│        │       └── !ok ──► UPDATE status='falhou'|'rejeitado'                 │
│        │                   (trava LIBERADA — retenta na próxima carga, D-07)  │
│        └───────────────────────────────────────────────┘                     │
└──────────────────────────────────────────────────────────────────────────────┘

  * o after() é sempre agendado; quem barra o reenvio é o 23505 do passo 1, não
    a posição da chamada — é o que D-09 diz com todas as letras.

┌── FLUXO B: retorno de bounce (EML-06) ───────────────────────────────────────┐
│                                                                              │
│  Resend ──POST /api/webhooks/resend──► Route Handler                          │
│    headers: svix-id / svix-timestamp / svix-signature                         │
│         │                                                                    │
│         ▼                                                                    │
│  const corpoCru = await req.text()   ◄── ANTES de qualquer parse              │
│         │                                                                    │
│         ▼                                                                    │
│  resend.webhooks.verify({ payload: corpoCru, headers, webhookSecret })        │
│         │                                                                    │
│         ├── lança WebhookVerificationError ──► 401, e nada mais acontece      │
│         ▼ ok (devolve o payload já parseado e tipado)                         │
│  type !== 'suppression.added' ? ──► 200 "ignorado" (não é erro)               │
│         ▼                                                                    │
│  data.source_id === null ? ──► 200 "origem manual, sem tenant" (D-13)         │
│         ▼                                                                    │
│  SELECT tenant_id FROM auditoria WHERE resend_id = data.source_id             │
│         │                          (createAdminClient — service role)         │
│         ├── 0 linhas ──► 200 "e-mail não é nosso / fora da tabela"            │
│         ▼                                                                    │
│  registra o estado + reportarFalhaSilenciosaAguardando(                       │
│      'email:endereco_suprimido', { tenantHash, motivo: data.origin })         │
│         │                                                                    │
│         ▼  data.email NUNCA é persistido, logado nem enviado ao Sentry        │
│      200 OK                                                                   │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Estrutura de arquivos recomendada

```
src/
├── emails/                                # NOVO — fora de app/, sem 'use server'
│   ├── BoasVindas.tsx                     #   componente React do e-mail (D-16/D-17)
│   └── layout/
│       ├── LayoutBase.tsx                 #   faixa + logo + rodapé — Phases 5 e 9 herdam
│       └── tokens.ts                      #   #3DBAED / #3961D5 / #4219B0, tipografia
├── lib/email/
│   ├── enviar.ts                          # EXISTE — só D-03 (replyTo opcional)
│   ├── remetente.ts                       # EXISTE — intocado
│   ├── classificar.ts                     # EXISTE — intocado (C-02 confirma que sobrevive)
│   ├── chaves-idempotencia.ts             # NOVO — fonte única de "boas-vindas/<tenantId>"
│   ├── auditoria.ts                       # NOVO — reservar/consumar/liberar a linha
│   ├── destinatario.ts                    # NOVO — email_contato ?? Clerk (D-01/D-10)
│   └── boas-vindas.ts                     # NOVO — orquestra o callback do after()
├── app/api/webhooks/resend/route.ts       # NOVO — D-12/D-13/D-14
└── app/actions/perfis-empresas.ts         # ALTERA — after() no auto-provisionamento

supabase/schemas/
├── 01_perfis_empresas.sql                 # ALTERA — coluna email_contato (D-01)
└── 10_disparos_email.sql                  # NOVO — D-05 a D-08

public/
└── email-logo.png                         # NOVO — ver §"Hospedagem do logo"
```

**Por que `src/emails/` e não `src/app/emails/`:** um arquivo dentro de `src/app/actions/`
não serve, porque aquele diretório usa `'use server'` no topo e um módulo `'use server'` só
pode exportar funções async — um componente React não passa. Fora de `src/app/`, o
componente é importado só por código de servidor e nunca entra no grafo do cliente.

### Padrão 1 — "reserva otimista" (a leitura correta de D-06 + D-07 juntos)

**O quê:** D-06 diz "grava primeiro, envia depois"; D-07 diz que o índice é **parcial sobre
`status = 'enviado'`**. As duas só são verdadeiras ao mesmo tempo se a linha nascer **já com
status `enviado`** — a linha é a *reserva* da trava, não o registro do sucesso.

**Como funciona:**
1. `INSERT` com `status = 'enviado'` e `resend_id = NULL`. O índice parcial recusa a segunda
   aba com `23505` sem que ninguém precise ler antes de escrever.
2. Envia.
3. Sucesso → `UPDATE … SET resend_id = <id>`: a trava fica consumada para sempre.
4. Falha → `UPDATE … SET status = 'falhou'` (ou `'rejeitado'` / `'sem_destinatario'`): a
   linha sai do predicado do índice, a trava é liberada, e a próxima carga do dashboard
   tenta de novo sozinha — que é literalmente o que D-07 promete.

**Consequência que o planner precisa aceitar de olhos abertos:** a tabela **não é
estritamente append-only** como a `disparos_whatsapp`. Ela precisa de uma policy de `UPDATE`
(ou de escrita só por `service_role`, que é o caminho recomendado — ver §"Privilégios"). O
histórico não é apagado; só o status da própria linha muda. A alternativa recusada por D-07
("apaga a linha") continua recusada.

**Janela de falha conhecida:** se o processo morrer entre o passo 1 e o passo 4, sobra uma
linha `enviado` com `resend_id = NULL` que bloqueia para sempre um e-mail que nunca saiu. É
uma janela de milissegundos, num e-mail por tenant, e o conserto é um `UPDATE` manual do
owner. Documentar no `COMMENT ON TABLE`, não construir compensação.

### Padrão 2 — trabalho pós-resposta a partir de um Server Component

**O quê:** `after()` (import de `next/server`) agenda trabalho para depois que a resposta foi
enviada. É estável desde a v15.1.0 e suportado em Node.js server e Docker.
`[VERIFICADO: node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md:13,240-241,300-303]`

**A armadilha:** `obterPerfilEmpresa` é `'use server'`, mas é **chamada diretamente na
renderização de um Server Component** — `src/app/dashboard/page.tsx:53` e
`src/app/dashboard/agenda/page.tsx:37` `[VERIFICADO: grep em src/, 2026-08-07]`. Não é um
POST de Server Function. E a doc do Next é literal sobre esse contexto:

> "Calling `cookies()` or `headers()` inside the `after` callback in a Server Component will
> throw a runtime error."
> `[VERIFICADO: node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md:166]`

> "Server Components (including pages, layouts, and `generateMetadata`) **cannot** use
> `cookies`, `headers`, or other Request-time APIs inside `after`."
> `[VERIFICADO: mesmo arquivo, linha 120]`

**O que isso proíbe dentro do callback:**
- `auth()` do Clerk — lê headers.
- `createClient()` de `src/lib/supabase/server.ts` — injeta o JWT do Clerk vindo do header.

**O que fazer:** ler tudo antes e passar por closure, exatamente como a doc recomenda
(linhas 122-143), e usar `createAdminClient()` (service role, sem cookies) dentro do callback.

**Sobre `clerkClient()` dentro do `after`:** funciona, mas por um caminho de *fallback* que
convém conhecer. Ele chama `buildRequestLike()` num `try/catch` e só relança erro de
prerendering/`use-cache`; qualquer outro erro é engolido e ele cai em
`createClerkClientWithOptions({})` `[VERIFICADO: node_modules/@clerk/nextjs/dist/esm/server/clerkClient.js:8-27]`,
cujos defaults incluem `secretKey: SECRET_KEY` lido do ambiente
`[VERIFICADO: node_modules/@clerk/nextjs/dist/esm/server/createClerkClient.js:16-30]`.
Depender de um `catch` genérico para o caminho feliz é frágil. **Preferir o explícito:**
`createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })`, exportado por
`@clerk/nextjs/server` `[VERIFICADO: node_modules/@clerk/nextjs/dist/types/server/index.d.ts:5]`.

**Precedente do projeto:** `capturarEventoServidor` envolve o `after()` num `try/catch` com
fallback fire-and-forget `[VERIFICADO: src/lib/analytics/server.ts:66-72]` — copiar a forma.

### Padrão 3 — webhook de terceiro com corpo cru

Espelhar `src/app/api/webhooks/lembrete/route.ts` linha a linha na ordem: (1) `req.text()`
para o corpo cru, (2) verificar assinatura, (3) só então interpretar o payload, (4) trabalhar,
(5) responder. O lembrete faz exatamente isso em `route.ts:22-38`
`[VERIFICADO: src/app/api/webhooks/lembrete/route.ts:22-38]`.

Diferença relevante: o QStash assina a **URL** junto do corpo (por isso
`verificarAssinaturaQstash` recebe `url`); o Standard Webhooks assina apenas
`"${msgId}.${timestamp}.${payload}"` `[VERIFICADO: node_modules/.pnpm/standardwebhooks@1.0.0/node_modules/standardwebhooks/dist/index.js:80-85]`.
Não há claim de URL para conferir.

### Antipadrões a evitar

- **`await req.json()` antes de verificar a assinatura.** Consome o stream e a reserialização
  não bate com o que foi assinado — a verificação passa a falhar sempre, ou (pior) alguém
  "conserta" removendo a verificação.
- **`createClient()` dentro do `after()`.** Ver Padrão 2. O sintoma é um erro que só aparece
  em produção, depois que a página já foi entregue verde.
- **Ler o perfil para decidir se já enviou.** `SELECT` seguido de `INSERT` não é atômico e
  duas abas passam. É o que D-06 evita.
- **`<img>` SVG no e-mail.** Gmail remove SVG. O `public/logo-fundo-claro.svg` existente não
  serve — ver §"Hospedagem do logo".
- **Mensagem de Issue variável** (`email:falha para tenant org_abc`). Estilhaça o agrupamento
  do Sentry. A mensagem é sintética e estática; o tenant vai como `tenantHash` no contexto.
- **`render(node, { pretty: true })` em produção.** Puxa o prettier e formata HTML à toa a
  cada envio.

---

## Não faça à mão

| Problema | Não construa | Use | Por quê |
|----------|--------------|-----|---------|
| Verificar assinatura do webhook do Resend | HMAC-SHA256 + comparação em tempo constante + tolerância de timestamp | `resend.webhooks.verify({ payload, headers, webhookSecret })` | Já está instalado; o `standardwebhooks` faz `timingSafeEqual`, tolerância de 300 s nos dois sentidos, e suporta múltiplas assinaturas `v1,…` separadas por espaço (rotação de segredo) `[VERIFICADO: node_modules/.pnpm/standardwebhooks@1.0.0/…/dist/index.js:7,56-71,86-100]` |
| HTML de e-mail compatível com Outlook/Gmail | Tabelas aninhadas à mão | Componentes do `react-email` (`Html`, `Body`, `Container`, `Section`, `Row`, `Column`) | É o problema real que D-15 comprou; refazer é o pior uso possível das 4-5 h/dia |
| Versão em texto puro | Regex tirando tags do HTML | `render(node, { plainText: true })` ou `toPlainText(html)` | Já vem no pacote; a conversão usa `html-to-text`, que trata listas, links e entidades |
| Lista de supressão própria | Tabela de endereços banidos + checagem antes de cada envio | O Resend | D-11. Construir a nossa criaria um lugar novo para guardar e-mail, contra o invariante nunca-PII |
| Deduplicar envio | Lock em memória, flag no perfil, `SELECT` antes do `INSERT` | Índice único parcial no Postgres | Precedente literal no repo: `CREATE UNIQUE INDEX uq_assinatura_vigente_por_tenant ON assinaturas (tenant_id) WHERE status IN ('ativa', 'inadimplente');` `[VERIFICADO: supabase/schemas/08_assinaturas.sql:18-20]` |
| Não bloquear a resposta | `void promessa` solto, `setTimeout`, fila própria | `after()` de `next/server` | Precedente em `src/lib/analytics/server.ts:67` |
| Pseudonimizar o tenant | `sha256(orgId)` novo | `hashTenantId` de `src/lib/observabilidade/hash.ts` | O hash é salgado e separado por domínio (WR-01); um hash novo reabre a correlação cruzada |

**A ideia central:** nesta fase, quase tudo o que parece precisar de código já existe — no
repo, no SDK instalado, ou no fornecedor. O trabalho real é ligar as peças com um contrato de
idempotência correto.

---

## Armadilhas comuns

### 1. O `after()` que morre em silêncio no Server Component
**O que dá errado:** `auth()` ou `createClient()` dentro do callback lançam em runtime.
**Por que acontece:** `obterPerfilEmpresa` *parece* uma Server Function (tem `'use server'`),
mas é chamada na renderização de `page.tsx` — o contexto é o de Server Component.
**Como evitar:** capturar `orgId`/`nomeEstabelecimento`/`slug` antes do `after()` e usar
`createAdminClient()` dentro.
**Sinal de alerta:** dashboard abre normalmente, nenhum e-mail sai, nenhuma linha na tabela
de auditoria. Exatamente o modo de falha que a quick task 260724 documentou: "nada apareceu
em painel nenhum".

### 2. Verificação de assinatura que passa a falhar sempre
**O que dá errado:** o corpo é lido com `req.json()` (ou lido duas vezes).
**Como evitar:** `const corpoCru = await req.text()` como primeira operação, e o objeto vem do
retorno do `verify()`, que já devolve o payload parseado (`return JSON.parse(payload.toString())`)
`[VERIFICADO: standardwebhooks/dist/index.js:69]`.
**Sinal de alerta:** 401 em 100% das entregas no painel do Resend.

### 3. `source_id` nulo derruba a rota
**O que dá errado:** supressão de origem `manual` chega com `source_id: null`, e o
`.eq('resend_id', null)` faz uma consulta sem sentido — ou o código quebra antes.
**Prova:** `interface SuppressionEventData { id: string; email: string; origin: 'bounce' | 'complaint' | 'manual'; source_id: string | null; created_at: string; }`
`[VERIFICADO: cdn.jsdelivr.net/npm/resend@6.18.1/dist/index.d.mts:2220-2226]`
**Como evitar:** guard clause `if (!data.source_id) return 200` antes de qualquer I/O — é o
padrão "validação na fronteira antes de I/O" da Phase 1.

### 4. O timestamp de 5 minutos e o retry
**O que dá errado:** a tolerância do Standard Webhooks é de 300 s (`WEBHOOK_TOLERANCE_IN_SECONDS = 5 * 60`)
`[VERIFICADO: standardwebhooks/dist/index.js:7`, e a verificação usa `now - timestamp` com o
relógio **local** `[VERIFICADO: mesmo arquivo, linhas 86-100]`. Relógio do container atrasado
= 401 em tudo.
**Como evitar:** distinguir no log `assinatura_invalida` de `timestamp_fora_da_janela` (o
`WebhookVerificationError` traz mensagens diferentes: `"Message timestamp too old"` /
`"Message timestamp too new"` / `"No matching signature found"` / `"Missing required headers"`).
Nunca deixar a mensagem do erro chegar ao Sentry — só o rótulo sintético.

### 5. A tabela nova nasce invisível para a Data API
**O que dá errado:** `permission denied for table …` sem relação aparente com a feature.
**Por que acontece:** desde a Phase 1, "toda tabela criada por migration não aparece na Data
API para nenhuma das duas roles de API" `[VERIFICADO: docs/03-PADROES_DE_BANCO_DE_DADOS.md:89]`,
e "`supabase db diff` NÃO gera GRANT/REVOKE" `[VERIFICADO: docs/03-PADROES_DE_BANCO_DE_DADOS.md:124]`.
**Como evitar:** migration **manual** com o `GRANT` explícito, como tarefa separada do plano.
🚨 `service_role` **nunca** entra em linha de `REVOKE` `[VERIFICADO: docs/03-PADROES_DE_BANCO_DE_DADOS.md:142]`.

### 6. `tsc --noEmit` reprova por causa do SDK
Ver C-02. Sem o upgrade do `resend`, `payload.type === 'suppression.added'` não compila.
Memória do projeto: `pnpm test` e `next build` não pegam erro de tipo — o gate é
`tsc --noEmit`.

### 7. Logo em SVG
`public/` tem `logo-fundo-claro.svg` e `logo-fundo-escuro.svg`, e **nenhum PNG de logo**
(só `og.png`) `[VERIFICADO: ls public/, 2026-08-07]`. Gmail não renderiza SVG em e-mail
`[ASSUMIDO]`. Ver §"Hospedagem do logo".

### 8. Atributo de log novo é descartado em silêncio
A allowlist de `logOperacional` é **fechada** e validada em duas barreiras compartilhadas.
Chave fora de `CHAVES_PERMITIDAS_LOG` some sem aviso `[VERIFICADO: src/lib/observabilidade/atributos-log.ts:62-79,111-125]`,
e os campos `tenantHash`/`agendamentoHash`/`chaveHash` ainda precisam casar com
`/^[0-9a-f]{16}$/` `[VERIFICADO: mesmo arquivo:92-99]`. É literalmente o defeito que a Phase 3
sofreu. **Todo código novo de log precisa acrescentar o par (chave em `atributos-log.ts` +
frase em `MENSAGENS_LOG` de `log.ts`) e o teste correspondente.**

---

## Exemplos de código

### Renderizar o template (API confirmada nos tipos publicados)

```ts
// src/lib/email/boas-vindas.ts
import { render } from 'react-email'          // reexportado de @react-email/render
import { BoasVindas } from '@/emails/BoasVindas'

// declare const render: (node: React.ReactNode, options?: Options) => Promise<string>
//   [VERIFICADO: @react-email/render@2.1.0/dist/node/index.d.mts:48]
const html = await render(<BoasVindas nomeEstabelecimento={nome} linkPublico={link} />)

// Opcional (ver C-03): a mesma árvore em texto puro.
// Options = { pretty?: boolean } & ({ plainText?: false } | { plainText?: true; htmlToTextOptions?; … })
const texto = await render(<BoasVindas … />, { plainText: true })
```

### Verificar a assinatura sem instalar nada novo

```ts
// src/app/api/webhooks/resend/route.ts  (esqueleto — nomes exatos ficam a critério do plano)
import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

export async function POST(req: NextRequest) {
    const corpoCru = await req.text()               // SEMPRE primeiro

    const id = req.headers.get('svix-id')
    const timestamp = req.headers.get('svix-timestamp')
    const signature = req.headers.get('svix-signature')
    if (!id || !timestamp || !signature) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
    }

    let evento
    try {
        // `verify` é método de INSTÂNCIA; o construtor lança sem chave
        // (node_modules/resend/dist/index.mjs:1148-1151), e RESEND_API_KEY já é
        // obrigatória em produção (src/lib/env.ts:54).
        evento = new Resend(process.env.RESEND_API_KEY).webhooks.verify({
            payload: corpoCru,
            headers: { id, timestamp, signature },
            webhookSecret: process.env.RESEND_WEBHOOK_SECRET!,   // whsec_…
        })
    } catch {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
    }

    if (evento.type !== 'suppression.added') {
        return NextResponse.json({ ok: true, ignorado: true })
    }
    // evento.data: { id, email, origin: 'bounce'|'complaint'|'manual', source_id: string|null, created_at }
    // ⚠️ evento.data.email NÃO é persistido, nem logado, nem enviado ao Sentry (D-13).
}
```

Assinatura verificada nos tipos instalados:
```ts
interface Headers { id: string; timestamp: string; signature: string }
interface VerifyWebhookOptions { payload: string; headers: Headers; webhookSecret: string }
verify(payload: VerifyWebhookOptions): WebhookEventPayload;
```
`[VERIFICADO: node_modules/resend/dist/index.d.mts:2287-2306]`

E a implementação que mapeia os headers `svix-*` para os nomes do Standard Webhooks:
```js
verify(payload) {
    return new Webhook(payload.webhookSecret).verify(payload.payload, {
        "webhook-id": payload.headers.id,
        "webhook-timestamp": payload.headers.timestamp,
        "webhook-signature": payload.headers.signature
    });
}
```
`[VERIFICADO: node_modules/resend/dist/index.mjs:1111-1117]`

### O índice único parcial (D-06 + D-07), no molde do que já existe

```sql
-- supabase/schemas/10_disparos_email.sql (esqueleto; nomes exatos ficam a critério do plano)
CREATE TABLE disparos_email (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id text NOT NULL,
    tipo text NOT NULL CHECK (tipo IN ('boas_vindas')),   -- Phases 5 e 9 acrescentam aqui
    chave_idempotencia text NOT NULL,                     -- 'boas-vindas/<tenant_id>' (D-06)
    status text NOT NULL CHECK (status IN ('enviado', 'falhou', 'rejeitado', 'sem_destinatario')),
    resend_id text,                                       -- id devolvido pelo Resend (D-08/D-13)
    motivo text,                                          -- MotivoFalhaEmail; nunca frase do fornecedor
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES perfis_empresas(tenant_id) ON DELETE CASCADE
);

-- D-07: a trava só vale para quem está em 'enviado'. Falha libera a retentativa.
CREATE UNIQUE INDEX uq_disparo_email_enviado
ON disparos_email (chave_idempotencia)
WHERE status = 'enviado';

-- D-13: o cruzamento do webhook é por este id.
CREATE INDEX idx_disparos_email_resend_id ON disparos_email (resend_id);
```

O formato é o mesmo de `uq_assinatura_vigente_por_tenant`
`[VERIFICADO: supabase/schemas/08_assinaturas.sql:18-20]`, que já atravessou `supabase db diff`
neste repositório — então o fluxo declarativo dá conta de índice único parcial.

### Distinguir "já enviado" de falha de verdade

O projeto já lê o código do Postgres exatamente assim:
```ts
if (error.code === '23505') { … }
```
`[VERIFICADO: src/app/actions/perfis-empresas.ts:295]`

E para o Sentry, a mensagem do banco **nunca** atravessa: `erroSinteticoSupabase(erro)`
devolve `new Error('supabase:' + code)` `[VERIFICADO: src/lib/observabilidade/erro-supabase.ts:25-32]`.

### Resolver o destinatário (D-01/D-10)

Tipos confirmados no `@clerk/backend@3.10.0` instalado:
- `Organization.createdBy?: string | undefined` — *"The ID of the user who created the Organization."* `[VERIFICADO: node_modules/.pnpm/@clerk+backend@3.10.0_…/node_modules/@clerk/backend/dist/api/resources/Organization.d.ts:32]`
- `UserApi.getUser(userId: string): Promise<User>` `[VERIFICADO: …/dist/api/endpoints/UserApi.d.ts:368]`
- `User.primaryEmailAddressId: string | null` e `User.emailAddresses: EmailAddress[]` `[VERIFICADO: …/dist/api/resources/User.d.ts]`
- `EmailAddress.emailAddress: string` e `EmailAddress.verification: Verification | null` `[VERIFICADO: …/dist/api/resources/EmailAddress.d.ts]`
- `Verification.status: VerificationStatus`, documentado no próprio arquivo como
  `unverified` / `verified` / `transferable` / `failed` / `expired` `[VERIFICADO: …/dist/api/resources/Verification.d.ts:7-18]`

Ordem: `perfil.email_contato` (se preenchido) → senão `organization.createdBy` →
`users.getUser()` → o `EmailAddress` cujo `id === primaryEmailAddressId` **e**
`verification?.status === 'verified'`. Qualquer buraco no caminho (`createdBy` é opcional,
`primaryEmailAddressId` é nullable, `verification` é nullable) cai no ramo `sem_destinatario`
de D-10.

---

## Hospedagem do logo do e-mail (discricionariedade do Claude)

**Recomendação: `public/email-logo.png`, referenciado como `${APP_URL}/email-logo.png`.**

Motivos, todos verificados:
- Não há PNG de logo em `public/` hoje — só `og.png` e dois SVG `[VERIFICADO: ls public/]`.
  SVG não serve para e-mail.
- A arte aprovada existe em PNG: `artes-aprovadas-design/Fundo_claro/logo_fundo_claro.png`,
  `PNG image data, 3005 x 973, 8-bit/color RGBA` `[VERIFICADO: file(1), 2026-08-07]`. Precisa
  ser redimensionada (algo como 480 px de largura para render a ~160 px em 3×) e achatada
  sobre a cor da faixa — RGBA transparente sobre fundo colorido é onde o Outlook desktop
  costuma inventar um retângulo branco `[ASSUMIDO]`.
- `APP_URL` já é obrigatória em produção `[VERIFICADO: src/lib/env.ts:50]` e já é usada para
  montar URL absoluta de terceiro (`${APP_URL}/api/webhooks/lembrete`) `[VERIFICADO: src/lib/whatsapp-helper.ts:190]`.
- O bucket `imagens-perfis` foi descartado por três razões: é do domínio do **tenant** (paths
  `<org_id>/…`), não da marca; introduz um segundo domínio no e-mail, e link fora do domínio
  do remetente é sinal negativo de entregabilidade (§"Entregabilidade"); e teria de ser
  populado por script, criando estado que o `db reset` não recria.
- Embutir em base64 (`cid:`/data URI) foi descartado: Gmail bloqueia data URI em `<img>`
  `[ASSUMIDO]`, e anexo inline aumenta o peso de todo envio.

---

## Entregabilidade (D-16/D-17) — o que a evidência sustenta

A questão é o que o UAT do SC4 está de fato medindo. Curto e com fonte.

**O que D-17 acerta:** a razão alta de **imagem por texto** é sinal reconhecido de
classificação promocional — múltiplas análises de entregabilidade convergem nisso
`[CITADO: suped.com/knowledge/email-deliverability/sender-reputation/how-does-gmail-decide-which-emails-go-to-the-promotions-tab]`.
Cor via CSS/HTML não é o sinal; imagem grande é. A faixa sólida entrega o visual sem pagar o
preço. A doc do próprio Resend diz o mesmo por outras palavras: *"reducing image counts…
can help messages reach the inbox more reliably"* `[CITADO: resend.com/docs/llms-full.txt]`.

**O que D-17 não cobre e o plano deveria:**
1. **Número de links e complexidade do rodapé** pesam junto com a imagem — a classificação é
   do conjunto: "Gmail tends to classify the total message, not a single element… A footer
   with twelve social links, a hero image, related products, app badges, and a sale banner
   changes the perceived purpose" `[CITADO: suped.com]`. Concretamente: o e-mail de
   boas-vindas deve ter **um** CTA (o `/book/[slug]`) e um rodapé mínimo. Instagram, site,
   ícones sociais — não nesta peça.
2. **Links precisam apontar para o domínio do remetente.** *"ensure link URLs match your
   sending domain to avoid triggering spam filters"* `[CITADO: resend.com/docs — Deliverability Insights]`.
   Isso tem uma consequência de painel: **rastreamento de abertura/clique do Resend reescreve
   os links para o domínio do fornecedor**, e a própria doc recomenda desligá-lo
   (*"disabling open or click tracking can help"*) `[CITADO: resend.com/docs/llms-full.txt]`.
   Confirmar que está desligado é ação do owner e entra no checklist.
3. **Endereço dedicado por finalidade ajuda a categorização.** *"Segmenting your email traffic
   by using dedicated addresses for personal, transactional, and marketing communications
   helps Gmail categorize your messages correctly into tabs like Primary or Promotions"*
   `[CITADO: resend.com/docs/llms-full.txt]`. O `naoresponda@mail.…` já é isso — e é um
   argumento a favor de nunca misturar marketing nesse remetente.
4. **DMARC.** *"publish a valid DMARC record in your DNS, as this is now a requirement for
   bulk senders by major providers like Gmail and Yahoo"* `[CITADO: resend.com/docs]`. Confirma
   que o item pendente de DNS não é decorativo — ainda que não bloqueie o envio, dado que o
   alinhamento passa pelo DKIM válido.
5. **Versão em texto puro** — ver C-03.

**O que a pesquisa NÃO sustenta:** qualquer previsão de qual aba o e-mail vai cair. A
classificação é holística e depende de reputação e engajamento, que num domínio de reputação
zero simplesmente não existem ainda. É por isso que SC4 é medição humana, não predição.

---

## Restrições do projeto (de CLAUDE.md / .claude/CLAUDE.md / AGENTS.md)

| Diretriz | O que significa nesta fase |
|----------|----------------------------|
| `pnpm` sempre | `pnpm add`, nunca `npm install` |
| Definition of Done | `pnpm lint`, `pnpm test`, `pnpm build` com saída real mostrada; + `tsc --noEmit` (memória do projeto: os três não pegam erro de tipo em `.test.ts`) |
| Mudança de schema | arquivo em `supabase/schemas/` + migration por `supabase db diff` + RLS granular por ação + `COMMENT ON` nas tabelas e policies novas |
| Privilégios | `db diff` não emite `GRANT`/`REVOKE` — migration manual, e `service_role` nunca em `REVOKE` |
| `auth.jwt()` em subquery | `(SELECT auth.jwt() ->> 'org_id')` nas policies novas |
| Nomenclatura | tabela no plural, coluna no singular, `snake_case`, pt-BR; domínio de negócio em português |
| Mutações | só Server Action; rota REST só para webhook de terceiro (`src/app/api/webhooks/`) |
| Server Components por padrão | `'use client'` só na ilha do campo `email_contato`, o mais baixo possível |
| Mobile-first, paleta `zinc` | vale para a UI do campo `email_contato` no dashboard — **não** para o e-mail, que segue D-16 |
| Nunca rodar `npx @sentry/wizard` / `@posthog/wizard` | — |
| Tecnologias banidas | Prisma, Drizzle, qualquer ORM, better-auth, Mercado Pago |
| Regra de Falha Silenciosa | "silencioso" é para o **destinatário**, nunca para o owner: Issue, Log, auditoria e alerta continuam obrigatórios |
| Variante aguardada do Sentry | obrigatória em Server Action, webhook e route handler — a fire-and-forget perde o evento |
| Next.js 16 tem breaking changes | consultar `node_modules/next/dist/docs/` antes de afirmar API do framework (foi o que se fez para o `after()`) |
| `docs/PENDENCIAS.md` | atualizar se a fase criar ou adiar tarefa |

---

## Disponibilidade do ambiente

| Dependência | Requerida por | Disponível | Versão | Alternativa |
|-------------|---------------|-----------|--------|-------------|
| Node.js | tudo | ✓ | v24.15.0 (`engines: >=22.13`) | — |
| pnpm | tudo | ✓ | 11.9.0 (pinado) | — |
| `resend` | envio + verificação de webhook | ✓ (upgrade necessário) | 6.17.2 → `^6.18.1` | — |
| `standardwebhooks` | verificação de assinatura | ✓ (transitivo, no store pnpm) | 1.0.0 | — |
| `@clerk/backend` | e-mail do criador da org | ✓ | 3.10.0 | — |
| Supabase local | migration + teste de integração | ✓ | stack do CLI, portas 544xx | Cloud com `--linked` |
| DKIM em `mail.vamoagendar.com.br` | envio real | ✓ | verificado desde 2026-07-21 | — |
| Endpoint do webhook + `whsec_` no painel do Resend | SC3 | ✗ | — | **Nenhuma** — ver gates do owner |
| SPF no subdomínio | relatório de DMARC | ✗ | — | Não bloqueia o envio (alinhamento por DKIM) |
| DMARC `p=none` com `rua` | relatório de DMARC | ✗ | — | Não bloqueia o envio |
| MX no domínio | receber resposta | ✗ | — | Irrelevante aqui por D-02; Phase 10 |

### 🚦 Gates de ação do owner (nenhum executor fecha)

1. **Provisionar o webhook no painel do Resend** — criar o endpoint
   `https://vamoagendar.com.br/api/webhooks/resend`, assinar o evento `suppression.added`, e
   copiar o segredo `whsec_…` para a variável de ambiente do Railway. **Sem isso, SC3 não é
   verificável** e o `RESEND_WEBHOOK_SECRET` obrigatório em produção (D-12) derruba o boot.
   ⚠️ Ordem importa: acrescentar a variável a `OBRIGATORIAS_EM_PRODUCAO` **antes** de ela
   existir no Railway mata o próximo deploy — o `validarEnvObrigatorio` lança em produção
   `[VERIFICADO: src/lib/env.ts:65-74]`. Provisionar primeiro, depois mergear.
2. **Conferir que rastreamento de abertura/clique está DESLIGADO** no domínio, no painel do
   Resend — link reescrito para outro domínio é sinal negativo (§"Entregabilidade").
3. **DNS: SPF no subdomínio + DMARC `p=none` com `rua`** — dois registros TXT. Não bloqueiam
   o envio, mas sem eles o envio acontece sem relatório nenhum.
4. **UAT do SC4** — enviar para Gmail, Outlook e um domínio corporativo e registrar a aba de
   chegada. **Dono: o owner.** Nenhum executor pode marcar.

---

## Validation Architecture

> Arquitetura de validação. O título fica em inglês porque os gates do GSD procuram a
> string literal `## Validation Architecture` — em pt-BR a seção existe e o gate não a vê.

### Framework de teste

| Propriedade | Valor |
|-------------|-------|
| Framework | Vitest ^4.1.10 |
| Config | `vitest.config.ts` (alias `@` → `src`, `env` com stubs de módulo) |
| Comando rápido | `pnpm test` (hermético: sem rede, sem banco) |
| Suíte completa | `pnpm test` + `pnpm lint` + `pnpm build` + `npx tsc --noEmit` |
| Integração (opt-in) | `EXIGIR_INTEGRACAO=1 vitest run <suíte>` — hoje só `public-booking-escrita.test.ts` está no `exclude` condicional `[VERIFICADO: vitest.config.ts:11-12,30-33]` |

### Success Criteria → prova

| SC | Comportamento | Tipo | Comando / evidência | Existe? |
|----|---------------|------|---------------------|---------|
| **SC1** | Conta nova recebe e-mail com o `/book/[slug]` | unit | `pnpm test src/lib/__tests__/email-boas-vindas.test.ts` — com `enviarEmail` e o cliente de banco mockados, prova: (a) o HTML contém o link absoluto do slug; (b) `idempotencyKey === 'boas-vindas/<tenantId>'`; (c) o INSERT acontece **antes** do envio | ❌ Wave 0 |
| SC1 | Segunda carga do dashboard não reenvia | unit | mesma suíte: `23505` no INSERT ⇒ `enviarEmail` **não** é chamado | ❌ Wave 0 |
| SC1 | Falha de envio libera a trava | unit | mesma suíte: `enviarEmail` devolvendo `{ ok:false }` ⇒ `UPDATE status='falhou'` | ❌ Wave 0 |
| SC1 | Trava real sob concorrência | **integração** | `EXIGIR_INTEGRACAO=1` — duas inserções concorrentes contra o Supabase local; exatamente uma sobrevive. É o único jeito de provar o índice parcial (o mock não tem constraint) | ❌ Wave 0 |
| **SC2 (metade que fecha aqui)** | `"<Estabelecimento> via VamoAgendar" <naoresponda@…>` | unit | `pnpm test src/lib/__tests__/email-remetente.test.ts` | ✅ existe |
| SC2 | `replyTo` ausente não bloqueia o envio (D-03) | unit | acrescentar caso a `src/lib/__tests__/email-enviar.test.ts`: sem `replyTo` o envio prossegue; sem `para` **ou** sem `assunto` continua devolvendo `config_ausente` | ✅ arquivo existe, caso novo |
| **SC3** | Assinatura inválida ⇒ 401 | unit | nova suíte do route handler: (a) sem headers ⇒ 401; (b) assinatura forjada ⇒ 401; (c) assinatura válida gerada com um segredo de teste ⇒ 200. O `Webhook` do standardwebhooks tem `sign()` público, então dá para produzir assinatura válida sem rede | ❌ Wave 0 |
| SC3 | `source_id: null` ⇒ 200 sem I/O | unit | mesma suíte | ❌ Wave 0 |
| SC3 | Cruzamento `source_id` → `tenant_id` e Issue sintética | unit | mesma suíte: `reportarFalhaSilenciosaAguardando` chamado com rótulo estático e `tenantHash`; e **nenhuma** chamada carrega `data.email` | ❌ Wave 0 |
| SC3 | 🔒 **Nunca-PII**: o endereço não vai a lugar nenhum | unit | asserção dedicada — serializar todos os argumentos de log/Sentry/insert e afirmar que a string do e-mail do payload não aparece em nenhum. É o teste que sustenta D-13 | ❌ Wave 0 |
| SC3 | Supressão real chega e é processada | **UAT humano** | owner suprime um endereço no painel do Resend e confere a Issue no Sentry | — |
| **SC4** | Chegada em Gmail / Outlook / domínio corporativo, com a aba registrada | **UAT humano** | Registrar destinatário, cliente e aba (Principal / Promoções / Spam) por caixa. **Dono: o owner.** Nenhum executor pode marcar | — |

### Taxa de amostragem

- **Por commit de tarefa:** `pnpm test`
- **Por merge de wave:** `pnpm test && pnpm lint && npx tsc --noEmit`
- **Portão da fase:** os quatro verdes + `pnpm build`, antes do `/gsd-verify-work`

### Lacunas da Wave 0

- [ ] `src/lib/__tests__/email-boas-vindas.test.ts` — SC1 (orquestração, idempotência, retentativa)
- [ ] `src/app/api/webhooks/__tests__/resend.test.ts` — SC3 (assinatura, `source_id` nulo, nunca-PII)
- [ ] Suíte de integração do índice parcial + entrada no `exclude` condicional de `vitest.config.ts`
  ⚠️ Hoje o `exclude` cita **um arquivo literal** (`const SUITE_INTEGRACAO = '…public-booking-escrita.test.ts'`)
  `[VERIFICADO: vitest.config.ts:11]`. Acrescentar uma segunda suíte exige generalizar para
  lista — e o script `test:integracao` do `package.json` também aponta para o arquivo único
  `[VERIFICADO: package.json scripts]`. Tarefa própria, não detalhe.
- [ ] Casos novos em `email-enviar.test.ts` para D-03

---

## Domínio de segurança

`security_enforcement: true`, `security_asvs_level: 1` `[VERIFICADO: .planning/config.json]`.

### Categorias ASVS aplicáveis

| Categoria | Aplica | Controle padrão nesta fase |
|-----------|--------|----------------------------|
| V2 Autenticação | sim (máquina) | Assinatura HMAC do webhook via `resend.webhooks.verify`; sem caminho permissivo — segredo ausente ⇒ o construtor do `Webhook` lança (`"Secret can't be empty."` `[VERIFICADO: standardwebhooks/dist/index.js:26-28]`), e em produção o boot já morreu antes por `src/lib/env.ts` |
| V3 Sessão | não | O webhook não tem sessão; a rota entra em `isPublicRoute` |
| V4 Controle de acesso | sim | RLS por `tenant_id` na tabela nova, policies granulares por ação; escrita reservada ao `service_role` |
| V5 Validação de entrada | sim | Payload validado **depois** da assinatura; `source_id` nulo tratado por guard clause; `origin` é união fechada |
| V6 Criptografia | sim | HMAC-SHA256 com `timingSafeEqual` — pronto no `standardwebhooks`; **nada à mão** |
| V7 Erros e logs | sim | Mensagem de Issue sintética estática; `erroSinteticoSupabase` para o banco; allowlist fechada de atributos; endereço nunca sai do processo |
| V8 Privacidade | sim | D-08 e D-13 — a tabela não guarda endereço; o payload traz e é descartado |

### Ameaças e mitigações (STRIDE)

| Padrão | STRIDE | Mitigação |
|--------|--------|-----------|
| Terceiro forjando `suppression.added` para poluir a auditoria de outro tenant | Spoofing / Tampering | Assinatura obrigatória; sem ela, 401 antes de qualquer I/O |
| Replay de um webhook legítimo capturado | Tampering | Tolerância de 300 s no timestamp assinado `[VERIFICADO: standardwebhooks/dist/index.js:7,86-100]`; o efeito é idempotente por natureza (registrar o mesmo estado duas vezes) |
| Enumerar tenants pela rota pública nova | Information Disclosure | A resposta é sempre `200`/`401` genérico; nada do banco atravessa o corpo da resposta |
| Endereço do cliente vazando para o Sentry / logs | Information Disclosure | Teste dedicado de nunca-PII (§Validação); allowlist fechada de atributos |
| Rota nova acidentalmente protegida pelo Clerk (ou o inverso) | DoS / Elevation | `/api/webhooks(.*)` **já** está em `isPublicRoute` `[VERIFICADO: src/proxy.ts:12]` — a rota nova é coberta automaticamente. Confirmar, não duplicar. |
| Tabela nova exposta na Data API | Elevation of Privilege | Nasce sem privilégio desde a Phase 1; o `GRANT` é explícito e mínimo |
| Fila do Sentry perdendo o evento quando o handler responde | (observabilidade) | Variantes **aguardadas** obrigatórias |

---

## Registro de suposições

| # | Afirmação | Seção | Risco se estiver errada |
|---|-----------|-------|--------------------------|
| A1 | Gmail não renderiza `<img>` SVG em e-mail | Armadilha 7 | Logo sumido no Gmail; PNG resolve nos dois casos, então o custo de assumir é zero |
| A2 | Gmail bloqueia data URI em `<img>` de e-mail | Hospedagem do logo | Só afeta a alternativa descartada |
| A3 | PNG RGBA transparente sobre faixa colorida pode render retângulo branco no Outlook desktop | Hospedagem do logo | Logo feio no Outlook; achatar sobre a cor é barato e elimina o risco |
| A4 | O Resend envia os headers com prefixo `svix-*` (e não `webhook-*`) | Exemplos de código | 401 em 100% das entregas. **Mitigação barata:** ler os dois prefixos, com `svix-*` primeiro. A doc do Resend mostra `svix-*` `[CITADO: resend.com/docs/webhooks/verify-webhooks-requests]`, mas o `standardwebhooks` internamente só olha `webhook-*` — o mapeamento é feito pelo SDK |
| A5 | `react-email` em `dependencies` não infla o bundle servido (só `node_modules`) | Stack padrão | Imagem Docker maior no Railway; não afeta correção |
| A6 | A descontinuação de `@react-email/components` é consolidação no `react-email`, não abandono do projeto | C-01 | Se fosse abandono, a decisão D-15 inteira precisaria ser revista. Evidência contra: `react-email@6.9.2` foi publicado hoje (2026-08-07) com 3,3 M downloads/semana, e a doc oficial de instalação já aponta para ele |
| A7 | `supabase db diff` emite corretamente índice único parcial | Exemplos de código | Precedente forte (`uq_assinatura_vigente_por_tenant` está no schema declarativo e o banco existe), mas não foi executado nesta sessão |

---

## Perguntas em aberto

1. **O `email_contato` deve ser exposto na Data API para `anon`?**
   - O que se sabe: `perfis_empresas` tem leitura pública **sanitizada** via
     `obterDadosBookingPublico`, e SEG-04 exige que coluna nova em tabela com leitura pública
     nasça sem acesso `anon`.
   - O que não está claro: nada — a resposta é **não**. Registrado aqui para que ninguém
     "conserte" isso depois. O e-mail do profissional não tem por que aparecer na página
     pública, e a coluna nasce fechada por padrão desde a Phase 1.

2. **A tabela nova precisa de policy de `UPDATE`, dado o Padrão 1?**
   - O que se sabe: a `disparos_whatsapp` é append-only e por isso só tem `SELECT` e `INSERT`
     para `authenticated` `[VERIFICADO: supabase/schemas/09_disparos_whatsapp.sql:22-28]`.
   - Recomendação: **não** dar `UPDATE` a `authenticated`. Toda a escrita da tabela nova
     acontece dentro do `after()` e do webhook, e nos dois o cliente é `createAdminClient()`
     (`service_role`, que ignora RLS). Para `authenticated`, só `SELECT` do próprio tenant.
     Isso mantém a tabela infraudável pelo cliente, no mesmo espírito da `assinaturas`.

3. **Teto do Free do Resend merece Issue própria?** (discricionariedade do owner)
   - O que se sabe: `daily_quota_exceeded` e `monthly_quota_exceeded` já mapeiam para
     `falha_transporte`, que vai ao Sentry `[VERIFICADO: src/lib/email/classificar.ts:60-61]`.
   - Recomendação: **não nesta fase.** Um e-mail por tenant novo está a ordens de grandeza do
     teto de 100/dia. Registrar em `docs/PENDENCIAS.md` como item a reavaliar na Phase 5, que
     é quando a conta muda (um e-mail por agendamento).

4. **Qual `tipo` de e-mail na tabela?** (nomes exatos são discricionariedade do Claude)
   - Recomendação: `CHECK (tipo IN ('boas_vindas'))` agora, com o comentário dizendo que as
     Phases 5 e 9 acrescentam à lista. Enum fechado que quebra o `CHECK` é melhor que `text`
     livre que aceita erro de digitação em silêncio.

---

## Fontes

### Primárias (confiança ALTA — lidas nesta sessão)
- `node_modules/resend/dist/index.d.mts` e `index.mjs` (6.17.2 instalado) — `Webhooks.verify`, `WebhookEvent`, `RESEND_ERROR_CODE_KEY`, `CreateEmailBaseOptions`, construtor que lança sem chave
- `cdn.jsdelivr.net/npm/resend@6.18.1/dist/index.d.mts` — `suppression.added`, `SuppressionAddedEvent`, `SuppressionEventData`
- `node_modules/.pnpm/standardwebhooks@1.0.0/…/dist/index.js` — algoritmo, tolerância, headers, erros
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md` — semântica de `after()` no Next 16
- `node_modules/@clerk/nextjs/dist/esm/server/{clerkClient,createClerkClient}.js` e `dist/types/server/index.d.ts`
- `node_modules/.pnpm/@clerk+backend@3.10.0_…/dist/api/resources/{Organization,User,EmailAddress,Verification}.d.ts`
- `cdn.jsdelivr.net/npm/@react-email/render@2.1.0/dist/node/index.d.mts` — assinatura de `render`, `Options`, `toPlainText`
- `cdn.jsdelivr.net/npm/react-email@6.9.2/{package.json,dist/index.d.mts}` — consolidação de componentes + render + CLI
- Repo: `src/lib/email/*`, `src/lib/observabilidade/*`, `src/app/actions/perfis-empresas.ts`,
  `src/app/api/webhooks/lembrete/route.ts`, `src/lib/qstash-assinatura.ts`, `src/proxy.ts`,
  `src/lib/env.ts`, `src/lib/analytics/server.ts`, `supabase/schemas/{01,08,09}*.sql`,
  `supabase/migrations/20260722183153*`, `docs/03-PADROES_DE_BANCO_DE_DADOS.md`,
  `vitest.config.ts`, `package.json`
- Registro npm via `npm view` — versões, deprecações, peer deps, árvores de dependência
- `gsd-tools query package-legitimacy check` — vereditos e sinais

### Secundárias (confiança MÉDIA)
- Context7 `/websites/resend` — payload de `suppression.added`, verificação de webhook, entregabilidade
- Context7 `/resend/react-email` — `render`, `toPlainText`
- `react.email/docs/getting-started/manual-setup` — comando de instalação atual

### Terciárias (confiança BAIXA — marcar antes de virar decisão)
- `suped.com` — sinais de classificação da aba Promoções do Gmail. Convergente com a doc do
  Resend, mas é análise de terceiro, não documentação do Google.

---

## Metadados

**Confiança por área:**
- Stack padrão: **ALTA** — versões, deprecações e árvores lidas no registro npm hoje; APIs conferidas nos tipos publicados
- Verificação de webhook: **ALTA** — implementação lida linha a linha no pacote instalado
- Idempotência / schema: **ALTA** — precedente literal no repo, mesma forma de índice
- `after()` no Next 16: **ALTA** para a API; **MÉDIA** para o comportamento exato de
  `clerkClient()` dentro do callback em contexto de Server Component (o fallback foi lido no
  fonte, mas não exercitado em runtime)
- Resolução do destinatário via Clerk: **ALTA** para os tipos; **MÉDIA** para a garantia de
  que `createdBy` vem sempre preenchido em organização criada pela UI do Clerk
- Entregabilidade: **MÉDIA** — a doc do Resend sustenta as afirmações; a parte de aba do Gmail
  é convergência de fontes de terceiro, e é por isso que SC4 é medição, não predição

**Data da pesquisa:** 2026-08-07
**Válido até:** 2026-09-06 (30 dias). ⚠️ **Exceção — 7 dias para `react-email`:** o pacote
publicou versão hoje e a família de componentes acabou de ser descontinuada; se o
planejamento desta fase levar mais de uma semana, reconferir `npm view react-email version`
e o estado de descontinuação antes de instalar.

---

*Fase: 04-canal-de-e-mail-transacional*
*Pesquisa concluída: 2026-08-07*
