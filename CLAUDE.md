@AGENTS.md
# CLAUDE.md

## O produto

**VamoAgendar**: SaaS B2B2C de agendamento online para profissionais independentes e pequenas empresas no Brasil. Regra de ouro (**Fricção Zero**): o cliente final (B2C) **nunca** faz login, cadastro ou validação de e-mail/OTP para agendar — acessa `/book/[slug]`, escolhe serviço → data/hora → informa nome + WhatsApp (e/ou e-mail) → confirma. O profissional (B2B) autentica via Clerk e gerencia tudo em `/dashboard`. Monetização: assinatura do profissional via Asaas — o VamoAgendar **não** processa o pagamento do serviço prestado ao cliente final.

## Comandos

```bash
pnpm dev          # servidor de desenvolvimento
pnpm build        # build de produção
pnpm lint         # eslint
supabase stop && supabase db diff -f <nome_da_migracao>   # gerar migration a partir dos schemas declarativos
```

Gerenciador de pacotes: **pnpm**. Não há framework de testes configurado.

## Definition of Done

Uma tarefa só está concluída quando:

1. `pnpm lint` e `pnpm build` passam (sem testes automatizados, o build é o gate obrigatório — rode e mostre a saída).
2. Mudança de schema: arquivo em `supabase/schemas/` + migration gerada via `supabase db diff` (nunca escrita à mão) + RLS granular por ação + `COMMENT ON` nas tabelas/políticas novas.
3. Mutações novas: Server Action com `const { orgId } = await auth()` validado (B2B) ou revalidação rigorosa na action (B2C).
4. UI nova: mobile-first verificado e domínio de negócio nomeado em português.
5. Nenhuma tecnologia banida introduzida (ver Stack abaixo).
6. `docs/PENDENCIAS.md` atualizado se a mudança criar ou adiar tarefas.

## Stack oficial (e proibições)

Next.js 16 (App Router) + React 19 + Tailwind CSS v4 + Clerk (auth/multi-tenant via Organizations) + Supabase (`@supabase/ssr`, SQL puro, **sem ORM**) + Asaas (pagamentos) + Upstash QStash (filas/lembretes) + Evolution API (WhatsApp) + Resend (e-mails) + PostHog (analytics, no-op sem credenciais).

**Tecnologias descartadas no pivô — nunca instalar ou referenciar**: Prisma/Drizzle, better-auth, Mercado Pago. Qualquer resquício delas em código legado deve ser refatorado para a stack oficial.

**Next.js 16 tem breaking changes** em relação ao conhecimento de treinamento (ex.: `src/proxy.ts` substitui `middleware.ts`). Consulte `node_modules/next/dist/docs/` antes de usar APIs do framework.

## Arquitetura essencial

### Multi-tenancy: Clerk → JWT → RLS (sem sincronização de usuários)

Não há webhooks nem tabelas de usuários sincronizadas:

1. Clerk emite o session token padrão (integração **nativa** third-party auth — **nunca** use o fluxo depreciado `getToken({ template: 'supabase' })`) com o claim customizado `org_id` da organização ativa.
2. `src/lib/supabase/server.ts` (`createClient()`) injeta esse token no header `Authorization` **apenas quando há sessão**; sem sessão a requisição cai na role `anon`.
3. Toda tabela operacional tem `tenant_id text NOT NULL` com o `org_...` do Clerk (não é uuid; `perfis_empresas.tenant_id` é a PK referenciada pelas demais).
4. As políticas RLS comparam `tenant_id = (SELECT auth.jwt() ->> 'org_id')`.

Em Server Actions B2B, valide `const { orgId } = await auth()` antes de operar e passe `tenant_id: orgId` nas mutações. O fluxo B2C usa o mesmo `createClient()` sem sessão (role `anon`), com políticas públicas restritas + validação rigorosa na própria action (revalidação de slot contra double-booking, sanitização de telefone com `replace(/\D/g, '')`, reaproveitamento de cliente existente por telefone).

