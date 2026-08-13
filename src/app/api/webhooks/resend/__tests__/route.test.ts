import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '../route'
import * as adminModule from '@/lib/supabase/admin'
import * as reportarModule from '@/lib/observabilidade/reportar'

interface VerifyOptions {
    webhookSecret?: string
    headers?: {
        signature?: string
        id?: string
    }
}

/**
 * ⚠️ O mock DEVE devolver apenas tipos de evento que existam no union
 * `WebhookEvent` do SDK instalado.
 *
 * A versão anterior fabricava `type: 'suppression.added'`, um evento que o Resend
 * NUNCA envia — e como o handler cast(av)a o retorno de `verify()` com
 * `as unknown as`, nem o compilador nem esta suíte percebiam. O resultado era um
 * teste verde sobre um branch morto: a supressão (EML-06) jamais era processada
 * em produção. O evento real é `email.suppressed`.
 */
const verifyMock = vi.fn((options: VerifyOptions) => {
    if (options.webhookSecret !== 'whsec_valido') {
        throw new Error('Assinatura inválida')
    }
    if (options.headers?.signature === 'sig_invalida') {
        throw new Error('Assinatura inválida')
    }
    if (options.headers?.id === 'msg_sem_source') {
        return {
            type: 'email.suppressed',
            data: { to: ['vazado@exemplo.com'], email_id: null },
        }
    }
    if (options.headers?.id === 'msg_evento_ignorado') {
        return {
            type: 'email.delivered',
            data: { to: ['entregue@exemplo.com'], email_id: 'resend-999' },
        }
    }
    if (options.headers?.id === 'msg_evento_inexistente') {
        // Contraprova do defeito original: o tipo que a fase escutava por engano
        // não pode ser tratado como evento de reputação.
        return {
            type: 'suppression.added',
            data: { to: ['cliente-sigiloso@exemplo.com'], email_id: 'resend-123' },
        }
    }
    if (options.headers?.id === 'msg_bounce') {
        return {
            type: 'email.bounced',
            data: { to: ['cliente-sigiloso@exemplo.com'], email_id: 'resend-456' },
        }
    }
    return {
        type: 'email.suppressed',
        data: {
            to: ['cliente-sigiloso@exemplo.com'],
            email_id: 'resend-123',
        },
    }
})

vi.mock('resend', () => {
    return {
        Resend: class {
            webhooks = {
                verify: verifyMock,
            }
        },
    }
})

vi.mock('@/lib/supabase/admin', () => ({
    createAdminClient: vi.fn(),
}))

vi.mock('@/lib/observabilidade/reportar', () => ({
    reportarExcecao: vi.fn(),
    reportarExcecaoAguardando: vi.fn(async () => {}),
    reportarFalhaSilenciosa: vi.fn(),
    reportarFalhaSilenciosaAguardando: vi.fn(async () => {}),
}))

/** Cliente Supabase mockado devolvendo um resultado de `maybeSingle` sob medida. */
function mockarSupabase(resultado: { data: unknown; error: unknown }) {
    const maybeSingle = vi.fn().mockResolvedValue(resultado)
    vi.mocked(adminModule.createAdminClient).mockReturnValue({
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
    } as unknown as ReturnType<typeof adminModule.createAdminClient>)
    return maybeSingle
}

function requisicao(svixId: string, assinatura = 'v1,valida') {
    return new NextRequest('http://localhost/api/webhooks/resend', {
        method: 'POST',
        headers: {
            'svix-id': svixId,
            'svix-timestamp': '12345678',
            'svix-signature': assinatura,
        },
        body: JSON.stringify({ type: 'email.suppressed' }),
    })
}

