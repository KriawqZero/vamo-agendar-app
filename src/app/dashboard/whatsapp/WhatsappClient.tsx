'use client'

import React, { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { 
    obterQrCodeWhatsApp, 
    criarInstanciaWhatsApp, 
    desconectarWhatsApp, 
    salvarTemplatesMensagem 
} from '@/app/actions/whatsapp'

interface WhatsappConfig {
    id: string;
    instance_name: string;
    instance_token: string | null;
    status: string;
    mensagem_confirmacao: string;
    mensagem_lembrete: string;
    tempo_lembrete_minutos: number;
}

interface WhatsappClientProps {
    config: WhatsappConfig | null;
}

export default function WhatsappClient({ config }: WhatsappClientProps) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [qrcode, setQrcode] = useState<string | null>(null)
    const [msgTemplates, setMsgTemplates] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)
    const [carregandoQrCode, setCarregandoQrCode] = useState(false)

    // Estado dos templates
    const [mensagemConfirmacao, setMensagemConfirmacao] = useState(
        config?.mensagem_confirmacao || 'Olá {{cliente}}, seu agendamento em {{empresa}} para {{data_hora}} está confirmado!'
    )
    const [mensagemLembrete, setMensagemLembrete] = useState(
        config?.mensagem_lembrete || 'Olá {{cliente}}, passando para lembrar do seu agendamento em {{empresa}} no dia {{data}} às {{hora}}.'
    )
    const [tempoLembreteMinutos, setTempoLembreteMinutos] = useState(
        config ? String(config.tempo_lembrete_minutos) : '120'
    )

    // Polling do QR Code/Status se estiver aguardando pareamento
    useEffect(() => {
        if (!config || config.status !== 'aguardando_qrcode') {
            setQrcode(null)
            return
        }

        let isMounted = true
        let intervalId: NodeJS.Timeout

        const carregarESincronizarStatus = async () => {
            if (!isMounted) return
            try {
                const res = await obterQrCodeWhatsApp(config.instance_name)
                
                if (res.status === 'conectado') {
                    router.refresh()
                } else if (res.qrcode) {
                    setQrcode(res.qrcode)
                }
            } catch (err) {
                console.error('Erro ao parear status do WhatsApp:', err)
            }
        }

        // Primeira carga
        setCarregandoQrCode(true)
        carregarESincronizarStatus().finally(() => {
            if (isMounted) setCarregandoQrCode(false)
        })

        // Poll a cada 5 segundos
        intervalId = setInterval(carregarESincronizarStatus, 5000)

        return () => {
            isMounted = false
            clearInterval(intervalId)
        }
    }, [config?.status, config?.instance_name, router])

    const handleConectar = async () => {
        startTransition(async () => {
            try {
                await criarInstanciaWhatsApp()
                router.refresh()
            } catch (err: any) {
                alert(err.message || 'Erro ao conectar')
            }
        })
    }

    const handleDesconectar = async () => {
        if (!config) return
        if (!confirm('Deseja desconectar seu WhatsApp? Isso desativará as notificações automáticas.')) return

        startTransition(async () => {
            try {
                await desconectarWhatsApp(config.instance_name)
                router.refresh()
            } catch (err: any) {
                alert(err.message || 'Erro ao desconectar')
            }
        })
    }

    const handleSalvarTemplates = async (e: React.FormEvent) => {
        e.preventDefault()
        setMsgTemplates(null)

        const minutos = parseInt(tempoLembreteMinutos, 10)
        if (isNaN(minutos) || minutos <= 0) {
            setMsgTemplates({ tipo: 'erro', texto: 'Tempo do lembrete inválido.' })
            return
        }

        startTransition(async () => {
            try {
                await salvarTemplatesMensagem(mensagemConfirmacao, mensagemLembrete, minutos)
                setMsgTemplates({ tipo: 'sucesso', texto: 'Templates salvos com sucesso!' })
                router.refresh()
            } catch (err: any) {
                setMsgTemplates({ tipo: 'erro', texto: err.message || 'Erro ao salvar templates' })
            }
        })
    }

    const status = config?.status || 'desconectado'

    return (
        <div className="space-y-6 max-w-4xl">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Configurações do WhatsApp</h1>
                <p className="text-zinc-500 dark:text-zinc-400 text-sm">
                    Conecte sua conta do WhatsApp para enviar confirmações e lembretes automáticos para seus clientes.
                </p>
            </div>

            {/* Layout em Duas Colunas */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Coluna 1: Status de Conexão */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-xs h-fit lg:col-span-1 space-y-4">
                    <h2 className="text-base font-bold">Status da Conexão</h2>

                    {status === 'desconectado' && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-zinc-400" />
                                <span className="text-sm font-semibold">Desconectado</span>
                            </div>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                                Seu estabelecimento está sem integração. Os clientes não receberão mensagens automáticas de confirmação ou lembretes.
                            </p>
                            <button
                                onClick={handleConectar}
                                disabled={isPending}
                                className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-50 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 font-bold rounded-lg text-sm transition-colors cursor-pointer"
                            >
                                {isPending ? 'Carregando...' : 'Conectar WhatsApp'}
                            </button>
                        </div>
                    )}

                    {status === 'aguardando_qrcode' && (
                        <div className="space-y-4 flex flex-col items-center text-center">
                            <div className="flex items-center gap-2 self-start">
                                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                                <span className="text-sm font-semibold">Aguardando Pareamento</span>
                            </div>
                            
                            {carregandoQrCode && !qrcode ? (
                                <div className="w-48 h-48 bg-zinc-50 dark:bg-zinc-850 rounded-xl flex items-center justify-center border border-dashed border-zinc-200 dark:border-zinc-700">
                                    <span className="text-xs text-zinc-400 animate-pulse">Gerando QR Code...</span>
                                </div>
                            ) : qrcode ? (
                                <div className="bg-white p-3 rounded-xl border border-zinc-200 shadow-sm">
                                    {/* O qr code pode vir em formato raw base64 ou completo */}
                                    <img 
                                        src={qrcode.startsWith('data:') ? qrcode : `data:image/png;base64,${qrcode}`} 
                                        alt="QR Code de pareamento do WhatsApp" 
                                        className="w-44 h-44 select-none"
                                    />
                                </div>
                            ) : (
                                <div className="w-48 h-48 bg-zinc-50 dark:bg-zinc-850 rounded-xl flex items-center justify-center">
                                    <span className="text-xs text-zinc-400">QR Code indisponível.</span>
                                </div>
                            )}

                            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 text-left leading-relaxed">
                                Abra o WhatsApp no seu celular, vá em <strong>Dispositivos Conectados</strong> &rarr; <strong>Conectar Dispositivo</strong> e aponte a câmera para o QR Code acima.
                            </p>

                            <button
                                onClick={handleDesconectar}
                                disabled={isPending}
                                className="w-full py-2 bg-red-50 hover:bg-red-100 text-red-700 dark:bg-red-950/20 dark:hover:bg-red-900/30 dark:text-red-400 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                            >
                                Cancelar Conexão
                            </button>
                        </div>
                    )}

                    {status === 'conectado' && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-sm font-semibold">Integrado com sucesso</span>
                            </div>
                            <div className="bg-zinc-50 dark:bg-zinc-850 p-3 rounded-lg text-xs space-y-1 text-zinc-600 dark:text-zinc-400">
                                <div><span className="font-semibold">Instância:</span> {config?.instance_name}</div>
                            </div>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                                Mensagens de confirmação e lembretes automáticos estão ativos e serão disparados para seus clientes.
                            </p>
                            <button
                                onClick={handleDesconectar}
                                disabled={isPending}
                                className="w-full py-2.5 bg-red-50 hover:bg-red-100 text-red-700 dark:bg-red-950/20 dark:hover:bg-red-900/30 dark:text-red-400 font-bold rounded-lg text-sm transition-colors cursor-pointer"
                            >
                                {isPending ? 'Desconectando...' : 'Desconectar Dispositivo'}
                            </button>
                        </div>
                    )}
                </div>

                {/* Coluna 2: Templates de Notificações */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-xs lg:col-span-2">
                    <h2 className="text-base font-bold mb-4 font-sans">Templates das Mensagens</h2>

                    <form onSubmit={handleSalvarTemplates} className="space-y-4">
                        {msgTemplates && (
                            <div className={`p-3 text-xs font-semibold border rounded-lg ${
                                msgTemplates.tipo === 'sucesso'
                                    ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900'
                                    : 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900'
                            }`}>
                                {msgTemplates.texto}
                            </div>
                        )}

                        {/* Mensagem Confirmação */}
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-bold uppercase text-zinc-400 block">Mensagem de Confirmação Imediata</label>
                                <span className="text-[10px] text-zinc-400 font-medium">Tags: `{"{{cliente}}"}` `{"{{empresa}}"}` `{"{{data_hora}}"}`</span>
                            </div>
                            <textarea
                                value={mensagemConfirmacao}
                                onChange={(e) => setMensagemConfirmacao(e.target.value)}
                                rows={3}
                                className="w-full px-3.5 py-2 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-900 outline-hidden text-zinc-900 dark:text-zinc-50 resize-none font-sans"
                                required
                            />
                        </div>

                        {/* Mensagem Lembrete */}
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-bold uppercase text-zinc-400 block">Mensagem de Lembrete</label>
                                <span className="text-[10px] text-zinc-400 font-medium">Tags: `{"{{cliente}}"}` `{"{{empresa}}"}` `{"{{data}}"}` `{"{{hora}}"}`</span>
                            </div>
                            <textarea
                                value={mensagemLembrete}
                                onChange={(e) => setMensagemLembrete(e.target.value)}
                                rows={3}
                                className="w-full px-3.5 py-2 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-900 outline-hidden text-zinc-900 dark:text-zinc-50 resize-none font-sans"
                                required
                            />
                        </div>

                        {/* Tempo Lembrete */}
                        <div className="space-y-1 max-w-xs">
                            <label className="text-xs font-bold uppercase text-zinc-400 block">Enviar Lembrete quanto tempo antes?</label>
                            <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 overflow-hidden text-sm">
                                <input
                                    type="number"
                                    min="15"
                                    step="1"
                                    value={tempoLembreteMinutos}
                                    onChange={(e) => setTempoLembreteMinutos(e.target.value)}
                                    className="w-full px-3.5 py-2 bg-transparent outline-hidden text-zinc-900 dark:text-zinc-50 font-mono text-sm"
                                    required
                                />
                                <span className="bg-zinc-100 dark:bg-zinc-800 px-3 py-2 text-zinc-500 font-semibold text-xs flex items-center border-l border-zinc-200 dark:border-zinc-800 shrink-0">
                                    minutos
                                </span>
                            </div>
                            <p className="text-[10px] text-zinc-400 mt-1">Ex: 120 minutos = 2 horas antes do início marcado.</p>
                        </div>

                        <div className="pt-2 border-t border-zinc-150 dark:border-zinc-800 flex justify-end">
                            <button
                                type="submit"
                                disabled={isPending}
                                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-50 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 font-semibold rounded-lg text-sm transition-colors cursor-pointer"
                            >
                                {isPending ? 'Salvando...' : 'Salvar Templates'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}
