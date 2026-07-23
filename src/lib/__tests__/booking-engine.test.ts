import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
    obterSlotsDisponiveis,
    calcularIntervalosLivres,
    gerarSlotsAntiBuraco,
} from '../booking-engine'
import { diaLocal, somarDias } from '../timezone'

const SP = 'America/Sao_Paulo' // UTC-3
const CG = 'America/Campo_Grande' // UTC-4

interface Agendamento {
    id: string
    data_hora: string
    status: string
    servicos: { duracao_minutos: number } | null
}

interface DadosFake {
    horarios?: { hora_inicio: string; hora_fim: string }[]
    excecoes?: { hora_inicio: string | null; hora_fim: string | null; bloqueado: boolean }[]
    agendamentos?: Agendamento[]
    servicos?: { duracao_minutos: number }[]
}

/**
 * SupabaseClient falso encadeável cobrindo apenas o que a engine usa
 * (from/select/eq/neq/gte/lt/order + await do builder). O builder de
 * `agendamentos` honra `neq('id', ...)` para exercitar `ignorarAgendamentoId`.
 */
function fakeSupabase(dados: DadosFake): SupabaseClient {
    return {
        from(tabela: string) {
            if (tabela === 'agendamentos') {
                let lista = dados.agendamentos ?? []
                const builder: Record<string, unknown> = {
                    select: () => builder,
                    eq: () => builder,
                    gte: () => builder,
                    lt: () => builder,
                    neq: (coluna: string, valor: string) => {
                        if (coluna === 'id') lista = lista.filter((a) => a.id !== valor)
                        return builder
                    },
                    then: (resolve: (r: unknown) => void) => resolve({ data: lista, error: null }),
                }
                return builder
            }

            const resultado =
                tabela === 'horarios_funcionamento'
                    ? { data: dados.horarios ?? [], error: null }
                    : tabela === 'excecoes_agenda'
                      ? { data: dados.excecoes ?? [], error: null }
                      : tabela === 'servicos'
                        ? { data: dados.servicos ?? [], error: null }
                        : { data: null, error: null }

            const builder: Record<string, unknown> = {
                select: () => builder,
                eq: () => builder,
                neq: () => builder,
                gte: () => builder,
                lt: () => builder,
                order: () => builder,
                then: (resolve: (r: unknown) => void) => resolve(resultado),
            }
            return builder
        },
    } as unknown as SupabaseClient
}

const HORARIO_COMERCIAL = [{ hora_inicio: '08:00', hora_fim: '18:00' }]
const DATA = '2027-07-13' // futuro: evita o filtro de "slots passados"

