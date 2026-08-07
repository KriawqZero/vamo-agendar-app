---
phase: 260807-m5m-corrigir-divergencia-entre-as-allowlists
reviewed: 2026-08-07T19:25:00Z
depth: quick
files_reviewed: 6
files_reviewed_list:
  - src/lib/observabilidade/atributos-log.ts
  - src/lib/observabilidade/log.ts
  - src/lib/observabilidade/sanitizacao.ts
  - src/lib/observabilidade/__tests__/allowlist-atributos.test.ts
  - src/lib/observabilidade/__tests__/log.test.ts
  - src/lib/__tests__/opcoes-sentry.test.ts
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Quick task 260807-m5m: Code Review Report

**Reviewed:** 2026-08-07T19:25:00Z
**Depth:** quick (ampliado para leitura completa + verificação cruzada no fonte do SDK, porque o alvo é código de barreira anti-PII)
**Files Reviewed:** 6
**Status:** issues_found (0 BLOCKER)

## Summary

A unificação está correta no eixo que mais importa: **não afrouxou nenhuma barreira**. Os seis pontos do `review_focus` foram verificados um a um contra o código e contra o fonte instalado do SDK, com o resultado abaixo. O que sobrou são quatro WARNINGs — um deles reencena, um nível acima, exatamente a classe de defeito que esta quick task existia para eliminar.

**Verificação item a item do foco pedido:**

1. **Afrouxamento — NÃO houve.** `git show 5adcf53:…/sanitizacao.ts` traz `ATRIBUTOS_DE_LOG_PERMITIDOS` com 14 chaves: `codigo, fluxo, etapa, operacao, resultado, provider, motivo, statusCode, tenantHash, agendamentoHash, runtime, tentativa, retry, duracaoMs`. A unificada tem exatamente essas 14 **mais** `camada` e `chaveHash`. Nenhuma chave inesperada. E a nova versão é **estritamente mais apertada** no `beforeSendLog`: `tenantHash`/`agendamentoHash`/`chaveHash` agora sofrem validação de forma que antes só existia na primeira barreira.
2. **Exceção `sentry.`/`server.` — preservada, mas ver WR-03.** Semântica idêntica à do commit base (mesmos dois prefixos, mesmo teste de primitivo). O refactor só a moveu para um `continue` antecipado. Não virou buraco novo — mas o buraco que já era continua, e a justificativa escrita para ele é factualmente incompleta.
3. **Ordem das três checagens — preservada byte a byte.** `git diff` de `log.ts` mostra que `sanitizarAtributosLog` fazia allowlist → forma de hash (`String(valor)` + `/^[0-9a-f]{16}$/`) → primitivo, e `atributoDeLogPermitido` repete a mesma ordem com a mesma expressão. Zero mudança de semântica.
4. **`camada` em `CHAVES_DE_EXTRA_PERMITIDAS` — confirmado por grep.** Seis call sites, todos literais fechados: `rate-limit.ts:387` (parâmetro tipado `CamadaRateLimit`), `public-booking.ts:597,606,685,691,728,737,741`. Nenhum recebe dado digitado pelo visitante. O acréscimo é legítimo.
5. **O par `it.each(['chaveHash','tenantHash'])` prova de verdade.** A primeira asserção (`hash bem-formado sobrevive`) é o que impede a segunda de passar pelo motivo errado: se a chave não estivesse na allowlist, a primeira asserção reprovaria antes. As duas juntas distinguem "descartado por forma" de "descartado por nome". Sem falso-verde aqui.
6. **A troca de fixture `abc12345` → `abc1234500000000` é estritamente mais forte e não esconde regressão.** O valor de 8 hex só passava porque o `beforeSendLog` antigo filtrava por nome; com o predicado compartilhado ele seria descartado, então o teste **teria reprovado** sem a troca. Confirmado que nenhum produtor real emite hash fora de 16 hex: `hashComSal` (`observabilidade/hash.ts`), `hashAgendamentoId` e `hashTenantId` (`analytics/tenant.ts`) todos fazem `.digest('hex').slice(0, 16)`. Nenhuma perda de observabilidade cai desse aperto.

**Evidência de execução:** `pnpm vitest run` nas três suítes → `Test Files 3 passed (3) / Tests 65 passed (65)`.

**Resistência a mutação (raciocínio, não execução):** remover a checagem de forma reprova `log.test.ts:168` e `allowlist-atributos.test.ts:112`; reverter `sanitizarLogSentry` para filtro por nome reprova o par de hash; remover `camada` da allowlist reprova o teste "duas barreiras em série"; tirar a âncora `$` do `FORMATO_HASH` reprova `log.test.ts:192`; alargar o bypass de prefixo reprova `allowlist-atributos.test.ts:165`. Uma única mutação escapa — é a WR-01.

## Warnings

