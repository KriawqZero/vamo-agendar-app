---
phase: 01-hardening-da-superf-cie-p-blica
plan: 12
subsystem: api
tags: [next.js, server-actions, rsc-flight, error-handling, double-booking, vitest, bash-harness]

requires:
    - phase: 01-hardening-da-superf-cie-p-blica (plano 01-10)
      provides: '`MotivoPublico`, `ResolucaoPerfil`, `ResultadoSlots`, `mensagens.ts`, harness de travessia de quatro vereditos'
    - phase: 01-hardening-da-superf-cie-p-blica (plano 01-11)
      provides: 'chave HMAC fora da URL publicada; corpo de gateway fora do log'
provides:
    - '`ResultadoAgendamentoPublico` — união discriminada do caminho de ESCRITA do booking público'
    - 'Recuperação de double-booking decidida por discriminante, viva em build de produção'
    - '`mensagemDeEnvio` — mapeador exaustivo das nove cópias do caminho de escrita'
    - 'Veredito `ESCRITA_VALIDACAO` no harness de travessia (cinco vereditos, dois caminhos públicos)'
affects: [phase-02, agendamento, double-booking, 01-13]

tech-stack:
    added: []
    patterns:
        - 'Erro ESPERADO é valor de retorno discriminado nos DOIS caminhos públicos; `throw` só onde nenhum `catch` de navegador consome a `.message`'
        - 'Uma superfície de UI, um mapeador exaustivo — cópias diferentes para o mesmo discriminante exigem mapeadores diferentes, nunca reescrita de cópia'
        - 'Veredito de harness só entra depois de provado por contrafactual: reverter o conserto e medir a REPROVAÇÃO'

key-files:
    created: []
    modified:
        - src/app/actions/public-booking.ts
        - src/app/book/[slug]/mensagens.ts
        - src/app/book/[slug]/BookingApp.tsx
        - src/app/actions/__tests__/public-booking-escrita.test.ts
        - src/app/book/__tests__/mensagens.test.ts
        - scripts/verificar-travessia-server-action.sh

key-decisions:
    - 'DOIS mapeadores exaustivos em vez de um: `slug_invalido` tem cópias DIFERENTES e ambas travadas na caixa de horários e no envio, então um mapeador só obrigaria a reescrever uma delas — a única coisa que este plano proíbe. `mensagemDeMotivo` (leitura) fica intacto e nasce `mensagemDeEnvio` (escrita)'
    - '`erro_interno` mapeia para `COPY_ERRO_CONFIRMACAO`: o discriminante colapsa as três falhas de infraestrutura e a distinção não muda nada para o visitante. Ela sobrevive onde importa — no `etapa` do `reportarExcecao`. `COPY_ERRO_CONTATO` continua exportada e pinada por igualdade estrita'
    - 'A sonda de escrita do harness manda o slug PREENCHIDO e os demais campos vazios: dispara `campos_obrigatorios` (validação pura, antes de qualquer acesso ao banco) e ainda dá ao `SEM_VAZAMENTO` uma literal concreta para procurar'
    - 'O veredito `ESCRITA_VALIDACAO` foi provado por contrafactual antes de ser aceito: com a guarda revertida para `throw`, ele REPROVA com `1:E{"digest":"3871214289"}`'

requirements-completed: [SEG-01]

