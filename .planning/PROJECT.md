# VamoAgendar

## What This Is

SaaS B2B2C de agendamento online para profissionais independentes e pequenas empresas
no Brasil (designers de sobrancelha, lash designers, manicures, barbeiros autônomos). O
profissional autentica via Clerk e gerencia agenda, serviços e horários no dashboard; o
cliente final acessa um link público (`/book/[slug]`), escolhe serviço → data/hora →
informa contato e confirma — **sem login, sem cadastro, sem validação de e-mail ou OTP**
(regra de Fricção Zero). Monetização por assinatura do profissional; o VamoAgendar não
processa o pagamento do serviço prestado ao cliente final.

O produto está construído e funcionando. O milestone atual é **abrir ao público**.

## Core Value

Um agendamento real, feito por um cliente final que nunca ouviu falar do VamoAgendar,
cair na agenda do profissional sem que nada quebre no caminho.

## Business Context

- **Customer**: profissional autônomo de beleza/estética que atende sozinho e hoje
  agenda por WhatsApp na mão
- **Revenue model**: assinatura mensal do profissional (Pro R$ 39,90 — R$ 29,90
  vitalício para quem assinar até 02/02/2027), cobrada via Asaas
- **Success metric**: agendamentos reais acontecendo (clientes finais usando os links
  dos profissionais) sem incidente de segurança, perda de dados ou double-booking
- **Strategy notes**: posicionamento e planos em `docs/07-PLANOS_E_MONETIZACAO.md`;
  visão de produto em `docs/05-PRODUTO_E_VISAO.md`

## Requirements

### Validated

<!-- Já construído, em funcionamento, verificado em 2026-07-20 (lint limpo, 65/65 testes, build verde). -->

- ✓ Cliente final agenda pelo link público sem login, cadastro ou OTP — existente
- ✓ Engine de disponibilidade anti-buraco: N janelas por dia, exceções, antecedência
  mínima e horizonte máximo por tenant, sem oferecer slot que deixe sobra invendável — existente
- ✓ Multi-tenancy Clerk → JWT → RLS sem sincronização de usuários — existente
- ✓ Profissional registra agendamento manual (walk-in) pela mesma engine, com
  remarcação e realinhamento do lembrete — existente
- ✓ WhatsApp Pro: confirmação síncrona + lembrete agendado no QStash, com estados reais
  de conexão e log append-only de disparos para suporte — existente
- ✓ Fuso horário IANA por tenant (banco em UTC, exibição no fuso do estabelecimento) — existente
- ✓ Personalização visual do tenant Pro (cor, logo, capa) com upload próprio e consumo
  sanitizado pelo plano vigente — existente
- ✓ Sistema de planos com gating por recurso e regra de inadimplência — existente
- ✓ Landing principal + 4 landings verticais por nicho (SSG) — existente
- ✓ Instrumentação de funil PostHog (no-op sem credenciais) — existente

### Active

<!-- Escopo do milestone "lançamento público". Hipóteses até o produto estar no ar. -->

**Segurança e integridade (bloqueante — nada abre sem isso)**

- [ ] Visitante anônimo não consegue escrever direto na Data API contornando a Server
      Action (hoje as políticas de INSERT `anon` em `agendamentos`/`clientes` exigem
      apenas `tenant_id IS NOT NULL`)
- [ ] Acesso `anon` reduzido ao mínimo por GRANT de coluna (hoje a agenda completa de
      todos os tenants é listável publicamente)
- [ ] `perfis_empresas` deixa de ser enumerável publicamente — hoje
      `SELECT TO anon USING (true)` sem GRANT por coluna
      (`supabase/schemas/01_perfis_empresas.sql:25`) entrega a lista completa de
      profissionais da plataforma, com `telefone_contato` e `org_id` do Clerk, numa
      única requisição com a chave publicável que vai no bundle
- [ ] Rotina própria de backup (`pg_dump`) e keep-alive do banco rodando **antes** da
      primeira migration deste milestone — única rede de proteção existente no plano Free
- [ ] Duas requisições simultâneas para o mesmo intervalo nunca geram dois agendamentos
      ativos sobrepostos (proteção atômica no banco, considerando a duração do serviço)
- [ ] Script repetindo POSTs não consegue lotar a agenda de um profissional (rate limit
      + honeypot), sem fricção visível para o cliente legítimo
- [ ] Webhook de lembrete valida a assinatura real do QStash (hoje: secret em query
      string com fallback inseguro)

**Monetização**

- [ ] Plano Plus deixa de existir no código e no banco
- [ ] Pro custa R$ 39,90, com R$ 29,90 travado vitaliciamente para quem assinar até
      02/02/2027 (elegibilidade por assinatura dentro da janela, não por cadastro)
