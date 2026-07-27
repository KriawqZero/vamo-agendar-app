---
phase: 03-anti-abuso-no-booking-p-blico
plan: 05
subsystem: security
tags: [honeypot, anti-bot, sucesso-falso, booking-publico, autofill, telemetria, assercao-de-fonte]

requires:
  - phase: 03-02
    provides: "o código `honeypot.captura` já cadastrado em MENSAGENS_LOG e a variante aguardada logOperacionalAguardando"
  - phase: 03-03
    provides: "o padrão de telemetria de rotina (Log + PostHog, sem Issue) e o try/catch que nunca muda o retorno"
  - phase: 01-fechar-a-superficie-anonima
    provides: "o padrão de asserção de FONTE (teste lê o arquivo do disco) e o retorno discriminado por valor"
provides:
  - "Campo armadilha `info_adicional` no formulário público — invisível por posicionamento, fora da tabulação, não anunciado e fora do vocabulário de autofill"
  - "Sucesso falso como PRIMEIRA instrução de criarAgendamentoPublico: forma exata de AgendamentoCriado com zero I/O"
  - "Evento PostHog `booking_honeypot` — taxa de captura e, ao mesmo tempo, detector de autofill pegando pessoa real"
  - "Ponto de disparo do `honeypot.captura`, que estava cadastrado sem emissor desde o 03-02"
affects: [03-06-fechamento]

tech-stack:
  added: []
  patterns:
    - "Honeypot oculto por POSICIONAMENTO off-screen, nunca por display:none/hidden — campo suprimido é pulado por parte dos bots e a armadilha não pega ninguém, sem sintoma"
    - "Atributo de UI cuja FORMA é o requisito (e não o comportamento) se trava por asserção de fonte: render em jsdom passaria igual depois do refactor que quebra a defesa"
    - "Resposta mentirosa é permitida só onde a certeza de bot é alta; onde a certeza é menor (rate limit sob CGNAT), o erro é honesto"

key-files:
  created:
    - src/app/book/__tests__/honeypot-campo.test.ts
  modified:
    - src/app/book/[slug]/etapas/EtapaContato.tsx
    - src/app/book/[slug]/BookingApp.tsx
    - src/app/actions/public-booking.ts
    - src/app/actions/__tests__/public-booking-validacao.test.ts

key-decisions:
  - "O campo do params nasceu na Task 1, não na Task 2: commit que não passa no tsc é pior que a fronteira exata entre as tasks (o plano autorizava explicitamente)"
  - "A checagem é a PRIMEIRA instrução do corpo e não depende de nenhum outro campo do payload — bot de formulário raramente preenche o resto direito"
  - "`booking_completed` NÃO sai da captura: funil que conta bot como cliente estraga a única métrica de conversão do produto"
  - "String vazia e string só de espaços NÃO capturam — é o que todo navegador envia para input não preenchido; se `''` capturasse, a armadilha derrubaria o produto inteiro"
  - "O recorte do bloco no teste de fonte ancora em `lastIndexOf`, com trava contra recorte largo: o comentário em pt-BR cita o próprio atributo e a primeira ocorrência puxaria o campo vizinho"

patterns-established:
  - "Teste de fonte que recorta um bloco valida o PRÓPRIO recorte (asserção de que o bloco não engoliu o vizinho) — senão as asserções negativas passam por acidente"

requirements-completed: []

