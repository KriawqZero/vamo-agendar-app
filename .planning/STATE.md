---
gsd_state_version: '1.0'
status: planning
progress:
  total_phases: 13
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (atualizado 2026-07-20)

**Core value:** Um agendamento real, feito por um cliente final que nunca ouviu falar do VamoAgendar, cair na agenda do profissional sem que nada quebre no caminho.
**Current focus:** Phase 1 — Rede de proteção do banco

## Current Position

Phase: 1 de 13 (Rede de proteção do banco)
Plan: — (nenhum plano criado ainda)
Status: Ready to plan
Last activity: 2026-07-20 — ROADMAP.md criado, 59/59 requisitos v1 mapeados

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: —
- Trend: —

*Atualizado após cada plano concluído*

## Accumulated Context

### Decisions

Log completo em PROJECT.md (Key Decisions). Decisões que governam o trabalho atual:

- **Roadmap**: estrutura por camadas técnicas, 13 fases, ordenadas por valor decrescente para que qualquer corte caia no item menos crítico
- **Roadmap**: barra mínima para abrir = Phases 1-6, 8, 11, 12, 13. Adiáveis nesta ordem: 7 (diferencial), 9 (autonomia do cliente), 10 (cobrança — contorno é upgrade manual por SQL)
- **Roadmap**: DIF-01/DIF-02 antecipados ao checkout por decisão do owner ("uso real vale mais que receita neste milestone")
- **Roadmap**: AUT-01 a AUT-09 promovidos de v2 para v1 — table stake que toda a concorrência entrega
- **Supabase Free**: `pg_dump` + keep-alive são as primeiras tarefas do milestone, não itens de go-live — retenção de backup é zero e o risco é *deste* milestone
- **Hardening antes do checkout**: rate limit na Server Action é teatro enquanto o INSERT `anon` existir

### Pending Todos

Nenhum ainda.

### Blockers/Concerns

- **DNS do subdomínio de e-mail** (SPF + DKIM + MX + DMARC `p=none`): tarefa do owner, propagação de 24–48h, bloqueia a Phase 5. **Começar agora, em paralelo à Phase 1**
- **Aprovação da conta Asaas para produção**: dependência externa sem prazo, fora do controle do owner. Não bloqueia a construção (sandbox), bloqueia ATI-02 na Phase 13
- **Decisão pendente do owner** (Phase 4): Upstash Redis vs. RPC atômica no Postgres para o rate limit; o Redis do Railway não serve (TCP, pertence à Evolution API)
- **Revisão jurídica humana** dos termos e da política antes de publicar (Phase 11) — menor confiança de toda a pesquisa
- **Precedência de lookup** quando telefone e e-mail batem em clientes diferentes: decidir na Phase 6, não descobrir em produção

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(nenhum)* | | | |

## Session Continuity

Last session: 2026-07-20
Stopped at: ROADMAP.md e STATE.md criados; rastreabilidade do REQUIREMENTS.md preenchida
Resume file: None
