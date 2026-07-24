---
phase: 02-integridade-da-agenda
reviewed: 2026-07-23T17:43:20Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - src/lib/booking-engine.ts
  - src/lib/__tests__/booking-engine.test.ts
  - src/app/actions/public-booking.ts
  - src/app/actions/agendamentos.ts
  - src/app/dashboard/NovoAgendamentoModal.tsx
  - src/app/actions/__tests__/agendamentos-corrida.test.ts
  - src/app/actions/__tests__/public-booking-corrida.test.ts
  - src/app/actions/__tests__/public-booking-escrita.test.ts
  - supabase/schemas/06_clientes.sql
  - supabase/schemas/07_agendamentos.sql
  - supabase/migrations/20260723162858_integridade_agenda.sql
  - docs/PENDENCIAS.md
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: resolved
resolved: 2026-07-24T13:09:00Z
resolution_commit: e9f3b8f
---

# Phase 2: Code Review Report

**Reviewed:** 2026-07-23T17:43:20Z
**Depth:** standard
**Files Reviewed:** 12
**Status:** resolved

## Summary

Reviewed the "integridade da agenda" phase: the availability engine, both booking
Server Actions (public B2C and manual/remarcação B2B), the walk-in modal, the
declarative schema for `clientes`/`agendamentos`, the hand-written integrity migration,
and the three new test suites.

The core integrity contract is sound. The exclusion constraint `ag_sem_sobreposicao`
(`tenant_id WITH =, periodo WITH &&) WHERE status <> 'cancelado'`) is correctly built
after the `NOT NULL` + `CHECK` ordering, the `[)` half-open range matches the engine's
adjacency semantics (a booking ending at 10:00 does not conflict with one starting at
10:00, in both the DB and `calcularIntervalosLivres`), and the `23P01` discrimination is
placed before the generic error branch in all three write paths so real infra errors
(e.g. `23503`) still reach Sentry. Tenant isolation holds: the public flow resolves
`tenant_id` server-side from the slug (never from the browser), uses two separate `.eq()`
queries instead of an interpolated `or(...)` filter (no PostgREST filter injection), and
the RPC is `SECURITY INVOKER` with no `anon` grant. The reverse-crossing gap below is
**bounded by the constraint** — it degrades UX, it does not allow a double-booking.

No blocker-severity defect was proven. Two warnings and three informational items follow.

## Warnings

### WR-01: Engine misses occupancy from bookings that started the previous local day (reverse midnight crossing)

