'use client'

import React, { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { salvarServico, excluirServico } from '@/app/actions/servicos'

interface Servico {
    id: string
    nome: string
    descricao: string | null
    preco: number
    duracao_minutos: number
    ativo: boolean
}

interface ServicosClientProps {
    servicos: Servico[]
    planoNome: string
    limiteServicosAtivos: number | null
}

export default function ServicosClient({
    servicos,
    planoNome,
    limiteServicosAtivos,
}: ServicosClientProps) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [modalAberto, setModalAberto] = useState(false)
    const [editandoServico, setEditandoServico] = useState<Servico | null>(null)
    const [erroForm, setErroForm] = useState<string | null>(null)

    const servicosAtivos = servicos.filter((s) => s.ativo).length
    const limiteAtingido = limiteServicosAtivos !== null && servicosAtivos >= limiteServicosAtivos

    // Estado do Formulário
    const [nome, setNome] = useState('')
    const [descricao, setDescricao] = useState('')
    const [preco, setPreco] = useState('0.00')
    const [duracaoMinutos, setDuracaoMinutos] = useState('30')
    const [ativo, setAtivo] = useState(true)

    const abrirCriar = () => {
        setEditandoServico(null)
        setNome('')
        setDescricao('')
        setPreco('0.00')
        setDuracaoMinutos('30')
        setAtivo(true)
        setErroForm(null)
        setModalAberto(true)
    }

    const abrirEditar = (servico: Servico) => {
        setEditandoServico(servico)
        setNome(servico.nome)
        setDescricao(servico.descricao || '')
        setPreco(Number(servico.preco).toFixed(2))
        setDuracaoMinutos(String(servico.duracao_minutos))
        setAtivo(servico.ativo)
        setErroForm(null)
        setModalAberto(true)
    }

    const fecharModal = () => {
        setModalAberto(false)
        setEditandoServico(null)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setErroForm(null)

        const precoNum = parseFloat(preco)
        const duracaoNum = parseInt(duracaoMinutos, 10)

        if (!nome.trim()) {
            setErroForm('O nome do serviço é obrigatório.')
            return
        }

        if (isNaN(precoNum) || precoNum < 0) {
            setErroForm('Preço inválido. Deve ser maior ou igual a zero.')
            return
        }

        if (isNaN(duracaoNum) || duracaoNum <= 0) {
            setErroForm('Duração inválida. Deve ser maior que zero.')
            return
        }

        startTransition(async () => {
            try {
                await salvarServico({
                    id: editandoServico?.id,
                    nome,
                    descricao,
                    preco: precoNum,
                    duracaoMinutos: duracaoNum,
                    ativo,
                })
                setModalAberto(false)
                router.refresh()
            } catch (err) {
                setErroForm(err instanceof Error ? err.message : 'Erro ao salvar serviço')
            }
        })
    }

    const deletarServico = async (id: string, nomeServico: string) => {
        if (!confirm(`Tem certeza que deseja excluir o serviço "${nomeServico}"?`)) {
            return
        }

        startTransition(async () => {
            try {
                await excluirServico(id)
                router.refresh()
            } catch (err) {
                alert(err instanceof Error ? err.message : 'Erro ao deletar serviço')
            }
        })
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Serviços</h1>
                    <p className="text-zinc-500 dark:text-zinc-400 text-sm">
                        Cadastre e edite os serviços que seus clientes podem agendar.
                    </p>
                </div>
                <button
                    onClick={abrirCriar}
                    disabled={limiteAtingido}
                    title={
                        limiteAtingido ? 'Limite de serviços ativos do plano atingido' : undefined
                    }
                    className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-50 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 font-semibold rounded-lg text-sm transition-all duration-200 cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Novo Serviço
                </button>
            </div>

            {/* Contador de limite do plano */}
            {limiteServicosAtivos !== null && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3">
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        <span
                            className={`font-bold ${limiteAtingido ? 'text-red-600 dark:text-red-400' : 'text-zinc-900 dark:text-zinc-100'}`}
                        >
                            {servicosAtivos}/{limiteServicosAtivos}
                        </span>{' '}
                        serviços ativos · plano {planoNome}
                    </p>
                    {limiteAtingido && (
                        <Link
                            href="/dashboard/plano"
                            className="shrink-0 text-xs font-bold text-zinc-900 dark:text-zinc-100 underline underline-offset-2"
                        >
                            Fazer upgrade
                        </Link>
                    )}
                </div>
            )}

            {/* Lista Grid */}
            {servicos.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-center">
                    <svg
                        className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mb-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2"
                        />
                    </svg>
                    <h3 className="font-bold text-zinc-900 dark:text-zinc-100">
                        Nenhum serviço cadastrado
                    </h3>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 max-w-xs">
                        Adicione seu primeiro serviço para habilitar o fluxo de agendamentos.
                    </p>
                    <button
                        onClick={abrirCriar}
                        className="px-4 py-2 mt-4 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 text-sm font-semibold rounded-lg transition-colors cursor-pointer"
                    >
                        Criar Primeiro Serviço
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {servicos.map((servico) => (
                        <div
                            key={servico.id}
                            className={`bg-white dark:bg-zinc-900 border rounded-xl p-5 shadow-xs flex flex-col justify-between transition-all duration-200 ${
                                servico.ativo
                                    ? 'border-zinc-200 dark:border-zinc-800'
                                    : 'border-zinc-200/50 dark:border-zinc-800/50 opacity-60'
                            }`}
                        >
                            <div>
                                <div className="flex items-start justify-between gap-2">
                                    <h3 className="font-bold text-zinc-900 dark:text-zinc-100">
                                        {servico.nome}
                                    </h3>
                                    <span
                                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                            servico.ativo
                                                ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                                                : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                                        }`}
                                    >
                                        {servico.ativo ? 'Ativo' : 'Inativo'}
                                    </span>
                                </div>
                                <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-1.5 line-clamp-2">
                                    {servico.descricao || 'Sem descrição.'}
                                </p>
                            </div>

                            <div className="mt-5 border-t border-zinc-100 dark:border-zinc-800/80 pt-4 flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <span className="text-[10px] uppercase font-bold text-zinc-400 block">
                                        Preço e Duração
                                    </span>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-base font-bold text-zinc-900 dark:text-zinc-100 font-mono">
                                            {Number(servico.preco).toLocaleString('pt-BR', {
                                                style: 'currency',
                                                currency: 'BRL',
                                            })}
                                        </span>
                                        <span className="text-zinc-300 dark:text-zinc-700 font-light">
                                            |
                                        </span>
                                        <span className="text-xs text-zinc-500 font-medium">
                                            {servico.duracao_minutos} min
                                        </span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => abrirEditar(servico)}
                                        className="p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
                                        title="Editar"
                                    >
                                        <svg
                                            className="w-4 h-4"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                                            />
                                        </svg>
                                    </button>
                                    <button
                                        onClick={() => deletarServico(servico.id, servico.nome)}
                                        className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-colors cursor-pointer"
                                        title="Excluir"
                                    >
                                        <svg
                                            className="w-4 h-4"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                            />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal Form */}
            {modalAberto && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                        {/* Modal Header */}
                        <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50">
                                {editandoServico ? 'Editar Serviço' : 'Novo Serviço'}
                            </h2>
                            <button
                                onClick={fecharModal}
                                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                            >
                                <svg
                                    className="w-5 h-5"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M6 18L18 6M6 6l12 12"
                                    />
                                </svg>
                            </button>
                        </div>

                        {/* Form */}
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            {erroForm && (
                                <div className="p-3 text-xs font-semibold bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900 rounded-lg">
                                    {erroForm}
                                </div>
                            )}

                            {/* Nome */}
                            <div className="space-y-1">
                                <label className="text-xs font-bold uppercase text-zinc-400 block">
                                    Nome do Serviço
                                </label>
                                <input
                                    type="text"
                                    value={nome}
                                    onChange={(e) => setNome(e.target.value)}
                                    placeholder="Ex: Corte de Cabelo Masculino"
                                    className="w-full px-3.5 py-2 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-900 outline-hidden focus:border-zinc-900 dark:focus:border-zinc-50 text-zinc-900 dark:text-zinc-50"
                                    required
                                />
                            </div>

                            {/* Descrição */}
                            <div className="space-y-1">
                                <label className="text-xs font-bold uppercase text-zinc-400 block">
                                    Descrição
                                </label>
                                <textarea
                                    value={descricao}
                                    onChange={(e) => setDescricao(e.target.value)}
                                    placeholder="Detalhes sobre o serviço..."
                                    rows={3}
                                    className="w-full px-3.5 py-2 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-900 outline-hidden focus:border-zinc-900 dark:focus:border-zinc-50 text-zinc-900 dark:text-zinc-50 resize-none"
                                />
                            </div>

                            {/* Preço e Duração */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold uppercase text-zinc-400 block">
                                        Preço (R$)
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={preco}
                                        onChange={(e) => setPreco(e.target.value)}
                                        className="w-full px-3.5 py-2 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-900 outline-hidden focus:border-zinc-900 dark:focus:border-zinc-50 text-zinc-900 dark:text-zinc-50 font-mono"
                                        required
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold uppercase text-zinc-400 block">
                                        Duração (minutos)
                                    </label>
                                    <select
                                        value={duracaoMinutos}
                                        onChange={(e) => setDuracaoMinutos(e.target.value)}
                                        className="w-full px-3.5 py-2 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-900 outline-hidden focus:border-zinc-900 dark:focus:border-zinc-50 text-zinc-900 dark:text-zinc-50"
                                    >
                                        <option value="15">15 min</option>
                                        <option value="30">30 min</option>
                                        <option value="45">45 min</option>
                                        <option value="60">1h (60 min)</option>
                                        <option value="90">1h30 (90 min)</option>
                                        <option value="120">2h (120 min)</option>
                                        <option value="180">3h (180 min)</option>
                                    </select>
                                </div>
                            </div>

                            {/* Ativo */}
                            <div className="flex items-center gap-3 pt-2">
                                <input
                                    type="checkbox"
                                    id="ativo-chk"
                                    checked={ativo}
                                    onChange={(e) => setAtivo(e.target.checked)}
                                    className="w-4 h-4 rounded-sm border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-50 focus:ring-0 cursor-pointer"
                                />
                                <label
                                    htmlFor="ativo-chk"
                                    className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 cursor-pointer"
                                >
                                    Serviço ativo para agendamento
                                </label>
                            </div>

                            {/* Modal Footer */}
                            <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={fecharModal}
                                    className="px-4 py-2 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-lg text-sm font-semibold transition-colors cursor-pointer"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={isPending}
                                    className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-50 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 font-semibold rounded-lg text-sm transition-colors cursor-pointer"
                                >
                                    {isPending ? 'Salvando...' : 'Salvar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
