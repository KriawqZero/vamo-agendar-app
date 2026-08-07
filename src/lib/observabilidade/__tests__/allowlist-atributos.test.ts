import { describe, it, expect } from 'vitest'

import { CHAVES_PERMITIDAS_LOG } from '../atributos-log'
import type { AtributosLogOperacional } from '../atributos-log'
import { sanitizarAtributosLog } from '../log'
import { sanitizarLogSentry } from '../sanitizacao'

/**
 * A trava anti-divergência das DUAS barreiras anti-PII do caminho de Logs.
 *
 * Por que esta suíte existe: a decisão "este atributo pode sair do processo?"
 * era tomada em dois lugares com listas separadas — `sanitizarAtributosLog`
 * (nosso filtro) e `sanitizarLogSentry` (o `beforeSendLog` do SDK, a ÚLTIMA
 * barreira antes do fornecedor terceiro). A Phase 03 acrescentou `camada` e
 * `chaveHash` só à primeira, e os dois eram descartados na segunda: o log
 * `ratelimit.bloqueio` chegava ao painel sem dizer qual camada bloqueou
 * (medido em produção, release 25997ce, 2026-07-28T00:36:36Z).
 *
 * `sanitizarLogSentry` não tinha teste nenhum até aqui — a função que é a
 * última barreira antes do fornecedor estava sem cobertura.
 */

/**
 * Amostra VÁLIDA por chave da allowlist.
 *
 * O teste 1 itera a allowlist EXPORTADA em vez de repetir os nomes aqui: uma
 * lista escrita à mão dentro do teste seria uma terceira cópia para divergir,
 * que é exatamente o defeito sob conserto. Este mapa carrega só os valores, e o
 * próprio teste afirma que ele cobre a allowlist inteira — chave nova sem
 * amostra REPROVA, em vez de ser pulada em silêncio.
 */
const AMOSTRA_POR_CHAVE: Record<keyof AtributosLogOperacional, string | number | boolean> = {
    codigo: 'ratelimit.bloqueio',
    fluxo: 'booking_publico',
    etapa: 'verificar_limite',
    operacao: 'consultar',
    resultado: 'bloqueado',
    provider: 'upstash',
    motivo: 'timeout',
    statusCode: 429,
    tenantHash: 'a1b2c3d4e5f60718',
    agendamentoHash: '0f1e2d3c4b5a6978',
    runtime: 'nodejs',
    tentativa: 2,
    retry: true,
    duracaoMs: 137,
    camada: 'escrita_ip',
    chaveHash: 'abc1230000000000',
}

describe('allowlist de atributos de log — fonte única das duas barreiras', () => {
    it('o mapa de amostras cobre a allowlist inteira (chave nova sem amostra reprova)', () => {
        const semAmostra = [...CHAVES_PERMITIDAS_LOG].filter(
            (chave) => !(chave in AMOSTRA_POR_CHAVE),
        )

        expect(semAmostra).toEqual([])
    })

    // ESTE é o teste que impede a divergência de voltar. Ele não conhece nome
    // nenhum: pergunta à allowlist quais são as chaves e exige que TODAS
    // atravessem a última barreira.
    it.each([...CHAVES_PERMITIDAS_LOG])(
        '`%s` sobrevive ao beforeSendLog (`sanitizarLogSentry`)',
        (chave) => {
            const valor = AMOSTRA_POR_CHAVE[chave]

            const log = sanitizarLogSentry({
                level: 'warn',
                message: 'Requisição pública bloqueada por rate limit',
                attributes: { [chave]: valor },
            })

            expect(log.attributes).toEqual({ [chave]: valor })
        },
    )

    it('as duas barreiras em série preservam o log real de `ratelimit.bloqueio`', () => {
        // O caminho literal do log que chegou incompleto em produção: o que
        // `sanitizarAtributosLog` aprova precisa atravessar o `beforeSendLog`.
        const atributosLimpos = sanitizarAtributosLog({
            codigo: 'ratelimit.bloqueio',
            fluxo: 'booking_publico',
            camada: 'escrita_ip',
            chaveHash: 'abc1230000000000',
        })

        const log = sanitizarLogSentry({
            level: 'warn',
            message: 'Requisição pública bloqueada por rate limit',
            attributes: atributosLimpos,
        })

        expect(log.attributes).toEqual({
            codigo: 'ratelimit.bloqueio',
            fluxo: 'booking_publico',
            camada: 'escrita_ip',
            chaveHash: 'abc1230000000000',
        })
    })
})

