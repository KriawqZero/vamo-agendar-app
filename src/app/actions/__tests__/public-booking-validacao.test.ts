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
const {
    verificarLimiteMock,
    verificarLimiteSemConsumirMock,
    ipDoVisitanteMock,
    hashChaveRateLimitMock,
} = vi.hoisted(() => ({
    verificarLimiteMock: vi.fn(),
    verificarLimiteSemConsumirMock: vi.fn(),
    ipDoVisitanteMock: vi.fn(),
    hashChaveRateLimitMock: vi.fn(),
}))

vi.mock('@/lib/rate-limit', () => ({
    verificarLimite: verificarLimiteMock,
    // Mock SEPARADO do de consumo, e a separação é a prova do CR-02: com um mock
    // só, "consultou o teto do tenant" e "gastou uma das 30 criações da hora"
    // seriam a mesma chamada, que é exatamente a confusão que o defeito era.
    verificarLimiteSemConsumir: verificarLimiteSemConsumirMock,
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

// Mensageria mockada para PROVAR O NEGATIVO do honeypot: a captura não pode
// disparar confirmação de WhatsApp nem agendar lembrete no QStash. Sem este
// mock, "não foi chamada" seria uma asserção que ninguém consegue escrever — e
// a prova ficaria só no "createAdminClient não foi chamado", que é mais fraca
// (mensageria com efeito externo não depende do cliente do banco).
const { dispararNotificacoesAgendamentoMock } = vi.hoisted(() => ({
    dispararNotificacoesAgendamentoMock: vi.fn(),
}))

vi.mock('@/lib/notificacoes-agendamento', () => ({
    dispararNotificacoesAgendamento: dispararNotificacoesAgendamentoMock,
}))

// A engine entra mockada só para que o caso de CRIAÇÃO bem-sucedida (prova
// positiva do CR-02) exista sem montar um banco inteiro de fixture. Devolve `[]`
// por padrão, então nenhum outro caso muda de comportamento.
const { obterSlotsDisponiveisMock } = vi.hoisted(() => ({ obterSlotsDisponiveisMock: vi.fn() }))

vi.mock('@/lib/booking-engine', () => ({ obterSlotsDisponiveis: obterSlotsDisponiveisMock }))

// `after()` do Next mockado para RODAR o callback. A telemetria de rejeição
// passou a ser emitida depois da resposta (CR-03), e sem este mock a suíte não
// veria emissão nenhuma — o que se prova aqui continua sendo O QUE a action
// manda, não quando o runtime entrega.
vi.mock('next/server', () => ({
    after: (callback: () => unknown) => {
        void callback()
    },
}))

import {
    criarAgendamentoPublico,
    obterDadosBookingPublico,
    obterSlotsPublicos,
} from '@/app/actions/public-booking'
// `hashTenantId` entra REAL, não mockado: o que os casos do teto por tenant
// precisam provar é que o valor enviado ao Sentry é o hash — e comparar contra o
// hash de verdade é a única forma de a asserção não passar com qualquer string.
import { hashTenantId } from '@/lib/observabilidade/hash'
// Real, não mockado: o throttle de emissão (CR-03) é estado de MÓDULO, e sem
// zerá-lo entre casos o segundo teste de cada balde veria silêncio — falso
// vermelho de teste, e pior, um falso verde se algum dia a asserção virar
// negativa.
import { reiniciarEmissoes } from '@/lib/observabilidade/emissao'

/** Consulta encadeável que resolve sempre vazia — nenhuma linha, nenhum erro. */
function consultaVazia() {
    const consulta = {
        select: () => consulta,
        eq: () => consulta,
        in: () => consulta,
        order: () => consulta,
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({ data: null, error: null }),
    }
    return consulta
}

const adminFake = { from: () => consultaVazia() }

/** Tenant resolvido a partir do slug — nunca vem do navegador. */
const TENANT_FIXTURE = 'org_teste_123'

/**
 * Perfil devolvido pela resolução do slug. Os dois slugs são iguais (tenant que
 * nunca personalizou o link), então `obterSlugEfetivo` resolve para qualquer
 * plano e a fixture não fica refém da leitura de assinatura.
 */
const PERFIL_FIXTURE = {
    tenant_id: TENANT_FIXTURE,
    slug: 'barbearia-teste',
    slug_gratuito: 'barbearia-teste',
    nome_estabelecimento: 'Barbearia Teste',
    descricao: null,
    instagram: null,
    endereco: null,
    timezone: 'America/Campo_Grande',
    antecedencia_minima_minutos: 15,
    horizonte_maximo_dias: 14,
    cor_marca: null,
    logo_url: null,
    capa_url: null,
}

/**
 * Admin fake que RESOLVE o slug — necessário porque as camadas de telefone e
 * tenant rodam DEPOIS da resolução (a chave exata de tenant só existe lá). O
 * `adminFake` vazio dos casos anteriores para antes disso, em `slug_invalido`.
 *
 * Devolve a lista de tabelas consultadas para que os casos possam provar o que
 * NÃO foi consultado: se `servicos` aparecer, o bloqueio veio tarde demais.
 */
function adminQueResolveTenant() {
    const tabelasConsultadas: string[] = []

    return {
        tabelasConsultadas,
        admin: {
            from(tabela: string) {
                tabelasConsultadas.push(tabela)
                const dados = tabela === 'perfis_empresas' ? PERFIL_FIXTURE : null
                const consulta = {
                    select: () => consulta,
                    eq: () => consulta,
                    in: () => consulta,
                    order: () => consulta,
                    maybeSingle: async () => ({ data: dados, error: null }),
                    single: async () => ({ data: dados, error: null }),
                }
                return consulta
            },
        },
    }
}

/**
 * Admin fake que vai até o fim: resolve o perfil, entrega o serviço, aceita a
 * RPC de cliente e devolve a linha do INSERT. Existe para um caso só — provar
 * que o token do teto por tenant é consumido DEPOIS da criação (CR-02), que é a
 * metade positiva que a asserção negativa sozinha não cobre.
 */
function adminQueCriaAgendamento() {
    const admin = {
        from(tabela: string) {
            const dados =
                tabela === 'perfis_empresas'
                    ? PERFIL_FIXTURE
                    : tabela === 'servicos'
                      ? { duracao_minutos: 30, nome: 'Corte' }
                      : tabela === 'agendamentos'
                        ? {
                              id: 'ag-fixture-1',
                              data_hora: PARAMS_VALIDOS.dataHora,
                              status: 'confirmado',
                          }
                        : null
            const consulta = {
                select: () => consulta,
                eq: () => consulta,
                in: () => consulta,
                order: () => consulta,
                insert: () => consulta,
                maybeSingle: async () => ({ data: dados, error: null }),
                single: async () => ({ data: dados, error: null }),
            }
            return consulta
        },
        rpc: async () => ({ data: 'cliente-fixture-1', error: null }),
    }
    return admin
}

/**
 * Configura a resposta de CADA camada por nome. Sem isto, um `mockResolvedValue`
 * único faria "telefone bloqueou" e "tenant bloqueou" serem o mesmo cenário — e
 * os dois têm destinos de telemetria diferentes, que é justamente o que se prova.
 */
function respostaPorCamada(mapa: Partial<Record<string, boolean>>) {
    verificarLimiteMock.mockImplementation(async (camada: string) => mapa[camada] ?? true)
    verificarLimiteSemConsumirMock.mockImplementation(async (camada: string) => mapa[camada] ?? true)
}

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
    reiniciarEmissoes()
    createAdminClientMock.mockReset()
    createAdminClientMock.mockReturnValue(adminFake)
    // Default de TODOS os casos: rate limit liberando. Só o caso do bloqueio
    // troca isto — assim nenhum outro caso passa por acidente de mock.
    verificarLimiteMock.mockReset()
    verificarLimiteMock.mockResolvedValue(true)
    verificarLimiteSemConsumirMock.mockReset()
    verificarLimiteSemConsumirMock.mockResolvedValue(true)
    ipDoVisitanteMock.mockReset()
    ipDoVisitanteMock.mockResolvedValue('203.0.113.7')
    hashChaveRateLimitMock.mockReset()
    hashChaveRateLimitMock.mockReturnValue('hash-do-ip-fixture')

    logAguardandoMock.warn.mockReset()
    logAguardandoMock.warn.mockResolvedValue(undefined)
    capturarEventoServidorMock.mockReset()
    capturarEventoTenantMock.mockReset()
    reportarExcecaoMock.mockReset()
    reportarFalhaSilenciosaMock.mockReset()
    reportarFalhaSilenciosaAguardandoMock.mockReset()
    reportarFalhaSilenciosaAguardandoMock.mockResolvedValue(undefined)
    dispararNotificacoesAgendamentoMock.mockReset()
    dispararNotificacoesAgendamentoMock.mockResolvedValue(undefined)
    obterSlotsDisponiveisMock.mockReset()
    obterSlotsDisponiveisMock.mockResolvedValue([])
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

    it('sob flood, o Sentry Log é THROTTLADO e a taxa do PostHog não (CR-03)', async () => {
        for (let i = 0; i < 20; i++) {
            await criarAgendamentoPublico({ ...PARAMS_VALIDOS })
        }

        // Quantas requisições existem é escolha do ATACANTE: um evento por
        // requisição bloqueada faz a cota do Sentry acabar exatamente durante o
        // ataque que ela deveria estar sinalizando.
        expect(logAguardandoMock.warn).toHaveBeenCalledTimes(1)
        // A taxa agregada NÃO é amostrada: é ela que responde "quanto está sendo
        // barrado" e diz se 10/10 min está apertado demais para CGNAT. Detector
        // amostrado não detecta.
        expect(capturarEventoServidorMock).toHaveBeenCalledTimes(20)
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

/**
 * Camadas 2 e 3 (03-03): telefone e teto por tenant.
 *
 * Rodam PÓS-RESOLUÇÃO do slug, e a posição é o desenho: a chave exata de tenant
 * só nasce ali (usar o slug dobraria o orçamento do tenant, porque `slug` e
 * `slug_gratuito` são dois textos para a mesma agenda). Por isso todo caso deste
 * bloco troca o admin fake por um que RESOLVE o perfil.
 */
describe('criarAgendamentoPublico — camadas de telefone e tenant (ABU-01, D-08/D-09)', () => {
    let tabelasConsultadas: string[]

    beforeEach(() => {
        const fake = adminQueResolveTenant()
        tabelasConsultadas = fake.tabelasConsultadas
        createAdminClientMock.mockReturnValue(fake.admin)
        // Hash falso previsível e DISTINTO por valor (com retorno fixo,
        // "hasheou o telefone" e "hasheou o IP" seriam a mesma asserção) — e
        // que NÃO carrega o valor cru dentro de si, senão a prova negativa de
        // PII acusaria o próprio mock em vez do código sob teste.
        hashChaveRateLimitMock.mockImplementation(
            (valor: string) =>
                ({ '11999998888': 'hash-do-telefone', '203.0.113.7': 'hash-do-ip-fixture' })[
                    valor
                ] ?? 'hash-desconhecido',
        )
    })

    it('consulta as duas camadas com as chaves exatas, depois da resolução', async () => {
        await criarAgendamentoPublico({ ...PARAMS_VALIDOS })

        // Telefone JÁ NORMALIZADO (só dígitos) — o balde não pode depender de o
        // visitante ter digitado com ou sem parênteses.
        expect(verificarLimiteMock).toHaveBeenCalledWith('escrita_telefone', [
            '11999998888',
            TENANT_FIXTURE,
        ])
        // ASSIMETRIA do CR-02: telefone CONSOME (tentativa repetida com o mesmo
        // número é o abuso que o D-08 mira), tenant só CONSULTA.
        expect(verificarLimiteSemConsumirMock).toHaveBeenCalledWith('teto_tenant', [
            TENANT_FIXTURE,
        ])
        expect(tabelasConsultadas).toContain('perfis_empresas')
    })

    it('bloqueio por TELEFONE devolve muitas_tentativas e fica em log + PostHog (D-11)', async () => {
        respostaPorCamada({ escrita_telefone: false })

        const resultado = await criarAgendamentoPublico({ ...PARAMS_VALIDOS })

        expect(resultado.ok).toBe(false)
        if (!resultado.ok) expect(resultado.motivo).toBe('muitas_tentativas')

        expect(logAguardandoMock.warn).toHaveBeenCalledWith('ratelimit.bloqueio', {
            fluxo: 'booking_publico',
            camada: 'escrita_telefone',
            chaveHash: 'hash-do-telefone',
            tenantHash: hashTenantId(TENANT_FIXTURE),
        })
        // Variante TENANT, e não Servidor: aqui o slug já foi resolvido, então
        // existe tenant para atribuir o evento — e a taxa por tenant é o que
        // responde "esta agenda está sendo atacada?".
        expect(capturarEventoTenantMock).toHaveBeenCalledWith(
            'booking_rate_limited',
            TENANT_FIXTURE,
            { camada: 'escrita_telefone' },
        )
        // Bloqueio de telefone é ROTINA (D-11): nada de Issue. A Issue é
        // exclusiva do teto por tenant e da falha do Redis.
        expect(reportarFalhaSilenciosaAguardandoMock).not.toHaveBeenCalled()
        expect(reportarExcecaoMock).not.toHaveBeenCalled()

        // Prova NEGATIVA de PII: o telefone cru do cliente final não pode
        // aparecer em nenhum argumento enviado a fornecedor terceiro.
        const enviado = JSON.stringify([
            logAguardandoMock.warn.mock.calls,
            capturarEventoTenantMock.mock.calls,
        ])
        expect(enviado).not.toContain('11999998888')
    })

    it('estouro do TETO por tenant escala Issue sintética estática com tenantHash (D-12)', async () => {
        respostaPorCamada({ teto_tenant: false })

        const resultado = await criarAgendamentoPublico({ ...PARAMS_VALIDOS })

        expect(resultado.ok).toBe(false)
        if (!resultado.ok) expect(resultado.motivo).toBe('muitas_tentativas')

        // Mensagem SINTÉTICA e ESTÁTICA (nada interpolado): é o que mantém o
        // agrupamento do Sentry inteiro sob ataque — o erro que a quick task
        // 260724 pagou para não repetir. Variante AGUARDADA porque o `return`
        // encerra a Server Action na linha seguinte.
        expect(reportarFalhaSilenciosaAguardandoMock).toHaveBeenCalledWith(
            'ratelimit:teto_tenant_atingido',
            {
                fluxo: 'booking_publico',
                camada: 'teto_tenant',
                tenantHash: hashTenantId(TENANT_FIXTURE),
            },
        )

        // O `org_...` do Clerk nunca vai cru para o Sentry.
        const enviadoAoSentry = JSON.stringify(reportarFalhaSilenciosaAguardandoMock.mock.calls)
        expect(enviadoAoSentry).not.toContain(TENANT_FIXTURE)

        // A telemetria de rotina continua saindo — a Issue é ACRÉSCIMO, não
        // substituição: sem o log e a taxa, o alarme chegaria sem contexto.
        expect(logAguardandoMock.warn).toHaveBeenCalledWith('ratelimit.bloqueio', {
            fluxo: 'booking_publico',
            camada: 'teto_tenant',
            tenantHash: hashTenantId(TENANT_FIXTURE),
        })
        expect(capturarEventoTenantMock).toHaveBeenCalledWith(
            'booking_rate_limited',
            TENANT_FIXTURE,
            { camada: 'teto_tenant' },
        )
    })

    it('bloqueio acontece ANTES da consulta de serviço (não paga o resto do caminho)', async () => {
        respostaPorCamada({ escrita_telefone: false })

        await criarAgendamentoPublico({ ...PARAMS_VALIDOS })

        // A resolução já foi paga por qualquer requisição válida; o que o
        // bloqueio economiza é tudo o que vem DEPOIS — serviço, engine, RPC e
        // INSERT, que é onde mora o custo real.
        expect(tabelasConsultadas).toContain('perfis_empresas')
        expect(tabelasConsultadas).not.toContain('servicos')
    })

    it('a Issue do teto por tenant é THROTTLADA sob ataque sustentado (CR-03)', async () => {
        respostaPorCamada({ teto_tenant: false })

        for (let i = 0; i < 10; i++) {
            await criarAgendamentoPublico({ ...PARAMS_VALIDOS })
        }

        // O alarme do D-12 precisa alcançar um humano UMA vez, não trinta — e o
        // ramo que o emite só acontece sob ataque, que é justamente quando dois
        // `Sentry.flush(2000)` por requisição são mais caros.
        expect(reportarFalhaSilenciosaAguardandoMock).toHaveBeenCalledTimes(1)
        expect(capturarEventoTenantMock).toHaveBeenCalledTimes(10)
    })

    it('tentativa bloqueada pelo TELEFONE não queima o token do tenant (WR-02)', async () => {
        respostaPorCamada({ escrita_telefone: false })

        await criarAgendamentoPublico({ ...PARAMS_VALIDOS })

        // Enquanto as duas camadas consumiam em `Promise.all`, uma requisição já
        // condenada pelo telefone ainda gastava uma das 30 criações da hora do
        // tenant — era o motor barato do CR-02.
        expect(verificarLimiteMock).not.toHaveBeenCalledWith('teto_tenant', expect.anything())
    })

    it('tentativa com SERVIÇO inválido não queima o token do tenant (CR-02)', async () => {
        respostaPorCamada({})

        const resultado = await criarAgendamentoPublico({ ...PARAMS_VALIDOS })

        // O fake não tem serviço: a requisição morre em `servico_invalido`. Era
        // com 30 requisições assim que um atacante negava agendamento a um
        // tenant inteiro por uma hora, sem criar nada.
        expect(resultado.ok).toBe(false)
        if (!resultado.ok) expect(resultado.motivo).toBe('servico_invalido')
        expect(verificarLimiteMock).not.toHaveBeenCalledWith('teto_tenant', expect.anything())
    })

    it('consome o token do tenant DEPOIS do INSERT bem-sucedido (CR-02)', async () => {
        createAdminClientMock.mockReturnValue(adminQueCriaAgendamento())
        obterSlotsDisponiveisMock.mockResolvedValue([
            { time: '10:00', datetime: PARAMS_VALIDOS.dataHora },
        ])
        respostaPorCamada({})

        const resultado = await criarAgendamentoPublico({ ...PARAMS_VALIDOS })

        // Metade positiva: "30 por hora" volta a significar 30 CRIAÇÕES por
        // hora, que é o que o D-09 decidiu e o que a documentação afirma.
        expect(resultado.ok).toBe(true)
        expect(verificarLimiteMock).toHaveBeenCalledWith('teto_tenant', [TENANT_FIXTURE])
    })

    it('com as três camadas liberando, o fluxo segue idêntico ao baseline', async () => {
        respostaPorCamada({})

        const resultado = await criarAgendamentoPublico({ ...PARAMS_VALIDOS })

        // Segue além das camadas e para adiante, na consulta de serviço (fixture
        // sem serviço). Nenhuma das camadas novas pode virar bloqueio acidental.
        expect(tabelasConsultadas).toContain('servicos')
        expect(resultado.ok).toBe(false)
        if (!resultado.ok) expect(resultado.motivo).toBe('servico_invalido')
        expect(reportarFalhaSilenciosaAguardandoMock).not.toHaveBeenCalled()
    })
})

/**
 * Camada 4 (03-04): teto de LEITURA por IP em `obterSlotsPublicos`.
 *
 * A grade de slots é a função que um script martelaria para varrer a agenda, e
 * é a única superfície de leitura com canal de erro discriminado — o que permite
 * bloquear sem inventar caminho novo de 404. `obterDadosBookingPublico` fica de
 * fora por decisão registrada, e o último caso deste bloco é a trava disso.
 */
describe('obterSlotsPublicos — teto de leitura por IP (ABU-01, D-06/D-10)', () => {
    /** Argumentos 100% válidos: qualquer recusa só pode vir do rate limit. */
    const SLUG = 'barbearia-teste'
    const DATA_VALIDA = '2099-01-15'
    const DURACAO_VALIDA = 30

    it('recusa com `muitas_tentativas` SEM tocar o banco quando a janela estourou', async () => {
        respostaPorCamada({ leitura_ip: false })

        const resultado = await obterSlotsPublicos(SLUG, DATA_VALIDA, DURACAO_VALIDA)

        expect(resultado.ok).toBe(false)
        if (!resultado.ok) expect(resultado.motivo).toBe('muitas_tentativas')
        // A guarda roda ANTES da resolução do slug: o cliente privilegiado nunca
        // foi instanciado, então o martelo não empurra carga para o Supabase.
        expect(createAdminClientMock).not.toHaveBeenCalled()
        // Asserção NEGATIVA do padrão 01-18 — se `slug_invalido` aparecesse, o
        // bloqueio teria acontecido depois da resolução, e a caixa de erro
        // mentiria sobre a causa.
        expect(JSON.stringify(resultado)).not.toContain('slug_invalido')
    })

    it('consulta a camada `leitura_ip` com o IP do visitante', async () => {
        await obterSlotsPublicos(SLUG, DATA_VALIDA, DURACAO_VALIDA)

        expect(ipDoVisitanteMock).toHaveBeenCalled()
        expect(verificarLimiteMock).toHaveBeenCalledWith('leitura_ip', ['203.0.113.7'])
    })

    it('emite log pseudonimizado + evento agregado, e NENHUMA Issue', async () => {
        respostaPorCamada({ leitura_ip: false })

        await obterSlotsPublicos(SLUG, DATA_VALIDA, DURACAO_VALIDA)

        expect(logAguardandoMock.warn).toHaveBeenCalledWith('ratelimit.bloqueio', {
            fluxo: 'booking_publico',
            camada: 'leitura_ip',
            chaveHash: 'hash-do-ip-fixture',
        })
        // Variante SERVIDOR: a leitura é barrada antes de o slug resolver, então
        // não existe tenant a quem atribuir o evento — mesma razão da camada de
        // escrita por IP.
        expect(capturarEventoServidorMock).toHaveBeenCalledWith('booking_rate_limited', {
            camada: 'leitura_ip',
        })
        expect(capturarEventoTenantMock).not.toHaveBeenCalled()
        // Bloqueio de leitura é rotina de endpoint público: Issue aqui inundaria
        // o Sentry justamente durante o ataque que ela deveria sinalizar.
        expect(reportarFalhaSilenciosaAguardandoMock).not.toHaveBeenCalled()
        expect(reportarExcecaoMock).not.toHaveBeenCalled()

        const argumentos = JSON.stringify(logAguardandoMock.warn.mock.calls)
        expect(argumentos).not.toContain('203.0.113.7')
    })

    it('falha da telemetria NÃO muda o retorno do visitante', async () => {
        respostaPorCamada({ leitura_ip: false })
        logAguardandoMock.warn.mockRejectedValue(new Error('Sentry fora do ar'))
        capturarEventoServidorMock.mockImplementation(() => {
            throw new Error('PostHog fora do ar')
        })

        const resultado = await obterSlotsPublicos(SLUG, DATA_VALIDA, DURACAO_VALIDA)

        expect(resultado.ok).toBe(false)
        if (!resultado.ok) expect(resultado.motivo).toBe('muitas_tentativas')
    })

    it('entrada malformada é recusada ANTES de gastar comando no Redis', async () => {
        // Não-regressão do padrão 01-18 e economia de cota (Pitfall 8): data e
        // duração hostis são recusadas de graça, sem consultar o fornecedor.
        const porData = await obterSlotsPublicos(SLUG, '2099-13-45', DURACAO_VALIDA)
        expect(porData.ok).toBe(false)
        if (!porData.ok) expect(porData.motivo).toBe('data_invalida')

        const porDuracao = await obterSlotsPublicos(SLUG, DATA_VALIDA, -5_000_000)
        expect(porDuracao.ok).toBe(false)
        if (!porDuracao.ok) expect(porDuracao.motivo).toBe('servico_invalido')

        expect(verificarLimiteMock).not.toHaveBeenCalled()
        expect(createAdminClientMock).not.toHaveBeenCalled()
    })

    it('com a camada liberando, a leitura segue idêntica ao baseline', async () => {
        respostaPorCamada({})

        const resultado = await obterSlotsPublicos(SLUG, DATA_VALIDA, DURACAO_VALIDA)

        // Passa da guarda e para adiante, na resolução do slug (fixture vazia).
        expect(createAdminClientMock).toHaveBeenCalled()
        expect(resultado.ok).toBe(false)
        if (!resultado.ok) expect(resultado.motivo).not.toBe('muitas_tentativas')
    })

    it('obterDadosBookingPublico NÃO passa pelo rate limit — bloqueio nunca vira 404', async () => {
        // Trava da decisão do plano 03-04 (desvio do D-06 ratificado pelo owner):
        // o contrato desta função é `null` → `notFound()` em `page.tsx`. Um teto
        // aqui converteria bloqueio de leitura em "estabelecimento não existe"
        // para um visitante legítimo sob CGNAT — o pior desfecho possível, e
        // indistinguível de link quebrado.
        respostaPorCamada({ leitura_ip: false })

        await obterDadosBookingPublico(SLUG)

        expect(verificarLimiteMock).not.toHaveBeenCalled()
        expect(createAdminClientMock).toHaveBeenCalled()
    })
})

/**
 * Honeypot (03-05): a defesa COMPLEMENTAR ao rate limit.
 *
 * Cobrem eixos diferentes e nenhuma sozinha fecha o SC1: o honeypot pega o bot
 * que preenche FORMULÁRIO (crawler/spam genérico); o script que chama a Server
 * Action direto não preenche o campo e cai nas quatro camadas de rate limit.
 *
 * A resposta aqui é a única do arquivo inteiro que MENTE, e a mentira é o
 * desenho (D-07): bot que recebe erro tenta de novo, bot que recebe sucesso vai
 * embora. No rate limit a certeza de bot é menor — CGNAT faz clientes reais
 * dividirem IP — e por isso lá o erro é honesto.
 */
describe('criarAgendamentoPublico — honeypot com sucesso falso (ABU-01/ABU-02, D-07)', () => {
    const PARAMS_COM_ARMADILHA = { ...PARAMS_VALIDOS, infoAdicional: 'qualquer coisa' }

    it('devolve sucesso com a forma exata de AgendamentoCriado, sem tocar em NADA', async () => {
        const resultado = await criarAgendamentoPublico(PARAMS_COM_ARMADILHA)

        expect(resultado.ok).toBe(true)
        if (resultado.ok) {
            // Forma plausível: o bot precisa acreditar que agendou. UUID de
            // verdade (não uma string qualquer), status igual ao do INSERT real
            // e a data que ele mesmo pediu de volta.
            expect(resultado.agendamento.id).toMatch(
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
            )
            expect(resultado.agendamento.status).toBe('confirmado')
            expect(typeof resultado.agendamento.data_hora).toBe('string')
            expect(resultado.agendamento.data_hora).toBe(PARAMS_VALIDOS.dataHora)
        }

        // As três provas do NEGATIVO — é aqui que "sucesso falso" se distingue
        // de "sucesso": nenhum banco, nenhum comando no Redis, nenhuma
        // mensageria. Um agendamento fantasma na agenda do profissional seria
        // pior que o spam que a armadilha existe para barrar.
        expect(createAdminClientMock).not.toHaveBeenCalled()
        expect(verificarLimiteMock).not.toHaveBeenCalled()
        expect(verificarLimiteSemConsumirMock).not.toHaveBeenCalled()
        expect(dispararNotificacoesAgendamentoMock).not.toHaveBeenCalled()
    })

    it('emite log + evento próprio, sem Issue e sem inflar o funil', async () => {
        await criarAgendamentoPublico(PARAMS_COM_ARMADILHA)

        // Código já cadastrado em MENSAGENS_LOG desde o 03-02; a variante é a
        // AGUARDADA porque o `return` encerra a Server Action na linha seguinte.
        expect(logAguardandoMock.warn).toHaveBeenCalledWith('honeypot.captura', {
            fluxo: 'booking_publico',
        })

        // Evento PRÓPRIO, e é ele o detector de falso-positivo de autofill
        // (Pitfall 6): taxa incompatível com tráfego de bot = pessoa real caindo
        // na armadilha, e aí o campo é que precisa mudar.
        expect(capturarEventoServidorMock).toHaveBeenCalledWith('booking_honeypot')

        // Variante SERVIDOR: a captura acontece antes de o slug ser resolvido,
        // então não existe tenant a quem atribuir — e `booking_completed` NÃO
        // pode sair, senão o funil do owner passa a contar bot como cliente.
        expect(capturarEventoTenantMock).not.toHaveBeenCalled()

        // Captura é ROTINA de endpoint público, igual ao bloqueio de rate limit
        // (D-11): Issue de rotina é como o owner para de olhar o Sentry.
        expect(reportarExcecaoMock).not.toHaveBeenCalled()
        expect(reportarFalhaSilenciosaMock).not.toHaveBeenCalled()
        expect(reportarFalhaSilenciosaAguardandoMock).not.toHaveBeenCalled()
    })

    it('não manda nome nem telefone do payload para fornecedor terceiro', async () => {
        await criarAgendamentoPublico(PARAMS_COM_ARMADILHA)

        const enviado = JSON.stringify([
            logAguardandoMock.warn.mock.calls,
            capturarEventoServidorMock.mock.calls,
        ])
        expect(enviado).not.toContain('Maria Silva')
        expect(enviado).not.toContain('11999998888')
        expect(enviado).not.toContain('maria@exemplo.com')
        // O slug também não: é dado do visitante, não do tenant resolvido.
        expect(enviado).not.toContain('barbearia-teste')
    })

    it('falha da telemetria NÃO muda a resposta que o bot recebe', async () => {
        logAguardandoMock.warn.mockRejectedValue(new Error('Sentry fora do ar'))
        capturarEventoServidorMock.mockImplementation(() => {
            throw new Error('PostHog fora do ar')
        })

        const resultado = await criarAgendamentoPublico(PARAMS_COM_ARMADILHA)

        // Observabilidade quebrada não pode transformar a armadilha em erro —
        // erro é exatamente o que faz o bot tentar de novo.
        expect(resultado.ok).toBe(true)
        expect(createAdminClientMock).not.toHaveBeenCalled()
    })

    it('devolve sucesso plausível mesmo com payload LIXO, sem lançar', async () => {
        // O bot não preenche formulário direito: a checagem é a PRIMEIRA da
        // action justamente para não depender de o resto do payload ser válido.
        const resultado = await criarAgendamentoPublico({
            ...PARAMS_COM_ARMADILHA,
            dataHora: undefined as unknown as string,
            clienteNome: '',
            clienteTelefone: '',
            servicoId: '',
        })

        expect(resultado.ok).toBe(true)
        if (resultado.ok) {
            // `data_hora` cai no fallback (instante atual) em vez de estourar —
            // e continua sendo uma string ISO plausível.
            expect(typeof resultado.agendamento.data_hora).toBe('string')
            expect(new Date(resultado.agendamento.data_hora).getTime()).not.toBeNaN()
        }
        expect(createAdminClientMock).not.toHaveBeenCalled()
    })

    // -----------------------------------------------------------------------
    // CONTROLE POSITIVO (ABU-02) — cliente legítimo não pode ser capturado.
    // -----------------------------------------------------------------------

    it('campo AUSENTE segue o fluxo normal, inalterado', async () => {
        const resultado = await criarAgendamentoPublico({ ...PARAMS_VALIDOS })

        // Baseline exato dos casos anteriores: passa da validação, consulta o
        // rate limit e toca o banco, parando na resolução de slug (mock vazio).
        expect(createAdminClientMock).toHaveBeenCalled()
        expect(verificarLimiteMock).toHaveBeenCalled()
        expect(resultado.ok).toBe(false)
        expect(logAguardandoMock.warn).not.toHaveBeenCalledWith(
            'honeypot.captura',
            expect.anything(),
        )
    })

    it('campo VAZIO ou só com espaços segue o fluxo normal', async () => {
        // Navegador envia string vazia para input não preenchido — é o caso de
        // TODO cliente real. Se `''` capturasse, a armadilha derrubaria o
        // produto inteiro em vez de bot nenhum.
        for (const valor of ['', '   ', '\n\t']) {
            createAdminClientMock.mockClear()
            const resultado = await criarAgendamentoPublico({
                ...PARAMS_VALIDOS,
                infoAdicional: valor,
            })

            expect(
                createAdminClientMock,
                `capturou indevidamente: ${JSON.stringify(valor)}`,
            ).toHaveBeenCalled()
            expect(resultado.ok).toBe(false)
        }
        expect(capturarEventoServidorMock).not.toHaveBeenCalledWith('booking_honeypot')
    })
})
