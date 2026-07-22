import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Cliente privilegiado do Supabase (secret key / service role): IGNORA RLS.
 *
 * Uso EXCLUSIVO no servidor, restrito a três pontos do fluxo público (anon):
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
 * 3. LEITURAS do booking público (`obterDadosBookingPublico`,
 *    `obterSlotsPublicos` e a engine de disponibilidade que elas chamam):
 *    perfil por slug, serviços ativos, plano vigente, horários, exceções e
 *    ocupação da agenda. A role `anon` perdeu a Data API na Phase 1 — a
 *    página pública não tinha como continuar de pé lendo com ela. Em troca do
 *    RLS que deixa de filtrar, TODA query pública carrega (a) filtro de
 *    tenant resolvido no SERVIDOR a partir do slug da URL, nunca vindo do
 *    navegador, e (b) lista explícita de colunas — as constantes de projeção
 *    de `public-booking.ts`. Pedir a linha inteira aqui é vazamento por
 *    omissão: coluna nova entra sozinha no payload do browser.
 *
 * Nunca importe este módulo em client components nem o use para mutações B2B
 * de dados do tenant — essas continuam nas Server Actions com RLS.
 */
export function createAdminClient() {
    const secretKey = process.env.SUPABASE_SECRET_KEY
    if (!secretKey) {
        throw new Error('SUPABASE_SECRET_KEY não configurada no ambiente.')
    }

    return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secretKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
    })
}