- [ ] Profissional assina o Pro sozinho pelo dashboard e o acesso é liberado
      automaticamente (checkout Asaas + webhook), construído em sandbox
- [ ] Selo de desconto exibe o percentual real (39,90 → 29,90 = -25%, não -50%)

**Comunicação com o usuário**

- [ ] Profissional recebe e-mail de boas-vindas com o link de agendamento pronto
- [ ] Profissional recebe recibo do VamoAgendar quando a assinatura é confirmada
- [ ] Cliente final recebe confirmação do agendamento por e-mail
- [ ] Booking público aceita **e-mail OU WhatsApp** (pelo menos um dos dois)
- [ ] Cliente e profissional têm um canal de suporte visível (`contato@vamoagendar.com.br`)

**Obrigações de lançamento**

- [ ] Termos de uso e política de privacidade publicados e cobrindo o fluxo real
- [ ] Banco sai da fase "DEV livre": migrations imutáveis, hard reset proibido
- [ ] Dados de teste removidos do banco de produção (preservando um tenant do owner)
- [ ] Métricas de funil ativas em produção (PostHog configurado)
- [ ] Owner consegue coletar feedback dos primeiros usuários (conversa direta, funil e
      um ponto de feedback dentro do produto)
- [ ] Primeiros profissionais convidados e ativados com acompanhamento até o primeiro
      agendamento real

### Out of Scope

- **Cobrança em produção no go-live** — a conta Asaas só tem acesso sandbox; a virada de
  chave acontece quando a verificação aprovar, sem retrabalho de gating
- **Cobrança anual** — só mensal por ora; simplifica o checkout (uma subscription
  `MONTHLY`) e nada indica demanda
- **Construir um diferencial competitivo antes de lançar** — reconhecidamente o produto
  não tem hoje uma razão de escolha que o separe dos concorrentes; a decisão do owner é
  lançar e descobrir com os primeiros usuários em vez de apostar no escuro
- **Backup gerenciado e proteção contra pausa do banco** — Supabase permanece no plano
  Free; riscos aceitos conscientemente (ver Key Decisions)
- **Multi-profissional, multi-filial, cancelamento autônomo pelo cliente, app nativo,
  migração para WhatsApp Cloud API** — todos em "Depois de evidência" no
  `docs/PENDENCIAS.md`, cada um com gatilho observável
- **Tráfego pago** — divulgação orgânica e direta primeiro; mídia paga só depois que o
  funil mostrar conversão

## Context

**Estado técnico verificado em 2026-07-20:** `pnpm lint` limpo, `pnpm test` 65/65,
`pnpm build` verde. 14 migrations aplicadas, 10 schemas declarativos. Deploy no Railway
com o domínio `vamoagendar.com.br` ativo (serviços: app, Postgres, Redis, Evolution API).
Mapa completo do codebase em `.planning/codebase/`.

**Fonte de verdade do trabalho pendente:** `docs/PENDENCIAS.md` — lista viva mantida
desde o início do projeto, com a seção "Obrigatório antes do lançamento público" já
auditada contra código e banco (não é especulação; cada item cita arquivo e linha). O
roadmap deste milestone deriva dela. A partir daqui, `.planning/ROADMAP.md` passa a ser
a lista de trabalho e o `PENDENCIAS.md` deixa de ser atualizado.

**Divisão de papéis da documentação:** `docs/` é referência estável e prescritiva (como
o domínio funciona, como fazer certo — payloads da Evolution API, fluxo de migrations
declarativas, padrões de RLS); `.planning/` é o trabalho em curso. Os dois não se
sobrepõem exceto no `PENDENCIAS.md`, que está sendo migrado.

**Dívida conhecida herdada** (detalhada em `.planning/codebase/CONCERNS.md` e no
`docs/PENDENCIAS.md`): agendamento que atravessa a meia-noite não é subtraído dos slots
do dia seguinte; `WhatsappClient.tsx` fora do sistema de tokens visuais; FK
`assinaturas.tenant_id` com `ON DELETE CASCADE` onde deveria ser `RESTRICT`;
configurações do painel Clerk (limite de organizações, roles, `hidePersonal`) pendentes;
env `DEBUG_QSTASH` a remover dos ambientes.

**Peça mais frágil da stack:** a integração WhatsApp usa Evolution API/Baileys, que não é
a API oficial e cujo risco de bloqueio cresce com volume. Ela está funcional e observável
(log de disparos + painel de suporte), mas volume alto de divulgação nos primeiros dias
concentra risco exatamente ali.

## Constraints

- **Disponibilidade**: 4-5 horas por dia — o roadmap prioriza por valor decrescente para
  que qualquer corte caia sempre no item menos crítico
