import { describe, expect, it, vi } from 'vitest'
import { dispararNotificacoesAgendamento } from '@/lib/notificacoes-agendamento'

vi.mock('@/lib/email/enviar', () => ({
    enviarEmail: vi.fn().mockResolvedValue({ ok: true, id: 'email_123' }),
}))

vi.mock('@/lib/whatsapp-helper', () => ({
    processarMensagemTemplate: vi.fn().mockReturnValue('Mensagem de teste'),
    enviarMensagemWhatsApp: vi.fn().mockResolvedValue({ ok: true }),
    agendarLembreteQStash: vi.fn().mockResolvedValue({ ok: true, messageId: 'qstash_123' }),
    registrarDisparo: vi.fn().mockResolvedValue(true),
}))

vi.mock('@/lib/assinaturas', () => ({
    obterPlanoVigentePublico: vi.fn().mockResolvedValue({ plano: 'pro' }),
}))

vi.mock('react-email', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-email')>()
    return {
        ...actual,
        render: vi.fn().mockResolvedValue('<html>Email HTML</html>'),
    }
})

describe('Orquestração Multicanal de Notificações (E-mail e WhatsApp)', () => {
    it('dispara e-mail via Resend quando clienteEmail é fornecido', async () => {
        const { enviarEmail } = await import('@/lib/email/enviar')

        const clientMock = {
            from: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        maybeSingle: vi.fn().mockResolvedValue({
                            data: { nome_estabelecimento: 'Salão Beleza', email_contato: 'contato@salao.com' },
                            error: null,
                        }),
                    }),
                }),
            }),
        } as unknown as Parameters<typeof dispararNotificacoesAgendamento>[0]

        await dispararNotificacoesAgendamento(clientMock, {
            agendamentoId: 'ag_123',
            tenantId: 'tenant_123',
            clienteNome: 'João Silva',
            clienteEmail: 'joao@example.com',
            clienteTelefone: null,
            servicoNome: 'Corte de Cabelo',
            dataHora: '2026-08-10T14:00:00Z',
            timezone: 'America/Sao_Paulo',
        })

        expect(enviarEmail).toHaveBeenCalledWith(
            expect.objectContaining({
                para: 'joao@example.com',
                nomeEstabelecimento: 'Salão Beleza',
                replyTo: 'contato@salao.com',
                assunto: 'Salão Beleza via VamoAgendar: Agendamento Confirmado',
            })
        )
    })
})
