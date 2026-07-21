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

    it('coleta headers por allowlist, nunca por denylist', () => {
        // Denylist aqui é furo estrutural: definir `dataCollection` troca a base
        // de defaults do SDK para o lado permissivo, e um `deny` nosso
        // SUBSTITUI o filtro de PII embutido em vez de somar a ele.
        const permitidos = opcoesBaseSentry.dataCollection.httpHeaders.request.allow
        expect(permitidos).toEqual(['content-type', 'accept-language', 'user-agent'])
        expect(opcoesBaseSentry.dataCollection.httpHeaders.response.allow).toEqual(['content-type'])
    })

    it('nenhum header de sessão ou de IP do cliente final é coletável', () => {
        const permitidos = [
            ...opcoesBaseSentry.dataCollection.httpHeaders.request.allow,
            ...opcoesBaseSentry.dataCollection.httpHeaders.response.allow,
        ]
        for (const proibido of [
            'cookie',
            'set-cookie',
            'authorization',
            'x-forwarded-for',
            'x-real-ip',
            'cf-connecting-ip',
            'true-client-ip',
            'x-client-ip',
            'forwarded',
        ]) {
            expect(permitidos).not.toContain(proibido)
        }
    })

    it('não coleta entrada nem saída de IA', () => {
        // `true/true` no conjunto permissivo do SDK. Inócuo hoje, trava mesmo
        // assim: quem ligar IA neste projeto não vai lembrar deste arquivo.
        expect(opcoesBaseSentry.dataCollection.genAI).toEqual({ inputs: false, outputs: false })
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

    it('substitui a identidade de usuário pela negação explícita de IP', () => {
        // WR-06: apagar o campo devolveria a decisão sobre inferir IP ao painel
        // do Sentry. `ip_address: null` é a instrução de não guardar.
        const evento = sanitizarEventoSentry({
            user: { id: 'org_123', email: 'maria@exemplo.com', ip_address: '191.0.2.10' },
        })
        expect(evento.user).toEqual({ ip_address: null })
        expect(JSON.stringify(evento)).not.toContain('maria@exemplo.com')
        expect(JSON.stringify(evento)).not.toContain('191.0.2.10')
    })

    it('passa incólume por evento sem request, sem lançar', () => {
        expect(() => sanitizarEventoSentry({})).not.toThrow()
        // Evento real carrega muito mais que `request` — os campos alheios à
        // sanitização precisam sobreviver intactos.
        const evento: FormatoDeEvento & { message: string; level: string } = {
            message: 'erro',
            level: 'error',
        }
        expect(sanitizarEventoSentry(evento)).toEqual({
            message: 'erro',
            level: 'error',
            user: { ip_address: null },
        })
    })

    // CR-02: a sanitização era denylist e não cobria os campos onde o projeto
    // de fato escreve. Allowlist onde é viável — chave nova cai fora sozinha.
    it('mantém em extra apenas as chaves da allowlist', () => {
        const evento = sanitizarEventoSentry({
            extra: {
                fluxo: 'booking_publico',
                etapa: 'buscar_cliente',
                statusCode: 500,
                // O que uma fase futura poderia escrever sem ninguém notar:
                email: 'maria@exemplo.com',
                telefone: '11999999999',
                clienteNome: 'Maria',
            },
        })

        expect(evento.extra).toEqual({
            fluxo: 'booking_publico',
            etapa: 'buscar_cliente',
            statusCode: 500,
        })
        expect(JSON.stringify(evento)).not.toContain('maria@exemplo.com')
        expect(JSON.stringify(evento)).not.toContain('11999999999')
        expect(JSON.stringify(evento)).not.toContain('Maria')
    })

    it('mantém em request apenas method, url e headers — campo novo cai fora', () => {
        const evento = sanitizarEventoSentry({
            request: {
                method: 'POST',
                url: 'https://app.local/book/salao',
                data: { telefone: '11999999999' },
                cookies: { sessao: 'abc' },
                query_string: 'nome=Maria',
                // Campo que o SDK pode passar a mandar amanhã: a denylist
                // antiga deixaria passar em silêncio.
                env: { REMOTE_ADDR: '191.0.2.10' },
            } as never,
        })

        expect(evento.request).toEqual({ method: 'POST', url: 'https://app.local/book/salao' })
    })

    // CR-03(a): o `deny` do SDK substituía o filtro de PII embutido, e o
    // Railway põe `x-real-ip` em toda requisição. IP é dado pessoal (LGPD).
    it('mantém nos headers apenas a allowlist, derrubando todos os headers de IP', () => {
        const evento = sanitizarEventoSentry({
            request: {
                url: 'https://app.local/book/salao',
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'content-type': 'application/json',
                    'x-real-ip': '191.0.2.10',
                    'cf-connecting-ip': '191.0.2.10',
                    'true-client-ip': '191.0.2.10',
                    'x-forwarded-for': '191.0.2.10',
                    Forwarded: 'for=191.0.2.10',
                    cookie: '__session=abc',
                    authorization: 'Bearer token',
                },
            },
        })

        expect(evento.request?.headers).toEqual({
            'User-Agent': 'Mozilla/5.0',
            'content-type': 'application/json',
        })
        expect(JSON.stringify(evento)).not.toContain('191.0.2.10')
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
