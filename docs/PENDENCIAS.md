# Pendências e prioridades

Lista viva de tarefas identificadas. Revisar antes de cada nova etapa de
desenvolvimento — e obrigatoriamente antes de implementar o checkout Asaas.

Última atualização: 2026-07-11 (reorganização por prioridade de produto; estado de
cada item verificado no código e no banco nesta data).

---

## 🧭 Direção atual do owner — Produto antes do lançamento

Registrado em 2026-07-11. Vale até o owner revisar:

- A prioridade atual é tornar o **núcleo do produto correto, confiável, simples e
  agradável de usar**. Nada de "parecer um SaaS completo".
- O produto **ainda não será lançado publicamente** e **não haverá tráfego pago** agora.
- Infraestrutura de escala fica adiada até existir uso real que a justifique.
- **Segurança, integridade multi-tenant, prevenção de conflitos de agenda e
  confiabilidade do WhatsApp NÃO são "infra para depois"** — são requisitos do produto
  correto e têm prioridade imediata (seção P0).
- Toda decisão nova deve preservar a simplicidade do VamoAgendar: se existir uma forma
  simples e pragmática, escolha-a.

Ordem de leitura: **P0** (agora) → **P1** (em seguida) → **P2** (antes do lançamento)
→ **Depois de evidência** (com gatilho observável) → congelados/resolvidos.

---

## 🔴 P0 — Produto correto e confiável (prioridade máxima)

### 1. Experiência e confiabilidade do WhatsApp (Evolution/Baileys)

O WhatsApp é a função mais crítica do SaaS e o principal motivo percebido para pagar
o plano Pro. Tratar como prioridade máxima de produto.

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

**Resultado esperado (confiabilidade funcional, necessária agora):**

- Status verdadeiro da conexão: sincronizar o estado real da Evolution API ao carregar
  a página de WhatsApp (e/ou antes de exibir "conectado"), não só durante o pareamento.
- Estados visuais claros no dashboard: desconectado, conectando, aguardando QR,
  conectado, instável e falha — com "tentar novamente" que não deixa configuração
  quebrada (instância órfã no gateway, linha inconsistente no banco).
- Envio de mensagem de teste pelo dashboard, com confirmação visível de sucesso/falha.
- Falhas de mensageria **nunca** cancelam ou quebram o agendamento (regra já vigente —
  preservar).
- Comportamento coerente quando a sessão desconectar (banco reflete, dashboard avisa).

**Resultado esperado (observabilidade mínima, necessária para pilotos):**

- Registro mínimo do resultado de cada disparo (confirmação e lembrete): quando,
  para qual agendamento, sucesso/falha e motivo. Pode ser uma tabela simples
  (`disparos_whatsapp` ou similar) — o suficiente para o suporte diagnosticar.
- Distinção clara entre: confirmação enviada, lembrete agendado, lembrete executado,
  falha (com motivo).

**Fora do escopo imediato (registrar, não fazer):**

- Migração para WhatsApp Cloud API oficial (ou outro provedor) — evolução condicionada
  à validação do canal WhatsApp com pilotos reais e ao crescimento (risco de bloqueio
  do Baileys aumenta com volume). A integração Evolution/Baileys atual deve ficar
  confiável o suficiente para **pilotos controlados**; não otimizar além disso.

**Critérios de conclusão:** profissional consegue ver o estado real da conexão,
testar o envio, recuperar-se de falha sem suporte; suporte consegue explicar qualquer
mensagem não entregue olhando o registro de disparos.

**Arquivos:** `src/app/actions/whatsapp.ts`, `src/app/dashboard/whatsapp/WhatsappClient.tsx`,
`src/lib/whatsapp-helper.ts`, `src/app/api/webhooks/lembrete/route.ts`,
`src/app/actions/public-booking.ts`, `supabase/schemas/05_whatsapp_configs.sql`
(+ novo schema para log de disparos), `docs/06-MENSAGERIA_E_WHATSAPP.md`.

**Dependências/decisões:** definir os novos valores de `status` (exige migration do
CHECK); decidir formato do log de disparos (tabela dedicada é o caminho simples).

### 2. Integridade e pertencimento multi-tenant (inclui hardening da Data API)

Garantir que **todos os dados usados numa operação pertencem ao mesmo tenant** e que
a role `anon` (= a internet inteira) só alcança o mínimo necessário.

