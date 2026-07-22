---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: Lançamento público
current_phase: 01
current_phase_name: hardening-da-superf-cie-p-blica
status: executing
stopped_at: Completed 01-03-PLAN.md
last_updated: "2026-07-22T05:31:07.662Z"
last_activity: 2026-07-22
last_activity_desc: Phase 01 execution started
progress:
  total_phases: 1
  completed_phases: 0
  total_plans: 5
  completed_plans: 2
---

# Project State

## Project Reference

See: .planning/PROJECT.md (atualizado 2026-07-21)

**Core value:** Um agendamento real, feito por um cliente final que nunca ouviu falar do VamoAgendar, cair na agenda do profissional sem que nada quebre no caminho.
**Current focus:** Phase 01 — hardening-da-superf-cie-p-blica

## Current Position

Phase: 01 (hardening-da-superf-cie-p-blica) — EXECUTING
Plan: 3 of 5
Status: Ready to execute
Last activity: 2026-07-22 — Phase 01 execution started

Progress: [████░░░░░░] 40%

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
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01 P01 | 46min | 2 tasks | 4 files |
| Phase 01 P03 | ~25min | 3 tasks | 9 files |

## Accumulated Context

### Decisions

Log completo em PROJECT.md (Key Decisions). Decisões que governam o trabalho atual:

- **Roadmap**: estrutura por camadas técnicas, 12 fases, ordenadas por valor decrescente para que qualquer corte caia no item menos crítico
- **Roadmap**: barra mínima para abrir = Phases 1-5, 7, 10, 11, 12. Adiáveis nesta ordem: 6 (diferencial), 8 (autonomia do cliente), 9 (cobrança — contorno é upgrade manual por SQL)
- **Roadmap**: DIF-01/DIF-02 antecipados ao checkout por decisão do owner ("uso real vale mais que receita neste milestone")
- **Roadmap**: AUT-01 a AUT-09 promovidos de v2 para v1 — table stake que toda a concorrência entrega
- **Rede de proteção do banco removida do v1 (2026-07-21)**: o banco atual não é produção e migration destrutiva está autorizada pelo owner; o Pro (backup diário, sem pausa) entra quando o sócio aprovar. Volta a ser obrigatória quando existir dado de terceiro — condição escrita no ROADMAP.md e no PROJECT.md
- **Hardening antes do checkout**: rate limit na Server Action é teatro enquanto o INSERT `anon` existir
- [Phase ?]: apply_migration do MCP não preserva a version do arquivo — toda aplicação exige corrigir version/name por DML no ledger em seguida (01-04 aplica mais duas)
- [Phase ?]: Prova de leitura privilegiada por contrafactual de slug: /book/<slug-pago> 200 E /book/<slug_gratuito> 404 — um 200 sozinho não distingue os dois mundos
- [Phase ?]: Assinatura do QStash substitui conferencia de secret em query string no webhook de lembrete
- [Phase ?]: Chaves de assinatura lidas na chamada, nunca em constante de modulo
- [Phase ?]: url: req.url preserva os lembretes ja enfileirados com query string

### Pending Todos

Nenhum ainda.

### Blockers/Concerns

- ✅ **RESOLVIDO 2026-07-21 — DNS do subdomínio de e-mail.** `mail.vamoagendar.com.br` verificado no Resend, DKIM propagado (conferido por `dig`). Deixou de bloquear a Phase 4. Remetente: `naoresponda@mail.vamoagendar.com.br`. Restam dois TXT opcionais do owner: DMARC `p=` com `rua` e SPF do subdomínio — nenhum impede enviar
- **Nenhum endereço do domínio recebe e-mail** (sem MX na raiz e no subdomínio). O `suporte@`/`contato@` da Phase 10 exige provedor de caixa próprio — o Resend só envia. Decisão adiada por escolha do owner em 2026-07-21
- **Aprovação da conta Asaas para produção**: dependência externa sem prazo, fora do controle do owner. Não bloqueia a construção (sandbox), bloqueia ATI-02 na Phase 12
- **Upgrade para Supabase Pro**: depende de aprovação do sócio, sem data. Não bloqueia nenhuma fase, mas é a condição para haver dado de terceiro no banco — sem ele, `pg_dump` antes de migration destrutiva volta a ser obrigatório
- **Decisão pendente do owner** (Phase 3): Upstash Redis vs. RPC atômica no Postgres para o rate limit; o Redis do Railway não serve (TCP, pertence à Evolution API)
- **Revisão jurídica humana** dos termos e da política antes de publicar (Phase 10) — menor confiança de toda a pesquisa
- **Precedência de lookup** quando telefone e e-mail batem em clientes diferentes: decidir na Phase 5, não descobrir em produção
- 🚨 **Janela de crash-loop aberta agora (quick task 260721-jif).** A lista de treze variáveis obrigatórias em produção já está valendo no `master`. Deploy de produção **antes** de provisionar `ANALYTICS_TENANT_SALT`, `NEXT_PUBLIC_SENTRY_DSN` e `RESEND_API_KEY` no Railway derruba o boot de propósito. É o comportamento pedido (OPE-02 e SEG-05 dependem dele), mas o intervalo entre merge e configuração é risco real. Duas saídas escritas em `docs/PENDENCIAS.md`: provisionar antes, ou remover as quatro da lista no mesmo commit do deploy
- pnpm build não rodado no plano 01-01 (lint e test verdes); a Definition of Done exige os três — rodar no 01-02 ou no fechamento da fase
- UAT do wizard completo de /book/avantis pendente (regressão obrigatória do CONTEXT §specifics); o contrafactual de slug prova só a leitura do plano

### Quick Tasks Completed

| # | Description | Date | Commit | Status | Directory |
|---|-------------|------|--------|--------|-----------|
| 260721-jif | Fundação operacional — Sentry, PostHog e Resend (etapa preparatória, pré-requisito da Phase 1) | 2026-07-21 | b80c408 | Needs Review | [260721-jif-fundacao-operacional-sentry-posthog-e-re](./quick/260721-jif-fundacao-operacional-sentry-posthog-e-re/) |
| 2 | Adiciona "type": "http" ao servidor Sentry em .mcp.json (elimina warning do /mcp) | 2026-07-21 | ddcda54 | — | — |

**Status `Needs Review`**: as 4 tarefas de código fecharam e foram verificadas (0 gaps,
`pnpm lint`/`test`/`build` verdes, 164 testes). Os dois checkpoints dependem do owner:

- **Gate 1** — criar projeto no Sentry e no PostHog Cloud, colar o bloco de
  `260721-jif-ENV-BLOCO.md` no `.env.example`, provisionar as treze obrigatórias no Railway.
  Retomar informando: se colou o bloco, a região do PostHog e os slugs de org/projeto do Sentry

- **Gate 2** — validar visualmente que evento chega no PostHog, erro chega no Sentry (e a issue
  não carrega PII) e o e-mail de smoke test chega na caixa, anotando a aba (insumo da Phase 4)

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Dívida de ambiente | `DEBUG_QSTASH=1` está no `.env.example` e provavelmente nos ambientes (Railway incluso). Já listada como dívida no `PROJECT.md`; remover de `.env.example` e dos ambientes. Não é escopo da Phase 1 | Aberto | 2026-07-21 |

## Session Continuity

Last session: 2026-07-22T05:31:07.655Z
Stopped at: Completed 01-03-PLAN.md
Resume file: None
