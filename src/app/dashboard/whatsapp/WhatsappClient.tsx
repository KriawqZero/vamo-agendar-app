'use client'

import { useState, useEffect, useTransition, type SubmitEvent } from 'react'
import { useRouter } from 'next/navigation'
import {
    obterQrCodeWhatsApp,
    criarInstanciaWhatsApp,
    desconectarWhatsApp,
    reiniciarConexaoWhatsApp,
    enviarMensagemTesteWhatsApp,
    salvarTemplatesMensagem
} from '@/app/actions/whatsapp'
import { capturarEvento } from '@/lib/analytics/client'

// Nunca incluir instance_token aqui: esta interface descreve a prop serializada
// até o browser — o token é segredo e fica restrito ao servidor.
interface WhatsappConfig {
    id: string;
    instance_name: string;
    status: string;
    ultima_verificacao_em: string | null;
    mensagem_confirmacao: string;
    mensagem_lembrete: string;
    tempo_lembrete_minutos: number;
}

interface DisparoClienteRel { nome: string | null }
interface DisparoAgendamentoRel { clientes: DisparoClienteRel | DisparoClienteRel[] | null }

interface Disparo {
    id: string;
    tipo: 'confirmacao' | 'lembrete' | 'teste';
    status: string;
    motivo: string | null;
    created_at: string;
    agendamentos: DisparoAgendamentoRel | DisparoAgendamentoRel[] | null;
}

interface WhatsappClientProps {
    config: WhatsappConfig | null;
    disparos: Disparo[];
}

// Limite de tentativas de polling do QR Code antes de exibir erro.
const MAX_FALHAS_POLLING = 3
// Tempo máximo (ms) aguardando o pareamento antes de considerar o QR expirado.
const TIMEOUT_PAREAMENTO_MS = 2 * 60 * 1000

// Dicionário de motivos técnicos → frases amigáveis em pt-BR.
const MOTIVOS_LEGIVEIS: Record<string, string> = {
    whatsapp_desconectado: 'WhatsApp não estava conectado no momento',
    agendamento_cancelado: 'Agendamento foi cancelado',
    plano_sem_whatsapp: 'Plano sem WhatsApp no momento do envio',
    erro_rede: 'Falha de conexão com o WhatsApp',
    sem_message_id: 'O agendador de lembretes não confirmou o registro',
    qstash_sem_token: 'Agendador de lembretes indisponível',
    telefone_invalido: 'Número de telefone inválido',
    nao_autorizado: 'Sessão não autorizada',
}

function traduzirMotivo(motivo: string | null): string | null {
    if (!motivo) return null
    if (MOTIVOS_LEGIVEIS[motivo]) return MOTIVOS_LEGIVEIS[motivo]
    const httpMatch = motivo.match(/^http_(\d+)$/)
    if (httpMatch) return `Erro no gateway do WhatsApp (${httpMatch[1]})`
    return 'Não foi possível concluir o envio'
}

const TIPO_LABEL: Record<string, string> = {
    confirmacao: 'Confirmação',
    lembrete: 'Lembrete',
    teste: 'Teste',
}

const STATUS_LABEL: Record<string, string> = {
    enviado: 'Enviado',
    agendado: 'Agendado',
    executado: 'Executado',
    falha: 'Falha',
    ignorado: 'Ignorado',
    cancelado: 'Cancelado',
}

function corBadge(status: string): string {
    switch (status) {
        case 'enviado':
        case 'executado':
            return 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900'
        case 'agendado':
        case 'ignorado':
            return 'bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900'
        case 'falha':
            return 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900'
        default:
            return 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700'
    }
}

function nomeClienteDoDisparo(disparo: Disparo): string | null {
    const ag = Array.isArray(disparo.agendamentos) ? disparo.agendamentos[0] : disparo.agendamentos
    if (!ag) return null
    const cli = Array.isArray(ag.clientes) ? ag.clientes[0] : ag.clientes
    return cli?.nome ?? null
}

