---
phase: 01-hardening-da-superf-cie-p-blica
plan: 10
subsystem: api
tags: [next.js, server-actions, rsc-flight, error-handling, vitest, bash-harness]

requires:
    - phase: 01-hardening-da-superf-cie-p-blica (planos 01-01..01-09)
      provides: 'resolução por slug com `createAdminClient()`, cópias travadas no 01-UI-SPEC, suíte de integração do caminho de escrita, precedente de harness contra `next start` (01-05/01-06)'
provides:
    - 'Harness executável que prova a travessia de erro esperado pela fronteira de flight em build de produção'
    - '`MotivoPublico` — discriminante fechado de sete literais para as falhas esperadas do fluxo público'
    - '`ResolucaoPerfil` / `ResultadoSlots` — uniões discriminadas que substituem `null` e `throw`'
    - '`src/app/book/[slug]/mensagens.ts` — cópias públicas do booking com fonte única (tela + teste)'
    - 'Suíte hermética que pina as cópias contratadas pelo 01-UI-SPEC'
affects: [01-12, phase-02, agendamento, double-booking]

tech-stack:
    added: []
    patterns:
        - 'Erro ESPERADO é valor de retorno discriminado; `throw` só onde nenhum `catch` de cliente consome a `.message`'
        - 'Cópia de UI mora no cliente, numa constante única que alimenta a tela e a asserção'
        - 'Harness de fronteira contra `next start` com o id da Server Action derivado do manifesto do build'

key-files:
    created:
        - scripts/verificar-travessia-server-action.sh
        - src/app/book/[slug]/mensagens.ts
        - src/app/book/__tests__/mensagens.test.ts
    modified:
        - src/app/actions/public-booking.ts
        - src/app/book/[slug]/BookingApp.tsx
        - src/app/actions/__tests__/public-booking-escrita.test.ts

key-decisions:
    - 'Os `export type` ficaram no próprio `public-booking.ts` — o build aceitou tipos exportados de módulo `use server` (são apagados em runtime), então `contrato-publico.ts` não foi necessário'
    - '`mensagemDeMotivo` mapeia TODOS os sete motivos para a mesma `COPY_ERRO_SLOTS` porque a caixa de horários tem uma cópia contratada só; as cópias do caminho de escrita ficam na action até o 01-12 para não criar duas fontes da mesma string'
    - '`resolverPerfilPublicoPorSlug` passou a devolver `ResolucaoPerfil`, mas os dois outros chamadores mantiveram o comportamento externo (throw em `criarAgendamentoPublico`, `null` em `obterDadosBookingPublico`) — a conversão deles é o 01-12'
    - 'O tipo da linha de perfil é DERIVADO da consulta (`NonNullable<Awaited<ReturnType<typeof lerPerfilPor>>[\'data\']>`) em vez de escrito à mão: sem tipos gerados do banco, anotar a forma à mão quebraria `page.tsx` e mentiria sobre nulabilidade'

patterns-established:
    - 'Harness de fronteira: id de Server Action sempre derivado de `.next/server/server-reference-manifest.json`, nunca literal — id colado à mão sobrevive à refatoração que o invalida e deixa o harness verde para sempre'
    - 'Sonda de action sem `Next-Router-State-Tree`: o Next responde só o resultado da action, o que torna a asserção sobre o corpo legível e não ambígua'

requirements-completed: [SEG-01]

