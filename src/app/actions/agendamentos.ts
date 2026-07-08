'use server'

import { createClient } from '@/lib/supabase/server'
import { auth } from '@clerk/nextjs/server'

interface ListarParams {
    dataFiltro?: string; // YYYY-MM-DD
}

/**
 * Lista todos os agendamentos da organização autenticada.
 * Opcionalmente filtra por uma data específica no fuso local.
 */
export async function listarAgendamentos(params?: ListarParams) {
    const { orgId } = await auth()
    if (!orgId) {
        throw new Error('Não autorizado. Nenhuma organização ativa.')
    }

    const supabase = await createClient()

    let query = supabase
        .from('agendamentos')
        .select(`
            id,
            data_hora,
            status,
            clientes (
                id,
                nome,
                telefone,
                email
            ),
            servicos (
                id,
                nome,
                preco,
                duracao_minutos
            )
        `)
        .eq('tenant_id', orgId)

    if (params?.dataFiltro) {
        // Filtra os limites em UTC-3 para a data fornecida
        const startUtc = new Date(`${params.dataFiltro}T00:00:00-03:00`).toISOString()
        const endUtc = new Date(`${params.dataFiltro}T23:59:59-03:00`).toISOString()
        query = query.gte('data_hora', startUtc).lte('data_hora', endUtc)
    }

    const { data, error } = await query.order('data_hora', { ascending: true })

    if (error) {
        console.error('Erro ao listar agendamentos no dashboard:', error.message)
        throw new Error('Não foi possível carregar os agendamentos.')
    }

    return data || []
}

/**
 * Atualiza o status de um agendamento pertencente à organização autenticada.
 */
export async function atualizarStatusAgendamento(
    id: string,
    status: 'confirmado' | 'concluido' | 'cancelado'
) {
    const { orgId } = await auth()
    if (!orgId) {
        throw new Error('Não autorizado. Nenhuma organização ativa.')
    }

    const supabase = await createClient()

    const { data, error } = await supabase
        .from('agendamentos')
        .update({
            status,
            updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('tenant_id', orgId) // Segurança extra RLS
        .select()
        .single()

    if (error) {
        console.error('Erro ao atualizar status do agendamento:', error.message)
        throw new Error('Erro ao atualizar o agendamento.')
    }

    return data
}