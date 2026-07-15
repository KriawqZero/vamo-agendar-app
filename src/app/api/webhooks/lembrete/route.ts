import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { processarMensagemTemplate, enviarMensagemWhatsApp, registrarDisparo } from '@/lib/whatsapp-helper'
import { formatarDataHora, TIMEZONE_PADRAO } from '@/lib/timezone'
import { PLANOS } from '@/lib/planos'
import { obterPlanoVigentePublico } from '@/lib/assinaturas'
import { capturarEventoTenant } from '@/lib/analytics/server'

export async function POST(req: NextRequest) {
    try {
        // 1. Validar Token/Assinatura do Webhook via Query Params
        const { searchParams } = new URL(req.url)
        const secret = searchParams.get('secret')
        const qstashSecret = process.env.QSTASH_CURRENT_SIGNING_KEY || 'secret-key'

        if (secret !== qstashSecret) {
            console.warn('Tentativa de acesso não autorizada ao webhook de lembrete.')
            return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
        }

        // 2. Extrair payload enviado pelo QStash
        const body = await req.json()
        const { agendamentoId, tenantId } = body

        if (!agendamentoId || !tenantId) {
            return NextResponse.json({ error: 'Payload incompleto.' }, { status: 400 })
        }

        // 3. Cliente PRIVILEGIADO (secret key): este webhook é um job interno sem
        // sessão — como anon, o RLS bloquearia whatsapp_configs (instance_token)
        // e clientes (telefone). A requisição já foi autenticada pelo secret acima.
        const supabase = createAdminClient()

        // 4. Buscar informações do agendamento, do cliente e do serviço
        const { data: agendamento, error: agError } = await supabase
            .from('agendamentos')
            .select(`
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
            `)
            .eq('id', agendamentoId)
            .eq('tenant_id', tenantId)
            .maybeSingle()

        if (agError || !agendamento) {
            console.warn(`Agendamento ${agendamentoId} não encontrado para envio de lembrete.`)
            return NextResponse.json({ error: 'Agendamento não encontrado.' }, { status: 404 })
        }

        // Se o agendamento foi cancelado, abortamos o envio sem disparar erro
        if (agendamento.status === 'cancelado') {
            console.log(`Lembrete ignorado. Agendamento ${agendamentoId} está com status cancelado.`)
            await registrarDisparo(supabase, {
                tenantId,
                agendamentoId,
                tipo: 'lembrete',
                status: 'ignorado',
                motivo: 'agendamento_cancelado'
            })
            return NextResponse.json({ success: true, message: 'Agendamento cancelado. Lembrete ignorado.' })
        }

        // Tenant rebaixado após agendar: lembrete não é mais um recurso do plano dele
        const plano = await obterPlanoVigentePublico(supabase, tenantId)
        if (!PLANOS[plano].recursos.whatsapp) {
            console.log(`Lembrete ignorado. Tenant ${tenantId} não possui WhatsApp no plano vigente.`)
            await registrarDisparo(supabase, {
                tenantId,
                agendamentoId,
                tipo: 'lembrete',
                status: 'ignorado',
                motivo: 'plano_sem_whatsapp'
            })
            return NextResponse.json({ success: true, message: 'Plano sem WhatsApp. Lembrete ignorado.' })
        }

        // Coagir relações retornadas como possivelmente arrays pelo Supabase Client
        const clienteObj = Array.isArray(agendamento.clientes) ? agendamento.clientes[0] : agendamento.clientes

        if (!clienteObj || !clienteObj.telefone) {
            console.warn(`Lembrete ignorado. Cliente associado sem dados de contato.`)
            return NextResponse.json({ error: 'Telefone do cliente não encontrado.' }, { status: 400 })
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
            await registrarDisparo(supabase, {
                tenantId,
                agendamentoId,
                tipo: 'lembrete',
                status: 'ignorado',
                motivo: 'whatsapp_desconectado'
            })
            return NextResponse.json({ success: true, message: 'Notificações de WhatsApp inativas para o tenant.' })
        }

        // 6. Formatar data e hora no fuso do estabelecimento
        const dataHoraStr = formatarDataHora(agendamento.data_hora, perfil?.timezone || TIMEZONE_PADRAO)

        // 7. Substituir variáveis e disparar lembrete via WhatsApp
        const textoLembrete = processarMensagemTemplate({
            template: config.mensagem_lembrete,
            clienteNome: clienteObj.nome,
            empresaNome: perfil?.nome_estabelecimento || 'Estabelecimento',
            dataHoraStr
        })

        const enviado = await enviarMensagemWhatsApp(
            config.instance_name,
            config.instance_token,
            clienteObj.telefone,
            textoLembrete
        )

        if (!enviado.ok) {
            // Mantém o HTTP 500 para que o QStash re-tente. Linhas duplicadas de
            // log entre tentativas são aceitáveis (log append-only de auditoria).
            await registrarDisparo(supabase, {
                tenantId,
                agendamentoId,
                tipo: 'lembrete',
                status: 'falha',
                motivo: enviado.motivo
            })
            // Analytics: espelho agregado do disparo (fonte da verdade é o Postgres).
            capturarEventoTenant('whatsapp_reminder_failed', tenantId, { motivo: enviado.motivo ?? null })
            return NextResponse.json({ error: 'Falha no disparo do WhatsApp.' }, { status: 500 })
        }

        await registrarDisparo(supabase, {
            tenantId,
            agendamentoId,
            tipo: 'lembrete',
            status: 'executado'
        })
        // Analytics: espelho agregado do disparo (fonte da verdade é o Postgres).
        capturarEventoTenant('whatsapp_reminder_sent', tenantId)

        return NextResponse.json({ success: true, message: 'Lembrete enviado com sucesso.' })

    } catch (err) {
        console.error('Erro ao processar webhook de lembrete:', err)
        return NextResponse.json({ error: err instanceof Error && err.message ? err.message : 'Erro interno.' }, { status: 500 })
    }
}
