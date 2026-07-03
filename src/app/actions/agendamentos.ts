'use server'

import { createClient } from '@/lib/supabase/server'
import { auth } from '@clerk/nextjs/server'

export async function criarNovoAgendamento(clienteId: string, dataHora: string) {
    // 1. Pega o contexto da organização do Clerk logada
    const { orgId } = await auth()
    if (!orgId) throw new Error("Usuário não está associado a nenhuma empresa no Clerk.")

    // 2. Cria o cliente Supabase SSR já injetando os claims do token do Clerk
    const supabase = await createClient()

    // 3. Insere os dados. O RLS que configuramos vai validar se orgId bate com o token!
    const { data, error } = await supabase
        .from('agendamentos')
        .insert({
            tenant_id: orgId, // Vincula à empresa atual
            cliente_id: clienteId,
            data_hora: dataHora,
            status: 'pendente'
        })
        .select()
        .single()

    if (error) {
        console.error("Erro no Supabase RLS/Insert:", error.message)
        throw new Error("Erro ao salvar o agendamento.")
    }

    return data
}