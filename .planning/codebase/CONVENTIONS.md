# Coding Conventions

**Analysis Date:** 2026-07-20

## Naming Patterns

**Files:**
- Server Components de rota: `page.tsx`, `layout.tsx`, `error.tsx` (padrão App Router)
- Ilhas client: PascalCase com sufixo `Client` — `DashboardClient.tsx`, `AgendaClient.tsx`, `ServicosClient.tsx` (padrão obrigatório: `page.tsx` Server busca dados + `<Nome>Client.tsx` interage)
- Componentes soltos: PascalCase — `NavPrincipal.tsx`, `NovoAgendamentoModal.tsx`, `LogoMarca.tsx`
- Libs/actions: kebab-case — `src/lib/booking-engine.ts`, `src/app/actions/public-booking.ts`, `src/app/actions/perfis-empresas.ts`
- Testes: `src/lib/__tests__/<modulo>.test.ts`

**Functions:**
- camelCase em **português de negócio**: `obterSlotsDisponiveis`, `criarAgendamentoPublico`, `listarServicos`, `salvarServico`, `formatarTelefone`, `calcularIntervalosLivres`, `gerarSlotsAntiBuraco`
- Server Actions agrupadas por domínio em `src/app/actions/` (um arquivo por domínio: `servicos.ts`, `agendamentos.ts`, `whatsapp.ts` etc.)

**Variables:**
- camelCase em português: `digitos`, `limitado`, `resultado`, `lista`
- Constantes de módulo em SCREAMING_SNAKE: `PLANOS` (`src/lib/planos.ts`)
- Colunas/tabelas do banco em snake_case pt-BR (`tenant_id`, `duracao_minutos`, `horarios_funcionamento`) — inputs TS usam camelCase e são mapeados na action (`duracaoMinutos` → `duracao_minutos`)

**Types:**
- Interfaces PascalCase, definidas localmente no arquivo que usa: `interface ServicoInput`, `interface DadosFake`
- Sem arquivo central de tipos; sem ORM/tipos gerados — tipos escritos à mão por módulo

## Code Style

**Formatting:**
- Prettier (`.prettierrc`): `tabWidth: 4`, `semi: false` (sem ponto e vírgula), `singleQuote: true`, `printWidth: 100`
- Hook de pré-commit reformata arquivos inteiros (diffs inflados são esperados)

**Linting:**
- ESLint 9 flat config: `eslint.config.mjs` com `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`
- Ignora `.next/`, `out/`, `build/`, `.agents/`, `.obsidian/`
- Rodar com `pnpm lint`

## Import Organization

**Order:**
1. Diretiva `'use server'` / `'use client'` no topo quando aplicável
2. Libs externas (`@clerk/nextjs/server`, `@supabase/supabase-js`)
3. Internos via alias `@/` (`@/lib/supabase/server`, `@/lib/planos`)
4. Relativos (`../booking-engine`) apenas em testes

**Path Aliases:**
- `@/` → `src/` (usar sempre em código de app)

## Error Handling

**Patterns:**
- Server Actions: `console.error('Erro ao X:', error.message)` + `throw new Error('<mensagem amigável em pt-BR>')` — nunca vazar erro cru do Supabase para a UI (ver `src/app/actions/servicos.ts`)
- Guard clauses no início: auth (`const { orgId } = await auth(); if (!orgId) throw ...`) e validação de input antes de tocar o banco
- Mensageria WhatsApp falha **silenciosamente** para o cliente final (frictionless) — erros logados, fluxo não interrompido (`src/lib/whatsapp-helper.ts`)

## Logging

**Framework:** `console.error` / `console` nativo (sem lib de logging)

**Patterns:**
- Logar erro com contexto em pt-BR antes de lançar erro amigável
- Auditoria de mensageria via tabela `disparos_whatsapp` (append-only, sem PII de conteúdo/telefone)
- Analytics via PostHog: `capturarEventoTenant` de `src/lib/analytics/server.ts` (no-op sem credenciais)

## Comments

**When to Comment:**
- Comentários em **português**, explicando intenção de negócio e decisões não óbvias (ex.: gating de plano em `servicos.ts`, motivo do `env` em `vitest.config.ts`)
- Regras críticas de domínio documentadas junto ao código (contrato anti double-booking na engine)

**JSDoc/TSDoc:**
- JSDoc curto (`/** ... */`) em pt-BR sobre funções exportadas de libs e actions, descrevendo propósito — sem `@param`/`@returns` formais (ver `src/lib/telefone.ts`, `src/app/actions/servicos.ts`)

## Function Design

**Size:** Funções puras pequenas em `src/lib/` (testáveis); actions maiores mas lineares com guard clauses

**Parameters:** Objetos de input tipados por interface local (`ServicoInput`); params opcionais como objeto (`regrasAcesso` na engine)

**Return Values:** Actions retornam dados diretos ou lançam `Error` com mensagem pt-BR; fallback defensivo `return data || []`

## Module Design

**Exports:** Named exports sempre (exceto componentes de rota Next, `export default`)

**Barrel Files:** Não usados — importar direto do arquivo do módulo

## Regras estruturais obrigatórias (CLAUDE.md)

- Server Components por padrão; `'use client'` só em ilhas, o mais baixo possível
- Mutações **exclusivamente** via Server Actions em `src/app/actions/`; rotas REST proibidas exceto `src/app/api/webhooks/`
- B2B: validar `const { orgId } = await auth()` e passar `tenant_id: orgId`; B2C: role `anon` + revalidação rigorosa na action
- Tailwind v4 mobile-first, paleta `zinc` (+ `emerald` concluído, `red` cancelado); pending states com `useActionState`/`useFormStatus`
- Tecnologias banidas: Prisma/Drizzle, better-auth, Mercado Pago
- Next.js 16 tem breaking changes (`src/proxy.ts` no lugar de `middleware.ts`) — consultar `node_modules/next/dist/docs/`
- Skills de referência em `.claude/skills/` e `.agents/skills/` (Clerk, Supabase, Upstash) — consultar ao mexer nessas integrações

---

*Convention analysis: 2026-07-20*
