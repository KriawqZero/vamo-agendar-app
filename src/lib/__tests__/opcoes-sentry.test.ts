import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, it, expect } from 'vitest'

import { opcoesBaseSentry, semIntegracaoDeConsole } from '../observabilidade/opcoes-sentry'
import type { FormatoDeBreadcrumb, FormatoDeEvento } from '../observabilidade/sanitizacao'
import { sanitizarEventoSentry, sanitizarBreadcrumb } from '../observabilidade/sanitizacao'

/**
 * A trava anti-PII do Sentry é asserção de teste sobre o objeto de opções
 * versionado — nunca toggle do painel. Se alguém afrouxar uma dessas opções,
 * o teste quebra antes de o evento vazar.
 */
describe('opcoesBaseSentry', () => {
    it('mantém sendDefaultPii desligado', () => {
        expect(opcoesBaseSentry.sendDefaultPii).toBe(false)
    })

    it('não coleta trace (só erro nesta etapa)', () => {
        expect(opcoesBaseSentry.tracesSampleRate).toBe(0)
    })

    it('nega identidade de usuário na coleta de dados', () => {
        expect(opcoesBaseSentry.dataCollection.userInfo).toBe(false)
    })

    it('nega querystring, cookies e corpo de requisição', () => {
        expect(opcoesBaseSentry.dataCollection.urlQueryParams).toBe(false)
        expect(opcoesBaseSentry.dataCollection.cookies).toBe(false)
        expect(opcoesBaseSentry.dataCollection.httpBodies).toEqual([])
    })

    it('nega os headers que carregam sessão e IP do cliente final', () => {
        const negados = opcoesBaseSentry.dataCollection.httpHeaders.request.deny
        expect(negados).toContain('cookie')
        expect(negados).toContain('authorization')
        expect(negados).toContain('x-forwarded-for')
    })

    it('não captura variáveis locais do stack nem dados de query do banco', () => {
        // Uma Server Action pública tem `nome` e `telefone` como variáveis
        // locais, e a resposta do Supabase carrega a linha do cliente.
        // Os dois campos são `true` por padrão no SDK — desligar é obrigatório.
        expect(opcoesBaseSentry.dataCollection.stackFrameVariables).toBe(false)
        expect(opcoesBaseSentry.dataCollection.databaseQueryData).toBe(false)
    })
})

describe('sanitizarEventoSentry', () => {
    it('remove a querystring da URL da requisição', () => {
        const evento = sanitizarEventoSentry({
            request: { url: 'https://app.local/book/salao?telefone=11999999999' },
        })
        expect(evento.request?.url).toBe('https://app.local/book/salao')
    })

    it('remove a querystring guardada à parte no evento', () => {
        const evento = sanitizarEventoSentry({
            request: { url: 'https://app.local/book/salao', query_string: 'nome=Maria' },
        })
        expect(evento.request?.query_string).toBeUndefined()
    })

    it('remove o corpo da requisição', () => {
        const evento = sanitizarEventoSentry({
            request: { url: 'https://app.local/', data: { telefone: '11999999999' } },
        })
        expect(evento.request?.data).toBeUndefined()
    })

    it('remove os cookies', () => {
        const evento = sanitizarEventoSentry({
            request: { url: 'https://app.local/', cookies: { sessao: 'abc' } },
        })
        expect(evento.request?.cookies).toBeUndefined()
    })

    it('remove a identidade de usuário do evento', () => {
        const evento = sanitizarEventoSentry({
            user: { id: 'org_123', email: 'maria@exemplo.com' },
        })
        expect(evento.user).toBeUndefined()
    })

    it('passa incólume por evento sem request, sem lançar', () => {
        expect(() => sanitizarEventoSentry({})).not.toThrow()
        // Evento real carrega muito mais que `request` — os campos alheios à
        // sanitização precisam sobreviver intactos.
        const evento: FormatoDeEvento & { message: string; level: string } = {
            message: 'erro',
            level: 'error',
        }
        expect(sanitizarEventoSentry(evento)).toEqual({ message: 'erro', level: 'error' })
    })
})

