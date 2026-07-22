import { describe, it, expect, vi, afterEach } from 'vitest'
import {
    processarMensagemTemplate,
    mapearEstadoEvolution,
    enviarMensagemWhatsApp,
    agendarLembreteQStash,
    cancelarLembreteQStash,
} from '../whatsapp-helper'

// Os testes cobrem o contrato dos helpers sem credenciais reais: todo I/O
// passa por um fetch stubado.

function respostaHttp(status: number, body: unknown = {}) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
        text: async () => JSON.stringify(body),
    } as Response
}

// Tudo que foi ao console.error, argumentos JUNTOS e serializados. A asserção de
// higiene precisa ser negativa e sobre a chamada inteira: logar o corpo do gateway
// no SEGUNDO argumento era exatamente o defeito, e um objeto passado cru
// (`console.error(msg, dataRes)`) some num `join(' ')` virando '[object Object]'.
function textoLogado(spy: { mock: { calls: unknown[][] } }): string {
    return JSON.stringify(spy.mock.calls)
}

// Valor fixado em vitest.config.ts — a MESMA chave HMAC com que o webhook de
// lembrete autentica quem chama. Nunca pode aparecer na URL publicada.
const CHAVE_ASSINATURA_TESTE = 'sig-atual-teste'

/** A URL de destino publicada, extraída de dentro da URL de publish do QStash. */
function urlDeDestinoPublicada(urlPublish: string): string {
    return urlPublish.split('/v2/publish/')[1] ?? ''
}

describe('processarMensagemTemplate', () => {
    it('substitui as cinco variáveis do template', () => {
        const texto = processarMensagemTemplate({
            template: '{{cliente}} | {{empresa}} | {{data_hora}} | {{data}} | {{hora}}',
            clienteNome: 'Maria',
            empresaNome: 'Estúdio Ana',
            dataHoraStr: '13/07/2026 às 14:00',
        })
        expect(texto).toBe('Maria | Estúdio Ana | 13/07/2026 às 14:00 | 13/07/2026 | 14:00')
    })

    it('substitui ocorrências repetidas da mesma variável', () => {
        const texto = processarMensagemTemplate({
            template: 'Oi {{cliente}}! Até logo, {{cliente}}.',
            clienteNome: 'João',
            empresaNome: 'X',
            dataHoraStr: '01/01/2026 às 09:00',
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
    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

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
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => respostaHttp(401, { error: 'unauthorized' })),
        )
        const res = await enviarMensagemWhatsApp('inst', 'token', '67999998888', 'oi')
        expect(res).toEqual({ ok: false, motivo: 'http_401' })
    })

    it('retorna falha com motivo erro_rede quando o fetch lança', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => {
                throw new Error('ECONNREFUSED')
            }),
        )
        const res = await enviarMensagemWhatsApp('inst', 'token', '67999998888', 'oi')
        expect(res).toEqual({ ok: false, motivo: 'erro_rede' })
    })

    // TRAVA DO INVARIANTE PERMANENTE DO PROJETO: nunca PII em log ou telemetria.
    // O corpo de erro da Evolution ecoa o telefone e o texto já com {{cliente}}
    // substituído (fato observado, registrado em docs/09). A sanitização do Sentry
    // cobre breadcrumb, não o log do Railway — a trava tem de estar no código.
    it('não deixa telefone nem texto personalizado do cliente chegarem ao log', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const corpoComPii = {
            status: 401,
            error: 'Unauthorized',
            response: {
                message: [
                    {
                        number: '5567999998888',
                        text: 'Oi Maria! Seu horário no Estúdio Ana é dia 13/07/2026 às 14:00.',
                    },
                ],
            },
        }
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => respostaHttp(401, corpoComPii)),
        )

        const res = await enviarMensagemWhatsApp(
            'inst',
            'token',
            '67999998888',
            'Oi Maria! Seu horário no Estúdio Ana é dia 13/07/2026 às 14:00.',
        )

        expect(spy).toHaveBeenCalled()
        const logado = textoLogado(spy)
        expect(logado).not.toContain('5567999998888')
        expect(logado).not.toContain('999998888')
        expect(logado).not.toContain('Maria')
        expect(logado).not.toContain('Estúdio Ana')
        // O código HTTP é o que PODE ir ao log — e é o que sustenta o diagnóstico.
        expect(logado).toContain('401')
        // Higiene de log não pode ter mexido no contrato de retorno.
        expect(res).toEqual({ ok: false, motivo: 'http_401' })
    })
})

