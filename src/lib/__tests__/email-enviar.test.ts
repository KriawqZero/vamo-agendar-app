import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const enviarMock = vi.fn()
const construtorMock = vi.fn()

vi.mock('resend', () => ({
    Resend: class {
        emails = { send: enviarMock }
        constructor(chave?: string) {
            construtorMock(chave)
            // Espelha o SDK real: `new Resend(undefined)` LANÇA
            // (verificado em dist/index.mjs:1150).
            if (!chave) throw new Error('Missing API key.')
        }
    },
}))

import { enviarEmail } from '../email/enviar'

const PARAMS = {
    nomeEstabelecimento: 'Salão da Maria',
    para: 'cliente@exemplo.com',
    replyTo: 'maria@exemplo.com',
    assunto: 'Teste',
    html: '<p>oi</p>',
}

beforeEach(() => {
    enviarMock.mockReset()
    construtorMock.mockReset()
})

afterEach(() => {
    vi.unstubAllEnvs()
})

describe('enviarEmail', () => {
    it('sem chave devolve desativado, sem construir o client e sem registrar erro', async () => {
        vi.stubEnv('RESEND_API_KEY', '')
        const erroSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        await expect(enviarEmail(PARAMS)).resolves.toEqual({ ok: false, motivo: 'desativado' })

        expect(construtorMock).not.toHaveBeenCalled()
        expect(enviarMock).not.toHaveBeenCalled()
        expect(erroSpy).not.toHaveBeenCalled()
        erroSpy.mockRestore()
    })

    it('sucesso devolve o id', async () => {
        vi.stubEnv('RESEND_API_KEY', 're_teste')
        enviarMock.mockResolvedValue({ data: { id: 'email_123' }, error: null })

        await expect(enviarEmail(PARAMS)).resolves.toEqual({ ok: true, id: 'email_123' })
    })

    it('erro de validação devolve rejeitado', async () => {
        vi.stubEnv('RESEND_API_KEY', 're_teste')
        enviarMock.mockResolvedValue({
            data: null,
            error: { name: 'validation_error', statusCode: 422, message: 'Domain is not verified' },
        })

        await expect(enviarEmail(PARAMS)).resolves.toEqual({ ok: false, motivo: 'rejeitado' })
    })

    it('cota diária estourada devolve falha_transporte', async () => {
        vi.stubEnv('RESEND_API_KEY', 're_teste')
        enviarMock.mockResolvedValue({
            data: null,
            error: {
                name: 'daily_quota_exceeded',
                statusCode: 429,
                message: 'You have reached your daily email quota.',
            },
        })

        await expect(enviarEmail(PARAMS)).resolves.toEqual({
            ok: false,
            motivo: 'falha_transporte',
        })
    })

    it('SDK lançando não propaga a exceção', async () => {
        vi.stubEnv('RESEND_API_KEY', 're_teste')
        enviarMock.mockRejectedValue(new Error('boom'))

        await expect(enviarEmail(PARAMS)).resolves.toEqual({
            ok: false,
            motivo: 'falha_transporte',
        })
    })

    it('nenhuma string interna do Resend aparece no valor de retorno', async () => {
        vi.stubEnv('RESEND_API_KEY', 're_teste')
        enviarMock.mockResolvedValue({
            data: null,
            error: {
                name: 'validation_error',
                statusCode: 403,
                message: 'Domain is not verified. Please add and verify your domain.',
            },
        })

        const resultado = await enviarEmail(PARAMS)
        expect(JSON.stringify(resultado)).not.toContain('Domain')
        expect(JSON.stringify(resultado)).not.toContain('verified')
    })

    it('repassa a idempotencyKey ao segundo argumento do send', async () => {
        vi.stubEnv('RESEND_API_KEY', 're_teste')
        enviarMock.mockResolvedValue({ data: { id: 'email_123' }, error: null })

        await enviarEmail({ ...PARAMS, idempotencyKey: 'boas-vindas/org_1' })

        expect(enviarMock).toHaveBeenCalledWith(expect.anything(), {
            idempotencyKey: 'boas-vindas/org_1',
        })
    })

    it('monta from com o nome do estabelecimento e replyTo do profissional', async () => {
        vi.stubEnv('RESEND_API_KEY', 're_teste')
        enviarMock.mockResolvedValue({ data: { id: 'email_123' }, error: null })

        await enviarEmail(PARAMS)

        const payload = enviarMock.mock.calls[0][0]
        expect(payload.from).toContain('Salão da Maria via VamoAgendar')
        expect(payload.replyTo).toBe('maria@exemplo.com')
    })
})
