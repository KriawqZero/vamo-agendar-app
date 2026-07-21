# Codebase Structure

**Analysis Date:** 2026-07-20

## Directory Layout

```
vamo-agendar-app/
├── src/
│   ├── proxy.ts               # Middleware Clerk (Next.js 16 — substitui middleware.ts)
│   ├── app/
│   │   ├── layout.tsx         # Root layout + providers
│   │   ├── page.tsx           # Landing principal (+ ilhas: DemoAgendamento, PalcoAuth etc.)
│   │   ├── globals.css        # Tailwind v4
│   │   ├── actions/           # Server Actions (todas as mutações, por domínio)
│   │   ├── api/webhooks/lembrete/route.ts  # Único endpoint REST (QStash)
│   │   ├── book/[slug]/       # Booking público B2C (wizard + etapas/)
│   │   ├── dashboard/         # Área B2B protegida (agenda, servicos, whatsapp, plano)
│   │   ├── para/[nicho]/      # Landings verticais por nicho (SSG)
│   │   ├── sign-in/, sign-up/ # Rotas Clerk (catch-all)
│   ├── components/analytics/  # Providers/captura PostHog (client)
│   └── lib/
│       ├── supabase/          # server.ts (RLS) e admin.ts (service role)
│       ├── analytics/         # client.ts, server.ts, tenant.ts
│       ├── __tests__/         # Testes unitários (vitest)
│       └── *.ts               # Domínio puro (booking-engine, horarios, timezone…)
├── supabase/
│   ├── schemas/               # Schema declarativo 00–09 (fonte da verdade)
│   └── migrations/            # Geradas via `supabase db diff` — não escrever à mão
├── docs/                      # Documentação viva (01–08, PENDENCIAS.md…)
├── scripts/mock-evolution.mjs # Mock da Evolution API para dev
├── docker/                    # Infra local auxiliar
├── artes-aprovadas-design/    # Branding aprovado (paleta/logo oficiais)
├── lixo/                      # Docs descartados — NUNCA usar como referência
├── public/                    # Assets estáticos
├── vitest.config.ts           # Config de testes
└── next.config.ts, eslint.config.mjs, postcss.config.mjs
```

## Directory Purposes

**`src/app/actions/`:**
- Purpose: todas as mutações via Server Actions, agrupadas por domínio
- Key files: `agendamentos.ts`, `agenda.ts`, `clientes.ts`, `imagens-perfil.ts`, `perfis-empresas.ts`, `public-booking.ts`, `servicos.ts`, `whatsapp.ts`

**`src/app/book/[slug]/`:**
- Purpose: fluxo público B2C sem login
- Contains: `page.tsx` (Server), `BookingApp.tsx` (orquestrador client), `etapas/EtapaServico|DataHora|Contato|Sucesso.tsx`, componentes de layout (`PainelMarca.tsx`, `StepperVertical.tsx`, `BarraInferior.tsx`, `RodapeAcaoDesktop.tsx`), helpers `passos.ts`, `acento.ts`

**`src/app/dashboard/`:**
- Purpose: área B2B (Clerk-protected)
- Pattern por seção: `page.tsx` (Server) + `<Nome>Client.tsx` (client) — ex.: `agenda/page.tsx` + `agenda/AgendaClient.tsx`
- Key files: `layout.tsx`, `NavPrincipal.tsx`, `NovoAgendamentoModal.tsx`, `error.tsx`

**`src/lib/`:**
- Purpose: domínio puro e integrações
- Key files: `booking-engine.ts` (slots), `horarios.ts` (validação de janelas), `timezone.ts`, `planos.ts`/`assinaturas.ts` (gating), `whatsapp-helper.ts` (templates), `notificacoes-agendamento.ts`, `telefone.ts`, `cores.ts`, `nichos.ts`

**`supabase/schemas/`:**
- Purpose: fonte da verdade do banco; numerado `00_…`–`09_…` para respeitar FKs em ordem lexicográfica

## Key File Locations

**Entry Points:**
- `src/proxy.ts`: middleware Clerk + rotas públicas
- `src/app/layout.tsx`: root layout

**Configuration:**
- `next.config.ts`, `vitest.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `tsconfig.json` (alias `@/` → `src/`)
- `supabase/config.toml` (dir `supabase/`)

**Core Logic:**
- `src/lib/booking-engine.ts`, `src/app/actions/public-booking.ts`, `src/lib/supabase/server.ts`

**Testing:**
- `src/lib/__tests__/*.test.ts` (booking-engine, horarios, timezone, whatsapp-helper)

## Naming Conventions

**Files:**
- Componentes React: `PascalCase.tsx` (`AgendaClient.tsx`, `EtapaContato.tsx`)
- Ilhas client: sufixo `Client.tsx` pareado com `page.tsx`
- Libs/actions: `kebab-case.ts` (`booking-engine.ts`, `public-booking.ts`)
- Testes: `<nome>.test.ts` em `src/lib/__tests__/`
- Schemas SQL: `NN_nome_plural.sql` numerados

**Directories:**
- Rotas em kebab-case; dinâmicas com `[slug]`/`[nicho]`; catch-all Clerk `[[...sign-in]]`

**Domínio:**
- Funções e domínio de negócio em português (`criarAgendamentoPublico`, `obterSlotsDisponiveis`); tabelas pt-BR plural, colunas singular, `snake_case`

## Where to Add New Code

**New Feature (B2B):**
- Página: `src/app/dashboard/<secao>/page.tsx` + `<Nome>Client.tsx`
- Mutações: `src/app/actions/<dominio>.ts` (validar `orgId`)
- Nav: registrar em `src/app/dashboard/NavPrincipal.tsx`

**New Feature (B2C/booking):**
- Etapa/UI: `src/app/book/[slug]/` (etapas em `etapas/`, ordem em `passos.ts`)
- Action pública: `src/app/actions/public-booking.ts`

**Schema change:**
- Editar/criar `.sql` em `supabase/schemas/` → `supabase stop && supabase db diff -f <nome>` → RLS granular + `COMMENT ON`

**Utilities:**
- Lógica pura: `src/lib/<nome>.ts` + teste em `src/lib/__tests__/`

**Nova rota pública:**
- Adicionar ao `isPublicRoute` em `src/proxy.ts`

**Webhooks de terceiros (única exceção REST):**
- `src/app/api/webhooks/<nome>/route.ts`

## Special Directories

**`lixo/`:**
- Purpose: docs descartados no pivô (contêm tecnologias banidas) — nunca referenciar
- Committed: Yes

**`supabase/migrations/`:**
- Generated: Yes (via `supabase db diff`); editável apenas na fase DEV atual
- Committed: Yes

**`node_modules/next/dist/docs/`:**
- Purpose: docs do Next.js 16 — consultar antes de usar APIs do framework (breaking changes vs treinamento)

**`artes-aprovadas-design/`:**
- Purpose: identidade visual oficial (paleta azul/roxo, Poppins) — fonte de branding
- Committed: Yes

---

*Structure analysis: 2026-07-20*
