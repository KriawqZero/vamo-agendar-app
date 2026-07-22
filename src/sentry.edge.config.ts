import * as Sentry from '@sentry/nextjs'

import { dsnDoSentry } from './lib/observabilidade/dsn'
import { opcoesBaseSentry, semIntegracaoDeConsole } from './lib/observabilidade/opcoes-sentry'
import { sanitizarBreadcrumb, sanitizarEventoSentry } from './lib/observabilidade/sanitizacao'

// Mesmo guard, mesma leitura dinâmica e mesmas opções do runtime de servidor:
// sem DSN, não inicializa.
const dsn = dsnDoSentry()

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
