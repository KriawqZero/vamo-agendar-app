/**
 * Logger estruturado para observabilidade operacional do VamoAgendar.
 *
 * Contrato:
 * 1. NUNCA lança exceção.
 * 2. NO-OP se o DSN do Sentry não estiver configurado.
 * 3. Trabalha APENAS com mensagens/códigos estáticos (ex.: 'mensageria.iniciada', 'whatsapp.confirmacao.enviada').
 * 4. NUNCA aceita PII (nome, telefone, e-mail, texto de mensagem, token, URL completa, payload ou objetos/erros brutos).
 * 5. Aceita SOMENTE a allowlist tipada de atributos (`AtributosLogOperacional`).
 */

import { dsnDoSentry } from './dsn'

export interface AtributosLogOperacional {
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
        const atributosLimpos = sanitizarAtributosLog(atributos as Record<string, unknown>)
        
        // Import dinâmico ou acesso direto ao Sentry
        void import('@sentry/nextjs')
            .then((Sentry) => {
                if (Sentry.logger && typeof Sentry.logger[nivel] === 'function') {
                    if (atributosLimpos) {
                        Sentry.logger[nivel](codigo, atributosLimpos)
                    } else {
                        Sentry.logger[nivel](codigo)
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
