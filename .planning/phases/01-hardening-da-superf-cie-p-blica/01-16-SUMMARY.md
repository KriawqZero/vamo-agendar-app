---
phase: 01-hardening-da-superf-cie-p-blica
plan: 16
subsystem: booking-publico
tags: [assinaturas, planos, degradacao, observabilidade, sentry, webhook, qstash, wr-07, seg-02]

requires:
    - phase: 01-hardening-da-superf-cie-p-blica (plano 01-02)
      provides: '`obterPlanoVigentePublico` no caminho privilegiado e a troca de identificador (`tenantId` → `slug`) que criou o elo entre leitura de plano e resolução de slug'
    - phase: 01-hardening-da-superf-cie-p-blica (plano 01-10)
      provides: '`reportarFalhaSilenciosa` e `erroSinteticoSupabase` como a borda anti-PII de reporte — este plano reusa os dois em vez de reimplementar o rótulo'
    - phase: 01-hardening-da-superf-cie-p-blica (plano 01-14)
      provides: 'A recusa de resolução ambígua entre tenants, que continua rodando ANTES de qualquer leitura de plano e por isso sobrevive intacta à janela de degradação'
    - phase: 01-hardening-da-superf-cie-p-blica (plano 01-12)
      provides: 'A sanitização de personalização por plano em `obterDadosBookingPublico` — a defesa única que este plano teve de manter fechada enquanto abria a disponibilidade'
provides:
    - '`obterPlanoVigentePublico` devolvendo `{ plano, degradadoPorErro }`: "não consegui ler a assinatura" deixa de ser indistinguível de "este tenant não tem assinatura"'
    - 'Detector nos dois caminhos de leitura de `assinaturas` (público e dashboard), com rótulos separados e contexto reduzido ao SQLSTATE'
    - 'Link público de tenant pagante sobrevive a falha transitória de leitura de plano — sem exibir nada pago durante a janela'
    - 'Webhook de lembrete distinguindo transitório (`plano_indeterminado`, 500 para retry) de definitivo (`plano_sem_whatsapp`, 200)'
    - '`src/lib/__tests__/assinaturas.test.ts` — suíte hermética com asserção negativa anti-PII sobre o contexto do reporte'
affects: [booking-publico, mensageria, observabilidade, phase-02, phase-07]

tech-stack:
    added: []
    patterns:
        - 'Falha de infraestrutura e condição de negócio nunca colapsam no mesmo valor de retorno: o padrão conservador continua, mas vem acompanhado da confissão de quanto se sabe'
        - 'Fail-open/fail-closed decidido por EIXO, não por função: permissivo na disponibilidade, restritivo no que é pago'
        - 'Forçagem de sanitização escrita EXPLICITAMENTE mesmo quando o valor corrente já a implica — depender do detalhe transforma mudança futura de padrão em vazamento'
        - 'HTTP 500 para retry só é seguro antes da primeira tentativa de envio; depois dela, retry é duplicação de mensagem'
        - 'Comentário não repete o token que um grep-guard da fase vigia: prosa que cita `tenantId` cega a guarda que deveria pegar o vazamento'
        - 'Falha que o banco não sabe produzir sob demanda é injetada na FRONTEIRA da função (mock parcial), preservando linhas reais no resto da suíte de integração'

key-files:
    created:
        - src/lib/__tests__/assinaturas.test.ts
    modified:
        - src/lib/assinaturas.ts
        - src/app/actions/public-booking.ts
        - src/app/api/webhooks/lembrete/route.ts
        - src/app/actions/__tests__/public-booking-escrita.test.ts
        - src/lib/notificacoes-agendamento.ts
        - src/app/actions/agendamentos.ts

