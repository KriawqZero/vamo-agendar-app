import React from 'react'
import Link from 'next/link'
import { UserButton, OrganizationSwitcher } from '@clerk/nextjs'
import LogoMarca from '@/app/LogoMarca'
import SeletorTema from '@/app/SeletorTema'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@/lib/supabase/server'
import { PLANOS } from '@/lib/planos'
import { obterAssinaturaVigente, type AssinaturaVigente } from '@/lib/assinaturas'
import NavPrincipal from './NavPrincipal'

/**
 * Casco da área logada — o "bastidor" do palco da landing. Acompanha o
 * tema do site (claro/escuro/sistema via next-themes); sidebar com o
 * mesmo fundo do conteúdo, separada apenas por um fio.
 */
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
        <div className="flex h-screen w-full flex-col bg-palco font-sans text-giz md:flex-row">
            {/* Sidebar (desktop) / cabeçalho (mobile) */}
            <aside className="flex w-full shrink-0 flex-col border-b border-fio md:h-full md:w-60 md:border-b-0 md:border-r">
                <div className="flex items-center justify-between px-5 py-4">
                    <Link href="/dashboard">
                        <LogoMarca className="h-7 w-auto" />
                    </Link>
                    <div className="flex items-center gap-2 md:hidden">
                        <SeletorTema />
                        <OrganizationSwitcher
                            appearance={{
                                elements: {
                                    rootBox: 'flex justify-center items-center',
                                    organizationSwitcherTrigger: 'text-nevoa',
                                },
                            }}
                        />
                        <UserButton />
                    </div>
                </div>

                {/* Organização ativa (desktop) */}
                <div className="hidden border-b border-fio px-3 pb-3 md:block">
                    <OrganizationSwitcher
                        appearance={{
                            elements: {
                                rootBox: 'flex justify-center items-center w-full',
                                organizationSwitcherTrigger:
                                    'w-full justify-between px-3 py-2 rounded-lg text-sm text-nevoa border border-fio hover:bg-veu',
                            },
                        }}
                    />
                </div>

                <NavPrincipal nomePlano={PLANOS[assinatura.plano].nome} />

                {/* Conta + tema (desktop) */}
                <div className="hidden items-center gap-3 border-t border-fio p-4 md:flex">
                    <UserButton />
                    <div className="flex min-w-0 flex-1 flex-col">
                        <span className="text-xs font-medium text-giz">Minha conta</span>
                        <span className="font-mono text-[10px] uppercase tracking-widest text-penumbra">
                            profissional
                        </span>
                    </div>
                    <SeletorTema />
                </div>
            </aside>

            {/* Conteúdo */}
            <main className="flex-1 overflow-y-auto">
                <div className="mx-auto max-w-5xl p-4 pb-16 md:p-10">
                    {assinatura.inadimplente && (
                        <div className="mb-8 flex flex-col gap-3 rounded-xl border border-red-500/25 bg-red-500/[0.06] p-4 sm:flex-row sm:items-center dark:border-red-400/20 dark:bg-red-500/[0.07]">
                            <div className="flex-1">
                                <p className="text-sm font-semibold text-red-800 dark:text-red-200">
                                    Não foi possível realizar seu pagamento
                                </p>
                                <p className="mt-0.5 text-xs text-red-700/90 dark:text-red-300/80">
                                    Resolva o quanto antes para não perder os recursos do plano{' '}
                                    {PLANOS[assinatura.plano].nome}.
                                </p>
                            </div>
                            <a
                                href={assinatura.urlFaturaPendente ?? '/dashboard/plano'}
                                className="shrink-0 rounded-full bg-red-500 px-4 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-red-400"
                            >
                                Resolver pagamento
                            </a>
                        </div>
                    )}
                    {children}
                </div>
            </main>
        </div>
    )
}
