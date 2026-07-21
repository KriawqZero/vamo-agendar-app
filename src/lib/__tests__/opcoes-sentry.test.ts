import { describe, it, expect } from 'vitest'

import { opcoesBaseSentry } from '../observabilidade/opcoes-sentry'
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
        expect(sanitizarBreadcrumb(entrada).data?.url).toBe('https://app.local/book/salao')
    })

    it('passa incólume por breadcrumb sem data.url', () => {
        const entrada: FormatoDeBreadcrumb & { category: string } = { category: 'navigation' }
        expect(() => sanitizarBreadcrumb(entrada)).not.toThrow()
        expect(sanitizarBreadcrumb(entrada)).toEqual({ category: 'navigation' })
    })
})
