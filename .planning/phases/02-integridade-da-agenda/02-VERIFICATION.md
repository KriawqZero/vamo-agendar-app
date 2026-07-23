---
phase: 02-integridade-da-agenda
verified: 2026-07-23T17:50:21Z
status: human_needed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Perder a corrida no fluxo PÚBLICO: abrir /book/[slug] em duas abas, avançar as duas até o mesmo slot, confirmar numa e depois na outra."
    expected: "A aba perdedora mostra o aviso ÂMBAR 'esse horário acabou de ser reservado, escolha outro' com a grade recarregada (o slot morto some) — nunca a mensagem crua do PostgreSQL, nunca org_id ou horário de terceiro."
    why_human: "Render de tela e a experiência da recuperação de double-booking só o owner observa; o executor não renderiza. O código está verificado (discriminante slot_indisponivel, BookingApp solta o slot e refaz a grade), mas a aparência do aviso é UAT."
  - test: "Perder a corrida no WALK-IN do dashboard: abrir o NovoAgendamentoModal, escolher um slot que outro fluxo acabou de ocupar, confirmar."
    expected: "O modal mostra o aviso âmbar COM detalhe (cliente / serviço / horário do próprio tenant) e recarrega a grade — nunca a error.message do Postgres."
    why_human: "Render de tela do detalhe do conflito no dashboard; só o owner fecha. Código verificado (slot_ocupado + buscarConflitoWalkin escopado ao tenant), aparência é UAT."
---

# Phase 2: Integridade da agenda — Verification Report

**Phase Goal:** Dois clientes nunca ocupam o mesmo horário do mesmo profissional, e o tamanho de um agendamento não muda depois que ele foi marcado (duração gravada no agendamento + proteção atômica contra double-booking).
**Verified:** 2026-07-23T17:50:21Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

O contrato de integridade está fechado em código, schema e banco de dev. As cinco
verdades observáveis têm evidência de código, de constraint aplicada e de teste
(unitário hermético + integração contra o Supabase de dev). O que resta são dois itens
de UAT de TELA (render do aviso âmbar público e do detalhe do walk-in) que só o owner
observa — nenhum defeito de código falsifica um must_have, então o veredito é
`human_needed`, não `gaps_found`.

### Observable Truths

