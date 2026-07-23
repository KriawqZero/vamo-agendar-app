# Phase 2: Integridade da agenda - Research

**Researched:** 2026-07-23
**Domain:** PostgreSQL integrity constraints (exclusion / unique) + atomic upsert + duração desnormalizada; Next.js 16 Server Actions error discrimination
**Confidence:** HIGH (código lido diretamente; formas de banco travadas no ROADMAP; dois pontos de banco confirmados por fonte, um por validação empírica agendada)

## Summary

Esta fase não constrói capacidade nova: fecha quatro buracos de integridade sobre dados que
já existem. O ROADMAP já travou a FORMA de banco (coluna `data_hora_fim`, extension
`btree_gist`, `tstzrange`, `EXCLUDE USING gist … WHERE status <> 'cancelado'`, unique
`(tenant_id, telefone)`) e a ordem interna obrigatória. A pesquisa NÃO re-deriva isso —
foca nos pontos onde o plano pode errar: (1) a superfície de edição da engine para ler
`data_hora_fim` em vez do join `servicos.duracao_minutos || 30`; (2) como discriminar o
`23P01` (exclusion_violation) que o `supabase-js` devolve, para rotear a perda de corrida
ao `slot_indisponivel` já existente **sem** ir ao Sentry; (3) o upsert atômico com
COALESCE, que o `supabase-js` **não** expressa e por isso exige uma função no banco; e (4) a
mecânica de aplicar migration de extension/constraint neste projeto (Supabase Cloud, sem
banco local, ledger realinhado à mão).

**Ponto mais delicado tecnicamente:** o COALESCE-on-conflict. `supabase-js .upsert()` faz
overwrite de linha inteira — não sabe fazer `DO UPDATE SET nome = COALESCE(clientes.nome,
EXCLUDED.nome)`. A recomendação é uma função Postgres `SECURITY INVOKER` chamada por `.rpc()`,
que serve os DOIS fluxos (público via service_role, walk-in via authenticated) com RLS
preservada no fluxo autenticado.

**Ponto de menor confiança (empírico, decisão de discrição do CONTEXT):** coluna gerada
`periodo tstzrange GENERATED ALWAYS AS (tstzrange(data_hora, data_hora_fim, '[)')) STORED`
depende do construtor `tstzrange` ser IMMUTABLE. A análise diz que é (constructor sem função
de canonicalização → imutável), mas a doc é ambígua e o padrão OFICIAL do Supabase usa coluna
**simples escrita pela aplicação**, não gerada. O plano deve provar empiricamente numa tabela
descartável (SQL de teste fornecido abaixo) e cair no trigger `BEFORE INSERT OR UPDATE` se
falhar. Nenhum dos três exige gamble: o teste é uma linha de DDL.

**Primary recommendation:** Executar na ordem obrigatória do ROADMAP. Wave 1: `data_hora_fim`
(coluna nullable → action grava → backfill na migration → `NOT NULL`) + engine lê
`data_hora_fim` (D-02). Wave 2: pré-voo (sobreposições + duplicatas de telefone). Wave 3:
`btree_gist` + `periodo` (gerada OU trigger, decidido por teste empírico) + exclusion
constraint + unique `(tenant_id, telefone)` + RPC de upsert COALESCE + discriminação do
`23P01` nos dois fluxos de escrita.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01: upsert atômico com COALESCE — preenche só o que falta, nunca sobrescreve.** O
  `ON CONFLICT (tenant_id, telefone) DO UPDATE` grava `nome = COALESCE(clientes.nome,
  EXCLUDED.nome)` e `email = COALESCE(clientes.email, EXCLUDED.email)`, retornando o `id`.
  Substitui o select-then-insert de `public-booking.ts:463-511` (não-atômico). Reversibility:
  costly — o unique `(tenant_id, telefone)` é migration.
- **D-02: a duração congela no ato da reserva e é lida de `data_hora_fim`, não do serviço.**
  A engine (`booking-engine.ts:311-321`) deixa de calcular `end` a partir de
  `ag.servicos?.duracao_minutos || 30` e passa a usar `data_hora_fim`. Fecha AGE-01 e AGE-02.
  Reversibility: one-way — `data_hora_fim NOT NULL` é migration imutável após a Phase 11.
- **D-03: remarcar mantém a duração ORIGINAL reservada.** `remarcarAgendamento`
  (`agendamentos.ts:437`) passa a calcular `novo data_hora_fim = nova data_hora +
  (data_hora_fim − data_hora) original`. Reversibility: reversible.
- **D-04: no walk-in, aviso amigável COM o detalhe do agendamento que ocupa o horário.**
  Quando o INSERT do walk-in (`agendamentos.ts:350`) falha com `23P01`, a action busca o
  agendamento conflitante do próprio tenant (período sobreposto, `status <> 'cancelado'`) e
  devolve cliente + serviço para a UI, que exibe o aviso e recarrega a agenda. Legítimo mostrar
  o detalhe porque é a agenda do próprio profissional. Nunca a mensagem crua do PostgreSQL.
  Reversibility: reversible.
- **D-05: no fluxo público, o erro `23P01` mapeia para o discriminante `slot_indisponivel`
  já existente — não para `erro_interno`.** A Phase 2 só precisa discriminar o `23P01` no
  catch/checagem de erro do INSERT (`public-booking.ts:526`) e roteá-lo para
  `slot_indisponivel`, **sem** reportá-lo ao Sentry (condição esperada de corrida).
  Reversibility: reversible.
- **D-06: limpar os agendamentos de teste antes de aplicar a constraint.** Apagar os
  agendamentos de teste para aplicar `data_hora_fim NOT NULL`, a exclusion constraint e o
  unique de telefone em terreno limpo. A migration em si (coluna nullable → backfill → `NOT
  NULL`) precisa continuar existindo e ser correta (roda em produção no go-live). Preservar o
  tenant do owner. Reversibility: one-way — dados apagados em dev não voltam (aceito).

### Claude's Discretion

- Ordem interna das tarefas e agrupamento em waves (respeitando a ordem obrigatória do
  ROADMAP: `data_hora_fim` → pré-voo → constraint).
- Coluna gerada `periodo tstzrange` vs trigger `BEFORE INSERT OR UPDATE` — ROADMAP marca
  confiança MÉDIA-ALTA na imutabilidade do construtor `tstzrange` em coluna gerada e define o
  trigger como plano B. **Validar empiricamente e escolher.**
- Forma exata dos testes (unitários da engine sobre `data_hora_fim`, prova de atomicidade do
  double-booking, prova do upsert COALESCE).
- Redação das cópias em pt-BR (discriminante público já existe em `mensagens.ts`; a cópia do
  walk-in é nova no dashboard).
- Como buscar o agendamento conflitante do walk-in (D-04) sem vazar mais que cliente + serviço.

### Deferred Ideas (OUT OF SCOPE)

- **Precedência de lookup quando telefone e e-mail batem em clientes diferentes** — decisão de
  produto da **Phase 5**. O unique desta fase é só `(tenant_id, telefone)`; `telefone` continua
  `NOT NULL` aqui e só vira nullable + `CHECK (telefone IS NOT NULL OR email IS NOT NULL)` na
  Phase 5.
