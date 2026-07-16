'use server'

import { createClient } from '@/lib/supabase/server'
import { auth } from '@clerk/nextjs/server'
import { capturarEventoTenant } from '@/lib/analytics/server'
import { validarJanelasFuncionamento } from '@/lib/horarios'

interface HorarioFuncionamentoInput {
    dia_semana: number
    hora_inicio: string
    hora_fim: string
    ativo: boolean
}

interface ExcecaoInput {
    id?: string
    data: string // YYYY-MM-DD
    hora_inicio?: string | null
    hora_fim?: string | null
    bloqueado: boolean
    motivo?: string
}

/**
 * Lista as configurações de horários de funcionamento semanais do tenant ativo.
 */
export async function listarHorariosFuncionamento() {
    const { orgId } = await auth()
    if (!orgId) {
        throw new Error('Não autorizado. Nenhuma organização ativa.')
    }

    const supabase = await createClient()

    const { data, error } = await supabase
        .from('horarios_funcionamento')
        .select('*')
        .eq('tenant_id', orgId)
        .order('dia_semana', { ascending: true })
        .order('hora_inicio', { ascending: true })

    if (error) {
        console.error('Erro ao listar horários de funcionamento:', error.message)
        throw new Error('Não foi possível carregar os horários de funcionamento.')
    }

    return data || []
}

/**
 * Salva ou atualiza a lista de horários de funcionamento (dias de trabalho) de forma em lote.
 */
export async function salvarHorariosFuncionamento(horarios: HorarioFuncionamentoInput[]) {
    const { orgId } = await auth()
    if (!orgId) {
        throw new Error('Não autorizado. Nenhuma organização ativa.')
    }

    // Valida a semana inteira (formato, dia_semana, hora_fim > hora_inicio e
    // não-sobreposição entre janelas ativas) antes de tocar o banco — a RPC
    // abaixo não faz essa checagem, é responsabilidade da action.
    const erroValidacao = validarJanelasFuncionamento(horarios)
    if (erroValidacao) {
        throw new Error(erroValidacao)
    }

    const supabase = await createClient()

    // Funil: detecta ANTES da gravação se é a primeira configuração de horários
    // do tenant (count barato head-only, e só com analytics ativo — sem key
    // não gastamos uma ida ao banco). Falha aqui nunca afeta o fluxo.
    let ehPrimeiraConfiguracao = false
    if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
        try {
            const { count, error: cError } = await supabase
                .from('horarios_funcionamento')
                .select('id', { count: 'exact', head: true })
                .eq('tenant_id', orgId)
            ehPrimeiraConfiguracao = !cError && (count ?? 0) === 0
        } catch (analyticsErr) {
            console.error('[analytics] contagem de horários falhou (ignorada):', analyticsErr)
        }
    }

    // Substitui TODAS as janelas do tenant atomicamente (delete + insert numa
    // única transação). SEM tenant_id no payload: a RPC deriva do JWT
    // (auth.jwt() ->> 'org_id'), nunca aceita do chamador.
    const payload = horarios.map((h) => ({
        dia_semana: h.dia_semana,
        hora_inicio: h.hora_inicio,
        hora_fim: h.hora_fim,
        ativo: h.ativo,
    }))

    const { data, error } = await supabase.rpc('substituir_horarios_funcionamento', {
        p_horarios: payload,
    })

    if (error) {
        console.error('Erro ao salvar horários de funcionamento:', error.message)
        throw new Error('Erro ao salvar as configurações de horário.')
    }

    if (ehPrimeiraConfiguracao) {
        try {
            capturarEventoTenant('schedule_configured', orgId)
        } catch (analyticsErr) {
            console.error('[analytics] schedule_configured não capturado (ignorado):', analyticsErr)
        }
    }

    return data
}

/**
 * Lista as exceções (bloqueios e folgas) ativas e futuras do tenant.
 */
export async function listarExcecoesAgenda() {
    const { orgId } = await auth()
    if (!orgId) {
        throw new Error('Não autorizado. Nenhuma organização ativa.')
    }

    const supabase = await createClient()

    // Traz exceções de hoje em diante para não poluir a listagem administrativa com o passado
    const hojeStr = new Date().toISOString().split('T')[0]

    const { data, error } = await supabase
        .from('excecoes_agenda')
        .select('*')
        .eq('tenant_id', orgId)
        .gte('data', hojeStr)
        .order('data', { ascending: true })

    if (error) {
        console.error('Erro ao listar exceções da agenda:', error.message)
        throw new Error('Não foi possível carregar as exceções da agenda.')
    }

    return data || []
}

/**
 * Cria ou atualiza um bloqueio manual/exceção.
 */
export async function salvarExcecaoAgenda(input: ExcecaoInput) {
    const { orgId } = await auth()
    if (!orgId) {
        throw new Error('Não autorizado. Nenhuma organização ativa.')
    }

    if (!input.data) {
        throw new Error('A data da exceção é obrigatória.')
    }

    const supabase = await createClient()

    const payload = {
        tenant_id: orgId,
        data: input.data,
        hora_inicio: input.hora_inicio || null,
        hora_fim: input.hora_fim || null,
        bloqueado: input.bloqueado,
        motivo: input.motivo?.trim() || null,
        updated_at: new Date().toISOString(),
    }

    if (input.id) {
        // UPDATE
        const { data, error } = await supabase
            .from('excecoes_agenda')
            .update(payload)
            .eq('id', input.id)
            .eq('tenant_id', orgId)
            .select()
            .single()

        if (error) {
            console.error('Erro ao atualizar exceção:', error.message)
            throw new Error('Erro ao salvar modificação da exceção.')
        }

        return data
    } else {
        // INSERT
        const { data, error } = await supabase
            .from('excecoes_agenda')
            .insert(payload)
            .select()
            .single()

        if (error) {
            console.error('Erro ao criar exceção:', error.message)
            throw new Error('Erro ao salvar novo bloqueio na agenda.')
        }

        return data
    }
}

/**
 * Remove permanentemente um bloqueio manual/exceção.
 */
export async function excluirExcecaoAgenda(id: string) {
    const { orgId } = await auth()
    if (!orgId) {
        throw new Error('Não autorizado. Nenhuma organização ativa.')
    }

    const supabase = await createClient()

    const { error } = await supabase
        .from('excecoes_agenda')
        .delete()
        .eq('id', id)
        .eq('tenant_id', orgId)

    if (error) {
        console.error('Erro ao remover exceção:', error.message)
        throw new Error('Erro ao remover exceção da agenda.')
    }

    return true
}
