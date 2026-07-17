'use client'

import { useActionState, useEffect, useMemo, useRef, useState } from 'react'
import { obterSlotsPublicos, criarAgendamentoPublico } from '@/app/actions/public-booking'
import { diaLocal, somarDias, formatarDataHoraLonga, TIMEZONE_PADRAO } from '@/lib/timezone'
import { capturarEvento } from '@/lib/analytics/client'
import LuzAmbiente from '@/app/LuzAmbiente'
import { classesAcento } from './acento'
import { ORDEM_ETAPAS } from './passos'
import CabecalhoEstabelecimento from './CabecalhoEstabelecimento'
import PainelMarca from './PainelMarca'
import RodapeAcaoDesktop from './RodapeAcaoDesktop'
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
    // Sentido da última navegação — anima o slide direcional no desktop (a
    // <section> de cada etapa continua com .aparecer-rapido no mobile).
    const [direcao, setDirecao] = useState<'avancar' | 'voltar'>('avancar')
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

    // Contato vive aqui (não na etapa): voltar para conferir o horário não pode
    // apagar o que o cliente já digitou — Fricção Zero.
    const [nome, setNome] = useState('')
    const [telefone, setTelefone] = useState('')

    // Erros do submit são estado próprio (não o retorno do useActionState) para
    // poderem ser limpos ao trocar de slot/etapa — sem erro fantasma no remount.
    const [erroEnvio, setErroEnvio] = useState<string | null>(null)
    // Aviso exibido na etapa de data/hora quando o slot escolhido foi tomado.
    const [avisoDataHora, setAvisoDataHora] = useState<string | null>(null)

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
        setAvisoDataHora(null)
    }

    const selecionarSlot = (slot: Slot) => {
        setSlotSelecionado(slot)
        setAvisoDataHora(null)
        setErroEnvio(null)
    }

    const avancar = () => {
        if (etapa === 'servico' && servicoSelecionado) {
            setDirecao('avancar')
            mudarEtapa('data_hora')
        } else if (etapa === 'data_hora' && slotSelecionado) {
            setDirecao('avancar')
            mudarEtapa('contato')
        }
    }

    const voltar = () => {
        if (etapa === 'data_hora') {
            setDirecao('voltar')
            mudarEtapa('servico')
        } else if (etapa === 'contato') {
            setErroEnvio(null)
            setDirecao('voltar')
            mudarEtapa('data_hora')
        }
    }

    // Navegação direta pelo stepper vertical do desktop: só retrocede (nunca
    // pula para uma etapa futura ainda não preenchida) — generaliza `voltar()`
    // para saltos de mais de um passo (ex.: contato → serviço).
    const irParaEtapa = (alvo: EtapaBooking) => {
        if (alvo === 'sucesso') return
        if (etapa === 'sucesso') return
        const indiceAlvo = ORDEM_ETAPAS.indexOf(alvo)
        const indiceAtual = ORDEM_ETAPAS.indexOf(etapa)
        if (indiceAlvo === -1 || indiceAlvo >= indiceAtual) return
        if (etapa === 'contato') setErroEnvio(null)
        setDirecao('voltar')
        mudarEtapa(alvo)
    }

    // Submit da etapa de contato: valida e chama a action pública (contrato intacto).
    // O CTA fica na barra inferior (<button form="form-contato">) — pending vem do
    // useActionState; o erro vai para `erroEnvio` (estado limpável). Slot tomado por
    // outro cliente (double-booking) volta para data/hora com a grade refeita.
    const [, enviarAction, enviando] = useActionState(
        async (_anterior: null, formData: FormData): Promise<null> => {
            setErroEnvio(null)
            if (!servicoSelecionado || !slotSelecionado) {
                setErroEnvio('Escolha o serviço e o horário antes de confirmar.')
                return null
            }
            const nomeInformado = String(formData.get('nome') ?? '').trim()
            const telefoneLimpo = String(formData.get('telefone') ?? '').replace(/\D/g, '')
            if (!nomeInformado) {
                setErroEnvio('Informe seu nome.')
                return null
            }
            if (telefoneLimpo.length < 10 || telefoneLimpo.length > 11) {
                setErroEnvio('Informe o WhatsApp com DDD (10 ou 11 dígitos).')
                return null
            }
            try {
                const res = await criarAgendamentoPublico({
                    tenantId: perfil.tenant_id,
                    servicoId: servicoSelecionado.id,
                    dataHora: slotSelecionado.datetime,
                    clienteNome: nomeInformado,
                    clienteTelefone: telefoneLimpo,
                })
                setAgendamentoCriado(res)
                mudarEtapa('sucesso')
            } catch (err) {
                const mensagem =
                    err instanceof Error
                        ? err.message
                        : 'Não foi possível confirmar o agendamento. Tente outro horário.'
                if (mensagem.includes('já foi preenchido')) {
                    // Recuperação de double-booking: solta o slot morto, refaz a
                    // grade e leva o cliente direto para escolher outro horário.
                    setSlotSelecionado(null)
                    setTentativaSlots((t) => t + 1)
                    setAvisoDataHora(mensagem)
                    setDirecao('voltar')
                    mudarEtapa('data_hora')
                } else {
                    setErroEnvio(mensagem)
                }
            }
            return null
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

    const ehSucesso = etapa === 'sucesso'

    return (
        <div className="lg:flex lg:h-dvh lg:overflow-hidden">
            <LuzAmbiente />

            {!ehSucesso && (
                <PainelMarca
                    className="relative z-10 hidden lg:flex lg:h-full lg:min-h-0 lg:w-[22rem] lg:shrink-0 lg:flex-col lg:overflow-y-auto lg:border-r lg:border-fio xl:w-[26rem]"
                    nome={perfil.nome_estabelecimento}
                    descricao={perfil.descricao}
                    instagram={perfil.instagram}
                    endereco={perfil.endereco}
                    logoUrl={personalizacao.logoUrl}
                    capaUrl={personalizacao.capaUrl}
                    acento={acento}
                    temCor={Boolean(personalizacao.corMarca)}
                    etapa={etapa}
                    servico={servicoSelecionado}
                    dataCurta={dataCurta}
                    horaCurta={slotSelecionado?.time ?? null}
                    onIrParaEtapa={irParaEtapa}
                />
            )}

            <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-md flex-col sm:max-w-lg sm:border-x sm:border-fio md:max-w-xl lg:mx-0 lg:min-h-0 lg:max-w-none lg:flex-1 lg:overflow-hidden lg:border-x-0">
                {!ehSucesso && (
                    <CabecalhoEstabelecimento
                        className="lg:hidden"
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

                <main className="flex-1 px-5 pb-40 pt-5 sm:px-8 md:px-10 lg:min-h-0 lg:overflow-y-auto lg:px-0 lg:pb-0 lg:pt-0">
                    <div className="lg:mx-auto lg:max-w-2xl lg:px-10 lg:py-10">
                        <div
                            key={etapa}
                            className={
                                direcao === 'voltar'
                                    ? 'desliza-passo-voltar'
                                    : 'desliza-passo-avancar'
                            }
                        >
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
                                    aviso={avisoDataHora}
                                    slotSelecionado={slotSelecionado}
                                    onSelecionarSlot={selecionarSlot}
                                    acento={acento}
                                    autoFoco={jaNavegou}
                                />
                            )}

                            {etapa === 'contato' && (
                                <EtapaContato
                                    formAction={enviarAction}
                                    erro={erroEnvio}
                                    nome={nome}
                                    onNomeChange={setNome}
                                    telefone={telefone}
                                    onTelefoneChange={setTelefone}
                                    autoFoco={jaNavegou}
                                />
                            )}

                            {ehSucesso && agendamentoCriado && (
                                <EtapaSucesso
                                    nomeEstabelecimento={perfil.nome_estabelecimento}
                                    servicoNome={servicoSelecionado?.nome ?? ''}
                                    dataHoraLonga={formatarDataHoraLonga(
                                        agendamentoCriado.data_hora,
                                        timezone,
                                    )}
                                    endereco={perfil.endereco}
                                    instagram={perfil.instagram}
                                    onAgendarOutro={agendarOutro}
                                />
                            )}
                        </div>
                    </div>
                </main>

                {!ehSucesso && (
                    <BarraInferior
                        className="lg:hidden"
                        etapa={etapa}
                        servico={servicoSelecionado}
                        dataCurta={dataCurta}
                        horaCurta={slotSelecionado?.time ?? null}
                        enviando={enviando}
                        podeAvancar={
                            etapa === 'servico'
                                ? Boolean(servicoSelecionado)
                                : Boolean(slotSelecionado)
                        }
                        onAvancar={avancar}
                        acento={acento}
                    />
                )}

                {!ehSucesso && (
                    <RodapeAcaoDesktop
                        className="hidden lg:flex lg:shrink-0"
                        etapa={etapa}
                        enviando={enviando}
                        podeAvancar={
                            etapa === 'servico'
                                ? Boolean(servicoSelecionado)
                                : Boolean(slotSelecionado)
                        }
                        onAvancar={avancar}
                        onVoltar={etapa === 'servico' ? undefined : voltar}
                        acento={acento}
                    />
                )}
            </div>
        </div>
    )
}
