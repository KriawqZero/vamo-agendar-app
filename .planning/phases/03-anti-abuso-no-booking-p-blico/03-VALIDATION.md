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
| 03-01/T2 | 03-01 | 1 | ABU-01, ABU-02 | T-03-01-01/02/03 | Bloqueio de IP recusa antes do admin client; fail-open em rejeição E timeout; chave nunca crua; copy D-07 byte a byte | unit (mock @upstash/*, sem rede) | `pnpm test -- src/lib/__tests__/rate-limit.test.ts src/app/actions/__tests__/public-booking-validacao.test.ts src/app/book/__tests__/mensagens.test.ts` | ❌ Wave 0 (nasce na task, testes primeiro) | ⬜ pending |
| 03-02/T1 | 03-02 | 2 | ABU-03 | T-03-02-01/02 | Allowlist fechada com atributos novos; variante aguardada nunca lança | unit | `pnpm test -- src/lib/observabilidade/__tests__/log.test.ts` | ✅ (estender) | ⬜ pending |
| 03-02/T2 | 03-02 | 2 | ABU-03 | T-03-02-01/03 | Bloqueio de IP emite log aguardado + PostHog sem PII; telemetria nunca afeta o return; sem Issue em bloqueio de rotina | unit (spies) | `pnpm test -- src/app/actions/__tests__/public-booking-validacao.test.ts` | ✅ (estender) | ⬜ pending |
| 03-03/T1 | 03-03 | 3 | ABU-01 | T-03-03-01/03/04 | Camadas telefone (5/1h, conversão D-08) e tenant (30/1h) com chave hasheada por parte | unit | `pnpm test -- src/lib/__tests__/rate-limit.test.ts` | ✅ (estender) | ⬜ pending |
| 03-03/T2 | 03-03 | 3 | ABU-01, ABU-03 | T-03-03-02 | Checagem pós-resolução antes da engine; Issue estática só no teto por tenant, tenant só como hash (D-12) | unit (spies) | `pnpm test -- src/app/actions/__tests__/public-booking-validacao.test.ts` | ✅ (estender) | ⬜ pending |
| 03-04/T1 | 03-04 | 4 | ABU-01, ABU-02 | T-03-04-01/02 | Teto de leitura só em obterSlotsPublicos, antes do admin client (asserção negativa de slug_invalido); page load fora | unit | `pnpm test -- src/lib/__tests__/rate-limit.test.ts src/app/actions/__tests__/public-booking-validacao.test.ts` | ✅ (estender) | ⬜ pending |
| 03-04/T2 | 03-04 | 4 | ABU-01 | T-03-04-03 | Env vars do Redis na lista de obrigatórias; build local sem secrets segue vivo (D-04) | unit + build | `pnpm test -- src/lib/__tests__/env.test.ts && pnpm build` | ✅ (estender) | ⬜ pending |
| 03-05/T1 | 03-05 | 5 | ABU-02 | T-03-05-02 | Campo armadilha invisível/inerte por asserção de FONTE (tabIndex, aria-hidden, autocomplete, off-screen) | source assertion | `pnpm test -- src/app/book/__tests__/honeypot-campo.test.ts` | ❌ Wave 0 (nasce na task) | ⬜ pending |
| 03-05/T2 | 03-05 | 5 | ABU-01, ABU-03 | T-03-05-01/03/04 | Sucesso falso sem I/O (admin/engine/notificações não chamados); telemetria honeypot sem PII; funil não infla | unit (spies) | `pnpm test -- src/app/actions/__tests__/public-booking-validacao.test.ts` | ✅ (estender) | ⬜ pending |
| 03-06/T2 | 03-06 | 6 | ABU-01..03 | — | Gate da fase: suíte completa sobre o HEAD final | full suite | `pnpm lint && pnpm test && pnpm build && npx tsc --noEmit` | ✅ | ⬜ pending |

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
