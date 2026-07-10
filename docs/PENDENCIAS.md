# Pendências e melhorias futuras

Lista viva de tarefas identificadas mas **adiadas de propósito** (decisão do owner).
Revisar antes de cada nova etapa de desenvolvimento — e obrigatoriamente antes de
implementar o checkout Asaas.

Última atualização: 2026-07-10.

---

## 🔴 Prioridade alta

### 1. Corrigir o disparo de WhatsApp no fluxo público (bug pré-existente da Etapa 5)

Achado da revisão final do sistema de planos: `whatsapp_configs` **não tem política de
SELECT para `anon`**, e o fluxo público de booking + o webhook de lembrete rodam como
`anon`. Resultado: a busca da config retorna vazio e **a confirmação e o lembrete nunca
disparam para um visitante real** — só funcionam quando o próprio dono (logado no
próprio tenant) testa. Há um segundo sintoma: um usuário logado agendando na página de
**outro** tenant também quebra a decisão de disparo (a leitura de `assinaturas` como
`authenticated` filtra para a org dele → cai em "gratuito").

**Correção certa**: a fase de disparo (busca de `whatsapp_configs` + plano do tenant)
deve usar um cliente privilegiado server-side (chave service role, nunca exposta) ou uma
função `SECURITY DEFINER` que retorne apenas o necessário. **Não** criar política de
SELECT anon em `whatsapp_configs` (exporia o `instance_token` — qualquer um enviaria
mensagens como o tenant).

**Bônus**: com o cliente privilegiado, a exposição anônima de `assinaturas` (política
anon + GRANT por coluna) deixa de ser necessária e pode ser removida.

### 2. Hardening da Data API (o que a role `anon` enxerga)

Contexto: a Data API do Supabase é pública por design e a segurança é o RLS + GRANTs —
o modelo está correto, mas a auditoria de 2026-07-09 encontrou superfícies largas
demais. Tratar `anon` como "a internet inteira":

- **`agendamentos`** (o mais importante): política de SELECT anon é `USING (true)` com
  todas as colunas — qualquer um lista a agenda completa de todos os tenants, incluindo
  `cliente_id`. A engine de disponibilidade só precisa de
  `tenant_id, data_hora, status, servico_id` → aplicar GRANT por coluna para `anon`
  (mesmo padrão já usado em `assinaturas`).
- **`assinaturas`**: `revoke insert, update, delete on public.assinaturas from anon,
  authenticated;` — o RLS já bloqueia escrita (não há políticas), mas o revoke fecha a
  segunda camada (recomendação da revisão final).
- **`perfis_empresas`**: avaliar esconder `telefone_contato` de `anon` por GRANT de
  coluna, se a página pública de booking não o exibir.
- **`excecoes_agenda`**: SELECT anon `USING (true)` expõe `motivo` dos bloqueios de
  todos os tenants. Avaliar GRANT por coluna (a engine só precisa de
  `tenant_id, data, hora_inicio, hora_fim, bloqueado`).
- Lembretes externos: **Asaas e Clerk nunca acessam a Data API** (Asaas chama nosso
  webhook; Clerk só emite JWTs) — nada precisa ser aberto para eles.

---

## 🟡 Prioridade média

### 3. Regra "WhatsApp OU e-mail" no booking público (herdada do antigo HANDOFF)

`docs/05-PRODUTO_E_VISAO.md` define que o cliente final informa WhatsApp **ou** e-mail
(um dos dois obrigatório). O código em `src/app/actions/public-booking.ts` exige
WhatsApp sempre. Alinhar o código à visão (aceitar só e-mail) ou revisar a visão.

### 4. Melhorias baratas apontadas nas revisões do sistema de planos

- `cache()` (React) em `obterAssinaturaVigente` para deduplicar a busca por request
  (layout + page consultam duas vezes na rota `/dashboard/plano`).
- Trocar `<a href="/dashboard/plano">` por `<Link>` nos CTAs de upgrade
  (`ServicosClient.tsx` e `AgendaClient.tsx`; o `<a>` do banner de inadimplência está
  correto — a URL da fatura é externa).
