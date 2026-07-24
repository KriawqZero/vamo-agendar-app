import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
    processarMensagemTemplate,
    enviarMensagemWhatsApp,
    registrarDisparo,
} from '@/lib/whatsapp-helper'
import { formatarDataHora, TIMEZONE_PADRAO } from '@/lib/timezone'
import { PLANOS } from '@/lib/planos'
import { obterPlanoVigentePublico } from '@/lib/assinaturas'
import { capturarEventoTenant } from '@/lib/analytics/server'
import { reportarExcecaoAguardando, reportarFalhaSilenciosaAguardando } from '@/lib/observabilidade/reportar'
import { verificarAssinaturaQstash } from '@/lib/qstash-assinatura'
import { logOperacional } from '@/lib/observabilidade/log'
import { hashTenantId, hashAgendamentoId } from '@/lib/observabilidade/hash'

export async function POST(req: NextRequest) {
    try {
        logOperacional.info('qstash.webhook.recebido', { fluxo: 'webhook_lembrete' })

        // 1. Autenticar pela assinatura criptográfica do QStash.
        const assinatura = req.headers.get('upstash-signature')
        const corpoCru = await req.text()

        const autenticado = await verificarAssinaturaQstash({
            assinatura,
            corpoCru,
            url: req.url,
        })

        if (!autenticado) {
            console.warn('Tentativa de acesso não autorizada ao webhook de lembrete.')
            logOperacional.warn('qstash.webhook.assinatura_invalida', { fluxo: 'webhook_lembrete' })
            return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
        }

        // 2. Extrair payload enviado pelo QStash — só DEPOIS de autenticado.
        const { agendamentoId, tenantId } = JSON.parse(corpoCru)

        if (!agendamentoId || !tenantId) {
            logOperacional.warn('qstash.webhook.payload_incompleto', { fluxo: 'webhook_lembrete' })
            return NextResponse.json({ error: 'Payload incompleto.' }, { status: 400 })
        }

        const tenantHash = hashTenantId(tenantId)
        const agendamentoHash = hashAgendamentoId(agendamentoId)
        const contextoMeta = {
            fluxo: 'webhook_lembrete',
            tenantHash,
            agendamentoHash,
        }

        logOperacional.info('qstash.webhook.payload_validado', contextoMeta)

        // 3. Cliente PRIVILEGIADO (secret key)
        const supabase = createAdminClient()

        // 4. Buscar informações do agendamento, do cliente e do serviço
        const { data: agendamento, error: agError } = await supabase
            .from('agendamentos')
            .select(
                `
                id,
                data_hora,
                status,
                clientes (
                    nome,
                    telefone
                ),
                servicos (
                    nome
                )
            `,
            )
            .eq('id', agendamentoId)
            .eq('tenant_id', tenantId)
            .maybeSingle()

        if (agError || !agendamento) {
            console.warn(`Agendamento ${agendamentoId} não encontrado para envio de lembrete.`)
            logOperacional.warn('qstash.webhook.agendamento_nao_encontrado', contextoMeta)
            return NextResponse.json({ error: 'Agendamento não encontrado.' }, { status: 404 })
        }

        // Se o agendamento foi cancelado, abortamos o envio sem disparar erro
        if (agendamento.status === 'cancelado') {
            console.log(
                `Lembrete ignorado. Agendamento ${agendamentoId} está com status cancelado.`,
            )
            logOperacional.info('qstash.webhook.agendamento_cancelado', contextoMeta)
            await registrarDisparo(supabase, {
                tenantId,
                agendamentoId,
                tipo: 'lembrete',
                status: 'ignorado',
                motivo: 'agendamento_cancelado',
            })
            return NextResponse.json({
                success: true,
                message: 'Agendamento cancelado. Lembrete ignorado.',
            })
        }

        // Checagem de plano
        const { plano, degradadoPorErro } = await obterPlanoVigentePublico(supabase, tenantId)

        if (degradadoPorErro) {
            console.error(
                `Plano indeterminado para o tenant ${tenantId}: leitura de assinaturas falhou. Devolvendo 500 para retry do QStash.`,
            )
            logOperacional.error('qstash.webhook.plano_indeterminado', contextoMeta)
            await registrarDisparo(supabase, {
                tenantId,
                agendamentoId,
                tipo: 'lembrete',
                status: 'falha',
                motivo: 'plano_indeterminado',
            })
            await reportarExcecaoAguardando(new Error('lembrete:plano_indeterminado'), {
                ...contextoMeta,
                etapa: 'gating_plano',
            })
            return NextResponse.json({ error: 'Plano indeterminado.' }, { status: 500 })
        }

        if (!PLANOS[plano].recursos.whatsapp) {
            console.log(
                `Lembrete ignorado. Tenant ${tenantId} não possui WhatsApp no plano vigente.`,
            )
            logOperacional.info('qstash.webhook.plano_sem_whatsapp', contextoMeta)
            await registrarDisparo(supabase, {
                tenantId,
                agendamentoId,
                tipo: 'lembrete',
                status: 'ignorado',
                motivo: 'plano_sem_whatsapp',
            })
            return NextResponse.json({
                success: true,
                message: 'Plano sem WhatsApp. Lembrete ignorado.',
            })
        }

        const clienteObj = Array.isArray(agendamento.clientes)
            ? agendamento.clientes[0]
            : agendamento.clientes

        if (!clienteObj || !clienteObj.telefone) {
            console.warn(`Lembrete ignorado. Cliente associado sem dados de contato.`)
            logOperacional.warn('qstash.webhook.cliente_sem_contato', contextoMeta)
            return NextResponse.json(
                { error: 'Telefone do cliente não encontrado.' },
                { status: 400 },
            )
        }

        // 5. Buscar perfil do estabelecimento e configurações do WhatsApp
        const { data: perfil } = await supabase
            .from('perfis_empresas')
            .select('nome_estabelecimento, timezone')
            .eq('tenant_id', tenantId)
            .maybeSingle()

        const { data: config } = await supabase
            .from('whatsapp_configs')
            .select('*')
            .eq('tenant_id', tenantId)
            .maybeSingle()

        if (!config || config.status !== 'conectado' || !config.instance_token) {
            console.log(`WhatsApp desconectado ou não configurado para o tenant ${tenantId}.`)
            logOperacional.warn('whatsapp.lembrete.desconectado', contextoMeta)
            await reportarFalhaSilenciosaAguardando('whatsapp:desconectado_ao_lembrar', contextoMeta)
            await registrarDisparo(supabase, {
                tenantId,
                agendamentoId,
                tipo: 'lembrete',
                status: 'ignorado',
                motivo: 'whatsapp_desconectado',
            })
            return NextResponse.json({
                success: true,
                message: 'Notificações de WhatsApp inativas para o tenant.',
            })
        }

        // 6. Formatar data e hora no fuso do estabelecimento
        const dataHoraStr = formatarDataHora(
            agendamento.data_hora,
            perfil?.timezone || TIMEZONE_PADRAO,
        )

        // 7. Substituir variáveis e disparar lembrete via WhatsApp
        const textoLembrete = processarMensagemTemplate({
            template: config.mensagem_lembrete,
            clienteNome: clienteObj.nome,
            empresaNome: perfil?.nome_estabelecimento || 'Estabelecimento',
            dataHoraStr,
        })

        const enviado = await enviarMensagemWhatsApp(
            config.instance_name,
            config.instance_token,
            clienteObj.telefone,
            textoLembrete,
            contextoMeta,
        )

        if (!enviado.ok) {
            logOperacional.error('whatsapp.lembrete.falha', {
                ...contextoMeta,
                motivo: enviado.motivo,
            })
            await registrarDisparo(supabase, {
                tenantId,
                agendamentoId,
                tipo: 'lembrete',
                status: 'falha',
                motivo: enviado.motivo,
            })
            capturarEventoTenant('whatsapp_reminder_failed', tenantId, {
                motivo: enviado.motivo ?? null,
            })
            await reportarFalhaSilenciosaAguardando('whatsapp:evolution_http_error', {
                ...contextoMeta,
                motivo: enviado.motivo,
            })
            return NextResponse.json({ error: 'Falha no disparo do WhatsApp.' }, { status: 500 })
        }

        logOperacional.info('whatsapp.lembrete.enviado', contextoMeta)
        await registrarDisparo(supabase, {
            tenantId,
            agendamentoId,
            tipo: 'lembrete',
            status: 'executado',
        })
        capturarEventoTenant('whatsapp_reminder_sent', tenantId)

        return NextResponse.json({ success: true, message: 'Lembrete enviado com sucesso.' })
    } catch (err) {
        console.error('Erro ao processar webhook de lembrete:', err)
        logOperacional.error('qstash.webhook.excecao', { fluxo: 'webhook_lembrete' })
        await reportarExcecaoAguardando(err, { fluxo: 'webhook_lembrete' })
        return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
    }
}
