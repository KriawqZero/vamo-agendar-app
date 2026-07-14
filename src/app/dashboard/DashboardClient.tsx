'use client'

import React, { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { atualizarStatusAgendamento } from '@/app/actions/agendamentos'
import { diaLocal, horaLocal, somarDias } from '@/lib/timezone'
import { capturarEvento } from '@/lib/analytics/client'
import NovoAgendamentoModal, { type DadosRemarcacao } from './NovoAgendamentoModal'

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
    /** Agendamentos da janela de duas semanas (régua + próximos dias) */
    agendamentosPeriodo: Agendamento[];
    perfilEmpresa: { slug: string; nome_estabelecimento: string } | null;
    whatsappStatus: string;
    dataSelecionada: string; // YYYY-MM-DD
    inicioSemana: string; // segunda-feira da semana exibida na régua
    hoje: string; // YYYY-MM-DD no fuso do estabelecimento
    timezone: string; // Fuso IANA do estabelecimento
    temServicoAtivo: boolean;
    temHorariosConfigurados: boolean;
    /** Serviços ativos para o modal de agendamento manual */
    servicos: Servico[];
    /** Plano com WhatsApp + instância conectada (habilita o envio opcional) */
    podeEnviarWhatsapp: boolean;
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** Rótulo curto do dia da semana a partir de "YYYY-MM-DD" (independe do fuso do navegador). */
const rotuloDiaSemana = (dateStr: string) =>
    new Date(`${dateStr}T12:00:00Z`)
        .toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' })
        .replace('.', '')

/** Rótulo longo do dia a partir de "YYYY-MM-DD" (independe do fuso do navegador). */
const rotuloDiaLongo = (dateStr: string) =>
    new Date(`${dateStr}T12:00:00Z`).toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: 'UTC',
    })

const CHAVE_PROXIMOS_VISIVEL = 'va:proximos-dias-visivel'

/** Linha da timeline: um atendimento ou uma janela livre entre dois. */
type ItemLinha =
    | { tipo: 'atendimento'; ag: Agendamento }
    | { tipo: 'livre'; de: string; ate: string; chave: string }

