'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { auth } from '@clerk/nextjs/server'
import { diaLocal, limitesDoDia, TIMEZONE_PADRAO } from '@/lib/timezone'
import { agendarLembreteQStash, cancelarLembreteQStash, registrarDisparo } from '@/lib/whatsapp-helper'
import { obterSlotsDisponiveis } from '@/lib/booking-engine'
import { dispararNotificacoesAgendamento } from '@/lib/notificacoes-agendamento'
import { PLANOS } from '@/lib/planos'
import { obterPlanoVigentePublico } from '@/lib/assinaturas'
import { capturarEventoTenant } from '@/lib/analytics/server'

interface ListarParams {
    dataFiltro?: string; // YYYY-MM-DD (um único dia)
    periodo?: { inicio: string; fim: string }; // YYYY-MM-DD inclusivos, no fuso local
}

/**
 * Lista todos os agendamentos da organização autenticada.
 * Opcionalmente filtra por uma data específica ou por um período no fuso local.
 */
export async function listarAgendamentos(params?: ListarParams) {
    const { orgId } = await auth()
    if (!orgId) {
        throw new Error('Não autorizado. Nenhuma organização ativa.')
    }

    const supabase = await createClient()

    // Fuso do estabelecimento: os limites de dia dos filtros são interpretados nele.
    const { data: perfil } = await supabase
        .from('perfis_empresas')
        .select('timezone')
        .eq('tenant_id', orgId)
        .maybeSingle()

    const timezone = perfil?.timezone || TIMEZONE_PADRAO

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
        // Limites do dia no fuso do estabelecimento (fim EXCLUSIVO).
        const { inicio, fim } = limitesDoDia(params.dataFiltro, timezone)
        query = query.gte('data_hora', inicio.toISOString()).lt('data_hora', fim.toISOString())
    } else if (params?.periodo) {
        // Início do primeiro dia até o início do dia seguinte ao último (fim EXCLUSIVO).
        const inicio = limitesDoDia(params.periodo.inicio, timezone).inicio
        const fim = limitesDoDia(params.periodo.fim, timezone).fim
        query = query.gte('data_hora', inicio.toISOString()).lt('data_hora', fim.toISOString())
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

    // Ao cancelar, evita o disparo do lembrete futuro removendo o job no QStash.
    // Falha aqui não desfaz o cancelamento (a defesa final é o webhook, que
    // reconfere o status 'cancelado' antes de enviar) — por isso o try/catch:
    // o status já foi persistido e nenhum erro de mensageria pode virar erro
    // para o profissional.
    if (status === 'cancelado') {
        try {
            const { data: lembrete } = await supabase
                .from('disparos_whatsapp')
                .select('qstash_message_id')
                .eq('tenant_id', orgId)
                .eq('agendamento_id', id)
                .eq('tipo', 'lembrete')
                .eq('status', 'agendado')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle()

            if (lembrete?.qstash_message_id) {
                await cancelarLembreteQStash(lembrete.qstash_message_id)
                await registrarDisparo(supabase, {
                    tenantId: orgId,
                    agendamentoId: id,
                    tipo: 'lembrete',
                    status: 'cancelado'
                })
            }
        } catch (err) {
            console.error('Falha ao cancelar lembrete no QStash (ignorada):', err)
        }
    }

    capturarEventoTenant('booking_status_changed', orgId, { status })
    revalidatePath('/dashboard')

    return data
}

/** Fuso IANA do estabelecimento da organização autenticada. */
async function timezoneDoTenant(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string) {
    const { data: perfil } = await supabase
        .from('perfis_empresas')
        .select('timezone')
        .eq('tenant_id', orgId)
        .maybeSingle()

    return perfil?.timezone || TIMEZONE_PADRAO
}

/**
 * Slots livres para o agendamento manual no dashboard. Mesma engine do fluxo
 * público; `ignorarAgendamentoId` permite remarcar sem colidir consigo mesmo.
 */
export async function obterSlotsDashboard(
    dateStr: string,
    duracaoMinutos: number,
    ignorarAgendamentoId?: string
) {
    const { orgId } = await auth()
    if (!orgId) {
        throw new Error('Não autorizado. Nenhuma organização ativa.')
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        throw new Error('Data inválida.')
    }

    const supabase = await createClient()
    const timezone = await timezoneDoTenant(supabase, orgId)

    return obterSlotsDisponiveis({
        tenantId: orgId,
        dateStr,
        duracaoServicoMinutos: duracaoMinutos,
        supabase,
        timezone,
        ignorarAgendamentoId
    })
}

interface CriarAgendamentoManualParams {
    servicoId: string;
    dataHora: string; // ISO string em UTC (datetime exato do slot)
    clienteId?: string;
    clienteNome?: string;
    clienteTelefone?: string;
    enviarWhatsApp?: boolean;
}

