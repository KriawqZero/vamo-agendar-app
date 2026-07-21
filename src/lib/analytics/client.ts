'use client'

import posthog from 'posthog-js'

/**
 * Captura de eventos de funil no browser (posthog-js).
 *
 * Sem `NEXT_PUBLIC_POSTHOG_KEY` tudo é no-op. A inicialização NÃO acontece
 * aqui: roda em `src/instrumentation-client.ts`, antes da hidratação, com as
 * opções de `src/lib/analytics/opcoes-posthog.ts`. Este módulo é só a API de
 * captura. Nenhuma captura bloqueia a UI e nenhum erro escapa. NUNCA passar
 * PII em propriedades.
 *
 * UTM: o posthog-js persiste os parâmetros de campanha iniciais
 * (utm_source etc.) e os anexa aos eventos/pessoa automaticamente — não há
 * parse manual (ver docs/08-ANALYTICS_E_FUNIL.md).
 */

function chave(): string | undefined {
    return process.env.NEXT_PUBLIC_POSTHOG_KEY
}

/** Captura um evento nomeado. No-op sem key; nunca lança. */
export function capturarEvento(
    evento: string,
    props?: Record<string, string | number | boolean | null>,
): void {
    if (!chave()) return
    try {
        posthog.capture(evento, props)
    } catch (err) {
        console.error(`[analytics] falha ao capturar "${evento}" (ignorada):`, err)
    }
}

/** Identifica a sessão pelo hash pseudonimizado do tenant (nunca o org_id cru). */
export function identificarTenant(tenantHash: string): void {
    if (!chave()) return
    try {
        posthog.identify(tenantHash)
    } catch (err) {
        console.error('[analytics] falha ao identificar tenant (ignorada):', err)
    }
}
