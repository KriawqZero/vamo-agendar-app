'use client'

import React, { useState, useEffect, useRef, useTransition } from 'react'
import { obterSlotsPublicos, criarAgendamentoPublico } from '@/app/actions/public-booking'
import { diaLocal, somarDias, formatarDataHoraLonga, TIMEZONE_PADRAO } from '@/lib/timezone'
import { capturarEvento } from '@/lib/analytics/client'

interface PerfilEmpresa {
    tenant_id: string
    slug: string
    nome_estabelecimento: string
    descricao: string | null
    telefone_contato: string | null
    timezone: string
    horizonte_maximo_dias: number
}

interface Servico {
    id: string
    nome: string
    descricao: string | null
    preco: number
    duracao_minutos: number
}

interface BookingWizardProps {
    perfil: PerfilEmpresa
    servicos: Servico[]
    /** Hash pseudonimizado do tenant para analytics (calculado no servidor). */
    tenantHash: string
}

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

export default function BookingWizard({ perfil, servicos, tenantHash }: BookingWizardProps) {
    const [isPending, startTransition] = useTransition()
    // Funil: booking_started dispara uma única vez, na primeira interação real.
    const bookingIniciado = useRef(false)
    const [etapa, setEtapa] = useState<'servico' | 'data_hora' | 'contato' | 'sucesso'>('servico')

    // Escolhas do usuário
    const [servicoSelecionado, setServicoSelecionado] = useState<Servico | null>(null)
    const [dataSelecionada, setDataSelecionada] = useState<string>('')
    const [horarioSelecionado, setHorarioSelecionado] = useState<string | null>(null) // ISO String em UTC

    // Slots calculados
    const [slots, setSlots] = useState<{ time: string; datetime: string }[]>([])
    const [carregandoSlots, setCarregandoSlots] = useState(false)
    const [erroSlots, setErroSlots] = useState<string | null>(null)

    // Formulário de contato
    const [nome, setNome] = useState('')
    const [telefone, setTelefone] = useState('')
    const [email, setEmail] = useState('')
    const [erroSubmit, setErroSubmit] = useState<string | null>(null)

    // Detalhes do agendamento concluído
    const [agendamentoCriado, setAgendamentoCriado] = useState<{
        data_hora: string
        id: string
    } | null>(null)

    // Lista de datas dos próximos N dias (horizonte do tenant) para exibir no seletor horizontal
    const [datasDisponiveis, setDatasDisponiveis] = useState<
        { label: string; dateStr: string; diaSemana: string }[]
    >([])

    useEffect(() => {
        // Gera os dias de hoje até hoje + horizonte (inclusive), no fuso do estabelecimento —
        // mesma semântica de "N dias à frente" aceita pela engine (obterSlotsDisponiveis).
        const tz = perfil.timezone || TIMEZONE_PADRAO
        const hojeStr = diaLocal(new Date(), tz)
        const datas = []
        const horizonte = perfil.horizonte_maximo_dias ?? 14
        for (let i = 0; i <= horizonte; i++) {
            const dateStr = somarDias(hojeStr, i)
            // Rótulos derivados da data de calendário (meio-dia UTC) — não dependem
            // do fuso do navegador do cliente.
            const dataRotulo = new Date(`${dateStr}T12:00:00Z`)
            const label = dataRotulo.toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                timeZone: 'UTC',
            })
            const diaSemana = dataRotulo
                .toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' })
                .replace('.', '')

            datas.push({ label, dateStr, diaSemana })
        }
        setDatasDisponiveis(datas)
        // Define o primeiro dia como padrão
        if (datas.length > 0) {
            setDataSelecionada(datas[0].dateStr)
        }
    }, [perfil.timezone, perfil.horizonte_maximo_dias])

    // Busca slots quando muda o serviço ou a data selecionada
    useEffect(() => {
        if (!servicoSelecionado || !dataSelecionada) return

        let isMounted = true
        const buscarSlots = async () => {
            setCarregandoSlots(true)
            setErroSlots(null)
            try {
                const res = await obterSlotsPublicos(
                    perfil.tenant_id,
                    dataSelecionada,
                    servicoSelecionado.duracao_minutos,
                )
                if (isMounted) {
                    setSlots(res)
                }
            } catch (err: any) {
                if (isMounted) {
                    setErroSlots(err.message || 'Erro ao carregar horários disponíveis.')
                }
            } finally {
                if (isMounted) setCarregandoSlots(false)
            }
        }

        buscarSlots()

        return () => {
            isMounted = false
        }
    }, [servicoSelecionado, dataSelecionada, perfil.tenant_id])

    const selecionarServico = (servico: Servico) => {
        if (!bookingIniciado.current) {
            bookingIniciado.current = true
            capturarEvento('booking_started', { tenant: tenantHash })
        }
        setServicoSelecionado(servico)
        setHorarioSelecionado(null)
        setEtapa('data_hora')
    }

    const selecionarHorario = (datetime: string) => {
        setHorarioSelecionado(datetime)
        setErroSubmit(null)
        setEtapa('contato')
    }

    const handleConfirmarAgendamento = async (e: React.FormEvent) => {
        e.preventDefault()
        setErroSubmit(null)

        if (!servicoSelecionado || !horarioSelecionado) return

        if (!nome.trim()) {
            setErroSubmit('Por favor, informe seu nome.')
            return
        }

        const telLimpo = telefone.replace(/\D/g, '')
        if (!telLimpo && !email.trim()) {
            setErroSubmit(
                'Forneça pelo menos um meio de contato (WhatsApp ou E-mail) para receber confirmações.',
            )
            return
        }

        if (telLimpo && (telLimpo.length < 10 || telLimpo.length > 11)) {
            setErroSubmit('O telefone/WhatsApp deve conter o DDD e número (10 ou 11 dígitos).')
            return
        }

        startTransition(async () => {
            try {
                const res = await criarAgendamentoPublico({
                    tenantId: perfil.tenant_id,
                    servicoId: servicoSelecionado.id,
                    dataHora: horarioSelecionado,
                    clienteNome: nome,
                    clienteTelefone: telLimpo,
                    clienteEmail: email.trim() || undefined,
                })
                setAgendamentoCriado(res)
                setEtapa('sucesso')
            } catch (err: any) {
                setErroSubmit(err.message || 'Erro ao realizar agendamento. Tente outro horário.')
            }
        })
    }

    // Formata a data/hora para exibição final, no fuso do estabelecimento
    const formatarDataHoraFinal = (isoString: string) =>
        formatarDataHoraLonga(isoString, perfil.timezone || TIMEZONE_PADRAO)

    return (
        <div className="max-w-xl mx-auto bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-xl">
            {/* Header da Empresa */}
            <div className="bg-gradient-to-br from-zinc-900 to-zinc-800 dark:from-zinc-950 dark:to-zinc-900 p-6 text-white text-center border-b border-zinc-800">
                <span className="text-xs font-bold uppercase tracking-widest text-zinc-400">
                    Agendamento Online
                </span>
                <h1 className="text-xl font-extrabold mt-1 tracking-tight">
                    {perfil.nome_estabelecimento}
                </h1>
                {perfil.descricao && (
                    <p className="text-xs text-zinc-300 mt-2 line-clamp-2 max-w-sm mx-auto">
                        {perfil.descricao}
                    </p>
                )}
            </div>

            {/* Progresso Visual */}
            {etapa !== 'sucesso' && (
                <div className="flex border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50 dark:bg-zinc-900/50">
                    <button
                        onClick={() => setEtapa('servico')}
                        className={`flex-1 py-3 text-xs font-semibold text-center border-b-2 transition-all ${
                            etapa === 'servico'
                                ? 'border-zinc-900 dark:border-zinc-50 text-zinc-900 dark:text-zinc-50'
                                : 'border-transparent text-zinc-400'
                        }`}
                    >
                        1. Serviço
                    </button>
                    <button
                        onClick={() => servicoSelecionado && setEtapa('data_hora')}
                        disabled={!servicoSelecionado}
                        className={`flex-1 py-3 text-xs font-semibold text-center border-b-2 transition-all ${
                            etapa === 'data_hora'
                                ? 'border-zinc-900 dark:border-zinc-50 text-zinc-900 dark:text-zinc-50'
                                : 'border-transparent text-zinc-400'
                        }`}
                    >
                        2. Data e Hora
                    </button>
                    <button
                        onClick={() =>
                            servicoSelecionado && horarioSelecionado && setEtapa('contato')
                        }
                        disabled={!servicoSelecionado || !horarioSelecionado}
                        className={`flex-1 py-3 text-xs font-semibold text-center border-b-2 transition-all ${
                            etapa === 'contato'
                                ? 'border-zinc-900 dark:border-zinc-50 text-zinc-900 dark:text-zinc-50'
                                : 'border-transparent text-zinc-400'
                        }`}
                    >
                        3. Confirmar
                    </button>
                </div>
            )}

            {/* ETAPA: ESCOLHER SERVIÇO */}
            {etapa === 'servico' && (
                <div className="p-6 space-y-4 animate-in fade-in duration-200">
                    <div className="space-y-1">
                        <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50">
                            Escolha o Serviço
                        </h2>
                        <p className="text-xs text-zinc-500">
                            Selecione uma opção para ver os horários disponíveis.
                        </p>
                    </div>

                    <div className="space-y-3">
                        {servicos.map((servico) => (
                            <div
                                key={servico.id}
                                onClick={() => selecionarServico(servico)}
                                className={`p-4 border rounded-2xl cursor-pointer transition-all duration-200 flex items-center justify-between gap-4 group ${
                                    servicoSelecionado?.id === servico.id
                                        ? 'border-zinc-900 dark:border-zinc-100 bg-zinc-50 dark:bg-zinc-800'
                                        : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900'
                                }`}
                            >
                                <div className="space-y-1">
                                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-50 group-hover:text-zinc-950 dark:group-hover:text-white">
                                        {servico.nome}
                                    </h3>
                                    {servico.descricao && (
                                        <p className="text-xs text-zinc-500 line-clamp-1">
                                            {servico.descricao}
                                        </p>
                                    )}
                                    <span className="inline-block text-[10px] font-semibold text-zinc-400 dark:text-zinc-500">
                                        Duração: {servico.duracao_minutos} min
                                    </span>
                                </div>
                                <div className="text-right shrink-0">
                                    <span className="text-base font-bold font-mono text-zinc-900 dark:text-zinc-50">
                                        {Number(servico.preco).toLocaleString('pt-BR', {
                                            style: 'currency',
                                            currency: 'BRL',
                                        })}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ETAPA: SELECIONAR DATA E HORA */}
            {etapa === 'data_hora' && (
                <div className="p-6 space-y-5 animate-in fade-in duration-200">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setEtapa('servico')}
                            className="p-1 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 rounded-lg transition-colors cursor-pointer"
                        >
                            &larr; Voltar
                        </button>
                        <div>
                            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50">
                                Quando deseja agendar?
                            </h2>
                            <p className="text-xs text-zinc-500">
                                Serviço:{' '}
                                <span className="font-bold">{servicoSelecionado?.nome}</span>
                            </p>
                        </div>
                    </div>

                    {/* Seletor de Data Horizontal */}
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none snap-x">
                        {datasDisponiveis.map((dt) => (
                            <button
                                key={dt.dateStr}
                                type="button"
                                onClick={() => setDataSelecionada(dt.dateStr)}
                                className={`px-4 py-3 rounded-2xl border text-center flex flex-col items-center min-w-16 snap-start cursor-pointer transition-all duration-200 ${
                                    dataSelecionada === dt.dateStr
                                        ? 'border-zinc-900 dark:border-zinc-50 bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-950 shadow-sm'
                                        : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400'
                                }`}
                            >
                                <span className="text-[10px] font-bold uppercase tracking-wider">
                                    {dt.diaSemana}
                                </span>
                                <span className="text-sm font-extrabold mt-0.5">
                                    {dt.label.split('/')[0]}
                                </span>
                            </button>
                        ))}
                    </div>

                    {/* Grid de Horários */}
                    <div className="space-y-3">
                        <span className="text-xs font-bold uppercase text-zinc-400 block">
                            Horários Disponíveis
                        </span>

                        {carregandoSlots ? (
                            <div className="grid grid-cols-3 gap-2">
                                {Array.from({ length: 9 }).map((_, i) => (
                                    <div
                                        key={i}
                                        className="h-10 bg-zinc-100 dark:bg-zinc-800 rounded-xl animate-pulse"
                                    />
                                ))}
                            </div>
                        ) : erroSlots ? (
                            <p className="text-xs text-red-500">{erroSlots}</p>
                        ) : slots.length === 0 ? (
                            <div className="text-center py-6 text-zinc-400 dark:text-zinc-500 bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl text-xs font-medium border border-dashed border-zinc-200 dark:border-zinc-800">
                                Sem horários livres para este dia. Tente selecionar outra data
                                acima.
                            </div>
                        ) : (
                            <div className="grid grid-cols-3 gap-2">
                                {slots.map((slot) => (
                                    <button
                                        key={slot.datetime}
                                        onClick={() => selecionarHorario(slot.datetime)}
                                        className="py-2.5 bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-800 dark:hover:bg-zinc-700 border border-zinc-200/60 dark:border-zinc-800 rounded-xl text-center text-sm font-bold font-mono transition-all hover:scale-[1.02] cursor-pointer"
                                    >
                                        {slot.time}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ETAPA: FORMULÁRIO DE CONTATO */}
            {etapa === 'contato' && (
                <div className="p-6 space-y-5 animate-in fade-in duration-200">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setEtapa('data_hora')}
                            className="p-1 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 rounded-lg transition-colors cursor-pointer"
                        >
                            &larr; Voltar
                        </button>
                        <div>
                            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50">
                                Finalizar Agendamento
                            </h2>
                            <p className="text-xs text-zinc-500">
                                Sem cadastro. Preencha os dados e confirme.
                            </p>
                        </div>
                    </div>

                    {/* Resumo do pedido */}
                    <div className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-zinc-800/50 p-4 rounded-2xl text-xs space-y-2">
                        <div className="flex justify-between">
                            <span className="text-zinc-400">Serviço:</span>
                            <span className="font-bold text-zinc-900 dark:text-zinc-50">
                                {servicoSelecionado?.nome}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-zinc-400">Duração:</span>
                            <span className="font-bold text-zinc-950 dark:text-zinc-100">
                                {servicoSelecionado?.duracao_minutos} min
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-zinc-400">Preço:</span>
                            <span className="font-bold font-mono text-zinc-900 dark:text-zinc-50">
                                {Number(servicoSelecionado?.preco).toLocaleString('pt-BR', {
                                    style: 'currency',
                                    currency: 'BRL',
                                })}
                            </span>
                        </div>
                        <div className="flex justify-between border-t border-zinc-100 dark:border-zinc-800/80 pt-2">
                            <span className="text-zinc-400">Data e Hora:</span>
                            <span className="font-bold text-zinc-900 dark:text-zinc-50 text-right">
                                {horarioSelecionado
                                    ? formatarDataHoraFinal(horarioSelecionado)
                                    : ''}
                            </span>
                        </div>
                    </div>

                    <form onSubmit={handleConfirmarAgendamento} className="space-y-4">
                        {erroSubmit && (
                            <div className="p-3 text-xs font-semibold bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900 rounded-lg">
                                {erroSubmit}
                            </div>
                        )}

                        <div className="space-y-1">
                            <label className="text-xs font-bold uppercase text-zinc-400 block">
                                Seu Nome Completo
                            </label>
                            <input
                                type="text"
                                value={nome}
                                onChange={(e) => setNome(e.target.value)}
                                placeholder="Como quer ser chamado"
                                className="w-full px-3.5 py-2 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-900 outline-hidden text-zinc-900 dark:text-zinc-50 font-medium"
                                required
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-bold uppercase text-zinc-400 block">
                                WhatsApp / Telefone
                            </label>
                            <input
                                type="tel"
                                value={telefone}
                                onChange={(e) => setTelefone(formatarTelefone(e.target.value))}
                                placeholder="(11) 99999-9999"
                                className="w-full px-3.5 py-2 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-900 outline-hidden text-zinc-900 dark:text-zinc-50 font-medium"
                            />
                            <p className="text-[10px] text-zinc-400">
                                Para receber lembretes e avisos de confirmação.
                            </p>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-bold uppercase text-zinc-400 block">
                                E-mail (Opcional)
                            </label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Ex: seuemail@gmail.com"
                                className="w-full px-3.5 py-2 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-900 outline-hidden text-zinc-900 dark:text-zinc-50 font-medium"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={isPending}
                            className="w-full py-3 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-50 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 font-bold rounded-xl text-sm transition-colors shadow-md cursor-pointer"
                        >
                            {isPending ? 'Confirmando...' : 'Confirmar Agendamento'}
                        </button>
                    </form>
                </div>
            )}

            {/* ETAPA: SUCESSO */}
            {etapa === 'sucesso' && (
                <div className="p-8 text-center space-y-6 animate-in zoom-in-95 duration-300">
                    <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950/40 rounded-full flex items-center justify-center mx-auto text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900">
                        <svg
                            className="w-8 h-8"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={3}
                                d="M5 13l4 4L19 7"
                            />
                        </svg>
                    </div>

                    <div className="space-y-2">
                        <h2 className="text-lg font-extrabold text-zinc-900 dark:text-zinc-50">
                            Agendamento Realizado!
                        </h2>
                        <p className="text-xs text-zinc-500 max-w-xs mx-auto">
                            Tudo pronto! Seu horário foi reservado com sucesso no estabelecimento.
                        </p>
                    </div>

                    <div className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/60 dark:border-zinc-800 p-5 rounded-2xl text-sm space-y-3 max-w-sm mx-auto text-left">
                        <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                                Estabelecimento
                            </span>
                            <span className="font-bold text-zinc-900 dark:text-zinc-50">
                                {perfil.nome_estabelecimento}
                            </span>
                        </div>
                        <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                                Serviço
                            </span>
                            <span className="font-bold text-zinc-900 dark:text-zinc-50">
                                {servicoSelecionado?.nome}
                            </span>
                        </div>
                        <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                                Data e Horário
                            </span>
                            <span className="font-bold text-zinc-900 dark:text-zinc-50">
                                {agendamentoCriado
                                    ? formatarDataHoraFinal(agendamentoCriado.data_hora)
                                    : ''}
                            </span>
                        </div>
                    </div>

                    <div className="pt-2">
                        <button
                            onClick={() => {
                                setServicoSelecionado(null)
                                setHorarioSelecionado(null)
                                setNome('')
                                setTelefone('')
                                setEmail('')
                                setEtapa('servico')
                            }}
                            className="px-6 py-2.5 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
                        >
                            Novo Agendamento
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
