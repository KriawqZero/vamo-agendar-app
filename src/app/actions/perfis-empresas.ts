'use server'

import { createClient } from '@/lib/supabase/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { PLANOS, obterSlugEfetivo } from '@/lib/planos'
import { obterAssinaturaVigente } from '@/lib/assinaturas'
import { ehTimezoneValida, TIMEZONE_PADRAO } from '@/lib/timezone'

interface PerfilEmpresaInput {
    slug: string;
    nomeEstabelecimento: string;
    descricao?: string;
    telefoneContato?: string;
    corMarca?: string | null;
    exibirLogo?: boolean;
    timezone?: string;
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
            { onConflict: 'tenant_id', ignoreDuplicates: true }
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
        .replace(/[^a-z0-9-_]/g, '-')    // Substitui caracteres especiais por hífens
        .replace(/-+/g, '-')             // Remove hífens duplicados
        .replace(/^-+|-+$/g, '')         // Limpa extremidades

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
        .select('slug, slug_gratuito, cor_marca, logo_url, exibir_logo, timezone')
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
                'Faça upgrade em Plano no menu para escolher seu link.'
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
    const corMarcaNova = input.corMarca?.trim() || null

    if (corMarcaNova !== (perfilAtual?.cor_marca ?? null) && !recursos.corPersonalizada) {
        throw new Error('Cor personalizada é um recurso do plano Plus. Faça upgrade em Plano no menu.')
    }

    // Exibição do logo é preferência do tenant, mas alterá-la exige o plano Pro
    const exibirLogoNovo = input.exibirLogo ?? perfilAtual?.exibir_logo ?? true
    if (exibirLogoNovo !== (perfilAtual?.exibir_logo ?? true) && !recursos.logoPersonalizado) {
        throw new Error('Exibir o logo é um recurso do plano Pro. Faça upgrade em Plano no menu.')
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

    // Logo não é input do usuário: para tenants Pro com exibição ligada,
    // sincronizamos o logo da organização configurado no Clerk (evita URLs
    // arbitrárias e bucket próprio). Caso contrário, o logo fica nulo.
    let logoUrlNovo: string | null = null
    if (recursos.logoPersonalizado && exibirLogoNovo) {
        const clerk = await clerkClient()
        const organizacao = await clerk.organizations.getOrganization({ organizationId: orgId })
        logoUrlNovo = organizacao.hasImage ? organizacao.imageUrl : null
    }

    const payload = {
        tenant_id: orgId,
        slug: slugFinal,
        slug_gratuito: slugGratuito,
        nome_estabelecimento: input.nomeEstabelecimento.trim(),
        descricao: input.descricao?.trim() || null,
        telefone_contato: input.telefoneContato?.replace(/\D/g, '') || null,
        cor_marca: corMarcaNova,
        logo_url: logoUrlNovo,
        exibir_logo: exibirLogoNovo,
        timezone: timezoneFinal,
        updated_at: new Date().toISOString()
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

// 8 caracteres base36 — link opaco do plano Gratuito (ex.: /book/x7k2m9qa)
function gerarSlugAleatorio(): string {
    return Array.from(crypto.getRandomValues(new Uint8Array(8)))
        .map((b) => (b % 36).toString(36))
        .join('')
}
