/**
 * Montagem do header `from` (EML-04).
 *
 * O endereço é CONSTANTE DE PRODUTO, não variável de ambiente: uma variável a
 * menos para faltar em produção e derrubar o boot. O domínio
 * `mail.vamoagendar.com.br` está verificado no Resend desde 2026-07-21, e
 * domínio verificado libera qualquer local-part.
 */
export const ENDERECO_REMETENTE = 'naoresponda@mail.vamoagendar.com.br'

/** Sufixo do nome de exibição — é o que torna o remetente reconhecível (EML-04). */
const SUFIXO_EXIBICAO = ' via VamoAgendar'

/** Usado quando o tenant não tem nome utilizável — nunca header malformado. */
const ROTULO_GENERICO = 'Estabelecimento'

/** Verdadeiro para caractere de controle (C0 e DEL). */
function ehControle(caractere: string): boolean {
    const ponto = caractere.codePointAt(0) ?? 0
    return ponto < 32 || ponto === 127
}

/**
 * O nome vem do banco e é input de usuário. `<`, `>` e `"` quebram o header, e
 * quebra de linha permite injeção de header (`Bcc:`) — propriedade do RFC 5322,
 * não do Resend.
 *
 * A troca de controle por espaço é feita por código de caractere, e não por
 * classe de regex, de propósito: escrever `\x00-\x1F` neste arquivo já resultou
 * em bytes de controle literais no fonte, que são invisíveis na revisão.
 */
function sanitizarNome(nome: string): string {
    const semControle = Array.from(nome)
        .map((caractere) => (ehControle(caractere) ? ' ' : caractere))
        .join('')

    return semControle.replace(/[<>"]/g, '').replace(/\s+/g, ' ').trim()
}

/** Monta `"<Estabelecimento> via VamoAgendar <naoresponda@...>"`. */
export function montarRemetente(nomeEstabelecimento: string): string {
    const limpo = sanitizarNome(nomeEstabelecimento ?? '')
    const exibicao = limpo.length > 0 ? limpo : ROTULO_GENERICO
    return `${exibicao}${SUFIXO_EXIBICAO} <${ENDERECO_REMETENTE}>`
}
