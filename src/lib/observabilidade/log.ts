/**
 * Logger estruturado para observabilidade operacional do VamoAgendar.
 *
 * Contrato:
 * 1. NUNCA lança exceção.
 * 2. NO-OP se o DSN do Sentry não estiver configurado.
 * 3. Trabalha com mensagens amigáveis em português no título do log, preservando
 *    o código técnico no atributo `codigo` para busca e filtro.
 * 4. NUNCA aceita PII (nome, telefone, e-mail, texto de mensagem, token, URL completa, payload ou objetos/erros brutos).
 * 5. Aceita SOMENTE a allowlist tipada de atributos (`AtributosLogOperacional`).
 */

import { dsnDoSentry } from './dsn'

export interface AtributosLogOperacional {
    codigo?: string
    fluxo?: string
    etapa?: string
    operacao?: string
    resultado?: string
    provider?: string
    motivo?: string
    statusCode?: number
    tenantHash?: string
    agendamentoHash?: string
    runtime?: string
    tentativa?: number
    retry?: boolean
    duracaoMs?: number
}

const CHAVES_PERMITIDAS_LOG = new Set<keyof AtributosLogOperacional>([
    'codigo',
    'fluxo',
    'etapa',
    'operacao',
    'resultado',
    'provider',
    'motivo',
    'statusCode',
    'tenantHash',
    'agendamentoHash',
    'runtime',
    'tentativa',
    'retry',
    'duracaoMs',
])

/**
 * Mapeamento de códigos operacionais internos para frases amigáveis e claras
 * exibidas na linha principal dos logs do Sentry.
 */
export const MENSAGENS_LOG: Record<string, string> = {
    'mensageria.iniciada': 'Iniciando processamento de mensageria do agendamento',
    'whatsapp.telefone.ausente': 'Telefone do cliente não foi informado',
    'whatsapp.perfis.query_error': 'Falha ao consultar perfil da empresa no banco',
    'whatsapp.configs.query_error': 'Falha ao consultar configurações do WhatsApp no banco',
    'whatsapp.config.ausente_pro': 'Configuração do WhatsApp ausente para tenant Pro',
    'whatsapp.plano.sem_whatsapp': 'Notificações ignoradas: plano sem recurso de WhatsApp',
    'whatsapp.confirmacao.desconectado': 'Confirmação não enviada: WhatsApp desconectado',
    'whatsapp.confirmacao.tentativa': 'Enviando mensagem de confirmação via WhatsApp',
    'whatsapp.confirmacao.enviada': 'Mensagem de confirmação enviada com sucesso',
    'whatsapp.confirmacao.falha_http': 'Falha HTTP ao enviar mensagem de confirmação',
    'whatsapp.confirmacao.falha_rede': 'Falha de rede ao enviar mensagem de confirmação',
    'qstash.lembrete.fora_da_janela': 'Lembrete ignorado: horário do agendamento é fora da janela',
    'qstash.lembrete.tentativa': 'Agendando lembrete no QStash',
    'qstash.lembrete.agendado': 'Lembrete agendado com sucesso no QStash',
    'qstash.lembrete.sem_token': 'Lembrete não agendado: QSTASH_TOKEN ausente',
    'qstash.lembrete.sem_chave_assinatura': 'Lembrete não agendado: chave de assinatura QStash ausente',
    'qstash.lembrete.sem_message_id': 'QStash não retornou ID da mensagem agendada',
    'qstash.lembrete.falha_http': 'Falha HTTP ao agendar lembrete no QStash',
    'qstash.lembrete.falha_rede': 'Falha de rede ao agendar lembrete no QStash',
    'qstash.cancelamento.sem_token': 'Cancelamento ignorado: QSTASH_TOKEN ausente',
    'qstash.cancelamento.sucesso': 'Lembrete cancelado com sucesso no QStash',
    'qstash.cancelamento.falha_http': 'Falha HTTP ao cancelar lembrete no QStash',
    'qstash.cancelamento.falha_rede': 'Falha de rede ao cancelar lembrete no QStash',
    'qstash.webhook.recebido': 'Webhook de lembrete QStash recebido',
    'qstash.webhook.assinatura_invalida': 'Assinatura inválida no webhook de lembrete',
    'qstash.webhook.payload_incompleto': 'Payload incompleto no webhook de lembrete',
    'qstash.webhook.payload_validado': 'Payload validado no webhook de lembrete',
    'qstash.webhook.agendamento_nao_encontrado': 'Agendamento não encontrado no webhook de lembrete',
    'qstash.webhook.agendamento_cancelado': 'Lembrete ignorado: agendamento foi cancelado',
    'qstash.webhook.plano_indeterminado': 'Falha de leitura do plano no webhook de lembrete',
    'qstash.webhook.plano_sem_whatsapp': 'Lembrete ignorado: plano sem recurso de WhatsApp',
    'qstash.webhook.cliente_sem_contato': 'Lembrete ignorado: cliente sem telefone',
    'whatsapp.lembrete.desconectado': 'Lembrete ignorado: WhatsApp está desconectado',
    'whatsapp.lembrete.enviado': 'Mensagem de lembrete enviada com sucesso',
    'whatsapp.lembrete.falha': 'Falha ao enviar mensagem de lembrete via WhatsApp',
    'qstash.webhook.excecao': 'Erro interno no webhook de lembrete',
    'auditoria_whatsapp.persistida': 'Disparo registrado no banco de auditoria com sucesso',
    'auditoria_whatsapp.falha_insert': 'Falha ao registrar disparo no banco de auditoria',
    'auditoria_whatsapp.falha_inesperada': 'Exceção inesperada ao registrar disparo',
    'notificacoes_agendamento.excecao': 'Exceção inesperada ao disparar notificações do agendamento',
    'analytics_posthog.falha_entrega': 'Falha ao entregar evento ao PostHog',
    'whatsapp.status.sincronizado': 'Status da integração WhatsApp sincronizado com sucesso',
    'sistema.fatal': 'Erro fatal no sistema',
}

