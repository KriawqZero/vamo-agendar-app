---
phase: 01-hardening-da-superf-cie-p-blica
plan: 11
subsystem: mensageria
tags: [qstash, upstash, evolution-api, segredos, pii, observabilidade, vitest]

requires:
    - phase: 01-hardening-da-superf-cie-p-blica (plano 01-03)
      provides: '`verificarAssinaturaQstash` com `Receiver`, e `route.ts` verificando contra `req.url` — a premissa que torna a remoção do parâmetro segura'
    - phase: 01-hardening-da-superf-cie-p-blica (etapa preparatória)
      provides: '`reportarFalhaSilenciosa` com contexto sem PII — o padrão seguro que o `console.error` vizinho contradizia'
provides:
    - 'URL de destino do lembrete publicada sem segredo: `${APP_URL}/api/webhooks/lembrete`, sem query string'
    - 'Contrato de higiene de log dos gateways: corpo de resposta de terceiro nunca chega ao `console.error`'
    - 'Cinco casos de teste que reprovam se qualquer um dos dois defeitos voltar'
affects: [01-13, mensageria, whatsapp, observabilidade]

tech-stack:
    added: []
    patterns:
        - 'Corpo de resposta de gateway externo nunca vai ao log: o que se registra é o código HTTP e o ponto de falha'
        - 'Asserção de higiene de log é NEGATIVA e sobre a chamada inteira serializada (`JSON.stringify(spy.mock.calls)`), não sobre o primeiro argumento'
        - 'Segredo de autenticação nunca viaja em URL: HMAC simétrica publicada é credencial entregue ao log de acesso de cada hop'

key-files:
    created: []
    modified:
        - src/lib/whatsapp-helper.ts
        - src/lib/__tests__/whatsapp-helper.test.ts

key-decisions:
    - 'A guarda de `QSTASH_CURRENT_SIGNING_KEY` foi PRESERVADA com papel novo: não monta mais a URL, e passa a existir só para recusar publicar um lembrete que o webhook depois não conseguiria autenticar — publicação assim é falha silenciosa garantida'
    - 'As mensagens de log usam o mesmo vocabulário do `motivo` (`http_401`), como o CR-04 propôs, para que log e auditoria em `disparos_whatsapp` sejam correlacionáveis — isso fez a contagem-proxy de `http_` subir de 3 para 6, sem tocar o contrato (ver Achados)'
    - 'A asserção de log usa `JSON.stringify(spy.mock.calls)` em vez do `join('' '')` sugerido no plano: um objeto passado cru (`console.error(msg, dataRes)`) vira `[object Object]` num join, e o quarto defeito era exatamente esse — a prova vermelha confirma que só a serialização o captura'
    - 'SEG-05 NÃO foi marcado como concluído em REQUIREMENTS.md: a metade criptográfica está fechada, mas a chave já circulou e a rotação é ação do owner rastreada no 01-13. Marcar aqui seria afirmar o que não é verdade'

patterns-established:
    - 'Quando um `console.error` e o `reportarFalhaSilenciosa` da linha seguinte discordam sobre o que pode ser registrado, o mais restritivo é o correto: a trava de telemetria não alcança o log de infraestrutura'
    - 'Prova de trava por reversão temporária do conserto, com a saída vermelha colada no SUMMARY — teste que nunca foi visto falhando não é trava'

requirements-completed: []
requirements-advanced: [SEG-05]

metrics:
    duration: ~35min
    tasks: 2
    files-modified: 2
    tests-before: 204
    tests-after: 209
    completed: 2026-07-22
status: complete
---

# Phase 01 Plano 11: A chave sai da URL e o corpo do gateway sai do log — Summary

A chave HMAC que autentica o webhook de lembrete deixou de ser publicada em texto claro na URL de destino de toda mensagem do QStash, e as quatro chamadas de `console.error` que despejavam corpo de resposta de gateway no log da aplicação passaram a registrar só o código HTTP.

