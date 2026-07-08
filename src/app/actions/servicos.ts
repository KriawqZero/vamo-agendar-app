'use server'

import { createClient } from '@/lib/supabase/server'
import { auth } from '@clerk/nextjs/server'

interface ServicoInput {
    id?: string;
    nome: string;
    descricao?: string;
    preco: number;
    duracaoMinutos: number;
    ativo: boolean;
}

/**
 * Recupera todos os serviços da organização autenticada.
 */
export async function listarServicos() {
    const { orgId } = await auth()
    if (!orgId) {
        throw new Error('Não autorizado. Nenhuma organização ativa.')
    }

    const supabase = await createClient()

    const { data, error } = await supabase
        .from('servicos')
        .select('*')
        .eq('tenant_id', orgId)
        .order('created_at', { ascending: true })

    if (error) {
        console.error('Erro ao listar serviços:', error.message)
        throw new Error('Não foi possível carregar a lista de serviços.')
    }

    return data || []
}

/**
 * Cria ou atualiza um serviço para a organização autenticada.
 */
export async function salvarServico(input: ServicoInput) {
    const { orgId } = await auth()
    if (!orgId) {
        throw new Error('Não autorizado. Nenhuma organização ativa.')
    }

    if (!input.nome || input.preco < 0 || input.duracaoMinutos <= 0) {
        throw new Error('Preencha os dados do serviço corretamente.')
    }

    const supabase = await createClient()

    const payload = {
        tenant_id: orgId,
        nome: input.nome.trim(),
        descricao: input.descricao?.trim() || null,
        preco: input.preco,
        duracao_minutos: input.duracaoMinutos,
        ativo: input.ativo,
        updated_at: new Date().toISOString()
    }

    if (input.id) {
        // UPDATE
        const { data, error } = await supabase
            .from('servicos')
            .update(payload)
            .eq('id', input.id)
            .eq('tenant_id', orgId) // Segurança extra RLS
            .select()
            .single()

        if (error) {
            console.error('Erro ao atualizar serviço:', error.message)
            throw new Error('Erro ao salvar as modificações do serviço.')
        }

        return data
    } else {
        // INSERT
        const { data, error } = await supabase
            .from('servicos')
            .insert(payload)
            .select()
            .single()

        if (error) {
            console.error('Erro ao criar serviço:', error.message)
            throw new Error('Erro ao salvar o novo serviço.')
        }

        return data
    }
}

/**
 * Exclui logicamente ou fisicamente um serviço.
 * RESTRICT foreign key no agendamento garante que não possamos deletar serviços com agendamentos ativos.
 */
export async function excluirServico(id: string) {
    const { orgId } = await auth()
    if (!orgId) {
        throw new Error('Não autorizado. Nenhuma organização ativa.')
    }

    const supabase = await createClient()

    const { error } = await supabase
        .from('servicos')
        .delete()
        .eq('id', id)
        .eq('tenant_id', orgId) // Segurança extra RLS

    if (error) {
        console.error('Erro ao excluir serviço:', error.message)
        // Se houver FK vinculando a tabela, avisa que possui dependências
        if (error.code === '23503') {
            throw new Error('Este serviço não pode ser excluído pois possui agendamentos associados a ele. Recomenda-se desativá-lo.')
        }
        throw new Error('Erro ao tentar excluir o serviço.')
    }

    return true
}
