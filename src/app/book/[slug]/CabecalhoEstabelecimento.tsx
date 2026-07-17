'use client'

import Image from 'next/image'
import type { ClassesAcento } from './acento'
import type { EtapaBooking } from './BookingApp'

interface CabecalhoEstabelecimentoProps {
    nome: string
    descricao: string | null
    instagram: string | null
    endereco: string | null
    logoUrl: string | null
    capaUrl: string | null
    etapa: Exclude<EtapaBooking, 'sucesso'>
    onVoltar: () => void
    acento: ClassesAcento
}

const ORDEM_ETAPAS: Exclude<EtapaBooking, 'sucesso'>[] = ['servico', 'data_hora', 'contato']

/**
 * Identidade do estabelecimento no topo do fluxo. Na etapa de serviço aparece por
 * inteiro (capa, logo, bio, contatos); nas seguintes colapsa numa barra compacta
 * sticky com voltar + progresso — o cliente nunca perde de onde está.
 */
export default function CabecalhoEstabelecimento({
    nome,
    descricao,
    instagram,
    endereco,
    logoUrl,
    capaUrl,
    etapa,
    onVoltar,
    acento,
}: CabecalhoEstabelecimentoProps) {
    const indiceEtapa = ORDEM_ETAPAS.indexOf(etapa)

    const progresso = (
        <div className="flex gap-1.5" role="presentation" aria-hidden="true">
            {ORDEM_ETAPAS.map((nomeEtapa, i) => (
                <span
                    key={nomeEtapa}
                    className={`h-1 flex-1 rounded-full transition-all duration-200 ${
                        i <= indiceEtapa ? acento.barra : 'bg-veu'
                    }`}
                />
            ))}
        </div>
    )

    if (etapa !== 'servico') {
        return (
            <header className="sticky top-0 z-20 border-b border-fio bg-palco/95 backdrop-blur">
                <div className="flex items-center gap-3 px-5 py-3">
                    <button
                        type="button"
                        onClick={onVoltar}
                        aria-label="Voltar para a etapa anterior"
                        className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-fio text-giz transition-all duration-200 hover:border-fio-forte"
                    >
                        <svg
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2.5}
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M15 19l-7-7 7-7"
                            />
                        </svg>
                    </button>
                    {logoUrl && (
                        <Image
                            src={logoUrl}
                            alt=""
                            width={28}
                            height={28}
                            className="h-7 w-7 shrink-0 rounded-full border border-fio object-cover"
                        />
                    )}
                    <span className="truncate font-display text-sm font-semibold">{nome}</span>
                </div>
                <div className="px-5 pb-3">{progresso}</div>
            </header>
        )
    }

    return (
        <header>
            {capaUrl ? (
                <div className="relative h-44 w-full">
                    <Image
                        src={capaUrl}
                        alt={`Capa de ${nome}`}
                        fill
                        priority
                        sizes="(max-width: 448px) 100vw, 448px"
                        className="object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                </div>
            ) : (
                // Sem capa: faixa curta com o tint do acento — nunca um espaço quebrado.
                <div className="h-16 w-full bg-[color-mix(in_oklab,var(--acento,var(--marca))_12%,transparent)]" />
            )}

            <div className="px-5">
                <div className={`flex items-end gap-3 ${capaUrl ? '-mt-7' : '-mt-6'}`}>
                    {logoUrl ? (
                        <Image
                            src={logoUrl}
                            alt={`Logo de ${nome}`}
                            width={64}
                            height={64}
                            className="h-16 w-16 shrink-0 rounded-2xl border-2 border-palco bg-bastidor object-cover"
                        />
                    ) : (
                        <div
                            aria-hidden="true"
                            className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border-2 border-palco font-display text-2xl font-bold ${acento.fill}`}
                        >
                            {nome.trim().charAt(0).toUpperCase()}
                        </div>
                    )}
                </div>

                <h1 className="mt-3 font-display text-2xl font-bold leading-tight tracking-tight">
                    {nome}
                </h1>
                {descricao && (
                    <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-nevoa">
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
                                className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-fio px-3 py-1 text-xs font-medium text-nevoa transition-all duration-200 hover:border-fio-forte hover:text-giz"
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
                                className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full border border-fio px-3 py-1 text-xs font-medium text-nevoa transition-all duration-200 hover:border-fio-forte hover:text-giz"
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

                <div className="mt-4">{progresso}</div>
            </div>
        </header>
    )
}
