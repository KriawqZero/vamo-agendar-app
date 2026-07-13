'use client'

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useOrganization } from '@clerk/nextjs'
import { salvarPerfilEmpresa } from '@/app/actions/perfis-empresas'
import { salvarHorariosFuncionamento, salvarExcecaoAgenda, excluirExcecaoAgenda } from '@/app/actions/agenda'
import { TIMEZONES_BRASIL, TIMEZONE_PADRAO } from '@/lib/timezone'

interface PerfilEmpresa {
    tenant_id: string;
    slug: string;
    slug_gratuito: string;
    nome_estabelecimento: string;
    descricao: string | null;
    telefone_contato: string | null;
    cor_marca: string | null;
    logo_url: string | null;
    exibir_logo: boolean;
    timezone: string;
}

interface HorarioFuncionamento {
    id: string;
    dia_semana: number;
    hora_inicio: string;
    hora_fim: string;
    ativo: boolean;
}

interface ExcecaoAgenda {
    id: string;
    data: string;
    hora_inicio: string | null;
    hora_fim: string | null;
    bloqueado: boolean;
    motivo: string | null;
}

interface RecursosPlano {
    linkPersonalizado: boolean;
    corPersonalizada: boolean;
    logoPersonalizado: boolean;
}

interface AgendaClientProps {
    perfilEmpresa: PerfilEmpresa | null;
    horariosFuncionamento: HorarioFuncionamento[];
    excecoesAgenda: ExcecaoAgenda[];
    recursosPlano: RecursosPlano;
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
    'Sábado'
]