**Estado atual verificado (2026-07-11, código + `pg_policies` no banco):**

- 🐞 **BUG CRÍTICO — booking público quebrado para visitante realmente anônimo:**
  `clientes` não tem política de SELECT para `anon`, mas `criarAgendamentoPublico`
  faz `insert().select('id')` (RETURNING exige visibilidade de SELECT — armadilha já
  documentada em `docs/02`). Testado no banco: o INSERT sem RETURNING passa, com
  RETURNING falha com violação de RLS. **Todo agendamento de visitante anônimo com
  cliente novo falha** ("Erro ao processar dados de contato"). O fluxo só funcionou
  nos testes porque o profissional estava logado no mesmo navegador/tenant.
  Efeito colateral do mesmo buraco: o lookup de cliente por telefone retorna sempre
  vazio como `anon` → reaproveitamento de cliente nunca acontece e cada booking
  criaria cliente duplicado.
- `criarAgendamentoPublico` busca o serviço **apenas por `id`, sem `tenant_id`**
  (`public-booking.ts:43-48`) → é possível criar agendamento no tenant A referenciando
  serviço do tenant B (preço/duração de outro estabelecimento).
- As FKs de `agendamentos` validam `cliente_id` e `servico_id` individualmente, mas
  **não o pertencimento conjunto** ao mesmo `tenant_id`.
- Políticas de INSERT `anon` em `agendamentos` e `clientes` exigem apenas
  `tenant_id IS NOT NULL` → **qualquer visitante escreve direto pela Data API**,
  contornando a Server Action (engine de disponibilidade, validações, gating de plano),
  inclusive forjando `status` e `data_hora` arbitrários.
- SELECT `anon` em `agendamentos` é `USING (true)` com todas as colunas — qualquer um
  lista a agenda completa de todos os tenants, incluindo `cliente_id`. A engine só
  precisa de `tenant_id, data_hora, status, servico_id` → GRANT por coluna (mesmo
  padrão já usado em `assinaturas`).
- `excecoes_agenda` SELECT `anon` `USING (true)` expõe `motivo` dos bloqueios de todos
  os tenants (a engine só precisa de `tenant_id, data, hora_inicio, hora_fim,
  bloqueado`).
- `assinaturas`: falta `revoke insert, update, delete ... from anon, authenticated`
  (RLS já bloqueia escrita; o revoke fecha a segunda camada). A exposição anônima de
  `tenant_id/plano/status` continua necessária ao slug efetivo do booking
  (`obterPlanoVigentePublico`) — aceita conscientemente até este item redesenhar o
  acesso público.
- `perfis_empresas`: avaliar esconder `telefone_contato` de `anon` por GRANT de coluna,
  se a página pública não o exibir.
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
- Booking anônimo real **funciona** (corrigir o bug do RETURNING como parte do
  redesenho, não com um remendo que abra SELECT público de `clientes`).

**Direção recomendada (documentada, não implementada):** o booking público continua
passando exclusivamente pela Server Action confiável; as escritas operacionais do
fluxo público passam a usar **acesso privilegiado somente no servidor**
(`createAdminClient()`, já existente para a mensageria) **após validação completa**
na action — e as políticas de INSERT `anon` em `agendamentos`/`clientes` são
removidas. Isso resolve de uma vez: o bug do RETURNING, o contorno pela Data API e o
reaproveitamento de clientes. As leituras públicas (serviços, slots) continuam via
`anon` com RLS estreito.

**Critérios de conclusão:** agendamento anônimo em janela anônima funciona; tentativa
com `servicoId` de outro tenant é rejeitada; `INSERT` direto na Data API como `anon`
é rejeitado; agenda de um tenant não é listável publicamente com colunas sensíveis;
testes cobrindo esses casos.

**Arquivos:** `src/app/actions/public-booking.ts`, `src/lib/supabase/admin.ts`,
`supabase/schemas/06_clientes.sql`, `07_agendamentos.sql`, `04_excecoes_agenda.sql`,
`08_assinaturas.sql`, `01_perfis_empresas.sql`, `docs/05-PRODUTO_E_VISAO.md` (o
exemplo conceitual de INSERT público precisa acompanhar a decisão).

**Dependências/decisões:** confirmar a direção "escrita operacional via admin client
no servidor" (muda o exemplo de política pública do docs/05); refazer a auditoria da
Data API depois (ver P2/billing).

