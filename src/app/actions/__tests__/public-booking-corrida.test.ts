/**
 * Suíte HERMÉTICA do caminho de ESCRITA do booking público — dedupe atômico de
 * cliente (D-01) e discriminação da perda de corrida (D-05). Roda no `pnpm test`
 * padrão, SEM banco: o cliente privilegiado, a engine de disponibilidade e as
 * assinaturas são substituídos por dublês, e a prova é sobre o ROTEAMENTO do
 * `criarAgendamentoPublico`, não sobre o Postgres.
 *
 * Por que ela é separada da `public-booking-escrita.test.ts` (integração): aquela
 * exige credenciais reais e escreve no Supabase de dev (fica FORA do glob padrão,
 * só roda com EXIGIR_INTEGRACAO=1), e não pode fabricar sob demanda a FALHA de
 * INSERT com `23P01` — a exclusion constraint sequer está aplicada nesta wave (o
 * apply é o plano 02-05). Injetar o `error.code` na fronteira do dublê é a única
 * forma hermética de exercitar o ramo novo. A prova ponta a ponta contra o banco
 * real é o plano 02-06, depois do apply.
 *
 * O que esta suíte pina:
 *   - D-01: o select-then-insert de cliente virou UMA chamada à RPC
 *     `reaproveitar_ou_criar_cliente` (atômica, COALESCE), cujo id retornado vira
 *     o `cliente_id` do agendamento.
 *   - O INSERT do agendamento grava `data_hora_fim` = data_hora + duração.
 *   - D-05: INSERT que falha com `23P01` (perda de corrida) → `slot_indisponivel`
 *     e NUNCA `reportarExcecao` (condição esperada não infla o Sentry).
 *   - Contrafactual: qualquer OUTRO erro de INSERT continua caindo em
 *     `erro_interno` + `reportarExcecao` — é o `error.code` que discrimina.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// -- Dublês, cada um por um motivo concreto ---------------------------------
// admin: a asserção central é sobre O QUE a action pede ao banco (RPC, payload
//   do INSERT) e sobre o error.code que ela recebe de volta — tudo injetado.
// booking-engine: a validação de slot compara por igualdade exata contra a saída
//   da engine; devolvê-la aqui evita reconstruir as consultas internas da engine.
// assinaturas: `obterPlanoVigentePublico` toca o banco; fixá-la em `gratuito`
//   torna o slug efetivo = slug_gratuito, que é por onde a fixture resolve.
// analytics: `capturarEventoTenant` chama `after()` de next/server, que LANÇA
//   fora de um contexto de request.
// notificacoes: nenhuma chamada pode sair para a Evolution API por causa de teste.
// reportar: o coração do D-05 — provar que `reportarExcecao` é (ou não é) chamado.
const { createAdminClientMock } = vi.hoisted(() => ({ createAdminClientMock: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: createAdminClientMock }))

const { obterSlotsDisponiveisMock } = vi.hoisted(() => ({ obterSlotsDisponiveisMock: vi.fn() }))
vi.mock('@/lib/booking-engine', () => ({ obterSlotsDisponiveis: obterSlotsDisponiveisMock }))

const { obterPlanoVigentePublicoMock } = vi.hoisted(() => ({
    obterPlanoVigentePublicoMock: vi.fn(),
}))
vi.mock('@/lib/assinaturas', () => ({
    obterPlanoVigentePublico: obterPlanoVigentePublicoMock,
}))

vi.mock('@/lib/analytics/server', () => ({
    capturarEventoTenant: vi.fn(),
    capturarEventoServidor: vi.fn(),
}))
vi.mock('@/lib/notificacoes-agendamento', () => ({
    dispararNotificacoesAgendamento: vi.fn(async () => {}),
}))

const { reportarExcecaoMock, reportarFalhaSilenciosaMock } = vi.hoisted(() => ({
    reportarExcecaoMock: vi.fn(),
    reportarFalhaSilenciosaMock: vi.fn(),
}))
vi.mock('@/lib/observabilidade/reportar', () => ({
    reportarExcecao: reportarExcecaoMock,
    reportarFalhaSilenciosa: reportarFalhaSilenciosaMock,
}))

import { criarAgendamentoPublico } from '@/app/actions/public-booking'
import { capturarEventoTenant } from '@/lib/analytics/server'

// ---------------------------------------------------------------------------
// Fixture determinística
// ---------------------------------------------------------------------------

const TENANT = 'org_teste_corrida'
const SLUG = 'barbearia-corrida'
const SERVICO_ID = 'srv-corrida-1'
const CLIENTE_ID = 'cliente-uuid-corrida'
const DURACAO_MINUTOS = 30
const DATA_HORA = '2099-01-15T13:00:00.000Z'
const DATA_HORA_FIM_ESPERADO = '2099-01-15T13:30:00.000Z'

const TELEFONE_FORMATADO = '(11) 98888-7777'
const TELEFONE_SANITIZADO = '11988887777'
const NOME = 'Maria Silva'
const EMAIL = 'maria@exemplo.com'

const PARAMS_VALIDOS = {
    slug: SLUG,
    servicoId: SERVICO_ID,
    dataHora: DATA_HORA,
    clienteNome: NOME,
    clienteTelefone: TELEFONE_FORMATADO,
    clienteEmail: EMAIL,
} as const

/** Perfil resolvido pelas duas colunas do namespace público (slug === slug_gratuito). */
const PERFIL = {
    tenant_id: TENANT,
    slug: SLUG,
    slug_gratuito: SLUG,
    nome_estabelecimento: 'Fixture Corrida',
    timezone: 'America/Sao_Paulo',
    antecedencia_minima_minutos: 0,
    horizonte_maximo_dias: 30,
    cor_marca: null,
    logo_url: null,
    capa_url: null,
}

