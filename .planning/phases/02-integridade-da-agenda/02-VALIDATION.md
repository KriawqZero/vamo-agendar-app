---
phase: 2
slug: integridade-da-agenda
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-23
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded by plan-phase; refined by validate-phase once plans exist.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.1 |
| **Config file** | `vitest.config.ts` (env stubs para constantes de módulo; suíte hermética por padrão) |
| **Quick run command** | `pnpm test` |
| **Full suite command** | `EXIGIR_INTEGRACAO=1 pnpm test` (inclui a suíte de integração que toca o Supabase de dev — opt-in por design, regra viva em docs/PENDENCIAS.md) |
| **Estimated runtime** | ~20 s hermética; integração depende de latência do Supabase Cloud |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test`
- **After every plan wave:** Run `EXIGIR_INTEGRACAO=1 pnpm test`
- **Before `/gsd-verify-work`:** Full suite must be green + `pnpm lint` + `pnpm build`
- **Max feedback latency:** 60 seconds (hermética)

---

## Per-Task Verification Map

> Seed — filled per plan by validate-phase after PLAN.md files exist. The seams below come from RESEARCH.md §Validation Architecture.

| Success Criterion | Requirement | Seam | Test Type | Notes |
|-------------------|-------------|------|-----------|-------|
| SC1 — editar duração do serviço não move término de agendamento marcado | AGE-01 | engine lê `data_hora_fim`, não o join `servicos` | unit (pura) | fixtures da engine passam a carregar `data_hora_fim` |
| SC2 — serviço desativado ocupa o tempo reservado (não assume 30 min) | AGE-02 | mesma fonte `data_hora_fim`; `|| 30` removido | unit (pura) | caso: agendamento de serviço inativo/deletado |
| SC3 — duas requisições simultâneas → exatamente um agendamento ativo | AGE-03 | exclusion constraint `EXCLUDE ... WHERE status <> 'cancelado'` | **integração (DB real)** | prova de concorrência: 2 inserts paralelos no mesmo intervalo → 1 sucesso, 1 `23P01`; público E walk-in |
| SC4 — perdedor da corrida vê mensagem amigável, nunca erro do Postgres | AGE-04 | `error.code === '23P01'` → `slot_indisponivel`, sem Sentry | integração + unit | contrafactual: sem o ramo, retorno vira `erro_interno` |
| SC5 — mesmo telefone no mesmo tenant reaproveita cliente, sem duplicar | AGE-05 | unique `(tenant_id, telefone)` + upsert COALESCE via função Postgres | integração (DB real) | 2 agendamentos, mesmo telefone → 1 linha em `clientes`, 1 disparo |

---

## Wave 0 Requirements

- [ ] Fixtures da engine (`src/lib/__tests__/booking-engine.test.ts`) atualizados para `data_hora_fim` — pré-condição de SC1/SC2
- [ ] Ponto de entrada de integração para a prova de concorrência de SC3 (suíte `EXIGIR_INTEGRACAO=1`)

*Detalhe final derivado dos PLAN.md pela validate-phase.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Mensagem âmbar de conflito renderiza na tela (público) | AGE-04 | UAT humano — só o owner confirma a tela | Perder uma corrida real em `/book/[slug]` e ver a caixa âmbar com os horários recarregados |
| Aviso de conflito com detalhe cliente/serviço no walk-in | SC3/SC4 (dashboard) | UAT humano — render do dashboard | Tentar marcar walk-in sobre horário ocupado e ver o detalhe do agendamento conflitante + agenda recarregada |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
