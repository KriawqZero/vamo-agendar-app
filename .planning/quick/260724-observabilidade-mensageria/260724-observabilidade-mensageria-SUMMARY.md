# SUMMARY — Observabilidade Real da Mensageria (Sentry Logs, Issues e PostHog)

## 1. O que foi realizado

Realizamos uma intervenção transversal completa no subsistema de mensageria e observabilidade do VamoAgendar:

1. **Ativação e Estruturação de Sentry Logs**:
   - Adicionada a opção `enableLogs: true` e a sanitização `beforeSendLog` em `src/lib/observabilidade/opcoes-sentry.ts`.
   - Criado o logger estruturado `logOperacional` (`info`, `warn`, `error`, `fatal`) em `src/lib/observabilidade/log.ts` com allowlist estrita de atributos e zero PII.
   - Criado o módulo `src/lib/observabilidade/hash.ts` para geração de hashes pseudonimizados estáveis de tenant e agendamento (`tenantHash`, `agendamentoHash`) com `ANALYTICS_TENANT_SALT`.

2. **Garantia de Delivery de Sentry Issues com Flush Aguardado**:
   - Implementado `reportarFalhaSilenciosaAguardando` em `src/lib/observabilidade/reportar.ts`.
   - Garantido o uso de `reportarExcecaoAguardando` e `reportarFalhaSilenciosaAguardando` com `Sentry.flush(2000)` em Server Actions, webhooks e route handlers para impedir o descarte de eventos por finalização prematura de processo Node/edge/serverless.
   - Definidas e padronizadas mensagens sintéticas estáticas para agrupamento em Sentry Issues (`whatsapp:evolution_http_error`, `whatsapp:evolution_network_error`, `whatsapp:desconectado_ao_confirmar`, `whatsapp:config_ausente_para_plano_pro`, `whatsapp:telefone_ausente`, `whatsapp:perfis_query_error`, `whatsapp:configs_query_error`, `qstash:publish_http_error`, `qstash:publish_network_error`, `qstash:publish_sem_message_id`, `qstash:webhook_processing_error`, `auditoria_whatsapp:insert_failed`, `analytics_posthog:delivery_failed`).

3. **Instrumentação Ponta a Ponta do Ciclo de Vida da Mensageria**:
   - `src/lib/notificacoes-agendamento.ts`: Instrumentação completa da confirmação síncrona e do agendamento do lembrete. Adicionado tratamento de erro explicito para queries de perfil/config, telefone ausente, config ausente em plano Pro, e agendamentos onde `targetTime <= now` (que passam a ser auditados como `status: ignorado`, `motivo: lembrete_fora_da_janela` e logados com Sentry Log info).
   - `src/app/api/webhooks/lembrete/route.ts`: Instrumentação do webhook QStash com logs estruturados, auditoria, PostHog e Sentry Issues flushed antes de retornar respostas 401/500.
   - `src/lib/whatsapp-helper.ts`: Atribuição de logs e Sentry Issues flushed em `enviarMensagemWhatsApp`, `agendarLembreteQStash`, `cancelarLembreteQStash` e tratamento seguro de erro na auditoria `registrarDisparo` (sem recursão e sem quebrar o booking).
   - `src/app/actions/whatsapp.ts`: Instrumentação das Server Actions de envio de mensagem de teste e sincronização de status com `logOperacional` e contexto pseudonimizado.
   - `src/lib/analytics/server.ts`: Captura de falhas de entrega no `posthog-node` em `enviarAoPostHog`, emitindo `logOperacional.error` e Sentry Issue `analytics_posthog:delivery_failed`.

4. **Suíte de Testes & Harness Operacional**:
   - Criada a suíte `src/lib/observabilidade/__tests__/log.test.ts` (testes de allowlist e sanitização anti-PII).
   - Criada a suíte `src/lib/__tests__/notificacoes-agendamento-observabilidade.test.ts` cobrindo 16 cenários de mensageria.
   - Criado o script operacional `scripts/smoke-observabilidade-mensageria.mjs`.

---

## 2. Métricas de Mudança

- **Novos arquivos criados**:
  - `src/lib/observabilidade/log.ts`
  - `src/lib/observabilidade/hash.ts`
  - `src/lib/observabilidade/__tests__/log.test.ts`
  - `src/lib/__tests__/notificacoes-agendamento-observabilidade.test.ts`
  - `scripts/smoke-observabilidade-mensageria.mjs`
  - `.planning/quick/260724-observabilidade-mensageria/*`
- **Arquivos modificados**:
  - `CLAUDE.md`
  - `src/lib/observabilidade/opcoes-sentry.ts`
  - `src/lib/observabilidade/sanitizacao.ts`
  - `src/lib/observabilidade/reportar.ts`
  - `src/lib/whatsapp-helper.ts`
  - `src/lib/notificacoes-agendamento.ts`
  - `src/app/api/webhooks/lembrete/route.ts`
  - `src/app/actions/whatsapp.ts`
  - `src/lib/analytics/server.ts`
- **Testes**: 280 testes automatizados passando (20 test files, 100% verde).
- **Compilação**: `pnpm lint` verde (0 erros, 0 avisos); `pnpm build` compilação Next.js 16 com Turbopack verde.
