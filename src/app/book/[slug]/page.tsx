import React from 'react'
import { obterDadosBookingPublico } from '@/app/actions/public-booking'
import BookingWizard from './BookingWizard'

interface PageProps {
    params: Promise<{ slug: string }>
}

export default async function BookingPage({ params }: PageProps) {
    const resolvedParams = await params
    const slug = resolvedParams.slug

    // Buscar dados públicos da empresa e os serviços ativos
    const dados = await obterDadosBookingPublico(slug)

    if (!dados) {
        return (
            <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center p-6 font-sans">
                <div className="max-w-md w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 text-center shadow-lg space-y-4">
                    <div className="w-16 h-16 bg-red-50 dark:bg-red-950/20 rounded-full flex items-center justify-center mx-auto text-red-500 border border-red-100 dark:border-red-900">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h1 className="text-xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
                        Estabelecimento Não Encontrado
                    </h1>
                    <p className="text-sm text-zinc-500 leading-relaxed">
                        Não encontramos nenhuma agenda ativa associada ao link <span className="font-mono font-bold break-all">/book/{slug}</span>. Verifique se digitou o endereço corretamente.
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 py-16 px-4 sm:px-6 lg:px-8 font-sans relative overflow-hidden flex flex-col justify-center">
            {/* Ambient Background Glows */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[500px] bg-radial from-violet-500/10 dark:from-violet-500/5 to-transparent blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-1/4 w-[300px] h-[300px] bg-radial from-indigo-500/10 dark:from-indigo-500/5 to-transparent blur-3xl pointer-events-none" />

            <div className="max-w-2xl mx-auto w-full space-y-6 relative z-10">
                
                {/* O Wizard principal de agendamento */}
                <BookingWizard perfil={dados.perfil} servicos={dados.servicos} />

                {/* Footer discreto e profissional */}
                <div className="text-center text-[10px] text-zinc-400 dark:text-zinc-500 flex items-center justify-center gap-1.5 pt-4">
                    <span>Agendamento facilitado por</span>
                    <span className="font-bold text-zinc-650 dark:text-zinc-300 font-mono tracking-wider">VamoAgendar</span>
                </div>

            </div>
        </div>
    )
}
