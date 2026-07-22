import { SupabaseClient } from '@supabase/supabase-js'
import {
    TIMEZONE_PADRAO,
    diaDaSemana,
    diaLocal,
    horaLocal,
    instanteDe,
    limitesDoDia,
    somarDias,
} from './timezone'

interface Slot {
    time: string // "HH:MM"
    datetime: string // ISO string in UTC
}

/** Intervalo em minutos desde a meia-noite local (unidade da camada pura da engine). */
export interface Intervalo {
    start: number
    end: number
}

/** Regras de acesso do fluxo B2C (antecedência mínima e horizonte máximo de agendamento). */
export interface RegrasAcesso {
    antecedenciaMinutos: number
    horizonteDias: number | null
}

interface BookingEngineParams {
    tenantId: string
    dateStr: string // "YYYY-MM-DD"
    duracaoServicoMinutos: number
    supabase: SupabaseClient
    timezone?: string // Fuso IANA do estabelecimento (padrão: TIMEZONE_PADRAO)
    ignorarAgendamentoId?: string // Exclui este agendamento da checagem de colisão (remarcação)
    // Ausente = fluxo manual do dashboard (antecedência 0, sem horizonte; passado
    // continua filtrado). Presente = fluxo público, com os limites do plano/tenant.
    regrasAcesso?: RegrasAcesso
}

/**
 * Converte uma string "HH:MM" ou "HH:MM:SS" em minutos a partir da meia-noite
 */
function timeToMinutes(timeStr: string): number {
    const parts = timeStr.split(':')
    const hours = parseInt(parts[0], 10)
    const minutes = parseInt(parts[1], 10)
    return hours * 60 + minutes
}

/**
 * Converte minutos a partir da meia-noite de volta para string "HH:MM"
 */
function minutesToTimeStr(minutes: number): string {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    const hoursStr = String(hours).padStart(2, '0')
    const minsStr = String(mins).padStart(2, '0')
    return `${hoursStr}:${minsStr}`
}

/**
 * Mescla intervalos sobrepostos ou adjacentes (fim de um == início do outro).
 * Defesa contra dados de origem inconsistentes (ex.: janelas de funcionamento
 * cadastradas com sobreposição) — a validação de não-sobreposição em si vive na
 * action, não aqui.
 */
function mesclarIntervalos(intervalos: Intervalo[]): Intervalo[] {
    if (intervalos.length === 0) return []

    const ordenados = [...intervalos].sort((a, b) => a.start - b.start)
    const mesclados: Intervalo[] = [{ ...ordenados[0] }]

    for (let i = 1; i < ordenados.length; i++) {
        const atual = ordenados[i]
        const ultimo = mesclados[mesclados.length - 1]
        if (atual.start <= ultimo.end) {
            ultimo.end = Math.max(ultimo.end, atual.end)
        } else {
            mesclados.push({ ...atual })
        }
    }

    return mesclados
}

/**
 * Calcula os intervalos livres do dia: janelas de funcionamento (já mescladas
 * defensivamente) menos bloqueios parciais (exceções) e janelas ocupadas por
 * agendamentos ativos. Unidades em minutos desde a meia-noite local.
 */
export function calcularIntervalosLivres(
    janelas: Intervalo[],
    bloqueios: Intervalo[],
    ocupados: Intervalo[],
): Intervalo[] {
    const janelasLivres = mesclarIntervalos(janelas)
    const indisponiveis = mesclarIntervalos([...bloqueios, ...ocupados])

    const livres: Intervalo[] = []

    for (const janela of janelasLivres) {
        let cursor = janela.start

        // Apenas os bloqueios que efetivamente cruzam esta janela.
        const relevantes = indisponiveis
            .filter((b) => b.end > janela.start && b.start < janela.end)
            .sort((a, b) => a.start - b.start)

        for (const bloqueio of relevantes) {
            const inicioBloqueio = Math.max(bloqueio.start, janela.start)
            const fimBloqueio = Math.min(bloqueio.end, janela.end)

            if (inicioBloqueio > cursor) {
                livres.push({ start: cursor, end: inicioBloqueio })
            }
            cursor = Math.max(cursor, fimBloqueio)
        }

        if (cursor < janela.end) {
            livres.push({ start: cursor, end: janela.end })
        }
    }

    return livres.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start)
}

