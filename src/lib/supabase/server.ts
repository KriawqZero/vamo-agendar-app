import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { auth } from '@clerk/nextjs/server'

export async function createClient() {
    const cookieStore = await cookies()
    const { getToken } = await auth()

    // O pulo do gato: Pega o JWT que o Clerk gerou especificamente para o escopo do Supabase
    const supabaseAccessToken = await getToken({ template: 'supabase' })

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
                            cookieStore.set(name, value, options)
                        )
                    } catch {
                        // O Proxy e o Next.js gerenciam a escrita. 
                        // Em Server Components puros, ignoramos o erro conforme a doc instrui.
                    }
                },
            },
            global: {
                headers: {
                    // Injeta nativamente o token do Clerk em cada chamada HTTP para o Supabase
                    Authorization: `Bearer ${supabaseAccessToken}`,
                },
            },
        }
    )
}