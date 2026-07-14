# Reset do ambiente de desenvolvimento ("migrate --fresh")

> Procedimento para zerar **todos os dados** do ambiente de desenvolvimento, equivalente ao `php artisan migrate:fresh` / `prisma migrate reset`. Executado pela primeira vez em 2026-07-12.

## Por que não basta resetar o banco

O estado do VamoAgendar vive em **quatro** serviços que se referenciam entre si. Zerar só um deles deixa resíduos órfãos nos outros:

| Serviço | O que guarda | Resíduo se não for limpo |
|---|---|---|
| **Supabase** (Postgres) | Todas as tabelas de negócio (`perfis_empresas`, `agendamentos`, ...) | Linhas com `tenant_id` apontando para orgs que não existem mais no Clerk |
| **Clerk** | Usuários (B2B) e Organizations (o `org_...` é o `tenant_id` do banco) | Orgs logadas no dashboard apontando para perfis inexistentes no banco |
| **Evolution API** | Instâncias de WhatsApp (`instancia-<org_id>`) | Instâncias conectadas ocupando slot no servidor, sem dono |
| **QStash** | Lembretes agendados (delay até `data_hora - tempo_lembrete_minutos`) | Mensagens pendentes disparando webhooks para agendamentos inexistentes (falham de forma inofensiva, mas poluem logs) |

**Ordem recomendada**: Evolution → Clerk → Supabase → QStash. A Evolution vem antes porque os nomes das instâncias derivam dos `org_id` — é mais fácil listá-los enquanto ainda existem no banco/Clerk (embora a apikey global permita listar tudo de qualquer forma).

## 1. Evolution API — deletar instâncias de WhatsApp

Usa a apikey **global** (`EVOLUTION_GLOBAL_API_KEY` no `.env.local`), não os tokens por instância:

```bash
source <(grep -E '^EVOLUTION' .env.local | sed 's/^/export /')

# Listar
curl -s "$EVOLUTION_API_URL/instance/fetchInstances" \
  -H "apikey: $EVOLUTION_GLOBAL_API_KEY" | jq -r '.[].name'

# Deletar cada uma
curl -s -X DELETE "$EVOLUTION_API_URL/instance/delete/<instanceName>" \
  -H "apikey: $EVOLUTION_GLOBAL_API_KEY"
```

## 2. Clerk — deletar organizações e usuários

O Clerk não tem "reset"; deleta-se recurso a recurso via CLI (`pnpm dlx clerk@latest`, já autenticado e vinculado ao app VamoAgendar). Deletar a organização já remove memberships e convites junto.

```bash
# Organizações
pnpm dlx clerk@latest api '/organizations?limit=250' | jq -r '.data[].id' | while read id; do
  pnpm dlx clerk@latest api "/organizations/$id" -X DELETE --yes
done

# Usuários
pnpm dlx clerk@latest users list --json --limit 250 | jq -r '.data[].id' | while read id; do
  pnpm dlx clerk@latest api "/users/$id" -X DELETE --yes
done
```

Se houver mais de 250 registros, repita até a listagem vir vazia. A **configuração** da instância (social providers, sessão etc.) não é afetada — assim como o `migrate:fresh` não mexe no config da aplicação.

> ⚠️ Só existe instância **development** no app do Clerk hoje. Se um dia houver produção, confira o alvo com `pnpm dlx clerk@latest doctor --json` antes de rodar qualquer DELETE.

## 3. Supabase — zerar os dados

O `.env.local` aponta para o projeto **hospedado** (`cimeiteyueeolwmlouxi.supabase.co`), então resetar o banco local não afeta o ambiente que o app realmente usa. Duas opções:

**Opção A — truncar dados mantendo o schema (usada no reset de 2026-07-12, mais segura):**

```sql
TRUNCATE public.perfis_empresas, public.servicos, public.horarios_funcionamento,
         public.excecoes_agenda, public.whatsapp_configs, public.clientes,
         public.agendamentos, public.assinaturas, public.disparos_whatsapp CASCADE;
```

Execute via MCP do Supabase ou SQL Editor do dashboard. Mantenha esta lista em dia se novas tabelas forem criadas.

**Opção B — drop + reaplicar migrations (fresh de verdade, requer projeto linkado):**

```bash
npx supabase db reset --linked   # DESTRUTIVO: derruba e recria o banco remoto inteiro
```

Prefira a opção A no dia a dia: mesmo efeito prático (dados zerados) sem risco de divergência no pipeline de migrations. Use a B apenas quando o objetivo for validar as migrations do zero.

Para o banco **local** (Docker), o equivalente é simplesmente `npx supabase db reset`.

## 4. QStash — cancelar lembretes pendentes

```bash
source <(grep -E '^QSTASH_(URL|TOKEN)' .env.local | tr -d '"' | sed 's/^/export /')
curl -s -X DELETE "$QSTASH_URL/v2/messages" -H "Authorization: Bearer $QSTASH_TOKEN"
# → {"cancelled": N}
```

Cancela **todas** as mensagens pendentes de uma vez (bulk cancel). Passo opcional a rigor — o webhook `/api/webhooks/lembrete` valida se o agendamento ainda existe antes de disparar — mas evita erros nos logs.

## Verificação final

```sql
SELECT relname, n_live_tup FROM pg_stat_user_tables
WHERE schemaname = 'public' ORDER BY relname;  -- tudo deve estar em 0
```

```bash
pnpm dlx clerk@latest users list --json | jq '.data | length'   # → 0
curl -s "$EVOLUTION_API_URL/instance/fetchInstances" -H "apikey: $EVOLUTION_GLOBAL_API_KEY" | jq 'length'  # → 0
```