// Carimbo de auditoria do log de disparos: exibido no fuso do próprio navegador
// do profissional (não é um horário de agendamento, e sim o instante em que o
// disparo aconteceu — o fuso local de quem lê é o mais intuitivo aqui).
function formatarQuando(iso: string): string {
    const d = new Date(iso)
    return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    })
}

function tempoDesde(iso: string): string {
    const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
    if (diffMin <= 0) return 'agora mesmo'
    if (diffMin === 1) return 'há 1 minuto'
    if (diffMin < 60) return `há ${diffMin} minutos`
    const diffH = Math.floor(diffMin / 60)
    if (diffH === 1) return 'há 1 hora'
    return `há ${diffH} horas`
}

export default function WhatsappClient({ config, disparos }: WhatsappClientProps) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const statusConfig = config?.status ?? null
    const instanceName = config?.instance_name ?? null
    const [qrcode, setQrcode] = useState<string | null>(null)
    const [msgTemplates, setMsgTemplates] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)
    const [carregandoQrCode, setCarregandoQrCode] = useState(statusConfig === 'aguardando_qrcode')
    const [erroPareamento, setErroPareamento] = useState<'falhas' | 'expirado' | null>(null)

    // Reset durante o render (padrão recomendado para estado derivado de prop):
    // ao mudar o status vindo do servidor, limpa os artefatos do pareamento.
    const [statusAnterior, setStatusAnterior] = useState(statusConfig)
    if (statusAnterior !== statusConfig) {
        setStatusAnterior(statusConfig)
        setQrcode(null)
        setErroPareamento(null)
        setCarregandoQrCode(statusConfig === 'aguardando_qrcode')
    }

    // Mensagem de teste
    const [telefoneTeste, setTelefoneTeste] = useState('')
    const [feedbackTeste, setFeedbackTeste] = useState<{ ok: boolean; texto: string } | null>(null)
    const [isTestando, startTeste] = useTransition()

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

    // Polling do QR Code/Status enquanto aguarda pareamento.
    useEffect(() => {
        if (statusConfig !== 'aguardando_qrcode' || !instanceName) {
            return
        }

        let isMounted = true
        let pollingEncerrado = false
        let falhasConsecutivas = 0
        const inicio = Date.now()

        const carregarESincronizarStatus = async () => {
            if (!isMounted || pollingEncerrado) return

            // Timeout total de pareamento: QR Code expirado.
            if (Date.now() - inicio > TIMEOUT_PAREAMENTO_MS) {
                pollingEncerrado = true
                setErroPareamento('expirado')
                return
            }

            try {
                const res = await obterQrCodeWhatsApp(instanceName)
                falhasConsecutivas = 0

                if (!isMounted) return
                if (res.status === 'conectado') {
                    pollingEncerrado = true
                    // Funil: transição para conectado observada na UI (só captura;
                    // não altera a lógica de polling).
                    capturarEvento('whatsapp_connected')
                    router.refresh()
                } else if (res.qrcode) {
                    setQrcode(res.qrcode)
                }
            } catch (err) {
                console.error('Erro ao parear status do WhatsApp:', err)
                falhasConsecutivas++
                if (falhasConsecutivas >= MAX_FALHAS_POLLING) {
                    pollingEncerrado = true
                    if (isMounted) setErroPareamento('falhas')
                }
            }
        }

        carregarESincronizarStatus().finally(() => {
            if (isMounted) setCarregandoQrCode(false)
        })

        const intervalId = setInterval(carregarESincronizarStatus, 5000)

        return () => {
            isMounted = false
            clearInterval(intervalId)
        }
    }, [statusConfig, instanceName, router])

    const handleConectar = () => {
        capturarEvento('whatsapp_connect_started')
        startTransition(async () => {
            try {
                await criarInstanciaWhatsApp()
                router.refresh()
            } catch (err) {
                setMsgTemplates({ tipo: 'erro', texto: err instanceof Error ? err.message : 'Erro ao conectar' })
            }
        })
    }

    const handleDesconectar = () => {
        if (!config) return
        startTransition(async () => {
            try {
                await desconectarWhatsApp(config.instance_name)
                router.refresh()
            } catch (err) {
                setMsgTemplates({ tipo: 'erro', texto: err instanceof Error ? err.message : 'Erro ao desconectar' })
            }
        })
    }

    const handleReiniciar = () => {
        startTransition(async () => {
            try {
                await reiniciarConexaoWhatsApp()
                router.refresh()
            } catch (err) {
                setMsgTemplates({ tipo: 'erro', texto: err instanceof Error ? err.message : 'Erro ao reiniciar a conexão' })
            }
        })
    }

    const handleVerificarNovamente = () => {
        startTransition(() => {
            router.refresh()
        })
    }

    const handleRegenerarQr = () => {
        if (!config) return
        capturarEvento('whatsapp_connect_started')
        setErroPareamento(null)
        setQrcode(null)
        setCarregandoQrCode(true)
        startTransition(async () => {
            try {
                const res = await obterQrCodeWhatsApp(config.instance_name)
                if (res.status === 'conectado') {
                    capturarEvento('whatsapp_connected')
                    router.refresh()
                } else if (res.qrcode) {
                    setQrcode(res.qrcode)
                }
            } catch (err) {
                console.error('Erro ao regenerar QR Code:', err)
                setErroPareamento('falhas')
            } finally {
                setCarregandoQrCode(false)
            }
        })
    }

    const handleEnviarTeste = (e: SubmitEvent) => {
        e.preventDefault()
        setFeedbackTeste(null)
        startTeste(async () => {
            try {
                const res = await enviarMensagemTesteWhatsApp(telefoneTeste)
                if (res.ok) {
                    setFeedbackTeste({ ok: true, texto: 'Mensagem de teste enviada! Confira o WhatsApp informado.' })
                } else {
                    setFeedbackTeste({
                        ok: false,
                        texto: traduzirMotivo(res.motivo) || 'Não foi possível enviar a mensagem de teste.'
                    })
                }
                router.refresh()
            } catch (err) {
                setFeedbackTeste({
                    ok: false,
                    texto: err instanceof Error ? err.message : 'Não foi possível enviar a mensagem de teste.'
                })
            }
        })
    }

    const handleSalvarTemplates = (e: SubmitEvent) => {
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
            } catch (err) {
                setMsgTemplates({ tipo: 'erro', texto: err instanceof Error ? err.message : 'Erro ao salvar templates' })
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
                                className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-50 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 font-bold rounded-lg text-sm transition-all duration-200 cursor-pointer disabled:opacity-60"
                            >
                                {isPending ? 'Carregando...' : 'Conectar WhatsApp'}
                            </button>
                        </div>
                    )}

                    {status === 'conectando' && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                                <span className="text-sm font-semibold">Conectando...</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                                <span className="w-4 h-4 border-2 border-zinc-300 dark:border-zinc-700 border-t-amber-500 rounded-full animate-spin" />
                                Estabelecendo a sessão com o WhatsApp.
                            </div>
                            <button
                                onClick={handleVerificarNovamente}
                                disabled={isPending}
                                className="w-full py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-semibold rounded-lg transition-all duration-200 cursor-pointer disabled:opacity-60"
                            >
                                Verificar novamente
                            </button>
                        </div>
                    )}

                    {status === 'aguardando_qrcode' && (
                        <div className="space-y-4 flex flex-col items-center text-center">
                            <div className="flex items-center gap-2 self-start">
                                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                                <span className="text-sm font-semibold">Aguardando Pareamento</span>
                            </div>

                            {erroPareamento ? (
                                <div className="w-full space-y-3">
                                    <div className="w-full bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-xl p-4 text-xs text-red-700 dark:text-red-400 leading-relaxed">
                                        {erroPareamento === 'expirado'
                                            ? 'O QR Code expirou antes do pareamento. Gere um novo código para continuar.'
                                            : 'Não conseguimos atualizar o QR Code agora. Gere um novo código e tente de novo.'}
                                    </div>
                                    <button
                                        onClick={handleRegenerarQr}
                                        disabled={isPending || carregandoQrCode}
                                        className="w-full py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-50 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 text-xs font-bold rounded-lg transition-all duration-200 cursor-pointer disabled:opacity-60"
                                    >
                                        Gerar novo QR Code
                                    </button>
                                </div>
                            ) : carregandoQrCode && !qrcode ? (
                                <div className="w-48 h-48 bg-zinc-50 dark:bg-zinc-800 rounded-xl flex items-center justify-center border border-dashed border-zinc-200 dark:border-zinc-700">
                                    <span className="text-xs text-zinc-400 animate-pulse">Gerando QR Code...</span>
                                </div>
                            ) : qrcode ? (
                                <div className="bg-white p-3 rounded-xl border border-zinc-200 shadow-sm">
                                    <img
                                        src={qrcode.startsWith('data:') ? qrcode : `data:image/png;base64,${qrcode}`}
                                        alt="QR Code de pareamento do WhatsApp"
                                        className="w-44 h-44 select-none"
                                    />
                                </div>
                            ) : (
                                <div className="w-48 h-48 bg-zinc-50 dark:bg-zinc-800 rounded-xl flex items-center justify-center">
                                    <span className="text-xs text-zinc-400">QR Code indisponível.</span>
                                </div>
                            )}

                            {!erroPareamento && (
                                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 text-left leading-relaxed">
                                    Use <strong>outro aparelho</strong> para ler o código: abra o WhatsApp no celular, vá em <strong>Dispositivos Conectados</strong> &rarr; <strong>Conectar Dispositivo</strong> e aponte a câmera para o QR Code acima.
                                </p>
                            )}

                            <button
                                onClick={handleDesconectar}
                                disabled={isPending}
                                className="w-full py-2 bg-red-50 hover:bg-red-100 text-red-700 dark:bg-red-950/20 dark:hover:bg-red-900/30 dark:text-red-400 text-xs font-semibold rounded-lg transition-all duration-200 cursor-pointer disabled:opacity-60"
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
                            <div className="bg-zinc-50 dark:bg-zinc-800 p-3 rounded-lg text-xs space-y-1 text-zinc-600 dark:text-zinc-400">
                                <div><span className="font-semibold">Instância:</span> {config?.instance_name}</div>
                                {config?.ultima_verificacao_em && (
                                    <div><span className="font-semibold">Verificado:</span> {tempoDesde(config.ultima_verificacao_em)}</div>
                                )}
                            </div>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                                Mensagens de confirmação e lembretes automáticos estão ativos e serão disparados para seus clientes.
                            </p>
                            <button
                                onClick={handleDesconectar}
                                disabled={isPending}
                                className="w-full py-2.5 bg-red-50 hover:bg-red-100 text-red-700 dark:bg-red-950/20 dark:hover:bg-red-900/30 dark:text-red-400 font-bold rounded-lg text-sm transition-all duration-200 cursor-pointer disabled:opacity-60"
                            >
                                {isPending ? 'Desconectando...' : 'Desconectar Dispositivo'}
                            </button>
                        </div>
                    )}

                    {status === 'instavel' && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                                <span className="text-sm font-semibold">Conexão instável</span>
                            </div>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                                Não conseguimos confirmar com o WhatsApp agora. Sua conexão pode ainda estar ativa — verifique novamente em instantes.
                            </p>
                            <button
                                onClick={handleVerificarNovamente}
                                disabled={isPending}
                                className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-50 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 font-bold rounded-lg text-sm transition-all duration-200 cursor-pointer disabled:opacity-60"
                            >
                                {isPending ? 'Verificando...' : 'Verificar novamente'}
                            </button>
                            <button
                                onClick={handleReiniciar}
                                disabled={isPending}
                                className="w-full py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-semibold rounded-lg transition-all duration-200 cursor-pointer disabled:opacity-60"
                            >
                                Reiniciar conexão
                            </button>
                        </div>
                    )}

                    {status === 'falha' && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                                <span className="text-sm font-semibold">Conexão perdida</span>
                            </div>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                                A conexão com o WhatsApp foi perdida e precisa ser refeita. Reinicie para gerar um novo QR Code e parear novamente.
                            </p>
                            <button
                                onClick={handleReiniciar}
                                disabled={isPending}
                                className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-50 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 font-bold rounded-lg text-sm transition-all duration-200 cursor-pointer disabled:opacity-60"
                            >
                                {isPending ? 'Reiniciando...' : 'Tentar novamente'}
                            </button>
                        </div>
                    )}

                    {/* Mensagem de teste — apenas quando conectado */}
                    {status === 'conectado' && (
                        <form onSubmit={handleEnviarTeste} className="pt-4 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
                            <label className="text-xs font-bold uppercase text-zinc-400 block">Enviar mensagem de teste</label>
                            <input
                                type="tel"
                                inputMode="numeric"
                                value={telefoneTeste}
                                onChange={(e) => setTelefoneTeste(e.target.value)}
                                placeholder="DDD + número"
                                className="w-full px-3.5 py-2 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-900 outline-hidden text-zinc-900 dark:text-zinc-50"
                                required
                            />
                            <button
                                type="submit"
                                disabled={isTestando}
                                className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-all duration-200 cursor-pointer disabled:opacity-60"
                            >
                                {isTestando ? 'Enviando...' : 'Enviar teste'}
                            </button>
                            {feedbackTeste && (
                                <div className={`p-2.5 text-xs font-semibold border rounded-lg ${
                                    feedbackTeste.ok
                                        ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900'
                                        : 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900'
                                }`}>
                                    {feedbackTeste.texto}
                                </div>
                            )}
                        </form>
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

                        <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 flex justify-end">
                            <button
                                type="submit"
                                disabled={isPending}
                                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-50 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 font-semibold rounded-lg text-sm transition-all duration-200 cursor-pointer disabled:opacity-60"
                            >
                                {isPending ? 'Salvando...' : 'Salvar Templates'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            {/* Painel: Últimos disparos */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-xs">
                <h2 className="text-base font-bold mb-4">Últimos disparos</h2>

                {disparos.length === 0 ? (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Nenhum disparo registrado ainda. Confirmações, lembretes e testes aparecerão aqui.
                    </p>
                ) : (
                    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                        {disparos.map((d) => {
                            const cliente = nomeClienteDoDisparo(d)
                            const motivo = traduzirMotivo(d.motivo)
                            return (
                                <li key={d.id} className="py-3 flex items-start justify-between gap-3">
                                    <div className="min-w-0 space-y-0.5">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                                                {TIPO_LABEL[d.tipo] ?? d.tipo}
                                            </span>
                                            {cliente && (
                                                <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                                                    · {cliente}
                                                </span>
                                            )}
                                        </div>
                                        {motivo && (
                                            <p className="text-xs text-zinc-500 dark:text-zinc-400">{motivo}</p>
                                        )}
                                        <p className="text-[11px] text-zinc-400">{formatarQuando(d.created_at)}</p>
                                    </div>
                                    <span className={`shrink-0 px-2 py-0.5 text-[11px] font-bold border rounded-full ${corBadge(d.status)}`}>
                                        {STATUS_LABEL[d.status] ?? d.status}
                                    </span>
                                </li>
                            )
                        })}
                    </ul>
                )}
            </div>
        </div>
    )
}
