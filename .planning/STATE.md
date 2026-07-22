---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: Lançamento público
current_phase: 01
current_phase_name: hardening-da-superf-cie-p-blica
status: gaps_found
stopped_at: "Phase 1 executada (5/5 planos) e verificada: gaps_found, 5/7 must-haves. Dois itens abertos + 7 UAT visuais nao executados. Proximo: /gsd-plan-phase 1 --gaps"
last_updated: "2026-07-22T06:45:42.975Z"
last_activity: 2026-07-22
last_activity_desc: "Phase 1 executada e verificada — gaps_found (SEG-05 fail-fast de boot nao derruba o processo; caminho de escrita do booking sem teste)"
progress:
  total_phases: 1
  completed_phases: 0
  total_plans: 5
  completed_plans: 5
---

# Project State

## Project Reference

See: .planning/PROJECT.md (atualizado 2026-07-21)

**Core value:** Um agendamento real, feito por um cliente final que nunca ouviu falar do VamoAgendar, cair na agenda do profissional sem que nada quebre no caminho.
**Current focus:** Phase 01 — hardening-da-superf-cie-p-blica

## Current Position

Phase: 01 (hardening-da-superf-cie-p-blica) — EXECUTING
Plan: 5 of 5
Status: Phase complete — ready for verification
Last activity: 2026-07-22 — Phase 01 execution started

Progress: [██████████] 100%

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
| Phase 01 P02 | ~12min | 3 tasks | 5 files |
| Phase 01 P04 | ~35min | 3 tasks | 8 files |
| Phase 01 P05 | ~45min | 3 tasks | 1 files |

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
- [Phase ?]: Leituras publicas por slug: o browser manda slug, o servidor devolve tenant_id — resolverPerfilPublicoPorSlug e a porta unica das tres funcoes publicas
- [Phase ?]: Projecao explicita por constante de modulo no caminho publico: com service role no caminho, pedir a linha inteira e vazamento por omissao (coluna nova entra sozinha no payload)
- [Phase ?]: tenantHash continua derivado do org_id cru no servidor — derivar do slug trocaria a chave do funil e partiria a serie do PostHog
- [Phase ?]: Fallback silencioso em leitura publica e bug: obterSlotsPublicos com slug nao resolvido lanca, em vez de calcular grade com fuso e regras padrao
- [Phase ?]: Default privileges revogadas para anon E authenticated: tabela nova nasce fora da Data API; custo aceito é migration manual de GRANT por tabela, a partir da Phase 7
- [Phase ?]: Saída de supabase db diff é rascunho, não artefato: forçado a diffar privilégio o migra gera o CONTRÁRIO (revoke service_role em tudo, grant truncate a anon) — privilégio mora em migration escrita à mão
- [Phase ?]: mcp__supabase__apply_migration está proibido: o método correto é execute_sql para o DDL + INSERT manual no ledger com a version do arquivo (duas confirmações, 01-01 e 01-04)
- [Phase ?]: supabase db diff sobe shadow database em Docker — única exceção de container do projeto, exige aprovação prévia (CLAUDE.md §Infraestrutura)
- [Phase ?]: Assuncao A1 refutada: sem env obrigatoria o boot do Next 16 NAO mata o processo — ele segue escutando e responde 500 em toda rota; healthcheck de deploy precisa ser por HTTP, nunca por liveness de processo
- [Phase ?]: Criterio 5 satisfeito na substancia por duas camadas (app nao serve nada + verificarAssinaturaQstash lanca sem chave), registrado como insatisfeito na forma — mudar semantica de boot e decisao de arquitetura, nao improviso de plano de verificacao
- [Phase ?]: Policies residuais de servicos/horarios_funcionamento registradas e nao fechadas: migration nao aplicavel criaria drift 18 arquivos x 17 versions no ledger; o conserto futuro e DROP puro, a substituta 1b ja existe
- [Phase ?]: Assertiva de vazamento por PADRAO e nao por substring: grep 'org_' falseia em producao por causa da baggage do Sentry (sentry-org_id=N)

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
- ✅ **RESOLVIDO no 01-02 — `pnpm build` não rodado no 01-01.** Os três comandos da Definition of Done rodaram verdes sobre o HEAD do 01-02: lint exit 0, 196 testes, build exit 0 com 14 páginas
- UAT do wizard completo de /book/avantis pendente (regressão obrigatória do CONTEXT §specifics); o contrafactual de slug prova só a leitura do plano — **agravado pelo 01-02**, que trocou o identificador recebido pelas duas actions públicas (`tenantId` → `slug`). Escopo do 01-05
- Caixa de erro de slots nunca vista renderizando a copy nova do 01-02 ("Não foi possível carregar os horários. Tente de novo."); teste barato no UAT do 01-05: chamar `obterSlotsPublicos('slug-inexistente', …)`
- UAT do dashboard sob as policies tenant-scoped novas do 01-04 (agenda, agendamento manual com RETURNING, exceção de agenda, perfil) — Pitfall 3: policy substituta errada deixa a tela VAZIA sem estourar erro. Escopo do 01-05
- UAT humano da Phase 1 NAO EXECUTADO (7 itens: wizard completo, double-booking, dashboard tela a tela, personalizacao Pro x gratuito, lembrete QStash ponta a ponta, caixa de erro de slots, backstops visuais). Checklist com o motivo de cada um em docs/PENDENCIAS.md secao 'UAT humano pendente da Phase 1'. Owner ausente na execucao do 01-05 — registrado como pendente, nunca aprovado
- Duas policies de SELECT ainda {anon,authenticated} com USING (ativo = true) em servicos e horarios_funcionamento: leitura cross-tenant por autenticado hoje, e um GRANT futuro a anon reabre tudo sem policy nova. Conserto e DROP puro (a 1b ja cobre o tenant). Precisa de sessao com acesso a banco

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

Last session: 2026-07-22T06:45:42.968Z
Stopped at: Completed 01-05-PLAN.md — fase 01 pronta para verificacao
Resume file: None
