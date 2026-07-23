---
status: testing
phase: 02-integridade-da-agenda
source: [02-VERIFICATION.md]
started: 2026-07-23T17:55:00Z
updated: 2026-07-23T17:55:00Z
---

## Current Test

number: 1
name: Perder a corrida no fluxo PÚBLICO (aviso âmbar + grade recarregada)
expected: |
  Abrir /book/[slug] em duas abas, avançar as duas até o mesmo slot, confirmar
  numa e depois na outra. A aba perdedora mostra o aviso ÂMBAR "esse horário
  acabou de ser reservado, escolha outro" com a grade recarregada (o slot morto
  some) — nunca a mensagem crua do PostgreSQL, nunca org_id ou horário de terceiro.
awaiting: user response

## Tests

### 1. Perda de corrida no fluxo PÚBLICO
expected: Abrir /book/[slug] em duas abas, avançar as duas até o mesmo slot, confirmar numa e depois na outra. A aba perdedora mostra o aviso ÂMBAR "esse horário acabou de ser reservado, escolha outro" com a grade recarregada (o slot morto some) — nunca a mensagem crua do PostgreSQL, nunca org_id ou horário de terceiro.
result: [pending]

### 2. Perda de corrida no WALK-IN do dashboard
expected: Abrir o NovoAgendamentoModal, escolher um slot que outro fluxo acabou de ocupar, confirmar. O modal mostra o aviso âmbar COM detalhe (cliente / serviço / horário do próprio tenant) e recarrega a grade — nunca a error.message do Postgres.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