describe('obterSlotsDisponiveis — fuso do estabelecimento', () => {
    it('mesma grade 08–18h gera datetimes UTC distintos em SP e CG', async () => {
        const supabase = fakeSupabase({ horarios: HORARIO_COMERCIAL })

        const slotsSP = await obterSlotsDisponiveis({
            tenantId: 't',
            dateStr: DATA,
            duracaoServicoMinutos: 30,
            supabase,
            timezone: SP,
        })
        const slotsCG = await obterSlotsDisponiveis({
            tenantId: 't',
            dateStr: DATA,
            duracaoServicoMinutos: 30,
            supabase,
            timezone: CG,
        })

        expect(slotsSP[0].time).toBe('08:00')
        expect(slotsCG[0].time).toBe('08:00')
        // 08:00 local: SP (-3) = 11:00Z; CG (-4) = 12:00Z
        expect(slotsSP[0].datetime).toBe('2027-07-13T11:00:00.000Z')
        expect(slotsCG[0].datetime).toBe('2027-07-13T12:00:00.000Z')
    })

    it('agendamento em UTC ocupa o slot local correto em cada fuso', async () => {
        // 12:00Z = 09:00 em SP e 08:00 em CG
        const agendamentos: Agendamento[] = [
            {
                id: 'ag-1',
                data_hora: '2027-07-13T12:00:00Z',
                status: 'confirmado',
                servicos: { duracao_minutos: 30 },
            },
        ]

        const slotsSP = await obterSlotsDisponiveis({
            tenantId: 't',
            dateStr: DATA,
            duracaoServicoMinutos: 30,
            supabase: fakeSupabase({ horarios: HORARIO_COMERCIAL, agendamentos }),
            timezone: SP,
        })
        const slotsCG = await obterSlotsDisponiveis({
            tenantId: 't',
            dateStr: DATA,
            duracaoServicoMinutos: 30,
            supabase: fakeSupabase({ horarios: HORARIO_COMERCIAL, agendamentos }),
            timezone: CG,
        })

        const horasSP = slotsSP.map((s) => s.time)
        const horasCG = slotsCG.map((s) => s.time)

        expect(horasSP).not.toContain('09:00') // ocupado em SP
        expect(horasSP).toContain('08:00')
        expect(horasCG).not.toContain('08:00') // ocupado em CG
        expect(horasCG).toContain('09:00')
    })

    it('ignorarAgendamentoId libera o próprio horário (remarcação)', async () => {
        const agendamentos: Agendamento[] = [
            {
                id: 'ag-1',
                data_hora: '2027-07-13T12:00:00Z',
                status: 'confirmado',
                servicos: { duracao_minutos: 30 },
            },
        ]

        const slots = await obterSlotsDisponiveis({
            tenantId: 't',
            dateStr: DATA,
            duracaoServicoMinutos: 30,
            supabase: fakeSupabase({ horarios: HORARIO_COMERCIAL, agendamentos }),
            timezone: SP,
            ignorarAgendamentoId: 'ag-1',
        })

        expect(slots.map((s) => s.time)).toContain('09:00')
    })

    it('REGRESSÃO: em SP cada slot é byte-idêntico à construção -03:00', async () => {
        const slots = await obterSlotsDisponiveis({
            tenantId: 't',
            dateStr: DATA,
            duracaoServicoMinutos: 30,
            supabase: fakeSupabase({ horarios: HORARIO_COMERCIAL }),
            timezone: SP,
        })

        expect(slots.length).toBeGreaterThan(0)
        for (const slot of slots) {
            const esperado = new Date(`${DATA}T${slot.time}:00-03:00`).toISOString()
            expect(slot.datetime).toBe(esperado)
        }
    })
})

