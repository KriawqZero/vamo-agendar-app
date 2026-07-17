'use client'

import { useEffect, useRef } from 'react'
import type { ClassesAcento } from '../acento'
import type { DataDisponivel, Slot } from '../BookingApp'

interface EtapaDataHoraProps {
    datas: DataDisponivel[]
    dataSelecionada: string
    onSelecionarData: (dateStr: string) => void
    slots: Slot[]
    carregando: boolean
    erro: string | null
    onTentarDeNovo: () => void
    /** Aviso de slot tomado por outro cliente (double-booking) — some ao escolher de novo. */
    aviso: string | null
    slotSelecionado: Slot | null
    onSelecionarSlot: (slot: Slot) => void
    acento: ClassesAcento
    autoFoco: boolean
}

// Períodos do dia por comparação lexicográfica de "HH:MM" — só grupos com horário aparecem.
const PERIODOS = [
    { titulo: 'Manhã', de: '00:00', ate: '12:00' },
    { titulo: 'Tarde', de: '12:00', ate: '18:00' },
    { titulo: 'Noite', de: '18:00', ate: '24:00' },
]

export default function EtapaDataHora({
    datas,
    dataSelecionada,
    onSelecionarData,
    slots,
    carregando,
    erro,
    onTentarDeNovo,
    aviso,
    slotSelecionado,
    onSelecionarSlot,
    acento,
    autoFoco,
}: EtapaDataHoraProps) {
    const tituloRef = useRef<HTMLHeadingElement>(null)
    useEffect(() => {
        if (autoFoco) tituloRef.current?.focus()
    }, [autoFoco])

    const grupos = PERIODOS.map((periodo) => ({
        titulo: periodo.titulo,
        slots: slots.filter((s) => s.time >= periodo.de && s.time < periodo.ate),
    })).filter((g) => g.slots.length > 0)

    return (
        <section className="aparecer-rapido">
            <h2
                ref={tituloRef}
                tabIndex={-1}
                className="scroll-mt-24 font-display text-lg font-semibold outline-none"
            >
                Escolha data e hora
            </h2>

            {aviso && (
                <p
                    role="alert"
                    className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-400"
                >
                    {aviso}
                </p>
            )}

            <div
                className="-mx-5 mt-4 flex snap-x gap-2 overflow-x-auto px-5 pb-2 [scrollbar-width:none] lg:mx-0 lg:grid lg:grid-cols-7 lg:gap-2 lg:overflow-visible lg:snap-none lg:px-0 [&::-webkit-scrollbar]:hidden"
                aria-label="Datas disponíveis"
            >
                {datas.map((data) => {
                    const selecionada = data.dateStr === dataSelecionada
                    return (
                        <button
                            key={data.dateStr}
                            type="button"
                            aria-pressed={selecionada}
                            onClick={() => onSelecionarData(data.dateStr)}
                            className={`min-w-16 shrink-0 cursor-pointer snap-start rounded-2xl border px-3 py-2.5 text-center transition-all duration-200 lg:min-w-0 ${
                                selecionada
                                    ? acento.fill
                                    : 'border-fio bg-bastidor hover:border-fio-forte'
                            }`}
                        >
                            <span
                                className={`block text-[10px] font-semibold uppercase tracking-wider ${selecionada ? '' : 'text-penumbra'}`}
                            >
                                {data.diaSemana}
                            </span>
                            <span className="mt-0.5 block text-sm font-extrabold">
                                {data.label.split('/')[0]}
                            </span>
                        </button>
                    )
                })}
            </div>

            <div className="mt-4" aria-live="polite">
                {carregando ? (
                    <div className="grid grid-cols-3 gap-2 lg:grid-cols-4">
                        {Array.from({ length: 9 }).map((_, i) => (
                            <div key={i} className="h-11 animate-pulse rounded-xl bg-veu" />
                        ))}
                    </div>
                ) : erro ? (
                    <div
                        role="alert"
                        className="rounded-2xl border border-red-200 bg-red-50 p-4 text-center dark:border-red-900 dark:bg-red-950/20"
                    >
                        <p className="text-xs font-semibold text-red-700 dark:text-red-400">
                            {erro}
                        </p>
                        <button
                            type="button"
                            onClick={onTentarDeNovo}
                            className="mt-2 cursor-pointer rounded-full border border-red-200 px-4 py-1.5 text-xs font-semibold text-red-700 transition-all duration-200 hover:bg-red-100 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
                        >
                            Tentar de novo
                        </button>
                    </div>
                ) : slots.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-fio-forte p-6 text-center text-sm text-nevoa">
                        Sem horários livres neste dia. Escolha outra data acima.
                    </p>
                ) : (
                    <div className="space-y-4">
                        {grupos.map((grupo) => (
                            <div key={grupo.titulo}>
                                <h3 className="text-xs font-semibold uppercase tracking-wider text-penumbra">
                                    {grupo.titulo}
                                </h3>
                                <div
                                    className="mt-2 grid grid-cols-3 gap-2 lg:grid-cols-4"
                                    aria-label={`Horários da ${grupo.titulo.toLowerCase()}`}
                                >
                                    {grupo.slots.map((slot) => {
                                        const selecionado =
                                            slotSelecionado?.datetime === slot.datetime
                                        return (
                                            <button
                                                key={slot.datetime}
                                                type="button"
                                                aria-pressed={selecionado}
                                                onClick={() => onSelecionarSlot(slot)}
                                                className={`min-h-11 cursor-pointer rounded-xl border font-mono text-sm font-semibold transition-all duration-200 ${
                                                    selecionado
                                                        ? acento.fill
                                                        : 'border-fio bg-bastidor hover:border-fio-forte'
                                                }`}
                                            >
                                                {slot.time}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </section>
    )
}
