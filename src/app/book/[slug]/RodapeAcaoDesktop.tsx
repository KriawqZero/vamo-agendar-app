'use client'

import type { ClassesAcento } from './acento'
import type { EtapaBooking } from './BookingApp'

interface RodapeAcaoDesktopProps {
    etapa: Exclude<EtapaBooking, 'sucesso'>
    enviando: boolean
    podeAvancar: boolean
    onAvancar: () => void
    /** Indefinido na etapa de serviço — não há para onde voltar. */
    onVoltar?: () => void
    acento: ClassesAcento
    className?: string
}

const classesCta =
    'min-h-12 cursor-pointer rounded-full px-8 text-sm font-semibold transition-all duration-200 hover:shadow-[0_0_40px_rgba(61,186,237,0.25)] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none'

/**
 * Rodapé de ação do desktop — mesma lógica de CTA da BarraInferior (mobile),
 * em fluxo normal (flex-child do shell, nunca fixed/sticky). O botão Voltar
 * fica aqui porque o desktop não tem o CabecalhoEstabelecimento compacto que
 * carrega esse botão no mobile — sem isto, a etapa de contato/data-hora não
 * teria como retroceder um passo por vez (só o salto do stepper).
 */
export default function RodapeAcaoDesktop({
    etapa,
    enviando,
    podeAvancar,
    onAvancar,
    onVoltar,
    acento,
    className = '',
}: RodapeAcaoDesktopProps) {
    const ehContato = etapa === 'contato'

    return (
        <div
            className={`items-center justify-between border-t border-fio bg-bastidor px-10 py-4 ${className}`}
        >
            {onVoltar ? (
                <button
                    type="button"
                    onClick={onVoltar}
                    className="cursor-pointer rounded-full border border-fio px-5 py-2.5 text-sm font-semibold text-nevoa transition-all duration-200 hover:border-fio-forte hover:text-giz"
                >
                    Voltar
                </button>
            ) : (
                <span aria-hidden="true" />
            )}

            {ehContato ? (
                <button
                    type="submit"
                    form="form-contato"
                    disabled={enviando}
                    className={`${classesCta} ${acento.cta}`}
                >
                    {enviando ? 'Confirmando…' : 'Confirmar agendamento'}
                </button>
            ) : (
                <button
                    type="button"
                    onClick={onAvancar}
                    disabled={!podeAvancar}
                    className={`${classesCta} ${acento.cta}`}
                >
                    Continuar
                </button>
            )}
        </div>
    )
}