## O que foi feito

**Task 1 — publicação limpa e log sem corpo de gateway** (commit `01b1195`)

`agendarLembreteQStash` publica agora em `${APP_URL}/api/webhooks/lembrete`, sem parâmetro nenhum. A premissa que sustentava o deferimento foi conferida no código antes de mexer, não aceita de segunda mão: `src/app/api/webhooks/lembrete/route.ts:30` passa `url: req.url` a `verificarAssinaturaQstash` — a URL que a requisição **de fato traz**, não uma constante montada. Logo, lembrete já enfileirado (publicado com o parâmetro) e lembrete novo (sem) validam cada um contra a própria claim `sub`. Não existem "duas gerações" em conflito.

A guarda de chave ausente sobreviveu, com o papel redefinido no comentário: ela não monta mais URL nenhuma, e existe para recusar publicar um lembrete que depois não teria como ser autenticado.

Quatro `console.error` pararam de ler o corpo da resposta:

| Ponto | O que vazava | Motivo registrado no código |
|---|---|---|
| falha da Evolution (`enviarMensagemWhatsApp`) | telefone e texto já com `{{cliente}}` substituído | PII do cliente final; `reportarFalhaSilenciosa` uma linha abaixo já mandava só `statusCode` — o `console.error` contradizia o próprio vizinho |
| falha do publish (QStash) | corpo de erro que ecoa a URL de destino | log de aplicação não é lugar de URL de publicação |
| falha do cancelamento (QStash) | idem | idem |
| `messageId` ausente no publish | objeto de resposta já parseado | também pode ecoar a URL de destino |

Os `console.error` de `catch (err)` continuam recebendo o erro — é um `Error` do próprio `fetch`, não corpo de terceiro, e sem ele um `ECONNREFUSED` fica sem diagnóstico.

**Task 2 — cinco travas** (commit `8c154f1`)

Casos novos em `whatsapp-helper.test.ts`, reusando `respostaHttp` e `vi.stubGlobal` já presentes: URL de destino sem `?`; URL sem a chave de assinatura de teste; log da Evolution sem telefone, sem nome e sem o texto personalizado; log do QStash sem a URL de destino; log de `messageId` ausente sem o objeto de resposta. Todos asseram também que o `motivo` de retorno não mudou.

## Contagens medidas (antes → depois)

| Medição | Antes | Depois | Referência do plano |
|---|---|---|---|
| `?secret` em código executável | 1 | **0** | 1 → alvo 0 ✓ |
| `response.text()` em código executável | 3 | **0** | 3 → alvo 0 ✓ |
| `qstash_sem_chave_assinatura` | 1 | **1** | invariante ✓ |
| `http_` (proxy do contrato) | 3 | **6** | invariante literal **divergiu** — ver Achados |
| `motivo: \`http_` (o contrato de fato) | 3 | **3** | intocado ✓ |
| `spyOn(console, 'error')` no teste | 0 | **3** | ≥ 1 ✓ |
| linhas com `api/webhooks/lembrete` | 1 (com `?`) | 1 (sem `?`) | ✓ |

`git diff --name-only` nunca listou `src/app/api/webhooks/lembrete/route.ts` — o webhook não foi tocado.

## Achados

**A contagem-proxy de `http_` subiu de 3 para 6, e o invariante que ela media continua verdadeiro.** O critério pedia contagem estável de `http_` como prova de que o contrato de retorno não mudou. As mensagens de log novas usam o mesmo formato (`Erro ao disparar WhatsApp via Evolution: http_401`) — que é literalmente o fix escrito no CR-04 do review — e cada uma acrescentou uma ocorrência. A medição precisa do contrato (`grep -c 'motivo: \`http_'`) devolve **3 antes e 3 depois**, confirmado inclusive contra `git show HEAD:` do estado anterior. Mantive o formato porque log e `disparos_whatsapp` passam a falar o mesmo vocabulário; a alternativa (mudar o log para `(status 401)`) satisfaria a contagem literal e pioraria a correlação.

