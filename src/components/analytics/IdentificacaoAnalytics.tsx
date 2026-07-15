'use client'

import { useEffect, useRef } from 'react'
import { capturarEvento, identificarTenant } from '@/lib/analytics/client'

const CHAVE_SIGNUP_CAPTURADO = 'va:signup-capturado'
const JANELA_SIGNUP_MS = 24 * 60 * 60 * 1000 // 24h

interface IdentificacaoAnalyticsProps {
    /** Hash pseudonimizado do tenant (calculado no servidor — nunca o org_id cru). */
    tenantHash: string;
    /** ISO string do createdAt do usuário no Clerk. */
    criadoEm: string;
}

/**
 * Ilha client montada na área logada: identifica a sessão de analytics pelo
 * hash do tenant e captura `signup_completed` uma única vez por browser
 * quando a conta é recente (< 24h) — a flag em localStorage evita duplicatas.
 * Renderiza null; no-op sem NEXT_PUBLIC_POSTHOG_KEY.
 */
export default function IdentificacaoAnalytics({ tenantHash, criadoEm }: IdentificacaoAnalyticsProps) {
    const executado = useRef(false)

    useEffect(() => {
        if (executado.current) return
        executado.current = true

        identificarTenant(tenantHash)

        try {
            const idadeConta = Date.now() - Date.parse(criadoEm)
            if (
                Number.isFinite(idadeConta) &&
                idadeConta >= 0 &&
                idadeConta < JANELA_SIGNUP_MS &&
                !localStorage.getItem(CHAVE_SIGNUP_CAPTURADO)
            ) {
                capturarEvento('signup_completed')
                localStorage.setItem(CHAVE_SIGNUP_CAPTURADO, '1')
            }
        } catch (err) {
            // localStorage indisponível ou data inválida: analytics nunca quebra a UI.
            console.error('[analytics] signup_completed não capturado (ignorado):', err)
        }
    }, [tenantHash, criadoEm])

    return null
}
