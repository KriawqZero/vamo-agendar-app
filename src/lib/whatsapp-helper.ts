import type { SupabaseClient } from '@supabase/supabase-js'

import { reportarFalhaSilenciosa } from './observabilidade/reportar'

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080'
const QSTASH_TOKEN = process.env.QSTASH_TOKEN
const QSTASH_URL = process.env.QSTASH_URL || 'https://qstash-us-east-1.upstash.io'
const APP_URL = process.env.APP_URL || 'https://vamoagendar.com.br'

interface SubstituicaoParams {
    template: string
    clienteNome: string
    empresaNome: string
    dataHoraStr: string // Ex: "05/07/2026 às 14:00"
}

/** Resultado padronizado de um disparo síncrono (envio de texto). */
export type ResultadoEnvio = { ok: true } | { ok: false; motivo: string }

/** Resultado do agendamento de um lembrete no QStash. */
export type ResultadoAgendamento = { ok: true; messageId: string } | { ok: false; motivo: string }

/**
 * Substitui as chaves dinâmicas no template da mensagem.
 */
export function processarMensagemTemplate({
    template,
    clienteNome,
    empresaNome,
    dataHoraStr,
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
 * Traduz o estado de conexão retornado pela Evolution API para o vocabulário
 * de status interno do VamoAgendar. Função pura (sem I/O) para ser testável.
 */
export function mapearEstadoEvolution(state: string | null | undefined): string {
    switch (state) {
        case 'open':
            return 'conectado'
        case 'connecting':
            return 'conectando'
        case 'close':
            return 'desconectado'
        default:
            // Estado ausente ou desconhecido: não conseguimos confirmar com o gateway.
            return 'instavel'
    }
}

/**
 * Envia uma mensagem de texto simples usando a Evolution API.
 * Retorna um resultado rico para permitir o registro do motivo da falha.
 */
export async function enviarMensagemWhatsApp(
    instanceName: string,
    instanceToken: string,
    telefone: string,
    texto: string,
): Promise<ResultadoEnvio> {
    const telefoneLimpo = telefone.replace(/\D/g, '')
    // Garante que o telefone tenha o código do país (55 para Brasil)
    const destinatario = telefoneLimpo.startsWith('55') ? telefoneLimpo : `55${telefoneLimpo}`

    try {
        const response = await fetch(`${EVOLUTION_API_URL}/message/sendText/${instanceName}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                apikey: instanceToken,
            },
            body: JSON.stringify({
                number: destinatario,
                text: texto,
            }),
        })

        if (!response.ok) {
            console.error(
                `Erro ao disparar WhatsApp via Evolution (${response.status}):`,
                await response.text(),
            )
            // Falha de transporte vira linha de log e some — só `disparos_whatsapp`
            // guarda, e ninguém consulta antes do painel da Phase 11. Contexto
            // carrega SÓ o código HTTP: nunca telefone, nome ou texto da mensagem.
            reportarFalhaSilenciosa('whatsapp:falha_transporte', {
                statusCode: response.status,
            })
            return { ok: false, motivo: `http_${response.status}` }
        }

        return { ok: true }
    } catch (err) {
        console.error('Falha de rede ao chamar Evolution API:', err)
        reportarFalhaSilenciosa('whatsapp:erro_rede')
        return { ok: false, motivo: 'erro_rede' }
    }
}

/**
 * Agenda o lembrete futuro utilizando o Upstash QStash.
 * Em caso de sucesso retorna o messageId do job (necessário para cancelar depois).
 */
export async function agendarLembreteQStash(
    agendamentoId: string,
    tenantId: string,
    targetTimestampMs: number,
): Promise<ResultadoAgendamento> {
    if (!QSTASH_TOKEN) {
        console.warn('QSTASH_TOKEN não configurado. Lembrete em background não será agendado.')
        // "Lembrete com env faltando" é um dos modos de falha silenciosos
        // nomeados no ROADMAP: devolve `motivo` e ninguém olha. Em produção o
        // fail-fast de `src/lib/env.ts` impede chegar aqui — este reporte cobre
        // o caso de a variável existir vazia ou de o guard ser afrouxado.
        reportarFalhaSilenciosa('qstash:sem_token')
        return { ok: false, motivo: 'qstash_sem_token' }
    }

    const scheduledSeconds = Math.floor(targetTimestampMs / 1000)

    try {
        const secret = process.env.QSTASH_CURRENT_SIGNING_KEY || 'secret-key'
        const webhookUrl = `${APP_URL}/api/webhooks/lembrete?secret=${secret}`
        const publishUrl = `${QSTASH_URL}/v2/publish/${webhookUrl}`

        const response = await fetch(publishUrl, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${QSTASH_TOKEN}`,
                'Content-Type': 'application/json',
                'Upstash-Not-Before': String(scheduledSeconds),
            },
            body: JSON.stringify({
                agendamentoId,
                tenantId,
            }),
        })

        if (!response.ok) {
            console.error(
                `Falha ao registrar agendamento no QStash (${response.status}):`,
                await response.text(),
            )
            return { ok: false, motivo: `http_${response.status}` }
        }

        const dataRes = await response.json().catch(() => null)
        const messageId = dataRes?.messageId

        if (!messageId) {
            console.error('QStash não retornou messageId no publish:', dataRes)
            return { ok: false, motivo: 'sem_message_id' }
        }

        return { ok: true, messageId }
    } catch (err) {
        console.error('Erro de conexão ao agendar job no QStash:', err)
        return { ok: false, motivo: 'erro_rede' }
    }
}

