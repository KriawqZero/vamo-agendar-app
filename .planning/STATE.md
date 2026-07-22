---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: Lançamento público
current_phase: 01
current_phase_name: hardening-da-superf-cie-p-blica
status: ready_to_execute
stopped_at: "2ª rodada de fechamento de gaps PLANEJADA: 7 planos (01-10 a 01-16) escritos, verificados pelo plan-checker e aprovados. A fase continua reprovada até que executem — os dois bloqueadores da reverificação seguem vivos no código. Próximo: /gsd-execute-phase 01"
last_updated: "2026-07-22T17:01:02.391Z"
last_activity: 2026-07-22
last_activity_desc: "2ª rodada de fechamento de gaps planejada (01-10 a 01-16), aprovada pelo plan-checker após duas iterações de revisão"
progress:
  total_phases: 1
  completed_phases: 0
  total_plans: 16
  completed_plans: 9
---

# Project State

## Project Reference

See: .planning/PROJECT.md (atualizado 2026-07-21)

**Core value:** Um agendamento real, feito por um cliente final que nunca ouviu falar do VamoAgendar, cair na agenda do profissional sem que nada quebre no caminho.
**Current focus:** Phase 01 — hardening-da-superf-cie-p-blica

## Current Position

Phase: 01 (hardening-da-superf-cie-p-blica) — 9/16 PLANOS EXECUTADOS, 7 PLANEJADOS E PRONTOS
Plan: 9 de 16 concluídos (01-01 a 01-09); 01-10 a 01-16 planejados, nenhum executado
Status: **a fase NÃO está completa e os dois bloqueadores continuam vivos no código.** Confirmei no HEAD `1685496` antes de planejar: `whatsapp-helper.ts:147` ainda concatena a chave, e os 11 `throw` de `public-booking.ts` ainda estão lá. O que mudou nesta sessão foi só o planejamento:

  1. `whatsapp-helper.ts:147` publica `QSTASH_CURRENT_SIGNING_KEY` em texto claro na query string de todo lembrete — é a mesma chave HMAC com que o webhook autentica desde o 01-03. Ataca diretamente a segunda metade do goal da fase. **Fecha em 01-11** (código) + **01-13** (rotação datada como item do owner, PENDENCIAS, e correção dos dois documentos cuja premissa o verificador refutou)
  2. Em build de produção o React só transporta o `digest` do erro da Server Action, então a copy contratada no `01-UI-SPEC` e a recuperação de double-booking (`includes('já foi preenchido')`) estão mortas na tela. A suíte do 01-07 dá verde porque chama a action em processo. **Fecha em 01-10** (tracer: uma travessia real, com harness que sonda `next start` pela fronteira de flight) + **01-12** (expansão). É insumo obrigatório do SC4 da Phase 2

Escopo aprovado pelo owner nesta sessão inclui ainda quatro achados do code review: CR-03 (`slug_gratuito` sem UNIQUE → sequestro de link público entre tenants, com PII de cliente final) em 01-14; WR-02 (default privileges não cobre FUNCTIONS) e WR-08 (harness de superfície com falso verde) em 01-15; WR-07 (`assinaturas.ts` degrada tenant pago a gratuito) em 01-16. WR-01, WR-03, WR-04 e WR-06 ficaram fora, diferidos com razão e gatilho escritos no 01-13.

Ordem de execução, serialização estrita (um plano por wave): 01-10 → 01-11 → 01-12 → 01-13 → 01-15 → 01-14 → 01-16

Continua aberto também o **UAT humano** (7 itens, só o owner pode fechar) — dois deles com prognóstico negativo até o bloqueador 2 fechar
Last activity: 2026-07-22 — 2ª rodada de fechamento de gaps planejada e aprovada pelo plan-checker

