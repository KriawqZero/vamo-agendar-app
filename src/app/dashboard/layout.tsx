import React from 'react'
import Link from 'next/link'
import { UserButton, OrganizationSwitcher } from '@clerk/nextjs'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@/lib/supabase/server'
import { PLANOS } from '@/lib/planos'
import { obterAssinaturaVigente, type AssinaturaVigente } from '@/lib/assinaturas'

// Simple SVG Icons
const DashboardIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z" />
    </svg>
)

const ServicosIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
)

const AgendaIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
)

const WhatsappIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
)

const PlanoIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
)

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const { orgId } = await auth()
    let assinatura: AssinaturaVigente = { plano: 'gratuito', inadimplente: false, urlFaturaPendente: null }
    if (orgId) {
        const supabase = await createClient()
        assinatura = await obterAssinaturaVigente(supabase, orgId)
    }

    return (
        <div className="flex h-screen w-full flex-col md:flex-row bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 font-sans">
            {/* Sidebar (Desktop) / Header (Mobile) */}
            <aside className="flex flex-col border-b border-zinc-200 dark:border-zinc-800 md:border-b-0 md:border-r w-full md:w-64 bg-white dark:bg-zinc-900 md:h-full shrink-0">
                {/* Logo e Organização */}
                <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
                    <span className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-zinc-50 dark:to-zinc-400">
                        VamoAgendar
                    </span>
                    <div className="md:hidden flex items-center gap-2">
                        <OrganizationSwitcher
                            appearance={{
                                elements: {
                                    rootBox: "flex justify-center items-center",
                                    organizationSwitcherTrigger: "text-zinc-600 dark:text-zinc-300"
                                }
                            }}
                        />
                        <UserButton />
                    </div>
                </div>

                {/* Switcher para Desktop */}
                <div className="hidden md:flex p-4 border-b border-zinc-200 dark:border-zinc-800 justify-between items-center bg-zinc-50 dark:bg-zinc-900/50">
                    <OrganizationSwitcher
                        appearance={{
                            elements: {
                                rootBox: "flex justify-center items-center w-full",
                                organizationSwitcherTrigger: "w-full justify-between px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800"
                            }
                        }}
                    />
                </div>

                {/* Navegação */}
                <nav className="flex md:flex-col overflow-x-auto md:overflow-x-visible p-2 md:p-4 gap-1 md:flex-1">
                    <Link
                        href="/dashboard"
                        className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-950 dark:hover:text-white shrink-0"
                    >
                        <DashboardIcon />
                        <span className="hidden sm:inline md:inline">Dashboard</span>
                    </Link>

                    <Link
                        href="/dashboard/servicos"
                        className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-950 dark:hover:text-white shrink-0"
                    >
                        <ServicosIcon />
                        <span className="hidden sm:inline md:inline">Serviços</span>
                    </Link>

                    <Link
                        href="/dashboard/agenda"
                        className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-950 dark:hover:text-white shrink-0"
                    >
                        <AgendaIcon />
                        <span className="hidden sm:inline md:inline">Configurar Agenda</span>
                    </Link>

                    <Link
                        href="/dashboard/whatsapp"
                        className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-950 dark:hover:text-white shrink-0"
                    >
                        <WhatsappIcon />
                        <span className="hidden sm:inline md:inline">WhatsApp</span>
                    </Link>

                    <Link
                        href="/dashboard/plano"
                        className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-950 dark:hover:text-white shrink-0"
                    >
                        <PlanoIcon />
                        <span className="hidden sm:inline md:inline">Plano</span>
                        <span className="ml-auto hidden md:inline text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                            {PLANOS[assinatura.plano].nome}
                        </span>
                    </Link>
                </nav>

                {/* User perfil na base do menu para desktop */}
                <div className="hidden md:flex p-4 border-t border-zinc-200 dark:border-zinc-800 items-center justify-between">
                    <div className="flex items-center gap-2">
                        <UserButton />
                        <div className="flex flex-col text-left">
                            <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">Minha Conta</span>
                            <span className="text-[10px] text-zinc-500">Painel do Profissional</span>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto p-4 md:p-8">
                {assinatura.inadimplente && (
                    <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-4">
                        <div className="flex-1">
                            <p className="text-sm font-bold text-red-800 dark:text-red-200">
                                Não foi possível realizar seu pagamento
                            </p>
                            <p className="text-xs text-red-700 dark:text-red-300">
                                Resolva o mais rápido possível para não perder os recursos do plano {PLANOS[assinatura.plano].nome}.
                            </p>
                        </div>
                        <a
                            href={assinatura.urlFaturaPendente ?? '/dashboard/plano'}
                            className="shrink-0 rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white transition-all duration-200 hover:bg-red-700"
                        >
                            Resolver pagamento
                        </a>
                    </div>
                )}
                {children}
            </main>
        </div>
    )
}
