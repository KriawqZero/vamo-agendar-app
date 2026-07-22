import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { PLANOS, type PlanoId } from '@/lib/planos'
import { reportarFalhaSilenciosa } from '@/lib/observabilidade/reportar'
import { erroSinteticoSupabase } from '@/lib/observabilidade/erro-supabase'

export interface AssinaturaVigente {
    plano: PlanoId
    inadimplente: boolean
    urlFaturaPendente: string | null
}

/**
 * Retorno do caminho público: o plano E a confissão de quanto se sabe sobre ele.
 *
 * `degradadoPorErro: true` significa "não consegui LER a assinatura", que é
 * coisa diferente de "este tenant não tem assinatura ativa". As duas devolvem
 * `plano: 'gratuito'` — o padrão conservador —, mas só a primeira é falha de
 * infraestrutura, e é o chamador quem decide o que fazer com ela.
 */
export interface PlanoVigentePublico {
    plano: PlanoId
    degradadoPorErro: boolean
}

const GRATUITO: AssinaturaVigente = {
    plano: 'gratuito',
    inadimplente: false,
    urlFaturaPendente: null,
}

/**
 * Rótulo seguro de um erro do Supabase para o contexto do reporte.
 *
 * Reusa `erroSinteticoSupabase` de propósito, em vez de ler `error.code` na
 * mão: a lógica de reduzir o erro ao SQLSTATE (e de recusar um `code` que não
 * seja string não-vazia) já é auditada e testada num lugar só. O que sai daqui
 * é sempre `supabase:<code>` ou `supabase:sem_codigo` — nunca uma string vinda
 * do banco, que embute literais do input.
 */
function rotuloSeguro(erro: unknown): string {
    return erroSinteticoSupabase(erro).message
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
            //
            // A FORMA do retorno não muda, e é proposital: aqui o profissional
            // está logado e VÊ o plano errado na tela, então este modo de falha
            // nunca foi silencioso do mesmo jeito que o público. O que faltava
            // era o sinal. Rótulo próprio para separar, no Sentry, "caiu no
            // dashboard de um profissional" de "caiu no link público de um
            // cliente final" — são urgências diferentes.
            reportarFalhaSilenciosa('assinaturas:leitura_dashboard_falhou', {
                rotulo: rotuloSeguro(error),
            })
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
 * Variante enxuta para contextos públicos: o plano vigente + a confissão de
 * quanto se sabe sobre ele.
 *
 * ⚠️ Exige o cliente PRIVILEGIADO (`createAdminClient()`). A role anon perdeu
 * todo privilégio em `assinaturas` — o GRANT por coluna que servia esta função
 * foi revogado na Phase 1. Passar o cliente anônimo aqui não estoura erro: a
 * leitura falha e o tenant cai no ramo degradado.
 *
 * ⚠️ A degradação por erro é DISTINGUÍVEL, e isso é o contrato desta função.
 * Erro de leitura devolve `plano: 'gratuito'` (o padrão conservador continua)
 * **com** `degradadoPorErro: true`; ausência de linha vigente devolve o mesmo
 * plano com `degradadoPorErro: false`, porque não ter assinatura é condição de
 * NEGÓCIO e não falha. Colapsar as duas era o defeito: no caminho público,
 * `obterSlugEfetivo` passou a invalidar o slug customizado de quem "é
 * gratuito", e um soluço de leitura de trinta segundos virava 404 no link de um
 * cliente pagante — sem alerta, sem evento, sem ninguém para reclamar, porque
 * o cliente final não reclama de página que não abriu.
 *
 * O CHAMADOR decide o que fazer com `degradadoPorErro`; o silêncio era o
 * defeito, e ignorar o campo reintroduz o bug. O que já está decidido nos dois
 * chamadores públicos: `public-booking.ts` afrouxa a checagem de slug (mantém o
 * link no ar) mas força a personalização ao nível gratuito (nada pago aparece);
 * o webhook de lembrete devolve 500 para o QStash retentar.
 *
 * Com o RLS fora do caminho, o `tenantId` é responsabilidade do CHAMADOR: só
 * passe valor resolvido no servidor (no booking público ele sai do perfil
 * encontrado pelo slug da URL), nunca um identificador vindo do navegador.
 */
export async function obterPlanoVigentePublico(
    supabase: SupabaseClient,
    tenantId: string,
): Promise<PlanoVigentePublico> {
    const { data, error } = await supabase
        .from('assinaturas')
        .select('plano, status')
        .eq('tenant_id', tenantId)
        .in('status', ['ativa', 'inadimplente'])
        .maybeSingle()

    if (error) {
        console.error('Erro ao buscar plano vigente (público):', error.message)
        // Contexto carrega SÓ o rótulo derivado do SQLSTATE. Nenhum
        // identificador de tenant, nenhum slug, nenhuma `.message` — pela mesma
        // razão já escrita em `public-booking.ts`: a mensagem do Postgres
        // embute literais do input, e no caminho público o input é dado de
        // visitante. (Os identificadores não são citados nem em comentário: o
        // grep-guard desta fase conta ocorrências no arquivo inteiro, e prosa
        // que repete o token cega a guarda que deveria pegar o vazamento.)
        reportarFalhaSilenciosa('assinaturas:leitura_publica_falhou', {
            rotulo: rotuloSeguro(error),
        })
        return { plano: 'gratuito', degradadoPorErro: true }
    }

    const plano: PlanoId = data && data.plano in PLANOS ? (data.plano as PlanoId) : 'gratuito'

    return { plano, degradadoPorErro: false }
}