### 3. Prevenção real de double-booking

O recálculo da engine antes do INSERT (`public-booking.ts` passo 3) **não elimina a
corrida** entre duas requisições simultâneas: ambas veem o slot livre e ambas inserem.

**Estado atual verificado:** nenhuma constraint de exclusão/lock no banco
(`07_agendamentos.sql`); a janela de corrida vai da leitura da engine ao INSERT.
Além disso, o INSERT `anon` direto pela Data API ignora a engine por completo (ver
item 2). Detalhe correlato: quando o join `servicos(duracao_minutos)` não retorna
(serviço desativado é invisível para `anon`), a engine assume 30 min — a janela
ocupada pode ficar menor que a real (`booking-engine.ts:143`).

**Resultado esperado:**

- Proteção **atômica no banco** (ex.: exclusion constraint com `tstzrange` sobre
  `tenant_id` + intervalo `[data_hora, data_hora + duração)` para status ativos) ou
  operação transacional equivalente — levando em conta a **duração do serviço**.
- Ao perder a corrida, o segundo cliente recebe a mensagem amigável já existente
  ("Este horário já foi preenchido...") — não um erro genérico.
- Duração da ocupação correta mesmo para serviços desativados.

**Critério de conclusão (objetivo):** duas requisições concorrentes para o mesmo
intervalo **nunca** resultam em dois agendamentos ativos sobrepostos — comprovado por
teste de concorrência. Isto é correção do produto, não melhoria de escala.

**Arquivos:** `supabase/schemas/07_agendamentos.sql` (+ migration via `db diff`),
`src/app/actions/public-booking.ts`, `src/lib/booking-engine.ts`.

**Dependências/decisões:** exclusion constraint precisa da duração do serviço no
momento do INSERT (coluna `duracao_minutos` desnormalizada no agendamento ou lookup
no trigger) — decidir a forma mais simples; interação com o item 5 (agendamento
manual usa a mesma proteção).

### 4. Fuso horário por tenant

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
  padrão razoável (`America/Sao_Paulo`) no provisionamento/onboarding.
- Slots calculados no fuso do estabelecimento; timestamps gravados em UTC (como hoje);
  exibição sempre no fuso do estabelecimento (dashboard e página pública); lembretes
  calculados no mesmo fuso.
- Funções **centralizadas** de conversão (um helper único, ex.: `src/lib/timezone.ts`)
  substituindo os offsets espalhados — nenhuma regra importante baseada em offset fixo.
- Testes cobrindo ao menos São Paulo e Campo Grande (limites do dia, slots, lembrete).

Evitar complexidade: um campo por tenant + helpers centralizados bastam. Não suportar
fuso por profissional/serviço.

**Arquivos:** os listados acima + `supabase/schemas/01_perfis_empresas.sql`,
`src/app/actions/perfis-empresas.ts` (onboarding), novo `src/lib/timezone.ts`.

**Dependências/decisões:** nenhuma externa; fazer junto ou logo após o item 3 (os
limites de dia participam da proteção de conflito).

### 5. Agendamento manual pelo profissional

Não existe hoje **nenhum** caminho para o profissional registrar um horário combinado
por WhatsApp, Instagram, ligação ou presencialmente — o slot continua aparecendo livre
no link público. Sem isso o VamoAgendar não é a fonte real da agenda.

**Estado atual verificado:** `src/app/actions/agendamentos.ts` só tem
`listarAgendamentos` e `atualizarStatusAgendamento`; não há CTA "Novo agendamento" no
dashboard; não existe edição/remarcação (apenas mudança de status).

**Resultado esperado (mesma qualidade visual e mobile-first do resto do produto):**

- CTA claro de "Novo agendamento" na agenda do dashboard.
- Escolha rápida de cliente existente **ou** criação inline (nome + WhatsApp).
- Seleção de serviço → data/horário usando a **mesma engine de disponibilidade**
  (`obterSlotsDisponiveis`), com alerta claro de conflito.
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
`src/app/dashboard/agenda/AgendaClient.tsx` (ou novo componente), `src/lib/booking-engine.ts`
(reuso), aproveitando a proteção do item 3.

**Dependências/decisões:** itens 2 e 3 primeiro (a action manual nasce sobre a mesma
validação de pertencimento e proteção atômica).

