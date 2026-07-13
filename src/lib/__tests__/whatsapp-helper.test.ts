import { describe, it, expect, vi, afterEach } from 'vitest'
import {
    processarMensagemTemplate,
    mapearEstadoEvolution,
    enviarMensagemWhatsApp,
    agendarLembreteQStash,
    cancelarLembreteQStash
} from '../whatsapp-helper'

// Os testes cobrem o contrato dos helpers sem credenciais reais: todo I/O
// passa por um fetch stubado.

function respostaHttp(status: number, body: unknown = {}) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
        text: async () => JSON.stringify(body)
    } as Response
}

describe('processarMensagemTemplate', () => {
    it('substitui as cinco variáveis do template', () => {
        const texto = processarMensagemTemplate({
            template: '{{cliente}} | {{empresa}} | {{data_hora}} | {{data}} | {{hora}}',
            clienteNome: 'Maria',
            empresaNome: 'Estúdio Ana',
            dataHoraStr: '13/07/2026 às 14:00'
        })
        expect(texto).toBe('Maria | Estúdio Ana | 13/07/2026 às 14:00 | 13/07/2026 | 14:00')
    })

    it('substitui ocorrências repetidas da mesma variável', () => {
        const texto = processarMensagemTemplate({
            template: 'Oi {{cliente}}! Até logo, {{cliente}}.',
            clienteNome: 'João',
            empresaNome: 'X',
            dataHoraStr: '01/01/2026 às 09:00'
        })
        expect(texto).toBe('Oi João! Até logo, João.')
    })
})

describe('mapearEstadoEvolution', () => {
    it('mapeia os estados conhecidos do gateway', () => {
        expect(mapearEstadoEvolution('open')).toBe('conectado')
        expect(mapearEstadoEvolution('connecting')).toBe('conectando')
        expect(mapearEstadoEvolution('close')).toBe('desconectado')
    })

    it('degrada para instavel quando o estado é ausente ou desconhecido', () => {
        expect(mapearEstadoEvolution(undefined)).toBe('instavel')
        expect(mapearEstadoEvolution(null)).toBe('instavel')
        expect(mapearEstadoEvolution('qualquer-coisa')).toBe('instavel')
    })
})

describe('enviarMensagemWhatsApp', () => {
    afterEach(() => vi.unstubAllGlobals())

    it('retorna ok em resposta 200 e prefixa 55 no telefone', async () => {
        const fetchMock = vi.fn(async () => respostaHttp(200))
        vi.stubGlobal('fetch', fetchMock)

        const res = await enviarMensagemWhatsApp('inst', 'token', '(67) 99999-8888', 'oi')
        expect(res).toEqual({ ok: true })

        const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
        expect(JSON.parse(init.body as string).number).toBe('5567999998888')
    })

    it('não duplica o 55 quando o telefone já tem código do país', async () => {
        const fetchMock = vi.fn(async () => respostaHttp(200))
        vi.stubGlobal('fetch', fetchMock)

        await enviarMensagemWhatsApp('inst', 'token', '5567999998888', 'oi')
        const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
        expect(JSON.parse(init.body as string).number).toBe('5567999998888')
    })

    it('retorna falha com motivo http_401 em resposta não autorizada', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => respostaHttp(401, { error: 'unauthorized' })))
        const res = await enviarMensagemWhatsApp('inst', 'token', '67999998888', 'oi')
        expect(res).toEqual({ ok: false, motivo: 'http_401' })
    })

    it('retorna falha com motivo erro_rede quando o fetch lança', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))
        const res = await enviarMensagemWhatsApp('inst', 'token', '67999998888', 'oi')
        expect(res).toEqual({ ok: false, motivo: 'erro_rede' })
    })
})

describe('agendarLembreteQStash', () => {
    // QSTASH_TOKEN vem do env fixado em vitest.config.ts (constante de módulo).
    afterEach(() => vi.unstubAllGlobals())

    it('extrai o messageId e envia o header Upstash-Not-Before em segundos', async () => {
        const fetchMock = vi.fn(async () => respostaHttp(200, { messageId: 'msg_123' }))
        vi.stubGlobal('fetch', fetchMock)

        const alvoMs = 1_800_000_000_000
        const res = await agendarLembreteQStash('ag-1', 'org_x', alvoMs)
        expect(res).toEqual({ ok: true, messageId: 'msg_123' })

        const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
        const headers = init.headers as Record<string, string>
        expect(headers['Upstash-Not-Before']).toBe(String(Math.floor(alvoMs / 1000)))
    })

    it('retorna falha quando o publish não devolve messageId', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => respostaHttp(200, {})))
        const res = await agendarLembreteQStash('ag-1', 'org_x', Date.now())
        expect(res).toEqual({ ok: false, motivo: 'sem_message_id' })
    })

    it('retorna falha com motivo http_429 quando o QStash rejeita', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => respostaHttp(429, {})))
        const res = await agendarLembreteQStash('ag-1', 'org_x', Date.now())
        expect(res).toEqual({ ok: false, motivo: 'http_429' })
    })
})

describe('cancelarLembreteQStash', () => {
    afterEach(() => vi.unstubAllGlobals())

    it('retorna ok em 200', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => respostaHttp(200)))
        expect(await cancelarLembreteQStash('msg_123')).toEqual({ ok: true })
    })

    it('trata 404 como sucesso brando (job já executado ou removido)', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => respostaHttp(404)))
        expect(await cancelarLembreteQStash('msg_123')).toEqual({ ok: true })
    })

    it('retorna falha nos demais erros HTTP', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => respostaHttp(500)))
        expect(await cancelarLembreteQStash('msg_123')).toEqual({ ok: false, motivo: 'http_500' })
    })
})
