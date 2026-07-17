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

export default nextConfig
