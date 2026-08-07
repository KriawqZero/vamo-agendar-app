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

> ⚠️ **Desde 2026-08-07 existem DOIS bancos**, e este documento trata do **Cloud**.
> O banco local (`npx supabase start`, portas 544xx) é o do desenvolvimento diário;
> zerá-lo é trivial e sem consequência: `npx supabase db reset --local`.
>
> O que exige cuidado é que **`db reset` sem flag mira o linkado, ou seja, a nuvem**.
> Passe `--local` ou `--linked` sempre, explicitamente. O procedimento inteiro abaixo
> só faz sentido para o Cloud — no local, o reset resolve em um comando.

### 3.1 O seed do banco local (`supabase/seed.sql`)

O reset do **local** não deixa o banco vazio: o CLI executa `supabase/seed.sql` no fim de
todo `npx supabase db reset --local` (não há bloco `[db.seed]` em `config.toml`, então vale
o caminho default `./seed.sql`). O seed cria um tenant utilizável de uma vez:

| O que cria | Valores |
|---|---|
| `perfis_empresas` | `slug` = `slug_gratuito` = `salao-do-seed`, fuso `America/Sao_Paulo`, antecedência 15 min, horizonte 14 dias |
| `servicos` | dois ativos, 30 min e 60 min (durações diferentes exercitam a regra anti-buraco, que usa a menor duração ativa do tenant) |
| `horarios_funcionamento` | seg–sex com duas janelas (09–12 e 13–18), sábado 09–13, domingo fechado |

Um comando depois do reset, `/book/salao-do-seed` responde. Não são criados agendamentos
nem clientes: data fixa vira passado e some da grade, data relativa faria o seed produzir
estado diferente a cada execução.

> ⚠️ **O seed apaga e recria o tenant dele** (`DELETE FROM perfis_empresas WHERE tenant_id
> = <o do seed>`, com CASCADE). No `db reset` isso é inócuo — o banco já está limpo. Rodar
> `psql -f supabase/seed.sql` à mão, porém, apaga os dados **locais** daquele tenant.

**O `tenant_id` e o `ALTER ROLE` que se faz uma vez.** O `tenant_id` é o `org_id` do Clerk,
não é gerável por SQL, e corrigi-lo depois é impossível: ele é PK referenciada pelas FKs
`fk_tenant` **sem** `ON UPDATE CASCADE`, então o `UPDATE` falha. Por padrão o seed usa o
literal sintético `org_seed_local` e avisa, no `RAISE NOTICE` final, que com ele o
**dashboard** não enxerga o tenant (o RLS compara `tenant_id` com o claim `org_id` do JWT).
O booking público funciona normalmente mesmo assim, porque a leitura pública usa cliente
privilegiado e resolve o tenant pelo slug — nada nesse caminho fala com o Clerk.

Para o tenant do seed nascer com o `org_id` real e aparecer também no dashboard:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54422/postgres" \
  -c "ALTER ROLE postgres SET vamoagendar.org_id = 'org_...';"
npx supabase db reset --local
```

> O `ALTER ROLE` é feito **uma vez só**: o ajuste mora em `pg_db_role_setting` com
> `datid = 0` (escopo de cluster) e **sobrevive ao drop/create de database que o `db reset`
> faz**. O valor fica fora do repositório de propósito — `seed.sql` é versionado, e o
> `org_id` do owner é identificador de conta.

**Storage (opcional):** as imagens de logo/capa dos tenants ficam no bucket
`imagens-perfis` e não são atingidas pelo TRUNCATE. Para limpar junto:

```sql
DELETE FROM storage.objects WHERE bucket_id = 'imagens-perfis';
```

(O bucket em si pode ficar — a migration `20260717173148_storage_imagens_perfis.sql`
recria com `on conflict do nothing`.)

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
