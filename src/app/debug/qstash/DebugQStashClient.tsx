'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { dispararLembreteAgora, publicarTesteQStash } from '@/app/actions/debug-qstash'
import type { AgendamentoDebug, EventoQStash, ResultadoAcaoDebug, SanidadeEnv } from './types'

interface Props {
    eventos: EventoQStash[]
    erroLogs: string | null
    agendamentos: AgendamentoDebug[]
    sanidade: SanidadeEnv
}

function formatarTimestamp(valor: number | null): string {
    if (!valor) return '—'
    // QStash mistura segundos e milissegundos conforme o campo
    const ms = valor < 1e12 ? valor * 1000 : valor
    return new Date(ms).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

const CORES_ESTADO: Record<string, string> = {
    DELIVERED: 'bg-emerald-100 text-emerald-700',
    ERROR: 'bg-red-100 text-red-700',
    FAILED: 'bg-red-100 text-red-700',
    CANCELLED: 'bg-red-100 text-red-700',
    RETRY: 'bg-amber-100 text-amber-700',
    IN_PROGRESS: 'bg-blue-100 text-blue-700',
    ACTIVE: 'bg-blue-100 text-blue-700',
    CREATED: 'bg-zinc-200 text-zinc-600',
}

export default function DebugQStashClient({ eventos, erroLogs, agendamentos, sanidade }: Props) {
    const router = useRouter()
    const [pendente, startTransition] = useTransition()
    const [resultados, setResultados] = useState<Record<string, ResultadoAcaoDebug>>({})

    function executar(chave: string, acao: () => Promise<ResultadoAcaoDebug>) {
        startTransition(async () => {
            const resultado = await acao()
            setResultados(prev => ({ ...prev, [chave]: resultado }))
        })
    }

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-8 text-sm">
            <header className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Debug QStash</h1>
                    <p className="text-zinc-500">Ferramenta temporária — remover após diagnóstico dos lembretes.</p>
                </div>
                <button
                    onClick={() => router.refresh()}
                    disabled={pendente}
                    className="rounded-lg border border-zinc-300 px-4 py-2 font-medium transition-all duration-200 hover:bg-zinc-100 disabled:opacity-50"
                >
                    Atualizar dados
                </button>
            </header>

            <section>
                <h2 className="text-lg font-semibold mb-3">Sanidade de ambiente</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-xl border border-zinc-200 p-4 font-mono text-xs">
                    <div>QSTASH_TOKEN: {sanidade.qstashToken ? '✅ presente' : '❌ ausente'}</div>
                    <div>QSTASH_CURRENT_SIGNING_KEY: {sanidade.signingKey ? '✅ presente' : '❌ ausente (usando fallback "secret-key")'}</div>
                    <div>SUPABASE_SECRET_KEY: {sanidade.supabaseSecret ? '✅ presente' : '❌ ausente'}</div>
                    <div>QSTASH_URL: {sanidade.qstashUrl ?? '⚠️ não definida — código usa default https://qstash-us-east-1.upstash.io'}</div>
                    <div>APP_URL: {sanidade.appUrl ?? '⚠️ não definida — código usa default https://vamoagendar.com.br'}</div>
                    <div>EVOLUTION_API_URL: {sanidade.evolutionUrl ?? '⚠️ não definida — código usa default http://localhost:8080'}</div>
                </div>
            </section>

            <section>
                <h2 className="text-lg font-semibold mb-3">Agendamentos recentes</h2>
                <div className="overflow-x-auto rounded-xl border border-zinc-200">
                    <table className="w-full text-left">
                        <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                            <tr>
                                <th className="px-3 py-2">Data/hora</th>
                                <th className="px-3 py-2">Cliente</th>
                                <th className="px-3 py-2">Serviço</th>
                                <th className="px-3 py-2">Status</th>
                                <th className="px-3 py-2">WhatsApp</th>
                                <th className="px-3 py-2">Lembrete (min)</th>
                                <th className="px-3 py-2">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                            {agendamentos.length === 0 && (
                                <tr><td colSpan={7} className="px-3 py-4 text-zinc-400">Nenhum agendamento encontrado.</td></tr>
                            )}
                            {agendamentos.map((ag) => {
                                const resultado = resultados[ag.id]
                                return (
                                    <tr key={ag.id} className="align-top">
                                        <td className="px-3 py-2 whitespace-nowrap">
                                            {new Date(ag.dataHora).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                                            <div className="text-[10px] text-zinc-400 font-mono">{ag.id}</div>
                                        </td>
                                        <td className="px-3 py-2">{ag.clienteNome}</td>
                                        <td className="px-3 py-2">{ag.servicoNome}</td>
                                        <td className="px-3 py-2">{ag.status}</td>
                                        <td className="px-3 py-2">{ag.whatsappStatus ?? 'sem config'}</td>
                                        <td className="px-3 py-2">{ag.tempoLembreteMinutos ?? '—'}</td>
                                        <td className="px-3 py-2 space-y-1 min-w-56">
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => executar(ag.id, () => dispararLembreteAgora(ag.id, ag.tenantId))}
                                                    disabled={pendente}
                                                    className="rounded-md bg-zinc-900 px-2.5 py-1.5 text-xs font-semibold text-white transition-all duration-200 hover:opacity-90 disabled:opacity-50"
                                                >
                                                    Disparar agora
                                                </button>
                                                <button
                                                    onClick={() => executar(ag.id, () => publicarTesteQStash(ag.id, ag.tenantId))}
                                                    disabled={pendente}
                                                    className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs font-semibold transition-all duration-200 hover:bg-zinc-100 disabled:opacity-50"
                                                >
                                                    QStash +60s
                                                </button>
                                            </div>
                                            {resultado && (
                                                <pre className={`whitespace-pre-wrap break-all rounded-md p-2 text-[11px] ${resultado.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
                                                    {resultado.mensagem}
                                                    {resultado.status != null && `\nHTTP ${resultado.status}`}
                                                    {resultado.corpo && `\n${resultado.corpo}`}
                                                </pre>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </section>

            <section>
                <h2 className="text-lg font-semibold mb-3">Logs do QStash (webhook de lembrete)</h2>
                {erroLogs && (
                    <div className="mb-3 rounded-lg bg-red-50 p-3 text-red-800">{erroLogs}</div>
                )}
                <div className="overflow-x-auto rounded-xl border border-zinc-200">
                    <table className="w-full text-left">
                        <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                            <tr>
                                <th className="px-3 py-2">Horário</th>
                                <th className="px-3 py-2">Estado</th>
                                <th className="px-3 py-2">Agendamento</th>
                                <th className="px-3 py-2">Entrega prevista</th>
                                <th className="px-3 py-2">Resposta do webhook</th>
                                <th className="px-3 py-2">Erro</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                            {eventos.length === 0 && !erroLogs && (
                                <tr><td colSpan={6} className="px-3 py-4 text-zinc-400">Nenhum evento do webhook de lembrete nos logs do QStash — nenhuma mensagem foi publicada (ou já expiraram da retenção).</td></tr>
                            )}
                            {eventos.map((ev, i) => (
                                <tr key={`${ev.messageId}-${i}`} className="align-top">
                                    <td className="px-3 py-2 whitespace-nowrap">
                                        {formatarTimestamp(ev.horario)}
                                        <div className="text-[10px] text-zinc-400 font-mono">{ev.messageId}</div>
                                    </td>
                                    <td className="px-3 py-2">
                                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CORES_ESTADO[ev.estado] ?? 'bg-zinc-100 text-zinc-600'}`}>
                                            {ev.estado}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 font-mono text-[11px] break-all">{ev.agendamentoId ?? ev.corpo ?? '—'}</td>
                                    <td className="px-3 py-2 whitespace-nowrap">
                                        {formatarTimestamp(ev.notBefore)}
                                        {ev.proximaEntrega != null && (
                                            <div className="text-[10px] text-zinc-400">próx. tentativa: {formatarTimestamp(ev.proximaEntrega)}</div>
                                        )}
                                    </td>
                                    <td className="px-3 py-2 max-w-72">
                                        {ev.respostaStatus != null ? `HTTP ${ev.respostaStatus}` : '—'}
                                        {ev.respostaCorpo && (
                                            <pre className="whitespace-pre-wrap break-all text-[11px] text-zinc-500">{ev.respostaCorpo}</pre>
                                        )}
                                    </td>
                                    <td className="px-3 py-2 text-red-700 max-w-56 break-all">{ev.erro ?? '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    )
}
