/**
 * Fonte da verdade dos planos do VamoAgendar.
 * UI e validações leem EXCLUSIVAMENTE daqui — alterar preço/limite é alterar este arquivo.
 * Regra de negócio completa em docs/07-PLANOS_E_MONETIZACAO.md.
 */

export type PlanoId = 'gratuito' | 'plus' | 'pro'

export interface DefinicaoPlano {
    id: PlanoId
    nome: string
    precoMensal: number
    precoAnual: number | null
    seloDesconto: string | null
    descricao: string
    /** null = ilimitado. Conta apenas serviços com ativo = true. */
    limiteServicosAtivos: number | null
    recursos: {
        linkPersonalizado: boolean
        corPersonalizada: boolean
        logoPersonalizado: boolean
        capaPersonalizada: boolean
        whatsapp: boolean
    }
}

export const PLANOS: Record<PlanoId, DefinicaoPlano> = Object.freeze({
    gratuito: {
        id: 'gratuito',
        nome: 'Gratuito',
        precoMensal: 0,
        precoAnual: null,
        seloDesconto: null,
        descricao: 'para sempre',
        limiteServicosAtivos: 2,
        recursos: {
            linkPersonalizado: false,
            corPersonalizada: false,
            logoPersonalizado: false,
            capaPersonalizada: false,
            whatsapp: false,
        },
    },
    plus: {
        id: 'plus',
        nome: 'Plus',
        precoMensal: 9.9,
        precoAnual: 99.9,
        seloDesconto: '-50%',
        descricao: 'para quem está crescendo',
        limiteServicosAtivos: null,
        recursos: {
            linkPersonalizado: true,
            // Customização visual é exclusiva do Pro (decisão de 2026-07-17; o Plus
            // caminha para descontinuação e não deve ganhar recursos novos).
            corPersonalizada: false,
            logoPersonalizado: false,
            capaPersonalizada: false,
            whatsapp: false,
        },
    },
    pro: {
        id: 'pro',
        nome: 'Pro',
        precoMensal: 14.9,
        precoAnual: 149.9,
        seloDesconto: '-50%',
        descricao: 'automação completa',
        limiteServicosAtivos: null,
        recursos: {
            linkPersonalizado: true,
            corPersonalizada: true,
            logoPersonalizado: true,
            capaPersonalizada: true,
            whatsapp: true,
        },
    },
} satisfies Record<PlanoId, DefinicaoPlano>)

/**
 * Preço cheio pós-lançamento, riscado ao lado do preço vigente para compor o
 * selo de desconto de lançamento (-50%) exibido nas landings. null = plano
 * sem preço cheio (Gratuito).
 */
export const PRECO_ORIGINAL: Record<PlanoId, number | null> = Object.freeze({
    gratuito: null,
    plus: 19.9,
    pro: 29.9,
} satisfies Record<PlanoId, number | null>)

/**
 * Slug efetivo do perfil conforme o plano: com link personalizado vale o slug
 * escolhido; sem o recurso, vale o slug aleatório do provisionamento
 * (o customizado fica reservado e volta a valer num re-upgrade).
 */
export function obterSlugEfetivo(
    perfil: { slug: string; slug_gratuito: string },
    plano: PlanoId,
): string {
    return PLANOS[plano].recursos.linkPersonalizado ? perfil.slug : perfil.slug_gratuito
}