coverage:
    - id: D1
      description: 'Um erro esperado de `obterSlotsPublicos` atravessa a fronteira de flight em build de produção com o discriminante `slug_invalido` preservado, sem `digest` opaco'
      requirement: 'SEG-01'
      verification:
          - kind: e2e
            ref: 'bash scripts/verificar-travessia-server-action.sh (vereditos PREPARO, CONTROLE, SLOTS_ERRO)'
            status: pass
      human_judgment: false
    - id: D2
      description: 'Nenhum valor de retorno da action pública carrega slug do visitante, `org_`, `PGRST` ou `tenant_id`'
      requirement: 'SEG-01'
      verification:
          - kind: e2e
            ref: 'bash scripts/verificar-travessia-server-action.sh (veredito SEM_VAZAMENTO)'
            status: pass
          - kind: integration
            ref: "src/app/actions/__tests__/public-booking-escrita.test.ts#devolve { ok: false, motivo: \"slug_invalido\" } — sem rejeitar — quando o slug não resolve"
            status: pass
      human_judgment: false
    - id: D3
      description: 'As cópias contratadas pelo 01-UI-SPEC continuam byte-idênticas depois da mudança de transporte'
      verification:
          - kind: unit
            ref: 'src/app/book/__tests__/mensagens.test.ts#mantém a cópia da caixa de erro de slots byte a byte'
            status: pass
          - kind: unit
            ref: 'src/app/book/__tests__/mensagens.test.ts#mantém a cópia de fallback do cliente byte a byte'
            status: pass
      human_judgment: false
    - id: D4
      description: 'A caixa vermelha com `role="alert"` e o botão `Tentar de novo` renderizam a cópia contratada na tela do cliente final'
      verification: []
      human_judgment: true
      rationale: 'Nenhum comando deste plano observa tela. A renderização é item da lista de UAT humano da Phase 1 (`docs/PENDENCIAS.md`) e só o owner fecha'
    - id: D5
      description: 'Lista de 20+ serviços rola dentro do container; `horizonte_maximo_dias` alto não quebra `snap-x` no mobile nem `lg:grid-cols-7` no desktop'
      verification: []
      human_judgment: true
      rationale: 'Backstop declarado no próprio plano (UI-SPEC §UI Considerations #6 e #13) — exige tenant extremo e olho humano; este plano não tocou em nenhum dos dois componentes'

duration: 33min
completed: 2026-07-22
status: complete
---

# Phase 01 Plano 10: Travessia de erro esperado pela fronteira de Server Action

**O erro esperado do booking público deixou de virar `digest` opaco em produção: `obterSlotsPublicos` devolve `{ ok: false, motivo: 'slug_invalido' }`, o `BookingApp` decide pelo discriminante, e um harness contra `next start` prova a travessia — ele reprovava antes do conserto e aprova depois.**

## Performance

- **Duration:** 33 min
- **Started:** 2026-07-22T13:16Z
- **Completed:** 2026-07-22T13:49Z
- **Tasks:** 2
- **Files modified:** 6 (3 criados, 3 modificados)

## Accomplishments

- **A falha foi reproduzida antes de ser consertada, com o mesmo dígito do verificador.** O harness rodou contra o HEAD `b50d7e1` e devolveu, no corpo da resposta, `1:E{"digest":"2760064589"}` — o mesmo valor que o `01-VERIFICATION.md` registrou. Não é inferência: é a mesma medição, reproduzida por comando.
- **O transporte do erro mudou, a redação não.** As duas cópias do `01-UI-SPEC` (`Não foi possível carregar os horários. Tente de novo.` e `Erro ao carregar horários disponíveis.`) estão byte-idênticas; o que mudou é onde moram.
- **`resolverPerfilPublicoPorSlug` parou de colapsar duas condições diferentes em `null`.** "Slug não existe" (negócio, não vai ao Sentry) e "não consegui ler" (infra, vai ao Sentry) agora são discriminantes distintos — antes, indisponibilidade do banco virava 404 silencioso.
- **A asserção que dava verde num caminho morto foi removida.** O caso que lia a FONTE de `BookingApp.tsx` com `readFileSync` era item explícito da lista `missing` do gap 2; quem cobre isso agora é o harness, contra build de produção.

## Task Commits

1. **Task 1 (tracer): Uma condição de erro atravessa a fronteira de flight, ponta a ponta** — `20cbb42` (fix)
2. **Task 2: A cobertura para de dar verde num caminho morto** — `b702096` (test)

## Medição do harness ANTES de qualquer edição em `src/`

Execução real contra o HEAD `b50d7e1`, com `pnpm build` completo, antes de tocar em um único arquivo de `src/`:

