import React from 'react'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@/lib/supabase/server'
import { PLANOS, type DefinicaoPlano, type PlanoId } from '@/lib/planos'
import { obterAssinaturaVigente } from '@/lib/assinaturas'
import CapturaEvento from '@/components/analytics/CapturaEvento'
import CtaUpgrade from './CtaUpgrade'

const formatarPreco = (valor: number) =>
    valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function LinhaRecurso({ liberado, children }: { liberado: boolean; children: React.ReactNode }) {
    return (
        <li className={`flex items-center gap-2 text-sm ${liberado ? 'text-zinc-700 dark:text-zinc-200' : 'text-zinc-400 dark:text-zinc-600 line-through'}`}>
            <span aria-hidden>{liberado ? '✓' : '✕'}</span>
            {children}
        </li>
    )
}

function CardPlano({ plano, atual }: { plano: DefinicaoPlano; atual: boolean }) {
    const r = plano.recursos
    return (
        <div className={`flex flex-col rounded-2xl border p-6 bg-white dark:bg-zinc-900 transition-all duration-200 ${atual ? 'border-zinc-900 dark:border-zinc-100 shadow-md' : 'border-zinc-200 dark:border-zinc-800'}`}>
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold tracking-tight">{plano.nome}</h2>
                {atual && (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900">
                        Plano atual
                    </span>
                )}
            </div>
            <div className="mt-3">
                <span className="text-3xl font-bold">{formatarPreco(plano.precoMensal)}</span>
                <span className="text-sm text-zinc-500">/mês</span>
                {plano.precoAnual !== null ? (
                    <p className="text-xs text-zinc-500 mt-1">
                        ou {formatarPreco(plano.precoAnual)}/ano{' '}
                        {plano.seloDesconto && (
                            <span className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                {plano.seloDesconto}
                            </span>
                        )}
                    </p>
                ) : (
                    <p className="text-xs text-zinc-500 mt-1">{plano.descricao}</p>
                )}
            </div>
            <ul className="mt-5 space-y-2 flex-1">
                <LinhaRecurso liberado>
                    {plano.limiteServicosAtivos === null ? 'Serviços ilimitados' : `Até ${plano.limiteServicosAtivos} serviços ativos`}
                </LinhaRecurso>
                <LinhaRecurso liberado>Link de agendamento</LinhaRecurso>
                <LinhaRecurso liberado={r.linkPersonalizado}>Link personalizado</LinhaRecurso>
                <LinhaRecurso liberado={r.corPersonalizada}>Cor personalizada</LinhaRecurso>
                <LinhaRecurso liberado={r.logoPersonalizado}>Logo personalizado</LinhaRecurso>
                <LinhaRecurso liberado={r.whatsapp}>Confirmações e lembretes por WhatsApp</LinhaRecurso>
            </ul>
            {plano.id !== 'gratuito' && !atual && <CtaUpgrade planoId={plano.id} />}
        </div>
    )
}

export default async function PlanoPage() {
    const { orgId } = await auth()

    let planoAtual: PlanoId = 'gratuito'
    if (orgId) {
        const supabase = await createClient()
        const assinatura = await obterAssinaturaVigente(supabase, orgId)
        planoAtual = assinatura.plano
    }

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            {/* Funil: visualização da página de planos */}
            <CapturaEvento evento="plans_viewed" propriedades={{ plano_atual: planoAtual }} />
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Plano</h1>
                <p className="text-zinc-500 dark:text-zinc-400 text-sm">
                    Compare os planos e recursos do VamoAgendar. A assinatura online estará disponível em breve.
                </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {(Object.values(PLANOS) as DefinicaoPlano[]).map((plano) => (
                    <CardPlano key={plano.id} plano={plano} atual={plano.id === planoAtual} />
                ))}
            </div>
        </div>
    )
}
