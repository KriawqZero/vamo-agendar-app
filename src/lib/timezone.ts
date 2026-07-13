/**
 * Helpers centralizados de fuso horário (P0.4).
 *
 * Módulo puro e isomórfico (roda no servidor e no cliente, sem 'use server'/'use
 * client' e sem dependências externas — `Intl.DateTimeFormat` resolve tudo). É a
 * ÚNICA fonte de conversão data/hora ↔ fuso do projeto: nenhum outro arquivo deve
 * usar offset fixo (`-03:00`) ou `America/Sao_Paulo` hardcoded.
 *
 * Convenção: timestamps são gravados/lidos em UTC; a interpretação (limites do
 * dia, grade de slots, formatação exibida) acontece sempre no fuso IANA do
 * estabelecimento (`perfis_empresas.timezone`).
 */

export const TIMEZONE_PADRAO = 'America/Sao_Paulo'

/** Fusos horários oficiais do Brasil (IANA) oferecidos na configuração do perfil. */
export const TIMEZONES_BRASIL: { valor: string; rotulo: string }[] = [
    { valor: 'America/Sao_Paulo', rotulo: 'Brasília (São Paulo, Rio, Sul, Sudeste, Nordeste)' },
    { valor: 'America/Fortaleza', rotulo: 'Fortaleza (Ceará)' },
    { valor: 'America/Belem', rotulo: 'Belém (Pará, Amapá)' },
    { valor: 'America/Campo_Grande', rotulo: 'Campo Grande (Mato Grosso do Sul)' },
    { valor: 'America/Cuiaba', rotulo: 'Cuiabá (Mato Grosso)' },
    { valor: 'America/Manaus', rotulo: 'Manaus (Amazonas)' },
    { valor: 'America/Porto_Velho', rotulo: 'Porto Velho (Rondônia)' },
    { valor: 'America/Boa_Vista', rotulo: 'Boa Vista (Roraima)' },
    { valor: 'America/Rio_Branco', rotulo: 'Rio Branco (Acre)' },
    { valor: 'America/Noronha', rotulo: 'Fernando de Noronha' },
]

/**
 * Valida se `tz` é um identificador IANA suportado pelo runtime.
 * Usa `Intl.supportedValuesOf('timeZone')` quando disponível; caso contrário,
 * tenta construir um formatter (que lança em fuso inválido).
 */
export function ehTimezoneValida(tz: string): boolean {
    if (!tz || typeof tz !== 'string') return false
    try {
        const suportados = (Intl as unknown as {
            supportedValuesOf?: (chave: string) => string[]
        }).supportedValuesOf
        if (typeof suportados === 'function') {
            return suportados('timeZone').includes(tz)
        }
        // Fallback: um fuso inválido faz o DateTimeFormat lançar RangeError.
        new Intl.DateTimeFormat('en-CA', { timeZone: tz })
        return true
    } catch {
        return false
    }
}

/** Componentes de parede (wall-clock) de um instante num fuso, já numéricos. */
function componentesLocais(instante: Date | string, tz: string) {
    const data = instante instanceof Date ? instante : new Date(instante)
    const partes = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    }).formatToParts(data)

    const mapa: Record<string, number> = {}
    for (const p of partes) {
        if (p.type !== 'literal') mapa[p.type] = parseInt(p.value, 10)
    }
    // Alguns runtimes emitem '24' para a meia-noite com hour12:false.
    if (mapa.hour === 24) mapa.hour = 0
    return mapa as { year: number; month: number; day: number; hour: number; minute: number; second: number }
}

/** "YYYY-MM-DD" de um instante, no fuso indicado. */
export function diaLocal(instante: Date | string, tz: string): string {
    const c = componentesLocais(instante, tz)
    const mm = String(c.month).padStart(2, '0')
    const dd = String(c.day).padStart(2, '0')
    return `${c.year}-${mm}-${dd}`
}

/** "HH:MM" de um instante, no fuso indicado. */
export function horaLocal(instante: Date | string, tz: string): string {
    const c = componentesLocais(instante, tz)
    const hh = String(c.hour).padStart(2, '0')
    const min = String(c.minute).padStart(2, '0')
    return `${hh}:${min}`
}

/**
 * Dia da semana (0=domingo ... 6=sábado) de uma data "YYYY-MM-DD".
 * Avaliado ao meio-dia UTC para não depender do fuso do servidor.
 */
export function diaDaSemana(dateStr: string): number {
    return new Date(`${dateStr}T12:00:00Z`).getUTCDay()
}

/** Soma (ou subtrai) dias de calendário a uma data "YYYY-MM-DD". Aritmética pura em UTC. */
export function somarDias(dateStr: string, dias: number): string {
    const [y, m, d] = dateStr.split('-').map(Number)
    const dt = new Date(Date.UTC(y, m - 1, d))
    dt.setUTCDate(dt.getUTCDate() + dias)
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(dt.getUTCDate()).padStart(2, '0')
    return `${dt.getUTCFullYear()}-${mm}-${dd}`
}

/**
 * Converte uma parede local (data "YYYY-MM-DD" + hora "HH:MM" no fuso `tz`) para o
 * instante UTC correspondente. Método: chuta o epoch tratando a parede como se
 * fosse UTC, mede a parede que esse epoch realmente produz em `tz` e corrige pela
 * diferença; itera para convergir mesmo sob mudança de offset (ponto fixo).
 */
export function instanteDe(dateStr: string, timeStr: string, tz: string): Date {
    const [y, m, d] = dateStr.split('-').map(Number)
    const [hora, minuto] = timeStr.split(':').map(Number)
    const paredeDesejada = Date.UTC(y, m - 1, d, hora, minuto)

    let epoch = paredeDesejada
    for (let i = 0; i < 2; i++) {
        const c = componentesLocais(new Date(epoch), tz)
        const paredeProduzida = Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, c.second)
        const offset = paredeProduzida - epoch
        epoch = paredeDesejada - offset
    }
    return new Date(epoch)
}

/**
 * Limites UTC do dia local "YYYY-MM-DD" no fuso `tz`.
 * `inicio` inclusivo (00:00 local) e `fim` EXCLUSIVO (00:00 local do dia seguinte).
 */
export function limitesDoDia(dateStr: string, tz: string): { inicio: Date; fim: Date } {
    return {
        inicio: instanteDe(dateStr, '00:00', tz),
        fim: instanteDe(somarDias(dateStr, 1), '00:00', tz),
    }
}

/** "13/07/2026 às 14:00" — formato consumido por whatsapp-helper (split ' às '). */
export function formatarDataHora(instante: Date | string, tz: string): string {
    const dia = diaLocal(instante, tz)
    const [y, m, d] = dia.split('-')
    return `${d}/${m}/${y} às ${horaLocal(instante, tz)}`
}

/** "sábado, 13 de julho de 2026 às 14:00" — exibição longa (resumo do agendamento). */
export function formatarDataHoraLonga(instante: Date | string, tz: string): string {
    const data = instante instanceof Date ? instante : new Date(instante)
    const dataStr = data.toLocaleDateString('pt-BR', {
        timeZone: tz,
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
    })
    return `${dataStr} às ${horaLocal(instante, tz)}`
}
