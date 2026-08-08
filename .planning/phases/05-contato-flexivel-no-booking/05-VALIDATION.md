---
phase: 5
slug: contato-flexivel-no-booking
status: validated
nyquist_compliant: true
wave_0_complete: true
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
| 05-01-01 | 01 | 1 | BOO-02 | Dedupe atômico por WhatsApp e E-mail | unit | `pnpm test src/app/actions/__tests__/public-booking-dedupe.test.ts` | ✅ | ✅ passed |
| 05-02-01 | 02 | 1 | EML-03..04 | Template React Email ConfirmacaoAgendamento | unit | `pnpm test src/emails/__tests__/ConfirmacaoAgendamento.test.tsx` | ✅ | ✅ passed |
| 05-03-01 | 03 | 2 | BOO-01 | Form flexível com Nome, WhatsApp e E-mail | unit | `pnpm test` | ✅ | ✅ passed |
| 05-04-01 | 04 | 2 | BOO-02..03, EML-03 | Orquestração multicanal e after() | unit | `pnpm test src/app/actions/__tests__/public-booking-notificacoes.test.ts` | ✅ | ✅ passed |
| 05-05-01 | 05 | 3 | BOO-01..03, EML-03 | Gate final de qualidade de 4 comandos | unit/build | `pnpm test && pnpm lint && npx tsc --noEmit && pnpm build` | ✅ | ✅ passed |

---

## Success Criteria → prova

| SC | Comportamento | Tipo | Evidência | Existe? |
|----|---------------|------|-----------|---------|
| **SC1** | Booking com só e-mail, só WhatsApp ou ambos; ambos vazios é recusado | unit | `EtapaContato.tsx` e `public-booking.ts` | ✅ Sim (`pnpm test`) |
| **SC2** | Confirmação por e-mail com remetente e assunto corretos | unit | `ConfirmacaoAgendamento.test.tsx` | ✅ Sim (`pnpm test`) |
| **SC3** | Tela de sucesso imediata sem esperar disparo (via `after()`) | unit | `public-booking-notificacoes.test.ts` | ✅ Sim (`pnpm test`) |
| **SC4** | Reconhecimento de cliente por e-mail ou WhatsApp existente | unit | `public-booking-dedupe.test.ts` | ✅ Sim (`pnpm test`) |
