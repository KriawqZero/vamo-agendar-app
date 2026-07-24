---
phase: 02-integridade-da-agenda
plan: 04
subsystem: walk-in-dashboard-escrita
status: complete
tags: [server-action, rpc-upsert, exclusion-constraint, 23P01, retorno-discriminado, tdd, hermetic-test, walk-in]
requires:
  - "02-01: engine deriva ocupação de data_hora_fim — a action agora grava essa coluna no INSERT/UPDATE"
  - "02-02: RPC reaproveitar_ou_criar_cliente + EXCLUDE ag_sem_sobreposicao (23P01) autoradas nos schemas/migration"
provides:
  - "agendamentos.ts: criarAgendamentoManual grava data_hora_fim, dedupe de cliente por RPC atômica (AGE-01/AGE-05)"
  - "agendamentos.ts: 23P01 + revalidação da engine → { ok:false, motivo:'slot_ocupado', conflito } do próprio tenant, sem Sentry (AGE-03/AGE-04, D-04)"
  - "agendamentos.ts: remarcarAgendamento congela a duração ORIGINAL (data_hora_fim − data_hora), grava data_hora_fim e reusa a proteção 23P01 (D-03)"
  - "NovoAgendamentoModal.tsx: consome o retorno discriminado (aviso âmbar com detalhe + refetch), sem string-matching"
affects:
  - "02-05 [BLOCKING]: aplica a migration que materializa a RPC e a EXCLUDE que este código consome"
  - "02-06: prova de concorrência ponta a ponta contra o banco real (após o apply)"
  - "Phase 8: reaproveita remarcarAgendamento — o contrato (duração congelada + retorno discriminado) fica fixado aqui"
tech-stack:
  added: []
  patterns:
    - "retorno discriminado ({ ok } | { ok:false, motivo, conflito }) espelhando o fluxo público — nunca throw para erro esperado"
    - "upsert atômico via .rpc() no walk-in authenticated (SECURITY INVOKER preserva RLS)"
    - "discriminação de 23P01 por error.code (SQLSTATE), nunca por .message (anti-PII)"
    - "assimetria B2B/B2C intencional: walk-in mostra o detalhe do conflitante do PRÓPRIO tenant; público mostra cópia genérica"
key-files:
  created:
    - src/app/actions/__tests__/agendamentos-corrida.test.ts
  modified:
    - src/app/actions/agendamentos.ts
    - src/app/dashboard/NovoAgendamentoModal.tsx
decisions:
  - "buscarConflitoWalkin é helper único, escopado por eq('tenant_id', orgId) sob RLS, com ignorarId para a remarcação não reportar a si mesma"
  - "revalidação da engine falhando também vira slot_ocupado (não throw) para unificar a UX com a perda de corrida — consistente com a Task 1 do plano"
  - "erro de infra genuíno no INSERT/UPDATE continua com console.error + throw (surge no error boundary do dashboard) — só o 23P01/engine viram valor"
  - "cópia âmbar é fonte única no dashboard (mensagemSlotOcupado), não em mensagens.ts (que é do booking público)"
metrics:
  duration: ~25min
  tasks: 3
  files: 3
  commits: 5
  completed: 2026-07-23
---

# Phase 2 Plan 04: Walk-in do dashboard (integridade + 23P01 com detalhe) Summary

O fluxo walk-in do dashboard (`criarAgendamentoManual` e `remarcarAgendamento`) ganhou a mesma integridade que o plano 02-03 levou ao fluxo público, com uma assimetria B2B/B2C intencional: aqui o profissional é dono da agenda, então a perda de corrida (`23P01`) devolve o **detalhe** do agendamento que ocupa o horário (cliente/serviço/horário do próprio tenant), enquanto o público mostra cópia genérica. `criarAgendamentoManual` passou a gravar `data_hora_fim` no INSERT (D-02), a deduplicar cliente por telefone via a RPC atômica `reaproveitar_ou_criar_cliente` (D-01/AGE-05), e a devolver `{ ok:false, motivo:'slot_ocupado', conflito }` tanto na perda de corrida quanto quando a revalidação da engine falha — sem reportar ao Sentry (perda de corrida é esperada). `remarcarAgendamento` congela a duração **original** reservada (`data_hora_fim − data_hora`, não a duração vigente do serviço — D-03), grava `data_hora_fim` no UPDATE e reusa a mesma proteção `23P01`. O `NovoAgendamentoModal` deixou de casar substring de mensagem de erro e passou a decidir a recuperação pelo discriminante, mostrando um aviso âmbar com o detalhe e recarregando a grade.

