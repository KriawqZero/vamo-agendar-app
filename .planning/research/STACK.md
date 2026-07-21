# Stack Research

**Domain:** SaaS B2B2C de agendamento (Brasil) — adições para o milestone de lançamento público
**Researched:** 2026-07-20
**Confidence:** HIGH (versões e endpoints verificados em registro npm e docs oficiais; 2 pontos marcados MEDIUM abaixo)

> **Escopo.** Este documento cobre **apenas o que entra de novo** neste milestone. A stack
> existente (Next.js 16.2.10, React 19.2.4, Tailwind v4, Clerk 7.x, `@supabase/ssr` 0.12,
> SQL puro, Evolution API, PostHog) está fechada e não é objeto de pesquisa. Prisma/Drizzle,
> better-auth e Mercado Pago continuam proibidos.

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Asaas API v3** (via `fetch` direto, **sem SDK**) | API v3 | Assinatura recorrente mensal do profissional | Não existe SDK oficial Node. Os pacotes npm são não-oficiais e abandonados: `asaas-sdk@1.2.7` (último release 2022), `asaas-node@0.0.8` (2022), `asaas@1.1.0` (2025, "unofficial"). Nenhum cobre `/v3/checkouts`. `fetch` direto é o padrão **já usado no projeto** para Evolution API e QStash — mesma forma, zero dependência nova, tipos escritos à mão só para os 4 payloads que importam |
| **`resend`** | `6.17.2` | E-mail transacional (boas-vindas, recibo, confirmação ao cliente final) | SDK oficial, `engines: node >=20`, API mínima (`resend.emails.send`), suporte nativo a componente React via prop `react:`, `idempotencyKey` no envio em lote. Já é a escolha registrada na stack oficial do projeto — a pesquisa confirma que continua correta e ativa (release de 2026-07-13) |
| **`@upstash/ratelimit`** | `2.0.8` | Rate limiting das Server Actions públicas | Algoritmos implementados em Lua no servidor Redis (atômicos, sem race entre instâncias); `ephemeralCache` em memória evita ida ao Redis para identificadores já bloqueados. **Mesmo fornecedor do QStash que já está na stack** — não é vendor novo, é outro produto na conta que já existe |
| **`@upstash/redis`** | `1.38.0` | Backend do rate limiter | Peer obrigatório do `@upstash/ratelimit` (`^1.34.3`). Cliente HTTP/REST, sem pool de conexão TCP para gerenciar |
| **`btree_gist`** (extensão Postgres) | nativa do Postgres do Supabase | Habilitar `EXCLUDE USING gist` combinando `tenant_id WITH =` e range `WITH &&` | Única forma de impedir sobreposição **no nível de armazenamento**, imune a race condition entre requisições concorrentes. A engine em `booking-engine.ts` revalida antes do INSERT, mas revalidação em application code tem janela; o índice GiST não tem |
| **`@upstash/qstash`** | `2.11.2` | Trocar o `?secret=` do webhook de lembrete por verificação de assinatura real | Já existe integração QStash por `fetch`; o SDK entra **só** pelo `Receiver` / `verifySignatureAppRouter`, que faz HMAC do corpo + URL. Escrever isso à mão é reimplementar cripto sem motivo |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@react-email/components` | `1.0.12` | Componentes de e-mail (`Html`, `Button`, `Section`) que renderizam para HTML compatível com Outlook/Gmail | Nos 3 templates transacionais. Peer `react: ^18 \|\| ^19` — compatível com o React 19.2.4 do projeto |
| `@react-email/render` | `2.1.0` | Renderiza o componente React para HTML | **Peer opcional do `resend`** — obrigatório se usar a prop `react:` em `emails.send()`. Se não instalar, a prop falha em runtime |
| `react-email` | `6.9.0` | Servidor de preview local (`email dev`) dos templates | **devDependency**. Permite iterar no template sem enviar e-mail de verdade e queimar cota do free tier |

**Nenhuma lib para honeypot.** É um campo `<input>` escondido + comparação de tempo decorrido entre render e submit dentro da própria action. Adicionar dependência para isso seria complexidade sem retorno — e a regra de Fricção Zero já exclui CAPTCHA.

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `react-email` preview (`pnpm exec email dev`) | Ver os templates no browser sem enviar | Aponte para o diretório dos templates; roda em porta própria |
| Asaas Sandbox (`https://api-sandbox.asaas.com/v3`) | Construir todo o checkout sem conta de produção aprovada | Chaves de sandbox começam com `$aact_hmlg_`, produção com `$aact_prod_`. **Use esse prefixo para um guard no boot**: se `ASAAS_API_KEY` começar com `$aact_prod_` e a base URL for a de sandbox (ou vice-versa), falhe alto na inicialização. Isso elimina a classe inteira de bug "cobrei de verdade achando que era teste" |
| Cartões de teste do sandbox | Simular sucesso/recusa de cartão | `4444 4444 4444 4444` (aprova), `5184 0197 4037 3151` (recusa) |
| `supabase db diff` | Gerar a migration da exclusion constraint | `CREATE EXTENSION` é uma das exceções do fluxo declarativo — registre em `docs/SUPABASE_DECLARATIVE-DATABASE-SCHEMA.md` |

