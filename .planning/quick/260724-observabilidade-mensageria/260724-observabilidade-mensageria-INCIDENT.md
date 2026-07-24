# INCIDENT — Observabilidade Real da Mensageria (Diagnóstico & Reprodução)

## 1. Causa Raiz Comprovada do Incidente

O incidente relatado pelo owner (agendamento testado -> confirmação não entregue -> lembrete não entregue -> NADA em PostHog, Sentry Issues, Sentry Logs ou logs do Railway) decorre dos seguintes fatores combinados no código atual:

1. **Sentry Logs Desativado**: `enableLogs: true` não estava configurado nas opções do SDK Sentry (`opcoesBaseSentry`), e a integração de console é intencionalmente descartada (para evitar vazar PII/secrets). Nenhum logger estruturado (`Sentry.logger`) havia sido criado para a mensageria.
2. **Issues Sentry Fire-and-Forget (Sem Await/Flush)**: As funções `reportarExcecao` e `reportarFalhaSilenciosa` usam `void import('@sentry/nextjs').then(...)` de forma assíncrona não-aguardada. Em Server Actions, webhooks ou route handlers do Next.js 16 (especialmente em ambientes serverless ou contêineres que congelam o ciclo após responder), a execução encerra antes de a Promise do Sentry enviar o evento.
3. **Engolimento Silencioso de Falhas em `notificacoes-agendamento.ts`**:
   - Falha de consulta no banco em `perfis_empresas` ou `whatsapp_configs` era ignorada.
   - Quando `targetTime <= now` ao agendar lembrete (agendamento em janela curta), a execução não registrava nada em `disparos_whatsapp`, não emitia Sentry Log e não enviava evento PostHog.
   - Erro no envio via Evolution API gerava apenas `reportarFalhaSilenciosa` não-aguardada e `console.error` cru.
4. **Engolimento Silencioso em `registrarDisparo`**: Falhas ao inserir em `disparos_whatsapp` apenas emitiam `console.error` e não geravam Sentry Issue nem Sentry Log.
5. **Engolimento em Falhas de Envio do PostHog**: Falhas no cliente `posthog-node` apenas emitiam `console.error`, sem alertar o Sentry.

---

## 2. Matriz de Auditoria do Ciclo de Vida da Mensageria