## O que foi feito

### Task 1 (auto, tdd) — criarAgendamentoManual: RPC de cliente + data_hora_fim + 23P01 (D-01/D-04)
- O ramo "cadastro por telefone" trocou o **select-then-insert** (vulnerável a corrida, e agora ao `23505` do unique `(tenant_id, telefone)`) por uma única chamada `supabase.rpc('reaproveitar_ou_criar_cliente', { p_tenant_id: orgId, p_telefone, p_nome, p_email: null })`, relendo o cliente pelo id retornado para as notificações. O `select`-existente redundante saiu (a RPC já reaproveita por `ON CONFLICT`).
- O INSERT do agendamento grava `data_hora_fim = new Date(dataObj.getTime() + servico.duracao_minutos * 60_000).toISOString()`.
- Novo helper `buscarConflitoWalkin(supabase, orgId, inicio, fim, ignorarId?)`: busca de sobreposição (`.lt('data_hora', fim).gt('data_hora_fim', inicio)`) escopada por `eq('tenant_id', orgId)` e `neq('status','cancelado')` sob RLS authenticated; devolve só `{ cliente, servico, horario }`, nunca a `error.message`.
- Ramo `if (agError?.code === '23P01')` **antes** do erro genérico → `{ ok:false, motivo:'slot_ocupado', conflito }`, sem `reportarExcecao`. A revalidação da engine falhando passou a devolver o mesmo objeto (unifica a UX). Sucesso virou `{ ok:true, agendamento }`. Erro de infra genuíno segue com `console.error` + `throw`.
- Commits: `b27427a` (test RED), `88347f6` (feat GREEN).

### Task 2 (auto, tdd) — remarcarAgendamento: congela a duração original + 23P01 (D-03)
- O SELECT do alvo passou a trazer `id, status, data_hora, data_hora_fim` (removido o join `servicos(duracao_minutos)`). A duração vem do **intervalo original**: `duracaoOriginalMs = fim − inicio`; `novoDataHoraFim = novaDataHora + duracaoOriginalMs`. A engine revalida com `Math.round(duracaoOriginalMs / 60_000)` e `ignorarAgendamentoId: id`.
- O UPDATE grava `data_hora` **e** `data_hora_fim`. Ramo `if (error?.code === '23P01')` → `slot_ocupado` (reusando `buscarConflitoWalkin` com `ignorarId: id`, para não reportar o próprio agendamento). A revalidação da engine falhando também vira `slot_ocupado`. Sucesso virou `{ ok:true, agendamento: data }`. Realinhamento do lembrete QStash preservado intacto.
- Commits: `80b30bb` (test RED), `e438d75` (feat GREEN).

### Task 3 (auto) — NovoAgendamentoModal consome o retorno discriminado
- `confirmar` faz `await` do resultado discriminado de `criarAgendamentoManual`/`remarcarAgendamento`. `res.ok` → `aoConcluir()`; `!res.ok` → aviso âmbar (`mensagemSlotOcupado`, fonte única no dashboard, com `res.conflito?.cliente/servico/horario`) + `setSlotSelecionado(null); setSlotsCarregados(null); setPasso('horario')` para recarregar a grade.
- Removido o string-matching `msg.includes('conflita') || msg.includes('indisponível')`. O `catch` restou só para as guard clauses de precondição que ainda lançam → caixa vermelha. Nova caixa âmbar (`amber-500/30 · amber-700`), coerente com o aviso âmbar do double-booking público. Estado `avisoConflito` distinto de `erro`, limpo em todas as navegações.
- Commit: `0316bd4` (feat).

## Verificação (Definition of Done — saída real)

- `pnpm lint` → `LINT_EXIT=0`.
- `pnpm test` → 18 arquivos, **259 testes** passando (era 17/250; +1 arquivo, +9 casos herméticos novos).
- `pnpm build` → `BUILD_EXIT=0`, 14 rotas geradas.
- `grep -c 'reaproveitar_ou_criar_cliente' src/app/actions/agendamentos.ts` = 1 (chamada); `grep -c 'slot_ocupado'` presente nos quatro ramos (criar 23P01/engine, remarcar 23P01/engine); `grep -c "includes('conflita')" src/app/dashboard/NovoAgendamentoModal.tsx` = **0**.

## Prova hermética (por que assim)

