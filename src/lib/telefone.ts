/**
 * Máscara progressiva de telefone brasileiro para inputs: (XX) XXXX-XXXX ou
 * (XX) XXXXX-XXXX, limitada a 11 dígitos. Apenas apresentação — a sanitização
 * para persistência/envio continua sendo `replace(/\D/g, '')` no chamador.
 */
export function formatarTelefone(valor: string): string {
    const digitos = valor.replace(/\D/g, '')
    const limitado = digitos.slice(0, 11)
    if (limitado.length <= 2) {
        return limitado.length > 0 ? `(${limitado}` : ''
    }
    if (limitado.length <= 6) {
        return `(${limitado.slice(0, 2)}) ${limitado.slice(2)}`
    }
    if (limitado.length <= 10) {
        return `(${limitado.slice(0, 2)}) ${limitado.slice(2, 6)}-${limitado.slice(6)}`
    }
    return `(${limitado.slice(0, 2)}) ${limitado.slice(2, 7)}-${limitado.slice(7)}`
}