key-decisions:
    - 'Saída (B) do plano implementada e registrada NO CÓDIGO: com o plano indeterminado o link fica no ar (aceita `perfil.slug` ou `perfil.slug_gratuito`) e a personalização é forçada ao nível gratuito. A ameaça aceita é T-01-16-06 — tenant recém-rebaixado tem o slug antigo resolvendo durante a janela; transitório, sem dado de terceiro, sem nada pago na tela'
    - 'O rótulo do reporte reusa `erroSinteticoSupabase` em vez de ler `error.code` na mão (que era o fix literal do WR-07): a redução ao SQLSTATE, incluindo a recusa de um `code` que não seja string não-vazia, fica auditada num lugar só'
    - 'No webhook o registro do caso indeterminado usa `status: "falha"`, não `ignorado`: `ignorado` é o vocabulário do caso DEFINITIVO (cancelado, plano sem recurso, WhatsApp desconectado); aqui nada foi decidido, só não foi possível decidir'
    - 'O webhook emite um SEGUNDO evento (`lembrete:plano_indeterminado`) além do que a lib já emitiu, e ele é AGUARDADO: os dois contam histórias diferentes (a leitura falhou / um lembrete foi adiado por causa disso) e o flush do awaited drena também o fire-and-forget da lib, que se perderia num runtime que congela após a resposta'
    - '`notificacoes-agendamento.ts` mantém o comportamento conservador na degradação de propósito, e isso NÃO é a mesma confusão do webhook: aquela fase é síncrona ao agendamento e não tem canal de retry — segurar a confirmação do cliente final violaria o invariante "mensageria jamais quebra a criação de um agendamento"'
    - 'Os casos novos do comportamento público foram para a suíte de INTEGRAÇÃO (com a falha injetada na fronteira da função), não para a hermética: o valor da prova está em rodar contra linhas reais — perfil com `cor_marca` gravada e as duas colunas de slug de verdade'
    - 'Commits atômicos por task em vez de par test(RED)/feat(GREEN): a Definition of Done do CLAUDE.md exige lint/test/build verdes, e um commit test-only seria um commit com `pnpm test` vermelho. As duas medições RED foram observadas e estão coladas abaixo'

requirements-completed: []
requirements-advanced: [SEG-02]

metrics:
    duration: ~65min
    tasks: 2
    files-created: 1
    files-modified: 6
    tests-before: 217
    tests-after: 228
    tests-integracao-before: 8
    tests-integracao-after: 13
    completed: 2026-07-22
status: complete
---

# Phase 01 Plano 16: A degradação que avisa, e o link que não cai — Summary

`obterPlanoVigentePublico` passou a devolver `{ plano, degradadoPorErro }`, separando "não consegui ler a assinatura" de "este tenant não tem assinatura" — e com essa distinção o link público de um tenant pagante deixou de responder 404 durante um soluço de leitura, sem que nada pago passe a aparecer na janela.

## O problema, em uma frase

`src/lib/assinaturas.ts` tratava **qualquer** erro de leitura como `'gratuito'`, com um `console.error` e nada mais. Nesta fase a consequência mudou de escala: `resolverPerfilPublicoPorSlug` compara o slug acessado com o slug **efetivo do plano**, então um tenant Pro com slug customizado `bela-unhas` via `/book/bela-unhas` responder **404** para os clientes dele enquanto a leitura de `assinaturas` falhasse. Sem alerta, sem evento, sem linha no Sentry — e num fluxo sem sessão ninguém reclama de página que não abriu.

## A decisão de produto, e o que ela aceita

O plano trouxe a decisão tomada, e ela foi implementada com a assimetria escrita junto do código:

**Permissivo na disponibilidade, restritivo no que é pago.**

| Eixo | Na janela de plano indeterminado | Por quê |
|---|---|---|
| Resolução de slug | **Permissivo** — aceita `perfil.slug` ou `perfil.slug_gratuito` do perfil já encontrado | 404 na cara do cliente de quem paga contradiz o Core Value do projeto |
| Personalização visual | **Restritivo** — cor, logo e capa forçados a nulo | Com o RLS bypassado (D-02), essa sanitização é a defesa ÚNICA (01-UI-SPEC §29) |
| Lembrete de WhatsApp | **Retry** — `plano_indeterminado` + HTTP 500 | Nenhuma mensagem foi enviada ainda, então retry não duplica |
| Ambiguidade de namespace (01-14) | **Inalterado** — recusa continua | Roda antes de qualquer leitura de plano; é onde a recusa importa mais |

