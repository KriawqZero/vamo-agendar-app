'use client'

import React, { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useOrganization } from '@clerk/nextjs'
import { salvarPerfilEmpresa } from '@/app/actions/perfis-empresas'
import {
    salvarHorariosFuncionamento,
    salvarExcecaoAgenda,
    excluirExcecaoAgenda,
} from '@/app/actions/agenda'
import { validarJanelasFuncionamento } from '@/lib/horarios'
import { TIMEZONES_BRASIL, TIMEZONE_PADRAO } from '@/lib/timezone'

interface PerfilEmpresa {
    tenant_id: string
    slug: string
    slug_gratuito: string
    nome_estabelecimento: string
    descricao: string | null
    telefone_contato: string | null
    cor_marca: string | null
    logo_url: string | null
    exibir_logo: boolean
    timezone: string
    antecedencia_minima_minutos: number
    horizonte_maximo_dias: number
}

interface HorarioFuncionamento {
    id: string
    dia_semana: number
    hora_inicio: string
    hora_fim: string
    ativo: boolean
}

interface ExcecaoAgenda {
    id: string
    data: string
    hora_inicio: string | null
    hora_fim: string | null
    bloqueado: boolean
    motivo: string | null
}

interface RecursosPlano {
    linkPersonalizado: boolean
    corPersonalizada: boolean
    logoPersonalizado: boolean
}

interface AgendaClientProps {
    perfilEmpresa: PerfilEmpresa | null
    horariosFuncionamento: HorarioFuncionamento[]
    excecoesAgenda: ExcecaoAgenda[]
    recursosPlano: RecursosPlano
}

function SeloPlano({ plano }: { plano: 'Plus' | 'Pro' }) {
    return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
            🔒 {plano}
        </span>
    )
}

const DIAS_SEMANA = [
    'Domingo',
    'Segunda-feira',
    'Terça-feira',
    'Quarta-feira',
    'Quinta-feira',
    'Sexta-feira',
    'Sábado',
]

const MAX_JANELAS_POR_DIA = 3

interface Janela {
    hora_inicio: string
    hora_fim: string
}

interface DiaHorario {
    ativo: boolean
    janelas: Janela[]
}

const ANTECEDENCIA_OPCOES = [
    { valor: 15, rotulo: '15 min' },
    { valor: 30, rotulo: '30 min' },
    { valor: 60, rotulo: '1 h' },
    { valor: 120, rotulo: '2 h' },
    { valor: 240, rotulo: '4 h' },
    { valor: 720, rotulo: '12 h' },
    { valor: 1440, rotulo: '24 h' },
]

const HORIZONTE_OPCOES = [
    { valor: 7, rotulo: '7 dias' },
    { valor: 14, rotulo: '14 dias' },
    { valor: 30, rotulo: '30 dias' },
    { valor: 60, rotulo: '60 dias' },
    { valor: 90, rotulo: '90 dias' },
]

// Sugere o horário da próxima janela ao clicar em "adicionar janela" (começa
// onde a anterior termina, dura 1h), sem nunca passar de 23:59.
function somarMinutos(hora: string, minutos: number): string {
    const [h, m] = hora.split(':').map(Number)
    const total = Math.min(h * 60 + m + minutos, 23 * 60 + 59)
    const hh = String(Math.floor(total / 60)).padStart(2, '0')
    const mm = String(total % 60).padStart(2, '0')
    return `${hh}:${mm}`
}

function mensagemDeErro(err: unknown, padrao: string): string {
    return err instanceof Error ? err.message : padrao
}

