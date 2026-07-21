import * as Sentry from '@sentry/nextjs'
import posthog from 'posthog-js'

import { opcoesBaseSentry } from './lib/observabilidade/opcoes-sentry'
import { sanitizarBreadcrumb, sanitizarEventoSentry } from './lib/observabilidade/sanitizacao'

/**
 * Sentry no browser. Este arquivo roda depois do HTML carregar e antes da
 * hidratação, inclusive em `/book/[slug]` — a superfície pública onde o
 * cliente final digita nome e telefone.
 *
 * ⚠️ Session Replay NÃO é instalado. A integração de replay do SDK não é
 * importada nem adicionada em `integrations`, de modo que não existe toggle de
 * painel capaz de ligá-la. É a mesma regra que `analytics/client.ts:35` já
 * aplica ao PostHog: trava no código versionado, não em configuração remota.
 *
 * Nota para a próxima sessão: o corpo da requisição NÃO vaza por padrão — o
 * SDK só manda o tamanho inferido do `content-length`, não o conteúdo. A
 * sanitização é defesa em profundidade, não a barreira única.
 */
const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST

if (posthogKey && posthogHost) {
    posthog.init(posthogKey, {
        api_host: posthogHost,
        defaults: '2026-01-30',
        capture_exceptions: true,
        debug: process.env.NODE_ENV === 'development',
    })
}

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
    Sentry.init({
        dsn,
        environment: process.env.NODE_ENV,
        ...opcoesBaseSentry,
        integrations: [
            Sentry.breadcrumbsIntegration({
                // Cinto e suspensório: a doc afirma que o breadcrumb de DOM
                // captura id/classe do elemento, não o valor do input — não há
                // vazamento conhecido, mas esta é a página onde o cliente final
                // digita os dados dele.
                dom: false,
                // ESTA é a trava real: os `console.error` do projeto carregam
                // contexto de negócio.
                console: false,
                fetch: true,
                history: true,
                xhr: true,
                sentry: true,
            }),
        ],
        beforeSend: sanitizarEventoSentry,
        beforeBreadcrumb: sanitizarBreadcrumb,
    })
}

/**
 * Sem este hook o SDK não instrumenta navegação do App Router — e o build
 * imprime `ACTION REQUIRED` avisando disso. Importa aqui porque `/book/[slug]`
 * é um wizard: o cliente final navega entre etapas, e erro que só aparece
 * depois da primeira navegação ficaria invisível.
 *
 * A URL passada ao hook passa pelas mesmas travas de `opcoesBaseSentry`
 * (`urlQueryParams: false`) e pelo `beforeSend`.
 */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