- **Duração customizada por agendamento** — capacidade nova, fora do escopo. A fase apenas
  **congela** a duração vinda do serviço, não a torna editável por agendamento.
- **Remarcação pública sem login** (link assinado) — Phase 8. Reusa a proteção de sobreposição
  que esta fase entrega.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AGE-01 | Um agendamento guarda o próprio horário de término, imune a edições posteriores da duração do serviço | Coluna `data_hora_fim` gravada no ato da reserva (§Standard Stack, §Migration). Engine lê `data_hora_fim` (D-02, §Architecture Pattern 1). |
| AGE-02 | Serviço desativado não faz a engine assumir duração arbitrária ao calcular ocupação | Remoção do fallback `|| 30` e do join `servicos` na derivação de ocupação (D-02, §Pattern 1). O join `servicos` para `menorDuracaoAtiva` **permanece** — é outra coisa. |
| AGE-03 | Duas requisições simultâneas para o mesmo intervalo nunca resultam em dois agendamentos ativos sobrepostos | `EXCLUDE USING gist (tenant_id WITH =, periodo WITH &&) WHERE status <> 'cancelado'` (§Pattern 2). Vale nos dois fluxos de escrita (public admin + walk-in authenticated). |
| AGE-04 | Ao perder a corrida, o cliente final vê mensagem amigável — nunca erro do banco com dados de outro tenant | Discriminação de `23P01` → `slot_indisponivel` no público (D-05) e aviso com detalhe do próprio tenant no walk-in (D-04). §Pattern 3, §Code Examples. |
| AGE-05 | Dois clientes com o mesmo telefone no mesmo tenant nunca viram registros duplicados | Unique `(tenant_id, telefone)` + RPC de upsert COALESCE atômico (D-01). §Pattern 4, §Don't Hand-Roll. |
</phase_requirements>

## Project Constraints (from CLAUDE.md / AGENTS.md)

- **pnpm sempre** (nunca npm/yarn). Comandos: `pnpm lint`, `pnpm test`, `pnpm build` — os três
  verdes com output real são Definition of Done. Suíte de integração: `pnpm test:integracao`.
- **Sem ORM, SQL puro** via `@supabase/ssr`. Tecnologias banidas: Prisma/Drizzle, better-auth,
  Mercado Pago — nunca referenciar.
- **Schema declarativo** em `supabase/schemas/` é a fonte da verdade. Mudança de schema:
  arquivo declarativo + migration + RLS granular por ação + `COMMENT ON`. Extensions,
  GRANT/REVOKE e (por precedente) exclusion constraints são **migration escrita à mão** — `db
  diff` não os emite corretamente e o shadow-DB exige Docker (aprovação prévia).
- **`mcp__supabase__apply_migration` está proibido:** aplica via `execute_sql` (DDL + INSERT no
  ledger na MESMA chamada/transação) e realinha `version`/`name` no ledger — o MCP não preserva
  a version do arquivo.
- **RLS obrigatório, políticas granulares por ação** (`SELECT`/`INSERT`/`UPDATE`/`DELETE`, nunca
  `FOR ALL`), role explícita (`TO authenticated`/`TO anon`), `auth.jwt()` sempre em subquery.
- **Fricção Zero inegociável:** nenhuma proteção pode adicionar etapa, campo ou atraso visível
  ao cliente final. Sem CAPTCHA, sem login, sem OTP.
- **Domínio em português.** Server Actions em `src/app/actions/` são a única via de mutação;
  rotas REST proibidas (exceto webhooks). Erro esperado é valor de retorno discriminado, nunca
  `throw` (em produção o React só transporta o `digest`).
- **Condição esperada de negócio NÃO vai ao Sentry.** Perda de corrida (`23P01`) é esperada —
  não reportar. Só falha inesperada vai por `reportarExcecao`/`reportarFalhaSilenciosa`.
- **Banco DEV é descartável.** Migration destrutiva autorizada; hard reset permitido. Não propor
  backup/pg_dump nesta fase.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Congelar duração no ato da reserva | API / Server Action (grava `data_hora_fim`) | Database (coluna + CHECK) | A duração vem do serviço no momento da escrita; congelar é decisão de escrita, não de leitura. |
| Derivar ocupação da agenda | Pure lib (`booking-engine.ts`) | Database (lê `data_hora_fim`) | Função pura testável; muda uma fonte de dado (data_hora_fim vs join), preserva as funções puras. |
| Impedir double-booking atômico | **Database** (exclusion constraint) | API (revalida engine antes; discrimina 23P01 depois) | A janela TOCTOU só fecha no banco; a validação da engine é a 1ª linha, a constraint é a 2ª (fecha a corrida). |
| Dedupe de cliente por telefone | **Database** (unique + RPC COALESCE) | API (chama a RPC) | Atomicidade é propriedade do banco; supabase-js não expressa COALESCE-on-conflict. |
| Mensagem amigável na perda de corrida | API (mapeia 23P01 → discriminante) | UI (cópia pt-BR) | O discriminante já existe (público) ou nasce (walk-in); a UI só escolhe a cópia. |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| PostgreSQL (Supabase Cloud) | 15+ (banco do projeto) | Exclusion + unique constraints, generated column / trigger | Já é o banco do projeto; a integridade tem de morar aqui, não na app. |
| `btree_gist` (extension) | builtin do Postgres | Permite `tenant_id WITH =` (tipo text via B-tree) coexistir com `periodo WITH &&` (range via GiST) num só índice GiST de exclusão | Suportado no Supabase — a própria doc oficial do Supabase usa esse padrão para reservas. [CITED: supabase.com/blog/range-columns] |
| `@supabase/supabase-js` | ^2.110.0 (já instalado) | `.insert()`, `.rpc()`, leitura de `error.code` (SQLSTATE) | Já é o cliente do projeto; expõe o SQLSTATE do Postgres em `error.code`. [VERIFIED: codebase — public-booking-escrita.test.ts:613 assere `error?.code).toBe('23505')`] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Vitest | ^4.1.10 (já instalado) | Testes unitários da engine (SC1/SC2) + suíte de integração da atomicidade (SC3/SC5) | Suíte hermética por padrão; integração opt-in por `EXIGIR_INTEGRACAO=1`. |

**Nenhum pacote novo a instalar.** Esta fase é 100% SQL + edição de código existente + testes.
Portanto **sem `## Package Legitimacy Audit`** (nenhuma dependência externa nova).

**Version verification:** N/A — nenhum pacote npm novo. A única "versão" relevante é a do
Postgres do Supabase (o plano deve confirmar via MCP `mcp__supabase__execute_sql "select
version()"` antes de aplicar; `btree_gist` e generated columns exigem apenas PG 12+, folgado).

## Architecture Patterns

### System Architecture Diagram

