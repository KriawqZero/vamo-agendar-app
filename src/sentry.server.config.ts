import * as Sentry from '@sentry/nextjs'

import { opcoesBaseSentry, semIntegracaoDeConsole } from './lib/observabilidade/opcoes-sentry'
import { sanitizarBreadcrumb, sanitizarEventoSentry } from './lib/observabilidade/sanitizacao'

// Sem DSN NÃO chamamos `Sentry.init` — a doc é explícita que `enabled: false`
// não evita todo o overhead da instrumentação; não inicializar é o
// desligamento de verdade. É o mesmo guard que `analytics/client.ts:25` usa.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
    Sentry.init({
        dsn,
        environment: process.env.NODE_ENV,
        // Fonte única das travas anti-PII — não montar opções à mão aqui.
        ...opcoesBaseSentry,
        // Servidor é onde a PII de fato mora: `console.error` daqui carrega
        // corpo de erro da Evolution e do QStash. Sem esta linha o breadcrumb
        // de console sobe junto com o próximo evento da mesma requisição.
        integrations: semIntegracaoDeConsole,
        beforeSend: sanitizarEventoSentry,
        beforeBreadcrumb: sanitizarBreadcrumb,
    })
}
