import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, it, expect, afterEach } from 'vitest'

import {
    HOST_POSTHOG_PADRAO,
    hostPostHog,
    opcoesInitPostHog,
    opcoesServidorPostHog,
} from '../analytics/opcoes-posthog'

/**
 * A trava anti-PII do PostHog é asserção de teste sobre o objeto de opções
 * versionado — nunca toggle do painel.
 *
 * Este arquivo existe por causa de um fato concreto, não de uma hipótese: o
 * wizard oficial (`npx @posthog/wizard`) apagou estas cinco flags duas vezes
 * em 2026-07-21, porque elas moravam dentro da função de init que ele
 * reescreveu. Reescrever a init é justamente o que o wizard faz de bom. Estar
 * aqui é o que torna a remoção barulhenta.
 */
describe('as cinco travas inegociáveis de opcoesInitPostHog', () => {
    // `/book/[slug]` é público e SEM LOGIN: quem digita nome e telefone ali é
    // um desconhecido que nunca criou conta. Cada linha desta tabela é uma
    // porta que precisa continuar fechada.
    const travas = [
        ['capture_pageview', false],
        ['person_profiles', 'identified_only'],
        ['autocapture', false],
        ['disable_session_recording', true],
        ['disable_surveys', true],
    ] as const

    it.each(travas)('mantém %s travado em %s', (opcao, valor) => {
        expect(opcoesInitPostHog[opcao]).toBe(valor)
    })

    it('nenhuma das cinco some do objeto sem quebrar este teste', () => {
        // `toBe` acima passaria por acidente se a chave sumisse e o valor
        // esperado fosse `undefined`. Aqui a presença é afirmada à parte.
        for (const [opcao] of travas) {
            expect(Object.keys(opcoesInitPostHog)).toContain(opcao)
        }
    })
})

describe('exceção é do Sentry, não do PostHog', () => {
    // O caminho do PostHog não passa por `sanitizarEventoSentry` nem pelo
    // `beforeSend` — ligar captura de exceção aqui seria uma segunda
    // superfície de PII sem nenhuma das travas de `opcoes-sentry.ts`.
    it('não captura exceção no browser', () => {
        expect(opcoesInitPostHog.capture_exceptions).toBe(false)
    })

    it('não captura exceção no servidor', () => {
        expect(opcoesServidorPostHog.enableExceptionAutocapture).toBe(false)
    })
})

describe('opções que o SDK deixa o painel decidir', () => {
    // Estas três são `undefined` no SDK, e `undefined` significa remote config:
    // o painel liga sozinho. É o mesmo furo que `disable_session_recording`
    // fecha — travar replay e deixar heatmap aberto seria trancar a porta e
    // esquecer a janela.
    it.each(['capture_heatmaps', 'capture_dead_clicks', 'rageclick'] as const)(
        '%s é explicitamente false, nunca undefined',
        (opcao) => {
            expect(opcoesInitPostHog[opcao]).toBe(false)
        },
    )

    it('não captura fragmento de URL', () => {
        expect(opcoesInitPostHog.disable_capture_url_hashes).toBe(true)
    })
})

describe('opcoesServidorPostHog', () => {
    it('desliga o batch — invocação do Next morre antes do flush periódico', () => {
        expect(opcoesServidorPostHog.flushAt).toBe(1)
        expect(opcoesServidorPostHog.flushInterval).toBe(0)
    })

    it('não geolocaliza: o IP de um evento de servidor é o do datacenter', () => {
        expect(opcoesServidorPostHog.disableGeoip).toBe(true)
    })
})

