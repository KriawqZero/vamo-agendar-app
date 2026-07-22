/**
 * Redução de erro do Supabase a um identificador seguro.
 *
 * `PostgrestError` estende `Error`, então `captureException(erro)` manda o
 * `.message` como `exception.values[].value` — e mensagem do Postgres embute
 * literais do input em vários casos (`invalid input syntax for type timestamp
 * with time zone: "…"` recebe de volta o que o cliente final digitou). Esse
 * campo não é filtrado pelo `beforeSend`, porque filtrá-lo quebraria o
 * agrupamento de todo evento do projeto — a barreira certa é aqui, na origem.
 *
 * O `code` do Postgres é enum (SQLSTATE) e não carrega dado nenhum: é o que
 * serve para depurar e o que basta para agrupar.
 *
 * Função pura, zero imports — testável sem tocar em Supabase nem em Sentry.
 */

interface ErroComCodigo {
    code?: unknown
}

/**
 * Devolve um `Error` sintético cuja mensagem é só `supabase:<code>`. Nenhuma
 * string vinda do banco atravessa.
 */
export function erroSinteticoSupabase(erro: unknown, rotuloSemCodigo = 'sem_codigo'): Error {
    const codigo = (erro as ErroComCodigo | null | undefined)?.code

    const sufixo =
        typeof codigo === 'string' && codigo.trim().length > 0 ? codigo.trim() : rotuloSemCodigo

    return new Error(`supabase:${sufixo}`)
}
