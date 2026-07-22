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

### Superfície remanescente depois do hardening da Phase 1 (registrado, não fechado)

Duas policies de SELECT sobreviveram à Phase 1 **por escopo, não por descuido**. Auditadas
em `pg_policies` depois do plano 01-04:

| Tabela | Policy | Cmd | Roles | Expressão |
|---|---|---|---|---|
| `servicos` | "Permitir SELECT público para todos" | SELECT | `{anon,authenticated}` | `(ativo = true)` |
| `horarios_funcionamento` | "Permitir SELECT público para todos" | SELECT | `{anon,authenticated}` | `(ativo = true)` |

O plano 01-04 mirava a decisão **D-07**: substituir as policies compartilhadas que **não
tinham par autenticado** (dropar sem recriar quebraria o dashboard em silêncio). Estas
duas **têm** par autenticado, então ficaram legitimamente fora daquele escopo.

**Risco 1 — leitura cross-tenant por usuário autenticado (vale hoje).** A expressão é
`ativo = true`, sem cláusula de tenant. Qualquer profissional logado consegue ler os
serviços e os horários ativos de **todos os outros tenants** da plataforma via Data API.
Não expõe cliente, agendamento nem telefone — expõe catálogo e agenda de funcionamento
da concorrência. É **pré-existente**, não foi introduzido nem agravado pela Phase 1.

**Risco 2 — a policy morta é uma armadilha carregada (vale no futuro).** Para a role
`anon` estas duas policies são inertes *hoje*: sem privilégio, uma policy nunca chega a
ser avaliada. Mas o cabeçalho da própria migration `20260722060000_fecha_data_api_para_anon.sql`
argumenta que o portão precisa ser fechado no privilégio justamente porque "uma policy
criada por engano em qualquer fase futura reabre tudo". **Aqui a policy já existe,
pré-carregada.** Um único `GRANT ... TO anon` futuro nessas tabelas — inclusive
acidental, ou copiado de um snippet — reexpõe toda linha com `ativo = true` a quem
tiver a chave publicável. **Nenhuma policy nova precisa ser escrita para o buraco
reabrir.**

**Decisão da Phase 1 (plano 01-05, 2026-07-22): registrar, não fechar aqui.** O
fechamento é trivial em SQL (dois `DROP POLICY`, ou substituição por versões
tenant-scoped `TO authenticated`), mas o executor do 01-05 **não tinha acesso ao banco**
— nem MCP do Supabase, nem `psql`. Escrever a migration sem poder aplicá-la deixaria o
repositório com 18 arquivos contra 17 versions no ledger, exatamente o desalinhamento
que quebra qualquer `db diff` futuro e que esta fase gastou dois planos aprendendo a
evitar. Trocar um risco latente e conhecido por drift real no pipeline é um mau negócio.

**A D-07 NÃO se aplica aqui — o `DROP` é seguro, e isso está verificado.** A regra
"nenhuma policy compartilhada é dropada sem substituta" existe porque dropar sem recriar
deixa o dashboard com tela vazia e sem erro. Nestas duas tabelas a substituta **já
existe**: a policy `1b`, "Permitir SELECT do próprio tenant para autenticados",
`TO authenticated USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'))`, em
`supabase/schemas/02_servicos.sql:27` e `03_horarios_funcionamento.sql:29`. Ela cobre as
linhas do próprio tenant **inclusive as inativas** (é o que permite reativar um serviço e
o que faz o `RETURNING` do `.select()` funcionar). Policies são permissivas e se somam por
`OR`: removendo a compartilhada, sobra exatamente o escopo desejado. **Não escrever
substituta nova — seria uma segunda policy redundante fazendo o que a `1b` já faz.**

**Gatilho e forma de fechar** (sessão com acesso a banco, ou início da Phase 2):

1. `DROP POLICY "Permitir SELECT público para todos"` nas duas tabelas. Sem `CREATE`
   substituto, pelo motivo acima.
2. Editar `supabase/schemas/02_servicos.sql` e `03_horarios_funcionamento.sql`.
3. Gerar por `supabase db diff` — e **revisar a saída antes de commitar**: forçado a
   diffar privilégio, o migra emite o contrário do desejado (ver `docs/03`).
4. Aplicar com `execute_sql` + `INSERT` manual no ledger com a version do arquivo.
   **`apply_migration` está proibido** — não preserva a version.

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

- [ ] **Wizard completo de `/book/[slug]`** — serviço → data/hora → nome + WhatsApp →
      confirmar → "Horário confirmado!", com o agendamento caindo na agenda do dashboard.
      Nenhuma etapa, campo ou atraso novo (Fricção Zero). *Agravado pelo plano 01-02*,
      que trocou o identificador que as duas Server Actions públicas recebem
      (`tenantId` → `slug`). Provado por automação até aqui: apenas que a página responde
      200 e que o payload monta com dados reais.
