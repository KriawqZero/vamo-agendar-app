/**
 * Suíte HERMÉTICA do fluxo WALK-IN do dashboard (`agendamentos.ts`) — o espelho
 * B2B do `public-booking-corrida.test.ts`. Roda no `pnpm test` padrão, SEM banco:
 * o cliente authenticated (`createClient`), a engine de disponibilidade, as
 * assinaturas, a mensageria e o `auth()` do Clerk são dublês, e a prova é sobre o
 * ROTEAMENTO de `criarAgendamentoManual`/`remarcarAgendamento`, não sobre o Postgres.
 *
 * Por que hermética: a exclusion constraint `ag_sem_sobreposicao` (que produz o
 * `23P01`) só é aplicada no plano 02-05. Injetar o `error.code` na fronteira do
 * dublê é a única forma HOJE de exercitar o ramo de perda de corrida. A prova
 * ponta a ponta contra o banco real é o plano 02-06, depois do apply.
 *
 * O que esta suíte pina (Task 1 — criarAgendamentoManual, D-01/D-04):
 *   - Sucesso vira retorno discriminado { ok:true, agendamento }.
 *   - O cadastro por telefone usa a MESMA RPC `reaproveitar_ou_criar_cliente`
 *     (atômica, COALESCE) — não o select-then-insert solto.
 *   - O INSERT do agendamento grava `data_hora_fim` = data_hora + duração.
 *   - INSERT com `23P01` (perda de corrida) → { ok:false, motivo:'slot_ocupado',
 *     conflito:{cliente,servico,horario} } do PRÓPRIO tenant, e NUNCA reportarExcecao.
 *   - A .message crua do Postgres NUNCA atravessa para o retorno.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// -- Dublês, cada um por um motivo concreto ---------------------------------
// createClient: a asserção central é sobre O QUE a action pede ao banco (RPC,
//   payload do INSERT/UPDATE) e sobre o error.code que ela recebe de volta.
// auth: `criarAgendamentoManual` exige orgId — o dublê fixa o tenant da fixture.
// booking-engine: a revalidação de slot compara por igualdade exata contra a
//   saída da engine; devolvê-la aqui evita reconstruir as consultas internas.
// notificacoes/whatsapp-helper: nenhuma chamada pode sair para Evolution/QStash.
// assinaturas: `obterPlanoVigentePublico` toca o banco (usado na remarcação).
// analytics: `capturarEventoTenant` chama `after()` de next/server, que LANÇA
//   fora de um contexto de request.
// reportar: guarda defensiva — provar que o ramo 23P01 do walk-in NÃO reporta.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({ auth: authMock }))

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))

const { obterSlotsDisponiveisMock } = vi.hoisted(() => ({ obterSlotsDisponiveisMock: vi.fn() }))
vi.mock('@/lib/booking-engine', () => ({ obterSlotsDisponiveis: obterSlotsDisponiveisMock }))

vi.mock('@/lib/analytics/server', () => ({
    capturarEventoTenant: vi.fn(),
    capturarEventoServidor: vi.fn(),
}))
vi.mock('@/lib/notificacoes-agendamento', () => ({
    dispararNotificacoesAgendamento: vi.fn(async () => {}),
}))
vi.mock('@/lib/whatsapp-helper', () => ({
    agendarLembreteQStash: vi.fn(async () => ({ ok: false, motivo: 'sem_config' })),
    cancelarLembreteQStash: vi.fn(async () => {}),
    registrarDisparo: vi.fn(async () => {}),
}))
vi.mock('@/lib/assinaturas', () => ({
    obterPlanoVigentePublico: vi.fn(async () => ({ plano: 'gratuito', degradadoPorErro: false })),
}))

const { reportarExcecaoMock } = vi.hoisted(() => ({ reportarExcecaoMock: vi.fn() }))
vi.mock('@/lib/observabilidade/reportar', () => ({
    reportarExcecao: reportarExcecaoMock,
    reportarFalhaSilenciosa: vi.fn(),
}))

import { criarAgendamentoManual, remarcarAgendamento } from '@/app/actions/agendamentos'

// ---------------------------------------------------------------------------
// Fixture determinística
// ---------------------------------------------------------------------------

const TENANT = 'org_walkin_corrida'
const SERVICO_ID = 'srv-walkin-1'
const CLIENTE_ID = 'cliente-uuid-walkin'
const DURACAO_MINUTOS = 30
const DATA_HORA = '2099-01-15T13:00:00.000Z'
const DATA_HORA_FIM_ESPERADO = '2099-01-15T13:30:00.000Z'

const TELEFONE_FORMATADO = '(11) 98888-7777'
const TELEFONE_SANITIZADO = '11988887777'
const NOME = 'Maria Silva'

// Agendamento que ocupa o horário no dublê (dado do PRÓPRIO tenant).
const CONFLITO_CLIENTE = 'Joana Concorrente'
const CONFLITO_SERVICO = 'Escova'
const CONFLITO_HORARIO = '2099-01-15T13:15:00.000Z'

const PARAMS_NOVO_CLIENTE = {
    servicoId: SERVICO_ID,
    dataHora: DATA_HORA,
    clienteNome: NOME,
    clienteTelefone: TELEFONE_FORMATADO,
} as const

// -- Remarcação (Task 2): a duração ORIGINAL reservada é de 45 min --------------
const AGENDAMENTO_ID = 'ag-alvo'
const ORIGINAL_DATA_HORA = '2099-01-10T09:00:00.000Z'
const ORIGINAL_DATA_HORA_FIM = '2099-01-10T09:45:00.000Z' // 45 min
const NOVA_DATA_HORA = '2099-01-15T13:00:00.000Z'
const NOVO_DATA_HORA_FIM_ESPERADO = '2099-01-15T13:45:00.000Z' // 45 min preservados

interface ConfigSupabase {
    /** Resposta da RPC de cliente: `{ data: id, error }`. */
    rpcResposta?: { data: unknown; error: unknown }
    /** Resposta do INSERT do agendamento: `{ data, error }`. */
    insertResposta?: { data: unknown; error: unknown }
    /** Resposta do UPDATE do agendamento (remarcação): `{ data, error }`. */
    updateResposta?: { data: unknown; error: unknown }
    /** Resposta da busca do conflitante (overlap): `{ data, error }`. */
    conflitoResposta?: { data: unknown; error: unknown }
    /** Resposta do SELECT do agendamento-alvo da remarcação: `{ data, error }`. */
    alvoResposta?: { data: unknown; error: unknown }
}

