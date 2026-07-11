import type { ReactNode } from 'react'

/**
 * Texto que muda com a iluminação do palco: a cena escura se passa à noite
 * (22:31, você já dormiu) e a clara de manhã cedo (06:47, você ainda nem
 * abriu). A troca é por CSS (classe dark no html) — sem JS, sem flash.
 */
export default function DiaNoite({ dia, noite }: { dia: ReactNode; noite: ReactNode }) {
    return (
        <>
            <span className="dark:hidden">{dia}</span>
            <span className="hidden dark:inline">{noite}</span>
        </>
    )
}