coverage:
  - id: D1
    description: "Requisição com o campo armadilha preenchido recebe sucesso com a forma exata de AgendamentoCriado, sem tocar banco, Redis, engine, cliente ou mensageria"
    requirement: "ABU-01"
    verification:
      - kind: unit
        ref: "src/app/actions/__tests__/public-booking-validacao.test.ts#devolve sucesso com a forma exata de AgendamentoCriado, sem tocar em NADA"
        status: pass
      - kind: unit
        ref: "src/app/actions/__tests__/public-booking-validacao.test.ts#devolve sucesso plausível mesmo com payload LIXO, sem lançar"
        status: pass
    human_judgment: false
  - id: D2
    description: "A captura emite honeypot.captura (Log aguardado) + booking_honeypot (PostHog), sem Issue e sem inflar o funil"
    requirement: "ABU-03"
    verification:
      - kind: unit
        ref: "src/app/actions/__tests__/public-booking-validacao.test.ts#emite log + evento próprio, sem Issue e sem inflar o funil"
        status: pass
      - kind: unit
        ref: "src/app/actions/__tests__/public-booking-validacao.test.ts#falha da telemetria NÃO muda a resposta que o bot recebe"
        status: pass
    human_judgment: false
  - id: D3
    description: "Nenhum dado do visitante (nome, telefone, e-mail, slug) atravessa para fornecedor terceiro na captura"
    verification:
      - kind: unit
        ref: "src/app/actions/__tests__/public-booking-validacao.test.ts#não manda nome nem telefone do payload para fornecedor terceiro"
        status: pass
    human_judgment: false
  - id: D4
    description: "O campo é invisível e inerte para pessoa real: off-screen por posicionamento, tabIndex -1, aria-hidden, autoComplete off, sem label, nome fora do vocabulário de autofill"
    requirement: "ABU-02"
    verification:
      - kind: unit
        ref: "src/app/book/__tests__/honeypot-campo.test.ts#oculta por POSICIONAMENTO off-screen, não por supressão de renderização"
        status: pass
      - kind: unit
        ref: "src/app/book/__tests__/honeypot-campo.test.ts#não usa vocabulário que as heurísticas de autofill reconhecem"
        status: pass
      - kind: unit
        ref: "src/app/book/__tests__/honeypot-campo.test.ts#tira o campo da ordem de tabulação"
        status: pass
      - kind: unit
        ref: "src/app/book/__tests__/honeypot-campo.test.ts#esconde o campo do leitor de tela (wrapper e input)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Cliente legítimo (campo ausente, vazio ou só com espaços) segue o fluxo normal inalterado"
    requirement: "ABU-02"
    verification:
      - kind: unit
        ref: "src/app/actions/__tests__/public-booking-validacao.test.ts#campo AUSENTE segue o fluxo normal, inalterado"
        status: pass
      - kind: unit
        ref: "src/app/actions/__tests__/public-booking-validacao.test.ts#campo VAZIO ou só com espaços segue o fluxo normal"
        status: pass
    human_judgment: false
  - id: D6
    description: "O campo não desloca nada na tela real (mobile e desktop) e nenhum navegador com autofill agressivo o preenche"
    verification: []
    human_judgment: true
    rationale: "A suíte prova a FORMA dos atributos, nunca o comportamento de um motor de layout ou de uma heurística de autofill proprietária. Wrapper `absolute` sem ancestral posicionado resolve contra o bloco inicial e não gera scroll horizontal em LTR — mas isso é raciocínio, não medição. O falso-positivo de autofill (Pitfall 6) só se responde com a taxa do `booking_honeypot` sob tráfego real, e é o owner quem julga se o número é compatível com bot."

metrics:
  duration: ~12min
  completed: 2026-07-27

status: complete
---

# Phase 3 Plano 05: Honeypot com sucesso falso — Summary

**O formulário público ganhou um campo que nenhuma pessoa consegue ver, tabular ou ouvir — e quem o preenche recebe uma tela de confirmação que não corresponde a nada no banco.**

## Performance

- **Duration:** ~12 min
- **Tasks:** 2 (a segunda em TDD — RED e GREEN separados)
- **Files modified:** 5 (1 criado, 4 modificados)
- **Testes:** 336 → 353 (17 novos, zero regressão)

## Accomplishments

- **A segunda defesa da fase existe, e ela pega um eixo que o rate limit não pega.** Quatro camadas de rate limit barram volume; nenhuma delas distingue um agendamento real de um agendamento de bot dentro do orçamento. O honeypot faz a distinção pelo comportamento: preencheu um campo que só um programa enxerga, é um programa.
- **A resposta é sucesso, e essa escolha é o plano inteiro.** Bot que recebe erro tenta de novo — com outro IP, outro telefone, outra sessão, o que é exatamente o que as camadas de rate limit gastam recurso para absorver. Bot que recebe sucesso vai embora. Por isso a mentira mora só aqui, onde a certeza de ser bot é alta, e nunca no rate limit, onde CGNAT de operadora faz clientes reais dividirem IP.
- **A captura tem custo zero e é a primeira instrução do corpo da action.** Nenhum `createAdminClient`, nenhum comando no Redis, nenhuma resolução de slug, nenhum INSERT, nenhum WhatsApp, nenhum lembrete no QStash — e as três primeiras provas da suíte são asserções negativas disso, não do retorno.
- **O `honeypot.captura` deixou de ser stub.** Estava cadastrado em `MENSAGENS_LOG` desde o 03-02 sem nenhum emissor; agora tem ponto de disparo, e o evento `booking_honeypot` acompanha do lado do PostHog.
- **O detector do próprio defeito veio junto.** O pior desfecho nomeado pelo owner no D-07 é pessoa real recebendo sucesso falso — e o caminho para isso é o autofill do navegador preencher o campo. Ninguém reclama de um agendamento que a tela confirmou, então o defeito seria invisível por construção. A taxa do `booking_honeypot` é o que o torna visível.

