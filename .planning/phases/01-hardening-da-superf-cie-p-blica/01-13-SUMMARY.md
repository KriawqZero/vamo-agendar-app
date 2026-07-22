---
phase: 01-hardening-da-superf-cie-p-blica
plan: 13
subsystem: documentacao
tags: [registro-de-risco, qstash, upstash, deferimentos, code-review, pendencias]

requires:
    - phase: 01-hardening-da-superf-cie-p-blica (plano 01-11)
      provides: 'A chave de assinatura fora da URL publicada — é o fato que este plano registra como etapa 1 feita'
    - phase: 01-hardening-da-superf-cie-p-blica (plano 01-12)
      provides: 'Travessia de erro discriminada pela fronteira de Server Action — concluída antes de este plano afirmar que a fase fechou'
    - phase: 01-hardening-da-superf-cie-p-blica (plano 01-03)
      provides: '`src/lib/qstash-assinatura.ts` — o artefato apontado como prova de que a autenticação por assinatura existe'
provides:
    - 'Item datado de rotação das signing keys do QStash em `docs/PENDENCIAS.md`, com dono (owner), prazo 2026-08-05 e as duas etapas separadas'
    - 'Seção "Achados do code review da Phase 1 diferidos" com WR-01, WR-03, WR-04 e WR-06, cada um com consequência concreta e gatilho de retorno'
    - 'Registro das duas afirmações desatualizadas que caem fora do escopo deste plano, com a medição que as refuta'
affects: [documentacao, mensageria, phase-03, phase-11]

tech-stack:
    added: []
    patterns:
        - 'Correção de decisão registrada é anotação datada e atribuída, com o texto original preservado — nunca reescrita'
        - 'Afirmação de fechamento em documento carrega o comando que a reproduz, não o relato de quem a escreveu'
        - 'Achado de review não aprovado vira deferimento com consequência e gatilho; achado sem registro reaparece como surpresa'

key-files:
    created: []
    modified:
        - docs/PENDENCIAS.md
        - .planning/phases/01-hardening-da-superf-cie-p-blica/01-CONTEXT.md
        - .planning/phases/01-hardening-da-superf-cie-p-blica/COVERAGE.md

key-decisions:
    - 'A rotação das signing keys NÃO foi marcada como feita nem descrita como feita. A etapa 2 nasce aberta, com dono nomeado e data-limite 2026-08-05 — 14 dias após 2026-07-22, o horizonte máximo de agendamento de lembrete no QStash'
    - 'SEG-05 continua NÃO concluído em REQUIREMENTS.md, pela mesma razão que o plano 01-11 deu: a metade criptográfica fechou, a chave que já circulou não foi rotacionada'
    - 'A linha `Client.publishJSON` de COVERAGE.md continua OPT-OUT — a decisão sobreviveu ao escrutínio, só a razão foi trocada. INTEGRATE acrescentaria superfície de SDK sem fechar critério nenhum'
    - 'Os dois drifts de documentação apontados pelo orquestrador (docs/09 e os JSDoc de observabilidade sob src/) NÃO foram corrigidos: caem fora dos três arquivos do `files_modified`, e o segundo está sob `src/`, que este plano se proíbe de tocar. Foram registrados com a medição que os refuta, em vez de silenciados'

requirements-completed: []
requirements-advanced: [SEG-05]

metrics:
    duration: ~30min
    tasks: 2
    files-modified: 3
    tests-before: 217
    tests-after: 217
    completed: 2026-07-22
status: complete
---

# Phase 01 Plano 13: Os documentos passam a dizer o que o código diz — e o que continua aberto — Summary

O item de webhook de `docs/PENDENCIAS.md` deixou de afirmar duas coisas falsas, o risco que
sobrevive à fase virou item datado com dono, as duas premissas refutadas foram corrigidas
com o texto original preservado, e os quatro achados de review não aprovados nesta rodada
ficaram por escrito com caminho de volta. Nenhum arquivo sob `src/` foi tocado.

## Gate de reexecução — rodado ANTES do primeiro Edit

Saída real, sobre o HEAD `205c997` (com 01-10, 01-11 e 01-12 já mesclados):

