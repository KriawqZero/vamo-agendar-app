import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    logOperacional,
    logOperacionalAguardando,
    MENSAGENS_LOG,
    sanitizarAtributosLog,
} from '../log'
import { sanitizarLogSentry } from '../sanitizacao'

// O DSN é MUTÁVEL nesta suíte (e não uma constante como antes) porque o
// contrato 2 do módulo — no-op sem DSN — só é provável desligando-o em um caso.
const { dsnMock } = vi.hoisted(() => ({
    dsnMock: vi.fn<() => string | undefined>(() => 'https://fake-dsn@sentry.io/123'),
}))

vi.mock('../dsn', () => ({
    dsnDoSentry: dsnMock,
}))

// SDK mockado: a suíte é hermética por regra do projeto e nunca fala com a rede.
// O que se prova aqui é a DECISÃO do módulo (o que ele manda, e se aguarda a
// entrega), nunca a resposta do fornecedor.
const { sentryLoggerMock, flushMock } = vi.hoisted(() => ({
    sentryLoggerMock: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        fatal: vi.fn(),
    },
    flushMock: vi.fn(),
}))

vi.mock('@sentry/nextjs', () => ({
    logger: sentryLoggerMock,
    flush: flushMock,
}))

describe('Sentry Logs & logOperacional Sanitização', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        dsnMock.mockReturnValue('https://fake-dsn@sentry.io/123')
        flushMock.mockResolvedValue(true)
    })

    it('manter em attributes apenas chaves da allowlist', () => {
        const entrada = {
            codigo: 'whatsapp.confirmacao.falha_http',
            fluxo: 'booking',
            etapa: 'confirmacao',
            motivo: 'http_500',
            statusCode: 500,
            // Fixtures com FORMA de hash (16 hex). Antes eram `hash_123` /
            // `hash_456`, que nenhum hash do projeto produz — e desde o WR-07 a
            // sanitização valida a forma, não só o nome da chave.
            tenantHash: 'a1b2c3d4e5f60718',
            agendamentoHash: '0f1e2d3c4b5a6978',
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
            tenantHash: 'a1b2c3d4e5f60718',
            agendamentoHash: '0f1e2d3c4b5a6978',
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
                // Era `abc12345` (8 hex) — fixture que sobrou da época em que o
                // `beforeSendLog` filtrava só por NOME de chave. Agora as duas
                // barreiras compartilham o mesmo predicado, então este valor
                // precisa ter a forma canônica de verdade (16 hex).
                tenantHash: 'abc1234500000000',
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
            tenantHash: 'abc1234500000000',
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
            logOperacional.warn('whatsapp.desconectado', {
                fluxo: 'booking',
                motivo: 'whatsapp_desconectado',
            })
            logOperacional.error('whatsapp.falha_http', { fluxo: 'booking', statusCode: 500 })
            logOperacional.fatal('sistema.fatal', { fluxo: 'boot', motivo: 'fatal_error' })
        }).not.toThrow()
    })
})

