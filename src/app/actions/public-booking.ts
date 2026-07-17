'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { obterSlotsDisponiveis } from '@/lib/booking-engine'
import { diaLocal, TIMEZONE_PADRAO } from '@/lib/timezone'
import { dispararNotificacoesAgendamento } from '@/lib/notificacoes-agendamento'
import { PLANOS, obterSlugEfetivo } from '@/lib/planos'
import { obterPlanoVigentePublico } from '@/lib/assinaturas'
import { ehHexValida } from '@/lib/cores'
import { capturarEventoTenant } from '@/lib/analytics/server'

interface AgendamentoPublicoParams {
    tenantId: string
    servicoId: string
    dataHora: string // ISO string em UTC
    clienteNome: string
    clienteTelefone: string // WhatsApp
    clienteEmail?: string
}

/**
 * Cria um agendamento público (B2C) sem exigência de autenticação do cliente final.
 */
export async function criarAgendamentoPublico({
    tenantId,
    servicoId,
    dataHora,
    clienteNome,
    clienteTelefone,
    clienteEmail,
}: AgendamentoPublicoParams) {
    // 1. Sanitizar e validar dados de entrada básicos
    if (!tenantId || !servicoId || !dataHora || !clienteNome || !clienteTelefone) {
        throw new Error('Preencha todos os campos obrigatórios.')
    }

    const telefoneLimpo = clienteTelefone.replace(/\D/g, '')
    if (telefoneLimpo.length < 10 || telefoneLimpo.length > 11) {
        throw new Error('Número de WhatsApp inválido. Informe o DDD e o número.')
    }

    const dataLocal = new Date(dataHora)
    if (isNaN(dataLocal.getTime())) {
        throw new Error('Data e horário inválidos.')
    }

    const supabase = await createClient()

    // 2. Validar que o tenant existe (e obter o fuso e as regras de acesso do estabelecimento)
    const { data: tenant, error: tError } = await supabase
        .from('perfis_empresas')
        .select('tenant_id, timezone, antecedencia_minima_minutos, horizonte_maximo_dias')
        .eq('tenant_id', tenantId)
        .maybeSingle()

    if (tError || !tenant) {
        throw new Error('Estabelecimento inválido ou indisponível.')
    }

    const timezone = tenant.timezone || TIMEZONE_PADRAO
    // Mesmo regrasAcesso usado em obterSlotsPublicos: sem isto, a validação do
    // slot escolhido (item 4 abaixo) não reconhece a antecedência/horizonte do
    // tenant e um slot fora da regra apareceria como "válido" no servidor.
    const regrasAcesso = {
        antecedenciaMinutos: tenant.antecedencia_minima_minutos ?? 15,
        horizonteDias: tenant.horizonte_maximo_dias ?? 14,
    }

    // 3. Buscar informações do serviço (duração), exigindo que esteja ativo e
    // pertença ao MESMO tenant — impede agendamento cruzado entre tenants.
    const { data: servico, error: sError } = await supabase
        .from('servicos')
        .select('duracao_minutos, nome')
        .eq('id', servicoId)
        .eq('tenant_id', tenantId)
        .eq('ativo', true)
        .single()

    if (sError || !servico) {
        throw new Error('Serviço inválido ou indisponível.')
    }

    // 4. Validar se o slot de horário escolhido ainda está livre
    // Extrai a data YYYY-MM-DD do instante escolhido, no fuso do estabelecimento.
    const dateStr = diaLocal(dataLocal, timezone)

    const slotsLivres = await obterSlotsDisponiveis({
        tenantId,
        dateStr,
        duracaoServicoMinutos: servico.duracao_minutos,
        supabase,
        timezone,
        regrasAcesso,
    })

    const horarioEscolhidoValido = slotsLivres.some((sl) => sl.datetime === dataHora)
    if (!horarioEscolhidoValido) {
        // Funil: abandono por double-booking. Nunca pode afetar o throw abaixo.
        try {
            capturarEventoTenant('booking_failed', tenantId, { motivo: 'slot_indisponivel' })
        } catch (analyticsErr) {
            console.error('[analytics] booking_failed não capturado (ignorado):', analyticsErr)
        }
        throw new Error(
            'Este horário já foi preenchido ou está indisponível. Por favor, selecione outro.',
        )
    }

    // A partir daqui as ESCRITAS usam o cliente PRIVILEGIADO (somente servidor):
    // o visitante é anon e o RLS não permite SELECT em `clientes` (o RETURNING
    // do insert exige visibilidade de SELECT), nem o lookup por telefone —
    // abrir SELECT público de `clientes` exporia dados pessoais. As validações
    // acima (tenant, serviço do mesmo tenant, slot livre) são o porteiro.
    const admin = createAdminClient()

    // 5. Buscar cliente existente com o mesmo telefone para este tenant, ou criar novo
    let clienteId: string

    const { data: clienteExistente, error: cError } = await admin
        .from('clientes')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('telefone', telefoneLimpo)
        .maybeSingle()

    if (cError) {
        console.error('Erro ao buscar cliente existente:', cError.message)
        throw new Error('Erro ao processar dados de contato.')
    }

    if (clienteExistente) {
        clienteId = clienteExistente.id
    } else {
        // Cria novo registro de cliente
        const { data: novoCliente, error: cnError } = await admin
            .from('clientes')
            .insert({
                tenant_id: tenantId,
                nome: clienteNome.trim(),
                telefone: telefoneLimpo,
                email: clienteEmail?.trim() || null,
            })
            .select('id')
            .single()

        if (cnError || !novoCliente) {
            console.error('Erro ao cadastrar novo cliente:', cnError?.message)
            throw new Error('Erro ao processar dados de contato.')
        }
        clienteId = novoCliente.id
    }

    // 6. Inserir o agendamento no banco de dados (status padrão: confirmado)
    const { data: agendamento, error: agError } = await admin
        .from('agendamentos')
        .insert({
            tenant_id: tenantId,
            cliente_id: clienteId,
            servico_id: servicoId,
            data_hora: dataHora,
            status: 'confirmado',
        })
        .select('id, data_hora, status')
        .single()

    if (agError || !agendamento) {
        console.error('Erro ao criar agendamento:', agError?.message)
        // Funil: sem isto o visitante que passou da validação de slot mas caiu
        // no INSERT sumiria do funil sem motivo. Nunca afeta o throw abaixo.
        try {
            capturarEventoTenant('booking_failed', tenantId, { motivo: 'erro_interno' })
        } catch (analyticsErr) {
            console.error('[analytics] booking_failed não capturado (ignorado):', analyticsErr)
        }
        throw new Error('Erro ao confirmar o agendamento.')
    }

    // Funil: agendamento público concluído (sem nome/telefone — nunca PII).
    try {
        capturarEventoTenant('booking_completed', tenantId, {
            servico_duracao_minutos: servico.duracao_minutos,
        })
    } catch (analyticsErr) {
        console.error('[analytics] booking_completed não capturado (ignorado):', analyticsErr)
    }

    // 7. Disparar notificações assíncronas (WhatsApp + QStash).
    // A fase de disparo também precisa do cliente privilegiado: o RLS bloqueia
    // — corretamente — whatsapp_configs para anon (instance_token nunca pode
    // ser público). A função nunca lança — o agendamento nunca quebra.
    await dispararNotificacoesAgendamento(admin, {
        agendamentoId: agendamento.id,
        tenantId,
        clienteNome,
        clienteTelefone,
        dataHora,
        timezone,
    })

    return agendamento
}