```
=== GATE 1: grep -vE '^\s*(//|\*|/\*)' src/lib/whatsapp-helper.ts | grep -c '?secret' ===
0

=== GATE 2: grep -rn 'secret-key' src/ scripts/ ===
(saída vazia)

=== GATE 3: bash scripts/verificar-travessia-server-action.sh ===
  [APROVADO]  PREPARO           ids de obterSlotsPublicos (prefixo 70efdce3…) e criarAgendamentoPublico (prefixo 40488c27…) derivados de .next/server/server-reference-manifest.json
  [APROVADO]  CONTROLE          GET / devolveu 200 e o processo seguiu vivo
  [APROVADO]  SLOTS_ERRO        o corpo da resposta carrega o discriminante `slug_invalido` e nenhum `digest` opaco
  [APROVADO]  ESCRITA_VALIDACAO o corpo da resposta carrega o discriminante `campos_obrigatorios` e nenhum `digest` opaco
  [APROVADO]  SEM_VAZAMENTO     nenhum dos dois corpos carrega o slug do visitante, org_, PGRST ou tenant_id

Resumo: 5 vereditos, 0 reprovados
exit=0

=== GATE 4: bash scripts/verificar-fail-fast-boot.sh ===
  [APROVADO]  BUILD      pnpm build saiu 0 com QSTASH_NEXT_SIGNING_KEY vazia
  [APROVADO]  MORTE      o processo do next encerrou com código 1, nomeou QSTASH_NEXT_SIGNING_KEY em stderr e a porta recusou conexão (curl 7)
  [APROVADO]  CONTROLE   com as quatorze presentes, GET / devolveu 200 e o processo seguiu vivo
  [APROVADO]  WEBHOOK    sem assinatura 401 | secret em query 401 | assinatura forjada 401 | GET / 200

Resumo: 4 vereditos, 0 reprovados
exit=0
```

Os quatro passaram, e é o que autoriza este plano a escrever "fechado" em qualquer lugar.

## O que foi feito

**Task 1 — o item do webhook descreve o mundo como ele é, e o resíduo ganha prazo**
(commit `15b62c3`)

O sub-item de "Revisão de segurança geral" foi reescrito no molde da seção "Superfície
remanescente": o achado original de 2026-07-14 continua legível, riscado e marcado como
resolvido, e cada metade recebeu a evidência que a reproduz — `src/lib/qstash-assinatura.ts`
chamado por `route.ts` antes do parse do corpo (plano 01-03), o veredito `WEBHOOK` do
harness (`401,401,401,200`, com o caso do meio provando que o parâmetro legado não
autentica nada), o `grep` vazio do fallback `'secret-key'`, e o veredito `MORTE` para as
chaves obrigatórias no boot (plano 01-06).

O item novo, **"🔑 Rotação das signing keys do QStash — ação do owner, prazo 2026-08-05"**,
entrou imediatamente antes da lista de UAT, porque as duas coisas têm a mesma natureza: só
o owner fecha. Ele nomeia os três vetores de exposição do CR-01 (log de acesso de cada hop,
console da Upstash por até 14 dias, e o log da aplicação que recebia o corpo de erro do
QStash), separa **etapa 1 — feita** de **etapa 2 — aberta**, e escreve por que a espera é
necessária: rotacionar com a fila cheia invalida a assinatura dos lembretes já publicados e
os mata em silêncio, que é o modo de falha característico da mensageria deste projeto. A
data 2026-08-05 é 14 dias depois de 2026-07-22, o horizonte máximo de agendamento no QStash.

Só nomes de variável (`QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`). Nenhum valor.

**Task 2 — as premissas refutadas corrigidas com histórico, e os quatro deferimentos por
escrito** (commit `2a1ba2e`)

O bullet de `01-CONTEXT.md` §Deferred Ideas continua **inteiro e legível**; abaixo dele
entrou uma nota no formato da correção de `.env.example` que já existia no mesmo arquivo
(linhas 95-97): datada, atribuída à reverificação sobre o HEAD `4596463`, dizendo o que a
medição mostrou (`route.ts:30` passa `url: req.url`, então cada mensagem valida contra a
própria URL de publicação) e qual foi a consequência (deferimento revertido, item entregue
no 01-11). Antes de escrever que a premissa era falsa, reli `route.ts:15-36` — está lá.

Em `COVERAGE.md`, a linha `Client.publishJSON` continua **OPT-OUT**: a decisão sobreviveu ao
escrutínio, a razão não. A razão nova é que o publisher por `fetch` cru já existe, é coberto
por teste, e a limpeza da URL não dependeu do SDK — trocar o transporte acrescentaria
superfície sem fechar critério nenhum, e a reavaliação fica atrelada a uma necessidade real
de retry/DLQ (Phase 11). Uma nota datada abaixo da tabela registra a troca.

