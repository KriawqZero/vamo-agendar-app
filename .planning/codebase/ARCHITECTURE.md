<!-- refreshed: 2026-07-20 -->
# Architecture

**Analysis Date:** 2026-07-20

## System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                     Next.js 16 App Router                    │
├──────────────────┬──────────────────┬───────────────────────┤
│  Booking B2C     │  Dashboard B2B   │  Landings / Auth      │
│  `src/app/book/` │ `src/app/        │  `src/app/page.tsx`,  │
│                  │  dashboard/`     │  `src/app/para/`,     │
│                  │  (Clerk protect) │  `src/app/sign-in|up/`│
└────────┬─────────┴────────┬─────────┴──────────┬────────────┘
         │                  │                     │
         ▼                  ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│  Server Actions (mutations) `src/app/actions/`               │
│  + Webhook `src/app/api/webhooks/lembrete/route.ts`          │
├─────────────────────────────────────────────────────────────┤
│  Domain libs `src/lib/` (booking-engine, horarios, timezone, │
│  planos, assinaturas, whatsapp-helper, notificacoes)         │
└────────┬─────────────────────────────┬──────────────────────┘
         │                             │
         ▼                             ▼
┌───────────────────────┐   ┌─────────────────────────────────┐
│ Supabase (Postgres+RLS│   │ Externos: Evolution API (WhatsApp)│
│ +Storage)             │   │ Upstash QStash, PostHog, Clerk   │
│ `src/lib/supabase/`   │   │                                  │
└───────────────────────┘   └─────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Proxy/middleware | Clerk auth gate; lista de rotas públicas | `src/proxy.ts` |
| Booking público (B2C) | Wizard de agendamento sem login (`/book/[slug]`) | `src/app/book/[slug]/BookingApp.tsx` |
| Dashboard (B2B) | Gestão de agenda, serviços, WhatsApp, plano | `src/app/dashboard/` |
| Server Actions | Todas as mutações, agrupadas por domínio | `src/app/actions/*.ts` |
| Engine de disponibilidade | Cálculo puro de slots livres (grade anti-buraco) | `src/lib/booking-engine.ts` |
| Cliente Supabase (RLS) | Client memoizado por request com JWT do Clerk | `src/lib/supabase/server.ts` |
| Cliente Supabase admin | Bypass de RLS (service role) para casos controlados | `src/lib/supabase/admin.ts` |
| Notificações | Confirmação síncrona + lembrete via QStash | `src/lib/notificacoes-agendamento.ts` |
| Webhook lembrete | Recebe callback do QStash, valida secret, dispara WhatsApp | `src/app/api/webhooks/lembrete/route.ts` |
| Planos/assinaturas | Gating Gratuito/Plus/Pro | `src/lib/planos.ts`, `src/lib/assinaturas.ts` |
| Analytics | PostHog client/server (no-op sem credenciais) | `src/lib/analytics/` |

## Pattern Overview

**Overall:** Monólito Next.js App Router — Server Components + Server Actions, sem camada REST própria (única exceção: webhooks de terceiros).

**Key Characteristics:**
- Multi-tenant via Clerk Organizations → claim `org_id` no JWT → RLS no Postgres (sem sync de usuários, sem webhooks de auth)
- Dois fluxos com o mesmo client Supabase: B2B autenticado (role `authenticated`) e B2C anônimo (role `anon` — Fricção Zero, cliente final nunca loga)
- SQL puro via `@supabase/ssr`; schema declarativo em `supabase/schemas/` com migrations geradas por `supabase db diff`
- Domínio de negócio nomeado em português (`criarAgendamentoPublico`, `obterSlotsDisponiveis`)

## Layers

**Rotas/UI (`src/app/`):**
- Purpose: páginas Server Components + ilhas Client (`*Client.tsx`)
- Depends on: Server Actions e libs de domínio
- Pattern: `page.tsx` (Server, busca dados) + `<Nome>Client.tsx` (`'use client'`, interação)

**Server Actions (`src/app/actions/`):**
- Purpose: todas as mutações; validação de auth/tenant e regras de negócio
- Depends on: `src/lib/*` e clients Supabase
- B2B: valida `const { orgId } = await auth()` e passa `tenant_id: orgId`; B2C: role `anon` + revalidação rigorosa na action

**Domínio (`src/lib/`):**
- Purpose: funções puras/testáveis (engine de slots, sobreposição de horários, timezone, templates WhatsApp, gating de planos)
- Depends on: nada de UI; testes em `src/lib/__tests__/`

**Dados (`supabase/`):**
- Purpose: schema declarativo (`supabase/schemas/00–09_*.sql`, ordem lexicográfica respeita FKs) + migrations geradas (`supabase/migrations/`)
- RLS obrigatório, políticas granulares por ação, `tenant_id text` = `org_...` do Clerk

## Data Flow

### Agendamento público (B2C)

