---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: Lançamento público
current_phase: 1
current_phase_name: Hardening da superfície pública
status: planning
stopped_at: Phase 1 context gathered — pronto para /gsd-plan-phase 1
last_updated: "2026-07-21T16:40:22.781Z"
last_activity: 2026-07-21
last_activity_desc: contexto da Phase 1 capturado; superfície anon medida contra a Data API real
progress:
  total_phases: 12
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (atualizado 2026-07-21)

**Core value:** Um agendamento real, feito por um cliente final que nunca ouviu falar do VamoAgendar, cair na agenda do profissional sem que nada quebre no caminho.
**Current focus:** Phase 1 — Hardening da superfície pública

## Current Position

Phase: 1 de 12 (Hardening da superfície pública)
Plan: — (nenhum plano criado ainda)
Status: Ready to plan
Last activity: 2026-07-21 — fase de backup removida do roadmap; 56/56 requisitos v1 mapeados em 12 fases

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

- **Roadmap**: estrutura por camadas técnicas, 12 fases, ordenadas por valor decrescente para que qualquer corte caia no item menos crítico
- **Roadmap**: barra mínima para abrir = Phases 1-5, 7, 10, 11, 12. Adiáveis nesta ordem: 6 (diferencial), 8 (autonomia do cliente), 9 (cobrança — contorno é upgrade manual por SQL)
- **Roadmap**: DIF-01/DIF-02 antecipados ao checkout por decisão do owner ("uso real vale mais que receita neste milestone")
- **Roadmap**: AUT-01 a AUT-09 promovidos de v2 para v1 — table stake que toda a concorrência entrega
- **Rede de proteção do banco removida do v1 (2026-07-21)**: o banco atual não é produção e migration destrutiva está autorizada pelo owner; o Pro (backup diário, sem pausa) entra quando o sócio aprovar. Volta a ser obrigatória quando existir dado de terceiro — condição escrita no ROADMAP.md e no PROJECT.md
- **Hardening antes do checkout**: rate limit na Server Action é teatro enquanto o INSERT `anon` existir

### Pending Todos

Nenhum ainda.

### Blockers/Concerns

- ✅ **RESOLVIDO 2026-07-21 — DNS do subdomínio de e-mail.** `mail.vamoagendar.com.br` verificado no Resend, DKIM propagado (conferido por `dig`). Deixou de bloquear a Phase 4. Remetente: `naoresponda@mail.vamoagendar.com.br`. Restam dois TXT opcionais do owner: DMARC `p=none` com `rua` e SPF do subdomínio — nenhum impede enviar
- **Nenhum endereço do domínio recebe e-mail** (sem MX na raiz e no subdomínio). O `suporte@`/`contato@` da Phase 10 exige provedor de caixa próprio — o Resend só envia. Decisão adiada por escolha do owner em 2026-07-21
- **Aprovação da conta Asaas para produção**: dependência externa sem prazo, fora do controle do owner. Não bloqueia a construção (sandbox), bloqueia ATI-02 na Phase 12
- **Upgrade para Supabase Pro**: depende de aprovação do sócio, sem data. Não bloqueia nenhuma fase, mas é a condição para haver dado de terceiro no banco — sem ele, `pg_dump` antes de migration destrutiva volta a ser obrigatório
- **Decisão pendente do owner** (Phase 3): Upstash Redis vs. RPC atômica no Postgres para o rate limit; o Redis do Railway não serve (TCP, pertence à Evolution API)
- **Revisão jurídica humana** dos termos e da política antes de publicar (Phase 10) — menor confiança de toda a pesquisa
- **Precedência de lookup** quando telefone e e-mail batem em clientes diferentes: decidir na Phase 5, não descobrir em produção

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Dívida de ambiente | `DEBUG_QSTASH=1` está no `.env.example` e provavelmente nos ambientes (Railway incluso). Já listada como dívida no `PROJECT.md`; remover de `.env.example` e dos ambientes. Não é escopo da Phase 1 | Aberto | 2026-07-21 |

## Session Continuity

Last session: 2026-07-21T16:40:22.774Z
Stopped at: Phase 1 context gathered — pronto para /gsd-plan-phase 1
Resume file: .planning/phases/01-hardening-da-superf-cie-p-blica/01-CONTEXT.md
