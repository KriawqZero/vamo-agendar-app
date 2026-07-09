'use client'

import React, { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { atualizarStatusAgendamento } from '@/app/actions/agendamentos'

interface Cliente {
    id: string;
    nome: string;
    telefone: string;
    email: string | null;
}

interface Servico {
    id: string;
    nome: string;
    preco: number;
    duracao_minutos: number;
}

interface Agendamento {
    id: string;
    data_hora: string;
    status: string;
    clientes: Cliente | null;
    servicos: Servico | null;
}

interface DashboardClientProps {
    agendamentos: Agendamento[];
    perfilEmpresa: { slug: string; nome_estabelecimento: string } | null;
    whatsappStatus: string;
    dataSelecionada: string; // YYYY-MM-DD
}

export default function DashboardClient({
    agendamentos,
    perfilEmpresa,
    whatsappStatus,
    dataSelecionada
}: DashboardClientProps) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [copiado, setCopiado] = useState(false)
    const [statusUpdating, setStatusUpdating] = useState<string | null>(null)

    // Formata a data para exibir no cabeçalho
    const dataFormatada = new Date(`${dataSelecionada}T12:00:00`).toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    })

    // Calcula estatísticas
    const totalHoje = agendamentos.length
    const faturamentoEstimado = agendamentos
        .filter(ag => ag.status === 'confirmado' || ag.status === 'concluido')
        .reduce((sum, ag) => sum + Number(ag.servicos?.preco || 0), 0)

    // `window` não existe no SSR: renderiza o caminho relativo no servidor
    // e completa com o domínio somente após montar no browser.
    const caminhoBooking = perfilEmpresa ? `/book/${perfilEmpresa.slug}` : ''
    const [linkPublico, setLinkPublico] = useState(caminhoBooking)

    useEffect(() => {
        if (caminhoBooking) {
            setLinkPublico(`${window.location.origin}${caminhoBooking}`)
        }
    }, [caminhoBooking])

    const copiarLink = () => {
        if (!linkPublico) return
        navigator.clipboard.writeText(linkPublico)
        setCopiado(true)
        setTimeout(() => setCopiado(false), 2000)
    }

    const alterarStatus = async (id: string, novoStatus: 'confirmado' | 'concluido' | 'cancelado') => {
        setStatusUpdating(id)
        try {
            await atualizarStatusAgendamento(id, novoStatus)
            startTransition(() => {
                router.refresh()
            })
        } catch (err: any) {
            alert(err.message || 'Erro ao alterar status')
        } finally {
            setStatusUpdating(null)
        }
    }

    const mudarData = (novaData: string) => {
        router.push(`/dashboard?date=${novaData}`)
    }

    return (
        <div className="space-y-6">
            {/* Header com Saudação */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">
                        Olá, {perfilEmpresa?.nome_estabelecimento || 'Profissional'}
                    </h1>
                    <p className="text-zinc-500 dark:text-zinc-400 text-sm">
                        Acompanhe seus horários e gerencie seus clientes.
                    </p>
                </div>

                {/* Filtro de Data */}
                <div className="flex items-center gap-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-2 shadow-xs shrink-0">
                    <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 px-2">Data:</span>
                    <input
                        type="date"
                        value={dataSelecionada}
                        onChange={(e) => mudarData(e.target.value)}
                        className="bg-transparent border-0 text-sm focus:ring-0 cursor-pointer text-zinc-900 dark:text-zinc-50 outline-hidden font-medium"
                    />
                </div>
            </div>

            {/* Alerta de Perfil Não Configurado */}
            {!perfilEmpresa && (
                <div className="flex items-center p-4 text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl gap-3">
                    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div className="text-sm">
                        <span className="font-bold">Link de agendamento inativo:</span> Você precisa configurar o perfil da sua empresa (nome e slug) para poder receber agendamentos.
                        <button
                            onClick={() => router.push('/dashboard/agenda')}
                            className="underline font-semibold ml-2 hover:text-amber-950 dark:hover:text-amber-100"
                        >
                            Configurar agora &rarr;
                        </button>
                    </div>
                </div>
            )}

            {/* Cards de Estatísticas */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Agendamentos */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-xs">
                    <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block">Agendamentos hoje</span>
                    <div className="flex items-baseline gap-2 mt-2">
                        <span className="text-3xl font-bold">{totalHoje}</span>
                        <span className="text-xs text-zinc-400">reservas</span>
                    </div>
                </div>

                {/* Faturamento */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-xs">
                    <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block">Faturamento estimado</span>
                    <div className="flex items-baseline gap-2 mt-2">
                        <span className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                            {faturamentoEstimado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                        <span className="text-xs text-zinc-400">confirmados</span>
                    </div>
                </div>

                {/* Integração WhatsApp */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-xs flex flex-col justify-between">
                    <div>
                        <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block">WhatsApp Status</span>
                        <div className="flex items-center gap-2 mt-2">
                            <span className={`w-2.5 h-2.5 rounded-full ${
                                whatsappStatus === 'conectado' 
                                    ? 'bg-emerald-500 animate-pulse' 
                                    : whatsappStatus === 'aguardando_qrcode' 
                                        ? 'bg-amber-500 animate-pulse' 
                                        : 'bg-zinc-400'
                            }`} />
                            <span className="text-sm font-semibold capitalize">
                                {whatsappStatus === 'conectado' 
                                    ? 'Conectado' 
                                    : whatsappStatus === 'aguardando_qrcode' 
                                        ? 'Aguardando QR Code' 
                                        : 'Desconectado'}
                            </span>
                        </div>
                    </div>
                    {whatsappStatus !== 'conectado' && (
                        <button
                            onClick={() => router.push('/dashboard/whatsapp')}
                            className="text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 underline mt-2 text-left"
                        >
                            Conectar WhatsApp &rarr;
                        </button>
                    )}
                </div>
            </div>

            {/* Link de Agendamento Compartilhável */}
            {perfilEmpresa && (
                <div className="bg-gradient-to-r from-zinc-900 to-zinc-800 dark:from-zinc-900 dark:to-zinc-950 border border-zinc-800 rounded-xl p-5 text-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="space-y-1">
                        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Seu link público de agendamento</span>
                        <p className="text-sm font-medium text-zinc-200 break-all select-all font-mono">
                            {linkPublico}
                        </p>
                    </div>
                    <button
                        onClick={copiarLink}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer border ${
                            copiado 
                                ? 'bg-emerald-600 border-emerald-600 text-white' 
                                : 'bg-white hover:bg-zinc-100 text-zinc-950 border-white'
                        }`}
                    >
                        {copiado ? 'Copiado!' : 'Copiar Link'}
                    </button>
                </div>
            )}

            {/* Listagem de Horários */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xs overflow-hidden">
                <div className="p-5 border-b border-zinc-200 dark:border-zinc-800">
                    <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50">
                        Agendamentos para {dataFormatada}
                    </h2>
                </div>

                {agendamentos.length === 0 ? (
                    <div className="p-8 text-center text-zinc-500 dark:text-zinc-400">
                        Nenhum agendamento para este dia.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm border-collapse">
                            <thead>
                                <tr className="bg-zinc-50 dark:bg-zinc-900/50 text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                                    <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wider">Horário</th>
                                    <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wider">Cliente</th>
                                    <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wider">Serviço</th>
                                    <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wider">Valor</th>
                                    <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wider">Status</th>
                                    <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wider text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                                {agendamentos.map(ag => {
                                    const hora = new Date(ag.data_hora).toLocaleTimeString('pt-BR', {
                                        timeZone: 'America/Sao_Paulo',
                                        hour: 'numeric',
                                        minute: 'numeric',
                                        hour12: false
                                    })
                                    const telLimpo = ag.clientes?.telefone || ''
                                    const waLink = telLimpo ? `https://wa.me/55${telLimpo}` : '#'

                                    return (
                                        <tr key={ag.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/10 transition-colors">
                                            <td className="px-5 py-4 font-bold text-zinc-900 dark:text-zinc-100 font-mono">
                                                {hora}
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                                                    {ag.clientes?.nome || 'N/A'}
                                                </div>
                                                <div className="flex items-center gap-1.5 text-xs text-zinc-500 mt-0.5">
                                                    <span>{ag.clientes?.telefone}</span>
                                                    {telLimpo && (
                                                        <a
                                                            href={waLink}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-emerald-500 hover:text-emerald-600 inline-flex items-center"
                                                            title="Enviar mensagem no WhatsApp"
                                                        >
                                                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                                                                <path d="M12.012 2c-5.506 0-9.989 4.478-9.99 9.984a9.96 9.96 0 0 0 1.333 4.982L2 22l5.233-1.371a9.936 9.936 0 0 0 4.779 1.229h.004c5.505 0 9.988-4.478 9.989-9.985a9.964 9.964 0 0 0-2.925-7.062A9.94 9.94 0 0 0 12.012 2zm5.748 14.185c-.316.892-1.844 1.637-2.529 1.745-.623.098-1.439.123-2.316-.164-3.535-1.157-5.834-4.71-6.011-4.945-.176-.234-1.434-1.902-1.434-3.626 0-1.725.901-2.574 1.222-2.923.32-.349.704-.436.939-.436.236 0 .47.001.677.011.215.01.503-.08.789.606.295.707 1.009 2.459 1.097 2.637.088.178.147.385.029.62-.117.234-.176.381-.352.583-.176.203-.37.452-.529.606-.176.17-.361.355-.156.707.206.353.916 1.507 1.963 2.438 1.348 1.198 2.488 1.567 2.84 1.743.353.176.558.147.763-.089.206-.236.88-1.025 1.116-1.378.234-.352.47-.294.791-.176.323.118 2.053 1.008 2.406 1.184.353.176.588.264.675.41.088.147.088.851-.228 1.743z"/>
                                                            </svg>
                                                        </a>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                                                    {ag.servicos?.nome || 'N/A'}
                                                </div>
                                                <div className="text-xs text-zinc-500 mt-0.5">
                                                    {ag.servicos?.duracao_minutos} min
                                                </div>
                                            </td>
                                            <td className="px-5 py-4 font-semibold text-zinc-900 dark:text-zinc-100 font-mono">
                                                {Number(ag.servicos?.preco || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                            </td>
                                            <td className="px-5 py-4">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${
                                                    ag.status === 'concluido'
                                                        ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                                                        : ag.status === 'cancelado'
                                                            ? 'bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300'
                                                            : ag.status === 'confirmado'
                                                                ? 'bg-blue-50 text-blue-800 dark:bg-blue-950/30 dark:text-blue-300'
                                                                : 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300'
                                                }`}>
                                                    {ag.status}
                                                </span>
                                            </td>
                                            <td className="px-5 py-4 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    {ag.status !== 'concluido' && ag.status !== 'cancelado' && (
                                                        <>
                                                            <button
                                                                onClick={() => alterarStatus(ag.id, 'concluido')}
                                                                disabled={statusUpdating === ag.id}
                                                                className="px-2.5 py-1 text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:hover:bg-emerald-900/50 dark:text-emerald-400 rounded-lg cursor-pointer transition-colors"
                                                            >
                                                                Concluir
                                                            </button>
                                                            <button
                                                                onClick={() => alterarStatus(ag.id, 'cancelado')}
                                                                disabled={statusUpdating === ag.id}
                                                                className="px-2.5 py-1 text-xs font-bold bg-red-50 hover:bg-red-100 text-red-700 dark:bg-red-950/30 dark:hover:bg-red-900/50 dark:text-red-400 rounded-lg cursor-pointer transition-colors"
                                                            >
                                                                Cancelar
                                                            </button>
                                                        </>
                                                    )}
                                                    {statusUpdating === ag.id && (
                                                        <span className="text-xs text-zinc-400 animate-pulse">Atualizando...</span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}