/**
 * Sanitiza o objeto de atributos antes de enviar ao Sentry.logger,
 * garantindo que apenas chaves da allowlist com tipos simples atravessam.
 */
export function sanitizarAtributosLog(
    atributos?: Record<string, unknown>,
): Record<string, string | number | boolean> | undefined {
    if (!atributos || typeof atributos !== 'object') return undefined

    const limpo: Record<string, string | number | boolean> = {}

    for (const [chave, valor] of Object.entries(atributos)) {
        if (!CHAVES_PERMITIDAS_LOG.has(chave as keyof AtributosLogOperacional)) {
            continue
        }

        if (
            typeof valor === 'string' ||
            typeof valor === 'number' ||
            typeof valor === 'boolean'
        ) {
            limpo[chave] = valor
        }
    }

    return Object.keys(limpo).length > 0 ? limpo : undefined
}

type NivelLog = 'info' | 'warn' | 'error' | 'fatal'

function emitirLogSentry(nivel: NivelLog, codigo: string, atributos?: AtributosLogOperacional): void {
    if (!dsnDoSentry()) return

    try {
        const tituloLog = MENSAGENS_LOG[codigo] ?? codigo
        const atributosComCodigo: Record<string, unknown> = {
            codigo,
            ...(atributos as Record<string, unknown>),
        }
        const atributosLimpos = sanitizarAtributosLog(atributosComCodigo)
        
        // Import dinâmico ou acesso direto ao Sentry
        void import('@sentry/nextjs')
            .then((Sentry) => {
                if (Sentry.logger && typeof Sentry.logger[nivel] === 'function') {
                    if (atributosLimpos) {
                        Sentry.logger[nivel](tituloLog, atributosLimpos)
                    } else {
                        Sentry.logger[nivel](tituloLog)
                    }
                }
            })
            .catch(() => {})
    } catch {
        // Silêncio proposital: logging nunca quebra a aplicação
    }
}

export const logOperacional = {
    info(codigo: string, atributos?: AtributosLogOperacional): void {
        emitirLogSentry('info', codigo, atributos)
    },
    warn(codigo: string, atributos?: AtributosLogOperacional): void {
        emitirLogSentry('warn', codigo, atributos)
    },
    error(codigo: string, atributos?: AtributosLogOperacional): void {
        emitirLogSentry('error', codigo, atributos)
    },
    fatal(codigo: string, atributos?: AtributosLogOperacional): void {
        emitirLogSentry('fatal', codigo, atributos)
    },
}