### 6. Proteção contra agendamentos falsos e abuso

Preservar a Fricção Zero para o cliente final, mas impedir que um script preencha toda
a agenda de um profissional.

**Estado atual verificado:** nenhuma proteção existe (sem rate limit, honeypot ou
CAPTCHA; `rg` não encontra nada). Pior: o INSERT direto pela Data API (item 2)
contorna qualquer proteção que fosse colocada na action — **este item depende do
item 2**.

**Resultado esperado:**

- Rate limit por IP, por telefone e por tenant na `criarAgendamentoPublico`
  (janela curta; Upstash Ratelimit é o caminho natural — Upstash já está na stack).
- Honeypot barato no formulário público (campo invisível).
- Logs mínimos de rejeição (para saber se há abuso real e calibrar limites).
- Sanitização/validação no servidor (já existe para telefone; manter e não afrouxar).
- CAPTCHA **apenas como fallback** se abuso real aparecer — não adicionar agora.
- Impossível contornar escrevendo direto na Data API (garantido pelo item 2).

Não transformar o booking num fluxo cheio de validações visíveis — as proteções devem
ser invisíveis para o cliente legítimo.

**Critérios de conclusão:** script simples repetindo POSTs não consegue lotar uma
agenda; cliente legítimo não percebe nenhuma fricção nova.

**Arquivos:** `src/app/actions/public-booking.ts`, possivelmente `src/proxy.ts`
(rate limit de rota), `src/app/book/[slug]/BookingWizard.tsx` (honeypot).

**Dependências/decisões:** item 2 primeiro; escolher limites iniciais (ex.: N
tentativas por IP/telefone por hora) e revisá-los nos pilotos.

---

## 🟡 P1 — Experiência, ativação e aprendizado

### 7. Eventos de funil do produto

**O que são:** eventos de funil são registros das etapas importantes que visitantes e
profissionais percorrem dentro do produto. Servem para descobrir **onde as pessoas
abandonam** (ex.: muitos criam conta mas ninguém conclui o setup; muitos abrem o link
público mas poucos confirmam agendamento) e para medir se mudanças melhoram ou pioram
a conversão. Sem isso, as decisões de produto nos pilotos serão no escuro.

**Estado atual verificado:** não existe nenhuma instrumentação (nenhuma lib de
analytics no `package.json`, nenhum evento no código).

**Funil principal (referência):** visitou a landing → iniciou cadastro → concluiu
cadastro → perfil provisionado → primeiro serviço → horários configurados → setup
completo → link copiado/compartilhado → cliente iniciou booking → cliente concluiu
booking → primeiro agendamento real recebido → confirmação WhatsApp enviada →
lembrete executado → visualizou plano → intenção de upgrade → (futuro) pagamento.