interface Capturas {
    rpc: { nome: string; args: Record<string, unknown> } | null
    insertAgendamento: Record<string, unknown> | null
    updateAgendamento: Record<string, unknown> | null
    conflitoConsultado: boolean
}

function criarSupabaseFake(config: ConfigSupabase) {
    const capturas: Capturas = {
        rpc: null,
        insertAgendamento: null,
        updateAgendamento: null,
        conflitoConsultado: false,
    }

    const rpcResposta = config.rpcResposta ?? { data: CLIENTE_ID, error: null }
    const insertResposta = config.insertResposta ?? {
        data: { id: 'ag-1', data_hora: DATA_HORA, status: 'confirmado' },
        error: null,
    }
    const updateResposta = config.updateResposta ?? {
        data: { id: 'ag-alvo', data_hora: NOVA_DATA_HORA, status: 'confirmado' },
        error: null,
    }
    const alvoResposta = config.alvoResposta ?? {
        data: {
            id: 'ag-alvo',
            status: 'confirmado',
            data_hora: ORIGINAL_DATA_HORA,
            data_hora_fim: ORIGINAL_DATA_HORA_FIM,
        },
        error: null,
    }
    const conflitoResposta = config.conflitoResposta ?? {
        data: {
            data_hora: CONFLITO_HORARIO,
            data_hora_fim: '2099-01-15T13:45:00.000Z',
            clientes: { nome: CONFLITO_CLIENTE },
            servicos: { nome: CONFLITO_SERVICO },
        },
        error: null,
    }

    function resolver(table: string, op: string, cols: string) {
        if (table === 'perfis_empresas') {
            return { data: { timezone: 'America/Sao_Paulo' }, error: null }
        }
        if (table === 'servicos') {
            return { data: { duracao_minutos: DURACAO_MINUTOS, nome: 'Corte' }, error: null }
        }
        if (table === 'clientes') {
            // Releitura do cliente após a RPC (ou lookup por id).
            return {
                data: { id: CLIENTE_ID, nome: NOME, telefone: TELEFONE_SANITIZADO },
                error: null,
            }
        }
        if (table === 'agendamentos') {
            if (op === 'insert') return insertResposta
            if (op === 'update') return updateResposta
            // Select com join de clientes/servicos = busca do conflitante.
            if (cols.includes('clientes')) {
                capturas.conflitoConsultado = true
                return conflitoResposta
            }
            // Select com status = SELECT do agendamento-alvo da remarcação.
            if (cols.includes('status')) return alvoResposta
            return { data: null, error: null }
        }
        if (table === 'disparos_whatsapp') return { data: null, error: null }
        if (table === 'whatsapp_configs') return { data: null, error: null }
        return { data: null, error: null }
    }

    function chain(table: string) {
        let op = 'select'
        let cols = ''
        const b: Record<string, unknown> = {
            select(c?: string) {
                if (op !== 'insert' && op !== 'update') op = 'select'
                if (typeof c === 'string') cols = c
                return b
            },
            insert(p: Record<string, unknown>) {
                op = 'insert'
                if (table === 'agendamentos') capturas.insertAgendamento = p
                return b
            },
            update(p: Record<string, unknown>) {
                op = 'update'
                if (table === 'agendamentos') capturas.updateAgendamento = p
                return b
            },
            eq: () => b,
            neq: () => b,
            lt: () => b,
            gt: () => b,
            gte: () => b,
            order: () => b,
            limit: () => b,
            single: async () => resolver(table, op, cols),
            maybeSingle: async () => resolver(table, op, cols),
        }
        return b
    }

    const supabase = {
        from: (table: string) => chain(table),
        rpc(nome: string, args: Record<string, unknown>) {
            capturas.rpc = { nome, args }
            return Promise.resolve(rpcResposta)
        },
    }

    return { supabase, capturas }
}

