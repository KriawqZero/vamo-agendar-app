'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

/**
 * Último recuo da árvore React: pega erro que estourou no root layout, onde
 * nenhum `error.tsx` de rota alcança. Substitui o documento inteiro, por isso
 * precisa renderizar `<html>` e `<body>` por conta própria.
 *
 * Existe por causa da decisão de manter o Sentry também no client: o
 * `onRequestError` do servidor não enxerga erro de render nem de hidratação, e
 * é essa classe de falha que derruba o `/book/[slug]` no celular do cliente
 * final sem deixar rastro nenhum no servidor.
 *
 * ⚠️ NUNCA renderizar `error.message` aqui. Esta tela também aparece para o
 * cliente final, e a mensagem pode carregar dado de outra pessoa ou detalhe
 * interno. O `digest` é um hash gerado pelo Next, sem PII — serve para casar
 * esta tela com o evento no Sentry.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
    useEffect(() => {
        Sentry.captureException(error)
    }, [error])

    return (
        <html lang="pt-BR">
            <body className="flex min-h-screen items-center justify-center bg-zinc-50 p-6 text-zinc-900 antialiased">
                <main className="w-full max-w-sm text-center">
                    <h1 className="text-lg font-semibold">Algo deu errado</h1>
                    <p className="mt-2 text-sm text-zinc-600">
                        A página não carregou como deveria. Tente novamente em alguns instantes.
                    </p>
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="mt-6 w-full rounded-lg bg-zinc-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
                    >
                        Recarregar
                    </button>
                    {error.digest ? (
                        <p className="mt-6 font-mono text-xs text-zinc-400">
                            código: {error.digest}
                        </p>
                    ) : null}
                </main>
            </body>
        </html>
    )
}
