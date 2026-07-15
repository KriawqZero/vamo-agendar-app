'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { listarClientes } from '@/app/actions/clientes'
import { obterSlotsDashboard, criarAgendamentoManual, remarcarAgendamento } from '@/app/actions/agendamentos'
import { somarDias, formatarDataHoraLonga } from '@/lib/timezone'

interface ServicoOpcao {
    id: string;
    nome: string;
    preco: number;
    duracao_minutos: number;
}

interface ClienteOpcao {
    id: string;
    nome: string;
    telefone: string | null;
}

/** Dados mínimos para abrir o modal no modo remarcação. */
export interface DadosRemarcacao {
    agendamentoId: string;
    clienteNome: string;
    servicoNome: string;
    duracaoMinutos: number;
}

interface NovoAgendamentoModalProps {
    servicos: ServicoOpcao[];
    /** Plano com WhatsApp + instância conectada: habilita o envio opcional. */
    podeEnviarWhatsapp: boolean;
    hoje: string; // YYYY-MM-DD no fuso do estabelecimento
    timezone: string;
    remarcacao: DadosRemarcacao | null;
    aoFechar: () => void;
    aoConcluir: () => void;
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const formatarTelefone = (valor: string) => {
    const digitos = valor.replace(/\D/g, '')
    const limitado = digitos.slice(0, 11)
    if (limitado.length <= 2) {
        return limitado.length > 0 ? `(${limitado}` : ''
    }
    if (limitado.length <= 6) {
        return `(${limitado.slice(0, 2)}) ${limitado.slice(2)}`
    }
    if (limitado.length <= 10) {
        return `(${limitado.slice(0, 2)}) ${limitado.slice(2, 6)}-${limitado.slice(6)}`
    }
    return `(${limitado.slice(0, 2)}) ${limitado.slice(2, 7)}-${limitado.slice(7)}`
}

/** Rótulos de dia derivados da data de calendário — independem do fuso do navegador. */
const rotuloDia = (dateStr: string) => {
    const d = new Date(`${dateStr}T12:00:00Z`)
    return {
        diaSemana: d.toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' }).replace('.', ''),
        diaMes: dateStr.slice(8, 10),
    }
}

type Passo = 'cliente' | 'servico' | 'horario' | 'resumo'

export default function NovoAgendamentoModal({
    servicos,
    podeEnviarWhatsapp,
    hoje,
    timezone,
    remarcacao,
    aoFechar,
    aoConcluir
}: NovoAgendamentoModalProps) {
    const ehRemarcacao = remarcacao !== null
    const [isPending, startTransition] = useTransition()
    const [passo, setPasso] = useState<Passo>(ehRemarcacao ? 'horario' : 'cliente')
    const [erro, setErro] = useState<string | null>(null)

    // ── Passo 1: cliente ────────────────────────────────────────────
    const [busca, setBusca] = useState('')
    // Resultados sempre pareados com a busca que os produziu: "buscando" é
    // DERIVADO (busca ≠ buscaConcluida), sem setState síncrono no effect.
    const [resultadoBusca, setResultadoBusca] = useState<{ busca: string; clientes: ClienteOpcao[] } | null>(null)
    const [clienteSelecionado, setClienteSelecionado] = useState<ClienteOpcao | null>(null)
    const [criandoNovo, setCriandoNovo] = useState(false)
    const [novoNome, setNovoNome] = useState('')
    const [novoTelefone, setNovoTelefone] = useState('')

    const buscando = !ehRemarcacao && resultadoBusca?.busca !== busca
    const resultados = resultadoBusca?.clientes ?? []

    // ── Passo 2: serviço ────────────────────────────────────────────
    const [servicoSelecionado, setServicoSelecionado] = useState<ServicoOpcao | null>(null)

    // ── Passo 3: data e horário ─────────────────────────────────────
    const [dataSelecionada, setDataSelecionada] = useState(hoje)
    // Mesmo padrão derivado dos resultados de busca: os slots carregados levam
    // a chave (dia|duração) que os produziu.
    const [slotsCarregados, setSlotsCarregados] = useState<{ chave: string; slots: { time: string; datetime: string }[] } | null>(null)
    const [slotSelecionado, setSlotSelecionado] = useState<string | null>(null)

    // ── Passo 4: resumo ─────────────────────────────────────────────
    const [enviarWhatsApp, setEnviarWhatsApp] = useState(podeEnviarWhatsapp)

    const datas = Array.from({ length: 14 }, (_, i) => somarDias(hoje, i))

    const duracaoAtual = ehRemarcacao
        ? remarcacao.duracaoMinutos
        : servicoSelecionado?.duracao_minutos

    const chaveSlots = `${dataSelecionada}|${duracaoAtual ?? ''}`
    const carregandoSlots = slotsCarregados?.chave !== chaveSlots
    const slots = carregandoSlots ? [] : slotsCarregados!.slots

    // Busca de clientes com debounce de 300 ms
    useEffect(() => {
        if (ehRemarcacao || passo !== 'cliente') return
        let ativo = true
        const timer = setTimeout(async () => {
            let clientes: ClienteOpcao[] = []
            try {
                clientes = await listarClientes(busca)
            } catch {
                clientes = []
            }
            if (ativo) setResultadoBusca({ busca, clientes })
        }, 300)
        return () => {
            ativo = false
            clearTimeout(timer)
        }
    }, [busca, passo, ehRemarcacao])

    // Slots do dia selecionado (mesma engine do booking público)
    useEffect(() => {
        if (passo !== 'horario' || !duracaoAtual) return
        let ativo = true
        const buscar = async () => {
            let res: { time: string; datetime: string }[] = []
            try {
                res = await obterSlotsDashboard(
                    dataSelecionada,
                    duracaoAtual,
                    remarcacao?.agendamentoId
                )
            } catch {
                res = []
            }
            if (ativo) setSlotsCarregados({ chave: `${dataSelecionada}|${duracaoAtual}`, slots: res })
        }
        buscar()
        return () => {
            ativo = false
        }
    }, [passo, dataSelecionada, duracaoAtual, remarcacao?.agendamentoId])

    // Fechar bloqueado durante o save: um erro do servidor se perderia com o modal.
    const fechar = () => {
        if (!isPending) aoFechar()
    }

    // Fechar com Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !isPending) aoFechar()
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [isPending, aoFechar])