function montar(config: ConfigSupabase = {}) {
    const { supabase, capturas } = criarSupabaseFake(config)
    createClientMock.mockResolvedValue(supabase)
    return capturas
}

beforeEach(() => {
    vi.clearAllMocks()
    authMock.mockResolvedValue({ orgId: TENANT })
    obterSlotsDisponiveisMock.mockResolvedValue([{ time: '10:00', datetime: DATA_HORA }])
})

// ---------------------------------------------------------------------------
// Task 1 — criarAgendamentoManual: RPC de cliente + data_hora_fim + 23P01
// ---------------------------------------------------------------------------

describe('criarAgendamentoManual — RPC atômica de cliente por telefone (D-01)', () => {
    it('chama reaproveitar_ou_criar_cliente com os campos saneados e usa o id retornado', async () => {
        const capturas = montar()

        const resultado = await criarAgendamentoManual({ ...PARAMS_NOVO_CLIENTE })

        expect(resultado.ok).toBe(true)
        expect(capturas.rpc).not.toBeNull()
        expect(capturas.rpc!.nome).toBe('reaproveitar_ou_criar_cliente')
        expect(capturas.rpc!.args).toEqual({
            p_tenant_id: TENANT,
            p_telefone: TELEFONE_SANITIZADO,
            p_nome: NOME,
            p_email: null,
        })
        expect(capturas.insertAgendamento!.cliente_id).toBe(CLIENTE_ID)
    })

    it('grava data_hora_fim = data_hora + duração do serviço no INSERT do agendamento', async () => {
        const capturas = montar()

        await criarAgendamentoManual({ ...PARAMS_NOVO_CLIENTE })

        expect(capturas.insertAgendamento!.data_hora).toBe(DATA_HORA)
        expect(capturas.insertAgendamento!.data_hora_fim).toBe(DATA_HORA_FIM_ESPERADO)
    })
})

describe('criarAgendamentoManual — perda de corrida no INSERT (D-04)', () => {
    it('INSERT com 23P01 → slot_ocupado com detalhe do próprio tenant, sem reportarExcecao', async () => {
        const capturas = montar({
            insertResposta: {
                data: null,
                // .message crua embute org_id e horário — só o error.code é lido.
                error: {
                    code: '23P01',
                    message:
                        'conflicting key value violates exclusion constraint "ag_sem_sobreposicao" org_terceiro',
                },
            },
        })

        const resultado = await criarAgendamentoManual({ ...PARAMS_NOVO_CLIENTE })

        expect(resultado).toEqual({
            ok: false,
            motivo: 'slot_ocupado',
            conflito: {
                cliente: CONFLITO_CLIENTE,
                servico: CONFLITO_SERVICO,
                horario: CONFLITO_HORARIO,
            },
        })
        expect(capturas.conflitoConsultado).toBe(true)
        // Perda de corrida é ESPERADA — não infla o Sentry.
        expect(reportarExcecaoMock).not.toHaveBeenCalled()
    })

    it('a .message crua do 23P01 NUNCA atravessa para o retorno', async () => {
        const messageComPII =
            'violates exclusion constraint org_terceiro horario-de-terceiro 2099-01-15'
        montar({
            insertResposta: { data: null, error: { code: '23P01', message: messageComPII } },
        })

        const resultado = await criarAgendamentoManual({ ...PARAMS_NOVO_CLIENTE })

        const serializado = JSON.stringify(resultado)
        expect(serializado).not.toContain('org_terceiro')
        expect(serializado).not.toContain('exclusion')
        expect(serializado).not.toContain(messageComPII)
    })

    it('revalidação da engine falhando (slot já não livre) → slot_ocupado com detalhe', async () => {
        // A engine deixa de oferecer o slot (TOCTOU antes do INSERT): unifica a UX
        // com a perda de corrida — mesmo motivo, mesmo detalhe, sem throw.
        obterSlotsDisponiveisMock.mockResolvedValue([{ time: '11:00', datetime: 'outro-horario' }])
        montar()

        const resultado = await criarAgendamentoManual({ ...PARAMS_NOVO_CLIENTE })

        expect(resultado.ok).toBe(false)
        expect((resultado as { motivo: string }).motivo).toBe('slot_ocupado')
    })
})