/**
 * Gera os candidatos de início de slot dentro de um intervalo livre, na regra
 * "anti-buraco": grade de 15 em 15 min a partir do início do intervalo, MAIS o
 * candidato colado no fim (`b - duracaoMinutos`), quando couber. Um candidato só
 * é oferecido se não deixar, entre ele e as bordas do intervalo, um buraco menor
 * que a menor duração de serviço ativa do tenant — buraco esse que nenhum
 * serviço conseguiria preencher depois.
 *
 * ⚠️ GUARDA DE PROFUNDIDADE na primeira linha: com `duracaoMinutos` negativo, a
 * condição de parada do laço abaixo (`candidato + duracaoMinutos <= b`) deixa de
 * limitar a grade ao intervalo livre e passa a limitá-la à própria magnitude do
 * valor, linearmente — `-5000000` num intervalo de 10 horas produz 333.374
 * entradas no `Set`, e o laço é SÍNCRONO (enquanto roda, o event loop está
 * parado para todas as requisições em voo).
 *
 * A guarda vive aqui, e não só na fronteira da Server Action pública, porque
 * esta função é exportada e pura: a validação da action é a FRONTEIRA (recusa
 * antes de gastar I/O), esta é o CONTRATO — um terceiro chamador futuro herda a
 * proteção sem que ninguém precise se lembrar de replicá-la.
 */
export function gerarSlotsAntiBuraco(
    intervalos: Intervalo[],
    duracaoMinutos: number,
    menorDuracaoAtiva: number,
): number[] {
    if (!Number.isInteger(duracaoMinutos) || duracaoMinutos <= 0) return []

    const candidatos = new Set<number>()

    for (const { start: a, end: b } of intervalos) {
        for (let candidato = a; candidato + duracaoMinutos <= b; candidato += 15) {
            candidatos.add(candidato)
        }

        const coladoNoFim = b - duracaoMinutos
        if (coladoNoFim >= a) {
            candidatos.add(coladoNoFim)
        }
    }

    return Array.from(candidatos)
        .filter((s) => {
            // Recalcula gaps por intervalo de origem (um candidato pode, em
            // teoria, pertencer a apenas um intervalo — buscamos o que contém o
            // slot inteiro, ou seja, s..s+duracaoMinutos dentro de [a,b)).
            const intervalo = intervalos.find((i) => s >= i.start && s + duracaoMinutos <= i.end)
            if (!intervalo) return false
            const gapAntes = s - intervalo.start
            const gapDepois = intervalo.end - (s + duracaoMinutos)
            return gapAntes === 0 || gapAntes >= menorDuracaoAtiva || gapDepois === 0
        })
        .sort((x, y) => x - y)
}

/**
 * Calcula os slots livres de agendamento para um determinado dia e tenant
 */
