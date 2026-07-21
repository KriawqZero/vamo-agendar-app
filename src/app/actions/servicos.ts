'use server'

import { createClient } from '@/lib/supabase/server'
import { auth } from '@clerk/nextjs/server'
import { PLANOS } from '@/lib/planos'
import { obterAssinaturaVigente } from '@/lib/assinaturas'
import { capturarEventoTenant } from '@/lib/analytics/server'

interface ServicoInput {
    id?: string
    nome: string
    descricao?: string
    preco: number
    duracaoMinutos: number
    ativo: boolean
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

    // Gating de plano: criar serviço ativo ou reativar um inativo não pode
    // exceder o limite de serviços ativos do plano vigente.
    if (input.ativo) {
        const { plano } = await obterAssinaturaVigente(supabase, orgId)
        const limite = PLANOS[plano].limiteServicosAtivos

        if (limite !== null) {
            let query = supabase
                .from('servicos')
                .select('id', { count: 'exact', head: true })
                .eq('tenant_id', orgId)
                .eq('ativo', true)

            if (input.id) {
                // Em edição, o próprio serviço não conta contra o limite
                query = query.neq('id', input.id)
            }

            const { count, error: countError } = await query

            if (countError) {
                console.error('Erro ao contar serviços ativos:', countError.message)
                throw new Error('Não foi possível validar o limite do seu plano. Tente novamente.')
            }

            if ((count ?? 0) >= limite) {
                throw new Error(
                    `O plano ${PLANOS[plano].nome} permite até ${limite} serviços ativos. ` +
                        'Desative outro serviço ou faça upgrade em Plano no menu.',
                )
            }
        }
    }

    const payload = {
        tenant_id: orgId,
        nome: input.nome.trim(),
        descricao: input.descricao?.trim() || null,
        preco: input.preco,
        duracao_minutos: input.duracaoMinutos,
        ativo: input.ativo,
        updated_at: new Date().toISOString(),
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

        // Funil: manutenção do catálogo é sinal de tenant vivo. Sem nome nem
        // preço do serviço — o evento conta que houve edição, não qual.
        try {
            capturarEventoTenant('service_updated', orgId)
        } catch (analyticsErr) {
            console.error('[analytics] service_updated não capturado (ignorado):', analyticsErr)
        }

        return data
    } else {
        // Funil: detecta ANTES do INSERT se este será o primeiro serviço do
        // tenant (count barato head-only, e só com analytics ativo — sem key
        // não gastamos uma ida ao banco). Falha aqui nunca afeta o fluxo.
        let ehPrimeiroServico = false
        if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
            try {
                const { count, error: cError } = await supabase
                    .from('servicos')
                    .select('id', { count: 'exact', head: true })
                    .eq('tenant_id', orgId)
                ehPrimeiroServico = !cError && (count ?? 0) === 0
            } catch (analyticsErr) {
                console.error('[analytics] contagem de serviços falhou (ignorada):', analyticsErr)
            }
        }

        // INSERT
        const { data, error } = await supabase.from('servicos').insert(payload).select().single()

        if (error) {
            console.error('Erro ao criar serviço:', error.message)
            throw new Error('Erro ao salvar o novo serviço.')
        }

        if (ehPrimeiroServico) {
            try {
                capturarEventoTenant('first_service_created', orgId)
            } catch (analyticsErr) {
                console.error(
                    '[analytics] first_service_created não capturado (ignorado):',
                    analyticsErr,
                )
            }
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

    const { error } = await supabase.from('servicos').delete().eq('id', id).eq('tenant_id', orgId) // Segurança extra RLS

    if (error) {
        console.error('Erro ao excluir serviço:', error.message)
        // Se houver FK vinculando a tabela, avisa que possui dependências
        if (error.code === '23503') {
            throw new Error(
                'Este serviço não pode ser excluído pois possui agendamentos associados a ele. Recomenda-se desativá-lo.',
            )
        }
        throw new Error('Erro ao tentar excluir o serviço.')
    }

    // Funil: só dispara na exclusão que passou pelo RESTRICT do banco — o
    // erro 23503 acima sai por throw e não conta como serviço removido.
    try {
        capturarEventoTenant('service_deleted', orgId)
    } catch (analyticsErr) {
        console.error('[analytics] service_deleted não capturado (ignorado):', analyticsErr)
    }

    return true
}
