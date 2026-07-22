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
            // O corpo da resposta NÃO é lido para log: `docs/09` registra, como fato
            // observado, que o payload de erro da Evolution ecoa o telefone e o texto
            // já com `{{cliente}}` substituído — PII do cliente final, que o
            // invariante do projeto proíbe em log. O `reportarFalhaSilenciosa` logo
            // abaixo já mandava só `statusCode`: o `console.error` contradizia o
            // próprio vizinho, e a trava anti-PII do Sentry não alcança o log do
            // Railway.
            console.error(`Erro ao disparar WhatsApp via Evolution: http_${response.status}`)
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

    // Sem chave de assinatura não se publica. A chave NÃO entra mais na URL (ver
    // comentário da publicação abaixo): esta guarda existe só para recusar
    // publicar um lembrete que o webhook depois não conseguiria autenticar —
    // publicação assim é falha silenciosa garantida, descoberta só pelo cliente
    // final que não recebeu a mensagem.
    const chaveAssinatura = process.env.QSTASH_CURRENT_SIGNING_KEY
    if (!chaveAssinatura?.trim()) {
        console.warn(
            'QSTASH_CURRENT_SIGNING_KEY não configurada. Lembrete em background não será agendado.',
        )
        reportarFalhaSilenciosa('qstash:sem_chave_assinatura')
        return { ok: false, motivo: 'qstash_sem_chave_assinatura' }
    }

    const scheduledSeconds = Math.floor(targetTimestampMs / 1000)

    try {
        // A URL publicada NÃO carrega segredo nenhum: quem autentica o webhook é o
        // header assinado (`Upstash-Signature`), verificado por `Receiver` em
        // `qstash-assinatura.ts`. A chave HMAC é simétrica — publicá-la em query
        // string a entregava ao log de acesso de cada hop e ao console da Upstash.
        //
        // Lembretes já enfileirados continuam válidos: `route.ts` verifica contra
        // `req.url` — a URL que a requisição de fato traz —, então publicação antiga
        // (com parâmetro) e nova (sem) convivem, cada uma casando com a própria
        // claim `sub`. O webhook não lê mais esse parâmetro desde o 01-03.
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
            // O corpo da resposta NÃO é lido para log: o erro do QStash costuma
            // ecoar a URL de destino, e log de aplicação não é lugar de URL de
            // publicação.
            console.error(`Falha ao registrar agendamento no QStash: http_${response.status}`)
            return { ok: false, motivo: `http_${response.status}` }
        }

        const dataRes = await response.json().catch(() => null)
        const messageId = dataRes?.messageId

        if (!messageId) {
            // Mesma disciplina do bloco acima: registra-se a ausência do campo, não
            // o objeto de resposta — que também pode ecoar a URL de destino.
            console.error('QStash não retornou messageId no publish.')
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

        // O corpo da resposta NÃO é lido para log: o erro do QStash costuma ecoar a
        // URL de destino da mensagem referenciada.
        console.error(`Falha ao cancelar lembrete no QStash: http_${response.status}`)
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
