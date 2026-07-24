import { createHash } from 'node:crypto'
import { hashTenantId } from '../analytics/tenant'

export { hashTenantId }

/**
 * Pseudonimização do agendamentoId para observabilidade e logs no servidor.
 *
 * Utiliza o mesmo salt `ANALYTICS_TENANT_SALT` para gerar um hash sha256
 * truncado a 16 caracteres. Garante rastreabilidade sem vazar o UUID cru.
 */
export function hashAgendamentoId(agendamentoId: string): string {
    const salt = process.env.ANALYTICS_TENANT_SALT ?? ''
    return createHash('sha256').update(`${salt}${agendamentoId}`).digest('hex').slice(0, 16)
}
