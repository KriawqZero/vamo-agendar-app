---
status: temporario
gerado: 2026-07-15 18:51
agente: verificacao
modelo: haiku
---

# Auditoria Completa — VamoAgendar 2026-07-15

## Resumo Executivo

| Comando | Status | Detalhes |
|---------|--------|----------|
| `pnpm install --frozen-lockfile` | ✅ OK | node_modules completo, não foi necessário instalar |
| `pnpm exec tsc --noEmit` | ✅ OK | Sem erros de tipo |
| `pnpm lint` (src/) | ⚠️ FALHA | 13 erros, 4 warnings em src/ (+ 149 erros em .obsidian/ e .agents/skills/, fora do escopo) |
| `pnpm test` | ✅ OK | 32 testes passando em 3 arquivos |
| `pnpm build` | ✅ OK | Build completo de produção bem-sucedido |
| `pnpm audit` | ⚠️ FALHA | 2 vulnerabilidades moderadas detectadas |

---

## 1. Verificação de Tipos (TypeScript)

**Status:** ✅ PASSOU

Sem erros de tipo. `pnpm exec tsc --noEmit` executado com sucesso.

---

## 2. Linting (ESLint)

**Status:** ⚠️ FALHA (13 erros + 4 warnings em src/)

### Erros em src/ (arquivos de produção)

**Total: 13 erros, 4 warnings**

#### Erros por categoria:

1. **react-hooks/set-state-in-effect (4 erros)**
   - Chamadas síncronas de `setState()` dentro de `useEffect()`
   - Locais:
     - `src/app/DemoAgendamento.tsx:65` — `setDias(proximos)`
     - `src/app/book/[slug]/BookingWizard.tsx:90` — `setDatasDisponiveis(datas)`
     - `src/app/dashboard/DashboardClient.tsx:117` — `setProximosVisivel()`
     - `src/app/dashboard/DashboardClient.tsx:188` — `setLinkPublico()`
   - **Causa:** Padrão anti-pattern que causa re-renders cascata. Preferir resolver o efeito com useState inicial ou refatorar lógica.

2. **@typescript-eslint/no-explicit-any (8 erros)**
   - Uso de `any` sem especificação de tipo
   - Locais:
     - `src/app/book/[slug]/BookingWizard.tsx:114, 180`
     - `src/app/dashboard/agenda/AgendaClient.tsx:139, 161, 201, 214`
     - `src/app/dashboard/servicos/ServicosClient.tsx:100, 115`
   - **Causa:** Tipos não especificados em handlers/props. Require type narrowing or interface definition.

3. **@typescript-eslint/ban-ts-comment (1 erro)**
   - `src/lib/booking-engine.ts:140` — Usar `@ts-expect-error` em vez de `@ts-ignore`
   - **Causa:** `@ts-ignore` será inerte se a linha seguinte estiver correta. Use `@ts-expect-error` para detectar falsos positivos.

#### Warnings em src/ (4)

- `src/app/layout.tsx:7` — 3 imports não usados: `dark`, `neobrutalism`, `shadcn` (provavelmente temas tema definidos mas não aplicados)
- `src/app/dashboard/whatsapp/WhatsappClient.tsx:419` — Usar `<Image />` de next/image em vez de `<img>`

#### Erros fora de src/ (não são escopo de produção, mas reportados):

- `.obsidian/plugins/obsidian-kanban/main.js` — ~140 warnings (código minificado de plugin externo, ignorar)
- `.agents/skills/upstash/upstash-qstash-js/advanced/multi-region/verify-multi-region-setup.ts` — 1 erro (regra `unicorn/prefer-module` não encontrada em config) + 3 warnings

---

## 3. Testes (Vitest)

**Status:** ✅ PASSOU

```
Test Files: 3 passed (3)
Tests: 32 passed (32)
Duration: 310ms
```

### Arquivos de teste:

- `src/lib/__tests__/whatsapp-helper.test.ts`
- `src/lib/__tests__/timezone.test.ts`
- `src/lib/__tests__/booking-engine.test.ts`

---

## 4. Build (Next.js 16)

**Status:** ✅ PASSOU

Compilation time: 2.9s + TypeScript: 3.9s + Static generation: 446ms

