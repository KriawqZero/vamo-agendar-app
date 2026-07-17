'use client'

import { useEffect, useRef } from 'react'
import type { ClassesAcento } from '../acento'
import type { Servico } from '../BookingApp'

interface EtapaServicoProps {
    servicos: Servico[]
    servicoSelecionado: Servico | null
    onSelecionar: (servico: Servico) => void
    acento: ClassesAcento
    autoFoco: boolean
}

const formatarPreco = (preco: number) =>
    preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function EtapaServico({
    servicos,
    servicoSelecionado,
    onSelecionar,
    acento,
    autoFoco,
}: EtapaServicoProps) {
    const tituloRef = useRef<HTMLHeadingElement>(null)
    useEffect(() => {
        if (autoFoco) tituloRef.current?.focus()
    }, [autoFoco])

    return (
        <section className="aparecer-rapido">
            <h2
                ref={tituloRef}
                tabIndex={-1}
                className="font-display text-lg font-semibold outline-none"
            >
                Escolha o serviço
            </h2>

            {servicos.length === 0 ? (
                <p className="mt-4 rounded-2xl border border-dashed border-fio-forte p-6 text-center text-sm text-nevoa">
                    Este estabelecimento ainda não publicou serviços. Volte em breve.
                </p>
            ) : (
                <div role="radiogroup" aria-label="Serviços disponíveis" className="mt-4 space-y-2">
                    {servicos.map((servico) => {
                        const selecionado = servicoSelecionado?.id === servico.id
                        return (
                            <button
                                key={servico.id}
                                type="button"
                                role="radio"
                                aria-checked={selecionado}
                                onClick={() => onSelecionar(servico)}
                                className={`flex w-full cursor-pointer items-center justify-between gap-4 rounded-2xl border p-4 text-left transition-all duration-200 ${
                                    selecionado
                                        ? `${acento.borda} ${acento.tint}`
                                        : 'border-fio bg-bastidor hover:border-fio-forte'
                                }`}
                            >
                                <span className="min-w-0">
                                    <span className="block text-sm font-semibold">
                                        {servico.nome}
                                    </span>
                                    {servico.descricao && (
                                        <span className="mt-0.5 block truncate text-xs text-nevoa">
                                            {servico.descricao}
                                        </span>
                                    )}
                                    <span className="mt-1 block text-xs text-penumbra">
                                        {servico.duracao_minutos} min
                                    </span>
                                </span>
                                <span className="shrink-0 font-mono text-sm font-semibold">
                                    {formatarPreco(servico.preco)}
                                </span>
                            </button>
                        )
                    })}
                </div>
            )}

            <p className="mt-8 flex items-center justify-center gap-1.5 text-center text-[10px] text-penumbra">
                <span>Agendamento facilitado por</span>
                <span className="font-mono font-bold tracking-wider text-nevoa">VamoAgendar</span>
            </p>
        </section>
    )
}