```
Verificação da travessia de erro esperado pela fronteira de Server Action
Action alvo: obterSlotsPublicos   |   Porta: 3992

  … rodando pnpm build (pode levar ~1 min)
  [APROVADO]  PREPARO        id de obterSlotsPublicos derivado de .next/server/server-reference-manifest.json (prefixo 70efdce3…)
  [APROVADO]  CONTROLE       GET / devolveu 200 e o processo seguiu vivo
  [REPROVADO] SLOTS_ERRO     contém slug_invalido=0 (exigido 1), contém digest=1 (exigido 0) — corpo observado: 0:{"a":"$@1","f":"","q":"","i":false,"b":"QT6WDroutuVqdWeKrfuHf"}|1:E{"digest":"2760064589"}
  [APROVADO]  SEM_VAZAMENTO  o corpo não carrega o slug do visitante, nem org_, nem PGRST, nem tenant_id

Resumo: 4 vereditos, 1 REPROVADO(S):
  - SLOTS_ERRO — contém slug_invalido=0 (exigido 1), contém digest=1 (exigido 0) — corpo observado: 0:{"a":"$@1","f":"","q":"","i":false,"b":"QT6WDroutuVqdWeKrfuHf"}|1:E{"digest":"2760064589"}
EXIT=1
```

O corpo observado é o do `01-VERIFICATION.md`, dígito por dígito: `1:E{"digest":"2760064589"}`. O prefixo do id derivado (`70efdce3…`) também casa com o que o verificador extraiu do bundle.

## Medição do harness DEPOIS do conserto

```
Verificação da travessia de erro esperado pela fronteira de Server Action
Action alvo: obterSlotsPublicos   |   Porta: 3992

  … rodando pnpm build (pode levar ~1 min)
  [APROVADO]  PREPARO        id de obterSlotsPublicos derivado de .next/server/server-reference-manifest.json (prefixo 70efdce3…)
  [APROVADO]  CONTROLE       GET / devolveu 200 e o processo seguiu vivo
  [APROVADO]  SLOTS_ERRO     o corpo da resposta carrega o discriminante `slug_invalido` e nenhum `digest` opaco
  [APROVADO]  SEM_VAZAMENTO  o corpo não carrega o slug do visitante, nem org_, nem PGRST, nem tenant_id

Resumo: 4 vereditos, 0 reprovados — o erro esperado atravessa a fronteira com identidade preservada.
EXIT=0
```

## Saídas reais dos comandos de verificação

### `pnpm lint`

```
$ eslint
LINT_EXIT=0
```

### `pnpm test` (hermético)

```
$ vitest run

 RUN  v4.1.10 /mnt/Files/VamoAgendar/vamo-agendar-app


 Test Files  14 passed (14)
      Tests  204 passed (204)
   Start at  13:27:43
   Duration  432ms (transform 970ms, setup 0ms, import 1.33s, tests 289ms, environment 1ms)

TEST_EXIT=0
```

### `pnpm test:integracao`

```
$ EXIGIR_INTEGRACAO=1 vitest run src/app/actions/__tests__/public-booking-escrita.test.ts

 RUN  v4.1.10 /mnt/Files/VamoAgendar/vamo-agendar-app


 Test Files  1 passed (1)
      Tests  5 passed (5)
   Start at  13:27:15
   Duration  6.08s (transform 69ms, setup 0ms, import 110ms, tests 5.88s, environment 0ms)

EXIT=0
```

Estado RED intermediário registrado por honestidade: depois do commit da Task 1 e antes do commit da Task 2, `pnpm test:integracao` saía 1 com **4 testes reprovados** — a suíte de integração ainda esperava o contrato antigo. É a medição RED da Task 2 (a suíte hermética `mensagens.test.ts` não podia produzir RED genuíno porque o módulo que ela pina nasceu na Task 1, com o harness como prova de falha).

### `pnpm build`

```
✓ Compiled successfully in 5.2s
 Running next.config.js provided runAfterProductionCompile ...
✓ Completed runAfterProductionCompile in 9.6s
 Running TypeScript ...
 Finished TypeScript in 3.9s ...
 Collecting page data using 11 workers ...
✓ Generating static pages using 11 workers (14/14) in 417ms
 Finalizing page optimization ...

Route (app)
┌ ƒ /
├ ○ /_not-found
├ ƒ /api/webhooks/lembrete
├ ƒ /book/[slug]
├ ƒ /dashboard
├ ƒ /dashboard/agenda
├ ƒ /dashboard/plano
├ ƒ /dashboard/servicos
├ ƒ /dashboard/whatsapp
├ ● /para/[nicho]
├ ƒ /sign-in/[[...sign-in]]
└ ƒ /sign-up/[[...sign-up]]

BUILD_EXIT=0
```