### Banco de dados: schema declarativo

- Toda alteração de schema é feita **apenas** em `.sql` de `supabase/schemas/` (ordem lexicográfica — numere para respeitar FKs). **Nunca** criar/editar `supabase/migrations/` manualmente; exceções (DML, alter policy etc.) em `docs/SUPABASE_DECLARATIVE-DATABASE-SCHEMA.md`.
- RLS **obrigatório em toda tabela**, políticas **granulares por ação** (`SELECT`/`INSERT`/`UPDATE`/`DELETE` — nunca `FOR ALL`) com role explícita (`TO authenticated` / `TO anon`).
- **Performance crítica**: sempre envolver `auth.jwt()` em subquery — `(SELECT auth.jwt() ->> 'org_id')` — para virar initPlan e evitar avaliação por linha.
- Nomenclatura pt-BR: tabelas no **plural**, colunas no **singular**, `snake_case`; FKs como `<tabela_singular>_id`. Adicionar `COMMENT ON TABLE/POLICY` com a intenção de negócio.

Tabelas: `perfis_empresas` (identidade + slug público + configs de agendamento: `antecedencia_minima_minutos`, `horizonte_maximo_dias`, `timezone`), `servicos`, `horarios_funcionamento` (dia_semana 0–6, **N janelas por dia**; semana salva de uma vez pela RPC atômica `substituir_horarios_funcionamento`, sobreposição validada na action via `src/lib/horarios.ts`), `excecoes_agenda` (feriados/bloqueios), `whatsapp_configs` (instância Evolution + templates), `clientes`, `agendamentos` (status: pendente/confirmado/concluido/cancelado), `assinaturas` (planos plus/pro; gratuito = sem linha vigente), `disparos_whatsapp` (log append-only de auditoria de mensageria — sem conteúdo nem telefone).

### Banco de dados (fase atual: DEV)

- O banco pode ser destruído e recriado livremente. Prefira schema limpo a migrations incrementais.
- Hard reset documentado em `docs/RESET_AMBIENTE_DEV.md` — use quando o schema divergir.
- Editar migrations existentes é permitido NESTA FASE (relaxamento temporário do "nunca editar `supabase/migrations/`" acima).
- Hook de imutabilidade de migrations existe pronto em `.claude/hooks/migrations-prod.md`; ativar no go-live (passos no checklist de `docs/PENDENCIAS.md`, seção "Obrigatório antes do lançamento público").
- ⚠️ Ao entrar em prod, esta seção será substituída por regras de imutabilidade.

### Engine de disponibilidade (`src/lib/booking-engine.ts`)

`obterSlotsDisponiveis()` calcula slots livres com **grade anti-buraco** (funções puras testáveis): N janelas de funcionamento do dia − exceções/bloqueios − agendamentos ativos = intervalos livres (`calcularIntervalosLivres`); em cada intervalo `[a, b)`, `gerarSlotsAntiBuraco` gera candidatos de 15 em 15 min ancorados em `a` + o candidato colado no fim (`b − duração`) e só oferece quem não cria sobra invendável: `gapAntes === 0 || gapAntes >= menorDuraçãoAtivaDoTenant || gapDepois === 0`. Regras de acesso via param opcional `regrasAcesso { antecedenciaMinutos, horizonteDias }`: os fluxos públicos passam as configs do tenant; o fluxo manual do dashboard **omite** (walk-in permitido, sem horizonte — decisão de produto). Antecedência é comparada por instante (funciona atravessando dias); horizonte é inclusivo (`hoje + N`). **Timezone**: banco em UTC, interpretação no fuso do tenant (`perfis_empresas.timezone`). A action pública re-executa a engine antes do INSERT e valida o horário por igualdade exata de `datetime` — prevenção de double-booking; mudar o formato da saída quebra esse contrato.

### Mensageria (Evolution API + QStash)

