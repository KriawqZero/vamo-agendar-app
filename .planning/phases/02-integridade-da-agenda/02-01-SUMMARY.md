---
phase: 02-integridade-da-agenda
plan: 01
subsystem: booking-engine
tags: [booking-engine, disponibilidade, timezone, tdd, tracer]
requires:
  - "agendamentos.data_hora_fim (coluna gravada no ato da reserva — materializada nas waves de apply/actions)"
provides:
  - "obterSlotsDisponiveis deriva ocupação exclusivamente de data_hora_fim"
  - "tratamento de agendamento que cruza a meia-noite (Pitfall 4) na engine"
affects:
  - "src/app/actions/public-booking.ts (deve gravar data_hora_fim — plano posterior)"
  - "src/app/actions/agendamentos.ts (deve gravar data_hora_fim — plano posterior)"
tech-stack:
  added: []
  patterns:
    - "ocupação da agenda lida de coluna imutável (data_hora_fim), não de join com servicos"
    - "minutos-locais + 1440 por dia de diferença para agendamento que vira o dia"
key-files:
  created: []
  modified:
    - src/lib/booking-engine.ts
    - src/lib/__tests__/booking-engine.test.ts
decisions:
  - "D-02 aplicado: data_hora_fim é a ÚNICA fonte de ocupação; o fallback || 30 do join servicos foi removido junto com o join"
  - "Pitfall 4: somar 1440 por dia de diferença (via diaLocal + Date.parse) em vez de clampar — mantém a ocupação íntegra além do fim do dia consultado, robusto para diferenças multi-dia"
metrics:
  duration: ~5 min
  completed: 2026-07-23
  tasks: 2
  files: 2
  commits: 3
status: complete
---

# Phase 2 Plan 01: Engine lê ocupação de data_hora_fim Summary

A engine de disponibilidade passou a derivar a ocupação da agenda exclusivamente de `data_hora_fim` (gravado no ato da reserva), removendo o join `agendamentos → servicos(duracao_minutos)` com fallback `|| 30` — fechando AGE-01 (editar a duração de um serviço não move o término de um agendamento marcado) e AGE-02 (serviço desativado continua ocupando o tempo reservado) na camada pura e testável, com tratamento explícito do agendamento que cruza a meia-noite.

## O que foi feito

### Task 1 (tracer, tdd) — Engine lê ocupação de data_hora_fim (D-02)
- Query de ocupação em `obterSlotsDisponiveis`: projeção trocada para `data_hora, data_hora_fim, status`; o join `servicos(duracao_minutos)` foi removido.
- Derivação de ocupação: `end` calculado de `data_hora_fim` via `horaLocal` (mesmo mecanismo do `start`); a linha do fallback `|| 30` e a diretiva `@ts-expect-error` órfã do join foram removidas.
- Tratamento de meia-noite (Pitfall 4): quando o dia local de `data_hora_fim` difere do de `data_hora`, soma-se `1440 * diffDias` ao `end`, evitando o intervalo ocupado invertido/vazio.
- Fixtures de ocupação dos testes reescritas: `interface Agendamento` perde o objeto `servicos` aninhado e ganha `data_hora_fim`; as três fixtures de ocupação passam `data_hora_fim` (início + 30 min).
- A query `servicosAtivos` (:258-274) que alimenta `menorDuracaoAtiva` para a regra anti-buraco **não foi tocada** — coisa diferente de ocupação.
- Commit: `9a8675f`

### Task 2 (auto, tdd) — Casos de borda AGE-02 e virada da meia-noite
- Teste AGE-02 nomeado: agendamento de 60 min cujo serviço foi desativado (nenhum serviço ativo no tenant) ocupa o intervalo reservado inteiro `[09:00, 10:00)`; assertiva `not toContain '09:30'` é a prova comportamental de que o antigo `|| 30` sumiu (sob ele o slot das 09:30 reapareceria livre).
- Teste Pitfall 4 nomeado: agendamento 23:30 → 00:30 do dia seguinte ocupa até o fim do dia consultado (`not toContain '23:15'` e `not toContain '23:30'`), com controle positivo `toContain '23:00'`.
- Commit: `56d1422`

## Verificação (Definition of Done)

Rodados na árvore final, saída real:
- `pnpm lint` — sem erros.
- `pnpm test` — 16 arquivos, **243 testes** passando (booking-engine.test.ts subiu de 28 → 30 casos).
- `pnpm build` — compila sem erro (a diretiva `@ts-expect-error` órfã foi removida).
- `grep -c 'data_hora_fim' src/lib/booking-engine.ts` = 4.

## Contrato preservado

`obterSlotsDisponiveis` continua devolvendo o mesmo formato de saída (`{ time, datetime }`) — só a **fonte de dado da ocupação** mudou. O anti double-booking da action pública, que revalida por igualdade exata de `datetime`, não é afetado. A grade anti-buraco (`calcularIntervalosLivres`/`gerarSlotsAntiBuraco`, `menorDuracaoAtiva` via `servicosAtivos`) permanece idêntica; todos os testes dela seguem verdes sem alteração.

## Deviations from Plan

None - plano executado exatamente como escrito.

## Tracer feedback gate

Task 1 é o tracer da fase. Seu `<verify>` é `<automated>` (`pnpm test src/lib/__tests__/booking-engine.test.ts`), sem aspecto visual/funcional para um humano avaliar. Foi re-executado verde após o commit, com saída real exibida — a fatia vertical está provada ponta a ponta antes da expansão (Task 2). Como o `<verify>` é puramente automatizado e já verde, o gate de integração precoce foi satisfeito sem checkpoint humano (que serviria apenas para verificação visual/funcional que a engine hermética não tem).

## Known Stubs

Nenhum. Ambos os arquivos entregam comportamento real e testado; não há valores placeholder, dados mockados em produção nem `TODO/FIXME` introduzidos.

## Notas para as waves seguintes

- A coluna `agendamentos.data_hora_fim` é agora a espinha-dorsal da ocupação: as actions de criação (`public-booking.ts`, `agendamentos.ts`) precisam gravá-la, e a wave de `apply` materializa a coluna `NOT NULL` + a exclusion constraint que dela dependem. Esta mudança é código puro, revertível por git; a coluna `NOT NULL` (irreversível) é decisão da wave de apply, não desta.

## Self-Check: PASSED
- src/lib/booking-engine.ts — FOUND (4 refs a data_hora_fim)
- src/lib/__tests__/booking-engine.test.ts — FOUND (30 casos, inclui AGE-02 e meia-noite)
- Commit 9a8675f — FOUND
- Commit 56d1422 — FOUND