// ---------------------------------------------------------------------------
// Task 2 — remarcarAgendamento: congela a duração ORIGINAL + 23P01 (D-03)
// ---------------------------------------------------------------------------

describe('remarcarAgendamento — congela a duração ORIGINAL reservada (D-03)', () => {
    it('novoDataHoraFim deriva do intervalo original (data_hora_fim − data_hora), não da duração vigente', async () => {
        obterSlotsDisponiveisMock.mockResolvedValue([{ time: '10:00', datetime: NOVA_DATA_HORA }])
        const capturas = montar()

        const resultado = await remarcarAgendamento(AGENDAMENTO_ID, NOVA_DATA_HORA)

        expect(resultado.ok).toBe(true)
        // O UPDATE grava data_hora E data_hora_fim, com a duração ORIGINAL (45 min),
        // NÃO os 30 min do serviço vigente no dublê (DURACAO_MINUTOS).
        expect(capturas.updateAgendamento!.data_hora).toBe(NOVA_DATA_HORA)
        expect(capturas.updateAgendamento!.data_hora_fim).toBe(NOVO_DATA_HORA_FIM_ESPERADO)
    })

    it('revalida a engine com a duração ORIGINAL (45 min), ignorando o próprio agendamento', async () => {
        obterSlotsDisponiveisMock.mockResolvedValue([{ time: '10:00', datetime: NOVA_DATA_HORA }])
        montar()

        await remarcarAgendamento(AGENDAMENTO_ID, NOVA_DATA_HORA)

        expect(obterSlotsDisponiveisMock).toHaveBeenCalledWith(
            expect.objectContaining({
                duracaoServicoMinutos: 45,
                ignorarAgendamentoId: AGENDAMENTO_ID,
            }),
        )
    })
})

describe('remarcarAgendamento — perda de corrida no UPDATE (D-03)', () => {
    it('UPDATE com 23P01 → slot_ocupado com detalhe do próprio tenant, sem reportarExcecao', async () => {
        obterSlotsDisponiveisMock.mockResolvedValue([{ time: '10:00', datetime: NOVA_DATA_HORA }])
        montar({
            updateResposta: {
                data: null,
                error: {
                    code: '23P01',
                    message:
                        'conflicting key value violates exclusion constraint "ag_sem_sobreposicao" org_terceiro',
                },
            },
        })

        const resultado = await remarcarAgendamento(AGENDAMENTO_ID, NOVA_DATA_HORA)

        expect(resultado).toEqual({
            ok: false,
            motivo: 'slot_ocupado',
            conflito: {
                cliente: CONFLITO_CLIENTE,
                servico: CONFLITO_SERVICO,
                horario: CONFLITO_HORARIO,
            },
        })
        expect(reportarExcecaoMock).not.toHaveBeenCalled()
    })

    it('a .message crua do 23P01 na remarcação NUNCA atravessa para o retorno', async () => {
        const messageComPII = 'violates exclusion constraint org_terceiro horario-de-terceiro'
        obterSlotsDisponiveisMock.mockResolvedValue([{ time: '10:00', datetime: NOVA_DATA_HORA }])
        montar({
            updateResposta: { data: null, error: { code: '23P01', message: messageComPII } },
        })

        const resultado = await remarcarAgendamento(AGENDAMENTO_ID, NOVA_DATA_HORA)

        const serializado = JSON.stringify(resultado)
        expect(serializado).not.toContain('org_terceiro')
        expect(serializado).not.toContain('exclusion')
        expect(serializado).not.toContain(messageComPII)
    })
})
