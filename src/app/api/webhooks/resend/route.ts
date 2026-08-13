import { NextRequest, NextResponse } from 'next/server'
import { Resend, type WebhookEventPayload } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashTenantId } from '@/lib/analytics/tenant'
import {
    reportarExcecaoAguardando,
    reportarFalhaSilenciosaAguardando,
} from '@/lib/observabilidade/reportar'

/**
 * Eventos que sinalizam dano à reputação do domínio remetente (EML-06).
 *
 * Os literais vêm do union `WebhookEvent` do SDK — não são inventados. A fase
 * nasceu escutando `suppression.added`, que o Resend NUNCA envia: o evento real
 * de supressão é `email.suppressed`. Como o handler não tipava o retorno de
 * `verify()`, nem o compilador nem os testes (cujo mock fabricava o tipo
 * inexistente) pegaram o branch morto. Daí a lista ser derivada do tipo do SDK:
 * um nome errado aqui vira erro de compilação, não silêncio em produção.
 */
const EVENTOS_DE_REPUTACAO = [
    'email.suppressed',
    'email.bounced',
    'email.complained',
] as const satisfies readonly WebhookEventPayload['type'][]

type EventoDeReputacao = Extract<
    WebhookEventPayload,
    { type: (typeof EVENTOS_DE_REPUTACAO)[number] }
>

function ehEventoDeReputacao(evento: WebhookEventPayload): evento is EventoDeReputacao {
    return (EVENTOS_DE_REPUTACAO as readonly string[]).includes(evento.type)
}

export async function POST(req: NextRequest) {
    const svixId = req.headers.get('svix-id') || req.headers.get('webhook-id')
    const svixTimestamp = req.headers.get('svix-timestamp') || req.headers.get('webhook-timestamp')
    const svixSignature = req.headers.get('svix-signature') || req.headers.get('webhook-signature')

    if (!svixId || !svixTimestamp || !svixSignature) {
        return NextResponse.json(
            { erro: 'Headers de verificação de webhook ausentes' },
            { status: 401 },
        )
    }

    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim()
    if (!webhookSecret) {
        // Recusar em silêncio aqui é como o canal de reputação morre sem ninguém
        // ver: o Resend retenta, desiste e desabilita o endpoint. Em produção o
        // fail-fast de env.ts já derruba o boot antes disso; este reporte cobre
        // o resto (preview, deploy parcial) para o 503 nunca ser mudo.
        await reportarFalhaSilenciosaAguardando('resend:webhook_secret_ausente')
        return NextResponse.json({ erro: 'RESEND_WEBHOOK_SECRET não configurado' }, { status: 503 })
    }

    let rawBody: string
    try {
        rawBody = await req.text()
    } catch {
        return NextResponse.json({ erro: 'Erro ao ler corpo da requisição' }, { status: 400 })
    }

    // `verify()` já devolve WebhookEventPayload tipado. Sem cast: era o cast
    // (`as unknown as`) que descartava o union e deixava passar o tipo de evento
    // inexistente. Assinatura inválida lança — fail-closed, como deve ser.
    let evento: WebhookEventPayload
    try {
        const resend = new Resend(process.env.RESEND_API_KEY || 're_dummy')
        evento = resend.webhooks.verify({
            payload: rawBody,
            webhookSecret,
            headers: {
                id: svixId,
                timestamp: svixTimestamp,
                signature: svixSignature,
            },
        })
    } catch {
        return NextResponse.json({ erro: 'Assinatura de webhook inválida' }, { status: 401 })
    }

    if (!ehEventoDeReputacao(evento)) {
        return NextResponse.json({ ok: true, processado: false }, { status: 200 })
    }

    const resendId = evento.data.email_id
    if (!resendId) {
        return NextResponse.json({ ok: true, processado: false }, { status: 200 })
    }

    const supabase = createAdminClient()
    const { data: logEntry, error } = await supabase
        .from('tb_email_log')
        .select('tenant_id')
        .eq('resend_id', resendId)
        .maybeSingle()

    if (error) {
        // Sem isto, banco fora do ar devolvia 200 e o evento sumia para sempre:
        // o Resend só reenvia diante de erro, e o log já foi consumido. 500 faz
        // o provedor retentar; o reporte dá ao owner a chance de agir antes.
        await reportarExcecaoAguardando(new Error('resend:consulta_email_log_falhou'), {
            tipoEvento: evento.type,
        })
        return NextResponse.json({ erro: 'Falha ao consultar log de e-mail' }, { status: 500 })
    }

    if (logEntry?.tenant_id) {
        // NUNCA-PII: só o rótulo sintético e o hash pseudonimizado do tenant vão
        // para a telemetria — nunca o endereço, que é o dado central do evento.
        // Rótulo único para os três tipos (o tipo real viaja no contexto): manter
        // a mensagem estática é o que impede o agrupamento de estilhaçar.
        await reportarExcecaoAguardando(new Error('resend:evento_de_reputacao'), {
            tenantHash: hashTenantId(logEntry.tenant_id),
            tipoEvento: evento.type,
        })
    }

    return NextResponse.json({ ok: true }, { status: 200 })
}
