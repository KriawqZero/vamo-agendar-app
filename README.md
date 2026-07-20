# VamoAgendar

SaaS de agendamento online para profissionais independentes e pequenas empresas no
Brasil. Regra de ouro do produto — Fricção Zero: o cliente final nunca cria conta,
nunca loga e nunca valida e-mail/OTP para marcar um horário; ele entra em
`/book/[slug]`, escolhe serviço e horário, informa nome e WhatsApp e
confirma. Quem autentica é o profissional, via Clerk, e gerencia serviços, agenda e
clientes em `/dashboard`. A monetização é por assinatura do profissional via Asaas —
o VamoAgendar não processa o pagamento do serviço que ele presta ao cliente final.

## Stack

Next.js 16 (App Router) + React 19 + Tailwind CSS v4 + Clerk (auth) + Supabase (SQL
puro, sem ORM) + Upstash QStash (fila de lembretes) + Evolution API (WhatsApp) +
PostHog (analytics — sem credenciais configuradas vira no-op e não quebra nada).

## Requisitos

- Node.js
- pnpm — gerenciador de pacotes obrigatório do projeto (versão fixada no campo
  `packageManager` do `package.json`; não use npm nem yarn)
- Supabase CLI, para gerar migrations

## Comandos

```bash
pnpm dev          # servidor de desenvolvimento
pnpm build        # build de produção
pnpm lint         # eslint
pnpm test         # testes unitários (vitest)
supabase stop && supabase db diff -f <nome_da_migracao>   # gera migration a partir dos schemas declarativos em supabase/schemas/
node scripts/mock-evolution.mjs          # gateway WhatsApp falso, pra rodar o fluxo de mensageria sem instância Evolution real
```

## Next.js 16 tem breaking changes

Em relação ao que a maioria das IAs e devs conhece — a v16 muda convenções do
framework (ex.: `src/proxy.ts` no lugar de `middleware.ts`). Antes de usar qualquer
API do Next.js, confira `node_modules/next/dist/docs/`.

## Documentação

`docs/01` a `docs/08` cobrem, nessa ordem, arquitetura, integração Clerk↔Supabase,
banco de dados, frontend, produto, mensageria, planos e analytics. `docs/PENDENCIAS.md`
é a lista viva de tarefas e bugs. As regras completas de arquitetura, stack e
convenções do projeto estão em `CLAUDE.md`.
