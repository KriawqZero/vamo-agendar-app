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

// O módulo de rate limit é mockado INTEIRO, e não só a decisão: o de verdade
// importa `next/headers`, que não existe fora de um contexto de requisição do
// Next. A suíte precisa continuar hermética. O contrato do módulo real (no-op,
// fail-open, chave pseudonimizada) é provado em `src/lib/__tests__/rate-limit.test.ts`;
// aqui o que se prova é o que a AÇÃO faz com a resposta dele.
const { verificarLimiteMock, ipDoVisitanteMock, hashChaveRateLimitMock } = vi.hoisted(() => ({
    verificarLimiteMock: vi.fn(),
    ipDoVisitanteMock: vi.fn(),
    hashChaveRateLimitMock: vi.fn(),
}))

vi.mock('@/lib/rate-limit', () => ({
    verificarLimite: verificarLimiteMock,
    ipDoVisitante: ipDoVisitanteMock,
    hashChaveRateLimit: hashChaveRateLimitMock,
}))

// Telemetria do bloqueio (03-02, D-11): os dois destinos são espionados porque
// o que se prova aqui é O QUE a action manda — a decisão dela —, nunca o que o
// fornecedor faz com isso. `logOperacional` entra no mock por necessidade
// estrutural: módulos do grafo de `public-booking` (notificações, whatsapp-helper)
// importam a variante fire-and-forget do mesmo arquivo.
const { logAguardandoMock, logOperacionalMock } = vi.hoisted(() => ({
    logAguardandoMock: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        fatal: vi.fn(),
    },
    logOperacionalMock: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        fatal: vi.fn(),
    },
}))

vi.mock('@/lib/observabilidade/log', () => ({
    logOperacional: logOperacionalMock,
    logOperacionalAguardando: logAguardandoMock,
}))

const { capturarEventoServidorMock, capturarEventoTenantMock } = vi.hoisted(() => ({
    capturarEventoServidorMock: vi.fn(),
    capturarEventoTenantMock: vi.fn(),
}))

vi.mock('@/lib/analytics/server', () => ({
    capturarEventoServidor: capturarEventoServidorMock,
    capturarEventoTenant: capturarEventoTenantMock,
}))

// A Issue do Sentry é o que NÃO pode acontecer no bloqueio de IP: bloqueio é
// condição esperada, e Issue de rotina é como o owner para de olhar a ferramenta.
const {
    reportarExcecaoMock,
    reportarFalhaSilenciosaMock,
    reportarExcecaoAguardandoMock,
    reportarFalhaSilenciosaAguardandoMock,
} = vi.hoisted(() => ({
    reportarExcecaoMock: vi.fn(),
    reportarFalhaSilenciosaMock: vi.fn(),
    reportarExcecaoAguardandoMock: vi.fn(),
    reportarFalhaSilenciosaAguardandoMock: vi.fn(),
}))

vi.mock('@/lib/observabilidade/reportar', () => ({
    reportarExcecao: reportarExcecaoMock,
    reportarFalhaSilenciosa: reportarFalhaSilenciosaMock,
    reportarExcecaoAguardando: reportarExcecaoAguardandoMock,
    reportarFalhaSilenciosaAguardando: reportarFalhaSilenciosaAguardandoMock,
}))

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
    // Default de TODOS os casos: rate limit liberando. Só o caso do bloqueio
    // troca isto — assim nenhum outro caso passa por acidente de mock.
    verificarLimiteMock.mockReset()
    verificarLimiteMock.mockResolvedValue(true)
    ipDoVisitanteMock.mockReset()
    ipDoVisitanteMock.mockResolvedValue('203.0.113.7')
    hashChaveRateLimitMock.mockReset()
    hashChaveRateLimitMock.mockReturnValue('hash-do-ip-fixture')

    logAguardandoMock.warn.mockReset()
    logAguardandoMock.warn.mockResolvedValue(undefined)
    capturarEventoServidorMock.mockReset()
    reportarExcecaoMock.mockReset()
    reportarFalhaSilenciosaMock.mockReset()
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
        const { slug, servicoId, dataHora, clienteNome, clienteTelefone } = PARAMS_VALIDOS
        const resultado = await criarAgendamentoPublico({
            slug,
            servicoId,
            dataHora,
            clienteNome,
            clienteTelefone,
        })

        expect(createAdminClientMock).toHaveBeenCalled()
        if (!resultado.ok) expect(resultado.motivo).not.toBe('email_invalido')
    })
})

