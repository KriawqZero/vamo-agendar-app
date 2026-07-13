import { describe, it, expect } from 'vitest'
import {
    limitesDoDia,
    diaLocal,
    horaLocal,
    instanteDe,
    somarDias,
    diaDaSemana,
    ehTimezoneValida,
} from '../timezone'

const SP = 'America/Sao_Paulo'   // UTC-3
const CG = 'America/Campo_Grande' // UTC-4

describe('limitesDoDia', () => {
    it('São Paulo: início 03:00Z e fim exclusivo 03:00Z do dia seguinte', () => {
        const { inicio, fim } = limitesDoDia('2026-07-13', SP)
        expect(inicio.toISOString()).toBe('2026-07-13T03:00:00.000Z')
        expect(fim.toISOString()).toBe('2026-07-14T03:00:00.000Z')
    })

    it('Campo Grande: início 04:00Z (offset -4)', () => {
        const { inicio, fim } = limitesDoDia('2026-07-13', CG)
        expect(inicio.toISOString()).toBe('2026-07-13T04:00:00.000Z')
        expect(fim.toISOString()).toBe('2026-07-14T04:00:00.000Z')
    })
})

describe('diaLocal', () => {
    it('um mesmo instante cai em dias diferentes conforme o fuso', () => {
        const instante = '2026-07-13T03:30:00Z' // 00:30 em SP, 23:30 do dia 12 em CG
        expect(diaLocal(instante, SP)).toBe('2026-07-13')
        expect(diaLocal(instante, CG)).toBe('2026-07-12')
    })
})

describe('instanteDe / round-trip', () => {
    it('parede local vira UTC e volta idêntica', () => {
        const instante = instanteDe('2026-07-13', '14:00', SP)
        expect(instante.toISOString()).toBe('2026-07-13T17:00:00.000Z')
        expect(diaLocal(instante, SP)).toBe('2026-07-13')
        expect(horaLocal(instante, SP)).toBe('14:00')
    })

    it('mesma parede local resolve para instantes distintos por fuso', () => {
        const sp = instanteDe('2026-07-13', '08:00', SP)
        const cg = instanteDe('2026-07-13', '08:00', CG)
        expect(sp.toISOString()).toBe('2026-07-13T11:00:00.000Z')
        expect(cg.toISOString()).toBe('2026-07-13T12:00:00.000Z')
    })

    it('meia-noite local resolve corretamente', () => {
        expect(instanteDe('2026-07-13', '00:00', SP).toISOString()).toBe('2026-07-13T03:00:00.000Z')
        expect(horaLocal('2026-07-13T03:00:00Z', SP)).toBe('00:00')
    })
})

describe('somarDias', () => {
    it('vira o mês', () => {
        expect(somarDias('2026-01-31', 1)).toBe('2026-02-01')
    })
    it('vira o ano', () => {
        expect(somarDias('2026-12-31', 1)).toBe('2027-01-01')
    })
    it('subtrai atravessando o mês', () => {
        expect(somarDias('2026-03-01', -1)).toBe('2026-02-28')
    })
    it('soma zero é identidade', () => {
        expect(somarDias('2026-07-13', 0)).toBe('2026-07-13')
    })
})

describe('diaDaSemana', () => {
    it('13/07/2026 é segunda-feira (1)', () => {
        expect(diaDaSemana('2026-07-13')).toBe(1)
    })
    it('12/07/2026 é domingo (0)', () => {
        expect(diaDaSemana('2026-07-12')).toBe(0)
    })
})

describe('ehTimezoneValida', () => {
    it('aceita fusos IANA reais', () => {
        expect(ehTimezoneValida('America/Sao_Paulo')).toBe(true)
        expect(ehTimezoneValida('America/Campo_Grande')).toBe(true)
    })
    it('rejeita valores inválidos', () => {
        expect(ehTimezoneValida('Marte/Olympus')).toBe(false)
        expect(ehTimezoneValida('')).toBe(false)
        expect(ehTimezoneValida('-03:00')).toBe(false)
    })
})