1. Cliente acessa `/book/[slug]` — `src/app/book/[slug]/page.tsx` (Server) carrega dados sanitizados via `obterDadosBookingPublico`
2. Wizard client (`BookingApp.tsx` + `etapas/Etapa*.tsx`): serviço → data/hora (slots via engine) → contato
3. `criarAgendamentoPublico` (`src/app/actions/public-booking.ts`): re-executa `obterSlotsDisponiveis` e valida o horário por igualdade exata de datetime (anti double-booking), sanitiza telefone, reaproveita cliente por telefone, INSERT
4. `dispararNotificacoesAgendamento` (`src/lib/notificacoes-agendamento.ts`): confirmação síncrona via Evolution API + agenda lembrete no QStash (`Upstash-Not-Before`) → `/api/webhooks/lembrete`

### Fluxo B2B (dashboard)

1. `src/proxy.ts` (`clerkMiddleware` + `auth.protect()`) protege `/dashboard`
2. `page.tsx` (Server) busca dados via `createClient()` — RLS filtra por `org_id` do JWT
3. Mutações via Server Actions (`agendamentos.ts`, `servicos.ts`, `agenda.ts`, `whatsapp.ts`, `perfis-empresas.ts`, `imagens-perfil.ts`) com `orgId` validado

**State Management:**
- Sem store global; estado local nas ilhas client, pending via `useActionState`/`useFormStatus`; dados server-first

## Key Abstractions

**Engine de disponibilidade (grade anti-buraco):**
- `obterSlotsDisponiveis` = janelas de funcionamento − exceções − agendamentos → `calcularIntervalosLivres` → `gerarSlotsAntiBuraco` (candidatos de 15 em 15 min + candidato colado no fim; rejeita sobras invendáveis)
- `regrasAcesso { antecedenciaMinutos, horizonteDias }` opcional: fluxo público passa; dashboard omite (walk-in)
- File: `src/lib/booking-engine.ts` — o formato da saída é contrato do anti double-booking

**Gating de planos:**
- `src/lib/planos.ts` + `src/lib/assinaturas.ts`; WhatsApp e personalização visual são exclusivos do Pro — gating nas actions, nunca só na UI

**Client Supabase memoizado:**
- `createClient()` em `src/lib/supabase/server.ts` com `cache()` do React; injeta JWT do Clerk só quando há sessão; `createAdminClient()` (`src/lib/supabase/admin.ts`) para escrita em Storage e casos que exigem bypass de RLS

## Entry Points

**`src/proxy.ts`:** substitui `middleware.ts` (Next.js 16); rotas públicas: `/`, `/para(.*)`, `/sign-in|up`, `/book(.*)`, `/api/webhooks(.*)`

**`src/app/layout.tsx`:** root layout (providers, analytics em `src/components/analytics/`)

**`src/app/api/webhooks/lembrete/route.ts`:** único endpoint REST — callback do QStash; valida secret e checa se o agendamento não foi cancelado

## Architectural Constraints

- **Timezone:** banco em UTC; interpretação no fuso do tenant (`perfis_empresas.timezone`) via `src/lib/timezone.ts`
- **Storage sem RLS:** `storage.objects` sem políticas (role postgres não é owner); toda escrita passa por `src/app/actions/imagens-perfil.ts` com `createAdminClient()`
- **Stack banida:** Prisma/Drizzle, better-auth, Mercado Pago — nunca introduzir
- **Sem rotas REST próprias:** mutações só via Server Actions; exceção única `src/app/api/webhooks/`

## Anti-Patterns

### Ler personalização crua na UI pública

**What happens:** consumir `cor_marca`/`logo_url`/`capa_url` direto de `perfis_empresas` em página pública
**Why it's wrong:** vaza personalização Pro para tenants sem plano vigente
**Do this instead:** usar `obterDadosBookingPublico` (chave `personalizacao`) em `src/app/actions/public-booking.ts`, sanitizada pelo plano

### `getToken({ template: 'supabase' })`

**What happens:** usar o fluxo depreciado de JWT template do Clerk
**Why it's wrong:** depreciado; a integração nativa third-party auth já aceita o session token padrão
**Do this instead:** seguir `src/lib/supabase/server.ts` (token padrão de `await auth()`)

### Editar `supabase/migrations/` à mão

**What happens:** escrever/alterar migration manualmente
**Why it's wrong:** quebra o fluxo declarativo; migrations devem ser geradas
**Do this instead:** editar `supabase/schemas/*.sql` e gerar via `supabase db diff` (exceções em `docs/SUPABASE_DECLARATIVE-DATABASE-SCHEMA.md`; relaxado em DEV, ver `CLAUDE.md`)

## Error Handling

**Strategy:** actions retornam objetos de resultado/erro consumidos pelas ilhas client; mensageria falha silenciosamente para o cliente final (frictionless) com log em `disparos_whatsapp`

**Patterns:**
- Error boundary de dashboard em `src/app/dashboard/error.tsx`; `not-found.tsx` no booking (`src/app/book/[slug]/not-found.tsx`)
- Validação defensiva na própria action (double-booking, telefone `replace(/\D/g, '')`, gating de plano)

## Cross-Cutting Concerns

**Logging:** `disparos_whatsapp` (append-only, sem PII) para auditoria de mensageria; console para o resto
**Validation:** nas Server Actions (não há camada de schema validation dedicada)
**Authentication:** Clerk (`src/proxy.ts` + `await auth()` nas actions); RLS como segunda camada
**Analytics:** PostHog via `src/lib/analytics/` (server) e `src/components/analytics/` (client), no-op sem credenciais

---

*Architecture analysis: 2026-07-20*
