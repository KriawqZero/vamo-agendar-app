# PLAN — Observabilidade Real da Mensageria (Sentry Logs, Issues e PostHog)

## 1. Vocabulário e Contrato de Classificação

Adotaremos rigorosamente a seguinte classificação de quatro categorias:

### A. CONDIÇÃO NORMAL DE NEGÓCIO
- **Exemplos**: Plano sem WhatsApp (Gratuito); agendamento cancelado ao executar webhook; DELETE de lembrete no QStash que responde 404 porque job já expirou; entrada inválida de formulário descartada na borda.
- **Tratamento**:
  - Auditoria em `disparos_whatsapp` quando aplicável (`status: ignorado`);
  - `Sentry Log info` estruturado;
  - Evento PostHog somente se houver pergunta de produto;
  - **NÃO criar Sentry Issue**.

### B. DEGRADAÇÃO OPERACIONAL ACIONÁVEL
- **Exemplos**: Tenant Pro sem `whatsapp_configs`; tenant Pro com WhatsApp desconectado no momento do envio; status `conectado` no banco, mas gateway inalcançável; `instance_token` ausente; lembrete pulado por `targetTime <= now`; falha ao sincronizar status.
- **Tratamento**:
  - `disparos_whatsapp` (`status: falha` ou `status: ignorado`);
  - `Sentry Log warning/error`;
  - PostHog de resultado agregado (`whatsapp_confirmation_failed`, `whatsapp_reminder_failed`);
  - **Sentry Issue agrupada** (com `reportarFalhaSilenciosaAguardando`) alertando o owner/profissional.

### C. ERRO TÉCNICO
- **Exemplos**: Evolution API HTTP 4xx/5xx ou erro de rede/timeout; QStash HTTP 4xx/5xx ou erro de rede; `messageId` ausente na resposta do QStash; erro no Supabase; falha ao escrever em `disparos_whatsapp`; falha na verificação/entrega do PostHog; exceção inesperada.
- **Tratamento**:
  - `Sentry Issue` imediata e **aguardada/flushed**;
  - `Sentry Log error/fatal`;
  - `disparos_whatsapp` com código curto de motivo (`http_<status>`, `erro_rede`, etc.);
  - PostHog de falha agregada;
  - Retry quando seguro;
  - **NUNCA esconder do owner**.

### D. SUCESSO OPERACIONAL
- **Exemplos**: Confirmação enviada; lembrete agendado no QStash; webhook autenticado e executado com sucesso; auditoria persistida.
- **Tratamento**:
  - `Sentry Log info` estruturado;
  - `disparos_whatsapp` (`status: enviado | agendado | executado`);
  - Evento PostHog de sucesso agregado.

### Regra Transversal "Falha Silenciosa" (Registrada em CLAUDE.md)
> **"Falha silenciosa para o cliente final"** significa NÃO quebrar a criação/fluxo de agendamento na tela B2C e NÃO exibir detalhes técnicos ao cliente final.
> **NÃO SIGNIFICA**: esconder do owner, omitir Sentry Issue, deixar de emitir Sentry Log, omitir auditoria em `disparos_whatsapp` ou deixar de alertar o profissional.

---

## 2. Ativação do Sentry Logs & Logger Estruturado

1. **Configuração Sentry.init**:
   - Adicionar `enableLogs: true` em `src/lib/observabilidade/opcoes-sentry.ts`.
   - Manter `semIntegracaoDeConsole` (não reativar a captura automática de console).
   - Implementar `beforeSendLog` em `opcoes-sentry.ts` sanitizando `attributes` com allowlist estrita.

2. **Módulo de Logging Explícito (`src/lib/observabilidade/log.ts`)**:
   - Interface:
     ```ts
     logOperacional.info(codigo: string, atributos?: AtributosLogOperacional): void
     logOperacional.warn(codigo: string, atributos?: AtributosLogOperacional): void
     logOperacional.error(codigo: string, atributos?: AtributosLogOperacional): void
     logOperacional.fatal(codigo: string, atributos?: AtributosLogOperacional): void
     ```
   - Nunca lança exceção.
   - No-op sem `NEXT_PUBLIC_SENTRY_DSN`.
   - Utiliza `Sentry.logger.info/warn/error/fatal`.
   - **Allowlist estrita de Atributos**:
     `fluxo`, `etapa`, `operacao`, `resultado`, `provider`, `motivo`, `statusCode`, `tenantHash`, `agendamentoHash`, `runtime`, `tentativa`, `retry`, `duracaoMs`.
   - **NUNCA aceita PII**: rejeita/filtra nome, telefone, e-mail, texto de mensagem, token, URL completa, payload ou objetos arbitrários/Error brutos.
   - Hash pseudonimizado estável: `hashTenantId(orgId)` e `hashAgendamentoId(agendamentoId)` utilizando `ANALYTICS_TENANT_SALT`.