## Critérios relativos: as duas medições

A regra da rodada é medir no início e no fim, e anotar os dois números.

| Critério | Início (medido agora) | Fim | Plano dizia | Situação |
|---|---|---|---|---|
| `grep -c 'throw new' src/app/actions/public-booking.ts` | 11 | 10 | 11 → 10 | ✅ exatamente um a menos |
| `grep -c 'toBeInstanceOf(Error)' …/public-booking-escrita.test.ts` | 2 | 1 | 2 → 1 | ✅ exatamente um a menos |
| `grep -c 'readFileSync(CAMINHO_BOOKING_APP' …` | 1 | 0 | 1 → 0 | ✅ alvo absoluto atingido |
| Arquivos em `pnpm test` | 13 | 14 | 13 → 14 | ✅ sobe exatamente 1 |
| Testes em `pnpm test` | 198 (376 ms no plano / 398 ms medido) | 204 (432 ms) | — | ✅ continua abaixo de 2 s |

Nenhuma medição inicial divergiu do que o plano registrou.

## Demais critérios de aceite (comandos e saídas)

| Critério | Comando | Resultado |
|---|---|---|
| Id não é literal no script | `grep -cE '\b[0-9a-f]{40,}\b' scripts/verificar-travessia-server-action.sh` | `0` |
| Harness não referencia arquivo de ambiente | `grep -cE '\.env' scripts/verificar-travessia-server-action.sh` | `0` |
| `setsid` só no cabeçalho de notas | `grep -vE '^\s*#' … \| grep -c 'setsid'` | `0` |
| Cópia saiu da action | `grep -c 'carregar os horários. Tente de novo' src/app/actions/public-booking.ts` | `0` |
| Cópia entrou no módulo do cliente | `grep -c '…' 'src/app/book/[slug]/mensagens.ts'` | `1` |
| Cópia mora em exatamente dois arquivos do fluxo público | `grep -rl 'carregar os horários. Tente de novo' src/` | `mensagens.ts` e `mensagens.test.ts` |
| Discriminante presente na action | `grep -c "'slug_invalido'" src/app/actions/public-booking.ts` | `4` (≥ 2) |
| Cópias B2B homônimas intactas | `grep -c 'carregar os horários de funcionamento' src/app/dashboard/page.tsx src/app/actions/agenda.ts` | `1` em cada; nenhum dos dois aparece em `git diff --name-only` |
| Igualdade estrita na suíte nova | `grep -c 'toBe(' src/app/book/__tests__/mensagens.test.ts` | `4` (≥ 2) |
| Ponto de entrada da integração intocado | `grep -c 'EXIGIR_INTEGRACAO' vitest.config.ts` | `2`; `vitest.config.ts` não aparece em `git diff --name-only` |

## Files Created/Modified

- `scripts/verificar-travessia-server-action.sh` (novo) — harness de quatro vereditos contra `next start`; deriva o id da Server Action do manifesto do build, sonda com `Next-Action` e assere sobre o CORPO da resposta.
- `src/app/book/[slug]/mensagens.ts` (novo) — `COPY_ERRO_SLOTS`, `COPY_ERRO_SLOTS_FALLBACK` e `mensagemDeMotivo`; fonte única das cópias públicas.
- `src/app/book/__tests__/mensagens.test.ts` (novo) — suíte hermética: igualdade estrita das duas cópias + asserção negativa iterando os exports do módulo.
- `src/app/actions/public-booking.ts` — `MotivoPublico`, `ResolucaoPerfil`, `ResultadoSlots`; `obterSlotsPublicos` devolve valor; `resolverPerfilPublicoPorSlug` distingue negócio de infra.
- `src/app/book/[slug]/BookingApp.tsx` — o `useEffect` de slots decide por `res.motivo`; o `catch` residual cobre só a rede caindo no meio do POST.
- `src/app/actions/__tests__/public-booking-escrita.test.ts` — asserção de fonte removida (com comentário explicando por que não voltar); caso de slug inexistente reescrito para o contrato novo.

## Decisions Made

