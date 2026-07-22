# Pendências e prioridades

Lista viva de tarefas identificadas. Revisar antes de cada nova etapa de
desenvolvimento — e obrigatoriamente antes de implementar o checkout Asaas.

Última atualização: 2026-07-17 (P0.12-desktop — responsividade real + split de 2
painéis no desktop do booking público — resolvido, ver "Itens resolvidos". Antes
dele: P0.12(b) e (c) — customização do tenant e redesign mobile-first do booking
público — resolvidos; fecham também o P1.11. Decisões do owner registradas: **toda
customização visual é exclusiva do Pro** e o **Plus caminha para descontinuação**
(não ganha recursos novos; tratado em conversa futura); imagens por upload próprio no
Supabase Storage (bucket `imagens-perfis`), nunca por URL. P1.8 parcialmente
alinhado: e-mail saiu da UI pública, WhatsApp obrigatório por ora, regra-alvo "pelo
menos um dos dois" registrada. Priorização de 2026-07-12 mantida).

---

## 🧭 Direção atual do owner — Produto agora, lançamento depois

Registrado em 2026-07-12 (substitui a direção de 2026-07-11). Vale até o owner revisar:

- A prioridade atual é **evoluir o produto**: tornar o núcleo correto, confiável,
  simples e agradável de usar. Nada de "parecer um SaaS completo".
- O produto **ainda não será lançado publicamente** e **não haverá tráfego pago** agora.
  Tarefas cujo benefício principal é proteger ou operar um lançamento público ficam na
  etapa imediatamente anterior ao lançamento — continuam **obrigatórias**, só não são o
  próximo trabalho.
- A exceção de prioridade máxima é o **WhatsApp**: é a funcionalidade mais crítica do
  produto e o maior motivo percebido para alguém pagar pelo SaaS. Sua confiabilidade
  **funcional** (com a Evolution API atual) é trabalho de agora (P0.1) — sem misturar
  com migração de provedor ou infraestrutura de escala.
- Segurança, integridade multi-tenant, hardening da Data API, proteção atômica contra
  double-booking, rate limiting, LGPD e operação de produção estão consolidados na
  seção **"Obrigatório antes do lançamento público"**.
- Infraestrutura de escala e expansões (multi-profissional, multi-filial etc.) só
  depois de **evidência** de uso real.
- Toda decisão nova deve preservar a simplicidade do VamoAgendar: se existir uma forma
  simples e pragmática, escolha-a.

Ordem de leitura: **P0** (produto agora) → **P1** (melhorias do núcleo em seguida) →
**Obrigatório antes do lançamento** → **Depois de evidência** → congelados/resolvidos.

---

## 🔴 P0 — Produto agora

### 1. ~~Experiência e confiabilidade funcional do WhatsApp (Evolution/Baileys)~~ — ✅ Resolvido

**Resolvido em 2026-07-13** (ver "Itens resolvidos" no fim deste documento). Estados
reais de conexão sincronizados com o gateway, log append-only `disparos_whatsapp`,
mensagem de teste, cancelamento de lembrete no QStash e painel de auditoria no
dashboard. Verificação manual com WhatsApp/QStash reais em piloto continua
recomendada (o fluxo foi validado com testes unitários + mock do gateway +
migration aplicada em banco local). A seção original segue abaixo como referência
histórica do escopo.

<details><summary>Escopo original (histórico)</summary>

### (histórico) 1. Experiência e confiabilidade funcional do WhatsApp (Evolution/Baileys)

O WhatsApp é a função mais crítica do SaaS e o principal motivo percebido para pagar
o plano Pro. Tratar como prioridade máxima de produto. O resultado esperado é uma
experiência **confiável para pilotos controlados e desenvolvimento real** usando a
integração atual (Evolution API/Baileys) — não otimizar além disso.

**Estado atual verificado (2026-07-11):**

- O fluxo básico funciona de ponta a ponta (verificado em produção: criação de
  instância, pareamento, confirmação síncrona e entrega do lembrete via QStash).
- Status persistido em `whatsapp_configs.status` com apenas 3 estados
  (`desconectado`/`aguardando_qrcode`/`conectado` — CHECK no schema). Não existem
  estados de falha ou instabilidade.
- O dashboard mostra o status **do banco**, que só é sincronizado com a Evolution API
  durante o polling de pareamento (`WhatsappClient.tsx`). Se a sessão cair depois de
  conectada (celular desligado, logout no aparelho), o dashboard continua exibindo
  "conectado" indefinidamente.
- Não existe envio de mensagem de teste pelo dashboard.
- O resultado do disparo de confirmação é descartado (`public-booking.ts` chama
  `enviarMensagemWhatsApp` sem ler o boolean); não há registro algum de disparos
  (nem tabela de log, nem distinção confirmação enviada × lembrete agendado ×
  executado × falha). Suporte não consegue responder "por que a mensagem não saiu?".
- O `messageId` retornado pelo QStash não é salvo — não é possível cancelar o lembrete
  quando o agendamento é cancelado (mitigado: o webhook re-checa o status na execução).
- Erros do polling de QR viram exceção 500 engolida com `console.error` no client —
  sem feedback visual de falha nem botão de "tentar novamente".

**Resultado esperado (confiabilidade funcional):**

- Status verdadeiro da conexão: sincronizar o estado real da Evolution API ao carregar
  a página de WhatsApp (e/ou antes de exibir "conectado"), não só durante o pareamento.
- Estados visuais claros no dashboard: desconectado, conectando, aguardando QR,
  conectado, instável e falha — com "tentar novamente" que não deixa configuração
  quebrada (instância órfã no gateway, linha inconsistente no banco). QR Code com
  tratamento de expiração; comportamento correto no mobile.
- Envio de mensagem de teste pelo dashboard, com confirmação visível de sucesso/falha.
- Falhas de mensageria **nunca** cancelam ou quebram o agendamento (regra já vigente —
  preservar): falha silenciosa para o cliente final, **sem esconder o problema do
  profissional** (dashboard reflete).
- Comportamento coerente quando a sessão desconectar (banco reflete, dashboard avisa)
  e recuperação após falha sem precisar de suporte.

**Resultado esperado (observabilidade mínima, necessária para pilotos):**

- Registro mínimo do resultado de cada disparo (confirmação e lembrete): quando,
  para qual agendamento, sucesso/falha e motivo. Pode ser uma tabela simples
  (`disparos_whatsapp` ou similar) — o suficiente para o suporte diagnosticar.
- Distinção clara entre: confirmação enviada, lembrete agendado, lembrete executado,
  falha (com motivo).

**Fora do escopo deste item (ver "Depois de evidência" — não misturar):** migração
para WhatsApp Cloud API oficial ou outro provedor, arquitetura para grande quantidade
de instâncias, infraestrutura distribuída, observabilidade avançada e automações de
suporte em escala.

**Critérios de conclusão:** profissional consegue ver o estado real da conexão,
testar o envio, recuperar-se de falha sem suporte; suporte consegue explicar qualquer
mensagem não entregue olhando o registro de disparos.

**Arquivos:** `src/app/actions/whatsapp.ts`, `src/app/dashboard/whatsapp/WhatsappClient.tsx`,
`src/lib/whatsapp-helper.ts`, `src/app/api/webhooks/lembrete/route.ts`,
`src/app/actions/public-booking.ts`, `supabase/schemas/05_whatsapp_configs.sql`
(+ novo schema para log de disparos), `docs/06-MENSAGERIA_E_WHATSAPP.md`.

**Dependências/decisões:** definir os novos valores de `status` (exige migration do
CHECK); decidir formato do log de disparos (tabela dedicada é o caminho simples).

**Ferramenta temporária ativa (2026-07-12):** página `/debug/qstash` (gated por
`DEBUG_QSTASH=1` + login Clerk) para diagnosticar os lembretes — lista os logs do
QStash (`GET /v2/logs`), agendamentos recentes e sanidade de env, e permite disparar
o webhook diretamente ou publicar teste no QStash. **Remover após o diagnóstico**:
apagar `src/app/debug/qstash/` e `src/app/actions/debug-qstash.ts` e a flag
`DEBUG_QSTASH` dos ambientes.

</details>

### 2. ~~Bug crítico — booking público quebrado para visitante anônimo~~ — ✅ Resolvido

**Resolvido em 2026-07-13** (ver "Itens resolvidos" no fim deste documento). As
escritas do booking público passaram ao cliente privilegiado no servidor após
validação completa na Server Action; verificação integrada cobriu cliente novo
anônimo, reaproveitamento por telefone, serviço de outro tenant, slot ocupado,
tenant inexistente e `dataHora` inválida. A numeração dos itens seguintes foi
mantida para preservar as referências cruzadas (P0.3, P0.4...).

### 3. ~~Agendamento manual pelo profissional~~ — ✅ Resolvido

**Resolvido em 2026-07-13** (ver "Itens resolvidos" no fim deste documento).
CTA "+ agendar" (desktop) + FAB (mobile) no dashboard abrem um modal em 4 passos
(cliente com busca/cadastro inline → serviço → data/horário pela mesma engine →
resumo com WhatsApp opcional); conflito bloqueado sem override; remarcação com
realinhamento do lembrete no QStash.

### (histórico) 3. Agendamento manual pelo profissional

Não existe hoje **nenhum** caminho para o profissional registrar um horário combinado
por WhatsApp, Instagram, ligação, presencialmente ou como retorno combinado durante um
atendimento — o slot continua aparecendo livre no link público. Sem isso o VamoAgendar
não é a fonte real da agenda.

**Estado atual verificado:** `src/app/actions/agendamentos.ts` só tem
`listarAgendamentos` e `atualizarStatusAgendamento`; não há CTA "Novo agendamento" no
dashboard; não existe edição/remarcação (apenas mudança de status).

**Resultado esperado (mesma qualidade visual e mobile-first do resto do produto — não
aceitar implementação improvisada por ser interna):**

- CTA claro de "Novo agendamento" na agenda do dashboard.
- Escolha rápida de cliente existente **ou** criação inline (nome + WhatsApp).
- Seleção de serviço → data/horário usando a **mesma engine de disponibilidade**
  (`obterSlotsDisponiveis`) do booking público, com alerta claro de conflito.
- Resumo antes de confirmar; feedback de sucesso; agenda atualizada imediatamente.
- Envio **opcional** da confirmação de WhatsApp ao cliente (respeitando plano/conexão).
- Editar/remarcar e cancelar agendamentos existentes.
- Estados de loading, erro e sucesso (`useActionState`/`useFormStatus`).

**Decisão registrada — override de conflito:** por padrão **não permitir**
sobreposição nem no fluxo manual. Se um dia existir override administrativo, deve ser
consciente, confirmado e auditável — **não adicionar agora** sem necessidade observada
em pilotos.

**Critérios de conclusão:** profissional registra em menos de ~30 s um horário
combinado fora do link, no celular; o slot some do link público; conflito é bloqueado
com mensagem clara.

**Arquivos:** `src/app/actions/agendamentos.ts` (nova action de criação B2B),
`src/app/dashboard/agenda/AgendaClient.tsx` (ou novo componente),
`src/lib/booking-engine.ts` (reuso).

**Dependências/decisões:** respeitar a agenda via engine é parte deste item (fluxo
normal = produto). A proteção **atômica** contra requisições simultâneas fica em
"Obrigatório antes do lançamento" — quando ela existir, a action manual adota a mesma
proteção.

### 4. ~~Fuso horário por tenant~~ — ✅ Resolvido

**Resolvido em 2026-07-13** (ver "Itens resolvidos" no fim deste documento).
Coluna `timezone` IANA em `perfis_empresas`, helper central `src/lib/timezone.ts`
e eliminação de todos os offsets fixos. A seção original segue abaixo como
referência histórica do escopo.

<details><summary>Escopo original (histórico)</summary>

### (histórico) 4. Fuso horário por tenant

Remover a suposição global de `America/Sao_Paulo` e o offset fixo `-03:00`. O produto
atende o Brasil inteiro e precisa funcionar em `America/Campo_Grande`, `America/Manaus`
etc.

**Estado atual verificado (todos os pontos com fuso fixo):**

- `src/lib/booking-engine.ts:105-106,206` — limites do dia e ISO dos slots em `-03:00`
  (o parâmetro `timezone` existe, mas os offsets são fixos e ninguém passa outro valor).
- `src/app/actions/public-booking.ts:55-67` — extração do dia local com
  `America/Sao_Paulo`.
- `src/app/actions/agendamentos.ts:46-51` — filtros de listagem com `-03:00`.
- `src/app/api/webhooks/lembrete/route.ts:98-104` — formatação do lembrete.
- `src/app/book/[slug]/BookingWizard.tsx:77` — geração dos próximos 14 dias com
  offset manual de 3 h.
- `src/app/dashboard/DashboardClient.tsx` e `src/app/dashboard/page.tsx:23,30` —
  formatação e limites do dia no dashboard.
- `perfis_empresas` **não tem coluna de timezone**.

**Resultado esperado:**

- Coluna `timezone` (IANA, ex.: `America/Campo_Grande`) em `perfis_empresas`, com
  padrão razoável (`America/Sao_Paulo`) no provisionamento e escolha/definição no
  onboarding ou configuração.
- Slots calculados no fuso do estabelecimento; timestamps gravados em UTC (como hoje);
  exibição sempre no fuso do estabelecimento (dashboard, filtros, página pública,
  agendamento manual); confirmação e lembretes de WhatsApp calculados/formatados no
  mesmo fuso; geração de "próximos dias" correta.
- Funções **centralizadas** de conversão (um helper único, ex.: `src/lib/timezone.ts`)
  substituindo os offsets espalhados — nenhuma regra de negócio baseada em offset fixo.
- Testes cobrindo ao menos São Paulo e Campo Grande (limites do dia, slots, lembrete).

Evitar complexidade: um campo por tenant + helpers centralizados bastam. Não suportar
fuso por profissional/serviço.

**Arquivos:** os listados acima + `supabase/schemas/01_perfis_empresas.sql`,
`src/app/actions/perfis-empresas.ts` (onboarding), novo `src/lib/timezone.ts`.

**Dependências/decisões:** nenhuma externa. Os limites de dia centralizados aqui serão
reutilizados pela proteção atômica de double-booking (pré-lançamento) — mais um motivo
para o helper único.

</details>

### 5. ~~Eventos de funil do produto~~ — ✅ Resolvido

**Resolvido em 2026-07-13** (ver "Itens resolvidos" no fim deste documento).
PostHog Cloud (opção 3: analytics gerenciado para funil + Postgres como fonte da
verdade operacional), tudo no-op sem `NEXT_PUBLIC_POSTHOG_KEY`, tenant
pseudonimizado por hash, zero PII. Taxonomia documentada em
`docs/08-ANALYTICS_E_FUNIL.md`. **Passo do owner:** criar projeto no PostHog e
configurar `NEXT_PUBLIC_POSTHOG_KEY` + `ANALYTICS_TENANT_SALT` no deploy.

### (histórico) 5. Eventos de funil do produto

**O que são:** eventos de funil são registros das etapas importantes percorridas pelos
usuários. Eles mostram quantas pessoas avançam ou abandonam cada ponto do produto
(ex.: muitos criam conta mas ninguém conclui o setup; muitos abrem o link público mas
poucos confirmam agendamento) e permitem medir se mudanças melhoram ou pioram a
conversão. Sem isso, as decisões de produto nos pilotos serão no escuro.

**Estado atual verificado:** não existe nenhuma instrumentação (nenhuma lib de
analytics no `package.json`, nenhum evento no código).

**Funil principal (referência):** visitou a landing → iniciou cadastro → concluiu
cadastro → iniciou onboarding → primeiro serviço → horários configurados → setup
completo → link copiado/compartilhado → cliente iniciou booking → cliente concluiu
booking → primeiro agendamento real recebido → confirmação WhatsApp enviada ou falha →
lembrete agendado → lembrete executado ou falha → visualizou planos → intenção de
upgrade → (futuro) pagamento iniciado e concluído.

**Taxonomia inicial proposta** (revisar contra o produto antes de implementar; nomes
não são definitivos; manter pequena e coerente — ex.: `service_selected`/`slot_selected`
só se a análise de abandono dentro do wizard se provar necessária):

- Aquisição/ativação: `landing_viewed`, `signup_started`, `signup_completed`,
  `onboarding_started`, `first_service_created`, `schedule_configured`,
  `setup_completed`, `booking_link_copied`.
- Booking B2C: `booking_started`, `booking_completed`, `booking_failed` (com motivo),
  `first_booking_received`.
- WhatsApp: `whatsapp_connect_started`, `whatsapp_connected`,
  `whatsapp_connection_failed`, `whatsapp_test_sent`, `whatsapp_confirmation_sent`,
  `whatsapp_confirmation_failed`, `whatsapp_reminder_scheduled`,
  `whatsapp_reminder_sent`, `whatsapp_reminder_failed`.
- Monetização: `plans_viewed`, `upgrade_clicked`.

**Propriedades quando fizer sentido:** `tenant_id` (de forma segura/pseudonimizada),
origem/nicho da landing, UTM, plano atual, etapa do onboarding, motivo de falha,
timestamp. **Nunca** enviar nome, telefone, e-mail ou conteúdo de mensagem para
analytics.

**Opções de coleta (escolher uma, proporcional ao projeto):**

1. Ferramenta gerenciada de product analytics (ex.: PostHog cloud, free tier) —
   funil completo pronto, zero dashboard próprio.
2. Eventos próprios no Postgres — controle total, mas exige construir consulta/visualização.
3. Combinação mínima: analytics gerenciado para aquisição/funil (landing → setup →
   booking) + eventos **operacionais** no Postgres (disparos de WhatsApp, que o P0.1
   já exige como log).

**Recomendação registrada:** opção 3. O log operacional de mensageria já nasce no
P0.1 (fonte da verdade para suporte — não duplicar em analytics); os eventos
`whatsapp_*` de analytics tornam-se apenas espelho agregado, e o funil de
aquisição/ativação fica numa ferramenta gerenciada — **não** construir dashboard
próprio se a solução gerenciada resolver melhor.

**Critérios de conclusão:** conversão calculável entre as etapas principais; ponto de
abandono identificável; falhas importantes têm motivo; landing de origem e UTM
preservados até o cadastro; eventos não duplicam a fonte da verdade operacional;
existe documentação curta da taxonomia (neste repo).

**Dependências/decisões:** escolher a ferramenta gerenciada; definir pseudonimização
do `tenant_id`.

### 6. ~~Landings específicas por nicho~~ — ✅ Resolvido

**Resolvido em 2026-07-13** (ver "Itens resolvidos" no fim deste documento).
Três landings verticais SSG (`/para/designer-de-sobrancelhas`, `/para/lash-designer`,
`/para/manicure`) com template compartilhado, copy honesta por nicho, demo
parametrizada, planos de `src/lib/planos.ts` e `landing_viewed` com o slug do nicho.
Prova social ficou de fora deliberadamente (não há pilotos reais — adicionar quando
existirem).

### (histórico) 6. Landings específicas por nicho

Direção de produto aprovada pelo owner (já existia conceitualmente na versão 1
descontinuada). A landing principal pode continuar genérica, mas devem existir
landings específicas para nichos prioritários. Como ainda não haverá lançamento nem
tráfego pago, o foco atual é **construir a estrutura e garantir qualidade**, não
otimizar campanhas.

**Estado atual verificado:** existe apenas a landing única (`src/app/page.tsx`, com
`DemoAgendamento`); nenhuma rota `/para/*`.

**Resultado esperado:**

- Um **template compartilhado** para landings verticais, mantendo a identidade visual
  oficial do VamoAgendar.
- Começar com **2–3 nichos reais**, não dezenas: ex. `/para/designer-de-sobrancelhas`,
  `/para/lash-designer`, `/para/manicure` (eventualmente `/para/barbeiro-autonomo`).
- Cada landing adapta: a dor/conversa repetitiva do nicho, linguagem específica,
  serviços específicos na demonstração, exemplos realistas, benefícios, prova social e
  CTA adequado — e responde: como o cliente agenda, como o profissional configura,
  como o WhatsApp ajuda, e **o que o sistema não tenta ser**.
- Não prometer multi-profissional enquanto não existir; uma única fonte de verdade
  para planos (`src/lib/planos.ts`).
- Nicho e UTMs rastreados nos eventos de funil (P0.5).

**Dependências/decisões:** escolher os 2–3 nichos iniciais; P0.5 para medir.

### 12. ~~Redesign do booking público — grade de horários inteligente, customização do tenant e layout mobile-first~~ — ✅ Resolvido (a: 2026-07-16; b/c: 2026-07-17)

**Registrado em 2026-07-16.** Três problemas no `/book/[slug]`,
decididos pelo owner como um único bloco de trabalho — todos resolvidos:

**a) ~~Temporização dos horários é burra (grade fixa de 15 min).~~ — ✅ Resolvido em
2026-07-16** *(absorveu e fechou os três subitens do P1.7: múltiplas janelas por dia,
antecedência mínima e horizonte máximo configuráveis)*