Progress: [█████░░░░░] 56% (9/16 planos executados; verificação reprovada, correção planejada)

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
| Phase 01 P07 | ~28min | 3 tasks | 4 files |
| Phase 01 P06 | ~50min | 2 tasks | 5 files |
| Phase 01 P08 | ~22min | 3 tasks | 3 files |
| Phase 01 P09 | ~35min | 3 tasks | 5 files |

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
- [Phase ?]: [Phase 01]: pnpm test hermetico por desenho — suite de integracao fora do glob padrao do vitest, opt-in por EXIGIR_INTEGRACAO=1 com dono unico no script test:integracao; contagem que NAO cresce (13 arquivos / 196 testes) e a prova, nao o sintoma
- [Phase ?]: [Phase 01]: Suite que toca banco reprova em vez de pular — sentinela que nunca e pulada + banner em stderr; pulo silencioso e como o gap volta sem ninguem ver
- [Phase ?]: [Phase 01]: Acoplamento por substring entre modulos nao importaveis juntos e pinado por assercao de FONTE (o teste le BookingApp.tsx do disco) derivada de uma constante unica
- [Phase ?]: [Phase 01]: Horario do agendamento de teste sai da propria engine (obterSlotsPublicos), nunca de literal cravado — e o que exercita a validacao por igualdade exata em vez de contorna-la
- [Phase ?]: [Phase 01]: CAMINHO_ENV_LOCAL e o mecanismo de provar a sentinela sem mover, renomear ou escrever no .env.local real; a falha e por AUSENCIA e so os NOMES das variaveis aparecem na saida
- [Phase ?]: [Phase 01]: Boot de producao encerra de verdade (process.exit(1)) quando falta env obrigatoria — guardado por NODE_ENV=production e por NEXT_RUNTIME==='nodejs'; no edge o comportamento anterior (relancar) e preservado
- [Phase ?]: [Phase 01]: Harness de boot mede o status DO SERVIDOR — set -m para o job ganhar grupo de processos proprio, wait no PID capturado em $!, curl 7 (recusa de conexao) como asserção de porta morta; setsid proibido porque $! deixaria de ser o servidor
- [Phase ?]: [Phase 01]: Harness nasce ANTES do conserto e a primeira execucao tem de REPROVAR — harness escrito depois nunca prova que mediria a falha
- [Phase ?]: [Phase 01]: Complemento de env identico nas duas execucoes do harness: quatro das quatorze obrigatorias nao existem no .env.local, e sem injeta-las o CONTROLE seria impossivel e a mensagem do MORTE listaria cinco nomes em vez de um
- [Phase ?]: [Phase 01]: Tres diagnosticos de Edge Runtime (process.stderr/process.exit em env.ts) registrados em PENDENCIAS, nao silenciados — aliasar process por globalThis esconderia o sinal em vez de resolve-lo
- [Phase ?]: [Phase 01]: Policies PERMISSIVAS se somam por OR — uma policy compartilhada sem clausula de tenant ANULA o escopo da tenant-scoped que convive com ela; foi como servicos/horarios_funcionamento vazavam catalogo e tenant_id cross-tenant para toda conta logada
- [Phase ?]: [Phase 01]: Prova de RLS sem navegador — transacao revertida com set_config('request.jwt.claims') + set local role authenticated, e um tenant vizinho DESCARTAVEL criado dentro da propria transacao quando o banco de dev tem um tenant so; converte veredito INCONCLUSIVO em conclusivo sem persistir nada
- [Phase ?]: [Phase 01]: Nao-regressao de dashboard depois de DROP POLICY se mede pela linha INATIVA do proprio tenant — as ativas passavam pelas duas policies e nao distinguem nada; a inativa e o unico caso que a 1b cobre a mais e o que sustenta reativar servico e o RETURNING
- [Phase ?]: [Phase 01]: DDL e INSERT no ledger emitidos numa UNICA chamada de execute_sql, portanto na mesma transacao — fecha a janela de desalinhamento repo/ledger que o procedimento em dois passos deixava aberta
- [Phase ?]: [Phase 01]: Gap closure escreve documento so depois da prova — as quatro provas (superficie anon, fail-fast de boot, escrita do booking, Definition of Done) rodaram sobre o HEAD final antes do primeiro Edit; criterio que le como satisfeito enquanto a medicao diz o contrario foi o defeito que queimou a fase uma vez
- [Phase ?]: [Phase 01]: Correcao de requisito preserva o historico do erro — SEG-05 vira [x] mas registra que a segunda metade foi medida como falsa e por qual plano foi fechada, com o harness nomeado
- [Phase ?]: [Phase 01]: Item de UAT parcialmente coberto diz PRIMEIRO o que a automacao NAO cobre; nenhum executor pode marcar item de UAT, e a contagem 7 abertas / 0 marcadas em PENDENCIAS e o controle automatizado disso
- [Phase ?]: [Phase 01]: Hermeticidade do pnpm test virou regra viva em docs/PENDENCIAS.md — test:integracao e o unico ponto de entrada da suite que toca o banco, e reincluí-la no glob padrao faria toda Definition of Done futura escrever no Supabase de dev

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
- ✅ **RESOLVIDO no 01-08 — as duas policies de SELECT {anon,authenticated} com USING (ativo = true).** Removidas do banco e do schema declarativo pela migration `20260722145948_fecha_policies_residuais_servicos_horarios.sql`. Medido sob role `authenticated` com claim `org_id` em transação revertida: **2 tenants distintos visíveis antes, 1 depois**; a linha INATIVA do próprio tenant continua visível (a `1b` cobre, o `RETURNING` não regrediu). Ledger em 18 versions = 18 arquivos. A edição de `docs/PENDENCIAS.md` foi feita no 01-09: a seção "Superfície remanescente" e o bloco 🔴 de enumeração de `org_id` estão marcados como fechados, com migration, version e evidências
- Dashboard nunca percorrido à mão sob o regime pós-DROP do 01-08 — em especial **reativar um serviço inativo**, que é o caso que a prova SQL cobre no banco e não na tela (Pitfall 3: policy quebrada degrada em silêncio). Entra no UAT humano da Phase 1

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

Last session: 2026-07-22T15:23:03.584Z
Stopped at: Completed 01-09-PLAN.md
Resume file: None
