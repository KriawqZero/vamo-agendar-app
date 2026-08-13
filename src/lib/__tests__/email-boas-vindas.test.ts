import { describe, expect, it, vi, beforeEach } from 'vitest'
import { garantirEnvioBoasVindas } from '../email-boas-vindas'
import * as adminModule from '@/lib/supabase/admin'
import * as enviarModule from '@/lib/email/enviar'

vi.mock('@/lib/supabase/admin', () => ({
    createAdminClient: vi.fn(),
}))

vi.mock('@/lib/email/enviar', () => ({
    enviarEmail: vi.fn(),
}))

/**
 * Monta o cliente Supabase mockado com a forma que `garantirEnvioBoasVindas`
 * realmente usa: um SELECT com `count` (para saber quantas tentativas já houve),
 * um INSERT e um UPDATE.
 */
function mockarSupabase(opcoes: {
    tentativasAnteriores?: number
    resultadoInsert: { data: unknown; error: unknown }
}) {
    const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
    })

    const mockInsert = vi.fn().mockReturnValue({
        select: () => ({
            single: vi.fn().mockResolvedValue(opcoes.resultadoInsert),
        }),
    })

    const mockSelect = vi.fn().mockReturnValue({
        eq: () => ({
            eq: vi.fn().mockResolvedValue({ count: opcoes.tentativasAnteriores ?? 0, error: null }),
        }),
    })

    vi.mocked(adminModule.createAdminClient).mockReturnValue({
        from: () => ({ select: mockSelect, insert: mockInsert, update: mockUpdate }),
    } as unknown as ReturnType<typeof adminModule.createAdminClient>)

    return { mockUpdate, mockInsert }
}

const PARAMS_BASE = {
    tenantId: 'tenant_123',
    email: 'proprietario@salao.com',
    nomeProfissional: 'Maria',
    nomeEstabelecimento: 'Espaço Maria',
    slug: 'espaco-maria',
}

describe('garantirEnvioBoasVindas', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('retorna idempotência se a chave única 23505 for violada no INSERT', async () => {
        mockarSupabase({
            resultadoInsert: {
                data: null,
                error: { code: '23505', message: 'duplicate key value violates unique constraint' },
            },
        })

        const res = await garantirEnvioBoasVindas(PARAMS_BASE)

        expect(res).toEqual({ ok: true, ignoradoPorIdempotencia: true })
        expect(enviarModule.enviarEmail).not.toHaveBeenCalled()
    })

    it('envia e-mail com sucesso e atualiza log para enviado', async () => {
        const { mockUpdate } = mockarSupabase({
            resultadoInsert: { data: { id: 'log_uuid_1', status: 'pendente' }, error: null },
        })

        vi.mocked(enviarModule.enviarEmail).mockResolvedValue({ ok: true, id: 'resend_msg_99' })

        const res = await garantirEnvioBoasVindas({
            ...PARAMS_BASE,
            tenantId: 'tenant_456',
            email: 'joao@barbearia.com',
        })

        expect(res).toEqual({ ok: true, id: 'resend_msg_99' })
        expect(enviarModule.enviarEmail).toHaveBeenCalledTimes(1)
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'enviado', resend_id: 'resend_msg_99' }),
        )
    })

    // ── O núcleo do CR-02: falha permanente não pode renascer a cada page view ──
    //
    // O gatilho de envio vive no layout do dashboard, que roda a cada renderização
    // de servidor. Como o índice de idempotência só trava a chave enquanto o
    // status NÃO for 'falhou', marcar uma falha permanente como 'falhou' fazia a
    // linha renascer e o Resend ser chamado de novo — a cada F5, a cada
    // router.refresh() — repetindo a MESMA rejeição contra o MESMO endereço.
    it.each([
        // desativado: sem RESEND_API_KEY. config_ausente: configuração incompleta.
        // rejeitado: domínio não verificado ou endereço malformado. Nenhum melhora
        // com nova tentativa.
        'desativado' as const,
        'config_ausente' as const,
        'rejeitado' as const,
    ])('marca %s como descartado (terminal), não como falhou', async (motivo) => {
        const { mockUpdate } = mockarSupabase({
            resultadoInsert: { data: { id: 'log_uuid_2', status: 'pendente' }, error: null },
        })

        vi.mocked(enviarModule.enviarEmail).mockResolvedValue({ ok: false, motivo })

        const res = await garantirEnvioBoasVindas(PARAMS_BASE)

        expect(res).toEqual({ ok: false, motivo })
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'descartado', erro: motivo }),
        )
    })

    it('marca falha de transporte como falhou, liberando a chave para nova tentativa', async () => {
        const { mockUpdate } = mockarSupabase({
            resultadoInsert: { data: { id: 'log_uuid_3', status: 'pendente' }, error: null },
        })

        vi.mocked(enviarModule.enviarEmail).mockResolvedValue({
            ok: false,
            motivo: 'falha_transporte',
        })

        await garantirEnvioBoasVindas(PARAMS_BASE)

        // Rede é transitória: aqui retentar É a atitude certa.
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'falhou', erro: 'falha_transporte' }),
        )
    })

    it('para de retentar a falha transitória ao atingir o teto de tentativas', async () => {
        // Terceira tentativa (duas anteriores no log). Sem teto, uma queda
        // prolongada do provedor viraria laço infinito na cadência dos page views.
        const { mockUpdate, mockInsert } = mockarSupabase({
            tentativasAnteriores: 2,
            resultadoInsert: { data: { id: 'log_uuid_4', status: 'pendente' }, error: null },
        })

        vi.mocked(enviarModule.enviarEmail).mockResolvedValue({
            ok: false,
            motivo: 'falha_transporte',
        })

        await garantirEnvioBoasVindas(PARAMS_BASE)

        expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ tentativas: 3 }))
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'descartado', erro: 'falha_transporte' }),
        )
    })
})