/**
 * Cria um agendamento em nome do profissional (fluxo manual do dashboard).
 * Reaproveita cliente existente (por id ou por telefone) ou cadastra inline;
 * revalida o slot na mesma engine do fluxo público — sem override de conflito.
 */
export async function criarAgendamentoManual({
    servicoId,
    dataHora,
    clienteId,
    clienteNome,
    clienteTelefone,
    enviarWhatsApp
}: CriarAgendamentoManualParams) {
    const { orgId } = await auth()
    if (!orgId) {
        throw new Error('Não autorizado. Nenhuma organização ativa.')
    }

    if (!servicoId || !dataHora) {
        throw new Error('Selecione o serviço e o horário.')
    }

    const dataObj = new Date(dataHora)
    if (isNaN(dataObj.getTime())) {
        throw new Error('Data e horário inválidos.')
    }

    // A engine só filtra o passado quando a data consultada é "hoje" — este
    // cheque cobre a régua stale (página aberta na virada da meia-noite).
    if (dataObj.getTime() <= Date.now()) {
        throw new Error('Escolha um horário futuro.')
    }

    if (!clienteId && !clienteNome?.trim()) {
        throw new Error('Selecione um cliente ou informe os dados do novo cliente.')
    }

    const supabase = await createClient()
    const timezone = await timezoneDoTenant(supabase, orgId)

    // 1. Serviço ativo do próprio tenant (RLS reforça o isolamento).
    const { data: servico, error: sError } = await supabase
        .from('servicos')
        .select('duracao_minutos, nome')
        .eq('id', servicoId)
        .eq('tenant_id', orgId)
        .eq('ativo', true)
        .single()

    if (sError || !servico) {
        throw new Error('Serviço inválido ou inativo.')
    }

    // 2. Resolver o cliente: existente por id, ou por telefone, ou cadastro inline.
    let clienteFinal: { id: string; nome: string; telefone: string | null }

    if (clienteId) {
        const { data: cliente, error: cError } = await supabase
            .from('clientes')
            .select('id, nome, telefone')
            .eq('id', clienteId)
            .eq('tenant_id', orgId)
            .maybeSingle()

        if (cError || !cliente) {
            throw new Error('Cliente não encontrado.')
        }
        clienteFinal = cliente
    } else {
        const telefoneLimpo = (clienteTelefone || '').replace(/\D/g, '')
        if (telefoneLimpo.length < 10 || telefoneLimpo.length > 11) {
            throw new Error('Informe o WhatsApp do cliente com DDD (10 ou 11 dígitos).')
        }

        // Mesmo telefone já cadastrado neste tenant: reaproveita o registro.
        const { data: existente } = await supabase
            .from('clientes')
            .select('id, nome, telefone')
            .eq('tenant_id', orgId)
            .eq('telefone', telefoneLimpo)
            .maybeSingle()

        if (existente) {
            clienteFinal = existente
        } else {
            const { data: novo, error: nError } = await supabase
                .from('clientes')
                .insert({
                    tenant_id: orgId,
                    nome: clienteNome!.trim(),
                    telefone: telefoneLimpo
                })
                .select('id, nome, telefone')
                .single()

            if (nError || !novo) {
                console.error('Erro ao cadastrar cliente no agendamento manual:', nError?.message)
                throw new Error('Erro ao cadastrar o cliente.')
            }
            clienteFinal = novo
        }
    }

    // 3. Revalidar o slot contra double-booking (mesma engine do fluxo público).
    const dateStr = diaLocal(dataObj, timezone)
    const slotsLivres = await obterSlotsDisponiveis({
        tenantId: orgId,
        dateStr,
        duracaoServicoMinutos: servico.duracao_minutos,
        supabase,
        timezone
    })

    if (!slotsLivres.some(sl => sl.datetime === dataHora)) {
        throw new Error('Este horário conflita com outro agendamento. Escolha outro horário.')
    }

    // 4. Inserir o agendamento (manual nasce confirmado).
    const { data: agendamento, error: agError } = await supabase
        .from('agendamentos')
        .insert({
            tenant_id: orgId,
            cliente_id: clienteFinal.id,
            servico_id: servicoId,
            data_hora: dataHora,
            status: 'confirmado'
        })
        .select('id, data_hora, status')
        .single()

    if (agError || !agendamento) {
        console.error('Erro ao criar agendamento manual:', agError?.message)
        throw new Error('Erro ao criar o agendamento.')
    }

    // 5. Notificações opcionais — a função nunca lança (agendamento já persistiu).
    if (enviarWhatsApp && clienteFinal.telefone) {
        await dispararNotificacoesAgendamento(supabase, {
            agendamentoId: agendamento.id,
            tenantId: orgId,
            clienteNome: clienteFinal.nome,
            clienteTelefone: clienteFinal.telefone,
            dataHora,
            timezone
        })
    }

    capturarEventoTenant('manual_booking_created', orgId, {
        whatsapp_solicitado: Boolean(enviarWhatsApp),
    })
    revalidatePath('/dashboard')

    return agendamento
}

