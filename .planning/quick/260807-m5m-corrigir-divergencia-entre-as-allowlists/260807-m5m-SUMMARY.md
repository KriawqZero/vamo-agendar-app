---
phase: quick/260807-m5m
plan: 01
subsystem: observabilidade
tags: [anti-pii, sentry, rate-limit, refactor, tdd]
status: complete
requires: []
provides:
  - src/lib/observabilidade/atributos-log.ts (fonte única do julgamento de atributo de log)
affects:
  - src/lib/observabilidade/log.ts
  - src/lib/observabilidade/sanitizacao.ts
tech-stack:
  added: []
  patterns:
    - "Fonte única de julgamento consultada pelas duas barreiras, em vez de duas allowlists duplicadas"
    - "Teste que itera a allowlist EXPORTADA — chave nova sem cobertura reprova em vez de passar em silêncio"
key-files:
  created:
    - src/lib/observabilidade/atributos-log.ts
    - src/lib/observabilidade/__tests__/allowlist-atributos.test.ts
  modified:
    - src/lib/observabilidade/log.ts
    - src/lib/observabilidade/sanitizacao.ts
    - src/lib/observabilidade/__tests__/log.test.ts
    - src/lib/__tests__/opcoes-sentry.test.ts
    - .planning/phases/03-anti-abuso-no-booking-p-blico/03-UAT.md
    - docs/PENDENCIAS.md
decisions:
  - "A allowlist de `extra` das Issues continua SEPARADA da allowlist de atributos de log: ela é deliberadamente mais estreita, e unificá-la alargaria o que vai nas Issues sem revisão"
  - "`camada` só entrou na allowlist de `extra` porque seu domínio é fechado (quatro literais de CamadaRateLimit), reconfirmado por grep antes da edição"
  - "Fixture `tenantHash: 'abc12345'` (8 hex) do log.test.ts corrigido para 16 hex — era sobra da época em que a última barreira não validava forma"
metrics:
  duration: ~25min
  completed: 2026-08-07
---

# Quick task 260807-m5m: corrigir divergência entre as allowlists — Summary

Duas allowlists de atributos de observabilidade eram mantidas em paralelo e uma envelheceu;
agora um módulo só decide se um atributo pode sair do processo, e as duas barreiras o
consultam — com a validação de forma de hash passando a valer também na última.

## O defeito, e por que o sintoma era o menor dos problemas

A decisão "este atributo pode sair do processo?" era tomada em dois lugares com listas
separadas: `sanitizarAtributosLog` (`log.ts`, o nosso filtro) e `sanitizarLogSentry`
(`sanitizacao.ts`, o `beforeSendLog` do SDK — a última barreira antes do fornecedor). Nada
obrigava as duas a concordar, e elas divergiram: a Phase 03 acrescentou `camada` e
`chaveHash` só à primeira. Os dois atributos passavam pelo nosso filtro para serem
descartados **depois de aprovados**, na saída.

