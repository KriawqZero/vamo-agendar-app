import { after } from 'next/server'
import { hashTenantId } from './tenant'

/**
 * Captura de eventos de funil no servidor (SOMENTE servidor).
 *
 * Envia direto ao endpoint HTTP de captura do PostHog via `fetch` — sem
 * posthog-node. Sem `NEXT_PUBLIC_POSTHOG_KEY` tudo é no-op.
 *
 * Abordagem única de não-bloqueio (documentada em docs/08-ANALYTICS_E_FUNIL.md):
 * o `after()` de 'next/server' é chamado DENTRO deste helper — os chamadores
 * (server actions, route handlers) apenas invocam a função. Se `after()` não
 * estiver disponível (fora de contexto de request), cai para fetch
 * fire-and-forget. Nenhum caminho lança: analytics jamais quebra o produto.
 */

type PropsEvento = Record<string, string | number | boolean | null>

const HOST_PADRAO = 'https://us.i.posthog.com'

async function enviarAoPostHog(evento: string, props: PropsEvento | undefined, distinctId: string): Promise<void> {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
    if (!key) return
    try {
        const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || HOST_PADRAO
        const res = await fetch(`${host.replace(/\/$/, '')}/i/v0/e/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api_key: key,
                event: evento,
                distinct_id: distinctId,
                properties: {
                    ...props,
                    // Eventos server-side não criam perfil de pessoa: a identidade
                    // (tenant hash) é gerida no client via posthog.identify().
                    $process_person_profile: false
                },
                timestamp: new Date().toISOString()
            })
        })
        if (!res.ok) {
            console.error(`[analytics] PostHog respondeu ${res.status} para o evento "${evento}"`)
        }
    } catch (err) {
        console.error(`[analytics] falha ao enviar evento "${evento}" (ignorada):`, err)
    }
}

/**
 * Captura um evento de funil sem bloquear a resposta. No-op sem
 * `NEXT_PUBLIC_POSTHOG_KEY`. `distinctId` default: 'server' (evento anônimo).
 * NUNCA passe PII (nome, telefone, e-mail) em `props` ou `distinctId`.
 */
export function capturarEventoServidor(
    evento: string,
    props?: PropsEvento,
    distinctId: string = 'server'
): void {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return
    try {
        after(() => enviarAoPostHog(evento, props, distinctId))
    } catch {
        // Fora de contexto de request (ex.: job interno): fire-and-forget.
        void enviarAoPostHog(evento, props, distinctId)
    }
}

/**
 * Variante que recebe o `org_...` cru do Clerk e usa o hash pseudonimizado
 * como distinct_id — o orgId nunca chega ao PostHog.
 */
export function capturarEventoTenant(evento: string, orgId: string, props?: PropsEvento): void {
    capturarEventoServidor(evento, props, hashTenantId(orgId))
}