Os quatro deferimentos entraram como `### Achados do code review da Phase 1 diferidos
(2026-07-22)`, dentro de "Obrigatório antes do lançamento público", cada um com arquivo,
linha, consequência concreta e gatilho. **WR-01 está marcado como o mais barato e o mais
aderente ao tema da fase**, com o conserto escrito e a frase que importa: não entrou porque
não foi aprovado nesta rodada, não porque seja difícil.

## Contagens medidas (antes → depois)

| Medição | Antes | Depois | Critério |
|---|---|---|---|
| `2026-08-05` em `PENDENCIAS.md` | 0 | **3** | `>= 1` ✓ |
| `qstash-assinatura.ts` em `PENDENCIAS.md` | 1 | **3** | `>= 2`, relativo ✓ |
| `o ideal é migrar para verificação da assinatura real` | 1 | **0** | `0`, absoluto ✓ |
| `sig_\|qstash_[A-Za-z0-9]{16,}` em `PENDENCIAS.md` | 0 | **0** | `0`, não-regressão ✓ |
| `WR-01\|WR-03\|WR-04\|WR-06` em `PENDENCIAS.md` | 0 | **4** | `>= 4` ✓ |
| `duas gerações de URL` em `01-CONTEXT.md` | 1 | **1** | INVARIANTE ✓ |
| `req.url` em `01-CONTEXT.md` | 1 | **2** | `>= 2`, relativo ✓ |
| `2026-07-22` em `01-CONTEXT.md` | 0 | **1** | `> 0` ✓ |
| `OPT-OUT` em `COVERAGE.md` | 7 | **7** | INVARIANTE ✓ |
| `colide com a fila em trânsito` em `COVERAGE.md` | 1 | **0** | `0` ✓ |
| UAT: `- [ ]` / `- [x]` na seção | 7 / 0 | **7 / 0** | INVARIANTE ✓ |
| arquivos sob `src/` no diff do plano | — | **0** | INVARIANTE ✓ |

O critério do `qstash-assinatura.ts` era relativo justamente porque a citação já existia. As
três ocorrências finais, com linha:

```
1052:  (b) `verificarAssinaturaQstash` (`src/lib/qstash-assinatura.ts:42`) **lança** se
1134:      `src/lib/qstash-assinatura.ts`, chamado por
(+1 em WR-04, na seção de deferimentos da Task 2)
```

A de 1052 é a pré-existente, sobre o `throw`. A de 1134 está **dentro do item de webhook
reescrito** — é ela que prova que a citação nova não foi contada de outro lugar do arquivo.

Verificação estrutural extra em `COVERAGE.md`, porque a contagem de `OPT-OUT` sozinha não
prova integridade da tabela: 7 linhas de dados, todas com decisão (`INTEGRATE` ou
`OPT-OUT`), e todo `OPT-OUT` com motivo entre 55 e 277 caracteres. Nenhuma linha foi apagada.

## Achados

**A contagem de `OPT-OUT` subiu para 9 na primeira redação e foi corrigida na fonte.** A
nota de correção que escrevi abaixo da tabela usava o literal `OPT-OUT` duas vezes em prosa
("o motivo do OPT-OUT de `Client.publishJSON`…", "a decisão continua OPT-OUT"). O invariante
media a tabela, não a prosa, e a tabela estava intacta — mas o critério é literal, e explicar
a divergência custaria mais que reescrever duas frases. Reformulei para "descartar
`Client.publishJSON`" e "a decisão da linha não mudou". Contagem de volta a 7, com o mesmo
sentido. Anoto porque a alternativa — documentar a divergência e seguir — é o caminho que
transforma invariante em sugestão.

**Os dois drifts apontados pelo orquestrador caem fora do escopo deste plano.** Confirmei os
dois por medição antes de decidir:

```
=== console.* em notificacoes-agendamento.ts ===
155:        console.error('Erro ao processar notificações automáticas do agendamento:', err)
=== url/QSTASH em notificacoes-agendamento.ts ===
(nada)
```

`docs/09-OBSERVABILIDADE_E_EMAIL.md:124-125` está errado, como o executor do 01-11 apontou.
E a varredura de `?secret` em `src/` mostra que o drift do JSDoc é maior que o relatado:
além de `src/lib/observabilidade/sanitizacao.ts:100`, há
`src/lib/observabilidade/opcoes-sentry.ts:31` dizendo a mesma coisa no presente.

