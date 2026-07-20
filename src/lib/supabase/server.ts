import { cache } from 'react'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { auth } from '@clerk/nextjs/server'

// Memoizado por request via `cache()`: várias chamadas a createClient() no
// mesmo request (ex.: layout + page do dashboard) reaproveitam a mesma
// instância em vez de re-executar cookies()/auth()/getToken() a cada uma.
export const createClient = cache(async () => {
    const cookieStore = await cookies()
    const { getToken } = await auth()

    // Integração nativa Clerk ↔ Supabase (third-party auth): o session token padrão
    // do Clerk já é aceito pelo Supabase — o fluxo de JWT template foi depreciado.
    // Retorna null quando não há sessão (fluxo B2C anônimo).
    const supabaseAccessToken = await getToken()

    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options),
                        )
                    } catch {
                        // O Proxy e o Next.js gerenciam a escrita.
                        // Em Server Components puros, ignoramos o erro conforme a doc instrui.
                    }
                },
            },
            // Sem sessão, omitimos o header para a requisição cair na role `anon`
            // (um `Bearer null` seria rejeitado pelo PostgREST).
            ...(supabaseAccessToken && {
                global: {
                    headers: {
                        Authorization: `Bearer ${supabaseAccessToken}`,
                    },
                },
            }),
        },
    )
})