/** Consulta encadeável cujo terminal resolve o valor configurado. */
function builder(resolver: () => { data: unknown; error: unknown }) {
    const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        order: () => b,
        maybeSingle: async () => resolver(),
        single: async () => resolver(),
    }
    return b
}

interface ConfigAdmin {
    /** Resposta da RPC de cliente: `{ data: id, error }`. */
    rpcResposta?: { data: unknown; error: unknown }
    /** Resposta do INSERT do agendamento: `{ data, error }`. */
    agendamentoResposta?: { data: unknown; error: unknown }
}

/** Capturas para asserção pós-chamada. */
interface Capturas {
    rpc: { nome: string; args: Record<string, unknown> } | null
    insertAgendamento: Record<string, unknown> | null
}

function criarAdminFake(config: ConfigAdmin) {
    const capturas: Capturas = { rpc: null, insertAgendamento: null }

    const rpcResposta = config.rpcResposta ?? { data: CLIENTE_ID, error: null }
    const agendamentoResposta = config.agendamentoResposta ?? {
        data: { id: 'ag-1', data_hora: DATA_HORA, status: 'confirmado' },
        error: null,
    }

    const admin = {
        from(tabela: string) {
            if (tabela === 'perfis_empresas') return builder(() => ({ data: PERFIL, error: null }))
            if (tabela === 'servicos')
                return builder(() => ({
                    data: { duracao_minutos: DURACAO_MINUTOS, nome: 'Corte' },
                    error: null,
                }))
            if (tabela === 'agendamentos') {
                return {
                    insert(payload: Record<string, unknown>) {
                        capturas.insertAgendamento = payload
                        return { select: () => ({ single: async () => agendamentoResposta }) }
                    },
                }
            }
            // `clientes` só é alcançado pelo caminho ANTIGO (select-then-insert):
            // mantê-lo respondendo vazio deixa a asserção do teste FALHAR na RPC
            // ausente, em vez de estourar por tabela inesperada — RED limpo.
            if (tabela === 'clientes') {
                return {
                    ...builder(() => ({ data: null, error: null })),
                    insert: () => ({
                        select: () => ({
                            single: async () => ({ data: { id: 'legado' }, error: null }),
                        }),
                    }),
                }
            }
            throw new Error(`tabela inesperada no dublê: ${tabela}`)
        },
        rpc(nome: string, args: Record<string, unknown>) {
            capturas.rpc = { nome, args }
            return Promise.resolve(rpcResposta)
        },
    }

    return { admin, capturas }
}

function montar(config: ConfigAdmin = {}) {
    const { admin, capturas } = criarAdminFake(config)
    createAdminClientMock.mockReturnValue(admin)
    return capturas
}

beforeEach(() => {
    vi.clearAllMocks()
    obterPlanoVigentePublicoMock.mockResolvedValue({ plano: 'gratuito', degradadoPorErro: false })
    // Um único slot livre, casando por igualdade exata com a data escolhida.
    obterSlotsDisponiveisMock.mockResolvedValue([{ time: '10:00', datetime: DATA_HORA }])
})

// ---------------------------------------------------------------------------
// Task 1 — RPC atômica de cliente (D-01) + data_hora_fim no INSERT
// ---------------------------------------------------------------------------

