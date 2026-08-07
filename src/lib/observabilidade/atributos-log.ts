/**
 * FONTE ÚNICA do julgamento de atributo de log operacional.
 *
 * Existe por causa de um defeito estrutural, não de um descuido pontual: a
 * decisão "este atributo pode sair do processo?" era tomada em DOIS lugares —
 * `sanitizarAtributosLog` (`log.ts`, o filtro do nosso logger) e
 * `sanitizarLogSentry` (`sanitizacao.ts`, o `beforeSendLog` do SDK) — cada um
 * com a sua própria cópia da allowlist. Duas listas que precisam concordar e
 * nada que as obrigue a concordar envelhecem separadas, e foi o que aconteceu:
 * a Phase 03 acrescentou `camada` e `chaveHash` à primeira e não à segunda, e
 * os dois atributos passavam pelo nosso filtro para serem descartados na última
 * barreira. Efeito medido em produção (Sentry Log real, release 25997ce,
 * 2026-07-28T00:36:36Z): o log `ratelimit.bloqueio` chegou sem dizer QUAL
 * camada bloqueou — o SC3 da Phase 03 virou inobservável.
 *
 * Acrescentar os dois nomes na segunda lista consertaria hoje e reencenaria o
 * mesmo bug no próximo atributo. Por isso o julgamento mora aqui e as duas
 * barreiras o consultam.
 *
 * ZERO imports, de propósito — mesma razão que o cabeçalho de `sanitizacao.ts`
 * já documenta: este módulo precisa ser importável por `sanitizacao.ts`, que é
 * embarcado nos três arquivos de init do Sentry e tem de ficar testável em
 * Vitest sem puxar o SDK para dentro da suíte.
 */

export interface AtributosLogOperacional {
    codigo?: string
    fluxo?: string
    etapa?: string
    operacao?: string
    resultado?: string
    provider?: string
    motivo?: string
    statusCode?: number
    tenantHash?: string
    agendamentoHash?: string
    runtime?: string
    tentativa?: number
    retry?: boolean
    duracaoMs?: number
    /** Camada de rate limit que decidiu (`escrita_ip`, `teto_tenant`, …). */
    camada?: string
    /**
     * Chave PSEUDONIMIZADA do contador de rate limit — o MESMO hash usado no
     * store do fornecedor (`hashChaveRateLimit`). É o que permite correlacionar
     * log ↔ contador sem que IP ou telefone existam em lugar nenhum.
     *
     * O que garante isso é a validação de FORMA (16 hex), não a boa vontade do
     * chamador: valor fora dessa forma é descartado no ato (WR-07). Desde a
     * unificação das allowlists, essa validação vale nas DUAS barreiras.
     */
    chaveHash?: string
}

/**
 * ALLOWLIST das chaves de atributo de log.
 *
 * Exportada porque o teste `__tests__/allowlist-atributos.test.ts` itera sobre
 * ela: repetir a lista dentro do teste criaria uma TERCEIRA cópia para
 * divergir, que é exatamente o defeito sob conserto.
 */
export const CHAVES_PERMITIDAS_LOG = new Set<keyof AtributosLogOperacional>([
    'codigo',
    'fluxo',
    'etapa',
    'operacao',
    'resultado',
    'provider',
    'motivo',
    'statusCode',
    'tenantHash',
    'agendamentoHash',
    'runtime',
    'tentativa',
    'retry',
    'duracaoMs',
    'camada',
    'chaveHash',
])

/**
 * Atributos cujo VALOR precisa ter forma de hash, não só nome permitido.
 *
 * ⚠️ Existe por causa do WR-07, e o defeito era de natureza, não de descuido: a
 * allowlist filtrava por CHAVE, então `chaveHash` e `tenantHash` aceitavam
 * qualquer string — inclusive um IP ou um telefone cru, se um chamador futuro
 * esquecesse de hashear. O invariante nunca-PII neste caminho era CONVENÇÃO DE
 * CHAMADOR, apesar de o JSDoc do campo afirmar que "a allowlist fechada é o que
 * garante isso". Validar a forma é o que transforma a promessa em estrutura, e
 * custa uma linha.
 */
const CHAVES_DE_HASH = new Set<keyof AtributosLogOperacional>([
    'tenantHash',
    'agendamentoHash',
    'chaveHash',
])

/** Forma canônica de todo hash pseudonimizador do projeto: sha256 truncado a 16 hex. */
const FORMATO_HASH = /^[0-9a-f]{16}$/

/**
 * O julgamento COMPARTILHADO: este par chave/valor pode sair do processo?
 *
 * A ordem das três checagens é contrato, não estilo — os casos de
 * `log.test.ts` afirmam sobre ela: (1) chave na allowlist, (2) forma de hash
 * quando a chave é de hash, (3) tipo primitivo.
 *
 * Nunca lança: um atributo a menos no log é infinitamente melhor que um
 * telefone a mais no fornecedor terceiro.
 */
export function atributoDeLogPermitido(
    chave: string,
    valor: unknown,
): valor is string | number | boolean {
    if (!CHAVES_PERMITIDAS_LOG.has(chave as keyof AtributosLogOperacional)) return false

    if (
        CHAVES_DE_HASH.has(chave as keyof AtributosLogOperacional) &&
        !FORMATO_HASH.test(String(valor))
    ) {
        return false
    }

    return typeof valor === 'string' || typeof valor === 'number' || typeof valor === 'boolean'
}