A suíte nova `agendamentos-corrida.test.ts` roda no `pnpm test` padrão (sem banco), espelhando `public-booking-corrida.test.ts`: `createClient` authenticated, `auth()` do Clerk, a engine, as assinaturas e a mensageria são dublês, e o `error.code` do INSERT/UPDATE é injetado na fronteira. Foi a única forma de exercitar os ramos `23P01` HOJE — a exclusion constraint sequer está aplicada nesta wave (o apply é o 02-05). Os nove casos pinam: RPC chamada com campos saneados e `p_email: null`; `data_hora_fim` correto no INSERT; `23P01` → `slot_ocupado` com detalhe do próprio tenant **sem** `reportarExcecao`; `.message` crua nunca no retorno; revalidação da engine falhando → `slot_ocupado`; remarcação derivando `novoDataHoraFim` do intervalo **original** (45 min preservados, não os 30 min do serviço vigente no dublê); engine da remarcação recebendo a duração original + `ignorarAgendamentoId`; `23P01` no UPDATE → `slot_ocupado`. A prova de concorrência ponta a ponta contra o banco real é o plano 02-06, após o apply.

## Contrato preservado

`obterSlotsDisponiveis` e o formato de saída `{ time, datetime }` não foram tocados. A revalidação de slot por igualdade exata de `datetime` continua sendo a primeira linha; a EXCLUDE (`23P01`) é a segunda, que fecha a corrida. O walk-in do dashboard segue **omitindo** `regrasAcesso` (walk-in permitido, sem horizonte — decisão de produto). O realinhamento do lembrete QStash na remarcação ficou intacto. O contrato de `remarcarAgendamento` (duração congelada + retorno discriminado) fica fixado para a Phase 8, que o reaproveita.

## Deviations from Plan

None — plano executado exatamente como escrito. As duas primeiras tasks são `tdd="true"`; segui RED→GREEN com commits separados (`test(...)` antes de `feat(...)`) em cada uma. Um único ajuste de infraestrutura de teste, sem mudança de comportamento:

**[Rule 3 - Blocking] Mock de `next/cache` na suíte hermética.**
- **Encontrado em:** Task 1 (GREEN).
- **Issue:** o caminho de sucesso chama `revalidatePath('/dashboard')`, que lança `Invariant: static generation store missing` fora de um contexto de request — os dois casos de sucesso quebravam.
- **Fix:** `vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))`, mesmo tratamento que o resto da base já dá a APIs de framework em teste.
- **Arquivo:** src/app/actions/__tests__/agendamentos-corrida.test.ts
- **Commit:** `88347f6`.

## Known Stubs

Nenhum. Os três arquivos entregam comportamento real e testado; nenhum valor placeholder, dado mockado em produção ou `TODO/FIXME` introduzido.

## Threat surface

Sem nova superfície além da registrada no `<threat_model>` do plano. As três mitigações estão implementadas e provadas por teste:
- **T-02-04-01** (info disclosure): `buscarConflitoWalkin` escopado por `eq('tenant_id', orgId)` sob RLS authenticated, devolve só cliente/serviço/horário, nunca `error.message` (teste anti-PII sobre o retorno serializado).
- **T-02-04-02** (tampering): `novoDataHoraFim` derivado do intervalo original — teste prova 45 min preservados contra 30 min do serviço vigente.
- **T-02-04-03** (DoS do Sentry): ramos `23P01` não chamam `reportarExcecao` (teste com spy provando ausência de chamada).

## Notas para as waves seguintes

- **02-05 [BLOCKING]**: este código depende da RPC `reaproveitar_ou_criar_cliente` e da EXCLUDE `ag_sem_sobreposicao` EXISTIREM no banco. Antes do apply, uma chamada real à RPC falharia (função inexistente) e o INSERT/UPDATE nunca produziria `23P01`. Os símbolos de código estão prontos; falta materializar o schema.
- **02-06**: a prova de que duas requisições concorrentes ao mesmo slot resultam em exatamente um `confirmado` + um `slot_ocupado` (SC3/SC4) é contra o banco real, após o apply.

## Self-Check

- src/app/actions/agendamentos.ts — FOUND (RPC + data_hora_fim + ramos 23P01 nos dois fluxos + duração original congelada)
- src/app/dashboard/NovoAgendamentoModal.tsx — FOUND (retorno discriminado + caixa âmbar, zero string-matching)
- src/app/actions/__tests__/agendamentos-corrida.test.ts — FOUND (9 casos, verde)
- Commit b27427a — FOUND
- Commit 88347f6 — FOUND
- Commit 80b30bb — FOUND
- Commit e438d75 — FOUND
- Commit 0316bd4 — FOUND