Efeito medido em produção (Sentry Log real, release `25997ce`, 2026-07-28T00:36:36Z): o log
`ratelimit.bloqueio` chegou com `codigo` e `fluxo` — que estavam nas duas listas — e sem
`camada` nem `chaveHash`. O SC3 da Phase 03 ("o owner consegue ver quantas requisições foram
barradas e por qual chave") era inobservável por construção.

Acrescentar dois nomes na segunda lista consertaria hoje e reencenaria o mesmo bug no
próximo atributo. Por isso a entrega é a fonte única mais a trava que reprova se alguém
reabrir a bifurcação.

## Achado não planejado, mais grave que o sintoma

O par de asserções do Teste 3 (hash bem-formado sobrevive **E** IP cru é descartado) foi
escrito para impedir falso-verde, e pagou por si na primeira execução:

```
`tenantHash`: hash bem-formado sobrevive E IP cru é descartado
AssertionError: expected { tenantHash: '198.51.100.7' } to deeply equal {}
```

**Um IP cru em `tenantHash` atravessava o `beforeSendLog` e ia para o Sentry.** A cópia de
`sanitizacao.ts` filtrava só por NOME de chave; a validação de forma (16 hex, WR-07) existia
apenas na primeira barreira. Como quem chama `Sentry.logger.*` direto contorna a primeira
inteira, o invariante nunca-PII dependia de convenção de chamador exatamente no ponto onde o
dado deixa o processo. Fechado junto.

Vale registrar o mecanismo: a metade "IP cru é descartado" **passa sozinha pelo motivo
errado** enquanto a chave não está na allowlist — ela é descartada por nome, não por forma.
Só o par distingue as duas coisas. Escrever as duas asserções juntas não foi formalidade.

## Registro do VERMELHO (Task 1) — a prova de que a trava reprova

Teste novo rodado com `sanitizacao.ts` **intocado** (a última barreira ainda com a lista
velha de 14 chaves e sem validação de forma):

```
 × `camada` sobrevive ao beforeSendLog (`sanitizarLogSentry`) 5ms
 × `chaveHash` sobrevive ao beforeSendLog (`sanitizarLogSentry`) 1ms
 × as duas barreiras em série preservam o log real de `ratelimit.bloqueio` 1ms
 × `chaveHash`: hash bem-formado sobrevive E IP cru é descartado 1ms
 × `tenantHash`: hash bem-formado sobrevive E IP cru é descartado 1ms
 × um chamador que use `Sentry.logger.*` direto não vaza IP pela primeira barreira ausente 1ms
 × chave desconhecida continua sendo descartada — a allowlist segue FECHADA 0ms

AssertionError: expected {} to deeply equal { camada: 'escrita_ip' }
AssertionError: expected {} to deeply equal { chaveHash: 'abc1230000000000' }
AssertionError: expected {} to deeply equal { chaveHash: 'a1b2c3d4e5f60718' }
AssertionError: expected { tenantHash: '198.51.100.7' } to deeply equal {}
AssertionError: expected { tenantHash: 'org_PII_TESTE', …(1) } to deeply equal { camada: 'escrita_ip' }

 Test Files  1 failed (1)
      Tests  7 failed | 16 passed (23)
```

Depois do conserto, as três suítes juntas:

```
 Test Files  3 passed (3)
      Tests  64 passed (64)
```

Grep da fonte única (as duas barreiras consultando o mesmo módulo):

```
src/lib/observabilidade/log.ts:4
src/lib/observabilidade/sanitizacao.ts:3
```

## Registro do VERMELHO (Task 2)

`camada` apagado do `extra` antes de a Issue sair:

```
 FAIL  src/lib/__tests__/opcoes-sentry.test.ts > sanitizarEventoSentry > preserva `camada` no extra das Issues de rate limit, sem afrouxar a allowlist
AssertionError: expected { fluxo: 'rate_limit', …(1) } to deeply equal { fluxo: 'rate_limit', …(2) }
-   "camada": "escrita_ip",

 Test Files  1 failed (1)
      Tests  1 failed | 29 passed (30)
```

Verde depois: `Tests 30 passed (30)`.

Reconfirmação por grep **antes** de alargar a allowlist (é a única coisa que autoriza
alargá-la — sem domínio fechado, a resposta seria não):

```
src/lib/rate-limit.ts:379:function reportarIndisponibilidade(camada: CamadaRateLimit, …)
src/lib/rate-limit.ts:433:    camada: CamadaRateLimit,
src/lib/rate-limit.ts:484:    camada: CamadaRateLimit,
src/app/actions/public-booking.ts:597:                camada: 'escrita_ip',
src/app/actions/public-booking.ts:685:                    camada: 'escrita_telefone',
src/app/actions/public-booking.ts:728:                camada: 'teto_tenant',
src/app/actions/public-booking.ts:1125:                camada: 'leitura_ip',
src/lib/rate-limit.ts:55:export type CamadaRateLimit = 'escrita_ip' | 'escrita_telefone' | 'teto_tenant' | 'leitura_ip'
```

Nenhum call site passa valor dinâmico. Nada digitado pelo visitante alcança o campo.

## Gates da Definition of Done — saída real

```
$ pnpm lint
$ eslint
=== EXIT lint: 0 ===

$ pnpm test
 Test Files  25 passed (25)
      Tests  409 passed (409)
   Duration  1.03s
=== EXIT test: 0 ===

$ npx tsc --noEmit
=== EXIT tsc: 0 ===

$ pnpm build
✓ Generating static pages using 11 workers (14/14) in 416ms
Route (app) — 14 rotas
=== EXIT build: 0 ===
```

## Deviations from Plan

### 1. [Rule 3 - Bloqueio] Fixture obsoleto em `log.test.ts` precisou ser editado

O plano previa em `<done>` que `log.test.ts` passaria **sem ter sido editado**. Isso se
revelou factualmente impossível, e a razão é interessante: o fixture do teste do
`beforeSendLog` usava `tenantHash: 'abc12345'` — **8 hex, não 16**. Ele passava porque
aquela barreira não validava forma nenhuma.

O fixture é a pegada da própria bifurcação. Quando o WR-07 introduziu a validação de forma,
os fixtures do primeiro teste foram corrigidos para 16 hex (o comentário nas linhas 52-54 do
arquivo diz isso com todas as letras); o do teste da segunda barreira ficou para trás,
porque ali nada checava.

Corrigido para `abc1234500000000`, com comentário explicando a origem. Isso **não afrouxa**
nada — é o contrário: o teste passa a exercitar a barreira mais forte. A alternativa (não
aplicar validação de forma na última barreira) destruiria o must-have central e o
T-260807-01 do threat model.

- **Achado durante:** Task 1, após o conserto de `sanitizacao.ts`
- **Commit:** `62d2eda`

### 2. [Rule 2 - Correção de registro] Inferência errada no UAT e no PENDENCIAS

Os dois documentos afirmavam que os atributos não tinham sido lidos "por limitação do MCP,
não ausência do dado". A atribuição estava errada — os atributos não estavam no log. As duas
ocorrências foram **corrigidas em vez de apagadas**, preservando o histórico do erro de
inferência, no precedente do D-06.

- **Commit:** `e9ddfc8`

## Threat Flags

Nenhuma superfície nova. As duas mudanças de allowlist são no sentido restritivo ou com
domínio fechado reconfirmado:

| Threat | Disposição | Como fechou |
|---|---|---|
| T-260807-01 (`chaveHash`/`tenantHash` na última barreira) | mitigado | Validação de forma passa a valer nas duas barreiras. Provado pelo par de asserções — e o vermelho mostrou que o risco era **real e já ativo**, não hipotético |
| T-260807-02 (`camada` no `extra`) | mitigado | Domínio fechado em quatro literais, reconfirmado por grep antes da edição |
| T-260807-03 (reincidência da divergência) | mitigado | Fonte única + teste que itera a allowlist exportada |
| T-260807-04 (fechar UAT sem olho humano) | aceito com controle | Teste 4 segue `result: [pending]` |

## O que continua aberto, e é do owner

O teste 4 do `03-UAT.md` **não foi marcado como `pass`** e segue `result: [pending]`.
Instrumento nenhum fecha "olhei o painel e não havia PII".

Condição nova que a correção cria e que o procedimento de conferência precisa respeitar: os
dois atributos só viajam nos logs emitidos **a partir do próximo deploy com este código**.
Um log anterior a ele **não serve como prova, nem a favor nem contra** — foi emitido pela
versão que os descartava e vai continuar sem eles no painel para sempre. A conferência
precisa provocar um bloqueio novo, depois do deploy.

## Known Stubs

Nenhum.

## Self-Check: PASSED

Arquivos criados conferidos no disco:

```
FOUND: src/lib/observabilidade/atributos-log.ts
FOUND: src/lib/observabilidade/__tests__/allowlist-atributos.test.ts
```

Commits conferidos em `git log`:

```
FOUND: 62d2eda  fix(quick-260807-m5m): unifica as duas allowlists de atributos de log numa fonte única
FOUND: 31e7dfd  fix(quick-260807-m5m): `camada` também no caminho das Issues de rate limit
FOUND: e9ddfc8  docs(quick-260807-m5m): registra o achado das allowlists no UAT da Phase 03 e nas pendências
```