**File:** `src/lib/booking-engine.ts:280-328`
**Issue:** Occupancy is fetched by filtering the appointment's **start** into the
consulted local day: `limitesDoDia(dateStr, timezone)` returns `inicio` = 00:00 local of
`dateStr`, and the query is `.gte('data_hora', inicio.toISOString()).lt('data_hora', fim.toISOString())`
(lines 280-288). The code then explicitly patches the **forward** crossing — a booking
that starts on `dateStr` and ends the next local day — by adding `1440 * diffDias` to
`end` (lines 315-325, "Pitfall 4"). But the **reverse** crossing is never handled: a
booking that started the previous local evening and runs into the early morning of
`dateStr` (e.g. `[prev-day 23:30, dateStr 00:30)`) has its `data_hora` **before** `inicio`,
so it is filtered out of the query entirely and never contributes to `slotsOcupados`. The
engine will therefore offer an early-morning slot on `dateStr` that is actually occupied.
This is only reachable for tenants whose working window for `dateStr` includes the early
morning (a 24h or `00:00`-start window), so it is low-frequency, but the JSDoc claims the
midnight case is handled when only one direction is. **Integrity is not lost**: the DB
constraint's `periodo` for the prior-evening booking (`[prev 23:30, 00:30)`) overlaps the
new `[00:00, 00:30)`, so the INSERT fails with `23P01` and the caller returns
`slot_indisponivel`/`slot_ocupado`. The observable defect is a confusing "grade
anti-buraco" that offers a slot which always fails at confirm time.
**Fix:** Widen the occupancy query to also fetch bookings whose interval *ends* inside the
day, then clamp their local-minute `start` to `>= 0` for the grid. Concretely, add an
overlap-style predicate instead of a start-only range, e.g.:
```ts
// fetch anything whose period intersects [inicio, fim), not just what starts in it
let queryAgendamentos = supabase
    .from('agendamentos')
    .select('data_hora, data_hora_fim, status')
    .eq('tenant_id', tenantId)
    .neq('status', 'cancelado')
    .lt('data_hora', fim.toISOString())       // starts before day end
    .gt('data_hora_fim', inicio.toISOString()) // ends after day start
```
and, symmetric to the forward patch, when `diaLocal(data_hora) < dateStr` set `start = 0`
(and keep `end` in `dateStr`'s local minutes) so the leading occupation is subtracted.

### WR-02: `buscarConflitoWalkin` silently swallows the multi-row error and can span more than one appointment

**File:** `src/app/actions/agendamentos.ts:197-212`
**Issue:** The overlap query for the conflict detail ends in `.maybeSingle()` with no
`.limit(1)` and no `.order(...)`, and only `data` is destructured (`const { data: conflito } = await query.maybeSingle()`) — the `error` field is discarded. A single tentative
interval can overlap **more than one** existing appointment (existing appointments never
overlap each other, but a long tentative interval — e.g. a 90-min walk-in — can straddle
two short ones). In that case `.maybeSingle()` returns a "more than one row" error and
`data === null`, so `conflito` is null and the amber message silently degrades to the
generic "Esse horário acabou de ser ocupado" even though a specific conflict exists. It is
display-only (no correctness/PII impact — the fallback never leaks), but the intended
"quem/o quê/quando" detail is lost precisely in the multi-conflict case, and swallowing
the error hides the condition.
**Fix:** Make the read deterministic and single-row by construction:
```ts
const { data: conflito } = await query
    .order('data_hora', { ascending: true })
    .limit(1)
    .maybeSingle()
```

## Info

### IN-01: `booking-engine.test.ts` fake does not honor the `status = 'cancelado'` filter — cancelled-occupancy path is unexercised

**File:** `src/lib/__tests__/booking-engine.test.ts:42-47`
**Issue:** The `agendamentos` fake honors only `neq('id', ...)` (`if (coluna === 'id')`);
the engine's `.neq('status', 'cancelado')` is a no-op in the dublê. No test feeds a
cancelled appointment, so the assertion that a cancelled booking must **not** occupy its
slot (and must free it again — the exact reason `WHERE status <> 'cancelado'` exists on the
constraint) is never covered at the engine level. The integration suite proves the
constraint side, but the pure engine's parity with it is untested.
**Fix:** Add a case with a `status: 'cancelado'` appointment overlapping a window and
assert the slot is still offered; optionally have the fake honor `neq('status', ...)` too.

### IN-02: Public flow sends un-sanitized name to notifications while persisting the trimmed one

**File:** `src/app/actions/public-booking.ts:360-363, 563-570`
**Issue:** `nomeLimpo = clienteNome.trim()` is what gets validated and written via the RPC,
but `dispararNotificacoesAgendamento` is called with the raw `clienteNome` (untrimmed) at
line 566. The persisted client name and the name that renders in the WhatsApp confirmation
can differ by leading/trailing whitespace. Cosmetic (telefone is re-sanitized downstream in
`whatsapp-helper`), but the two should agree.
**Fix:** Pass `nomeLimpo` (and `telefoneLimpo`) to `dispararNotificacoesAgendamento`.

### IN-03: Slot revalidation depends on byte-exact ISO string equality with no normalization

**File:** `src/app/actions/public-booking.ts:438` and `src/app/actions/agendamentos.ts:410`
**Issue:** Both write paths validate the chosen slot with `slotsLivres.some((sl) => sl.datetime === dataHora)` — a raw string comparison against the engine's
`instante.toISOString()` (always millisecond-precision, e.g. `...:00.000Z`). This is
intentional and documented as the anti-double-booking contract, and works because the
client echoes the engine's own `datetime`. Flagged only as a latent fragility: a client
that sends a semantically-equal but differently-formatted instant (`...:00Z` vs
`...:00.000Z`) is rejected as `slot_indisponivel`/`slot_ocupado` even though the slot is
free. Acceptable as-is given the flow; noted so a future caller does not reuse the action
with a hand-built timestamp.
**Fix:** If a non-UI caller is ever added, compare by epoch (`new Date(sl.datetime).getTime() === dataObj.getTime()`) rather than string identity.

## Resolution — 2026-07-24

Commit `e9f3b8f` resolveu os dois warnings e os dois itens informativos
acionáveis:

- **WR-01:** a consulta agora busca interseção de períodos e normaliza os dois
  extremos contra o dia consultado. Um teste cobre
  `[ontem 23:30, hoje 00:30)`.
- **WR-02:** o conflito walk-in escolhe deterministicamente o primeiro
  agendamento com `order + limit(1) + maybeSingle`.
- **IN-01:** o dublê honra `status <> cancelado` e um teste garante que
  cancelamento libera o slot na engine.
- **IN-02:** a notificação recebe o mesmo nome aparado e telefone saneado que
  foram persistidos.
- **IN-03:** aceito como contrato atual. Os callers existentes ecoam o ISO
  produzido pela engine; normalização por epoch fica para um futuro caller que
  construa timestamps por conta própria.

Gates após o patch:

- `pnpm test`: 18 arquivos, 261 testes verdes;
- `pnpm test:integracao`: 15 testes verdes contra o Supabase de dev;
- `pnpm lint`: verde;
- `pnpm exec tsc --noEmit --pretty false`: verde;
- `pnpm build`: verde.

Os dois UATs visuais do owner continuam pendentes e não foram marcados por este
fechamento de review.

---

_Reviewed: 2026-07-23T17:43:20Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