/**
 * Busca o perfil da empresa e os seus serviços ativos usando o slug.
 * Apenas o slug efetivo do plano vigente resolve: sem link personalizado no
 * plano, vale o `slug_gratuito` do provisionamento — o customizado deixa de
 * funcionar imediatamente após um downgrade (e volta num re-upgrade).
 */
export async function obterDadosBookingPublico(slug: string) {
    const supabase = await createClient()

    // 1. Buscar perfil pelo slug customizado; se não achar, pelo slug do provisionamento
    let { data: perfil, error: pError } = await supabase
        .from('perfis_empresas')
        .select('*')
        .eq('slug', slug)
        .maybeSingle()

    if (!perfil && !pError) {
        const fallback = await supabase
            .from('perfis_empresas')
            .select('*')
            .eq('slug_gratuito', slug)
            .maybeSingle()
        perfil = fallback.data
        pError = fallback.error
    }

    if (pError || !perfil) {
        return null
    }

    // 2. Validar que o slug acessado é o efetivo para o plano vigente do tenant
    const plano = await obterPlanoVigentePublico(supabase, perfil.tenant_id)
    if (obterSlugEfetivo(perfil, plano) !== slug) {
        return null
    }

    // 3. Buscar serviços ativos desta empresa
    const { data: servicos, error: sError } = await supabase
        .from('servicos')
        .select('*')
        .eq('tenant_id', perfil.tenant_id)
        .eq('ativo', true)
        .order('nome', { ascending: true })

    if (sError) {
        console.error('Erro ao buscar serviços públicos:', sError.message)
        throw new Error('Não foi possível carregar os serviços.')
    }

    // 4. Personalização visual SANITIZADA pelo plano vigente (mesmo padrão do slug
    // efetivo): downgrade não zera as colunas, então o valor persistido é ignorado
    // quando o plano atual não inclui o recurso. Os campos crus são neutralizados
    // no `perfil` para impedir consumo acidental fora deste objeto.
    const recursos = PLANOS[plano].recursos
    const personalizacao = {
        corMarca:
            recursos.corPersonalizada && ehHexValida(perfil.cor_marca) ? perfil.cor_marca : null,
        logoUrl: recursos.logoPersonalizado ? (perfil.logo_url ?? null) : null,
        capaUrl: recursos.capaPersonalizada ? (perfil.capa_url ?? null) : null,
    }

    return {
        perfil: { ...perfil, cor_marca: null, logo_url: null, capa_url: null },
        personalizacao,
        servicos: servicos || [],
    }
}

/**
 * Retorna os slots disponíveis calculados para uma data e duração de serviço.
 */
export async function obterSlotsPublicos(
    tenantId: string,
    dateStr: string,
    duracaoMinutos: number,
) {
    const supabase = await createClient()

    // Fuso e regras de acesso do estabelecimento (SELECT anon permitido em perfis_empresas).
    const { data: perfil } = await supabase
        .from('perfis_empresas')
        .select('timezone, antecedencia_minima_minutos, horizonte_maximo_dias')
        .eq('tenant_id', tenantId)
        .maybeSingle()

    return obterSlotsDisponiveis({
        tenantId,
        dateStr,
        duracaoServicoMinutos: duracaoMinutos,
        supabase,
        timezone: perfil?.timezone || TIMEZONE_PADRAO,
        regrasAcesso: {
            antecedenciaMinutos: perfil?.antecedencia_minima_minutos ?? 15,
            horizonteDias: perfil?.horizonte_maximo_dias ?? 14,
        },
    })
}
