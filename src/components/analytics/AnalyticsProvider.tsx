'use client'

import { useEffect } from 'react'
import { inicializarAnalytics } from '@/lib/analytics/client'

/**
 * Ilha client que inicializa o posthog-js no mount da aplicação.
 * Renderiza null; sem NEXT_PUBLIC_POSTHOG_KEY é no-op total.
 */
export default function AnalyticsProvider() {
    useEffect(() => {
        inicializarAnalytics()
    }, [])

    return null
}
