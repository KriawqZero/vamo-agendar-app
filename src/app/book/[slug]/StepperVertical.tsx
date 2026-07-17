'use client'

import type { ClassesAcento } from './acento'
import type { EtapaBooking } from './BookingApp'
import { ORDEM_ETAPAS, ROTULOS_ETAPAS } from './passos'

interface StepperVerticalProps {
    etapa: Exclude<EtapaBooking, 'sucesso'>
    acento: ClassesAcento
    onIrParaEtapa: (etapa: EtapaBooking) => void
    className?: string
}

/**
 * Progresso vertical de 3 passos no painel da marca (desktop) — mesma fonte
 * de verdade (`passos.ts`) do progresso mobile no CabecalhoEstabelecimento,
 * para os dois nunca divergirem. Passo concluído vira botão (volta direto
 * para ele); o atual ganha anel na cor do tenant; os futuros são só leitura
 * — o cliente nunca pula para uma etapa que ainda não preencheu. O trecho do
 * conector entre dois passos concluídos "acende" na cor do tenant — é o
 * mesmo progresso da barra mobile, só que como um traço vertical que cresce.
 */
export default function StepperVertical({
    etapa,
    acento,
    onIrParaEtapa,
    className = '',
}: StepperVerticalProps) {
    const indiceAtual = ORDEM_ETAPAS.indexOf(etapa)

    return (
        <ol className={className} aria-label="Progresso do agendamento">
            {ORDEM_ETAPAS.map((passo, i) => {
                const concluido = i < indiceAtual
                const atual = i === indiceAtual
                const ultimo = i === ORDEM_ETAPAS.length - 1
                const rotulo = ROTULOS_ETAPAS[passo]

                return (
                    <li
                        key={passo}
                        aria-current={atual ? 'step' : undefined}
                        className="relative flex gap-3 pb-7 last:pb-0"
                    >
                        {!ultimo && (
                            <span
                                aria-hidden="true"
                                className="absolute left-4 top-8 h-[calc(100%-2rem)] w-px bg-fio"
                            >
                                <span
                                    className={`block h-full w-full origin-top bg-[var(--acento,var(--marca))] transition-transform duration-500 ease-out ${
                                        concluido ? 'scale-y-100' : 'scale-y-0'
                                    }`}
                                />
                            </span>
                        )}

                        <span className="relative z-10 shrink-0">
                            {concluido ? (
                                <button
                                    type="button"
                                    onClick={() => onIrParaEtapa(passo)}
                                    aria-label={`Voltar para ${rotulo}`}
                                    className="-m-1.5 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full"
                                >
                                    <span
                                        className={`flex h-8 w-8 items-center justify-center rounded-full border transition-all duration-200 hover:brightness-110 ${acento.fill}`}
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
                                                d="M5 13l4 4L19 7"
                                            />
                                        </svg>
                                    </span>
                                </button>
                            ) : atual ? (
                                <span
                                    aria-hidden="true"
                                    className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[var(--acento,var(--marca))] bg-bastidor text-xs font-bold text-giz"
                                >
                                    {i + 1}
                                </span>
                            ) : (
                                <span
                                    aria-hidden="true"
                                    className="flex h-8 w-8 items-center justify-center rounded-full border border-fio text-xs font-semibold text-penumbra"
                                >
                                    {i + 1}
                                </span>
                            )}
                        </span>

                        <span
                            className={`pt-1.5 text-sm font-semibold ${
                                atual ? 'text-giz' : concluido ? 'text-nevoa' : 'text-penumbra'
                            }`}
                        >
                            {rotulo}
                        </span>
                    </li>
                )
            })}
        </ol>
    )
}
