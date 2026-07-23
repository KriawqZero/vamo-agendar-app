---
phase: 02-integridade-da-agenda
plan: 06
subsystem: agendamentos
status: complete
tags: [integracao, concorrencia, double-booking, exclusion-constraint, 23P01, coalesce, sentry, AGE-03, AGE-04, AGE-05, SC3, SC4, SC5]
requires:
  - "02-05: exclusion constraint ag_sem_sobreposicao, UNIQUE (tenant_id, telefone) e RPC reaproveitar_ou_criar_cliente REAIS no banco de dev"
  - "02-03: public-booking.ts discrimina 23P01 → slot_indisponivel e usa a RPC COALESCE"
provides:
  - "Prova empírica de SC3/SC4/SC5 contra o Supabase de dev na suíte de integração (EXIGIR_INTEGRACAO=1), self-cleaning por TENANT_TESTE"
  - "Phase gate 02 selado: pnpm lint + pnpm test + pnpm build + integração verdes com saída real"
  - "PENDENCIAS com a fronteira do walk-in em voz alta e a lista de UAT humano da Phase 2 aberta"
affects:
  - "/gsd-verify-work da Phase 2: os dois itens de UAT de tela são o que resta"
  - "AGE-03/AGE-04/AGE-05: metade empírica fechada"
tech-stack:
  added: []
  patterns:
    - "Prova de atomicidade por COUNT no banco (=== 1), não por suposição de colisão do Promise.all em processo"
    - "Constraint role-agnóstica como prova da metade walk-in do double-booking (dois inserts admin sobrepostos → 23P01)"
    - "Mock de observabilidade como SUJEITO de asserção (perda de corrida não vai ao Sentry), com contrafactual no JSDoc"
key-files:
  created: []
  modified:
    - "src/app/actions/__tests__/public-booking-escrita.test.ts (SC3 concorrência + constraint walk-in; SC5 COALESCE; SC4 zero-Sentry; mock de @/lib/observabilidade/reportar)"
    - "docs/PENDENCIAS.md (fechamento empírico do double-booking + UAT humano da Phase 2 + fronteira walk-in)"
decisions:
  - "TDD colapsado por design: a implementação (constraint 02-05 + discriminação 02-03) já shipou; este plano é a PROVA, então o teste passar de primeira é o resultado desejado, não um RED pulado"
  - "Metade walk-in do SC3 provada no nível da constraint (role-agnóstica); corrida walk-in autenticada em processo (mock Clerk) ficou best-effort, fronteira registrada"
  - "SC4 provado sobre a própria corrida do SC3 (zero chamadas a reportarExcecao/reportarFalhaSilenciosa), com o contrafactual documentado no JSDoc do mock"
metrics:
  duration: ~10min
  completed: 2026-07-23
  tasks: 3
  files: 2
---

# Phase 2 Plan 06: Prova empírica da integridade da agenda Summary

As garantias que só a integração observa — atomicidade do double-booking (SC3), dedupe COALESCE de cliente (SC5) e perda de corrida silenciosa ao Sentry (SC4) — provadas contra o Supabase de dev, e o phase gate da Phase 2 selado com os quatro comandos verdes de saída real.

## O que foi feito

### Task 1 — Prova de concorrência SC3 (público) + walk-in no nível da constraint
Novo caso na suíte de integração (`describe.skipIf(!temCredenciais)`, self-cleaning por `TENANT_TESTE`):
- Obtém um slot legítimo da **própria engine** (`obterSlotsPublicos`, nunca literal cravado — é a saída que a action revalida por igualdade exata).
- Dispara **N=8** chamadas concorrentes de `criarAgendamentoPublico` para o mesmo slot via `Promise.all` (mesmo telefone, forçando a RPC atômica também sob concorrência).
- Assere **exatamente 1 `ok`**, **N-1 `slot_indisponivel`**, nenhum outro motivo, e a asserção **definitiva**: `COUNT` de ativos no banco (`status <> 'cancelado'`) **=== 1** — o número que só a exclusion constraint sabe segurar.
- Metade **walk-in** no nível da constraint (role-agnóstico): dois inserts admin diretos e sobrepostos, mesmo tenant, `status <> 'cancelado'` → 1 vence, o outro falha com **SQLSTATE 23P01** (asserido pelo código, nunca pela `.message`).

Commit: `3ecbeb9`.

