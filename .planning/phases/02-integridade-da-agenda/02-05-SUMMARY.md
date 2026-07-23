---
phase: 02-integridade-da-agenda
plan: 05
subsystem: banco-de-dados
status: complete
tags: [migration, integridade, exclusion-constraint, btree_gist, rpc, ledger, D-06, D-02]
requires:
  - "02-02: migration de integridade autorada (arquivo 20260723162858_integridade_agenda.sql)"
  - "checkpoint de decisão (Task 1) resolvido pelo owner: 'Limpar (D-06) + aplicar'"
provides:
  - "Banco de dev com data_hora_fim NOT NULL, coluna periodo GENERATED, ag_sem_sobreposicao (EXCLUDE), clientes_tenant_telefone_key (UNIQUE), btree_gist e a RPC reaproveitar_ou_criar_cliente REAIS"
  - "Ledger supabase_migrations.schema_migrations com version=20260723162858 alinhada ao nome do arquivo"
affects:
  - "02-06 (prova de concorrência): agora tem constraint real para exercer — deixa de ser falso-verde"
  - "AGE-01/AGE-03/AGE-05: metade de banco fechada"
tech-stack:
  added:
    - "btree_gist (extension, schema extensions)"
  patterns:
    - "DDL + INSERT no ledger na MESMA chamada execute_sql (mesma transação) — fecha a janela de desalinhamento repo/ledger"
    - "Pré-voo obrigatório com zeros ANTES do DDL de EXCLUDE/UNIQUE (sem NOT VALID para essas constraints)"
key-files:
  created: []
  modified:
    - "supabase/migrations/20260723162858_integridade_agenda.sql (cabeçalho: registrado o pré-voo autoritativo do 02-05 com zeros)"
decisions:
  - "D-06 executada: apagados só os 5 agendamentos de teste do tenant avantis; perfil/serviços/horários/whatsapp_configs/clientes preservados"
  - "D-02 aplicada (one-way): data_hora_fim NOT NULL — imutável após Phase 11"
  - "Ledger preservou a version inserida via execute_sql — não foi necessário realinhar por DML (ao contrário de apply_migration)"
metrics:
  duration: ~18min
  completed: 2026-07-23
  tasks: 3
  files: 1
---

# Phase 2 Plan 05: Aplicar a migration de integridade ao Supabase Cloud (dev) Summary

Migration de integridade (AGE-01/AGE-03/AGE-05) aplicada em terreno limpo pelo caminho real do projeto (`execute_sql` + ledger na mesma transação): `data_hora_fim NOT NULL`, coluna `periodo` GENERATED, exclusion constraint `ag_sem_sobreposicao`, `UNIQUE (tenant_id, telefone)` e a RPC atômica `reaproveitar_ou_criar_cliente` — tudo agora REAL no banco, fechando o falso-verde onde build/typecheck passavam sem a constraint existir.

## O que foi feito

### Task 1 — Checkpoint de decisão (já resolvido pelo owner)
O gate bloqueante foi apresentado ao owner pelo orquestrador e respondido: **"Limpar (D-06) + aplicar"**. Autorizadas as duas ações one-way: apagar os agendamentos de teste (D-06) e `data_hora_fim NOT NULL` (D-02). Não reaberto.

### Task 2 — Pré-voo obrigatório + limpeza D-06
Identidade do alvo reconfirmada antes de qualquer escrita: `get_project_url` → `https://cimeiteyueeolwmlouxi.supabase.co` (o banco de dev deste projeto).

Estado medido antes: 5 agendamentos, todos do tenant `avantis` (`org_3GQ4ocNNd4Fm6cmgzoCynvxXOxQ`), 1 perfil, 1 cliente; nenhum dos objetos-alvo existia (coluna/EXCLUDE/UNIQUE/RPC = 0/0/0/0).

D-06 (`DELETE FROM agendamentos WHERE tenant_id = 'org_3GQ4ocNNd4Fm6cmgzoCynvxXOxQ'`): **5 agendamentos removidos**. Estrutura preservada e conferida por contagem pós-limpeza:

| Objeto | Contagem pós-D-06 |
|---|---|
| agendamentos | 0 |
| perfis_empresas | 1 |
| servicos | 1 |
| horarios_funcionamento | 7 |
| whatsapp_configs | 1 |
| clientes | 1 |