describe('criarAgendamentoPublico — dedupe atômico de cliente via RPC (D-01)', () => {
    it('chama reaproveitar_ou_criar_cliente com os campos saneados e usa o id retornado', async () => {
        const capturas = montar()

        const resultado = await criarAgendamentoPublico({ ...PARAMS_VALIDOS })

        expect(resultado.ok).toBe(true)
        expect(capturas.rpc).not.toBeNull()
        expect(capturas.rpc!.nome).toBe('reaproveitar_ou_criar_cliente')
        expect(capturas.rpc!.args).toEqual({
            p_tenant_id: TENANT,
            p_telefone: TELEFONE_SANITIZADO,
            p_nome: NOME,
            p_email: EMAIL,
        })
        // O id devolvido pela RPC vira o cliente_id do agendamento.
        expect(capturas.insertAgendamento!.cliente_id).toBe(CLIENTE_ID)
    })

    it('passa p_email = null quando o e-mail é ausente (campo opcional)', async () => {
        const { slug, servicoId, dataHora, clienteNome, clienteTelefone } = PARAMS_VALIDOS
        const capturas = montar()

        await criarAgendamentoPublico({ slug, servicoId, dataHora, clienteNome, clienteTelefone })

        expect(capturas.rpc!.args.p_email).toBeNull()
    })

    it('grava data_hora_fim = data_hora + duração do serviço no INSERT do agendamento', async () => {
        const capturas = montar()

        await criarAgendamentoPublico({ ...PARAMS_VALIDOS })

        expect(capturas.insertAgendamento!.data_hora).toBe(DATA_HORA)
        expect(capturas.insertAgendamento!.data_hora_fim).toBe(DATA_HORA_FIM_ESPERADO)
    })

    it('erro de infra na RPC → erro_interno + reportarExcecao, SEM dado do cliente no contexto', async () => {
        const capturas = montar({
            rpcResposta: { data: null, error: { code: '08006', message: 'connection failure' } },
        })

        const resultado = await criarAgendamentoPublico({ ...PARAMS_VALIDOS })

        expect(resultado).toEqual({ ok: false, motivo: 'erro_interno' })
        expect(reportarExcecaoMock).toHaveBeenCalledTimes(1)
        // O contexto do reporte é a etapa, nunca dado do cliente.
        const contexto = reportarExcecaoMock.mock.calls[0][1]
        expect(contexto).toEqual({ fluxo: 'booking_publico', etapa: 'buscar_cliente' })
        // Prova anti-PII sobre TODOS os argumentos serializados do reporte.
        const serializado = JSON.stringify(reportarExcecaoMock.mock.calls[0])
        expect(serializado).not.toContain(TELEFONE_SANITIZADO)
        expect(serializado).not.toContain(NOME)
        expect(serializado).not.toContain(EMAIL)
        // Nenhum agendamento foi tentado após a falha de cliente.
        expect(capturas.insertAgendamento).toBeNull()
    })
})

// ---------------------------------------------------------------------------
// Task 2 — Discriminar 23P01 (perda de corrida) → slot_indisponivel, sem Sentry
// ---------------------------------------------------------------------------

describe('criarAgendamentoPublico — perda de corrida no INSERT (D-05)', () => {
    it('INSERT com 23P01 → slot_indisponivel e NUNCA reportarExcecao', async () => {
        montar({
            agendamentoResposta: {
                data: null,
                // A .message crua embute org_id e o horário de terceiro — nunca
                // pode atravessar; só o error.code (SQLSTATE, estável) é lido.
                error: {
                    code: '23P01',
                    message:
                        'conflicting key value violates exclusion constraint "ag_sem_sobreposicao" org_terceiro 2099-01-15 13:00',
                },
            },
        })

        const resultado = await criarAgendamentoPublico({ ...PARAMS_VALIDOS })

        // O mesmo discriminante que o BookingApp já consome (aviso âmbar + grade
        // recarregada). Perda de corrida é condição ESPERADA.
        expect(resultado).toEqual({ ok: false, motivo: 'slot_indisponivel' })
        // O coração do D-05: condição esperada NÃO infla o Sentry.
        expect(reportarExcecaoMock).not.toHaveBeenCalled()
        // Funil: booking_failed com o motivo da corrida.
        expect(capturarEventoTenant).toHaveBeenCalledWith('booking_failed', TENANT, {
            motivo: 'slot_indisponivel',
        })
    })

    it('a .message crua do 23P01 NUNCA atravessa para o retorno', async () => {
        const messageComPII = 'violates exclusion constraint org_terceiro horario-de-terceiro'
        montar({
            agendamentoResposta: {
                data: null,
                error: { code: '23P01', message: messageComPII },
            },
        })

        const resultado = await criarAgendamentoPublico({ ...PARAMS_VALIDOS })

        const serializado = JSON.stringify(resultado)
        expect(serializado).not.toContain('org_terceiro')
        expect(serializado).not.toContain('exclusion')
        expect(serializado).not.toContain(messageComPII)
    })

    it('CONTRAFACTUAL: erro genérico (não 23P01) continua caindo em erro_interno + reportarExcecao', async () => {
        // É o error.code que discrimina: um erro de INSERT que NÃO seja perda de
        // corrida (aqui uma violação de FK, 23503) continua sendo falha de infra
        // — vai ao Sentry, como antes. Sem o ramo 23P01 o caso acima colapsaria
        // exatamente neste comportamento; provar os dois lados fecha a discriminação.
        montar({
            agendamentoResposta: {
                data: null,
                error: { code: '23503', message: 'foreign key violation' },
            },
        })

        const resultado = await criarAgendamentoPublico({ ...PARAMS_VALIDOS })

        expect(resultado).toEqual({ ok: false, motivo: 'erro_interno' })
        expect(reportarExcecaoMock).toHaveBeenCalledTimes(1)
        expect(reportarExcecaoMock.mock.calls[0][1]).toEqual({
            fluxo: 'booking_publico',
            etapa: 'criar_agendamento',
        })
    })
})
