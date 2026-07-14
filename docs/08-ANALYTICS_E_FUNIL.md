# 08 — Analytics e eventos de funil

Instrumentação mínima de funil com **PostHog Cloud** (P0.5, opção 3 registrada em
`docs/PENDENCIAS.md`). Sem credenciais configuradas, **tudo vira no-op** — build,
dev e produção funcionam normalmente sem PostHog.

## Decisão central: Postgres é a fonte da verdade operacional

O log `disparos_whatsapp` (P0.1) continua sendo a **fonte da verdade** para
suporte e auditoria de mensageria. Os eventos `whatsapp_*` no PostHog são apenas
**espelho agregado** para leitura de funil — nunca use analytics para investigar
um disparo específico, e nunca "conserte" divergências alterando o log.

## Variáveis de ambiente

| Env | Obrigatória | Efeito |
| --- | --- | --- |
| `NEXT_PUBLIC_POSTHOG_KEY` | não | Sem ela, **client e server são no-op total**. |
| `NEXT_PUBLIC_POSTHOG_HOST` | não | Default `https://us.i.posthog.com`. |
| `ANALYTICS_TENANT_SALT` | não | Salt do hash do tenant. **Sem ela o salt é a string vazia** (o hash continua pseudonimizando; o salt endurece contra correlação por força bruta a partir de `org_id`s conhecidos — configure em produção e nunca a troque depois, ou os `distinct_id`s históricos se desconectam). |

> **Validação da key em produção:** o endpoint de ingestão do PostHog responde
> `200 {"status":"Ok"}` **mesmo com api_key inválida** (drop silencioso). O log
> de erro do servidor não detecta key errada — a validação real é ver os
> eventos chegarem no projeto do PostHog após o deploy.

## Regras inegociáveis

1. **Nunca enviar PII**: nome, telefone, e-mail ou conteúdo de mensagem não
   entram em nenhum evento nem propriedade.
2. **`tenant_id` só pseudonimizado**: `hashTenantId()` em
   `src/lib/analytics/tenant.ts` = `sha256(salt + orgId)` hex truncado a 16
   chars. O `org_...` cru do Clerk jamais chega ao PostHog nem ao browser
   como propriedade de analytics.
3. **Analytics nunca quebra produto**: capturas server ficam em try/catch e
   rodam fora do caminho da resposta; capturas client nunca bloqueiam a UI.

## Arquitetura

- **Client** (`src/lib/analytics/client.ts`): `posthog-js` com init lazy,
  `capture_pageview: false`, `person_profiles: 'identified_only'`,
  `autocapture: false`. Ilhas em `src/components/analytics/`:
  `AnalyticsProvider` (init no mount, montado no layout root), `CapturaEvento`
  (evento no mount — instrumenta Server Components) e `IdentificacaoAnalytics`
  (identify pelo tenant hash + `signup_completed`).
- **Server** (`src/lib/analytics/server.ts`): **sem posthog-node** — `fetch`
  direto ao endpoint `/i/v0/e/`. Abordagem única de não-bloqueio: o helper
  chama `after()` de `next/server` **internamente**; os chamadores só invocam
  `capturarEventoServidor`/`capturarEventoTenant`. Se `after()` lançar (fora de
  contexto de request), o helper cai para fetch **fire-and-forget** — por isso
  `notificacoes-agendamento.ts` funciona igual em server action e no webhook.
  Todos os eventos server levam `$process_person_profile: false` (a identidade
  é criada apenas no client via `posthog.identify(tenantHash)`; os eventos
  server juntam-se ao funil pelo mesmo `distinct_id`).

## Taxonomia