## Installation

```bash
# Core
pnpm add resend @upstash/ratelimit @upstash/redis @upstash/qstash

# Templates de e-mail
pnpm add @react-email/components @react-email/render

# Dev (preview de templates)
pnpm add -D react-email
```

Asaas não instala nada.

**Novas variáveis de ambiente:**

| Var | Origem |
|-----|--------|
| `ASAAS_API_KEY` | Painel Asaas (sandbox: `$aact_hmlg_…`) |
| `ASAAS_API_URL` | `https://api-sandbox.asaas.com/v3` → `https://api.asaas.com/v3` na virada |
| `ASAAS_WEBHOOK_TOKEN` | Retornado **uma única vez** no `POST /v3/webhooks` — guarde na hora |
| `RESEND_API_KEY` | Painel Resend |
| `EMAIL_FROM` | `VamoAgendar <nao-responda@mail.vamoagendar.com.br>` |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Console Upstash (mesma conta do QStash) |
| `QSTASH_NEXT_SIGNING_KEY` | Console QStash — **falta hoje**; o `Receiver` exige current **e** next |

---

## Detalhamento por integração

### 1. Asaas — assinatura recorrente

**Autenticação (verificado — docs oficiais):**

```
Content-Type: application/json
User-Agent: vamoagendar            # obrigatório para contas raiz criadas após 13/06/2024
access_token: $aact_hmlg_...       # NÃO é Authorization: Bearer
```

O header ser `access_token` e não `Authorization: Bearer` é a pegadinha número um da integração — vários exemplos de terceiros na web erram isso.

**Fluxo recomendado para autoatendimento (checkout hospedado):**

1. `POST /v3/customers` — `{ name, cpfCnpj, email, externalReference: orgId }`. Guarde o `cus_…` retornado em `assinaturas`. Fazer isso antes do checkout mantém **você** dono do mapeamento tenant ↔ customer, em vez de depender de reconciliação por CPF depois.
2. `POST /v3/checkouts` — retorna `{ id, link }`. Redirecione o profissional para `link`.

```json
{
  "billingTypes": ["CREDIT_CARD"],
  "chargeTypes": ["RECURRENT"],
  "minutesToExpire": 30,
  "callback": {
    "successUrl": "https://vamoagendar.com.br/dashboard/assinatura?status=sucesso",
    "cancelUrl":  "https://vamoagendar.com.br/dashboard/assinatura?status=cancelado",
    "expiredUrl": "https://vamoagendar.com.br/dashboard/assinatura?status=expirado"
  },
  "items": [{ "name": "VamoAgendar Pro", "description": "Assinatura mensal", "quantity": 1, "value": 39.90 }],
  "subscription": { "cycle": "MONTHLY", "nextDueDate": "2026-08-20 00:00:00" }
}
```

