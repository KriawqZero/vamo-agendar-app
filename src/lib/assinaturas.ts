import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { PLANOS, type PlanoId } from '@/lib/planos'

export interface AssinaturaVigente {
    plano: PlanoId
    inadimplente: boolean
    urlFaturaPendente: string | null
}

const GRATUITO: AssinaturaVigente = {
    plano: 'gratuito',
    inadimplente: false,
    urlFaturaPendente: null,
}

/**
 * Resolve o plano vigente do tenant a partir da tabela `assinaturas`.
 * - status 'ativa'        → plano da assinatura
 * - status 'inadimplente' → plano mantido + flag para o banner de pagamento pendente
 * - sem linha vigente     → Gratuito
 *
 * Memoizado por request via `cache()`: layout + page do dashboard chamam esta
 * função múltiplas vezes por request com o mesmo client (também memoizado em
 * `createClient()`) e o mesmo tenantId — a deduplicação evita repetir a query.
 */
export const obterAssinaturaVigente = cache(
    async (supabase: SupabaseClient, tenantId: string): Promise<AssinaturaVigente> => {
        const { data, error } = await supabase
            .from('assinaturas')
            .select('plano, status, url_fatura_pendente')
            .eq('tenant_id', tenantId)
            .in('status', ['ativa', 'inadimplente'])
            .maybeSingle()

        if (error) {
            console.error('Erro ao buscar assinatura vigente:', error.message)
            // Falha de leitura não pode derrubar o app: degrada para Gratuito.
            return GRATUITO
        }

        if (!data || !(data.plano in PLANOS)) {
            return GRATUITO
        }

        return {
            plano: data.plano as PlanoId,
            inadimplente: data.status === 'inadimplente',
            urlFaturaPendente: data.url_fatura_pendente ?? null,
        }
    },
)

/**
 * Variante enxuta para contextos públicos (role anon): o GRANT por coluna
 * permite a anon ler apenas tenant_id/plano/status de assinaturas.
 * Retorna somente o plano vigente.
 */
export async function obterPlanoVigentePublico(
    supabase: SupabaseClient,
    tenantId: string,
): Promise<PlanoId> {
    const { data, error } = await supabase
        .from('assinaturas')
        .select('plano, status')
        .eq('tenant_id', tenantId)
        .in('status', ['ativa', 'inadimplente'])
        .maybeSingle()

    if (error) {
        console.error('Erro ao buscar plano vigente (público):', error.message)
        return 'gratuito'
    }

    return data && data.plano in PLANOS ? (data.plano as PlanoId) : 'gratuito'
}