Nenhum dos dois foi corrigido. `files_modified` deste plano declara três arquivos, e nenhum
deles é `docs/09`; o segundo drift está sob `src/`, que o critério de aceite proíbe
explicitamente tocar. Em vez de silenciar, os dois foram **registrados** em `docs/PENDENCIAS.md`
como subseção da área de deferimentos, com a medição que os refuta e o gatilho de correção
(a próxima mudança em qualquer dos três arquivos, ou a próxima passada da skill `docs-vivas`).
Nada disso muda comportamento — as travas anti-PII continuam corretas e cobertas por teste;
o que está errado é a justificativa escrita ao lado delas.

## O que este plano NÃO fez, de propósito

- **Não rotacionou as signing keys e não marcou a rotação como feita.** É ação do owner no
  painel da Upstash, depois de a fila secar. O item nasce aberto.
- **Não marcou SEG-05 como concluído.** Mesma razão do 01-11: a metade criptográfica fechou,
  a chave comprometida não foi trocada. Marcar aqui seria escrever exatamente o tipo de
  afirmação que queimou esta fase.
- **Não tocou nenhum item de UAT humano.** Contados antes e depois: 7 abertos, 0 marcados.
- **Não apagou o texto original de nenhuma decisão.** As duas correções são anotações.

## Saídas reais dos gates

### `pnpm lint`

```
$ eslint
EXIT_LINT=0
```

### `npx tsc --noEmit`

```
EXIT_TSC=0
```

### `pnpm test`

```
$ vitest run

 RUN  v4.1.10 /mnt/Files/VamoAgendar/vamo-agendar-app

 Test Files  14 passed (14)
      Tests  217 passed (217)
   Start at  14:24:09
   Duration  465ms (transform 1.07s, setup 0ms, import 1.51s, tests 305ms, environment 1ms)

EXIT_TEST=0
```

14 arquivos / 217 testes — idêntico à linha de base medida pelo orquestrador neste HEAD.
Plano de documentação, contagem estável é o resultado esperado.

### `pnpm build`

```
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

ƒ Proxy (Middleware)

EXIT_BUILD=0
```

## Desvios do plano

**1. [Rule 1 — correção na fonte] Invariante `OPT-OUT` quebrado pela própria nota de
correção**
- **Encontrado em:** Task 2, na verificação pós-edição (7 → 9)
- **Causa:** a nota de correção repetia o literal `OPT-OUT` duas vezes em prosa
- **Feito:** reescrita das duas frases sem o literal, preservando o sentido; contagem de
  volta a 7, mais verificação estrutural da tabela (7 linhas, todas com decisão, todo
  OPT-OUT com motivo) para não depender só do proxy
- **Commit:** `2a1ba2e`

**2. [Escopo — registrado, não corrigido] Dois drifts de documentação fora do
`files_modified`**
- Documentado na seção Achados. `docs/09-OBSERVABILIDADE_E_EMAIL.md:124-125` e os JSDoc de
  `src/lib/observabilidade/{sanitizacao,opcoes-sentry}.ts` continuam errados, agora com
  registro e gatilho em `docs/PENDENCIAS.md`.

Nenhum outro desvio: nenhum pacote instalado, nenhum arquivo além dos três declarados,
nenhuma linha sob `src/`.

## Verificação do plano

| # | Verificação | Resultado |
|---|---|---|
| 1 | Os quatro comandos do gate de reexecução, antes do primeiro Edit | ✓ colados acima, todos exit 0 |
| 2 | `grep -cE 'WR-01\|WR-03\|WR-04\|WR-06' docs/PENDENCIAS.md` → `>= 4` | ✓ 4 |
| 3 | `grep -c '2026-08-05' docs/PENDENCIAS.md` → `>= 1` | ✓ 3 |
| 4 | `grep -c 'o ideal é migrar…' docs/PENDENCIAS.md` → `0` | ✓ 0 |
| 5 | `grep -c 'colide com a fila em trânsito' COVERAGE.md` → `0` | ✓ 0 |
| 6 | UAT: 7 abertos, 0 marcados, antes e depois | ✓ 7 / 0 nas duas medições |
| 7 | `git diff --name-only` não lista nada sob `src/` | ✓ 0 arquivos |

## Self-Check: PASSED

- `docs/PENDENCIAS.md` — modificado, presente
- `.planning/phases/01-hardening-da-superf-cie-p-blica/01-CONTEXT.md` — modificado, presente
- `.planning/phases/01-hardening-da-superf-cie-p-blica/COVERAGE.md` — modificado, presente
- commit `15b62c3` — presente no histórico
- commit `2a1ba2e` — presente no histórico
- árvore de trabalho limpa após os dois commits
</content>
</invoke>