**`docs/09-OBSERVABILIDADE_E_EMAIL.md:124-125` está desatualizado.** O texto afirma que "`notificacoes-agendamento.ts` loga a URL do QStash, que carrega `?secret=`". `grep` nesse arquivo devolve um único `console.error`, na linha 155, que loga apenas `err` de um `catch` — a URL não aparece lá. A afirmação sobre `whatsapp-helper.ts` no mesmo parágrafo era verdadeira e agora deixou de ser. **Fora de escopo deste plano** (`files_modified` cobre dois arquivos); correção de documento é o 01-13, que já tem no escopo os documentos cuja premissa o verificador refutou.

## O que este plano NÃO fez, de propósito

A rotação das signing keys na Upstash **não foi feita nem marcada**. A chave já circulou por log de acesso e pelo console da Upstash, e parar de publicá-la não desfaz isso. A rotação é ação do owner no painel, depois de a fila secar (≤ 14 dias), e vira item datado no 01-13. Enquanto ela não acontecer, T-01-11-01 continua aberto — foi por isso que SEG-05 não foi marcado como concluído.

Também não foi tocado o débito aberto em `BookingApp.tsx:276` (`includes('já foi preenchido')`), que é do 01-12.

## Saídas reais dos gates

### `pnpm lint`

```
$ eslint
EXIT_LINT=0
```

### `pnpm test` — antes da Task 2 (baseline, já com o conserto da Task 1)

```
 RUN  v4.1.10 /mnt/Files/VamoAgendar/vamo-agendar-app

 Test Files  14 passed (14)
      Tests  204 passed (204)
   Start at  13:38:40
   Duration  449ms (transform 849ms, setup 0ms, import 1.25s, tests 332ms, environment 2ms)

EXIT_TEST=0
```

### `pnpm test` — final (209 testes; +5, exigido ≥ 4)

```
 RUN  v4.1.10 /mnt/Files/VamoAgendar/vamo-agendar-app

 Test Files  14 passed (14)
      Tests  209 passed (209)
   Start at  13:44:17
   Duration  398ms (transform 739ms, setup 0ms, import 1.08s, tests 288ms, environment 1ms)

EXIT_TEST=0
```

Hermético (sem rede, todo I/O por `fetch` stubado) e 398 ms — bem abaixo do teto de 2 s.

### Prova vermelha — os cinco casos com o conserto revertido

Reintroduzi temporariamente os dois defeitos (o parâmetro na URL e a leitura do corpo nas quatro chamadas), rodei, e restaurei com `git checkout -- src/lib/whatsapp-helper.ts`. Os cinco casos reprovaram:

```
 ❯ src/lib/__tests__/whatsapp-helper.test.ts (19 tests | 5 failed) 21ms
     × não deixa telefone nem texto personalizado do cliente chegarem ao log 4ms
     × publica numa URL de destino sem query string 1ms
     × não publica a chave de assinatura do QStash em posição nenhuma da URL 1ms
     × não deixa a URL de destino ecoada pelo QStash chegar ao log 1ms
     × não despeja o objeto de resposta no log quando falta o messageId 1ms

 FAIL  … > não deixa telefone nem texto personalizado do cliente chegarem ao log
AssertionError: expected '[["Erro ao disparar WhatsApp via Evol…' not to contain '5567999998888'

 FAIL  … > publica numa URL de destino sem query string
AssertionError: expected 'https://vamoagendar.com.br/api/webhoo…' not to contain '?'

 FAIL  … > não deixa a URL de destino ecoada pelo QStash chegar ao log
AssertionError: expected '[["Falha ao registrar agendamento no …' not to contain 'https://vamoagendar.com.br/api/webhoo…'

 FAIL  … > não despeja o objeto de resposta no log quando falta o messageId
AssertionError: expected '[["QStash não retornou messageId no p…' not to contain '/api/webhooks/lembrete'

 Test Files  1 failed | 13 passed (14)
      Tests  5 failed | 204 passed (209)
EXIT_TEST=1
```

