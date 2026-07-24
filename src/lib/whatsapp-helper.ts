import type { SupabaseClient } from '@supabase/supabase-js'

import { reportarFalhaSilenciosaAguardando, reportarExcecaoAguardando } from './observabilidade/reportar'
import { erroSinteticoSupabase } from './observabilidade/erro-supabase'
import { logOperacional } from './observabilidade/log'
import { hashTenantId, hashAgendamentoId } from './observabilidade/hash'

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
    meta?: { tenantHash?: string; agendamentoHash?: string; fluxo?: string },
): Promise<ResultadoEnvio> {
    const telefoneLimpo = telefone.replace(/\D/g, '')
    // Garante que o telefone tenha o código do país (55 para Brasil)
    const destinatario = telefoneLimpo.startsWith('55') ? telefoneLimpo : `55${telefoneLimpo}`
    const contextoMeta = {
        fluxo: meta?.fluxo || 'whatsapp_helper',
        provider: 'evolution',
        tenantHash: meta?.tenantHash,
        agendamentoHash: meta?.agendamentoHash,
    }

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
            const statusCode = response.status
            const motivo = `http_${statusCode}`
            console.error(`Erro ao disparar WhatsApp via Evolution: http_${statusCode}`)
            
            logOperacional.error('whatsapp.confirmacao.falha_http', {
                ...contextoMeta,
                statusCode,
                motivo,
            })

            await reportarFalhaSilenciosaAguardando('whatsapp:evolution_http_error', {
                ...contextoMeta,
                statusCode,
                motivo,
            })
            return { ok: false, motivo }
        }

        logOperacional.info('whatsapp.confirmacao.enviada', {
            ...contextoMeta,
            resultado: 'sucesso',
        })

        return { ok: true }
    } catch (err) {
        console.error('Falha de rede ao chamar Evolution API:', err)
        
        logOperacional.error('whatsapp.confirmacao.falha_rede', {
            ...contextoMeta,
            motivo: 'erro_rede',
        })

        await reportarFalhaSilenciosaAguardando('whatsapp:evolution_network_error', {
            ...contextoMeta,
            motivo: 'erro_rede',
        })
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
    const tenantHash = hashTenantId(tenantId)
    const agendamentoHash = hashAgendamentoId(agendamentoId)
    const contextoMeta = {
        fluxo: 'qstash_helper',
        provider: 'qstash',
        tenantHash,
        agendamentoHash,
    }

    logOperacional.info('qstash.lembrete.tentativa', contextoMeta)

    if (!QSTASH_TOKEN) {
        console.warn('QSTASH_TOKEN não configurado. Lembrete em background não será agendado.')
        logOperacional.error('qstash.lembrete.sem_token', {
            ...contextoMeta,
            motivo: 'qstash_sem_token',
        })
        await reportarFalhaSilenciosaAguardando('qstash:sem_token', {
            ...contextoMeta,
            motivo: 'qstash_sem_token',
        })
        return { ok: false, motivo: 'qstash_sem_token' }
    }

    const chaveAssinatura = process.env.QSTASH_CURRENT_SIGNING_KEY
    if (!chaveAssinatura?.trim()) {
        console.warn(
            'QSTASH_CURRENT_SIGNING_KEY não configurada. Lembrete em background não será agendado.',
        )
        logOperacional.error('qstash.lembrete.sem_chave_assinatura', {
            ...contextoMeta,
            motivo: 'qstash_sem_chave_assinatura',
        })
        await reportarFalhaSilenciosaAguardando('qstash:sem_chave_assinatura', {
            ...contextoMeta,
            motivo: 'qstash_sem_chave_assinatura',
        })
        return { ok: false, motivo: 'qstash_sem_chave_assinatura' }
    }

    const scheduledSeconds = Math.floor(targetTimestampMs / 1000)

    try {
        const webhookUrl = `${APP_URL}/api/webhooks/lembrete`
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
            const statusCode = response.status
            const motivo = `http_${statusCode}`
            console.error(`Falha ao registrar agendamento no QStash: http_${statusCode}`)
            
            logOperacional.error('qstash.lembrete.falha_http', {
                ...contextoMeta,
                statusCode,
                motivo,
            })

            await reportarFalhaSilenciosaAguardando('qstash:publish_http_error', {
                ...contextoMeta,
                statusCode,
                motivo,
            })
            return { ok: false, motivo }
        }

        const dataRes = await response.json().catch(() => null)
        const messageId = dataRes?.messageId

        if (!messageId) {
            console.error('QStash não retornou messageId no publish.')
            logOperacional.error('qstash.lembrete.sem_message_id', {
                ...contextoMeta,
                motivo: 'sem_message_id',
            })
            await reportarFalhaSilenciosaAguardando('qstash:publish_sem_message_id', {
                ...contextoMeta,
                motivo: 'sem_message_id',
            })
            return { ok: false, motivo: 'sem_message_id' }
        }

        logOperacional.info('qstash.lembrete.agendado', {
            ...contextoMeta,
            resultado: 'agendado',
        })

        return { ok: true, messageId }
    } catch (err) {
        console.error('Erro de conexão ao agendar job no QStash:', err)
        logOperacional.error('qstash.lembrete.falha_rede', {
            ...contextoMeta,
            motivo: 'erro_rede',
        })
        await reportarFalhaSilenciosaAguardando('qstash:publish_network_error', {
            ...contextoMeta,
            motivo: 'erro_rede',
        })
        return { ok: false, motivo: 'erro_rede' }
    }
}

