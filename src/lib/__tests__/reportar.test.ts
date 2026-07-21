import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const capturarMock = vi.fn()
const flushMock = vi.fn().mockResolvedValue(true)

// O SDK é substituído pelo mock ANTES do import dinâmico de `reportar.ts` — a
// suíte continua sem puxar `@sentry/node` + instrumentações OTel.
vi.mock('@sentry/nextjs', () => ({
    captureException: (...args: unknown[]) => capturarMock(...args),
    flush: (timeout?: number) => flushMock(timeout),
}))

import { dsnDoSentry } from '../observabilidade/dsn'
import { reportarExcecao, reportarExcecaoAguardando } from '../observabilidade/reportar'

beforeEach(() => {
    capturarMock.mockReset()
    flushMock.mockClear()
})

afterEach(() => {
    vi.unstubAllEnvs()
})

describe('dsnDoSentry', () => {
    it('reflete o process.env do RUNTIME a cada chamada', () => {
        vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '')
        expect(dsnDoSentry()).toBeFalsy()

        vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://chave@sentry.local/1')
        expect(dsnDoSentry()).toBe('https://chave@sentry.local/1')
    })

    it('trata DSN só com espaço como ausente', () => {
        vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '   ')
        expect(dsnDoSentry()).toBeFalsy()
    })
})

describe('reportarExcecao', () => {
    it('é no-op sem DSN e não lança', () => {
        vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '')

        expect(() => reportarExcecao(new Error('boom'))).not.toThrow()
        expect(capturarMock).not.toHaveBeenCalled()
    })

    // WR-01: o DSN é lido a CADA chamada, do `process.env` do runtime. Acesso
    // literal a `NEXT_PUBLIC_*` é congelado no build; se o valor viesse do
    // build, um ambiente com build e runtime separados teria Sentry morto com
    // o fail-fast de env.ts reportando tudo verde.
    it('lê o DSN em runtime, não em tempo de load do módulo', async () => {
        vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://chave@sentry.local/1')

        reportarExcecao(new Error('boom'), { fluxo: 'teste' })
        await vi.waitFor(() => expect(capturarMock).toHaveBeenCalledTimes(1))

        expect(capturarMock.mock.calls[0][1]).toEqual({ extra: { fluxo: 'teste' } })
    })
})

/**
 * WR-04: `reportarExcecao` dispara `import().then()` que ninguém aguarda. No
 * webhook de lembrete a resposta vai embora na linha seguinte, e num runtime
 * que congela após a resposta o evento se perde.
 */
describe('reportarExcecaoAguardando', () => {
    it('captura E aguarda o flush antes de resolver', async () => {
        vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://chave@sentry.local/1')

        await reportarExcecaoAguardando(new Error('boom'), { fluxo: 'webhook_lembrete' })

        expect(capturarMock).toHaveBeenCalledTimes(1)
        expect(flushMock).toHaveBeenCalledTimes(1)
        // Teto para não segurar a resposta do webhook.
        expect(flushMock.mock.calls[0][0]).toBe(2000)
    })

    it('é no-op sem DSN, sem tocar no SDK', async () => {
        vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '')

        await expect(reportarExcecaoAguardando(new Error('boom'))).resolves.toBeUndefined()
        expect(capturarMock).not.toHaveBeenCalled()
        expect(flushMock).not.toHaveBeenCalled()
    })

    it('nunca rejeita, mesmo se o SDK explodir', async () => {
        vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://chave@sentry.local/1')
        capturarMock.mockImplementation(() => {
            throw new Error('SDK quebrado')
        })

        await expect(reportarExcecaoAguardando(new Error('boom'))).resolves.toBeUndefined()
    })
})
