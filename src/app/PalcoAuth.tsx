import Link from 'next/link'
import type { ReactNode } from 'react'
import LuzAmbiente from './LuzAmbiente'
import LogoMarca from './LogoMarca'
import SeletorTema from './SeletorTema'

/**
 * Cena compartilhada das páginas de autenticação: o mesmo palco da landing
 * (nas duas iluminações, claro/escuro), com narrativa à esquerda e o widget
 * do Clerk à direita (empilha no mobile). O conteúdo do Clerk não é
 * customizável — o cenário em volta é.
 */

const RUIDO =
    "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"

interface Momento {
    hora: ReactNode
    texto: ReactNode
}

interface PalcoAuthProps {
    horaFantasma: ReactNode
    eyebrow: ReactNode
    titulo: ReactNode
    descricao?: string
    momentos?: Momento[]
    /** Widget do Clerk (SignIn/SignUp) */
    children: ReactNode
}

export default function PalcoAuth({
    horaFantasma,
    eyebrow,
    titulo,
    descricao,
    momentos,
    children,
}: PalcoAuthProps) {
    return (
        <div className="relative flex min-h-dvh flex-col overflow-hidden bg-palco text-giz">
            {/* Atmosfera */}
            <div
                aria-hidden
                className="pointer-events-none fixed inset-0 z-40 opacity-[0.03]"
                style={{ backgroundImage: RUIDO }}
            />
            <LuzAmbiente />
            <span
                aria-hidden
                className="pointer-events-none absolute -right-6 top-10 select-none font-mono text-[clamp(5rem,20vw,14rem)] font-bold lowercase leading-none tracking-tighter text-fantasma"
            >
                {horaFantasma}
            </span>

            {/* Logo */}
            <header className="relative z-10">
                <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 pt-8 lg:px-10">
                    <Link href="/" className="aparecer inline-block" style={{ animationDelay: '100ms' }}>
                        <LogoMarca className="h-8 w-auto" priority />
                    </Link>
                    <div className="aparecer" style={{ animationDelay: '250ms' }}>
                        <SeletorTema />
                    </div>
                </div>
            </header>

            <main className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-6 py-12 lg:grid-cols-2 lg:gap-20 lg:px-10">
                {/* Narrativa */}
                <div>
                    <div className="mascara">
                        <p
                            className="font-mono text-xs uppercase tracking-[0.3em] text-marca"
                            style={{ animationDelay: '250ms' }}
                        >
                            {eyebrow}
                        </p>
                    </div>
                    <h1 className="mt-5 font-display text-3xl font-bold leading-[1.12] tracking-[-0.02em] sm:text-4xl lg:text-[2.75rem]">
                        <span className="mascara block">
                            <span className="block" style={{ animationDelay: '350ms' }}>
                                {titulo}
                            </span>
                        </span>
                    </h1>
                    {descricao && (
                        <p
                            className="aparecer mt-5 max-w-md leading-relaxed text-nevoa"
                            style={{ animationDelay: '650ms' }}
                        >
                            {descricao}
                        </p>
                    )}
                    {momentos && momentos.length > 0 && (
                        <ol className="mt-9 hidden sm:block">
                            {momentos.map((m, i) => (
                                <li
                                    key={i}
                                    className="aparecer relative border-l border-fio pb-6 pl-6 last:pb-0"
                                    style={{ animationDelay: `${750 + i * 120}ms` }}
                                >
                                    <span className="absolute -left-[4.5px] top-1.5 h-2 w-2 rounded-full bg-marca/60" />
                                    <p className="text-sm text-nevoa">
                                        <span className="mr-3 font-mono text-xs text-marca">{m.hora}</span>
                                        {m.texto}
                                    </p>
                                </li>
                            ))}
                        </ol>
                    )}
                </div>

                {/* Widget do Clerk */}
                <div
                    className="aparecer flex justify-center lg:justify-end"
                    style={{ animationDelay: '500ms' }}
                >
                    <div className="relative">
                        <div
                            aria-hidden
                            className="absolute -inset-10 rounded-full bg-[#ACC6FF]/40 blur-3xl dark:bg-marca-forte/[0.09]"
                        />
                        <div className="relative">{children}</div>
                    </div>
                </div>
            </main>

            <footer className="relative z-10 pb-6">
                <p className="text-center font-mono text-xs text-penumbra/75">
                    vamoagendar.com.br — agendamento online para profissionais
                </p>
            </footer>
        </div>
    )
}