describe('obterSlotsDisponiveis — grade anti-buraco', () => {
    it('dia vazio 08–18h, d=30 com serviço ativo de 30min: grade a cada 30min a partir da abertura', async () => {
        const supabase = fakeSupabase({
            horarios: [{ hora_inicio: '08:00', hora_fim: '18:00' }],
            servicos: [{ duracao_minutos: 30 }],
        })
        const slots = await obterSlotsDisponiveis({
            tenantId: 't',
            dateStr: DATA,
            duracaoServicoMinutos: 30,
            supabase,
            timezone: SP,
        })
        const horas = slots.map((s) => s.time)

        expect(horas).toContain('08:00')
        expect(horas).toContain('08:30')
        expect(horas).not.toContain('08:15')
        expect(horas[horas.length - 1]).toBe('17:30')
    })

    it('agendamento cria buraco: candidato colado ao agendamento é oferecido, o do meio não', async () => {
        // 09:00 SP = 12:00Z
        const agendamentos: Agendamento[] = [
            {
                id: 'ag-1',
                data_hora: '2027-07-13T12:00:00Z',
                status: 'confirmado',
                servicos: { duracao_minutos: 30 },
            },
        ]
        const supabase = fakeSupabase({
            horarios: [{ hora_inicio: '08:00', hora_fim: '18:00' }],
            servicos: [{ duracao_minutos: 30 }],
            agendamentos,
        })
        const slots = await obterSlotsDisponiveis({
            tenantId: 't',
            dateStr: DATA,
            duracaoServicoMinutos: 30,
            supabase,
            timezone: SP,
        })
        const horas = slots.map((s) => s.time)

        expect(horas).toContain('08:00')
        expect(horas).toContain('08:30') // colado no início do agendamento
        expect(horas).toContain('09:30') // colado no fim do agendamento
        expect(horas).not.toContain('08:15')
        expect(horas).not.toContain('09:45')
    })

    it('menor serviço ativo determina o gap mínimo aceitável, mesmo pedindo um serviço maior', async () => {
        const supabase = fakeSupabase({
            horarios: [{ hora_inicio: '08:00', hora_fim: '18:00' }],
            servicos: [{ duracao_minutos: 30 }, { duracao_minutos: 90 }],
        })
        const slots = await obterSlotsDisponiveis({
            tenantId: 't',
            dateStr: DATA,
            duracaoServicoMinutos: 90,
            supabase,
            timezone: SP,
        })
        const horas = slots.map((s) => s.time)

        expect(horas).toContain('08:00')
        expect(horas).toContain('08:30')
        expect(horas).toContain('08:45')
        expect(horas).not.toContain('08:15')
        expect(horas).toContain('16:30') // colado no fechamento
    })

    it('múltiplas janelas no mesmo dia: cada janela gera sua própria grade, sem vazamento entre elas', async () => {
        const supabase = fakeSupabase({
            horarios: [
                { hora_inicio: '08:00', hora_fim: '12:00' },
                { hora_inicio: '14:00', hora_fim: '18:00' },
            ],
            servicos: [{ duracao_minutos: 60 }],
        })
        const slots = await obterSlotsDisponiveis({
            tenantId: 't',
            dateStr: DATA,
            duracaoServicoMinutos: 60,
            supabase,
            timezone: SP,
        })
        const horas = slots.map((s) => s.time)

        expect(horas).toContain('08:00')
        expect(horas).toContain('11:00')
        expect(horas).toContain('14:00')
        expect(horas).toContain('17:00')
        expect(horas).not.toContain('12:00')
        expect(horas).not.toContain('13:00')
        expect(horas).not.toContain('08:15')
    })

    it('janela mais curta que d + menorDuração ainda oferece os dois extremos (desperdício inevitável)', async () => {
        const supabase = fakeSupabase({
            horarios: [{ hora_inicio: '08:00', hora_fim: '08:45' }],
            servicos: [{ duracao_minutos: 30 }],
        })
        const slots = await obterSlotsDisponiveis({
            tenantId: 't',
            dateStr: DATA,
            duracaoServicoMinutos: 30,
            supabase,
            timezone: SP,
        })

        expect(slots.map((s) => s.time)).toEqual(['08:00', '08:15'])
    })
})

