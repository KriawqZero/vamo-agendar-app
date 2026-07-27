import { describe, it, expect, vi, afterEach } from 'vitest'

import { validarEnvObrigatorio, OBRIGATORIAS_EM_PRODUCAO } from '../env'
import { encerrarBootPorEnvAusente, CODIGO_SAIDA_ENV_AUSENTE } from '../env-boot'

/**
 * `vi.stubEnv` por teste (Vitest 4) — nunca constante de módulo, para que
 * nenhuma variável nova precise entrar no `vitest.config.ts`. As espiãs de
 * `process` do bloco de encerramento são restauradas aqui pelo mesmo motivo:
 * nada de setup global.
 */
afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
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

    it('em produção sem as DUAS do Upstash lança nomeando ambas na mesma mensagem', () => {
        vi.stubEnv('NODE_ENV', 'production')
        const ausentes = ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']
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
        // As duas de uma vez, junto de qualquer outra ausente: descobrir uma
        // variável por deploy é o modo de falha que a lista inteira evita.
        for (const nome of ausentes) expect(mensagem).toContain(nome)
    })

    it('fora de produção, ausência das do Upstash NÃO lança (no-op declarado — D-04)', () => {
        vi.stubEnv('NODE_ENV', 'development')
        preencherTodas(['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'])
        vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
        vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')

        // Dev roda sem Upstash de propósito (não consumir a janela de um
        // database compartilhado com produção): o rate limit fica em no-op
        // com aviso de console, e isso é o comportamento desejado — não pode
        // derrubar o boot local.
        expect(() => validarEnvObrigatorio()).not.toThrow()
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
    it('tem os dezesseis nomes acordados, sem duplicata', () => {
        expect(OBRIGATORIAS_EM_PRODUCAO).toHaveLength(16)
        expect(new Set(OBRIGATORIAS_EM_PRODUCAO).size).toBe(16)
    })

    it('exige as DUAS chaves de assinatura do QStash (SEG-05)', () => {
        // Só a atual não basta: o Receiver usa a próxima para rotacionar chave
        // sem janela de quebra, e sem ela o webhook lança em runtime.
        expect(OBRIGATORIAS_EM_PRODUCAO).toContain('QSTASH_CURRENT_SIGNING_KEY')
        expect(OBRIGATORIAS_EM_PRODUCAO).toContain('QSTASH_NEXT_SIGNING_KEY')
    })

    it('exige as DUAS credenciais do Upstash Redis (Phase 3, D-04)', () => {
        // Critério de entrada da lista, satisfeito da forma mais literal
        // possível: sem elas o rate limit inteiro entra em NO-OP silencioso —
        // toda requisição passa, nenhum erro aparece, e o produto sobe em
        // produção anunciando uma proteção que não existe. É exatamente o
        // falso-verde que esta lista existe para matar.
        expect(OBRIGATORIAS_EM_PRODUCAO).toContain('UPSTASH_REDIS_REST_URL')
        expect(OBRIGATORIAS_EM_PRODUCAO).toContain('UPSTASH_REDIS_REST_TOKEN')
    })

    it('não inclui as chaves do Clerk (falham alto e imediato por conta própria)', () => {
        const nomes = OBRIGATORIAS_EM_PRODUCAO.join(',')
        expect(nomes).not.toContain('CLERK')
    })
})

/**
 * Trava do modo de falha que a `01-VERIFICATION.md` reprovou: sem encerramento
 * de verdade, o Next 16.2.10 segue escutando com todo o tráfego em 500 e o
 * healthcheck de liveness marca o deploy como verde. Este bloco existe para que
 * uma refatoração futura não troque o `process.exit(1)` por um log com
 * `process.exitCode = 0` e devolva o produto àquele estado sem ninguém notar.
 */
describe('encerrarBootPorEnvAusente', () => {
    /** `process.exit` de verdade mataria o vitest no meio da suíte. */
    const SENTINELA = 'saida-do-processo-interceptada-pelo-teste'

    it('escreve a mensagem em stderr ANTES de encerrar, com o código combinado', () => {
        const espiaStderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
        const espiaExit = vi.spyOn(process, 'exit').mockImplementation(() => {
            throw new Error(SENTINELA)
        })

        const mensagem = 'Variáveis obrigatórias ausentes em produção: QSTASH_NEXT_SIGNING_KEY'
        expect(() => encerrarBootPorEnvAusente(mensagem)).toThrow(SENTINELA)

        const escrito = espiaStderr.mock.calls.map(([texto]) => String(texto)).join('')
        expect(escrito).toContain(mensagem)
        expect(espiaExit).toHaveBeenCalledWith(CODIGO_SAIDA_ENV_AUSENTE)

        // A ordem é o ponto: invertida, o log do deploy perde a causa e o
        // operador descobre a variável por bissecção. Comparada por índice de
        // invocação, não por inspeção visual.
        expect(espiaStderr.mock.invocationCallOrder[0]).toBeLessThan(
            espiaExit.mock.invocationCallOrder[0],
        )
    })

    it('usa código de saída 1 — zero devolveria o falso verde por outro caminho', () => {
        // Um orquestrador de deploy reprova a release por código ≠ 0. `0`
        // significaria "encerrou com sucesso" e o rollback automático nunca
        // dispararia.
        expect(CODIGO_SAIDA_ENV_AUSENTE).toBe(1)
    })
})
