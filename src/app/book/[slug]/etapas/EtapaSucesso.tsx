'use client'

import { useEffect, useRef } from 'react'

interface EtapaSucessoProps {
    nomeEstabelecimento: string
    servicoNome: string
    /** Data/hora no fuso do estabelecimento, por extenso (formatarDataHoraLonga). */
    dataHoraLonga: string
    endereco: string | null
    instagram: string | null
    onAgendarOutro: () => void
}

export default function EtapaSucesso({
    nomeEstabelecimento,
    servicoNome,
    dataHoraLonga,
    endereco,
    instagram,
    onAgendarOutro,
}: EtapaSucessoProps) {
    const tituloRef = useRef<HTMLHeadingElement>(null)
    useEffect(() => {
        tituloRef.current?.focus()
    }, [])

    return (
        <section className="aparecer flex flex-col items-center pt-10 text-center lg:mx-auto lg:max-w-xl">
            <div
                aria-hidden="true"
                className="demo-pop flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
            >
                <svg
                    className="h-8 w-8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
            </div>

            <h2
                ref={tituloRef}
                tabIndex={-1}
                className="mt-4 font-display text-xl font-bold outline-none"
            >
                Horário confirmado!
            </h2>

            <dl className="mt-6 w-full space-y-3 rounded-2xl border border-fio bg-bastidor p-5 text-left">
                <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-penumbra">
                        Estabelecimento
                    </dt>
                    <dd className="mt-0.5 text-sm font-semibold">{nomeEstabelecimento}</dd>
                </div>
                <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-penumbra">
                        Serviço
                    </dt>
                    <dd className="mt-0.5 text-sm font-semibold">{servicoNome}</dd>
                </div>
                <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-penumbra">
                        Data e horário
                    </dt>
                    <dd className="mt-0.5 text-sm font-semibold">{dataHoraLonga}</dd>
                </div>
                {endereco && (
                    <div>
                        <dt className="text-[10px] font-semibold uppercase tracking-wider text-penumbra">
                            Endereço
                        </dt>
                        <dd className="mt-0.5 text-sm">
                            <a
                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-semibold underline decoration-fio-forte underline-offset-4 transition-colors hover:decoration-current"
                            >
                                {endereco}
                            </a>
                        </dd>
                    </div>
                )}
            </dl>

            {instagram && (
                <a
                    href={`https://instagram.com/${instagram}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 text-xs font-medium text-nevoa transition-colors hover:text-giz"
                >
                    Siga @{instagram} no Instagram
                </a>
            )}

            <button
                type="button"
                onClick={onAgendarOutro}
                className="mt-8 min-h-12 cursor-pointer rounded-full border border-fio-forte px-6 text-sm font-semibold text-nevoa transition-all duration-200 hover:border-penumbra hover:text-giz"
            >
                Agendar outro horário
            </button>

            <p className="mt-10 flex items-center justify-center gap-1.5 text-[10px] text-penumbra">
                <span>Agendamento facilitado por</span>
                <span className="font-mono font-bold tracking-wider text-nevoa">VamoAgendar</span>
            </p>
        </section>
    )
}
