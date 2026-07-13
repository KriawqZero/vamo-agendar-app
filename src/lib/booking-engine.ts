import { SupabaseClient } from '@supabase/supabase-js'
import { TIMEZONE_PADRAO, diaDaSemana, diaLocal, horaLocal, instanteDe, limitesDoDia } from './timezone'

interface Slot {
    time: string; // "HH:MM"
    datetime: string; // ISO string in UTC
}

interface BookingEngineParams {
    tenantId: string;
    dateStr: string; // "YYYY-MM-DD"
    duracaoServicoMinutos: number;
    supabase: SupabaseClient;
    timezone?: string; // Fuso IANA do estabelecimento (padrão: TIMEZONE_PADRAO)
    ignorarAgendamentoId?: string; // Exclui este agendamento da checagem de colisão (remarcação)
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
 * Calcula os slots livres de agendamento para um determinado dia e tenant
 */
export async function obterSlotsDisponiveis({
    tenantId,
    dateStr,
    duracaoServicoMinutos,
    supabase,
    timezone = TIMEZONE_PADRAO,
    ignorarAgendamentoId
}: BookingEngineParams): Promise<Slot[]> {
    // 1. Determinar o dia da semana (0 = Domingo, 1 = Segunda, ..., 6 = Sábado)
    const diaSemana = diaDaSemana(dateStr)

    // 2. Buscar Horário de Funcionamento padrão do tenant para o dia da semana
    const { data: funcData, error: funcError } = await supabase
        .from('horarios_funcionamento')
        .select('hora_inicio, hora_fim')
        .eq('tenant_id', tenantId)
        .eq('dia_semana', diaSemana)
        .eq('ativo', true)
        .maybeSingle()

    if (funcError) {
        console.error('Erro ao buscar horário de funcionamento:', funcError.message)
        return []
    }

    if (!funcData) {
        // Estabelecimento fechado neste dia da semana
        return []
    }

    const businessStart = timeToMinutes(funcData.hora_inicio)
    const businessEnd = timeToMinutes(funcData.hora_fim)

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
    const diaInteiroBloqueado = excecoes?.some(exc => !exc.hora_inicio && !exc.hora_fim)
    if (diaInteiroBloqueado) {
        return []
    }

    // Mapeia bloqueios parciais para minutos a partir da meia-noite
    const bloqueiosParciais = (excecoes || [])
        .filter(exc => exc.hora_inicio && exc.hora_fim)
        .map(exc => ({
            start: timeToMinutes(exc.hora_inicio!),
            end: timeToMinutes(exc.hora_fim!)
        }))

    // 4. Buscar Agendamentos existentes não cancelados para esta data
    // Os agendamentos são gravados como timestamp UTC; buscamos tudo que cai no
    // dia local `dateStr` no fuso do estabelecimento. `fim` é EXCLUSIVO (00:00 do
    // dia seguinte), evitando o buraco/overlap do antigo 23:59:59.
    const { inicio, fim } = limitesDoDia(dateStr, timezone)

    let queryAgendamentos = supabase
        .from('agendamentos')
        .select(`
            data_hora,
            status,
            servicos (
                duracao_minutos
            )
        `)
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
    const slotsOcupados = (agendamentos || []).map(ag => {
        // Hora do agendamento de volta para a parede local do estabelecimento
        const [h, m] = horaLocal(ag.data_hora, timezone).split(':').map(Number)
        const start = h * 60 + m
        // Se a duração do serviço não estiver disponível, assume 30min padrão
        // @ts-ignore
        const duracao = ag.servicos?.duracao_minutos || 30
        const end = start + duracao

        return { start, end }
    })

    // 5. Determinar hora atual caso a consulta seja para HOJE (no fuso do
    // estabelecimento). Evita sugerir horários do passado.
    const agora = new Date()
    let limiteMinutosHoje = -1
    if (diaLocal(agora, timezone) === dateStr) {
        const [horaAtual, minutoAtual] = horaLocal(agora, timezone).split(':').map(Number)
        // Adiciona uma margem de segurança de 15 minutos para agendamento
        limiteMinutosHoje = horaAtual * 60 + minutoAtual + 15
    }

    // 6. Gerar os slots possíveis
    // O intervalo padrão de início de slots é de 15 minutos (ex: 08:00, 08:15, 08:30...)
    const slotStep = 15
    const slotsDisponiveis: Slot[] = []

    for (let current = businessStart; current + duracaoServicoMinutos <= businessEnd; current += slotStep) {
        const slotStart = current
        const slotEnd = current + duracaoServicoMinutos

        // Regra A: Se for hoje, o slot não pode estar no passado
        if (slotStart < limiteMinutosHoje) {
            continue
        }

        // Regra B: O slot não pode colidir com bloqueios parciais (exceções)
        const colideComExcecao = bloqueiosParciais.some(bl => 
            slotStart < bl.end && slotEnd > bl.start
        )
        if (colideComExcecao) {
            continue
        }

        // Regra C: O slot não pode colidir com agendamentos existentes
        const colideComAgendamento = slotsOcupados.some(ag => 
            slotStart < ag.end && slotEnd > ag.start
        )
        if (colideComAgendamento) {
            continue
        }

        // Se passar por todas as regras, o slot está livre
        const timeStr = minutesToTimeStr(slotStart)
        // Cria a string de data/hora ISO (UTC) da parede local no fuso do estabelecimento
        const isoString = instanteDe(dateStr, timeStr, timezone).toISOString()

        slotsDisponiveis.push({
            time: timeStr,
            datetime: isoString
        })
    }

    return slotsDisponiveis
}