/**
 * Remarca um agendamento ativo para um novo horário, revalidando o slot na
 * engine (ignorando o próprio agendamento). Realinha o lembrete de WhatsApp:
 * cancela o job antigo no QStash e agenda um novo para o horário remarcado.
 */
export async function remarcarAgendamento(id: string, novaDataHora: string) {
    const { orgId } = await auth()
    if (!orgId) {
        throw new Error('Não autorizado. Nenhuma organização ativa.')
    }

    const dataObj = new Date(novaDataHora)
    if (!id || isNaN(dataObj.getTime())) {
        throw new Error('Data e horário inválidos.')
    }

    if (dataObj.getTime() <= Date.now()) {
        throw new Error('Escolha um horário futuro.')
    }

    const supabase = await createClient()
    const timezone = await timezoneDoTenant(supabase, orgId)

    const { data: agendamento, error: aError } = await supabase
        .from('agendamentos')
        .select('id, status, servico_id, servicos ( duracao_minutos )')
        .eq('id', id)
        .eq('tenant_id', orgId)
        .maybeSingle()

    if (aError || !agendamento) {
        throw new Error('Agendamento não encontrado.')
    }

    if (agendamento.status === 'cancelado' || agendamento.status === 'concluido') {
        throw new Error('Este agendamento não pode mais ser remarcado.')
    }

    const servicoObj = Array.isArray(agendamento.servicos)
        ? agendamento.servicos[0]
        : agendamento.servicos
    const duracaoMinutos = Number(servicoObj?.duracao_minutos) || 30

    const dateStr = diaLocal(dataObj, timezone)
    const slotsLivres = await obterSlotsDisponiveis({
        tenantId: orgId,
        dateStr,
        duracaoServicoMinutos: duracaoMinutos,
        supabase,
        timezone,
        ignorarAgendamentoId: id
    })

    if (!slotsLivres.some(sl => sl.datetime === novaDataHora)) {
        throw new Error('Este horário conflita com outro agendamento. Escolha outro horário.')
    }

    const { data, error } = await supabase
        .from('agendamentos')
        .update({
            data_hora: novaDataHora,
            updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('tenant_id', orgId)
        .select('id, data_hora, status')
        .single()

    if (error || !data) {
        console.error('Erro ao remarcar agendamento:', error?.message)
        throw new Error('Erro ao remarcar o agendamento.')
    }

    // Realinha o lembrete ao novo horário: cancela o job antigo (que dispararia
    // na hora errada) e agenda um novo quando o recurso está ativo. A remarcação
    // já persistiu — nenhum erro de mensageria pode virar erro para o profissional.
    try {
        const { data: lembrete } = await supabase
            .from('disparos_whatsapp')
            .select('qstash_message_id')
            .eq('tenant_id', orgId)
            .eq('agendamento_id', id)
            .eq('tipo', 'lembrete')
            .eq('status', 'agendado')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

        // O novo lembrete só nasce se havia um lembrete ATIVO para realinhar:
        // agendamento criado com opt-out de WhatsApp (manual, checkbox
        // desmarcado) não pode ganhar lembrete "do nada" numa remarcação.
        if (lembrete?.qstash_message_id) {
            await cancelarLembreteQStash(lembrete.qstash_message_id)
            await registrarDisparo(supabase, {
                tenantId: orgId,
                agendamentoId: id,
                tipo: 'lembrete',
                status: 'cancelado',
                motivo: 'remarcacao'
            })

            const { data: config } = await supabase
                .from('whatsapp_configs')
                .select('status, instance_token, tempo_lembrete_minutos')
                .eq('tenant_id', orgId)
                .maybeSingle()

            const plano = await obterPlanoVigentePublico(supabase, orgId)
            const whatsappAtivo = config
                && PLANOS[plano].recursos.whatsapp
                && config.status === 'conectado'
                && config.instance_token

            if (whatsappAtivo) {
                const targetTime = dataObj.getTime() - (config.tempo_lembrete_minutos * 60 * 1000)
                if (targetTime > Date.now()) {
                    const agendado = await agendarLembreteQStash(id, orgId, targetTime)
                    if (agendado.ok) {
                        await registrarDisparo(supabase, {
                            tenantId: orgId,
                            agendamentoId: id,
                            tipo: 'lembrete',
                            status: 'agendado',
                            qstashMessageId: agendado.messageId
                        })
                    } else {
                        await registrarDisparo(supabase, {
                            tenantId: orgId,
                            agendamentoId: id,
                            tipo: 'lembrete',
                            status: 'falha',
                            motivo: agendado.motivo
                        })
                    }
                }
            }
        }
    } catch (err) {
        console.error('Falha ao realinhar lembrete na remarcação (ignorada):', err)
    }

    capturarEventoTenant('booking_rescheduled', orgId)
    revalidatePath('/dashboard')

    return data
}