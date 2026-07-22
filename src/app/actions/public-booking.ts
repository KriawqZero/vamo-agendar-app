'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { obterSlotsDisponiveis } from '@/lib/booking-engine'
import { diaLocal, TIMEZONE_PADRAO } from '@/lib/timezone'
import { dispararNotificacoesAgendamento } from '@/lib/notificacoes-agendamento'
import { PLANOS, obterSlugEfetivo } from '@/lib/planos'
import type { PlanoId } from '@/lib/planos'
import { obterPlanoVigentePublico } from '@/lib/assinaturas'
import { ehHexValida } from '@/lib/cores'
import { capturarEventoTenant } from '@/lib/analytics/server'
import { reportarExcecao } from '@/lib/observabilidade/reportar'
import { erroSinteticoSupabase } from '@/lib/observabilidade/erro-supabase'

// Projeção explícita das leituras públicas. Coluna nova no banco (ex.: cpf_cnpj
// na cobrança) NÃO entra sozinha no payload que vai para o browser — com o
// cliente privilegiado no caminho, pedir a linha inteira seria vazamento por
// omissão. A enumeração completa do que a UI consome está no 01-UI-SPEC §B:
// coluna que falta aqui não estoura erro, some da tela em silêncio.
const COLUNAS_PERFIL_PUBLICO =
    'tenant_id, slug, slug_gratuito, nome_estabelecimento, descricao, instagram, endereco, timezone, antecedencia_minima_minutos, horizonte_maximo_dias, cor_marca, logo_url, capa_url'

const COLUNAS_SERVICO_PUBLICO = 'id, nome, descricao, preco, duracao_minutos'

/**
 * Discriminante FECHADO das falhas esperadas do fluxo público.
 *
 * Por que é um enum de literais e não texto livre: o valor atravessa a fronteira
 * de flight e chega ao navegador de qualquer visitante. Texto livre é porta de
 * saída para mensagem crua do Postgres, slug do visitante, `tenant_id` ou código
 * PostgREST — os quatro proibidos numa caixa visível ao cliente final. A cópia
 * em pt-BR mora no cliente (`src/app/book/[slug]/mensagens.ts`); o servidor
 * devolve só o discriminante.
 *
 * Mesmo vocabulário de `src/lib/whatsapp-helper.ts` (`{ ok: false, motivo }`),
 * que já era o formato do projeto. Os membros que o caminho de LEITURA não
 * produz existem para o caminho de ESCRITA (plano 01-12) — declarar os sete de
 * uma vez evita duas edições do mesmo tipo.
 */
export type MotivoPublico =
    | 'campos_obrigatorios'
    | 'telefone_invalido'
    | 'data_invalida'
    | 'slug_invalido'
    | 'servico_invalido'
    | 'slot_indisponivel'
    | 'erro_interno'

/** Falhas que a resolução de perfil e a busca de slots sabem produzir. */
type MotivoLeituraPublica = Extract<MotivoPublico, 'slug_invalido' | 'erro_interno'>

/**
 * Linha de `perfis_empresas` projetada por `COLUNAS_PERFIL_PUBLICO`. O tipo é
 * DERIVADO da própria consulta (o projeto usa SQL puro, sem tipos gerados): se
 * um dia houver tipagem do banco, este alias a herda sem edição.
 */
type PerfilPublicoLinha = NonNullable<Awaited<ReturnType<typeof lerPerfilPor>>['data']>

/** Slots devolvidos pela engine de disponibilidade — formato é contrato anti double-booking. */
type SlotPublico = Awaited<ReturnType<typeof obterSlotsDisponiveis>>[number]

export type ResolucaoPerfil =
    | { ok: true; perfil: PerfilPublicoLinha; plano: PlanoId }
    | { ok: false; motivo: MotivoLeituraPublica }

export type ResultadoSlots =
    { ok: true; slots: SlotPublico[] } | { ok: false; motivo: MotivoLeituraPublica }