**Por que Checkout e não cobrança direta com cartão:** `POST /v3/payments` com `creditCard: { number, ccv, … }` faz o número do cartão trafegar pelo seu servidor — isso te coloca em escopo PCI e é responsabilidade que um produto de R$ 39,90/mês não deve carregar. O Checkout hospeda a página no Asaas: você nunca vê o cartão. `POST /v3/subscriptions` direto continua útil **depois**, quando já existir `creditCardToken` do cliente (troca de plano, reativação).

⚠️ **Verificar na implementação (MEDIUM confidence):** a doc do `/v3/checkouts` exibe `customerData` inline no payload; não ficou confirmado se ele também aceita um `customer` (`cus_…`) já existente. Se aceitar, use — é o caminho limpo. Se não aceitar, correlacione pelo webhook (o payload da cobrança traz o `customer`) e faça o passo 1 apenas como registro local.

**Alternativa descartada:** `POST /v3/paymentLinks` com `chargeType: RECURRENT` gera um link estático reutilizável — mais simples, mas é o **mesmo** link para todos os tenants, sem `externalReference` por sessão. Você perderia a correlação automática de quem pagou. Só faz sentido se o volume for tão baixo que a conciliação manual seja aceitável.

**Webhooks (verificado):**

- `POST /v3/webhooks` com `{ name, url, email, enabled, sendType: "SEQUENTIALLY", authToken, events: [...] }`.
- Se você **omitir** `authToken`, o Asaas gera um token forte e o devolve **só uma vez** no corpo da resposta. Há validação de complexidade: token curto, com sequência numérica, 4 letras repetidas, ou que seja uma API key Asaas é rejeitado.
- O token volta em toda chamada no header **`asaas-access-token`**. Compare com o valor guardado — em tempo constante — antes de qualquer coisa.
- Máximo de **10 webhooks ativos** por conta.
- `sendType: SEQUENTIALLY` significa **fila que trava**: se o seu endpoint não responder 2xx, o Asaas para a fila inteira e ela precisa ser destravada. Consequência de projeto: **responda 200 primeiro, processe depois** (`after()` do `next/server`, que o projeto já usa em analytics) e faça o handler idempotente por `payment.id`.

Eventos mínimos: `PAYMENT_CONFIRMED` e `PAYMENT_RECEIVED` (liberar Pro), `PAYMENT_OVERDUE` (aplicar a regra de inadimplência que já existe), `PAYMENT_REFUNDED` e `PAYMENT_DELETED` (revogar).

---

### 2. Resend — e-mail transacional

**Cotas do free tier (verificado em `resend.com/docs/knowledge-base/account-quotas-and-limits`):**

| Limite | Valor |
|--------|-------|
| Envios | 100/dia, 3.000/mês (enviados **e** recebidos contam) |
| Destinatários | To/CC/BCC contam como e-mails separados |
| API | 10 requisições/segundo |
| Domínios | 1 |
| Bounce rate | precisa ficar **< 4%** |
| Spam rate | precisa ficar **< 0,08%** |

100/dia é folgado para o cenário de lançamento (dezenas de profissionais), mas cada agendamento gera 1 e-mail ao cliente final — o teto vira real se um único tenant tiver um dia movimentado. Instrumente a contagem desde o primeiro dia.

**Domínio (bloqueia envio — tarefa de DNS do owner):**

- Registros: **SPF (TXT)** + **DKIM** (chave de 1024 bits) + **MX** (o MX é para receber feedback de bounce e reclamação — não é opcional).
- A Resend **recomenda explicitamente subdomínio**, não domínio raiz: `mail.vamoagendar.com.br`. Isola a reputação de envio; se algo der errado na entregabilidade transacional, o domínio principal não é arrastado junto.
- **DMARC**: a doc lista os parâmetros mas não obriga. Configure mesmo assim (`p=none` no começo) — Gmail e Yahoo exigem DMARC de remetentes em volume desde 2024, e domínio novo sem DMARC começa com desvantagem.
- Domínio novo = reputação zero. Os 3 e-mails do escopo são todos transacionais solicitados pelo usuário (melhor tipo de tráfego inicial). Não misture nada de marketing nesse subdomínio.