describe('Route Handler POST /api/webhooks/resend', () => {
    const envOriginal = process.env.RESEND_WEBHOOK_SECRET

    beforeEach(() => {
        vi.clearAllMocks()
        process.env.RESEND_WEBHOOK_SECRET = 'whsec_valido'
    })

    afterEach(() => {
        process.env.RESEND_WEBHOOK_SECRET = envOriginal
    })

    it('retorna 401 se os headers de verificação do Svix estiverem ausentes', async () => {
        const req = new NextRequest('http://localhost/api/webhooks/resend', {
            method: 'POST',
            body: JSON.stringify({ type: 'email.suppressed' }),
        })

        const res = await POST(req)
        expect(res.status).toBe(401)
        const body = await res.json()
        expect(body.erro).toContain('Headers de verificação de webhook ausentes')
    })

    it('retorna 503 e REPORTA quando RESEND_WEBHOOK_SECRET não está configurado', async () => {
        delete process.env.RESEND_WEBHOOK_SECRET

        const res = await POST(requisicao('id_123'))
        expect(res.status).toBe(503)

        // O 503 mudo era como o canal de reputação morria sem ninguém ver: o
        // Resend retenta, desiste e desabilita o endpoint.
        expect(reportarModule.reportarFalhaSilenciosaAguardando).toHaveBeenCalledWith(
            'resend:webhook_secret_ausente',
        )
    })

    it('retorna 401 para assinatura inválida', async () => {
        const res = await POST(requisicao('id_123', 'sig_invalida'))
        expect(res.status).toBe(401)
    })

    it('retorna 200 sem I/O quando o email_id é nulo', async () => {
        const res = await POST(requisicao('msg_sem_source'))
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.processado).toBe(false)
    })

    it('ignora evento que não é de reputação, sem tocar o banco', async () => {
        const res = await POST(requisicao('msg_evento_ignorado'))
        expect(res.status).toBe(200)
        expect((await res.json()).processado).toBe(false)
        expect(adminModule.createAdminClient).not.toHaveBeenCalled()
    })

    it('NÃO trata "suppression.added" — evento que o Resend nunca envia', async () => {
        // Contraprova direta do CR-03: se alguém reintroduzir o literal errado na
        // lista de eventos, este caso vira vermelho em vez de passar despercebido.
        const res = await POST(requisicao('msg_evento_inexistente'))
        expect(res.status).toBe(200)
        expect((await res.json()).processado).toBe(false)
        expect(reportarModule.reportarExcecaoAguardando).not.toHaveBeenCalled()
    })

    it('processa email.suppressed com cruzamento NUNCA-PII', async () => {
        mockarSupabase({ data: { tenant_id: 'org_tenant_abc123' }, error: null })

        const res = await POST(requisicao('msg_valida'))
        expect(res.status).toBe(200)

        // Afirmação NUNCA-PII: o endereço do cliente é o dado central do evento e
        // é exatamente o que não pode chegar ao Sentry.
        expect(reportarModule.reportarExcecaoAguardando).toHaveBeenCalledTimes(1)
        const [erro, meta] = vi.mocked(reportarModule.reportarExcecaoAguardando).mock.calls[0]

        expect((erro as Error).message).toBe('resend:evento_de_reputacao')
        expect(JSON.stringify(meta)).not.toContain('cliente-sigiloso@exemplo.com')
        expect(JSON.stringify(meta)).not.toContain('org_tenant_abc123')
    })

    it('processa email.bounced com o mesmo rótulo sintético', async () => {
        mockarSupabase({ data: { tenant_id: 'org_tenant_abc123' }, error: null })

        const res = await POST(requisicao('msg_bounce'))
        expect(res.status).toBe(200)

        const [erro, meta] = vi.mocked(reportarModule.reportarExcecaoAguardando).mock.calls[0]
        // Mensagem ESTÁTICA para os dois tipos: é o que impede o agrupamento do
        // Sentry de estilhaçar. O tipo real viaja no contexto.
        expect((erro as Error).message).toBe('resend:evento_de_reputacao')
        expect(meta).toMatchObject({ tipoEvento: 'email.bounced' })
    })

    it('devolve 500 quando a consulta ao log falha, para o Resend retentar', async () => {
        mockarSupabase({ data: null, error: { code: '08006', message: 'connection failure' } })

        const res = await POST(requisicao('msg_valida'))
        expect(res.status).toBe(500)

        // Antes, o erro era descartado e o handler devolvia 200: o provedor não
        // reenvia diante de sucesso, e o evento se perdia para sempre.
        expect(reportarModule.reportarExcecaoAguardando).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'resend:consulta_email_log_falhou' }),
            expect.anything(),
        )
    })
})
