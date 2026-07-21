import { after } from 'next/server'
import { PostHog } from 'posthog-node'
import { hashTenantId } from './tenant'

/**
 * Captura de eventos de funil no servidor (SOMENTE servidor).
 *
 * Usa posthog-node com envio imediato. Sem as variáveis de ambiente, tudo é
 * no-op. O `after()` mantém o envio fora do caminho crítico da resposta e
 * aguarda o flush antes que o runtime encerre a invocação.
 */

type PropsEvento = Record<string, string | number | boolean | null>

async function enviarAoPostHog(evento: string, props: PropsEvento | undefined, distinctId: string): Promise<void> {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST
    if (!key || !host) return

    const posthog = new PostHog(key, {
        host,
        flushAt: 1,
        flushInterval: 0,
        enableExceptionAutocapture: true,
    })

    try {
        posthog.capture({
            distinctId,
            event: evento,
            properties: {
                ...props,
                $process_person_profile: false,
            },
        })
        await posthog.shutdown()
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
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY || !process.env.NEXT_PUBLIC_POSTHOG_HOST) return
    after(() => enviarAoPostHog(evento, props, distinctId))
}

/**
 * Variante que recebe o `org_...` cru do Clerk e usa o hash pseudonimizado
 * como distinct_id — o orgId nunca chega ao PostHog.
 */
export function capturarEventoTenant(evento: string, orgId: string, props?: PropsEvento): void {
    capturarEventoServidor(evento, props, hashTenantId(orgId))
}
