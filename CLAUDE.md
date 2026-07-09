@AGENTS.md
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Layout do workspace

Este diretório é um workspace (vault Obsidian) com duas partes:

- `docs/` — Documentação canônica do projeto. **Leitura obrigatória antes de qualquer mudança estrutural**: `01-ARQUITETURA_E_STACK.md`, `02-SUPABASE_CLERK_INTEGRATION.md`, `03-PADROES_DE_BANCO_DE_DADOS.md`, `04-PADROES_DE_FRONTEND.md`, `05-PRODUTO_E_VISAO.md`, `06-MENSAGERIA_E_WHATSAPP.md`. A pasta `docs/etapas/` registra o que já foi implementado (banco, engine de disponibilidade, dashboard B2B, booking B2C, mensageria). Os arquivos `docs/SUPABASE_*.md` definem estilo SQL e fluxo de migrations.
- `vamo-agendar-app/` — O aplicativo Next.js (único repositório git). Todo código vive aqui.

## O produto

**VamoAgendar**: SaaS B2B2C de agendamento online para profissionais independentes e pequenas empresas no Brasil. Regra de ouro (**Fricção Zero**): o cliente final (B2C) **nunca** faz login, cadastro ou validação de e-mail/OTP para agendar. Ele acessa `/book/[slug]`, escolhe serviço → data/hora → informa nome + WhatsApp (e/ou e-mail) → confirma. O profissional (B2B) autentica via Clerk e gerencia tudo em `/dashboard`. Monetização: assinatura do profissional via Asaas — o VamoAgendar **não** processa o pagamento do serviço prestado ao cliente final.

## Comandos (executar dentro de `vamo-agendar-app/`)

```bash
pnpm dev          # servidor de desenvolvimento
pnpm build        # build de produção
pnpm lint         # eslint
supabase stop && supabase db diff -f <nome_da_migracao>   # gerar migration a partir dos schemas declarativos
```

Não há framework de testes configurado. O gerenciador de pacotes é **pnpm** (há `pnpm-lock.yaml` e `pnpm-workspace.yaml`).

## Stack oficial (e proibições)

Next.js 16 (App Router) + React 19 + Tailwind CSS v4 + Clerk (auth/multi-tenant via Organizations) + Supabase (`@supabase/ssr`, SQL puro, **sem ORM**) + Asaas (pagamentos) + Upstash QStash (filas/lembretes) + Evolution API (WhatsApp) + Resend (e-mails).

**Tecnologias descartadas no pivô — nunca instalar ou referenciar**: Prisma/Drizzle, better-auth, Mercado Pago. Qualquer resquício delas em código legado deve ser refatorado para a stack oficial.

**Next.js 16 tem breaking changes** em relação ao conhecimento de treinamento (ex.: `src/proxy.ts` substitui `middleware.ts`). Consulte `vamo-agendar-app/node_modules/next/dist/docs/` antes de usar APIs do framework (ver `vamo-agendar-app/AGENTS.md`).

## Arquitetura essencial

### Multi-tenancy: Clerk → JWT → RLS (sem sincronização de usuários)

Não há webhooks nem tabelas de usuários sincronizadas. O isolamento é feito assim:

1. Clerk emite JWT (template `supabase`) contendo `org_id` da organização ativa.
2. `src/lib/supabase/server.ts` (`createClient()`) injeta esse token no header `Authorization` de toda chamada ao Supabase.
3. Toda tabela operacional tem `tenant_id text NOT NULL` que armazena diretamente o `org_...` do Clerk (não é uuid; `perfis_empresas.tenant_id` é a PK referenciada pelas demais).
4. As políticas RLS comparam `tenant_id = (SELECT auth.jwt() ->> 'org_id')`.

Em Server Actions B2B, valide `const { orgId } = await auth()` antes de operar e passe `tenant_id: orgId` nas mutações. O fluxo B2C usa o mesmo `createClient()` sem sessão (role `anon`), com políticas públicas restritas + validação rigorosa na própria action (revalidação de slot contra double-booking, sanitização de telefone com `replace(/\D/g, '')`, reaproveitamento de cliente existente por telefone).

### Banco de dados: schema declarativo

