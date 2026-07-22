---
phase: 01-hardening-da-superf-cie-p-blica
plan: 07
subsystem: testing
tags: [vitest, supabase, integration-test, booking-publico, server-actions, hermeticidade]

# Dependency graph
requires:
  - phase: 01-hardening-da-superf-cie-p-blica (plano 01-02)
    provides: "Contrato por slug das Server Actions públicas (tenantId → slug, per D-04) e a cópia da caixa de erro de slots"
  - phase: 01-hardening-da-superf-cie-p-blica (planos 01-01 e 01-04)
    provides: "REVOKE total de anon e policies tenant-scoped — o regime sob o qual a escrita precisava ser provada"
provides:
  - "Suíte de integração do caminho de ESCRITA do booking público, contra o Supabase de dev"
  - "Comando `pnpm test:integracao` — único ponto de entrada, REPROVA em vez de pular sem credenciais"
  - "`resolve.alias` no vitest: qualquer suíte futura pode importar de `src/app/` por `@/`"
  - "`exclude` condicional que mantém `pnpm test` hermético (sem rede, sem banco)"
affects: [01-06, 01-08, 01-09, phase-02-agenda, qualquer fase que escreva teste sobre src/app]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Teste de integração opt-in por variável de ambiente, fora do glob padrão"
    - "Sentinela que reprova em vez de pular quando a prova é exigida"
    - "Asserção de FONTE para pinar acoplamento por substring entre módulos não importáveis juntos"

key-files:
  created:
    - src/app/actions/__tests__/public-booking-escrita.test.ts
  modified:
    - vitest.config.ts
    - package.json
    - docs/PENDENCIAS.md

key-decisions:
  - "pnpm test continua hermético por desenho: a suíte de integração fica fora do glob padrão e a contagem permanece 13 arquivos / 196 testes — contagem que NÃO cresce é a prova, não o sintoma"
  - "Tenant de teste determinístico (org_teste_integracao_booking) em vez de sufixo aleatório: execução que morre no meio não acumula lixo no banco"
  - "Horário do agendamento sai da própria engine (obterSlotsPublicos), nunca de literal cravado — é o que exercita a validação por igualdade exata em vez de contorná-la"
  - "Acoplamento produtor↔consumidor pinado por asserção de FONTE: BookingApp.tsx não é importável numa suíte de servidor, então o teste lê o arquivo do disco"
  - "CAMINHO_ENV_LOCAL é o mecanismo de provar a sentinela sem mover, renomear ou escrever no .env.local real"
  - "Gate do tracer aplicado no modo autônomo (plano é autonomous: true e o <verify> da Task 1 é 100% automatizado): verify re-executado ponta a ponta duas vezes antes de qualquer task de expansão"

patterns-established:
  - "Suíte que toca banco: opt-in por EXIGIR_INTEGRACAO=1, dono único no script npm, sentinela que reprova, limpeza antes E depois"
  - "Credencial lida de arquivo por NOME da variável; valor nunca entra em log, expect, snapshot ou Error.message"

requirements-completed: [SEG-01, SEG-02]