Regra anti-buraco escolhida pelo owner entre as candidatas em aberto: grade de 15 em 15
min ancorada no início de cada intervalo livre do dia, mais um candidato colado no fim
do intervalo — escondendo qualquer candidato que deixasse, antes ou depois dele, uma
sobra menor que a menor duração de serviço ativa do tenant (sobra inaproveitável por
nenhum serviço). Implementado em `gerarSlotsAntiBuraco`/`obterSlotsDisponiveis`
(`src/lib/booking-engine.ts`); a validação por string exata do booking público e do
agendamento manual foi preservada. Junto (mesmo código tocado): `horarios_funcionamento`
passou a aceitar N janelas por dia (RPC atômica `substituir_horarios_funcionamento`, até
3/dia na UI da agenda); `antecedencia_minima_minutos` (default 15) e
`horizonte_maximo_dias` (default 14) em `perfis_empresas`, aplicados por instante
(atravessa virada de dia) e enforced no servidor — não só na UI. O fluxo manual do
dashboard fica **fora** de antecedência e horizonte (walk-in permitido, decisão do
owner). Ver "Itens resolvidos" no fim deste documento.

<details><summary>Escopo original (histórico)</summary>

(histórico) a) Temporização dos horários é burra (grade fixa de 15 min).

Estado atual verificado: `slotStep = 15` hardcoded em `src/lib/booking-engine.ts:159` —
os inícios de slot são sempre de 15 em 15 min, independente do serviço, da duração e do
tenant. Consequência prática: um serviço de 45 min oferece 08:00/08:15/08:30..., o
cliente escolhe 08:15 e a agenda fica com sobras de 15 min inutilizáveis antes/depois.

Resultado esperado: um sistema de horários mais inteligente. **A regra exata está em
aberto** (decisão do owner durante a execução); direções candidatas a avaliar:
passo = duração do serviço (grade alinhada, zero sobra), passo configurável por tenant
ou por serviço, ou alinhamento automático que minimize buracos considerando os
agendamentos já existentes. Cuidados verificados no código:

- A validação do booking público e do agendamento manual compara o slot escolhido por
  **string exata** contra a engine (`public-booking.ts`, `agendamentos.ts`) — mudar a
  grade muda o contrato; os testes byte a byte de `booking-engine.test.ts` vão acusar.
- A mesma engine serve o `NovoAgendamentoModal` do dashboard — a grade nova vale para
  os dois fluxos.
- Itens correlatos do P1.7 (antecedência mínima configurável — margem fixa de 15 min em
  `booking-engine.ts:154` — e múltiplas janelas por dia): decidir se entram agora, já
  que o código tocado é o mesmo.

</details>

**b) ~~Customização visual do tenant mínima/inexistente.~~ — ✅ Resolvido em
2026-07-17** *(absorve e fecha o P1.11)*

Escopo estendido decidido pelo owner: cor + logo + **capa** + bio (reutiliza
`descricao`) + Instagram/endereço. **Toda customização visual (cor, logo, capa) é
exclusiva do Pro** — o Plus vai ser descontinuado em conversa futura e não ganha
recursos novos (`corPersonalizada` saiu do Plus em `planos.ts`). Imagens por **upload
próprio** no bucket público `imagens-perfis` do Supabase Storage (o sync do logo via
Clerk foi removido; nunca pedir URL de imagem). Instagram/endereço são infos básicas,
livres em todos os planos. A página pública consome tudo **sanitizado pelo plano
vigente** (`obterDadosBookingPublico` → chave `personalizacao`; downgrade não zera
colunas, o valor persistido é ignorado — mesmo padrão do slug efetivo). Detalhes em
"Itens resolvidos" no fim deste documento.

**c) ~~Layout com cara de "SaaS de dev".~~ — ✅ Resolvido em 2026-07-17**

`BookingWizard.tsx` (card flutuante zinc/violet) substituído pelo fluxo de etapas em
tela cheia estilo app (`BookingApp.tsx` + `CabecalhoEstabelecimento` + `BarraInferior`
+ `etapas/*`): identidade do estabelecimento no topo (capa/logo/bio/chips, colapsa em
barra sticky com progresso), barra-resumo fixa que se preenche com as escolhas + CTA
sempre à mão, identidade oficial como base (tokens + Poppins) e acento do tenant Pro
por cima com contraste calculado. Junto: `generateMetadata` por tenant (OG = capa),
`notFound()` real (404), a11y (radiogroups, labels, `role=alert`, foco por etapa) e
eliminação das classes mortas de animação.

**Critérios de conclusão:** ~~grade de horários~~ (a, feito); ~~página pública reflete
cor/logo do tenant pagante~~ (b, feito — cor/logo/capa, só Pro); ~~booking no celular
com aparência e fluxo de produto de consumo~~ (c, feito); ~~validação por string exata
e testes da engine~~ (a, feito — contratos preservados também em b/c).

---

## 🟡 P1 — Melhorias do núcleo do produto

### 7. Configurações de agenda necessárias para uso real

Sem inflar o MVP — classificação por urgência:

- ~~**Mais de uma janela por dia** (ex.: 08h–12h e 14h–18h)~~ — ✅ absorvido pelo
  P0.12(a) e resolvido em 2026-07-16: `UNIQUE (tenant_id, dia_semana)` caiu, RPC
  atômica `substituir_horarios_funcionamento` grava até 3 janelas/dia (limite da UI
  da agenda), engine passou a ler N janelas por `.select()` em vez de
  `.maybeSingle()`.
- ~~**Antecedência mínima configurável.**~~ — ✅ absorvido pelo P0.12(a) e resolvido
  em 2026-07-16: coluna `antecedencia_minima_minutos` (default 15) em
  `perfis_empresas`, select de 15 min a 24 h na UI da agenda, aplicada por instante
  (atravessa virada de dia) e enforced no servidor.
- ~~**Horizonte máximo de agendamento configurável.**~~ — ✅ absorvido pelo P0.12(a)
  e resolvido em 2026-07-16: coluna `horizonte_maximo_dias` (default 14), select de
  7 a 90 dias na UI da agenda, `BookingWizard` usa o horizonte do tenant em vez do
  fixo de 14 dias.
- **Depende do nicho:** buffer entre atendimentos (verificar necessidade antes).
- **Depois de evidência:** cancelamento/reagendamento pelo próprio cliente (hoje
  inexistente; exige decisão sobre link seguro sem login — manter Fricção Zero).

Não transformar este conjunto em um sistema completo de gestão.

### 8. Consistência WhatsApp ou e-mail (booking público)

`docs/05` dizia "WhatsApp **ou** e-mail (um dos dois)"; a UI antiga aceitava qualquer
um dos dois, mas a Server Action **exige** WhatsApp e envio por e-mail **não existe**
(Resend não é usado em lugar nenhum do código).

**Alinhado no redesign do booking (2026-07-17, decisão do owner):** por enquanto,
**WhatsApp obrigatório** — a etapa de contato nova pede só Nome + WhatsApp e o campo
de e-mail **saiu da UI pública** (a promessa era falsa: nada envia e-mail e quem
mandava só e-mail estourava na action). O parâmetro `clienteEmail` da action segue
opcional (contrato preservado).

**Regra-alvo registrada pelo owner:** quando envio por e-mail existir, a regra volta
a ser "**pelo menos um dos dois**" (e-mail OU WhatsApp — qualquer um serve, mas tem
que ter algum). Este item fica aberto até lá.

**Critério de conclusão:** envio por e-mail implementado e a regra "um dos dois"
valendo em UI + action + copy + docs/05 ao mesmo tempo.

**Arquivos:** `src/app/book/[slug]/BookingWizard.tsx`, `src/app/actions/public-booking.ts`,
`docs/05-PRODUTO_E_VISAO.md`.

### 9. Onboarding, ativação e melhorias baratas já apontadas em revisões

- `WhatsappClient.tsx` inteiro fora do sistema de tokens visuais (usa
  `zinc-*`/`emerald` herdados do arquivo antigo em vez de
  `palco/bastidor/fio/giz/marca`) — a página destoa do restante da área logada.
  Migrar para os tokens quando houver folga; sem impacto funcional. *(apontado
  na revisão final de UX, 2026-07-14)*
- Dashboard (checklist de onboarding): as duas queries de contagem em
  `src/app/dashboard/page.tsx` não checam `error` (falha silenciosa vira "não
  configurado") e rodam sequencialmente (paralelizar com `Promise.all`). *(pendente,
  verificado 2026-07-11)*
- `cache()` (React) em `obterAssinaturaVigente` para deduplicar a busca por request
  (layout + page consultam duas vezes na rota `/dashboard/plano`). *(pendente)*
- Trocar `<a href="/dashboard/plano">` por `<Link>` nos CTAs de upgrade
  (`ServicosClient.tsx:151` e `AgendaClient.tsx:310`; o `<a>` do banner de
  inadimplência está correto — URL externa). *(pendente)*
- Docs: substituir o neologismo "infraudável" (docs/07 e spec) por "impossível de
  fraudar"; ajustar a referência "ver seção seguinte" na seção 4 do docs/07.
  *(pendente)*
- Corrida estreita em `AgendaClient.tsx` (`handleSalvarHorarios`, ~linhas 350-366):
  quando as configs de agendamento mudam, a action reenvia os campos de perfil a
  partir da prop `perfilEmpresa` (não do estado local) por design — mas se o usuário
  salvar a aba Perfil e, antes do `router.refresh()` propagar a prop atualizada,
  submeter Horários com configs alteradas, essa chamada regrava o perfil com valores
  pré-refresh. Raro (exige dois submits em sequência rápida); dano limitado a reverter
  para um valor já persistido antes. *(apontado na revisão final da grade inteligente,
  2026-07-16)*
- `adicionarJanela` (`AgendaClient.tsx:262-273`, via `somarMinutos`) sugere uma janela
  `23:59–23:59` inválida quando a janela anterior do dia termina às 23:59 — a
  validação visual bloqueia o save (sem corrupção de dados), mas é beco de UX; não
  sugerir janela sem espaço. *(apontado na revisão final da grade inteligente,
  2026-07-16)*
- Endurecer os asserts de rejeição em `src/lib/__tests__/horarios.test.ts` (várias
  linhas, ex. 18, 33, 83, 87, 91): hoje checam só `not.toBeNull()`, sem travar o
  texto da mensagem de erro. *(apontado na revisão final da grade inteligente,
  2026-07-16)*
- Melhorias maiores de onboarding/ativação (guiar o tenant até o "setup completo"):
  especificar a partir dos dados do funil (P0.5).

### 10. Configurações pendentes no painel do Clerk (conferir se já aplicadas)

- **Organization creation limit = 1** (MVP: 1 usuário = 1 org; subir quando lançar
  multi-filiais).
- **Create first organization automatically** ligado.
- **Default membership limit = 1** (bloqueia convites estruturalmente) + ajustar o
  limite da(s) org(s) já existente(s), criadas antes da configuração.
- **Roles & Permissions**: remover `org:sys_memberships:read/manage` e
  `org:sys_domains:read/manage` da role de criador → aba "Members"/domínios some dos
  componentes do Clerk.
- Código: `hidePersonal` no `<OrganizationSwitcher>` do layout do dashboard
  (verificado 2026-07-11: ainda não aplicado).

### 11. ~~Cor e logo do tenant na página pública de booking~~ — ✅ resolvido via P0.12(b) em 2026-07-17

**Absorvido pelo P0.12 em 2026-07-16 e fechado em 2026-07-17** com o redesign do
booking público: cor, logo e capa do tenant Pro aplicados em `/book/[slug]` (upload
próprio no Storage; sanitização pelo plano vigente). Ver P0.12(b) e "Itens
resolvidos".

---

## 🟠 Obrigatório antes do lançamento público

Nada aqui é opcional — é a etapa imediatamente anterior a receber tráfego público.
Também **não é o próximo trabalho**: a prioridade atual é o produto (P0/P1). Nada
nesta seção bloqueia os pilotos controlados; quando uma parte mínima afetar os
pilotos, ela está destacada. **Não apagar os detalhes técnicos abaixo** — eles foram
verificados no código/banco e economizam a re-auditoria na hora de executar.

### Integridade e pertencimento multi-tenant (inclui hardening da Data API e revisão RLS)

Garantir que **todos os dados usados numa operação pertencem ao mesmo tenant** e que
a role `anon` (= a internet inteira) só alcança o mínimo necessário. (O bug funcional
do booking anônimo foi destacado para o P0.2 — o restante do redesenho fica aqui.)