**Taxonomia inicial proposta** (revisar contra o produto antes de implementar; nomes
não são definitivos; remover redundâncias — ex.: `service_selected`/`slot_selected`
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
identificadores técnicos só quando necessários para suporte, timestamp.
**Nunca** enviar nome, telefone, e-mail ou conteúdo de mensagem para analytics.

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
aquisição/ativação fica numa ferramenta gerenciada, sem dashboard próprio agora.

**Critérios de conclusão:** conversão calculável entre as etapas principais; ponto de
abandono identificável; falhas importantes têm motivo; landing de origem e UTM
preservados até o cadastro; eventos não duplicam a fonte da verdade operacional;
existe documentação curta da taxonomia (neste repo).

**Dependências/decisões:** escolher a ferramenta gerenciada; definir pseudonimização
do `tenant_id`.

### 8. Landings específicas por nicho

Direção de produto desejada pelo owner (já existia conceitualmente na versão
anterior). Entra **depois** da confiabilidade do núcleo (P0).

**Estado atual verificado:** existe apenas a landing única (`src/app/page.tsx`, com
`DemoAgendamento`); nenhuma rota `/para/*`.

**Resultado esperado:**

- Estrutura reutilizável (template) para landings verticais, mantendo a identidade
  visual oficial do VamoAgendar.
- Começar com **2–3 nichos reais**, não dezenas: ex. `/para/designer-de-sobrancelhas`,
  `/para/lash-designer`, `/para/manicure` (eventualmente `/para/barbeiro-autonomo`).
- Cada landing adapta: a dor/conversa repetitiva do nicho, exemplos e serviços da
  demo, benefícios, prova social e CTA — e responde: como o cliente agenda, como o
  profissional configura, como o WhatsApp ajuda, e **o que o sistema não tenta ser**.
- Não prometer multi-profissional enquanto não existir; uma única fonte de verdade
  para planos (`src/lib/planos.ts`).
- Nicho e UTMs rastreados nos eventos de funil (item 7).
- CTA coerente com o estágio: produto ainda não lançado → as landings podem ser
  preparadas e revisadas **sem receber tráfego** agora.

**Dependências/decisões:** escolher os 2–3 nichos iniciais; item 7 para medir.

### 9. Consistência WhatsApp ou e-mail (booking público)

`docs/05` diz "WhatsApp **ou** e-mail (um dos dois)"; a UI do wizard aceita qualquer
um dos dois (`BookingWizard.tsx:149`); mas a Server Action **exige** WhatsApp
(`public-booking.ts:31-38` — quem informa só e-mail passa na UI e recebe erro da
action) e envio por e-mail **não existe** (Resend não é usado em lugar nenhum do
código).

**Decisão pragmática recomendada (registrada):** como o WhatsApp é o núcleo do
produto, **WhatsApp obrigatório** no primeiro recorte; remover a promessa de e-mail
da UI e do docs/05 enquanto o fluxo não existir; manter Resend/e-mail como evolução
posterior, salvo evidência de necessidade nos pilotos.

**Critério de conclusão:** código, docs, validação e copy comunicam a mesma regra
(hoje há três comportamentos diferentes).

**Arquivos:** `src/app/book/[slug]/BookingWizard.tsx`, `src/app/actions/public-booking.ts`,
`docs/05-PRODUTO_E_VISAO.md`.

### 10. Configurações de agenda necessárias para uso real

Sem inflar o MVP — classificação por urgência:

- **Fortes candidatas a "agora" (validar nos primeiros pilotos):**
  - **Mais de uma janela por dia** (ex.: 08h–12h e 14h–18h). Estado atual: impossível —
    `UNIQUE (tenant_id, dia_semana)` em `horarios_funcionamento` limita a 1 janela/dia.
    Impacta schema, `agenda.ts`, UI da agenda e a engine (que usa `maybeSingle()`).
  - **Antecedência mínima configurável.** Estado atual: margem fixa de 15 min
    (`booking-engine.ts:170`). Profissionais reais costumam querer 1–24 h.
- **Avaliar junto aos primeiros pilotos:** horizonte máximo de agendamento
  configurável (hoje fixo em 14 dias no `BookingWizard.tsx:72`).
- **Depende do nicho:** buffer entre atendimentos (verificar necessidade antes).
- **Depois de evidência:** cancelamento/reagendamento pelo próprio cliente (hoje
  inexistente; exige decisão sobre link seguro sem login — manter Fricção Zero).

### 11. Melhorias baratas já apontadas em revisões

- `cache()` (React) em `obterAssinaturaVigente` para deduplicar a busca por request
  (layout + page consultam duas vezes na rota `/dashboard/plano`). *(pendente,
  verificado 2026-07-11)*
- Trocar `<a href="/dashboard/plano">` por `<Link>` nos CTAs de upgrade
  (`ServicosClient.tsx:151` e `AgendaClient.tsx:310`; o `<a>` do banner de
  inadimplência está correto — URL externa). *(pendente)*
- Docs: substituir o neologismo "infraudável" (docs/07 e spec) por "impossível de
  fraudar"; ajustar a referência "ver seção seguinte" na seção 4 do docs/07.
  *(pendente)*
- Dashboard (checklist de onboarding): as duas queries de contagem em
  `src/app/dashboard/page.tsx` não checam `error` (falha silenciosa vira "não
  configurado") e rodam sequencialmente (paralelizar com `Promise.all`). *(pendente)*

### 12. Configurações pendentes no painel do Clerk (conferir se já aplicadas)

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

### 13. Cor e logo do tenant na página pública de booking

Estrutura pronta (colunas `cor_marca`/`logo_url`, gating e UI do dashboard já
existem) — falta o consumo em `/book/[slug]`. É a entrega visível do valor dos planos
Plus/Pro; esforço baixo. (Ver docs/07 "Recursos preparados mas não implementados".)

---

## 🟠 P2 — Preparação para lançamento público (registrado, deliberadamente adiado)

Nada aqui bloqueia os pilotos controlados. Se alguma parte mínima afetar os pilotos,
destacar só essa parte (indicado abaixo quando existe).

- **Checkout Asaas + webhooks completos de cobrança** (`/api/webhooks/asaas`):
  roadmap técnico completo em `docs/07`. Pré-requisito registrado: **refazer a
  auditoria da Data API** (P0 item 2 concluído — os campos sensíveis de `assinaturas`
  passam a ter dados reais).
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
- Política de privacidade e termos finais; revisão final de LGPD; fluxo de
  exclusão/exportação de dados.
- Observabilidade de produção (error tracking, alertas). *Parte mínima para pilotos:
  o log de disparos do P0.1 já cobre o essencial de mensageria.*
- Backups e recuperação; testes de carga.
- Domínio definitivo, e-mails de produção e configurações finais (lembrete herdado:
  configurar `SUPABASE_SECRET_KEY` e demais envs no Railway/produção).
- Painel/ferramentas de suporte.
- **Migração para WhatsApp Cloud API oficial ou outro provedor** (ver P0.1 — só com
  validação do canal + crescimento).
- Preparação para tráfego pago (só quando o owner decidir lançar).

---

## 🔵 Depois de evidência (cada item com gatilho observável)

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
- **Cancelamento/reagendamento autônomo pelo cliente final** (ver item 10).
  **Gatilho:** volume relevante de cancelamentos chegando por WhatsApp nos pilotos.
- **Aplicativo nativo** — gatilho: retenção comprovada no mobile web + pedido
  recorrente.
- **Controle financeiro / estoque / marketplace / pagamentos dos serviços / CRM
  avançado / relatórios avançados / IA no WhatsApp / programa de fidelidade /
  permissões granulares / integrações adicionais** — todos fora da visão atual
  (docs/05: o produto não tenta ser ERP). Gatilho comum: clientes pagantes reais
  condicionando a permanência a um desses itens.
- **Arquitetura para grande escala** (filas além do QStash, cache, réplicas) —
  gatilho: uso real com sinais de saturação medidos.

---

## 🧊 Congelado — evoluções do sistema de planos

O sistema de planos existente (Gratuito/Plus/Pro, gating, inadimplência) **permanece
como está** — não remover nem reescrever. Congeladas até validação com clientes
reais: regras sofisticadas de downgrade, novos planos, novos gates, personalização
comercial, billing e tratamento de inadimplência além do banner atual.

---

## 🧪 Qualidade e testes (requisito transversal)

Não há framework de testes configurado no repositório. Adotar testes como requisito
**proporcional**, nas áreas de maior risco — comportamento crítico, não cobertura:

- Engine de disponibilidade (`booking-engine.ts`) — slots, exceções, colisões.
- Fuso horário (P0.4) — limites de dia em pelo menos SP e Campo Grande.
- Pertencimento multi-tenant e políticas RLS (P0.2) — IDs cruzados rejeitados.
- Criação concorrente (P0.3) — corrida nunca gera sobreposição.
- Agendamento manual (P0.5).
- Confirmação e lembrete (P0.1) — inclusive falha sem quebrar o agendamento.
- Regras de plano que afetam envio (gating Pro nos disparos).

Decisão pendente: escolher o runner (Vitest é o candidato natural na stack) quando o
primeiro item P0 com testes for implementado.

---

## ✅ Itens resolvidos (histórico)

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
  registrado no P0 item 2.

## 📌 Decisões registradas (não são pendências)

- **Override de conflito no agendamento manual**: por padrão não existe; se um dia
  existir, será consciente, confirmado e auditável (ver P0.5).
- **WhatsApp obrigatório no booking** como recorte atual; e-mail sai da promessa até
  ser implementado (ver P1.9 — pendente de alinhar código/docs/copy).
- Botão "Criar Primeiro Serviço" (empty state) sem guard de limite: **won't fix** —
  inatingível com os limites atuais e a Server Action barra de qualquer forma.
- Exposição anônima de `tenant_id/plano/status` de `assinaturas`: aceita
  conscientemente (necessária para a defesa do WhatsApp no fluxo público) **até** o
  redesenho do acesso público (P0 item 2).