describe('Allowlist de rate limit e códigos novos (03-02, D-11)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        dsnMock.mockReturnValue('https://fake-dsn@sentry.io/123')
        flushMock.mockResolvedValue(true)
    })

    it('preserva os atributos novos de rate limit (`camada` e `chaveHash`)', () => {
        const limpo = sanitizarAtributosLog({ camada: 'escrita_ip', chaveHash: 'abc1230000000000' })

        expect(limpo).toEqual({ camada: 'escrita_ip', chaveHash: 'abc1230000000000' })
    })

    it('NÃO deixa passar telefone, IP nem orgId — a allowlist continua FECHADA', () => {
        // O `chaveHash` legítimo entra junto de propósito: prova que a barreira
        // separa por CHAVE, e não simplesmente descarta o objeto inteiro.
        const limpo = sanitizarAtributosLog({
            camada: 'escrita_ip',
            chaveHash: 'abc1230000000000',
            telefone: '5567999998888',
            ip: '203.0.113.7',
            orgId: 'org_PII_TESTE',
        })

        expect(limpo).toEqual({ camada: 'escrita_ip', chaveHash: 'abc1230000000000' })
        expect(limpo).not.toHaveProperty('telefone')
        expect(limpo).not.toHaveProperty('ip')
        expect(limpo).not.toHaveProperty('orgId')

        const comoTexto = JSON.stringify(limpo)
        expect(comoTexto).not.toContain('5567999998888')
        expect(comoTexto).not.toContain('203.0.113.7')
        expect(comoTexto).not.toContain('org_PII_TESTE')
    })

    it('descarta campo de hash cujo VALOR não tem forma de hash (WR-07)', () => {
        // ⚠️ A barreira antiga filtrava por CHAVE, então `chaveHash` e
        // `tenantHash` aceitavam qualquer string — inclusive um IP ou um
        // telefone cru, se um chamador futuro esquecesse de hashear. O
        // invariante nunca-PII neste caminho era convenção de chamador, apesar
        // de o JSDoc do campo afirmar o contrário. Agora é estrutura.
        const limpo = sanitizarAtributosLog({
            camada: 'escrita_ip',
            chaveHash: '203.0.113.7',
            tenantHash: 'org_PII_TESTE',
            agendamentoHash: 'nao-e-hash',
        })

        expect(limpo).toEqual({ camada: 'escrita_ip' })

        const comoTexto = JSON.stringify(limpo)
        expect(comoTexto).not.toContain('203.0.113.7')
        expect(comoTexto).not.toContain('org_PII_TESTE')
    })

    it('recusa hash com tamanho ou alfabeto errados', () => {
        // Curto, longo e com maiúscula: nenhum é o que `hashComSal` produz, e
        // aceitar "quase certo" reabriria a porta por descuido de chamador.
        expect(sanitizarAtributosLog({ chaveHash: 'abc123' })).toBeUndefined()
        expect(sanitizarAtributosLog({ chaveHash: 'a1b2c3d4e5f607189' })).toBeUndefined()
        expect(sanitizarAtributosLog({ chaveHash: 'A1B2C3D4E5F60718' })).toBeUndefined()
    })

    it('declara frase amigável em pt-BR para os códigos de bloqueio e de honeypot', () => {
        expect(MENSAGENS_LOG['ratelimit.bloqueio']).toBe(
            'Requisição pública bloqueada por rate limit',
        )
        expect(MENSAGENS_LOG['honeypot.captura']).toBe(
            'Campo armadilha preenchido no booking público',
        )
    })
})

describe('logOperacionalAguardando — entrega garantida antes do return (Pitfall 3)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        dsnMock.mockReturnValue('https://fake-dsn@sentry.io/123')
        flushMock.mockResolvedValue(true)
    })

    it('emite o log com título amigável + código e AGUARDA o flush antes de resolver', async () => {
        await logOperacionalAguardando.warn('ratelimit.bloqueio', {
            fluxo: 'booking_publico',
            camada: 'escrita_ip',
            chaveHash: 'abc1230000000000',
        })

        expect(sentryLoggerMock.warn).toHaveBeenCalledWith(
            'Requisição pública bloqueada por rate limit',
            {
                codigo: 'ratelimit.bloqueio',
                fluxo: 'booking_publico',
                camada: 'escrita_ip',
                chaveHash: 'abc1230000000000',
            },
        )
        // O `flush` é a diferença INTEIRA entre esta variante e a
        // fire-and-forget: sem ele o evento se perde quando o runtime congela
        // logo depois do return (incidente 260724).
        expect(flushMock).toHaveBeenCalledWith(2000)
    })

    it('NUNCA lança quando o SDK rejeita (contrato 1)', async () => {
        flushMock.mockRejectedValue(new Error('rede do fornecedor fora do ar'))

        await expect(
            logOperacionalAguardando.warn('ratelimit.bloqueio', { fluxo: 'booking_publico' }),
        ).resolves.toBeUndefined()
    })

    it('é NO-OP sem DSN — nada sai para o fornecedor (contrato 2)', async () => {
        dsnMock.mockReturnValue(undefined)

        await logOperacionalAguardando.error('ratelimit.bloqueio', { fluxo: 'booking_publico' })

        expect(sentryLoggerMock.error).not.toHaveBeenCalled()
        expect(flushMock).not.toHaveBeenCalled()
    })

    it('expõe os quatro níveis, todos aguardáveis', async () => {
        await logOperacionalAguardando.info('mensageria.iniciada', { fluxo: 'booking_publico' })
        await logOperacionalAguardando.warn('ratelimit.bloqueio', { fluxo: 'booking_publico' })
        await logOperacionalAguardando.error('sistema.fatal', { fluxo: 'booking_publico' })
        await logOperacionalAguardando.fatal('sistema.fatal', { fluxo: 'booking_publico' })

        expect(sentryLoggerMock.info).toHaveBeenCalledTimes(1)
        expect(sentryLoggerMock.warn).toHaveBeenCalledTimes(1)
        expect(sentryLoggerMock.error).toHaveBeenCalledTimes(1)
        expect(sentryLoggerMock.fatal).toHaveBeenCalledTimes(1)
        expect(flushMock).toHaveBeenCalledTimes(4)
    })
})
