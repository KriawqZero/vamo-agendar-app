'use client' // Error boundaries precisam ser Client Components

import { useEffect } from 'react'

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error(error)
    }, [error])

    return (
        <div className="flex min-h-[60vh] items-center justify-center px-4">
            <div className="w-full max-w-sm rounded-2xl border border-fio bg-bastidor p-6 text-center">
                <h2 className="font-display text-lg font-bold text-giz">
                    Não deu para carregar o painel
                </h2>
                <p className="mt-2 text-sm text-nevoa">
                    Foi um erro temporário de carregamento. Tente novamente em instantes.
                </p>
                <button
                    onClick={reset}
                    className="mt-5 rounded-xl bg-marca px-5 py-2.5 font-mono text-xs uppercase tracking-widest text-white transition-colors hover:bg-marca-forte dark:text-zinc-950"
                >
                    Tentar novamente
                </button>
            </div>
        </div>
    )
}
