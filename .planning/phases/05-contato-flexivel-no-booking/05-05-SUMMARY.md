---
phase: 05-contato-flexivel-no-booking
plan: 05-05
title: Validação Nyquist, Documentação de Pendências e Gate Completo da Fase 5
status: completed
date: "2026-08-08"
requirements-completed: [BOO-01, BOO-02, BOO-03, EML-03]
reconstruido_em: "2026-08-13"
reconstruido_de: [ef99d5b, f320c34]
---

# Summary 05-05: Validação Nyquist, Documentação de Pendências e Gate Completo da Fase 5

**Contato flexível fechado na Server Action pública — `clienteTelefone` e `clienteEmail` viram opcionais com a regra "pelo menos um", `05-VALIDATION.md` em `nyquist_compliant: true` e gate de 4 comandos verde.**

> **Nota de reconstrução.** Este SUMMARY foi escrito em 2026-08-13 a partir dos commits
> `ef99d5b` e `f320c34`, do diff real e do `05-VALIDATION.md`. O plano executou por
> completo em 2026-08-08 mas terminou sem emitir o próprio resumo, deixando a fase em
> 4/5 summaries e disparando o `safe_resume_gate` do `/gsd-execute-phase`. Nenhum código
> foi reexecutado.

## Accomplishments

1. **`05-VALIDATION.md` finalizado** — `Per-Task Verification Map` e a tabela "Success Criteria → prova" preenchidas, ligando SC1 a `public-booking-validacao.test.ts`, SC2 a `ConfirmacaoAgendamento.test.tsx`, SC3 a `public-booking-notificacoes.test.ts` e SC4 a `public-booking-dedupe.test.ts`; frontmatter em `status: validated` / `nyquist_compliant: true`.
2. **Contato flexível na Server Action** — `AgendamentoPublicoParams` exportada com `clienteTelefone?: string | null` e `clienteEmail?: string | null`; a validação passou a exigir nome + **pelo menos um** meio de contato (`campos_obrigatorios` quando ambos vazios), com o formato do telefone só cobrado quando ele vem preenchido.
3. **Orquestração multicanal e `after()`** — `src/lib/notificacoes-agendamento.ts` reescrito (285 linhas) para disparar e-mail via Resend e/ou WhatsApp via Evolution API + QStash conforme os dados informados, chamado por `emitirDepoisDaResposta` para liberar a tela de sucesso sem esperar transporte externo.
4. **UI do formulário** — `EtapaContato.tsx` e `BookingApp.tsx` ajustados ao contrato flexível, com o honeypot preservado.
5. **Gate de 4 comandos verde** — `pnpm test`, `pnpm lint`, `npx tsc --noEmit` e `pnpm build` com exit 0.
6. **Pendências de UAT do owner** registradas em `docs/PENDENCIAS.md`: agendar só com WhatsApp, só com e-mail, com ambos, e recusa quando os dois estão vazios.

## Task Commits

1. **05-05 — validação Nyquist, orquestração multicanal e gate** — `ef99d5b` (feat)
2. **Fechamento de fase (ROADMAP/STATE/PENDENCIAS)** — `f320c34` (docs)

## Files Created/Modified

- `.planning/phases/05-contato-flexivel-no-booking/05-VALIDATION.md` — mapa Nyquist e Success Criteria preenchidos
- `src/lib/notificacoes-agendamento.ts` — orquestração multicanal (285 linhas alteradas)
- `src/app/actions/public-booking.ts` — params opcionais, regra "pelo menos um contato", rate limit condicional
- `src/app/book/[slug]/etapas/EtapaContato.tsx` — formulário flexível
- `src/app/book/[slug]/BookingApp.tsx` — fluxo do wizard
- `src/app/actions/__tests__/public-booking-notificacoes.test.ts` — +64 linhas cobrindo os três arranjos de canal
- `src/app/actions/__tests__/public-booking-dedupe.test.ts` — ajuste ao contrato novo
- `docs/PENDENCIAS.md` — bloco de UAT manual da Phase 05

## Decisions Made

- **Rate limit por telefone é condicional.** Com `telefoneLimpo` nulo, `verificarLimite('escrita_telefone', …)` é pulado e `passouTelefone` recebe `true` — não há chave estável para o balde. Ver "Issues Encountered".
- **`teto_tenant` segue via `verificarLimiteSemConsumir`**, preservando a correção do ciclo de review da Phase 03 (contar criações, não tentativas).

## Deviations from Plan

O plano 05-05 estava escrito como plano de fechamento (VALIDATION + PENDENCIAS + STATE + gate), mas o commit `ef99d5b` entregou também a implementação de contato flexível e da orquestração multicanal — trabalho nominalmente das waves anteriores.

O histórico do git torna isso visível: `ef99d5b` (05-05) é **anterior** aos commits da Phase 04 e ao `1a75c44` (05-04). O `05-04-SUMMARY.md` foi escrito depois e usa o verbo "Confirmada a atualização de…" — ele documenta código que o `ef99d5b` já havia entregue, não código que o próprio 05-04 escreveu. Quem for reconstituir a autoria da orquestração multicanal deve olhar `ef99d5b`, não `1a75c44`.

**Total de desvios:** 1 (escopo absorvido de waves anteriores)
**Impacto no plano:** nenhum retrabalho ou scope creep no produto — o desalinhamento é de atribuição entre planos, não de código a mais.

## Issues Encountered

1. **Balde de telefone não cobre o agendamento só-com-e-mail.** Quando o cliente informa apenas e-mail, a camada `escrita_telefone` é pulada por falta de chave. Restam o balde por IP e o `teto_tenant` — ou seja, a superfície anti-abuso construída na Phase 03 ficou um degrau mais rasa para esse caminho. Não é regressão de teste (a suíte cobre o comportamento como especificado), é uma consequência de design da Fase 05 que ninguém registrou. Candidato natural: um balde por e-mail normalizado, espelhando o de telefone.
2. **Plano de fechamento sem SUMMARY**, mesmo padrão do `04-06` — o plano escreve VALIDATION, atualiza STATE/ROADMAP e não produz o próprio resumo.

## User Setup Required

Quatro verificações de UAT do owner em `docs/PENDENCIAS.md` § "📱 Verificações Manuais de UAT do Booking com Contato Flexível (Phase 5)". Dependem do webhook do Resend e do DNS pendentes da Phase 04 para o caminho de e-mail.

## Next Phase Readiness

Booking público aceita WhatsApp, e-mail ou ambos, com deduplicação de cliente por qualquer um dos dois e confirmação pelo canal informado. Base pronta para a Phase 06 (agenda densa).

**Concern aberto:** o item 1 de "Issues Encountered" — cobertura anti-abuso do caminho só-e-mail.

---
*Phase: 05-contato-flexivel-no-booking*
*Executado: 2026-08-08 · SUMMARY reconstruído: 2026-08-13*
