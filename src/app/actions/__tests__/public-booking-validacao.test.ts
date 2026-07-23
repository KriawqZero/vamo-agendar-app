/**
 * Suíte HERMÉTICA da validação de entrada do caminho de ESCRITA público
 * (`criarAgendamentoPublico`). Roda no `pnpm test` padrão, SEM banco: a prova é
 * que a entrada hostil é RECUSADA antes de `createAdminClient()` — ou seja, sem
 * tocar o banco.
 *
 * Por que ela é separada da `public-booking-escrita.test.ts` (integração): aquela
 * exige credenciais reais e escreve no Supabase de dev; esta exercita apenas o
 * portão de validação, que retorna antes do primeiro `createAdminClient()`. O
 * único mock necessário é `@/lib/supabase/admin`, e ele existe para PROVAR o
 * negativo: `createAdminClient` NÃO é chamado quando a entrada é rejeitada.
 *
 * Gap coberto (CR-02): `clientes.nome`/`clientes.email` são `text` SEM limite no
 * banco (`supabase/schemas/06_clientes.sql`) e o insert usa o cliente
 * privilegiado (RLS fora do jogo). Sem teto no app, uma requisição anônima com
 * um slug válido gravaria um nome de 200 mil caracteres como linha real e um
 * e-mail malformado atravessaria para o fluxo Resend. A única defesa possível é
 * a validação de entrada — e é ela que esta suíte pina.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock do cliente privilegiado: a asserção central de toda esta suíte é
// "createAdminClient NÃO foi chamado" no caminho de recusa. O fake devolve
// consultas vazias para que, no caminho de CONTROLE (entrada válida), a função
// siga além da validação e pare cedo em `slug_invalido` sem lançar — provando
// que a entrada passou pelo portão.
const { createAdminClientMock } = vi.hoisted(() => ({ createAdminClientMock: vi.fn() }))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: createAdminClientMock }))

import { criarAgendamentoPublico } from '@/app/actions/public-booking'

/** Consulta encadeável que resolve sempre vazia — nenhuma linha, nenhum erro. */
function consultaVazia() {
    const consulta = {
        select: () => consulta,
        eq: () => consulta,
        order: () => consulta,
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({ data: null, error: null }),
    }
    return consulta
}

const adminFake = { from: () => consultaVazia() }

/**
 * Entrada 100% válida. Cada caso de recusa parte daqui e estraga UM campo, para
 * que a rejeição só possa ser atribuída àquele campo.
 */
const PARAMS_VALIDOS = {
    slug: 'barbearia-teste',
    servicoId: 'srv-1',
    dataHora: '2099-01-15T10:00:00.000Z',
    clienteNome: 'Maria Silva',
    clienteTelefone: '11999998888',
    clienteEmail: 'maria@exemplo.com',
} as const

beforeEach(() => {
    createAdminClientMock.mockReset()
    createAdminClientMock.mockReturnValue(adminFake)
})

describe('criarAgendamentoPublico — teto e formato dos campos de contato (CR-02)', () => {
    it('recusa nome gigante (200.000 chars) SEM tocar o banco', async () => {
        const resultado = await criarAgendamentoPublico({
            ...PARAMS_VALIDOS,
            clienteNome: 'a'.repeat(200_000),
        })

        expect(resultado.ok).toBe(false)
        if (!resultado.ok) expect(resultado.motivo).toBe('campos_obrigatorios')
        // A prova de "recusou antes de tocar o banco": o cliente privilegiado
        // nunca foi instanciado.
        expect(createAdminClientMock).not.toHaveBeenCalled()
    })

    it('recusa e-mail longo demais (300 chars) SEM tocar o banco', async () => {
        const resultado = await criarAgendamentoPublico({
            ...PARAMS_VALIDOS,
            clienteEmail: 'a'.repeat(300),
        })

        expect(resultado.ok).toBe(false)
        if (!resultado.ok) expect(resultado.motivo).toBe('email_invalido')
        expect(createAdminClientMock).not.toHaveBeenCalled()
    })

    it('recusa e-mail sem arroba SEM tocar o banco', async () => {
        const resultado = await criarAgendamentoPublico({
            ...PARAMS_VALIDOS,
            clienteEmail: 'sem-arroba',
        })

        expect(resultado.ok).toBe(false)
        if (!resultado.ok) expect(resultado.motivo).toBe('email_invalido')
        expect(createAdminClientMock).not.toHaveBeenCalled()
    })

    // -----------------------------------------------------------------------
    // CONTROLE — o caminho feliz não pode ser rejeitado pelos motivos acima.
    // A prova é que a função passou da validação e chamou `createAdminClient`.
    // -----------------------------------------------------------------------

    it('NÃO rejeita nome e e-mail válidos (passa da validação e toca o banco)', async () => {
        const resultado = await criarAgendamentoPublico({ ...PARAMS_VALIDOS })

        expect(createAdminClientMock).toHaveBeenCalled()
        // Passou da validação de entrada: se algo barrar depois, é resolução de
        // slug (banco vazio no mock), nunca teto de nome nem formato de e-mail.
        if (!resultado.ok) {
            expect(resultado.motivo).not.toBe('email_invalido')
        }
    })

    it('aceita nome no limite exato de 120 caracteres (teto inclusivo)', async () => {
        const resultado = await criarAgendamentoPublico({
            ...PARAMS_VALIDOS,
            clienteNome: 'b'.repeat(120),
        })

        expect(createAdminClientMock).toHaveBeenCalled()
        if (!resultado.ok) expect(resultado.motivo).not.toBe('campos_obrigatorios')
    })

    it('aceita e-mail ausente (campo opcional não vira email_invalido)', async () => {
        const { clienteEmail: _omitido, ...semEmail } = PARAMS_VALIDOS
        const resultado = await criarAgendamentoPublico(semEmail)

        expect(createAdminClientMock).toHaveBeenCalled()
        if (!resultado.ok) expect(resultado.motivo).not.toBe('email_invalido')
    })
})
