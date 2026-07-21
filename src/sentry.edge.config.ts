import * as Sentry from '@sentry/nextjs'

import { opcoesBaseSentry, semIntegracaoDeConsole } from './lib/observabilidade/opcoes-sentry'
import { sanitizarBreadcrumb, sanitizarEventoSentry } from './lib/observabilidade/sanitizacao'

// Mesmo guard e mesmas opções do runtime de servidor: sem DSN, não inicializa.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
    Sentry.init({
        dsn,
        environment: process.env.NODE_ENV,
        ...opcoesBaseSentry,
        // Mesma trava do runtime de servidor — ver comentário lá.
        integrations: semIntegracaoDeConsole,
        beforeSend: sanitizarEventoSentry,
        beforeBreadcrumb: sanitizarBreadcrumb,
    })
}