3. **Testes Anti-PII para Logs (`src/lib/observabilidade/__tests__/log.test.ts`)**:
   - Injetar marcadores de teste: `PII_TESTE_MARIA`, `5567999998888`, `cliente@pii-teste.com`, `token_supersecreto_teste`, `org_PII_TESTE`.
   - Garantir via asserções que nenhum deles alcança os atributos do objeto final enviado ao Sentry.

---

## 3. Correção de Sentry Issues e Flush Aguardado

1. **Garantia de Flush**:
   - Atualizar `reportarFalhaSilenciosa` para suportar variante aguardada: `reportarFalhaSilenciosaAguardando(rotulo, contexto)`.
   - Em Server Actions, webhooks e route handlers, **aguardar `reportarExcecaoAguardando` ou `reportarFalhaSilenciosaAguardando` com `Sentry.flush(2000)`** antes de finalizar a resposta HTTP.

2. **Mensagens Estáticas para Agrupamento de Issues**:
   - `whatsapp:evolution_http_error`
   - `whatsapp:evolution_network_error`
   - `whatsapp:desconectado_ao_confirmar`
   - `whatsapp:config_ausente_para_plano_pro`
   - `whatsapp:telefone_ausente`
   - `whatsapp:perfis_query_error`
   - `whatsapp:configs_query_error`
   - `qstash:publish_http_error`
   - `qstash:publish_network_error`
   - `qstash:publish_sem_message_id`
   - `qstash:webhook_processing_error`
   - `auditoria_whatsapp:insert_failed`
   - `analytics_posthog:delivery_failed`

3. **Contexto Mínimo Sanitizado**:
   - Apenas: `fluxo`, `etapa`, `statusCode`, `motivo`, `tenantHash`, `agendamentoHash`.

---

## 4. Instrumentação Detalhada do Ciclo de Vida da Mensageria

### A. `dispararNotificacoesAgendamento` (`src/lib/notificacoes-agendamento.ts`)
- **Início**: Emitir `logOperacional.info('mensageria.iniciada', { fluxo: 'notificacoes_agendamento', tenantHash, agendamentoHash })`.
- **Telefone Ausente**: Se `clienteTelefone` for vazio/nulo:
  - Gerar `reportarFalhaSilenciosaAguardando('whatsapp:telefone_ausente')`
  - Emitir `logOperacional.error('whatsapp.telefone.ausente', ...)`
  - Registra auditoria `status: falha`, `motivo: telefone_ausente` se houver tenantId/agendamentoId.
- **Leitura do Perfil**: Checar `error`. Se houver erro de banco, reportar `whatsapp:perfis_query_error` e emitir `logOperacional.error`. Só usar `'Estabelecimento'` se `nome_estabelecimento` for legitimamente nulo, nunca quando o banco falhou.
- **Leitura de `whatsapp_configs`**: Checar `error`. Se houver erro de banco, reportar `whatsapp:configs_query_error`. Se tenant for Pro e config for nula/incompleta, reportar `whatsapp:config_ausente_para_plano_pro` (Issue warning + Sentry Log warn + auditoria `falha/config_ausente` + PostHog `whatsapp_confirmation_failed`). Se plano sem WhatsApp, registrar `logOperacional.info('whatsapp.plano.sem_whatsapp')`.
- **Confirmação**:
  - `logOperacional.info('whatsapp.confirmacao.tentativa')`
  - Se WhatsApp desconectado: auditoria `falha`, motivo `whatsapp_desconectado`, PostHog `failed`, Issue warning `whatsapp:desconectado_ao_confirmar`, Log warn.
  - Se Evolution ok: auditoria `enviado`, PostHog `whatsapp_confirmation_sent`, Log info `whatsapp.confirmacao.enviada`.
  - Se Evolution falhou: Issue aguardada (`whatsapp:evolution_http_error` / `whatsapp:evolution_network_error`), Log error `whatsapp.confirmacao.falha`, auditoria `falha`, PostHog `failed`.
- **Agendamento do Lembrete**:
  - Se `targetTime <= now`: registrar auditoria `tipo: lembrete`, `status: ignorado`, `motivo: lembrete_fora_da_janela`, Log info `qstash.lembrete.fora_da_janela`.
  - Tentativa QStash: `logOperacional.info('qstash.lembrete.tentativa')`.
  - Se QStash ok + `messageId`: auditoria `agendado`, PostHog `scheduled`, Log info `qstash.lembrete.agendado`.
  - Se QStash falhou: Issue aguardada (`qstash:publish_http_error` / `qstash:publish_network_error` / `qstash:publish_sem_message_id`), Log error, auditoria `falha`, PostHog `failed`.

