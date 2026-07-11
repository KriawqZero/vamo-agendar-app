'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Revela o conteúdo quando ele entra no viewport (fade + subida suave).
 * As classes .reveal/.reveal-visivel vivem em globals.css e respeitam
 * prefers-reduced-motion.
 */
export default function Reveal({
    children,
    delay = 0,
    className = '',
}: {
    children: ReactNode
    delay?: number
    className?: string
}) {
    const ref = useRef<HTMLDivElement>(null)
    const [visivel, setVisivel] = useState(false)

    useEffect(() => {
        const el = ref.current
        if (!el) return
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setVisivel(true)
                    observer.disconnect()
                }
            },
            { threshold: 0.15, rootMargin: '0px 0px -8% 0px' }
        )
        observer.observe(el)
        return () => observer.disconnect()
    }, [])

    return (
        <div
            ref={ref}
            style={delay ? { transitionDelay: `${delay}ms` } : undefined}
            className={`reveal ${visivel ? 'reveal-visivel' : ''} ${className}`}
        >
            {children}
        </div>
    )
}