| # | Truth (ROADMAP Success Criteria) | Status | Evidence |
|---|----------------------------------|--------|----------|
| 1 | SC1/AGE-01: editar a duração de um serviço não altera o término de agendamentos já marcados | ✓ VERIFIED | `data_hora_fim` é coluna STORED `NOT NULL` (`07_agendamentos.sql:7`); a engine deriva ocupação exclusivamente dela (`booking-engine.ts:284,308-328`), nunca de join com `servicos`; ambas as actions gravam `data_hora_fim = data_hora + duracao` no INSERT (`public-booking.ts:495-506`, `agendamentos.ts:408,426`); remarcação congela o intervalo ORIGINAL (`agendamentos.ts:520-524`). Nenhum caminho reescreve `data_hora_fim` ao editar serviço. Testes herméticos 259/259 passam. |
| 2 | SC2/AGE-02: serviço desativado continua ocupando o tempo reservado — a engine não assume mais 30 min | ✓ VERIFIED | Ocupação vem de `data_hora_fim`; o antigo fallback de 30 min sumiu junto com o join (grep sem `30`/fallback de duração na ocupação). `menorDuracaoAtiva` (`booking-engine.ts:273`) é a regra anti-buraco, coisa DIFERENTE de ocupação, e permanece intacta. Caso AGE-02 coberto por `booking-engine.test.ts` (plano 02-01, suíte hermética verde). |
| 3 | SC3/AGE-03: duas requisições simultâneas para o mesmo intervalo → exatamente 1 agendamento ativo, público e walk-in | ✓ VERIFIED | Constraint `EXCLUDE USING gist (tenant_id WITH =, periodo WITH &&) WHERE status <> 'cancelado'` declarada (`07_agendamentos.sql:30`) e APLICADA no dev (medido pelo orquestrador). Teste de integração SC3 público: N chamadas concorrentes → 1 ok, N-1 `slot_indisponivel`, `count == 1` (`public-booking-escrita.test.ts:797-848`). Metade walk-in provada no nível da constraint (role-agnóstica: dois inserts admin sobrepostos → SQLSTATE 23P01, l.912). Integração 274/274 verde. |
| 4 | SC4/AGE-04: quem perde a corrida vê mensagem amigável com a grade recarregada — nunca a mensagem do PostgreSQL com org_id/horário de terceiro | ✓ VERIFIED (código) / ⏳ render em UAT | Ramo `agError?.code === '23P01'` ANTES do `erro_interno` genérico nos três caminhos (`public-booking.ts:521-530` → `slot_indisponivel`; `agendamentos.ts:438-441,565-573` → `slot_ocupado`); NUNCA chama `reportarExcecao` (integração assere `not.toHaveBeenCalled()`, l.855); só o discriminante atravessa flight, `.message` crua nunca (padrão `erroSinteticoSupabase`). BookingApp consome `slot_indisponivel` (solta o slot, refaz a grade, aviso âmbar — `BookingApp.tsx:282-283`); modal consome `slot_ocupado` com detalhe + refetch (`NovoAgendamentoModal.tsx:282-293`). O RENDER visual dos dois avisos é item de UAT (ver Human Verification). |
| 5 | SC5/AGE-05: agendar duas vezes com o mesmo telefone no mesmo tenant reaproveita o cliente, sem segunda linha nem disparo duplicado | ✓ VERIFIED | `UNIQUE (tenant_id, telefone)` (`06_clientes.sql:12`) + RPC `reaproveitar_ou_criar_cliente` `SECURITY INVOKER`, `search_path=''`, `ON CONFLICT DO UPDATE` COALESCE (`06_clientes.sql:65-89`), aplicada no dev. Ambos os fluxos chamam a RPC (`public-booking.ts:468`, `agendamentos.ts:362`). Teste de integração SC5: cliente reincidente reusa o id (uma linha), e-mail vazio preenchido, nome curado NÃO sobrescrito. |

