'use client'

import { useTheme } from 'next-themes'
import { useSyncExternalStore } from 'react'

/**
 * Seletor de tema (claro / sistema / escuro) — pílula segmentada discreta,
 * reutilizada no header da landing, no PalcoAuth e na sidebar do dashboard.
 * Até montar no cliente o tema ativo é desconhecido (localStorage), então
 * renderiza os três botões sem estado ativo para não divergir na hidratação.
 */

const ICONES = {
    light: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-3.5 w-3.5">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" />
        </svg>
    ),
    system: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <rect x="2" y="4" width="20" height="13" rx="2" />
            <path d="M8 21h8m-4-4v4" />
        </svg>
    ),
    dark: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        </svg>
    ),
}

const OPCOES = [
    { valor: 'light', rotulo: 'Tema claro' },
    { valor: 'system', rotulo: 'Tema do sistema' },
    { valor: 'dark', rotulo: 'Tema escuro' },
] as const

const assinarNada = () => () => {}

export default function SeletorTema({ className = '' }: { className?: string }) {
    const { theme, setTheme } = useTheme()
    // true só no cliente após a hidratação (no SSR o tema é desconhecido)
    const montado = useSyncExternalStore(assinarNada, () => true, () => false)

    return (
        <div
            role="radiogroup"
            aria-label="Tema da interface"
            className={`inline-flex items-center gap-0.5 rounded-full border border-fio p-0.5 ${className}`}
        >
            {OPCOES.map((opcao) => {
                const ativo = montado && theme === opcao.valor
                return (
                    <button
                        key={opcao.valor}
                        type="button"
                        role="radio"
                        aria-checked={ativo}
                        title={opcao.rotulo}
                        onClick={() => setTheme(opcao.valor)}
                        className={`rounded-full p-1.5 transition-colors duration-200 ${
                            ativo ? 'bg-veu text-marca' : 'text-penumbra hover:text-nevoa'
                        }`}
                    >
                        {ICONES[opcao.valor]}
                        <span className="sr-only">{opcao.rotulo}</span>
                    </button>
                )
            })}
        </div>
    )
}