```
✓ Compiled successfully
✓ Running TypeScript
✓ Generating static pages using 11 workers (14/14) in 446ms
```

**Rotas geradas (SSG + Dynamic + Static):**
- ○ Estáticas: `/_not-found`, landing pages de nicho (designer-sobrancelhas, lash-designer, manicure, barbeiro)
- ● SSG: `/para/[nicho]` (4 variantes pré-renderizadas)
- ƒ Dinâmicas: `/`, `/api/webhooks/lembrete`, `/book/[slug]`, `/dashboard/*`, `/sign-in`, `/sign-up`

---

## 5. Auditoria de Dependências

**Status:** ⚠️ FALHA — 2 vulnerabilidades moderadas

### Vulnerabilidades encontradas:

1. **PostCSS < 8.5.10 — XSS via Unescaped `</style>` em CSS Stringify Output**
   - Versão afetada: < 8.5.10
   - Versão recomendada: >= 8.5.10
   - Paths: `.>@clerk/nextjs>next>postcss` + `.>next>postcss`
   - Aviso: https://github.com/advisories/GHSA-qx2v-qp2m-jg93
   - **Impacto:** Potencial injeção XSS em geração de CSS

2. **UUID < 11.1.1 — Missing Buffer Bounds Check em v3/v5/v6**
   - Versão afetada: < 11.1.1
   - Versão recomendada: >= 11.1.1
   - Paths: Presente em múltiplos transitivoes via `@clerk/ui > @solana/...` (14 paths)
   - Aviso: https://github.com/advisories/GHSA-w5hq-g745-h8pq
   - **Impacto:** Potencial buffer overflow em geração de UUIDs

### Análise de dependências diretas:

**Dependências usadas (package.json):**
- ✅ @clerk/localizations — usado em `src/app/layout.tsx`
- ✅ @clerk/nextjs — usado em `src/proxy.ts`
- ✅ @clerk/ui — importado (via @clerk/nextjs)
- ✅ @supabase/ssr — usado em `src/lib/supabase/`
- ✅ @supabase/supabase-js — usado em `src/lib/supabase/`
- ✅ next — obviamente usado (framework)
- ✅ next-themes — usado em `src/app/layout.tsx` e `src/app/SeletorTema.tsx`
- ✅ posthog-js — usado em `src/lib/analytics/` e `src/components/analytics/`
- ✅ react, react-dom — framework

**Conclusão:** Nenhuma dependência declarada e não usada detectada.

---

## 6. Mapa de Cobertura de Testes por Módulo

| Módulo | TS/TSX Files | Test Files | Status |
|--------|:---:|:---:|--------|
| `src/app/actions` | 7 | 0 | 🔴 **SEM TESTES** — CRÍTICO |
| `src/app/api/webhooks` | 0 | 0 | ⚫ Não aplicável |
| `src/lib` | 7 | 3 | ✅ Parcialmente testado |
| `src/components` | 0 | 0 | ⚫ Arquivos em src/app/ |
| `src/app` | 9 | 0 | 🔴 **SEM TESTES** — Crítico |

### Módulos críticos SEM testes:

1. **src/app/actions/** (7 arquivos)
   - `criarAgendamentoPublico.ts` — Fluxo B2C de agendamento (validação, double-booking, geração de slots)
   - `criarAgendamentoDashboard.ts` — Fluxo B2B de agendamento
   - `confirmarAgendamento.ts` — Confirmação via WhatsApp
   - `cancelarAgendamento.ts` — Cancelamento
   - `atualizarServicos.ts` — Gerenciamento de serviços
   - `atualizarHorariosFuncionamento.ts` — Configuração de horários
   - `atualizarPlano.ts` — Upgrade/downgrade de plano
   - **Impacto:** Server Actions que tocam agendamentos e dados críticos SEM proteção de testes

2. **src/app/** (9 arquivos, estrutura dinâmica)
   - Pages e componentes de layout que processam lógica
   - **Impacto:** Fluxos públicos de booking (B2C) sem testes automatizados

3. **src/lib/** (7 arquivos, 3 testados)
   - ✅ `booking-engine.ts` — Testado
   - ✅ `timezone.ts` — Testado
   - ✅ `whatsapp-helper.ts` — Testado
   - 🔴 `supabase/` (client/server) — Sem testes
   - 🔴 `analytics/` — Sem testes
   - 🔴 outros utilitários

---

## 7. Higiene de Código — Achados Principais

### 7.1 Script mortos/faltando

- ❌ Não há script `pnpm test:coverage` para relatório de cobertura
- ❌ Não há script `pnpm type-check` (apenas tsc --noEmit implicit)
- ❌ Não há script `pnpm format` para Prettier

### 7.2 Configurações de ESLint/TypeScript faltando

- ⚠️ Regra `unicorn/prefer-module` referenciada mas não configurada (erro em `.agents/skills/upstash/...`)
- ⚠️ Themes importados em `src/app/layout.tsx` mas não usados (`dark`, `neobrutalism`, `shadcn`)

### 7.3 Padrões de React antipattern

**setState dentro de effects:** Afeta fluxo de booking (DemoAgendamento, BookingWizard, DashboardClient). Refatorar para:
```typescript
const [dias, setDias] = useState(() => calcularDias())
// OU usar hook customizado que encapsula o efeito
```

### 7.4 Typing inadequado

Múltiplos `any` em handlers de eventos / props de componentes Client. Exemplo:
```typescript
// ❌ Atual
const handleChange = (e: any) => { ... }

// ✅ Esperado
const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => { ... }
```

---

## 8. Decisões de Design / Trade-offs Detectados

1. **Não há framework de testes automático** — Projeto declara "sem framework de testes" (vide CLAUDE.md), usa Vitest apenas para utilitários. Server Actions e fluxos críticos dependem de testes manuais/integração.

2. **Banco em fase DEV** — Migrations podem ser editadas; schema declarativo em `supabase/schemas/`. Hard reset permitido (vide `docs/RESET_AMBIENTE_DEV.md`).

3. **RLS e validação em action** — Multi-tenancy via JWT + RLS, mas Server Actions B2C re-validam slots (frictionless para o cliente, segurança na action).

4. **Build sem testes gate** — `pnpm build` é o gate de qualidade (não há `pnpm test` no CI, presumivelmente). Lint falha (exit code 1) mas build passa.

---

## 9. Recomendações Urgentes

### Prioridade 1 (Bloqueadores)

- [ ] **Testes de agendamento**: Adicionar testes unitários/integração para `src/app/actions/criarAgendamentoPublico.ts` e `src/app/actions/criarAgendamentoDashboard.ts` (double-booking, validação de slot, RLS)
- [ ] **Atualizar PostCSS**: Upgrade para ^8.5.10 (não quebra nada, corrige XSS)
- [ ] **Atualizar UUID**: Verificar transitive upgrade via Clerk/Solana (pode ser dependency mismatch)

### Prioridade 2 (Code Quality)

- [ ] **Remover setState de effects**: Refatorar 4 occurrências de anti-pattern em componentes Client
- [ ] **Tipagem**: Especificar tipos em handlers ao invés de `any` (8 casos)
- [ ] **@ts-ignore → @ts-expect-error**: 1 caso em `booking-engine.ts`
- [ ] **Limpeza de imports**: Remover `dark`, `neobrutalism`, `shadcn` de layout.tsx se não usados

### Prioridade 3 (Housekeeping)

- [ ] **Package.json scripts**: Adicionar `test:coverage`, `type-check`, `format`
- [ ] **ESLint config**: Remover/configurar regra `unicorn/prefer-module` se não aplicável
- [ ] **Documentação**: Atualizar `docs/PENDENCIAS.md` com achados de lint e cobertura de testes

---

## 10. Conclusão

**Status Geral: PRONTO PARA DEV, COM DESVIOS DE QUALIDADE**

- ✅ Tipos & Build: Saudáveis
- ⚠️ Lint: 13 erros em src/ + pattern anti-pattern (React hooks)
- ✅ Testes: Passando (32/32), mas cobertura baixa (apenas utils, sem Server Actions)
- ⚠️ Segurança: 2 CVEs moderadas (PostCSS, UUID) — upgrade recomendado
- 🔴 **Risco:** Agendamentos (fluxo crítico B2C) não têm testes automatizados

**Próxima etapa:** Agendar sessão de refatoração de lint + adição de testes de agendamento (prioridade máxima antes do go-live).
