'use client'

import { useActionState, useEffect, useMemo, useRef, useState } from 'react'
import { obterSlotsPublicos, criarAgendamentoPublico } from '@/app/actions/public-booking'
import { diaLocal, somarDias, formatarDataHoraLonga, TIMEZONE_PADRAO } from '@/lib/timezone'
import { capturarEvento } from '@/lib/analytics/client'
import { classesAcento } from './acento'
import CabecalhoEstabelecimento from './CabecalhoEstabelecimento'
import BarraInferior from './BarraInferior'
import EtapaServico from './etapas/EtapaServico'
import EtapaDataHora from './etapas/EtapaDataHora'
import EtapaContato from './etapas/EtapaContato'
import EtapaSucesso from './etapas/EtapaSucesso'

export interface PerfilPublico {
    tenant_id: string
    nome_estabelecimento: string
    descricao: string | null
    instagram: string | null
    endereco: string | null
    timezone: string
    horizonte_maximo_dias: number
}

export interface PersonalizacaoPublica {
    corMarca: string | null
    logoUrl: string | null
    capaUrl: string | null
}

export interface Servico {
    id: string
    nome: string
    descricao: string | null
    preco: number
    duracao_minutos: number
}

export interface Slot {
    time: string
    datetime: string
}

export interface DataDisponivel {
    label: string
    dateStr: string
    diaSemana: string
}

export type EtapaBooking = 'servico' | 'data_hora' | 'contato' | 'sucesso'

interface BookingAppProps {
    perfil: PerfilPublico
    personalizacao: PersonalizacaoPublica
    servicos: Servico[]
    /** Hash pseudonimizado do tenant para analytics (calculado no servidor). */
    tenantHash: string
}

/**
 * Fluxo público de agendamento em etapas de tela cheia (mobile-first): serviço →
 * data/hora → contato → sucesso. Tocar seleciona; o CTA da barra inferior avança.
 */
