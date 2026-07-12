'use server'

import { headers } from 'next/headers'
import type { ResultadoAcaoDebug } from '@/app/debug/qstash/types'

// Defaults idênticos aos de src/lib/whatsapp-helper.ts: o debug deve
// reproduzir exatamente o comportamento do código de produção.
const QSTASH_URL = process.env.QSTASH_URL || 'https://qstash-us-east-1.upstash.io'
const APP_URL = process.env.APP_URL || 'https://vamoagendar.com.br'
const WEBHOOK_SECRET = process.env.QSTASH_CURRENT_SIGNING_KEY || 'secret-key'

function garantirDebugAtivo() {
    if (process.env.DEBUG_QSTASH !== '1') {
        throw new Error('Debug do QStash desativado. Defina DEBUG_QSTASH=1 no ambiente.')
    }
}

/**
 * Chama o webhook de lembrete diretamente na própria instância (sem QStash),
 * para testar a lógica do webhook isolada — funciona em localhost.
 */
export async function dispararLembreteAgora(
    agendamentoId: string,
    tenantId: string
): Promise<ResultadoAcaoDebug> {
    garantirDebugAtivo()

    const h = await headers()
    const host = h.get('host') ?? 'localhost:3000'
    const proto = h.get('x-forwarded-proto') ?? 'http'
    const url = `${proto}://${host}/api/webhooks/lembrete?secret=${WEBHOOK_SECRET}`

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agendamentoId, tenantId }),
            cache: 'no-store'
        })
        const corpo = await response.text()
        return {
            ok: response.ok,
            status: response.status,
            corpo,
            mensagem: response.ok
                ? 'Webhook executado diretamente (sem QStash).'
                : 'Webhook retornou erro — veja o corpo da resposta.'
        }
    } catch (err) {
        return {
            ok: false,
            mensagem: `Falha de rede ao chamar o webhook: ${err instanceof Error ? err.message : String(err)}`
        }
    }
}

/**
 * Publica uma mensagem de teste no QStash com entrega em ~60s, replicando o
 * publish de agendarLembreteQStash mas capturando a resposta completa.
 * Só faz sentido quando APP_URL é alcançável publicamente.
 */
export async function publicarTesteQStash(
    agendamentoId: string,
    tenantId: string
): Promise<ResultadoAcaoDebug> {
    garantirDebugAtivo()

    const token = process.env.QSTASH_TOKEN
    if (!token) {
        return { ok: false, mensagem: 'QSTASH_TOKEN não configurado no ambiente.' }
    }

    const webhookUrl = `${APP_URL}/api/webhooks/lembrete?secret=${WEBHOOK_SECRET}`
    const notBefore = Math.floor((Date.now() + 60_000) / 1000)

    try {
        const response = await fetch(`${QSTASH_URL}/v2/publish/${webhookUrl}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Upstash-Not-Before': String(notBefore)
            },
            body: JSON.stringify({ agendamentoId, tenantId }),
            cache: 'no-store'
        })
        const corpo = await response.text()
        return {
            ok: response.ok,
            status: response.status,
            corpo,
            mensagem: response.ok
                ? `Publicado no QStash — entrega prevista em ~60s para ${APP_URL}. Use o refresh para acompanhar.`
                : 'QStash rejeitou o publish — veja o corpo da resposta.'
        }
    } catch (err) {
        return {
            ok: false,
            mensagem: `Falha de rede ao publicar no QStash: ${err instanceof Error ? err.message : String(err)}`
        }
    }
}
