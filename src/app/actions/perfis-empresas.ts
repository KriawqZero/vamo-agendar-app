'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { PLANOS, obterSlugEfetivo } from '@/lib/planos'
import { obterAssinaturaVigente } from '@/lib/assinaturas'
import { ehTimezoneValida, TIMEZONE_PADRAO } from '@/lib/timezone'
import { ehHexValida } from '@/lib/cores'

/**
 * Cópia única de "este link já é de outro estabelecimento", no DASHBOARD.
 *
 * Vive aqui, junto das outras mensagens desta action, e deliberadamente NÃO em
 * `src/app/book/[slug]/mensagens.ts` — aquele módulo é o vocabulário do fluxo
 * público (cliente final), e misturar as duas telas acoplaria superfícies que
 * não têm nada em comum.
 *
 * As duas rotas que chegam nela são o mesmo fato para o profissional: colisão
 * com o `slug` de outro tenant (erro `23505` da constraint `perfis_empresas_slug_key`)
 * e colisão com o `slug_gratuito` de outro tenant (a checagem cruzada abaixo).
 * A mensagem é a mesma de propósito: o profissional não precisa saber que
 * existem duas colunas, e o texto não pode revelar nada do outro tenant.
 */
const COPY_SLUG_EM_USO = 'Este link (slug) já está sendo utilizado por outro estabelecimento.'

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

interface ConfiguracoesAgendamentoInput {
    antecedenciaMinimaMinutos: number
    horizonteMaximoDias: number
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

    // Checagem cruzada do NAMESPACE público, antes de gravar (CR-03).
    //
    // `slug` e `slug_gratuito` são lidos pela MESMA URL (/book/<slug>): são dois
    // membros de um namespace só. O `UNIQUE` de cada coluna não enxerga o
    // cruzamento — a colisão é entre LINHAS de colunas diferentes, e nenhuma
    // constraint a expressa. Sem esta guarda, o tenant A gravava em `slug` o
    // `slug_gratuito` do tenant B (que é o link que B divulga depois de um
    // downgrade) e passava a receber os agendamentos de B, com nome e telefone
    // dos clientes finais dele.
    //
    // ⚠️ Por que `createAdminClient()` e não o client sob RLS: a policy de SELECT
    // de `perfis_empresas` é `tenant_id = org_id do JWT`, então uma consulta a
    // linhas de OUTROS tenants voltaria SEMPRE vazia e a checagem seria decorativa
    // — verde e inútil, que é a pior forma de falha. Confiar no `23505` da
    // constraint também não resolve: a constraint é `slug_gratuito` contra
    // `slug_gratuito`, e esta colisão é `slug` contra `slug_gratuito`.
    // O privilégio é usado no escopo mínimo: projeção de UMA coluna (`tenant_id`),
    // `head: true` (nenhuma linha do outro tenant trafega), e o que sai daqui é o
    // veredito — nunca um dado do vizinho.
    if (slugFinal !== slugGratuito) {
        const { count: colisoes, error: colisaoError } = await createAdminClient()
            .from('perfis_empresas')
            .select('tenant_id', { count: 'exact', head: true })
            .eq('slug_gratuito', slugFinal)
            .neq('tenant_id', orgId)

        if (colisaoError) {
            console.error('Erro ao checar colisão de slug entre tenants:', colisaoError.message)
            throw new Error('Erro ao validar o link do estabelecimento. Tente novamente.')
        }

        if ((colisoes ?? 0) > 0) {
            throw new Error(COPY_SLUG_EM_USO)
        }
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
    // máximo de agendamento). Ausentes = não altera. Validação delegada aos
    // helpers abaixo (compartilhados com salvarConfiguracoesAgendamento).
    let antecedenciaFinal = perfilAtual?.antecedencia_minima_minutos ?? 15
    if (input.antecedenciaMinimaMinutos !== undefined) {
        validarAntecedencia(input.antecedenciaMinimaMinutos)
        antecedenciaFinal = input.antecedenciaMinimaMinutos
    }

    let horizonteFinal = perfilAtual?.horizonte_maximo_dias ?? 14
    if (input.horizonteMaximoDias !== undefined) {
        validarHorizonte(input.horizonteMaximoDias)
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
            // Cobre as DUAS constraints do namespace público:
            // `perfis_empresas_slug_key` e `perfis_empresas_slug_gratuito_key`.
            throw new Error(COPY_SLUG_EM_USO)
        }
        throw new Error('Erro ao salvar configurações do perfil.')
    }

    // Devolve o slug efetivo do plano vigente (o formulário exibe este valor)
    return { ...data, slug: obterSlugEfetivo(data, plano) }
}

/**
 * Atualiza somente as regras de agendamento do booking público (antecedência
 * mínima e horizonte máximo) do tenant ativo. Existe para a aba Horários da
 * agenda não depender de reenviar o perfil inteiro via salvarPerfilEmpresa:
 * fazer isso com os valores da prop perfilEmpresa cria uma corrida — se o
 * profissional salvasse a aba Perfil e, antes do router.refresh() propagar a
 * prop atualizada, submetesse Horários, o perfil era regravado com valores
 * pré-refresh. Sem gating de plano: disponível em todos os planos.
 */
export async function salvarConfiguracoesAgendamento(input: ConfiguracoesAgendamentoInput) {
    const { orgId } = await auth()
    if (!orgId) {
        throw new Error('Não autorizado. Nenhuma organização ativa.')
    }

    validarAntecedencia(input.antecedenciaMinimaMinutos)
    validarHorizonte(input.horizonteMaximoDias)

    const supabase = await createClient()

    const { data, error } = await supabase
        .from('perfis_empresas')
        .update({
            antecedencia_minima_minutos: input.antecedenciaMinimaMinutos,
            horizonte_maximo_dias: input.horizonteMaximoDias,
            updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', orgId)
        .select('tenant_id')
        .single()

    if (error) {
        // Inclui o caso de 0 linhas afetadas (perfil inexistente): não deveria
        // acontecer, já que todo tenant tem perfil via auto-provisionamento,
        // mas cai aqui com mensagem amigável em vez de vazar o erro do banco.
        console.error('Erro ao salvar configurações de agendamento:', error.message)
        throw new Error('Erro ao salvar as regras de agendamento.')
    }

    return data
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

// Espelha o CHECK do banco (perfis_empresas_antecedencia_minima_minutos_check)
// com mensagem amigável — validação server-side, não confia apenas no CHECK.
function validarAntecedencia(valor: number): void {
    if (!Number.isFinite(valor) || !Number.isInteger(valor) || valor < 0 || valor > 10080) {
        throw new Error(
            'Antecedência mínima inválida. Use um valor entre 0 e 10080 minutos (1 semana).',
        )
    }
}

// Espelha o CHECK do banco (perfis_empresas_horizonte_maximo_dias_check)
// com mensagem amigável — validação server-side, não confia apenas no CHECK.
function validarHorizonte(valor: number): void {
    if (!Number.isFinite(valor) || !Number.isInteger(valor) || valor < 1 || valor > 365) {
        throw new Error('Horizonte máximo inválido. Use um valor entre 1 e 365 dias.')
    }
}