| Evento | Onde dispara | Propriedades |
| --- | --- | --- |
| `landing_viewed` | `src/app/page.tsx` (mount, via `CapturaEvento`) | `nicho: 'geral'` |
| `signup_started` | `src/app/sign-up/[[...sign-up]]/page.tsx` (mount) | — |
| `signup_completed` | `IdentificacaoAnalytics` no layout do dashboard: conta Clerk com `createdAt` < 24h + flag `localStorage['va:signup-capturado']` ausente. Arestas aceitas do heurístico: usuário que demora >24h para criar a organização perde o evento; a flag é por browser (segunda conta no mesmo browser não emite) | — |
| `first_service_created` | `src/app/actions/servicos.ts` (`salvarServico`), só quando o INSERT é o primeiro serviço do tenant | — |
| `schedule_configured` | `src/app/actions/agenda.ts` (`salvarHorariosFuncionamento`), só na primeira configuração | — |
| `booking_link_copied` | `src/app/dashboard/DashboardClient.tsx` (`copiarLink`) | — |
| `booking_started` | `src/app/book/[slug]/BookingWizard.tsx`, primeira seleção de serviço da visita | `tenant` (hash) |
| `booking_completed` | `src/app/actions/public-booking.ts`, após INSERT com sucesso | `servico_duracao_minutos` |
| `booking_failed` | mesma action, no throw de slot indisponível ou no erro de INSERT | `motivo: 'slot_indisponivel' \| 'erro_interno'` |
| `plans_viewed` | `src/app/dashboard/plano/page.tsx` (mount) | `plano_atual` |
| `upgrade_clicked` | `src/app/dashboard/plano/CtaUpgrade.tsx` (clique no CTA "Em breve" — mede intenção enquanto não há checkout) | `plano` |
| `whatsapp_connect_started` | `WhatsappClient`: clique em Conectar / Gerar novo QR | — |
| `whatsapp_connected` | `WhatsappClient`: transição para `conectado` observada na UI (polling/regeneração) | — |
| `whatsapp_confirmation_sent` / `whatsapp_confirmation_failed` | `src/lib/notificacoes-agendamento.ts`, espelhando `registrarDisparo` de confirmação | `motivo` na falha |
| `whatsapp_reminder_scheduled` | idem, quando o QStash aceita o lembrete | — |
| `whatsapp_reminder_sent` / `whatsapp_reminder_failed` | `src/app/api/webhooks/lembrete/route.ts` espelhando executado/falha; `whatsapp_reminder_failed` também dispara em `notificacoes-agendamento.ts` quando o **agendamento** no QStash falha (distinga pelo `motivo`, ex.: `qstash_sem_token`) | `motivo` na falha |

Todos os eventos server usam o **tenant hash** como `distinct_id`.

### Limitação conhecida — funil B2C não conecta por pessoa

`booking_started` sai do **browser do cliente final** (distinct_id anônimo do
dispositivo; o tenant hash é só propriedade), enquanto `booking_completed`/
`booking_failed` saem do **servidor** com `distinct_id = tenant hash`. Um
insight de *Funnel* "started → completed" no PostHog mostraria ~0% de conversão
— **não é bug do wizard**. Meça a conversão B2C **em agregado**: *Trends* com a
fórmula `count(booking_completed) / count(booking_started)` (opcionalmente com
breakdown pela propriedade `tenant`). O lado B2B conecta normalmente (eventos
server com tenant hash juntam-se à pessoa criada pelo `identify` do dashboard).

### Session replay e surveys desativados no código

`disable_session_recording: true` e `disable_surveys: true` estão **travados na
init** (`src/lib/analytics/client.ts`): o replay gravaria a página pública de
booking onde o cliente final digita nome/telefone. Ligar o toggle no painel do
PostHog **não** tem efeito — é intencional; não remova sem revisar a regra de
não-PII.

### UTM

O `posthog-js` captura e persiste os parâmetros de campanha iniciais
(`utm_source`, `utm_medium`, ...) automaticamente: entram como propriedades dos
eventos da sessão e como `$initial_*` da pessoa após o `identify` no dashboard —
por isso a origem da landing sobrevive até o cadastro sem parse manual.
Confirmado na config atual: `capture_pageview: false` e `autocapture: false`
**não** desligam a coleta de campanha (`store_google`/campaign params seguem o
default ligado).

### Eventos deliberadamente fora da taxonomia

Mantida mínima de propósito (decisão registrada em `docs/PENDENCIAS.md` §5):

- `service_selected` / `slot_selected` — só se a análise de abandono dentro do
  wizard se provar necessária; hoje `booking_started` → `booking_completed` já
  mede o abandono do wizard como um todo.
- `onboarding_started` — equivalente a `signup_completed` + primeira visita ao
  dashboard; não agrega etapa nova.
- `setup_completed` — derivável: tenant com `first_service_created` **e**
  `schedule_configured`.
- `first_booking_received` — derivável: primeiro `booking_completed` do tenant
  (o `distinct_id` é o hash do tenant).
- `whatsapp_connection_failed` / `whatsapp_test_sent` — operacionais; a fonte
  da verdade (`whatsapp_configs.status` + `disparos_whatsapp`) já responde.
- Pagamento (`payment_*`) — o checkout Asaas ainda não existe.
