# 03 - Padrões de Banco de Dados (Supabase)

Este documento estabelece as diretrizes obrigatórias para criação, alteração e gerenciamento de tabelas, índices, políticas e funções no banco de dados Supabase (PostgreSQL).

---

## 📐 Declarative Database Schema

Para evitar inconsistências no schema de banco de dados e garantir rastreabilidade, seguimos um fluxo estrito de migrações declarativas.

1. **Definição Declarativa:** Toda alteração de schema (criar tabelas, alterar colunas, adicionar constraints, políticas de RLS, etc.) deve ser codificada em arquivos SQL declarativos dentro do diretório `supabase/schemas/`.
2. **Geração de Migrations via CLI:** Não edite ou crie arquivos manualmente no diretório `supabase/migrations/`. As migrations devem ser geradas automaticamente usando a CLI do Supabase a partir da comparação do banco local ou schemas declarativos:
   ```bash
   supabase db diff -f nome_da_migracao
   ```
3. **Não compliance:** Alterações diretas no banco de dados de produção ou arquivos de migração editados manualmente causarão drift de schema e são estritamente proibidas.

---

## 🏷️ Regras de Nomenclatura

Para manter o banco de dados legível e consistente, siga as regras abaixo:

* **Estilo:** Use `snake_case` em letras minúsculas para todos os nomes de tabelas, colunas, views, funções, índices e restrições.
* **Tabelas:** Nomes de tabelas devem estar sempre no **plural** (ex: `clientes`, `agendamentos`, `servicos`).
* **Colunas:** Nomes de colunas devem estar sempre no **singular** (ex: `nome`, `preco`, `data_criacao`).
* **Chaves Estrangeiras (FK):** Devem seguir o padrão `<nome_tabela_alvo_no_singular>_id` (ex: `cliente_id` referenciando a tabela `clientes`, `servico_id` referenciando `servicos`).
* **Identificadores Únicos (Primary Keys):** Use `id uuid DEFAULT gen_random_uuid() PRIMARY KEY` ou `id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY` conforme o padrão adotado nas tabelas do sistema.

---

## 🛡️ Segurança Absoluta (RLS Obrigatório)

Toda tabela criada no banco de dados deve ser protegida com Row Level Security (RLS), sem exceções.

1. **Ativação Obrigatória:**
   ```sql
   ALTER TABLE nome_da_tabela ENABLE ROW LEVEL SECURITY;
   ```
   *Esta regra aplica-se até mesmo a tabelas de acesso público ou somente leitura.*

2. **Políticas Granulares (Sem "FOR ALL"):**
   Não utilize a cláusula simplificada `FOR ALL` ao criar políticas. Você deve definir políticas granulares e individuais para cada ação necessária (`SELECT`, `INSERT`, `UPDATE`, `DELETE`).
   *Isso evita que regras de escrita vazem para permissões de leitura ou vice-versa.*

3. **Restrição de Roles:**
   Sempre associe a role correspondente (ex: `TO authenticated` ou `TO anon`) na definição da política para impedir execuções indesejadas por requisições anônimas.

4. **Exemplo de Configuração de Políticas:**
   ```sql
   -- Ativar RLS
   ALTER TABLE agendamentos ENABLE ROW LEVEL SECURITY;

   -- Política para Leitura
   CREATE POLICY "Permitir SELECT para membros da org autenticados"
   ON agendamentos FOR SELECT TO authenticated
   USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

   -- Política para Inserção
   CREATE POLICY "Permitir INSERT para membros da org autenticados"
   ON agendamentos FOR INSERT TO authenticated
   WITH CHECK (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

   -- Política para Atualização
   CREATE POLICY "Permitir UPDATE para membros da org autenticados"
   ON agendamentos FOR UPDATE TO authenticated
   USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'))
   WITH CHECK (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

   -- Política para Remoção
   CREATE POLICY "Permitir DELETE para membros da org autenticados"
   ON agendamentos FOR DELETE TO authenticated
   USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'));
   ```

---

## 🚪 Privilégios da Data API (portão antes do porteiro)

RLS **não** substitui `GRANT`. A role precisa do privilégio na tabela **e** de passar na política — sem privilégio, a policy nunca chega a ser avaliada. O `GRANT` é o portão; o RLS é o porteiro. Fechar no portão é o que impede uma policy permissiva criada por engano de reabrir a tabela inteira.