export default function BookingApp({
    perfil,
    personalizacao,
    servicos,
    tenantHash,
}: BookingAppProps) {
    const [etapa, setEtapa] = useState<EtapaBooking>('servico')
    // Funil: booking_started dispara uma única vez, na primeira interação real.
    const bookingIniciado = useRef(false)
    // Evita roubar o foco no carregamento inicial — só foca o título após navegação.
    const [jaNavegou, setJaNavegou] = useState(false)

    const [servicoSelecionado, setServicoSelecionado] = useState<Servico | null>(null)
    const [dataEscolhidaPeloCliente, setDataEscolhidaPeloCliente] = useState('')
    const [slotSelecionado, setSlotSelecionado] = useState<Slot | null>(null)

    const [slots, setSlots] = useState<Slot[]>([])
    const [carregandoSlots, setCarregandoSlots] = useState(false)
    const [erroSlots, setErroSlots] = useState<string | null>(null)
    const [tentativaSlots, setTentativaSlots] = useState(0)

    const [agendamentoCriado, setAgendamentoCriado] = useState<{
        id: string
        data_hora: string
    } | null>(null)

    const timezone = perfil.timezone || TIMEZONE_PADRAO
    const acento = classesAcento(Boolean(personalizacao.corMarca))

    // Dias de hoje até hoje + horizonte (inclusive), no fuso do estabelecimento —
    // mesma semântica de "N dias à frente" aceita pela engine (obterSlotsDisponiveis).
    // Rótulos derivados da data de calendário (meio-dia UTC) — não dependem do fuso
    // do navegador do cliente.
    const datasDisponiveis = useMemo<DataDisponivel[]>(() => {
        const hojeStr = diaLocal(new Date(), timezone)
        const horizonte = perfil.horizonte_maximo_dias ?? 14
        const datas: DataDisponivel[] = []
        for (let i = 0; i <= horizonte; i++) {
            const dateStr = somarDias(hojeStr, i)
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
        return datas
    }, [timezone, perfil.horizonte_maximo_dias])

    // Sem escolha explícita do cliente, vale o primeiro dia do horizonte.
    const dataSelecionada = dataEscolhidaPeloCliente || (datasDisponiveis[0]?.dateStr ?? '')

    // Busca slots quando muda o serviço, a data selecionada ou o "tentar de novo"
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
            } catch (err) {
                if (isMounted) {
                    setErroSlots(
                        err instanceof Error
                            ? err.message
                            : 'Erro ao carregar horários disponíveis.',
                    )
                }
            } finally {
                if (isMounted) setCarregandoSlots(false)
            }
        }

        buscarSlots()

        return () => {
            isMounted = false
        }
    }, [servicoSelecionado, dataSelecionada, perfil.tenant_id, tentativaSlots])

    const mudarEtapa = (nova: EtapaBooking) => {
        setJaNavegou(true)
        setEtapa(nova)
    }

    const selecionarServico = (servico: Servico) => {
        if (!bookingIniciado.current) {
            bookingIniciado.current = true
            capturarEvento('booking_started', { tenant: tenantHash })
        }
        if (servicoSelecionado?.id !== servico.id) {
            setSlotSelecionado(null)
        }
        setServicoSelecionado(servico)
    }

    const selecionarData = (dateStr: string) => {
        setDataEscolhidaPeloCliente(dateStr)
        setSlotSelecionado(null)
    }

    const avancar = () => {
        if (etapa === 'servico' && servicoSelecionado) {
            mudarEtapa('data_hora')
        } else if (etapa === 'data_hora' && slotSelecionado) {
            mudarEtapa('contato')
        }
    }

    const voltar = () => {
        if (etapa === 'data_hora') {
            mudarEtapa('servico')
        } else if (etapa === 'contato') {
            mudarEtapa('data_hora')
        }
    }

    // Submit da etapa de contato: valida, chama a action pública (contrato intacto)
    // e devolve a mensagem de erro para render com role="alert". O CTA fica na
    // barra inferior (<button form="form-contato">) — pending vem do useActionState.
    const [erroEnvio, enviarAction, enviando] = useActionState(
        async (_anterior: string | null, formData: FormData): Promise<string | null> => {
            if (!servicoSelecionado || !slotSelecionado) {
                return 'Escolha o serviço e o horário antes de confirmar.'
            }
            const nome = String(formData.get('nome') ?? '').trim()
            const telefoneLimpo = String(formData.get('telefone') ?? '').replace(/\D/g, '')
            if (!nome) {
                return 'Informe seu nome.'
            }
            if (telefoneLimpo.length < 10 || telefoneLimpo.length > 11) {
                return 'Informe o WhatsApp com DDD (10 ou 11 dígitos).'
            }
            try {
                const res = await criarAgendamentoPublico({
                    tenantId: perfil.tenant_id,
                    servicoId: servicoSelecionado.id,
                    dataHora: slotSelecionado.datetime,
                    clienteNome: nome,
                    clienteTelefone: telefoneLimpo,
                })
                setAgendamentoCriado(res)
                mudarEtapa('sucesso')
                return null
            } catch (err) {
                return err instanceof Error
                    ? err.message
                    : 'Não foi possível confirmar o agendamento. Tente outro horário.'
            }
        },
        null,
    )

    const agendarOutro = () => {
        setServicoSelecionado(null)
        setSlotSelecionado(null)
        setAgendamentoCriado(null)
        setDataEscolhidaPeloCliente('')
        mudarEtapa('servico')
    }

    // Rótulo curto da data escolhida para a barra-resumo (ex.: "sáb 19/07")
    const dataEscolhida = datasDisponiveis.find((d) => d.dateStr === dataSelecionada)
    const dataCurta =
        slotSelecionado && dataEscolhida
            ? `${dataEscolhida.diaSemana} ${dataEscolhida.label}`
            : null

    return (
        <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col sm:border-x sm:border-fio">
            {etapa !== 'sucesso' && (
                <CabecalhoEstabelecimento
                    nome={perfil.nome_estabelecimento}
                    descricao={perfil.descricao}
                    instagram={perfil.instagram}
                    endereco={perfil.endereco}
                    logoUrl={personalizacao.logoUrl}
                    capaUrl={personalizacao.capaUrl}
                    etapa={etapa}
                    onVoltar={voltar}
                    acento={acento}
                />
            )}

            <main className="flex-1 px-5 pb-40 pt-5">
                {etapa === 'servico' && (
                    <EtapaServico
                        servicos={servicos}
                        servicoSelecionado={servicoSelecionado}
                        onSelecionar={selecionarServico}
                        acento={acento}
                        autoFoco={jaNavegou}
                    />
                )}

                {etapa === 'data_hora' && (
                    <EtapaDataHora
                        datas={datasDisponiveis}
                        dataSelecionada={dataSelecionada}
                        onSelecionarData={selecionarData}
                        slots={slots}
                        carregando={carregandoSlots}
                        erro={erroSlots}
                        onTentarDeNovo={() => setTentativaSlots((t) => t + 1)}
                        slotSelecionado={slotSelecionado}
                        onSelecionarSlot={setSlotSelecionado}
                        acento={acento}
                        autoFoco={jaNavegou}
                    />
                )}

                {etapa === 'contato' && (
                    <EtapaContato formAction={enviarAction} erro={erroEnvio} autoFoco={jaNavegou} />
                )}

                {etapa === 'sucesso' && agendamentoCriado && (
                    <EtapaSucesso
                        nomeEstabelecimento={perfil.nome_estabelecimento}
                        servicoNome={servicoSelecionado?.nome ?? ''}
                        dataHoraLonga={formatarDataHoraLonga(agendamentoCriado.data_hora, timezone)}
                        endereco={perfil.endereco}
                        instagram={perfil.instagram}
                        onAgendarOutro={agendarOutro}
                    />
                )}
            </main>

            {etapa !== 'sucesso' && (
                <BarraInferior
                    etapa={etapa}
                    servico={servicoSelecionado}
                    dataCurta={dataCurta}
                    horaCurta={slotSelecionado?.time ?? null}
                    enviando={enviando}
                    podeAvancar={
                        etapa === 'servico' ? Boolean(servicoSelecionado) : Boolean(slotSelecionado)
                    }
                    onAvancar={avancar}
                    acento={acento}
                />
            )}
        </div>
    )
}