- [ ] **Recuperação de double-booking** — duas abas no mesmo slot; a segunda deve voltar
      à etapa de data/hora com o aviso âmbar e a grade refeita, nunca uma caixa vermelha
      estática no formulário de contato.
- [ ] **Dashboard sob as policies tenant-scoped novas, tela a tela** — agenda carrega os
      agendamentos; agendamento manual salva **e a linha volta** (o `RETURNING` depende de
      passar na policy de SELECT); bloqueio/exceção salva; aba Perfil salva; serviços
      listam. Auditoria de `pg_policies` já confirmou que todas as tabelas operacionais
      têm SELECT/INSERT/UPDATE/DELETE `TO authenticated` com
      `tenant_id = (SELECT auth.jwt() ->> 'org_id')`, o que torna a falha improvável —
      mas "improvável" não é "verificado", e o sintoma é tela vazia sem erro.
- [ ] **Personalização por plano** — comparar um tenant Pro (cor/logo/capa aparecem) com
      um gratuito (não aparecem). Com o RLS bypassado no caminho público, a sanitização
      por plano deixou de ser defesa em profundidade e virou **defesa única**.
- [ ] **Lembrete do QStash ponta a ponta** — criar agendamento com lembrete próximo e
      confirmar que a mensagem chega. Um `401` no log ("Assinatura QStash inválida")
      indica mismatch de URL atrás de proxy; plano B: montar a URL de `APP_URL` depois
      que a fila drenar.
- [ ] **Caixa de erro de slots** renderizando a copy nova do plano 01-02 ("Não foi
      possível carregar os horários. Tente de novo."). Teste barato: chamar
      `obterSlotsPublicos('slug-inexistente', …)`. A copy está no código
      (`src/app/actions/public-booking.ts:373`) e compila; nunca foi vista na tela.
- [ ] **Backstops visuais com dado extremo** — 20+ serviços ativos na lista da etapa;
      `horizonte_maximo_dias = 30` alongando a fileira de datas; nome de serviço, nome de
      cliente, `nome_estabelecimento`, descrição e endereço longos no resumo, na tela de
      sucesso e no painel de marca.

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
  deploy é dado como bem-sucedido e o produto fica no ar com 100% de erro. *Gatilho:*
  ao configurar o deploy de produção, **exigir healthcheck por HTTP** (um path que
  precise devolver 2xx), nunca por liveness de processo. Alternativa, se o owner
  preferir a falha dura: fazer o `register()` chamar `process.exit(1)` depois de
  lançar — **decisão de arquitetura de boot, não tocada pela Phase 1 de propósito**.

  ✅ **O critério 5 do ROADMAP continua satisfeito na substância**, e por duas camadas
  independentes: (a) a aplicação não serve nada sem as chaves — o webhook responde 500
  e nunca alcança o handler; (b) `verificarAssinaturaQstash`
  (`src/lib/qstash-assinatura.ts:42`) **lança** se qualquer das duas chaves estiver
  ausente, então não existe caminho permissivo mesmo que a camada (a) fosse contornada.
  Não há default inseguro em lugar nenhum. O que falha é a *forma* de "a aplicação não
  sobe", não a garantia de segurança.
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
  - Webhook de lembrete (achado da revisão final de 2026-07-14, pré-existente):
    o secret trafega em query string e o fallback `'secret-key'` vale nos dois
    lados quando `QSTASH_CURRENT_SIGNING_KEY` não está setada — em produção a
    env é OBRIGATÓRIA; o ideal é migrar para verificação da assinatura real do
    QStash (header `Upstash-Signature`).
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

Não há framework de testes configurado no repositório. Adotar testes como requisito
**proporcional**, nas áreas de maior risco — comportamento crítico, não cobertura:

- Junto do trabalho de produto (P0): engine de disponibilidade (`booking-engine.ts`)
  — slots, exceções, colisões; fuso horário (P0.4) — limites de dia em pelo menos SP
  e Campo Grande; agendamento manual (P0.3); confirmação e lembrete (P0.1) —
  inclusive falha sem quebrar o agendamento; regras de plano que afetam envio
  (gating Pro nos disparos).
- Antes do lançamento: pertencimento multi-tenant e políticas RLS — IDs cruzados
  rejeitados; criação concorrente — corrida nunca gera sobreposição.

Decisão pendente: escolher o runner (Vitest é o candidato natural na stack) quando o
primeiro item P0 com testes for implementado.

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

### 🔴 Enumeração de `org_id` por conta autenticada (achado da verificação da Phase 1)

Descoberto ao auditar `pg_policies` depois do fechamento da Data API. **Não foi introduzido
pela Phase 1 — é pré-existente e ficou visível quando o vetor anônimo fechou.**

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

**Por que não foi feito na Phase 1**: o executor do 01-05 não tinha acesso ao banco, e a
migration ficaria no repo sem ser aplicada — 18 arquivos contra 17 versions no ledger. Trocar
risco documentado por drift real no pipeline, no plano que fecha a fase, seria mau negócio.

