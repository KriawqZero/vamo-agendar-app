<!-- GSD:project-start source:PROJECT.md -->

## Project

**VamoAgendar**

SaaS B2B2C de agendamento online para profissionais independentes e pequenas empresas
no Brasil (designers de sobrancelha, lash designers, manicures, barbeiros autônomos). O
profissional autentica via Clerk e gerencia agenda, serviços e horários no dashboard; o
cliente final acessa um link público (`/book/[slug]`), escolhe serviço → data/hora →
informa contato e confirma — **sem login, sem cadastro, sem validação de e-mail ou OTP**
(regra de Fricção Zero). Monetização por assinatura do profissional; o VamoAgendar não
processa o pagamento do serviço prestado ao cliente final.

O produto está construído e funcionando. O milestone atual é **abrir ao público**.

**Core Value:** Um agendamento real, feito por um cliente final que nunca ouviu falar do VamoAgendar,
cair na agenda do profissional sem que nada quebre no caminho.

### Constraints

- **Disponibilidade**: 4-5 horas por dia — o roadmap prioriza por valor decrescente para
  que qualquer corte caia sempre no item menos crítico

- **Timeline**: sem data fixa de lançamento — abre quando a barra de segurança e
  obrigações estiver satisfeita, não quando o calendário mandar

- **Dependência externa**: conta Asaas só tem sandbox; a aprovação para produção não
  depende de código e é o único item com prazo fora do controle do owner

- **Dependência externa**: verificação do domínio no Resend (SPF/DKIM) exige mudança de
  DNS e propagação — tarefa do owner, bloqueia os e-mails transacionais

- **Orçamento**: Supabase permanece no plano Free (sem custo mensal de banco)
- **Tech stack**: Next.js 16 + React 19 + Tailwind v4 + Clerk + Supabase (SQL puro, sem
  ORM) + Asaas + QStash + Evolution API + Resend + PostHog. Prisma/Drizzle, better-auth e
  Mercado Pago são proibidos (descartados no pivô)

- **Produto**: Fricção Zero é inegociável — nenhuma proteção nova pode adicionar fricção
  visível ao cliente final (sem CAPTCHA, sem login, sem OTP)
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

## Languages

- TypeScript 5.x (strict mode) - Toda a aplicação em `src/` (App Router, Server Actions, libs)
- SQL (Postgres) - Schema declarativo em `supabase/schemas/` e migrations geradas em `supabase/migrations/`

## Runtime

- Node.js (tipos `@types/node` ^20; sem `.nvmrc` — versão não pinada)
- pnpm 11.9.0 (pinado em `package.json` via campo `packageManager`)
- Lockfile: presente (`pnpm-lock.yaml`)

## Frameworks

- Next.js 16.2.10 (App Router) - Framework fullstack; **breaking changes vs. treinamento** (ex.: `src/proxy.ts` no lugar de `middleware.ts`); consultar `node_modules/next/dist/docs/`
- React 19.2.4 / react-dom 19.2.4 - UI; Server Components por padrão, `'use client'` só em ilhas
- Tailwind CSS v4 (via `@tailwindcss/postcss`) - Estilização, mobile-first, paleta `zinc`
- Vitest ^4.1.10 - Testes unitários (`pnpm test`); config em `vitest.config.ts` com env stubs (QSTASH_TOKEN, EVOLUTION_API_URL) para constantes de módulo
- ESLint 9 + `eslint-config-next` - Lint (`pnpm lint`), config em `eslint.config.mjs`
- Prettier ^3.9.5 - Formatação, config em `.prettierrc` (hook reformata arquivos inteiros)
- Supabase CLI - Migrations declarativas (`supabase db diff`), config em `supabase/config.toml`

## Key Dependencies

