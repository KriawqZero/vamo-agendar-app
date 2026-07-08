import React from 'react'
import { auth } from '@clerk/nextjs/server'
import { obterWhatsappConfig } from '@/app/actions/whatsapp'
import WhatsappClient from './WhatsappClient'

export default async function WhatsappPage() {
    // 1. Validar autenticação e obter organização ativa do Clerk
    const { orgId } = await auth()

    if (!orgId) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs max-w-xl mx-auto my-12">
                <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mb-4 text-zinc-400">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                </div>
                <h2 className="text-xl font-bold tracking-tight mb-2">Selecione uma Organização</h2>
                <p className="text-zinc-500 dark:text-zinc-400 text-sm max-w-sm mb-6">
                    Para gerenciar a integração de WhatsApp, você precisa selecionar ou criar uma organização no menu lateral.
                </p>
            </div>
        )
    }

    // 2. Buscar a configuração de WhatsApp da organização ativa no banco
    const config = await obterWhatsappConfig()

    return <WhatsappClient config={config} />
}
