/**
 * Throttle de emissão de telemetria POR PROCESSO.
 *
 * Existe por um motivo só, e ele é o defeito que a revisão da Phase 3 nomeou
 * (CR-03): o caminho de REJEIÇÃO de um endpoint público emite um evento por
 * requisição, e quem escolhe quantas requisições existem é o atacante. Sem
 * throttle, a defesa contra flood vira o amplificador do flood — a cota do
 * Sentry acaba exatamente durante o ataque que ela deveria sinalizar, e a queda
 * do Upstash produz uma Issue por checagem por requisição.
 *
 * Contrato:
 *
 * 1. NUNCA lança e não faz I/O. É `Date.now()` mais um `Map` em memória.
 * 2. A PRIMEIRA emissão de cada chave sempre passa. O que se descarta é a
 *    repetição — um alarme que chega uma vez é sinal; o milésimo é ruído.
 * 3. O estado é de PROCESSO, não distribuído. Duas instâncias na Railway emitem
 *    uma vez cada, e isso é aceitável de propósito: sincronizar throttle de log
 *    exigiria justamente a ida ao fornecedor que este módulo existe para evitar.
 * 4. A chave é SEMPRE estática (rótulo do evento, no máximo com a camada junto).
 *    Chave derivada de dado do visitante faria o `Map` crescer sem teto — o
 *    mesmo vetor, por outra porta.
 */

const ultimaEmissaoPorChave = new Map<string, number>()

/**
 * `true` quando a emissão deve acontecer: passa a primeira vez e depois no
 * máximo uma vez a cada `intervaloMs`.
 */
export function permitirEmissao(chave: string, intervaloMs: number): boolean {
    const agora = Date.now()
    const ultima = ultimaEmissaoPorChave.get(chave)

    if (ultima !== undefined && agora - ultima < intervaloMs) return false

    ultimaEmissaoPorChave.set(chave, agora)
    return true
}

/**
 * `permitirEmissao` com intervalo infinito: uma vez por processo e nunca mais.
 *
 * Para o sinal que descreve um ESTADO, não um evento — "não consigo determinar o
 * IP", "o salt não está configurado". Repetir a cada requisição não acrescenta
 * informação nenhuma e só empurra a cota do fornecedor.
 */
export function permitirUmaVezPorProcesso(chave: string): boolean {
    return permitirEmissao(chave, Number.POSITIVE_INFINITY)
}

/** Zera o estado de módulo. Existe para os testes, que rodam no mesmo processo. */
export function reiniciarEmissoes(): void {
    ultimaEmissaoPorChave.clear()
}
