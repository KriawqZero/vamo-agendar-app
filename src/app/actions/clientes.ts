'use server'

import { createClient } from '@/lib/supabase/server'
import { auth } from '@clerk/nextjs/server'

/**
 * Lista clientes da organização autenticada para o seletor de agendamento
 * manual. Busca por nome (parcial, sem case) ou por telefone (dígitos).
 */
export async function listarClientes(busca?: string) {
    const { orgId } = await auth()
    if (!orgId) {
        throw new Error('Não autorizado. Nenhuma organização ativa.')
    }

    const supabase = await createClient()

    let query = supabase
        .from('clientes')
        .select('id, nome, telefone')
        .eq('tenant_id', orgId)

    // Caracteres com significado na sintaxe or() do PostgREST são removidos.
    const termo = (busca || '').trim().replace(/[,()%]/g, '')
    if (termo) {
        const digitos = termo.replace(/\D/g, '')
        if (digitos.length >= 2) {
            query = query.or(`nome.ilike.%${termo}%,telefone.ilike.%${digitos}%`)
        } else {
            query = query.ilike('nome', `%${termo}%`)
        }
    }

    const { data, error } = await query.order('nome', { ascending: true }).limit(20)

    if (error) {
        console.error('Erro ao listar clientes:', error.message)
        throw new Error('Não foi possível carregar os clientes.')
    }

    return data || []
}
