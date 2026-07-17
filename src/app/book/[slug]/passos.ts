import type { EtapaBooking } from './BookingApp'

/**
 * Fonte única da ordem/rótulos das etapas navegáveis do booking público.
 * Consumida por `CabecalhoEstabelecimento` (progresso mobile) e
 * `StepperVertical` (progresso desktop) — nunca duplicar a lista, senão os
 * dois progressos podem divergir.
 */
export const ORDEM_ETAPAS: Exclude<EtapaBooking, 'sucesso'>[] = ['servico', 'data_hora', 'contato']

export const ROTULOS_ETAPAS: Record<Exclude<EtapaBooking, 'sucesso'>, string> = {
    servico: 'Serviço',
    data_hora: 'Data e hora',
    contato: 'Seus dados',
}