describe('criarAgendamentoPublico — camada de IP do rate limit (ABU-01, D-06/D-07)', () => {
    it('recusa com `muitas_tentativas` SEM tocar o banco quando a janela estourou', async () => {
        verificarLimiteMock.mockResolvedValue(false)

        // Entrada 100% VÁLIDA de propósito: a recusa só pode ser atribuída ao
        // rate limit, nunca a um campo malformado.
        const resultado = await criarAgendamentoPublico({ ...PARAMS_VALIDOS })

        expect(resultado.ok).toBe(false)
        // Erro HONESTO, nunca sucesso falso (D-07): sucesso falso é exclusivo do
        // honeypot, onde a certeza de bot é alta.
        if (!resultado.ok) expect(resultado.motivo).toBe('muitas_tentativas')
        // A prova de que recusou de graça: o cliente privilegiado nunca foi
        // instanciado, então nenhuma consulta ao Supabase foi paga por um flood.
        expect(createAdminClientMock).not.toHaveBeenCalled()
    })

    it('consulta a camada `escrita_ip` com o IP do visitante', async () => {
        await criarAgendamentoPublico({ ...PARAMS_VALIDOS })

        expect(ipDoVisitanteMock).toHaveBeenCalled()
        expect(verificarLimiteMock).toHaveBeenCalledWith('escrita_ip', ['203.0.113.7'])
    })

    it('não altera o fluxo quando a camada libera (fail-open e caminho feliz)', async () => {
        verificarLimiteMock.mockResolvedValue(true)

        const resultado = await criarAgendamentoPublico({ ...PARAMS_VALIDOS })

        // Segue exatamente como o baseline: passa da validação, toca o banco e
        // para na resolução de slug (mock vazio). `muitas_tentativas` não pode
        // aparecer quando a camada liberou — é o que garante que o fail-open do
        // módulo (Redis fora do ar) nunca vira bloqueio.
        expect(createAdminClientMock).toHaveBeenCalled()
        expect(resultado.ok).toBe(false)
        if (!resultado.ok) expect(resultado.motivo).not.toBe('muitas_tentativas')
    })
})

describe('criarAgendamentoPublico — telemetria do bloqueio de IP (ABU-03, D-11)', () => {
    beforeEach(() => {
        // Todo caso deste bloco parte do bloqueio: é ele que emite telemetria.
        verificarLimiteMock.mockResolvedValue(false)
    })

    it('emite Sentry Log com código estático e chave PSEUDONIMIZADA — nunca o IP cru', async () => {
        await criarAgendamentoPublico({ ...PARAMS_VALIDOS })

        expect(logAguardandoMock.warn).toHaveBeenCalledWith('ratelimit.bloqueio', {
            fluxo: 'booking_publico',
            camada: 'escrita_ip',
            chaveHash: 'hash-do-ip-fixture',
        })

        // Prova NEGATIVA de PII: o valor cru da fixture não pode aparecer em
        // NENHUM argumento enviado ao fornecedor terceiro.
        const argumentos = JSON.stringify(logAguardandoMock.warn.mock.calls)
        expect(argumentos).not.toContain('203.0.113.7')
        // E o hash é o MESMO da chave do contador — é o que permite correlacionar
        // log ↔ Redis sem que o IP exista em lugar nenhum.
        expect(hashChaveRateLimitMock).toHaveBeenCalledWith('203.0.113.7')
    })

    it('emite o evento agregado `booking_rate_limited` no PostHog', async () => {
        await criarAgendamentoPublico({ ...PARAMS_VALIDOS })

        expect(capturarEventoServidorMock).toHaveBeenCalledWith('booking_rate_limited', {
            camada: 'escrita_ip',
        })
        // Variante SERVIDOR, e não Tenant: o bloqueio acontece antes de o slug
        // ser resolvido, então não existe tenant para atribuir o evento.
        expect(capturarEventoTenantMock).not.toHaveBeenCalled()
    })

    it('NÃO abre Sentry Issue — bloqueio é rotina esperada, não incidente', async () => {
        await criarAgendamentoPublico({ ...PARAMS_VALIDOS })

        expect(reportarExcecaoMock).not.toHaveBeenCalled()
        expect(reportarFalhaSilenciosaMock).not.toHaveBeenCalled()
    })

    it('falha da telemetria NÃO muda o retorno do visitante (padrão 23P01)', async () => {
        logAguardandoMock.warn.mockRejectedValue(new Error('Sentry fora do ar'))
        capturarEventoServidorMock.mockImplementation(() => {
            throw new Error('PostHog fora do ar')
        })

        const resultado = await criarAgendamentoPublico({ ...PARAMS_VALIDOS })

        expect(resultado.ok).toBe(false)
        if (!resultado.ok) expect(resultado.motivo).toBe('muitas_tentativas')
        expect(createAdminClientMock).not.toHaveBeenCalled()
    })
})
