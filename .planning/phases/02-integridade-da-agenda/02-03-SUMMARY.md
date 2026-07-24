---
phase: 02-integridade-da-agenda
plan: 03
subsystem: booking-publico-escrita
status: complete
tags: [server-action, rpc-upsert, exclusion-constraint, 23P01, anti-pii, tdd, hermetic-test]
requires:
  - "02-01: engine deriva ocupação de data_hora_fim — a action agora grava essa coluna no ato da reserva"
  - "02-02: RPC reaproveitar_ou_criar_cliente + EXCLUDE ag_sem_sobreposicao (23P01) autoradas nos schemas/migration"
provides:
  - "public-booking.ts: cliente por RPC atômica COALESCE (dedupe por telefone, AGE-05)"
  - "public-booking.ts: data_hora_fim = data_hora + duração gravado no INSERT do agendamento"
  - "public-booking.ts: ramo error.code === '23P01' → slot_indisponivel sem reportarExcecao (AGE-04, D-05)"
affects:
  - "02-05 [BLOCKING]: aplica a migration que materializa a RPC e a EXCLUDE que este código consome"
  - "02-06: prova de concorrência ponta a ponta contra o banco real (após o apply)"
tech-stack:
  added: []
  patterns:
    - "upsert atômico via .rpc() em vez de select-then-insert (fecha corrida de dedupe)"
    - "discriminação de erro do Postgres por error.code (SQLSTATE), nunca por .message (anti-PII)"
    - "condição esperada de negócio (perda de corrida) NÃO vai ao Sentry"
key-files:
  created:
    - src/app/actions/__tests__/public-booking-corrida.test.ts
  modified:
    - src/app/actions/public-booking.ts
decisions:
  - "23P01 discriminado ANTES do erro_interno genérico; erro de infra real (ex.: 23503) continua indo ao Sentry"
  - "data_hora_fim calculado de dataLocal.getTime() + duracao_minutos*60_000 (instante UTC, mesma fonte de duração do booking_completed)"
  - "prova hermética (dublê com error.code injetado) porque a EXCLUDE só é aplicada no 02-05; prova real-DB é o 02-06"
metrics:
  duration: ~10min
  tasks: 2
  files: 2
  commits: 4
  completed: 2026-07-23
---

# Phase 2 Plan 03: Corrida no fluxo público (RPC de cliente + 23P01) Summary

O fluxo público de escrita (`criarAgendamentoPublico`) passou a criar/reaproveitar o cliente por uma RPC atômica COALESCE (fechando a corrida que duplicava clientes por telefone — AGE-05), a gravar `data_hora_fim` no INSERT do agendamento (a espinha-dorsal da ocupação que a engine lê — D-02), e a discriminar a perda de corrida: quando o INSERT falha com `23P01` (a exclusion constraint fecha o TOCTOU que a revalidação da engine deixa aberto), a action devolve `slot_indisponivel` — o mesmo discriminante que o `BookingApp` já consome — sem reportar ao Sentry (AGE-04, D-05). A mensagem crua do Postgres, que embute `org_id` e o horário de terceiro, nunca atravessa para a UI.

## O que foi feito

### Task 1 (auto, tdd) — RPC de cliente + data_hora_fim no INSERT (D-01)
- Substituído o bloco select-then-insert de `clientes` (não atômico) por uma única chamada `await admin.rpc('reaproveitar_ou_criar_cliente', { p_tenant_id, p_telefone: telefoneLimpo, p_nome: nomeLimpo, p_email: emailLimpo || null })`, lendo o `id` retornado para `clienteId`.
- Erro de infra na RPC preserva o padrão anti-PII vigente: `reportarExcecao(erroSinteticoSupabase(cError, 'cliente_sem_retorno'), { fluxo: 'booking_publico', etapa: 'buscar_cliente' })` + `return { ok: false, motivo: 'erro_interno' }` — nenhum dado do cliente no contexto.
- No INSERT do agendamento, acrescentado `data_hora_fim = new Date(dataLocal.getTime() + servico.duracao_minutos * 60_000).toISOString()` ao payload. Validação/sanitização existentes e o formato de saída da engine intactos.
- Commits: `c54eea9` (test RED), `a215487` (feat GREEN).