describe('obterSlotsDisponiveis — regras de acesso', () => {
    it('antecedência mínima filtra por instante, atravessando a virada do dia', async () => {
        const hojeReal = diaLocal(new Date(), SP)
        const amanha = somarDias(hojeReal, 1)
        const supabase = fakeSupabase({
            horarios: [{ hora_inicio: '00:00', hora_fim: '23:59' }],
            servicos: [{ duracao_minutos: 30 }],
        })

        const comAntecedenciaLonga = await obterSlotsDisponiveis({
            tenantId: 't',
            dateStr: amanha,
            duracaoServicoMinutos: 30,
            supabase,
            timezone: SP,
            regrasAcesso: { antecedenciaMinutos: 4320, horizonteDias: null }, // 3 dias
        })
        expect(comAntecedenciaLonga).toEqual([])

        const semAntecedencia = await obterSlotsDisponiveis({
            tenantId: 't',
            dateStr: amanha,
            duracaoServicoMinutos: 30,
            supabase,
            timezone: SP,
            regrasAcesso: { antecedenciaMinutos: 0, horizonteDias: null },
        })
        expect(semAntecedencia.length).toBeGreaterThan(0)
    })

    it('horizonte máximo bloqueia datas além do limite; fluxo manual (sem regrasAcesso) não tem limite', async () => {
        const hojeReal = diaLocal(new Date(), SP)
        const dataAlem = somarDias(hojeReal, 15)
        const supabase = fakeSupabase({
            horarios: [{ hora_inicio: '08:00', hora_fim: '18:00' }],
            servicos: [{ duracao_minutos: 30 }],
        })

        const comHorizonte = await obterSlotsDisponiveis({
            tenantId: 't',
            dateStr: dataAlem,
            duracaoServicoMinutos: 30,
            supabase,
            timezone: SP,
            regrasAcesso: { antecedenciaMinutos: 0, horizonteDias: 14 },
        })
        expect(comHorizonte).toEqual([])

        const semRegras = await obterSlotsDisponiveis({
            tenantId: 't',
            dateStr: dataAlem,
            duracaoServicoMinutos: 30,
            supabase,
            timezone: SP,
        })
        expect(semRegras.length).toBeGreaterThan(0)
    })

    it('permite exatamente o último dia do horizonte (hoje + horizonteDias é inclusivo)', async () => {
        const hojeReal = diaLocal(new Date(), SP)
        const dataNoLimite = somarDias(hojeReal, 14)
        const supabase = fakeSupabase({
            horarios: [{ hora_inicio: '08:00', hora_fim: '18:00' }],
            servicos: [{ duracao_minutos: 30 }],
        })

        const slots = await obterSlotsDisponiveis({
            tenantId: 't',
            dateStr: dataNoLimite,
            duracaoServicoMinutos: 30,
            supabase,
            timezone: SP,
            regrasAcesso: { antecedenciaMinutos: 0, horizonteDias: 14 },
        })
        expect(slots.length).toBeGreaterThan(0)
    })
})

describe('calcularIntervalosLivres', () => {
    it('subtrai bloqueios e ocupados de uma janela única', () => {
        const resultado = calcularIntervalosLivres(
            [{ start: 0, end: 600 }],
            [{ start: 100, end: 200 }],
            [{ start: 300, end: 400 }],
        )
        expect(resultado).toEqual([
            { start: 0, end: 100 },
            { start: 200, end: 300 },
            { start: 400, end: 600 },
        ])
    })

    it('mescla janelas sobrepostas antes de subtrair (defesa contra dados inconsistentes)', () => {
        const resultado = calcularIntervalosLivres(
            [
                { start: 0, end: 100 },
                { start: 90, end: 200 },
            ],
            [],
            [],
        )
        expect(resultado).toEqual([{ start: 0, end: 200 }])
    })

    it('mescla janelas adjacentes (fim de uma == início da outra)', () => {
        const resultado = calcularIntervalosLivres(
            [
                { start: 0, end: 100 },
                { start: 100, end: 200 },
            ],
            [],
            [],
        )
        expect(resultado).toEqual([{ start: 0, end: 200 }])
    })

    it('bloqueio cobrindo o dia inteiro esvazia o resultado', () => {
        const resultado = calcularIntervalosLivres(
            [{ start: 480, end: 1080 }],
            [{ start: 480, end: 1080 }],
            [],
        )
        expect(resultado).toEqual([])
    })

    it('sem janelas de funcionamento retorna vazio', () => {
        expect(calcularIntervalosLivres([], [{ start: 0, end: 10 }], [])).toEqual([])
    })
})

