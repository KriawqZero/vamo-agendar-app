import { createClient } from '@/lib/supabase/server'

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080'
const QSTASH_TOKEN = process.env.QSTASH_TOKEN
const QSTASH_URL = process.env.QSTASH_URL || 'https://qstash-us-east-1.upstash.io'
const APP_URL = process.env.APP_URL || 'https://vamoagendar.com.br'

interface SubstituicaoParams {
    template: string;
    clienteNome: string;
    empresaNome: string;
    dataHoraStr: string; // Ex: "05/07/2026 às 14:00"
}

/**
 * Substitui as chaves dinâmicas no template da mensagem.
 */
export function processarMensagemTemplate({
    template,
    clienteNome,
    empresaNome,
    dataHoraStr
}: SubstituicaoParams): string {
    const [dataPart, horaPart] = dataHoraStr.split(' às ')

    return template
        .replace(/{{cliente}}/g, clienteNome)
        .replace(/{{empresa}}/g, empresaNome)
        .replace(/{{data_hora}}/g, dataHoraStr)
        .replace(/{{data}}/g, dataPart || '')
        .replace(/{{hora}}/g, horaPart || '')
}

/**
 * Envia uma mensagem de texto simples usando a Evolution API.
 */
export async function enviarMensagemWhatsApp(
    instanceName: string,
    instanceToken: string,
    telefone: string,
    texto: string
) {
    const telefoneLimpo = telefone.replace(/\D/g, '')
    // Garante que o telefone tenha o código do país (55 para Brasil)
    const destinatario = telefoneLimpo.startsWith('55') ? telefoneLimpo : `55${telefoneLimpo}`

    try {
        const response = await fetch(`${EVOLUTION_API_URL}/message/sendText/${instanceName}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': instanceToken
            },
            body: JSON.stringify({
                number: destinatario,
                text: texto
            })
        })

        if (!response.ok) {
            console.error(`Erro ao disparar WhatsApp via Evolution (${response.status}):`, await response.text())
            return false
        }

        return true
    } catch (err) {
        console.error('Falha de rede ao chamar Evolution API:', err)
        return false
    }
}

/**
 * Agenda o lembrete futuro utilizando o Upstash QStash.
 */
export async function agendarLembreteQStash(
    agendamentoId: string,
    tenantId: string,
    targetTimestampMs: number
) {
    if (!QSTASH_TOKEN) {
        console.warn('QSTASH_TOKEN não configurado. Lembrete em background não será agendado.')
        return false
    }

    const scheduledSeconds = Math.floor(targetTimestampMs / 1000)

    try {
        const secret = process.env.QSTASH_CURRENT_SIGNING_KEY || 'secret-key'
        const webhookUrl = `${APP_URL}/api/webhooks/lembrete?secret=${secret}`
        const publishUrl = `${QSTASH_URL}/v2/publish/${webhookUrl}`

        const response = await fetch(publishUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${QSTASH_TOKEN}`,
                'Content-Type': 'application/json',
                'Upstash-Not-Before': String(scheduledSeconds)
            },
            body: JSON.stringify({
                agendamentoId,
                tenantId
            })
        })

        if (!response.ok) {
            console.error(`Falha ao registrar agendamento no QStash (${response.status}):`, await response.text())
            return false
        }

        return true
    } catch (err) {
        console.error('Erro de conexão ao agendar job no QStash:', err)
        return false
    }
}
