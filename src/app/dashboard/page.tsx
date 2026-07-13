import React from 'react'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@/lib/supabase/server'
import { listarAgendamentos } from '@/app/actions/agendamentos'
import { obterPerfilEmpresa } from '@/app/actions/perfis-empresas'
import { diaLocal, somarDias, diaDaSemana, TIMEZONE_PADRAO } from '@/lib/timezone'
import DashboardClient from './DashboardClient'

// Define tipo dos parâmetros de busca compatível com Next.js 16
interface PageProps {
    searchParams: Promise<{ date?: string }>
}

// Segunda-feira da semana que contém a data (dateStr no fuso do estabelecimento)
function inicioDaSemana(dateStr: string): string {
    const dow = diaDaSemana(dateStr) // 0=dom
    return somarDias(dateStr, -((dow + 6) % 7))
}

export default async function DashboardPage({ searchParams }: PageProps) {
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
                    Para visualizar o painel do profissional, você precisa selecionar ou criar uma organização no menu lateral.
                </p>
            </div>
        )
    }

    // Await dos searchParams (Next.js 16)
    const params = await searchParams

    // 1b. Perfil da empresa primeiro: o fuso do estabelecimento define "hoje" e
    // os limites de dia de todas as consultas abaixo.
    const perfilEmpresa = await obterPerfilEmpresa()
    const timezone = perfilEmpresa?.timezone || TIMEZONE_PADRAO

    const hoje = diaLocal(new Date(), timezone)
    const dataSelecionada = params.date || hoje

    // 2. Buscar agendamentos da janela: semana da data selecionada + a seguinte
    // (alimenta a régua de dias com contagens e a seção "próximos dias")
    const inicioSemana = inicioDaSemana(dataSelecionada)
    const rawAgendamentos = await listarAgendamentos({
        periodo: { inicio: inicioSemana, fim: somarDias(inicioSemana, 13) },
    })

    const agendamentos = rawAgendamentos.map((ag: any) => {
        const clienteRaw = Array.isArray(ag.clientes) ? ag.clientes[0] : ag.clientes
        const servicoRaw = Array.isArray(ag.servicos) ? ag.servicos[0] : ag.servicos
        return {
            id: ag.id,
            data_hora: ag.data_hora,
            status: ag.status,
            clientes: clienteRaw ? {
                id: clienteRaw.id,
                nome: clienteRaw.nome,
                telefone: clienteRaw.telefone,
                email: clienteRaw.email || null
            } : null,
            servicos: servicoRaw ? {
                id: servicoRaw.id,
                nome: servicoRaw.nome,
                preco: Number(servicoRaw.preco),
                duracao_minutos: Number(servicoRaw.duracao_minutos)
            } : null
        }
    })

    // 4. Buscar status de conexão do WhatsApp
    const supabase = await createClient()
    const { data: whatsappConfig } = await supabase
        .from('whatsapp_configs')
        .select('status')
        .eq('tenant_id', orgId)
        .maybeSingle()

    const whatsappStatus = whatsappConfig?.status || 'desconectado'

    // 5. Verificar Checklist de Onboarding
    const { count: countServicos } = await supabase
        .from('servicos')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', orgId)
        .eq('ativo', true)
    
    const temServicoAtivo = (countServicos ?? 0) > 0

    const { count: countHorarios } = await supabase
        .from('horarios_funcionamento')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', orgId)
        
    const temHorariosConfigurados = (countHorarios ?? 0) > 0

    return (
        <DashboardClient
            agendamentosPeriodo={agendamentos}
            perfilEmpresa={perfilEmpresa}
            whatsappStatus={whatsappStatus}
            dataSelecionada={dataSelecionada}
            inicioSemana={inicioSemana}
            hoje={hoje}
            timezone={timezone}
            temServicoAtivo={temServicoAtivo}
            temHorariosConfigurados={temHorariosConfigurados}
        />
    )
}
