import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const enviarMock = vi.fn()
const construtorMock = vi.fn()
const reportarMock = vi.fn()

// A borda de Sentry é mockada para que o teste possa afirmar QUANDO o wrapper
// grita — que é a diferença entre um e-mail que morre em silêncio e um que o
// owner descobre no mesmo dia (OPE-02).
vi.mock('../observabilidade/reportar', () => ({
    reportarExcecao: (...args: unknown[]) => reportarMock(...args),
    reportarFalhaSilenciosa: vi.fn(),
}))

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
    reportarMock.mockReset()
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

    /**
     * WR-03: a Phase 4 vai chamar com `para: perfil.email_contato ?? ''`. Sem a
     * guarda, o campo vazio vira `validation_error` no Resend → `rejeitado` →
     * silêncio total. Bug nosso não pode ser classificado como dado ruim de
     * entrada.
     */
    it.each([
        ['destinatário', { para: '' }],
        ['destinatário só com espaço', { para: '   ' }],
        ['reply-to', { replyTo: '' }],
        ['assunto', { assunto: '' }],
    ])('sem %s devolve config_ausente sem tocar no Resend', async (_rotulo, faltando) => {
        vi.stubEnv('RESEND_API_KEY', 're_teste')

        await expect(enviarEmail({ ...PARAMS, ...faltando })).resolves.toEqual({
            ok: false,
            motivo: 'config_ausente',
        })
        expect(enviarMock).not.toHaveBeenCalled()
        expect(reportarMock).toHaveBeenCalledTimes(1)
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

    /**
     * CR-05: se o DKIM de `mail.vamoagendar.com.br` mudar ou o domínio for
     * suspenso, TODA chamada devolve 403 e nada mais sai. Sem este reporte, a
     * descoberta acontece quando um profissional reclamar.
     */
    it('domínio não verificado (403) vira evento no Sentry mesmo sendo rejeitado', async () => {
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

        expect(resultado).toEqual({ ok: false, motivo: 'rejeitado' })
        expect(reportarMock).toHaveBeenCalledTimes(1)
        const [erro, contexto] = reportarMock.mock.calls[0]
        expect((erro as Error).message).toBe('resend:validation_error')
        expect(contexto).toEqual({ statusCode: 403 })
        // Nenhuma frase interna do Resend atravessa a fronteira, nem para o
        // Sentry (D-04).
        expect(JSON.stringify(reportarMock.mock.calls)).not.toContain('Domain')
    })

    it('rejeição do endereço do destinatário (422) continua fora do Sentry', async () => {
        vi.stubEnv('RESEND_API_KEY', 're_teste')
        enviarMock.mockResolvedValue({
            data: null,
            error: { name: 'validation_error', statusCode: 422, message: 'Invalid `to` field.' },
        })

        await expect(enviarEmail(PARAMS)).resolves.toEqual({ ok: false, motivo: 'rejeitado' })
        expect(reportarMock).not.toHaveBeenCalled()
    })

    it('remetente recusado devolve config_ausente e grita no Sentry', async () => {
        vi.stubEnv('RESEND_API_KEY', 're_teste')
        enviarMock.mockResolvedValue({
            data: null,
            error: {
                name: 'invalid_from_address',
                statusCode: 422,
                message: 'Invalid `from` field.',
            },
        })

        await expect(enviarEmail(PARAMS)).resolves.toEqual({ ok: false, motivo: 'config_ausente' })
        expect(reportarMock).toHaveBeenCalledTimes(1)
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