- Toda alteração de schema é feita **apenas** em arquivos `.sql` em `vamo-agendar-app/supabase/schemas/` (executados em ordem lexicográfica — numere os arquivos para respeitar dependências de FK).
- **Nunca** criar/editar arquivos em `supabase/migrations/` manualmente — migrations são geradas via `supabase db diff -f <nome>` (com o ambiente local parado). Exceções (DML, alter policy etc.) estão documentadas em `docs/SUPABASE_DECLARATIVE-DATABASE-SCHEMA.md`.
- RLS **obrigatório em toda tabela**, com políticas **granulares por ação** (`SELECT`/`INSERT`/`UPDATE`/`DELETE` separadas — nunca `FOR ALL`) e role explícita (`TO authenticated` / `TO anon`).
- **Performance crítica**: sempre envolver `auth.jwt()` em subquery — `(SELECT auth.jwt() ->> 'org_id')` — para virar initPlan e evitar avaliação por linha.
- Nomenclatura em pt-BR: tabelas no **plural** (`agendamentos`, `servicos`), colunas no **singular** (`preco`, `duracao_minutos`), tudo `snake_case`; FKs como `<tabela_singular>_id`. Adicionar `COMMENT ON TABLE/POLICY` documentando a intenção de negócio.

Tabelas existentes: `perfis_empresas` (identidade + slug público), `servicos`, `horarios_funcionamento` (dia_semana 0–6 + janelas), `excecoes_agenda` (feriados/bloqueios), `whatsapp_configs` (instância Evolution + templates de mensagem), `clientes`, `agendamentos` (status: pendente/confirmado/concluido/cancelado).

### Engine de disponibilidade (`src/lib/booking-engine.ts`)

`obterSlotsDisponiveis()` calcula horários livres em tempo real: horário de funcionamento do dia da semana → subtrai exceções/bloqueios → subtrai janelas ocupadas (agendamentos ativos + `duracao_minutos` do serviço) → gera grade em intervalos de 15 min → filtra slots passados. **Timezone**: banco em UTC, interpretação no fuso `America/Sao_Paulo` (limites do dia: `${dateStr}T00:00:00-03:00` a `T23:59:59-03:00`). A action pública de criação de agendamento re-executa a engine antes do INSERT para prevenir double-booking.

### Mensageria (Evolution API + QStash)

Fluxo em duas fases após criar agendamento: (1) confirmação **síncrona** via `POST /message/sendText/{instanceName}` da Evolution API (header `apikey` = `instance_token` da tabela `whatsapp_configs`); (2) lembrete **assíncrono** agendado no QStash (header `Upstash-Not-Before`) que invoca `/api/webhooks/lembrete` no horário calculado (`data_hora - tempo_lembrete_minutos`); o webhook valida o secret, checa se o agendamento não foi cancelado e dispara o lembrete. Se o WhatsApp do tenant estiver desconectado, o fluxo falha silenciosamente para o cliente (frictionless). Templates usam variáveis `{{cliente}}`, `{{empresa}}`, `{{data_hora}}`, `{{data}}`, `{{hora}}` substituídas por `src/lib/whatsapp-helper.ts`. Números sempre com código do país (`55` + DDD + número, sem formatação). Gestão de instância: `POST /instance/create` (apikey global; salvar `hash.apikey` como `instance_token`) e `GET /instance/connect/{instanceName}` para QR Code em base64 (o dashboard faz polling de 5 s).

## Frontend

- **Server Components por padrão**; `'use client'` apenas em ilhas de interatividade (wizards, formulários, seletores de data), o mais baixo possível na árvore. Padrão do projeto: `page.tsx` (Server, busca dados) + `<Nome>Client.tsx` (Client, interação).
- **Mutações exclusivamente via Server Actions** em `src/app/actions/` (agrupadas por domínio: `agendamentos.ts`, `servicos.ts`, `public-booking.ts`...). **Não criar rotas REST intermediárias** — a única exceção são webhooks de terceiros (`src/app/api/webhooks/`).
- Tailwind v4, mobile-first sempre (usuários majoritariamente em smartphones), visual premium: paleta `zinc` com acentos (`emerald` = concluído, `red` = cancelado), transições suaves (`transition-all duration-200`), feedback de pending com `useActionState`/`useFormStatus` do React 19.
- Rotas protegidas via `src/proxy.ts` (`clerkMiddleware` + `auth.protect()`); rotas públicas precisam ser listadas no `isPublicRoute`.
- Domínio de negócio em **português** (nomes de actions, tabelas, variáveis: `criarAgendamentoPublico`, `obterSlotsDisponiveis`) — manter o padrão.

## Recursos auxiliares

- `vamo-agendar-app/.agents/skills/` contém skills de referência (Clerk, Supabase best practices, Upstash) — consulte ao trabalhar nessas integrações.
- Simplicidade é requisito: se existir uma forma simples e pragmática de resolver um fluxo, escolha-a. Não adicione camadas de abstração não pedidas.
