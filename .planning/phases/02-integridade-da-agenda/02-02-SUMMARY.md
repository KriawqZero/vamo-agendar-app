---
phase: 02-integridade-da-agenda
plan: 02
subsystem: banco-integridade
status: complete
tags: [postgres, exclusion-constraint, upsert-coalesce, generated-column, migration-manual, rls]
requires:
  - "02-01: engine deriva ocupação de data_hora_fim (D-02) — o schema aqui declara a coluna que a engine já lê"
provides:
  - "supabase/schemas/06_clientes.sql: UNIQUE (tenant_id, telefone) + função reaproveitar_ou_criar_cliente (upsert COALESCE, SECURITY INVOKER)"
  - "supabase/schemas/07_agendamentos.sql: data_hora_fim NOT NULL, periodo GENERATED, CHECK ck_agendamento_fim_apos_inicio, EXCLUDE ag_sem_sobreposicao"
  - "supabase/migrations/20260723162858_integridade_agenda.sql: migration à mão ordenada com pré-voo documentado (NÃO aplicada)"
affects:
  - "02-03/02-04: consomem a RPC reaproveitar_ou_criar_cliente e discriminam o 23P01 da EXCLUDE"
  - "02-05 [BLOCKING]: aplica esta migration (pré-voo + limpeza D-06 + execute_sql + realinhamento de ledger)"
tech-stack:
  added: [btree_gist]
  patterns: [coluna-gerada-tstzrange, exclusion-constraint-tenant-scoped, upsert-coalesce-via-rpc, migration-manual-com-pre-voo]
key-files:
  created:
    - supabase/migrations/20260723162858_integridade_agenda.sql
  modified:
    - supabase/schemas/06_clientes.sql
    - supabase/schemas/07_agendamentos.sql
decisions:
  - "periodo é coluna GENERATED (não trigger) — decidido por sonda empírica DDL no banco (PG 17.6), não por palpite"
  - "constraint nomeada explicitamente (clientes_tenant_telefone_key) no schema E na migration — nome idêntico evita drift no db diff futuro"
  - "migration NÃO aplicada neste plano — apply é 02-05 [BLOCKING] com pré-voo autoritativo pós-limpeza D-06"
metrics:
  duration: ~20min
  tasks: 3
  files: 3
  completed: 2026-07-23
---

# Phase 2 Plan 02: Estado final de integridade da agenda (schemas + migration à mão) — Summary

Autorou o estado FINAL de banco da fase nos schemas declarativos e a migration escrita à mão que aperta sobre dados existentes — exclusion constraint atômica tenant-scoped, UNIQUE de telefone, função de upsert COALESCE e coluna `data_hora_fim` congelada — sem aplicar nada ao banco (o apply é o plano 02-05). A forma de `periodo` foi decidida por medição empírica, não por suposição.

## What Was Built

- **`supabase/schemas/06_clientes.sql`**: `CONSTRAINT clientes_tenant_telefone_key UNIQUE (tenant_id, telefone)` (nome explícito) + função `public.reaproveitar_ou_criar_cliente(text, text, text, text) RETURNS uuid` em `LANGUAGE sql SECURITY INVOKER SET search_path = ''`, com `INSERT ... ON CONFLICT (tenant_id, telefone) DO UPDATE SET nome = COALESCE(public.clientes.nome, EXCLUDED.nome), email = COALESCE(public.clientes.email, EXCLUDED.email) RETURNING id`. `REVOKE ALL ... FROM public, anon` + `GRANT EXECUTE ... TO authenticated, service_role` (nada para anon). `COMMENT ON` na constraint e na função. As 4 policies granulares existentes preservadas.
- **`supabase/schemas/07_agendamentos.sql`**: `data_hora_fim timestamptz NOT NULL`, `periodo tstzrange GENERATED ALWAYS AS (tstzrange(data_hora, data_hora_fim, '[)')) STORED`, `CONSTRAINT ck_agendamento_fim_apos_inicio CHECK (data_hora_fim > data_hora)` e `CONSTRAINT ag_sem_sobreposicao EXCLUDE USING gist (tenant_id WITH =, periodo WITH &&) WHERE (status <> 'cancelado')`. `COMMENT ON` em cada coluna/constraint nova com a intenção de negócio.
- **`supabase/migrations/20260723162858_integridade_agenda.sql`** (à mão, NÃO aplicada): cabeçalho justificando a escrita manual, bloco de PRÉ-VOO documentado (duas consultas obrigatórias), corpo na ordem obrigatória (coluna nullable → backfill → NOT NULL+CHECK → `btree_gist`+periodo+EXCLUDE → UNIQUE+RPC+GRANT → COMMENTs), `SET search_path = public, extensions` (Pitfall 3), `service_role` só em GRANT.

## Task 1 — Sonda empírica DDL (decisão de `periodo`)

Identidade do alvo e versão confirmadas antes da sonda: `PostgreSQL 17.6 on aarch64-unknown-linux-gnu`, database `postgres`, user `postgres`, 1 tenant, 5 agendamentos.

