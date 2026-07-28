/**
 * Pino do helper único de pseudonimização (WR-01).
 *
 * Duas garantias, e nenhuma delas é verificável olhando o valor do hash isolado:
 *
 * 1. SEPARAÇÃO DE DOMÍNIO. As três funções de hash do projeto eram byte a byte
 *    idênticas, então a chave do contador no Redis da Upstash era exatamente o
 *    `tenantHash` publicado no Sentry e no PostHog — quem via um evento de
 *    telemetria apontava o balde correspondente no store do fornecedor. A
 *    asserção que importa é de DIFERENÇA entre domínios, não de valor.
 * 2. FALHA VISÍVEL SEM SALT. Sem salt, `sha256(IPv4)` tem espaço de busca de
 *    2³² e a pseudonimização deixa de valer. Antes isso acontecia em silêncio.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { reportarFalhaSilenciosaMock } = vi.hoisted(() => ({
    reportarFalhaSilenciosaMock: vi.fn(),
}))

vi.mock('@/lib/observabilidade/reportar', () => ({
    reportarFalhaSilenciosa: reportarFalhaSilenciosaMock,
}))

import { hashComSal, hashTenantId } from '@/lib/observabilidade/hash'
import { hashChaveRateLimit } from '@/lib/rate-limit'
import { reiniciarEmissoes } from '@/lib/observabilidade/emissao'

const TENANT = 'org_teste_123'

beforeEach(() => {
    reportarFalhaSilenciosaMock.mockReset()
    reiniciarEmissoes()
})

describe('hashComSal — separação de domínio (WR-01)', () => {
    it('o mesmo valor em domínios diferentes produz hashes diferentes', () => {
        expect(hashComSal('ratelimit', TENANT)).not.toBe(hashComSal('analytics', TENANT))
    })

    it('a chave do contador NÃO coincide mais com o tenantHash publicado', () => {
        // Esta é a asserção inteira do WR-01: enquanto os dois valores eram
        // iguais, a pseudonimização não separava nada — bastava ler um evento de
        // telemetria para saber qual balde consultar no fornecedor terceiro.
        expect(hashChaveRateLimit(TENANT)).not.toBe(hashTenantId(TENANT))
    })

    it('continua determinístico e truncado a 16 hex', () => {
        // Determinismo é requisito de FUNCIONAMENTO, não estética: o mesmo IP
        // precisa cair sempre no mesmo balde, senão o contador não conta nada.
        expect(hashComSal('ratelimit', TENANT)).toBe(hashComSal('ratelimit', TENANT))
        expect(hashComSal('ratelimit', TENANT)).toMatch(/^[0-9a-f]{16}$/)
    })

    it('nunca devolve o valor cru', () => {
        expect(hashComSal('ratelimit', TENANT)).not.toContain(TENANT)
    })
})

describe('hashComSal — degradação sem salt deixa de ser silenciosa (WR-01)', () => {
    it('abre Issue sintética UMA vez por processo quando o salt está ausente', () => {
        vi.stubEnv('ANALYTICS_TENANT_SALT', '')

        hashComSal('ratelimit', TENANT)
        hashComSal('ratelimit', '203.0.113.7')
        hashComSal('analytics', TENANT)

        expect(reportarFalhaSilenciosaMock).toHaveBeenCalledTimes(1)
        expect(reportarFalhaSilenciosaMock).toHaveBeenCalledWith('hash:sem_salt', {
            fluxo: 'observabilidade',
        })

        vi.unstubAllEnvs()
    })

    it('não reporta nada quando o salt existe', () => {
        hashComSal('ratelimit', TENANT)

        expect(reportarFalhaSilenciosaMock).not.toHaveBeenCalled()
    })
})
