import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { processarMensagemTemplate, enviarMensagemWhatsApp } from '@/lib/whatsapp-helper'
import { PLANOS } from '@/lib/planos'
import { obterAssinaturaVigente } from '@/lib/assinaturas'

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

        // 3. Criar client do Supabase (ignora RLS local porque é um job interno executado em servidor)
        // Usaremos o client padrão do server.ts
        const supabase = await createClient()

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
            return NextResponse.json({ success: true, message: 'Agendamento cancelado. Lembrete ignorado.' })
        }

        // Tenant rebaixado após agendar: lembrete não é mais um recurso do plano dele
        const { plano } = await obterAssinaturaVigente(supabase, tenantId)
        if (!PLANOS[plano].recursos.whatsapp) {
            console.log(`Lembrete ignorado. Tenant ${tenantId} não possui WhatsApp no plano vigente.`)
            return NextResponse.json({ success: true, message: 'Plano sem WhatsApp. Lembrete ignorado.' })
        }

        // Coagir relações retornadas como possivelmente arrays pelo Supabase Client
        const clienteObj = Array.isArray(agendamento.clientes) ? agendamento.clientes[0] : agendamento.clientes
        const servicoObj = Array.isArray(agendamento.servicos) ? agendamento.servicos[0] : agendamento.servicos

        if (!clienteObj || !clienteObj.telefone) {
            console.warn(`Lembrete ignorado. Cliente associado sem dados de contato.`)
            return NextResponse.json({ error: 'Telefone do cliente não encontrado.' }, { status: 400 })
        }

        // 5. Buscar perfil do estabelecimento e configurações do WhatsApp
        const { data: perfil } = await supabase
            .from('perfis_empresas')
            .select('nome_estabelecimento')
            .eq('tenant_id', tenantId)
            .maybeSingle()

        const { data: config } = await supabase
            .from('whatsapp_configs')
            .select('*')
            .eq('tenant_id', tenantId)
            .maybeSingle()

        if (!config || config.status !== 'conectado' || !config.instance_token) {
            console.log(`WhatsApp desconectado ou não configurado para o tenant ${tenantId}.`)
            return NextResponse.json({ success: true, message: 'Notificações de WhatsApp inativas para o tenant.' })
        }

        // 6. Formatar data e hora local
        const dateObj = new Date(agendamento.data_hora)
        const datePart = dateObj.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
        const timePart = dateObj.toLocaleTimeString('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        })
        const dataHoraStr = `${datePart} às ${timePart}`

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

        if (!enviado) {
            return NextResponse.json({ error: 'Falha no disparo do WhatsApp.' }, { status: 500 })
        }

        return NextResponse.json({ success: true, message: 'Lembrete enviado com sucesso.' })

    } catch (err: any) {
        console.error('Erro ao processar webhook de lembrete:', err)
        return NextResponse.json({ error: err.message || 'Erro interno.' }, { status: 500 })
    }
}
