import { after } from 'next/server'
import { PostHog } from 'posthog-node'
import { hostPostHog, opcoesServidorPostHog } from './opcoes-posthog'
import { hashTenantId } from './tenant'
import { logOperacional } from '../observabilidade/log'
import { reportarFalhaSilenciosaAguardando } from '../observabilidade/reportar'

type PropsEvento = Record<string, string | number | boolean | null>

async function enviarAoPostHog(
    evento: string,
    props: PropsEvento | undefined,
    distinctId: string,
): Promise<void> {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
    if (!key) return

    try {
        const posthog = new PostHog(key, {
            host: hostPostHog(),
            ...opcoesServidorPostHog,
        })

        try {
            posthog.capture({
                distinctId,
                event: evento,
                properties: {
                    ...props,
                    // Eventos server-side não criam perfil de pessoa: a
                    // identidade (tenant hash) é gerida no client via
                    // posthog.identify(). Decisão documentada em docs/08 — o
                    // wizard já tentou remover esta linha uma vez.
                    $process_person_profile: false,
                },
            })
        } finally {
            // `finally` e não só o caminho feliz: se `capture` lançar, o
            // cliente ficaria com o handle de rede pendurado na invocação.
            await posthog.shutdown()
        }
    } catch (err) {
        console.error(`[analytics] falha ao enviar evento "${evento}" (ignorada):`, err)
        logOperacional.error('analytics_posthog.falha_entrega', {
            fluxo: 'analytics_posthog',
            operacao: evento,
        })
        await reportarFalhaSilenciosaAguardando('analytics_posthog:delivery_failed', {
            fluxo: 'analytics_posthog',
            operacao: evento,
        })
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
    distinctId: string = 'server',
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