```
FLUXO PÚBLICO (B2C, createAdminClient / service_role — RLS bypassado)
  navegador (sem sessão)
      │ slug, servicoId, dataHora, nome, telefone, email?
      ▼
  criarAgendamentoPublico (public-booking.ts)
      │ 1. valida entrada (já existe)
      │ 2. resolverPerfilPublicoPorSlug → tenantId (já existe)
      │ 3. servico ativo do tenant → duracao_minutos (já existe)
      │ 4. obterSlotsDisponiveis → valida slot por igualdade exata (1ª linha; já existe)
      │ 5. RPC reaproveitar_ou_criar_cliente(tenant, tel, nome, email) ── ATÔMICO ──► clientes
      │        (D-01: substitui o select-then-insert de :463-511)          ON CONFLICT COALESCE
      │ 6. INSERT agendamentos (tenant, cliente, servico, data_hora, DATA_HORA_FIM, status)
      │        │
      │        ├── sucesso ──► { ok: true, agendamento }
      │        └── error.code === '23P01' ──► { ok:false, motivo:'slot_indisponivel' }  (D-05)
      │                (NÃO reportarExcecao — corrida é esperada)          2ª linha: EXCLUDE constraint
      ▼
  BookingApp consome discriminante (já existe): solta o slot morto, refaz a grade, aviso âmbar

FLUXO WALK-IN (B2B, createClient / authenticated — RLS por tenant_id)
  dashboard (sessão Clerk)
      │
      ▼
  criarAgendamentoManual (agendamentos.ts)
      │ … resolve cliente / serviço / revalida engine (já existe) …
      │ INSERT agendamentos (… DATA_HORA_FIM …)
      │        ├── sucesso ──► agendamento
      │        └── error.code === '23P01' ──► busca agendamento conflitante (mesmo tenant,
      │                periodo &&, status<>cancelado) + join clientes/servicos
      │                └─► { ok:false, motivo:'slot_ocupado', conflito:{cliente,servico,horario} } (D-04)
      ▼
  NovoAgendamentoModal exibe aviso COM detalhe + recarrega agenda (cópia nova, pt-BR)

INTEGRIDADE (Database — bypassa RLS por design)
  agendamentos: data_hora_fim NOT NULL, periodo tstzrange (gerada|trigger),
                EXCLUDE USING gist (tenant_id WITH =, periodo WITH &&) WHERE status<>'cancelado'
  clientes:     UNIQUE (tenant_id, telefone)
```

### Recommended Project Structure (arquivos tocados — não há estrutura nova)

```
supabase/
├── schemas/
│   ├── 06_clientes.sql        # + UNIQUE (tenant_id, telefone) + COMMENT
│   └── 07_agendamentos.sql    # + data_hora_fim + CHECK + periodo + EXCLUDE + COMMENT
│                              # + função reaproveitar_ou_criar_cliente (ou 00_funcoes_sistema.sql)
├── migrations/
│   └── <ts>_integridade_agenda.sql   # ESCRITA À MÃO: extension, backfill, NOT NULL,
│                                      # periodo|trigger, EXCLUDE, UNIQUE, RPC, GRANTs
src/
├── lib/booking-engine.ts             # D-02: ocupação lê data_hora_fim
├── lib/__tests__/booking-engine.test.ts  # fixtures: data_hora_fim no lugar de servicos{}
├── app/actions/public-booking.ts     # D-01 (RPC), D-05 (23P01→slot_indisponivel), grava data_hora_fim
├── app/actions/agendamentos.ts       # D-03 (duração original), D-04 (23P01 walk-in), grava data_hora_fim
├── app/book/[slug]/mensagens.ts      # slot_indisponivel já mapeado (reusa)
└── app/dashboard/**/NovoAgendamentoModal.tsx  # consome retorno discriminado novo (D-04)
```

### Pattern 1: Congelar duração e ler ocupação de `data_hora_fim` (D-02, AGE-01/AGE-02)

**What:** A ocupação da agenda deixa de ser derivada do join `agendamentos → servicos` com
fallback `|| 30`; passa a ser lida de `data_hora_fim`, gravada no ato da reserva.

**Edit surface exata (`booking-engine.ts`):**
- **Query de agendamentos (:282-296):** trocar o `select` de `data_hora, status, servicos (
  duracao_minutos )` por `data_hora, data_hora_fim, status`. O join `servicos` **sai** desta
  query. [VERIFIED: codebase booking-engine.ts:282-296]
- **Derivação de ocupação (:311-321):** substituir o cálculo `start = h*60+m` e `end = start +
  (ag.servicos?.duracao_minutos || 30)` por `start` de `data_hora` e `end` de `data_hora_fim`
  (ambos convertidos para minutos locais via `horaLocal`, como já é feito). O `@ts-expect-error`
  do join some junto. [VERIFIED: codebase booking-engine.ts:311-321]
- **NÃO tocar** a query de `servicos` ativos (:260-274) que calcula `menorDuracaoAtiva` — essa
  é a menor duração dos serviços ativos do tenant para a regra anti-buraco, coisa DIFERENTE de
  ocupação. Confundir as duas quebra a grade. [VERIFIED: codebase booking-engine.ts:258-274]

**Test surface (`booking-engine.test.ts`, 507 linhas):**
- A `interface Agendamento` (:13-18) e o `fakeSupabase` (:32-72) modelam agendamentos como
  `{ data_hora, status, servicos: { duracao_minutos } }`. Todas as fixtures de ocupação
  (:108, :142, :203, etc.) passam `servicos: { duracao_minutos: 30 }`. Depois de D-02, o
  fixture precisa fornecer `data_hora_fim` (ex.: `data_hora: '…T12:00:00Z', data_hora_fim:
  '…T12:30:00Z'`) e a interface perde o `servicos` aninhado. O `fakeSupabase` do ramo
  `agendamentos` (:35-48) devolve a lista como está — só o shape dos dados muda. [VERIFIED:
  codebase booking-engine.test.ts:13-72,108-247]
- Os testes de `gerarSlotsAntiBuraco` e `calcularIntervalosLivres` (funções puras, :376-462)
  **não mudam** — recebem `Intervalo` em minutos, não tocam o banco. [VERIFIED]

**Example:**
```typescript
// Source: booking-engine.ts:310-321 (estado ATUAL — a substituir)
const slotsOcupados: Intervalo[] = (agendamentos || []).map((ag) => {
    const [h, m] = horaLocal(ag.data_hora, timezone).split(':').map(Number)
    const start = h * 60 + m
    // @ts-expect-error — join do Supabase tipado como array; runtime é objeto único
    const duracao = ag.servicos?.duracao_minutos || 30   // ← D-02 remove esta linha e o join
    const end = start + duracao
    return { start, end }
})
// DEPOIS (D-02): `end` sai de data_hora_fim, sem join, sem fallback
// const [hf, mf] = horaLocal(ag.data_hora_fim, timezone).split(':').map(Number)
// const end = hf * 60 + mf   (atenção a agendamentos que cruzam meia-noite — ver Pitfall 4)
```

### Pattern 2: Exclusion constraint atômica (AGE-03)

**What:** `EXCLUDE USING gist (tenant_id WITH =, periodo WITH &&) WHERE (status <>
'cancelado')` fecha a janela TOCTOU entre validar o slot (engine) e inserir.