- **Os tipos ficaram em `public-booking.ts`.** O plano previa mover para `contrato-publico.ts` se o build reclamasse. Não reclamou: `export type` em módulo `'use server'` é apagado em runtime e o `next build` aceitou (TypeScript concluído em 3.9 s, exit 0). Menos um arquivo.
- **`mensagemDeMotivo` mapeia os sete motivos para a mesma cópia, e isso é descrição honesta do estado, não preguiça.** A caixa de horários tem uma cópia contratada só, e o botão `Tentar de novo` é a única ação possível qualquer que seja a causa. O `Record<MotivoPublico, string>` sobre a união inteira é o que impede um membro novo compilar sem alguém decidir o que a tela diz. As cópias do caminho de escrita (que para `slug_invalido` são diferentes — `Estabelecimento inválido ou indisponível.`) continuam na action até o 01-12, porque duplicá-las agora criaria duas fontes da mesma string — o defeito que o módulo existe para impedir.
- **A linha de perfil é tipada por derivação, não à mão.** `NonNullable<Awaited<ReturnType<typeof lerPerfilPor>>['data']>` — sem tipos gerados do banco, escrever a forma à mão obrigaria a inventar nulabilidade e quebraria `page.tsx` (que passa `perfil.timezone` para uma prop `string`). A derivação preserva o comportamento atual e herda tipagem real de graça se ela existir um dia.
- **A leitura crua do perfil virou o helper `lerPerfilPor`.** Efeito colateral de precisar de um tipo derivável, mas também elimina a duplicação da query por `slug` e por `slug_gratuito`.

## Deviations from Plan

Nenhum desvio das regras 1–4. O plano foi executado como escrito, com dois ajustes de implementação que ele próprio autorizava (o caminho dos tipos) ou que decorrem dele (o helper `lerPerfilPor`), ambos registrados em Decisions Made.

## Issues Encountered

- **A suíte de integração ficou vermelha entre os dois commits.** Esperado e inerente à ordem tracer-primeiro do plano: a Task 1 troca o contrato de `obterSlotsPublicos` e a Task 2 é quem atualiza a suíte. Quatro testes reprovaram nesse intervalo — inclusive um por cascata (`slots[0].datetime` virou `undefined`, e a action respondeu `Preencha todos os campos obrigatórios.`), que é uma boa ilustração de por que o retorno discriminado precisa de um desembrulho explícito. Resolvido pelo helper `slotsLivresDaFixture`, que falha nomeando o `motivo` em vez de morrer três linhas adiante.
- **O gate de feedback do tracer foi resolvido por execução, não por checkpoint humano.** O plano declara `autonomous: true` e não tem nenhuma task de checkpoint; a verificação do tracer é um harness inteiramente automatizado, que rodou verde ponta a ponta antes de qualquer trabalho de expansão. Parar ali teria deixado `pnpm test:integracao` vermelho no repositório.

## User Setup Required

Nenhuma configuração de serviço externo. O harness usa quatro valores obviamente falsos escritos dentro do próprio script para as variáveis obrigatórias ausentes em dev — nenhum segredo é lido, sourceado ou impresso.

## Next Phase Readiness

- **O contrato que o 01-12 replica está de pé.** `MotivoPublico` já declara os sete literais, incluindo os cinco que só o caminho de escrita produz; o 01-12 converte `criarAgendamentoPublico` sem tocar no tipo.
- **A dívida que o 01-12 herda, escrita:** `BookingApp.tsx` ainda decide a recuperação de double-booking por `mensagem.includes('já foi preenchido')`, que continua sempre `false` em produção. Este plano não tocou nesse caminho de propósito. O `01-VERIFICATION.md` registra que a Phase 2 (Success Criteria 4) não consegue ser satisfeita enquanto isso não for trocado.
- **Não marcado, e não deve ser:** nenhum item da lista de UAT humano da Phase 1 foi fechado. A renderização da caixa vermelha com `role="alert"` na tela do cliente final continua pendente do olho do owner — este plano não observou tela nenhuma.

## Self-Check: PASSED

Arquivos criados conferidos em disco (`scripts/verificar-travessia-server-action.sh`, `src/app/book/[slug]/mensagens.ts`, `src/app/book/__tests__/mensagens.test.ts`) e commits conferidos em `git log` (`20cbb42`, `b702096`).

---

_Phase: 01-hardening-da-superf-cie-p-blica_
_Completed: 2026-07-22_
