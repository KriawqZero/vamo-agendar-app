/** Uma janela de funcionamento semanal, como recebida do formulário de agenda. */
interface JanelaFuncionamento {
    dia_semana: number
    hora_inicio: string
    hora_fim: string
    ativo: boolean
}

// "HH:MM" ou "HH:MM:SS", horas 00-23 e minutos/segundos 00-59.
const REGEX_HORA = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/

function paraMinutos(hora: string): number {
    const [h, m] = hora.split(':')
    return Number(h) * 60 + Number(m)
}

/**
 * Valida a lista completa de janelas de funcionamento semanais enviada pela
 * UI (a UI sempre envia o estado inteiro da semana — substituição total, não
 * diff). Retorna `null` quando válida, ou a mensagem do primeiro problema
 * encontrado (em português) caso contrário.
 *
 * Regras: dia_semana inteiro 0-6; horas em "HH:MM"/"HH:MM:SS"; hora_fim >
 * hora_inicio em cada janela; sem sobreposição entre janelas ATIVAS do mesmo
 * dia (janelas encostadas — fim de uma == início da outra — são válidas).
 * Array vazio é válido (semana toda fechada é estado legítimo). Janelas
 * inativas nunca participam da checagem de sobreposição, entre si ou com
 * ativas.
 */
export function validarJanelasFuncionamento(janelas: JanelaFuncionamento[]): string | null {
    if (!Array.isArray(janelas)) {
        return 'Lista de horários inválida.'
    }

    for (const janela of janelas) {
        if (!janela || typeof janela !== 'object') {
            return 'Janela de horário inválida.'
        }

        if (
            !Number.isInteger(janela.dia_semana) ||
            janela.dia_semana < 0 ||
            janela.dia_semana > 6
        ) {
            return `Dia da semana inválido: ${janela.dia_semana}. Use um valor entre 0 (domingo) e 6 (sábado).`
        }

        if (typeof janela.hora_inicio !== 'string' || !REGEX_HORA.test(janela.hora_inicio)) {
            return `Horário de início inválido: "${janela.hora_inicio}". Use o formato HH:MM.`
        }

        if (typeof janela.hora_fim !== 'string' || !REGEX_HORA.test(janela.hora_fim)) {
            return `Horário de término inválido: "${janela.hora_fim}". Use o formato HH:MM.`
        }

        if (paraMinutos(janela.hora_fim) <= paraMinutos(janela.hora_inicio)) {
            return `O horário de término deve ser depois do início (dia ${janela.dia_semana}, ${janela.hora_inicio}–${janela.hora_fim}).`
        }
    }

    // Sobreposição: apenas entre janelas ATIVAS do mesmo dia. Agrupa por dia,
    // ordena por início e compara vizinhas — encostadas (fim == início) são ok.
    const ativasPorDia = new Map<number, JanelaFuncionamento[]>()
    for (const janela of janelas) {
        if (!janela.ativo) continue
        const lista = ativasPorDia.get(janela.dia_semana) ?? []
        lista.push(janela)
        ativasPorDia.set(janela.dia_semana, lista)
    }

    for (const [dia, lista] of ativasPorDia) {
        const ordenadas = [...lista].sort(
            (a, b) => paraMinutos(a.hora_inicio) - paraMinutos(b.hora_inicio),
        )
        for (let i = 1; i < ordenadas.length; i++) {
            const anterior = ordenadas[i - 1]
            const atual = ordenadas[i]
            if (paraMinutos(atual.hora_inicio) < paraMinutos(anterior.hora_fim)) {
                return `Janelas sobrepostas no dia ${dia} (${anterior.hora_inicio}–${anterior.hora_fim} e ${atual.hora_inicio}–${atual.hora_fim}).`
            }
        }
    }

    return null
}
