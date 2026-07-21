# Architecture Research

**Domínio:** SaaS B2B2C de agendamento (Next.js 16 App Router + Server Actions + Supabase RLS multi-tenant) — adições do milestone de lançamento público
**Pesquisado:** 2026-07-20
**Confiança:** ALTA na parte que vem do código e das docs locais do Next 16; MÉDIA na parte Asaas/Resend/QStash (docs de fornecedor lidas via web)

> Este documento **não** redescreve a arquitetura existente (`.planning/codebase/ARCHITECTURE.md`).
> Ele responde: onde encaixar billing recorrente, preço travado por tenant, e-mail transacional
> e hardening de acesso anônimo **sem violar** as três invariantes já estabelecidas —
> mutações só em Server Actions, REST só para webhooks de terceiros, SQL puro sem ORM.

---

## Descoberta que muda o desenho (verificada no código)

**Nenhum componente do browser fala com o Supabase.** Existem apenas `src/lib/supabase/server.ts`
e `src/lib/supabase/admin.ts`; não há `createBrowserClient` em lugar algum, e todas as
importações em `.tsx` estão em `page.tsx`/`layout.tsx` (Server Components). O fluxo B2C usa a
role `anon` **apenas porque `createClient()` omite o header `Authorization` quando não há
sessão** — não porque algum código público precise dela.

Consequência arquitetural: **o raio de alcance da publishable key é exatamente a superfície de
GRANT da role `anon`**, e essa superfície pode ser reduzida sem tocar uma linha de frontend.
Isso torna o hardening (item 4) uma fase de baixo risco e alto retorno, e é a razão de ele vir
antes de tudo na ordem de construção.

---

## Visão do sistema com as adições

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        Next.js 16 App Router (Railway)                    │
├────────────────┬─────────────────────┬───────────────────────────────────┤
│  Booking B2C   │  Dashboard B2B      │  Rotas de webhook (REST)          │
│  /book/[slug]  │  /dashboard/plano   │  /api/webhooks/{lembrete,asaas}   │
└───────┬────────┴──────────┬──────────┴──────────────┬────────────────────┘
        │                   │                          │
        ▼                   ▼                          ▼
┌──────────────────────────────────────┐   ┌───────────────────────────────┐
│ Server Actions  src/app/actions/     │   │ Route Handlers                │
│  public-booking.ts  (+ rate limit)   │   │  asaas/route.ts   (NOVO)      │
│  assinatura.ts      (NOVO)           │   │  lembrete/route.ts (assinatura│
│                                      │   │   QStash real)                │
└───────┬──────────────────────────────┘   └──────────┬────────────────────┘
        │                                              │
        ▼                                              ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ Domínio puro e integrações  src/lib/                                      │
│  booking-engine.ts  planos.ts  precos.ts (NOVO)                           │
│  assinaturas.ts (+ redutor de eventos)                                    │
│  asaas/client.ts (NOVO)   email/{cliente,templates}.ts (NOVO)             │
│  notificacoes-agendamento.ts   notificacoes-billing.ts (NOVO)             │
└───────┬──────────────────────────────────────────┬───────────────────────┘
        │                                           │
        ▼                                           ▼
