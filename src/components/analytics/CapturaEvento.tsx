'use client'

import { useEffect, useRef } from 'react'
import { capturarEvento } from '@/lib/analytics/client'

interface CapturaEventoProps {
    evento: string;
    propriedades?: Record<string, string | number | boolean | null>;
}

/**
 * Captura um evento de analytics uma única vez no mount e renderiza null.
 * Serve para instrumentar Server Components (landing, sign-up, planos) sem
 * transformá-los em client components. No-op sem NEXT_PUBLIC_POSTHOG_KEY.
 */
export default function CapturaEvento({ evento, propriedades }: CapturaEventoProps) {
    const capturado = useRef(false)

    useEffect(() => {
        if (capturado.current) return
        capturado.current = true
        capturarEvento(evento, propriedades)
    }, [evento, propriedades])

    return null
}