### WR-01: A divergência consertada continua existindo um nível acima — `AtributosLogOperacional` × `CHAVES_PERMITIDAS_LOG`

**File:** `src/lib/observabilidade/atributos-log.ts:26-79` (+ `__tests__/allowlist-atributos.test.ts:52-58`)

**Issue:** O módulo mata a divergência entre as duas *barreiras*, mas cria/mantém duas listas escritas à mão **dentro do mesmo arquivo** que precisam concordar e nada as obriga: a interface `AtributosLogOperacional` (o que o chamador consegue digitar sem erro de tipo) e o `Set` `CHAVES_PERMITIDAS_LOG` (o que o runtime deixa passar). `new Set<keyof AtributosLogOperacional>([...])` restringe os nomes válidos, mas **não exige exaustividade**.

Consequência concreta: acrescentar `motivoDetalhado?: string` à interface sem acrescentá-lo ao `Set` compila, passa no `tsc`, e o chamador escreve `logOperacional.warn('x', { motivoDetalhado })` sem nenhum aviso — o atributo é descartado em silêncio nas duas barreiras. É a **mesma forma exata** do defeito medido em produção (release 25997ce): atributo aceito pelo tipo, sumido no painel, SC inobservável.

O teste novo não pega. `AMOSTRA_POR_CHAVE` é `Record<keyof AtributosLogOperacional, …>`, então o TS **obriga** a acrescentar a amostra do campo novo; aí `semAmostra` continua `[]` e o `it.each` simplesmente não itera a chave órfã. A asserção existente só cobre a direção `allowlist ⊆ amostra`, e a falha mora na direção oposta.

**Fix:** fechar a direção que falta no teste (uma linha, e o `Record` exaustivo já garante que ela vale como prova):

```ts
it('a allowlist cobre a interface inteira (campo novo sem entrada no Set reprova)', () => {
    // `AMOSTRA_POR_CHAVE` é exaustivo sobre `keyof AtributosLogOperacional` por
    // imposição do TS — então comparar os dois conjuntos nos DOIS sentidos
    // transforma "tipo e Set concordam" em asserção, não em convenção.
    expect([...CHAVES_PERMITIDAS_LOG].sort()).toEqual(Object.keys(AMOSTRA_POR_CHAVE).sort())
})
```

Alternativa estrutural (dispensa o teste): derivar o `Set` de um objeto com `satisfies Record<keyof AtributosLogOperacional, true>`, que faz o `tsc` reprovar o campo órfão na origem.

### WR-02: A "forma de hash" aceita qualquer número de 16 dígitos decimais

**File:** `src/lib/observabilidade/atributos-log.ts:117-122`

**Issue:** A checagem é `FORMATO_HASH.test(String(valor))`, e `[0-9a-f]` inclui `0-9`. Um `valor` numérico de 16 dígitos — `chaveHash: 4111111111111111`, um ID numérico de 16 posições, um número de cartão — passa como "hash canônico" e é entregue ao fornecedor. A coerção `String(valor)` também faz a checagem rodar sobre objetos (`{ toString: () => 'a1b2c3d4e5f60718' }` passa aqui e só é barrado pela terceira checagem).

Todo hash real do projeto é `string` (`digest('hex').slice(0,16)`), então exigir isso não custa nada e fecha o buraco. Não é BLOCKER porque nenhum call site atual emite número nesses campos — mas o JSDoc do módulo afirma que "o que garante isso é a validação de FORMA, não a boa vontade do chamador", e hoje ainda é meia-verdade.

**Fix:**

```ts
if (CHAVES_DE_HASH.has(chave as keyof AtributosLogOperacional)) {
    // `typeof` antes do regex: todo hash do projeto é string, e `String(valor)`
    // deixava passar 16 dígitos decimais (um PAN cabe nessa forma).
    if (typeof valor !== 'string' || !FORMATO_HASH.test(valor)) return false
}
```

### WR-03: O bypass de `sentry.` é mais largo que a justificativa escrita para ele

**File:** `src/lib/observabilidade/sanitizacao.ts:138-156`

**Issue:** O comentário diz que `sentry.`/`server.` são "concernimento do SDK, não do domínio". Verificado no fonte instalado (`node_modules/.pnpm/@sentry+core@10.67.0/.../logs/internal.js:71-79`): dois atributos sob esse prefixo carregam **dado do chamador verbatim** —

```js
processedLogAttributes["sentry.message.template"] = __sentry_template_string__;
__sentry_template_values__.forEach((param, index) => {
    processedLogAttributes[`sentry.message.parameter.${index}`] = param;
});
```

Ou seja: qualquer `Sentry.logger.info(fmt\`cliente ${nome} bloqueado\`)` entrega `nome` cru ao fornecedor **sem passar pelo predicado**. Hoje não é vetor vivo (grep por `fmt\`` em `src/` não retorna nada, e `logOperacional` sempre passa string simples), por isso não é BLOCKER. Mas o bypass é justamente a única porta larga desta função, e o dia em que alguém usar template parametrizado a barreira não avisa.