coverage:
    - id: D1
      description: '`criarAgendamentoPublico` devolve o discriminante do caminho de escrita através da fronteira de flight em build de produção, sem `digest` opaco'
      requirement: 'SEG-01'
      verification:
          - kind: e2e
            ref: 'bash scripts/verificar-travessia-server-action.sh (veredito ESCRITA_VALIDACAO)'
            status: pass
      human_judgment: false
    - id: D2
      description: 'Horário já ocupado resolve para `{ ok: false, motivo: "slot_indisponivel" }` sem rejeitar e sem gravar linha nenhuma'
      requirement: 'SEG-01'
      verification:
          - kind: integration
            ref: 'src/app/actions/__tests__/public-booking-escrita.test.ts#devolve { ok: false, motivo: "slot_indisponivel" } — sem rejeitar — no horário já ocupado, e não grava nada'
            status: pass
      human_judgment: false
    - id: D3
      description: 'Nenhum retorno das duas actions públicas carrega slug do visitante, `org_`, `PGRST` ou `tenant_id`'
      requirement: 'SEG-01'
      verification:
          - kind: e2e
            ref: 'bash scripts/verificar-travessia-server-action.sh (veredito SEM_VAZAMENTO, agora sobre os DOIS corpos)'
            status: pass
          - kind: integration
            ref: 'asserções negativas sobre `JSON.stringify(resultado)` no caso de slot ocupado'
            status: pass
      human_judgment: false
    - id: D4
      description: 'As nove cópias do caminho de escrita continuam byte-idênticas ao 01-UI-SPEC / ao texto anterior'
      verification:
          - kind: unit
            ref: 'src/app/book/__tests__/mensagens.test.ts (quatro casos de igualdade estrita novos)'
            status: pass
      human_judgment: false
    - id: D5
      description: 'A recuperação de double-booking acontece NA TELA: aviso âmbar, volta para data/hora, grade refeita, e o que o cliente digitou não se perde'
      verification: []
      human_judgment: true
      rationale: 'Nenhum comando deste plano observa tela. É o item "Recuperação de double-booking" da lista de UAT humano da Phase 1 (`docs/PENDENCIAS.md`) e só o owner fecha — a prohibition do plano diz isso explicitamente'
    - id: D6
      description: 'Nome de serviço, nome de cliente, `nome_estabelecimento`, `descricao` e `endereco` longos não quebram o layout (01-UI-SPEC §UI Considerations #17, #22, #24, #31)'
      verification: []
      human_judgment: true
      rationale: 'Backstops declarados no próprio plano — exigem tenant extremo e olho humano. Este plano não tocou em nenhum dos componentes de layout'

duration: 17min
completed: 2026-07-22
status: complete
---

# Phase 01 Plano 12: A recuperação de double-booking volta a acontecer na tela

**`criarAgendamentoPublico` devolve `{ ok, motivo }` em vez de lançar, `BookingApp` decide a recuperação pelo discriminante `slot_indisponivel`, e o harness ganhou um quinto veredito que prova a travessia do caminho de ESCRITA contra `next start` — provado por contrafactual: com a guarda revertida para `throw`, ele reprova com `digest` opaco.**

## Performance

- **Duration:** 17 min
- **Started:** 2026-07-22T17:53Z
- **Completed:** 2026-07-22T18:10Z
- **Tasks:** 3
- **Files modified:** 6 (0 criados, 6 modificados)

## Accomplishments

- **A dívida herdada do 01-10 foi paga com medição, não com afirmação.** `BookingApp.tsx:276` decidia a recuperação por `mensagem.includes('já foi preenchido')`. O `grep` do alvo absoluto agora devolve `0`, e o caminho novo está provado contra build de produção.
- **A conversão do tipo mostrou-se load-bearing no consumidor, e isso ficou medido.** Ao converter só a action (Task 1), o `pnpm build` apontou exatamente `BookingApp.tsx:274` — prova de que o acoplamento existia e de que o compilador agora o guarda. A saída vermelha está colada abaixo.
- **O veredito novo do harness foi provado ANTES de ser aceito.** Revertendo apenas a primeira guarda de `criarAgendamentoPublico` para `throw`, o `ESCRITA_VALIDACAO` reprovou com o corpo `1:E{"digest":"3871214289"}` — o mesmo formato opaco que o 01-10 mediu no caminho de leitura. Um veredito escrito depois do conserto e nunca visto vermelho não prova que mediria a falha.
- **Onze exceções viraram uma.** A única que sobrou é a de `obterDadosBookingPublico`, chamada de Server Component, com o motivo escrito ao lado e uma linha explícita dizendo por que não "consertá-la por simetria".
- **Sentry e funil sobreviveram à conversão, contados antes e depois.** Quatro `reportarExcecao` e três `capturarEventoTenant`, nos mesmos pontos e com os mesmos rótulos — era o risco T-01-12-03 do threat model, e a contagem é a trava.

