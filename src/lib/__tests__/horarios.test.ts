import { describe, it, expect } from 'vitest'
import { validarJanelasFuncionamento } from '../horarios'

describe('validarJanelasFuncionamento', () => {
    it('aceita uma lista de janelas válidas e sem sobreposição', () => {
        const resultado = validarJanelasFuncionamento([
            { dia_semana: 1, hora_inicio: '08:00', hora_fim: '12:00', ativo: true },
            { dia_semana: 1, hora_inicio: '13:00', hora_fim: '18:00', ativo: true },
        ])
        expect(resultado).toBeNull()
    })

    it('rejeita janelas do mesmo dia que se sobrepõem', () => {
        const resultado = validarJanelasFuncionamento([
            { dia_semana: 2, hora_inicio: '08:00', hora_fim: '12:00', ativo: true },
            { dia_semana: 2, hora_inicio: '11:00', hora_fim: '15:00', ativo: true },
        ])
        expect(resultado).toContain('Janelas sobrepostas no dia 2')
    })

    it('aceita janelas encostadas (fim de uma == início da outra)', () => {
        const resultado = validarJanelasFuncionamento([
            { dia_semana: 3, hora_inicio: '08:00', hora_fim: '12:00', ativo: true },
            { dia_semana: 3, hora_inicio: '12:00', hora_fim: '18:00', ativo: true },
        ])
        expect(resultado).toBeNull()
    })

    it('rejeita janela com hora_fim igual a hora_inicio', () => {
        const resultado = validarJanelasFuncionamento([
            { dia_semana: 1, hora_inicio: '10:00', hora_fim: '10:00', ativo: true },
        ])
        expect(resultado).toContain('término deve ser depois do início')
    })

    it('rejeita janela com hora_fim antes de hora_inicio', () => {
        const resultado = validarJanelasFuncionamento([
            { dia_semana: 1, hora_inicio: '18:00', hora_fim: '08:00', ativo: true },
        ])
        expect(resultado).toContain('término deve ser depois do início')
    })

    it('rejeita dia_semana fora do intervalo 0-6 (acima)', () => {
        const resultado = validarJanelasFuncionamento([
            { dia_semana: 7, hora_inicio: '08:00', hora_fim: '12:00', ativo: true },
        ])
        expect(resultado).toContain('Dia da semana inválido')
    })

    it('rejeita dia_semana fora do intervalo 0-6 (negativo)', () => {
        const resultado = validarJanelasFuncionamento([
            { dia_semana: -1, hora_inicio: '08:00', hora_fim: '12:00', ativo: true },
        ])
        expect(resultado).toContain('Dia da semana inválido')
    })

    it('rejeita dia_semana não inteiro', () => {
        const resultado = validarJanelasFuncionamento([
            { dia_semana: 1.5, hora_inicio: '08:00', hora_fim: '12:00', ativo: true },
        ])
        expect(resultado).toContain('Dia da semana inválido')
    })

    it('rejeita formato de horário inválido', () => {
        const resultado = validarJanelasFuncionamento([
            { dia_semana: 1, hora_inicio: '8h', hora_fim: '12:00', ativo: true },
        ])
        expect(resultado).toContain('Horário de início inválido')
    })

    it('aceita horários no formato HH:MM:SS', () => {
        const resultado = validarJanelasFuncionamento([
            { dia_semana: 1, hora_inicio: '08:00:00', hora_fim: '12:00:00', ativo: true },
        ])
        expect(resultado).toBeNull()
    })

    it('aceita array vazio (semana toda fechada é estado legítimo)', () => {
        expect(validarJanelasFuncionamento([])).toBeNull()
    })

    it('rejeita null', () => {
        expect(validarJanelasFuncionamento(null as unknown as never[])).toContain(
            'Lista de horários inválida',
        )
    })

    it('rejeita undefined', () => {
        expect(validarJanelasFuncionamento(undefined as unknown as never[])).toContain(
            'Lista de horários inválida',
        )
    })

    it('rejeita valor que não é array', () => {
        expect(validarJanelasFuncionamento({} as unknown as never[])).toContain(
            'Lista de horários inválida',
        )
    })

    it('janelas inativas não conflitam com janelas ativas sobrepostas', () => {
        const resultado = validarJanelasFuncionamento([
            { dia_semana: 4, hora_inicio: '08:00', hora_fim: '12:00', ativo: true },
            { dia_semana: 4, hora_inicio: '10:00', hora_fim: '14:00', ativo: false },
        ])
        expect(resultado).toBeNull()
    })

    it('duas janelas inativas sobrepostas entre si também não conflitam', () => {
        const resultado = validarJanelasFuncionamento([
            { dia_semana: 5, hora_inicio: '08:00', hora_fim: '12:00', ativo: false },
            { dia_semana: 5, hora_inicio: '10:00', hora_fim: '14:00', ativo: false },
        ])
        expect(resultado).toBeNull()
    })
})