coverage:
  - id: D1
    description: "criarAgendamentoPublico cria cliente novo, grava o agendamento e devolve a linha pelo RETURNING sob as policies e privilégios pós-Phase 1"
    requirement: SEG-01
    verification:
      - kind: integration
        ref: "src/app/actions/__tests__/public-booking-escrita.test.ts#cria cliente novo e grava o agendamento, devolvendo a linha pelo RETURNING"
        status: pass
    human_judgment: false
  - id: D2
    description: "Contrato por slug provado ponta a ponta: as duas Server Actions públicas recebem slug e resolvem o tenant_id no servidor"
    requirement: SEG-01
    verification:
      - kind: integration
        ref: "pnpm test:integracao (as 5 chamadas de action da suíte passam apenas slug — nenhum tenant_id vem do chamador)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Cliente existente reaproveitado por telefone: segundo agendamento com o mesmo número não cria segunda linha em clientes"
    requirement: SEG-01
    verification:
      - kind: integration
        ref: "src/app/actions/__tests__/public-booking-escrita.test.ts#reaproveita o cliente existente pelo telefone, em vez de duplicar a linha"
        status: pass
    human_judgment: false
  - id: D4
    description: "Sanitização de telefone: entrada formatada grava só dígitos em clientes.telefone"
    requirement: SEG-01
    verification:
      - kind: integration
        ref: "src/app/actions/__tests__/public-booking-escrita.test.ts#cria cliente novo e grava o agendamento, devolvendo a linha pelo RETURNING"
        status: pass
    human_judgment: false
  - id: D5
    description: "Acoplamento por substring pinado nas DUAS pontas: a action produz 'já foi preenchido' e BookingApp.tsx casa exatamente essa substring"
    requirement: SEG-02
    verification:
      - kind: integration
        ref: "src/app/actions/__tests__/public-booking-escrita.test.ts#rejeita horário já ocupado sem gravar nada, com a mensagem que a UI reconhece"
        status: pass
      - kind: integration
        ref: "src/app/actions/__tests__/public-booking-escrita.test.ts#mantém o acoplamento de string casando nas DUAS pontas (action ↔ BookingApp)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Cópia da caixa de erro de slots produzida verbatim quando o slug não resolve, sem vazar slug/tenant/org_/PGRST"
    requirement: SEG-02
    verification:
      - kind: integration
        ref: "src/app/actions/__tests__/public-booking-escrita.test.ts#produz a cópia exata da caixa de erro de slots quando o slug não resolve"
        status: pass
    human_judgment: false
  - id: D7
    description: "pnpm test permanece hermético: a suíte de integração fica fora do glob padrão do vitest por desenho"
    requirement: SEG-02
    verification:
      - kind: integration
        ref: "EXIGIR_INTEGRACAO= pnpm vitest list <suíte> | grep -c 'public-booking-escrita' → 0; pnpm test → 13 arquivos / 196 testes (idêntico à linha de base)"
        status: pass
    human_judgment: false
  - id: D8
    description: "pnpm test:integracao REPROVA em vez de pular quando faltam credenciais (banner em stderr + sentinela que falha)"
    requirement: SEG-02
    verification:
      - kind: integration
        ref: "CAMINHO_ENV_LOCAL=.env.inexistente pnpm test:integracao → exit 1, sentinela nomeando as duas variáveis"
        status: pass
    human_judgment: false
  - id: D9
    description: "Recuperação VISUAL do double-booking no navegador — aviso âmbar, grade refeita, cliente de volta na etapa de data/hora"
    verification: []
    human_judgment: true
    rationale: "Backstop declarado no próprio plano: a suíte cobre só o lado servidor do acoplamento. A tela exige olho humano e permanece em docs/PENDENCIAS.md §'UAT humano pendente da Phase 1'."
  - id: D10
    description: "Caixa vermelha de erro de slots renderizada com role=alert e botão 'Tentar de novo' funcionando"
    verification: []
    human_judgment: true
    rationale: "O teste prova que a action produz a string certa, não que a UI a renderiza. Item mantido aberto em docs/PENDENCIAS.md."

# Metrics
duration: ~28min
completed: 2026-07-22
status: complete
---

# Phase 01 Plan 07: Suíte de integração da escrita do booking público Summary

**Teste de integração em vitest que cria um agendamento real contra o Supabase de dev — do slug ao `RETURNING` — com `pnpm test` permanecendo hermético em 13 arquivos / 196 testes por desenho.**

## Performance

- **Duration:** ~28 min
- **Started:** 2026-07-22T13:54:00Z (aprox.)
- **Completed:** 2026-07-22T14:22:10Z
- **Tasks:** 3
- **Files modified:** 4 (1 criado, 3 modificados)

## Accomplishments

- **O Gap 2 da `01-VERIFICATION.md` (SC2b) deixa de ser `PRESENT_BEHAVIOR_UNVERIFIED` no lado servidor.** O caminho de escrita — lookup/criação de cliente por telefone, INSERT do agendamento e o `RETURNING` sob as policies e privilégios pós-Phase 1 — passou de dívida de olho humano a comando que roda em toda alteração.
- **Cinco casos de integração** cobrindo: criação com cliente novo, reaproveitamento por telefone, rejeição de double-booking sem gravar nada, o acoplamento de string nas duas pontas (action ↔ `BookingApp.tsx`) e a cópia exata da caixa de erro de slots.
- **`pnpm test` continua sem tocar rede nem banco.** O `exclude` condicional do `vitest.config.ts` tira a suíte do glob padrão; quem quer a prova de escrita chama `pnpm test:integracao`, que é explícito sobre o que faz.
- **Descoberta bloqueante do plano confirmada e resolvida:** o `vitest.config.ts` não tinha `resolve.alias`. Sem ele, `public-booking.ts` (que importa por `@/lib/…`) nem carregaria — nenhuma suíte de `src/app/` era possível até agora.

