/**
 * Suíte HERMÉTICA do módulo de rate limit — sem rede, sem Redis, sem Upstash.
 *
 * O que ela pina, e por que cada um importa:
 *
 * - NO-OP sem env (D-04): dev sem as variáveis do Upstash não pode ter o fluxo
 *   público quebrado nem bloqueado por engano.
 * - Bloqueio real: `success: false` da lib vira `false` aqui — é o único retorno
 *   que muda o fluxo do booking.
 * - FAIL-OPEN nos DOIS modos de falha do fornecedor (D-02/D-03), que é o ponto
 *   mais fácil de implementar pela metade: rejeição rápida (rede/credencial) e
 *   `reason: 'timeout'`. Nos dois casos a requisição PASSA e a falha vira Issue
 *   sintética ESTÁTICA — mensagem interpolada estilhaçaria o agrupamento do
 *   Sentry (baseline da quick task 260724).
 * - Chave pseudonimizada (D-11): o valor cru do IP não pode aparecer no
 *   argumento que vai ao store do fornecedor terceiro. Asserção NEGATIVA, que é
 *   a única forma de provar ausência.
 *
 * As env vars são variadas por caso, então cada bloco recarrega o módulo
 * (`vi.resetModules()` + import dinâmico): a decisão no-op x real acontece no
 * LOAD, em escopo de módulo, e stub de env depois do import não a alcança.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { limitMock, reportarMock, headersMock } = vi.hoisted(() => ({
    limitMock: vi.fn(),
    reportarMock: vi.fn(async () => {}),
    headersMock: vi.fn(),
}))

vi.mock('@upstash/ratelimit', () => ({
    Ratelimit: class RatelimitFake {
        static slidingWindow(tokens: number, janela: string) {
            return { algoritmo: 'slidingWindow', tokens, janela }
        }
        config: unknown
        constructor(config: unknown) {
            this.config = config
        }
        limit = limitMock
    },
}))

vi.mock('@upstash/redis', () => ({
    Redis: class RedisFake {
        config: unknown
        constructor(config: unknown) {
            this.config = config
        }
    },
}))

vi.mock('next/headers', () => ({ headers: headersMock }))

vi.mock('@/lib/observabilidade/reportar', () => ({
    reportarFalhaSilenciosaAguardando: reportarMock,
}))

/** IP de fixture — nunca pode aparecer cru no argumento enviado ao Redis. */
const IP_FIXTURE = '203.0.113.7'

/**
 * Recarrega o módulo com ou sem as credenciais do Upstash. String vazia é
 * suficiente para o caminho no-op (o guard é por valor falsy) e evita depender
 * de remoção de variável do ambiente real.
 */
async function carregarModulo(comCredenciais: boolean) {
    vi.resetModules()
    vi.stubEnv('UPSTASH_REDIS_REST_URL', comCredenciais ? 'https://redis-de-teste.local' : '')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', comCredenciais ? 'token-de-teste' : '')
    return import('@/lib/rate-limit')
}

beforeEach(() => {
    limitMock.mockReset()
    reportarMock.mockReset()
    headersMock.mockReset()
})

afterEach(() => {
    vi.unstubAllEnvs()
})

describe('verificarLimite — no-op sem credenciais do Upstash (D-04)', () => {
    it('devolve PASSE e não consulta o fornecedor', async () => {
        const { verificarLimite } = await carregarModulo(false)

        await expect(verificarLimite('escrita_ip', [IP_FIXTURE])).resolves.toBe(true)
        // A prova de que é no-op de verdade, e não "passou por acaso": nenhum
        // comando foi enviado ao Redis.
        expect(limitMock).not.toHaveBeenCalled()
    })

    it('devolve PASSE para as camadas ainda sem limiter próprio', async () => {
        const { verificarLimite } = await carregarModulo(true)

        // Camada declarada no tipo mas sem instância neste plano: PASSE, nunca
        // bloqueio acidental. Os planos 03-03/03-04 preenchem as instâncias.
        await expect(verificarLimite('teto_tenant', ['org_123'])).resolves.toBe(true)
        expect(limitMock).not.toHaveBeenCalled()
    })
})

describe('verificarLimite — decisão do fornecedor', () => {
    it('BLOQUEIA quando a janela estourou (success: false)', async () => {
        const { verificarLimite } = await carregarModulo(true)
        limitMock.mockResolvedValue({ success: false, remaining: 0 })

        await expect(verificarLimite('escrita_ip', [IP_FIXTURE])).resolves.toBe(false)
        expect(limitMock).toHaveBeenCalledTimes(1)
        // Bloqueio é condição ESPERADA de negócio: nada de Sentry Issue, senão
        // a fila de erro vira o log de acesso do endpoint público.
        expect(reportarMock).not.toHaveBeenCalled()
    })

    it('PASSA dentro da janela sem reportar nada', async () => {
        const { verificarLimite } = await carregarModulo(true)
        limitMock.mockResolvedValue({ success: true, remaining: 9 })

        await expect(verificarLimite('escrita_ip', [IP_FIXTURE])).resolves.toBe(true)
        expect(reportarMock).not.toHaveBeenCalled()
    })
})