**Fix:** trocar o prefixo aberto por allowlist de meta do SDK, ou — mínimo viável — excluir a família de mensagem:

```ts
// `sentry.message.*` NÃO é meta do SDK: é o valor interpolado pelo chamador
// (@sentry/core@10.67.0, logs/internal.js:71-79). Meta é release/sdk/trace.
const ehMetaDoSdk =
    (chave.startsWith('sentry.') && !chave.startsWith('sentry.message.')) ||
    chave.startsWith('server.')
```

### WR-04: "A ÚLTIMA barreira antes do fornecedor" é afirmação falsa, e ela é carga estrutural

**File:** `src/lib/observabilidade/sanitizacao.ts:124-140`, `src/lib/observabilidade/atributos-log.ts:6-11`, `src/lib/observabilidade/__tests__/allowlist-atributos.test.ts:13-20`

**Issue:** Os três arquivos afirmam que `sanitizarLogSentry` (`beforeSendLog`) é a última coisa que roda antes do envio. No `@sentry/core@10.67.0` (`logs/internal.js:84,99-103`) o `beforeSendLog` roda e **depois** o SDK monta o payload assim:

```js
const log = beforeSendLog ? ... beforeSendLog(processedLog) : processedLog;
// ...
attributes: sanitizeLogAttributes({
    ...attributes.serializeAttributes(scopeAttributes),   // <— nunca passou pelo nosso hook
    ...attributes.serializeAttributes(logAttributes, true),
    ...
})
```

Atributos de escopo (`Sentry.setAttribute(s)` no isolation/current scope) são mesclados **depois** do hook e nunca são filtrados. Hoje não há nenhum call site de `setAttribute`/`setUser` no projeto (grep limpo), então não há vazamento vivo — mas num repo cujo padrão é "o comentário é o contrato", uma afirmação errada nesse ponto é a premissa que a próxima fase vai herdar sem reverificar.

**Fix:** corrigir a redação para o que é verificável e registrar a exceção, por exemplo:

```
 * Última barreira do caminho de `Sentry.logger.*`. NÃO cobre atributos de
 * ESCOPO (`Sentry.setAttribute`), que o SDK mescla depois do hook
 * (@sentry/core@10.67.0, logs/internal.js:99-103) — por isso este projeto não
 * usa atributos de escopo, e acrescentá-los exige revisão nesta barreira.
```

## Info

### IN-01: Remover uma chave da allowlist não reprova o teste que existe para isso

**File:** `src/lib/observabilidade/__tests__/allowlist-atributos.test.ts:63-76`
**Issue:** O `it.each([...CHAVES_PERMITIDAS_LOG])` deriva os casos da própria allowlist, então apagar `camada` do `Set` faz o teste rodar um caso a menos e continuar verde. Quem realmente pega é o teste "duas barreiras em série" (linhas 78-100), que hardcoda `camada`/`chaveHash`. Funciona, mas a proteção mora num teste diferente daquele cujo comentário promete "ESTE é o teste que impede a divergência de voltar".
**Fix:** o mesmo pareamento bidirecional da WR-01 resolve os dois de uma vez; ou acrescentar `expect(CHAVES_PERMITIDAS_LOG.size).toBe(16)` como âncora explícita.

### IN-02: Cast repetido `chave as keyof AtributosLogOperacional`

**File:** `src/lib/observabilidade/atributos-log.ts:115,118`
**Issue:** Dois casts que não asseguram nada em runtime (`Set.has` com valor de tipo errado só devolve `false`) e que escondem que o parâmetro é `string` aberta.
**Fix:** tipar os dois sets como `Set<string>` e dispensar os casts — a restrição de nomes já vem do literal na construção, e `AtributosLogOperacional` continua sendo o contrato do chamador.

### IN-03: Nenhum caso prova o rejeito de hash *malformado* na segunda barreira

**File:** `src/lib/observabilidade/__tests__/allowlist-atributos.test.ts:111-126`
**Issue:** Os negativos do `beforeSendLog` usam valores obviamente não-hex (`198.51.100.7`, `org_PII_TESTE`, `nao-e-hash`). Os casos de tamanho/alfabeto (`abc123`, 17 chars, maiúsculas) só existem contra `sanitizarAtributosLog` (`log.test.ts:188-194`). Como o predicado agora é o mesmo, a cobertura é transitiva e não há bug — é assimetria de suíte, e a troca de fixture `abc12345`→`abc1234500000000` removeu justamente o valor que teria coberto esse eixo na segunda barreira.
**Fix:** um caso a mais no `describe` da forma de hash: `expect(sanitizarLogSentry({ attributes: { chaveHash: 'abc12345' } }).attributes).toEqual({})`.

---

_Reviewed: 2026-08-07T19:25:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: quick_