export default function DashboardClient({
    agendamentosPeriodo,
    perfilEmpresa,
    whatsappStatus,
    dataSelecionada,
    inicioSemana,
    hoje,
    timezone,
    temServicoAtivo,
    temHorariosConfigurados,
    servicos,
    podeEnviarWhatsapp
}: DashboardClientProps) {
    const router = useRouter()

    // Interpretação de instantes no fuso do estabelecimento (vindo do servidor).
    const diaDe = (iso: string) => diaLocal(iso, timezone)
    const horaDe = (iso: string) => horaLocal(iso, timezone)
    const [, startTransition] = useTransition()
    const [copiado, setCopiado] = useState(false)
    const [statusUpdating, setStatusUpdating] = useState<string | null>(null)
    const [proximosVisivel, setProximosVisivel] = useState(true)

    // Modal de agendamento manual: null = fechado; remarcacao preenchida = modo remarcar.
    const [modalAgendamento, setModalAgendamento] = useState<
        { remarcacao: DadosRemarcacao | null } | null
    >(null)

    useEffect(() => {
        const salvo = localStorage.getItem(CHAVE_PROXIMOS_VISIVEL)
        if (salvo !== null) setProximosVisivel(salvo === '1')
    }, [])

    const alternarProximos = () => {
        setProximosVisivel((v) => {
            localStorage.setItem(CHAVE_PROXIMOS_VISIVEL, v ? '0' : '1')
            return !v
        })
    }

    const dataFormatada = rotuloDiaLongo(dataSelecionada)

    // ── Derivações da janela ────────────────────────────────────────
    const agendamentos = agendamentosPeriodo.filter((ag) => diaDe(ag.data_hora) === dataSelecionada)

    // Contagem de ativos por dia (alimenta a régua)
    const contagens = new Map<string, number>()
    for (const ag of agendamentosPeriodo) {
        if (ag.status === 'cancelado') continue
        const dia = diaDe(ag.data_hora)
        contagens.set(dia, (contagens.get(dia) ?? 0) + 1)
    }

    // Próximos dias com atendimentos ativos (depois do dia selecionado)
    const proximosPorDia = new Map<string, Agendamento[]>()
    for (const ag of agendamentosPeriodo) {
        if (ag.status === 'cancelado') continue
        const dia = diaDe(ag.data_hora)
        if (dia <= dataSelecionada) continue
        if (!proximosPorDia.has(dia)) proximosPorDia.set(dia, [])
        proximosPorDia.get(dia)!.push(ag)
    }
    const diasProximos = [...proximosPorDia.keys()].sort()
    const totalProximos = diasProximos.reduce((s, d) => s + proximosPorDia.get(d)!.length, 0)

    // Estatísticas do dia em uma frase (não em caixas)
    const ativos = agendamentos.filter(ag => ag.status !== 'cancelado')
    const faturamentoEstimado = agendamentos
        .filter(ag => ag.status === 'confirmado' || ag.status === 'concluido')
        .reduce((sum, ag) => sum + Number(ag.servicos?.preco || 0), 0)

    // Régua: os 7 dias da semana exibida
    const diasRegua = Array.from({ length: 7 }, (_, i) => somarDias(inicioSemana, i))

    // Linha do dia: atendimentos em ordem + janelas livres (>= 30 min) entre eles
    const ordenados = [...agendamentos].sort((a, b) => a.data_hora.localeCompare(b.data_hora))
    const linha: ItemLinha[] = []
    let fimAnterior: number | null = null
    for (const ag of ordenados) {
        const inicio = new Date(ag.data_hora).getTime()
        if (ag.status !== 'cancelado') {
            if (fimAnterior !== null && inicio - fimAnterior >= 30 * 60 * 1000) {
                linha.push({
                    tipo: 'livre',
                    de: horaDe(new Date(fimAnterior).toISOString()),
                    ate: horaDe(ag.data_hora),
                    chave: `livre-${fimAnterior}`,
                })
            }
            fimAnterior = inicio + (ag.servicos?.duracao_minutos || 0) * 60 * 1000
        }
        linha.push({ tipo: 'atendimento', ag })
    }

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
        capturarEvento('booking_link_copied')
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
        } catch (err) {
            alert(err instanceof Error && err.message ? err.message : 'Erro ao alterar status')
        } finally {
            setStatusUpdating(null)
        }
    }

    const mudarData = (novaData: string) => {
        router.push(novaData === hoje ? '/dashboard' : `/dashboard?date=${novaData}`)
    }

    const abrirNovoAgendamento = () => setModalAgendamento({ remarcacao: null })

    const abrirRemarcacao = (ag: Agendamento) =>
        setModalAgendamento({
            remarcacao: {
                agendamentoId: ag.id,
                clienteNome: ag.clientes?.nome || 'Cliente',
                servicoNome: ag.servicos?.nome || 'Serviço',
                duracaoMinutos: ag.servicos?.duracao_minutos || 30,
            },
        })

    const concluirModal = () => {
        setModalAgendamento(null)
        startTransition(() => {
            router.refresh()
        })
    }

    const setupCompleto = temServicoAtivo && temHorariosConfigurados

    return (
        <div>
            {/* Cabeçalho do dia */}
            <div className="relative">
                <p className="font-mono text-xs uppercase tracking-[0.25em] text-marca">
                    {dataFormatada}
                    {dataSelecionada === hoje && ' — hoje'}
                </p>
                <h1 className="mt-3 font-display text-3xl font-bold tracking-tight">
                    Olá, {perfilEmpresa?.nome_estabelecimento || 'profissional'}.
                </h1>
                {setupCompleto && (
                    <button
                        onClick={abrirNovoAgendamento}
                        className="absolute right-0 top-0 hidden rounded-full bg-marca px-5 py-2.5 font-mono text-xs uppercase tracking-widest text-white transition-colors hover:bg-marca-forte sm:block"
                    >
                        + agendar
                    </button>
                )}
                <p className="mt-3 font-mono text-sm text-nevoa">
                    {ativos.length === 0
                        ? 'nenhum atendimento'
                        : `${ativos.length} atendimento${ativos.length > 1 ? 's' : ''}`}
                    {' · '}
                    <span className="text-giz">{brl(faturamentoEstimado)}</span> previstos
                    {' · '}
                    <button
                        onClick={() => router.push('/dashboard/whatsapp')}
                        className="group inline-flex items-baseline gap-1.5 transition-colors hover:text-giz"
                    >
                        <span
                            className={`inline-block h-1.5 w-1.5 rounded-full ${
                                whatsappStatus === 'conectado'
                                    ? 'bg-marca'
                                    : whatsappStatus === 'aguardando_qrcode'
                                        ? 'bg-amber-500 dark:bg-amber-400'
                                        : 'bg-penumbra'
                            }`}
                        />
                        whatsapp{' '}
                        {whatsappStatus === 'conectado'
                            ? 'conectado'
                            : whatsappStatus === 'aguardando_qrcode'
                                ? 'aguardando'
                                : 'desconectado'}
                    </button>
                </p>
            </div>

            {/* Régua de dias: a semana com a lotação de cada dia */}
            <div className="mt-8 flex items-center gap-2">
                <button
                    onClick={() => mudarData(somarDias(dataSelecionada, -7))}
                    aria-label="Semana anterior"
                    className="shrink-0 rounded-full border border-fio px-3 py-2 text-nevoa transition-colors hover:bg-veu hover:text-giz"
                >
                    ‹
                </button>

                <div className="flex flex-1 gap-1.5 overflow-x-auto pb-1 sm:gap-2">
                    {diasRegua.map((dia) => {
                        const selecionado = dia === dataSelecionada
                        const ehHoje = dia === hoje
                        const qtd = contagens.get(dia) ?? 0
                        return (
                            <button
                                key={dia}
                                onClick={() => mudarData(dia)}
                                className={`flex min-w-[3.25rem] flex-1 flex-col items-center rounded-xl border py-2 transition-colors duration-200 ${
                                    selecionado
                                        ? 'border-marca/50 bg-veu'
                                        : 'border-fio hover:border-fio-forte hover:bg-veu'
                                }`}
                            >
                                <span
                                    className={`font-mono text-[10px] uppercase tracking-widest ${
                                        ehHoje ? 'text-marca' : 'text-penumbra'
                                    }`}
                                >
                                    {rotuloDiaSemana(dia)}
                                </span>
                                <span
                                    className={`font-display text-lg font-semibold leading-tight ${
                                        selecionado ? 'text-giz' : 'text-nevoa'
                                    }`}
                                >
                                    {dia.slice(8, 10)}
                                </span>
                                <span
                                    className={`font-mono text-[11px] ${
                                        qtd === 0
                                            ? 'text-penumbra/60'
                                            : selecionado
                                                ? 'text-marca'
                                                : 'text-nevoa'
                                    }`}
                                >
                                    {qtd === 0 ? '·' : qtd}
                                </span>
                            </button>
                        )
                    })}
                </div>

                <button
                    onClick={() => mudarData(somarDias(dataSelecionada, 7))}
                    aria-label="Próxima semana"
                    className="shrink-0 rounded-full border border-fio px-3 py-2 text-nevoa transition-colors hover:bg-veu hover:text-giz"
                >
                    ›
                </button>

                {dataSelecionada !== hoje && (
                    <button
                        onClick={() => mudarData(hoje)}
                        className="shrink-0 rounded-full border border-fio px-3 py-2 font-mono text-xs uppercase tracking-widest text-nevoa transition-colors hover:bg-veu hover:text-giz"
                    >
                        hoje
                    </button>
                )}
            </div>

            {/* Perfil não configurado */}
            {!perfilEmpresa && (
                <div className="mt-8 rounded-xl border border-amber-500/30 bg-amber-500/[0.08] p-4 text-sm text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/[0.06] dark:text-amber-200">
                    <span className="font-semibold">Link de agendamento inativo:</span> configure o
                    perfil da sua empresa (nome e link) para receber agendamentos.
                    <button
                        onClick={() => router.push('/dashboard/agenda')}
                        className="ml-2 font-semibold underline underline-offset-4 transition-colors hover:text-amber-950 dark:hover:text-amber-100"
                    >
                        Configurar agora
                    </button>
                </div>
            )}

            {/* Primeiros passos */}
            {perfilEmpresa && !setupCompleto && (
                <div className="mt-8 rounded-2xl border border-fio bg-bastidor p-6">
                    <p className="font-mono text-xs uppercase tracking-[0.25em] text-penumbra">
                        primeiros passos
                    </p>
                    <ol className="mt-5 space-y-5">
                        {[
                            {
                                numero: '01',
                                feito: temServicoAtivo,
                                titulo: 'Cadastre seus serviços',
                                descricao: 'Crie pelo menos um serviço para seus clientes agendarem.',
                                acao: 'Configurar serviços',
                                href: '/dashboard/servicos',
                            },
                            {
                                numero: '02',
                                feito: temHorariosConfigurados,
                                titulo: 'Configure seus horários de atendimento',
                                descricao: 'Defina os dias e horários em que você atende.',
                                acao: 'Configurar agenda',
                                href: '/dashboard/agenda',
                            },
                            {
                                numero: '03',
                                feito: false,
                                titulo: 'Compartilhe seu link de agendamento',
                                descricao: 'Disponível assim que as etapas acima estiverem completas.',
                                acao: null,
                                href: null,
                            },
                        ].map((passo) => (
                            <li key={passo.numero} className="flex items-start gap-4">
                                <span
                                    className={`font-mono text-sm ${passo.feito ? 'text-marca' : 'text-penumbra'}`}
                                >
                                    {passo.feito ? '✓' : passo.numero}
                                </span>
                                <div>
                                    <p
                                        className={`text-sm font-medium ${
                                            passo.feito ? 'text-penumbra line-through' : 'text-giz'
                                        }`}
                                    >
                                        {passo.titulo}
                                    </p>
                                    {!passo.feito && (
                                        <>
                                            <p className="mt-1 text-sm text-nevoa">{passo.descricao}</p>
                                            {passo.acao && passo.href && (
                                                <button
                                                    onClick={() => router.push(passo.href!)}
                                                    className="mt-2 font-mono text-xs uppercase tracking-widest text-marca transition-colors hover:text-marca-suave"
                                                >
                                                    {passo.acao} →
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ol>
                </div>
            )}

            {/* Link público */}
            {perfilEmpresa && (
                <div className="mt-8 rounded-xl border border-fio bg-bastidor px-4 py-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="min-w-0 truncate font-mono text-sm text-nevoa">
                            <span className="mr-3 hidden font-mono text-[10px] uppercase tracking-widest text-penumbra sm:inline">
                                seu link
                            </span>
                            {linkPublico}
                        </p>
                        <button
                            onClick={copiarLink}
                            className={`shrink-0 self-start font-mono text-xs uppercase tracking-widest transition-colors sm:self-auto ${
                                copiado ? 'text-marca' : 'text-nevoa hover:text-giz'
                            }`}
                        >
                            {copiado ? 'copiado ✓' : 'copiar'}
                        </button>
                    </div>
                    {!setupCompleto && (
                        <p className="mt-2 text-xs text-amber-700/90 dark:text-amber-300/80">
                            Seu link ainda não mostra horários — complete os primeiros passos.
                        </p>
                    )}
                </div>
            )}

            {/* Linha do dia */}
            <div className="mt-12">
                <p className="font-mono text-xs uppercase tracking-[0.25em] text-penumbra">
                    linha do dia
                </p>

                {agendamentos.length === 0 ? (
                    <div className="mt-6 py-14 text-center">
                        <p className="font-mono text-sm text-penumbra">Nenhum atendimento neste dia.</p>
                        {setupCompleto && (
                            <p className="mt-2 text-sm text-nevoa">
                                Compartilhe seu link para preencher a agenda.
                            </p>
                        )}
                    </div>
                ) : (
                    <ol className="mt-8">
                        {linha.map((item) => {
                            if (item.tipo === 'livre') {
                                return (
                                    <li
                                        key={item.chave}
                                        className="relative border-l border-dashed border-fio py-5 pl-7"
                                    >
                                        <p className="font-mono text-xs text-penumbra">
                                            janela livre · {item.de} — {item.ate}
                                        </p>
                                    </li>
                                )
                            }

                            const { ag } = item
                            const hora = horaDe(ag.data_hora)
                            const telLimpo = ag.clientes?.telefone || ''
                            const waLink = telLimpo ? `https://wa.me/55${telLimpo}` : null
                            const cancelado = ag.status === 'cancelado'
                            const concluido = ag.status === 'concluido'

                            return (
                                <li
                                    key={ag.id}
                                    className={`relative border-l border-fio pb-9 pl-7 last:pb-0 ${
                                        cancelado ? 'opacity-45' : ''
                                    }`}
                                >
                                    <span
                                        className={`absolute -left-[4.5px] top-2 h-2 w-2 rounded-full ${
                                            concluido
                                                ? 'bg-marca'
                                                : cancelado
                                                    ? 'bg-red-500/70 dark:bg-red-400/70'
                                                    : ag.status === 'pendente'
                                                        ? 'bg-amber-500 dark:bg-amber-400'
                                                        : 'bg-fio-forte'
                                        }`}
                                    />
                                    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                                        <span className="font-mono text-lg text-giz">{hora}</span>
                                        <span className={`font-medium text-giz ${cancelado ? 'line-through' : ''}`}>
                                            {ag.clientes?.nome || 'Cliente'}
                                        </span>
                                        <span className="text-sm text-nevoa">
                                            {ag.servicos?.nome}
                                            {ag.servicos ? ` · ${ag.servicos.duracao_minutos} min` : ''}
                                        </span>
                                        <span className="ml-auto font-mono text-sm text-nevoa">
                                            {brl(Number(ag.servicos?.preco || 0))}
                                        </span>
                                    </div>
                                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                                        <span
                                            className={`font-mono text-xs uppercase tracking-widest ${
                                                concluido
                                                    ? 'text-marca'
                                                    : cancelado
                                                        ? 'text-red-700/80 dark:text-red-300/80'
                                                        : ag.status === 'pendente'
                                                            ? 'text-amber-700 dark:text-amber-300'
                                                            : 'text-penumbra'
                                            }`}
                                        >
                                            {ag.status}
                                        </span>
                                        {telLimpo && (
                                            <a
                                                href={waLink!}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs text-nevoa transition-colors hover:text-marca"
                                            >
                                                {ag.clientes?.telefone} ↗
                                            </a>
                                        )}
                                        {!cancelado && !concluido && (
                                            <span className="flex items-center gap-3">
                                                <button
                                                    onClick={() => alterarStatus(ag.id, 'concluido')}
                                                    disabled={statusUpdating === ag.id}
                                                    className="font-mono text-xs uppercase tracking-widest text-marca transition-colors hover:text-marca-suave disabled:opacity-50"
                                                >
                                                    concluir
                                                </button>
                                                <button
                                                    onClick={() => abrirRemarcacao(ag)}
                                                    disabled={statusUpdating === ag.id}
                                                    className="font-mono text-xs uppercase tracking-widest text-nevoa transition-colors hover:text-giz disabled:opacity-50"
                                                >
                                                    remarcar
                                                </button>
                                                <button
                                                    onClick={() => alterarStatus(ag.id, 'cancelado')}
                                                    disabled={statusUpdating === ag.id}
                                                    className="font-mono text-xs uppercase tracking-widest text-red-700/70 transition-colors hover:text-red-700 disabled:opacity-50 dark:text-red-300/70 dark:hover:text-red-300"
                                                >
                                                    cancelar
                                                </button>
                                            </span>
                                        )}
                                        {statusUpdating === ag.id && (
                                            <span className="animate-pulse font-mono text-xs text-penumbra">
                                                atualizando…
                                            </span>
                                        )}
                                    </div>
                                </li>
                            )
                        })}
                    </ol>
                )}
            </div>

            {/* Próximos dias */}
            {totalProximos > 0 && (
                <div className="mt-14">
                    <button
                        onClick={alternarProximos}
                        className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.25em] text-penumbra transition-colors hover:text-nevoa"
                    >
                        <span>próximos dias</span>
                        <span className="text-marca">{totalProximos}</span>
                        <span className="text-[10px]">{proximosVisivel ? 'ocultar' : 'mostrar'}</span>
                    </button>

                    {proximosVisivel && (
                        <div className="mt-6 space-y-8">
                            {diasProximos.map((dia) => {
                                const doDia = proximosPorDia.get(dia)!
                                const rotulo = rotuloDiaLongo(dia)
                                return (
                                    <div key={dia}>
                                        <button
                                            onClick={() => mudarData(dia)}
                                            className="group flex items-baseline gap-3 text-sm text-nevoa transition-colors hover:text-giz"
                                        >
                                            <span className="font-medium capitalize">{rotulo}</span>
                                            <span className="font-mono text-xs text-penumbra group-hover:text-marca">
                                                abrir dia →
                                            </span>
                                        </button>
                                        <ul className="mt-3 space-y-2">
                                            {doDia
                                                .sort((a, b) => a.data_hora.localeCompare(b.data_hora))
                                                .map((ag) => (
                                                    <li
                                                        key={ag.id}
                                                        className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 border-l border-fio pl-7 text-sm"
                                                    >
                                                        <span className="font-mono text-nevoa">
                                                            {horaDe(ag.data_hora)}
                                                        </span>
                                                        <span className="text-giz">
                                                            {ag.clientes?.nome || 'Cliente'}
                                                        </span>
                                                        <span className="text-nevoa">{ag.servicos?.nome}</span>
                                                        <span className="ml-auto font-mono text-xs text-penumbra">
                                                            {brl(Number(ag.servicos?.preco || 0))}
                                                        </span>
                                                    </li>
                                                ))}
                                        </ul>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* FAB mobile: novo agendamento */}
            {setupCompleto && (
                <button
                    onClick={abrirNovoAgendamento}
                    aria-label="Novo agendamento"
                    className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-marca text-2xl font-light text-white shadow-lg transition-transform hover:scale-105 active:scale-95 sm:hidden"
                >
                    +
                </button>
            )}

            {/* Modal de agendamento manual / remarcação */}
            {modalAgendamento && (
                <NovoAgendamentoModal
                    servicos={servicos}
                    podeEnviarWhatsapp={podeEnviarWhatsapp}
                    hoje={hoje}
                    timezone={timezone}
                    remarcacao={modalAgendamento.remarcacao}
                    aoFechar={() => setModalAgendamento(null)}
                    aoConcluir={concluirModal}
                />
            )}
        </div>
    )
}
