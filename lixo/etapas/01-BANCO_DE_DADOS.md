# Etapa 1 - Modelagem e Estrutura de Banco de Dados (Supabase PostgreSQL)

Este documento registra a modelagem lógica, decisões de design físico, convenções adotadas e segurança via Row Level Security (RLS) do banco de dados do **VamoAgendar**.

---

## 🏛️ Diretrizes e Padrões Físicos

Para garantir consistência e performance no PostgreSQL hospedado no Supabase, definimos as seguintes regras:
1.  **Nomenclatura**:
    *   Tabelas em plural e em `snake_case` (ex: `perfis_empresas`, `agendamentos`).
    *   Colunas em singular e em `snake_case` (ex: `duracao_minutos`, `data_hora`).
2.  **Isolamento Multi-tenant**:
    *   Toda tabela operacional possui a coluna `tenant_id text NOT NULL`.
    *   O `tenant_id` armazena diretamente o ID da organização ativa no Clerk (`org_...`), dispensando tabelas intermediárias de membros e simplificando a lógica do RLS.
3.  **Tipos de Dados**:
    *   Identificadores principais (`id`) usam `uuid` gerados automaticamente via `gen_random_uuid()`.
    *   Datas com fuso horário usam `timestamp with time zone`.

---

## 📊 Estrutura das Tabelas (Schemas Declarativos)

Criamos os schemas declarativos na pasta `supabase/schemas/` para possibilitar versionamento e diffs limpos da estrutura:

### 1. Perfis de Empresas (`perfis_empresas`)
Armazena a identidade do tenant e a URL amigável (`slug`) do estabelecimento.
*   **Campos principais**: `tenant_id` (PK/text), `slug` (text UNIQUE), `nome_estabelecimento` (text), `descricao` (text), `telefone_contato` (text).

### 2. Serviços (`servicos`)
Define os itens cadastrados pelo profissional que estarão disponíveis para agendamento.
*   **Campos principais**: `id` (PK/uuid), `tenant_id` (text), `nome` (text), `descricao` (text), `preco` (numeric(10,2)), `duracao_minutos` (integer), `ativo` (boolean).

### 3. Horários de Funcionamento (`horarios_funcionamento`)
Configura a janela operacional padrão para cada dia da semana (0 = Domingo a 6 = Sábado).
*   **Campos principais**: `id` (PK/uuid), `tenant_id` (text), `dia_semana` (integer, 0-6), `hora_inicio` (time without time zone), `hora_fim` (time without time zone), `ativo` (boolean).

### 4. Exceções e Bloqueios (`excecoes_agenda`)
Define dias específicos onde o atendimento é interrompido ou alterado (ex: feriados, consultas médicas).
*   **Campos principais**: `id` (PK/uuid), `tenant_id` (text), `data` (date), `hora_inicio` (time, opcional), `hora_fim` (time, opcional), `bloqueado` (boolean), `motivo` (text).

### 5. Configurações de WhatsApp (`whatsapp_configs`)
Credenciais da Evolution API e templates de notificações automáticas.
*   **Campos principais**: `tenant_id` (PK/text), `instance_name` (text UNIQUE), `instance_token` (text), `status` (text), `mensagem_confirmacao` (text), `mensagem_lembrete` (text), `tempo_lembrete_minutos` (integer).

### 6. Diretório de Clientes (`clientes`)
Armazena informações básicas de contato dos clientes atendidos por cada tenant.
*   **Campos principais**: `id` (PK/uuid), `tenant_id` (text), `nome` (text), `telefone` (text UNIQUE por tenant), `email` (text).

### 7. Agendamentos (`agendamentos`)
Tabela principal que registra as reservas de horário.
*   **Campos principais**: `id` (PK/uuid), `tenant_id` (text), `cliente_id` (FK/uuid), `servico_id` (FK/uuid), `data_hora` (timestamp with time zone), `status` (text CHECK).

---

## 🔒 Row Level Security (RLS) e Performance

O Supabase exige proteção de dados ponta a ponta. Como integramos o Clerk via JWT no cliente `@supabase/ssr`, o banco de dados identifica o usuário logado usando `auth.jwt()`.

### A Regra de Ouro de Performance do RLS
Funções como `auth.jwt()` não são otimizadas nativamente pelo otimizador de consultas do Postgres quando utilizadas diretamente em cláusulas `WHERE`, causando varreduras completas em tabelas grandes (Seq Scan).
*   **A Solução**: Envolver o acesso à claim em um subquery `SELECT`:
    ```sql
    USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'))
    ```
    Isso força o Postgres a avaliar a expressão uma única vez (como um `initPlan`), mantendo a busca baseada nos índices primários da tabela.

### Padrão de Acesso B2B (Área Administrativa)
Apenas membros autenticados pertencentes ao mesmo `org_id` (tenant) podem ler ou gravar dados.
```sql
CREATE POLICY "Permitir leitura apenas para membros da org" 
ON servicos FOR SELECT TO authenticated
USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'));
```

### Padrão de Acesso B2C (Agendamento Público)
Visitantes anônimos (`anon`) precisam consultar dados operacionais (serviços ativos e horários livres) e inserir registros (criar cliente lead e agendamento) sem fazer login.
*   **Leitura pública controlada**:
    ```sql
    CREATE POLICY "Permitir leitura anônima de serviços" 
    ON servicos FOR SELECT TO anon
    USING (ativo = true);
    ```
*   **Escrita pública validada no banco**:
    Permitimos `INSERT` público nas tabelas de `agendamentos` e `clientes`, mas a validação final de disponibilidade de horário é reforçada na Server Action do Next.js antes da gravação no banco, mitigando ataques de spam.