### B. Webhook do Lembrete (`src/app/api/webhooks/lembrete/route.ts`)
- **Recebido**: `logOperacional.info('qstash.webhook.recebido')`.
- **Assinatura Inválida**: `logOperacional.warn('qstash.webhook.assinatura_invalida')`. Devolver 401 sem vazar payload.
- **Gating e Leitura**:
  - Agendamento cancelado: Log info `qstash.webhook.agendamento_cancelado`, auditoria `ignorado`.
  - Plano indeterminado (erro de leitura): Log error, Issue `qstash:webhook_processing_error`, auditoria `falha`, devolver 500 com flush.
  - Envio Evolution ok: Log info `whatsapp.lembrete.enviado`, auditoria `executado`, PostHog `whatsapp_reminder_sent`.
  - Envio Evolution falha: Issue `whatsapp:evolution_http_error`/`network_error` aguardada + flush, Log error, auditoria `falha`, PostHog `whatsapp_reminder_failed`, devolver 500.

### C. Auditoria `registrarDisparo` (`src/lib/whatsapp-helper.ts`)
- Tratar o erro de insert do Supabase:
  - NUNCA quebrar o agendamento do cliente;
  - Reportar Issue `auditoria_whatsapp:insert_failed` (usando `erroSinteticoSupabase`);
  - Emitir `logOperacional.error('auditoria_whatsapp.falha_insert', { statusCode, motivo: 'insert_failed', tenantHash })`;
  - Evitar qualquer chamada recursiva a `registrarDisparo`.

### D. Cancelamento de Lembrete (`cancelarLembreteQStash`)
- Token ausente: Log warn, Issue `qstash:sem_token`.
- HTTP != 200 e != 404: Log error `qstash.cancelamento.falha_http`, Issue `qstash:cancel_http_error`.
- Erro de rede: Log error `qstash.cancelamento.falha_rede`, Issue `qstash:cancel_network_error`.

### E. Conexão & Mensagem de Teste (`src/app/actions/whatsapp.ts`)
- `enviarMensagemTesteWhatsApp`: Log info início, Log info/error resultado, Issue se erro técnico da Evolution API, auditoria `tipo: teste`.
- `sincronizarStatusWhatsApp`: Log info transição de estado, Log warn em timeout/instável.

### F. Analytics Delivery (`src/lib/analytics/server.ts`)
- Se `enviarAoPostHog` capturar erro de entrega do SDK `posthog-node`:
  - Emitir `logOperacional.error('analytics_posthog.falha_entrega')`;
  - Emitir `reportarFalhaSilenciosa('analytics_posthog:delivery_failed')`;
  - Nunca quebrar o produto.

---

## 5. Suíte de Testes Automatizados (16 Cenários)

Adicionar testes em `src/lib/__tests__/notificacoes-agendamento.test.ts`, `src/lib/observabilidade/__tests__/log.test.ts`, `src/lib/__tests__/whatsapp-helper-observabilidade.test.ts` e suíte de integridade:

1. Evolution 200 (sucesso): log info, auditoria enviado, PostHog sent, 0 Issues.
2. Evolution 401/500: Issue aguardada, log error, auditoria falha, PostHog failed, sem PII.
3. Evolution network error: Issue, log error, auditoria falha, PostHog failed, sem PII.
4. QStash publish 200 + messageId: log info, auditoria agendado, PostHog scheduled.
5. QStash HTTP 429/500: Issue, log error, auditoria falha, PostHog failed.
6. QStash 200 sem messageId: Issue `qstash:publish_sem_message_id`, log, auditoria, PostHog failed.
7. QStash network error: Issue, log, auditoria, PostHog failed.
8. `targetTime <= now`: auditoria `ignorado`, `motivo: lembrete_fora_da_janela`, log info.
9. `whatsapp_configs` query error: não confunde com config ausente, Issue e log error.
10. config ausente para tenant Pro: Issue warning, log warn, auditoria falha, PostHog failed.
11. plano sem WhatsApp: sem Issue, log info, comportamento preservado.
12. `registrarDisparo` falha no Supabase: gera Issue e log error sem recursão e sem quebrar booking.
13. webhook falha imediatamente antes do return: evento e Issue realmente flushed com `await`.
14. PostHog delivery failure: Sentry recebe log/signal, produto não quebra.
15. Sanitização anti-PII: marcadores `PII_TESTE_MARIA`, `5567999998888`, `cliente@pii-teste.com`, `token_supersecreto_teste` NUNCA chegam a Sentry Issue/Log.
16. Sucesso ponta a ponta: todos os marcos operacionais emitidos na ordem esperada.

---

## 6. Harness de Smoke Test Operacional

Criar/expandir script de smoke test operacional protegido:
`scripts/smoke-observabilidade-mensageria.mjs`

- Utiliza credenciais de env (server-only);
- Nunca imprime telefone nem tokens;
- Executa mensagem de teste e simula/testa os 5 modos (sucesso, Evolution rejeitando, QStash rejeitando, config ausente, auditoria falhando);
- Emite identificador de correlação pseudonimizado;
- Imprime matriz com os links/orientações para conferir em:
  - Sentry Logs
  - Sentry Issues
  - PostHog Activity
  - `disparos_whatsapp`
  - Dashboard do profissional.