**Score:** 5/5 truths verified (código + DB + testes). Nenhum truth em ⚠️ PRESENT_BEHAVIOR_UNVERIFIED. Dois itens de UAT de tela abertos para o owner (render do aviso âmbar público e do detalhe walk-in — a metade de segurança de SC4, "nunca a mensagem crua", já está totalmente verificada em código).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/booking-engine.ts` | ocupação lê `data_hora_fim`, sem join `servicos`, sem fallback 30 min | ✓ VERIFIED | Wired: importado por ambas as actions; ocupação l.284/308-328; anti-buraco intacto. WR-01 (info): crossing REVERSO de meia-noite não capturado — slot fantasma que falha no confirm; integridade preservada pela constraint. |
| `supabase/schemas/07_agendamentos.sql` | `data_hora_fim NOT NULL`, `ck_agendamento_fim_apos_inicio`, `periodo` GENERATED, `ag_sem_sobreposicao` | ✓ VERIFIED | Todas as constraints declaradas + COMMENT ON de negócio; espelham o banco medido. |
| `supabase/schemas/06_clientes.sql` | `UNIQUE (tenant_id, telefone)` + RPC INVOKER/COALESCE + REVOKE/GRANT | ✓ VERIFIED | Nada para anon; GRANT a authenticated/service_role; COMMENT ON completo. |
| `supabase/migrations/20260723162858_integridade_agenda.sql` | migration à mão: pré-voo, ordem obrigatória, DDL, GRANTs | ✓ VERIFIED | Ordem coluna→backfill→NOT NULL→CHECK→extension→periodo→EXCLUDE→UNIQUE→RPC→GRANT. Pré-voo autoritativo pós-D-06 registrou (a)=0 e (b)=0. Ledger head 20260723162858 (alinhado, medido pelo orquestrador). |
| `src/app/actions/public-booking.ts` | 23P01→slot_indisponivel, RPC de cliente, `data_hora_fim` no INSERT | ✓ VERIFIED | Ramo 23P01 antes do genérico, sem Sentry; discriminante fechado `MotivoPublico`. |
| `src/app/actions/agendamentos.ts` | `data_hora_fim` no INSERT, RPC no walk-in, slot_ocupado com detalhe, remarcação congela duração | ✓ VERIFIED | `buscarConflitoWalkin` escopado ao tenant (RLS authenticated), devolve só cliente/serviço/horário. WR-02 (warning): `.maybeSingle()` sem `.order().limit(1)` degrada o DETALHE quando o intervalo tentado cruza dois agendamentos — display-only, sem impacto de integridade/PII. |
| `src/app/dashboard/NovoAgendamentoModal.tsx` | consome retorno discriminado (aviso âmbar + refetch), sem string-matching | ✓ VERIFIED | `res.ok` → sucesso; `slot_ocupado` → `setAvisoConflito` + `setSlotsCarregados(null)` (refetch). Sem comparação de string de mensagem. |
| `src/app/actions/__tests__/public-booking-escrita.test.ts` | casos SC3 concorrência, SC5 COALESCE, SC4 zero-Sentry | ✓ VERIFIED | Suíte opt-in `EXIGIR_INTEGRACAO=1`; sentinela reprova (não pula) sem credenciais; filtra por TENANT_TESTE. |

### Key Link Verification

| From | To | Via | Status |
|------|----|----|--------|
| `booking-engine.ts` | `agendamentos.data_hora_fim` | `select('data_hora, data_hora_fim, status')` — ocupação da fonte congelada | ✓ WIRED |
| `public-booking.ts` / `agendamentos.ts` | RPC `reaproveitar_ou_criar_cliente` | `admin.rpc(...)` / `supabase.rpc(...)` com COALESCE atômico | ✓ WIRED |
| `public-booking.ts` | constraint `ag_sem_sobreposicao` | INSERT → `23P01` → `slot_indisponivel` (antes do genérico, sem Sentry) | ✓ WIRED |
| `agendamentos.ts` | `NovoAgendamentoModal.tsx` | retorno `{ ok:false, motivo:'slot_ocupado', conflito }` consumido por discriminante | ✓ WIRED |
| `BookingApp.tsx` | `slot_indisponivel` | recuperação de double-booking (solta slot, refaz grade, aviso âmbar) | ✓ WIRED |

### Requirements Coverage

| Requirement | Source Plan(s) | Status | Evidence |
|-------------|----------------|--------|----------|
| AGE-01 | 02-01, 02-02, 02-04, 02-05 | ✓ SATISFIED | `data_hora_fim` congelado no ato da reserva; imune a edição de duração; remarcação usa intervalo original |
| AGE-02 | 02-01 | ✓ SATISFIED | Engine deriva ocupação de `data_hora_fim`; fallback de 30 min removido |
| AGE-03 | 02-02, 02-04, 02-05, 02-06 | ✓ SATISFIED | Exclusion constraint aplicada + medida; integração de concorrência `count == 1` |
| AGE-04 | 02-03, 02-04, 02-06 | ✓ SATISFIED (código) | 23P01 discriminado, sem Sentry, `.message` crua nunca atravessa; render de tela em UAT |
| AGE-05 | 02-02, 02-03, 02-04, 02-05, 02-06 | ✓ SATISFIED | UNIQUE + RPC COALESCE; integração prova reuso de id sem duplicar |

Todos os 5 IDs AGE declarados no ROADMAP (`AGE-01..05`) constam da união das frontmatters `requirements` dos 6 planos. Nenhum ID órfão; REQUIREMENTS.md mapeia AGE-01..05 → Phase 2, todos cobertos.

### Behavioral / Integration Evidence (medido pelo orquestrador)

| Behavior | Result | Status |
|----------|--------|--------|
| Constraint de integridade aplicada no dev (data_hora_fim NOT NULL, ag_sem_sobreposicao, ck_fim, clientes_tenant_telefone_key, periodo, btree_gist, RPC) | presentes | ✓ PASS |
| Privilégios da RPC (anon=false, authenticated=true, service_role=true) | corretos | ✓ PASS |
| Ledger head = 20260723162858 (alinhado) | alinhado | ✓ PASS |
| `pnpm lint` | exit 0 | ✓ PASS |
| `pnpm test` (hermético) | 259/259 | ✓ PASS |
| `pnpm build` | exit 0 | ✓ PASS |
| `EXIGIR_INTEGRACAO=1 pnpm test` | 274/274 (+15 integração real-DB) | ✓ PASS |

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| (nenhum) | Sem TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER nos arquivos da fase | ℹ️ Info | Scan limpo nos 8 arquivos modificados |
| `booking-engine.ts:280-328` | WR-01: crossing reverso de meia-noite não capturado | ⚠️ Warning (info na REVIEW) | Slot fantasma que sempre falha no confirm; integridade preservada pela constraint (23P01). Só alcançável em janela de madrugada/24h. Não falsifica must_have. |
| `agendamentos.ts:197-212` | WR-02: `.maybeSingle()` sem `.order().limit(1)`; `error` descartado | ⚠️ Warning | Degrada o DETALHE do aviso walk-in quando o intervalo tentado cruza 2 agendamentos; display-only, sem impacto de integridade/PII. Não falsifica must_have. |

### Human Verification Required

Dois itens de UAT de tela (registrados no plano 02-06 e em `docs/PENDENCIAS.md`, nenhum marcado como concluído). Só o owner observa render:

#### 1. Aviso âmbar público na perda de corrida (AGE-04)
**Test:** Abrir `/book/[slug]` em duas abas, avançar as duas até o mesmo slot, confirmar numa e depois na outra.
**Expected:** A aba perdedora mostra o aviso âmbar "esse horário acabou de ser reservado, escolha outro" com a grade recarregada (slot morto some) — nunca a mensagem crua do PostgreSQL, nunca org_id/horário de terceiro.
**Why human:** Render de tela e experiência da recuperação; o código (discriminante, refetch, âmbar) está verificado, a aparência é UAT.

#### 2. Detalhe do conflito no walk-in do dashboard (AGE-04)
**Test:** No NovoAgendamentoModal, escolher um slot que outro fluxo acabou de ocupar e confirmar.
**Expected:** Aviso âmbar COM detalhe (cliente/serviço/horário do próprio tenant) e grade recarregada — nunca a error.message do Postgres.
**Why human:** Render de tela do detalhe; código verificado, aparência é UAT.

### Fronteira registrada (não é gap)

- **Corrida walk-in autenticada EM PROCESSO** (mock de auth do Clerk) ficou best-effort, não rodada. A metade walk-in do SC3 está provada no nível da CONSTRAINT (role-agnóstica: a mesma tabela, a mesma constraint, dois inserts sobrepostos → 23P01). Fronteira registrada em SUMMARY/PENDENCIAS. Não falsifica AGE-03.
- **Discrepância cosmética de nome de migration:** as frontmatters de 02-02/02-05 citam `20260723153155`, mas o arquivo aplicado e no repo é `20260723162858` (regenerado com timestamp posterior; ledger alinhado a 162858 conforme medição do orquestrador). Sem impacto — é o mesmo conteúdo DDL.

### Gaps Summary

Nenhum gap que falsifique o goal. As cinco verdades observáveis têm evidência de código,
constraint aplicada no banco de dev e teste (hermético 259/259 + integração 274/274). Os
dois warnings da REVIEW (WR-01 crossing reverso, WR-02 detalhe walk-in multi-conflito) são
display-only e explicitamente bounded pela constraint — degradam UX, não integridade.
Restam dois itens de UAT de tela que só o owner fecha; por isso o veredito é
`human_needed`, não `passed` nem `gaps_found`.

---

_Verified: 2026-07-23T17:50:21Z_
_Verifier: Claude (gsd-verifier)_