**Ameaça aceita, nomeada (T-01-16-06):** durante a janela de falha, um tenant que fez downgrade recentemente teria o slug customizado antigo voltando a resolver. É transitório, não expõe dado de terceiro e não exibe nada pago. Reverter para o comportamento fechado é apagar um bloco `if` — e o reporte ao Sentry, que é o ganho maior, sobrevive nas duas escolhas. Isso está escrito em `public-booking.ts`, não só aqui.

**O que o cliente final vê na janela:** exatamente o que via antes da falha, menos a personalização visual do tenant Pro (cor de acento, logo, capa). O wizard de agendamento inteiro funciona; nenhuma etapa, atraso ou mensagem nova foi acrescentada. Fricção Zero intacta.

## Tasks

### Task 1 — A degradação passa a avisar (commit `1f83412`)

`obterPlanoVigentePublico` devolve `{ plano, degradadoPorErro }`. Sucesso e ausência de linha vigente devolvem `degradadoPorErro: false` — não ter assinatura é condição de negócio e não pode virar alarme, que é como um detector morre de ruído. Erro de leitura devolve `plano: 'gratuito'` (o padrão conservador continua) **com** `degradadoPorErro: true` e `reportarFalhaSilenciosa('assinaturas:leitura_publica_falhou', { rotulo })`.

`obterAssinaturaVigente` (dashboard) manteve a forma do retorno e ganhou `'assinaturas:leitura_dashboard_falhou'`. Rótulo separado de propósito: no Sentry, "caiu no dashboard de um profissional logado" e "caiu no link público de um cliente final" são urgências diferentes.

O webhook de lembrete passou a inspecionar `degradadoPorErro` **antes** de `PLANOS[plano].recursos.whatsapp`, e registra `status: 'falha'` / `motivo: 'plano_indeterminado'` com HTTP 500. Os três chamadores restantes (`notificacoes-agendamento.ts`, `agendamentos.ts`, `public-booking.ts`) só desestruturaram `{ plano }` nesta task, sem mudança de comportamento.

### Task 2 — O link sobrevive ao soluço (commit `0a5b38b`)

Em `resolverPerfilPublicoPorSlug` a comparação por slug efetivo virou condicional ao que se sabe do plano; `degradadoPorErro` é propagado em `ResolucaoPerfil`; e em `obterDadosBookingPublico` a sanitização é forçada ao nível gratuito na janela.

A forçagem é **explícita** mesmo sabendo que hoje `plano` já vem `'gratuito'` na degradação. Depender desse detalhe faria de qualquer mudança futura no padrão conservador um vazamento de recurso pago, e essa é a última defesa que sobrou naquela tela.

## Medição RED — as duas suítes foram vistas vermelhas antes do código

**Task 1 (suíte hermética nova, antes de tocar `assinaturas.ts`):**

```
 Test Files  1 failed | 14 passed (15)
      Tests  8 failed | 220 passed (228)
```

Os 8 vermelhos são os casos do contrato novo; os 3 verdes restantes são os de `obterAssinaturaVigente` cujo formato de retorno já era o esperado.

**Task 2 (suíte de integração, antes de tocar `public-booking.ts`):**

```
 ❯ src/app/actions/__tests__/public-booking-escrita.test.ts (13 tests | 2 failed) 7644ms
     × sob degradação, o slug CUSTOMIZADO de um tenant gratuito volta a resolver (o link não cai) 97ms
     × sob degradação, nada pago aparece: cor, logo e capa voltam nulos mesmo gravados no perfil 82ms

AssertionError: O link customizado caiu durante a falha de leitura de plano — é o 404 do WR-07
na cara do cliente de quem paga.: expected null not to be null

 Test Files  1 failed (1)
      Tests  2 failed | 11 passed (13)
```

Vermelho **preciso**: só os dois casos do comportamento novo. Os três casos de controle já passavam — inclusive o que prova que o `mockReset()` devolve a implementação real, que é o que impede a injeção de vazar para os casos seguintes.

## Onde os casos novos foram parar, e por quê

O plano permitia os dois caminhos. Os casos foram para a **suíte de integração**, com a falha de leitura injetada na fronteira da função por mock parcial de `@/lib/assinaturas` (o real roda por padrão; só um override por caso).