**Pré-requisitos absolutos (ordem do ROADMAP):** `data_hora_fim NOT NULL` **antes** de criar
`periodo`; dados limpos **antes** da constraint (`NOT VALID` não existe para EXCLUDE — só FK,
CHECK, NOT NULL). [CITED: postgresql.org/docs — ALTER TABLE; ROADMAP §Notas de execução]

**`tenant_id WITH =` é obrigatório:** a checagem de integridade **bypassa RLS por design**. Sem
o `tenant_id` no índice, a constraint compararia períodos entre tenants diferentes e um
visitante mapearia a agenda de qualquer profissional por tentativa-e-erro. [CITED: ROADMAP
§Notas]

**Predicado `WHERE status <> 'cancelado'` é obrigatório:** sem ele, um horário cancelado
bloqueia o slot para sempre (o bug aparece semanas depois como "sumiu horário da agenda").
[CITED: ROADMAP §Notas]

**A coluna `periodo` — três opções, decidir por teste empírico (discrição D):**

1. **Coluna gerada (PREFERIDA se o teste passar):**
   ```sql
   periodo tstzrange GENERATED ALWAYS AS (tstzrange(data_hora, data_hora_fim, '[)')) STORED
   ```
   Vantagem: `periodo` nunca diverge de `[data_hora, data_hora_fim)` — integridade por
   construção, sem código. Depende do construtor `tstzrange(timestamptz, timestamptz, text)`
   ser IMMUTABLE. **Análise:** o construtor de range de um tipo SEM função de canonicalização
   (caso do `tstzrange`, range contínuo) é imutável — logo deveria funcionar em PG 12+.
   [ASSUMED — análise de catálogo, não executado nesta sessão]. **A doc é ambígua** e o padrão
   OFICIAL do Supabase usa coluna simples escrita pela app, não gerada. [CITED:
   supabase.com/blog/range-columns] Uma thread da lista do PostgreSQL sobre exatamente esta
   sintaxe não confirma solução funcionando. [CITED: postgresql.org/message-id — "Can't find
   the right generated column syntax"]

2. **Trigger `BEFORE INSERT OR UPDATE` (PLANO B garantido, sem dependência de imutabilidade):**
   ```sql
   CREATE FUNCTION set_periodo_agendamento() RETURNS trigger AS $$
   BEGIN
     NEW.periodo := tstzrange(NEW.data_hora, NEW.data_hora_fim, '[)');
     RETURN NEW;
   END; $$ LANGUAGE plpgsql;
   CREATE TRIGGER trg_periodo BEFORE INSERT OR UPDATE OF data_hora, data_hora_fim
     ON agendamentos FOR EACH ROW EXECUTE FUNCTION set_periodo_agendamento();
   ```
   (Neste caso `periodo` é coluna `tstzrange` simples, sem GENERATED.)

3. **Expressão direta na constraint (sem coluna `periodo`):**
   ```sql
   EXCLUDE USING gist (tenant_id WITH =, tstzrange(data_hora, data_hora_fim, '[)') WITH &&)
     WHERE (status <> 'cancelado')
   ```
   Elegante (sem coluna redundante), MAS tem a MESMA dependência de imutabilidade da opção 1
   (índices de expressão exigem imutabilidade). Não resolve a incerteza; só a esconde. A engine
   (D-02) lê `data_hora_fim`, não `periodo`, então nenhuma dessas opções afeta a engine.

**TESTE EMPÍRICO OBRIGATÓRIO (primeira tarefa da wave 3, via `mcp__supabase__execute_sql`):**
```sql
-- Se ISTO passar, a opção 1 (coluna gerada) é válida; se der
-- "generation expression is not immutable", cair no trigger (opção 2).
CREATE TEMP TABLE _teste_periodo (
  a timestamptz, b timestamptz,
  p tstzrange GENERATED ALWAYS AS (tstzrange(a, b, '[)')) STORED
);
DROP TABLE _teste_periodo;
```
O resultado desse comando **decide** entre gerada e trigger. Não há gamble: é uma linha de DDL
descartável. [VERIFIED: método — DDL descartável em banco dev autorizado]

### Pattern 3: Discriminar `23P01` na perda de corrida (AGE-04, D-04/D-05)

**What:** `supabase-js` devolve `{ data, error }`; o `error.code` carrega o SQLSTATE do
Postgres. `23P01` = `exclusion_violation`. [CITED: postgresql.org/docs — Error Codes; VERIFIED:
codebase assere `error.code === '23505'` em public-booking-escrita.test.ts:613, confirmando que
o SQLSTATE atravessa o supabase-js]

**Público (D-05) — `public-booking.ts:526-542`:** hoje `if (agError || !agendamento)` roteia
TUDO para `reportarExcecao` + `{ ok:false, motivo:'erro_interno' }`. Inserir um ramo ANTES do
reporte:
```typescript
// Source: recomendação sobre public-booking.ts:526
if (agError?.code === '23P01') {
    // Perda de corrida: condição ESPERADA. NÃO vai ao Sentry.
    // (opcional: capturarEventoTenant('booking_failed', tenantId, { motivo:'slot_indisponivel' }))
    return { ok: false, motivo: 'slot_indisponivel' }
}
if (agError || !agendamento) {
    reportarExcecao(erroSinteticoSupabase(agError, 'agendamento_sem_retorno'), { … })
    return { ok: false, motivo: 'erro_interno' }
}
```
O `BookingApp` já consome `slot_indisponivel` (aviso âmbar, refaz grade). Nada de UI muda —
só o roteamento do erro. [VERIFIED: codebase public-booking.ts:447-451,526-542; mensagens.ts:143]

**Walk-in (D-04) — `agendamentos.ts:349-364`:** hoje o INSERT falha com `throw new Error('Erro
ao criar o agendamento.')`. Precisa: detectar `agError.code === '23P01'`, buscar o agendamento
conflitante do próprio tenant e devolver detalhe. Como o walk-in usa o cliente **authenticated**
(RLS por `tenant_id`), a busca já é escopada ao próprio tenant — sem risco cross-tenant.
```typescript
// Source: recomendação sobre agendamentos.ts:361
if (agError?.code === '23P01') {
    const { data: conflito } = await supabase
        .from('agendamentos')
        .select('data_hora, data_hora_fim, clientes(nome), servicos(nome)')
        .eq('tenant_id', orgId)
        .neq('status', 'cancelado')
        // sobreposição com o intervalo tentado — via overlap de período
        .lt('data_hora', dataHoraFimTentado).gt('data_hora_fim', dataHora)
        .maybeSingle()
    return { ok: false, motivo: 'slot_ocupado',
             conflito: conflito && { cliente: conflito.clientes?.nome, servico: conflito.servicos?.nome,
                                     horario: conflito.data_hora } }
}
```
**Contrato de retorno muda:** `criarAgendamentoManual` hoje devolve o agendamento cru ou
`throw`. D-04 exige retorno discriminado. O consumidor (`NovoAgendamentoModal.tsx` — o planner
deve lê-lo) precisa passar a tratar `{ ok:false, motivo:'slot_ocupado', conflito }` e recarregar
a agenda. Padrão a espelhar: o retorno discriminado do público. [VERIFIED: codebase
agendamentos.ts:236-394]

### Pattern 4: Upsert atômico com COALESCE (AGE-05, D-01)

**What:** Converter o select-then-insert não-atômico (`public-booking.ts:463-511`) num upsert
atômico que preenche só o que falta.

**Por que não `supabase-js .upsert()`:** o `.upsert(row, { onConflict: 'tenant_id,telefone' })`
faz `DO UPDATE SET` de TODAS as colunas fornecidas = `EXCLUDED.*` — overwrite de linha inteira.
Não existe opção para `COALESCE(clientes.nome, EXCLUDED.nome)`. `ignoreDuplicates:true` (=`DO
NOTHING`) também não serve: não retorna o `id` da linha existente e não preenche e-mail
faltante. **COALESCE-on-conflict exige SQL bruto → função no banco.** [ASSUMED — comportamento
conhecido do PostgREST/supabase-js; sem SDK que expresse COALESCE]

**Recomendação: função `SECURITY INVOKER` chamada por `.rpc()`.**
```sql
CREATE FUNCTION reaproveitar_ou_criar_cliente(
    p_tenant_id text, p_telefone text, p_nome text, p_email text DEFAULT NULL
) RETURNS uuid
LANGUAGE sql SECURITY INVOKER
SET search_path = ''            -- boa prática de segurança (schema-qualificar tudo abaixo)
AS $$
    INSERT INTO public.clientes (tenant_id, telefone, nome, email)
    VALUES (p_tenant_id, p_telefone, p_nome, p_email)
    ON CONFLICT (tenant_id, telefone) DO UPDATE
        SET nome  = COALESCE(public.clientes.nome,  EXCLUDED.nome),
            email = COALESCE(public.clientes.email, EXCLUDED.email)
    RETURNING id;
$$;
```
- **Por que `SECURITY INVOKER` e não `DEFINER`:** o público chama via `service_role` (RLS
  bypassada de qualquer jeito); o walk-in chama via `authenticated`, e como INVOKER a RLS de
  `clientes` (INSERT/UPDATE `WITH CHECK tenant_id = jwt org_id`) continua valendo — sem escalar
  privilégio nem confiar num `tenant_id` de argumento. `SECURITY DEFINER` reabriria a porta de
  um authenticated gravar em tenant alheio. [VERIFIED: codebase 06_clientes.sql:24-36 — policies
  já existem]
- **`clientes.nome` é `NOT NULL`** (06_clientes.sql:4), então `COALESCE(clientes.nome,
  EXCLUDED.nome)` sempre mantém o nome curado — exatamente o intento D-01. `email` é nullable,
  então `COALESCE` preenche o e-mail que faltava (insumo da Phase 5). [VERIFIED: codebase
  06_clientes.sql:1-9]
- **GRANT obrigatório (regra viva da Phase 1):** funções novas nascem SEM `EXECUTE` para
  `PUBLIC` (default privilege global revogado no 01-15). É preciso `GRANT EXECUTE ON FUNCTION
  reaproveitar_ou_criar_cliente(...) TO authenticated, service_role;` explícito — e **nada**
  para `anon` (anon não tem Data API). Sem o GRANT, a falha é alta e clara (`permission denied
  for function`), nunca silenciosa. [CITED: STATE.md §Decisions 01-15; docs/03 §Privilégios]
- **Chamada nos dois fluxos:** público troca o bloco :463-511 por `await admin.rpc(
  'reaproveitar_ou_criar_cliente', { … })`. O walk-in (`agendamentos.ts:306-331`) deve usar a
  MESMA RPC no ramo "cadastro por telefone": com o unique `(tenant_id, telefone)` no lugar, o
  `.insert()` de novo cliente passa a poder falhar com `23505` numa corrida, e a RPC resolve
  isso atomicamente. [VERIFIED: codebase agendamentos.ts:299-331]

### Anti-Patterns to Avoid

- **Aplicar a exclusion constraint com dados sujos.** `NOT VALID` não existe para EXCLUDE. Pré-voo
  obrigatório (contagem de violadoras = 0) antes do DDL. O precedente do projeto
  (`20260722185755_slug_gratuito_unico.sql`) rodou pré-voo e registrou "as duas consultas
  voltaram VAZIAS" no próprio arquivo. Replicar. [VERIFIED: codebase migration 20260722185755:38-43]
- **`mcp__supabase__apply_migration`.** Proibido — não preserva a version. Usar `execute_sql`
  com DDL + INSERT no ledger na mesma transação, depois conferir `list_migrations` e realinhar
  `version`/`name` por DML. [CITED: CLAUDE.md §Infraestrutura; STATE.md]
- **`db diff` para extension/constraint/GRANT.** Emite privilégio invertido (revoke
  service_role, grant anon) e exige Docker (aprovação). Escrever à mão. [VERIFIED: codebase
  migration 20260722185755:1-9 documenta esse modo de falha]
- **Reportar `23P01` ao Sentry.** Perda de corrida é condição esperada — reportar inunda a fila
  de erro. Só `erro_interno` genuíno vai. [CITED: CONTEXT D-05]
- **`SECURITY DEFINER` na RPC de cliente.** Escalaria privilégio para o authenticated gravar em
  tenant alheio. Usar INVOKER. [ASSUMED — princípio de RLS]
- **Deixar `periodo` como coluna simples escrita pela app.** Abriria drift entre `periodo` e
  `[data_hora, data_hora_fim)`; a constraint passaria a proteger o que `periodo` disser, não a
  verdade. Gerada ou trigger — nunca app-escrita. [ASSUMED — objetivo da fase é integridade]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Impedir double-booking | Lock aplicacional / transação SELECT FOR UPDATE na action | `EXCLUDE USING gist … WITH &&` | O banco resolve a corrida atomicamente; app-lock não fecha o TOCTOU entre dois processos/instâncias. |
| Dedupe de cliente | select-then-insert (o código atual) | `ON CONFLICT (tenant_id, telefone) DO UPDATE COALESCE` via RPC | Duas requisições simultâneas com o mesmo telefone criam duas linhas no select-then-insert. |
| Detectar tipo de erro do banco | Comparar `error.message` por substring | `error.code === '23P01'` / `'23505'` (SQLSTATE) | A mensagem do Postgres muda entre versões e embute PII (`org_id`, horário de terceiro); o SQLSTATE é estável. |
| Construir/manter `periodo` | Escrever `periodo` na action | Generated column OU trigger | App-escrito diverge; gerada/trigger é integridade por construção. |

**Key insight:** integridade concorrente é propriedade do BANCO. Toda tentativa de resolvê-la na
Server Action (lock, re-check, retry) é teatro contra duas requisições realmente simultâneas —
foi exatamente o TOCTOU que a validação da engine deixa aberto e que a constraint fecha.

## Runtime State Inventory

> Fase com migration que APERTA constraint sobre dados existentes. Categorias abaixo cobrem o
> que um grep não encontra.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `agendamentos` sem `data_hora_fim` (coluna nova) e sem `periodo`; `clientes` com possíveis duplicatas `(tenant_id, telefone)` de corridas passadas | **Backfill** de `data_hora_fim` na migration (`data_hora + servicos.duracao_minutos`); **pré-voo** de duplicatas de telefone e de sobreposições; **D-06** apaga agendamentos de teste no dev (preservando o tenant do owner) |
| Live service config | Nenhum. A integridade é 100% no Postgres do Supabase Cloud; não há config em UI/serviço externo que embuta este estado. | None — verificado: nenhum n8n/Datadog/scheduler referencia agendamentos |
| OS-registered state | Nenhum. Lembretes do QStash referenciam `agendamento_id` (uuid), que **não muda** — só ganha `data_hora_fim`. Realinhamento de lembrete na remarcação (D-03) já existe. | None — o uuid do agendamento é estável |
| Secrets/env vars | Nenhum secret novo. `SUPABASE_SECRET_KEY` (service_role) já existe e é o que a RPC pública usa. | None |
| Build artifacts | Nenhum. Schema declarativo não gera artefato instalado; a migration é aplicada no cloud. | None — mas **realinhar o ledger** após `execute_sql` (version/name), senão `db diff` futuro quebra |

**Nada encontrado além do banco.** O estado desta fase é inteiramente de dados no Postgres —
por isso o pré-voo e o backfill são o coração do risco, não config de serviço.

## Common Pitfalls

### Pitfall 1: Aplicar `periodo`/constraint antes de `data_hora_fim NOT NULL`
**What goes wrong:** `tstzrange(data_hora, NULL, '[)')` produz range com limite superior
**infinito** → todo agendamento sobrepõe todo mundo, e a constraint recusa quase tudo.
**Why:** a ordem interna do ROADMAP não é sugestão — a etapa 3 depende da 1 estar completa e
`NOT NULL`.
**How to avoid:** coluna nullable → action grava → backfill → `NOT NULL` → só então `periodo` +
EXCLUDE.
**Warning signs:** INSERTs legítimos começam a falhar com `23P01` logo após a migration.

### Pitfall 2: `tstzrange` com limites invertidos lança exceção
**What goes wrong:** se `data_hora_fim <= data_hora`, `tstzrange(a, b, '[)')` lança `range lower
bound must be less than or equal to range upper bound`.
**Why:** dado inconsistente (duração 0/negativa, backfill errado).
**How to avoid:** `CHECK (data_hora_fim > data_hora)` na tabela (análogo ao `ck_hora_fim_apos_inicio`
que já existe em `horarios_funcionamento`). Garante que o construtor nunca erra. [VERIFIED:
codebase 03_horarios_funcionamento.sql:11 — precedente do CHECK]
**Warning signs:** erro de range na inserção manual ou no backfill.

### Pitfall 3: `btree_gist` fora do search_path na aplicação da constraint
**What goes wrong:** a exclusion constraint referencia as operator classes do `btree_gist`
(para `tenant_id text WITH =`); se o schema da extension não estiver no search_path no momento
do DDL, o Postgres não acha a opclass.
**Why:** no Supabase a extension costuma instalar no schema `extensions`. [ASSUMED — convenção
Supabase]
**How to avoid:** `CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;` e garantir
`extensions` no search_path do papel que aplica a migration (o `postgres`/`execute_sql` do
Supabase normalmente já tem). Se falhar, `SET search_path = public, extensions;` no topo da
migration. **Verificar empiricamente ao aplicar.**
**Warning signs:** `data type text has no default operator class for access method "gist"`.

### Pitfall 4: Agendamento que cruza a meia-noite quebra a derivação de ocupação da engine
**What goes wrong:** a engine converte `data_hora_fim` para "minutos desde a meia-noite local"
(`horaLocal`). Um agendamento das 23:45 com 30 min termina 00:15 do dia seguinte → `end = 15`,
menor que `start = 1425`, e o intervalo ocupado fica invertido/vazio.
**Why:** o modelo de minutos-locais da engine pressupõe um único dia. O código atual já tem essa
fragilidade latente com o `|| 30`, mas passa a ser explícita ao ler `data_hora_fim`.
**How to avoid:** ao converter `data_hora_fim` para minutos locais, se o dia local de
`data_hora_fim` for posterior ao de `data_hora`, tratar `end` como `end + 1440` (ou clampar ao
fim do dia consultado). O planner deve decidir e cobrir com teste. Serviços curtos em salão
raramente cruzam meia-noite, mas o teste tem de existir. [VERIFIED: codebase booking-engine.ts:311-321,280]
**Warning signs:** slot da virada da meia-noite aparece livre indevidamente.

### Pitfall 5: Ledger desalinhado após `execute_sql`
**What goes wrong:** aplicar por MCP e esquecer de inserir/realinhar a linha no ledger
(`supabase_migrations.schema_migrations`) → `db diff` futuro compara errado e propõe recriar
tudo.
**Why:** `apply_migration` não preserva version; `execute_sql` exige INSERT manual no ledger.
**How to avoid:** DDL + `INSERT INTO supabase_migrations.schema_migrations (version, name)` na
MESMA chamada `execute_sql`; depois `list_migrations` e conferir version = timestamp do arquivo.
[CITED: CLAUDE.md; STATE.md §Decisions]
**Warning signs:** `db diff` seguinte propõe dropar a constraint recém-criada.

## Code Examples

### Migração escrita à mão — esqueleto (ordem obrigatória)
```sql
-- Source: síntese de ROADMAP §ordem interna + precedente 20260722185755
-- 0. PRÉ-VOO (rodar ANTES, registrar contagens no plano — devem ser ZERO):
--    (a) duplicatas de telefone:
--        SELECT tenant_id, telefone, count(*) FROM public.clientes
--        GROUP BY 1,2 HAVING count(*) > 1;
--    (b) sobreposições ativas (depois do backfill de data_hora_fim):
--        SELECT a.id, b.id FROM public.agendamentos a JOIN public.agendamentos b
--        ON a.tenant_id = b.tenant_id AND a.id < b.id
--        AND a.status <> 'cancelado' AND b.status <> 'cancelado'
--        AND tstzrange(a.data_hora,a.data_hora_fim,'[)') && tstzrange(b.data_hora,b.data_hora_fim,'[)');

-- 1. Coluna nullable + CHECK (a action passa a gravar; NOT NULL vem depois do backfill)
ALTER TABLE public.agendamentos ADD COLUMN data_hora_fim timestamptz;
-- (a action grava data_hora_fim em toda reserva nova a partir daqui)

-- 2. Backfill (roda em produção no go-live — servico_id é ON DELETE RESTRICT, nunca órfão)
UPDATE public.agendamentos a
SET data_hora_fim = a.data_hora + (s.duracao_minutos * interval '1 minute')
FROM public.servicos s
WHERE a.servico_id = s.id AND a.data_hora_fim IS NULL;

-- 3. Aperta
ALTER TABLE public.agendamentos ALTER COLUMN data_hora_fim SET NOT NULL;
ALTER TABLE public.agendamentos ADD CONSTRAINT ck_agendamento_fim_apos_inicio
    CHECK (data_hora_fim > data_hora);

-- 4. Extension + periodo (gerada OU trigger — decidido pelo teste empírico) + EXCLUDE
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
ALTER TABLE public.agendamentos
    ADD COLUMN periodo tstzrange
    GENERATED ALWAYS AS (tstzrange(data_hora, data_hora_fim, '[)')) STORED;  -- se imutável
ALTER TABLE public.agendamentos ADD CONSTRAINT ag_sem_sobreposicao
    EXCLUDE USING gist (tenant_id WITH =, periodo WITH &&) WHERE (status <> 'cancelado');

-- 5. Unique de cliente + RPC COALESCE + GRANTs
ALTER TABLE public.clientes ADD CONSTRAINT clientes_tenant_telefone_key UNIQUE (tenant_id, telefone);
-- (função reaproveitar_ou_criar_cliente — ver Pattern 4)
GRANT EXECUTE ON FUNCTION public.reaproveitar_ou_criar_cliente(text,text,text,text)
    TO authenticated, service_role;

-- 6. COMMENT ON em toda coluna/constraint nova (intenção de negócio, obrigatório no projeto)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Ocupação = join `agendamentos → servicos` com `|| 30` | Ocupação = `data_hora_fim` gravado na reserva | Esta fase (D-02) | Editar/desativar serviço não move agendamento marcado |
| Anti-double-booking = revalidar engine antes do INSERT | Engine (1ª linha) + exclusion constraint (2ª, fecha TOCTOU) | Esta fase (AGE-03) | Duas requisições simultâneas → exatamente um agendamento |
| Dedupe = select-then-insert por telefone | Unique + upsert COALESCE atômico via RPC | Esta fase (D-01) | Corrida não cria segunda linha; e-mail faltante é preenchido |
| Erro do INSERT → `erro_interno` + Sentry | `23P01` → `slot_indisponivel` (público) / detalhe (walk-in), sem Sentry | Esta fase (D-04/D-05) | Cliente vê cópia honesta; fila de erro não infla |

**Deprecated/outdated:**
- O fallback `|| 30` na engine: era a fonte do AGE-02 — removido junto com o join de ocupação.
- Padrão do Supabase de coluna `tstzrange` **simples escrita pela app** (blog range-columns):
  válido em geral, mas rejeitado aqui porque abre drift `periodo` vs origem — a fase quer
  integridade por construção (gerada/trigger). [CITED: supabase.com/blog/range-columns]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `tstzrange(timestamptz, timestamptz, text)` é IMMUTABLE → coluna gerada funciona | Pattern 2, opção 1 | Baixo — mitigado por teste empírico obrigatório (1 linha DDL) antes de aplicar; fallback trigger pronto |
| A2 | `supabase-js .upsert()` não expressa COALESCE-on-conflict → RPC necessária | Pattern 4 | Baixo — comportamento conhecido do PostgREST; se errado, simplifica (não quebra) |
| A3 | `btree_gist` instala no schema `extensions` no Supabase e as opclasses ficam no search_path do DDL | Pitfall 3 | Médio — pode exigir `SET search_path` explícito na migration; falha é clara e imediata |
| A4 | `SECURITY INVOKER` na RPC preserva RLS para o walk-in authenticated e é bypassada para service_role | Pattern 4 | Baixo — semântica padrão de RLS + BYPASSRLS do service_role |
| A5 | Agendamentos que cruzam meia-noite são raros mas possíveis; a engine precisa tratar `end` do dia seguinte | Pitfall 4 | Médio — se ignorado, slot da virada aparece livre; coberto por teste |

**Confirmar antes de travar como decisão:** A1 e A3 são empíricos e o plano os resolve na
primeira tarefa da wave 3 (teste DDL descartável + aplicação observada). A2/A4 são de design.

## Open Questions (RESOLVED)

1. **Coluna gerada vs trigger para `periodo`**
   - What we know: análise diz imutável; padrão Supabase usa coluna app-escrita; thread da lista
     PG não confirma a coluna gerada.
   - What's unclear: se o Postgres do Supabase deste projeto aceita o `GENERATED ALWAYS AS
     (tstzrange(...))`.
   - Recommendation: primeira tarefa da wave 3 roda o `CREATE TEMP TABLE` de teste; passou →
     gerada; falhou → trigger. Decisão determinística, não gamble.
   - **RESOLVED:** a sonda empírica (`CREATE TEMP TABLE` descartável do `GENERATED ALWAYS AS
     (tstzrange(...))`) vive no plano **02-02**; a escolha coluna-gerada vs trigger é feita a
     partir do resultado observado, não assumida. Fallback trigger permanece pronto se a sonda
     falhar.

2. **Contrato de retorno de `criarAgendamentoManual` (D-04)**
   - What we know: hoje devolve o agendamento cru ou `throw`; o consumidor é `NovoAgendamentoModal`.
   - What's unclear: quanto do modal muda para exibir `{ motivo:'slot_ocupado', conflito }` e
     recarregar a agenda.
   - Recommendation: planner lê `NovoAgendamentoModal.tsx` (e o container da agenda) e desenha o
     retorno discriminado espelhando o padrão do público.
   - **RESOLVED:** o contrato de retorno discriminado do walk-in (motivo + detalhe do agendamento
     conflitante) e o ajuste do `NovoAgendamentoModal` estão no plano **02-04**, espelhando o
     padrão de retorno discriminado do fluxo público.

3. **Tratamento de meia-noite na engine (Pitfall 4)**
   - What we know: o modelo minutos-locais pressupõe um dia.
   - What's unclear: clampar ao fim do dia vs somar 1440.
   - Recommendation: somar 1440 quando o dia local de `data_hora_fim` > dia de `data_hora`;
     cobrir com teste unitário. Decisão de baixo custo, mas explícita.
   - **RESOLVED:** somar 1440 quando o dia local de `data_hora_fim` ultrapassa o de `data_hora`;
     coberto por teste unitário da engine no plano **02-01 (Task 2)**.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase Cloud (Postgres) | Todas as migrations | ✓ | PG 15+ (confirmar `select version()` no apply) | — |
| `btree_gist` extension | Exclusion constraint | ✓ (suportado no Supabase) | builtin | — |
| MCP `mcp__supabase__execute_sql` | Aplicar migration + realinhar ledger + teste empírico | ✓ (usado nas migrations da Phase 1) | — | psql via pooler (se MCP indisponível) |
| Docker | `supabase db diff` (shadow DB) | ✗ (proibido sem aprovação) | — | Escrever migration à mão (é a recomendação) |

**Missing dependencies with no fallback:** nenhuma.
**Missing dependencies with fallback:** `db diff`/Docker — contornado por migration escrita à
mão (padrão do projeto para extension/constraint/privilégio).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.10 |
| Config file | `vitest.config.ts` (suíte de integração excluída do glob padrão, opt-in `EXIGIR_INTEGRACAO=1`) |
| Quick run command | `pnpm test` (hermético — sem rede, sem banco) |
| Full suite command | `pnpm test` + `pnpm test:integracao` (este ESCREVE no Supabase de dev) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AGE-01 | Editar duração do serviço não move término de agendamento marcado | unit (engine puro) | `pnpm test src/lib/__tests__/booking-engine.test.ts` | ✅ (fixtures a reescrever p/ data_hora_fim) |
| AGE-02 | Serviço desativado ocupa o tempo reservado, sem `|| 30` | unit (engine puro) | `pnpm test src/lib/__tests__/booking-engine.test.ts` | ✅ (caso novo: agendamento sem serviço ativo) |
| AGE-03 | Duas requisições simultâneas → um agendamento ativo (público E walk-in) | **integração (banco real)** | `pnpm test:integracao` | ⚠️ Wave 0 — novo caso de concorrência |
| AGE-04 | Perda de corrida → `slot_indisponivel` (público) / detalhe (walk-in), nunca msg do PG | integração + unit | `pnpm test:integracao` + `pnpm test` (mensagens) | ⚠️ Wave 0 — asserção sobre 23P01 |
| AGE-05 | Mesmo telefone/tenant reaproveita cliente, sem 2ª linha nem disparo duplicado | integração (RPC + unique) | `pnpm test:integracao` | ✅ parcial (public-booking-escrita.test.ts:395 já testa reaproveitamento; falta corrida) |

### Prova de concorrência para SC3 (a que exige DB real)
A atomicidade não é observável em teste hermético (mock prova só o mock). O caso central:
```typescript
// Disparar N chamadas concorrentes para o MESMO datetime e assertar exatamente 1 ativo.
const alvos = Array.from({ length: 8 }, () =>
  criarAgendamentoPublico({ slug, servicoId, dataHora: mesmoSlot, clienteNome, clienteTelefone }))
const resultados = await Promise.all(alvos)
const ok = resultados.filter(r => r.ok)
expect(ok).toHaveLength(1)                                   // exatamente um venceu
expect(resultados.filter(r => !r.ok && r.motivo === 'slot_indisponivel').length).toBe(7)
const { count } = await admin.from('agendamentos').select('id',{count:'exact',head:true})
  .eq('tenant_id', TENANT_TESTE).neq('status','cancelado')
expect(count).toBe(1)                                        // o banco tem UMA linha ativa
```
Repetir para o walk-in (cliente authenticated). Nota do harness existente: `Promise.all` em
processo aproxima a corrida, mas a garantia real vem da constraint no banco — o teste prova que a
constraint está lá e que o `23P01` é discriminado (não vira exceção crua). [VERIFIED: padrão da
suíte public-booking-escrita.test.ts:432-475]

### Sampling Rate
- **Per task commit:** `pnpm test` (engine + mensagens herméticos).
- **Per wave merge:** `pnpm test:integracao` (concorrência + RPC contra o banco de dev).
- **Phase gate:** `pnpm lint && pnpm test && pnpm build` verdes (output real) + `pnpm
  test:integracao` verde antes de `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] Reescrever fixtures de `booking-engine.test.ts` para `data_hora_fim` (remover `servicos{}`
  aninhado da ocupação) + caso AGE-02 (agendamento cuja duração de serviço mudou/desativou).