**Uso (verificado — docs oficiais):**

```ts
import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY);

const { data, error } = await resend.emails.send({
  from: process.env.EMAIL_FROM,
  to: [email],
  subject: 'Seu agendamento está confirmado',
  react: ConfirmacaoAgendamento({ cliente, empresa, dataHora }),
});
```

O SDK **retorna** `{ data, error }` em vez de lançar — trate `error` explicitamente, senão a falha some.

**Padrões a seguir no projeto:**

- Envie dentro de `after()` do `next/server`. A confirmação do agendamento não pode esperar a Resend, exatamente como o WhatsApp já falha silenciosamente hoje. Fricção Zero.
- No handler do webhook Asaas (que o Asaas **reenvia**), use `idempotencyKey` para não mandar dois recibos.
- **Não use `onboarding@resend.dev` fora de teste** — é o remetente compartilhado de demonstração.

Nota: `resend@6.17.2` já traz `standardwebhooks` como dependência — se um dia consumir webhooks *da* Resend (bounce, complaint), a verificação já vem pronta.

---

### 3. Rate limiting

**Recomendação: `@upstash/ratelimit` + `@upstash/redis` (Upstash Redis hospedado).**

**O Redis do Railway não serve para isso.** `@upstash/redis` fala **HTTP/REST**; o Redis do Railway é Redis TCP padrão. Não são intercambiáveis, e `@upstash/ratelimit@2.0.8` declara `peerDependencies: { "@upstash/redis": "^1.34.3" }` — ele espera aquela interface específica. Tentar plugar `ioredis` ali é caminho de gambiarra (o contorno conhecido da comunidade é subir um proxy `serverless-redis-http` na frente, ou seja: mais infra para economizar zero).

O argumento decisivo a favor do Upstash é que **não é vendor novo**: a conta Upstash já existe por causa do QStash. Mesma conta, mesmo console, mesma fatura, uma variável de ambiente a mais. Free tier de **500K comandos/mês e 256MB** — cada `limit()` custa ~1 comando (script Lua); volume de lançamento nem arranha isso.

**Algoritmos disponíveis:** `fixedWindow`, `slidingWindow`, `tokenBucket`, `cachedFixedWindow`. Use **`slidingWindow`** — `fixedWindow` permite o dobro do limite na virada da janela (burst na fronteira), que é exatamente o buraco que um script explorando a agenda encontraria.

**Uso em Server Action do Next.js 16.** Não existe objeto `request` dentro de uma Server Action — o IP vem dos headers:

```ts
'use server';
import { headers } from 'next/headers';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const cache = new Map(); // fora do handler — módulo top-level

const limiter = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, '10 m'),
  ephemeralCache: cache,
  analytics: true,
  prefix: 'booking',
});

export async function criarAgendamentoPublico(/* … */) {
  const h = await headers();                                   // async no Next 16
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'desconhecido';
  const { success } = await limiter.limit(`${slug}:${ip}`);
  if (!success) return { erro: 'Muitas tentativas. Tente novamente em alguns minutos.' };
  // …
}
```

Detalhes que importam:

- `ephemeralCache` **precisa** ser criado no escopo do módulo, nunca dentro do handler.
- O Railway roda a app atrás de proxy, então `x-forwarded-for` chega preenchido — pegue **o primeiro** IP da lista (os seguintes são os proxies).
- Chaveie por `slug + ip`, não só por IP: NAT compartilhado (salão com WiFi, operadora móvel) faria vários clientes legítimos colidirem em um limite global.
- Aplique um limiter **separado e mais estrito** aos envios de e-mail — a cota da Resend é o recurso escasso, e ela tem custo real por abuso.
- Habilite `analytics: true`: sem visibilidade você não sabe se o limite está apertado demais e derrubando cliente legítimo (que é o risco de negócio, não o script).