O motivo é o valor da prova: sob degradação, o que precisa ser provado é o comportamento contra **linhas reais** — um perfil com `cor_marca`, `logo_url` e `capa_url` gravados de verdade e as duas colunas de slug existindo no banco. Um dublê completo provaria o dublê. A alternativa de produzir a falha "de verdade" seria revogar privilégio no banco compartilhado no meio da suíte: efeito colateral global para exercitar um ramo local.

A fixture ganhou personalização paga gravada num tenant **gratuito** — que não é cenário inventado: downgrade não zera as colunas, então é exatamente a linha que um ex-Pro deixa no banco.

**Caso que prova a sanitização forçada (nomeado, como pedido):**
`sob degradação, nada pago aparece: cor, logo e capa voltam nulos mesmo gravados no perfil` — e ele fecha o próprio flanco lendo a linha crua do banco no final, para que os `toBeNull()` não passem contra um perfil vazio.

**Caso que prova que a regra normal não mudou:**
`CONTROLE: sem degradação, o slug customizado de um tenant gratuito continua NÃO resolvendo`.

## Contagens medidas — inicial → final

| Medição | Inicial | Final | Critério | Veredito |
|---|---|---|---|---|
| `pnpm test` — arquivos | 14 | 15 | +1 | ✅ |
| `pnpm test` — casos | 217 | 228 | +5 no mínimo | ✅ (+11) |
| `pnpm test` — duração | 419 ms | 407 ms | < 2 s, hermético | ✅ |
| `pnpm test:integracao` — casos | 8 | 13 | +2 no mínimo | ✅ (+5) |
| `grep -c 'reportarFalhaSilenciosa' src/lib/assinaturas.ts` | 0 | **3** | plano dizia `2` | ⚠️ ver abaixo |
| `grep -cE 'tenantId\|tenant_id' src/lib/assinaturas.ts` | 6 | 6 | inalterado | ✅ |
| `grep -c 'plano_indeterminado' route.ts` | 0 | **2** | plano dizia `1` | ⚠️ ver abaixo |
| `grep -c 'plano_sem_whatsapp' route.ts` | 1 | 1 | inalterado | ✅ |
| `grep -c 'degradadoPorErro' public-booking.ts` | 0 | 7 | `>= 3` | ✅ |

**As duas divergências, honestamente:**

- `reportarFalhaSilenciosa` = **3**, não 2: `grep -c` conta linhas, e a terceira é a linha de `import`. O planejador contou os dois pontos de chamada. O invariante que o critério protege — detector presente nos dois caminhos de leitura — está satisfeito (linhas 74 e 138).
- `plano_indeterminado` = **2**, não 1: uma é o `motivo` gravado em `disparos_whatsapp`, a outra é o rótulo do evento de Sentry (`'lembrete:plano_indeterminado'`). Ambas são uso substantivo, não comentário. Colapsar as duas só para bater a contagem custaria o rótulo do evento, que é o que separa esse caso dos outros no painel.

**Duas contagens quase derivaram por comentário, e foram corrigidas durante a execução:** a primeira redação citava `` `tenantId` `` e `` `plano_sem_whatsapp` `` em prosa explicativa, o que levava os greps a 7 e 2. Prosa que repete o token vigiado **cega a guarda que deveria pegar o vazamento** — os comentários foram reescritos preservando o sentido, e as duas voltaram aos valores medidos (6 e 1).

## Verificação — saída real dos sete comandos

```
########## pnpm lint ##########
$ eslint
lint exit=0

########## npx tsc --noEmit ##########
tsc exit=0

########## pnpm test ##########
 RUN  v4.1.10 /mnt/Files/VamoAgendar/vamo-agendar-app

 Test Files  15 passed (15)
      Tests  228 passed (228)
   Start at  15:28:11
   Duration  407ms (transform 949ms, setup 0ms, import 1.31s, tests 280ms, environment 1ms)

########## pnpm test:integracao ##########
 RUN  v4.1.10 /mnt/Files/VamoAgendar/vamo-agendar-app

 Test Files  1 passed (1)
      Tests  13 passed (13)
   Start at  15:28:13
   Duration  7.32s (transform 86ms, setup 0ms, import 128ms, tests 7.10s, environment 0ms)
```

