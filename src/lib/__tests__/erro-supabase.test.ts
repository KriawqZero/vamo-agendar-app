import { describe, it, expect } from 'vitest'

import { erroSinteticoSupabase } from '../observabilidade/erro-supabase'

/**
 * WR-09: `PostgrestError` estende `Error`, então mandá-lo cru ao Sentry leva a
 * `.message` como `exception.values[].value` — e a mensagem do Postgres embute
 * literais do input do cliente final. O `beforeSend` não filtra esse campo (e
 * não deve: filtrá-lo quebraria o agrupamento), então a barreira é aqui.
 */
describe('erroSinteticoSupabase', () => {
    it('reduz o erro ao código SQLSTATE, sem nenhuma string do banco', () => {
        const erroDoPostgrest = {
            code: '22007',
            message: 'invalid input syntax for type timestamp with time zone: "amanhã às 14h"',
            details: 'Telefone 11999999999 do cliente Maria',
            hint: null,
        }

        const sintetico = erroSinteticoSupabase(erroDoPostgrest)

        expect(sintetico).toBeInstanceOf(Error)
        expect(sintetico.message).toBe('supabase:22007')
        expect(sintetico.message).not.toContain('amanhã')
        expect(sintetico.message).not.toContain('11999999999')
        expect(sintetico.message).not.toContain('Maria')
    })

    it('erro sem código cai no rótulo informado pelo chamador', () => {
        expect(erroSinteticoSupabase(null, 'agendamento_sem_retorno').message).toBe(
            'supabase:agendamento_sem_retorno',
        )
        expect(erroSinteticoSupabase(undefined).message).toBe('supabase:sem_codigo')
        expect(erroSinteticoSupabase({ message: 'boom' }).message).toBe('supabase:sem_codigo')
    })

    it('código vazio ou não-string não vira mensagem malformada', () => {
        expect(erroSinteticoSupabase({ code: '   ' }).message).toBe('supabase:sem_codigo')
        expect(erroSinteticoSupabase({ code: 42 }).message).toBe('supabase:sem_codigo')
    })

    it('nunca lança, seja qual for o formato do erro', () => {
        expect(() => erroSinteticoSupabase('string solta')).not.toThrow()
        expect(() => erroSinteticoSupabase(0)).not.toThrow()
        expect(() => erroSinteticoSupabase(new Error('boom'))).not.toThrow()
    })
})