- **Timeline**: sem data fixa de lançamento — abre quando a barra de segurança e
  obrigações estiver satisfeita, não quando o calendário mandar
- **Dependência externa**: conta Asaas só tem sandbox; a aprovação para produção não
  depende de código e é o único item com prazo fora do controle do owner
- **Dependência externa**: verificação do domínio no Resend (SPF/DKIM) exige mudança de
  DNS e propagação — tarefa do owner, bloqueia os e-mails transacionais
- **Orçamento**: Supabase permanece no plano Free (sem custo mensal de banco)
- **Tech stack**: Next.js 16 + React 19 + Tailwind v4 + Clerk + Supabase (SQL puro, sem
  ORM) + Asaas + QStash + Evolution API + Resend + PostHog. Prisma/Drizzle, better-auth e
  Mercado Pago são proibidos (descartados no pivô)
- **Produto**: Fricção Zero é inegociável — nenhuma proteção nova pode adicionar fricção
  visível ao cliente final (sem CAPTCHA, sem login, sem OTP)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Lançar sem data fixa, ordenado por valor | O escopo escolhido (hardening + preço + checkout + e-mails + jurídico) não cabe em 4 dias úteis a 4-5h/dia; forçar a data cortaria o hardening, que é justamente o que protege o critério "sem quebrar" | — Pending |
| Sucesso = uso real + estabilidade, não receita | O owner quer validar que o produto funciona na mão de gente real antes de otimizar monetização | — Pending |
| Hardening antes do checkout | O `docs/07` registra que a auditoria da Data API precisa ser refeita antes do billing (os campos de `assinaturas` passam a ter dados reais); e lançar com INSERT anônimo aberto é o "quebrar" que o critério de sucesso proíbe | — Pending |
| Pro a R$ 39,90 com fundador vitalício de R$ 29,90 até 02/02/2027 | R$ 14,90 não paga a infra de uma instância Evolution dedicada por tenant, e preço baixo em SaaS de nicho atrai o cliente que mais dá trabalho e menos permanece; o vitalício recompensa quem entra cedo sem descontar para sempre | — Pending |
| Fundador é propriedade do tenant, não da assinatura | O Gratuito é a ausência de linha vigente e trocar de plano exige cancelar e recriar a linha; se a marca ficasse na assinatura, quem cancelasse e voltasse perderia o preço travado | — Pending |
| Plus extinto do código e do banco | Entrega só o slug personalizado, não justifica existir, e vender um plano que vai morrer cria atrito com os primeiros clientes; ninguém assina Plus hoje, então o custo da remoção é zero | — Pending |
| Checkout construído em sandbox | A conta Asaas de produção ainda não foi verificada; construir contra sandbox permite terminar o trabalho sem depender do prazo de terceiros, com virada de chave depois | — Pending |
| Supabase permanece no Free, riscos aceitos — com mitigação obrigatória antes de tocar schema | Decisão explícita do owner após ver os fatos: o plano Free não dá acesso a backup algum e pausa o projeto após uma semana de inatividade. **Avaliação corrigida pela pesquisa de armadilhas (2026-07-20):** a pausa preserva os dados (só é irrecuperável após 90 dias) e é mitigável a custo zero com um cron no QStash, que já está na stack; o risco caro é a retenção de backup zero, e ele não é futuro — é *deste* milestone, que altera schema com dados reais (dropar políticas, extinguir o Plus, limpar dados de teste, aplicar exclusion constraint). Consequência: `pg_dump` e keep-alive são as primeiras tarefas do roadmap, não itens de go-live | ⚠️ Revisit |
| Lançar sem diferencial competitivo construído | O owner constatou que nada no produto força a escolha frente aos concorrentes; construir diferencial em dias é inviável, e a alternativa escolhida é descobrir o que importa com os primeiros usuários reais | ⚠️ Revisit |
| Regra "e-mail OU WhatsApp" volta ao booking público | Com o envio por e-mail existindo, a promessa de `docs/05` deixa de ser falsa; hoje o WhatsApp é obrigatório porque nada enviava e-mail | — Pending |
| `docs/` permanece; só o `PENDENCIAS.md` migra para o `.planning/` | A sobreposição real com o GSD é só a lista de tarefas; os docs numerados são prescritivos (como fazer) e o mapa do codebase é descritivo (o que existe) — papéis diferentes. Mover `docs/` para `lixo/` quebraria 5 agentes customizados e 7 referências do CLAUDE.md, e o próprio CLAUDE.md instrui a nunca usar `lixo/` como referência | ✓ Good |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Business Context check — customer, revenue model, success metric still accurate?
4. Audit Out of Scope — reasons still valid?
5. Update Context with current state (users, feedback, metrics)

---
*Last updated: 2026-07-20 after initialization*
