import { describe, it, expect } from 'vitest'

import { classificarErroResend } from '../email/classificar'

/**
 * A tabela veio da união fechada de literais do SDK (`RESEND_ERROR_CODE_KEY`),
 * então o mapeamento é exaustivo e conferível pelo compilador.
 */
describe('classificarErroResend', () => {
    it.each([
        'validation_error',
        'invalid_idempotent_request',
        'concurrent_idempotent_requests',
    ] as const)('%s é rejeição do Resend, não defeito nosso', (nome) => {
        expect(classificarErroResend(nome)).toBe('rejeitado')
    })

    /**
     * CR-05: o `from` é constante de produto (`ENDERECO_REMETENTE`), não vem de
     * input. Recusa do remetente = defeito nosso, e classificá-la como
     * `rejeitado` a tornava invisível — sem Sentry, sem log, com 100% dos
     * e-mails parados até um profissional reclamar.
     */
    it.each(['invalid_from_address', 'security_error'] as const)(
        '%s é recusa do NOSSO remetente e tem que virar defeito nosso',
        (nome) => {
            expect(classificarErroResend(nome)).toBe('config_ausente')
        },
    )

    it.each([
        'missing_required_field',
        'invalid_parameter',
        'invalid_attachment',
        'invalid_idempotency_key',
        'missing_api_key',
        'invalid_api_key',
        'restricted_api_key',
        'not_found',
        'method_not_allowed',
        'invalid_access',
        'invalid_region',
    ] as const)('%s é erro de configuração/programação nossa', (nome) => {
        expect(classificarErroResend(nome)).toBe('config_ausente')
    })

    it.each([
        'daily_quota_exceeded',
        'monthly_quota_exceeded',
        'rate_limit_exceeded',
        'application_error',
        'internal_server_error',
    ] as const)('%s é falha de transporte e tem que gritar', (nome) => {
        expect(classificarErroResend(nome)).toBe('falha_transporte')
    })

    it('nome desconhecido cai em falha_transporte, nunca no lado silencioso', () => {
        // Se o vocabulário do SDK mudar, o erro tem que aparecer, não sumir.
        expect(classificarErroResend('codigo_que_ainda_nao_existe')).toBe('falha_transporte')
    })
})