## Task Commits

1. **Task 1: campo armadilha no `EtapaContato` + repasse no `BookingApp`** — `8841fdb`
2. **Task 2: sucesso falso na action + telemetria da captura** — `27b5002` (test, RED) → `e50a414` (feat, GREEN)

**Plan metadata:** ver commit de fechamento (`docs(03-05)`).

## Files Created/Modified

- `src/app/book/[slug]/etapas/EtapaContato.tsx` — campo armadilha como último filho do `<form id="form-contato">`: wrapper `absolute -left-[9999px] top-0 h-px w-px overflow-hidden` com `aria-hidden`, `<input name="info_adicional" type="text" defaultValue="" autoComplete="off" tabIndex={-1} aria-hidden="true">`, sem `<label>` e sem estado React. Comentário em pt-BR justifica **cada** atributo, incluindo por que a ocultação não pode ser `display:none`
- `src/app/book/[slug]/BookingApp.tsx` — leitura `formData.get('info_adicional')` junto das de nome/telefone (sem validação, sem interferir nas guardas existentes) e repasse como `infoAdicional` na chamada de `criarAgendamentoPublico`
- `src/app/actions/public-booking.ts` — `AgendamentoPublicoParams` ganha `infoAdicional?: string` com JSDoc; a checagem do honeypot abre o corpo de `criarAgendamentoPublico`, com telemetria protegida por try/catch e retorno `AgendamentoCriado` sintético (`crypto.randomUUID()`, `dataHora` com fallback para `new Date().toISOString()`, `status: 'confirmado'`)
- `src/app/book/__tests__/honeypot-campo.test.ts` — **novo**, 10 casos de asserção de fonte: nome contratado, tabulação, leitor de tela (wrapper + input), autofill desligado, vocabulário de risco ausente, ocultação por posicionamento com os negativos de `display:none`/`hidden`/`className="hidden`, ausência de `<label>`, controle positivo dos campos legítimos e as duas pontas do fio no `BookingApp`
- `src/app/actions/__tests__/public-booking-validacao.test.ts` — bloco novo de 7 casos (forma do sucesso falso + três provas negativas, telemetria completa, ausência de PII, telemetria quebrada, payload malformado, e os dois controles positivos) e mock novo de `@/lib/notificacoes-agendamento`

## Decisions Made

**A ocultação é por posicionamento, e essa é a decisão técnica que mais fácil se perde num refactor.** `hidden` e `display:none` são o jeito idiomático de esconder um input, um linter ou um colega "limpariam" as classes off-screen para uma delas sem hesitar — e parte dos bots ignora campo suprimido (assunção A4 do RESEARCH). O resultado seria uma armadilha que continua invisível para pessoas, deixa de pegar bots e não produz nenhum sintoma: a taxa de captura simplesmente cai para zero, que é indistinguível de "não estamos sendo atacados". Por isso a proibição virou asserção negativa de fonte, não comentário.

**O nome do campo foi escolhido contra duas ameaças ao mesmo tempo, e elas puxam para lados diferentes.** Contra o autofill, o nome precisa estar longe do vocabulário que as heurísticas do navegador reconhecem — nada de `website`, `url`, `address`, `phone2`, que são justamente os nomes clássicos de honeypot e por isso os mais arriscados. Contra o bot que lê o fonte, o nome não pode denunciar a armadilha — nada de `honeypot` ou `nao_preencher`. `info_adicional` satisfaz as duas: é plausível como campo de negócio e não casa com nenhuma heurística. O teste trava os dois lados.

**O teste é de FONTE, não de render, e a razão é o que ele precisa provar.** Um render em jsdom provaria que o input existe — e existiria igual se alguém trocasse a ocultação, renomeasse o campo para `website` ou apagasse o `tabIndex`. Os três "refactors" que quebram a defesa são invisíveis para um teste de comportamento. Quando o requisito é a FORMA do atributo, a asserção tem que ser sobre o texto do arquivo; é o mesmo raciocínio que a Phase 01 usou.