## Task Commits

Cada task foi commitada atomicamente:

1. **Task 1 (tracer): Fatia ponta a ponta — um agendamento público real, do slug à linha no banco** — `d886446` (test)
2. **Task 2: Reaproveitamento por telefone, rejeição de double-booking e o acoplamento nas duas pontas** — `4230ec0` (test)
3. **Task 3: Cópia da caixa de erro de slots, comando dedicado que reprova, e Definition of Done** — `b148270` (test)

## Files Created/Modified

- `src/app/actions/__tests__/public-booking-escrita.test.ts` — **criado.** Suíte de integração (5 casos) + sentinela que nunca é pulada. Símbolos internos: `TENANT_TESTE`, `lerCredenciaisSupabase()`, `prepararTenantDeTeste()`, `limparTenantDeTeste()`, `TRECHO_DOUBLE_BOOKING`, `COPIA_ERRO_SLOTS`.
- `vitest.config.ts` — `resolve.alias` mapeando `@` → `./src` via `fileURLToPath(new URL('./src', import.meta.url))`, e `exclude` condicional espalhando `configDefaults.exclude` mais a suíte de integração quando `EXIGIR_INTEGRACAO !== '1'`.
- `package.json` — script `test:integracao` (alteração restrita a `scripts`; `pnpm-lock.yaml` intocado).
- `docs/PENDENCIAS.md` — três itens do UAT humano da Phase 1 reduzidos ao que sobrou: o lado visual.

## Provas — saída real

### `pnpm test:integracao` (5 casos de integração + sentinela)

```
$ EXIGIR_INTEGRACAO=1 vitest run src/app/actions/__tests__/public-booking-escrita.test.ts

 RUN  v4.1.10 /mnt/Files/VamoAgendar/vamo-agendar-app

 Test Files  1 passed (1)
      Tests  6 passed (6)
   Start at  10:21:37
   Duration  6.81s (transform 77ms, setup 0ms, import 122ms, tests 6.59s, environment 0ms)

INTEGRACAO_EXIT=0
```

Detalhamento por caso (reporter verbose, **0 pulados**):

```
 ✓ … > sentinela da suíte de integração > reprova (em vez de pular) quando EXIGIR_INTEGRACAO=1 e não há credenciais 2ms
 ✓ … > escrita do booking público (EXIGE credenciais do Supabase de dev) > cria cliente novo e grava o agendamento, devolvendo a linha pelo RETURNING 1531ms
 ✓ … > escrita do booking público (EXIGE credenciais do Supabase de dev) > reaproveita o cliente existente pelo telefone, em vez de duplicar a linha 1324ms
 ✓ … > escrita do booking público (EXIGE credenciais do Supabase de dev) > rejeita horário já ocupado sem gravar nada, com a mensagem que a UI reconhece 802ms
 ✓ … > escrita do booking público (EXIGE credenciais do Supabase de dev) > mantém o acoplamento de string casando nas DUAS pontas (action ↔ BookingApp) 3ms

 Test Files  1 passed (1)
      Tests  5 passed (5)
```

*(o verbose acima foi capturado ao fim da Task 2, com 4 casos de integração; a Task 3 acrescentou o quinto — a cópia da caixa de erro de slots — fechando em 6 testes com a sentinela.)*

### Idempotência — duas execuções seguidas

```
--- run 1 ---
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  10:15:40
   Duration  3.06s (transform 76ms, setup 0ms, import 122ms, tests 2.84s, environment 0ms)

--- run 2 (idempotencia) ---
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  10:15:45
   Duration  3.23s (transform 63ms, setup 0ms, import 103ms, tests 3.04s, environment 0ms)
```