- Docs: substituir o neologismo "infraudável" (docs/07 e spec) por "impossível de
  fraudar"; ajustar a referência "ver seção seguinte" na seção 4 do docs/07.
- Dashboard (checklist de onboarding, revisão de 2026-07-10): as duas queries de
  contagem em `src/app/dashboard/page.tsx` não checam `error` (falha silenciosa vira
  "não configurado" — lado seguro, mas mascarável) e rodam sequencialmente
  (paralelizar com `Promise.all`).
- Tons Tailwind inválidos pré-existentes (classes ignoradas → fundo ausente no dark
  mode, mesmo bug do `zinc-850` já corrigido): `zinc-150`, `zinc-250`, `zinc-650` em
  `WhatsappClient.tsx:296`, `AgendaClient.tsx:391,473`, `book/[slug]/page.tsx:50`,
  `BookingWizard.tsx:318,379`.

### 5. Configurações pendentes no painel do Clerk (conferir se já aplicadas)

- **Organization creation limit = 1** (MVP: 1 usuário = 1 org; subir quando lançar
  multi-filiais).
- **Create first organization automatically** ligado.
- **Default membership limit = 1** (bloqueia convites estruturalmente) + ajustar o
  limite da(s) org(s) já existente(s), criadas antes da configuração.
- **Roles & Permissions**: remover `org:sys_memberships:read/manage` e
  `org:sys_domains:read/manage` da role de criador → aba "Members"/domínios some dos
  componentes do Clerk.
- Código: `hidePersonal` no `<OrganizationSwitcher>` do layout do dashboard (oferecido,
  nunca aplicado).

---

## 🟢 Quando o billing real (Asaas) chegar

O roadmap técnico completo está em `docs/07-PLANOS_E_MONETIZACAO.md`. Além dele:

- **Antes de ativar o checkout**: refazer a auditoria da Data API (itens 1–2 acima
  precisam estar concluídos — os campos sensíveis de `assinaturas` passam a ter dados
  reais).
- Trocar `ON DELETE CASCADE` da FK `assinaturas.tenant_id` por `RESTRICT` (hoje um
  tenant que apaga o próprio perfil destrói a linha de assinatura/vínculo Asaas).
- Limite de serviços: considerar trigger no banco contra corrida (duas criações
  simultâneas podem passar do limite — hoje é checagem app-layer por design).
- Retry/regeneração no slug aleatório em caso de colisão (keyspace 36^8 — risco
  desprezível, mas a mensagem de erro atual confunde).
- Definir o **período de carência** da inadimplência (hoje: mantém benefícios + banner,
  sem prazo).

## 🔵 Funcionalidades planejadas (estrutura já pronta)

- Aplicar `cor_marca` e `logo_url` na página pública `/book/[slug]` (colunas, gating e
  UI do dashboard já existem; falta o consumo no booking).
- Checkout Asaas + webhook `/api/webhooks/asaas` (ver docs/07).
- Multi-filiais: subir o limite de criação de organizações no Clerk (zero refactor — o
  switcher vira seletor de filial).
- **Multi-profissional (pós-MVP, decisão do owner em 2026-07-10)**: NÃO são contas ou
  membros separados — a conta do tenant cadastra os profissionais disponíveis, cada um
  podendo ter horários e/ou serviços próprios; o cliente final escolhe o profissional
  (ou "qualquer um") no fluxo público. Impacta: tabela nova (`profissionais`),
  `horarios_funcionamento`/`servicos` opcionalmente vinculados a profissional, engine
  de disponibilidade por profissional e um passo extra no BookingWizard.

## ✅ Decisões registradas (não são pendências)

- Botão "Criar Primeiro Serviço" (empty state) sem guard de limite: **won't fix** —
  inatingível com os limites atuais e a Server Action barra de qualquer forma.
- Exposição anônima de `tenant_id/plano/status` de `assinaturas`: aceita
  conscientemente (necessária para a defesa do WhatsApp no fluxo público) **até** o
  item 1 ser implementado.