/** Linha devolvida pelo `RETURNING` do INSERT de agendamento — forma inalterada. */
export interface AgendamentoCriado {
    id: string
    data_hora: string
    status: string
}

/**
 * Retorno do caminho de ESCRITA do booking público.
 *
 * Mesma regra da leitura, pelo mesmo motivo medido: em build de produção a
 * `.message` de uma exceção de Server Action NÃO atravessa a fronteira de
 * flight (vira `1:E{"digest":"…"}`), então erro esperado precisa ser VALOR. A
 * consequência concreta de não ser: `BookingApp` decidia a recuperação de
 * double-booking comparando a mensagem com uma substring, comparação que era
 * sempre falsa em produção — o visitante que perdia a corrida ficava preso na
 * etapa de contato olhando para um horário que não existe mais.
 */
export type ResultadoAgendamentoPublico =
    { ok: true; agendamento: AgendamentoCriado } | { ok: false; motivo: MotivoPublico }

/** Leitura crua do perfil por uma das duas colunas de slug (customizado / provisionado). */
async function lerPerfilPor(admin: SupabaseClient, coluna: 'slug' | 'slug_gratuito', slug: string) {
    return admin
        .from('perfis_empresas')
        .select(COLUNAS_PERFIL_PUBLICO)
        .eq(coluna, slug)
        .maybeSingle()
}

/**
 * Resolve o estabelecimento a partir do slug da URL — sempre no SERVIDOR.
 *
 * É a única porta de entrada do caminho público: o `tenant_id` (org_id do Clerk)
 * nunca chega do navegador, ele sai daqui. Busca pelo slug customizado, cai no
 * `slug_gratuito` do provisionamento e só devolve o perfil se o slug acessado
 * for o efetivo do plano vigente (downgrade invalida o customizado na hora).
 *
 * Devolve valor DISCRIMINADO, nunca `null`: "slug não existe" é condição de
 * negócio (`slug_invalido`) e "não consegui ler" é falha de infraestrutura
 * (`erro_interno`, que já vai ao Sentry). Colapsar as duas em `null` era o que
 * transformava indisponibilidade do banco em 404 silencioso.
 *
 * Recebe o cliente PRIVILEGIADO: a role anon perdeu a Data API nesta fase.
 */
async function resolverPerfilPublicoPorSlug(
    admin: SupabaseClient,
    slug: string,
): Promise<ResolucaoPerfil> {
    let { data: perfil, error: pError } = await lerPerfilPor(admin, 'slug', slug)

    if (!perfil && !pError) {
        const fallback = await lerPerfilPor(admin, 'slug_gratuito', slug)
        perfil = fallback.data
        pError = fallback.error
    }

    if (pError) {
        // Erro de leitura com service role é falha de infraestrutura, não
        // "slug não existe": sem isto a página vira 404 silencioso e ninguém
        // fica sabendo. O slug nunca entra no contexto (é dado do visitante).
        console.error('Erro ao resolver perfil público pelo slug:', pError.message)
        reportarExcecao(erroSinteticoSupabase(pError), {
            fluxo: 'booking_publico',
            etapa: 'resolver_perfil',
        })
        return { ok: false, motivo: 'erro_interno' }
    }

    if (!perfil) {
        // Condição de NEGÓCIO: link errado ou agenda que não existe. Não vai ao
        // Sentry — encheria a fila de erro com digitação de visitante.
        return { ok: false, motivo: 'slug_invalido' }
    }

    // Plano vigente com o MESMO cliente privilegiado (ver JSDoc de
    // obterPlanoVigentePublico): cliente anônimo degradaria todo tenant pago
    // para gratuito em silêncio. O tenant_id vem do perfil resolvido acima.
    const plano = await obterPlanoVigentePublico(admin, perfil.tenant_id)
    if (obterSlugEfetivo(perfil, plano) !== slug) {
        return { ok: false, motivo: 'slug_invalido' }
    }

    return { ok: true, perfil, plano }
}