**Alternativa (documentada, não recomendada agora):** `rate-limiter-flexible@11.2.0` + `ioredis@5.11.1` contra o Redis do Railway. Como o deploy é um processo Node longevo (não function serverless), TCP é tecnicamente viável e até mais rápido — e reaproveita infra já provisionada. Faz sentido **se** o Redis do Railway já estiver sendo pago e usado, ou se a cota Upstash apertar. Hoje o `INTEGRATIONS.md` registra "Caching: None", ou seja, esse Redis está provisionado e ocioso: a decisão honesta é escolher um dos dois e **desprovisionar o outro**, não manter os dois.

**Bônus da mesma família — corrigir o webhook de lembrete.** Hoje ele compara `?secret=` contra `QSTASH_CURRENT_SIGNING_KEY` com fallback `'secret-key'`. O correto é assinatura HMAC de corpo + URL:

```ts
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
export const POST = verifySignatureAppRouter(async (req) => { /* … */ });
```

Exige `QSTASH_CURRENT_SIGNING_KEY` **e** `QSTASH_NEXT_SIGNING_KEY` (a segunda não existe hoje no ambiente — a rotação de chave do Upstash depende dela). Para controle fino do erro, use `new Receiver({ currentSigningKey, nextSigningKey }).verify({ signature, body, url })` manualmente.

---

### 4. Postgres — proteção atômica contra sobreposição

**A tabela atual não comporta a constraint como está.** `supabase/schemas/07_agendamentos.sql` guarda só `data_hora`; a duração vive em `servicos`. Uma exclusion constraint precisa de um **intervalo**, e o fim do intervalo tem que estar materializado na própria linha.

**Passo 1 — nova coluna de fim.** Adicione `data_hora_fim timestamptz NOT NULL`, preenchida pela action a partir da duração do serviço no momento da reserva. Isso não é só requisito técnico: é **mais correto de negócio**. Hoje, se o profissional editar a duração de um serviço, os agendamentos passados mudam de tamanho retroativamente. Congelar a duração no ato da reserva conserta isso de graça. (Guardar também `duracao_minutos` é redundante mas facilita relatório — opcional.)

**Passo 2 — extensão e coluna de range:**

```sql
create extension if not exists btree_gist with schema extensions;

alter table agendamentos
  add column periodo tstzrange
  generated always as (tstzrange(data_hora, data_hora_fim, '[)')) stored;
```

⚠️ **Não tente calcular o fim dentro da expressão gerada.** `data_hora + (duracao * interval '1 minute')` **falha** com `generation expression is not immutable`. O operador `timestamptz + interval` é marcado **STABLE**, não IMMUTABLE, porque somar `1 day` pode dar 23, 24 ou 25 horas dependendo do fuso e do horário de verão — e o Postgres não tem como saber que o seu intervalo só tem minutos. Isso vale igualmente para expressão direta dentro do `EXCLUDE` (índices exigem imutabilidade também). O construtor `tstzrange(timestamptz, timestamptz, text)` **é** imutável, então a versão com duas colunas passa. *(MEDIUM-HIGH confidence na imutabilidade do construtor — se a migration reclamar, o plano B é uma trigger `BEFORE INSERT OR UPDATE` preenchendo `periodo`, que funciona em qualquer caso.)*

**Passo 3 — a constraint:**

```sql
alter table agendamentos
  add constraint agendamentos_sem_sobreposicao
  exclude using gist (tenant_id with =, periodo with &&)
  where (status <> 'cancelado');
```

`btree_gist` é o que permite `tenant_id WITH =` (tipo B-tree) conviver com `periodo WITH &&` (range GiST) no mesmo índice. O `WHERE` parcial é essencial: sem ele, um agendamento cancelado continuaria bloqueando o horário para sempre. `'[)'` (fim aberto) faz 10:00–11:00 e 11:00–12:00 **não** colidirem.

**Ordem de execução (isso vai morder):**