Mesmo resultado nas duas — a fixture roda a limpeza **antes** de criar, então execução anterior morta no meio não envenena a seguinte. Confirmado de novo ao fim do plano: `pnpm test:integracao` verde duas vezes (10:18:44 e 10:21:37).

### O comando REPROVA sem credenciais (sem tocar no `.env.local` real)

```
$ CAMINHO_ENV_LOCAL=.env.inexistente pnpm test:integracao

+------------------------------------------------------------------------+
| SUÍTE DE INTEGRAÇÃO DO BOOKING PÚBLICO — NÃO EXECUTADA
|
| O caminho de ESCRITA do booking público (lookup/criação de cliente,
| INSERT do agendamento e o RETURNING sob as policies da Phase 1) NÃO
| foi verificado nesta execução.
|
| Motivo: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY
| não encontradas em .env.inexistente.
|
| Para verificar de verdade: pnpm test:integracao
+------------------------------------------------------------------------+

 ❯ src/app/actions/__tests__/public-booking-escrita.test.ts (6 tests | 1 failed | 5 skipped) 8ms
     × reprova (em vez de pular) quando EXIGIR_INTEGRACAO=1 e não há credenciais 7ms

AssertionError: EXIGIR_INTEGRACAO=1 exige a suíte de integração, mas NEXT_PUBLIC_SUPABASE_URL
e/ou SUPABASE_SECRET_KEY não foram encontradas em ".env.inexistente". O caminho de ESCRITA
do booking público NÃO foi verificado.: expected false to be true // Object.is equality

 Test Files  1 failed (1)
      Tests  1 failed | 5 skipped (6)

[ELIFECYCLE] Command failed with exit code 1.
EXIT_CODE=1
```

Só os **nomes** das variáveis aparecem — nenhum valor, comprimento, prefixo ou hash, em ramo nenhum. O `.env.local` real não foi movido, renomeado nem escrito em momento algum.

### Hermeticidade — a contagem que NÃO cresce é a prova

```
$ EXIGIR_INTEGRACAO= pnpm vitest list src/app/actions/__tests__/public-booking-escrita.test.ts | grep -c 'public-booking-escrita'
0
```

Sem a variável, a suíte **não é coletada** pelo glob padrão. Consequência direta:

```
$ pnpm test

 Test Files  13 passed (13)
      Tests  196 passed (196)
   Start at  10:21:01
   Duration  442ms (transform 800ms, setup 0ms, import 1.20s, tests 300ms, environment 1ms)

TEST_EXIT=0
```

**13 arquivos / 196 testes — idêntico à linha de base da fase.** Uma contagem que não cresce depois de um plano que adiciona teste parece erro à primeira vista; aqui é o contrário. É a prova de que a Definition of Done do projeto continua sem escrever no Supabase de dev, e de que nenhum `pnpm test` de nenhuma fase futura passou a tocar o banco (nem apaga a fixture de uma execução concorrente).

### Demais critérios de aceite, por comando

```
grep -c resolve vitest.config.ts:                1   (≥ 1 exigido)
contem alias:                                    2
grep -c EXIGIR_INTEGRACAO vitest.config.ts:      2   (≥ 1 exigido)
espalha ...configDefaults.exclude:               1   (defaults do vitest preservados)
grep -c vi.mock no teste:                        2   (exatamente 2 — mensageria e analytics)
select('*') no caminho publico:                  0   (projeções explícitas intactas)
grep -c TRECHO_DOUBLE_BOOKING no teste:          4   (≥ 3 exigido)
'já foi preenchido' em BookingApp.tsx:           1
'já foi preenchido' em public-booking.ts:        1
grep -c test:integracao package.json:            1
git diff --stat pnpm-lock.yaml:                  (vazio — nenhuma dependência nova)
```

`git diff package.json` mostra alteração **apenas** dentro de `scripts`:

```
-    "test": "vitest run"
+    "test": "vitest run",
+    "test:integracao": "EXIGIR_INTEGRACAO=1 vitest run src/app/actions/__tests__/public-booking-escrita.test.ts"
```

### Limpeza — banco sem resíduo depois da suíte

Consulta explícita ao Supabase de dev após a última execução:

```
agendamentos: 0 | clientes: 0 | perfis: 0 | servicos: 0 | horarios: 0
```