> ### ✅ A parte "hardening da Data API" foi executada na **Phase 1** (2026-07-22)
>
> Toda a superfície `anon` descrita abaixo foi **fechada no privilégio**, não estreitada
> por policy. `revoke all` para a role `anon` nas nove tabelas do schema `public`, mais
> `alter default privileges` revogando `anon` **e** `authenticated` em objetos futuros
> (`service_role` preservado de propósito — ele é quem serve o booking público).
>
> **Como foi verificado, e por que a forma da prova importa:** `bash
> scripts/verificar-superficie-anon.sh` → exit 0, **11 checagens, 0 reprovadas, 0
> inconclusivas**, todas em `HTTP 401 / 42501 permission denied`. A linha de base de
> 2026-07-22, antes das migrations, era **6 reprovadas + 5 inconclusivas**. O número que
> fecha o item não é o `0 reprovadas` — é o **`0 inconclusivas`**: cinco checagens
> *pareciam* passar antes (três `200 []` porque a tabela estava vazia num banco de dev,
> duas `409/23503` porque a FK barrou a escrita antes do portão). Nenhuma delas provava
> nada. **Afirmação de fechamento sem `curl` rodado não conta.**
>
> ⚠️ **O que sustenta a citação daquele exit 0** (acrescentado em 2026-07-22, plano 01-19):
> entre 2026-07-22 e o plano 01-17 o harness saía 0 sem ter medido nada, e a verificação da
> fase proibiu citá-lo como prova enquanto assim fosse. O direito voltou junto com o
> controle `bash scripts/verificar-controle-harness-anon.sh`, que reprova o harness de
> propósito em três estados de falha e o aprova contra o alvo real — e vale **enquanto esse
> controle existir e passar**. Detalhes na seção "O harness de superfície anônima afirmava
> fechamento sem ter medido nada", mais abaixo.
>
> A leitura pública migrou para `createAdminClient()` com lista de colunas explícita e
> `tenant_id` resolvido **no servidor a partir do slug** — o `org_id` do Clerk saiu do
> payload do browser. Detalhes em
> `.planning/phases/01-hardening-da-superf-cie-p-blica/01-0{1,2,4}-SUMMARY.md`.
>
> **O que NÃO foi resolvido pela Phase 1 e continua aberto neste item:** o pertencimento
> **conjunto** ao mesmo tenant no banco (FK composta / trigger) — o segundo bullet abaixo.
> A Phase 1 fechou o acesso anônimo; não introduziu integridade referencial por tenant.

**Estado atual verificado (2026-07-11, código + `pg_policies` no banco):**

- ~~`criarAgendamentoPublico` busca o serviço apenas por `id`, sem `tenant_id`~~ —
  **fechado no P0.2 (2026-07-13)**: a action agora exige serviço ativo **e do mesmo
  tenant**, e valida tenant existente antes de qualquer escrita.
- ⚠️ **CONTINUA ABERTO** — as FKs de `agendamentos` validam `cliente_id` e `servico_id`
  individualmente, mas **não o pertencimento conjunto** ao mesmo `tenant_id`. A Phase 1
  não tocou nisto.
- ~~Políticas de INSERT `anon` em `agendamentos` e `clientes` exigem apenas
  `tenant_id IS NOT NULL` → qualquer visitante escreve direto pela Data API,
  contornando a Server Action, inclusive forjando `status` e `data_hora`~~ —
  **fechado na Phase 1 (2026-07-22)**: as policies foram substituídas por versões
  `TO authenticated` tenant-scoped **e** o privilégio de `anon` foi revogado. POST
  anônimo nas duas tabelas devolve `401 / 42501`.
- ~~SELECT `anon` em `agendamentos` é `USING (true)` com todas as colunas — qualquer um
  lista a agenda completa de todos os tenants, incluindo `cliente_id`~~ —
  **fechado na Phase 1**. A direção "GRANT por coluna" recomendada aqui foi
  **descartada com motivo técnico** (decisão D-01): o Postgres exige `SELECT` em
  qualquer coluna referenciada **inclusive no `WHERE`**, e o caminho público filtra por
  `tenant_id`. Liberar coluna manteria `tenant_id` legível e `?select=tenant_id`
  continuaria devolvendo a lista de todos os tenants. Fechou-se tudo.
- ~~`excecoes_agenda` SELECT `anon` `USING (true)` expõe `motivo` dos bloqueios de todos
  os tenants~~ — **fechado na Phase 1** (revoke total, não estreitamento de colunas).