    // Foco inicial no painel ao abrir (acessibilidade)
    const painelRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
        painelRef.current?.focus()
    }, [])

    // Focus trap: Tab circula apenas entre os elementos focáveis do painel.
    const prenderFoco = (e: React.KeyboardEvent) => {
        if (e.key !== 'Tab') return
        const focaveis = painelRef.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])'
        )
        if (!focaveis || focaveis.length === 0) return
        const primeiro = focaveis[0]
        const ultimo = focaveis[focaveis.length - 1]
        if (e.shiftKey && document.activeElement === primeiro) {
            e.preventDefault()
            ultimo.focus()
        } else if (!e.shiftKey && document.activeElement === ultimo) {
            e.preventDefault()
            primeiro.focus()
        }
    }

    const nomeCliente = ehRemarcacao
        ? remarcacao.clienteNome
        : clienteSelecionado?.nome || novoNome.trim()
    const telefoneCliente = ehRemarcacao
        ? null
        : clienteSelecionado?.telefone || novoTelefone.replace(/\D/g, '')

    const avancarCliente = () => {
        setErro(null)
        if (criandoNovo) {
            if (!novoNome.trim()) {
                setErro('Informe o nome do cliente.')
                return
            }
            const tel = novoTelefone.replace(/\D/g, '')
            if (tel.length < 10 || tel.length > 11) {
                setErro('Informe o WhatsApp do cliente com DDD (10 ou 11 dígitos).')
                return
            }
        } else if (!clienteSelecionado) {
            setErro('Selecione um cliente ou cadastre um novo.')
            return
        }
        setPasso('servico')
    }

    const selecionarServico = (servico: ServicoOpcao) => {
        setErro(null)
        setServicoSelecionado(servico)
        setSlotSelecionado(null)
        setPasso('horario')
    }

    const selecionarSlot = (datetime: string) => {
        setErro(null)
        setSlotSelecionado(datetime)
        setPasso('resumo')
    }

    const confirmar = () => {
        if (!slotSelecionado || isPending) return
        setErro(null)
        startTransition(async () => {
            try {
                if (ehRemarcacao) {
                    await remarcarAgendamento(remarcacao.agendamentoId, slotSelecionado)
                } else {
                    await criarAgendamentoManual({
                        servicoId: servicoSelecionado!.id,
                        dataHora: slotSelecionado,
                        clienteId: clienteSelecionado?.id,
                        clienteNome: clienteSelecionado ? undefined : novoNome.trim(),
                        clienteTelefone: clienteSelecionado ? undefined : novoTelefone,
                        enviarWhatsApp: podeEnviarWhatsapp && enviarWhatsApp
                    })
                }
                aoConcluir()
            } catch (err) {
                const msg = err instanceof Error && err.message ? err.message : 'Erro ao salvar o agendamento.'
                setErro(msg)
                // Conflito de horário: volta ao passo de horário com a grade atualizada.
                if (msg.includes('conflita') || msg.includes('indisponível')) {
                    setSlotSelecionado(null)
                    setSlotsCarregados(null) // força o refetch da grade
                    setPasso('horario')
                }
            }
        })
    }

    const voltarDe: Partial<Record<Passo, Passo>> = ehRemarcacao
        ? { resumo: 'horario' }
        : { servico: 'cliente', horario: 'servico', resumo: 'horario' }

    const tituloPasso: Record<Passo, string> = {
        cliente: 'Quem é o cliente?',
        servico: 'Qual serviço?',
        horario: ehRemarcacao ? 'Novo horário' : 'Quando?',
        resumo: 'Confirmar',
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
            role="dialog"
            aria-modal="true"
            aria-label={ehRemarcacao ? 'Remarcar agendamento' : 'Novo agendamento'}
        >
            {/* Backdrop (tabIndex -1: fora do focus trap do painel) */}
            <button
                aria-label="Fechar"
                tabIndex={-1}
                onClick={fechar}
                className="absolute inset-0 cursor-default bg-black/50 backdrop-blur-[2px]"
            />

            {/* Painel: bottom-sheet no mobile, modal centrado no desktop.
                dvh (não vh): com o teclado virtual aberto o painel encolhe junto. */}
            <div
                ref={painelRef}
                tabIndex={-1}
                onKeyDown={prenderFoco}
                className="relative flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-fio bg-palco shadow-2xl outline-none sm:max-w-lg sm:rounded-2xl"
            >
                {/* Cabeçalho */}
                <div className="flex items-center gap-3 border-b border-fio px-5 py-4">
                    {voltarDe[passo] && (
                        <button
                            onClick={() => {
                                setErro(null)
                                setPasso(voltarDe[passo]!)
                            }}
                            aria-label="Voltar"
                            className="-ml-2 rounded-full px-3.5 py-2 text-nevoa transition-colors hover:bg-veu hover:text-giz"
                        >
                            ‹
                        </button>
                    )}
                    <div className="min-w-0 flex-1">
                        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-penumbra">
                            {ehRemarcacao ? 'remarcar' : 'novo agendamento'}
                        </p>
                        <h2 className="truncate font-display text-lg font-bold text-giz">
                            {tituloPasso[passo]}
                        </h2>
                    </div>
                    <button
                        onClick={fechar}
                        aria-label="Fechar"
                        className="-mr-1 rounded-full px-3.5 py-2 text-nevoa transition-colors hover:bg-veu hover:text-giz"
                    >
                        ✕
                    </button>
                </div>

                {/* Conteúdo */}
                <div className="flex-1 overflow-y-auto overscroll-contain p-5">
                    {erro && passo !== 'resumo' && (
                        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/[0.08] p-3 text-sm text-red-700 dark:text-red-300">
                            {erro}
                        </div>
                    )}

                    {/* PASSO: CLIENTE */}
                    {passo === 'cliente' && (
                        <div className="space-y-4">
                            {!criandoNovo ? (
                                <>
                                    {/* Sem autoFocus: o foco inicial fica no painel (o efeito de
                                        mount o roubaria de qualquer forma) e no mobile o teclado
                                        não deve abrir sobre o bottom-sheet recém-aberto. */}
                                    <input
                                        type="text"
                                        value={busca}
                                        onChange={(e) => setBusca(e.target.value)}
                                        placeholder="Buscar por nome ou telefone…"
                                        className="w-full rounded-xl border border-fio bg-bastidor px-4 py-3 text-sm text-giz outline-none placeholder:text-penumbra focus:border-marca/50"
                                    />

                                    <div className="space-y-2">
                                        {buscando ? (
                                            <p className="animate-pulse py-4 text-center font-mono text-xs text-penumbra">
                                                buscando…
                                            </p>
                                        ) : resultados.length === 0 ? (
                                            <p className="py-4 text-center text-sm text-nevoa">
                                                {busca.trim()
                                                    ? 'Nenhum cliente encontrado.'
                                                    : 'Você ainda não tem clientes cadastrados.'}
                                            </p>
                                        ) : (
                                            resultados.map((cliente) => (
                                                <button
                                                    key={cliente.id}
                                                    onClick={() => {
                                                        setClienteSelecionado(cliente)
                                                        setErro(null)
                                                        setPasso('servico')
                                                    }}
                                                    className="flex w-full items-baseline justify-between gap-3 rounded-xl border border-fio bg-bastidor px-4 py-3 text-left transition-colors hover:border-marca/40 hover:bg-veu"
                                                >
                                                    <span className="truncate text-sm font-medium text-giz">
                                                        {cliente.nome}
                                                    </span>
                                                    {cliente.telefone && (
                                                        <span className="shrink-0 font-mono text-xs text-nevoa">
                                                            {formatarTelefone(cliente.telefone)}
                                                        </span>
                                                    )}
                                                </button>
                                            ))
                                        )}
                                    </div>

                                    <button
                                        onClick={() => {
                                            setCriandoNovo(true)
                                            setErro(null)
                                        }}
                                        className="w-full rounded-xl border border-dashed border-fio-forte px-4 py-3 font-mono text-xs uppercase tracking-widest text-marca transition-colors hover:bg-veu"
                                    >
                                        + cadastrar novo cliente
                                    </button>
                                </>
                            ) : (
                                <div className="space-y-4">
                                    <div className="space-y-1">
                                        <label className="font-mono text-[10px] uppercase tracking-widest text-penumbra">
                                            nome
                                        </label>
                                        <input
                                            type="text"
                                            value={novoNome}
                                            onChange={(e) => setNovoNome(e.target.value)}
                                            placeholder="Nome do cliente"
                                            autoFocus
                                            className="w-full rounded-xl border border-fio bg-bastidor px-4 py-3 text-sm text-giz outline-none placeholder:text-penumbra focus:border-marca/50"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="font-mono text-[10px] uppercase tracking-widest text-penumbra">
                                            whatsapp
                                        </label>
                                        <input
                                            type="tel"
                                            value={novoTelefone}
                                            onChange={(e) => setNovoTelefone(formatarTelefone(e.target.value))}
                                            placeholder="(11) 99999-9999"
                                            className="w-full rounded-xl border border-fio bg-bastidor px-4 py-3 text-sm text-giz outline-none placeholder:text-penumbra focus:border-marca/50"
                                        />
                                    </div>
                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => {
                                                setCriandoNovo(false)
                                                setErro(null)
                                            }}
                                            className="rounded-xl border border-fio px-4 py-3 font-mono text-xs uppercase tracking-widest text-nevoa transition-colors hover:bg-veu"
                                        >
                                            voltar
                                        </button>
                                        <button
                                            onClick={avancarCliente}
                                            className="flex-1 rounded-xl bg-marca px-4 py-3 font-mono text-xs uppercase tracking-widest text-white transition-colors hover:bg-marca-forte dark:text-zinc-950"
                                        >
                                            continuar →
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* PASSO: SERVIÇO */}
                    {passo === 'servico' && (
                        <div className="space-y-2">
                            <p className="mb-3 text-sm text-nevoa">
                                Cliente: <span className="font-medium text-giz">{nomeCliente}</span>
                            </p>
                            {servicos.length === 0 ? (
                                <p className="py-6 text-center text-sm text-nevoa">
                                    Nenhum serviço ativo. Cadastre um serviço primeiro.
                                </p>
                            ) : (
                                servicos.map((servico) => (
                                    <button
                                        key={servico.id}
                                        onClick={() => selecionarServico(servico)}
                                        className="flex w-full items-baseline justify-between gap-3 rounded-xl border border-fio bg-bastidor px-4 py-3 text-left transition-colors hover:border-marca/40 hover:bg-veu"
                                    >
                                        <span className="min-w-0">
                                            <span className="block truncate text-sm font-medium text-giz">
                                                {servico.nome}
                                            </span>
                                            <span className="font-mono text-xs text-penumbra">
                                                {servico.duracao_minutos} min
                                            </span>
                                        </span>
                                        <span className="shrink-0 font-mono text-sm text-nevoa">
                                            {brl(Number(servico.preco))}
                                        </span>
                                    </button>
                                ))
                            )}
                        </div>
                    )}

                    {/* PASSO: DATA E HORÁRIO */}
                    {passo === 'horario' && (
                        <div className="space-y-5">
                            <p className="text-sm text-nevoa">
                                {ehRemarcacao ? (
                                    <>
                                        <span className="font-medium text-giz">{remarcacao.clienteNome}</span>
                                        {' · '}
                                        {remarcacao.servicoNome}
                                    </>
                                ) : (
                                    <>
                                        <span className="font-medium text-giz">{nomeCliente}</span>
                                        {' · '}
                                        {servicoSelecionado?.nome}
                                    </>
                                )}
                            </p>

                            {/* Seletor de data horizontal (14 dias) */}
                            <div className="flex gap-1.5 overflow-x-auto pb-1">
                                {datas.map((dia) => {
                                    const { diaSemana, diaMes } = rotuloDia(dia)
                                    const selecionado = dia === dataSelecionada
                                    return (
                                        <button
                                            key={dia}
                                            onClick={() => {
                                                setDataSelecionada(dia)
                                                setSlotSelecionado(null)
                                            }}
                                            aria-pressed={selecionado}
                                            className={`flex min-w-[3.25rem] flex-col items-center rounded-xl border px-2 py-2 transition-colors ${
                                                selecionado
                                                    ? 'border-marca/50 bg-veu'
                                                    : 'border-fio hover:border-fio-forte hover:bg-veu'
                                            }`}
                                        >
                                            <span
                                                className={`font-mono text-[10px] uppercase tracking-widest ${
                                                    dia === hoje ? 'text-marca' : 'text-penumbra'
                                                }`}
                                            >
                                                {diaSemana}
                                            </span>
                                            <span
                                                className={`font-display text-base font-semibold ${
                                                    selecionado ? 'text-giz' : 'text-nevoa'
                                                }`}
                                            >
                                                {diaMes}
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>

                            {/* Grade de horários */}
                            {carregandoSlots ? (
                                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                                    {Array.from({ length: 8 }).map((_, i) => (
                                        <div key={i} className="h-10 animate-pulse rounded-xl bg-veu" />
                                    ))}
                                </div>
                            ) : slots.length === 0 ? (
                                <p className="rounded-xl border border-dashed border-fio py-6 text-center text-sm text-nevoa">
                                    Sem horários livres neste dia.
                                </p>
                            ) : (
                                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                                    {slots.map((slot) => (
                                        <button
                                            key={slot.datetime}
                                            onClick={() => selecionarSlot(slot.datetime)}
                                            className="rounded-xl border border-fio bg-bastidor py-3 text-center font-mono text-sm font-semibold text-giz transition-colors hover:border-marca/40 hover:bg-veu"
                                        >
                                            {slot.time}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* PASSO: RESUMO */}
                    {passo === 'resumo' && slotSelecionado && (
                        <div className="space-y-5">
                            {erro && (
                                <div className="rounded-xl border border-red-500/30 bg-red-500/[0.08] p-3 text-sm text-red-700 dark:text-red-300">
                                    {erro}
                                </div>
                            )}

                            <div className="space-y-3 rounded-2xl border border-fio bg-bastidor p-4">
                                <div>
                                    <p className="font-mono text-[10px] uppercase tracking-widest text-penumbra">
                                        cliente
                                    </p>
                                    <p className="text-sm font-medium text-giz">{nomeCliente}</p>
                                    {telefoneCliente && (
                                        <p className="font-mono text-xs text-nevoa">
                                            {formatarTelefone(telefoneCliente)}
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <p className="font-mono text-[10px] uppercase tracking-widest text-penumbra">
                                        serviço
                                    </p>
                                    <p className="text-sm font-medium text-giz">
                                        {ehRemarcacao ? remarcacao.servicoNome : servicoSelecionado?.nome}
                                        <span className="ml-2 font-mono text-xs text-nevoa">
                                            {duracaoAtual} min
                                            {!ehRemarcacao && servicoSelecionado
                                                ? ` · ${brl(Number(servicoSelecionado.preco))}`
                                                : ''}
                                        </span>
                                    </p>
                                </div>
                                <div>
                                    <p className="font-mono text-[10px] uppercase tracking-widest text-penumbra">
                                        {ehRemarcacao ? 'novo horário' : 'quando'}
                                    </p>
                                    <p className="text-sm font-medium text-giz first-letter:uppercase">
                                        {formatarDataHoraLonga(slotSelecionado, timezone)}
                                    </p>
                                </div>
                            </div>

                            {!ehRemarcacao && podeEnviarWhatsapp && telefoneCliente && (
                                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-fio px-4 py-3 transition-colors hover:bg-veu">
                                    <input
                                        type="checkbox"
                                        checked={enviarWhatsApp}
                                        onChange={(e) => setEnviarWhatsApp(e.target.checked)}
                                        className="h-4 w-4 accent-marca"
                                    />
                                    <span className="text-sm text-giz">
                                        Enviar confirmação e lembrete por WhatsApp
                                    </span>
                                </label>
                            )}

                            <button
                                onClick={confirmar}
                                disabled={isPending}
                                className="w-full rounded-xl bg-marca px-4 py-3.5 font-mono text-xs uppercase tracking-widest text-white transition-colors hover:bg-marca-forte disabled:opacity-60 dark:text-zinc-950"
                            >
                                {isPending
                                    ? 'salvando…'
                                    : ehRemarcacao
                                        ? 'confirmar remarcação'
                                        : 'confirmar agendamento'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