describe('sanitizarBreadcrumb', () => {
    it('remove a querystring da URL de breadcrumb de fetch/xhr', () => {
        const entrada: FormatoDeBreadcrumb & { category: string } = {
            category: 'fetch',
            data: { url: 'https://app.local/book/salao?telefone=11999999999' },
        }
        expect(sanitizarBreadcrumb(entrada)?.data?.url).toBe('https://app.local/book/salao')
    })

    it('remove também o fragmento da URL, não só a querystring', () => {
        const entrada: FormatoDeBreadcrumb & { category: string } = {
            category: 'navigation',
            data: { url: 'https://app.local/book/salao#telefone=11999999999' },
        }
        expect(sanitizarBreadcrumb(entrada)?.data?.url).toBe('https://app.local/book/salao')
    })

    it('passa incólume por breadcrumb sem data.url', () => {
        const entrada: FormatoDeBreadcrumb & { category: string } = { category: 'navigation' }
        expect(() => sanitizarBreadcrumb(entrada)).not.toThrow()
        expect(sanitizarBreadcrumb(entrada)).toEqual({ category: 'navigation' })
    })

    // CR-01: o breadcrumb de console é o vazamento de maior severidade da etapa.
    // Ele carrega `message` E `data.arguments`, e fica no isolation scope da
    // requisição até ser anexado ao próximo evento — contexto de reporte limpo
    // não protege nada.
    it('DESCARTA breadcrumb de console que carrega a chave de assinatura do QStash', () => {
        const urlComSecret =
            'https://qstash.local/v2/publish/https://app.local/api/webhooks/lembrete?secret=sig_chave_real'
        // O formato é o do SDK: `data.arguments` guarda os objetos crus e
        // `message` o texto formatado (@sentry/core/integrations/console.js).
        const entrada: FormatoDeBreadcrumb & {
            message: string
            level: string
            data: { url?: unknown; arguments: unknown[]; logger: string }
        } = {
            category: 'console',
            level: 'error',
            message: `Falha ao registrar agendamento no QStash (401): {"url":"${urlComSecret}"}`,
            data: { arguments: [urlComSecret], logger: 'console' },
        }

        const saida = sanitizarBreadcrumb(entrada)

        expect(saida).toBeNull()
        expect(JSON.stringify(saida)).not.toContain('sig_chave_real')
        expect(JSON.stringify(saida)).not.toContain('secret=')
    })

    it('DESCARTA breadcrumb de console que carrega nome e telefone do cliente final', () => {
        const entrada: FormatoDeBreadcrumb & { message: string } = {
            category: 'console',
            message:
                'Erro ao disparar WhatsApp via Evolution (400): {"number":"5511999999999","text":"Oi Maria, seu horário está confirmado"}',
        }

        const saida = sanitizarBreadcrumb(entrada)

        expect(saida).toBeNull()
        expect(JSON.stringify(saida)).not.toContain('5511999999999')
        expect(JSON.stringify(saida)).not.toContain('Maria')
    })
})

/**
 * A remoção da integração `Console` é configuração, e configuração some numa
 * refatoração distraída. Estes testes fazem a trava quebrar o CI em vez de
 * quebrar o cliente final — que é o pedido explícito do achado CR-01.
 */
describe('semIntegracaoDeConsole', () => {
    it('remove a integração Console e preserva as demais', () => {
        const defaults = [{ name: 'Http' }, { name: 'Console' }, { name: 'OnUncaughtException' }]

        expect(semIntegracaoDeConsole(defaults)).toEqual([
            { name: 'Http' },
            { name: 'OnUncaughtException' },
        ])
    })
})

describe('arquivos de init do Sentry', () => {
    const raiz = join(__dirname, '..', '..')
    const ler = (caminho: string) => readFileSync(join(raiz, caminho), 'utf-8')

    it.each(['sentry.server.config.ts', 'sentry.edge.config.ts'])(
        '%s remove a integração de console',
        (arquivo) => {
            expect(ler(arquivo)).toContain('integrations: semIntegracaoDeConsole')
        },
    )

    it('instrumentation-client.ts desliga o breadcrumb de console no browser', () => {
        // No browser a origem é a `breadcrumbsIntegration`, não a `Console`.
        expect(ler('instrumentation-client.ts')).toContain('console: false')
    })

    it.each(['sentry.server.config.ts', 'sentry.edge.config.ts', 'instrumentation-client.ts'])(
        '%s passa pelos dois sanitizadores',
        (arquivo) => {
            const fonte = ler(arquivo)
            expect(fonte).toContain('beforeSend: sanitizarEventoSentry')
            expect(fonte).toContain('beforeBreadcrumb: sanitizarBreadcrumb')
        },
    )
})
