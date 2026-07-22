import { withSentryConfig } from '@sentry/nextjs'
import type { NextConfig } from 'next'

// Host do projeto Supabase para o next/image otimizar as imagens públicas do
// bucket `imagens-perfis` (logo/capa dos tenants). O fallback inofensivo mantém
// o build funcionando em ambientes sem credenciais.
const supabaseHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://exemplo.supabase.co')
    .hostname

const nextConfig: NextConfig = {
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: supabaseHost,
                pathname: '/storage/v1/object/public/imagens-perfis/**',
            },
        ],
    },
    experimental: {
        serverActions: {
            // Upload de capa aceita até 5MB; folga para o overhead do multipart.
            // Limite é global às Server Actions — rate limiting é item pré-lançamento.
            bodySizeLimit: '6mb',
        },
    },
}

// `withSentryConfig` estende o config existente — `images.remotePatterns` e
// `experimental.serverActions.bodySizeLimit` seguem intactos (conferido no
// config resolvido do build, não assumido).
//
// Source map: LIGADO a partir de 2026-07-21. A etapa preparatória tinha deixado
// de fora, mas a decisão D-02 (Sentry também no client, inclusive em
// `/book/[slug]`) existe para pegar erro de JS, hidratação e incompatibilidade
// de navegador — e sem source map o stack trace do bundle minificado é ilegível,
// o que esvazia justamente o motivo de ter client-side. `org`/`project` são
// identificadores públicos do painel, não secretos, e ficam literais.
//
// `SENTRY_AUTH_TOKEN` (esse sim secreto) mora no ambiente: sem ele o plugin
// apenas avisa e segue, então build local e de PR continuam funcionando.
//
// `deleteSourcemapsAfterUpload` é obrigatório e não é detalhe: sem ele os `.map`
// ficam servidos publicamente em `/_next/`, e qualquer pessoa reconstrói o
// código-fonte do produto a partir do bundle.
//
// FORA de propósito, apesar de o wizard ter sugerido os três:
// - `tunnelRoute`: colide com o matcher amplo de `src/proxy.ts` (o próprio
//   comentário gerado pelo wizard avisa disso)
// - bloco `webpack` (`automaticVercelMonitors`, `treeshake`): no-op sob
//   Turbopack e emite aviso de deprecação
// - `widenClientFileUpload`: aumenta o tempo de build para cobrir arquivos que
//   este projeto não tem; reavaliar só se faltar stack trace de verdade
export default withSentryConfig(nextConfig, {
    org: 'kriawq-tests',
    project: 'javascript-nextjs',
    silent: !process.env.CI,
    sourcemaps: {
        deleteSourcemapsAfterUpload: true,
    },
})