```
########## pnpm build ##########
✓ Compiled successfully in 5.2s
  Collecting page data using 11 workers ...
✓ Generating static pages using 11 workers (14/14) in 392ms
  Finalizing page optimization ...
build exit=0
```

```
########## verificar-travessia-server-action.sh ##########
Verificação da travessia de erro esperado pela fronteira de Server Action
Actions alvo: obterSlotsPublicos (leitura) e criarAgendamentoPublico (escrita)   |   Porta: 3992

  [APROVADO]  PREPARO           ids de obterSlotsPublicos (prefixo 70efdce3…) e criarAgendamentoPublico (prefixo 40488c27…) derivados de .next/server/server-reference-manifest.json
  [APROVADO]  CONTROLE          GET / devolveu 200 e o processo seguiu vivo
  [APROVADO]  SLOTS_ERRO        o corpo da resposta carrega o discriminante `slug_invalido` e nenhum `digest` opaco
  [APROVADO]  ESCRITA_VALIDACAO o corpo da resposta carrega o discriminante `campos_obrigatorios` e nenhum `digest` opaco
  [APROVADO]  SEM_VAZAMENTO     nenhum dos dois corpos carrega o slug do visitante, org_, PGRST ou tenant_id

Resumo: 5 vereditos, 0 reprovados — os erros esperados dos DOIS caminhos públicos atravessam a fronteira com identidade preservada.
exit=0
```

```
########## verificar-superficie-anon.sh ##########
Verificação da superfície anônima da Data API
Escopo: todas as tabelas operacionais
Tabelas derivadas de supabase/schemas/*.sql (9): agendamentos assinaturas clientes disparos_whatsapp excecoes_agenda horarios_funcionamento perfis_empresas servicos whatsapp_configs

  [ESPERADO]     perfis_empresas — GET ?select=*                       HTTP 401/42501
  [ESPERADO]     perfis_empresas — GET ?select=tenant_id,telefone_contato HTTP 401/42501
  [ESPERADO]     agendamentos — POST anônimo                          HTTP 401/42501
  [ESPERADO]     clientes — POST anônimo                              HTTP 401/42501
  [ESPERADO]     agendamentos — GET ?select=cliente_id                 HTTP 401/42501
  [ESPERADO]     excecoes_agenda — GET ?select=motivo                  HTTP 401/42501
  [ESPERADO]     servicos — GET ?select=tenant_id&limit=1              HTTP 401/42501
  [ESPERADO]     horarios_funcionamento — GET ?select=tenant_id&limit=1 HTTP 401/42501
  [ESPERADO]     assinaturas — GET ?select=tenant_id&limit=1           HTTP 401/42501
  [ESPERADO]     whatsapp_configs — GET ?select=tenant_id&limit=1      HTTP 401/42501
  [ESPERADO]     disparos_whatsapp — GET ?select=tenant_id&limit=1     HTTP 401/42501

  [COBERTURA]    todas as tabelas declaradas                             9 declarada(s), 9 coberta(s) por pelo menos uma checagem

Resumo: 11 checagem(ns), 0 reprovada(s) — a role anon não devolveu linha nenhuma.
exit=0
```

```
########## verificar-fail-fast-boot.sh ##########
Verificação do fail-fast de boot em produção
Variável alvo: QSTASH_NEXT_SIGNING_KEY   |   Porta: 3991

  [APROVADO]  BUILD      pnpm build saiu 0 com QSTASH_NEXT_SIGNING_KEY vazia
  [APROVADO]  MORTE      o processo do next encerrou com código 1, nomeou QSTASH_NEXT_SIGNING_KEY em stderr e a porta recusou conexão (curl 7)
  [APROVADO]  CONTROLE   com as quatorze presentes, GET / devolveu 200 e o processo seguiu vivo
  [APROVADO]  WEBHOOK    sem assinatura 401 | secret em query 401 | assinatura forjada 401 | GET / 200

Resumo: 4 vereditos, 0 reprovados — o boot morre de verdade e o webhook segue fechado.
exit=0
```

## Deviations from Plan

### Auto-fixed / ajustes de execução