Saída literal da sonda (`mcp__supabase__execute_sql`):

```sql
CREATE TEMP TABLE _teste_periodo (
  a timestamptz, b timestamptz,
  p tstzrange GENERATED ALWAYS AS (tstzrange(a, b, '[)')) STORED
);
INSERT INTO _teste_periodo (a, b) VALUES ('2026-07-23T12:00:00Z', '2026-07-23T12:30:00Z');
SELECT p FROM _teste_periodo;   -- → ["2026-07-23 12:00:00+00","2026-07-23 12:30:00+00")
DROP TABLE _teste_periodo;
```

**Resultado: PASSOU.** O `CREATE TEMP TABLE` com a coluna gerada foi aceito, o INSERT funcionou e a coluna produziu o range esperado. Nenhum erro "generation expression is not immutable". **Decisão determinística: coluna GENERATED** (não o fallback trigger). O construtor `tstzrange(timestamptz, timestamptz, text)` é imutável neste Postgres. A TEMP TABLE (session-scoped) foi derrubada; self-check pós-autoria confirmou zero objetos residuais no banco (`colunas_novas=0, funcao_nova=0, constraints_novas=0, btree_gist=0`).

## Verification Evidence

- **Task 1**: sonda registrada acima (passou → GENERATED). Nada persistido.
- **Task 2 (grep)**: `SECURITY INVOKER`=3, `SECURITY DEFINER`=0 em 06_clientes.sql; `reaproveitar_ou_criar_cliente`=5; REVOKE `FROM public, anon` + GRANT `TO authenticated, service_role` presentes; 07_agendamentos.sql contém `data_hora_fim`, `ck_agendamento_fim_apos_inicio`, `periodo`, `ag_sem_sobreposicao` e `status <> 'cancelado'` no predicado do EXCLUDE, com `COMMENT ON` em tudo novo.
- **Task 3 (grep + ledger)**: arquivo existe; ordem verificada por número de linha (add column 74 → backfill 80 → NOT NULL 87 → extension 99 → EXCLUDE 109 → UNIQUE 116); única linha de statement `revoke` (142) NÃO contém `service_role`; ledger inalterado (`SELECT ... ORDER BY version DESC` ainda termina em `20260722185755`), migration NÃO aplicada.
- **Definition of Done** (saída real):
  - `pnpm lint` → `LINT_EXIT=0`
  - `pnpm test` → `TEST_EXIT=0` — Test Files 16 passed (16), Tests 243 passed (243)
  - `pnpm build` → `BUILD_EXIT=0` — 14 rotas geradas

## Pré-voo (baseline informativo)

A consulta (a) — duplicatas `(tenant_id, telefone)` em clientes — foi rodada read-only no dev durante a autoria e voltou **VAZIA (0 duplicatas)**. A consulta (b) — sobreposições ativas pós-backfill — não é medível antes de `data_hora_fim` existir; é o 02-05 quem a roda de forma autoritativa, após a limpeza D-06. Ambas estão documentadas no cabeçalho da migration.

## Deviations from Plan

Nenhuma deviation de comportamento. Um ajuste de forma, sem mudança de intenção:

**[Rule 1 — ajuste de verificação] Comentário reescrito para não colidir com o grep de aceite.**
- **Encontrado em:** Task 2.
- **Issue:** o comentário explicativo da função continha a frase "NUNCA SECURITY DEFINER", o que fazia `grep -c 'SECURITY DEFINER'` devolver 1, contra o critério de aceite `== 0`.
- **Fix:** reescrito para "NUNCA definida como DEFINER: ... Por isso INVOKER, sempre." — mesma intenção, sem o literal `SECURITY DEFINER`. Grep passou a devolver 0.
- **Arquivo:** supabase/schemas/06_clientes.sql
- **Commit:** c7c2076

## Notes for Downstream Plans

- **02-05 [BLOCKING]**: a migration é a fonte a aplicar via `execute_sql` (DDL + INSERT no ledger na MESMA transação), com pré-voo autoritativo (as duas consultas do cabeçalho, esperando zeros) DEPOIS da limpeza D-06 dos agendamentos de teste, e realinhamento de `version`/`name` no ledger (o MCP `apply_migration` não preserva a version).
- **02-03/02-04**: a RPC `reaproveitar_ou_criar_cliente` e a discriminação do `23P01` (`slot_indisponivel` público / `slot_ocupado` walk-in) dependem destes objetos existirem — mas os símbolos de código são autorados naqueles planos.
- **btree_gist** entra como dependência nova de banco (schema `extensions`); a EXCLUDE não resolve a opclass de `text WITH =` sem ela.

## Self-Check: PASSED

- Arquivos criados/modificados existem em disco (06_clientes.sql, 07_agendamentos.sql, 20260723162858_integridade_agenda.sql).
- Commits presentes: c7c2076 (schemas), 51b4c19 (migration).
- Banco não alterado (self-check de resíduo: 0/0/0/0).
