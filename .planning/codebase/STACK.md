# Technology Stack

**Analysis Date:** 2026-07-20

## Languages

**Primary:**
- TypeScript 5.x (strict mode) - Toda a aplicação em `src/` (App Router, Server Actions, libs)

**Secondary:**
- SQL (Postgres) - Schema declarativo em `supabase/schemas/` e migrations geradas em `supabase/migrations/`

## Runtime

**Environment:**
- Node.js (tipos `@types/node` ^20; sem `.nvmrc` — versão não pinada)

**Package Manager:**
- pnpm 11.9.0 (pinado em `package.json` via campo `packageManager`)
- Lockfile: presente (`pnpm-lock.yaml`)

## Frameworks

**Core:**
- Next.js 16.2.10 (App Router) - Framework fullstack; **breaking changes vs. treinamento** (ex.: `src/proxy.ts` no lugar de `middleware.ts`); consultar `node_modules/next/dist/docs/`
- React 19.2.4 / react-dom 19.2.4 - UI; Server Components por padrão, `'use client'` só em ilhas
- Tailwind CSS v4 (via `@tailwindcss/postcss`) - Estilização, mobile-first, paleta `zinc`

**Testing:**
- Vitest ^4.1.10 - Testes unitários (`pnpm test`); config em `vitest.config.ts` com env stubs (QSTASH_TOKEN, EVOLUTION_API_URL) para constantes de módulo

**Build/Dev:**
- ESLint 9 + `eslint-config-next` - Lint (`pnpm lint`), config em `eslint.config.mjs`
- Prettier ^3.9.5 - Formatação, config em `.prettierrc` (hook reformata arquivos inteiros)
- Supabase CLI - Migrations declarativas (`supabase db diff`), config em `supabase/config.toml`

## Key Dependencies

**Critical:**
- `@clerk/nextjs` ^7.5.12 - Auth B2B multi-tenant (Organizations); `clerkMiddleware` em `src/proxy.ts`
- `@clerk/ui` ^1.24.1 + `@clerk/localizations` ^4.12.0 - Componentes e pt-BR do Clerk
- `@supabase/ssr` ^0.12.0 - Cliente server-side com cookies (`src/lib/supabase/server.ts`)
- `@supabase/supabase-js` ^2.110.0 - Cliente admin/service-role (`src/lib/supabase/admin.ts`)
- `posthog-js` ^1.399.2 - Analytics client-side (`src/lib/analytics/client.ts`); server-side usa fetch direto sem posthog-node

**Infrastructure:**
- `next-themes` ^0.4.6 - Tema claro/escuro

**Sem ORM (decisão explícita):** SQL puro via Supabase. **Banidos:** Prisma/Drizzle, better-auth, Mercado Pago.

## Configuration

**Environment:**
- `.env.local` presente (conteúdo não lido — contém secrets)
- Vars requeridas (de `grep process.env` em `src/`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `QSTASH_TOKEN`, `QSTASH_URL`, `QSTASH_CURRENT_SIGNING_KEY`, `EVOLUTION_API_URL`, `EVOLUTION_GLOBAL_API_KEY`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, `APP_URL`, `ANALYTICS_TENANT_SALT`
- PostHog é no-op sem `NEXT_PUBLIC_POSTHOG_KEY` (falha silenciosa por design)

**Build:**
- `next.config.ts` - `images.remotePatterns` para o Storage do Supabase (bucket `imagens-perfis`); `serverActions.bodySizeLimit: '6mb'` (upload de capa)
- `tsconfig.json` - strict, alias `@/*` → `./src/*`, module resolution `bundler`
- `postcss.config.mjs` - Tailwind v4 via PostCSS

## Platform Requirements

**Development:**
- Node.js + pnpm 11.9.0; Supabase CLI (`npx supabase`) para diffs de schema — banco é **Supabase Cloud**, sem instância local

**Production:**
- Alvo Next.js self-hosted ou Vercel (não há `vercel.json` nem CI em `.github/workflows` — deploy/CI não configurados no repo)

---

*Stack analysis: 2026-07-20*