- Exclusion constraint **não aceita `NOT VALID`** — esse modificador só existe para `CHECK` e `FOREIGN KEY`. Ou seja: **os dados precisam estar limpos antes**. Rode uma query de detecção de sobreposições existentes e resolva antes de tentar criar a constraint, senão o `ALTER TABLE` simplesmente falha.
- O backfill de `data_hora_fim` nas linhas existentes tem que vir antes do `NOT NULL`.
- A criação pega `ACCESS EXCLUSIVE` enquanto constrói o índice GiST. Com a base atual (pré-lançamento) é instantâneo; é só não repetir esse padrão daqui a um ano sem pensar.

**Interação com RLS (ponto forte, não problema):** a constraint é aplicada pelo índice, **independente de RLS**. Uma linha que a role `anon` não enxerga ainda assim bloqueia o INSERT. Isso é exatamente o que você quer quando o `SELECT` público de `agendamentos` (hoje `USING (true)` para todo mundo) for restringido por GRANT de coluna: a defesa contra double-booking não enfraquece junto. O efeito colateral teórico é vazamento de existência via mensagem de erro — irrelevante aqui, porque a constraint é escopada por `tenant_id` e o cliente já sabe que o horário está ocupado (a UI mostra a grade).

**Tratamento do erro na action:** a violação vem como **SQLSTATE `23P01`** (`exclusion_violation`). O `supabase-js` entrega em `error.code`. Trate especificamente e devolva "esse horário acabou de ser reservado, escolha outro" — nunca deixe vazar erro cru do Postgres para o cliente final.

```ts
if (error?.code === '23P01') return { erro: 'Esse horário acabou de ser reservado. Escolha outro.' };
```

**Fluxo de migration:** `CREATE EXTENSION` é uma das exceções conhecidas do schema declarativo (o `db diff` não lida bem com extensões). Registre em `docs/SUPABASE_DECLARATIVE-DATABASE-SCHEMA.md` junto com as exceções já documentadas.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Asaas via `fetch` direto | `asaas@1.1.0` (não-oficial) | Nunca neste projeto. Sem cobertura de `/v3/checkouts`, mantenedor único, e você herdaria bugs de auth de terceiro numa integração de dinheiro |
| Asaas Checkout (`/v3/checkouts`) | `/v3/payments` com `creditCard` inline | Só se um dia precisar de UX de cartão totalmente dentro do produto — e aí o custo é escopo PCI |
| Asaas Checkout | `/v3/paymentLinks` (link estático) | Se o volume for tão baixo que conciliar pagamento com tenant na mão seja aceitável. Não escala além de dezenas |
| `@upstash/ratelimit` + Upstash Redis | `rate-limiter-flexible` + `ioredis` no Redis do Railway | Se o Redis do Railway já for pago e usado para outra coisa, ou se 500K comandos/mês apertar. Deploy é processo longevo, então TCP funciona bem |
| `@upstash/ratelimit` | Rate limit em tabela Postgres | Só se a decisão for **zero** serviços externos. Custa write no Supabase Free (o recurso mais escasso) a cada requisição — troca ruim |
| Resend + React Email | Templates em string HTML | Se forem 1–2 e-mails muito simples e você quiser evitar 3 dependências. Com 3+ templates e necessidade de compatibilidade Outlook, React Email paga o custo |
| `EXCLUDE USING gist` | `SELECT … FOR UPDATE` + revalidação na action | Nunca como única defesa. Serializar por lock exige lockar a linha certa (que não existe — o conflito é sobre um horário, não uma linha) e reintroduz o problema que a constraint resolve por construção |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `Authorization: Bearer` no Asaas | Não é o header do Asaas — retorna 401. Erro comum em exemplos de terceiros | Header `access_token` + `User-Agent` obrigatório |
| Omitir `User-Agent` nas chamadas Asaas | Obrigatório para contas raiz criadas a partir de 13/06/2024 | `User-Agent: vamoagendar` |
| Confiar no `successUrl` do checkout para liberar o Pro | É um redirect no browser — o usuário pode forjar a URL, e o pagamento pode falhar depois do redirect | Liberar **só** no webhook `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED`. O `successUrl` serve apenas para mostrar "estamos confirmando…" |
| Processar o webhook Asaas antes de responder 200 | `sendType: SEQUENTIALLY` trava a fila inteira em qualquer falha ou timeout | Responder 200, processar em `after()`, handler idempotente por `payment.id` |
| `?secret=` em query string (padrão atual do webhook de lembrete) | Vaza em log de proxy/CDN, não prova origem, e o fallback `'secret-key'` transforma env ausente em endpoint aberto | `verifySignatureAppRouter` do `@upstash/qstash` |
| `nodemailer` + SMTP, SendGrid, Mailgun | SMTP em runtime serverless/edge é frágil; SendGrid e Mailgun exigem verificação de conta e têm free tier pior. Resend já é a decisão registrada do projeto | `resend` |
| `onboarding@resend.dev` como remetente em produção | Domínio compartilhado de demonstração | Subdomínio próprio verificado |
| Domínio raiz `vamoagendar.com.br` como remetente | A própria Resend recomenda subdomínio para isolar reputação | `mail.vamoagendar.com.br` |
| `ioredis` direto no `@upstash/ratelimit` | `@upstash/redis` é HTTP/REST; o Redis do Railway é TCP. Interfaces incompatíveis | Upstash Redis, ou `rate-limiter-flexible` se for para usar o Railway |
| `Ratelimit.fixedWindow` na action pública | Permite o dobro do limite na virada da janela | `Ratelimit.slidingWindow` |
| `data_hora + interval` em coluna gerada ou índice | `timestamptz + interval` é STABLE (DST), não IMMUTABLE → Postgres recusa | Coluna `data_hora_fim` explícita + `tstzrange(a, b, '[)')` |
| `EXCLUDE` sem `WHERE (status <> 'cancelado')` | Agendamento cancelado bloquearia o horário permanentemente | Constraint parcial |
| CAPTCHA / OTP / verificação de e-mail no booking público | Viola Fricção Zero, que é regra de produto inegociável | Rate limit + honeypot invisível |