/**
 * Cancela um lembrete agendado no QStash pelo seu messageId.
 * 404 é tratado como sucesso brando (o job já não existe / já executou).
 */
export async function cancelarLembreteQStash(messageId: string): Promise<ResultadoEnvio> {
    const contextoMeta = {
        fluxo: 'qstash_cancelamento',
        provider: 'qstash',
    }

    if (!QSTASH_TOKEN) {
        console.warn('QSTASH_TOKEN não configurado. Não há como cancelar lembrete.')
        logOperacional.warn('qstash.cancelamento.sem_token', {
            ...contextoMeta,
            motivo: 'qstash_sem_token',
        })
        await reportarFalhaSilenciosaAguardando('qstash:sem_token', {
            ...contextoMeta,
            motivo: 'qstash_sem_token',
        })
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
            logOperacional.info('qstash.cancelamento.sucesso', {
                ...contextoMeta,
                statusCode: response.status,
            })
            return { ok: true }
        }

        const statusCode = response.status
        const motivo = `http_${statusCode}`
        console.error(`Falha ao cancelar lembrete no QStash: http_${statusCode}`)
        logOperacional.error('qstash.cancelamento.falha_http', {
            ...contextoMeta,
            statusCode,
            motivo,
        })
        await reportarFalhaSilenciosaAguardando('qstash:cancel_http_error', {
            ...contextoMeta,
            statusCode,
            motivo,
        })
        return { ok: false, motivo }
    } catch (err) {
        console.error('Erro de conexão ao cancelar job no QStash:', err)
        logOperacional.error('qstash.cancelamento.falha_rede', {
            ...contextoMeta,
            motivo: 'erro_rede',
        })
        await reportarFalhaSilenciosaAguardando('qstash:cancel_network_error', {
            ...contextoMeta,
            motivo: 'erro_rede',
        })
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
 * O log jamais quebra o chamador: qualquer erro é registrado e reportado ao Sentry.
 */
export async function registrarDisparo(
    client: SupabaseClient,
    { tenantId, agendamentoId, tipo, status, motivo, qstashMessageId }: RegistroDisparo,
): Promise<void> {
    const tenantHash = hashTenantId(tenantId)
    const agendamentoHash = agendamentoId ? hashAgendamentoId(agendamentoId) : undefined
    const contextoMeta = {
        fluxo: 'auditoria_whatsapp',
        operacao: 'registrar_disparo',
        tenantHash,
        agendamentoHash,
        motivo: motivo ?? undefined,
        resultado: status,
    }

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
            logOperacional.error('auditoria_whatsapp.falha_insert', {
                ...contextoMeta,
                motivo: 'insert_failed',
            })
            await reportarExcecaoAguardando(erroSinteticoSupabase(error, 'auditoria_whatsapp_insert_failed'), {
                fluxo: 'auditoria_whatsapp',
                etapa: 'insert_disparo',
                tenantHash,
                agendamentoHash,
            })
        } else {
            logOperacional.info('auditoria_whatsapp.persistida', contextoMeta)
        }
    } catch (err) {
        console.error('Falha inesperada ao registrar disparo de WhatsApp (ignorado):', err)
        logOperacional.error('auditoria_whatsapp.falha_inesperada', {
            ...contextoMeta,
            motivo: 'excecao_inesperada',
        })
        await reportarExcecaoAguardando(err, {
            fluxo: 'auditoria_whatsapp',
            etapa: 'insert_disparo_catch',
            tenantHash,
            agendamentoHash,
        })
    }
}
