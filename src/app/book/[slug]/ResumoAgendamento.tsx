import type { Servico } from './BookingApp'

interface ResumoAgendamentoProps {
    servico: Servico | null
    /** Rótulo curto da data escolhida (ex.: "sáb 19/07") — null antes da escolha. */
    dataCurta: string | null
    /** Hora do slot escolhido (ex.: "14:00") — null antes da escolha. */
    horaCurta: string | null
    className?: string
}

const formatarPreco = (preco: number) =>
    preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/**
 * A comanda do agendamento: vai se preenchendo com as escolhas do cliente
 * (serviço · preço · duração · [data · hora]). Presentacional — usado pela
 * `BarraInferior` (mobile, rodapé fixo) e pelo `PainelMarca` (desktop,
 * resumo fixo no painel esquerdo). Nunca reimplementar o formato em outro
 * lugar: um único lugar decide como o resumo aparece.
 */
export default function ResumoAgendamento({
    servico,
    dataCurta,
    horaCurta,
    className = '',
}: ResumoAgendamentoProps) {
    return (
        <div className={`min-w-0 ${className}`} aria-live="polite">
            {servico ? (
                <>
                    <p className="truncate text-sm font-semibold">{servico.nome}</p>
                    <p className="mt-0.5 truncate font-mono text-xs text-penumbra">
                        {formatarPreco(servico.preco)} · {servico.duracao_minutos} min
                        {dataCurta && horaCurta && (
                            <>
                                {' · '}
                                {dataCurta} · {horaCurta}
                            </>
                        )}
                    </p>
                </>
            ) : (
                <p className="text-sm text-nevoa">Escolha um serviço para começar</p>
            )}
        </div>
    )
}
