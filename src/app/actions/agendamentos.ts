'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { auth } from '@clerk/nextjs/server'
import { diaLocal, limitesDoDia, TIMEZONE_PADRAO } from '@/lib/timezone'
import {
    agendarLembreteQStash,
    cancelarLembreteQStash,
    registrarDisparo,
} from '@/lib/whatsapp-helper'
import { obterSlotsDisponiveis } from '@/lib/booking-engine'
import { dispararNotificacoesAgendamento } from '@/lib/notificacoes-agendamento'
import { PLANOS } from '@/lib/planos'
import { obterPlanoVigentePublico } from '@/lib/assinaturas'
import { capturarEventoTenant } from '@/lib/analytics/server'

interface ListarParams {
    dataFiltro?: string // YYYY-MM-DD (um único dia)
    periodo?: { inicio: string; fim: string } // YYYY-MM-DD inclusivos, no fuso local
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
        .select(
            `
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
        `,
        )
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
    status: 'confirmado' | 'concluido' | 'cancelado',
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
            updated_at: new Date().toISOString(),
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
                    status: 'cancelado',
                })
            }
        } catch (err) {
            console.error('Falha ao cancelar lembrete no QStash (ignorada):', err)
        }
    }

    // Funil: é o único evento que mede taxa de cancelamento e se o
    // profissional de fato fecha o ciclo marcando "concluído" — sinal de uso
    // real do dashboard. `status` é enum do banco, nunca PII.
    try {
        capturarEventoTenant('booking_status_changed', orgId, { status })
    } catch (analyticsErr) {
        console.error('[analytics] booking_status_changed não capturado (ignorado):', analyticsErr)
    }

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

/** Detalhe mínimo do agendamento que ocupa um horário — só do PRÓPRIO tenant. */
interface ConflitoWalkin {
    cliente?: string
    servico?: string
    horario: string
}

/**
 * Busca o agendamento ativo do próprio tenant que se sobrepõe ao intervalo
 * [inicio, fim) tentado. Legítimo devolver o detalhe no walk-in: é a agenda do
 * próprio profissional e o SELECT já é escopado ao tenant pelo RLS authenticated.
 * NUNCA devolve a error.message crua do Postgres — só cliente/serviço/horário.
 * `ignorarId` exclui o próprio agendamento na remarcação (o registro sendo movido
 * ainda tem o horário antigo e não pode ser reportado como conflito de si mesmo).
 */
async function buscarConflitoWalkin(
    supabase: Awaited<ReturnType<typeof createClient>>,
    orgId: string,
    inicioTentado: string,
    fimTentado: string,
    ignorarId?: string,
): Promise<ConflitoWalkin | null> {
    let query = supabase
        .from('agendamentos')
        .select('data_hora, data_hora_fim, clientes(nome), servicos(nome)')
        .eq('tenant_id', orgId)
        .neq('status', 'cancelado')
        // Sobreposição de período: início do outro < fim tentado E fim do outro > início tentado.
        .lt('data_hora', fimTentado)
        .gt('data_hora_fim', inicioTentado)

    if (ignorarId) {
        query = query.neq('id', ignorarId)
    }

    const { data: conflito } = await query.maybeSingle()

    if (!conflito) return null

    const cliente = Array.isArray(conflito.clientes) ? conflito.clientes[0] : conflito.clientes
    const servico = Array.isArray(conflito.servicos) ? conflito.servicos[0] : conflito.servicos

    return {
        cliente: cliente?.nome,
        servico: servico?.nome,
        horario: conflito.data_hora,
    }
}

/**
 * Slots livres para o agendamento manual no dashboard. Mesma engine do fluxo
 * público; `ignorarAgendamentoId` permite remarcar sem colidir consigo mesmo.
 */
