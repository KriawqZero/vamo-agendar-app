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
| `NEXT_PUBLIC_POSTHOG_KEY` | **não em dev / sim em produção** (validado no boot por `src/lib/env.ts`) | Sem ela, **client e server são no-op total**. |
| `NEXT_PUBLIC_POSTHOG_HOST` | não | Default `https://us.i.posthog.com` (região do projeto). Ausência **não** desliga o PostHog — o default vale, e por isso ela não entra em `src/lib/env.ts`. **Obrigatória se o projeto for da região EU** (`https://eu.i.posthog.com`) — errar isso faz nenhum evento aparecer, sem nenhuma mensagem de erro. |
| `ANALYTICS_TENANT_SALT` | **não em dev / sim em produção** (validado no boot por `src/lib/env.ts`) | Salt do hash do tenant. **Sem ela o salt é a string vazia** (o hash continua pseudonimizando; o salt endurece contra correlação por força bruta a partir de `org_id`s conhecidos — **nunca a troque depois**, ou os `distinct_id`s históricos se desconectam). |

> **Mudança de contrato declarada (etapa preparatória "Fundação operacional",
> 2026-07-21):** `NEXT_PUBLIC_POSTHOG_KEY` e `ANALYTICS_TENANT_SALT` eram
> opcionais por design. A partir desta etapa, a ausência de qualquer uma delas
> **derruba o boot em produção** (`src/lib/env.ts`, disparado pelo
> `register()` de `src/instrumentation.ts`) em vez de degradar em silêncio —
> este documento já pedia configurá-las em produção, e agora isso é executável.
> **O no-op em desenvolvimento continua exatamente como está**, e `pnpm build`
> sem secrets também: o hook de instrumentação não roda durante `next build`.

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

- **Opções** (`src/lib/analytics/opcoes-posthog.ts`): fonte única das travas de
  PII e do host, consumidas por spread pelo init do browser e pelo cliente de
  servidor. **Nunca escreva opção de init como literal no arquivo de init** —
  é assim que a trava vaza. Asseguradas por
  `src/lib/__tests__/opcoes-posthog.test.ts`.
- **Client**: a init roda em `src/instrumentation-client.ts`, **antes da
  hidratação** (o mesmo arquivo do Sentry — as duas configurações convivem sem
  se tocar). `src/lib/analytics/client.ts` ficou só com a API de captura
  (`capturarEvento`, `identificarTenant`), no-op sem key. Ilhas em
  `src/components/analytics/`: `CapturaEvento` (evento no mount — instrumenta
  Server Components) e `IdentificacaoAnalytics` (identify pelo tenant hash +
  `signup_completed`).
  > Antes a init era lazy, dentro de um `useEffect` do extinto
  > `AnalyticsProvider` — ou seja, **depois** da hidratação. O intervalo entre
  > o HTML pintar e o React hidratar é justamente onde o cliente final de
  > celular lento começa a mexer no wizard de agendamento, e evento perdido ali
  > vira abandono que nunca existiu.
- **Server** (`src/lib/analytics/server.ts`): `posthog-node`, **um cliente por
  evento**, com `flushAt: 1`, `flushInterval: 0` e `await shutdown()`. Parece
  caro e é de propósito: route handler e Server Action do Next são derrubados
  por invocação, e o SDK enfileira em memória antes de mandar — cliente
  compartilhado sem flush garantido perde o evento em silêncio. Abordagem de
  não-bloqueio: o helper chama `after()` de `next/server` **internamente**; os
  chamadores só invocam `capturarEventoServidor`/`capturarEventoTenant`. Se
  `after()` lançar (fora de contexto de request), o helper cai para
  **fire-and-forget** — por isso `notificacoes-agendamento.ts` funciona igual
  em server action e no webhook do lembrete. Todos os eventos server levam
  `$process_person_profile: false` (a identidade é criada apenas no client via
  `posthog.identify(tenantHash)`; os eventos server juntam-se ao funil pelo
  mesmo `distinct_id`) e `disableGeoip: true` (o IP visto num evento de
  servidor é o do datacenter — geolocalizar isso seria dado inventado).

## Taxonomia

