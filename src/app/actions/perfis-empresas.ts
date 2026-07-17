'use server'

import { createClient } from '@/lib/supabase/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { PLANOS, obterSlugEfetivo } from '@/lib/planos'
import { obterAssinaturaVigente } from '@/lib/assinaturas'
import { ehTimezoneValida, TIMEZONE_PADRAO } from '@/lib/timezone'
import { ehHexValida } from '@/lib/cores'

interface PerfilEmpresaInput {
    slug: string
    nomeEstabelecimento: string
    descricao?: string
    telefoneContato?: string
    corMarca?: string | null
    instagram?: string | null
    endereco?: string | null
    timezone?: string
    antecedenciaMinimaMinutos?: number
    horizonteMaximoDias?: number
}

/**
 * Recupera o perfil do estabelecimento pertencente ao tenant ativo (Clerk orgId).
 */
export async function obterPerfilEmpresa() {
    const { orgId } = await auth()
    if (!orgId) {
        throw new Error('Não autorizado. Nenhuma organização ativa.')
    }

    const supabase = await createClient()

    const { data, error } = await supabase
        .from('perfis_empresas')
        .select('*')
        .eq('tenant_id', orgId)
        .maybeSingle()

    if (error) {
        console.error('Erro ao obter perfil da empresa:', error.message)
        throw new Error('Não foi possível carregar as informações do perfil.')
    }

    if (data) {
        // O dashboard sempre enxerga o slug efetivo do plano vigente: sem link
        // personalizado, vale o slug do provisionamento (o customizado fica
        // reservado em `slug` e volta a valer num re-upgrade).
        const { plano } = await obterAssinaturaVigente(supabase, orgId)
        return { ...data, slug: obterSlugEfetivo(data, plano) }
    }

    // Auto-provisionamento: todo tenant nasce com perfil e link de agendamento,
    // sem depender de o usuário salvar o formulário da agenda. O nome vem da
    // organização no Clerk e o slug é o código aleatório do plano Gratuito
    // (personalizável depois, conforme o plano).
    const clerk = await clerkClient()
    const organizacao = await clerk.organizations.getOrganization({ organizationId: orgId })

    const slugGerado = gerarSlugAleatorio()
    const { data: novoPerfil, error: insertError } = await supabase
        .from('perfis_empresas')
        .upsert(
            {
                tenant_id: orgId,
                slug: slugGerado,
                slug_gratuito: slugGerado,
                nome_estabelecimento: organizacao.name,
            },
            { onConflict: 'tenant_id', ignoreDuplicates: true },
        )
        .select()
        .maybeSingle()

    if (insertError) {
        console.error('Erro ao criar perfil inicial:', insertError.message)
        throw new Error('Não foi possível criar o perfil inicial do estabelecimento.')
    }

    if (novoPerfil) {
        return novoPerfil
    }

    // Corrida com outra aba/request: o perfil acabou de ser criado — relê.
    const { data: existente } = await supabase
        .from('perfis_empresas')
        .select('*')
        .eq('tenant_id', orgId)
        .maybeSingle()

    return existente
}

/**
 * Cria ou atualiza o perfil do estabelecimento pertencente ao tenant ativo (Clerk orgId).
 */