export default function AgendaClient({
    perfilEmpresa,
    horariosFuncionamento,
    excecoesAgenda,
    recursosPlano
}: AgendaClientProps) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [abaAtiva, setAbaAtiva] = useState<'perfil' | 'horarios' | 'excecoes'>('perfil')

    // Estado do Perfil
    const [slug, setSlug] = useState(perfilEmpresa?.slug || '')
    const [nomeEstabelecimento, setNomeEstabelecimento] = useState(perfilEmpresa?.nome_estabelecimento || '')
    const [descricao, setDescricao] = useState(perfilEmpresa?.descricao || '')
    const [telefoneContato, setTelefoneContato] = useState(perfilEmpresa?.telefone_contato || '')
    const [corMarca, setCorMarca] = useState<string | null>(perfilEmpresa?.cor_marca ?? null)
    const [exibirLogo, setExibirLogo] = useState<boolean>(perfilEmpresa?.exibir_logo ?? true)
    const [timezone, setTimezone] = useState<string>(perfilEmpresa?.timezone || TIMEZONE_PADRAO)
    const [msgPerfil, setMsgPerfil] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)
    // Logo é o da organização no Clerk (sincronizado pelo servidor ao salvar) — aqui só exibimos o preview
    const { organization } = useOrganization()

    // Estado dos Horários Comerciais
    // Inicializa a lista garantindo que tenhamos todos os 7 dias da semana
    const inicializarHorarios = () => {
        const mapa = new Map(horariosFuncionamento.map(h => [h.dia_semana, h]))
        return Array.from({ length: 7 }, (_, i) => {
            const existente = mapa.get(i)
            return {
                dia_semana: i,
                hora_inicio: existente?.hora_inicio || '08:00',
                hora_fim: existente?.hora_fim || '18:00',
                ativo: existente ? existente.ativo : i !== 0 && i !== 6 // Padrão ativo dias de semana, inativo fds
            }
        })
    }
    const [horarios, setHorarios] = useState(inicializarHorarios())
    const [msgHorarios, setMsgHorarios] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)

    // Estado das Exceções / Bloqueios
    const [excData, setExcData] = useState('')
    const [excHoraInicio, setExcHoraInicio] = useState('')
    const [excHoraFim, setExcHoraFim] = useState('')
    const [excDiaInteiro, setExcDiaInteiro] = useState(true)
    const [excMotivo, setExcMotivo] = useState('')
    const [msgExcecoes, setMsgExcecoes] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)

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
                    timezone
                })
                setMsgPerfil({ tipo: 'sucesso', texto: 'Perfil salvo com sucesso!' })
                // Atualiza o slug local com a versão higienizada retornada do banco
                setSlug(res.slug)
                router.refresh()
            } catch (err: any) {
                setMsgPerfil({ tipo: 'erro', texto: err.message || 'Erro ao salvar perfil' })
            }
        })
    }

    const handleSalvarHorarios = async (e: React.FormEvent) => {
        e.preventDefault()
        setMsgHorarios(null)

        // Limpa segundos das strings de tempo para compatibilidade "HH:MM"
        const horariosFormatados = horarios.map(h => ({
            ...h,
            hora_inicio: h.hora_inicio.slice(0, 5),
            hora_fim: h.hora_fim.slice(0, 5)
        }))

        startTransition(async () => {
            try {
                await salvarHorariosFuncionamento(horariosFormatados)
                setMsgHorarios({ tipo: 'sucesso', texto: 'Horários salvos com sucesso!' })
                router.refresh()
            } catch (err: any) {
                setMsgHorarios({ tipo: 'erro', texto: err.message || 'Erro ao salvar horários' })
            }
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
            setMsgExcecoes({ tipo: 'erro', texto: 'Para bloqueios parciais, informe hora de início e fim.' })
            return
        }

        startTransition(async () => {
            try {
                await salvarExcecaoAgenda({
                    data: excData,
                    hora_inicio: horaInicioStr,
                    hora_fim: horaFimStr,
                    bloqueado: true,
                    motivo: excMotivo
                })
                setMsgExcecoes({ tipo: 'sucesso', texto: 'Bloqueio adicionado com sucesso!' })
                // Reseta formulário
                setExcData('')
                setExcHoraInicio('')
                setExcHoraFim('')
                setExcDiaInteiro(true)
                setExcMotivo('')
                router.refresh()
            } catch (err: any) {
                setMsgExcecoes({ tipo: 'erro', texto: err.message || 'Erro ao criar bloqueio' })
            }
        })
    }

    const handleExcluirExcecao = async (id: string) => {
        if (!confirm('Deseja remover este bloqueio da agenda?')) return

        startTransition(async () => {
            try {
                await excluirExcecaoAgenda(id)
                router.refresh()
            } catch (err: any) {
                alert(err.message || 'Erro ao excluir bloqueio')
            }
        })
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Configurar Agenda</h1>
                <p className="text-zinc-500 dark:text-zinc-400 text-sm">
                    Configure os dados do seu estabelecimento, horários comerciais e bloqueios temporários.
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
                            <div className={`p-3 text-xs font-semibold border rounded-lg ${
                                msgPerfil.tipo === 'sucesso'
                                    ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900'
                                    : 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900'
                            }`}>
                                {msgPerfil.texto}
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-xs font-bold uppercase text-zinc-400 block">Nome do Estabelecimento</label>
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
                                    Link de Agendamento (Slug) {!recursosPlano.linkPersonalizado && <SeloPlano plano="Plus" />}
                                </label>
                                <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 overflow-hidden text-sm">
                                    <span className="bg-zinc-100 dark:bg-zinc-800 px-3 py-2 text-zinc-500 font-mono text-xs flex items-center border-r border-zinc-200 dark:border-zinc-800">
                                        /book/
                                    </span>
                                    <input
                                        type="text"
                                        value={slug}
                                        onChange={(e) => setSlug(e.target.value)}
                                        placeholder={recursosPlano.linkPersonalizado ? 'barbearia-classica' : 'gerado automaticamente'}
                                        disabled={!recursosPlano.linkPersonalizado}
                                        className="w-full px-3.5 py-2 bg-transparent outline-hidden text-zinc-900 dark:text-zinc-50 font-mono text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                                        required
                                    />
                                </div>
                                {!recursosPlano.linkPersonalizado && (
                                    <p className="text-xs text-zinc-500 mt-1">
                                        Personalize seu link no plano Plus.{' '}
                                        <a href="/dashboard/plano" className="font-bold underline underline-offset-2">Ver planos</a>
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                    Cor da marca {!recursosPlano.corPersonalizada && <SeloPlano plano="Plus" />}
                                </label>
                                <input
                                    type="color"
                                    value={corMarca || '#18181b'}
                                    onChange={(e) => setCorMarca(e.target.value)}
                                    disabled={!recursosPlano.corPersonalizada}
                                    className="h-10 w-20 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed"
                                />
                                <p className="text-xs text-zinc-500 mt-1">Cor de destaque da sua página pública (em breve).</p>
                            </div>

                            <div>
                                <label className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                    Logo {!recursosPlano.logoPersonalizado && <SeloPlano plano="Pro" />}
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
                                <label className={`mt-2 flex items-center gap-2 text-xs font-medium ${recursosPlano.logoPersonalizado ? 'text-zinc-700 dark:text-zinc-300 cursor-pointer' : 'text-zinc-400 dark:text-zinc-600 cursor-not-allowed'}`}>
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
                                <label className="text-xs font-bold uppercase text-zinc-400 block">WhatsApp de Contato público</label>
                                <input
                                    type="text"
                                    value={telefoneContato}
                                    onChange={(e) => setTelefoneContato(e.target.value)}
                                    placeholder="DDD + Telefone (ex: 11999999999)"
                                    className="w-full px-3.5 py-2 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-900 outline-hidden text-zinc-900 dark:text-zinc-50"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-bold uppercase text-zinc-400 block">Fuso horário</label>
                                <select
                                    value={timezone}
                                    onChange={(e) => setTimezone(e.target.value)}
                                    className="w-full px-3.5 py-2 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-900 outline-hidden text-zinc-900 dark:text-zinc-50"
                                >
                                    {TIMEZONES_BRASIL.map((tz) => (
                                        <option key={tz.valor} value={tz.valor}>{tz.rotulo}</option>
                                    ))}
                                </select>
                                <p className="text-xs text-zinc-500 mt-1">
                                    Usado para calcular os horários da sua agenda e as mensagens de confirmação/lembrete.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-bold uppercase text-zinc-400 block">Descrição / Informações Adicionais</label>
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
                            <div className={`p-3 text-xs font-semibold border rounded-lg ${
                                msgHorarios.tipo === 'sucesso'
                                    ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900'
                                    : 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900'
                            }`}>
                                {msgHorarios.texto}
                            </div>
                        )}

                        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                            {horarios.map((h, index) => (
                                <div key={h.dia_semana} className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 first:pt-0 last:pb-0">
                                    <div className="flex items-center gap-3 w-40">
                                        <input
                                            type="checkbox"
                                            id={`chk-${h.dia_semana}`}
                                            checked={h.ativo}
                                            onChange={(e) => {
                                                const novos = [...horarios]
                                                novos[index].ativo = e.target.checked
                                                setHorarios(novos)
                                            }}
                                            className="w-4 h-4 rounded-sm border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-50 focus:ring-0 cursor-pointer"
                                        />
                                        <label htmlFor={`chk-${h.dia_semana}`} className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 cursor-pointer">
                                            {DIAS_SEMANA[h.dia_semana]}
                                        </label>
                                    </div>

                                    {h.ativo ? (
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="time"
                                                value={h.hora_inicio.slice(0, 5)}
                                                onChange={(e) => {
                                                    const novos = [...horarios]
                                                    novos[index].hora_inicio = e.target.value
                                                    setHorarios(novos)
                                                }}
                                                className="px-2 py-1 border border-zinc-200 dark:border-zinc-800 rounded-md text-sm bg-zinc-50 dark:bg-zinc-900 font-mono"
                                            />
                                            <span className="text-xs text-zinc-400">até</span>
                                            <input
                                                type="time"
                                                value={h.hora_fim.slice(0, 5)}
                                                onChange={(e) => {
                                                    const novos = [...horarios]
                                                    novos[index].hora_fim = e.target.value
                                                    setHorarios(novos)
                                                }}
                                                className="px-2 py-1 border border-zinc-200 dark:border-zinc-800 rounded-md text-sm bg-zinc-50 dark:bg-zinc-900 font-mono"
                                            />
                                        </div>
                                    ) : (
                                        <span className="text-xs text-zinc-400 font-medium italic sm:pr-24">
                                            Fechado / Sem atendimento
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-end">
                            <button
                                type="submit"
                                disabled={isPending}
                                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-50 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 font-semibold rounded-lg text-sm transition-colors cursor-pointer"
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
                                <div className={`p-3 text-xs font-semibold border rounded-lg ${
                                    msgExcecoes.tipo === 'sucesso'
                                        ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900'
                                        : 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900'
                                }`}>
                                    {msgExcecoes.texto}
                                </div>
                            )}

                            <div className="space-y-1">
                                <label className="text-xs font-bold uppercase text-zinc-400 block">Data</label>
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
                                <label htmlFor="dia-inteiro-chk" className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 cursor-pointer">
                                    Bloquear o dia inteiro
                                </label>
                            </div>

                            {!excDiaInteiro && (
                                <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-1 duration-200">
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold uppercase text-zinc-400 block">Hora Início</label>
                                        <input
                                            type="time"
                                            value={excHoraInicio}
                                            onChange={(e) => setExcHoraInicio(e.target.value)}
                                            className="w-full px-3.5 py-2 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-900 outline-hidden text-zinc-900 dark:text-zinc-50 font-mono"
                                            required={!excDiaInteiro}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold uppercase text-zinc-400 block">Hora Fim</label>
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
                                <label className="text-xs font-bold uppercase text-zinc-400 block">Motivo (Opcional)</label>
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
                                    const dataFormatada = new Date(`${exc.data}T12:00:00`).toLocaleDateString('pt-BR', {
                                        day: '2-digit',
                                        month: '2-digit',
                                        year: 'numeric'
                                    })

                                    return (
                                        <div key={exc.id} className="py-3 flex items-center justify-between gap-4 first:pt-0 last:pb-0">
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
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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
