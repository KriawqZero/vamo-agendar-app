import { describe, it, expect, vi, afterEach } from 'vitest'

import { validarEnvObrigatorio, OBRIGATORIAS_EM_PRODUCAO } from '../env'

/**
 * `vi.stubEnv` por teste (Vitest 4) — nunca constante de módulo, para que
 * nenhuma variável nova precise entrar no `vitest.config.ts`.
 */
afterEach(() => {
    vi.unstubAllEnvs()
})

function preencherTodas(exceto: string[] = []): void {
    for (const nome of OBRIGATORIAS_EM_PRODUCAO) {
        if (exceto.includes(nome)) continue
        vi.stubEnv(nome, `valor-${nome}`)
    }
}

describe('validarEnvObrigatorio', () => {
    it('fora de produção não lança, mesmo com tudo ausente', () => {
        vi.stubEnv('NODE_ENV', 'development')
        for (const nome of OBRIGATORIAS_EM_PRODUCAO) vi.stubEnv(nome, '')
        expect(() => validarEnvObrigatorio()).not.toThrow()
    })

    it('em produção com todas presentes não lança', () => {
        vi.stubEnv('NODE_ENV', 'production')
        preencherTodas()
        expect(() => validarEnvObrigatorio()).not.toThrow()
    })

    it('em produção lança UMA vez com os TRÊS nomes ausentes na mensagem', () => {
        vi.stubEnv('NODE_ENV', 'production')
        const ausentes = ['RESEND_API_KEY', 'APP_URL', 'QSTASH_TOKEN']
        preencherTodas(ausentes)
        for (const nome of ausentes) vi.stubEnv(nome, '')

        let capturado: unknown
        try {
            validarEnvObrigatorio()
        } catch (err) {
            capturado = err
        }

        expect(capturado).toBeInstanceOf(Error)
        const mensagem = (capturado as Error).message
        // A lista COMPLETA de uma vez: senão o owner descobre uma variável por deploy.
        for (const nome of ausentes) expect(mensagem).toContain(nome)
    })

    it('string só com espaço em branco conta como ausente', () => {
        vi.stubEnv('NODE_ENV', 'production')
        preencherTodas()
        vi.stubEnv('ANALYTICS_TENANT_SALT', '   ')
        expect(() => validarEnvObrigatorio()).toThrow(/ANALYTICS_TENANT_SALT/)
    })

    it('enxerga variável NEXT_PUBLIC_* definida em runtime (acesso dinâmico)', () => {
        // Trava do modo de falha W7: acesso literal a `process.env.NEXT_PUBLIC_X`
        // é substituído por valor em tempo de build, e a validação passaria a
        // conferir o que foi congelado no build em vez do que existe no runtime.
        // Se alguém reescrever a função com acesso literal, este teste quebra.
        vi.stubEnv('NODE_ENV', 'production')
        preencherTodas(['NEXT_PUBLIC_SENTRY_DSN'])
        vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '')
        expect(() => validarEnvObrigatorio()).toThrow(/NEXT_PUBLIC_SENTRY_DSN/)

        vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://exemplo@sentry.local/1')
        expect(() => validarEnvObrigatorio()).not.toThrow()
    })
})

describe('OBRIGATORIAS_EM_PRODUCAO', () => {
    it('tem os treze nomes acordados, sem duplicata', () => {
        expect(OBRIGATORIAS_EM_PRODUCAO).toHaveLength(13)
        expect(new Set(OBRIGATORIAS_EM_PRODUCAO).size).toBe(13)
    })

    it('não inclui as chaves do Clerk (falham alto e imediato por conta própria)', () => {
        const nomes = OBRIGATORIAS_EM_PRODUCAO.join(',')
        expect(nomes).not.toContain('CLERK')
    })
})