| Evento | Onde dispara | Propriedades |
| --- | --- | --- |
| `landing_viewed` | `src/app/page.tsx` e `src/app/para/[nicho]/page.tsx` (mount, via `CapturaEvento`) | `nicho: 'geral'` na principal; slug do nicho nas verticais (ex.: `manicure`) |
| `signup_started` | `src/app/sign-up/[[...sign-up]]/page.tsx` (mount) | — |
| `signup_completed` | `IdentificacaoAnalytics` no layout do dashboard: conta Clerk com `createdAt` < 24h + flag `localStorage['va:signup-capturado']` ausente. Arestas aceitas do heurístico: usuário que demora >24h para criar a organização perde o evento; a flag é por browser (segunda conta no mesmo browser não emite) | — |
| `first_service_created` | `src/app/actions/servicos.ts` (`salvarServico`), só quando o INSERT é o primeiro serviço do tenant | — |
| `schedule_configured` | `src/app/actions/agenda.ts` (`salvarHorariosFuncionamento`), só na primeira configuração | — |
| `booking_link_copied` | `src/app/dashboard/DashboardClient.tsx` (`copiarLink`) | — |
| `booking_started` | `src/app/book/[slug]/BookingApp.tsx` (`selecionarServico`), primeira seleção de serviço da visita | `tenant` (hash) |
| `booking_completed` | `src/app/actions/public-booking.ts`, após INSERT com sucesso | `servico_duracao_minutos` |
| `booking_failed` | mesma action, no throw de slot indisponível ou no erro de INSERT | `motivo: 'slot_indisponivel' \| 'erro_interno'` |
| `plans_viewed` | `src/app/dashboard/plano/page.tsx` (mount) | `plano_atual` |
| `upgrade_clicked` | `src/app/dashboard/plano/CtaUpgrade.tsx` (clique no CTA "Em breve" — mede intenção enquanto não há checkout) | `plano` |
| `whatsapp_connect_started` | `WhatsappClient`: clique em Conectar / Gerar novo QR | — |
| `whatsapp_connected` | `WhatsappClient`: transição para `conectado` observada na UI (polling/regeneração) | — |
| `whatsapp_confirmation_sent` / `whatsapp_confirmation_failed` | `src/lib/notificacoes-agendamento.ts`, espelhando `registrarDisparo` de confirmação | `motivo` na falha |
| `whatsapp_reminder_scheduled` | idem, quando o QStash aceita o lembrete | — |
| `whatsapp_reminder_sent` / `whatsapp_reminder_failed` | `src/app/api/webhooks/lembrete/route.ts` espelhando executado/falha; `whatsapp_reminder_failed` também dispara em `notificacoes-agendamento.ts` quando o **agendamento** no QStash falha (distinga pelo `motivo`, ex.: `qstash_sem_token`) | `motivo` na falha |
| `manual_booking_created` | `src/app/actions/agendamentos.ts` (`criarAgendamentoManual`), após INSERT com sucesso | `servico_duracao_minutos`, `whatsapp_solicitado`, `registro_cliente: 'existente' \| 'novo_ou_reaproveitado'` |
| `booking_status_changed` | `src/app/actions/agendamentos.ts` (`atualizarStatusAgendamento`) | `status: 'confirmado' \| 'concluido' \| 'cancelado'` |
| `booking_rescheduled` | `src/app/actions/agendamentos.ts` (`remarcarAgendamento`), após UPDATE com sucesso | `servico_duracao_minutos` |
| `service_updated` | `src/app/actions/servicos.ts` (`salvarServico`), ramo de UPDATE | — |
| `service_deleted` | `src/app/actions/servicos.ts` (`excluirServico`); não dispara quando o RESTRICT do banco recusa (erro `23503` sai por throw) | — |
| `schedule_exception_saved` | `src/app/actions/agenda.ts` (`salvarExcecaoAgenda`), criação **e** edição | — |
| `schedule_exception_deleted` | `src/app/actions/agenda.ts` (`excluirExcecaoAgenda`) | — |

Todos os eventos server usam o **tenant hash** como `distinct_id`.

### Grafia: nome em inglês, propriedade em português