**a) Objeto novo nasce FECHADO — tabela, sequence E function.** Duas migrations irmãs, ambas da Phase 1, cobrem as três categorias que o PostgREST expõe:

| Categoria | Migration | Comando |
|---|---|---|
| tabela, sequence | `20260722060000_fecha_data_api_para_anon.sql` | `alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated` |
| function / RPC | `20260722183153_fecha_data_api_para_funcoes_futuras.sql` | `alter default privileges for role postgres revoke all on functions from public` |

Toda tabela criada por migration não aparece na Data API para nenhuma das duas roles de API, e toda **function** criada pelo role `postgres` nasce sem `EXECUTE` para a chave publicável — o PostgREST expõe as funções do schema `public` como `POST /rest/v1/rpc/<nome>`, então function é superfície de rede igual a tabela. Isso é proposital: a superfície não cresce por acidente.

⚠️ **Para qual role a regra vale — e o que escapa dela.** "Objeto novo nasce fechado" é verdade para objeto criado **pelo `postgres`**, não para qualquer objeto que apareça no schema `public`. As duas migrations acima são `for role postgres`, e default privilege no Postgres é **por role criadora**: ela só alcança o que aquela role criar. As migrations deste projeto rodam como `postgres`, então a regra cobre tudo que passa pelo fluxo normal de schema — é a rotina inteira do dia a dia.

O que escapa é o **caminho da plataforma**: tabela criada pelo `supabase_admin` (extensão habilitada pelo painel, recurso gerenciado da Supabase) continua herdando `anon` **e** `authenticated`, porque esse é o default de plataforma da Supabase e a migration não o tocou — nem poderia, sendo `for role postgres`. Hoje isso não abre buraco neste projeto (nenhuma extensão nossa cria tabela em `public`), mas quem habilitar a próxima extensão precisa saber que a garantia não se estende até lá.

Medido em `pg_default_acl` — a tabela que decide a ACL que **toda** tabela ou função futura vai herdar. É a causa, não o efeito, então responde à pergunta sem precisar criar objeto descartável:

| Objeto | Criado por | ACL padrão herdada | concede `anon` | concede `authenticated` |
|---|---|---|---|---|
| tabela em `public` | `postgres` | `{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}` | **não** | **não** |
| tabela em `public` | `supabase_admin` | `{postgres=…,anon=…,authenticated=…,service_role=…}` | **sim** | **sim** |
| função (escopo global) | `postgres` | `{postgres=X/postgres}` | **não** | **não** |
| função em `public` | `postgres` | `{postgres=X/postgres,service_role=X/postgres}` | **não** | **não** |

A linha global de funções (`{postgres=X/postgres}`, **sem** `IN SCHEMA`) é confirmação estrutural de que a forma aplicada no `20260722183153` é a que funciona, e não o no-op por schema que a documentação do PostgreSQL 17 nomeia como comando ineficaz — é a armadilha 2 logo abaixo, medida no estado de repouso do banco em vez de deduzida.

Consulta usada — **não-mutante**, reexecutável a qualquer momento, e é ela o gatilho de conferência do checklist:

```sql
select coalesce(n.nspname,'(global)') as escopo, pg_get_userbyid(d.defaclrole) as criada_por,
       d.defaclacl::text as acl_padrao
from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace
where d.defaclobjtype in ('r','f') order by d.defaclobjtype, escopo;
```

**Procedência da medição:** reexecutada em **2026-07-22**, sobre o HEAD `f473437`, pelo MCP da Supabase contra `https://cimeiteyueeolwmlouxi.supabase.co` (identidade do alvo conferida antes da consulta), na execução do plano 01-19. Bate linha a linha com a medição anterior do orquestrador da execute-phase — 2026-07-22, HEAD `8edb32d`, registrada em `.planning/phases/01-hardening-da-superf-cie-p-blica/01-VERIFICATION.md` §"Adendo do orquestrador — SC4 remedido por `pg_default_acl`".

🚨 **Duas armadilhas na linha de function, e cada uma produz um no-op que PARECE conserto:**