WhatsApp é **exclusivo do plano Pro** (gating nas actions + defesa nos pontos de disparo). Duas fases após criar agendamento:

1. Confirmação **síncrona**: `POST /message/sendText/{instanceName}` (header `apikey` = `instance_token` de `whatsapp_configs`).
2. Lembrete **assíncrono**: agendado no QStash (`Upstash-Not-Before`) invocando `/api/webhooks/lembrete` em `data_hora - tempo_lembrete_minutos`; o webhook valida o secret e checa se o agendamento não foi cancelado.

Se o WhatsApp do tenant estiver desconectado, o fluxo falha **silenciosamente** para o cliente (frictionless). Templates usam `{{cliente}}`, `{{empresa}}`, `{{data_hora}}`, `{{data}}`, `{{hora}}` (substituídas por `src/lib/whatsapp-helper.ts`). Números sempre `55` + DDD + número, sem formatação. Instância: `POST /instance/create` (apikey global; salvar `hash.apikey` como `instance_token`) e `GET /instance/connect/{instanceName}` para QR Code base64 (dashboard faz polling de 5 s).

## Frontend

- **Server Components por padrão**; `'use client'` só em ilhas de interatividade, o mais baixo possível na árvore. Padrão: `page.tsx` (Server, busca dados) + `<Nome>Client.tsx` (Client, interação).
- **Mutações exclusivamente via Server Actions** em `src/app/actions/` (agrupadas por domínio). **Não criar rotas REST** — única exceção: webhooks de terceiros (`src/app/api/webhooks/`).
- Tailwind v4, **mobile-first sempre**; paleta `zinc` com acentos (`emerald` = concluído, `red` = cancelado), transições suaves, pending com `useActionState`/`useFormStatus`.
- Rotas protegidas via `src/proxy.ts` (`clerkMiddleware` + `auth.protect()`); rotas públicas precisam constar em `isPublicRoute`.
- Domínio de negócio em **português** (`criarAgendamentoPublico`, `obterSlotsDisponiveis`).

## Documentação (`docs/`)

**Leitura obrigatória antes de qualquer mudança estrutural** no domínio correspondente:

| Arquivo | Conteúdo |
|---|---|
| `01-ARQUITETURA_E_STACK.md` | Arquitetura geral e stack oficial |
| `02-SUPABASE_CLERK_INTEGRATION.md` | Integração nativa Clerk↔Supabase (JWT, RLS) |
| `03-PADROES_DE_BANCO_DE_DADOS.md` | Schema declarativo, RLS, nomenclatura |
| `04-PADROES_DE_FRONTEND.md` | Padrões de UI (Next.js 16 + Tailwind v4) |
| `05-PRODUTO_E_VISAO.md` | Visão de produto e UX Fricção Zero |
| `06-MENSAGERIA_E_WHATSAPP.md` | Fluxos e payloads Evolution API + QStash |
| `07-PLANOS_E_MONETIZACAO.md` | Planos Gratuito/Plus/Pro e roadmap Asaas |
| `08-ANALYTICS_E_FUNIL.md` | Eventos de funil com PostHog |
| `PENDENCIAS.md` | Lista viva de tarefas e bugs — **consultar antes de cada nova etapa** |
| `ASSINATURAS.md` | Snippets para testes/simulação de assinaturas em dev |
| `RESET_AMBIENTE_DEV.md` | Procedimento de reset total do ambiente dev |
| `SUPABASE_DECLARATIVE-DATABASE-SCHEMA.md` | Exceções do fluxo de migrations declarativas |

`lixo/` — documentos descartados na limpeza de 2026-07-10. **Nunca use como referência** (contém tecnologias banidas e fluxos depreciados).

## Recursos auxiliares

- `.agents/skills/` contém skills de referência (Clerk, Supabase best practices, Upstash) — consulte ao trabalhar nessas integrações.
- Simplicidade é requisito: se existir uma forma simples e pragmática de resolver um fluxo, escolha-a. Não adicione camadas de abstração não pedidas.
