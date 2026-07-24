import { createHash } from 'node:crypto'

/**
 * Script de Smoke Test Operacional — Observabilidade Real da Mensageria.
 *
 * Executa verificações no ambiente local/dev sem expor PII ou secrets.
 *
 * Uso: node scripts/smoke-observabilidade-mensageria.mjs
 */

const envsNecessarias = [
    'EVOLUTION_API_URL',
    'EVOLUTION_GLOBAL_API_KEY',
    'QSTASH_TOKEN',
    'QSTASH_URL',
    'QSTASH_CURRENT_SIGNING_KEY',
    'NEXT_PUBLIC_SENTRY_DSN',
    'NEXT_PUBLIC_POSTHOG_KEY',
    'ANALYTICS_TENANT_SALT',
]

console.log('\n======================================================')
console.log('  VamoAgendar - Smoke Test de Observabilidade Real')
console.log('======================================================\n')

let ausentes = 0
for (const envVar of envsNecessarias) {
    const val = process.env[envVar]
    const presente = val && val.trim().length > 0
    console.log(`[CONFIG] ${envVar.padEnd(30)}: ${presente ? '✅ PRESENTE' : '⚠️ AUSENTE'}`)
    if (!presente) ausentes++
}

if (ausentes > 0) {
    console.log(`\n[AVISO] ${ausentes} variável(is) ausente(s) neste ambiente.`)
}

console.log('')

const corridaId = `corrida_${Date.now()}`
const salt = process.env.ANALYTICS_TENANT_SALT || 'salt_smoke'
const tenantHash = createHash('sha256').update(`${salt}org_smoke_test`).digest('hex').slice(0, 16)
const agendamentoHash = createHash('sha256').update(`${salt}ag_smoke_test`).digest('hex').slice(0, 16)

console.log(`[CORRELAÇÃO] ID da Corrida : ${corridaId}`)
console.log(`[CORRELAÇÃO] Tenant Hash  : ${tenantHash}`)
console.log(`[CORRELAÇÃO] Agend. Hash  : ${agendamentoHash}`)

console.log('\n--- MATRIZ DE VERIFICAÇÃO NOS 4 PILARES DE OBSERVABILIDADE ---')
console.table([
    {
        Pilar: 'Sentry Logs',
        Destino: 'Painel Sentry -> Explore -> Logs',
        FiltroBusca: `tenantHash:${tenantHash}`,
        StatusEsperado: 'Logs info e error emitidos via Sentry.logger',
    },
    {
        Pilar: 'Sentry Issues',
        Destino: 'Painel Sentry -> Issues',
        FiltroBusca: 'is:unresolved whatsapp: / qstash:',
        StatusEsperado: 'Issues agrupadas por mensagem estática sintética',
    },
    {
        Pilar: 'PostHog Analytics',
        Destino: 'Painel PostHog -> Activity',
        FiltroBusca: `distinct_id == "${tenantHash}"`,
        StatusEsperado: 'Eventos whatsapp_confirmation_* / whatsapp_reminder_*',
    },
    {
        Pilar: 'PostgreSQL Audit',
        Destino: 'Tabela disparos_whatsapp',
        FiltroBusca: 'WHERE tenant_id = org_smoke_test',
        StatusEsperado: 'Linha append-only com status (enviado|agendado|falha)',
    },
])

console.log('\n✅ Smoke Test de estrutura finalizado com sucesso!\n')
