import type { SupabaseClient } from '@supabase/supabase-js'
import { PLANOS, type PlanoId } from '@/lib/planos'

export interface AssinaturaVigente {
    plano: PlanoId
    inadimplente: boolean
    urlFaturaPendente: string | null
}

const GRATUITO: AssinaturaVigente = { plano: 'gratuito', inadimplente: false, urlFaturaPendente: null }

/**
 * Resolve o plano vigente do tenant a partir da tabela `assinaturas`.
 * - status 'ativa'        → plano da assinatura
 * - status 'inadimplente' → plano mantido + flag para o banner de pagamento pendente
 * - sem linha vigente     → Gratuito
 */
export async function obterAssinaturaVigente(
    supabase: SupabaseClient,
    tenantId: string
): Promise<AssinaturaVigente> {
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
}
