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
// `org`/`project` só importam para upload de source map, que esta etapa
// deliberadamente NÃO faz (ver docs/PENDENCIAS.md). Ficam por variável de
// ambiente para o owner preencher sem mexer em código quando for a hora.
//
// Não passar `disableLogger`, `automaticVercelMonitors` nem opções de
// `webpack`: são no-op sob Turbopack e emitem aviso de deprecação.
// `tunnelRoute` também está fora — colide com o matcher amplo de `src/proxy.ts`.
export default withSentryConfig(nextConfig, {
    org: process.env.SENTRY_ORG ?? '',
    project: process.env.SENTRY_PROJECT ?? '',
    silent: !process.env.CI,
})
