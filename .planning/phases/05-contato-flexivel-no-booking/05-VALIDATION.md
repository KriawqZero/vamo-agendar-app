---
phase: 5
slug: contato-flexivel-no-booking
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-08
---

# Phase 5 — Validation Strategy

> Contrato de validação da fase, usado para amostragem de feedback durante a execução.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.10 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `pnpm test` |
| **Full suite command** | `pnpm test && pnpm lint && npx tsc --noEmit && pnpm build` |

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------------|-----------|-------------------|-------------|--------|
| _pendente_ | — | — | BOO-01..03 / EML-03 | — | — | — | — | ⬜ pending |

---

## Success Criteria → prova

| SC | Comportamento | Tipo | Evidência | Existe? |
|----|---------------|------|-----------|---------|
| **SC1** | Booking com só e-mail, só WhatsApp ou ambos; ambos vazios é recusado | unit | Teste em `public-booking-validacao.test.ts` | ❌ Wave 0 |
| **SC2** | Confirmação por e-mail com remetente e assunto corretos | unit | Teste em `ConfirmacaoAgendamento.test.tsx` | ❌ Wave 0 |
| **SC3** | Tela de sucesso imediata sem esperar disparo (via `after()`) | unit | Teste em `public-booking-escrita.test.ts` | ❌ Wave 0 |
| **SC4** | Reconhecimento de cliente por e-mail ou WhatsApp existente | unit | Teste em `public-booking-corrida.test.ts` | ❌ Wave 0 |