O quarto e o quinto merecem nota: o defeito do `messageId` passava um **objeto** como segundo argumento. Com o `join(' ')` sugerido no plano ele viraria `[object Object]` e o teste passaria em cima do defeito. A serialização captura.

(Os valores que aparecem acima — `sig-atual-teste`, o telefone e o nome — são literais sintéticos dos testes, fixados em `vitest.config.ts` e no próprio arquivo de teste. Nenhum valor de credencial real aparece aqui, no código ou nos commits.)

### `pnpm build`

```
ƒ Proxy (Middleware)

○  (Static)   prerendered as static content
●  (SSG)      prerendered as static HTML (uses generateStaticParams)
ƒ  (Dynamic)  server-rendered on demand

EXIT_BUILD=0
```

### `npx tsc --noEmit`

```
EXIT_TSC=0
```

### `bash scripts/verificar-fail-fast-boot.sh`

```
Verificação do fail-fast de boot em produção
Variável alvo: QSTASH_NEXT_SIGNING_KEY   |   Porta: 3991

  … rodando pnpm build com QSTASH_NEXT_SIGNING_KEY vazia (pode levar ~1 min)
  [APROVADO]  BUILD      pnpm build saiu 0 com QSTASH_NEXT_SIGNING_KEY vazia
  [APROVADO]  MORTE      o processo do next encerrou com código 1, nomeou QSTASH_NEXT_SIGNING_KEY em stderr e a porta recusou conexão (curl 7)
  [APROVADO]  CONTROLE   com as quatorze presentes, GET / devolveu 200 e o processo seguiu vivo
  [APROVADO]  WEBHOOK    sem assinatura 401 | secret em query 401 | assinatura forjada 401 | GET / 200

Resumo: 4 vereditos, 0 reprovados — o boot morre de verdade e o webhook segue fechado.
EXIT_HARNESS=0
```

O veredito `WEBHOOK` segue `401,401,401,200` — inclusive o caso "secret em query 401", que continua provando que o parâmetro legado nunca autenticou nada.

## Desvios do plano

**1. [Rule 2 — rigor de asserção] Serialização em vez de `join(' ')` na trava de log**
- **Encontrado em:** Task 2
- **Motivo:** o plano sugeriu `spy.mock.calls.flat().join(' ')`; um dos quatro defeitos passava um objeto como segundo argumento, que num join vira `[object Object]` e escaparia da asserção
- **Feito:** helper `textoLogado()` com `JSON.stringify(spy.mock.calls)` — superconjunto estrito do sugerido
- **Prova:** o caso `não despeja o objeto de resposta no log` reprova na reversão, o que só acontece por causa dessa escolha
- **Commit:** `8c154f1`

**2. [Achado de medição] Invariante-proxy `http_` divergiu, invariante real preservado** — documentado na seção Achados acima, com a medição precisa em substituição.

Nenhuma outra deviação: nenhum pacote instalado, nenhuma rota, coluna, tipo ou flag nova, nenhum arquivo além dos dois de `files_modified`.

## Verificação do plano

| # | Verificação | Resultado |
|---|---|---|
| 1 | `?secret` em código executável → 0 | ✓ |
| 2 | `response.text()` em código executável → 0 | ✓ |
| 3 | `pnpm test` exit 0, hermético, contagem maior | ✓ 209 > 204, 398 ms |
| 4 | `pnpm lint` exit 0 | ✓ |
| 5 | `pnpm build` exit 0 | ✓ |
| 6 | `verificar-fail-fast-boot.sh` exit 0, 4 vereditos | ✓ |

## Self-Check: PASSED

- `src/lib/whatsapp-helper.ts` — modificado, presente
- `src/lib/__tests__/whatsapp-helper.test.ts` — modificado, presente
- commit `01b1195` — presente no histórico
- commit `8c154f1` — presente no histórico
