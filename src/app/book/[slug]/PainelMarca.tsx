'use client'

import Image from 'next/image'
import type { ClassesAcento } from './acento'
import type { EtapaBooking, Servico } from './BookingApp'
import ResumoAgendamento from './ResumoAgendamento'
import StepperVertical from './StepperVertical'

interface PainelMarcaProps {
    nome: string
    descricao: string | null
    instagram: string | null
    endereco: string | null
    logoUrl: string | null
    capaUrl: string | null
    acento: ClassesAcento
    /**
     * Só quem monta o painel sabe se a cor vem do tenant (acento resolve as
     * classes, mas não revela a origem) — decide o quanto o halo "pinta":
     * com cor do tenant (Pro) ele é mais presente (identidade paga); sem,
     * um tint mais discreto da marca VamoAgendar — a página gratuita continua
     * bonita sem competir visualmente com quem pagou pela customização.
     */
    temCor: boolean
    etapa: Exclude<EtapaBooking, 'sucesso'>
    servico: Servico | null
    dataCurta: string | null
    horaCurta: string | null
    onIrParaEtapa: (etapa: EtapaBooking) => void
    className?: string
}

/**
 * Identidade do estabelecimento no painel fixo à esquerda (desktop): a
 * versão "cartaz" do CabecalhoEstabelecimento mobile — mesmos dados, mais
 * respiro. Com capa, nome e logo ficam sobrepostos à foto (branco + scrim);
 * sem capa, a identidade VamoAgendar assume (mesmo fallback do Cabecalho) —
 * o plano gratuito nunca parece um estado quebrado. Bio/chips/resumo/stepper
 * vivem sempre na coluna de baixo, em tokens normais do tema.
 */
export default function PainelMarca({
    nome,
    descricao,
    instagram,
    endereco,
    logoUrl,
    capaUrl,
    acento,
    temCor,
    etapa,
    servico,
    dataCurta,
    horaCurta,
    onIrParaEtapa,
    className = '',
}: PainelMarcaProps) {
    const inicial = nome.trim().charAt(0).toUpperCase()

    return (
        <div className={`relative overflow-hidden ${className}`}>
            {/* Halo tintado ao fundo — eco estático do glow que segue o cursor
                (<LuzAmbiente/>), ancorando a identidade do tenant. */}
            <div
                aria-hidden="true"
                className={`pointer-events-none absolute -inset-12 z-0 rounded-full blur-3xl ${
                    temCor
                        ? 'bg-[color-mix(in_oklab,var(--acento)_22%,transparent)]'
                        : 'bg-[color-mix(in_oklab,var(--marca)_14%,transparent)]'
                }`}
            />

            <div className="relative z-10 flex flex-col">
                {capaUrl ? (
                    <div className="relative h-56 w-full shrink-0">
                        <Image
                            src={capaUrl}
                            alt=""
                            fill
                            priority
                            sizes="(min-width: 1280px) 416px, 352px"
                            className="object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
                        <div className="absolute inset-x-0 bottom-0 p-7">
                            {logoUrl ? (
                                <Image
                                    src={logoUrl}
                                    alt=""
                                    width={64}
                                    height={64}
                                    className="h-16 w-16 shrink-0 rounded-2xl border-2 border-white/25 object-cover"
                                />
                            ) : (
                                <div
                                    aria-hidden="true"
                                    className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border-2 border-white/25 font-display text-2xl font-bold ${acento.fill}`}
                                >
                                    {inicial}
                                </div>
                            )}
                            <h1 className="mt-3 font-display text-2xl font-bold leading-tight tracking-tight text-white">
                                {nome}
                            </h1>
                        </div>
                    </div>
                ) : (
                    <div className="px-7 pt-9">
                        {logoUrl ? (
                            <Image
                                src={logoUrl}
                                alt=""
                                width={64}
                                height={64}
                                className="h-16 w-16 shrink-0 rounded-2xl border border-fio object-cover"
                            />
                        ) : (
                            <div
                                aria-hidden="true"
                                className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl font-display text-2xl font-bold ${acento.fill}`}
                            >
                                {inicial}
                            </div>
                        )}
                        <h1 className="mt-4 font-display text-2xl font-bold leading-tight tracking-tight">
                            {nome}
                        </h1>
                    </div>
                )}

                <div className="px-7 pb-8 pt-4">
                    {descricao && (
                        <p className="line-clamp-3 text-sm leading-relaxed text-nevoa">
                            {descricao}
                        </p>
                    )}

                    {(instagram || endereco) && (
                        <div className="mt-3 flex flex-wrap gap-2">
                            {instagram && (
                                <a
                                    href={`https://instagram.com/${instagram}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-fio px-3.5 py-1 text-xs font-medium text-nevoa transition-all duration-200 hover:border-fio-forte hover:text-giz"
                                >
                                    <svg
                                        className="h-3.5 w-3.5"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth={2}
                                        viewBox="0 0 24 24"
                                        aria-hidden="true"
                                    >
                                        <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
                                        <circle cx="12" cy="12" r="4.5" />
                                        <circle
                                            cx="17.2"
                                            cy="6.8"
                                            r="1.2"
                                            fill="currentColor"
                                            stroke="none"
                                        />
                                    </svg>
                                    @{instagram}
                                </a>
                            )}
                            {endereco && (
                                <a
                                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full border border-fio px-3.5 py-1 text-xs font-medium text-nevoa transition-all duration-200 hover:border-fio-forte hover:text-giz"
                                >
                                    <svg
                                        className="h-3.5 w-3.5 shrink-0"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth={2}
                                        viewBox="0 0 24 24"
                                        aria-hidden="true"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                                        />
                                        <circle cx="12" cy="11" r="2.5" />
                                    </svg>
                                    <span className="truncate">{endereco}</span>
                                </a>
                            )}
                        </div>
                    )}

                    <div className="mt-8 border-t border-fio pt-6">
                        <p className="text-xs font-semibold uppercase tracking-wider text-penumbra">
                            Sua reserva
                        </p>
                        <ResumoAgendamento
                            servico={servico}
                            dataCurta={dataCurta}
                            horaCurta={horaCurta}
                            className="mt-2"
                        />
                    </div>

                    <div className="mt-8">
                        <StepperVertical
                            etapa={etapa}
                            acento={acento}
                            onIrParaEtapa={onIrParaEtapa}
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}