interface AgendamentoPublicoParams {
    slug: string
    servicoId: string
    dataHora: string // ISO string em UTC
    clienteNome: string
    clienteTelefone: string // WhatsApp
    clienteEmail?: string
}

/**
 * Cria um agendamento público (B2C) sem exigência de autenticação do cliente final.
 *
 * Recebe o `slug` da URL, nunca o `tenant_id`: o tenant é resolvido no servidor,
 * então nenhum valor vindo do navegador escolhe em qual tenant se escreve.
 *
 * ⚠️ Falha ESPERADA é valor de retorno discriminado, nunca `throw` — ver o JSDoc
 * de `ResultadoAgendamentoPublico`. A cópia em pt-BR de cada motivo mora no
 * cliente (`src/app/book/[slug]/mensagens.ts`); daqui sai só o discriminante.
 */
export async function criarAgendamentoPublico({
    slug,
    servicoId,
    dataHora,
    clienteNome,
    clienteTelefone,
    clienteEmail,
}: AgendamentoPublicoParams): Promise<ResultadoAgendamentoPublico> {
    // 1. Sanitizar e validar dados de entrada básicos
    if (!slug || !servicoId || !dataHora || !clienteNome || !clienteTelefone) {
        return { ok: false, motivo: 'campos_obrigatorios' }
    }

    const telefoneLimpo = clienteTelefone.replace(/\D/g, '')
    if (telefoneLimpo.length < 10 || telefoneLimpo.length > 11) {
        return { ok: false, motivo: 'telefone_invalido' }
    }

    const dataLocal = new Date(dataHora)
    if (isNaN(dataLocal.getTime())) {
        return { ok: false, motivo: 'data_invalida' }
    }

    // Todo o caminho público (leituras e escritas) usa o cliente PRIVILEGIADO:
    // a role anon perdeu a Data API nesta fase. O preço disso é que o RLS não
    // filtra mais nada aqui — cada query abaixo carrega o `tenant_id` resolvido
    // no servidor a partir do slug, e a projeção de colunas é explícita.
    const admin = createAdminClient()

    // 2. Resolver o estabelecimento pelo slug (valida existência e slug efetivo
    // do plano vigente) e obter o fuso e as regras de acesso.
    const resolvido = await resolverPerfilPublicoPorSlug(admin, slug)

    // O motivo é PROPAGADO, não achatado em `slug_invalido`: "link errado" e
    // "não consegui ler o perfil" são condições diferentes (negócio x
    // infraestrutura, e só a segunda já foi ao Sentry lá dentro), e o cliente
    // merece a cópia certa de cada uma.
    if (!resolvido.ok) {
        return { ok: false, motivo: resolvido.motivo }
    }

    const { perfil: tenant } = resolvido
    const tenantId: string = tenant.tenant_id

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
    const { data: servico, error: sError } = await admin
        .from('servicos')
        .select('duracao_minutos, nome')
        .eq('id', servicoId)
        .eq('tenant_id', tenantId)
        .eq('ativo', true)
        .single()

    if (sError || !servico) {
        return { ok: false, motivo: 'servico_invalido' }
    }

    // 4. Validar se o slot de horário escolhido ainda está livre
    // Extrai a data YYYY-MM-DD do instante escolhido, no fuso do estabelecimento.
    const dateStr = diaLocal(dataLocal, timezone)

    const slotsLivres = await obterSlotsDisponiveis({
        tenantId,
        dateStr,
        duracaoServicoMinutos: servico.duracao_minutos,
        supabase: admin,
        timezone,
        regrasAcesso,
    })

    const horarioEscolhidoValido = slotsLivres.some((sl) => sl.datetime === dataHora)
    if (!horarioEscolhidoValido) {
        // Funil: abandono por double-booking. Nunca pode afetar o retorno abaixo
        // (antes protegia um `throw`; a intenção é a mesma, o transporte mudou).
        try {
            capturarEventoTenant('booking_failed', tenantId, { motivo: 'slot_indisponivel' })
        } catch (analyticsErr) {
            console.error('[analytics] booking_failed não capturado (ignorado):', analyticsErr)
        }
        // ⚠️ É ESTE discriminante que a recuperação de double-booking em
        // `BookingApp` consome (solta o slot morto, refaz a grade, mostra o
        // aviso âmbar) e é dele que o Success Criteria 4 da Phase 2 depende.
        return { ok: false, motivo: 'slot_indisponivel' }
    }

    // As ESCRITAS abaixo dependem do mesmo cliente privilegiado: o visitante é
    // anon e o RLS não permite SELECT em `clientes` (o RETURNING do insert
    // exige visibilidade de SELECT), nem o lookup por telefone — abrir SELECT
    // público de `clientes` exporia dados pessoais. As validações acima
    // (tenant resolvido do slug, serviço do mesmo tenant, slot livre) são o
    // porteiro que substitui o RLS.

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
        // Fluxo B2C: a mensagem amigável apaga a causa raiz e o cliente final
        // vai embora sem reclamar. Reportar ANTES de devolver, sem nenhum dado
        // do cliente — nem no contexto, nem no objeto de erro: a `.message` do
        // Postgres embute literais do input (`invalid input syntax … "…"`).
        // Virar valor de retorno não pode apagar este detector: `erro_interno`
        // é o que o visitante vê, o `etapa` é o que quem investiga vê.
        reportarExcecao(erroSinteticoSupabase(cError), {
            fluxo: 'booking_publico',
            etapa: 'buscar_cliente',
        })
        return { ok: false, motivo: 'erro_interno' }
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
            reportarExcecao(erroSinteticoSupabase(cnError, 'cadastro_cliente_sem_retorno'), {
                fluxo: 'booking_publico',
                etapa: 'cadastrar_cliente',
            })
            return { ok: false, motivo: 'erro_interno' }
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
        // É literalmente o critério de sucesso do milestone quebrando: o
        // agendamento real não caiu na agenda do profissional.
        reportarExcecao(erroSinteticoSupabase(agError, 'agendamento_sem_retorno'), {
            fluxo: 'booking_publico',
            etapa: 'criar_agendamento',
        })
        // Funil: sem isto o visitante que passou da validação de slot mas caiu
        // no INSERT sumiria do funil sem motivo. Nunca afeta o retorno abaixo.
        try {
            capturarEventoTenant('booking_failed', tenantId, { motivo: 'erro_interno' })
        } catch (analyticsErr) {
            console.error('[analytics] booking_failed não capturado (ignorado):', analyticsErr)
        }
        return { ok: false, motivo: 'erro_interno' }
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

    return { ok: true, agendamento }
}