export default function AgendaClient({
    perfilEmpresa,
    horariosFuncionamento,
    excecoesAgenda,
    recursosPlano,
}: AgendaClientProps) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [abaAtiva, setAbaAtiva] = useState<'perfil' | 'horarios' | 'excecoes'>('perfil')

    // Estado do Perfil
    const [slug, setSlug] = useState(perfilEmpresa?.slug || '')
    const [nomeEstabelecimento, setNomeEstabelecimento] = useState(
        perfilEmpresa?.nome_estabelecimento || '',
    )
    const [descricao, setDescricao] = useState(perfilEmpresa?.descricao || '')
    const [telefoneContato, setTelefoneContato] = useState(perfilEmpresa?.telefone_contato || '')
    const [corMarca, setCorMarca] = useState<string | null>(perfilEmpresa?.cor_marca ?? null)
    const [exibirLogo, setExibirLogo] = useState<boolean>(perfilEmpresa?.exibir_logo ?? true)
    const [timezone, setTimezone] = useState<string>(perfilEmpresa?.timezone || TIMEZONE_PADRAO)
    const [msgPerfil, setMsgPerfil] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(
        null,
    )
    // Logo é o da organização no Clerk (sincronizado pelo servidor ao salvar) — aqui só exibimos o preview
    const { organization } = useOrganization()

    // Estado dos Horários Comerciais
    // Modelo por dia: { ativo, janelas[] } — a lista chata de N linhas por dia
    // vinda do banco é agrupada por dia_semana; dias sem nenhuma linha nascem
    // com uma janela padrão 08:00–18:00 e inativos (comportamento anterior
    // preservado). `ativo` é uma propriedade do DIA, replicada em todas as
    // janelas na hora de montar a lista chata para a action.
    const inicializarHorariosPorDia = (): DiaHorario[] => {
        const porDia = new Map<number, HorarioFuncionamento[]>()
        for (const h of horariosFuncionamento) {
            const lista = porDia.get(h.dia_semana) ?? []
            lista.push(h)
            porDia.set(h.dia_semana, lista)
        }
        return Array.from({ length: 7 }, (_, i) => {
            const linhas = porDia.get(i)
            if (!linhas || linhas.length === 0) {
                return {
                    ativo: i !== 0 && i !== 6, // Padrão ativo dias de semana, inativo fds
                    janelas: [{ hora_inicio: '08:00', hora_fim: '18:00' }],
                }
            }
            return {
                ativo: linhas[0].ativo,
                janelas: linhas.map((l) => ({
                    hora_inicio: l.hora_inicio.slice(0, 5),
                    hora_fim: l.hora_fim.slice(0, 5),
                })),
            }
        })
    }
    const [horariosPorDia, setHorariosPorDia] = useState<DiaHorario[]>(inicializarHorariosPorDia())
    const [msgHorarios, setMsgHorarios] = useState<{
        tipo: 'sucesso' | 'erro'
        texto: string
    } | null>(null)

    // Regras de agendamento do booking público
    const [antecedenciaMinimaMinutos, setAntecedenciaMinimaMinutos] = useState<number>(
        perfilEmpresa?.antecedencia_minima_minutos ?? 15,
    )
    const [horizonteMaximoDias, setHorizonteMaximoDias] = useState<number>(
        perfilEmpresa?.horizonte_maximo_dias ?? 14,
    )

    // Lista chata (dia_semana + janela) usada tanto para validar quanto para
    // gravar — dia_semana é o índice do array de horariosPorDia.
    const horariosFlat = useMemo(
        () =>
            horariosPorDia.flatMap((dia, index) =>
                dia.janelas.map((janela) => ({
                    dia_semana: index,
                    hora_inicio: janela.hora_inicio,
                    hora_fim: janela.hora_fim,
                    ativo: dia.ativo,
                })),
            ),
        [horariosPorDia],
    )
    // Única fonte de verdade da validação visual — mesma função pura usada pela action.
    const erroValidacaoHorarios = useMemo(
        () => validarJanelasFuncionamento(horariosFlat),
        [horariosFlat],
    )

    // Opções dos selects de configuração — se o valor vindo do banco não está
    // na lista padrão (ex.: 45 min de antecedência), inclui uma opção extra
    // com esse valor para não sobrescrever silenciosamente ao salvar.
    const opcoesAntecedencia = useMemo(() => {
        if (ANTECEDENCIA_OPCOES.some((o) => o.valor === antecedenciaMinimaMinutos)) {
            return ANTECEDENCIA_OPCOES
        }
        return [
            ...ANTECEDENCIA_OPCOES,
            {
                valor: antecedenciaMinimaMinutos,
                rotulo: `${antecedenciaMinimaMinutos} min (atual)`,
            },
        ].sort((a, b) => a.valor - b.valor)
    }, [antecedenciaMinimaMinutos])
    const opcoesHorizonte = useMemo(() => {
        if (HORIZONTE_OPCOES.some((o) => o.valor === horizonteMaximoDias)) {
            return HORIZONTE_OPCOES
        }
        return [
            ...HORIZONTE_OPCOES,
            { valor: horizonteMaximoDias, rotulo: `${horizonteMaximoDias} dias (atual)` },
        ].sort((a, b) => a.valor - b.valor)
    }, [horizonteMaximoDias])

    // Manipuladores do estado por dia/janela
    const atualizarDiaAtivo = (diaIndex: number, ativo: boolean) => {
        setHorariosPorDia((prev) => prev.map((d, i) => (i === diaIndex ? { ...d, ativo } : d)))
    }

    const atualizarJanela = (
        diaIndex: number,
        janelaIndex: number,
        campo: 'hora_inicio' | 'hora_fim',
        valor: string,
    ) => {
        setHorariosPorDia((prev) =>
            prev.map((d, i) =>
                i !== diaIndex
                    ? d
                    : {
                          ...d,
                          janelas: d.janelas.map((j, ji) =>
                              ji === janelaIndex ? { ...j, [campo]: valor } : j,
                          ),
                      },
            ),
        )
    }

    const adicionarJanela = (diaIndex: number) => {
        setHorariosPorDia((prev) =>
            prev.map((d, i) => {
                if (i !== diaIndex || d.janelas.length >= MAX_JANELAS_POR_DIA) return d
                const ultima = d.janelas[d.janelas.length - 1]
                const novaJanela = ultima
                    ? { hora_inicio: ultima.hora_fim, hora_fim: somarMinutos(ultima.hora_fim, 60) }
                    : { hora_inicio: '08:00', hora_fim: '18:00' }
                return { ...d, janelas: [...d.janelas, novaJanela] }
            }),
        )
    }

    const removerJanela = (diaIndex: number, janelaIndex: number) => {
        setHorariosPorDia((prev) =>
            prev.map((d, i) => {
                if (i !== diaIndex || d.janelas.length <= 1) return d
                return { ...d, janelas: d.janelas.filter((_, ji) => ji !== janelaIndex) }
            }),
        )
    }

    // Estado das Exceções / Bloqueios
    const [excData, setExcData] = useState('')
    const [excHoraInicio, setExcHoraInicio] = useState('')
    const [excHoraFim, setExcHoraFim] = useState('')
    const [excDiaInteiro, setExcDiaInteiro] = useState(true)
    const [excMotivo, setExcMotivo] = useState('')
    const [msgExcecoes, setMsgExcecoes] = useState<{
        tipo: 'sucesso' | 'erro'
        texto: string
    } | null>(null)

    // Manipuladores de Ação

    const handleSalvarPerfil = async (e: React.FormEvent) => {
        e.preventDefault()
        setMsgPerfil(null)

        startTransition(async () => {
            try {
                const res = await salvarPerfilEmpresa({
                    slug,
                    nomeEstabelecimento,
                    descricao,
                    telefoneContato,
                    corMarca,
                    exibirLogo,
                    timezone,
                })
                setMsgPerfil({ tipo: 'sucesso', texto: 'Perfil salvo com sucesso!' })
                // Atualiza o slug local com a versão higienizada retornada do banco
                setSlug(res.slug)
                router.refresh()
            } catch (err) {
                setMsgPerfil({ tipo: 'erro', texto: mensagemDeErro(err, 'Erro ao salvar perfil') })
            }
        })
    }

    const handleSalvarHorarios = async (e: React.FormEvent) => {
        e.preventDefault()
        setMsgHorarios(null)

        if (erroValidacaoHorarios) {
            setMsgHorarios({ tipo: 'erro', texto: erroValidacaoHorarios })
            return
        }

        // As configs de agendamento vivem na action de perfil — só chamamos se
        // o profissional realmente mudou algum dos dois valores nesta sessão.
        const antecedenciaAtual = perfilEmpresa?.antecedencia_minima_minutos ?? 15
        const horizonteAtual = perfilEmpresa?.horizonte_maximo_dias ?? 14
        const configsAlteradas =
            antecedenciaMinimaMinutos !== antecedenciaAtual ||
            horizonteMaximoDias !== horizonteAtual

        startTransition(async () => {
            try {
                await salvarHorariosFuncionamento(horariosFlat)
            } catch (err) {
                setMsgHorarios({
                    tipo: 'erro',
                    texto: mensagemDeErro(err, 'Erro ao salvar horários'),
                })
                return
            }

            if (configsAlteradas) {
                try {
                    // Campos que não pertencem a esta aba vêm do perfil PERSISTIDO
                    // (prop), nunca do estado local da aba Perfil — senão, editar
                    // Perfil sem salvar e depois só mexer nas regras de agendamento
                    // aqui publicaria essas edições em aberto silenciosamente.
                    await salvarPerfilEmpresa({
                        slug: perfilEmpresa?.slug || '',
                        nomeEstabelecimento: perfilEmpresa?.nome_estabelecimento || '',
                        descricao: perfilEmpresa?.descricao || '',
                        telefoneContato: perfilEmpresa?.telefone_contato || '',
                        corMarca: perfilEmpresa?.cor_marca ?? null,
                        exibirLogo: perfilEmpresa?.exibir_logo ?? true,
                        timezone: perfilEmpresa?.timezone || TIMEZONE_PADRAO,
                        antecedenciaMinimaMinutos,
                        horizonteMaximoDias,
                    })
                } catch (err) {
                    // Horários já foram gravados nesta chamada — não mascarar o
                    // sucesso parcial como se nada tivesse sido salvo.
                    setMsgHorarios({
                        tipo: 'erro',
                        texto: `Horários salvos, mas as regras de agendamento não foram salvas: ${mensagemDeErro(err, 'erro ao salvar configurações')}`,
                    })
                    router.refresh()
                    return
                }
            }

            setMsgHorarios({ tipo: 'sucesso', texto: 'Horários salvos com sucesso!' })
            router.refresh()
        })
    }

    const handleCriarExcecao = async (e: React.FormEvent) => {
        e.preventDefault()
        setMsgExcecoes(null)

        if (!excData) {
            setMsgExcecoes({ tipo: 'erro', texto: 'A data do bloqueio é obrigatória.' })
            return
        }

        const horaInicioStr = excDiaInteiro ? null : excHoraInicio || null
        const horaFimStr = excDiaInteiro ? null : excHoraFim || null

        if (!excDiaInteiro && (!horaInicioStr || !horaFimStr)) {
            setMsgExcecoes({
                tipo: 'erro',
                texto: 'Para bloqueios parciais, informe hora de início e fim.',
            })
            return
        }

        startTransition(async () => {
            try {
                await salvarExcecaoAgenda({
                    data: excData,
                    hora_inicio: horaInicioStr,
                    hora_fim: horaFimStr,
                    bloqueado: true,
                    motivo: excMotivo,
                })
                setMsgExcecoes({ tipo: 'sucesso', texto: 'Bloqueio adicionado com sucesso!' })
                // Reseta formulário
                setExcData('')
                setExcHoraInicio('')
                setExcHoraFim('')
                setExcDiaInteiro(true)
                setExcMotivo('')
                router.refresh()
            } catch (err) {
                setMsgExcecoes({
                    tipo: 'erro',
                    texto: mensagemDeErro(err, 'Erro ao criar bloqueio'),
                })
            }
        })
    }

    const handleExcluirExcecao = async (id: string) => {
        if (!confirm('Deseja remover este bloqueio da agenda?')) return

        startTransition(async () => {
            try {
                await excluirExcecaoAgenda(id)
                router.refresh()
            } catch (err) {
                alert(mensagemDeErro(err, 'Erro ao excluir bloqueio'))
            }
        })
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Configurar Agenda</h1>
                <p className="text-zinc-500 dark:text-zinc-400 text-sm">
                    Configure os dados do seu estabelecimento, horários comerciais e bloqueios
                    temporários.
                </p>
            </div>

            {/* Abas */}
            <div className="border-b border-zinc-200 dark:border-zinc-800 flex gap-4 overflow-x-auto">
                <button
                    onClick={() => setAbaAtiva('perfil')}
                    className={`pb-3 text-sm font-semibold border-b-2 transition-all cursor-pointer shrink-0 ${
                        abaAtiva === 'perfil'
                            ? 'border-zinc-900 dark:border-zinc-50 text-zinc-900 dark:text-zinc-50'
                            : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                    }`}
                >
                    Perfil da Empresa
                </button>
                <button
                    onClick={() => setAbaAtiva('horarios')}
                    className={`pb-3 text-sm font-semibold border-b-2 transition-all cursor-pointer shrink-0 ${
                        abaAtiva === 'horarios'
                            ? 'border-zinc-900 dark:border-zinc-50 text-zinc-900 dark:text-zinc-50'
                            : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                    }`}
                >
                    Horários Comerciais
                </button>
                <button
                    onClick={() => setAbaAtiva('excecoes')}
                    className={`pb-3 text-sm font-semibold border-b-2 transition-all cursor-pointer shrink-0 ${
                        abaAtiva === 'excecoes'
                            ? 'border-zinc-900 dark:border-zinc-50 text-zinc-900 dark:text-zinc-50'
                            : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                    }`}
                >
                    Bloqueios e Exceções
                </button>
            </div>

            {/* ABA: PERFIL */}
            {abaAtiva === 'perfil' && (
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-xs max-w-2xl">
                    <h2 className="text-base font-bold mb-4">Informações do Estabelecimento</h2>

                    <form onSubmit={handleSalvarPerfil} className="space-y-4">
                        {msgPerfil && (
                            <div
                                className={`p-3 text-xs font-semibold border rounded-lg ${
                                    msgPerfil.tipo === 'sucesso'
                                        ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900'
                                        : 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900'
                                }`}
                            >
                                {msgPerfil.texto}
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-xs font-bold uppercase text-zinc-400 block">
                                    Nome do Estabelecimento
                                </label>
                                <input
                                    type="text"
                                    value={nomeEstabelecimento}
                                    onChange={(e) => setNomeEstabelecimento(e.target.value)}
                                    placeholder="Ex: Barbearia Clássica"
                                    className="w-full px-3.5 py-2 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-900 outline-hidden text-zinc-900 dark:text-zinc-50"
                                    required
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="flex items-center gap-2 text-xs font-bold uppercase text-zinc-400">
                                    Link de Agendamento (Slug){' '}
                                    {!recursosPlano.linkPersonalizado && <SeloPlano plano="Plus" />}
                                </label>
                                <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 overflow-hidden text-sm">
                                    <span className="bg-zinc-100 dark:bg-zinc-800 px-3 py-2 text-zinc-500 font-mono text-xs flex items-center border-r border-zinc-200 dark:border-zinc-800">
                                        /book/
                                    </span>
                                    <input
                                        type="text"
                                        value={slug}
                                        onChange={(e) => setSlug(e.target.value)}
                                        placeholder={
                                            recursosPlano.linkPersonalizado
                                                ? 'barbearia-classica'
                                                : 'gerado automaticamente'
                                        }
                                        disabled={!recursosPlano.linkPersonalizado}
                                        className="w-full px-3.5 py-2 bg-transparent outline-hidden text-zinc-900 dark:text-zinc-50 font-mono text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                                        required
                                    />
                                </div>
                                {!recursosPlano.linkPersonalizado && (
                                    <p className="text-xs text-zinc-500 mt-1">
                                        Personalize seu link no plano Plus.{' '}
                                        <a
                                            href="/dashboard/plano"
                                            className="font-bold underline underline-offset-2"
                                        >
                                            Ver planos
                                        </a>
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                    Cor da marca{' '}
                                    {!recursosPlano.corPersonalizada && <SeloPlano plano="Plus" />}
                                </label>
                                <input
                                    type="color"
                                    value={corMarca || '#18181b'}
                                    onChange={(e) => setCorMarca(e.target.value)}
                                    disabled={!recursosPlano.corPersonalizada}
                                    className="h-10 w-20 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed"
                                />
                                <p className="text-xs text-zinc-500 mt-1">
                                    Cor de destaque da sua página pública (em breve).
                                </p>
                            </div>

                            <div>
                                <label className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                    Logo{' '}
                                    {!recursosPlano.logoPersonalizado && <SeloPlano plano="Pro" />}
                                </label>
                                <div className="flex items-center gap-3">
                                    {organization?.hasImage ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={organization.imageUrl}
                                            alt="Logo da organização"
                                            className={`h-10 w-10 rounded-lg border border-zinc-200 dark:border-zinc-700 object-cover ${!recursosPlano.logoPersonalizado ? 'opacity-50 grayscale' : ''}`}
                                        />
                                    ) : (
                                        <div className="h-10 w-10 shrink-0 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 flex items-center justify-center text-zinc-400 text-lg">
                                            ?
                                        </div>
                                    )}
                                    <p className="text-xs text-zinc-500">
                                        {recursosPlano.logoPersonalizado
                                            ? 'Usamos o logo da sua organização (ajuste no seletor da barra lateral). Ele aparecerá na sua página pública (em breve).'
                                            : 'Exiba o logo da sua organização na página pública com o plano Pro.'}
                                    </p>
                                </div>
                                <label
                                    className={`mt-2 flex items-center gap-2 text-xs font-medium ${recursosPlano.logoPersonalizado ? 'text-zinc-700 dark:text-zinc-300 cursor-pointer' : 'text-zinc-400 dark:text-zinc-600 cursor-not-allowed'}`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={exibirLogo}
                                        onChange={(e) => setExibirLogo(e.target.checked)}
                                        disabled={!recursosPlano.logoPersonalizado}
                                        className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700 accent-zinc-900 dark:accent-zinc-100 disabled:cursor-not-allowed"
                                    />
                                    Exibir o logo na página pública
                                </label>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-xs font-bold uppercase text-zinc-400 block">
                                    WhatsApp de Contato público
                                </label>
                                <input
                                    type="text"
                                    value={telefoneContato}
                                    onChange={(e) => setTelefoneContato(e.target.value)}
                                    placeholder="DDD + Telefone (ex: 11999999999)"
                                    className="w-full px-3.5 py-2 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-900 outline-hidden text-zinc-900 dark:text-zinc-50"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-bold uppercase text-zinc-400 block">
                                    Fuso horário
                                </label>
                                <select
                                    value={timezone}
                                    onChange={(e) => setTimezone(e.target.value)}
                                    className="w-full px-3.5 py-2 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-900 outline-hidden text-zinc-900 dark:text-zinc-50"
                                >
                                    {TIMEZONES_BRASIL.map((tz) => (
                                        <option key={tz.valor} value={tz.valor}>
                                            {tz.rotulo}
                                        </option>
                                    ))}
                                </select>
                                <p className="text-xs text-zinc-500 mt-1">
                                    Usado para calcular os horários da sua agenda e as mensagens de
                                    confirmação/lembrete.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-bold uppercase text-zinc-400 block">
                                Descrição / Informações Adicionais
                            </label>
                            <textarea
                                value={descricao}
                                onChange={(e) => setDescricao(e.target.value)}
                                placeholder="Descreva os serviços, localização, ou avisos importantes da sua loja..."
                                rows={4}
                                className="w-full px-3.5 py-2 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-900 outline-hidden text-zinc-900 dark:text-zinc-50 resize-none"
                            />
                        </div>

                        <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 flex justify-end">
                            <button
                                type="submit"
                                disabled={isPending}
                                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-50 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 font-semibold rounded-lg text-sm transition-colors cursor-pointer"
                            >
                                {isPending ? 'Salvando...' : 'Salvar Perfil'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* ABA: HORÁRIOS */}
            {abaAtiva === 'horarios' && (
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-xs max-w-3xl">
                    <h2 className="text-base font-bold mb-4">Configuração de Horários Semanais</h2>

                    <form onSubmit={handleSalvarHorarios} className="space-y-4">
                        {msgHorarios && (
                            <div
                                className={`p-3 text-xs font-semibold border rounded-lg ${
                                    msgHorarios.tipo === 'sucesso'
                                        ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900'
                                        : 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900'
                                }`}
                            >
                                {msgHorarios.texto}
                            </div>
                        )}

                        {erroValidacaoHorarios && (
                            <div className="p-3 text-xs font-semibold border rounded-lg bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900">
                                {erroValidacaoHorarios}
                            </div>
                        )}

                        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                            {horariosPorDia.map((dia, index) => (
                                <div
                                    key={index}
                                    className="py-4 flex flex-col gap-3 sm:flex-row first:pt-0 last:pb-0"
                                >
                                    <div className="flex items-center gap-3 w-40 shrink-0">
                                        <input
                                            type="checkbox"
                                            id={`chk-${index}`}
                                            checked={dia.ativo}
                                            onChange={(e) =>
                                                atualizarDiaAtivo(index, e.target.checked)
                                            }
                                            className="w-4 h-4 rounded-sm border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-50 focus:ring-0 cursor-pointer"
                                        />
                                        <label
                                            htmlFor={`chk-${index}`}
                                            className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 cursor-pointer"
                                        >
                                            {DIAS_SEMANA[index]}
                                        </label>
                                    </div>

                                    {dia.ativo ? (
                                        <div className="flex flex-col gap-2 flex-1">
                                            {dia.janelas.map((janela, jIndex) => (
                                                <div
                                                    key={jIndex}
                                                    className="flex items-center gap-2 flex-wrap"
                                                >
                                                    <input
                                                        type="time"
                                                        value={janela.hora_inicio}
                                                        onChange={(e) =>
                                                            atualizarJanela(
                                                                index,
                                                                jIndex,
                                                                'hora_inicio',
                                                                e.target.value,
                                                            )
                                                        }
                                                        className="px-2 py-1 border border-zinc-200 dark:border-zinc-800 rounded-md text-sm bg-zinc-50 dark:bg-zinc-900 font-mono"
                                                    />
                                                    <span className="text-xs text-zinc-400">
                                                        até
                                                    </span>
                                                    <input
                                                        type="time"
                                                        value={janela.hora_fim}
                                                        onChange={(e) =>
                                                            atualizarJanela(
                                                                index,
                                                                jIndex,
                                                                'hora_fim',
                                                                e.target.value,
                                                            )
                                                        }
                                                        className="px-2 py-1 border border-zinc-200 dark:border-zinc-800 rounded-md text-sm bg-zinc-50 dark:bg-zinc-900 font-mono"
                                                    />
                                                    {dia.janelas.length > 1 && (
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                removerJanela(index, jIndex)
                                                            }
                                                            title="Remover janela"
                                                            aria-label="Remover janela"
                                                            className="w-7 h-7 flex items-center justify-center rounded-md text-lg leading-none text-zinc-400 hover:text-red-600 hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
                                                        >
                                                            ×
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                            {dia.janelas.length < MAX_JANELAS_POR_DIA && (
                                                <button
                                                    type="button"
                                                    onClick={() => adicionarJanela(index)}
                                                    className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 self-start cursor-pointer transition-colors"
                                                >
                                                    + adicionar janela
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        <span className="text-xs text-zinc-400 font-medium italic">
                                            Fechado / Sem atendimento
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800 space-y-4">
                            <div>
                                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                                    Regras de agendamento
                                </h3>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                                    Controlam a janela de tempo em que clientes conseguem marcar
                                    horários pela sua página pública.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold uppercase text-zinc-400 block">
                                        Antecedência mínima
                                    </label>
                                    <select
                                        value={antecedenciaMinimaMinutos}
                                        onChange={(e) =>
                                            setAntecedenciaMinimaMinutos(Number(e.target.value))
                                        }
                                        className="w-full px-3.5 py-2 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-900 outline-hidden text-zinc-900 dark:text-zinc-50"
                                    >
                                        {opcoesAntecedencia.map((o) => (
                                            <option key={o.valor} value={o.valor}>
                                                {o.rotulo}
                                            </option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-zinc-500 mt-1">
                                        Tempo mínimo entre o momento da reserva e o horário do
                                        atendimento. Evita agendamentos de última hora.
                                    </p>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-bold uppercase text-zinc-400 block">
                                        Agendamento até
                                    </label>
                                    <select
                                        value={horizonteMaximoDias}
                                        onChange={(e) =>
                                            setHorizonteMaximoDias(Number(e.target.value))
                                        }
                                        className="w-full px-3.5 py-2 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-900 outline-hidden text-zinc-900 dark:text-zinc-50"
                                    >
                                        {opcoesHorizonte.map((o) => (
                                            <option key={o.valor} value={o.valor}>
                                                {o.rotulo}
                                            </option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-zinc-500 mt-1">
                                        Até quantos dias no futuro o cliente pode marcar um horário
                                        na sua agenda.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-end">
                            <button
                                type="submit"
                                disabled={isPending || !!erroValidacaoHorarios}
                                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-50 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 font-semibold rounded-lg text-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isPending ? 'Salvando...' : 'Salvar Horários'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* ABA: EXCEÇÕES */}
            {abaAtiva === 'excecoes' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Criar Bloqueio */}
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-xs h-fit">
                        <h2 className="text-base font-bold mb-4 font-sans">Bloquear Agenda</h2>

                        <form onSubmit={handleCriarExcecao} className="space-y-4">
                            {msgExcecoes && (
                                <div
                                    className={`p-3 text-xs font-semibold border rounded-lg ${
                                        msgExcecoes.tipo === 'sucesso'
                                            ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900'
                                            : 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900'
                                    }`}
                                >
                                    {msgExcecoes.texto}
                                </div>
                            )}

                            <div className="space-y-1">
                                <label className="text-xs font-bold uppercase text-zinc-400 block">
                                    Data
                                </label>
                                <input
                                    type="date"
                                    value={excData}
                                    onChange={(e) => setExcData(e.target.value)}
                                    className="w-full px-3.5 py-2 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-900 outline-hidden text-zinc-900 dark:text-zinc-50 font-medium"
                                    required
                                />
                            </div>

                            <div className="flex items-center gap-3 pt-2">
                                <input
                                    type="checkbox"
                                    id="dia-inteiro-chk"
                                    checked={excDiaInteiro}
                                    onChange={(e) => setExcDiaInteiro(e.target.checked)}
                                    className="w-4 h-4 rounded-sm border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-50 focus:ring-0 cursor-pointer"
                                />
                                <label
                                    htmlFor="dia-inteiro-chk"
                                    className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 cursor-pointer"
                                >
                                    Bloquear o dia inteiro
                                </label>
                            </div>

                            {!excDiaInteiro && (
                                <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-1 duration-200">
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold uppercase text-zinc-400 block">
                                            Hora Início
                                        </label>
                                        <input
                                            type="time"
                                            value={excHoraInicio}
                                            onChange={(e) => setExcHoraInicio(e.target.value)}
                                            className="w-full px-3.5 py-2 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-900 outline-hidden text-zinc-900 dark:text-zinc-50 font-mono"
                                            required={!excDiaInteiro}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold uppercase text-zinc-400 block">
                                            Hora Fim
                                        </label>
                                        <input
                                            type="time"
                                            value={excHoraFim}
                                            onChange={(e) => setExcHoraFim(e.target.value)}
                                            className="w-full px-3.5 py-2 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-900 outline-hidden text-zinc-900 dark:text-zinc-50 font-mono"
                                            required={!excDiaInteiro}
                                        />
                                    </div>
                                </div>
                            )}

                            <div className="space-y-1">
                                <label className="text-xs font-bold uppercase text-zinc-400 block">
                                    Motivo (Opcional)
                                </label>
                                <input
                                    type="text"
                                    value={excMotivo}
                                    onChange={(e) => setExcMotivo(e.target.value)}
                                    placeholder="Ex: Feriado local, Médico, etc."
                                    className="w-full px-3.5 py-2 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-900 outline-hidden text-zinc-900 dark:text-zinc-50"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={isPending}
                                className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-50 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 font-semibold rounded-lg text-sm transition-colors cursor-pointer"
                            >
                                {isPending ? 'Adicionando...' : 'Adicionar Bloqueio'}
                            </button>
                        </form>
                    </div>

                    {/* Lista Bloqueios */}
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-xs lg:col-span-2">
                        <h2 className="text-base font-bold mb-4 font-sans">Bloqueios Futuros</h2>

                        {excecoesAgenda.length === 0 ? (
                            <p className="text-zinc-500 dark:text-zinc-400 text-sm italic">
                                Nenhum bloqueio futuro configurado na agenda.
                            </p>
                        ) : (
                            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                {excecoesAgenda.map((exc) => {
                                    const dataFormatada = new Date(
                                        `${exc.data}T12:00:00`,
                                    ).toLocaleDateString('pt-BR', {
                                        day: '2-digit',
                                        month: '2-digit',
                                        year: 'numeric',
                                    })

                                    return (
                                        <div
                                            key={exc.id}
                                            className="py-3 flex items-center justify-between gap-4 first:pt-0 last:pb-0"
                                        >
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-bold font-mono text-zinc-900 dark:text-zinc-100">
                                                        {dataFormatada}
                                                    </span>
                                                    <span className="text-[10px] bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400 px-2 py-0.5 rounded-full font-bold uppercase">
                                                        Bloqueado
                                                    </span>
                                                </div>
                                                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                                                    {exc.hora_inicio && exc.hora_fim
                                                        ? `Horário: ${exc.hora_inicio.slice(0, 5)} às ${exc.hora_fim.slice(0, 5)}`
                                                        : 'Dia Completo'}
                                                    {exc.motivo && ` • Motivo: ${exc.motivo}`}
                                                </p>
                                            </div>

                                            <button
                                                onClick={() => handleExcluirExcecao(exc.id)}
                                                className="p-2 text-zinc-400 hover:text-red-600 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-lg transition-all cursor-pointer shrink-0"
                                                title="Remover Bloqueio"
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
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
