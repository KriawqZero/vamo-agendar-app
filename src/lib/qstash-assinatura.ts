import { Receiver } from '@upstash/qstash'

interface ParametrosVerificacao {
    /** Conteúdo do header `Upstash-Signature` (JWS emitido pelo QStash). */
    assinatura: string | null
    /** Corpo da requisição EXATAMENTE como chegou — `req.text()`, nunca reserializado. */
    corpoCru: string
    /**
     * URL chamada, sempre `req.url`. A claim `sub` do JWT carrega a URL de
     * publicação COM a query string: lembretes já em voo foram publicados com
     * `?secret=`, e montar a URL de uma constante os mataria em silêncio.
     */
    url: string
}

/**
 * Confere se a requisição foi mesmo assinada pelo QStash.
 *
 * Autenticação de máquina é criptográfica ou não é: o caminho antigo comparava
 * um `?secret=` de query string contra uma env com default embutido, o que
 * transformava configuração ausente em porta destrancada. Aqui, chave ausente
 * LANÇA (em produção o boot já morreu antes, via `src/lib/env.ts`) e assinatura
 * inválida devolve `false` — nunca há caminho permissivo.
 */
export async function verificarAssinaturaQstash({
    assinatura,
    corpoCru,
    url,
}: ParametrosVerificacao): Promise<boolean> {
    if (!assinatura?.trim()) return false

    // Lidas na CHAMADA, não em constante de módulo: constante congela o valor no
    // import e deixa o módulo intestável sem rodeio.
    const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY
    const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY

    const ausentes = [
        !currentSigningKey?.trim() && 'QSTASH_CURRENT_SIGNING_KEY',
        !nextSigningKey?.trim() && 'QSTASH_NEXT_SIGNING_KEY',
    ].filter(Boolean)

    if (ausentes.length > 0) {
        throw new Error(
            `Chaves de assinatura do QStash ausentes: ${ausentes.join(', ')}. ` +
                'Sem elas o webhook de lembrete não tem como autenticar quem chama.',
        )
    }

    // As duas chaves juntas permitem rotação sem janela de quebra: o Receiver
    // tenta a atual e, se falhar, a próxima.
    const receiver = new Receiver({
        currentSigningKey: currentSigningKey as string,
        nextSigningKey: nextSigningKey as string,
    })

    try {
        await receiver.verify({ signature: assinatura, body: corpoCru, url })
        return true
    } catch {
        return false
    }
}