export async function obterSlotsDashboard(
    dateStr: string,
    duracaoMinutos: number,
    ignorarAgendamentoId?: string,
) {
    const { orgId } = await auth()
    if (!orgId) {
        throw new Error('Não autorizado. Nenhuma organização ativa.')
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        throw new Error('Data inválida.')
    }

    // A simetria com o fluxo PÚBLICO é o ponto desta validação, não um detalhe:
    // `duracaoMinutos` alimenta a mesma condição de parada do mesmo laço síncrono
    // (`gerarSlotsAntiBuraco`, em `src/lib/booking-engine.ts`), e foi o contraste
    // entre os dois fluxos — este aqui validava `dateStr`, o anônimo não validava
    // nada — que mostrou que a ausência lá era acidente, não decisão. Aqui a
    // severidade é menor porque exige sessão de profissional, mas a assimetria
    // ao contrário (o autenticado validando MENOS que o público) seria a mesma
    // inversão do modelo de confiança, só que espelhada.
    //
    // Recusa no estilo que esta função já pratica (`throw`), de propósito: o
    // dashboard tem sessão, tela e error boundary próprio, e introduzir aqui um
    // segundo formato de retorno é outro assunto.
    if (!Number.isInteger(duracaoMinutos) || duracaoMinutos <= 0 || duracaoMinutos > 24 * 60) {
        throw new Error('Duração de serviço inválida.')
    }

    const supabase = await createClient()
    const timezone = await timezoneDoTenant(supabase, orgId)

    return obterSlotsDisponiveis({
        tenantId: orgId,
        dateStr,
        duracaoServicoMinutos: duracaoMinutos,
        supabase,
        timezone,
        ignorarAgendamentoId,
    })
}

interface CriarAgendamentoManualParams {
    servicoId: string
    dataHora: string // ISO string em UTC (datetime exato do slot)
    clienteId?: string
    clienteNome?: string
    clienteTelefone?: string
    enviarWhatsApp?: boolean
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
    enviarWhatsApp,
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

        // Reaproveitar ou criar o cliente ATOMICAMENTE (D-01, AGE-05): o antigo
        // select-then-insert tinha uma janela de corrida (dois walk-ins
        // simultâneos com o mesmo telefone liam "não existe" e inseriam duas
        // linhas — e agora o unique (tenant_id, telefone) faria o segundo INSERT
        // falhar com 23505). A RPC faz INSERT ... ON CONFLICT DO UPDATE com
        // COALESCE (cria se não existe, senão só completa o que falta) numa única
        // ida ao banco. Roda como SECURITY INVOKER: respeita o RLS do
        // authenticated (o profissional só escreve no próprio tenant).
        const { data: clienteRpcId, error: rpcError } = await supabase.rpc(
            'reaproveitar_ou_criar_cliente',
            {
                p_tenant_id: orgId,
                p_telefone: telefoneLimpo,
                p_nome: clienteNome!.trim(),
                p_email: null,
            },
        )

        if (rpcError || !clienteRpcId) {
            console.error(
                'Erro ao reaproveitar/criar cliente no agendamento manual:',
                rpcError?.message,
            )
            throw new Error('Erro ao cadastrar o cliente.')
        }

        // A RPC devolve só o id; reler nome/telefone para as notificações.
        const { data: cliente, error: cError } = await supabase
            .from('clientes')
            .select('id, nome, telefone')
            .eq('id', clienteRpcId)
            .eq('tenant_id', orgId)
            .maybeSingle()