- [ ] Caso de meia-noite na engine (Pitfall 4).
- [ ] Novo caso de concorrência (SC3) em `public-booking-escrita.test.ts` (público) e um análogo
  para o walk-in.
- [ ] Asserção de que `23P01` vira `slot_indisponivel` sem `reportarExcecao` (mock de
  `reportarExcecao` para provar que NÃO foi chamado na corrida).
- [ ] Teste do upsert COALESCE: cliente reincidente com e-mail novo preenche o vazio; nome já
  curado no dashboard NÃO é sobrescrito pela página pública.

## Security Domain

> `security_enforcement` ativo (default). Fase de integridade de dados multi-tenant.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Architecture | yes | Integridade no banco (constraint), não na app; RLS preservada nos fluxos autenticados |
| V4 Access Control | yes | `tenant_id WITH =` na constraint (integridade bypassa RLS — sem ele, mapeamento cross-tenant); RPC `SECURITY INVOKER` mantém RLS do walk-in |
| V5 Input Validation | yes | Telefone sanitizado (`replace(/\D/g,'')`), já existente; a RPC recebe valores já saneados |
| V7 Error Handling | yes | `23P01` vira discriminante fechado; mensagem crua do PG (com `org_id`/horário de terceiro) **nunca** atravessa para a UI |
| V6 Cryptography | no | — |