1. **Revogar de `anon` em vez de `PUBLIC` não tem efeito nenhum.** A concessão padrão do Postgres para function nova é a `PUBLIC` (pseudo-role que abarca toda role existente e futura); `anon` só executa porque herda de `PUBLIC`. Revogar de `anon` deixa a herança intacta.
2. **A revogação de function NÃO pode levar `in schema`.** A [documentação do PostgreSQL 17](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html) traz esse caso como exemplo de comando ineficaz: `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` "has no effect […] as per-schema default privileges can only add, not remove, global privileges". Por isso a linha de function é **global** (`for role postgres`, sem `in schema`), enquanto a de tabela é por schema. Ambas as formas foram medidas na execução do plano 01-15: com a versão por schema aplicada, a function descartável criada em seguida ainda respondia `HTTP 200` a um `POST /rest/v1/rpc/<nome>` com a chave publicável.

Consequência do escopo global: function criada pelo `postgres` em **qualquer** schema (extensão inclusive) nasce sem `EXECUTE` para `PUBLIC`. A falha é alta e clara (`permission denied for function ...`), nunca silenciosa — o conserto é o `GRANT` explícito do item b.

**b) `supabase db diff` NÃO gera GRANT/REVOKE.** Se a tabela nova precisar ser lida/escrita pelo dashboard via Data API, escreva uma migration **manual** com o `GRANT` explícito. Sem ela, o sintoma é um `permission denied for table ...` que não tem nenhuma relação aparente com a feature em desenvolvimento.

```sql
-- supabase/migrations/<ts>_grant_data_api_<tabela>.sql
grant select, insert, update, delete on public.<tabela> to authenticated;
-- (a role anônima NÃO entra — ver item d)
```

O mesmo vale para **function/RPC nova**: desde o item a, ela nasce sem `EXECUTE` para ninguém além de `postgres` e `service_role`. Se o dashboard for chamá-la, o `GRANT` é escrito à mão — é o padrão que `substituir_horarios_funcionamento` já segue (`supabase/schemas/03_horarios_funcionamento.sql:101-102`):

```sql
-- supabase/migrations/<ts>_grant_execute_<funcao>.sql
grant execute on function public.<funcao>(<tipos>) to authenticated;
-- (a role anônima NÃO entra: RPC pública é chamada pelo servidor com createAdminClient())
```

Pior que "não gera": quando forçado a diffar privilégio, o migra gera o **contrário** do desejado. Ao gerar `20260722055941_fecha_policies_anon.sql`, ele emitiu `revoke ... from service_role` em todas as tabelas e `grant truncate to anon` — porque compara o banco real com um shadow construído só a partir de `supabase/schemas/`, que não contém `GRANT` nenhum. Aquele bloco foi podado à mão. **Privilégio mora em migration escrita à mão, nunca no diff.**

**c) 🚨 `service_role` NUNCA entra em linha de `REVOKE`.** Nem em `revoke ... from`, nem em `ALTER DEFAULT PRIVILEGES ... revoke`. O snippet que a documentação da Supabase publica inclui `service_role` porque assume o modelo "zero client DB access" (backend por conexão direta); aqui o backend usa a Data API com a secret key. Copiar o snippet cru não quebra nada hoje — quebra a **próxima** tabela criada, que nasce inacessível ao `createAdminClient()` e derruba o booking público inteiro. A migration `20260709161817_restaura_privilegios_dml_roles_api.sql` existe porque isso já aconteceu neste repositório uma vez.

**d) A role anônima não tem — e não volta a ter — privilégio nenhum.** Leitura pública é servida pelo servidor com `createAdminClient()`, com três contrapartidas obrigatórias, porque ali o RLS está bypassado e elas são a única defesa que resta:

1. filtro de tenant resolvido **no servidor** (o browser manda `slug`, nunca `tenant_id`);
2. projeção explícita de colunas (constante de módulo, nunca `select('*')` — coluna nova não entra sozinha no payload do browser);
3. validação/sanitização na própria Server Action antes de escrever.

**e) Checklist ao criar tabela nova:**