- `@clerk/nextjs` ^7.5.12 - Auth B2B multi-tenant (Organizations); `clerkMiddleware` em `src/proxy.ts`
- `@clerk/ui` ^1.24.1 + `@clerk/localizations` ^4.12.0 - Componentes e pt-BR do Clerk
- `@supabase/ssr` ^0.12.0 - Cliente server-side com cookies (`src/lib/supabase/server.ts`)
- `@supabase/supabase-js` ^2.110.0 - Cliente admin/service-role (`src/lib/supabase/admin.ts`)
- `posthog-js` ^1.399.2 - Analytics client-side (`src/lib/analytics/client.ts`); server-side usa fetch direto sem posthog-node
- `next-themes` ^0.4.6 - Tema claro/escuro

## Configuration

- `.env.local` presente (conteúdo não lido — contém secrets)
- Vars requeridas (de `grep process.env` em `src/`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `QSTASH_TOKEN`, `QSTASH_URL`, `QSTASH_CURRENT_SIGNING_KEY`, `EVOLUTION_API_URL`, `EVOLUTION_GLOBAL_API_KEY`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, `APP_URL`, `ANALYTICS_TENANT_SALT`
- PostHog é no-op sem `NEXT_PUBLIC_POSTHOG_KEY` (falha silenciosa por design)
- `next.config.ts` - `images.remotePatterns` para o Storage do Supabase (bucket `imagens-perfis`); `serverActions.bodySizeLimit: '6mb'` (upload de capa)
- `tsconfig.json` - strict, alias `@/*` → `./src/*`, module resolution `bundler`
- `postcss.config.mjs` - Tailwind v4 via PostCSS

## Platform Requirements

- Node.js + pnpm 11.9.0; Supabase CLI (`npx supabase`) para diffs de schema — banco é **Supabase Cloud**, sem instância local
- Alvo Next.js self-hosted ou Vercel (não há `vercel.json` nem CI em `.github/workflows` — deploy/CI não configurados no repo)

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

## Naming Patterns

- Server Components de rota: `page.tsx`, `layout.tsx`, `error.tsx` (padrão App Router)
- Ilhas client: PascalCase com sufixo `Client` — `DashboardClient.tsx`, `AgendaClient.tsx`, `ServicosClient.tsx` (padrão obrigatório: `page.tsx` Server busca dados + `<Nome>Client.tsx` interage)
- Componentes soltos: PascalCase — `NavPrincipal.tsx`, `NovoAgendamentoModal.tsx`, `LogoMarca.tsx`
- Libs/actions: kebab-case — `src/lib/booking-engine.ts`, `src/app/actions/public-booking.ts`, `src/app/actions/perfis-empresas.ts`
- Testes: `src/lib/__tests__/<modulo>.test.ts`
- camelCase em **português de negócio**: `obterSlotsDisponiveis`, `criarAgendamentoPublico`, `listarServicos`, `salvarServico`, `formatarTelefone`, `calcularIntervalosLivres`, `gerarSlotsAntiBuraco`
- Server Actions agrupadas por domínio em `src/app/actions/` (um arquivo por domínio: `servicos.ts`, `agendamentos.ts`, `whatsapp.ts` etc.)
- camelCase em português: `digitos`, `limitado`, `resultado`, `lista`
- Constantes de módulo em SCREAMING_SNAKE: `PLANOS` (`src/lib/planos.ts`)
- Colunas/tabelas do banco em snake_case pt-BR (`tenant_id`, `duracao_minutos`, `horarios_funcionamento`) — inputs TS usam camelCase e são mapeados na action (`duracaoMinutos` → `duracao_minutos`)
- Interfaces PascalCase, definidas localmente no arquivo que usa: `interface ServicoInput`, `interface DadosFake`
- Sem arquivo central de tipos; sem ORM/tipos gerados — tipos escritos à mão por módulo

## Code Style

- Prettier (`.prettierrc`): `tabWidth: 4`, `semi: false` (sem ponto e vírgula), `singleQuote: true`, `printWidth: 100`
- Hook de pré-commit reformata arquivos inteiros (diffs inflados são esperados)
- ESLint 9 flat config: `eslint.config.mjs` com `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`
- Ignora `.next/`, `out/`, `build/`, `.agents/`, `.obsidian/`
- Rodar com `pnpm lint`

## Import Organization

- `@/` → `src/` (usar sempre em código de app)

## Error Handling

- Server Actions: `console.error('Erro ao X:', error.message)` + `throw new Error('<mensagem amigável em pt-BR>')` — nunca vazar erro cru do Supabase para a UI (ver `src/app/actions/servicos.ts`)
- Guard clauses no início: auth (`const { orgId } = await auth(); if (!orgId) throw ...`) e validação de input antes de tocar o banco
- Mensageria WhatsApp falha **silenciosamente** para o cliente final (frictionless) — erros logados, fluxo não interrompido (`src/lib/whatsapp-helper.ts`)

## Logging

- Logar erro com contexto em pt-BR antes de lançar erro amigável
- Auditoria de mensageria via tabela `disparos_whatsapp` (append-only, sem PII de conteúdo/telefone)
- Analytics via PostHog: `capturarEventoTenant` de `src/lib/analytics/server.ts` (no-op sem credenciais)

## Comments

- Comentários em **português**, explicando intenção de negócio e decisões não óbvias (ex.: gating de plano em `servicos.ts`, motivo do `env` em `vitest.config.ts`)
- Regras críticas de domínio documentadas junto ao código (contrato anti double-booking na engine)
- JSDoc curto (`/** ... */`) em pt-BR sobre funções exportadas de libs e actions, descrevendo propósito — sem `@param`/`@returns` formais (ver `src/lib/telefone.ts`, `src/app/actions/servicos.ts`)

## Function Design

## Module Design

## Regras estruturais obrigatórias (CLAUDE.md)

- Server Components por padrão; `'use client'` só em ilhas, o mais baixo possível
- Mutações **exclusivamente** via Server Actions em `src/app/actions/`; rotas REST proibidas exceto `src/app/api/webhooks/`
- B2B: validar `const { orgId } = await auth()` e passar `tenant_id: orgId`; B2C: role `anon` + revalidação rigorosa na action
- Tailwind v4 mobile-first, paleta `zinc` (+ `emerald` concluído, `red` cancelado); pending states com `useActionState`/`useFormStatus`
- Tecnologias banidas: Prisma/Drizzle, better-auth, Mercado Pago
- Next.js 16 tem breaking changes (`src/proxy.ts` no lugar de `middleware.ts`) — consultar `node_modules/next/dist/docs/`
- Skills de referência em `.claude/skills/` e `.agents/skills/` (Clerk, Supabase, Upstash) — consultar ao mexer nessas integrações

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

## System Overview

```text

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

- Multi-tenant via Clerk Organizations → claim `org_id` no JWT → RLS no Postgres (sem sync de usuários, sem webhooks de auth)
- Dois fluxos com o mesmo client Supabase: B2B autenticado (role `authenticated`) e B2C anônimo (role `anon` — Fricção Zero, cliente final nunca loga)
- SQL puro via `@supabase/ssr`; schema declarativo em `supabase/schemas/` com migrations geradas por `supabase db diff`
- Domínio de negócio nomeado em português (`criarAgendamentoPublico`, `obterSlotsDisponiveis`)

## Layers

- Purpose: páginas Server Components + ilhas Client (`*Client.tsx`)
- Depends on: Server Actions e libs de domínio
- Pattern: `page.tsx` (Server, busca dados) + `<Nome>Client.tsx` (`'use client'`, interação)
- Purpose: todas as mutações; validação de auth/tenant e regras de negócio
- Depends on: `src/lib/*` e clients Supabase
- B2B: valida `const { orgId } = await auth()` e passa `tenant_id: orgId`; B2C: role `anon` + revalidação rigorosa na action
- Purpose: funções puras/testáveis (engine de slots, sobreposição de horários, timezone, templates WhatsApp, gating de planos)
- Depends on: nada de UI; testes em `src/lib/__tests__/`
- Purpose: schema declarativo (`supabase/schemas/00–09_*.sql`, ordem lexicográfica respeita FKs) + migrations geradas (`supabase/migrations/`)
- RLS obrigatório, políticas granulares por ação, `tenant_id text` = `org_...` do Clerk

## Data Flow

### Agendamento público (B2C)

### Fluxo B2B (dashboard)

- Sem store global; estado local nas ilhas client, pending via `useActionState`/`useFormStatus`; dados server-first

## Key Abstractions

- `obterSlotsDisponiveis` = janelas de funcionamento − exceções − agendamentos → `calcularIntervalosLivres` → `gerarSlotsAntiBuraco` (candidatos de 15 em 15 min + candidato colado no fim; rejeita sobras invendáveis)
- `regrasAcesso { antecedenciaMinutos, horizonteDias }` opcional: fluxo público passa; dashboard omite (walk-in)
- File: `src/lib/booking-engine.ts` — o formato da saída é contrato do anti double-booking
- `src/lib/planos.ts` + `src/lib/assinaturas.ts`; WhatsApp e personalização visual são exclusivos do Pro — gating nas actions, nunca só na UI
- `createClient()` em `src/lib/supabase/server.ts` com `cache()` do React; injeta JWT do Clerk só quando há sessão; `createAdminClient()` (`src/lib/supabase/admin.ts`) para escrita em Storage e casos que exigem bypass de RLS

## Entry Points

## Architectural Constraints

- **Timezone:** banco em UTC; interpretação no fuso do tenant (`perfis_empresas.timezone`) via `src/lib/timezone.ts`
- **Storage sem RLS:** `storage.objects` sem políticas (role postgres não é owner); toda escrita passa por `src/app/actions/imagens-perfil.ts` com `createAdminClient()`
- **Stack banida:** Prisma/Drizzle, better-auth, Mercado Pago — nunca introduzir
- **Sem rotas REST próprias:** mutações só via Server Actions; exceção única `src/app/api/webhooks/`

## Anti-Patterns

### Ler personalização crua na UI pública

### `getToken({ template: 'supabase' })`

### Editar `supabase/migrations/` à mão

## Error Handling

- Error boundary de dashboard em `src/app/dashboard/error.tsx`; `not-found.tsx` no booking (`src/app/book/[slug]/not-found.tsx`)
- Validação defensiva na própria action (double-booking, telefone `replace(/\D/g, '')`, gating de plano)

## Cross-Cutting Concerns

<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

| Skill | Description | Path |
|-------|-------------|------|
| diario-socio | Use para atualizar o painel de progresso do sócio (página com link fixo) com os dias trabalhados desde a última atualização (invocar com /diario-socio). | `.claude/skills/diario-socio/SKILL.md` |
| nova-feature | Use quando for implementar uma nova feature completa no VamoAgendar (invocar com /nova-feature <descrição da feature>). | `.claude/skills/nova-feature/SKILL.md` |
| relatorio-socio | Use para gerar o relatório semanal do sócio e publicá-lo como Google Doc na pasta compartilhada do Drive (invocar com /relatorio-socio). | `.claude/skills/relatorio-socio/SKILL.md` |
| revisao | Use quando for revisar o branch atual antes de merge (invocar com /revisao [ref-base opcional]). | `.claude/skills/revisao/SKILL.md` |
| clerk | Clerk authentication router. Use when user asks about Clerk CLI operations, adding authentication, setting up Clerk, custom sign-in flows, Swift or native iOS auth, native Android auth, Next.js patterns, React patterns, Vue patterns, Nuxt patterns, Astro patterns, TanStack Start patterns, Expo patterns, React Router patterns, Chrome Extension patterns, organizations, billing, subscriptions, payments, pricing, plans, seat-based pricing, feature entitlements, syncing users, or testing. Automatically routes to the specific skill based on their task. | `.agents/skills/clerk/SKILL.md` |
| clerk-android | Implement Clerk authentication for native Android apps using Kotlin and Jetpack Compose with clerk-android source-guided patterns. Use for prebuilt AuthView/UserButton or custom API-driven auth flows. Do not use for Expo or React Native projects. | `.agents/skills/clerk-android/SKILL.md` |
| clerk-astro-patterns | 'Astro patterns with Clerk — middleware, SSR pages, island components, API routes, static vs SSR rendering. Triggers on: astro clerk, clerk astro middleware, astro protected page, clerk island component, astro API route auth, clerk astro SSR.' | `.agents/skills/clerk-astro-patterns/SKILL.md` |
| clerk-backend-api | "Clerk Backend REST API explorer and executor. Browse tags, inspect endpoint schemas, and execute authenticated requests. Use when listing users, managing organizations, or calling any Clerk API endpoint." | `.agents/skills/clerk-backend-api/SKILL.md` |
| clerk-billing | Clerk Billing for subscription management - render Clerk's PricingTable and in-app checkout drawer, configure subscription plans, seat-limit plans for B2B, feature entitlements with has(), and billing webhooks. Use for SaaS monetization, plan gating, checkout flows, trials, invoicing, and subscription lifecycle management. | `.agents/skills/clerk-billing/SKILL.md` |
| clerk-chrome-extension-patterns | 'Chrome Extension auth with @clerk/chrome-extension -- popup/sidepanel setup, syncHost for OAuth/SAML via web app, createClerkClient for service workers and headless extensions, stable CRX ID. Triggers on: Chrome extension auth, Plasmo clerk, popup sign-in, syncHost, background service worker token, createClerkClient, headless extension.' | `.agents/skills/clerk-chrome-extension-patterns/SKILL.md` |
| clerk-cli | >- Operate the Clerk CLI (`clerk` binary) for authentication, user/org/session management, deploy verification, instance config, env keys, and any Clerk Backend or Platform API call. Use when the user mentions Clerk management tasks, "list clerk users", "create a clerk user", "update organization", "pull clerk config", "clerk env pull", "clerk doctor", "clerk deploy", "clerk deploy status", "clerk api", or any ad-hoc Clerk API request. Prefer the CLI over raw HTTP: it handles auth, key resolution, app/instance targeting, and formatting automatically. | `.agents/skills/clerk-cli/SKILL.md` |
| clerk-custom-ui | Custom authentication flows and component appearance - hooks (useSignIn, useSignUp), themes, colors, fonts, CSS. Use for custom sign-in/sign-up flows, appearance styling, visual customization, branding. | `.agents/skills/clerk-custom-ui/SKILL.md` |
| clerk-expo | Add Clerk authentication to Expo and React Native apps using @clerk/expo. Use for Expo setup, prebuilt native components (AuthView, UserButton), custom sign-in/sign-up flows (email, password, SMS/phone OTP, MFA), OAuth/SSO, native Google/Apple sign-in, Expo Router protected routes, biometrics, and push notifications. Do not use for native Swift/iOS, native Android/Kotlin, or web-only framework projects. | `.agents/skills/clerk-expo/SKILL.md` |
| clerk-nextjs-patterns | Advanced Next.js patterns - middleware, Server Actions, caching with Clerk. | `.agents/skills/clerk-nextjs-patterns/SKILL.md` |
| clerk-nuxt-patterns | 'Nuxt 3 auth patterns with @clerk/nuxt - middleware, composables, server API routes, SSR. Triggers on: Nuxt auth, useAuth composable, clerkMiddleware Nuxt, server API Clerk, Nuxt route protection.' | `.agents/skills/clerk-nuxt-patterns/SKILL.md` |
| clerk-orgs | Clerk Organizations for B2B SaaS - create multi-tenant apps with org switching, role-based access, verified domains, and enterprise SSO. Use for team workspaces, RBAC, org-based routing, member management. | `.agents/skills/clerk-orgs/SKILL.md` |
| clerk-react-patterns | 'React SPA auth patterns with @clerk/react for Vite/CRA - ClerkProvider setup, useAuth/useUser/useClerk hooks, React Router protected routes, custom sign-in flows. Triggers on: Vite Clerk setup, React Router auth, useAuth hook, protected route, custom sign-in form React.' | `.agents/skills/clerk-react-patterns/SKILL.md` |
| clerk-react-router-patterns | 'React Router v7/v8 patterns with Clerk — rootAuthLoader, getAuth in loaders, clerkMiddleware, protected routes, SSR user data, org switching. Triggers on: react-router auth, rootAuthLoader, getAuth loader, react-router protected route, loader authentication, SSR auth react-router, useNavigate may be used only in the context of a Router.' | `.agents/skills/clerk-react-router-patterns/SKILL.md` |
| clerk-setup | Add Clerk authentication to any project by following the official quickstart guides. | `.agents/skills/clerk-setup/SKILL.md` |
| clerk-swift | Implement Clerk authentication for native Swift and iOS apps using ClerkKit and ClerkKitUI source-guided patterns. Use for prebuilt AuthView or custom native flows. Do not use for Expo or React Native projects. | `.agents/skills/clerk-swift/SKILL.md` |
| clerk-tanstack-patterns | 'TanStack React Start auth patterns with @clerk/tanstack-react-start - createServerFn, beforeLoad guards, loaders, Vinxi server. Triggers on: TanStack auth, createServerFn clerk, beforeLoad protection, TanStack Start middleware.' | `.agents/skills/clerk-tanstack-patterns/SKILL.md` |
| clerk-testing | E2E testing for Clerk apps. Use with Playwright or Cypress for auth flow tests. | `.agents/skills/clerk-testing/SKILL.md` |
| clerk-vue-patterns | 'Vue 3 patterns with Clerk — composables (useAuth, useUser, useClerk, useOrganization), Vue Router guards, Pinia auth store integration. Triggers on: vue clerk, useAuth vue, clerk composables, vue router clerk guard, pinia auth clerk. For Nuxt, use clerk-nuxt-patterns instead.' | `.agents/skills/clerk-vue-patterns/SKILL.md` |
| clerk-webhooks | Clerk webhooks for real-time events and data syncing. Verify with verifyWebhook from the framework-specific package. Handle user, session, organization, billing, and payment events. Build event-driven features like database sync, notifications, and integrations. | `.agents/skills/clerk-webhooks/SKILL.md` |
| supabase | "Use when doing ANY task involving Supabase. Triggers: Supabase products (Database, Auth, Edge Functions, Realtime, Storage, Vectors, Cron, Queues); client libraries and SSR integrations (supabase-js, @supabase/ssr) in Next.js, React, SvelteKit, Astro, Remix; auth issues (login, logout, sessions, JWT, cookies, getSession, getUser, getClaims, RLS); Supabase CLI or MCP server; schema changes, migrations, declarative schemas, security audits, Postgres extensions (pg_graphql, pg_cron, pg_vector)." | `.agents/skills/supabase/SKILL.md` |
| supabase-postgres-best-practices | Postgres performance optimization and best practices from Supabase. Use this skill when writing, reviewing, or optimizing Postgres queries, schema designs, or database configurations. | `.agents/skills/supabase-postgres-best-practices/SKILL.md` |
| upstash | Work with any Upstash TypeScript/JavaScript SDK including Redis, Box, QStash, Workflow, Vector, Search and Ratelimit. Use when the user is working with any Upstash product or SDK. | `.agents/skills/upstash/SKILL.md` |
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