## Task Commits

1. **Task 1: As dez exceções esperadas das actions de cliente viram valor discriminado** — `b1b610e` (refactor)
2. **Task 2: A recuperação de double-booking volta a acontecer na tela** — `dd7de12` (fix)
3. **Task 3: A travessia do caminho de escrita vira prova executável** — `3a48e3b` (test)

## Critérios relativos e absolutos: as duas medições

Todas as contagens foram medidas **antes do primeiro Edit**, sobre o HEAD `61a925f`.

| Critério | Início (medido) | Fim | Plano dizia | Situação |
|---|---|---|---|---|
| `grep -c 'throw new' src/app/actions/public-booking.ts` | 10 | **1** | 10 → 1 | ✅ sobra a de Server Component |
| `grep -c "motivo: '" src/app/actions/public-booking.ts` | 5 | **13** | ≥ 9 | ✅ |
| `grep -c 'reportarExcecao(' …` (INVARIANTE) | 4 | **4** | igual | ✅ |
| `grep -c 'capturarEventoTenant(' …` (INVARIANTE) | 3 | **3** | igual | ✅ |
| `grep -c "includes('já foi preenchido')" BookingApp.tsx` | 1 | **0** | alvo ABSOLUTO `0` | ✅ |
| `grep -c 'slot_indisponivel' BookingApp.tsx` | 0 | **1** | ≥ 1 | ✅ |
| `grep -c 'setTentativaSlots' BookingApp.tsx` (INVARIANTE) | 3 | **3** | igual | ✅ |
| `grep -c 'setAvisoDataHora' BookingApp.tsx` (INVARIANTE) | 4 | **4** | igual | ✅ |
| `grep -cE "'[A-ZÀ-Ú][^']{20,}'" BookingApp.tsx` | 3 | **2** | alvo ABSOLUTO `2` | ✅ |
| `grep -c 'toBeInstanceOf(Error)' …escrita.test.ts` | 1 | **0** | alvo ABSOLUTO `0` | ✅ |
| `grep -c 'toBe(antes)' …escrita.test.ts` (INVARIANTE) | 1 | **1** | igual | ✅ |
| `grep -cE '\b[0-9a-f]{40,}\b' …travessia…sh` | 0 | **0** | continua `0` | ✅ |
| Arquivos em `pnpm test` | 14 | **14** | — | ✅ |
| Testes em `pnpm test` | 209 (baseline do orquestrador neste HEAD) | **217** (425 ms) | maior que o inicial | ✅ |

As duas cópias inline que restam em `BookingApp.tsx` são exatamente as duas validações de cliente que o `01-UI-SPEC` trava e que o plano declara intocadas:

```
'Escolha o serviço e o horário antes de confirmar.'
'Informe o WhatsApp com DDD (10 ou 11 dígitos).'
```

`grep -rl 'preenchido ou está indisponível' src/` devolve exatamente `src/app/book/[slug]/mensagens.ts` e `src/app/book/__tests__/mensagens.test.ts` — nenhum arquivo de `src/app/actions/`.

## Nenhuma cópia mudou de texto — a verificação, não a promessa

Comparação de cada string travada entre o HEAD anterior ao plano (`61a925f`, em `public-booking.ts` + `BookingApp.tsx`) e o destino (`mensagens.ts`):

```
  antes=1 depois=1  Este horário já foi preenchido ou está indisponível. Por favor, selecione outro.
  antes=1 depois=1  Não foi possível confirmar o agendamento. Tente outro horário.
  antes=2 depois=1  Erro ao processar dados de contato.
  antes=1 depois=1  Erro ao confirmar o agendamento.
  antes=1 depois=1  Preencha todos os campos obrigatórios.
  antes=1 depois=1  Número de WhatsApp inválido. Informe o DDD e o número.
  antes=1 depois=1  Data e horário inválidos.
  antes=1 depois=1  Estabelecimento inválido ou indisponível.
  antes=1 depois=1  Serviço inválido ou indisponível.
```

