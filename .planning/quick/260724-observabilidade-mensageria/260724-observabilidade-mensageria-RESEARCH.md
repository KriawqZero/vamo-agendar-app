# RESEARCH — Observabilidade Real da Mensageria (Sentry Logs, Issues e PostHog)

## 1. Inventário de Arquivos Lidos

- `CLAUDE.md`: Regras da stack, Definition of Done, proibições de wizards sem reendurecimento, infraestrutura gerenciada.
- `AGENTS.md`: Regra Next.js 16 breaking changes.
- `package.json`: `@sentry/nextjs@10.67.0`, `posthog-node@5.46.0`, `posthog-js@1.399.2`, `next@16.2.10`, `@upstash/qstash@2.11.2`.
- `docs/01-ARQUITETURA_E_STACK.md`: Visão da arquitetura.
- `docs/03-PADROES_DE_BANCO_DE_DADOS.md`: Schema declarativo e RLS.
- `docs/05-PRODUTO_E_VISAO.md`: UX Fricção Zero.
- `docs/06-MENSAGERIA_E_WHATSAPP.md`: Evolution API + QStash + `disparos_whatsapp`.
- `docs/08-ANALYTICS_E_FUNIL.md`: Taxonomia do PostHog, proibições de PII e `tenantHash`.
- `docs/09-OBSERVABILIDADE_E_EMAIL.md`: Configuração do Sentry, `beforeSend`, fail-fast de envs, wrappers.
- `docs/PENDENCIAS.md`: Lista viva de tarefas e dívidas técnicas.
- `.planning/PROJECT.md`: Visão geral e active requirements.
- `.planning/STATE.md`: Estado atual (Phase 02 executando, 25 planos concluídos).
- `.planning/ROADMAP.md`: Fases do projeto e dependências duras.
- `.planning/REQUIREMENTS.md`: Matriz de requisitos e rastreabilidade.
- `.planning/quick/260721-jif-fundacao-operacional-sentry-posthog-e-re/**`: Fundação operacional Sentry, PostHog e Resend.
- `.planning/phases/01-hardening-da-superf-cie-p-blica/**`: Hardening RLS e Data API.
- `.planning/phases/02-integridade-da-agenda/**`: Exclusion constraint, RPCs, `data_hora_fim`.
- Código-fonte auditado:
  - `src/lib/whatsapp-helper.ts`
  - `src/lib/notificacoes-agendamento.ts`
  - `src/app/api/webhooks/lembrete/route.ts`
  - `src/app/actions/public-booking.ts`
  - `src/app/actions/agendamentos.ts`
  - `src/app/actions/whatsapp.ts`
  - `src/lib/assinaturas.ts`
  - `src/lib/analytics/**`
  - `src/lib/observabilidade/**`
  - `src/instrumentation.ts`
  - `src/instrumentation-client.ts`
  - `src/sentry.server.config.ts`
  - `src/sentry.edge.config.ts`
  - `src/lib/env.ts`
  - `src/lib/env-boot.ts`
  - `supabase/schemas/09_disparos_whatsapp.sql`

## 2. Conflitos Entre Código e Documentação

1. **Fire-and-forget em Sentry Issues**:
   - `reportarFalhaSilenciosa` usa `reportarExcecao` que faz `void import('@sentry/nextjs').then(...)` sem await nem flush.
   - Em Server Actions, webhooks e route handlers que encerram/respondem imediatamente (ou em ambientes serverless/edge), o processo congela/finaliza antes da Promise enviar o evento ao Sentry.
   - O documento `docs/09-OBSERVABILIDADE_E_EMAIL.md` cita `reportarExcecaoAguardando`, mas as chamadas de falha silenciosa em mensageria/QStash usam `reportarFalhaSilenciosa` (não aguardada).

2. **Ausência Total de Sentry Logs**:
   - O projeto possui `@sentry/nextjs@10.67.0` instalado, mas `enableLogs: true` não está ativado em `opcoesBaseSentry`.
   - Não existe um logger estruturado de mensageria (ex.: `src/lib/observabilidade/log.ts`).
   - O log de console (`console.error`, `console.warn`) tem a integração descartada por `semIntegracaoDeConsole` (o que é correto para não vazar PII), mas NENHUM log estruturado explícito é emitido via `Sentry.logger`.

3. **Buracos na Cobertura de Falhas de Mensageria**:
   - `notificacoes-agendamento.ts`: Se `clienteTelefone` for vazio (em booking público), a função faz `return` silencioso. Não gera log, não gera Issue, não audita.
   - `notificacoes-agendamento.ts`: Erros de query no Supabase para `perfis_empresas` ou `whatsapp_configs` são ignorados (`data: perfil`, `data: config` viram `undefined` ou `null`). Não é feita distinção entre config inexistente, consulta falhada, config desconectada ou desabilitada por plano.
   - `notificacoes-agendamento.ts`: Se `targetTime <= now` ao calcular a janela do lembrete, nada é registrado em `disparos_whatsapp`, nada é logado, nada é enviado ao PostHog. O lembrete simplesmente desaparece.
   - `whatsapp-helper.ts`: `registrarDisparo` engole qualquer erro com `console.error` sem alertar o Sentry (`auditoria_whatsapp:insert_failed`).
   - `whatsapp-helper.ts`: `agendarLembreteQStash` não reporta falhas HTTP (429, 500) nem erro de rede ao Sentry via Issue/Log; apenas faz `console.error`.
   - `whatsapp-helper.ts`: `enviarMensagemWhatsApp` não diferencia status da Evolution API em códigos de erro estáticos para agrupar Sentry Issues (`whatsapp:evolution_http_error`, `whatsapp:evolution_network_error`).
   - `analytics/server.ts`: Se a entrega ao PostHog falha em `enviarAoPostHog`, é feito apenas `console.error`. Não há Sentry Log nem Issue agrupada (`analytics_posthog:delivery_failed`).

4. **Contratos Invioláveis**:
   - **Fricção Zero**: O cliente final no booking público NUNCA deve ver mensagem de erro técnica nem ter a criação do agendamento travada por falha de mensageria (Evolution/QStash).
   - **Zero PII**: Nome, telefone, e-mail, texto de mensagem, token, payload de terceiros e URL completa jamais chegam ao Sentry (Issues/Logs) ou PostHog.
   - **PostHog como Analytics, Sentry como Erros/Logs**: Não habilitar Error Tracking nem Session Replay do PostHog.
   - **Tabela `disparos_whatsapp` append-only**: Reutilizar o schema existente sem migrations destrutivas desnecessárias.

## 3. Decisões Atuais de Design

1. Implementar `src/lib/observabilidade/log.ts` fornecendo o logger estruturado `logOperacional` (`info`, `warn`, `error`, `fatal`) usando `Sentry.logger` e `beforeSendLog` com allowlist de atributos.
2. Implementar `reportarFalhaSilenciosaAguardando` e/ou `awaitFlush` para que falhas em Server Actions, route handlers e webhooks façam flush do Sentry antes da resposta ser finalizada.
3. Pseudonimizar `tenantId` (`tenantHash`) e `agendamentoId` (`agendamentoHash`) com `ANALYTICS_TENANT_SALT` (sha256).
4. Em `notificacoes-agendamento.ts`, `route.ts` e `whatsapp.ts`, instrumentar exaustivamente todos os ramos de execução conforme a Matriz de Incidentes.