describe('agendarLembreteQStash', () => {
    // QSTASH_TOKEN vem do env fixado em vitest.config.ts (constante de módulo).
    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

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
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => respostaHttp(200, {})),
        )
        const res = await agendarLembreteQStash('ag-1', 'org_x', Date.now())
        expect(res).toEqual({ ok: false, motivo: 'sem_message_id' })
    })

    it('retorna falha com motivo http_429 quando o QStash rejeita', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => respostaHttp(429, {})),
        )
        const res = await agendarLembreteQStash('ag-1', 'org_x', Date.now())
        expect(res).toEqual({ ok: false, motivo: 'http_429' })
    })

    // TRAVA: a URL de destino é armazenada pela Upstash (visível no console por até
    // 14 dias) e vai à linha de requisição do log de acesso de cada hop. Qualquer
    // parâmetro anexado ali é publicação em texto claro.
    it('publica numa URL de destino sem query string', async () => {
        const fetchMock = vi.fn(async () => respostaHttp(200, { messageId: 'msg_1' }))
        vi.stubGlobal('fetch', fetchMock)

        await agendarLembreteQStash('ag-1', 'org_x', Date.now())

        const [urlPublish] = fetchMock.mock.calls[0] as unknown as [string]
        expect(urlDeDestinoPublicada(urlPublish)).not.toContain('?')
    })

    // TRAVA da regressão específica que este plano fecha: a chave de assinatura é
    // HMAC SIMÉTRICA — a mesma com que o webhook autentica quem chama. Publicada,
    // ela permite forjar um Upstash-Signature válido e disparar WhatsApp em nome
    // de qualquer tenant.
    it('não publica a chave de assinatura do QStash em posição nenhuma da URL', async () => {
        const fetchMock = vi.fn(async () => respostaHttp(200, { messageId: 'msg_1' }))
        vi.stubGlobal('fetch', fetchMock)

        await agendarLembreteQStash('ag-1', 'org_x', Date.now())

        const [urlPublish] = fetchMock.mock.calls[0] as unknown as [string]
        expect(urlPublish).not.toContain(CHAVE_ASSINATURA_TESTE)
    })

    // TRAVA: o corpo de erro do QStash costuma ecoar a URL de destino — enquanto a
    // chave circulou nela, logar o corpo era vazar o segredo no log da aplicação.
    it('não deixa a URL de destino ecoada pelo QStash chegar ao log', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const urlDestino = 'https://vamoagendar.com.br/api/webhooks/lembrete'
        vi.stubGlobal(
            'fetch',
            vi.fn(async () =>
                respostaHttp(429, {
                    error: `rate limit exceeded for destination ${urlDestino}`,
                }),
            ),
        )

        const res = await agendarLembreteQStash('ag-1', 'org_x', Date.now())

        expect(spy).toHaveBeenCalled()
        const logado = textoLogado(spy)
        expect(logado).not.toContain(urlDestino)
        expect(logado).not.toContain('/api/webhooks/lembrete')
        expect(logado).toContain('429')
        expect(res).toEqual({ ok: false, motivo: 'http_429' })
    })

    // TRAVA da quarta linha, do mesmo tipo: o objeto de resposta já parseado também
    // pode ecoar a URL de destino, e era despejado cru quando faltava o messageId.
    it('não despeja o objeto de resposta no log quando falta o messageId', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
        vi.stubGlobal(
            'fetch',
            vi.fn(async () =>
                respostaHttp(200, {
                    destination: 'https://vamoagendar.com.br/api/webhooks/lembrete',
                }),
            ),
        )

        const res = await agendarLembreteQStash('ag-1', 'org_x', Date.now())

        expect(spy).toHaveBeenCalled()
        expect(textoLogado(spy)).not.toContain('/api/webhooks/lembrete')
        expect(res).toEqual({ ok: false, motivo: 'sem_message_id' })
    })
})

describe('cancelarLembreteQStash', () => {
    afterEach(() => vi.unstubAllGlobals())

    it('retorna ok em 200', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => respostaHttp(200)),
        )
        expect(await cancelarLembreteQStash('msg_123')).toEqual({ ok: true })
    })

    it('trata 404 como sucesso brando (job já executado ou removido)', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => respostaHttp(404)),
        )
        expect(await cancelarLembreteQStash('msg_123')).toEqual({ ok: true })
    })

    it('retorna falha nos demais erros HTTP', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => respostaHttp(500)),
        )
        expect(await cancelarLembreteQStash('msg_123')).toEqual({ ok: false, motivo: 'http_500' })
    })
})
