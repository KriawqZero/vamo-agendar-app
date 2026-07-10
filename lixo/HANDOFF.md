# HANDOFF — Nota interna para agentes (não é documentação de produto)

> Este arquivo não descreve arquitetura ou decisões de produto — isso já está em `01-06` e `etapas/`.
> Ele registra **estado de trabalho em andamento** para que uma nova sessão de agente retome o contexto sem precisar ser reexplicado. Atualize-o (ou apague seções resolvidas) conforme o trabalho avança; não deixe acumular informação obsoleta.

Última atualização: 2026-07-09.

---

## Estado do git (`vamo-agendar-app/`)

- Branch ativa: **`feat/baseline-etapas-1-5`** (criada a partir de `master`, ainda **não mergeada**).
- Commits nela:
  - `feat: implementa etapas 1-5 (banco, engine, dashboard B2B, booking B2C, mensageria)` — todo o código das etapas 1–5 que estava untracked (schemas SQL, actions, dashboard, wizard público, mensageria, skills do Upstash).
  - `fix: libera rotas públicas no proxy e materializa fluxo de migrations` — ver detalhes abaixo.
- `master` está parada nos commits de boilerplate + integração inicial do Clerk (antes de qualquer coisa das etapas 1–5).
- **Pendente**: decidir se faz merge de `feat/baseline-etapas-1-5` em `master` (ninguém pediu ainda).

## O que foi corrigido nesta sessão

1. **`src/proxy.ts`** — `isPublicRoute` só liberava `/sign-in` e `/sign-up`. Isso quebrava a regra de **Fricção Zero**: `/` e `/book/[slug]` (fluxo público B2C) e `/api/webhooks/lembrete` (callback do QStash) estavam sendo redirecionados para login pelo `auth.protect()`. Corrigido para liberar `/`, `/book(.*)` e `/api/webhooks(.*)`. Testado em runtime (build + `pnpm start`): `/` e `/book/...` retornam 200, o webhook retorna 401 (rejeitado pela validação de secret do próprio handler, não pelo Clerk), e `/dashboard` segue redirecionando para `/sign-in`. Comportamento confirmado correto.
2. **`supabase/config.toml`** — só tinha a config do Clerk. Adicionei `project_id` e `[db.migrations] schema_paths` (necessários para o fluxo declarativo funcionar via CLI). Também corrigi um bug pré-existente: `domain` do Clerk estava com prefixo `https://`, que o CLI rejeita (precisa ser só o hostname, ex. `becoming-prawn-0.clerk.accounts.dev`).
3. **Migration baseline gerada** — `supabase/migrations/20260708233747_baseline_schema_inicial.sql`, criada via `supabase db diff -f` a partir dos 7 arquivos em `supabase/schemas/`. Rodei localmente (Docker ativo, `npx supabase`, CLI não estava instalado globalmente). **Não apliquei em nenhum banco remoto** — isso ainda não aconteceu.

## Supabase remoto — atenção aqui

O usuário rodou (fora desta sessão de agente, direto no terminal):

```
claude mcp add --scope project --transport http supabase "https://mcp.supabase.com/mcp?project_ref=cimeiteyueeolwmlouxi"
```

Isso registrou o servidor MCP do Supabase em `vamo-agendar-app/.mcp.json`, apontando para o projeto remoto **`cimeiteyueeolwmlouxi`**.

Pontos importantes para quem continuar:

- **Servidores MCP só conectam no início da sessão.** Registrar no `.mcp.json` no meio de uma conversa não faz hot-reload — é por isso que as tools `mcp__supabase__*` não apareceram nesta sessão. Uma sessão nova aberta neste diretório deve conectar automaticamente (e provavelmente vai pedir OAuth no navegador na primeira vez, já que o MCP hospedado do Supabase costuma exigir login).
- **Não sabemos ainda se esse projeto remoto (`cimeiteyueeolwmlouxi`) já tem o schema aplicado ou está vazio.** Isso precisa ser verificado antes de qualquer `supabase db push` ou uso do MCP para alterar dados/schema — não assuma o estado, confira primeiro (com o MCP conectado, dá pra listar tabelas/rodar queries direto).
- Se o remoto estiver vazio: `supabase link --project-ref cimeiteyueeolwmlouxi` + `supabase db push` aplica a migration baseline.
- Se o remoto já tiver as tabelas (criadas manualmente via dashboard, por exemplo): **não** rodar `db push` direto — primeiro comparar/reconciliar, possivelmente com `supabase migration repair --status applied` para alinhar o histórico sem tentar recriar tabelas existentes.

## Decisões de produto ainda em aberto (não resolvidas, só identificadas)

Do diagnóstico inicial desta sessão, ainda pendentes de decisão do usuário:

1. **RLS de `agendamentos`** — a política atual permite `SELECT USING (true)` para `anon` (qualquer visitante lê agendamentos de qualquer tenant). Existe porque a engine de disponibilidade precisa ler ocupação, mas é mais permissivo do que o necessário — expõe dados de todos os tenants publicamente. Vale reavaliar (ex.: view/RPC que exponha só horários ocupados, não os dados completos do agendamento).
2. **Regra "WhatsApp ou e-mail"** — `docs/05-PRODUTO_E_VISAO.md` diz que um dos dois é obrigatório (não necessariamente WhatsApp). O código em `src/app/actions/public-booking.ts` exige WhatsApp sempre. Não implementado ainda.

## O que NÃO foi feito ainda (fora do escopo desta sessão)

- Landing page real (`/` ainda é o boilerplate/demo do Clerk).
- Integração Asaas (assinatura do profissional).
- Integração Resend (e-mails transacionais).
- `README.md` do app ainda é o padrão do `create-next-app`.