## Stack Patterns by Variant

**Se a conta Asaas ainda não passou na verificação de produção (situação de hoje):**
- Construa tudo contra `https://api-sandbox.asaas.com/v3` com chave `$aact_hmlg_`
- A virada é trocar duas env vars — **desde que** o guard de prefixo de chave exista desde o começo
- Recrie o webhook no ambiente de produção (webhooks são por conta/ambiente, não migram)

**Se o DNS do Resend ainda não propagou:**
- Escreva os 3 templates e teste com `react-email` local + envio para o próprio e-mail via `onboarding@resend.dev`
- Deixe o disparo atrás de um guard de env (`if (!process.env.RESEND_API_KEY) return`), exatamente como o PostHog já faz — **não-op silencioso sem credencial** é padrão estabelecido do projeto
- Isso descola o trabalho de código do prazo de DNS, que é do owner

**Se a decisão for não pagar Redis nenhum:**
- Upstash Redis free (500K cmd/mês) cobre o lançamento com folga e não pede cartão
- Desprovisione o Redis ocioso do Railway em vez de mantê-lo por inércia

**Quando o e-mail passar de 100/dia (free tier da Resend):**
- Primeiro corte: e-mail ao cliente final só quando ele **informar** e-mail (a regra "e-mail OU WhatsApp" já cria essa opcionalidade naturalmente)
- Depois: plano pago da Resend, que é linear e barato no volume relevante

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `resend@6.17.2` | Node `>=20` | Confirme a versão do Node no Railway — o repo **não tem `.nvmrc`** e `@types/node` está em `^20`. Pinar Node ≥20 é pré-requisito |
| `resend@6.17.2` | `@react-email/render@2.1.0` | Peer **opcional**; obrigatório para a prop `react:`. Sem ele o envio quebra em runtime, não em build |
| `@react-email/components@1.0.12` | `react@19.2.4` | Peer `^18.0 \|\| ^19.0` — compatível |
| `react-email@6.9.0` | `react@19` / `react-dom@19` | Só devDependency; não entra no bundle |
| `@upstash/ratelimit@2.0.8` | `@upstash/redis@^1.34.3` | `1.38.0` satisfaz. Não substitua por outro cliente Redis |
| `@upstash/qstash@2.11.2` | Next.js 16 App Router | `verifySignatureAppRouter` de `@upstash/qstash/nextjs` retorna handler de Route Handler; exige `QSTASH_NEXT_SIGNING_KEY` além do current |
| `btree_gist` | Postgres do Supabase | Instale com `with schema extensions` (padrão Supabase). A própria Supabase documenta o padrão de exclusion constraint com range columns |
| Coluna gerada `tstzrange` | Postgres 12+ | Supabase está bem acima. Fallback: trigger `BEFORE INSERT OR UPDATE` |