export async function salvarPerfilEmpresa(input: PerfilEmpresaInput) {
    const { orgId } = await auth()
    if (!orgId) {
        throw new Error('Não autorizado. Nenhuma organização ativa.')
    }

    // Sanitização de slug (validação de formato ocorre abaixo, apenas quando aplicável ao plano)
    const slugFormatado = input.slug
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove acentos
        .replace(/[^a-z0-9-_]/g, '-') // Substitui caracteres especiais por hífens
        .replace(/-+/g, '-') // Remove hífens duplicados
        .replace(/^-+|-+$/g, '') // Limpa extremidades

    if (!input.nomeEstabelecimento.trim()) {
        throw new Error('O nome do estabelecimento é obrigatório.')
    }

    const supabase = await createClient()

    const { plano } = await obterAssinaturaVigente(supabase, orgId)
    const recursos = PLANOS[plano].recursos

    if (recursos.linkPersonalizado && (!slugFormatado || slugFormatado.length < 3)) {
        throw new Error('Slug inválido. Deve conter pelo menos 3 caracteres alfanuméricos.')
    }

    // Busca o perfil atual para decidir slug e detectar alterações bloqueadas
    const { data: perfilAtual, error: perfilError } = await supabase
        .from('perfis_empresas')
        .select(
            'slug, slug_gratuito, cor_marca, timezone, antecedencia_minima_minutos, horizonte_maximo_dias',
        )
        .eq('tenant_id', orgId)
        .maybeSingle()

    if (perfilError) {
        console.error('Erro ao buscar perfil atual:', perfilError.message)
        throw new Error('Erro ao validar o perfil atual. Tente novamente.')
    }

    // Regra de slug por plano:
    // - Plus/Pro: slug livre (gravado em `slug`).
    // - Gratuito: o slug efetivo é o `slug_gratuito` do provisionamento; o formulário
    //   envia esse valor de volta e qualquer outro é rejeitado. O slug customizado
    //   que porventura exista em `slug` é preservado para um futuro re-upgrade.
    let slugFinal = slugFormatado
    let slugGratuito = perfilAtual?.slug_gratuito ?? null
    if (!recursos.linkPersonalizado) {
        if (!perfilAtual) {
            slugFinal = gerarSlugAleatorio()
            slugGratuito = slugFinal
        } else if (slugFormatado !== perfilAtual.slug_gratuito) {
            throw new Error(
                'Personalizar o link é um recurso do plano Plus. ' +
                    'Faça upgrade em Plano no menu para escolher seu link.',
            )
        } else {
            // Mantém o slug armazenado (customizado ou não) intacto
            slugFinal = perfilAtual.slug
        }
    } else if (!perfilAtual) {
        // Perfil novo já em plano pago: o slug escolhido também vira a base do Gratuito
        slugGratuito = gerarSlugAleatorio()
    }

    // Gating de personalização visual
    const corMarcaNova = input.corMarca?.trim().toLowerCase() || null

    if (corMarcaNova !== (perfilAtual?.cor_marca ?? null) && !recursos.corPersonalizada) {
        throw new Error(
            'Cor personalizada é um recurso do plano Pro. Faça upgrade em Plano no menu.',
        )
    }
    // Espelha o CHECK do banco (perfis_empresas_cor_marca_check) com mensagem amigável
    if (corMarcaNova !== null && !ehHexValida(corMarcaNova)) {
        throw new Error('Cor inválida. Use o formato #rrggbb.')
    }

    // Infos básicas do negócio — sem gating de plano
    const instagramNovo = normalizarInstagram(input.instagram)
    const enderecoNovo = input.endereco?.trim() || null
    if (enderecoNovo && enderecoNovo.length > 200) {
        throw new Error('Endereço muito longo. Use no máximo 200 caracteres.')
    }

    // Fuso horário do estabelecimento (sem gating de plano). Validado contra a
    // lista IANA suportada pelo runtime; ausente, preserva o valor atual/padrão.
    let timezoneFinal = perfilAtual?.timezone ?? TIMEZONE_PADRAO
    if (input.timezone !== undefined) {
        if (!ehTimezoneValida(input.timezone)) {
            throw new Error('Fuso horário inválido.')
        }
        timezoneFinal = input.timezone
    }

    // Regras de acesso do fluxo público (antecedência mínima e horizonte
    // máximo de agendamento). Ausentes = não altera. Espelha/aperta os CHECKs
    // do banco (perfis_empresas_antecedencia_minima_minutos_check e
    // perfis_empresas_horizonte_maximo_dias_check) — validação server-side,
    // não confia apenas no CHECK.
    let antecedenciaFinal = perfilAtual?.antecedencia_minima_minutos ?? 15
    if (input.antecedenciaMinimaMinutos !== undefined) {
        if (
            !Number.isFinite(input.antecedenciaMinimaMinutos) ||
            !Number.isInteger(input.antecedenciaMinimaMinutos) ||
            input.antecedenciaMinimaMinutos < 0 ||
            input.antecedenciaMinimaMinutos > 10080
        ) {
            throw new Error(
                'Antecedência mínima inválida. Use um valor entre 0 e 10080 minutos (1 semana).',
            )
        }
        antecedenciaFinal = input.antecedenciaMinimaMinutos
    }

    let horizonteFinal = perfilAtual?.horizonte_maximo_dias ?? 14
    if (input.horizonteMaximoDias !== undefined) {
        if (
            !Number.isFinite(input.horizonteMaximoDias) ||
            !Number.isInteger(input.horizonteMaximoDias) ||
            input.horizonteMaximoDias < 1 ||
            input.horizonteMaximoDias > 365
        ) {
            throw new Error('Horizonte máximo inválido. Use um valor entre 1 e 365 dias.')
        }
        horizonteFinal = input.horizonteMaximoDias
    }

    // logo_url e capa_url NÃO passam por aqui: são geridos exclusivamente pelas
    // actions de upload (src/app/actions/imagens-perfil.ts) — o upsert omite as colunas.
    const payload = {
        tenant_id: orgId,
        slug: slugFinal,
        slug_gratuito: slugGratuito,
        nome_estabelecimento: input.nomeEstabelecimento.trim(),
        descricao: input.descricao?.trim() || null,
        telefone_contato: input.telefoneContato?.replace(/\D/g, '') || null,
        cor_marca: corMarcaNova,
        instagram: instagramNovo,
        endereco: enderecoNovo,
        timezone: timezoneFinal,
        antecedencia_minima_minutos: antecedenciaFinal,
        horizonte_maximo_dias: horizonteFinal,
        updated_at: new Date().toISOString(),
    }

    // Como tenant_id é a chave primária, usamos upsert
    const { data, error } = await supabase
        .from('perfis_empresas')
        .upsert(payload, { onConflict: 'tenant_id' })
        .select()
        .single()

    if (error) {
        console.error('Erro ao salvar perfil da empresa:', error.message)
        if (error.code === '23505') {
            throw new Error('Este link (slug) já está sendo utilizado por outro estabelecimento.')
        }
        throw new Error('Erro ao salvar configurações do perfil.')
    }

    // Devolve o slug efetivo do plano vigente (o formulário exibe este valor)
    return { ...data, slug: obterSlugEfetivo(data, plano) }
}

// Handle do Instagram normalizado: sem @, minúsculo. Vazio vira null; formato
// inválido lança (espelha o CHECK perfis_empresas_instagram_check com mensagem amigável).
function normalizarInstagram(valor: string | null | undefined): string | null {
    const handle = valor?.trim().replace(/^@+/, '').toLowerCase() ?? ''
    if (!handle) {
        return null
    }
    if (!/^[a-z0-9._]{1,30}$/.test(handle)) {
        throw new Error('Instagram inválido. Use apenas letras, números, ponto e underline.')
    }
    return handle
}

// 8 caracteres base36 — link opaco do plano Gratuito (ex.: /book/x7k2m9qa)
function gerarSlugAleatorio(): string {
    return Array.from(crypto.getRandomValues(new Uint8Array(8)))
        .map((b) => (b % 36).toString(36))
        .join('')
}
