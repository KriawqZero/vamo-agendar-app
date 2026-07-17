/**
 * Classes do acento visual da página pública.
 *
 * Com cor do tenant (Pro), o acento é a cor dele via CSS vars `--acento` /
 * `--acento-texto` injetadas pelo page.tsx (texto calculado por contraste WCAG em
 * src/lib/cores.ts). Sem cor, valem os padrões da marca — mesmo pareamento do
 * dashboard (`bg-marca` + `text-white dark:text-zinc-950`) e o CTA em gradiente
 * oficial. A cor do tenant só pinta preenchimentos/bordas/tints, nunca texto sobre
 * as superfícies do tema (contraste não garantido nos dois temas).
 */
export interface ClassesAcento {
    /** CTA principal (barra inferior). */
    cta: string
    /** Preenchimento de item selecionado (slot, data). */
    fill: string
    /** Borda de item selecionado (cards de serviço). */
    borda: string
    /** Fundo sutil de item selecionado (cards de serviço). */
    tint: string
    /** Segmentos da barra de progresso. */
    barra: string
}

export function classesAcento(temCorDoTenant: boolean): ClassesAcento {
    if (temCorDoTenant) {
        return {
            cta: 'bg-[var(--acento)] text-[var(--acento-texto)] hover:brightness-110',
            fill: 'border-[var(--acento)] bg-[var(--acento)] text-[var(--acento-texto)]',
            borda: 'border-[var(--acento)]',
            tint: 'bg-[color-mix(in_oklab,var(--acento)_9%,transparent)]',
            barra: 'bg-[var(--acento)]',
        }
    }
    return {
        cta: 'bg-gradient-to-br from-[#3DBAED] to-[#3961D5] text-white hover:brightness-110',
        fill: 'border-marca bg-marca text-white dark:text-zinc-950',
        borda: 'border-marca',
        tint: 'bg-marca/[0.08]',
        barra: 'bg-marca',
    }
}