### Task 2 — Prova COALESCE (SC5) + perda de corrida silenciosa (SC4)
- **SC5:** cliente pré-existente com nome curado e sem e-mail (insert admin direto); segunda reserva pública pelo **mesmo telefone** com nome diferente e um e-mail. Assere: **1 linha** em `clientes` para `(TENANT_TESTE, telefone)`, **mesmo id** (upsert caiu no `ON CONFLICT`), **e-mail preenchido** (`COALESCE(clientes.email, EXCLUDED.email)`), **nome curado preservado** (`COALESCE(clientes.nome, EXCLUDED.nome)`, com `clientes.nome NOT NULL`).
- **SC4:** mock de `@/lib/observabilidade/reportar` como **sujeito de asserção**; na corrida do SC3, os N-1 perdedores voltam `slot_indisponivel` **sem** chamar `reportarExcecao`/`reportarFalhaSilenciosa`. Contrafactual documentado no JSDoc do mock: sem o ramo `23P01`, a corrida cairia no `erro_interno` genérico, que chama `reportarExcecao` e inundaria o Sentry.

Commit: `5f86df6`.

### Task 3 — Phase gate completo + PENDENCIAS
Quatro comandos rodados com **saída real** (abaixo). `docs/PENDENCIAS.md` atualizado: marca a metade de banco do double-booking como provada (SC3/SC4/SC5), registra a **fronteira do walk-in** em voz alta e abre a lista de **UAT humano da Phase 2** (aviso âmbar público + detalhe walk-in no dashboard) — nenhum item marcado como concluído.

Commit: `5eb707b`.

## Definition of Done — saída real dos quatro comandos

```
===== pnpm lint =====
$ eslint
EXIT_LINT=0

===== pnpm test (hermético) =====
 Test Files  18 passed (18)
      Tests  259 passed (259)
   Duration  709ms

===== pnpm build =====
 ✓ Generating static pages using 11 workers (14/14) in 416ms
 Route (app) — 14 rotas geradas (/, /book/[slug], /dashboard/*, /para/[nicho], sign-in, sign-up, webhooks/lembrete)
 (build concluído com sucesso)

===== EXIGIR_INTEGRACAO=1 pnpm test =====
 Test Files  19 passed (19)
      Tests  274 passed (274)     # 259 hermético + 15 integração
   Duration  10.83s
```

O `pnpm test` hermético **permaneceu em 259** (mesma contagem do 02-05): os casos novos vivem só na suíte opt-in, que o `vitest.config.ts` exclui do glob padrão. `EXIGIR_INTEGRACAO=1 pnpm test` sobe para 274 (a suíte de integração passou de 13 para 15 casos).

## Disciplina da suíte de integração (honrada)
- Casos novos só na suíte opt-in (`EXIGIR_INTEGRACAO=1` / `pnpm test:integracao`), **nunca** no glob hermético.
- **Self-cleaning:** cada caso apaga agendamentos+clientes de `TENANT_TESTE` antes e depois; o `afterAll` é o cinto de segurança. O DB de dev volta ao estado pré-teste (0 agendamentos no tenant `avantis`, intocado — a suíte só opera sob `TENANT_TESTE`/`TENANT_VIZINHO`).
- Slot obtido da **engine**, não cravado — exercita o mesmo caminho que a escrita de produção valida.

## Deviations from Plan

Nenhuma deviação de comportamento. Uma nota de precisão sobre o ciclo TDD:

1. **RED/GREEN colapsado por design (não é RED pulado).** O plano é `tdd="true"`, mas a implementação que estes testes provam já shipou em ondas anteriores (a exclusion constraint no 02-05, a discriminação do `23P01` e a RPC COALESCE no 02-03). Este plano é a **prova empírica** dessas garantias — então o teste passar de primeira contra o banco real é exatamente o resultado desejado, não um RED omitido. A regra do harness TDD ("se um teste passa inesperadamente no RED, pare — a feature pode já existir") aqui se resolve com "a feature existe de propósito; provar que existe é o objetivo do plano".

## Fronteiras registradas (em voz alta)
- **Walk-in autenticado em processo:** a corrida walk-in via mock de auth do Clerk **não foi rodada** (best-effort). A metade walk-in do SC3 está provada no **nível da constraint** (role-agnóstica: dois inserts sobrepostos → 23P01), que cobre o walk-in porque ele grava na mesma tabela sob a mesma constraint. Registrado em PENDENCIAS.
- **UAT de tela:** dois itens humanos abertos (aviso âmbar público AGE-04; detalhe cliente/serviço no walk-in do dashboard) — só o owner fecha, nenhum executor observa render.

## Known Stubs
Nenhum. Os casos novos exercitam código de produção real contra o banco real; sem placeholders, sem dados mockados fluindo para asserção (os únicos mocks — notificações, analytics, assinaturas parcial, observabilidade — são fiação de borda, cada um justificado no topo do arquivo).

## Self-Check: PASSED
- `src/app/actions/__tests__/public-booking-escrita.test.ts` modificado — FOUND (15 casos, integração verde)
- `docs/PENDENCIAS.md` modificado — FOUND (seção Phase 2 UAT + fronteira walk-in)
- Commits: `3ecbeb9` (SC3), `5f86df6` (SC5+SC4), `5eb707b` (PENDENCIAS) — todos em git log
- Quatro comandos do phase gate verdes com saída real colada acima
