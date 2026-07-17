'use client'

import type { ClassesAcento } from './acento'
import type { EtapaBooking, Servico } from './BookingApp'
import ResumoAgendamento from './ResumoAgendamento'

interface BarraInferiorProps {
    etapa: Exclude<EtapaBooking, 'sucesso'>
    servico: Servico | null
    /** Rótulo curto da data escolhida (ex.: "sáb 19/07") — null antes da escolha. */
    dataCurta: string | null
    /** Hora do slot escolhido (ex.: "14:00") — null antes da escolha. */
    horaCurta: string | null
    enviando: boolean
    podeAvancar: boolean
    onAvancar: () => void
    acento: ClassesAcento
    className?: string
}

/**
 * A comanda do agendamento: barra fixa no rodapé que vai se preenchendo com as
 * escolhas (serviço · preço · duração · data · hora) enquanto o CTA fica sempre à
 * mão. Na etapa de contato o botão vira o submit do formulário (form="form-contato").
 */
export default function BarraInferior({
    etapa,
    servico,
    dataCurta,
    horaCurta,
    enviando,
    podeAvancar,
    onAvancar,
    acento,
    className = '',
}: BarraInferiorProps) {
    const ehContato = etapa === 'contato'

    const classesCta = `min-h-12 shrink-0 cursor-pointer rounded-full px-6 text-sm font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${acento.cta}`

    return (
        <div className={`fixed inset-x-0 bottom-0 z-30 ${className}`}>
            <div className="mx-auto w-full max-w-md border-t border-fio bg-bastidor px-5 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 sm:max-w-lg sm:border-x sm:border-fio sm:px-8 md:max-w-xl md:px-10">
                <div className="flex items-center justify-between gap-4">
                    <ResumoAgendamento
                        servico={servico}
                        dataCurta={dataCurta}
                        horaCurta={horaCurta}
                    />

                    {ehContato ? (
                        <button
                            type="submit"
                            form="form-contato"
                            disabled={enviando}
                            className={classesCta}
                        >
                            {enviando ? 'Confirmando…' : 'Confirmar agendamento'}
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={onAvancar}
                            disabled={!podeAvancar}
                            className={classesCta}
                        >
                            Continuar
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
