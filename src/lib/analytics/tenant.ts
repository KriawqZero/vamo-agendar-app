import { createHash } from 'node:crypto'

/**
 * Pseudonimização do tenant para analytics (SOMENTE servidor — usa node:crypto).
 *
 * O `org_...` do Clerk nunca sai cru para a ferramenta de analytics: o que
 * viaja é um hash sha256 salgado e truncado. Sem `ANALYTICS_TENANT_SALT` o
 * salt é a string vazia — o hash continua pseudonimizando (decisão documentada
 * em docs/08-ANALYTICS_E_FUNIL.md), mas o salt é recomendado em produção para
 * impedir correlação por força bruta a partir de org_ids conhecidos.
 */
export function hashTenantId(orgId: string): string {
    const salt = process.env.ANALYTICS_TENANT_SALT ?? ''
    return createHash('sha256').update(`${salt}${orgId}`).digest('hex').slice(0, 16)
}
