'use server'

import { createClient } from '@/lib/supabase/server'
import { obterSlotsDisponiveis } from '@/lib/booking-engine'
import { processarMensagemTemplate, enviarMensagemWhatsApp, agendarLembreteQStash } from '@/lib/whatsapp-helper'
import { PLANOS } from '@/lib/planos'
import { obterAssinaturaVigente } from '@/lib/assinaturas'

interface AgendamentoPublicoParams {
    tenantId: string;
    servicoId: string;
    dataHora: string; // ISO string em UTC
    clienteNome: string;
    clienteTelefone: string; // WhatsApp
    clienteEmail?: string;
}

/**
 * Cria um agendamento público (B2C) sem exigência de autenticação do cliente final.
 */
export async function criarAgendamentoPublico({
    tenantId,
    servicoId,
    dataHora,
    clienteNome,
    clienteTelefone,
    clienteEmail
}: AgendamentoPublicoParams) {
    // 1. Sanitizar e validar dados de entrada básicos
    if (!tenantId || !servicoId || !dataHora || !clienteNome || !clienteTelefone) {
        throw new Error('Preencha todos os campos obrigatórios.')
    }

    const telefoneLimpo = clienteTelefone.replace(/\D/g, '')
    if (telefoneLimpo.length < 10 || telefoneLimpo.length > 11) {
        throw new Error('Número de WhatsApp inválido. Informe o DDD e o número.')
    }

    const supabase = await createClient()

    // 2. Buscar informações do serviço (preço, duração)
    const { data: servico, error: sError } = await supabase
        .from('servicos')
        .select('duracao_minutos, nome')
        .eq('id', servicoId)
        .eq('ativo', true)
        .single()

    if (sError || !servico) {
        throw new Error('Serviço inválido ou indisponível.')
    }

    // 3. Validar se o slot de horário escolhido ainda está livre
    // Extrai a data YYYY-MM-DD da dataHora (que está no offset local -03:00)
    // Para converter a data_hora ISO (UTC) de volta para o dia local -03:00:
    const dataLocal = new Date(dataHora)
    const formatter = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    })
    
    const partes = formatter.formatToParts(dataLocal)
    const map = Object.fromEntries(partes.map(p => [p.type, p.value]))
    const dateStr = `${map.year}-${map.month}-${map.day}`

    const slotsLivres = await obterSlotsDisponiveis({
        tenantId,
        dateStr,
        duracaoServicoMinutos: servico.duracao_minutos,
        supabase
    })

    const horarioEscolhidoValido = slotsLivres.some(sl => sl.datetime === dataHora)
    if (!horarioEscolhidoValido) {
        throw new Error('Este horário já foi preenchido ou está indisponível. Por favor, selecione outro.')
    }

    // 4. Buscar cliente existente com o mesmo telefone para este tenant, ou criar novo
    let clienteId: string

    const { data: clienteExistente, error: cError } = await supabase
        .from('clientes')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('telefone', telefoneLimpo)
        .maybeSingle()

    if (clienteExistente) {
        clienteId = clienteExistente.id
    } else {
        // Cria novo registro de cliente
        const { data: novoCliente, error: cnError } = await supabase
            .from('clientes')
            .insert({
                tenant_id: tenantId,
                nome: clienteNome.trim(),
                telefone: telefoneLimpo,
                email: clienteEmail?.trim() || null
            })
            .select('id')
            .single()

        if (cnError || !novoCliente) {
            console.error('Erro ao cadastrar novo cliente:', cnError?.message)
            throw new Error('Erro ao processar dados de contato.')
        }
        clienteId = novoCliente.id
    }

    // 5. Inserir o agendamento no banco de dados (status padrão: confirmado)
    const { data: agendamento, error: agError } = await supabase
        .from('agendamentos')
        .insert({
            tenant_id: tenantId,
            cliente_id: clienteId,
            servico_id: servicoId,
            data_hora: dataHora,
            status: 'confirmado'
        })
        .select('id, data_hora, status')
        .single()

    if (agError || !agendamento) {
        console.error('Erro ao criar agendamento:', agError?.message)
        throw new Error('Erro ao confirmar o agendamento.')
    }

    // 6. Disparar notificações assíncronas (WhatsApp + QStash)
    try {
        const { data: perfil } = await supabase
            .from('perfis_empresas')
            .select('nome_estabelecimento')
            .eq('tenant_id', tenantId)
            .maybeSingle()

        const empresaNome = perfil?.nome_estabelecimento || 'Estabelecimento'

        const { data: config } = await supabase
            .from('whatsapp_configs')
            .select('*')
            .eq('tenant_id', tenantId)
            .maybeSingle()

        const { plano } = await obterAssinaturaVigente(supabase, tenantId)

        if (config && config.status === 'conectado' && config.instance_token && PLANOS[plano].recursos.whatsapp) {
            const dateObj = new Date(dataHora)
            const datePart = dateObj.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
            const timePart = dateObj.toLocaleTimeString('pt-BR', {
                timeZone: 'America/Sao_Paulo',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            })
            const dataHoraStr = `${datePart} às ${timePart}`

            const textoConfirmacao = processarMensagemTemplate({
                template: config.mensagem_confirmacao,
                clienteNome,
                empresaNome,
                dataHoraStr
            })

            await enviarMensagemWhatsApp(
                config.instance_name,
                config.instance_token,
                clienteTelefone,
                textoConfirmacao
            )

            const targetTime = dateObj.getTime() - (config.tempo_lembrete_minutos * 60 * 1000)
            const now = Date.now()

            if (targetTime > now) {
                await agendarLembreteQStash(agendamento.id, tenantId, targetTime)
            }
        }
    } catch (err) {
        console.error('Erro ao processar notificações automáticas do agendamento:', err)
    }

    return agendamento
}

/**
 * Busca o perfil da empresa e os seus serviços ativos usando o slug.
 */
export async function obterDadosBookingPublico(slug: string) {
    const supabase = await createClient()

    // 1. Buscar perfil pelo slug
    const { data: perfil, error: pError } = await supabase
        .from('perfis_empresas')
        .select('*')
        .eq('slug', slug)
        .maybeSingle()

    if (pError || !perfil) {
        return null
    }

    // 2. Buscar serviços ativos desta empresa
    const { data: servicos, error: sError } = await supabase
        .from('servicos')
        .select('*')
        .eq('tenant_id', perfil.tenant_id)
        .eq('ativo', true)
        .order('nome', { ascending: true })

    if (sError) {
        console.error('Erro ao buscar serviços públicos:', sError.message)
        throw new Error('Não foi possível carregar os serviços.')
    }

    return {
        perfil,
        servicos: servicos || []
    }
}

/**
 * Retorna os slots disponíveis calculados para uma data e duração de serviço.
 */
export async function obterSlotsPublicos(tenantId: string, dateStr: string, duracaoMinutos: number) {
    const supabase = await createClient()
    return obterSlotsDisponiveis({
        tenantId,
        dateStr,
        duracaoServicoMinutos: duracaoMinutos,
        supabase
    })
}
