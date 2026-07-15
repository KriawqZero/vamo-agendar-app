'use client'

import posthog from 'posthog-js'

/**
 * Captura de eventos de funil no browser (posthog-js).
 *
 * Sem `NEXT_PUBLIC_POSTHOG_KEY` tudo é no-op. Inicialização lazy: acontece na
 * primeira chamada (ou no mount do AnalyticsProvider). Nenhuma captura
 * bloqueia a UI e nenhum erro escapa. NUNCA passar PII em propriedades.
 *
 * UTM: o posthog-js persiste os parâmetros de campanha iniciais
 * (utm_source etc.) e os anexa aos eventos/pessoa automaticamente — não há
 * parse manual (ver docs/08-ANALYTICS_E_FUNIL.md).
 */

let inicializado = false

function chave(): string | undefined {
    return process.env.NEXT_PUBLIC_POSTHOG_KEY
}

export function inicializarAnalytics(): void {
    const key = chave()
    if (!key || inicializado || typeof window === 'undefined') return
    try {
        posthog.init(key, {
            api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
            capture_pageview: false,
            person_profiles: 'identified_only',
            autocapture: false,
            // Travados no código (não confiar no toggle do painel do PostHog):
            // replay de sessão gravaria a página pública onde o cliente final
            // digita nome/telefone — "nunca PII" é regra inegociável.
            disable_session_recording: true,
            disable_surveys: true
        })
        inicializado = true
    } catch (err) {
        console.error('[analytics] falha ao inicializar posthog-js (ignorada):', err)
    }
}

/** Captura um evento nomeado. No-op sem key; nunca lança. */
export function capturarEvento(
    evento: string,
    props?: Record<string, string | number | boolean | null>
): void {
    if (!chave()) return
    try {
        inicializarAnalytics()
        posthog.capture(evento, props)
    } catch (err) {
        console.error(`[analytics] falha ao capturar "${evento}" (ignorada):`, err)
    }
}

/** Identifica a sessão pelo hash pseudonimizado do tenant (nunca o org_id cru). */
export function identificarTenant(tenantHash: string): void {
    if (!chave()) return
    try {
        inicializarAnalytics()
        posthog.identify(tenantHash)
    } catch (err) {
        console.error('[analytics] falha ao identificar tenant (ignorada):', err)
    }
}