**String vazia não captura, e isso não é um detalhe de implementação.** Todo navegador envia `''` para input não preenchido, então a checagem é `trim().length > 0` e não truthiness do valor. Se `''` capturasse, 100% dos clientes reais receberiam sucesso falso — o produto inteiro pararia de funcionar exibindo confirmação. O caso de teste percorre `''`, `'   '` e `'\n\t'` de propósito: espaço em branco vindo de campo tocado sem querer é o vizinho mais próximo do caso vazio.

**`booking_completed` não sai da captura.** É a única métrica de conversão do produto e a base do funil que o owner acompanha. Contar bot como cliente ali inflaria exatamente o número que serve para decidir se o produto está funcionando — e o dano é silencioso, porque um funil que sobe parece boa notícia.

## Deviations from Plan

### 1. [Rule 3 — Bloqueio de tipo] `infoAdicional` declarado no params já na Task 1

- **Encontrado durante:** Task 1
- **Issue:** o plano põe `AgendamentoPublicoParams` na Task 2. Repassar `infoAdicional` no `BookingApp` sem o campo existir deixaria o commit da Task 1 reprovando no `tsc`
- **Fix:** o campo opcional (só o tipo, com JSDoc) entrou junto da Task 1; a decisão de sucesso falso continuou inteira na Task 2
- **Arquivos modificados:** `src/app/actions/public-booking.ts`
- **Commit:** `8841fdb`
- **Nota:** o próprio plano autorizava (`"se o executor preferir, pode declarar o campo no params já nesta task"`). Commit que não compila é pior que a fronteira exata entre tasks — e a Task 2 continuou com RED legítimo, porque o que faltava era o comportamento, não o tipo

### 2. [Rule 2 — Acréscimo dentro do escopo] Trava do próprio recorte no teste de fonte

- **Encontrado durante:** Task 1, na primeira execução (dois casos falharam)
- **Issue:** o recorte do bloco ancorava em `indexOf('info_adicional')`, e o comentário em pt-BR acima do campo cita o próprio atributo — o recorte pegava a partir do `<div>` do telefone. As asserções negativas (`<label`, `display:none`) passaram a falar de outro campo, e falharam
- **Fix:** âncora trocada para `lastIndexOf('name="info_adicional"')` **e** duas asserções novas provando que o recorte não engoliu os campos vizinhos
- **Arquivos modificados:** `src/app/book/__tests__/honeypot-campo.test.ts`
- **Commit:** `8841fdb`
- **Por que a trava e não só a correção:** um recorte largo demais faz as asserções negativas passarem por acidente — o teste ficaria verde provando nada. Foi o modo de falha que a própria execução exibiu, então merece asserção e não confiança

### 3. [Correção] ABU-01, ABU-02 e ABU-03 continuam NÃO marcados em REQUIREMENTS.md

- **Encontrado durante:** fechamento do plano
- **Por que não foi feito:** mesma razão registrada no 03-01 a 03-04. O honeypot agora existe, mas as credenciais do Upstash seguem não provisionadas — as quatro camadas de rate limit continuam em no-op em execução real. Marcar ABU-01 aqui afirmaria "script repetindo requisições não consegue lotar a agenda" num ambiente onde toda requisição passa; o honeypot sozinho não sustenta isso, e o próprio plano diz que nenhuma das duas defesas fecha o SC1 isolada
- **Ação:** os três seguem `[ ] / Pending`; quem fecha é o 03-06, com a fase inteira e as credenciais provisionadas
- **Arquivos modificados:** nenhum

### 4. [Registro] `docs/PENDENCIAS.md` não foi tocado

- **Por quê:** precedente explícito do 03-04 (`"o registro em PENDENCIAS é do 03-06"`). Os itens que este plano gera — verificação humana do campo em navegador real e leitura da taxa de `booking_honeypot` — estão em **User Setup Required** abaixo e vão para PENDENCIAS no fechamento da fase, junto dos demais
- **Arquivos modificados:** nenhum

---

**Total de deviations:** 4 (1 antecipação de tipo autorizada, 1 acréscimo de trava, 2 registros de não-escrita)
**Impacto no plano:** nenhum no escopo. Todo o comportamento pedido foi implementado como escrito.

## Issues Encountered

**O comentário do campo quebrou o próprio teste que o descreve.** O comentário em pt-BR cita `name="info_adicional"` para explicar por que o nome é neutro, e o recorte por primeira ocorrência caiu dentro dele. Duas falhas, cinco minutos, corrigido com âncora por última ocorrência mais a trava descrita acima. Vale registrar porque é um modo de falha genérico de asserção de fonte: quanto melhor o comentário, maior a chance de ele colidir com o recorte.

