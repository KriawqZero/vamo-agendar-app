import { describe, it, expect, vi, beforeEach } from 'vitest'
import { logOperacional, sanitizarAtributosLog } from '../log'
import { sanitizarLogSentry } from '../sanitizacao'

vi.mock('../dsn', () => ({
    dsnDoSentry: () => 'https://fake-dsn@sentry.io/123',
}))

describe('Sentry Logs & logOperacional Sanitização', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('manter em attributes apenas chaves da allowlist', () => {
        const entrada = {
            codigo: 'whatsapp.confirmacao.falha_http',
            fluxo: 'booking',
            etapa: 'confirmacao',
            motivo: 'http_500',
            statusCode: 500,
            tenantHash: 'hash_123',
            agendamentoHash: 'hash_456',
            nomeCliente: 'PII_TESTE_MARIA',
            telefone: '5567999998888',
            email: 'cliente@pii-teste.com',
            token: 'token_supersecreto_teste',
            orgId: 'org_PII_TESTE',
        }

        const limpo = sanitizarAtributosLog(entrada)

        expect(limpo).toEqual({
            codigo: 'whatsapp.confirmacao.falha_http',
            fluxo: 'booking',
            etapa: 'confirmacao',
            motivo: 'http_500',
            statusCode: 500,
            tenantHash: 'hash_123',
            agendamentoHash: 'hash_456',
        })

        // Asserções negativas estritas de PII
        expect(limpo).not.toHaveProperty('nomeCliente')
        expect(limpo).not.toHaveProperty('telefone')
        expect(limpo).not.toHaveProperty('email')
        expect(limpo).not.toHaveProperty('token')
        expect(limpo).not.toHaveProperty('orgId')
    })

    it('beforeSendLog remove atributos fora da allowlist e preserva chaves do SDK', () => {
        const logBruto = {
            level: 'info',
            message: 'mensageria.iniciada',
            attributes: {
                fluxo: 'notificacoes_agendamento',
                tenantHash: 'abc12345',
                'sentry.sdk.name': 'sentry.javascript.nextjs',
                'server.address': 'railway-us',
                PII_NOME: 'PII_TESTE_MARIA',
                PII_TELEFONE: '5567999998888',
                PII_EMAIL: 'cliente@pii-teste.com',
                PII_TOKEN: 'token_supersecreto_teste',
            },
        }

        const logSanitizado = sanitizarLogSentry(logBruto)

        expect(logSanitizado.attributes).toEqual({
            fluxo: 'notificacoes_agendamento',
            tenantHash: 'abc12345',
            'sentry.sdk.name': 'sentry.javascript.nextjs',
            'server.address': 'railway-us',
        })

        const attrsStr = JSON.stringify(logSanitizado.attributes)
        expect(attrsStr).not.toContain('PII_TESTE_MARIA')
        expect(attrsStr).not.toContain('5567999998888')
        expect(attrsStr).not.toContain('cliente@pii-teste.com')
        expect(attrsStr).not.toContain('token_supersecreto_teste')
    })

    it('logOperacional executa sem erro para os 4 níveis de log', () => {
        expect(() => {
            logOperacional.info('mensageria.iniciada', { fluxo: 'booking', statusCode: 200 })
            logOperacional.warn('whatsapp.desconectado', { fluxo: 'booking', motivo: 'whatsapp_desconectado' })
            logOperacional.error('whatsapp.falha_http', { fluxo: 'booking', statusCode: 500 })
            logOperacional.fatal('sistema.fatal', { fluxo: 'boot', motivo: 'fatal_error' })
        }).not.toThrow()
    })
})
