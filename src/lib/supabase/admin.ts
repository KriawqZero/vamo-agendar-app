import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Cliente privilegiado do Supabase (secret key / service role): IGNORA RLS.
 *
 * Uso EXCLUSIVO no servidor e restrito à fase de DISPARO da mensageria
 * (confirmação no booking público e webhook de lembrete), onde os fluxos rodam
 * como `anon` e o RLS impede — corretamente — a leitura de `whatsapp_configs`
 * (o `instance_token` não pode ser público).
 *
 * Nunca importe este módulo em client components nem o use para mutações de
 * dados do tenant — essas continuam nas Server Actions com RLS.
 */
export function createAdminClient() {
    const secretKey = process.env.SUPABASE_SECRET_KEY
    if (!secretKey) {
        throw new Error('SUPABASE_SECRET_KEY não configurada no ambiente.')
    }

    return createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        secretKey,
        {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
            },
        }
    )
}