        if (cError || !cliente) {
            console.error('Erro ao reler cliente após RPC no agendamento manual:', cError?.message)
            throw new Error('Erro ao cadastrar o cliente.')
        }
        clienteFinal = cliente
    }

    // 3. Revalidar o slot contra double-booking (mesma engine do fluxo público).
    const dateStr = diaLocal(dataObj, timezone)
    const slotsLivres = await obterSlotsDisponiveis({
        tenantId: orgId,
        dateStr,
        duracaoServicoMinutos: servico.duracao_minutos,
        supabase,
        timezone,
    })

    // `data_hora_fim` é gravado no ato da reserva (D-02): é dele que a engine
    // deriva a ocupação e é ele que a exclusion constraint compara. Editar a
    // duração do serviço depois NÃO move o término já marcado.
    const dataHoraFim = new Date(dataObj.getTime() + servico.duracao_minutos * 60_000).toISOString()

    if (!slotsLivres.some((sl) => sl.datetime === dataHora)) {
        // TOCTOU: a engine deixou de oferecer o slot entre a leitura e agora.
        // Unifica a UX com a perda de corrida (mesmo motivo, mesmo detalhe do
        // próprio tenant), em vez do throw antigo — o modal já não casa string.
        const conflito = await buscarConflitoWalkin(supabase, orgId, dataHora, dataHoraFim)
        return { ok: false as const, motivo: 'slot_ocupado' as const, conflito }
    }

    // 4. Inserir o agendamento (manual nasce confirmado).
    const { data: agendamento, error: agError } = await supabase
        .from('agendamentos')
        .insert({
            tenant_id: orgId,
            cliente_id: clienteFinal.id,
            servico_id: servicoId,
            data_hora: dataHora,
            data_hora_fim: dataHoraFim,
            status: 'confirmado',
        })
        .select('id, data_hora, status')
        .single()

    // Perda de corrida (D-04, AGE-04): a exclusion constraint `ag_sem_sobreposicao`
    // fechou o TOCTOU que a revalidação da engine deixa aberto. `23P01` =
    // exclusion_violation (SQLSTATE, estável; nunca comparar a .message, que embute
    // org_id e horário). É condição ESPERADA e NUNCA vai ao Sentry — reportar perda
    // de corrida inundaria o Sentry. Como o walk-in é authenticated (RLS por
    // tenant_id), é legítimo devolver o detalhe do conflitante do próprio tenant.
    if (agError?.code === '23P01') {
        const conflito = await buscarConflitoWalkin(supabase, orgId, dataHora, dataHoraFim)
        return { ok: false as const, motivo: 'slot_ocupado' as const, conflito }
    }

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
            timezone,
        })
    }

    // Funil: agendamento criado pelo PROFISSIONAL, o contraponto B2B do
    // `booking_completed` público. `registro_cliente` responde se ele escolhe
    // da lista ou digita na hora — nome e telefone nunca entram.
    try {
        capturarEventoTenant('manual_booking_created', orgId, {
            servico_duracao_minutos: servico.duracao_minutos,
            whatsapp_solicitado: Boolean(enviarWhatsApp),
            registro_cliente: clienteId ? 'existente' : 'novo_ou_reaproveitado',
        })
    } catch (analyticsErr) {
        console.error('[analytics] manual_booking_created não capturado (ignorado):', analyticsErr)
    }

    revalidatePath('/dashboard')

    return { ok: true as const, agendamento }
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
        .select('id, status, data_hora, data_hora_fim')
        .eq('id', id)
        .eq('tenant_id', orgId)
        .maybeSingle()

    if (aError || !agendamento) {
        throw new Error('Agendamento não encontrado.')
    }

    if (agendamento.status === 'cancelado' || agendamento.status === 'concluido') {
        throw new Error('Este agendamento não pode mais ser remarcado.')
    }

    // D-03: remarcar é o MESMO agendamento em outro horário — o tamanho reservado
    // não muda. A duração vem do intervalo ORIGINAL (data_hora_fim − data_hora), não
    // da duração VIGENTE do serviço (que pode ter sido editada depois, reabrindo o
    // bug que esta fase fecha). O novo término preserva esse intervalo.
    const inicioOriginal = new Date(agendamento.data_hora).getTime()
    const fimOriginal = new Date(agendamento.data_hora_fim).getTime()
    const duracaoOriginalMs = fimOriginal - inicioOriginal
    const duracaoMinutos = Math.round(duracaoOriginalMs / 60_000)
    const novoDataHoraFim = new Date(dataObj.getTime() + duracaoOriginalMs).toISOString()

    const dateStr = diaLocal(dataObj, timezone)
    const slotsLivres = await obterSlotsDisponiveis({
        tenantId: orgId,
        dateStr,
        duracaoServicoMinutos: duracaoMinutos,
        supabase,
        timezone,
        ignorarAgendamentoId: id,
    })

    if (!slotsLivres.some((sl) => sl.datetime === novaDataHora)) {
        // TOCTOU: unifica a UX com a perda de corrida (mesmo motivo/detalhe do
        // próprio tenant), consistente com criarAgendamentoManual. O modal já não
        // casa string de erro. Exclui o próprio agendamento da busca do conflitante.
        const conflito = await buscarConflitoWalkin(
            supabase,
            orgId,
            novaDataHora,
            novoDataHoraFim,
            id,
        )
        return { ok: false as const, motivo: 'slot_ocupado' as const, conflito }
    }

    const { data, error } = await supabase
        .from('agendamentos')
        .update({
            data_hora: novaDataHora,
            data_hora_fim: novoDataHoraFim,
            updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('tenant_id', orgId)
        .select('id, data_hora, status')
        .single()

    // Perda de corrida no UPDATE (D-03): a exclusion constraint recusou o novo
    // período com `23P01`. Condição ESPERADA — mesmo retorno discriminado da
    // criação, sem reportarExcecao. Exclui o próprio agendamento na busca.
    if (error?.code === '23P01') {
        const conflito = await buscarConflitoWalkin(
            supabase,
            orgId,
            novaDataHora,
            novoDataHoraFim,
            id,
        )
        return { ok: false as const, motivo: 'slot_ocupado' as const, conflito }
    }

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
                motivo: 'remarcacao',
            })

            const { data: config } = await supabase
                .from('whatsapp_configs')
                .select('status, instance_token, tempo_lembrete_minutos')
                .eq('tenant_id', orgId)
                .maybeSingle()

            // Caminho B2B autenticado: o profissional está na tela e o plano
            // indeterminado apenas deixa de reagendar o lembrete desta
            // remarcação. A falha já foi reportada dentro da função.
            const { plano } = await obterPlanoVigentePublico(supabase, orgId)
            const whatsappAtivo =
                config &&
                PLANOS[plano].recursos.whatsapp &&
                config.status === 'conectado' &&
                config.instance_token

            if (whatsappAtivo) {
                const targetTime = dataObj.getTime() - config.tempo_lembrete_minutos * 60 * 1000
                if (targetTime > Date.now()) {
                    const agendado = await agendarLembreteQStash(id, orgId, targetTime)
                    if (agendado.ok) {
                        await registrarDisparo(supabase, {
                            tenantId: orgId,
                            agendamentoId: id,
                            tipo: 'lembrete',
                            status: 'agendado',
                            qstashMessageId: agendado.messageId,
                        })
                    } else {
                        await registrarDisparo(supabase, {
                            tenantId: orgId,
                            agendamentoId: id,
                            tipo: 'lembrete',
                            status: 'falha',
                            motivo: agendado.motivo,
                        })
                    }
                }
            }
        }
    } catch (err) {
        console.error('Falha ao realinhar lembrete na remarcação (ignorada):', err)
    }

    // Funil: remarcação é retrabalho do profissional — volume alto aqui é
    // sinal de agenda mal configurada, não de uso saudável.
    try {
        capturarEventoTenant('booking_rescheduled', orgId, {
            servico_duracao_minutos: duracaoMinutos,
        })
    } catch (analyticsErr) {
        console.error('[analytics] booking_rescheduled não capturado (ignorado):', analyticsErr)
    }

    revalidatePath('/dashboard')

    return { ok: true as const, agendamento: data }
}
