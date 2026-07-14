'use client'

import { capturarEvento } from '@/lib/analytics/client'

/**
 * CTA de upgrade do card de plano. O checkout ainda não existe, então o botão
 * continua inerte (aria-disabled, mesmo visual do antigo disabled), mas o
 * clique captura `upgrade_clicked` — intenção de upgrade é a métrica que o
 * funil precisa antes de o pagamento existir.
 */
export default function CtaUpgrade({ planoId }: { planoId: string }) {
    return (
        <button
            type="button"
            aria-disabled
            onClick={() => capturarEvento('upgrade_clicked', { plano: planoId })}
            className="mt-6 w-full rounded-lg bg-zinc-200 dark:bg-zinc-800 px-4 py-2 text-sm font-bold text-zinc-400 dark:text-zinc-500 cursor-not-allowed"
            title="O checkout ainda não está disponível"
        >
            Em breve
        </button>
    )
}