| Fluxo | Etapa | Resultado possível | Auditoria DB (`disparos_whatsapp`) | PostHog | Sentry Issue | Sentry Log | Pode desaparecer? |
|---|---|---|---|---|---|---|---|
| **Confirmação** | Entrada | Início do fluxo público/manual | N/A | N/A | N/A | `info`: `mensageria.iniciada` | NÃO (Novo) |
| **Confirmação** | Telefone | Vazio / Ausente | N/A | N/A | `error`: `whatsapp:telefone_ausente` (Aguardada) | `error`: `whatsapp.telefone.ausente` | SIM (Antes) -> **NÃO (Novo)** |
| **Confirmação** | Consulta Perfil | Erro Supabase | N/A | N/A | `error`: `whatsapp:perfis_query_error` (Aguardada) | `error`: `whatsapp.perfis.query_error` | SIM (Antes) -> **NÃO (Novo)** |
| **Confirmação** | Consulta Configs | Erro Supabase | N/A | N/A | `error`: `whatsapp:configs_query_error` (Aguardada) | `error`: `whatsapp.configs.query_error` | SIM (Antes) -> **NÃO (Novo)** |
| **Confirmação** | Plano/Config | Tenant Pro sem `whatsapp_configs` | `status: falha`, `motivo: config_ausente` | `whatsapp_confirmation_failed` | `warning`: `whatsapp:config_ausente_para_plano_pro` (Aguardada) | `warn`: `whatsapp.config.ausente_pro` | SIM (Antes) -> **NÃO (Novo)** |
| **Confirmação** | Plano/Config | Plano sem WhatsApp (Gratuito) | N/A | N/A | N/A (Condição normal) | `info`: `whatsapp.plano.sem_whatsapp` | SIM (Antes) -> **NÃO (Novo)** |
| **Confirmação** | Envio Evolution | WhatsApp Desconectado | `status: falha`, `motivo: whatsapp_desconectado` | `whatsapp_confirmation_failed` | `warning`: `whatsapp:desconectado_ao_confirmar` (Aguardada) | `warn`: `whatsapp.confirmacao.desconectado` | SIM (Antes) -> **NÃO (Novo)** |
| **Confirmação** | Envio Evolution | Sucesso HTTP 200 | `status: enviado` | `whatsapp_confirmation_sent` | N/A | `info`: `whatsapp.confirmacao.enviada` | NÃO |
| **Confirmação** | Envio Evolution | Evolution HTTP 4xx/5xx | `status: falha`, `motivo: http_<status>` | `whatsapp_confirmation_failed` | `error`: `whatsapp:evolution_http_error` (Aguardada) | `error`: `whatsapp.confirmacao.falha_http` | SIM (Antes) -> **NÃO (Novo)** |
| **Confirmação** | Envio Evolution | Erro de Rede / Timeout | `status: falha`, `motivo: erro_rede` | `whatsapp_confirmation_failed` | `error`: `whatsapp:evolution_network_error` (Aguardada) | `error`: `whatsapp.confirmacao.falha_rede` | SIM (Antes) -> **NÃO (Novo)** |
| **Lembrete** | Janela | `targetTime <= now` | `status: ignorado`, `motivo: lembrete_fora_da_janela` | N/A | N/A (Condição normal) | `info`: `qstash.lembrete.fora_da_janela` | SIM (Antes) -> **NÃO (Novo)** |
| **Lembrete** | Publish QStash | Token QStash ausente | `status: falha`, `motivo: qstash_sem_token` | `whatsapp_reminder_failed` | `error`: `qstash:sem_token` (Aguardada) | `error`: `qstash.lembrete.sem_token` | SIM (Antes) -> **NÃO (Novo)** |
| **Lembrete** | Publish QStash | Signing Key ausente | `status: falha`, `motivo: qstash_sem_chave_assinatura` | `whatsapp_reminder_failed` | `error`: `qstash:sem_chave_assinatura` (Aguardada) | `error`: `qstash.lembrete.sem_chave_assinatura` | SIM (Antes) -> **NÃO (Novo)** |
| **Lembrete** | Publish QStash | Sucesso + `messageId` | `status: agendado`, `qstash_message_id` | `whatsapp_reminder_scheduled` | N/A | `info`: `qstash.lembrete.agendado` | NÃO |
| **Lembrete** | Publish QStash | Sucesso sem `messageId` | `status: falha`, `motivo: sem_message_id` | `whatsapp_reminder_failed` | `error`: `qstash:publish_sem_message_id` (Aguardada) | `error`: `qstash.lembrete.sem_message_id` | SIM (Antes) -> **NÃO (Novo)** |
| **Lembrete** | Publish QStash | HTTP 4xx/5xx | `status: falha`, `motivo: http_<status>` | `whatsapp_reminder_failed` | `error`: `qstash:publish_http_error` (Aguardada) | `error`: `qstash.lembrete.falha_http` | SIM (Antes) -> **NÃO (Novo)** |
| **Lembrete** | Publish QStash | Erro de Rede | `status: falha`, `motivo: erro_rede` | `whatsapp_reminder_failed` | `error`: `qstash:publish_network_error` (Aguardada) | `error`: `qstash.lembrete.falha_rede` | SIM (Antes) -> **NÃO (Novo)** |
| **Webhook** | Assinatura | Assinatura Inválida / HTTP 401 | N/A | N/A | N/A (Alerta agregado) | `warn`: `qstash.webhook.assinatura_invalida` | NÃO |
| **Webhook** | Execução | Agendamento Cancelado | `status: ignorado`, `motivo: agendamento_cancelado` | N/A | N/A (Condição normal) | `info`: `qstash.webhook.agendamento_cancelado` | NÃO |
| **Webhook** | Execução | Plano Indeterminado | `status: falha`, `motivo: plano_indeterminado` | N/A | `error`: `qstash:webhook_processing_error` (Aguardada) | `error`: `qstash.webhook.plano_indeterminado` | NÃO |
| **Webhook** | Execução | Sucesso Envio | `status: executado` | `whatsapp_reminder_sent` | N/A | `info`: `whatsapp.lembrete.enviado` | NÃO |
| **Webhook** | Execução | Falha Envio Evolution | `status: falha`, `motivo: <motivo>` | `whatsapp_reminder_failed` | `error`: `whatsapp:evolution_http_error` (Aguardada) | `error`: `whatsapp.lembrete.falha` | SIM (Antes) -> **NÃO (Novo)** |
| **Auditoria** | `registrarDisparo` | Falha INSERT no Supabase | N/A (Erro ao inserir) | N/A | `error`: `auditoria_whatsapp:insert_failed` (Aguardada) | `error`: `auditoria_whatsapp.falha_insert` | SIM (Antes) -> **NÃO (Novo)** |
| **Analytics** | PostHog Node | Falha de entrega no SDK | N/A | N/A | `error`: `analytics_posthog:delivery_failed` (Aguardada) | `error`: `analytics_posthog.falha_entrega` | SIM (Antes) -> **NÃO (Novo)** |

---

## 3. Logs de Reprodução e Evidências

- **Status do Git**: Working tree limpo na branch `fix/observabilidade-mensageria`.
- **Verificação de Env Vars**:
  - `EVOLUTION_API_URL`: PRESENTE
  - `EVOLUTION_GLOBAL_API_KEY`: PRESENTE
  - `QSTASH_TOKEN`: PRESENTE
  - `QSTASH_URL`: PRESENTE
  - `QSTASH_CURRENT_SIGNING_KEY`: PRESENTE
  - `QSTASH_NEXT_SIGNING_KEY`: PRESENTE
  - `APP_URL`: AUSENTE (fallback aplicado)
  - `NEXT_PUBLIC_SENTRY_DSN`: PRESENTE
  - `SENTRY_AUTH_TOKEN`: PRESENTE
  - `NEXT_PUBLIC_POSTHOG_KEY`: PRESENTE
  - `NEXT_PUBLIC_POSTHOG_HOST`: PRESENTE
  - `ANALYTICS_TENANT_SALT`: PRESENTE