describe('gerarSlotsAntiBuraco', () => {
    it('cobre início e fim quando o intervalo é exatamente 2× a duração', () => {
        const resultado = gerarSlotsAntiBuraco([{ start: 0, end: 60 }], 30, 30)
        expect(resultado).toEqual([0, 30])
    })

    it('descarta candidato que criaria um buraco menor que a menor duração ativa', () => {
        const resultado = gerarSlotsAntiBuraco([{ start: 0, end: 105 }], 30, 30)
        expect(resultado).toEqual([0, 30, 45, 60, 75])
    })

    it('end-aligned coincidindo com candidato da grade não duplica e mantém ordenação', () => {
        const resultado = gerarSlotsAntiBuraco([{ start: 0, end: 60 }], 15, 15)
        expect(resultado).toEqual([0, 15, 30, 45])
    })

    it('intervalo sem espaço para a duração não gera candidatos', () => {
        expect(gerarSlotsAntiBuraco([{ start: 0, end: 20 }], 30, 30)).toEqual([])
    })

    // -----------------------------------------------------------------------
    // Guarda de profundidade — o invariante que impede uma duração hostil de
    // virar a condição de parada do laço. A fronteira da Server Action pública
    // (`obterSlotsPublicos`) valida antes de chegar aqui; estes casos travam o
    // contrato na função PURA, que é exportada e sobrevive a um chamador futuro
    // que ninguém se lembre de proteger.
    // -----------------------------------------------------------------------

    it('duração negativa de grande magnitude não gera candidato nenhum', () => {
        const resultado = gerarSlotsAntiBuraco([{ start: 480, end: 1080 }], -5_000_000, 30)
        // Asserção sobre o TAMANHO de propósito: sem a guarda, a mensagem de
        // falha do vitest imprime a MEDIDA do defeito ("expected 333374 to be
        // 0") em vez de despejar centenas de milhares de números no terminal.
        // É a magnitude que o verificador mediu por HTTP: 26.751 ms e 19,29 MB
        // numa única requisição anônima.
        expect(resultado.length).toBe(0)
    })

    it('duração zero não gera candidato nenhum', () => {
        expect(gerarSlotsAntiBuraco([{ start: 0, end: 60 }], 0, 30)).toEqual([])
    })

    it('duração fracionária não gera candidato nenhum', () => {
        expect(gerarSlotsAntiBuraco([{ start: 0, end: 60 }], 30.5, 30)).toEqual([])
    })

    it('duração NaN não gera candidato nenhum', () => {
        expect(gerarSlotsAntiBuraco([{ start: 0, end: 60 }], NaN, 30)).toEqual([])
    })

    it('duração infinita não gera candidato nenhum', () => {
        expect(gerarSlotsAntiBuraco([{ start: 0, end: 60 }], Infinity, 30)).toEqual([])
        // `-Infinity` só é seguro de assertar DEPOIS da guarda: sem ela, a
        // condição de parada nunca fecha e o laço não termina.
        expect(gerarSlotsAntiBuraco([{ start: 0, end: 60 }], -Infinity, 30)).toEqual([])
    })

    it('CONTROLE POSITIVO: duração legítima devolve a MESMA grade de antes da guarda', () => {
        // Sem este caso, uma guarda que recusasse TUDO passaria em todos os
        // outros. As três entradas abaixo são, byte a byte, as dos casos que já
        // existiam neste bloco antes da guarda — e as saídas esperadas também.
        expect(gerarSlotsAntiBuraco([{ start: 0, end: 60 }], 30, 30)).toEqual([0, 30])
        expect(gerarSlotsAntiBuraco([{ start: 0, end: 105 }], 30, 30)).toEqual([0, 30, 45, 60, 75])
        expect(gerarSlotsAntiBuraco([{ start: 0, end: 60 }], 15, 15)).toEqual([0, 15, 30, 45])
    })
})

describe('obterSlotsDisponiveis — duração inválida pela API pública da engine', () => {
    it('duração inválida devolve lista vazia sem estourar', async () => {
        const supabase = fakeSupabase({ horarios: HORARIO_COMERCIAL })

        // Pela porta pública da engine, não só pela função interna: é por aqui
        // que `obterSlotsPublicos` e `obterSlotsDashboard` entram, e é aqui que
        // um chamador futuro herda a proteção.
        const slots = await obterSlotsDisponiveis({
            tenantId: 't',
            dateStr: DATA,
            duracaoServicoMinutos: 0,
            supabase,
            timezone: SP,
        })

        expect(slots).toEqual([])
    })
})