export async function obterSlotsDisponiveis({
    tenantId,
    dateStr,
    duracaoServicoMinutos,
    supabase,
    timezone = TIMEZONE_PADRAO,
    ignorarAgendamentoId,
    regrasAcesso,
}: BookingEngineParams): Promise<Slot[]> {
    const agora = new Date()

    // 0. Horizonte máximo: fora da janela permitida, nem consulta o banco.
    if (regrasAcesso?.horizonteDias != null) {
        const limiteData = somarDias(diaLocal(agora, timezone), regrasAcesso.horizonteDias)
        if (dateStr > limiteData) {
            return []
        }
    }

    // 1. Determinar o dia da semana (0 = Domingo, 1 = Segunda, ..., 6 = Sábado)
    const diaSemana = diaDaSemana(dateStr)

    // 2. Buscar as janelas de funcionamento do tenant para o dia da semana (N por dia)
    const { data: funcData, error: funcError } = await supabase
        .from('horarios_funcionamento')
        .select('hora_inicio, hora_fim')
        .eq('tenant_id', tenantId)
        .eq('dia_semana', diaSemana)
        .eq('ativo', true)
        .order('hora_inicio')

    if (funcError) {
        console.error('Erro ao buscar horário de funcionamento:', funcError.message)
        return []
    }

    if (!funcData || funcData.length === 0) {
        // Estabelecimento fechado neste dia da semana (nenhuma janela ativa)
        return []
    }

    const janelas: Intervalo[] = funcData.map((f) => ({
        start: timeToMinutes(f.hora_inicio),
        end: timeToMinutes(f.hora_fim),
    }))

    // 3. Buscar Exceções da agenda (folgas, feriados ou bloqueios) para esta data
    const { data: excecoes, error: excError } = await supabase
        .from('excecoes_agenda')
        .select('hora_inicio, hora_fim, bloqueado')
        .eq('tenant_id', tenantId)
        .eq('data', dateStr)
        .eq('bloqueado', true)

    if (excError) {
        console.error('Erro ao buscar exceções da agenda:', excError.message)
        return []
    }

    // Se houver algum bloqueio sem hora_inicio/hora_fim definidos, representa o dia inteiro bloqueado
    const diaInteiroBloqueado = excecoes?.some((exc) => !exc.hora_inicio && !exc.hora_fim)
    if (diaInteiroBloqueado) {
        return []
    }

    // Mapeia bloqueios parciais para minutos a partir da meia-noite
    const bloqueiosParciais: Intervalo[] = (excecoes || [])
        .filter((exc) => exc.hora_inicio && exc.hora_fim)
        .map((exc) => ({
            start: timeToMinutes(exc.hora_inicio!),
            end: timeToMinutes(exc.hora_fim!),
        }))

    // 4. Buscar a menor duração entre os serviços ATIVOS do tenant — é ela que
    // define, na regra anti-buraco, o menor buraco "aproveitável" entre slots.
    const { data: servicosAtivos, error: servicosError } = await supabase
        .from('servicos')
        .select('duracao_minutos')
        .eq('tenant_id', tenantId)
        .eq('ativo', true)

    if (servicosError) {
        console.error('Erro ao buscar serviços ativos:', servicosError.message)
        return []
    }

    const duracoesAtivas = (servicosAtivos || []).map((s) => s.duracao_minutos)
    // Fallback: tenant sem serviço ativo cadastrado usa a própria duração pedida.
    const menorDuracaoAtiva =
        duracoesAtivas.length > 0 ? Math.min(...duracoesAtivas) : duracaoServicoMinutos

    // 5. Buscar Agendamentos existentes não cancelados para esta data
    // Os agendamentos são gravados como timestamp UTC; buscamos tudo que cai no
    // dia local `dateStr` no fuso do estabelecimento. `fim` é EXCLUSIVO (00:00 do
    // dia seguinte), evitando o buraco/overlap do antigo 23:59:59.
    const { inicio, fim } = limitesDoDia(dateStr, timezone)

    let queryAgendamentos = supabase
        .from('agendamentos')
        .select(
            `
            data_hora,
            status,
            servicos (
                duracao_minutos
            )
        `,
        )
        .eq('tenant_id', tenantId)
        .neq('status', 'cancelado')
        .gte('data_hora', inicio.toISOString())
        .lt('data_hora', fim.toISOString())

    // Remarcação: o próprio agendamento não deve colidir consigo mesmo.
    if (ignorarAgendamentoId) {
        queryAgendamentos = queryAgendamentos.neq('id', ignorarAgendamentoId)
    }

    const { data: agendamentos, error: agError } = await queryAgendamentos

    if (agError) {
        console.error('Erro ao buscar agendamentos:', agError.message)
        return []
    }

    // Converte os agendamentos existentes em janelas de minutos ocupados
    const slotsOcupados: Intervalo[] = (agendamentos || []).map((ag) => {
        // Hora do agendamento de volta para a parede local do estabelecimento
        const [h, m] = horaLocal(ag.data_hora, timezone).split(':').map(Number)
        const start = h * 60 + m
        // Se a duração do serviço não estiver disponível, assume 30min padrão
        // @ts-expect-error — join do Supabase tipado como array; runtime é objeto único
        const duracao = ag.servicos?.duracao_minutos || 30
        const end = start + duracao

        return { start, end }
    })

    // 6. Intervalos livres do dia: janelas de funcionamento − bloqueios − ocupados
    const intervalosLivres = calcularIntervalosLivres(janelas, bloqueiosParciais, slotsOcupados)

    // 7. Candidatos de slot pela regra anti-buraco
    const candidatos = gerarSlotsAntiBuraco(
        intervalosLivres,
        duracaoServicoMinutos,
        menorDuracaoAtiva,
    )

    // 8. Antecedência mínima, generalizada por instante (substitui o antigo
    // `limiteMinutosHoje`, que só filtrava quando `dateStr === hoje` — bug
    // latente com antecedências longas que atravessam a virada do dia). Ausência
    // de `regrasAcesso` (fluxo manual) equivale a antecedência 0: passado
    // continua filtrado, sem restrição adicional.
    const antecedenciaMinutos = regrasAcesso?.antecedenciaMinutos ?? 0
    const cutoff = new Date(agora.getTime() + antecedenciaMinutos * 60_000)

    const slotsDisponiveis: Slot[] = []
    for (const minutos of candidatos) {
        const timeStr = minutesToTimeStr(minutos)
        const instante = instanteDe(dateStr, timeStr, timezone)

        if (instante < cutoff) {
            continue
        }

        slotsDisponiveis.push({
            time: timeStr,
            datetime: instante.toISOString(),
        })
    }

    return slotsDisponiveis
}