O ciclo RED/GREEN da Task 2 se comportou como previsto: 4 falhas na RED (os controles positivos e a prova negativa de PII passam trivialmente antes da implementação, por serem asserções de ausência).

## Verificação de fechamento

Rodada sobre o HEAD final (`e50a414`), com saída real observada:

- `pnpm test` — **353 passed (353)**, 22 arquivos, exit 0
- `npx tsc --noEmit` — exit 0
- `pnpm lint` — exit 0, sem saída
- `pnpm build` — exit 0, 14 rotas geradas

## Known Stubs

Nenhum stub de código introduzido por este plano — e um herdado foi resolvido: `honeypot.captura` estava em `MENSAGENS_LOG` desde o 03-02 sem emissor, e agora tem ponto de disparo.

**O stub que continua importando é o mesmo do 03-04, e o honeypot não o afeta:** sem `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`, as quatro camadas de rate limit seguem em no-op. A armadilha funciona independentemente delas (não consulta Redis), mas cobre outro eixo — script que chama a Server Action direto não preenche formulário, e para ele só existe o rate limit.

## User Setup Required

**Olho humano no formulário público, em navegador real (D6 do coverage).** É o único item que a suíte não sabe responder:

1. Abrir `/book/<slug>` no celular e no desktop, chegar na etapa de contato e confirmar que nada se deslocou — o wrapper é `absolute` sem ancestral posicionado, então resolve contra o bloco inicial e não deveria produzir scroll horizontal, mas isso é raciocínio sobre layout, não medição.
2. Navegar a etapa **só pelo teclado** (Tab): o foco tem que ir de "Seu nome" para "WhatsApp" e daí para o CTA, sem parada intermediária.
3. Salvar um endereço no autofill do navegador e conferir se o campo continua vazio ao autopreencher o formulário.

**Depois de abrir ao público, acompanhar a taxa de `booking_honeypot` no PostHog.** É o detector do Pitfall 6: taxa incompatível com o tráfego de bot esperado significa que o autofill está pegando gente real, e aí o campo é que muda (nome, atributos ou a própria armadilha). Ninguém vai reclamar — a tela confirmou o agendamento.

## Threat Flags

Nenhuma superfície nova fora do `<threat_model>` do plano.

- **T-03-05-01** (bot criando agendamentos em massa) — mitigado: sucesso falso sem I/O na primeira checagem, com três provas negativas.
- **T-03-05-02** (autofill pegando pessoa real) — mitigado nas duas frentes possíveis por código (nome fora do vocabulário + `autoComplete="off"` + off-screen, travados por teste) e com detector via taxa do PostHog. **Risco residual aceito e nomeado:** nenhuma heurística proprietária de autofill é verificável por teste unitário — daí o item 3 do User Setup e o D6 do coverage.
- **T-03-05-03** (captura logada com dado do visitante) — mitigado: telemetria só com código estático e `fluxo`, mais prova negativa contra nome, telefone, e-mail e slug.
- **T-03-05-04** (funil inflado por captura de bot) — mitigado: evento próprio, `booking_completed` ausente e `capturarEventoTenant` provado não chamado.

## Next Phase Readiness

Pronto para o **03-06** (fechamento). As duas defesas da fase existem: quatro camadas de rate limit (03-01 a 03-04) e o honeypot (este plano). O que falta para os ABU serem marcáveis não é código — é o provisionamento das credenciais do Upstash e o julgamento do owner sobre a evidência da fase inteira. Os itens de PENDENCIAS deste plano (verificação humana do campo, acompanhamento da taxa de captura) somam-se aos que o 03-04 já deixou para lá.

## Self-Check: PASSED

- `src/app/book/[slug]/etapas/EtapaContato.tsx` — FOUND (contém `name="info_adicional"`, `tabIndex={-1}`, `aria-hidden="true"`, `autoComplete="off"`, `-left-[9999px]`)
- `src/app/book/[slug]/BookingApp.tsx` — FOUND (contém `formData.get('info_adicional')` e o repasse `infoAdicional`)
- `src/app/actions/public-booking.ts` — FOUND (contém `infoAdicional?: string` e a checagem `infoAdicional.trim().length > 0` como primeira instrução do corpo)
- `src/app/book/__tests__/honeypot-campo.test.ts` — FOUND (criado)
- `src/app/actions/__tests__/public-booking-validacao.test.ts` — FOUND
- Commits `8841fdb`, `27b5002`, `e50a414` — FOUND

---
*Phase: 03-anti-abuso-no-booking-p-blico*
*Completed: 2026-07-27*