- [ ] arquivo em `supabase/schemas/` (numerado para respeitar FKs)
- [ ] `ENABLE ROW LEVEL SECURITY`
- [ ] policies granulares por ação, com role explícita e `auth.jwt()` em subquery
- [ ] `COMMENT ON TABLE` + `COMMENT ON POLICY` com a intenção de negócio
- [ ] migration gerada por `supabase db diff` (DDL de tabela/policy)
- [ ] **migration manual de `GRANT ... TO authenticated`** se o dashboard for usar a tabela pela Data API
- [ ] se a página pública precisar do dado: ler pelo `createAdminClient()`, não conceder à role anônima
- [ ] **só quando a tabela nascer pelo caminho da plataforma** (extensão habilitada pelo painel ou recurso gerenciado da Supabase, que criam como `supabase_admin`): reexecutar a consulta de `pg_default_acl` do item a e conferir se a tabela nasceu com `anon`/`authenticated`. Se nasceu, o conserto é uma migration manual de `revoke`, escrita à mão como as demais de privilégio. Tabela criada por migration não precisa disto — a default privilege já a cobre

**Checklist ao criar function/RPC nova no schema `public`:**

- [ ] `REVOKE ALL ON FUNCTION public.<funcao>(<tipos>) FROM PUBLIC;` no próprio arquivo de `supabase/schemas/` — de **`PUBLIC`**, nunca de `anon` (ver a armadilha 1 do item a). A default privilege global já cobre a function nova, mas o revoke explícito é o que mantém o schema declarativo legível e sobrevive a um reset feito fora da ordem das migrations
- [ ] `GRANT EXECUTE ... TO <role que vai chamar>` explícito — sem ele a function não é chamável por ninguém além de `postgres` e `service_role`, e o sintoma é `permission denied for function ...`
- [ ] a role anônima **não** entra: RPC consumida pela página pública é chamada pelo servidor com `createAdminClient()`
- [ ] `COMMENT ON FUNCTION` com a intenção de negócio e o modelo de segurança (`SECURITY INVOKER`/`DEFINER`, de onde sai o `tenant_id`)

---

## 💬 Documentação Interna (Comentários no Banco)

Adicione comentários descritivos tanto nas tabelas quanto nas políticas para documentar a intenção de negócio e as lógicas de segurança direto no Postgres.

```sql
COMMENT ON TABLE agendamentos IS 'Tabela que armazena os horários agendados pelos clientes finais com os profissionais de cada organização (tenant).';

COMMENT ON POLICY "Permitir SELECT para membros da org autenticados" ON agendamentos 
IS 'Permite que usuários logados leiam os agendamentos pertencentes apenas à sua própria organização ativa.';
```
*Dica de SQL: Use aspas simples duplas (`''`) caso precise escapar strings dentro dos comentários.*

---

## 🗂️ Supabase Storage (bucket `imagens-perfis`)

Único bucket do projeto (criado em 2026-07-17, P0.12b), para o logo e a capa da
página pública de booking:

- **Público** (leitura via CDN — a página de booking é pública), 5MB de limite duro,
  MIME restrito a `image/jpeg`/`image/png`/`image/webp` (**sem SVG** — superfície de
  XSS desnecessária).
- **Paths por tenant**: `<org_id>/logo-<epoch>.<ext>` e `<org_id>/capa-<epoch>.<ext>`.
  O timestamp no nome é cache-busting; a action remove os arquivos antigos do prefixo
  na troca.
- **Sem políticas RLS em `storage.objects`** — e isso é deliberado: neste projeto
  (Supabase atual), `storage.objects` pertence a `supabase_storage_admin` e a role
  `postgres` (SQL/MCP) **não pode** criar políticas ali (`must be owner of relation
  objects`). Consequência: a API do Storage é default-deny para `anon`/`authenticated`
  e **toda escrita passa pelas Server Actions** `enviarImagemPerfil`/
  `removerImagemPerfil` (`src/app/actions/imagens-perfil.ts`), que validam `auth()`,
  gating de plano, MIME/tamanho e derivam o path do `orgId` antes de gravar com
  `createAdminClient()`.
- **Migrations de Storage são manuais** (exceção do fluxo declarativo — DML em
  `storage.buckets` não é capturado pelo `db diff`; ver
  `SUPABASE_DECLARATIVE-DATABASE-SCHEMA.md`). Referência:
  `supabase/migrations/20260717173148_storage_imagens_perfis.sql`.
