'use client'

import { useEffect, useRef } from 'react'

/**
 * Glow da marca que segue o cursor pela página inteira (fixed, atrás do
 * conteúdo): azul royal na cena escura, periwinkle na clara. Só em telas
 * com ponteiro fino; respeita prefers-reduced-motion.
 */
export default function LuzAmbiente() {
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const el = ref.current
        if (!el) return
        if (!window.matchMedia('(pointer: fine)').matches) return
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

        let raf = 0
        const aoMover = (e: MouseEvent) => {
            cancelAnimationFrame(raf)
            raf = requestAnimationFrame(() => {
                el.style.transform = `translate(${e.clientX - 320}px, ${e.clientY - 320}px)`
            })
        }

        window.addEventListener('mousemove', aoMover)
        return () => {
            window.removeEventListener('mousemove', aoMover)
            cancelAnimationFrame(raf)
        }
    }, [])

    return (
        <div
            ref={ref}
            aria-hidden
            className="pointer-events-none fixed left-0 top-0 z-0 hidden h-[40rem] w-[40rem] rounded-full bg-[#ACC6FF]/30 blur-3xl transition-transform duration-700 ease-out will-change-transform lg:block dark:bg-marca-forte/[0.06]"
        />
    )
}
