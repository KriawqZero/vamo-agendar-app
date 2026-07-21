# Testing Patterns

**Analysis Date:** 2026-07-20

## Test Framework

**Runner:**
- Vitest 4 (`vitest@^4.1.10`)
- Config: `vitest.config.ts`

**Assertion Library:**
- `expect` do próprio Vitest

**Run Commands:**
```bash
pnpm test              # vitest run (todos os testes, modo CI)
pnpm vitest            # watch mode (não há script dedicado)
```

Não há script de coverage configurado.

## Test File Organization

**Location:**
- Diretório dedicado por camada: `src/lib/__tests__/` (não co-locado ao lado do arquivo)
- Escopo atual: apenas funções puras/helpers de `src/lib/` — actions, componentes e rotas **não** têm testes

**Naming:**
- `<modulo>.test.ts` espelhando o arquivo testado: `booking-engine.test.ts`, `timezone.test.ts`, `horarios.test.ts`, `whatsapp-helper.test.ts`
- Glob do runner: `include: ['src/**/*.test.ts']` (só `.ts`, sem `.tsx`)

**Structure:**
```
src/lib/
├── booking-engine.ts
├── timezone.ts
├── horarios.ts
├── whatsapp-helper.ts
└── __tests__/
    ├── booking-engine.test.ts
    ├── timezone.test.ts
    ├── horarios.test.ts
    └── whatsapp-helper.test.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect } from 'vitest'

// Um describe por função exportada; para funções grandes, um describe por
// aspecto: 'obterSlotsDisponiveis — fuso do estabelecimento',
// 'obterSlotsDisponiveis — grade anti-buraco', 'obterSlotsDisponiveis — regras de acesso'
describe('calcularIntervalosLivres', () => {
    it('descreve o comportamento em português', () => {
        expect(resultado).toEqual(esperado)
    })
})
```

**Patterns:**
- Nomes de suites/casos em **português**, descrevendo regra de negócio
- Sem `beforeEach` de setup de dados — cada `it` monta seus próprios dados via helpers/fakes
- Teardown: `afterEach(() => vi.unstubAllGlobals())` quando há stub de `fetch` (`whatsapp-helper.test.ts:59`)
- Constantes de fuso no topo do arquivo: `const SP = 'America/Sao_Paulo'`

## Mocking

**Framework:** `vi` do Vitest (`vi.fn`, `vi.stubGlobal`) — sem `vi.mock` de módulos

**Patterns:**
```typescript
// HTTP: stub global de fetch (whatsapp-helper.test.ts)
const fetchMock = vi.fn(async () => respostaHttp(200, { messageId: 'msg_123' }))
vi.stubGlobal('fetch', fetchMock)
afterEach(() => vi.unstubAllGlobals())

// Supabase: fake encadeável escrito à mão (booking-engine.test.ts:32)
// cobre só o que a engine usa (from/select/eq/neq/gte/lt/order + thenable)
function fakeSupabase(dados: DadosFake): SupabaseClient { ... }
```

**Env vars de módulo:** constantes lidas no load (`QSTASH_TOKEN` etc.) são injetadas no `env` do `vitest.config.ts` — stub por teste não alcança constantes de módulo (comentário explícito no config).

**What to Mock:**
- Rede externa (`fetch` para Evolution API / QStash)
- Cliente Supabase via fake builder mínimo, honrando filtros relevantes ao caso (ex.: `neq('id', ...)`)

**What NOT to Mock:**
- Lógica pura do próprio projeto (timezone, horários, engine) — testada de verdade

## Fixtures and Factories

**Test Data:**
```typescript
// Interface + factory local por arquivo de teste (booking-engine.test.ts)
interface DadosFake {
    horarios?: { hora_inicio: string; hora_fim: string }[]
    excecoes?: { ... }[]
    agendamentos?: Agendamento[]
    servicos?: { duracao_minutos: number }[]
}
// helper respostaHttp(status, body) para respostas fetch fake
```

**Location:**
- Inline no próprio arquivo de teste — não há diretório de fixtures compartilhado

## Coverage

**Requirements:** Nenhum alvo enforced; sem provider de coverage instalado

**View Coverage:**
```bash
# não configurado — exigiria @vitest/coverage-v8
```

## Test Types

**Unit Tests:**
- Único tipo presente. ~65 casos em 4 arquivos, focados nas regras críticas: grade anti-buraco, timezone do tenant, validação de janelas, templates/envio WhatsApp

**Integration Tests:**
- Não usados (banco é Supabase Cloud; sem banco local)

**E2E Tests:**
- Não usados

## Common Patterns

**Async Testing:**
```typescript
it('...', async () => {
    const slots = await obterSlotsDisponiveis(fakeSupabase({ horarios }), ...)
    expect(slots).toEqual([...])
})
```

**Error Testing:**
- Caminhos de erro HTTP testados por status na resposta fake (`respostaHttp(401, ...)`, `respostaHttp(429, {})`) e por rejeição de rede (`vi.fn(async () => { throw new Error('ECONNREFUSED') })`) — asserta-se o comportamento resultante (falha silenciosa/retorno), não `toThrow`

## Regras para novos testes

- Novo helper puro em `src/lib/` → teste em `src/lib/__tests__/<nome>.test.ts`
- Env var lida no load do módulo → adicionar em `test.env` do `vitest.config.ts`
- Definition of Done exige `pnpm lint`, `pnpm test` e `pnpm build` com saída real mostrada

---

*Testing analysis: 2026-07-20*
