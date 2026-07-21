# External Integrations

**Analysis Date:** 2026-07-20

## APIs & External Services

**Mensageria (WhatsApp):**
- Evolution API - envio de confirmações síncronas e lembretes de agendamento
  - SDK/Client: fetch direto em `src/lib/whatsapp-helper.ts` (sem SDK)
  - Auth: `EVOLUTION_API_URL`, `EVOLUTION_GLOBAL_API_KEY` (criação de instância); `instance_token` por tenant em `whatsapp_configs`
  - Endpoints usados: `POST /message/sendText/{instanceName}`, `POST /instance/create`, `GET /instance/connect/{instanceName}` (QR base64, polling 5s em `src/app/dashboard/whatsapp/WhatsappClient.tsx`)
  - Exclusivo do plano Pro (gating em `src/app/actions/whatsapp.ts` e nos pontos de disparo); falha **silenciosa** para o cliente final

**Filas/Agendamento:**
- Upstash QStash - agendamento de lembretes assíncronos (`Upstash-Not-Before`)
  - Client: fetch direto em `src/lib/whatsapp-helper.ts`
  - Auth: `QSTASH_TOKEN`, `QSTASH_URL`; validação de webhook via `QSTASH_CURRENT_SIGNING_KEY` (comparado como query param `secret` — não é verificação de assinatura criptográfica)

**Pagamentos (planejado, não implementado):**
- Asaas - assinatura do profissional (planos Plus/Pro). Nenhum código presente em `src/`; roadmap em `docs/07-PLANOS_E_MONETIZACAO.md`. Simulação em dev via `docs/ASSINATURAS.md`

**E-mail (planejado, não implementado):**
- Resend - citado na stack oficial; nenhum código presente em `src/`

## Data Storage

**Databases:**
- PostgreSQL via Supabase Cloud (sem banco local; migrations aplicadas no cloud)
  - Connection: `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (RLS) / `SUPABASE_SECRET_KEY` (admin)
  - Client: SQL puro via `@supabase/ssr` (`src/lib/supabase/server.ts`, memoizado com `cache()`) e `@supabase/supabase-js` service-role (`src/lib/supabase/admin.ts`) — **sem ORM**
  - Multi-tenancy: RLS por `tenant_id = (SELECT auth.jwt() ->> 'org_id')`; schema declarativo em `supabase/schemas/00–09` (perfis_empresas, servicos, horarios_funcionamento, excecoes_agenda, whatsapp_configs, clientes, agendamentos, assinaturas, disparos_whatsapp)
  - Admin client restrito a: escritas do booking público (anon) e disparo de mensageria (webhook lembrete)

**File Storage:**
- Supabase Storage - bucket público `imagens-perfis` (logo/capa, paths `<org_id>/…`); sem RLS em `storage.objects` (default-deny da API); escrita só via `src/app/actions/imagens-perfil.ts` (auth + gating Pro + `createAdminClient()`); `next/image` liberado via `remotePatterns` em `next.config.ts`

**Caching:**
- None (apenas `cache()` do React por request)

## Authentication & Identity

**Auth Provider:**
- Clerk (`@clerk/nextjs` 7.x) - B2B multi-tenant via Organizations
  - Implementation: integração **nativa** third-party auth Clerk↔Supabase (session token padrão com claim `org_id`; **nunca** `getToken({ template: 'supabase' })`). Sem webhooks nem sync de usuários. Domínio configurado em `supabase/config.toml` (`becoming-prawn-0.clerk.accounts.dev`). Rotas protegidas via `clerkMiddleware` + `auth.protect()` em `src/proxy.ts`
  - B2C: **sem auth** (Fricção Zero) — role `anon` + validação rigorosa nas actions (`src/app/actions/public-booking.ts`)

## Monitoring & Observability

**Error Tracking:**
- None (sem Sentry ou similar)

**Analytics:**
- PostHog - funil de booking
  - Client-side: `posthog-js` (`src/lib/analytics/client.ts`)
  - Server-side: fetch direto ao endpoint `/i/v0/e/` (`src/lib/analytics/server.ts`), não-bloqueante via `after()` de `next/server`; no-op sem `NEXT_PUBLIC_POSTHOG_KEY`
  - Anonimização de tenant: hash com `ANALYTICS_TENANT_SALT` (`src/lib/analytics/tenant.ts`)

**Logs:**
- `console.*` apenas; auditoria de mensageria em tabela append-only `disparos_whatsapp` (sem conteúdo/telefone)

## CI/CD & Deployment

**Hosting:**
- Não configurado no repo (sem `vercel.json`)

**CI Pipeline:**
- None (sem `.github/workflows`)

## Environment Configuration

**Required env vars:**
- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`
- Clerk: chaves via `.env.local` (padrão `@clerk/nextjs`)
- QStash: `QSTASH_TOKEN`, `QSTASH_URL`, `QSTASH_CURRENT_SIGNING_KEY`
- Evolution: `EVOLUTION_API_URL`, `EVOLUTION_GLOBAL_API_KEY`
- PostHog: `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` (opcionais — no-op sem elas)
- App: `APP_URL` (base para callback do QStash), `ANALYTICS_TENANT_SALT`

**Secrets location:**
- `.env.local` (existe; não versionado; conteúdo não inspecionado)

## Webhooks & Callbacks

**Incoming:**
- `POST /api/webhooks/lembrete` (`src/app/api/webhooks/lembrete/route.ts`) - invocado pelo QStash no horário do lembrete; valida `?secret=` contra `QSTASH_CURRENT_SIGNING_KEY` (fallback inseguro `'secret-key'` quando a var não existe); checa se o agendamento não foi cancelado; rota pública em `src/proxy.ts`

**Outgoing:**
- `POST {QSTASH_URL}/v2/publish/{APP_URL}/api/webhooks/lembrete` - agendamento do lembrete com header `Upstash-Not-Before` (`src/lib/whatsapp-helper.ts`)
- Chamadas à Evolution API (sendText, instance/create, instance/connect)

---

*Integration audit: 2026-07-20*
