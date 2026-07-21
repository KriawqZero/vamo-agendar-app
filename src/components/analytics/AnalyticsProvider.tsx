'use client'

/**
 * Compatibilidade para imports antigos. O PostHog agora é inicializado em
 * instrumentation-client.ts antes da hidratação.
 */
export default function AnalyticsProvider() {
    return null
}