/**
 * Busca o perfil da empresa e os seus serviços ativos usando o slug.
 * Apenas o slug efetivo do plano vigente resolve: sem link personalizado no
 * plano, vale o `slug_gratuito` do provisionamento — o customizado deixa de
 * funcionar imediatamente após um downgrade (e volta num re-upgrade).
 */
export async function obterDadosBookingPublico(slug: string) {
    // Leitura pública inteira no cliente PRIVILEGIADO (a role anon perdeu a
    // Data API nesta fase). Com o RLS fora do caminho, o filtro por tenant e a
    // lista de colunas passam a ser a defesa — ambos ficam no helper e nas
    // constantes de projeção deste módulo (mitigações 1 e 2 da D-02).
    const admin = createAdminClient()

    // 1. Resolver o perfil pelo slug (customizado ou do provisionamento) e
    // validar que o slug acessado é o efetivo do plano vigente.
    const resolvido = await resolverPerfilPublicoPorSlug(admin, slug)

    // `null` aqui é o contrato com `page.tsx`, que o converte em `notFound()`:
    // esta função é chamada de Server Component, não de código de cliente.
    if (!resolvido.ok) {
        return null
    }

    const { perfil, plano } = resolvido

    // 2. Buscar serviços ativos desta empresa. `ativo` e `tenant_id` são
    // colunas de FILTRO — não precisam (nem devem) estar na projeção que viaja
    // para o browser.
    const { data: servicos, error: sError } = await admin
        .from('servicos')
        .select(COLUNAS_SERVICO_PUBLICO)
        .eq('tenant_id', perfil.tenant_id)
        .eq('ativo', true)
        .order('nome', { ascending: true })

    if (sError) {
        console.error('Erro ao buscar serviços públicos:', sError.message)
        // ⚠️ ÚNICA exceção que sobrou neste arquivo, e ela é legítima — a regra
        // cabe numa frase: `throw` só vale onde nenhum `catch` de navegador
        // consome a `.message`. Esta função é chamada de `page.tsx` (Server
        // Component), não de código de cliente: a exceção cai no error boundary
        // do SERVIDOR, nunca numa caixa vermelha do navegador, e por isso a
        // mensagem não precisa (nem consegue) atravessar flight.
        //
        // Não "consertar" por simetria com as outras dez: convertê-la em valor
        // obrigaria `page.tsx` a distinguir "não achei" de "não consegui ler"
        // para chamar `notFound()`, sem nenhum ganho para o cliente final.
        throw new Error('Não foi possível carregar os serviços.')
    }

    // 3. Personalização visual SANITIZADA pelo plano vigente (mesmo padrão do slug
    // efetivo): downgrade não zera as colunas, então o valor persistido é ignorado
    // quando o plano atual não inclui o recurso. Os campos crus são neutralizados
    // no `perfil` para impedir consumo acidental fora deste objeto.
    // ⚠️ Com a leitura no cliente privilegiado (RLS bypassado), esta sanitização
    // é a ÚNICA defesa: sem ela, tenant gratuito passa a exibir cor/logo/capa
    // pagas — regressão visual E de monetização, silenciosa nas duas pontas.
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
 *
 * Recebe o `slug` da URL: o tenant, o fuso e as regras de acesso são resolvidos
 * no servidor. Se o slug não resolver (caso real: downgrade de plano invalida o
 * slug customizado com a aba do cliente aberta), a função FALHA — antes ela caía
 * em fuso e regras padrão e devolvia uma grade calculada errada, sem sintoma.
 *
 * ⚠️ Falha esperada é VALOR DE RETORNO, nunca `throw`, e isto foi medido, não
 * inferido: com `throw`, a resposta de flight em build de produção era, na
 * íntegra, `1:E{"digest":"…"}` — a mensagem é apagada pelo React em produção
 * (`emitErrorChunk(request, id, digest)`, contra a assinatura de seis
 * argumentos do bundle de desenvolvimento). O cliente via texto de framework em
 * inglês na caixa vermelha, e em `pnpm dev` tudo parecia funcionar.
 * `scripts/verificar-travessia-server-action.sh` é a trava que impede a
 * regressão voltar sem ninguém ver.
 */
export async function obterSlotsPublicos(
    slug: string,
    dateStr: string,
    duracaoMinutos: number,
): Promise<ResultadoSlots> {
    const admin = createAdminClient()

    const resolvido = await resolverPerfilPublicoPorSlug(admin, slug)

    if (!resolvido.ok) {
        // Só o discriminante atravessa: a cópia em pt-BR da caixa vermelha vive
        // em `src/app/book/[slug]/mensagens.ts` e é escolhida no cliente.
        console.error('Slug público não resolvido ao buscar horários:', resolvido.motivo)
        return resolvido
    }

    const { perfil } = resolvido

    const slots = await obterSlotsDisponiveis({
        tenantId: perfil.tenant_id,
        dateStr,
        duracaoServicoMinutos: duracaoMinutos,
        supabase: admin,
        timezone: perfil.timezone || TIMEZONE_PADRAO,
        regrasAcesso: {
            antecedenciaMinutos: perfil.antecedencia_minima_minutos ?? 15,
            horizonteDias: perfil.horizonte_maximo_dias ?? 14,
        },
    })

    return { ok: true, slots }
}
