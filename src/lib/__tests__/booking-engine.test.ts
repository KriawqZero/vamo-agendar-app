import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { obterSlotsDisponiveis } from '../booking-engine'

const SP = 'America/Sao_Paulo'   // UTC-3
const CG = 'America/Campo_Grande' // UTC-4

interface Agendamento {
    id: string
    data_hora: string
    status: string
    servicos: { duracao_minutos: number } | null
}

interface DadosFake {
    horarios?: { hora_inicio: string; hora_fim: string } | null
    excecoes?: { hora_inicio: string | null; hora_fim: string | null; bloqueado: boolean }[]
    agendamentos?: Agendamento[]
}

/**
 * SupabaseClient falso encadeável cobrindo apenas o que a engine usa
 * (from/select/eq/neq/gte/lt/maybeSingle + await do builder). O builder de
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
                    ? { data: dados.horarios ?? null, error: null }
                    : tabela === 'excecoes_agenda'
                        ? { data: dados.excecoes ?? [], error: null }
                        : { data: null, error: null }

            const builder: Record<string, unknown> = {
                select: () => builder,
                eq: () => builder,
                neq: () => builder,
                gte: () => builder,
                lt: () => builder,
                maybeSingle: async () => resultado,
                then: (resolve: (r: unknown) => void) => resolve(resultado),
            }
            return builder
        },
    } as unknown as SupabaseClient
}

const HORARIO_COMERCIAL = { hora_inicio: '08:00', hora_fim: '18:00' }
const DATA = '2027-07-13' // futuro: evita o filtro de "slots passados"

describe('obterSlotsDisponiveis — fuso do estabelecimento', () => {
    it('mesma grade 08–18h gera datetimes UTC distintos em SP e CG', async () => {
        const supabase = fakeSupabase({ horarios: HORARIO_COMERCIAL })

        const slotsSP = await obterSlotsDisponiveis({
            tenantId: 't', dateStr: DATA, duracaoServicoMinutos: 30, supabase, timezone: SP,
        })
        const slotsCG = await obterSlotsDisponiveis({
            tenantId: 't', dateStr: DATA, duracaoServicoMinutos: 30, supabase, timezone: CG,
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
            { id: 'ag-1', data_hora: '2027-07-13T12:00:00Z', status: 'confirmado', servicos: { duracao_minutos: 30 } },
        ]

        const slotsSP = await obterSlotsDisponiveis({
            tenantId: 't', dateStr: DATA, duracaoServicoMinutos: 30,
            supabase: fakeSupabase({ horarios: HORARIO_COMERCIAL, agendamentos }), timezone: SP,
        })
        const slotsCG = await obterSlotsDisponiveis({
            tenantId: 't', dateStr: DATA, duracaoServicoMinutos: 30,
            supabase: fakeSupabase({ horarios: HORARIO_COMERCIAL, agendamentos }), timezone: CG,
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
            { id: 'ag-1', data_hora: '2027-07-13T12:00:00Z', status: 'confirmado', servicos: { duracao_minutos: 30 } },
        ]

        const slots = await obterSlotsDisponiveis({
            tenantId: 't', dateStr: DATA, duracaoServicoMinutos: 30,
            supabase: fakeSupabase({ horarios: HORARIO_COMERCIAL, agendamentos }),
            timezone: SP, ignorarAgendamentoId: 'ag-1',
        })

        expect(slots.map((s) => s.time)).toContain('09:00')
    })

    it('REGRESSÃO: em SP cada slot é byte-idêntico à construção -03:00', async () => {
        const slots = await obterSlotsDisponiveis({
            tenantId: 't', dateStr: DATA, duracaoServicoMinutos: 30,
            supabase: fakeSupabase({ horarios: HORARIO_COMERCIAL }), timezone: SP,
        })

        expect(slots.length).toBeGreaterThan(0)
        for (const slot of slots) {
            const esperado = new Date(`${DATA}T${slot.time}:00-03:00`).toISOString()
            expect(slot.datetime).toBe(esperado)
        }
    })
})