- ~~`assinaturas`: falta `revoke insert, update, delete ... from anon, authenticated`~~
  — **fechado na Phase 1 (plano 01-01)** com `revoke all ... from anon`. A ressalva
  escrita aqui ("a exposição anônima de `tenant_id/plano/status` continua necessária ao
  slug efetivo do booking") **deixou de ser verdadeira**: `obterPlanoVigentePublico`
  passou a receber o cliente privilegiado. Não reintroduzir GRANT nenhum nessa tabela
  para `anon` com esse argumento.
- ~~`perfis_empresas`: avaliar esconder `telefone_contato` de `anon` por GRANT de
  coluna~~ — **resolvido por consequência na Phase 1**: `anon` perdeu a tabela inteira,
  então não há coluna a esconder.
- Lembrete externo: **Asaas e Clerk nunca acessam a Data API** (Asaas chama nosso
  webhook; Clerk só emite JWTs) — nada precisa ser aberto para eles.

**Resultado esperado:**

- Cliente, serviço, agenda e agendamento sempre do mesmo tenant; nenhuma operação
  aceita IDs cruzados; pertencimento validado na camada de servidor (e no banco quando
  proporcional — ex.: FK composta `(tenant_id, servico_id)` ou trigger).
- Visitantes **não conseguem contornar a Server Action** e inserir reservas/clientes
  direto pela Data API.
- Acesso `anon` reduzido ao mínimo que a engine e a página pública precisam
  (GRANTs por coluna; políticas estreitas).

**Direção recomendada:** o booking público continua passando exclusivamente pela
Server Action confiável; as escritas operacionais do fluxo público usam **acesso
privilegiado somente no servidor** (`createAdminClient()`) **após validação completa**
na action — parte já implementada pelo P0.2 (2026-07-13) — e as políticas
de INSERT `anon` em `agendamentos`/`clientes` são removidas (**pendente**). As leituras públicas
(serviços, slots) continuam via `anon` com RLS estreito.

**Critérios de conclusão:** tentativa com `servicoId` de outro tenant é rejeitada;
`INSERT` direto na Data API como `anon` é rejeitado; agenda de um tenant não é
listável publicamente com colunas sensíveis; testes cobrindo esses casos.

**Arquivos:** `src/app/actions/public-booking.ts`, `src/lib/supabase/admin.ts`,
`supabase/schemas/06_clientes.sql`, `07_agendamentos.sql`, `04_excecoes_agenda.sql`,
`08_assinaturas.sql`, `01_perfis_empresas.sql`, `docs/05-PRODUTO_E_VISAO.md` (o
exemplo conceitual de INSERT público precisa acompanhar a decisão).

**Dependências/decisões:** confirmar a direção "escrita operacional via admin client
no servidor" (muda o exemplo de política pública do docs/05); refazer a auditoria da
Data API depois (ver item de billing abaixo).

### ~~Superfície remanescente depois do hardening da Phase 1~~ — ✅ Fechada (plano 01-08, 2026-07-22)

**As duas policies abaixo não existem mais.** A análise fica registrada porque é o motivo
pelo qual elas foram removidas — sem isso, a próxima pessoa que ler os schemas pode
recriá-las achando que faltou alguma coisa. O registro de fechamento está no fim da seção.

Duas policies de SELECT sobreviveram à Phase 1 **por escopo, não por descuido**. Auditadas
em `pg_policies` depois do plano 01-04:

| Tabela | Policy | Cmd | Roles | Expressão |
|---|---|---|---|---|
| `servicos` | "Permitir SELECT público para todos" | SELECT | `{anon,authenticated}` | `(ativo = true)` |
| `horarios_funcionamento` | "Permitir SELECT público para todos" | SELECT | `{anon,authenticated}` | `(ativo = true)` |

O plano 01-04 mirava a decisão **D-07**: substituir as policies compartilhadas que **não
tinham par autenticado** (dropar sem recriar quebraria o dashboard em silêncio). Estas
duas **têm** par autenticado, então ficaram legitimamente fora daquele escopo.

**Risco 1 — leitura cross-tenant por usuário autenticado (valia até 2026-07-22).** A expressão é
`ativo = true`, sem cláusula de tenant. Qualquer profissional logado consegue ler os
serviços e os horários ativos de **todos os outros tenants** da plataforma via Data API.
Não expõe cliente, agendamento nem telefone — expõe catálogo e agenda de funcionamento
da concorrência. É **pré-existente**, não foi introduzido nem agravado pela Phase 1.

**Risco 2 — a policy morta era uma armadilha carregada (desarmada em 2026-07-22).** Para a role
`anon` estas duas policies são inertes *hoje*: sem privilégio, uma policy nunca chega a
ser avaliada. Mas o cabeçalho da própria migration `20260722060000_fecha_data_api_para_anon.sql`
argumenta que o portão precisa ser fechado no privilégio justamente porque "uma policy
criada por engano em qualquer fase futura reabre tudo". **Aqui a policy já existe,
pré-carregada.** Um único `GRANT ... TO anon` futuro nessas tabelas — inclusive
acidental, ou copiado de um snippet — reexpõe toda linha com `ativo = true` a quem
tiver a chave publicável. **Nenhuma policy nova precisa ser escrita para o buraco
reabrir.**

**A D-07 NÃO se aplicava aqui — o `DROP` era seguro, e isso foi verificado antes de
executar.** A regra "nenhuma policy compartilhada é dropada sem substituta" existe porque
dropar sem recriar deixa o dashboard com tela vazia e sem erro. Nestas duas tabelas a
substituta **já existia**: a policy `1b`, "Permitir SELECT do próprio tenant para
autenticados", `TO authenticated USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'))`, em
`supabase/schemas/02_servicos.sql` e `03_horarios_funcionamento.sql`. Ela cobre as linhas do
próprio tenant **inclusive as inativas** (é o que permite reativar um serviço e o que faz o
`RETURNING` do `.select()` funcionar). Policies são permissivas e se somam por `OR`:
removendo a compartilhada, sobrou exatamente o escopo desejado. **Nenhuma substituta nova
foi escrita — seria uma segunda policy redundante fazendo o que a `1b` já faz.** Quem for
mexer nesses schemas: não recrie a policy removida.

**✅ Registro de fechamento — plano 01-08, 2026-07-22**

| Item | Valor |
|---|---|
| Migration | `supabase/migrations/20260722145948_fecha_policies_residuais_servicos_horarios.sql` |
| Version no ledger | `20260722145948` / `fecha_policies_residuais_servicos_horarios` (18 versions = 18 arquivos) |
| Corpo executável | dois `drop policy if exists "Permitir SELECT público para todos"`, um por tabela. **Zero `grant`/`revoke`** — a default privilege da `20260722060000` ficou intacta |
| `pg_policies` depois | 8 linhas nas duas tabelas, **todas** com roles `{authenticated}`; nenhuma com o nome da policy removida, nenhuma com a role `anon` |
| Dano encerrado | sob `set local role authenticated` + claim `org_id` de tenant real, com um tenant vizinho descartável criado na mesma transação: `tenants_distintos_visiveis` **2 → 1** em `servicos`; **1** em `horarios_funcionamento` |
| Não-regressão do dashboard | a linha **inativa** do próprio tenant continua visível (1 em `servicos`, 2 em `horarios_funcionamento`) — é o caso que a `1b` cobre a mais e o que sustenta reativar um serviço |
| Superfície `anon` | `bash scripts/verificar-superficie-anon.sh` → exit 0, 11 checagens, 0 reprovadas, 0 inconclusivas, depois do DROP. ⚠️ Este exit 0 é citável porque o instrumento tem controle desde o plano 01-17 (`bash scripts/verificar-controle-harness-anon.sh`) — se o controle sair, a citação sai junto |

A migration foi **escrita à mão**, não gerada por `supabase db diff`. O procedimento
anteriormente escrito nesta seção mandava gerar pelo diff; para um delta de duas instruções
o caminho correto é o item (b) de `docs/03-PADROES_DE_BANCO_DE_DADOS.md` — escrever à mão —,
porque forçar o diff sobe shadow database em Docker e, quando há privilégio no caminho, emite
o inverso do desejado (precedente do plano 01-04). Aplicada por `execute_sql` com o `INSERT`
no ledger **na mesma chamada**, portanto na mesma transação: não houve janela entre o DDL e o
registro da version. `apply_migration` continua proibido — não preserva a version do arquivo.

### 🚪 Objeto criado pelo caminho da plataforma escapa da default privilege — ABERTO

**O que é.** As duas migrations que fecham a Data API para objetos futuros
(`20260722060000` e `20260722183153`) são `for role postgres`, e default privilege no
Postgres vale **por role criadora**. Elas garantem que o que o `postgres` cria nasce sem
`anon` e sem `authenticated` — o que cobre a rotina inteira do projeto, porque é como as
migrations rodam. **Não cobrem** o caminho da plataforma: extensão habilitada pelo painel
ou recurso gerenciado da Supabase cria como `supabase_admin`, e nesse escopo a ACL padrão
do schema `public` continua concedendo `anon` e `authenticated` — é o default de
plataforma, que a migration não tocou nem poderia.

**Por que nasce aberto e não bloqueante.** Hoje não há buraco: nenhuma extensão deste
projeto cria tabela em `public`. O risco é de descoberta por acidente numa fase futura,
depois que alguém habilitar algo pelo painel e assumir que "objeto novo nasce fechado"
vale sem qualificação.

- **Dono:** quem habilitar a extensão ou o recurso gerenciado — a conferência é parte do
  ato de habilitar, não uma tarefa separada.
- **Gatilho:** a próxima habilitação de extensão ou de recurso gerenciado da Supabase.
- **Como conferir:** reexecutar a consulta de `pg_default_acl` registrada em
  `docs/03-PADROES_DE_BANCO_DE_DADOS.md` §"🚪 Privilégios da Data API", alínea (a) — ela é
  não-mutante e está lá com a tabela das quatro linhas medidas e a procedência. O SQL não é
  duplicado aqui de propósito: uma cópia só, no documento que ensina a regra.
- **Conserto, se a tabela nascer aberta:** migration manual de `revoke`, escrita à mão como
  as demais de privilégio (`supabase db diff` não emite privilégio).

### Prevenção atômica de double-booking

O recálculo da engine antes do INSERT (`public-booking.ts` passo 3) **não elimina a
corrida** entre duas requisições simultâneas: ambas veem o slot livre e ambas inserem.
O fluxo normal (engine mostrando só horários livres, conflito bloqueado no manual) é
produto e já está coberto no P0; este item é a garantia **no banco** contra
concorrência, obrigatória antes de expor o produto a tráfego real.

**Estado atual verificado:** nenhuma constraint de exclusão/lock no banco
(`07_agendamentos.sql`); a janela de corrida vai da leitura da engine ao INSERT.
~~Além disso, o INSERT `anon` direto pela Data API ignora a engine por completo~~ —
esse contorno **foi fechado na Phase 1** (revoke total de `anon`); a corrida que resta
é entre duas chamadas legítimas da Server Action.

> 🔁 **Handoff da Phase 1 para a Phase 2 — o repro do "assume 30 minutos" MUDOU DE
> LUGAR. Ler antes de escrever teste.**
>
> A nota antiga deste item dizia: quando o join `servicos(duracao_minutos)` não retorna
> (serviço desativado é invisível para `anon`), a engine assume 30 min e a janela ocupada
> fica menor que a real. O ponteiro correto hoje é **`src/lib/booking-engine.ts:303`**
> (`const duracao = ag.servicos?.duracao_minutos || 30`) — a referência antiga a
> `booking-engine.ts:143` está desatualizada.
>
> **O que a Phase 1 mudou:** a leitura pública passou a usar `createAdminClient()`
> (service role), que **bypassa o RLS**. O embed `servicos(duracao_minutos)` agora
> devolve a duração real **também para serviço desativado**, então o fallback de 30
> minutos **deixou de disparar no caminho público**. É uma melhoria, mas não foi
> planejada — e ela invalida qualquer teste da Phase 2 escrito para reproduzir o sintoma
> pelo fluxo público.
>
> **Consequência prática:** AGE-01/AGE-02 continuam necessários — a duração ainda vem por
> join e ainda muda quando o profissional edita o serviço; só o *sintoma* mudou de lugar
> (o fallback continua valendo se o join falhar por outro motivo). **O plano da Phase 2
> não pode escrever repro que dependa de desativar um serviço e passar pelo booking
> público** — nesse caminho o bug não aparece mais. *Sinal de alerta:* teste que tenta
> provar o bug desativando serviço no fluxo público.

**Resultado esperado:**

- Proteção **atômica no banco** (ex.: exclusion constraint com `tstzrange` sobre
  `tenant_id` + intervalo `[data_hora, data_hora + duração)` para status ativos) ou
  operação transacional equivalente — levando em conta a **duração do serviço**.
- Ao perder a corrida, o segundo cliente recebe a mensagem amigável já existente
  ("Este horário já foi preenchido...") — não um erro genérico.
- Duração da ocupação correta mesmo para serviços desativados.
- O agendamento manual (P0.3) adota a mesma proteção.

**Critério de conclusão (objetivo):** duas requisições concorrentes para o mesmo
intervalo **nunca** resultam em dois agendamentos ativos sobrepostos — comprovado por
teste de concorrência.

**Arquivos:** `supabase/schemas/07_agendamentos.sql` (+ migration via `db diff`),
`src/app/actions/public-booking.ts`, `src/app/actions/agendamentos.ts`,
`src/lib/booking-engine.ts`.

**Dependências/decisões:** exclusion constraint precisa da duração do serviço no
momento do INSERT (coluna `duracao_minutos` desnormalizada no agendamento ou lookup
no trigger) — decidir a forma mais simples; reaproveita os limites de dia
centralizados do P0.4.

### Rate limiting e proteção contra agendamentos falsos/abuso

Preservar a Fricção Zero para o cliente final, mas impedir que um script preencha toda
a agenda de um profissional. Ganha relevância quando o link circular publicamente.

**Estado atual verificado:** nenhuma proteção existe (sem rate limit, honeypot ou
CAPTCHA; `rg` não encontra nada). Pior: o INSERT direto pela Data API contorna
qualquer proteção que fosse colocada na action — **este item depende do item de
integridade acima**.

**Resultado esperado:**

- Rate limit por IP, por telefone e por tenant na `criarAgendamentoPublico`
  (janela curta; Upstash Ratelimit é o caminho natural — Upstash já está na stack).
- Honeypot barato no formulário público (campo invisível).
- Logs mínimos de rejeição (para saber se há abuso real e calibrar limites).
- Sanitização/validação no servidor (já existe para telefone; manter e não afrouxar).
- CAPTCHA **apenas como fallback** se abuso real aparecer — não adicionar agora.
- Impossível contornar escrevendo direto na Data API (garantido pelo item de
  integridade).

Não transformar o booking num fluxo cheio de validações visíveis — as proteções devem
ser invisíveis para o cliente legítimo.

**Critérios de conclusão:** script simples repetindo POSTs não consegue lotar uma
agenda; cliente legítimo não percebe nenhuma fricção nova.

**Arquivos:** `src/app/actions/public-booking.ts`, possivelmente `src/proxy.ts`
(rate limit de rota), `src/app/book/[slug]/BookingWizard.tsx` (honeypot).

**Dependências/decisões:** item de integridade primeiro; escolher limites iniciais
(ex.: N tentativas por IP/telefone por hora) e revisá-los nos pilotos.

### 🔑 Rotação das signing keys do QStash — ação do owner, prazo 2026-08-05

**Só o owner fecha este item.** A rotação acontece no painel da Upstash; nenhum
executor tem acesso a ele e nenhum pode marcar este item como feito — mesma regra da
lista de UAT logo abaixo.

**Por que existe.** Até o plano 01-11, `agendarLembreteQStash` publicava a URL de
destino de **todo** lembrete carregando a chave de assinatura em texto claro na query
string. Desde o plano 01-03 essa é a **mesma** chave com que o webhook autentica via
`Receiver`, e HMAC é simétrico: quem leu o valor forja um `Upstash-Signature` válido e
dispara WhatsApp em nome de qualquer tenant. Parar de publicar não desfaz o que já
circulou. Três vetores concretos (CR-01 do `01-REVIEW.md` da Phase 1), todos fora do
alcance da sanitização do Sentry — que cobre breadcrumb e `request.url`, não log de
infraestrutura nem de terceiro:

1. **Log de acesso HTTP de cada hop** entre o QStash e a Railway: a linha de
   requisição inclui a query string.
2. **Console e armazenamento do QStash**: a URL de destino fica visível na listagem de
   mensagens por até 14 dias.
3. **Log da aplicação**: os `console.error` de `whatsapp-helper.ts` despejavam o corpo
   de erro devolvido pelo QStash, que costuma ecoar a URL de destino. Também fechado
   no plano 01-11.

**Etapa 1 — ✅ FEITA (plano 01-11, 2026-07-22).** A publicação passou a ser limpa:
`${APP_URL}/api/webhooks/lembrete`, sem query string nenhuma, em
`src/lib/whatsapp-helper.ts`. Prova reexecutável:
`grep -vE '^\s*(//|\*|/\*)' src/lib/whatsapp-helper.ts | grep -c '?secret'` → `0`, mais
três casos em `src/lib/__tests__/whatsapp-helper.test.ts` que reprovam se o parâmetro
voltar. **Isso não mata lembrete em voo:** `route.ts` verifica a assinatura contra
`req.url`, então cada mensagem valida contra a URL com que ela própria foi publicada —
a antiga com o parâmetro, a nova sem. Não existem "duas gerações" em conflito.

**Etapa 2 — 🔴 ABERTA, do owner. Data-limite: 2026-08-05.** Rotacionar
`QSTASH_CURRENT_SIGNING_KEY` e `QSTASH_NEXT_SIGNING_KEY` no painel da Upstash,
**depois que a fila secar**.

- **Por que a espera é necessária.** O horizonte de agendamento de lembrete no QStash
  é de até 14 dias, e 2026-08-05 é 14 dias depois de 2026-07-22 — a data em que a
  última publicação com o parâmetro pode ter ocorrido. Rotacionar com a fila cheia
  invalida a assinatura de todo lembrete já publicado, o webhook passa a recusá-los
  com 401 e a mensageria deste projeto falha **em silêncio por desenho**: ninguém
  reclama de mensagem que não chegou. Esperar não é cautela genérica, é evitar
  exatamente o modo de falha característico deste produto.
- **Depois de rotacionar, nesta ordem:** (1) atualizar as duas variáveis no Railway e
  no `.env.local`; (2) reexecutar `bash scripts/verificar-fail-fast-boot.sh` e conferir
  exit 0 com os quatro vereditos; (3) confirmar na prática que um lembrete novo chega —
  é o item "Lembrete do QStash ponta a ponta" da lista de UAT abaixo.
- **Nomes de variável, nunca valores.** Nenhum valor de chave entra neste documento,
  em commit, PR ou mensagem: publicar um valor foi precisamente o que criou este item.

**Critério de fechamento:** as duas variáveis com valor novo em todos os ambientes, o
harness verde depois da troca e um lembrete real entregue com a chave nova.

### 🧪 UAT humano pendente da Phase 1 (não executado — bloqueia o "fechou de verdade")

A Phase 1 provou por comando tudo o que é provável por comando. **O que sobra exige olho
humano e não foi feito** — o executor do plano 01-05 rodou sem o owner presente e
registrou em vez de fingir. Nada abaixo foi aprovado; nada abaixo deve ser assumido como
aprovado. O `CONTEXT` da fase chama isto de "regressão obrigatória e não negociável".

**Por que não dá para dispensar:** as regressões prováveis desta fase **degradam em
silêncio**. Policy substituta errada não estoura erro — a agenda aparece **vazia**.
Sanitização de plano quebrada não estoura erro — o tenant gratuito passa a exibir
personalização paga. Lembrete rejeitado não estoura erro — mensageria falha em silêncio
por design. Nenhum desses modos de falha aparece em `lint`, `test`, `build` ou `curl`.

**Reduzido pelo plano 01-07 (2026-07-22):** o **lado servidor** de três destes itens saiu
da lista de olho humano e virou comando — `pnpm test:integracao` exercita, contra o
Supabase de dev, a criação de agendamento pelo slug (cliente novo, `RETURNING`), o
reaproveitamento de cliente por telefone, a rejeição de horário ocupado com a mensagem que
a UI reconhece e a cópia exata da caixa de erro de slots. O que continua aqui é
estritamente o que acontece **na tela** — e continua não aprovado.

⚠️ **"Parcialmente coberto" não é "pode pular".** A cobertura automatizada cresceu com os
planos 01-07 e 01-08 e isso **reduz** a probabilidade de cada regressão; não fecha nenhum
item. Os sete continuam abertos, e só o owner pode fechá-los — nenhum executor tem como
observar uma tela. Cada item marcado como parcialmente coberto diz, em primeiro lugar, o
que a automação **não** cobre; é essa frase que define o que falta fazer.

- [ ] **Wizard completo de `/book/[slug]`** — *parcialmente coberto.* **Não cobre:** as
      telas do navegador, a ausência de fricção nova, a transição para "Horário
      confirmado!" e a linha aparecendo na agenda do dashboard. O que fazer: serviço →
      data/hora → nome + WhatsApp → confirmar → tela de sucesso, conferindo o agendamento
      na agenda e que nenhuma etapa, campo ou atraso novo apareceu (Fricção Zero).
      *Agravado pelo plano 01-02*, que trocou o identificador que as duas Server Actions
      públicas recebem (`tenantId` → `slug`). Provado por automação até aqui: que a página
      responde 200, que o payload monta com dados reais e — desde o plano 01-07 — que o
      caminho de **escrita** funciona ponta a ponta pelo servidor (resolução por slug,
      criação de cliente, sanitização de telefone, INSERT com `RETURNING`).
- [ ] **Recuperação de double-booking** — *parcialmente coberto.* **Não cobre:** o aviso
      âmbar renderizado, a grade refeita e o cliente voltando à etapa de data/hora. O que
      fazer: duas abas no mesmo slot; a segunda deve voltar à etapa de data/hora com o
      aviso âmbar e a grade refeita, nunca uma caixa vermelha estática no formulário de
      contato. O plano 01-07 pinou o acoplamento de string nas duas pontas (a action
      produz "já foi preenchido", `BookingApp.tsx` casa exatamente essa substring) e prova
      que a action rejeita o horário ocupado sem gravar nada.
- [ ] **Dashboard sob as policies tenant-scoped novas, tela a tela** — *reforçado, não
      coberto.* Agenda carrega os agendamentos; agendamento manual salva **e a linha
      volta** (o `RETURNING` depende de passar na policy de SELECT); bloqueio/exceção
      salva; aba Perfil salva; serviços listam — incluindo **reativar um serviço inativo**,
      caso que passou a importar depois do `DROP` do plano 01-08. O 01-08 provou por SQL
      que, sob a role autenticada, o próprio tenant enxerga inclusive as linhas inativas
      depois do DROP (1 em `servicos`, 2 em `horarios_funcionamento`), o que torna a falha
      "tela vazia sem erro" ainda mais improvável. Improvável não é verificado; o item
      continua aberto.
- [ ] **Personalização por plano** — comparar um tenant Pro (cor/logo/capa aparecem) com
      um gratuito (não aparecem). Com o RLS bypassado no caminho público, a sanitização
      por plano deixou de ser defesa em profundidade e virou **defesa única**.
- [ ] **Lembrete do QStash ponta a ponta** — criar agendamento com lembrete próximo e
      confirmar que a mensagem chega. Um `401` no log ("Assinatura QStash inválida")
      indica mismatch de URL atrás de proxy; plano B: montar a URL de `APP_URL` depois
      que a fila drenar.
- [ ] **Caixa de erro de slots** — *parcialmente coberto.* **Não cobre:** a cópia
      aparecendo na caixa vermelha com `role="alert"` e o botão "Tentar de novo"
      funcionando — nunca foram vistos na tela. O que fazer: forçar a falha de slots e
      olhar a caixa renderizada com a copy do plano 01-02 ("Não foi possível carregar os
      horários. Tente de novo."). ~~Teste barato: chamar
      `obterSlotsPublicos('slug-inexistente', …)`~~ — **feito no plano 01-07**: a suíte de
      integração assere a string por igualdade estrita e que ela não vaza slug, `tenant`,
      `org_` nem `PGRST`.
- [ ] **Backstops visuais com dado extremo** — 20+ serviços ativos na lista da etapa;
      `horizonte_maximo_dias = 30` alongando a fileira de datas; nome de serviço, nome de
      cliente, `nome_estabelecimento`, descrição e endereço longos no resumo, na tela de
      sucesso e no painel de marca.

### ~~O harness de superfície anônima afirmava fechamento sem ter medido nada~~ — ✅ Fechado (plano 01-17, 2026-07-22)

**O que valia até 2026-07-22.** `scripts/verificar-superficie-anon.sh` decidia o exit code
só por `REPROVADAS -eq 0`. Com o alvo inalcançável, as 11 checagens registravam `HTTP 000`,
o veredito COBERTURA passava, e a última linha era `11 checagem(ns), 0 reprovada(s) — a role
anon não devolveu linha nenhuma` com **exit 0**: afirmação positiva de segurança a partir de
zero medição. A 3ª verificação da fase reproduziu isso num diretório isolado, com o
`.env.local` apontando para um host inexistente. Era o instrumento que o `ROADMAP.md` e o
`01-04-PLAN.md` nomeiam como prova de SEG-01, SEG-02 e SEG-03.

**O que passou a valer.** Duas coisas, e as duas decidem exit code:

1. **Contador de prova positiva.** Sem nenhuma checagem ESPERADA, o script sai **2**
   nomeando a causa em vez de sair 0 afirmando fechamento.
2. **Veredito `[ALVO]` de identidade.** Antes de qualquer medição, o harness exige uma
   tabela **declarada** respondendo `42501` e um **canário inexistente** respondendo
   `PGRST205`. Sem esse par, "tabela fechada", "este não é o banco deste projeto" e
   "gateway que nega tudo" ficam indistinguíveis — e o script sai 2.

**O comando que prova:** `bash scripts/verificar-controle-harness-anon.sh` — controle
re-executável que reprova o harness de propósito em três estados de falha
(`ALVO_MORTO`, `PROJETO_ERRADO`, `TUDO_NEGADO`) e o aprova contra o alvo real
(`CONTROLE`). Na primeira execução, antes do conserto, ele saiu 1 com os quatro vereditos
reprovados; depois, 4 vereditos e 0 reprovados.

⚠️ **A condição que acompanha o direito de citar o exit code, e ela não é decorativa.** A
verificação da fase impôs, literalmente, que enquanto o controle não existisse **nenhum
documento do projeto poderia citar o exit 0 deste script como prova de fechamento**. O
plano 01-17 fez o controle existir, então a citação voltou a ser legítima — **enquanto o
controle existir e passar**. Quem remover, desativar ou afrouxar
`verificar-controle-harness-anon.sh` remove junto o direito de citar o exit code do harness
como evidência, aqui e em qualquer outro documento. Nesse caso resta a leitura linha a linha
do relatório.

### ~~Uma requisição anônima parava o event loop por 26 segundos~~ — ✅ Fechado (plano 01-18, 2026-07-22)

**O que foi medido antes.** Contra build de produção, com o slug público real e sem sessão,
`obterSlotsPublicos` invocada com `duracaoMinutos = -5000000` devolveu **26.751 ms e
19.291.480 bytes** numa **única** requisição — a mesma chamada com `30` custa 525 ms e 2.179
bytes. O laço de `gerarSlotsAntiBuraco` é síncrono: aqueles 26 segundos são o event loop
parado para **todas** as requisições em voo. E `dateStr = "nao-e-uma-data"` devolvia
`{ ok: true, slots: [] }` — grade errada, sem sintoma. O fluxo autenticado validava a data
por regex; o anônimo não validava nada.

**O que passou a valer.** Validação na **fronteira** da Server Action pública, antes de
`createAdminClient()` e antes de o slug ser resolvido: `dateStr` contra a mesma regex do
fluxo autenticado, mais reserialização (sem ela, mês 13 e dia 45 passam na regex);
`duracaoMinutos` inteiro, positivo e limitado a 24×60. Mais guarda de profundidade na
primeira linha da função pura — fronteira é porteiro, função pura é contrato. A mesma
requisição hostil passou a custar 6 ms e 109 bytes. Nenhuma fricção nova para o cliente
final: a Fricção Zero proíbe CAPTCHA, e validação de entrada é a defesa que sobra.

**Os comandos que provam:** `bash scripts/verificar-travessia-server-action.sh` — os
vereditos `ENTRADA_HOSTIL` e `DATA_HOSTIL`, que além do discriminante exigem a **ausência**
de `slug_invalido` no corpo (é isso que prova a ordem, e não só a recusa) — e `pnpm test`,
que cobre a guarda da função pura com controle positivo.

⚠️ **A fronteira exata, porque o vizinho aqui embaixo confunde.** Isto fechou o caminho
público de **LEITURA**. O caminho de **ESCRITA** — `clienteNome` sem limite de comprimento e
`clienteEmail` sem validação de formato — é o **WR-03 da 1ª rodada**, registrado logo abaixo
e **ainda diferido**, com o gatilho que já tem (Phase 3 ou Phase 5). Um não fecha o outro.

### Achados do code review da Phase 1 diferidos (2026-07-22)

⚠️ **Duas rodadas de review, o mesmo prefixo `WR-`, significados diferentes — leia isto
antes dos rótulos.** Os quatro achados listados abaixo (`WR-01`, `WR-03`, `WR-04`, `WR-06`)
usam a numeração da **1ª rodada**, cujo relatório foi substituído no arquivo e vive hoje só
no histórico do git: `git show 4596463:.planning/phases/01-hardening-da-superf-cie-p-blica/01-REVIEW.md`.
O `01-REVIEW.md` que está no repositório é o da **2ª rodada** (planos 01-10 a 01-16) e traz
outros dez avisos com os mesmos rótulos. A colisão é real e não é hipotética: `WR-03` é
"escrita pública sem limite de tamanho" na 1ª rodada e "nenhum harness tem porta de entrada"
na 2ª. **Regra para este documento:** os quatro logo abaixo são da 1ª rodada; os dez da
lista seguinte são da 2ª e trazem a marca `(2ª rodada)`.

Quatro achados do `01-REVIEW.md` da Phase 1 **não** foram aprovados para a rodada de
fechamento de gaps. Nenhum é esquecimento: cada um está aqui com a consequência concreta
de não ser feito e o gatilho que o traz de volta. Os que foram feitos (CR-01, CR-02,
CR-04) estão registrados nos itens acima e nos SUMMARYs dos planos 01-11 e 01-12.

- **WR-01 — a Server Action pública devolve `tenant_id` e `slug_gratuito` ao chamador**
  (`src/app/actions/public-booking.ts:20-21,348-352`). `COLUNAS_PERFIL_PUBLICO` inclui
  `tenant_id`, e `obterDadosBookingPublico` devolve o perfil inteiro. O `page.tsx` tem o
  cuidado explícito de mandar `hashTenantId(...)` ao browser, mas a action é, por
  definição, um endpoint de rede: quem a invocar direto com um slug válido recebe o
  `org_id` do Clerk daquele tenant. **Consequência:** é exatamente a informação que o
  critério 1 desta fase protegeu na superfície da Data API, obtida por outra porta. Não
  permite enumeração em massa (exige o action id e um slug conhecido), mas é vazamento
  dirigido.
  💡 **É o mais barato dos quatro e o mais aderente ao tema da fase.** O conserto é
  desestruturar o retorno mantendo `tenant_id` na projeção — o filtro por tenant depende
  dele — e não devolvê-lo: `const { tenant_id, slug_gratuito, ...perfilPublico } = perfil`.
  Não entrou porque **não foi aprovado nesta rodada**, não porque seja difícil.
  *Gatilho:* a próxima rodada de hardening — ou antes disso, se o owner quiser puxá-lo.
- **WR-03 — caminho de escrita público sem limite de tamanho nem validação de formato**
  (`src/app/actions/public-booking.ts:103-115,217-227`). `criarAgendamentoPublico` valida
  presença e sanitiza o telefone, mas `clienteNome` não tem limite de comprimento e
  `clienteEmail` não tem validação de formato nem de tamanho; as colunas `clientes.nome`
  e `.email` são `text` sem CHECK. **Consequência:** linha de tamanho arbitrário na
  tabela `clientes` de qualquer tenant, e o nome entra direto no template do WhatsApp
  (`whatsapp-helper.ts`) — um nome de 100 kB vira uma mensagem de 100 kB disparada na
  instância Evolution do profissional. **Distinto do rate limiting** registrado acima:
  ali o problema é o volume de requisições, aqui é o conteúdo de uma requisição só.
  *Gatilho:* Phase 3 (anti-abuso) ou Phase 5 (contato flexível), o que vier primeiro.
- **WR-04 — a verificação por `req.url` pode recusar tudo atrás do proxy da Railway**
  (`src/app/api/webhooks/lembrete/route.ts:27-36`, `src/lib/qstash-assinatura.ts:57`). A
  claim `sub` do JWT casa contra a URL que o Next reconstrói a partir de `host` e
  `x-forwarded-proto`; qualquer divergência de protocolo, host ou barra final em relação
  ao que o QStash assinou faz `receiver.verify` recusar **todas** as requisições.
  **Consequência:** lembrete nenhum sai e ninguém fica sabendo — o caminho de recusa é um
  `console.warn` mais um 401, sem linha em `disparos_whatsapp`, sem reporte ao Sentry, e o
  cliente final não reclama de mensagem que não chegou. O harness só prova as negativas
  (401 para sonda inválida); nenhum artefato automatizado prova o positivo.
  *Gatilho:* o item de UAT "Lembrete do QStash ponta a ponta". Um 401 no log torna este
  item urgente, e o plano B já registrado lá é montar a URL de `APP_URL` depois que a fila
  drenar.
- **WR-06 — falha de transporte do WhatsApp devolve 500 e o QStash reenvia, sem checagem
  de idempotência** (`src/app/api/webhooks/lembrete/route.ts:170-192`). O 500 é
  deliberado (força o retry), mas `{ok:false}` cobre também `erro_rede`, isto é, timeout —
  o caso em que a Evolution pode ter entregado a mensagem e só a resposta ter se perdido.
  Nada consulta `disparos_whatsapp` por um lembrete já `executado` para o mesmo
  `agendamento_id` antes de disparar. **Consequência:** o cliente final recebe o mesmo
  lembrete duas ou três vezes — num produto cujo diferencial é o WhatsApp, isso custa
  reputação do profissional. O comentário no código antecipa a duplicidade apenas no log
  ("linhas duplicadas de log entre tentativas são aceitáveis"), não na mensagem.
  *Gatilho:* primeiro piloto com volume real, ou a Phase 11 (observabilidade).

#### Achados da 2ª rodada de review (planos 01-10 a 01-16) — estado em 2026-07-22

Ponteiros, não análise: cada linha tem o rótulo, o que é em uma frase, e a seção do
`01-REVIEW.md` (o do repositório, 2ª rodada) onde está o raciocínio completo com arquivo e
linha. Nenhum conserto é proposto aqui — **este registro existe para que achado não vire
esquecimento**, e resolver qualquer um deles é decisão de outra rodada.

Os **dois blockers** da rodada foram fechados e estão registrados acima:

- ✅ **CR-01 (2ª rodada)** — entrada anônima sem validação alimentando a condição de parada
  de um laço síncrono. **Fechado pelo plano 01-18** (seção "Uma requisição anônima parava o
  event loop por 26 segundos"). Análise: `01-REVIEW.md` §CR-01.
- ✅ **CR-02 (2ª rodada)** — o harness de superfície saindo 0 com afirmação de fechamento
  sem ter medido nada. **Fechado pelo plano 01-17** (seção "O harness de superfície anônima
  afirmava fechamento sem ter medido nada"). Análise: `01-REVIEW.md` §CR-02.

Os **dez warnings continuam abertos**:

- **WR-01 (2ª rodada)** — a condicional que sustenta a "janela de plano indeterminado" em
  `public-booking.ts` é tautologicamente falsa: o comportamento é o pretendido, mas o
  próximo leitor vai acreditar numa restrição que não existe. §WR-01.
- **WR-02 (2ª rodada)** — `.message` crua do Postgres ainda vai ao `console.error` no
  caminho público (`public-booking.ts`, `assinaturas.ts`), com PII de terceiro em duas das
  linhas; o helper `erroSinteticoSupabase()` já existe e é usado três linhas abaixo. §WR-02.
- **WR-03 (2ª rodada)** — nenhum dos harnesses tem porta de entrada: sem script em
  `package.json`, sem `.husky/`, sem CI. Trava que ninguém roda não trava nada. §WR-03.
- **WR-04 (2ª rodada)** — a "trava anti-afrouxamento" do harness anônimo compara a
  constante com a literal escrita duas linhas acima: custo zero, benefício zero, e dá
  impressão falsa de auto-proteção. §WR-04.
- **WR-05 (2ª rodada)** — `TODOS_OS_MOTIVOS` não é exaustivo por construção e o JSDoc do
  teste promete que é: membro novo passaria com sete de oito, em silêncio. §WR-05.
- **WR-06 (2ª rodada)** — a guarda cruzada de namespace em `salvarPerfilEmpresa` é
  unidirecional: o `slug_gratuito` recém-sorteado nunca é comparado com o `slug` alheio.
  §WR-06.
- **WR-07 (2ª rodada)** — três cópias visíveis ao cliente final continuam inline em
  `BookingApp.tsx`, contra a promessa de fonte única de `mensagens.ts`. §WR-07.
- **WR-08 (2ª rodada)** — `ResolucaoPerfil` é exportado e nunca importado, num arquivo
  `'use server'`: superfície exportada crescendo por inércia. §WR-08.
- **WR-09 (2ª rodada)** — na migration de funções o `REVOKE` é global e o `GRANT` para
  `service_role` é por schema; função criada fora de `public` nasce inexecutável também
  pelo `createAdminClient()`. §WR-09.
- **WR-10 (2ª rodada)** — `plano_indeterminado` não entrou no `COMMENT ON COLUMN` de
  `disparos_whatsapp.motivo`, e é o único motivo que significa "a tentativa vai se repetir".
  §WR-10.

#### Duas afirmações desatualizadas, fora do escopo desta rodada

Encontradas ao escrever este registro, medidas, e **não corrigidas** porque caem fora dos
três arquivos que o plano 01-13 declara modificar — e a segunda está sob `src/`, que esse
plano se proíbe de tocar. Ficam aqui para não sumirem:

1. `docs/09-OBSERVABILIDADE_E_EMAIL.md:124-125` afirma que `notificacoes-agendamento.ts`
   loga a URL do QStash carregando o parâmetro de secret. **Falso, medido:**
   `grep -n 'console\.' src/lib/notificacoes-agendamento.ts` devolve uma única linha (155),
   que loga só o `err` de um `catch`; `grep -nE 'QSTASH|webhookUrl|publishUrl|secret'` no
   mesmo arquivo volta vazio. A outra metade da frase, sobre `whatsapp-helper.ts`, era
   verdadeira e deixou de ser no plano 01-11.
2. `src/lib/observabilidade/sanitizacao.ts:99-100` e
   `src/lib/observabilidade/opcoes-sentry.ts:31` descrevem, no presente, uma URL de destino
   que embute a chave de assinatura em query string. Deixou de ser verdade no plano 01-11.

**Nada disso muda comportamento:** as travas anti-PII continuam corretas e cobertas por
teste. O que está errado é a justificativa escrita ao lado delas — e justificativa falsa é
o que faz o próximo leitor tomar a decisão errada. *Gatilho:* a próxima mudança em qualquer
dos três arquivos, ou a próxima passada da skill `docs-vivas`.

### Demais preparações de lançamento

#### Diferidos da etapa preparatória "Fundação operacional" (2026-07-21)

Cada um com o **gatilho** que o traz de volta — nenhum é "esquecido", todos são
"decididos e adiados".

- ~~**Seis eventos de funil do dashboard (B2B), propostos pelo wizard do
  PostHog.**~~ **RESOLVIDO em 2026-07-21** — deixou de ser diferido. O wizard
  foi rodado de novo, commitado cru (`5df0671`) e **reendurecido por cima**, no
  mesmo fluxo do wizard do Sentry. Entraram sete eventos (os seis previstos mais
  `booking_status_changed`, único que mede taxa de cancelamento). Grafia
  decidida: **nome em inglês, propriedade em pt-BR**, consistente com os 20+
  eventos que já existiam — contrato completo em `docs/08-ANALYTICS_E_FUNIL.md`.
- **Session Replay no `/book/[slug]`.** *Gatilho:* **Phase 10 publicar os termos de uso
  e a política de privacidade** — só aí existe base legal declarada para gravar sessão
  de terceiro. Decidido pelo owner em 2026-07-21 (manter desligado até lá).
  Não confundir com **captura de erro no navegador**, que está **ligada** no booking
  público por decisão do owner e não é afetada por este item. Replay é o vídeo da
  sessão: outro produto, outro risco.
  Vale reavaliar porque é genuinamente útil — ver o cliente travar na escolha de
  horário diz mais que um stack trace. Ao ligar, avaliar duas variantes: só no
  `/dashboard` (o profissional tem conta e aceitou termos) ou no booking com
  mascaramento total de inputs. ⚠️ O mascaramento é por **seletor de CSS**: campo novo
  sem a classe certa passa a ser gravado e **nada avisa** — o defeito só aparece
  assistindo a uma gravação. Se ligar, cobrir com teste de seletor.
- **`tunnelRoute` do Sentry.** *Gatilho:* constatar perda relevante de evento de
  client por ad blocker. Ad blockers barram requisição para `*.sentry.io`, e
  `/book/[slug]` é público e recebe tráfego de campanha. Custo: a doc do Sentry
  exige **excluir** a rota do matcher, e o projeto só tem `isPublicRoute` em
  `src/proxy.ts` — mexer ali arrisca o gate do Clerk por um ganho de fração de
  eventos. Exige teste manual com ad blocker ligado.
- ~~**Source maps do Sentry.**~~ **RESOLVIDO em 2026-07-21** — deixou de ser
  diferido. O owner rodou o wizard do Sentry, que trouxe org e projeto reais
  (`kriawq-tests` / `javascript-nextjs`); a mesclagem manteve o upload de source
  map e descartou o resto do que o wizard propôs. Configurado em `next.config.ts`
  com `sourcemaps.deleteSourcemapsAfterUpload: true` — sem essa opção os `.map`
  ficariam servidos em `/_next/` e o código-fonte do produto seria reconstruível
  a partir do bundle. **Pendências do owner:** `SENTRY_AUTH_TOKEN` no ambiente de
  build do Railway (sem ele o plugin apenas avisa e o build segue — não quebra), e
  permitir o build do `@sentry/cli` em `pnpm-workspace.yaml`, hoje `false`.
  Motivo de ter mudado de ideia: a decisão de manter o Sentry no client existe
  para pegar erro de JS e de hidratação em `/book/[slug]`, e stack minificado
  esvazia exatamente esse ganho.
- **Custo do Sentry no bundle de `/book/[slug]`: +73 KB gzip** (168,8 → 241,8 KB),
  medido no build, bem acima dos 20–30 KB que a pesquisa estimou — sob Turbopack
  o `treeshake` do `withSentryConfig` é no-op, então não há configuração que
  reduza isso. *Gatilho:* se a conversão do booking público mostrar sensibilidade
  a peso de página, reavaliar Sentry client-side (a alternativa é server-only,
  que era a recomendação inicial e foi descartada pelo owner com justificativa).
- **Instrumentação da causa raiz nos demais `throw new Error` das actions B2B**
  (~105 pontos). Hoje cada um já produz evento via `onRequestError`; o ganho de
  instrumentar é "mensagem melhor", não "evento existe ou não". *Gatilho:* cada
  fase que tocar a action acrescenta onde a causa raiz importar.
- **Fila do Asaas pausada como modo de falha silencioso.** Não tem código hoje —
  é herança explícita da **Phase 9**, não lacuna desta etapa.
- **Cache Components + Sentry têm issue aberta** (`getsentry/sentry-javascript#21333`):
  `captureException` quebra o prerender com Cache Components ligado. **Não se
  aplica hoje** — `cacheComponents` é opt-in e não está no `next.config.ts`.
  *Gatilho:* ligar Cache Components exige revisitar o Sentry antes.

#### Diferidos da revisão de código da "Fundação operacional" (2026-07-21)

- **⚠️ ORDEM DO PRÓXIMO DEPLOY DE PRODUÇÃO (WR-02).** `NEXT_PUBLIC_SENTRY_DSN`,
  `RESEND_API_KEY`, `NEXT_PUBLIC_POSTHOG_KEY` e `ANALYTICS_TENANT_SALT` entraram
  na lista de obrigatórias de `src/lib/env.ts` (hoje quatorze, com
  `QSTASH_NEXT_SIGNING_KEY` acrescentada pela Phase 1), e os gates manuais (criar
  projeto no Sentry/PostHog, inserir os secrets no Railway) **ainda não foram
  executados**. Deploy antes disso derruba o produto inteiro **por falta de
  credencial de observabilidade** — o oposto do invariante "observabilidade nunca
  quebra o produto". *Gatilho:* antes do próximo deploy de produção, conferir que as
  quatro existem no Railway; se for preciso subir antes, remover as quatro da
  lista no mesmo commit do deploy.

  🔬 **CORREÇÃO MEDIDA (Phase 1, plano 01-05, 2026-07-22): não é crash loop.** Este
  item afirmava que `register()` lançando faz "o boot morrer e o produto cair em crash
  loop". Medido empiricamente contra o build de produção (`next start`, Next 16.2.10),
  o comportamento real é **outro e pior de detectar**:

  ```
  ✓ Ready in 87ms
  Failed to prepare server Error: An error occurred while loading instrumentation hook:
  Variáveis obrigatórias ausentes em produção: QSTASH_NEXT_SIGNING_KEY
  ⨯ unhandledRejection: ...
  ```

  O processo **não morre**. Ele imprime `✓ Ready`, continua **escutando na porta** e
  responde **HTTP 500 em absolutamente toda rota** (`/`, `/book/[slug]`,
  `/api/webhooks/lembrete`) — indefinidamente, repetindo o erro a cada requisição.
  Contrafactual rodado no mesmo build: com as quatorze presentes, as mesmas rotas
  respondem 200.

  **Por que isso importa mais que a distinção semântica:** um crash loop é *ruidoso* —
  o Railway marca o deploy como falho e faz rollback. Um processo vivo servindo 500 é
  *silencioso*: healthcheck baseado em "o processo está de pé" reporta saudável, o
  deploy é dado como bem-sucedido e o produto fica no ar com 100% de erro.

  ✅ **RESOLVIDO (Phase 1, plano 01-06, 2026-07-22): o processo morre de verdade.** O
  owner escolheu a falha dura em vez do healthcheck HTTP como controle compensatório.
  `src/instrumentation.ts` envolve `validarEnvObrigatorio()` em `try/catch` e, no
  runtime `nodejs`, chama `encerrarBootPorEnvAusente` (`src/lib/env.ts`), que escreve a
  causa em `stderr` e sai com **código 1**. No runtime `edge` o comportamento anterior
  (relançar) é preservado — lá não existe `process.exit`. `pnpm dev` e `pnpm build`
  continuam livres: o encerramento fica atrás do gate `NODE_ENV === 'production'` que
  `validarEnvObrigatorio()` já aplicava, e o hook não roda em `phase-production-build`.

  A prova é comando, não relato: `bash scripts/verificar-fail-fast-boot.sh` sobe um
  `next start` real na porta 3991 e emite quatro vereditos — `BUILD`, `MORTE`,
  `CONTROLE` e `WEBHOOK` —, saindo 0 só quando os quatro passam. Rodado **antes** do
  conserto, ele reprovava `MORTE` (processo vivo, HTTP 500); depois, aprova os quatro.
  *Gatilho:* rodar o harness sempre que `src/lib/env.ts`, `src/instrumentation.ts` ou a
  lista de obrigatórias mudarem.

  ⚠️ **A ordem do deploy continua valendo, e agora com consequência maior.** Com o boot
  morrendo, uma obrigatória mal provisionada no Railway derruba o deploy inteiro em vez
  de servir 500 — que é o comportamento desejado (habilita rollback automático), mas
  torna o checklist acima obrigatório e não opcional: conferir que as quatorze existem
  no Railway **antes** de subir, ou remover nomes da lista no mesmo commit do deploy.

  ✅ **O critério 5 do ROADMAP passa a ser literalmente verdadeiro**, e continua
  coberto por duas camadas independentes: (a) a aplicação **não sobe** sem as chaves;
  (b) `verificarAssinaturaQstash` (`src/lib/qstash-assinatura.ts:42`) **lança** se
  qualquer das duas chaves estiver ausente, então não existe caminho permissivo mesmo
  que a camada (a) fosse contornada. Não há default inseguro em lugar nenhum.
- **A sanitização do Sentry é allowlist só onde é viável (CR-02).** São
  allowlist: `request`, `request.headers` e `extra` — campo novo do SDK cai fora
  por construção. **Não** são filtrados `message`, `exception.values[].value`,
  `contexts` e `tags`, porque reduzi-los quebraria o agrupamento e a utilidade do
  evento; a proteção deles é na origem (nenhum call site manda objeto de erro
  cru — ver `erroSinteticoSupabase`). *Gatilho:* quando o projeto passar a usar
  `setTag`/`setContext`, ou quando algum call site precisar mandar erro de
  terceiro cru, `contexts`/`tags` entram na allowlist e `exception.values[].value`
  ganha truncamento por padrão. Enquanto isso, todo `reportarExcecao` novo tem
  que passar erro sintético, não objeto de erro de biblioteca.
- **`import 'server-only'` em `src/lib/observabilidade/reportar.ts` (WR-10) não
  foi aplicado.** O pacote resolve para um módulo que **lança** fora da condição
  `react-server`, e `reportar.ts` é importado transitivamente por
  `whatsapp-helper.test.ts` — a suíte inteira quebraria, e o conserto seria
  acrescentar `resolve.conditions: ['react-server']` ao `vitest.config.ts`, o que
  muda a resolução de react/next em todos os testes por um ganho pequeno (o DSN
  do Sentry é identificador público por design, não secret). *Gatilho:* se
  `vitest.config.ts` ganhar `resolve.conditions` por outro motivo, aplicar junto.
- **`pnpm build && pnpm start` local sem secrets agora morre no boot (IN-03).**
  `next start` roda com `NODE_ENV=production`, então o fail-fast de `env.ts` vale.
  `pnpm build` continua livre (o `register()` não roda em `phase-production-build`)
  e `pnpm dev` também. Para inspecionar o build local, use `--env-file=.env.local`
  ou `NODE_ENV=development pnpm start`.

  🔎 **Atualização (plano 01-06): "morre no boot" agora é literal.** Antes o processo
  ficava vivo servindo 500; hoje ele sai com código 1. As duas saídas de inspeção
  acima continuam valendo sem mudança.

- **Três diagnósticos de Edge Runtime no `pnpm build` (achado do plano 01-06, decisão
  do owner pendente).** `src/lib/env.ts` passou a usar `process.stderr.write` (linhas
  91 e 92) e `process.exit` (linha 96), e o arquivo é importado por
  `src/instrumentation.ts`, que também é empacotado para o runtime **edge**. O
  Turbopack então imprime, a cada build, três blocos do tipo:

  ```
  A Node.js API is used (process.exit at line: 96) which is not supported in the Edge Runtime.
  Import trace:  Edge Instrumentation: ./src/lib/env.ts → ./src/instrumentation.ts
  ```

  **Não é falha:** medido num build bem-sucedido, `pnpm build` sai **0** (o resumo de
  rotas é impresso normalmente), `pnpm dev` sobe e responde 200, e o código nunca
  executa no edge — `encerrarBootPorEnvAusente` só é chamado atrás da guarda
  `NEXT_RUNTIME === 'nodejs'`. O analisador é estático e não enxerga essa guarda.

  **É ruído, e ruído rotulado como "error" é dívida:** três blocos por build treinam
  quem lê a saída a ignorá-la — o mesmo padrão de janela quebrada que esta fase
  combateu. As saídas possíveis, nenhuma delas tomada aqui porque contrariam o
  contrato do plano 01-06 (que fixa os dois símbolos em `src/lib/env.ts` e pina
  `process.stderr.write` em teste): (a) mover `encerrarBootPorEnvAusente` para um
  módulo próprio que só o caminho nodejs importe; (b) aceitar o ruído e documentá-lo
  como esperado. Aliasar `process` por `globalThis` para calar o analisador **não** é
  uma saída: esconderia o sinal em vez de resolvê-lo. *Gatilho:* decisão do owner
  antes do go-live, ou na primeira vez que a saída do build for usada como gate de CI.

- **Checkout Asaas + webhooks completos de cobrança** (`/api/webhooks/asaas`) —
  necessário **se o lançamento já pretender cobrar automaticamente**: roadmap técnico
  completo em `docs/07`. Pré-requisito registrado: **refazer a auditoria da Data API**
  (item de integridade acima concluído — os campos sensíveis de `assinaturas` passam a
  ter dados reais).
- Itens técnicos herdados da preparação do billing:
  - Trocar `ON DELETE CASCADE` da FK `assinaturas.tenant_id` por `RESTRICT` (hoje um
    tenant que apaga o próprio perfil destrói a linha de assinatura/vínculo Asaas).
  - Limite de serviços: considerar trigger no banco contra corrida (duas criações
    simultâneas podem passar do limite — hoje é checagem app-layer por design).
  - Retry/regeneração no slug aleatório em caso de colisão (keyspace 36^8 — risco
    desprezível, mas a mensagem de erro atual confunde).
  - Definir o **período de carência** da inadimplência (hoje: mantém benefícios +
    banner, sem prazo).
- Cobrança self-service; experiência definitiva de upgrade/downgrade.
- Revisão de segurança geral (secrets, headers, webhooks, superfícies públicas).
  - ~~Webhook de lembrete: secret em query string e fallback `'secret-key'` valendo
    nos dois lados~~ — ✅ **Fechado na Phase 1 (planos 01-03 e 01-06, 2026-07-22).**
    O achado original, da revisão final de 2026-07-14, dizia: "o secret trafega em
    query string e o fallback `'secret-key'` vale nos dois lados quando
    `QSTASH_CURRENT_SIGNING_KEY` não está setada — em produção a env é OBRIGATÓRIA".
    A análise fica registrada porque é o motivo de o webhook ter a forma que tem hoje;
    as três metades foram fechadas assim:
    - **A autenticação passou a ser criptográfica.** O webhook verifica o header
      `Upstash-Signature` pelo `Receiver` de `@upstash/qstash`, em
      `src/lib/qstash-assinatura.ts`, chamado por
      `src/app/api/webhooks/lembrete/route.ts` **antes** de o corpo ser parseado
      (corpo não verificado nunca vira JSON). Entregue pelo plano 01-03. Prova
      reexecutável: `bash scripts/verificar-fail-fast-boot.sh`, veredito `WEBHOOK` →
      `sem assinatura 401 | secret em query 401 | assinatura forjada 401 | GET / 200`.
      O caso do meio é o que prova que o parâmetro legado não autentica mais nada.
    - **O fallback inseguro embutido no código foi extinto.** Comando que prova:
      `grep -rn "secret-key" src/ scripts/` → saída vazia (reconferido em 2026-07-22
      no HEAD desta rodada, antes de este item ser reescrito).
    - **As chaves de assinatura viraram obrigatórias no boot** (plano 01-06): faltando
      qualquer uma, o processo sai com **código 1** em vez de subir e servir 500 em
      toda rota. Prova: veredito `MORTE` do mesmo harness.

    ⚠️ **O que não fechou junto:** a chave de assinatura circulou em texto claro na
    URL publicada de todo lembrete até o plano 01-11, e por isso precisa ser
    rotacionada. Item próprio, com dono e prazo: **"🔑 Rotação das signing keys do
    QStash"**, nesta mesma seção. É por causa dele que **SEG-05 não está marcado como
    concluído** em `.planning/REQUIREMENTS.md`.
- Política de privacidade e termos finais; revisão final de LGPD; fluxo de
  exclusão/exportação de dados.
- Testes críticos de segurança e concorrência (ver seção "Qualidade e testes").
- Observabilidade de produção (error tracking, alertas). *Parte mínima para pilotos:
  o log de disparos do P0.1 já cobre o essencial de mensageria.*
- **Go-live do banco — fim da fase "DEV livre" de migrations** (três passos, na ordem):
  1. Ativar o hook PreToolUse de imutabilidade de migrations, pronto e testado em
     `.claude/hooks/migrations-prod.md` (copiar o bloco JSON para `hooks.PreToolUse`
     do `.claude/settings.json` seguindo as instruções do próprio arquivo).
  2. Remover do `CLAUDE.md` o bullet "Editar migrations existentes é permitido NESTA
     FASE" (seção "Banco de dados (fase atual: DEV)").
  3. Substituir a seção "Banco de dados (fase atual: DEV)" do `CLAUDE.md` pela versão
     prod: migrations aplicadas são imutáveis, correção = nova migration via
     `supabase db diff`, hard reset proibido.
- Engine de disponibilidade — agendamento que atravessa a meia-noite: `obterSlotsDisponiveis`
  busca os agendamentos do dia via `limitesDoDia` (`src/lib/booking-engine.ts:266-282`),
  que filtra `data_hora` dentro do próprio dia — um agendamento iniciado à noite da
  véspera com duração longa o suficiente para invadir a madrugada não é subtraído dos
  slots do dia seguinte. Comportamento pré-existente ao branch da grade inteligente
  (não introduzido por ele), só alcançável com janelas noturnas + serviços longos;
  tratar antes de aceitar tenants com horário estendido. *(achado da revisão final da
  grade inteligente, 2026-07-16)*
- Pre-flight de CHECK constraints em dados reais antes de aplicar migration com
  `VALIDATE CONSTRAINT`: `ck_hora_fim_apos_inicio` (e futuros CHECKs equivalentes)
  falham a aplicação se existir linha legada que viole a regra — validar dados de
  produção antes de aplicar. *(achado da revisão final da grade inteligente,
  2026-07-16)*
- Backups e recuperação; testes de carga.
- Domínio definitivo, e-mails de produção e configurações finais (lembrete herdado:
  configurar `SUPABASE_SECRET_KEY` e demais envs no Railway/produção).
- Painel/ferramentas de suporte.
- Preparação para tráfego pago (só quando o owner decidir lançar).

---

## 🔵 Depois de evidência (cada item com gatilho observável)

- **Migração para WhatsApp Cloud API oficial (ou outro provedor) e WhatsApp em
  escala**: arquitetura para grande quantidade de instâncias, infraestrutura
  distribuída, observabilidade avançada de mensageria, processamento de grande volume
  e automações de suporte em escala. A integração Evolution/Baileys atual deve apenas
  ficar confiável para pilotos controlados (P0.1) — não misturar os dois escopos.
  **Gatilho:** validação do canal WhatsApp com pilotos reais + crescimento (o risco de
  bloqueio do Baileys aumenta com volume).
- **Multi-profissional** *(decisão do owner em 2026-07-10)*: NÃO são contas ou
  membros separados — a conta do tenant cadastra os profissionais disponíveis, cada um
  podendo ter horários e/ou serviços próprios; o cliente final escolhe o profissional
  (ou "qualquer um") no fluxo público. Impacta: tabela nova (`profissionais`),
  `horarios_funcionamento`/`servicos` opcionalmente vinculados a profissional, engine
  de disponibilidade por profissional e um passo extra no BookingWizard.
  **Gatilho:** profissionais interessados deixarem de adotar ou de pagar
  especificamente por essa ausência.
- **Multi-filiais**: subir o limite de criação de organizações no Clerk (zero
  refactor — o switcher vira seletor de filial). **Gatilho:** tenant real com segunda
  unidade pedindo.
- **Cancelamento/reagendamento autônomo pelo cliente final** (ver P1.7).
  **Gatilho:** volume relevante de cancelamentos chegando por WhatsApp nos pilotos.
- **Aplicativo nativo** — gatilho: retenção comprovada no mobile web + pedido
  recorrente.
- **Controle financeiro / estoque / marketplace / pagamentos dos serviços / CRM
  avançado / relatórios avançados / IA no WhatsApp / programa de fidelidade /
  permissões granulares / integrações adicionais sem demanda observada** — todos fora
  da visão atual (docs/05: o produto não tenta ser ERP). Gatilho comum: clientes
  pagantes reais condicionando a permanência a um desses itens.
- **Arquitetura para grande escala** (filas além do QStash, cache, réplicas) —
  gatilho: uso real com sinais de saturação medidos.

---

## 🧊 Congelado — evoluções do sistema de planos

O sistema de planos existente (Gratuito/Plus/Pro, gating, inadimplência) **permanece
como está** — não remover nem reescrever. Novas evoluções comerciais ficam congeladas
enquanto o produto principal é aprimorado: regras sofisticadas de downgrade, novos
planos, novos gates, personalização comercial, billing e tratamento de inadimplência
além do banner atual — até validação com clientes reais.

---

## 🧪 Qualidade e testes (requisito transversal)

O runner é **Vitest** (`vitest.config.ts`), e a decisão de adotá-lo já foi tomada e
executada. Testes continuam sendo requisito **proporcional**, nas áreas de maior risco —
comportamento crítico, não cobertura:

- Junto do trabalho de produto (P0): engine de disponibilidade (`booking-engine.ts`)
  — slots, exceções, colisões; fuso horário (P0.4) — limites de dia em pelo menos SP
  e Campo Grande; agendamento manual (P0.3); confirmação e lembrete (P0.1) —
  inclusive falha sem quebrar o agendamento; regras de plano que afetam envio
  (gating Pro nos disparos).
- Antes do lançamento: pertencimento multi-tenant e políticas RLS — IDs cruzados
  rejeitados; criação concorrente — corrida nunca gera sobreposição.

### ⚠️ `pnpm test` é hermético por desenho — leia antes de mexer no `vitest.config.ts`

Regra viva, não pendência. Estabelecida no plano 01-07 e registrada aqui porque o lugar
onde alguém tropeça nela é o `vitest.config.ts`, não o SUMMARY de um plano.

- `pnpm test` **não toca rede nem banco**, e assim deve continuar. É o comando da
  Definition of Done do projeto e roda em toda fase, na máquina de qualquer um.
- A suíte `src/app/actions/__tests__/public-booking-escrita.test.ts` **escreve e apaga no
  Supabase de dev** (cria o tenant `org_teste_integracao_booking`, agenda, e limpa antes e
  depois). Ela fica **fora do glob padrão** do vitest: o `exclude` do `vitest.config.ts` a
  remove sempre que `EXIGIR_INTEGRACAO !== '1'`.
- **Único ponto de entrada:** `pnpm test:integracao` (que é `EXIGIR_INTEGRACAO=1 vitest run
  <a suíte>`). Sem credenciais o comando **reprova** em vez de pular — pulo silencioso
  devolveria verde sobre prova que não rodou.
- **Consequência de reincluí-la no glob padrão:** toda execução da Definition of Done, em
  toda fase futura, passaria a escrever no banco de dev — e duas execuções concorrentes
  apagariam a fixture uma da outra, produzindo falha intermitente que parece bug de
  produto. Se a contagem de `pnpm test` crescer para incluir esses casos, é regressão.
- A variável `CAMINHO_ENV_LOCAL` existe **apenas** para provar que o comando reprova sem
  credenciais, apontando para um arquivo inexistente. Ela nunca move, renomeia ou escreve
  no `.env.local` real.
- Contagem de referência hoje: `pnpm test` → **13 arquivos / 198 testes**;
  `pnpm test:integracao` → **6 testes** (5 de integração + a sentinela), 0 pulados.

---

## ✅ Itens resolvidos (histórico)

- **2026-07-17 — P0.12-desktop: responsividade real + split de 2 painéis no
  desktop do booking público** — segue o P0.12(c) (que entregou só o mobile):
  - **Decisões do owner**: mobile permanece idêntico ao aprovado; tablet (`sm`/`md`)
    é a mesma coluna, só mais larga/arejada; desktop (`lg`, 1024px+) ganha uma
    experiência própria — split de 2 painéis, painel da marca fixo à esquerda,
    animações de transição entre etapas, degrade bonito sem customização (usa a
    identidade oficial do VamoAgendar) e mais "dahora" com cor/capa/logo do tenant
    Pro.
  - **Princípio de implementação**: o conteúdo de cada etapa (`etapas/*`) renderiza
    uma única vez (mesmo `<form id="form-contato">`, mesmos inputs); só o chrome
    (identidade/resumo/progresso/CTA/voltar) é duplicado por breakpoint via
    `lg:hidden` / `hidden lg:flex` — a variante inativa sai do layout, do tab-order e
    da árvore de acessibilidade (`display:none`), então coexistir no DOM é
    inofensivo. Shell desktop replica o idiom já validado em
    `dashboard/layout.tsx` (`lg:flex lg:h-dvh lg:overflow-hidden`, `lg:min-h-0` em
    todo flex-child com `overflow-y-auto` — documentado em `docs/04`).
  - **Componentes novos** em `src/app/book/[slug]/`: `PainelMarca.tsx` (halo
    tintado — 22% com cor do tenant, 14% no fallback da marca —, capa+scrim com
    nome/logo sobrepostos em branco ou fallback idêntico ao `CabecalhoEstabelecimento`
    sem capa, bio, chips, resumo e stepper), `StepperVertical.tsx` (3 passos
    verticais; concluído vira botão que volta direto, com 44px de área de toque via
    `-m-1.5` sobre um dote visual de 32px; atual com anel na cor do tenant; futuro
    só leitura), `RodapeAcaoDesktop.tsx` (CTA + Voltar em fluxo normal, nunca
    fixed/sticky), `ResumoAgendamento.tsx` (extração da comanda do
    `BarraInferior`, reaproveitada pelos dois), `passos.ts` (fonte única de
    `ORDEM_ETAPAS`/`ROTULOS_ETAPAS` — evita o progresso mobile e o stepper desktop
    divergirem).
  - **`BookingApp.tsx`**: estado `direcao` (avancar/voltar) anima o slide entre
    etapas no desktop (`.desliza-passo-avancar/voltar` no `globals.css`,
    `prefers-reduced-motion` respeitado, mobile intacto com `.aparecer-rapido`);
    `irParaEtapa` generaliza `voltar()` para o clique no stepper (só retrocede,
    nunca pula para uma etapa futura); recuperação de double-booking preservada
    (soma `setDirecao('voltar')`); nome/telefone elevados e `erroEnvio` limpável
    preservados.
  - **Contratos/analytics inalterados**: `criarAgendamentoPublico`,
    `obterSlotsPublicos`, engine, `obterDadosBookingPublico`, `booking_started`
    (1x/visita)/`booking_completed`/`booking_failed` — nenhum tocado.
  - **Verificação**: `pnpm lint`/`pnpm build` verdes; screenshots em 390/834/1440,
    claro/escuro, com walkthrough completo (serviço → data/hora → contato →
    sucesso) via automação CDP; fallback sem customização conferido pelo slug
    gratuito do tenant Pro de teste (assinatura cancelada e revertida via Supabase
    MCP só para o teste, sem alterar dado real).

- **2026-07-17 — P0.12(b)+(c): customização do tenant e redesign mobile-first do
  booking público** — fecha também o P1.11:
  - **Decisões do owner**: escopo estendido (cor + logo + capa + bio via `descricao` +
    Instagram/endereço); **customização visual só no Pro** (`corPersonalizada` saiu do
    Plus — o Plus será descontinuado em conversa futura e não ganha recursos novos);
    imagens por **upload próprio** (nunca pedir URL — "revela produto amador");
    Instagram/endereço livres em todos os planos; layout de **etapas em tela cheia**
    escolhido sobre mockup; contato com WhatsApp obrigatório por ora (ver P1.8).
  - **Banco**: `capa_url`, `instagram` (CHECK de formato) e `endereco` (CHECK ≤200)
    em `perfis_empresas`; CHECK `#rrggbb` em `cor_marca`; **drop de `exibir_logo`**
    (com upload próprio, subir/remover já expressa a intenção). Migrations
    `20260717173021_personalizacao_booking_publico` (diff limpo do ruído de
    REVOKE/GRANT do migra) e `20260717173148_storage_imagens_perfis` aplicadas no
    cloud.
  - **Storage**: bucket público `imagens-perfis` (5MB, jpeg/png/webp, sem SVG),
    paths `<org_id>/logo|capa-<epoch>.<ext>` com cache-busting. **Sem políticas em
    `storage.objects`**: neste projeto o `postgres` não é owner da tabela (Supabase
    atual) e não pode criar políticas ali — o bucket ficou default-deny e TODA
    escrita passa pelas actions `enviarImagemPerfil`/`removerImagemPerfil`
    (`imagens-perfil.ts`: `auth()` + gating Pro + MIME/tamanho validados + path
    derivado do `orgId` + `createAdminClient()`), postura mais restritiva que RLS de
    pasta. Upload anônimo direto na API do Storage negado (verificado por curl).
  - **Actions**: `salvarPerfilEmpresa` sem o sync de logo do Clerk e sem
    `exibirLogo`; valida hex da cor e normaliza Instagram; `obterDadosBookingPublico`
    **estendido** com `personalizacao {corMarca, logoUrl, capaUrl}` sanitizada pelo
    plano vigente (downgrade ignora valor persistido — verificado: página via
    `slug_gratuito` sem acento após cancelar assinatura) e campos crus neutralizados
    no `perfil`.
  - **Página pública**: `BookingWizard.tsx` deletado; `BookingApp.tsx` +
    `CabecalhoEstabelecimento` (capa/logo/bio/chips que colapsa em barra sticky com
    progresso) + `BarraInferior` (barra-resumo que se preenche com as escolhas + CTA)
    + `etapas/` (serviço; data/hora com grupos manhã/tarde/noite; contato só
    nome+WhatsApp com `useActionState`; sucesso com endereço/mapa/Instagram).
    Identidade oficial (tokens + Poppins) como base; acento do tenant via CSS vars
    `--acento`/`--acento-texto` (contraste WCAG calculado no servidor,
    `src/lib/cores.ts`); `generateMetadata` por tenant (OG = capa quando houver),
    `notFound()` real com 404 (exigiu `notFound()` no `generateMetadata` e remoção
    do `loading.tsx` — Next 16 faz streaming da metadata e o shell sairia com 200),
    a11y (radiogroups, `htmlFor`, `role=alert`, foco por etapa, touch ≥44px,
    `prefers-reduced-motion`), classes mortas de animação eliminadas
    (`.aparecer-rapido` real no globals). Analytics preservado byte a byte.
  - **Contratos preservados**: engine intocada, `obterSlotsPublicos` e
    `criarAgendamentoPublico` idênticos (validação por igualdade exata de datetime),
    `NovoAgendamentoModal` só trocou `formatarTelefone` local pelo import de
    `src/lib/telefone.ts`.

- **2026-07-16 — P0.12(a): grade inteligente de horários (regra anti-buraco)** —
  absorve e fecha os três subitens do P1.7 (múltiplas janelas por dia, antecedência
  mínima e horizonte máximo configuráveis):
  - **Regra escolhida pelo owner** entre as candidatas em aberto: grade de 15 em 15
    min ancorada no início de cada intervalo livre do dia + um candidato colado no
    fim do intervalo (`b - duracaoMinutos`), escondendo qualquer candidato que
    deixasse, antes ou depois dele, uma sobra menor que a menor duração de serviço
    ativa do tenant — sobra que nenhum serviço conseguiria preencher depois.
    Implementada em `gerarSlotsAntiBuraco`/`obterSlotsDisponiveis`
    (`src/lib/booking-engine.ts`); a validação por string exata do booking público
    e do agendamento manual foi preservada (nenhuma quebra de contrato).
  - **Banco**: colunas `antecedencia_minima_minutos` (default 15, CHECK >= 0) e
    `horizonte_maximo_dias` (default 14, CHECK 1–365) em `perfis_empresas`; a
    `UNIQUE (tenant_id, dia_semana)` de `horarios_funcionamento` caiu (N janelas por
    dia); RPC `substituir_horarios_funcionamento` (SECURITY INVOKER, delete+insert
    numa única transação, `tenant_id` sempre derivado do JWT, nunca do payload)
    evita perda de dados se o insert falhar após o delete. Migration
    `20260716162901_grade_inteligente_agenda` aplicada no Supabase Cloud.
  - **Actions**: o booking público (`public-booking.ts`) passa `regrasAcesso`
    (antecedência por instante — atravessa virada de dia — e horizonte) para a
    engine, enforced no servidor mesmo que a UI seja contornada; o fluxo manual do
    dashboard (`agendamentos.ts`) fica de fora de ambas as regras — walk-in
    permitido, decisão do owner. Validação pura `validarJanelasFuncionamento`
    (`src/lib/horarios.ts`, testável isoladamente) checa sobreposição/ordem das N
    janelas antes de chamar a RPC.
  - **UI**: aba Horários da agenda (`AgendaClient.tsx`) com até 3 janelas por dia e
    selects de antecedência (15 min–24 h) e horizonte (7–90 dias); o
    `BookingWizard` público passou a gerar os próximos dias a partir do horizonte
    real do tenant em vez do fixo de 14 dias.
  - **Bug corrigido durante o trabalho** (revisão pós-implementação): salvar a aba
    Horários publicava silenciosamente edições em aberto da aba Perfil (payload
    montado do estado local compartilhado entre abas) e mascarava sucesso parcial
    (horários gravados + config de regras falhando aparecia como "erro ao salvar
    horários"). Corrigido: payload dos campos fora do escopo da aba Horários vem
    sempre do perfil persistido (prop), nunca do estado local editável; erro parcial
    tem mensagem própria.
  - Verificado em 2026-07-16: `pnpm test` 65/65, `pnpm build` verde.
- **2026-07-15 — P0.6 (adendo): 4ª vertical `/para/barbeiro` + verticais
  reescritas como o "filme" da landing principal**: crítica do owner acatada — as
  verticais reusavam o figurino da principal (ruído, relógios gigantes) mas tinham
  virado lista de features; a principal é um dia narrado no relógio. Reescrita:
  hero abre pelo resultado ("Caiu mais um corte na agenda. Você nem viu.") com
  relógio gigante e eyebrow de cena (`abertura.hora`/`eyebrow`), a dor tem horário
  próprio por nicho (`dor.hora` substitui o 09:12 fixo) e os benefícios viraram
  momentos cronológicos do dia (`beneficios[].hora` substitui a numeração 01/02/03).
  Campos `nome`/`rotulo` removidos (não usados); `expressaoClientes` tirou do
  template a única frase com gênero fixo. Barbeiro: copy no masculino, mirando quem
  atende sozinho; estúdio com várias cadeiras fica explicitamente fora em "o que
  não tenta ser" (multi-profissional segue em "Depois de evidência"). De quebra:
  `.prettierrc` criado (4 espaços, aspas simples, sem ponto e vírgula) — o hook
  PostToolUse rodava Prettier sem config e reformatava arquivos inteiros para o
  estilo default, poluindo diffs.
  - **3 verticais SSG** em `src/app/para/[nicho]/page.tsx` (template
    compartilhado; `dynamicParams = false` + `generateStaticParams` — as três
    rotas saem estáticas no build, sem Clerk/Supabase no caminho):
    `/para/designer-de-sobrancelhas`, `/para/lash-designer`, `/para/manicure`.
    Copy centralizada em `src/lib/nichos.ts` (dor com conversa de WhatsApp,
    3 benefícios, serviços da demo, 4 respostas de "como funciona", SEO por
    nicho).
  - **Identidade visual oficial preservada**: mesmos tokens/gradiente/Poppins,
    reuso de LuzAmbiente/LogoMarca/DiaNoite/SeletorTema/Reveal;
    `DemoAgendamento` parametrizado por props opcionais com defaults idênticos
    ao comportamento anterior (landing principal inalterada — verificado no
    diff).
  - **Honestidade da copy** (verificada na revisão): zero promessas de
    multi-profissional, pagamento pelo app, app instalável ou WhatsApp API
    oficial (a seção "o que não tenta ser" nega explicitamente); WhatsApp
    automático sempre citado como plano Pro; planos exclusivamente de
    `src/lib/planos.ts`; sem prova social inventada (adicionar quando houver
    pilotos). Achado importante da revisão corrigido: a vertical lash prometia
    "remarcação sozinha" (fluxo que o cliente final não tem) — reescrita
    honesta ("escolhe o novo horário pelo link e você libera o antigo no
    painel").
  - **SEO/OG**: `generateMetadata` por nicho com canonical; corrigido o merge
    raso do Next que descartava a og:image do layout raiz (previews no
    WhatsApp sairiam sem imagem) — openGraph completo + twitter card por
    vertical.
  - `/para(.*)` no `isPublicRoute` do proxy; `landing_viewed` com
    `nicho: <slug>` (P0.5) nas verticais.
  - Verificado em 2026-07-13: `pnpm build` com as 3 rotas ● SSG, `pnpm test`
    32/32, lint sem erros novos. Resíduo aceito: `PRECO_ORIGINAL` (preço cheio
    riscado) duplicado entre a landing principal e o template vertical — ao
    encerrar o desconto de lançamento, editar os dois arquivos.
- **2026-07-13 — P0.5: eventos de funil do produto (PostHog Cloud)**:
  - **Arquitetura** (opção 3 registrada): `posthog-js` no client (init lazy,
    `capture_pageview/autocapture: false`, `person_profiles: 'identified_only'`,
    **session replay e surveys travados como desativados no código**) e, no
    servidor, `fetch` direto ao endpoint de ingestão dentro de `after()` com
    fallback fire-and-forget (sem posthog-node) — `src/lib/analytics/{client,
    server,tenant}.ts` + ilhas em `src/components/analytics/`. **Sem
    `NEXT_PUBLIC_POSTHOG_KEY` tudo é no-op** (build/dev/produção funcionam sem
    credenciais; até os counts de "primeiro serviço/horários" são pulados).
  - **Privacidade**: nenhum evento leva nome/telefone/e-mail/conteúdo de
    mensagem (varredura completa na revisão); `tenant_id` só como
    `sha256(ANALYTICS_TENANT_SALT + orgId)` truncado a 16 chars — o `org_...`
    cru nunca chega ao PostHog.
  - **Eventos**: `landing_viewed` (com `nicho`), `signup_started`,
    `signup_completed` (conta <24h + flag localStorage), `first_service_created`,
    `schedule_configured`, `booking_link_copied`, `booking_started`,
    `booking_completed`, `booking_failed` (motivos `slot_indisponivel`/
    `erro_interno`), `plans_viewed`, `upgrade_clicked`, `whatsapp_connect_started`,
    `whatsapp_connected` e espelhos agregados `whatsapp_confirmation_sent/failed`,
    `whatsapp_reminder_scheduled/sent/failed` — **`disparos_whatsapp` no Postgres
    segue sendo a fonte da verdade operacional**. UTM inicial preservada até o
    cadastro pelo próprio posthog-js (verificado no código da lib).
  - **Taxonomia documentada** em `docs/08-ANALYTICS_E_FUNIL.md`, incluindo
    eventos deliberadamente fora de escopo e a **limitação conhecida** do funil
    B2C (started sai do browser anônimo, completed do servidor com tenant hash —
    conversão B2C medida em agregado via Trends, não em insight de Funnel).
  - Verificado em 2026-07-13: `pnpm test` 32/32, `pnpm build` verde **sem** as
    envs de PostHog, lint sem erros novos nos 21+ arquivos tocados, invariantes
    preservadas (mensageria nunca lança; HTTP 500 de retry do webhook intacto;
    polling do WhatsApp intocado). Revisão independente sem críticos; o
    importante (distinct_id do funil B2C) foi documentado e os menores baratos
    corrigidos (gate dos counts, `booking_failed` no erro de INSERT, replay
    desativado no código).
  - **Passos do owner no deploy**: criar projeto PostHog Cloud e configurar
    `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` (se não-US) e
    `ANALYTICS_TENANT_SALT` (fixo — trocá-lo depois desconecta o histórico).
    Atenção: a ingestão do PostHog responde 200 mesmo com key inválida — validar
    vendo eventos chegarem no projeto.
- **2026-07-13 — P0.3: agendamento manual pelo profissional**:
  - **CTA + modal mobile-first**: botão "+ agendar" no cabeçalho do dashboard
    (desktop) e FAB no mobile (só com setup completo) abrem
    `src/app/dashboard/NovoAgendamentoModal.tsx` — bottom-sheet no mobile, modal
    centrado no desktop; 4 passos: cliente → serviço → data/horário → resumo.
    Acessibilidade: `role="dialog"`, `aria-modal`, Escape, foco inicial e focus
    trap no Tab; fechamento bloqueado durante o save.
  - **Cliente**: busca com debounce de 300 ms (`listarClientes` em
    `src/app/actions/clientes.ts` — nome `ilike` ou telefone, termo sanitizado
    contra injeção na sintaxe `or()` do PostgREST, limit 20) **ou** cadastro
    inline (nome + WhatsApp com máscara). Telefone repetido no tenant reaproveita
    o registro existente (mesma semântica do booking público).
  - **Criação** (`criarAgendamentoManual`): valida serviço ativo do tenant,
    horário futuro, revalida o slot na **mesma engine** (`obterSlotsDisponiveis`,
    comparação de string exata) — conflito bloqueado sem override ("Este horário
    conflita com outro agendamento…" e o modal volta à grade com refetch);
    INSERT nasce `confirmado`; `revalidatePath('/dashboard')`.
  - **WhatsApp opcional**: checkbox no resumo APENAS com plano Pro + instância
    conectada (`podeEnviarWhatsapp` calculado no servidor); o disparo usa o bloco
    extraído para `src/lib/notificacoes-agendamento.ts`
    (`dispararNotificacoesAgendamento`, compartilhado byte a byte com o booking
    público, que nunca lança — mensageria jamais quebra agendamento).
  - **Remarcação** (`remarcarAgendamento`): botão "remarcar" nas linhas ativas
    abre o modal direto na grade; revalida com `ignorarAgendamentoId` (não colide
    consigo mesmo); bloqueia cancelado/concluído; **realinha o lembrete** —
    cancela o job antigo no QStash (motivo `remarcacao`) e agenda um novo para o
    horário remarcado (tudo em try/catch: falha de mensageria nunca desfaz a
    remarcação).
  - Extras da revisão independente aplicados: validação de `dateStr` em
    `obterSlotsDashboard`, rejeição de horário no passado (cobre régua stale na
    virada da meia-noite), refetch da grade após conflito.
  - Verificado em 2026-07-13: `pnpm test` (32/32), `pnpm build` verde, lint dos
    arquivos tocados sem erros novos; revisão independente sem achados críticos
    (o único importante — lembrete órfão na remarcação — foi corrigido).
  - Resíduos conhecidos (não bloqueiam): "editar" limita-se a remarcar horário
    (trocar serviço/cliente de um agendamento existente não foi pedido); sem
    toast de sucesso além do fechamento do modal + agenda atualizada; proteção
    atômica contra requisições simultâneas segue no item pré-lançamento (a action
    manual adotará a mesma proteção quando existir).
- **2026-07-13 — P0.4: fuso horário IANA por tenant**:
  - Coluna `timezone text NOT NULL DEFAULT 'America/Sao_Paulo'` em `perfis_empresas`
    (migration `20260713165137`, validada com `db reset` local; DEFAULT cobre linhas
    e o auto-provisionamento existentes). Configurável na aba Perfil do dashboard
    (select com 10 fusos brasileiros), validado no servidor com
    `Intl.supportedValuesOf('timeZone')` — sem gating de plano.
  - Novo helper único `src/lib/timezone.ts` (isomórfico, sem lib nova — Intl):
    `diaLocal`, `horaLocal`, `diaDaSemana` (independente do fuso do servidor),
    `somarDias`, `instanteDe` (parede local→UTC por ponto fixo), `limitesDoDia`
    (fim **exclusivo** — corrige a janela perdida de 23:59:59–00:00),
    `formatarDataHora(Longa)`, `TIMEZONES_BRASIL`.
  - Offsets fixos `-03:00`/suposições de São Paulo eliminados de: booking-engine
    (limites, ISO do slot, dia da semana), public-booking (dia local + formatação
    WhatsApp), listarAgendamentos (filtros gte/lt), dashboard (page + client),
    BookingWizard (14 dias + formatação final), webhook de lembrete. O fuso vem
    SEMPRE do banco no servidor; rótulos de calendário renderizados em UTC-noon
    (independem do navegador). Carimbo do log de disparos fica no fuso do leitor
    (decisão documentada no código).
  - Engine ganhou `ignorarAgendamentoId` (`.neq`) — preparo da remarcação do P0.3.
  - Testes: 18 novos (32 no total) cobrindo São Paulo E Campo Grande (limites de
    dia, round-trip, slots distintos por fuso, ocupação correta) + **teste de
    regressão byte a byte**: para America/Sao_Paulo os slots são idênticos ao
    formato antigo (a validação do booking público compara string exata).
  - Revisão independente sem achados críticos/importantes. Observação registrada:
    se o Brasil readotar horário de verão com transição à meia-noite, `instanteDe`
    pode desviar ~1h no dia da virada (horário-parede inexistente) — considerar no
    item de double-booking atômico (pré-lançamento), que reutilizará os limites.
- **2026-07-13 — P0.1: confiabilidade funcional do WhatsApp (Evolution/Baileys)**:
  - **Estados reais**: CHECK de `whatsapp_configs.status` ampliado para 6 estados
    (`desconectado|conectando|aguardando_qrcode|conectado|instavel|falha`) + coluna
    `ultima_verificacao_em`; `sincronizarStatusWhatsApp()` consulta o
    `connectionState` do gateway no SSR da página (timeout 4 s, nunca derruba a
    página; `open` sempre promove a `conectado`; gateway inalcançável rebaixa
    `conectado` → `instavel`; 404 → `falha`). Sessão caída não fica mais
    "conectado" para sempre.
  - **Recuperação sem suporte**: `reiniciarConexaoWhatsApp()` (delete + recriação,
    reaproveitando a recuperação de instância órfã); QR com timeout de pareamento
    (~2 min) e corte após 3 falhas de polling, com regeneração pela UI.
  - **Mensagem de teste** pelo dashboard com feedback inline e registro no log.
  - **Log de disparos**: tabela append-only `disparos_whatsapp` (RLS granular
    SELECT/INSERT só `authenticated` do tenant, sem `anon`, sem UPDATE/DELETE;
    sem conteúdo de mensagem/telefone) registrando confirmação enviada/falha,
    lembrete agendado (com `qstash_message_id`)/executado/falha/ignorado (com
    motivo)/cancelado e testes; painel "Últimos disparos" no dashboard com motivos
    em pt-BR. Suporte responde "por que a mensagem não saiu?" olhando o painel.
  - **Cancelamento de lembrete**: ao cancelar agendamento, o job é removido do
    QStash (`DELETE /v2/messages/{id}`, 404 = sucesso brando); webhook re-checa o
    status como 2ª defesa. Invariante preservada: nenhuma falha de mensageria
    (inclusive do INSERT de log) quebra criação/cancelamento de agendamento.
  - **Segurança**: `instance_token` deixou de ser serializado para o client
    (selects com colunas explícitas; action morta `obterWhatsappConfig` removida).
  - **Testes/tooling**: Vitest instalado (`pnpm test`, 14 testes de
    `whatsapp-helper` com fetch stubado) + `scripts/mock-evolution.mjs` (gateway
    falso para exercitar os 6 estados da UI). Runner decidido: **Vitest** (fecha a
    decisão pendente da seção "Qualidade e testes").
  - **Migrations**: `20260713162247_whatsapp_estados_e_log_disparos` (gerada via
    `db diff` e limpa de GRANT/REVOKE espúrios do migra) e
    `20260709152648_funcao_rls_auto_enable` (manual e idempotente — o event
    trigger `ensure_rls` não é capturado pelo diff e faltava no baseline, o que
    quebrava o shadow database; corrigido o replay completo, validado com
    `supabase db reset` local). **Aplicadas no projeto hospedado (dev) em
    2026-07-14 via MCP**, com o histórico de migrations reparado para espelhar o
    repo (a baseline antiga `20260703190800_initial_schema_rebuild` foi
    substituída no registro pela `20260708233747_baseline_schema_inicial`) —
    `supabase db push` futuro não encontrará divergência. Validado no hospedado:
    CHECK de 6 estados, `disparos_whatsapp` com RLS (INSERT como anon
    rejeitado), coluna `timezone` com DEFAULT preenchida, advisor de segurança
    zerado.
  - **`/debug/qstash` removida** (função substituída pelo painel + log).
    Passo manual pendente do owner: apagar a env `DEBUG_QSTASH` dos ambientes.
  - Verificado em 2026-07-13: `pnpm test` (14/14), `pnpm build` verde, lint dos
    arquivos tocados sem erros novos, INSERT como `anon` em `disparos_whatsapp`
    rejeitado no banco local, revisão independente sem achados críticos (o único
    achado importante — vazamento do `instance_token` ao client — foi corrigido).
- **2026-07-13 — P0.2: booking público quebrado para visitante anônimo**: as
  escritas operacionais de `criarAgendamentoPublico` (lookup/criação de cliente e
  criação do agendamento) passaram a usar `createAdminClient()` **somente no
  servidor e somente após validação completa** na Server Action: tenant existente,
  serviço **ativo e do mesmo tenant** (fecha também o agendamento cruzado por
  `servicoId` de outro tenant), `dataHora` válida e slot livre recalculado pela
  engine com a duração real do serviço. Nenhum SELECT `anon` foi aberto em
  `clientes`; cliente é reaproveitado por `tenant_id` + telefone normalizado;
  falha de WhatsApp continua não desfazendo o agendamento. Verificação integrada
  em 2026-07-13 (action real invocada sem sessão contra o banco): cliente novo
  anônimo agenda; segundo booking com o mesmo telefone reutiliza o mesmo
  `cliente_id` (sem duplicata); serviço de outro tenant, slot ocupado, tenant
  inexistente e `dataHora` inválida são rejeitados. As políticas de INSERT `anon`
  seguem existindo — a remoção (hardening da Data API) permanece no item de
  integridade pré-lançamento. Arquivos: `src/app/actions/public-booking.ts`,
  `src/lib/supabase/admin.ts`, `docs/05-PRODUTO_E_VISAO.md`.
- **2026-07-11 — QR Code preso em "aguardando pareamento"**: a Evolution API atual
  retorna o estado aninhado (`{ instance: { state: 'open' } }`) no
  `GET /instance/connect`; `obterQrCodeWhatsApp` só checava o nível raiz e lançava
  "QR Code não retornado pelo gateway" com a instância já conectada. Corrigido em
  `src/app/actions/whatsapp.ts` (checagem de `dataRes.instance?.state`).
- **2026-07-11 — Fluxo do lembrete QStash validado de ponta a ponta** (publicação,
  entrega no webhook de produção, autenticação por secret na query string preservada
  pelo QStash). Sem `APP_URL` no ambiente local, o webhook default é o de produção —
  funciona porque dev e prod compartilham Supabase/Evolution/signing key; **não**
  apontar `APP_URL` para localhost (QStash não alcança).
- **2026-07-11 — Tons Tailwind inválidos** (`zinc-150/250/650` em WhatsappClient,
  AgendaClient, book page e BookingWizard): não existem mais no código (verificado
  via `rg`).
- **2026-07-10 — Disparo de WhatsApp no fluxo público**: a fase de disparo
  (confirmação em `public-booking.ts` e webhook de lembrete) usa o cliente
  privilegiado `createAdminClient()` (`src/lib/supabase/admin.ts`, secret key via env
  `SUPABASE_SECRET_KEY` — lembrar de configurá-la no Railway/produção). Nenhuma
  política anon foi criada em `whatsapp_configs` (o `instance_token` continua
  inacessível sem login). O resíduo (exposição anônima de `assinaturas`) está
  registrado no item de integridade (pré-lançamento).

## 📌 Decisões registradas (não são pendências)

- **Produto agora, lançamento depois** (2026-07-12): hardening, concorrência atômica,
  rate limiting, LGPD e operação de produção são obrigatórios **antes do lançamento
  público**, mas o próximo trabalho é o produto (P0/P1). A confiabilidade funcional do
  WhatsApp é a exceção de prioridade máxima.
- **Override de conflito no agendamento manual**: por padrão não existe; se um dia
  existir, será consciente, confirmado e auditável (ver P0.3).
- **WhatsApp obrigatório no booking** como recorte atual; e-mail sai da promessa até
  ser implementado (ver P1.8 — pendente de alinhar código/docs/copy).
- Botão "Criar Primeiro Serviço" (empty state) sem guard de limite: **won't fix** —
  inatingível com os limites atuais e a Server Action barra de qualquer forma.
- Exposição anônima de `tenant_id/plano/status` de `assinaturas`: aceita
  conscientemente (necessária para a defesa do WhatsApp no fluxo público) **até** o
  redesenho do acesso público (item de integridade, pré-lançamento).

### ~~🔴 Enumeração de `org_id` por conta autenticada~~ — ✅ Fechada (plano 01-08, 2026-07-22)

Descoberto ao auditar `pg_policies` depois do fechamento da Data API. **Não foi introduzido
pela Phase 1 — é pré-existente e ficou visível quando o vetor anônimo fechou.** O relato
abaixo descreve o estado que existia até 2026-07-22; o fechamento está no fim do bloco.

`servicos` e `horarios_funcionamento` têm DUAS policies de SELECT aplicáveis a
`authenticated`, ambas `PERMISSIVE`:

| policy | roles | expressão |
|---|---|---|
| Permitir SELECT público para todos | `{anon,authenticated}` | `ativo = true` |
| Permitir SELECT do próprio tenant para autenticados | `{authenticated}` | `tenant_id = org_id` |

O Postgres soma policies permissivas por `OR`. Logo, para qualquer conta autenticada a
visibilidade efetiva é `(ativo = true) OR (tenant_id = meu)` — ou seja, **todos os serviços
e horários ativos de todos os tenants, com a coluna `tenant_id` junto**. Como o cadastro no
Clerk é self-service, qualquer pessoa cria uma conta grátis e enumera o `org_id` de todos os
profissionais da plataforma.

A Phase 1 fechou o vetor `anon` por completo (as duas policies são inertes para essa role,
que perdeu todo privilégio). O vetor `authenticated` continua aberto — no mesmo dado que a
fase existia para proteger. Arranha o espírito de SEG-02, não a letra, que fala em "chave
publicável".

**Conserto**: `drop policy` puro nas duas, sem substituta. A D-07 (nunca dropar sem recriar)
**não se aplica**: a policy `1b` tenant-scoped já cobre as linhas do próprio tenant nas duas
tabelas, inclusive as inativas (`supabase/schemas/02_servicos.sql:27`,
`03_horarios_funcionamento.sql:29`). A leitura pública já roda com cliente privilegiado desde
o plano 01-02, então nada do booking depende delas.

**Por que não foi feito no plano 01-05**: o executor não tinha acesso ao banco, e a
migration ficaria no repo sem ser aplicada — 18 arquivos contra 17 versions no ledger. Trocar
risco documentado por drift real no pipeline, no plano que fecha a fase, seria mau negócio.

✅ **Feito no plano 01-08 (2026-07-22), pelo executor que tinha o MCP do Supabase.** As duas
policies foram removidas pela migration
`20260722145948_fecha_policies_residuais_servicos_horarios.sql`, aplicada com o `INSERT` no
ledger na mesma transação. O dano foi medido antes e depois, não deduzido: sob
`set local role authenticated` com o claim `org_id` de um tenant real e um tenant vizinho
descartável criado dentro da transação revertida, `tenants_distintos_visiveis` caiu de **2
para 1**. Detalhes e as demais evidências na seção "Superfície remanescente depois do
hardening da Phase 1", acima.