O `2 → 1` de "Erro ao processar dados de contato." é deduplicação, não reescrita: a string aparecia em dois `throw` (leitura e escrita em `clientes`) e passou a existir uma vez, como constante.

## Prova de exaustividade do mapeador (critério de aceite da Task 1)

Removendo `slot_indisponivel: COPY_SLOT_INDISPONIVEL,` de `COPIA_DO_ENVIO`:

```
✓ Compiled successfully in 5.5s
 Running TypeScript ...
Failed to type check.

./src/app/book/[slug]/mensagens.ts:126:7
Type error: Property 'slot_indisponivel' is missing in type '{ campos_obrigatorios: string; telefone_invalido: string; data_invalida: string; slug_invalido: string; servico_invalido: string; erro_interno: string; }' but required in type 'Record<MotivoPublico, string>'.

  126 | const COPIA_DO_ENVIO: Record<MotivoPublico, string> = {
      |       ^
Next.js build worker exited with code: 1 and signal: null
BUILD_EXIT=1
```

Revertido em seguida (`grep` confirma a linha de volta na 132).

## O acoplamento era real: a Task 1 sozinha quebra o consumidor

Depois de converter só a action, antes de tocar em `BookingApp.tsx`:

```
✓ Compiled successfully in 5.4s
 Running TypeScript ...
Failed to type check.

./src/app/book/[slug]/BookingApp.tsx:274:38
Type error: Argument of type 'ResultadoAgendamentoPublico' is not assignable to parameter of type 'SetStateAction<{ id: string; data_hora: string; } | null>'.
  Type '{ ok: true; agendamento: AgendamentoCriado; }' is not assignable to type 'SetStateAction<{ id: string; data_hora: string; } | null>'.

  274 |                 setAgendamentoCriado(res)
      |                                      ^
BUILD_EXIT=1
```

Isto é o oposto do defeito que o plano conserta: o compilador agora enxerga o acoplamento que a substring escondia.

## Medição RED da Task 3 (antes de escrever a prova nova)

`npx tsc --noEmit`, com o contrato já trocado e a suíte ainda no formato antigo:

```
src/app/actions/__tests__/public-booking-escrita.test.ts(297,32): error TS2339: Property 'id' does not exist on type 'ResultadoAgendamentoPublico'.
src/app/actions/__tests__/public-booking-escrita.test.ts(298,32): error TS2339: Property 'data_hora' does not exist on type 'ResultadoAgendamentoPublico'.
src/app/actions/__tests__/public-booking-escrita.test.ts(299,32): error TS2339: Property 'status' does not exist on type 'ResultadoAgendamentoPublico'.
… (6 erros no total, todos no arquivo de teste)
TSC_EXIT=2
```

`pnpm test:integracao` no mesmo estado:

```
 FAIL  … > rejeita horário já ocupado sem gravar nada, com a mensagem que a UI reconhece
AssertionError: expected null to be an instance of Error
 ❯ src/app/actions/__tests__/public-booking-escrita.test.ts:382:26
    382|             expect(erro).toBeInstanceOf(Error)

 Test Files  1 failed (1)
      Tests  2 failed | 3 passed (5)
EXIT=1
```

`expected null to be an instance of Error` é a mudança de comportamento dita em voz alta: a promessa parou de rejeitar.

## Contrafactual do veredito novo — ele mede a falha

Com **apenas** a primeira guarda de `criarAgendamentoPublico` revertida para `throw new Error('Preencha todos os campos obrigatórios.')`:

```
  [APROVADO]  PREPARO           ids de obterSlotsPublicos (prefixo 70efdce3…) e criarAgendamentoPublico (prefixo 40488c27…) derivados de .next/server/server-reference-manifest.json
  [APROVADO]  CONTROLE          GET / devolveu 200 e o processo seguiu vivo
  [APROVADO]  SLOTS_ERRO        o corpo da resposta carrega o discriminante `slug_invalido` e nenhum `digest` opaco
  [REPROVADO] ESCRITA_VALIDACAO contém campos_obrigatorios=0 (exigido 1), contém digest=1 (exigido 0) — corpo observado: 0:{"a":"$@1","f":"","q":"","i":false,"b":"DYHIp211nbgNvAFGQsu4M"}|1:E{"digest":"3871214289"}
  [APROVADO]  SEM_VAZAMENTO     nenhum dos dois corpos carrega o slug do visitante, org_, PGRST ou tenant_id

Resumo: 5 vereditos, 1 REPROVADO(S)
EXIT=1
```

Revertido imediatamente (`grep -c 'throw new'` voltou a `1`).

## Saídas reais dos comandos de verificação (HEAD final `3a48e3b`)

### 1. `bash scripts/verificar-travessia-server-action.sh`

```
Verificação da travessia de erro esperado pela fronteira de Server Action
Actions alvo: obterSlotsPublicos (leitura) e criarAgendamentoPublico (escrita)   |   Porta: 3992

  … rodando pnpm build (pode levar ~1 min)
  [APROVADO]  PREPARO           ids de obterSlotsPublicos (prefixo 70efdce3…) e criarAgendamentoPublico (prefixo 40488c27…) derivados de .next/server/server-reference-manifest.json
  [APROVADO]  CONTROLE          GET / devolveu 200 e o processo seguiu vivo
  [APROVADO]  SLOTS_ERRO        o corpo da resposta carrega o discriminante `slug_invalido` e nenhum `digest` opaco
  [APROVADO]  ESCRITA_VALIDACAO o corpo da resposta carrega o discriminante `campos_obrigatorios` e nenhum `digest` opaco
  [APROVADO]  SEM_VAZAMENTO     nenhum dos dois corpos carrega o slug do visitante, org_, PGRST ou tenant_id

Resumo: 5 vereditos, 0 reprovados — os erros esperados dos DOIS caminhos públicos atravessam a fronteira com identidade preservada.
EXIT=0
```

### 2. `pnpm test` (hermético)

```
$ vitest run

 RUN  v4.1.10 /mnt/Files/VamoAgendar/vamo-agendar-app


 Test Files  14 passed (14)
      Tests  217 passed (217)
   Start at  14:08:12
   Duration  425ms (transform 780ms, setup 0ms, import 1.18s, tests 298ms, environment 1ms)

TEST_EXIT=0
```

### 3. `pnpm test:integracao`

```
$ EXIGIR_INTEGRACAO=1 vitest run src/app/actions/__tests__/public-booking-escrita.test.ts

 RUN  v4.1.10 /mnt/Files/VamoAgendar/vamo-agendar-app


 Test Files  1 passed (1)
      Tests  5 passed (5)
   Start at  14:08:19
   Duration  5.46s (transform 72ms, setup 0ms, import 112ms, tests 5.25s, environment 0ms)

EXIT=0
```

### 4. `pnpm lint`

```
$ eslint
LINT_EXIT=0
```

### 5. `pnpm build`