**1. [Rule 2 — funcionalidade crítica ausente] Comentários reescritos para não cegar os grep-guards da fase**

- **Encontrado em:** Task 1, na medição das contagens finais
- **Problema:** os comentários explicativos que escrevi citavam `` `tenantId` `` e `` `plano_sem_whatsapp` `` em prosa, levando `grep -cE 'tenantId|tenant_id'` de 6 → 7 e `grep -c 'plano_sem_whatsapp'` de 1 → 2. Esses greps são invariantes declarados da fase e existem para pegar identificador vazando para contexto de reporte
- **Correção:** os dois comentários foram reescritos preservando o sentido ("nenhum identificador de tenant", "o motivo do caso definitivo"), e o de `assinaturas.ts` passou a registrar POR QUE o token não aparece nem em prosa
- **Arquivos:** `src/lib/assinaturas.ts`, `src/app/api/webhooks/lembrete/route.ts`
- **Commit:** `1f83412`

**2. [Ajuste de método] O rótulo do reporte reusa `erroSinteticoSupabase` em vez do fix literal do WR-07**

- O WR-07 prescrevia `{ rotulo: error.code ?? 'sem_codigo' }`. A versão implementada é `erroSinteticoSupabase(erro).message`, que produz `supabase:<code>` ou `supabase:sem_codigo` e **recusa** um `code` que não seja string não-vazia (`??` deixaria passar um objeto e o serializaria). A lógica de sanitização fica auditada num lugar só
- **Commit:** `1f83412`

**3. [Escopo] `notificacoes-agendamento.ts` e `agendamentos.ts` foram tocados, embora fora de `files_modified`**

- Mudança mecânica obrigatória: são chamadores de `obterPlanoVigentePublico` e o build quebraria sem desestruturar `{ plano }`. Nenhuma mudança de comportamento; ganharam comentário registrando por que a degradação **não** recebe ali o tratamento que recebeu no webhook
- **Commit:** `1f83412`

**4. [Método de commit] Commits atômicos por task, em vez de par `test(RED)` + `feat(GREEN)`**

- A Definition of Done do `CLAUDE.md` exige lint/test/build verdes, e um commit test-only seria um commit com `pnpm test` vermelho na história de um branch compartilhado. As duas medições RED foram observadas e a saída real está colada acima
- Consequência para quem auditar a sequência de gates TDD: não há commit `test(...)` isolado neste plano — a prova do RED é a saída registrada nesta seção

## Deferred / fora de escopo

**Avisos do Turbopack em `src/lib/env.ts` (pré-existentes).** `pnpm build` sai 0, mas emite `Turbopack build encountered 3 warnings: Ecmascript file had an error` apontando para `src/lib/env.ts:91-92` no rastro de `instrumentation.ts` (Edge Instrumentation). O arquivo **não foi tocado por este plano** (`git diff --name-only HEAD~2 HEAD` confirma) e o comportamento de fail-fast continua provado pelos quatro vereditos de `verificar-fail-fast-boot.sh`. É o `process.exit`/`process.stderr` do guard de boot sendo analisado no runtime edge — fora do escopo desta correção, registrado aqui para quem for mexer em `env.ts`.

## Known Stubs

Nenhum. Nenhum valor vazio, placeholder ou caminho não fiado foi introduzido — os dois ramos novos (degradação na resolução e no webhook) estão exercitados por teste.

## Threat Flags

Nenhuma superfície nova. As mudanças reduzem a superfície de indisponibilidade e aumentam a de observabilidade; nenhum endpoint, rota, caminho de auth ou schema foi criado. A única mudança de política de acesso é a ameaça **aceita e registrada** T-01-16-06, documentada acima e em comentário no código.

## Self-Check: PASSED

- `src/lib/__tests__/assinaturas.test.ts` — FOUND
- `src/lib/assinaturas.ts` — FOUND
- `src/app/actions/public-booking.ts` — FOUND
- `src/app/api/webhooks/lembrete/route.ts` — FOUND
- `src/app/actions/__tests__/public-booking-escrita.test.ts` — FOUND
- commit `1f83412` — FOUND
- commit `0a5b38b` — FOUND