/**
 * Cancela um lembrete agendado no QStash pelo seu messageId.
 * 404 é tratado como sucesso brando (o job já não existe / já executou).
 */
export async function cancelarLembreteQStash(messageId: string): Promise<ResultadoEnvio> {
    if (!QSTASH_TOKEN) {
        console.warn('QSTASH_TOKEN não configurado. Não há como cancelar lembrete.')
        return { ok: false, motivo: 'qstash_sem_token' }
    }

    try {
        const response = await fetch(`${QSTASH_URL}/v2/messages/${messageId}`, {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${QSTASH_TOKEN}`,
            },
        })

        // 404 = mensagem inexistente (já executada/cancelada): sucesso brando.
        if (response.ok || response.status === 404) {
            return { ok: true }
        }

        console.error(
            `Falha ao cancelar lembrete no QStash (${response.status}):`,
            await response.text(),
        )
        return { ok: false, motivo: `http_${response.status}` }
    } catch (err) {
        console.error('Erro de conexão ao cancelar job no QStash:', err)
        return { ok: false, motivo: 'erro_rede' }
    }
}

interface RegistroDisparo {
    tenantId: string
    agendamentoId?: string | null
    tipo: 'confirmacao' | 'lembrete' | 'teste'
    status: 'enviado' | 'agendado' | 'executado' | 'falha' | 'ignorado' | 'cancelado'
    motivo?: string | null
    qstashMessageId?: string | null
}

/**
 * Registra um disparo na tabela de auditoria `disparos_whatsapp`.
 * O log jamais quebra o chamador: qualquer erro é apenas logado no console.
 */
export async function registrarDisparo(
    client: SupabaseClient,
    { tenantId, agendamentoId, tipo, status, motivo, qstashMessageId }: RegistroDisparo,
): Promise<void> {
    try {
        const { error } = await client.from('disparos_whatsapp').insert({
            tenant_id: tenantId,
            agendamento_id: agendamentoId ?? null,
            tipo,
            status,
            motivo: motivo ?? null,
            qstash_message_id: qstashMessageId ?? null,
        })

        if (error) {
            console.error('Erro ao registrar disparo de WhatsApp (ignorado):', error.message)
        }
    } catch (err) {
        console.error('Falha inesperada ao registrar disparo de WhatsApp (ignorado):', err)
    }
}