Regra de consistência, não de gosto: os nomes de evento são **em inglês** e os
nomes/valores de propriedade são **em pt-BR** (`servico_duracao_minutos`,
`motivo: 'slot_indisponivel'`, `registro_cliente: 'existente'`). É o que os
20+ eventos anteriores já faziam, e nome de evento ou de propriedade **não se
renomeia depois** sem quebrar histórico de funil e insight salvo. Ter
`service_duration_minutes` ao lado de `servico_duracao_minutos` seria o mesmo
número com dois nomes — pior que qualquer das duas convenções sozinha.

### Os sete eventos de dashboard (B2B)

Entraram em 2026-07-21, propostos pelo wizard do PostHog e adotados por decisão
(ver `docs/09-OBSERVABILIDADE_E_EMAIL.md`). O funil B2C já existia; o lado do
profissional não. `booking_status_changed` é o sétimo, que não estava no escopo
original: ficou porque é o **único** evento que mede taxa de cancelamento e se o
profissional fecha o ciclo marcando "concluído" — sinal de uso real do
dashboard que nada mais na taxonomia responde. Nenhuma propriedade carrega
nome, telefone, preço ou texto livre.

### Limitação conhecida — funil B2C não conecta por pessoa

`booking_started` sai do **browser do cliente final** (distinct_id anônimo do
dispositivo; o tenant hash é só propriedade), enquanto `booking_completed`/
`booking_failed` saem do **servidor** com `distinct_id = tenant hash`. Um
insight de *Funnel* "started → completed" no PostHog mostraria ~0% de conversão
— **não é bug do wizard**. Meça a conversão B2C **em agregado**: *Trends* com a
fórmula `count(booking_completed) / count(booking_started)` (opcionalmente com
breakdown pela propriedade `tenant`). O lado B2B conecta normalmente (eventos
server com tenant hash juntam-se à pessoa criada pelo `identify` do dashboard).

### As travas de PII, e por que elas têm teste

`src/lib/analytics/opcoes-posthog.ts` é a fonte única. Cinco são invariante de
produto — `/book/[slug]` é público e sem login, e quem digita nome e telefone
ali é um desconhecido que nunca criou conta:

`capture_pageview: false` · `person_profiles: 'identified_only'` ·
`autocapture: false` · `disable_session_recording: true` · `disable_surveys: true`

Mais `capture_exceptions: false` no client e `enableExceptionAutocapture: false`
no server: **error tracking é do Sentry**, cujo caminho passa por
`sanitizarEventoSentry` e `beforeSend`; o do PostHog não passa por nada.

E `capture_heatmaps: false`, `capture_dead_clicks: false`, `rageclick: false`,
`disable_capture_url_hashes: true` — as três primeiras são `undefined` no SDK, e
`undefined` ali significa **o painel decide** (remote config). Travar o replay e
deixar heatmap implícito seria trancar a porta e esquecer a janela.

Ligar qualquer toggle correspondente no painel do PostHog **não** tem efeito.
`src/lib/__tests__/opcoes-posthog.test.ts` fica vermelho se qualquer uma mudar
de valor, se o arquivo de init parar de consumir o módulo, ou se alguém
renomear `NEXT_PUBLIC_POSTHOG_KEY`. Documentação não impediu o wizard de apagar
essas linhas duas vezes no mesmo dia; teste impede.

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

## Insights já criados no painel

O wizard criou estes insights ao instrumentar os eventos de dashboard
(projeto `522821`). Ficam registrados aqui porque link de painel não se
descobre de novo depois — e porque são eles que consomem a taxonomia acima;
renomear um evento quebra o insight em silêncio.

- [Analytics basics (dashboard)](https://us.posthog.com/project/522821/dashboard/1885203)
- [Public booking conversion](https://us.posthog.com/project/522821/insights/MM2TskS1)
- [Tenant activation funnel](https://us.posthog.com/project/522821/insights/o9jUIX6F)
- [Booking outcomes](https://us.posthog.com/project/522821/insights/1betnNDT)
- [Booking status changes](https://us.posthog.com/project/522821/insights/gNZE0btH)
- [WhatsApp reminder reliability](https://us.posthog.com/project/522821/insights/b2MihIIn)

⚠️ *Public booking conversion* é insight de **funil** `booking_started` →
`booking_completed`, e pela limitação acima ele mostra ~0%. Meça em agregado
(*Trends* com fórmula), não por esse insight.