┌───────────────────────────────┐      ┌──────────────────────────────────┐
│ Supabase (Postgres + RLS)     │      │ Externos                          │
│  RLS  → leitura anon mínima   │      │  Asaas (sandbox → prod)           │
│  admin → toda escrita pública │      │  Resend  Evolution  QStash        │
│  perfis_cobranca (NOVO)       │      │  PostHog                          │
│  eventos_asaas  (NOVO)        │      │                                   │
└───────────────────────────────┘      └──────────────────────────────────┘
```

### Responsabilidades dos componentes novos

| Componente | Responsabilidade | Fala com |
|---|---|---|
| `src/lib/asaas/client.ts` | Wrapper HTTP puro sobre a API Asaas (`criarCliente`, `criarAssinatura`, `obterAssinatura`, `cancelarAssinatura`). Sem Supabase, sem `auth()`. Espelha `whatsapp-helper.ts`. | `fetch` → Asaas |
| `src/app/actions/assinatura.ts` | Server Action B2B: valida `orgId`, resolve preço, garante `asaas_customer_id`, cria a subscription, redireciona para a fatura/checkout. | `auth()`, `perfis_cobranca`, `asaas/client` |
| `src/app/api/webhooks/asaas/route.ts` | Única porta de escrita em `assinaturas`. Valida `asaas-access-token`, grava o evento (idempotência), aplica a transição, responde 2xx rápido. | `admin client`, `assinaturas.ts` |
| `src/lib/precos.ts` | Funções puras: `resolverPrecoPro`, `calcularSeloDesconto`, `dentroDaJanelaFundador`. Zero I/O, 100% vitest. | nada |
| `src/lib/email/cliente.ts` | Instância Resend lazy, **no-op sem `RESEND_API_KEY`** (mesmo contrato do PostHog). | Resend |
| `src/lib/email/templates.ts` | Funções puras `(dados) => { assunto, html, texto }`. | nada |
| `src/lib/notificacoes-billing.ts` | Camada de efeito de e-mail (boas-vindas, recibo). **Nunca lança.** Espelha `notificacoes-agendamento.ts`. | `email/*`, Supabase |
| `perfis_cobranca` (tabela) | Propriedades de cobrança **do tenant**, não da assinatura: `asaas_customer_id`, `preco_travado`, `fundador_em`. Sobrevive a cancelar/reassinar. | — |
| `eventos_asaas` (tabela) | Log append-only com PK = id do evento do Asaas. É o mecanismo de idempotência **e** o material de replay. | — |

---

## Estrutura de arquivos recomendada

```
src/
├── app/
│   ├── actions/
│   │   ├── assinatura.ts            # NOVO — checkout, cancelamento (B2B, orgId validado)
│   │   └── public-booking.ts        # ALTERADO — rate limit + honeypot + after()
│   └── api/webhooks/
│       ├── asaas/route.ts           # NOVO — única escrita em `assinaturas`
│       └── lembrete/route.ts        # ALTERADO — verifySignatureAppRouter
├── lib/
│   ├── asaas/
│   │   ├── client.ts                # HTTP puro
│   │   └── eventos.ts               # redutor puro: (evento, estadoAtual) => transição
│   ├── email/
│   │   ├── cliente.ts               # Resend lazy / no-op
│   │   └── templates.ts             # funções puras de conteúdo
│   ├── precos.ts                    # NOVO — preço fundador, selo derivado
│   ├── notificacoes-billing.ts      # NOVO — efeito de e-mail, nunca lança
│   ├── rate-limit.ts                # NOVO — RPC atômica no Postgres
│   └── __tests__/                   # precos, asaas/eventos, email/templates
└── supabase/schemas/
    ├── 08_assinaturas.sql           # ALTERADO — status 'pendente', evento_aplicado_em
    ├── 10_perfis_cobranca.sql       # NOVO
    ├── 11_eventos_asaas.sql         # NOVO
    └── 12_grants_publicos.sql       # NOVO — REVOKE/GRANT por coluna consolidados
```

**Racional da organização:**

- `asaas/` e `email/` como pastas (não arquivos soltos) porque cada um tem duas metades com
  ciclos de vida diferentes: transporte (muda quando o fornecedor muda) e regra (muda quando
  o negócio muda). Manter juntos vira o `whatsapp-helper.ts` de 300 linhas que já existe.
- `precos.ts` separado de `planos.ts`: `planos.ts` é catálogo congelado; `precos.ts` é a
  resolução dependente de tempo e de tenant. Misturar torna o `PLANOS` congelado uma mentira.
- `12_grants_publicos.sql` num arquivo único: hoje os GRANTs de `assinaturas` estão perdidos
  numa migration de 2026-07-09 e não existem no schema declarativo. Concentrar a superfície
  pública num arquivo torna a auditoria uma leitura só — e é a resposta ao requisito
  "acesso anon reduzido ao mínimo".

---

## Padrão 1 — Billing: a Server Action inicia, o webhook decide

**O quê:** o checkout é **assimétrico de propósito**. A Server Action é a única que pode falar
em nome de um tenant autenticado (ela tem `orgId`), então é ela que cria customer e subscription.
Mas ela **não** concede o plano — quem concede é o webhook, porque só ele sabe que o dinheiro
entrou.

```
Server Action (autenticada)              Webhook (não autenticado, token no header)
─────────────────────────────            ──────────────────────────────────────────
auth() → orgId                           valida asaas-access-token
resolverPrecoPro(tenant)                 grava eventos_asaas (idempotência)
garante asaas_customer_id                aplica transição em `assinaturas`
POST /v3/subscriptions                   after() → e-mail de recibo
redirect(invoiceUrl)                     responde 2xx
        │                                          │
        └── NÃO escreve status em `assinaturas` ───┘
```

**Por que assim:** a alternativa (a action já criar a linha `ativa`) daria Pro a quem abandonou
o checkout. E criar a linha como `pendente` mantém a propriedade que o `docs/07` chama de
"plano infraudável": o cliente nunca tem caminho de escrita para o próprio status.

**Trade-off:** existe uma janela entre o redirect de volta (`successUrl`) e a chegada do webhook.
A página `/dashboard/plano?checkout=sucesso` **não pode** liberar o Pro pelo query param — ela
mostra "confirmando seu pagamento" e revalida. Isso é fricção real para o profissional (B2B),
e é aceitável: a regra de Fricção Zero é do cliente final, não do assinante.

**Manter a tabela `assinaturas` sem política de escrita.** Ela hoje só tem SELECT para
`authenticated` e SELECT por coluna para `anon`. O webhook escreve com `createAdminClient()`,
que é exatamente o padrão já consagrado em `imagens-perfil.ts` e `public-booking.ts`:
validação completa no servidor → escrita privilegiada. Não criar política de INSERT/UPDATE para
`authenticated` — seria o único caminho pelo qual um tenant poderia se auto-promover a Pro pela
Data API.

**Precisa de um status novo:** `assinaturas.status` hoje é `ativa|inadimplente|cancelada`.
O fluxo "subscription criada, primeira cobrança ainda não paga" precisa de `pendente`. O índice
único parcial `uq_assinatura_vigente_por_tenant` cobre `('ativa','inadimplente')` — incluir
`pendente` nele evita que cliques repetidos no botão gerem duas subscriptions no Asaas.

---

## Padrão 2 — Idempotência de webhook: a PK é o mecanismo

**O quê:** o Asaas entrega **at-least-once** e cada notificação tem `id` próprio. A defesa não é
um `if (jaProcessei)` em memória — é uma tabela cuja chave primária é o id do evento.

```sql
CREATE TABLE eventos_asaas (
    id text PRIMARY KEY,               -- id do evento vindo do Asaas
    evento text NOT NULL,              -- PAYMENT_CONFIRMED, SUBSCRIPTION_DELETED, ...
    tenant_id text,                    -- resolvido a partir do customer/subscription
    ocorrido_em timestamptz NOT NULL,  -- dateCreated do Asaas (guarda de ordem)
    payload jsonb NOT NULL,            -- material de replay
    processado_em timestamptz
);
ALTER TABLE eventos_asaas ENABLE ROW LEVEL SECURITY;
-- Nenhuma política: nem anon nem authenticated leem. Só service_role.
```

```ts
// Chegou primeiro? Só então executa o efeito.
const { data: novo } = await admin
    .from('eventos_asaas')
    .upsert(linha, { onConflict: 'id', ignoreDuplicates: true })
    .select('id')

if (!novo?.length) return NextResponse.json({ ok: true })  // repetido → 2xx e sai
```

`ignoreDuplicates: true` gera `ON CONFLICT DO NOTHING` no Postgres: a checagem e a marcação
acontecem na mesma instrução, sem corrida entre duas entregas simultâneas.

**Ordem de eventos — três camadas, nesta ordem de custo:**

1. **Configurar o webhook em modo sequencial no painel do Asaas.** Custo zero de código; o Asaas
   passa a respeitar a ordem de ocorrência. Para o volume deste produto não há razão para o modo
   paralelo.
2. **Guarda de monotonicidade:** coluna `assinaturas.evento_aplicado_em`; a transição só se
   aplica se `evento.dateCreated >= evento_aplicado_em`. Impede que um `PAYMENT_OVERDUE` atrasado
   rebaixe uma assinatura já reconfirmada.
3. **Reconciliação sob demanda:** uma action de suporte que faz `GET /v3/subscriptions/{id}` e
   reescreve o estado a partir do Asaas. É o plano B para o caso raro, e é muito mais barato que
   tentar tornar o consumo de eventos perfeito.

**Não** adotar "reler sempre o estado no Asaas a cada evento": dobra a latência do webhook e
adiciona uma dependência de disponibilidade num caminho que precisa responder 2xx rápido.

**Por que responder 2xx rápido importa aqui mais que no QStash:** 15 respostas fora de 2xx
consecutivas **interrompem a fila do Asaas** e exigem reativação manual no painel. Um bug no
envio de e-mail de recibo derrubaria o billing inteiro se o e-mail estivesse no caminho síncrono.
Daí o padrão 3.

**Replay e PII:** `payload jsonb` guarda nome e CPF/CNPJ do assinante — diferente de
`disparos_whatsapp`, que é deliberadamente sem PII. É uma exceção consciente (sem o payload não
há replay), e o preço é: zero políticas RLS na tabela + rotina de purga (ex.: > 90 dias).

---

## Padrão 3 — `after()` como canal de efeitos que não são dinheiro

**O quê:** `import { after } from 'next/server'` agenda trabalho para depois da resposta.
Funciona em Server Actions, Route Handlers e Server Components; na tabela de suporte da doc do
Next 16, **Node.js server e Docker = Yes** (é o caso do Railway).

```ts
// src/app/api/webhooks/asaas/route.ts
await aplicarTransicao(admin, evento)          // dinheiro: síncrono, antes do 2xx
after(() => enviarRecibo(tenantId, evento))    // comunicação: depois do 2xx
return NextResponse.json({ ok: true })
```

**Regra de decisão para o roadmap:**

| Natureza do efeito | Onde roda | Por quê |
|---|---|---|
| Estado de negócio (linha em `assinaturas`, agendamento) | síncrono, antes da resposta | se falhar, o chamador precisa saber |
| Comunicação (e-mail, WhatsApp de confirmação, analytics) | `after()` | perda é tolerável; latência não é |
| Trabalho futuro/durável (lembrete) | QStash | precisa sobreviver ao processo |

**Limitação a documentar, não a esconder:** `after()` **não é fila durável**. Se o processo
morrer entre a resposta e o callback, o e-mail se perde em silêncio. Para e-mail transacional
o custo é aceitável; para qualquer coisa que envolva dinheiro ou estado, não é.

**Ganho colateral no booking público:** hoje `criarAgendamentoPublico` faz
`await dispararNotificacoesAgendamento(...)` — o cliente final espera Evolution API + QStash
antes de ver a tela de sucesso. Movendo esse bloco para `after()`, a confirmação aparece assim
que o INSERT commita. Isso é Fricção Zero medido em milissegundos, e não muda nenhuma regra.

**Contrato de falha do e-mail — herdar o de `notificacoes-agendamento.ts`, não reinventar:**
o SDK do Resend **não lança** em erro de API; devolve `{ data, error }`. Então o padrão é
`if (error) { console.error(...); return }` dentro de um try/catch externo. A função de topo
tem tipo de retorno `Promise<void>` e a docstring "NUNCA lança" — igual à que já existe.

**Idempotência de e-mail:** `resend.emails.send(payload, { idempotencyKey })` com chaves
derivadas do domínio — `recibo/${asaas_payment_id}`, `boas-vindas/${tenant_id}`,
`confirmacao/${agendamento_id}`. Cobre webhook duplicado e retry do QStash dentro da janela de
24 h; fora dela, o `eventos_asaas` já barrou.

**Sem tabela `disparos_email`.** O Resend tem dashboard próprio com status de entrega, e a
auditoria de mensageria existe porque a Evolution API é opaca e frágil — o Resend não é. Logar
erro no console + evento agregado no PostHog. Se depois aparecer necessidade real de suporte
("o cliente diz que não recebeu"), aí sim.

---

## Padrão 4 — Preço fundador: propriedade do tenant, materializada pelo pagamento

**O problema:** o Gratuito é a **ausência** de linha vigente em `assinaturas`, e trocar de plano
exige cancelar + recriar (índice único parcial). Se a marca de fundador morasse na assinatura,
quem cancelasse e voltasse perderia o preço travado — contradizendo a decisão do PROJECT.md.

**Modelagem:**

```sql
CREATE TABLE perfis_cobranca (
    tenant_id text PRIMARY KEY REFERENCES perfis_empresas(tenant_id) ON DELETE RESTRICT,
    asaas_customer_id text UNIQUE,
    preco_travado numeric(10,2),   -- NULL = sem direito adquirido
    fundador_em timestamptz,       -- quando o direito foi materializado
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);
ALTER TABLE perfis_cobranca ENABLE ROW LEVEL SECURITY;
CREATE POLICY "SELECT do próprio tenant" ON perfis_cobranca FOR SELECT TO authenticated
    USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'));
-- Sem política para anon. Sem política de escrita para ninguém: só service_role.
```

**Por que tabela nova e não colunas em `perfis_empresas`:** `perfis_empresas` tem
`SELECT ... TO anon USING (true)`. Toda coluna adicionada lá nasce pública até alguém lembrar do
GRANT. Colocar `asaas_customer_id` ali é convidar o vazamento na próxima migration. Tabela
separada = superfície pública inalterada por construção.

`ON DELETE RESTRICT` (e não CASCADE, como a dívida conhecida em `assinaturas`) é deliberado:
perder o registro de fundador é irreversível e silencioso.

**Onde a regra vive — duas metades:**

```ts
// src/lib/precos.ts — puro, testável
export const DATA_LIMITE_FUNDADOR = new Date('2027-02-02T23:59:59-03:00')

export function resolverPrecoPro(
    { precoTravado, agora }: { precoTravado: number | null; agora: Date },
): number {
    if (precoTravado !== null) return precoTravado           // direito adquirido vence tudo
    return agora <= DATA_LIMITE_FUNDADOR ? PRECO_FUNDADOR : PLANOS.pro.precoMensal
}
```

- **A action** usa `resolverPrecoPro` para definir o `value` da subscription no Asaas. É aqui que
  a janela temporal decide.
- **O webhook**, no primeiro pagamento confirmado, materializa:
  `UPDATE perfis_cobranca SET preco_travado = <valor cobrado>, fundador_em = now() WHERE tenant_id = ... AND preco_travado IS NULL`.
  O `AND preco_travado IS NULL` torna a operação idempotente por si só, independente do log de
  eventos.

**Por que materializar no pagamento e não no checkout:** o PROJECT.md diz "elegibilidade por
assinatura dentro da janela, não por cadastro". Quem abriu o checkout e não pagou não é fundador.

**Caso de borda a decidir explicitamente:** checkout aberto em 01/02/2027 a R$ 29,90, pago em
03/02/2027. O Asaas cobra o valor com que a subscription foi criada, então o webhook materializa
R$ 29,90. É generoso e é a única leitura possível sem reprocessar valor — registrar como decisão,
não descobrir em produção.

**Selo de desconto derivado, não escrito à mão.** O bug do requisito (`-50%` onde o real é −25%)
existe porque `seloDesconto: '-50%'` é uma string em `planos.ts`. Substituir por
`calcularSeloDesconto(precoVigente, PRECO_ORIGINAL.pro)` em `precos.ts` fecha a classe inteira de
bug — nenhuma futura mudança de preço pode dessincronizar o selo.

**Interação com a remoção do Plus:** `PlanoId` perde `'plus'`, e o `CHECK (plano IN ('plus','pro'))`
de `assinaturas` também. Como o `PLANOS` é a fonte única e o gating lê dele, a remoção é mecânica —
mas ela **precisa vir antes** da modelagem de preço, senão `resolverPreco*` nasce com um ramo morto.

---

## Padrão 5 — Escrita pública: um caminho só

**O quê:** hoje convivem dois modelos de escrita pública, e um deles é redundante e perigoso.

| Modelo | Onde | Status |
|---|---|---|
| A — validação completa na Server Action → escrita via `createAdminClient()` | `public-booking.ts` (o caminho real) | manter |
| B — política RLS `INSERT TO anon WITH CHECK (tenant_id IS NOT NULL)` | `agendamentos`, `clientes` | **remover** |

O modelo B não protege nada (`tenant_id IS NOT NULL` é satisfeito por qualquer string) e mantém
`POST /rest/v1/agendamentos` aberto para quem tiver a publishable key — que é pública por
definição. Como nenhum código usa esse caminho, removê-lo é subtração pura:

```sql
DROP POLICY "Permitir INSERT público para visitantes" ON agendamentos;
DROP POLICY "Permitir INSERT público para visitantes" ON clientes;
REVOKE INSERT ON agendamentos, clientes FROM anon;   -- privilégio e política são camadas distintas
```

O `REVOKE` além do `DROP POLICY` não é redundância decorativa: impede que uma migration futura
recrie a política e reabra o buraco sem que ninguém perceba.

**O que isso destrava:** a Server Action passa a ser o **único** ponto de escrita pública, e
portanto o único lugar onde rate limit e honeypot precisam existir. E as proteções nativas do
Next 16 passam a valer para 100% das escritas públicas — hoje são contornáveis indo direto na
Data API:

- CSRF por comparação `Origin` × `Host`;
- IDs de action criptografados + dead code elimination;
- `bodySizeLimit` (já configurado em 6 MB por causa do upload de capa).

**Leitura pública mínima por GRANT de coluna.** Privilégio de coluna é camada independente do RLS:
a política pode dizer `USING (true)` e o `anon` ainda enxergar só o que foi concedido.

```sql
REVOKE SELECT ON agendamentos FROM anon;
GRANT SELECT (id, tenant_id, servico_id, data_hora, status) ON agendamentos TO anon;
```

Essas cinco colunas são exatamente o que a engine consome (`data_hora`, `status`, embed
`servicos(duracao_minutos)`) e filtra (`tenant_id`, `neq('id', ...)` na remarcação) — no Postgres,
usar uma coluna em `WHERE` também exige `SELECT` sobre ela. O ganho real é excluir `cliente_id`,
que hoje permite correlacionar clientes entre tenants.

**Honestidade sobre o limite dessa medida:** mesmo com o GRANT, a agenda ocupada de qualquer
tenant continua listável por quem tiver a chave. Reduzir isso a zero exigiria tirar `anon` do
caminho de leitura e usar admin client com filtro explícito — o que **perde o RLS como segunda
camada** (um `.eq('tenant_id')` esquecido vira vazamento total). A recomendação é ficar com o
GRANT: o dado é de baixa sensibilidade (horários ocupados, sem nome de cliente) e a segunda
camada vale mais que o ganho marginal.

**Regra permanente a escrever no `docs/03`:** *toda coluna nova em tabela com leitura `anon`
nasce sem GRANT; conceder é ato explícito.* Sem isso, a lista de colunas concedidas desatualiza na
primeira migration distraída.

**Assinatura do webhook de lembrete.** O secret em query string com fallback
`|| 'secret-key'` não é o mecanismo do QStash — o correto é
`export const POST = verifySignatureAppRouter(handler)` de `@upstash/qstash/nextjs`, com
`QSTASH_CURRENT_SIGNING_KEY` e `QSTASH_NEXT_SIGNING_KEY`. Fronteira afetada:
`agendarLembreteQStash` deixa de anexar `?secret=` à URL de callback. Adiciona a dependência
`@upstash/qstash` (hoje o projeto fala com o QStash por `fetch` cru) — é o caso claro de lib que
elimina trabalho relevante: implementar verificação de assinatura à mão é onde se erra.

**Onde o rate limit vive:** no topo de `criarAgendamentoPublico`, não no `proxy.ts`. Server
Actions são POSTs para a rota da própria página; interceptar no proxy é frágil e cego ao tenant.
Store: sem Redis da aplicação provisionado (o Redis do Railway é da Evolution API), o proporcional
é uma RPC atômica no Postgres — mesmo espírito de `substituir_horarios_funcionamento`. Honeypot é
um campo oculto no form validado na action: custo zero, invisível para o cliente legítimo.

**Double-booking atômico** fica fora deste documento (é dimensão de dados), mas a fronteira
importa aqui: a solução correta (`EXCLUDE USING gist` sobre `tstzrange`) exige uma coluna
`data_hora_fim` denormalizada em `agendamentos`, que só pode ser preenchida no caminho de escrita —
ou seja, **depende de o caminho de escrita já ser único**. Mais uma razão para o hardening vir
primeiro.

---

## Fluxos de dados

### Assinatura do Pro (B2B)

```
/dashboard/plano  [Server Component: lê assinatura vigente + preço resolvido]
      │  clique "Assinar Pro"  (ilha client, useActionState)
      ▼
assinatura.ts :: iniciarAssinaturaPro()
      │ auth() → orgId
      │ perfis_cobranca: garante asaas_customer_id (cria no Asaas se faltar)
      │ precos.ts: resolverPrecoPro({ precoTravado, agora })
      │ asaas/client: POST /v3/subscriptions  → { id, invoiceUrl }
      │ assinaturas: INSERT status='pendente' (admin client)
      ▼ redirect(invoiceUrl)   ← Next.js aceita URL externa em redirect()
[usuário paga no Asaas]
      │
      ├──► successUrl → /dashboard/plano?checkout=sucesso
      │      "confirmando seu pagamento…" — NUNCA libera Pro pelo query param
      │
      └──► POST /api/webhooks/asaas   PAYMENT_CONFIRMED
             valida asaas-access-token
             eventos_asaas upsert(ignoreDuplicates) → já visto? 2xx e sai
             guarda de ordem: dateCreated >= evento_aplicado_em?
             assinaturas: status='ativa', proximo_vencimento, limpa url_fatura_pendente
             perfis_cobranca: materializa preco_travado (se NULL e dentro da janela)
             after(() => recibo por e-mail)
             2xx
```

### Agendamento público, depois do hardening

```
/book/[slug]  →  criarAgendamentoPublico()   [único caminho de escrita]
      │ rate limit (RPC Postgres) + honeypot        ← NOVO
      │ valida tenant / serviço ativo do tenant / slot livre (engine)
      │ contato: e-mail OU WhatsApp (pelo menos um)  ← NOVO
      │ admin client: cliente (lookup por telefone, fallback e-mail) + agendamento
      │ after(() => notificações: WhatsApp Pro + e-mail de confirmação)  ← MOVIDO
      ▼ retorna → tela de sucesso (sem esperar Evolution/QStash/Resend)
```

`anon` não escreve em lugar nenhum; lê apenas colunas concedidas de `perfis_empresas`,
`servicos`, `horarios_funcionamento`, `excecoes_agenda`, `agendamentos` e `assinaturas`.

### Contato do cliente final: e-mail OU WhatsApp

Mudança de contrato com efeito em cadeia — vale mapear antes de planejar:

| Camada | Efeito |
|---|---|
| `clientes.telefone` | `NOT NULL` → nullable + `CHECK (telefone IS NOT NULL OR email IS NOT NULL)` |
| lookup de cliente | hoje só por telefone; precisa de fallback por e-mail (e decidir a precedência quando os dois batem em clientes diferentes) |
| `notificacoes-agendamento.ts` | já retorna cedo com `if (!clienteTelefone) return` — comportamento correto, preservar |
| `EtapaContato.tsx` | validação "pelo menos um" no client **e** na action |

---

## Ordem de construção (dependências reais)

```
1. Remover Plus (código + CHECK do banco)
        │  sem isso, precos.ts e o gating nascem com ramo morto
        ▼
2. Hardening de escrita: DROP POLICY INSERT anon + REVOKE INSERT
        │  torna a Server Action o único caminho — pré-requisito de 3, 7 e do
        │  double-booking atômico
        ▼
3. GRANT por coluna consolidado (12_grants_publicos.sql)
        │  precisa vir antes de qualquer coluna nova sensível
        ▼
4. perfis_cobranca + precos.ts + selo derivado        ── puro, sem rede, testável
        │                                                 já entrega valor visível
        ▼
5. asaas/client.ts + actions/assinatura.ts (sandbox)
        ▼
6. eventos_asaas + webhook Asaas + status 'pendente' + guarda de ordem
        │
        ├─ 7. email/{cliente,templates} + notificacoes-billing   [paralelo a 5-6]
        │        boas-vindas não depende de billing;
        │        recibo depende de 6
        │
        ├─ 8. after() no booking + "e-mail OU WhatsApp"   [depende de 7]
        │
        └─ 9. verifySignatureAppRouter no lembrete  [independente — antecipar,
                 pertence ao bloco de segurança]
```

**Fases que podem correr em paralelo:** 7 com 5-6 (a camada de e-mail não conhece o Asaas);
9 a qualquer momento depois de 2.

**Fase mais arriscada:** 6 — é a única que combina dependência externa (sandbox Asaas),
idempotência e ordem. Merece plano próprio e testes do redutor de eventos em vitest, sem rede.

**Corte de emergência (restrição de 4-5 h/dia):** 1→2→3 sozinhos já satisfazem a barra de
segurança; 4 entrega o preço correto sem checkout; 5-6 podem esperar sem bloquear o lançamento,
com upgrade manual via SQL como hoje.

---

## Anti-padrões (específicos destas adições)

### Liberar o Pro no retorno do checkout

**O que se faz:** `successUrl` → `?status=paid` → a página trata como assinatura ativa.
**Por que é errado:** o parâmetro é controlado pelo browser. Qualquer um digita a URL.
**Em vez disso:** o retorno só muda a mensagem exibida; o gating continua lendo `assinaturas`,
escrita exclusivamente pelo webhook.

### Colocar o e-mail no caminho síncrono do webhook

**O que se faz:** `await enviarRecibo(...)` antes do `return NextResponse.json(...)`.
**Por que é errado:** o Resend fora do ar vira resposta 5xx; 15 delas consecutivas **interrompem
a fila do Asaas** e param o billing inteiro por um problema de e-mail.
**Em vez disso:** `after(() => enviarRecibo(...))` e 2xx imediato.

### Criar política de escrita em `assinaturas` para `authenticated`

**O que se faz:** "é mais simples a action gravar direto o plano".
**Por que é errado:** destrói a propriedade que torna o plano infraudável — o tenant passa a poder
se promover a Pro por um POST na Data API.
**Em vez disso:** action grava só `pendente` via admin client; status pago só pelo webhook.

### Guardar o preço travado na linha de assinatura

**O que se faz:** `assinaturas.preco_travado`.
**Por que é errado:** trocar de plano exige cancelar e recriar a linha (índice único parcial) —
o direito de fundador evapora no primeiro cancelamento.
**Em vez disso:** `perfis_cobranca`, 1:1 com o tenant, `ON DELETE RESTRICT`.

### Adicionar coluna sensível em `perfis_empresas`

**O que se faz:** `asaas_customer_id` ao lado de `slug` e `cor_marca`.
**Por que é errado:** a política é `SELECT TO anon USING (true)`; toda coluna nova nasce pública.
**Em vez disso:** tabela separada sem política para `anon`; e para as colunas que precisam mesmo
ficar em `perfis_empresas`, GRANT explícito no `12_grants_publicos.sql`.

### Tratar `after()` como fila

**O que se faz:** mover escrita de estado para dentro do `after()` "para responder mais rápido".
**Por que é errado:** o callback não sobrevive à morte do processo, e a falha é silenciosa.
**Em vez disso:** estado é síncrono; se precisar de durabilidade, QStash — que já está no stack.

### Verificar webhook por secret em query string

**O que se faz:** `?secret=...` comparado com uma env (com fallback `'secret-key'`).
**Por que é errado:** vai para logs de acesso, não prova origem nem integridade do corpo, e o
fallback transforma env ausente em endpoint aberto.
**Em vez disso:** `verifySignatureAppRouter` (QStash) e comparação time-safe do header
`asaas-access-token` (Asaas), sem fallback — env ausente derruba o handler.

---

## Pontos de integração

### Serviços externos

| Serviço | Padrão de integração | Pegadinhas |
|---|---|---|
| Asaas | `fetch` em `src/lib/asaas/client.ts`; header `access_token`; base URL por env (`api-sandbox` → `api`) | Customer exige `cpfCnpj` — o dashboard precisa coletar. Criar subscription **já gera a primeira cobrança** e dispara `PAYMENT_CREATED` com o id da subscription. 15 respostas não-2xx param a fila. Modo sequencial é opção de painel, não de código. |
| Resend | SDK `resend`; instância lazy; no-op sem API key | Não lança em erro — devolve `{ data, error }`. Rate limit baixo (2–5 req/s por team). `idempotencyKey` expira em 24 h. Depende de SPF/DKIM verificados (tarefa de DNS do owner, fora do código). |
| QStash | `@upstash/qstash/nextjs` para verificar; `fetch` para publicar (já existe) | Duas signing keys (current + next) por rotação — configurar as duas. |
| Evolution API | inalterado | continua a peça mais frágil do stack |
| Supabase | `createClient()` (RLS) para leitura; `createAdminClient()` para toda escrita pública e de webhook | privilégio de coluna ≠ política RLS: precisa dos dois |

### Fronteiras internas

| Fronteira | Comunicação | Observação |
|---|---|---|
| Server Action ↔ `asaas/client` | chamada direta | o client não conhece `auth()` nem Supabase — testável com fetch mockado |
| Webhook ↔ `assinaturas.ts` | redutor puro `(evento, estado) => transição` | mantém a regra de ordem/idempotência testável sem rede |
| `notificacoes-billing` ↔ `email/templates` | funções puras | templates sem I/O = snapshot test barato |
| `precos.ts` ↔ `planos.ts` | `planos.ts` é catálogo; `precos.ts` resolve por tenant e tempo | não inverter: `PLANOS` congelado não pode depender de data |
| Server Action pública ↔ `rate-limit.ts` | RPC no Postgres | único gate, porque a escrita virou caminho único |

---

## Escala

O produto atende dezenas de tenants nos primeiros meses. Nada aqui precisa escalar — mas vale
saber o que quebra primeiro:

| Escala | O que quebra | Resposta |
|---|---|---|
| dezenas de tenants | nada; Supabase Free e Railway single-instance dão conta | — |
| centenas | `after()` num único processo Railway começa a competir com o rendering; e-mails perdidos em restart ficam visíveis | mover e-mails para QStash (durável, já no stack) |
| milhares | webhook do Asaas em modo sequencial vira gargalo (fila única, ordem global) | modo paralelo + a guarda de monotonicidade que já terá sido construída |

A guarda de ordem por `dateCreated` não é over-engineering: é justamente o que permite trocar
para o modo paralelo depois sem reescrever o handler.

---

## Fontes

- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md` — semântica de
  `after()`, suporte em Node/Docker, execução mesmo em erro/redirect, `maxDuration` — **ALTA**
- `node_modules/next/dist/docs/01-app/02-guides/server-actions.md` — CSRF Origin×Host, IDs
  criptografados, dead code elimination, `bodySizeLimit`, "trate toda action como entrada não
  confiável", dispatch sequencial no client — **ALTA**
- `node_modules/next/dist/docs/01-app/02-guides/backend-for-frontend.md` — webhooks como Route
  Handler, rate limiting no handler — **ALTA**
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md` — `redirect()`
  aceita URL absoluta/externa — **ALTA**
- Código do projeto: `src/lib/supabase/{server,admin}.ts`, `src/app/actions/public-booking.ts`,
  `src/lib/{assinaturas,planos,booking-engine,notificacoes-agendamento}.ts`,
  `supabase/schemas/*.sql`, `supabase/migrations/20260709193156_*.sql` — **ALTA**
- https://docs.asaas.com/docs/sobre-os-webhooks — at-least-once, id de evento, fila de 14 dias,
  15 falhas interrompem, `asaas-access-token`, 2xx rápido — **MÉDIA**
- https://docs.asaas.com/reference/criar-nova-assinatura e /docs/eventos-para-{assinaturas,checkout}
  — campos de `POST /v3/subscriptions`, primeira cobrança automática, nomes dos eventos — **MÉDIA**
- Context7 `/websites/resend` — `idempotencyKey`, retorno `{ data, error }`, rate limit — **MÉDIA**
- Context7 `/websites/upstash_qstash` — `verifySignatureAppRouter`, signing keys — **MÉDIA**
- Context7 `/websites/supabase` — GRANT/REVOKE por coluna como camada independente do RLS,
  `TO <role>` explícito nas políticas — **MÉDIA**

---
*Architecture research para: integração de billing, preço travado, e-mail transacional e
hardening público na arquitetura Next.js 16 + Server Actions + Supabase RLS existente*
*Pesquisado: 2026-07-20*
