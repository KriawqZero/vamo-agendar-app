import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Cliente privilegiado do Supabase (secret key / service role): IGNORA RLS.
 *
 * Uso EXCLUSIVO no servidor, restrito a dois pontos do fluxo público (anon):
 *
 * 1. Escritas operacionais do booking público (`criarAgendamentoPublico`):
 *    lookup/criação de cliente e criação do agendamento — SEMPRE após a
 *    validação completa na Server Action (tenant existente, serviço ativo do
 *    mesmo tenant, slot livre). O RLS impede — corretamente — SELECT de
 *    `clientes` para anon (o RETURNING do insert exige visibilidade de
 *    SELECT), e abrir esse SELECT exporia dados pessoais.
 * 2. Fase de DISPARO da mensageria (confirmação no booking público e webhook
 *    de lembrete), onde o RLS impede a leitura de `whatsapp_configs`
 *    (o `instance_token` não pode ser público).
 *
 * Nunca importe este módulo em client components nem o use para mutações B2B
 * de dados do tenant — essas continuam nas Server Actions com RLS.
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