### Known Threat Patterns for {Supabase multi-tenant + service_role}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Enumeração de agenda cross-tenant via constraint sem `tenant_id` | Information Disclosure | `tenant_id WITH =` obrigatório no índice de exclusão |
| Vazamento de dado de terceiro na mensagem de erro do PG | Information Disclosure | Discriminar `error.code`, nunca propagar `error.message`; teste de não-vazamento sobre o objeto serializado (padrão já usado em :465-469) |
| Escalada de tenant via `SECURITY DEFINER` na RPC de cliente | Elevation of Privilege | `SECURITY INVOKER` + RLS de `clientes`; GRANT só a authenticated/service_role, nunca anon |
| Slot cancelado bloqueia horário para sempre | Denial of Service (agenda) | Predicado `WHERE status <> 'cancelado'` na constraint |

## Sources

### Primary (HIGH confidence)
- Codebase (lido diretamente): `src/lib/booking-engine.ts`, `src/app/actions/public-booking.ts`,
  `src/app/actions/agendamentos.ts`, `src/app/book/[slug]/mensagens.ts`,
  `supabase/schemas/06_clientes.sql`, `07_agendamentos.sql`,
  `src/app/actions/__tests__/public-booking-escrita.test.ts` (assere `error.code === '23505'`),
  `src/lib/__tests__/booking-engine.test.ts`, `supabase/migrations/20260722185755_slug_gratuito_unico.sql`,
  `vitest.config.ts`, `.planning/STATE.md`, `.planning/ROADMAP.md`, `02-CONTEXT.md`