(`where tenant_id = 'org_teste_integracao_booking'`). Conferido três vezes: após a Task 1, após a Task 2 e após a execução final. Nenhum tenant real foi lido ou escrito.

### Definition of Done do projeto

```
########## pnpm lint ##########
$ eslint
LINT_EXIT=0

########## pnpm test ##########
 Test Files  13 passed (13)
      Tests  196 passed (196)
TEST_EXIT=0

########## pnpm build ##########
 Running TypeScript ...
 Finished TypeScript in 4.8s ...
 Collecting page data using 11 workers ...
 ✓ Generating static pages using 11 workers (14/14) in 443ms
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
│ ├ /para/designer-de-sobrancelhas
│ ├ /para/lash-designer
│ ├ /para/manicure
│ └ /para/barbeiro
├ ƒ /sign-in/[[...sign-in]]
└ ƒ /sign-up/[[...sign-up]]

BUILD_EXIT=0
```

Os três rodaram sobre o HEAD commitado (`b148270`), depois de o hook de prettier reformatar os arquivos.

## Decisions Made

- **Gate do tracer aplicado no modo autônomo, não como checkpoint humano.** O plano declara `autonomous: true` e o `<verify>` da Task 1 é 100% automatizado — não há nada visual para um humano avaliar. Em vez de parar a fase para dizer "um teste automatizado passou", o `<verify>` foi re-executado ponta a ponta **duas vezes** antes de qualquer task de expansão (saídas acima). Se tivesse falhado, o plano teria parado ali.
- **`vi.mocked(...)` evitado de propósito.** O critério de aceite exige `grep -c "vi.mock"` retornando **exatamente 2**, e `vi.mocked` contém `vi.mock` como substring — usar o helper inflaria a contagem para 3 e a checagem passaria a medir a coisa errada. A asserção sobre a chamada da mensageria usa `toHaveBeenCalledWith(expect.anything(), expect.objectContaining({…}))`.
- **O segundo agendamento (reaproveitamento por telefone) refaz a grade em vez de escolher um slot fixo.** Depois do primeiro agendamento a engine devolve outro primeiro slot livre; consumir essa saída garante horário livre sem aritmética de horário no teste — e o próprio teste assere que o slot obtido é diferente do ocupado.
- **Nenhuma linha em `assinaturas` na fixture, de propósito.** O plano vigente vira `gratuito`, o slug efetivo vira o `slug_gratuito`, e é por ele que todas as chamadas passam — exercitando `obterPlanoVigentePublico` + `obterSlugEfetivo` de verdade em vez de contorná-los.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] `docs/PENDENCIAS.md` atualizado (item 6 da Definition of Done do `CLAUDE.md`)**

- **Found during:** Task 3
- **Issue:** O plano não pedia alteração em `docs/PENDENCIAS.md`, mas o item 6 da Definition of Done do projeto exige atualizá-lo quando a mudança cria ou **adia/reduz** tarefas. Três itens do UAT humano da Phase 1 tiveram o lado servidor coberto por este plano — deixá-los redigidos como se nada tivesse mudado faria o checklist mentir por excesso, exatamente o modo de falha que a fase já sofreu (prova lendo verde medindo a coisa errada), agora invertido.
- **Fix:** Os itens "Wizard completo", "Recuperação de double-booking" e "Caixa de erro de slots" foram reduzidos ao que de fato sobrou — o comportamento **na tela** —, com nota explícita de que o lado servidor virou `pnpm test:integracao`. Nenhum item foi marcado como concluído; o que continua aberto continua aberto e não aprovado.
- **Files modified:** `docs/PENDENCIAS.md`
- **Verification:** `pnpm lint` / `pnpm test` / `pnpm build` verdes após a alteração
- **Committed in:** `b148270` (commit da Task 3)

---

**Total deviations:** 1 auto-fixed (1 missing critical / conformidade com CLAUDE.md)
**Impact on plan:** A alteração é documental e obrigatória pela Definition of Done do projeto. Nenhuma linha de produção foi tocada, nenhuma mensagem de erro das actions públicas foi reescrita, nenhuma dependência nova. Sem scope creep.

## Issues Encountered

**Nenhum bloqueio.** Dois pontos que exigiram cuidado durante a execução:

- **`grep -c "vi.mock"` colidindo com `vi.mocked`** — descrito em Decisions Made. Resolvido trocando a forma da asserção, não afrouxando o critério.
- **Ordem da limpeza confirmada na prática.** `agendamentos.servico_id` é `ON DELETE RESTRICT`; apagar `perfis_empresas` primeiro dispararia cascata simultânea em `servicos` e `agendamentos`. A ordem `agendamentos` → `clientes` → `perfis_empresas` (com a cascata do perfil resolvendo `servicos` e `horarios_funcionamento`) rodou limpa nas seis execuções.

## Known Stubs

Nenhum. Nenhum valor vazio codificado, nenhum `TODO`/`FIXME`, nenhum `t.skip`. Os 5 casos de integração executam contra o banco de verdade.

## Suposições do probe de edge — estado após este plano

- **[A-SEG-01 — `concurrency`, NÃO resolvida]** Continua aberta, como o plano previu. O caso de double-booking desta suíte é sequencial por construção: o primeiro agendamento é gravado, e só então o segundo tenta o mesmo `datetime`. Duas requisições **simultâneas** ainda podem gerar dois agendamentos ativos sobrepostos — a janela vai da leitura da engine ao INSERT, está reconhecida em `docs/PENDENCIAS.md` §"Prevenção atômica de double-booking" e é escopo de AGE-03 na Phase 2. Nenhum teste de concorrência foi escrito aqui: ele reprovaria por um defeito conhecido e planejado para outra fase.
- **[A-SEG-02 — `unclassified`, NÃO resolvida]** A suíte prova que o caminho público continua lendo e escrevendo o que precisa **com o cliente privilegiado** depois do `REVOKE` total de `anon`, mas não prova nada sobre a superfície `anon` em si — isso é o `scripts/verificar-superficie-anon.sh`, re-executado no plano 01-09.

## O que este plano NÃO cobre (declarado, não escondido)

O `must_haves` traz isto como backstop e ele continua verdadeiro: **a suíte cobre o lado servidor, não a tela.** Permanecem em `docs/PENDENCIAS.md` §"UAT humano pendente da Phase 1":

- O wizard no navegador (serviço → data/hora → nome + WhatsApp → "Horário confirmado!").
- A **recuperação visual** do double-booking: aviso âmbar, grade refeita, cliente de volta na etapa de data/hora. O acoplamento de string que a sustenta está pinado nas duas pontas; o que o teste não vê é a tela reagindo.
- A caixa vermelha de erro de slots com `role="alert"` e o botão "Tentar de novo". O teste prova que a action produz a string exata; não que a UI a renderiza.

## Threat Flags

Nenhum. Nenhuma superfície nova de rede, auth, acesso a arquivo ou schema em fronteira de confiança foi introduzida — o único acesso a arquivo novo é leitura de `.env.local` (T-01-23, já no registro do plano, com a mitigação implementada: leitura restrita a duas variáveis por nome, valor nunca propagado) e leitura de dois arquivos-fonte do próprio repo para a asserção de acoplamento.

## User Setup Required

Nenhum. Não há serviço externo novo para configurar. `pnpm test:integracao` usa as credenciais que já existem em `.env.local`.

## Next Phase Readiness

**Pronto para o plano 01-06** (próximo da serialização estrita: 01-07 → 01-06 → 01-08 → 01-09).

O que este plano entrega para os seguintes, e por que ele tinha que vir primeiro:

- **01-06 e 01-08** rodam `pnpm test` na Definition of Done e agora encontram o `exclude` condicional no lugar — a contagem de 13 arquivos / 196 testes é a linha de base estável que eles vão comparar.
- **01-08** conta *quantos tenants distintos têm serviço ativo*: a fixture `org_teste_integracao_booking` é criada e destruída dentro da própria suíte e a contagem no banco está em **0** neste momento. Ainda assim, **não rodar `pnpm test:integracao` concorrentemente com o 01-08** — envenenaria a contagem para o lado de parecer certa.
- **01-09** pode chamar `pnpm test:integracao` no gate: o comando existe, sai 0 com credenciais e ≠ 0 sem elas.

**Sem blockers novos.** O que continua aberto é o UAT humano da Phase 1, agora com três itens reduzidos ao lado visual.

---
*Phase: 01-hardening-da-superf-cie-p-blica*
*Completed: 2026-07-22*
