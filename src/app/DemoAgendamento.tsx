'use client'

import { useEffect, useState } from 'react'

/**
 * Demonstração interativa do fluxo de agendamento na landing page.
 * Estabelecimento e disponibilidade são fictícios — nada aqui toca o banco.
 * A estética espelha o BookingWizard real para que a demo seja uma prévia honesta.
 */

interface ServicoDemo {
    nome: string
    duracaoMinutos: number
    preco: string
}

const SERVICOS_DEMO: ServicoDemo[] = [
    { nome: 'Design de sobrancelhas', duracaoMinutos: 40, preco: 'R$ 60' },
    { nome: 'Design + henna', duracaoMinutos: 50, preco: 'R$ 75' },
    { nome: 'Brow lamination', duracaoMinutos: 60, preco: 'R$ 130' },
]

const HORARIOS_DEMO = ['09:00', '09:40', '10:20', '11:00', '14:00', '14:40', '15:20', '16:00']

interface DiaDemo {
    diaSemana: string
    label: string
    indice: number
}

type Etapa = 'servico' | 'horario' | 'confirmar' | 'sucesso'

export default function DemoAgendamento() {
    const [etapa, setEtapa] = useState<Etapa>('servico')
    const [servico, setServico] = useState<ServicoDemo | null>(null)
    const [dias, setDias] = useState<DiaDemo[]>([])
    const [diaSelecionado, setDiaSelecionado] = useState<DiaDemo | null>(null)
    const [horario, setHorario] = useState<string | null>(null)
    const [nome, setNome] = useState('')

    useEffect(() => {
        // Gera os próximos 5 dias no cliente para evitar divergência de SSR
        const proximos: DiaDemo[] = []
        for (let i = 1; i <= 5; i++) {
            const d = new Date()
            d.setDate(d.getDate() + i)
            proximos.push({
                diaSemana: d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
                label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
                indice: i,
            })
        }
        setDias(proximos)
        setDiaSelecionado(proximos[0])
    }, [])

    // Disponibilidade fictícia, mas determinística: alguns horários "já ocupados"
    const horarioOcupado = (dia: DiaDemo | null, idx: number) =>
        ((dia?.indice ?? 0) + idx) % 3 === 0

    const reiniciar = () => {
        setEtapa('servico')
        setServico(null)
        setHorario(null)
        setNome('')
    }

    const nomeExibicao = nome.trim() || 'Camila'

    return (
        <div className="rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.10)]">
            {/* Cabeçalho do estabelecimento fictício */}
            <div className="flex items-center gap-3 border-b border-zinc-100 px-5 py-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-sm font-medium text-white">
                    AL
                </div>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-zinc-900">Estúdio Ana Lima</p>
                    <p className="truncate text-xs text-zinc-500">Design de sobrancelhas · São Paulo</p>
                </div>
                <span className="rounded-full border border-[#3961D5]/30 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-[#3961D5]">
                    demo
                </span>
            </div>

            <div className="min-h-[22rem] p-5">
                {etapa === 'servico' && (
                    <div className="demo-in">
                        <p className="font-mono text-xs text-zinc-500">1 de 3 — escolha o serviço</p>
                        <ul className="mt-3">
                            {SERVICOS_DEMO.map((s) => (
                                <li key={s.nome} className="border-b border-zinc-100 last:border-0">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setServico(s)
                                            setEtapa('horario')
                                        }}
                                        className="group flex w-full items-baseline justify-between gap-4 py-4 text-left transition-all duration-200 hover:pl-1 focus-visible:outline-2 focus-visible:outline-[#3961D5]"
                                    >
                                        <span className="text-sm font-medium text-zinc-900 group-hover:text-[#3961D5]">
                                            {s.nome}
                                        </span>
                                        <span className="shrink-0 font-mono text-xs text-zinc-500">
                                            {s.duracaoMinutos} min · {s.preco}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                        <p className="mt-4 text-xs text-zinc-400">
                            Pode clicar — é uma demonstração de verdade.
                        </p>
                    </div>
                )}

                {etapa === 'horario' && servico && (
                    <div className="demo-in">
                        <div className="flex items-center justify-between">
                            <p className="font-mono text-xs text-zinc-500">2 de 3 — escolha o horário</p>
                            <button
                                type="button"
                                onClick={() => setEtapa('servico')}
                                className="font-mono text-xs text-zinc-400 transition-colors hover:text-zinc-700"
                            >
                                voltar
                            </button>
                        </div>
                        <p className="mt-3 text-sm font-medium text-zinc-900">{servico.nome}</p>

                        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                            {dias.map((d) => (
                                <button
                                    key={d.label}
                                    type="button"
                                    onClick={() => {
                                        setDiaSelecionado(d)
                                        setHorario(null)
                                    }}
                                    className={`flex w-14 shrink-0 flex-col items-center rounded-xl border px-2 py-2 transition-colors duration-200 ${
                                        diaSelecionado?.label === d.label
                                            ? 'border-zinc-900 bg-zinc-900 text-white'
                                            : 'border-zinc-200 text-zinc-600 hover:border-zinc-400'
                                    }`}
                                >
                                    <span className="text-[10px] uppercase">{d.diaSemana}</span>
                                    <span className="font-mono text-xs">{d.label}</span>
                                </button>
                            ))}
                        </div>

                        <div className="mt-3 grid grid-cols-4 gap-2">
                            {HORARIOS_DEMO.map((h, idx) => {
                                const ocupado = horarioOcupado(diaSelecionado, idx)
                                return (
                                    <button
                                        key={h}
                                        type="button"
                                        disabled={ocupado}
                                        onClick={() => {
                                            setHorario(h)
                                            setEtapa('confirmar')
                                        }}
                                        className={`rounded-lg border py-2 font-mono text-xs transition-colors duration-200 ${
                                            ocupado
                                                ? 'cursor-not-allowed border-zinc-100 text-zinc-300'
                                                : 'border-zinc-200 text-zinc-700 hover:border-[#3961D5] hover:text-[#3961D5]'
                                        }`}
                                    >
                                        {h}
                                    </button>
                                )
                            })}
                        </div>
                        <p className="mt-3 text-xs text-zinc-400">
                            Os horários apagados já foram reservados por outros clientes.
                        </p>
                    </div>
                )}

                {etapa === 'confirmar' && servico && diaSelecionado && horario && (
                    <div className="demo-in">
                        <div className="flex items-center justify-between">
                            <p className="font-mono text-xs text-zinc-500">3 de 3 — confirme</p>
                            <button
                                type="button"
                                onClick={() => setEtapa('horario')}
                                className="font-mono text-xs text-zinc-400 transition-colors hover:text-zinc-700"
                            >
                                voltar
                            </button>
                        </div>

                        <dl className="mt-3 space-y-2 rounded-xl bg-zinc-50 p-4 text-sm">
                            <div className="flex justify-between gap-4">
                                <dt className="text-zinc-500">Serviço</dt>
                                <dd className="text-right font-medium text-zinc-900">{servico.nome}</dd>
                            </div>
                            <div className="flex justify-between gap-4">
                                <dt className="text-zinc-500">Quando</dt>
                                <dd className="text-right font-mono text-zinc-900">
                                    {diaSelecionado.diaSemana} {diaSelecionado.label} · {horario}
                                </dd>
                            </div>
                            <div className="flex justify-between gap-4">
                                <dt className="text-zinc-500">Valor</dt>
                                <dd className="text-right font-mono text-zinc-900">{servico.preco}</dd>
                            </div>
                        </dl>

                        <label className="mt-4 block">
                            <span className="text-xs text-zinc-500">Seu nome (só para a demonstração)</span>
                            <input
                                type="text"
                                value={nome}
                                onChange={(e) => setNome(e.target.value)}
                                placeholder="Camila"
                                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-[#3961D5] focus:outline-none"
                            />
                        </label>

                        <button
                            type="button"
                            onClick={() => setEtapa('sucesso')}
                            className="mt-4 w-full rounded-xl bg-gradient-to-br from-[#3DBAED] to-[#3961D5] py-3 text-sm font-medium text-white transition-all duration-200 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3961D5]"
                        >
                            Confirmar agendamento
                        </button>
                        <p className="mt-3 text-xs text-zinc-400">
                            No fluxo real, seu cliente informa nome e WhatsApp — e mais nada. Sem cadastro, sem senha.
                        </p>
                    </div>
                )}

                {etapa === 'sucesso' && servico && diaSelecionado && horario && (
                    <div className="demo-in">
                        <div className="demo-pop flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                            <svg viewBox="0 0 16 16" className="h-5 w-5 text-emerald-700" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M3 8.5l3.5 3.5L13 5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                        <h3 className="mt-3 text-sm font-semibold text-zinc-900">Horário confirmado</h3>
                        <p className="mt-1 text-xs text-zinc-500">
                            E isto chega no WhatsApp do cliente, sem você digitar nada:
                        </p>

                        <div className="mt-3 max-w-[19rem] rounded-2xl rounded-tl-sm border border-emerald-100 bg-emerald-50 p-4">
                            <p className="text-sm leading-relaxed text-zinc-800">
                                Olá, {nomeExibicao}! Seu horário no <strong>Estúdio Ana Lima</strong> está
                                confirmado: {servico.nome.toLowerCase()}, {diaSelecionado.diaSemana}{' '}
                                {diaSelecionado.label} às {horario}. Até lá!
                            </p>
                            <p className="mt-2 text-right font-mono text-[10px] text-emerald-700">
                                entregue · {horario}
                            </p>
                        </div>

                        <p className="mt-3 text-xs text-zinc-400">
                            Confirmação e lembrete automáticos por WhatsApp fazem parte do plano Pro.
                        </p>
                        <button
                            type="button"
                            onClick={reiniciar}
                            className="mt-4 text-sm text-zinc-500 underline decoration-zinc-300 underline-offset-4 transition-colors hover:text-zinc-900"
                        >
                            Refazer demonstração
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