describe('hostPostHog', () => {
    const original = process.env.NEXT_PUBLIC_POSTHOG_HOST

    afterEach(() => {
        if (original === undefined) delete process.env.NEXT_PUBLIC_POSTHOG_HOST
        else process.env.NEXT_PUBLIC_POSTHOG_HOST = original
    })

    it('cai na região US quando a var não está definida', () => {
        // O host é OPCIONAL por decisão: tratar ausência como "PostHog
        // desligado" faria um env faltando virar zero evento sem nenhum erro.
        delete process.env.NEXT_PUBLIC_POSTHOG_HOST
        expect(hostPostHog()).toBe(HOST_POSTHOG_PADRAO)
        expect(HOST_POSTHOG_PADRAO).toBe('https://us.i.posthog.com')
    })

    it('respeita a var quando definida (projeto EU, proxy reverso)', () => {
        process.env.NEXT_PUBLIC_POSTHOG_HOST = 'https://eu.i.posthog.com'
        expect(hostPostHog()).toBe('https://eu.i.posthog.com')
    })
})

/**
 * As opções só protegem alguma coisa se os arquivos de init as CONSUMIREM.
 * Um init que remonte o objeto à mão vaza a trava por esse arquivo — foi
 * exatamente assim que ela vazou nas duas rodadas do wizard.
 */
describe('arquivos de init do PostHog', () => {
    const raiz = join(__dirname, '..', '..')
    const ler = (caminho: string) => readFileSync(join(raiz, caminho), 'utf-8')

    it('instrumentation-client.ts inicializa por spread do módulo de opções', () => {
        expect(ler('instrumentation-client.ts')).toContain('...opcoesInitPostHog')
    })

    it('server.ts monta o cliente por spread do módulo de opções', () => {
        expect(ler('lib/analytics/server.ts')).toContain('...opcoesServidorPostHog')
    })

    it('nenhuma flag de PII é literal inline nos arquivos de init', () => {
        // Se alguém colar `autocapture: false` direto no init, a trava passa a
        // ter duas fontes e este teste deixa de garantir a que vale.
        for (const arquivo of ['instrumentation-client.ts', 'lib/analytics/server.ts']) {
            const fonte = ler(arquivo)
            expect(fonte).not.toContain('autocapture:')
            expect(fonte).not.toContain('disable_session_recording')
            expect(fonte).not.toContain('person_profiles')
        }
    })

    it('evento de servidor não cria perfil de pessoa', () => {
        // Decisão documentada em docs/08: a identidade nasce no client, via
        // identify com o hash do tenant. O wizard já removeu esta linha uma vez.
        expect(ler('lib/analytics/server.ts')).toContain('$process_person_profile: false')
    })

    it('server.ts mantém o fallback para fora de contexto de request', () => {
        // `after()` LANÇA fora de contexto de request, e o webhook do lembrete
        // é esse caso. Sem o fallback, o lembrete some do funil.
        const fonte = ler('lib/analytics/server.ts')
        expect(fonte).toContain('after(() => enviarAoPostHog(evento, props, distinctId))')
        expect(fonte).toContain('void enviarAoPostHog(evento, props, distinctId)')
    })
})

/**
 * Renomear a variável quebra `docs/08`, o `.env.example`, o Railway e a lista
 * de `src/lib/env.ts` de uma vez — e o sintoma é "nenhum evento chega", sem
 * erro nenhum. O wizard tentou trocar para `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`
 * na primeira rodada.
 */
describe('nome da variável de ambiente', () => {
    const raiz = join(__dirname, '..', '..')
    const ler = (caminho: string) => readFileSync(join(raiz, caminho), 'utf-8')
    const arquivos = [
        'instrumentation-client.ts',
        'lib/analytics/client.ts',
        'lib/analytics/server.ts',
    ]

    it.each(arquivos)('%s lê NEXT_PUBLIC_POSTHOG_KEY', (arquivo) => {
        expect(ler(arquivo)).toContain('NEXT_PUBLIC_POSTHOG_KEY')
    })

    it.each(arquivos)('%s não usa o nome inventado pelo wizard', (arquivo) => {
        expect(ler(arquivo)).not.toContain('NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN')
    })
})
