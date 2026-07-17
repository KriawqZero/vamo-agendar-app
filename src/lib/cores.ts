/**
 * Helpers de cor da personalização do tenant (P0.12b). Funções puras — usadas no
 * servidor para validar `cor_marca` e derivar a cor de texto sobre o acento.
 */

/** Aceita exatamente o formato #rrggbb (mesma regra do CHECK no banco). */
export function ehHexValida(valor: string | null | undefined): valor is string {
    return typeof valor === 'string' && /^#[0-9a-f]{6}$/i.test(valor)
}

/**
 * Cor de texto legível sobre o acento do tenant: branco ou tinta escura (o mesmo
 * navy do token `--giz` no tema claro), o que tiver a maior razão de contraste
 * WCAG sobre a cor dada. Garante CTA/seleções legíveis para qualquer cor escolhida.
 */
export function corTextoSobre(hex: string): '#ffffff' | '#14172b' {
    const L = luminanciaRelativa(hex)
    const contrasteBranco = 1.05 / (L + 0.05) // L do branco = 1.0
    const contrasteTinta = (L + 0.05) / (luminanciaRelativa('#14172b') + 0.05)
    return contrasteBranco >= contrasteTinta ? '#ffffff' : '#14172b'
}

// Luminância relativa sRGB (WCAG 2.x)
function luminanciaRelativa(hex: string): number {
    const [r, g, b] = [1, 3, 5].map((i) => {
        const canal = parseInt(hex.slice(i, i + 2), 16) / 255
        return canal <= 0.04045 ? canal / 12.92 : Math.pow((canal + 0.055) / 1.055, 2.4)
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