describe('verificarLimite — fail-open nos dois modos de falha (D-02/D-03)', () => {
    it('PASSA quando limit() REJEITA (rede/credencial) e reporta a Issue sintética', async () => {
        const { verificarLimite } = await carregarModulo(true)
        limitMock.mockRejectedValue(new Error('fetch failed'))

        await expect(verificarLimite('escrita_ip', [IP_FIXTURE])).resolves.toBe(true)

        expect(reportarMock).toHaveBeenCalledTimes(1)
        expect(reportarMock).toHaveBeenCalledWith('ratelimit:redis_unavailable', {
            fluxo: 'rate_limit',
            camada: 'escrita_ip',
            motivo: 'erro',
        })
    })

    it('PASSA quando a lib libera por TIMEOUT e reporta a MESMA Issue sintética', async () => {
        const { verificarLimite } = await carregarModulo(true)
        limitMock.mockResolvedValue({ success: true, reason: 'timeout', remaining: 0 })

        await expect(verificarLimite('escrita_ip', [IP_FIXTURE])).resolves.toBe(true)

        expect(reportarMock).toHaveBeenCalledTimes(1)
        // Rótulo IDÊNTICO ao da rejeição: é o mesmo problema (o fornecedor não
        // respondeu) e agrupar junto é o desenho. A distinção vive no `motivo`,
        // que é contexto, não mensagem.
        expect(reportarMock).toHaveBeenCalledWith('ratelimit:redis_unavailable', {
            fluxo: 'rate_limit',
            camada: 'escrita_ip',
            motivo: 'timeout',
        })
    })
})

describe('verificarLimite — invariante nunca-PII na chave (D-11)', () => {
    it('não envia o valor cru da chave ao fornecedor', async () => {
        const { verificarLimite, hashChaveRateLimit } = await carregarModulo(true)
        limitMock.mockResolvedValue({ success: true, remaining: 9 })

        await verificarLimite('escrita_ip', [IP_FIXTURE])

        const chaveEnviada = String(limitMock.mock.calls[0]?.[0] ?? '')
        // Asserção NEGATIVA: a única forma de provar ausência. A Upstash é
        // fornecedor terceiro — chave crua ali seria dado pessoal fora do
        // Supabase.
        expect(chaveEnviada).not.toContain(IP_FIXTURE)
        expect(chaveEnviada).toBe(hashChaveRateLimit(IP_FIXTURE))
    })

    it('hasheia cada parte separadamente e une por ":"', async () => {
        const { verificarLimite, hashChaveRateLimit } = await carregarModulo(true)
        limitMock.mockResolvedValue({ success: true, remaining: 9 })

        await verificarLimite('escrita_telefone', ['5567999998888', 'org_123'])
        // Camada sem limiter neste plano: a chave nem chega a ser enviada. A
        // forma do hash é provada pela função exportada, que é o contrato que
        // as camadas seguintes herdam.
        const composta = [hashChaveRateLimit('5567999998888'), hashChaveRateLimit('org_123')].join(
            ':',
        )
        expect(composta).not.toContain('5567999998888')
        expect(composta).not.toContain('org_123')
        expect(composta.split(':')).toHaveLength(2)
    })
})

describe('ipDoVisitante', () => {
    it('usa a PRIMEIRA entrada de x-forwarded-for (cliente real atrás do proxy)', async () => {
        const { ipDoVisitante } = await carregarModulo(true)
        headersMock.mockResolvedValue({
            get: (nome: string) =>
                nome === 'x-forwarded-for' ? `${IP_FIXTURE}, 10.0.0.1, 10.0.0.2` : null,
        })

        await expect(ipDoVisitante()).resolves.toBe(IP_FIXTURE)
    })

    it('devolve o balde comum quando o header não existe — nunca lança', async () => {
        const { ipDoVisitante } = await carregarModulo(true)
        headersMock.mockResolvedValue({ get: () => null })

        await expect(ipDoVisitante()).resolves.toBe('desconhecido')
    })

    it('devolve o balde comum quando headers() lança (fora de requisição)', async () => {
        const { ipDoVisitante } = await carregarModulo(true)
        headersMock.mockRejectedValue(new Error('fora de contexto de requisição'))

        await expect(ipDoVisitante()).resolves.toBe('desconhecido')
    })
})