**Pré-voo (Regra transversal de aceite) — as duas consultas voltaram ZERO:**

| Consulta | Resultado |
|---|---|
| (a) duplicatas `(tenant_id, telefone)` em `clientes` | **0** |
| (b) sobreposições ativas pós-backfill (forma simulada via join `servicos`, pois `data_hora_fim` ainda não existia) | **0** |

Os zeros foram registrados também no cabeçalho da migration (`20260723162858_integridade_agenda.sql`, bloco "PRÉ-VOO AUTORITATIVO (02-05...)").

### Task 3 — Apply via execute_sql + realinhamento do ledger
Corpo da migration aplicado via `mcp__supabase__execute_sql` (nunca `apply_migration`, nunca `db push`), com o `INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260723162858','integridade_agenda')` na **mesma chamada/transação**. Ordem obrigatória respeitada: coluna nullable → backfill → NOT NULL + CHECK → extension + periodo + EXCLUDE → UNIQUE + RPC + GRANT → COMMENTs. O `set search_path = public, extensions` já no corpo garantiu a opclass do btree_gist (Pitfall 3).

`list_migrations` confirma a última linha alinhada — **não foi necessário realinhar por DML**, pois o `execute_sql` preservou a version inserida (ao contrário do `apply_migration`):

```
... 20260722183153 fecha_data_api_para_funcoes_futuras
    20260722185755 slug_gratuito_unico
    20260723162858 integridade_agenda   <-- version = timestamp do arquivo
```

**Evidência de catálogo (todas conferidas por consulta):**

| Verificação | Resultado |
|---|---|
| `data_hora_fim` NOT NULL | true |
| `ck_agendamento_fim_apos_inicio` | presente (1) |
| `ag_sem_sobreposicao` (EXCLUDE) | presente (1) |
| `clientes_tenant_telefone_key` (UNIQUE) | presente (1) |
| `periodo` GENERATED ALWAYS | true |
| extension `btree_gist` | instalada (1) |
| função `reaproveitar_ou_criar_cliente` | presente (1) |
| `has_function_privilege(anon, ...EXECUTE)` | **false** |
| `has_function_privilege(authenticated, ...EXECUTE)` | true |
| `has_function_privilege(service_role, ...EXECUTE)` | true |

## Definition of Done

Três comandos verdes sobre o HEAD (só o cabeçalho da migration mudou em git — nenhum código de app):

- `pnpm lint` — exit 0
- `pnpm test` — **259 passed** (18 arquivos), 712ms
- `pnpm build` — sucesso, 14 rotas geradas

## Deviations from Plan

Nenhuma deviação de comportamento. Duas observações de precisão, ambas alinhadas ao contexto fornecido pelo orquestrador:

1. **Nome real do arquivo de migration.** A frontmatter do plano (e os `files` das tasks) citava `20260723153155_integridade_agenda.sql`, mas o arquivo REAL autorado pelo 02-02 é `20260723162858_integridade_agenda.sql`. Usado o timestamp real (`20260723162858`) como version do ledger — confirmado por `list_migrations`.

2. **Pré-voo (b) rodado em forma simulada.** A consulta (b) do cabeçalho referencia `data_hora_fim`, que ainda não existia antes do apply. Rodada em forma equivalente (join com `servicos` para computar o término que o backfill produziria) contra o estado pós-D-06 — retornou 0 tanto pela forma simulada quanto trivialmente (tabela sem agendamentos).

## Reversibilidade

Duas ações one-way, ambas autorizadas pelo owner no checkpoint:
- **D-06**: os 5 agendamentos de teste apagados não voltam (aceito — dados descartáveis de dev).
- **D-02**: `data_hora_fim NOT NULL` vira migration imutável após a Phase 11.

## Self-Check: PASSED

- Arquivo modificado existe: `supabase/migrations/20260723162858_integridade_agenda.sql` (FOUND)
- Objetos de banco confirmados por catálogo (coluna NOT NULL, 2 constraints, 1 unique, extension, RPC, privilégios) — todos presentes
- Ledger com version `20260723162858` confirmado por `list_migrations`
- Nenhum uso de `apply_migration` nem `supabase db push`
