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
            corPersonalizada: true,
            logoPersonalizado: false,
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
            whatsapp: true,
        },
    },
} satisfies Record<PlanoId, DefinicaoPlano>)