/**
 * ⚠️ Armadilha de instrumentação que esta suíte existe para não cair.
 *
 * As duas asserções de cada par só provam alguma coisa JUNTAS. A metade "IP cru
 * é descartado" passa sozinha pelo motivo ERRADO enquanto a chave não estiver na
 * allowlist — ela é descartada por nome, não por forma. Só o par distingue
 * "a barreira valida a FORMA do hash" de "a barreira não conhece esta chave".
 */
describe('forma de hash validada TAMBÉM na última barreira', () => {
    it.each(['chaveHash', 'tenantHash'])(
        '`%s`: hash bem-formado sobrevive E IP cru é descartado',
        (chave) => {
            const bemFormado = sanitizarLogSentry({
                attributes: { [chave]: 'a1b2c3d4e5f60718' },
            })
            expect(bemFormado.attributes).toEqual({ [chave]: 'a1b2c3d4e5f60718' })

            const ipCru = sanitizarLogSentry({
                attributes: { [chave]: '198.51.100.7' },
            })
            expect(ipCru.attributes).toEqual({})
            expect(JSON.stringify(ipCru.attributes)).not.toContain('198.51.100.7')
        },
    )

    it('um chamador que use `Sentry.logger.*` direto não vaza IP pela primeira barreira ausente', () => {
        // `sanitizarAtributosLog` só roda em quem passa por `logOperacional`.
        // Quem chamar o logger do SDK direto contorna a primeira barreira
        // inteira — por isso a validação de forma precisa existir aqui também.
        const log = sanitizarLogSentry({
            attributes: {
                camada: 'escrita_ip',
                chaveHash: '198.51.100.7',
                tenantHash: 'org_PII_TESTE',
                agendamentoHash: 'nao-e-hash',
            },
        })

        expect(log.attributes).toEqual({ camada: 'escrita_ip' })
        expect(JSON.stringify(log.attributes)).not.toContain('198.51.100.7')
        expect(JSON.stringify(log.attributes)).not.toContain('org_PII_TESTE')
    })
})

describe('exceções e negativas do beforeSendLog', () => {
    it('atributos meta do SDK (`sentry.` e `server.`) continuam passando', () => {
        // Concernimento do SDK, não do domínio: não passam pelo predicado.
        const log = sanitizarLogSentry({
            attributes: {
                'sentry.sdk.name': 'sentry.javascript.nextjs',
                'server.address': 'railway-us',
                fluxo: 'booking_publico',
            },
        })

        expect(log.attributes).toEqual({
            'sentry.sdk.name': 'sentry.javascript.nextjs',
            'server.address': 'railway-us',
            fluxo: 'booking_publico',
        })
    })

    it('chave desconhecida continua sendo descartada — a allowlist segue FECHADA', () => {
        const log = sanitizarLogSentry({
            attributes: {
                camada: 'escrita_ip',
                telefone: '5567999998888',
                nomeCliente: 'PII_TESTE_MARIA',
                orgId: 'org_PII_TESTE',
            },
        })

        expect(log.attributes).toEqual({ camada: 'escrita_ip' })

        const comoTexto = JSON.stringify(log.attributes)
        expect(comoTexto).not.toContain('5567999998888')
        expect(comoTexto).not.toContain('PII_TESTE_MARIA')
        expect(comoTexto).not.toContain('org_PII_TESTE')
    })
})
