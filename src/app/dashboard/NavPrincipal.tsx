'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

/**
 * Navegação da área logada com estado ativo (barra esmeralda + texto giz).
 * No mobile vira uma fileira horizontal rolável; no desktop, coluna.
 */

const IconeHoje = (
    <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <path strokeLinecap="round" d="M12 7v5l3 2" />
    </svg>
)

const IconeServicos = (
    <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 8h6m-6 4h4" />
    </svg>
)

const IconeAgenda = (
    <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
)

const IconeWhatsapp = (
    <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
)

const IconePlano = (
    <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
)

const ITENS: { href: string; rotulo: string; icone: ReactNode; exato?: boolean }[] = [
    { href: '/dashboard', rotulo: 'Hoje', icone: IconeHoje, exato: true },
    { href: '/dashboard/servicos', rotulo: 'Serviços', icone: IconeServicos },
    { href: '/dashboard/agenda', rotulo: 'Agenda', icone: IconeAgenda },
    { href: '/dashboard/whatsapp', rotulo: 'WhatsApp', icone: IconeWhatsapp },
    { href: '/dashboard/plano', rotulo: 'Plano', icone: IconePlano },
]

export default function NavPrincipal({ nomePlano }: { nomePlano: string }) {
    const pathname = usePathname()

    return (
        <nav className="flex gap-1 overflow-x-auto p-2 md:flex-1 md:flex-col md:overflow-x-visible md:p-3">
            {ITENS.map((item) => {
                const ativo = item.exato ? pathname === item.href : pathname.startsWith(item.href)
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={`relative flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-200 ${
                            ativo
                                ? 'bg-veu font-medium text-giz'
                                : 'text-nevoa hover:bg-veu hover:text-giz'
                        }`}
                    >
                        {ativo && (
                            <span className="absolute left-0 top-1/2 hidden h-4 w-0.5 -translate-y-1/2 rounded-full bg-marca md:block" />
                        )}
                        <span className={ativo ? 'text-marca' : 'text-penumbra'}>{item.icone}</span>
                        <span className="hidden sm:inline">{item.rotulo}</span>
                        {item.href === '/dashboard/plano' && (
                            <span className="ml-auto hidden rounded-full border border-marca/30 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-marca md:inline">
                                {nomePlano}
                            </span>
                        )}
                    </Link>
                )
            })}
        </nav>
    )
}