### Task 2 (auto, tdd) — Discriminar 23P01 → slot_indisponivel, sem Sentry (D-05)
- Inserido, ANTES do bloco genérico `if (agError || !agendamento)`, o ramo `if (agError?.code === '23P01')` que devolve `{ ok: false, motivo: 'slot_indisponivel' }` e captura o funil `booking_failed`/`slot_indisponivel` num try/catch que nunca afeta o retorno. Não chama `reportarExcecao`.
- O bloco de `erro_interno` genérico permanece intacto: falha de infra real (ex.: `23503`) continua indo ao Sentry.
- Commits: `abf31a6` (test RED), `4d5bf73` (feat GREEN).

## Verificação (Definition of Done — saída real)

- `pnpm lint` → `LINT_EXIT=0`.
- `pnpm test` → 17 arquivos, **250 testes** passando (era 16/243; +1 arquivo, +7 casos herméticos novos).
- `pnpm build` → `BUILD_EXIT=0`, 14 rotas geradas.
- `grep -c 'reaproveitar_ou_criar_cliente' src/app/actions/public-booking.ts` = 2; `grep -c 'data_hora_fim'` = 2; `grep -n '23P01'` presente no ramo antes do erro_interno.

## Prova hermética (por que assim)

A suíte nova `public-booking-corrida.test.ts` roda no `pnpm test` padrão (sem banco): o cliente privilegiado, a engine e as assinaturas são dublês, e o `error.code` do INSERT é injetado na fronteira. Foi a única forma de exercitar o ramo `23P01` HOJE — a exclusion constraint sequer está aplicada nesta wave (o apply é o 02-05). Os sete casos pinam: RPC chamada com campos saneados; `p_email` nulo quando ausente; `data_hora_fim` correto; erro de infra da RPC → `erro_interno` sem PII; `23P01` → `slot_indisponivel` **sem** `reportarExcecao`; `.message` crua nunca no retorno; contrafactual `23503` → `erro_interno` + Sentry (é o `error.code` que discrimina). A prova de concorrência ponta a ponta contra o banco real é o plano 02-06, após o apply.

## Contrato preservado

`obterSlotsDisponiveis` e o formato de saída `{ time, datetime }` (contrato anti double-booking) não foram tocados. A revalidação de slot por igualdade exata de `datetime` antes do INSERT continua sendo a primeira linha; a EXCLUDE (23P01) é a segunda, que fecha a corrida. A suíte de integração existente (`public-booking-escrita.test.ts`, `EXIGIR_INTEGRACAO=1`) já assere o comportamento contra o banco real e segue válida.

## Deviations from Plan

None - plano executado exatamente como escrito. As duas tasks são `tdd="true"`; segui RED→GREEN com commits separados (`test(...)` antes de `feat(...)`) em cada uma.

## Known Stubs

Nenhum. Ambos os arquivos entregam comportamento real e testado; nenhum valor placeholder, dado mockado em produção ou `TODO/FIXME` introduzido.

## Threat surface

Sem nova superfície além da registrada no `<threat_model>` do plano. As três mitigações (`T-02-03-01/02/03`) estão implementadas e provadas por teste: discriminação por `error.code` sem propagar `.message` (info disclosure), ramo `23P01` sem `reportarExcecao` (DoS do Sentry), `erroSinteticoSupabase` sem dado do cliente no contexto (info disclosure).

## Notas para as waves seguintes

- **02-05 [BLOCKING]**: este código depende da RPC `reaproveitar_ou_criar_cliente` e da EXCLUDE `ag_sem_sobreposicao` EXISTIREM no banco. Antes do apply, uma chamada real à RPC falharia (função inexistente) e o INSERT nunca produziria `23P01`. Os símbolos de código estão prontos; falta materializar o schema.
- **02-06**: a prova de que duas requisições concorrentes ao mesmo slot resultam em exatamente um `confirmado` + um `slot_indisponivel` (SC3/SC5) é contra o banco real, após o apply.

## Self-Check: PASSED

- src/app/actions/public-booking.ts — FOUND (RPC + data_hora_fim + ramo 23P01)
- src/app/actions/__tests__/public-booking-corrida.test.ts — FOUND (7 casos, verde)
- Commit c54eea9 — FOUND
- Commit a215487 — FOUND
- Commit abf31a6 — FOUND
- Commit 4d5bf73 — FOUND
