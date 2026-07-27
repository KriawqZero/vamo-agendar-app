---
phase: 3
slug: anti-abuso-no-booking-p-blico
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-27
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.10 |
| **Config file** | `vitest.config.ts` (suíte hermética; integração opt-in via `EXIGIR_INTEGRACAO=1`) |
| **Quick run command** | `pnpm test` |
| **Full suite command** | `pnpm lint && pnpm test && pnpm build` + `npx tsc --noEmit` (gate de tipo — `pnpm test`/`build` não pegam erro de tipo em `.test.ts`) |
| **Estimated runtime** | ~60 seconds (280 testes / 20 arquivos no baseline) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test`
- **After every plan wave:** Run `pnpm lint && pnpm test && pnpm build && npx tsc --noEmit`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| _(preenchido pelo planner a partir do Phase Requirements → Test Map do RESEARCH.md)_ | | | | | | | | | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/__tests__/rate-limit.test.ts` — cobre ABU-01/ABU-02 (camadas, fail-open, no-op sem env, timeout como falha reportada); mock de `@upstash/ratelimit` via `vi.mock`, sem rede
- [ ] Testes de honeypot (sucesso falso sem I/O; atributos do campo por asserção de fonte) — cobre ABU-01/ABU-02
- [ ] Testes dos pontos de telemetria de bloqueio — cobre ABU-03
- [ ] Framework: nenhum install novo (Vitest presente)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Prova comportamental do SC1: script repetindo requisições até bater o teto | ABU-01 | Toca Redis real (fora do `pnpm test` hermético; regra viva: integração é opt-in) | Rodar contra `next start` com env Upstash de dev; repetir POST no fluxo público até receber `muitas_tentativas` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
