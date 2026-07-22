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
import { reportarExcecaoAguardando } from '@/lib/observabilidade/reportar'
import { verificarAssinaturaQstash } from '@/lib/qstash-assinatura'

export async function POST(req: NextRequest) {
    try {
        // 1. Autenticar pela assinatura criptográfica do QStash.
        const assinatura = req.headers.get('upstash-signature')
        // O corpo só pode ser lido UMA vez, e a verificação exige o texto cru:
        // qualquer reserialização muda os bytes e invalida a assinatura.
        const corpoCru = await req.text()

        // `url: req.url` (e não uma constante montada de APP_URL): a claim `sub`
        // do JWT carrega a URL de publicação COM a query string, e os lembretes
        // já em voo foram publicados com `?secret=`. URL montada de constante
        // daria mismatch e mataria todos eles em silêncio.
        const autenticado = await verificarAssinaturaQstash({
            assinatura,
            corpoCru,
            url: req.url,
        })

        if (!autenticado) {
            console.warn('Tentativa de acesso não autorizada ao webhook de lembrete.')
            return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
        }

        // 2. Extrair payload enviado pelo QStash — só DEPOIS de autenticado:
        // corpo não verificado nunca é parseado.
        const { agendamentoId, tenantId } = JSON.parse(corpoCru)

        if (!agendamentoId || !tenantId) {
            return NextResponse.json({ error: 'Payload incompleto.' }, { status: 400 })
        }

        // 3. Cliente PRIVILEGIADO (secret key): este webhook é um job interno sem
        // sessão — como anon, o RLS bloquearia whatsapp_configs (instance_token)
        // e clientes (telefone). A requisição já foi autenticada pela assinatura
        // do QStash acima.
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
            return NextResponse.json({ error: 'Agendamento não encontrado.' }, { status: 404 })
        }

        // Se o agendamento foi cancelado, abortamos o envio sem disparar erro
        if (agendamento.status === 'cancelado') {
            console.log(
                `Lembrete ignorado. Agendamento ${agendamentoId} está com status cancelado.`,
            )
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

        // Tenant rebaixado após agendar: lembrete não é mais um recurso do plano dele
        const plano = await obterPlanoVigentePublico(supabase, tenantId)
        if (!PLANOS[plano].recursos.whatsapp) {
            console.log(
                `Lembrete ignorado. Tenant ${tenantId} não possui WhatsApp no plano vigente.`,
            )
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

        // Coagir relações retornadas como possivelmente arrays pelo Supabase Client
        const clienteObj = Array.isArray(agendamento.clientes)
            ? agendamento.clientes[0]
            : agendamento.clientes

        if (!clienteObj || !clienteObj.telefone) {
            console.warn(`Lembrete ignorado. Cliente associado sem dados de contato.`)
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
        )

        if (!enviado.ok) {
            // Mantém o HTTP 500 para que o QStash re-tente. Linhas duplicadas de
            // log entre tentativas são aceitáveis (log append-only de auditoria).
            await registrarDisparo(supabase, {
                tenantId,
                agendamentoId,
                tipo: 'lembrete',
                status: 'falha',
                motivo: enviado.motivo,
            })
            // Analytics: espelho agregado do disparo (fonte da verdade é o Postgres).
            capturarEventoTenant('whatsapp_reminder_failed', tenantId, {
                motivo: enviado.motivo ?? null,
            })
            return NextResponse.json({ error: 'Falha no disparo do WhatsApp.' }, { status: 500 })
        }

        await registrarDisparo(supabase, {
            tenantId,
            agendamentoId,
            tipo: 'lembrete',
            status: 'executado',
        })
        // Analytics: espelho agregado do disparo (fonte da verdade é o Postgres).
        capturarEventoTenant('whatsapp_reminder_sent', tenantId)

        return NextResponse.json({ success: true, message: 'Lembrete enviado com sucesso.' })
    } catch (err) {
        console.error('Erro ao processar webhook de lembrete:', err)
        // Devolve 500 ao QStash e o erro morre no console do Railway. Sem este
        // reporte, um lembrete que para de sair não tem detector — o cliente
        // final não reclama de mensagem que não chegou.
        //
        // AGUARDADO de propósito: a resposta vai embora na linha seguinte, e
        // reporte fire-and-forget se perde em runtime que congela após a
        // resposta. `flush` tem teto de 2s.
        await reportarExcecaoAguardando(err, { fluxo: 'webhook_lembrete' })
        // A mensagem interna (inclusive de erro do Supabase) NÃO volta ao
        // chamador: é a regra do projeto, e agora que o Sentry recebe o erro
        // não há mais nada que ela resolva aqui.
        return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
    }
}
