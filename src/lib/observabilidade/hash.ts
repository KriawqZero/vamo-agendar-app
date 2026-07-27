import { createHash } from 'node:crypto'
import { hashTenantId } from '../analytics/tenant'
import { permitirUmaVezPorProcesso } from './emissao'
import { reportarFalhaSilenciosa } from './reportar'

export { hashTenantId }

/**
 * Pseudonimização SALGADA e SEPARADA POR DOMÍNIO.
 *
 * ⚠️ Existe por causa do WR-01, e as duas metades do defeito merecem estar
 * escritas aqui:
 *
 * 1. **Separação de domínio.** As funções de hash do projeto eram byte a byte
 *    idênticas (`sha256(salt + valor)`), então `hashChaveRateLimit(tenantId)`
 *    dava EXATAMENTE o `tenantHash` publicado no Sentry e no PostHog. Quem visse
 *    um evento de telemetria conseguia apontar o balde correspondente no store
 *    do fornecedor terceiro — a correlação cruzada que a pseudonimização existe
 *    para impedir. O `dominio` entra no material do hash com separador próprio
 *    (`|`), que também evita colisão por concatenação ambígua.
 * 2. **Falha VISÍVEL sem salt.** Sem salt, `sha256(telefone)` tem espaço de
 *    busca de ~10¹¹ (segundos de força bruta) e `sha256(IPv4)` de 2³² — a
 *    pseudonimização deixa de valer, e antes isso acontecia em silêncio. Em
 *    produção o salt é obrigatório (`src/lib/env.ts`), mas depender de outra
 *    lista para garantir a própria premissa é exatamente como uma garantia
 *    envelhece sem ninguém ver.
 *
 * Uma emissão por processo: é sinal de ESTADO ("este processo subiu sem salt"),
 * não evento por chamada.
 */
export function hashComSal(dominio: string, valor: string): string {
    const salt = process.env.ANALYTICS_TENANT_SALT

    if (!salt && permitirUmaVezPorProcesso('hash:sem_salt')) {
        console.warn(
            '[observabilidade] ANALYTICS_TENANT_SALT ausente: os hashes deste processo são força-brutáveis.',
        )
        reportarFalhaSilenciosa('hash:sem_salt', { fluxo: 'observabilidade' })
    }

    return createHash('sha256')
        .update(`${salt ?? ''}|${dominio}|${valor}`)
        .digest('hex')
        .slice(0, 16)
}

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