---

## Sources

| Fonte | O que foi verificado | Confiança |
|-------|----------------------|-----------|
| Registro npm (`npm view`) | Versões exatas: `resend@6.17.2`, `@upstash/ratelimit@2.0.8`, `@upstash/redis@1.38.0`, `@upstash/qstash@2.11.2`, `@react-email/components@1.0.12`, `@react-email/render@2.1.0`, `react-email@6.9.0`, `rate-limiter-flexible@11.2.0`, `ioredis@5.11.1`; peers e `engines`; inexistência de SDK Asaas oficial | HIGH |
| Context7 `/llmstxt/asaas_llms_txt` (docs.asaas.com) | Header `access_token` + `User-Agent`; base URLs sandbox/produção e prefixos de chave; `POST /v3/customers`, `/v3/subscriptions`, `/v3/checkouts`; payload de checkout recorrente; lista de eventos de webhook; `POST /v3/webhooks`; limite de 10 webhooks; recomendação de idempotência | HIGH |
| Context7 `/websites/resend` | Envio com prop `react:`, uso em App Router, `idempotencyKey` em batch | HIGH |
| `resend.com/docs/knowledge-base/account-quotas-and-limits` | 100/dia, 3.000/mês, 10 req/s, bounce <4%, spam <0,08% | HIGH |
| `resend.com/docs/dashboard/domains/introduction` | SPF + DKIM (1024 bits) + MX; recomendação explícita de subdomínio | HIGH |
| Context7 `/websites/upstash_redis_sdks_ratelimit-` | Algoritmos disponíveis, `ephemeralCache` fora do handler, `analytics`, natureza HTTP-only | HIGH |
| Context7 `/websites/upstash_qstash` | `Receiver` e `verifySignatureAppRouter`, exigência de current + next signing key | HIGH |
| `upstash.com/pricing/redis` (via busca) | Free tier: 256MB, 500K comandos/mês | MEDIUM-HIGH |
| `supabase.com/blog/range-columns` | Recomendação de `tstzrange` e sintaxe `exclude using gist (x with =, range with &&)`; necessidade de `btree_gist` | HIGH |
| `postgresql.org` (thread "Why timestamptz_pl_interval … are not immutable?") | `timestamptz + interval` é STABLE por causa de DST — não pode entrar em coluna gerada nem índice | HIGH |
| `node_modules/next/dist/docs/` (16.2.10) | Guias de Server Actions / Data Security / BFF apontam rate limiting como responsabilidade da app; ausência de objeto `request` em Server Action | HIGH |
| Docs Asaas via busca (`asaas-access-token`) | Nome exato do header do webhook, autogeração e exibição única do `authToken`, validação de complexidade | HIGH |

**Lacunas assumidas:**

1. `/v3/checkouts` aceita `customer` (`cus_…`) existente ou só `customerData`? — resolver no primeiro request contra o sandbox (5 minutos), não vale mais pesquisa.
2. Imutabilidade do construtor `tstzrange` na coluna gerada — confirma-se na primeira migration; plano B (trigger) já definido.
3. Cotas exatas do Upstash Redis podem ter mudado desde a última atualização da página de preços; o volume de lançamento está uma ordem de grandeza abaixo do teto de qualquer forma.

---
*Stack research for: adições do milestone de lançamento público (Asaas, Resend, rate limiting, integridade de agenda)*
*Researched: 2026-07-20*