- CLAUDE.md / AGENTS.md / docs/SUPABASE_DECLARATIVE-DATABASE-SCHEMA.md (padrões obrigatórios)

### Secondary (MEDIUM confidence)
- supabase.com/blog/range-columns — padrão de exclusion constraint com `btree_gist` + `tstzrange`
  (usa coluna simples app-escrita)
- postgresql.org/docs/current/rangetypes.html, ddl-generated-columns.html, btree-gist.html

### Tertiary (LOW confidence)
- postgresql.org/message-id (thread "Can't find the right generated column syntax") — não
  confirma solução; corrobora a incerteza que o teste empírico resolve

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — nenhum pacote novo; formas travadas no ROADMAP; SQLSTATE confirmado no
  próprio código.
- Architecture (D-02, discriminação 23P01, RPC COALESCE): HIGH — edit surface lida linha a linha.
- `periodo` gerada vs trigger: MEDIUM — resolvido por teste empírico obrigatório (não gamble).
- `btree_gist` search_path no Supabase: MEDIUM — falha clara e imediata se ocorrer.
- Pitfalls: HIGH — derivados do código real e dos precedentes de migration do projeto.

**Research date:** 2026-07-23
**Valid until:** 2026-08-22 (estável; o único item volátil é a versão do Postgres do Supabase,
confirmável no apply)