```
✓ Generating static pages using 11 workers (14/14) in 360ms
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

### 6. `npx tsc --noEmit` (o gate que `pnpm build` não cobre)

```
TSC_EXIT=0
```

Sem saída nenhuma — `next build` só checa o grafo da aplicação, então erro de tipo em arquivo de teste passa por toda a Definition of Done. Foi assim que o 01-10 deixou um erro para o orquestrador consertar em `7d5ce9c`; aqui ele foi medido vermelho (6 erros) e fechado dentro do plano.

### 7. `bash scripts/verificar-superficie-anon.sh` — ⚠️ sinal FRACO

```
Resumo: 11 checagem(ns), 0 reprovada(s) — a role anon não devolveu linha nenhuma.
EXIT=0
```

**Registro obrigatório de calibração:** este exit 0 foi obtido com o instrumento ainda descalibrado. O defeito WR-08 do próprio harness — classificar como ESPERADO qualquer código diferente de 200 — só é consertado pelo plano 01-15. Aqui ele serve como detector de regressão grosseira (uma leitura anônima que voltasse a devolver linhas reprovaria, e isso continua valendo), mas **não** distingue "tabela fechada" de "tabela que sumiu". Este plano não tocou schema, policy nem privilégio — nenhum arquivo de `supabase/` aparece no `git diff` dos três commits.

## Files Created/Modified

- `src/app/actions/public-booking.ts` — `AgendamentoCriado` e `ResultadoAgendamentoPublico`; as nove condições esperadas de `criarAgendamentoPublico` viraram retorno discriminado; `erro_interno` da resolução de perfil é propagado em vez de achatado em `slug_invalido`; a única exceção restante ganhou o motivo escrito ao lado.
- `src/app/book/[slug]/mensagens.ts` — nove cópias novas do caminho de escrita (verbatim) e o segundo mapeador exaustivo `mensagemDeEnvio`.
- `src/app/book/[slug]/BookingApp.tsx` — o submit inspeciona o valor de retorno; a recuperação decide por `res.motivo === 'slot_indisponivel'`; o `catch` residual cobre só rede caída/500.
- `src/app/actions/__tests__/public-booking-escrita.test.ts` — o caso de horário ocupado assere o discriminante; helper `criarComSucesso` desembrulha nomeando o motivo; cabeçalho diz o que a suíte NÃO prova; `TRECHO_DOUBLE_BOOKING` removido (não há mais acoplamento por substring a pinar).
- `src/app/book/__tests__/mensagens.test.ts` — quatro casos de igualdade estrita novos, exaustividade e não-vazamento sobre `mensagemDeEnvio`, e o caso que assere as DUAS superfícies com cópias próprias.
- `scripts/verificar-travessia-server-action.sh` — `derivar_id` reaproveitado para as duas actions; veredito `ESCRITA_VALIDACAO`; `SEM_VAZAMENTO` sobre os dois corpos; largura da coluna de veredito ajustada.

## Decisions Made

- **DOIS mapeadores, não um — e a razão é a proibição do próprio plano.** O plano pedia "complete o mapeador `mensagemDeMotivo`", mas as duas superfícies têm cópias DIFERENTES e ambas travadas para o mesmo discriminante: `slug_invalido` na caixa de horários é `Não foi possível carregar os horários. Tente de novo.` (01-UI-SPEC §"Regra sobre erros novos") e no envio é `Estabelecimento inválido ou indisponível.`. Um mapeador só obrigaria a reescrever uma das duas — exatamente a prohibition nº 1. `mensagemDeMotivo` fica intacto (leitura) e nasce `mensagemDeEnvio` (escrita). A substância do `key_link` do plano está preservada: as duas superfícies do caminho de escrita (aviso âmbar e caixa vermelha) têm **uma** fonte de cópia, e um caso de teste assere que os dois mapeadores divergem de propósito.
- **`erro_interno` mapeia para `COPY_ERRO_CONFIRMACAO`.** O discriminante colapsa as três falhas de infraestrutura, e para o visitante "não consegui gravar seu contato" e "não consegui gravar o agendamento" significam a mesma coisa: não confirmou. Quem precisa da distinção é quem investiga, e ela continua no `etapa` do `reportarExcecao` (`buscar_cliente`, `cadastrar_cliente`, `criar_agendamento`). `COPY_ERRO_CONTATO` continua exportada e pinada por igualdade estrita, com o motivo escrito no JSDoc — um membro futuro do discriminante a reencontra travada em vez de reescrita de memória.
- **A sonda de escrita manda slug preenchido e o resto vazio.** `campos_obrigatorios` dispara com qualquer campo vazio, então preencher o slug custa nada e dá ao `SEM_VAZAMENTO` uma literal concreta para procurar na resposta — sem isso, `case "$corpo" in *""*` casaria com tudo e a asserção seria decorativa.
- **A ordem tracer-primeiro do plano cria RED intermediário, e ele foi medido em vez de escondido.** Entre `b1b610e` e `3a48e3b` o `npx tsc --noEmit` e o `pnpm test:integracao` ficaram vermelhos — é inerente a converter o contrato numa task e atualizar a prova em outra. As saídas vermelhas estão coladas acima; o HEAD final está verde nos sete comandos.

## Deviations from Plan

**1. [Decisão de implementação] Dois mapeadores em `mensagens.ts` em vez de completar `mensagemDeMotivo`**

- **Encontrado durante:** Task 1
- **Conflito:** o plano pedia um mapeador só, mas isso exigiria reescrever a cópia de `slug_invalido` de uma das duas superfícies — a prohibition nº 1 do próprio plano.
- **Resolução:** `mensagemDeMotivo` (leitura, intacto) + `mensagemDeEnvio` (escrita, novo). Ambos exaustivos sobre `MotivoPublico`.
- **Arquivos:** `src/app/book/[slug]/mensagens.ts`, `src/app/book/[slug]/BookingApp.tsx`, `src/app/book/__tests__/mensagens.test.ts`
- **Commit:** `b1b610e`, `dd7de12`, `3a48e3b`

**2. [Decisão de implementação] `behavior` da Task 3 assere `mensagemDeEnvio('slot_indisponivel')`, não `mensagemDeMotivo`**

- **Encontrado durante:** Task 3
- **Motivo:** consequência direta do desvio 1. A asserção de igualdade estrita com `COPY_SLOT_INDISPONIVEL` está lá, no mapeador que de fato alimenta o aviso âmbar. `mensagemDeMotivo('slot_indisponivel')` também ficou asserido, para o valor da caixa de horários.
- **Commit:** `3a48e3b`

Nenhum desvio das regras 1–4 (nenhum bug encontrado, nenhuma funcionalidade crítica ausente, nenhum bloqueio, nenhuma mudança arquitetural).

## Issues Encountered

- **O comentário que eu escrevi reproduziu a substring que o plano manda extinguir.** A primeira versão do comentário em `BookingApp.tsx` citava `mensagem.includes('já foi preenchido')` como explicação histórica, e o alvo absoluto `grep -c "includes('já foi preenchido')" → 0` continuou dando `1`. Reescrito sem reproduzir o padrão. É um lembrete concreto de que grep de código não distingue código de comentário — e de que o critério estava certo em ser absoluto.
- **Suíte de integração e `tsc` vermelhos entre commits**, pela mesma razão do 01-10 e registrado acima com as saídas reais.

## User Setup Required

Nenhuma. O harness continua sem ler, sourcear ou imprimir qualquer arquivo de ambiente; os quatro valores obviamente falsos que ele injeta estão escritos dentro do próprio script. A suíte de integração usa as credenciais do Supabase de **dev** e só o `.env.local` já existente.

## Next Phase Readiness

- **O SC4 da Phase 2 deixou de ser insatisfazível por construção.** O mecanismo que ele exige — "quem perde a corrida vê a mensagem certa com os horários recarregados, nunca a mensagem do PostgreSQL" — está vivo e provado contra build de produção. A Phase 2 pode acrescentar a constraint de exclusão (AGE-03) sabendo que a resposta chega à tela.
- **O fallback "assume 30 minutos" de `booking-engine.ts` continua intocado**, como o plano manda: é escopo declarado da Phase 2.
- **Nada de UAT humano foi marcado, e não deve ser.** Os itens "Recuperação de double-booking na tela" e "Caixa de erro de slots na tela" continuam abertos em `docs/PENDENCIAS.md`: nenhum comando deste plano observou tela. O que este plano fecha é o caminho de dados até a tela; a renderização do aviso âmbar segue do olho do owner.
- **Herda para o 01-15:** o `verificar-superficie-anon.sh` foi usado aqui como detector fraco, com a calibração registrada acima.

## Self-Check: PASSED

Arquivos conferidos em disco (os seis modificados) e commits conferidos em `git log`: `b1b610e`, `dd7de12`, `3a48e3b`. Nenhum dos três commits apagou arquivo (`git diff --diff-filter=D` vazio nos três).

---

_Phase: 01-hardening-da-superf-cie-p-blica_
_Completed: 2026-07-22_
</content>
</invoke>
