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

**a) Tabela nova nasce FECHADA.** Desde a Phase 1 (`supabase/migrations/20260722060000_fecha_data_api_para_anon.sql`), um `ALTER DEFAULT PRIVILEGES for role postgres in schema public revoke all on tables from anon, authenticated` garante que toda tabela criada por migration não apareça na Data API para nenhuma das duas roles de API. Isso é proposital: a superfície não cresce por acidente.

**b) `supabase db diff` NÃO gera GRANT/REVOKE.** Se a tabela nova precisar ser lida/escrita pelo dashboard via Data API, escreva uma migration **manual** com o `GRANT` explícito. Sem ela, o sintoma é um `permission denied for table ...` que não tem nenhuma relação aparente com a feature em desenvolvimento.

```sql
-- supabase/migrations/<ts>_grant_data_api_<tabela>.sql
grant select, insert, update, delete on public.<tabela> to authenticated;
-- (a role anônima NÃO entra — ver item d)
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
