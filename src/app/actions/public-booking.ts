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
import { reportarExcecao, reportarFalhaSilenciosa } from '@/lib/observabilidade/reportar'
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
 * Formato exigido de `dateStr` na fronteira pública: `YYYY-MM-DD`.
 *
 * É deliberadamente a MESMA regex que o fluxo AUTENTICADO usa em
 * `src/app/actions/agendamentos.ts` (`obterSlotsDashboard`). A simetria é o
 * ponto: era o fluxo anônimo que estava validando MENOS que o autenticado, e foi
 * esse contraste dentro do próprio repositório que mostrou que a ausência de
 * validação aqui era acidente, não decisão de produto.
 */
const FORMATO_DATA_ISO = /^\d{4}-\d{2}-\d{2}$/

/**
 * Teto de duração aceito na fronteira pública: um dia inteiro.
 *
 * Seguro por construção, e por isso não recusa nada que o produto saiba servir:
 * as janelas de `horarios_funcionamento` são horas DENTRO de um dia, então o
 * maior intervalo livre possível tem 1440 minutos e uma duração acima disso
 * jamais produziria candidato — hoje ela devolveria uma lista vazia silenciosa.
 * O teto troca essa lista vazia por um discriminante honesto.
 */
const DURACAO_MAXIMA_MINUTOS = 24 * 60

/**
 * Tetos e formato dos campos de contato na fronteira pública de ESCRITA.
 *
 * `clientes.nome`/`clientes.email` são `text` SEM limite no banco
 * (`supabase/schemas/06_clientes.sql`), e o insert usa o cliente PRIVILEGIADO
 * com o RLS fora do jogo — então a única defesa contra uma requisição anônima
 * gravar um nome de 200 mil caracteres como linha real, ou empurrar um e-mail
 * malformado para o fluxo Resend, é esta validação no app. O nome vazio já cai
 * em `campos_obrigatorios` lá em cima; o que faltava era o TETO superior.
 *
 * 254 é o limite de endereço da RFC 5321. A regex é o mínimo honesto — um `@`
 * com domínio —, não uma validação canônica de e-mail (que não existe por
 * regex, e que a Fricção Zero não justifica): o objetivo aqui é barrar lixo
 * óbvio e limitar tamanho, não recusar endereços exóticos porém válidos.
 */
const NOME_MAXIMO_CARACTERES = 120
const EMAIL_MAXIMO_CARACTERES = 254
const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * A data existe mesmo no calendário?
 *
 * A regex sozinha não basta: `2027-13-45` casa com `\d{4}-\d{2}-\d{2}` e passaria
 * direto. Sem esta segunda checagem, mês 13 e dia 45 voltam a produzir grade
 * calculada errada SEM SINTOMA — que é exatamente o defeito, e não um detalhe.
 * O teste é o de sempre: reserializar o instante e exigir a mesma string de volta
 * (o `Date` normaliza `2027-13-45` para outro dia, então a igualdade quebra).
 *
 * Ancorado em UTC de propósito: aqui só se decide se a string É uma data, nunca
 * qual instante ela representa — a interpretação no fuso do tenant continua sendo
 * assunto exclusivo de `src/lib/timezone.ts`.
 */
function ehDataDeCalendario(dateStr: string): boolean {
    const instante = new Date(`${dateStr}T00:00:00Z`)
    return !isNaN(instante.getTime()) && instante.toISOString().slice(0, 10) === dateStr
}

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
 * produz existem para o caminho de ESCRITA (plano 01-12) — declarar os sete
 * originais de uma vez evita duas edições do mesmo tipo. `email_invalido` é o
 * oitavo, acrescentado pelo CR-02: e-mail malformado é algo que um cliente REAL
 * digita (campo opcional), então merece cópia honesta própria em vez de ser
 * colapsado em `campos_obrigatorios` — só ele exigiu literal novo, porque o teto
 * de nome reusa `campos_obrigatorios` (nome gigante é ataque, não UX).
 */
export type MotivoPublico =
    | 'campos_obrigatorios'
    | 'telefone_invalido'
    | 'data_invalida'
    | 'slug_invalido'
    | 'servico_invalido'
    | 'slot_indisponivel'
    | 'erro_interno'
    | 'email_invalido'

/** Falhas que a resolução de perfil sabe produzir. */
type MotivoLeituraPublica = Extract<MotivoPublico, 'slug_invalido' | 'erro_interno'>

/**
 * Falhas que a busca de SLOTS sabe produzir — vista mais larga que
 * `MotivoLeituraPublica`, e de propósito.
 *
 * Por que não alargar `MotivoLeituraPublica` em vez de criar este alias: aquele
 * tipo descreve o que a RESOLUÇÃO DE PERFIL produz, e a resolução não sabe
 * produzir `data_invalida` nem `servico_invalido`. Cada alias diz exatamente o
 * que o seu produtor produz; alargar o do vizinho para caber a validação de
 * entrada desta função tornaria os dois tipos menos verdadeiros.
 *
 * Todos os membros continuam pertencendo a `MotivoPublico`, então
 * `mensagemDeMotivo` os aceita sem edição e os dois `Record` exaustivos de
 * `src/app/book/[slug]/mensagens.ts` seguem compilando intactos — nenhuma cópia
 * nova precisa ser escrita, porque as duas já estavam contratadas lá.
 */
type MotivoSlotsPublicos =
    MotivoLeituraPublica | Extract<MotivoPublico, 'data_invalida' | 'servico_invalido'>

/**
 * Linha de `perfis_empresas` projetada por `COLUNAS_PERFIL_PUBLICO`. O tipo é
 * DERIVADO da própria consulta (o projeto usa SQL puro, sem tipos gerados): se
 * um dia houver tipagem do banco, este alias a herda sem edição.
 */
type PerfilPublicoLinha = NonNullable<Awaited<ReturnType<typeof lerPerfilPor>>['data']>

/** Slots devolvidos pela engine de disponibilidade — formato é contrato anti double-booking. */
type SlotPublico = Awaited<ReturnType<typeof obterSlotsDisponiveis>>[number]

/**
 * `degradadoPorErro` viaja junto do plano de propósito: quem consome a
 * resolução precisa saber que o `plano` acima é um PADRÃO CONSERVADOR e não uma
 * leitura confirmada. Sem esse campo, o consumidor não tem como distinguir
 * "este tenant é gratuito" de "não deu para saber", e foi essa confusão que
 * derrubou o link público de tenant pagante (WR-07).
 */
export type ResolucaoPerfil =
    | { ok: true; perfil: PerfilPublicoLinha; plano: PlanoId; degradadoPorErro: boolean }
    | { ok: false; motivo: MotivoLeituraPublica }

export type ResultadoSlots =
    { ok: true; slots: SlotPublico[] } | { ok: false; motivo: MotivoSlotsPublicos }

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
 * nunca chega do navegador, ele sai daqui. Procura o slug nas DUAS colunas do
 * namespace público (o customizado e o do provisionamento) e só devolve o perfil
 * se o slug acessado for o efetivo do plano vigente (downgrade invalida o
 * customizado na hora).
 *
 * ⚠️ As duas buscas são feitas SEMPRE, e não mais encadeadas por fallback. O
 * fallback era o sequestro do CR-03: `slug` e `slug_gratuito` são um namespace
 * só, e casar na primeira query servia a página do tenant A para quem visitou o
 * link de provisionamento do tenant B — junto dos agendamentos de B, com nome e
 * telefone dos clientes finais dele. A constraint `perfis_empresas_slug_gratuito_key`
 * e a checagem cruzada de `salvarPerfilEmpresa` impedem colisão NOVA; esta
 * recusa é o que cobre as linhas que já existem.
 *
 * Custo assumido: uma consulta indexada a mais por carregamento de página
 * pública. As duas correm em paralelo, então o custo é de conexão, não de
 * latência somada — e é o preço de não servir o tenant errado.
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
    // Duas consultas `.eq()` separadas, NUNCA um filtro `or(...)` montado com o
    // slug: o slug é dado do visitante, e interpolar valor de URL numa string de
    // filtro do PostgREST é injeção de filtro. Fechar o sequestro abrindo uma
    // injeção seria o pior resultado possível.
    const [porCustomizado, porProvisionamento] = await Promise.all([
        lerPerfilPor(admin, 'slug', slug),
        lerPerfilPor(admin, 'slug_gratuito', slug),
    ])

    const pError = porCustomizado.error ?? porProvisionamento.error

    if (!pError && porCustomizado.data && porProvisionamento.data) {
        if (porCustomizado.data.tenant_id !== porProvisionamento.data.tenant_id) {
            // O invariante do namespace foi violado: o mesmo texto é o slug
            // customizado de um tenant e o de provisionamento de outro. Não é
            // condição de negócio, é SINTOMA — vai ao Sentry. Recusar é a única
            // resposta segura: qualquer escolha entre os dois serviria a página
            // (e a agenda) de um tenant a quem visitou o link do outro.
            //
            // Nem o slug (dado do visitante) nem os `tenant_id` entram no
            // contexto. Quem investigar roda o self-join de `a.slug =
            // b.slug_gratuito` com `tenant_id` diferente — a mesma consulta de
            // pré-voo da migration 20260722185755.
            console.error('Namespace de slug ambíguo entre dois tenants na resolução pública.')
            reportarFalhaSilenciosa('booking:namespace_slug_ambiguo', {
                fluxo: 'booking_publico',
                etapa: 'resolver_perfil',
            })
            return { ok: false, motivo: 'slug_invalido' }
        }
        // Mesmo tenant nas duas colunas: é o caso trivial de quem nunca
        // personalizou o link (`slug === slug_gratuito`). Segue normalmente.
    }

    const perfil = porCustomizado.data ?? porProvisionamento.data

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
    const { plano, degradadoPorErro } = await obterPlanoVigentePublico(admin, perfil.tenant_id)

    if (degradadoPorErro) {
        // ⚠️ JANELA DE PLANO INDETERMINADO — a decisão está aqui, escrita, para
        // não ser reconstruída por quem ler depois.
        //
        // Assimetria proposital: PERMISSIVO NA DISPONIBILIDADE, RESTRITIVO NO
        // QUE É PAGO. Sem esta condicional, a comparação por slug efetivo roda
        // com o padrão conservador 'gratuito' e invalida o slug customizado —
        // ou seja, uma falha de leitura de trinta segundos responde 404 para os
        // clientes de um tenant pagante, sem alerta e indistinguível de "essa
        // agenda não existe". É o Core Value do projeto quebrando por um soluço
        // de infraestrutura. A metade restritiva mora em
        // `obterDadosBookingPublico`, onde a personalização é forçada a
        // gratuito: o link fica no ar, mas nada pago aparece.
        //
        // O afrouxamento é ESTE e nada mais: aceita-se o slug acessado se ele
        // for uma das duas colunas do namespace público do perfil já
        // encontrado. Continua valendo a exigência de o perfil existir e
        // continua valendo — logo acima, antes de qualquer leitura de plano — a
        // recusa de resolução ambígua entre tenants do plano 01-14.
        //
        // RISCO RESIDUAL, nomeado e aceito (T-01-16-06): durante a janela de
        // falha, um tenant que fez downgrade recentemente teria o slug
        // customizado antigo voltando a resolver. É transitório, não expõe dado
        // de terceiro e não exibe nada pago. Reverter para o comportamento
        // fechado é apagar este bloco — e o reporte ao Sentry, que é o ganho
        // maior, sobrevive nas duas escolhas.
        if (slug !== perfil.slug && slug !== perfil.slug_gratuito) {
            return { ok: false, motivo: 'slug_invalido' }
        }
    } else if (obterSlugEfetivo(perfil, plano) !== slug) {
        // Caminho normal, INTACTO: só o slug efetivo do plano vigente resolve,
        // e um downgrade invalida o customizado na hora. É a regra de produto.
        return { ok: false, motivo: 'slug_invalido' }
    }

    return { ok: true, perfil, plano, degradadoPorErro }
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

    // Teto de nome — última defesa contra linha de tamanho arbitrário gravada
    // por requisição anônima (ver JSDoc de NOME_MAXIMO_CARACTERES). O piso `< 1`
    // também barra nome só de espaços em branco, que passaria pelo `!clienteNome`
    // acima (string truthy) e viraria uma linha vazia no banco. Nome longo é
    // ataque, não UX: reusa `campos_obrigatorios`, sem cópia nova.
    const nomeLimpo = clienteNome.trim()
    if (nomeLimpo.length < 1 || nomeLimpo.length > NOME_MAXIMO_CARACTERES) {
        return { ok: false, motivo: 'campos_obrigatorios' }
    }

    // E-mail é OPCIONAL: só valida se veio preenchido. Formato mínimo (um `@`
    // com domínio) + teto RFC 5321. E-mail malformado um cliente real digita, e
    // ele tem discriminante honesto próprio (`email_invalido`).
    const emailLimpo = clienteEmail?.trim()
    if (
        emailLimpo &&
        (emailLimpo.length > EMAIL_MAXIMO_CARACTERES || !FORMATO_EMAIL.test(emailLimpo))
    ) {
        return { ok: false, motivo: 'email_invalido' }
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

    // 5. Reaproveitar ou criar o cliente ATOMICAMENTE (D-01, AGE-05).
    // O antigo select-then-insert tinha uma janela de corrida: duas requisições
    // simultâneas com o mesmo telefone liam "não existe" e inseriam duas linhas.
    // A RPC `reaproveitar_ou_criar_cliente` faz `INSERT ... ON CONFLICT
    // (tenant_id, telefone) DO UPDATE` com COALESCE — cria se não existe, senão
    // só completa o que falta (nome curado nunca é sobrescrito; e-mail vazio é
    // preenchido) e devolve o id numa única ida ao banco. Campos já saneados na
    // seção 1 — mesma fonte para validação e escrita.
    const { data: clienteId, error: cError } = await admin.rpc('reaproveitar_ou_criar_cliente', {
        p_tenant_id: tenantId,
        p_telefone: telefoneLimpo,
        p_nome: nomeLimpo,
        p_email: emailLimpo || null,
    })

    if (cError || !clienteId) {
        console.error('Erro ao reaproveitar/criar cliente:', cError?.message)
        // Fluxo B2C: a mensagem amigável apaga a causa raiz e o cliente final
        // vai embora sem reclamar. Reportar ANTES de devolver, sem nenhum dado
        // do cliente — nem no contexto, nem no objeto de erro: a `.message` do
        // Postgres embute literais do input (`invalid input syntax … "…"`).
        // Virar valor de retorno não pode apagar este detector: `erro_interno`
        // é o que o visitante vê, o `etapa` é o que quem investiga vê.
        reportarExcecao(erroSinteticoSupabase(cError, 'cliente_sem_retorno'), {
            fluxo: 'booking_publico',
            etapa: 'buscar_cliente',
        })
        return { ok: false, motivo: 'erro_interno' }
    }

    // 6. Inserir o agendamento no banco de dados (status padrão: confirmado).
    // `data_hora_fim` é gravado no ato da reserva (D-02): é dele que a engine
    // deriva a ocupação da agenda e é ele que a exclusion constraint compara —
    // editar a duração do serviço depois NÃO move o término já marcado. O
    // instante final é o início mais a duração do serviço já em escopo.
    const dataHoraFim = new Date(
        dataLocal.getTime() + servico.duracao_minutos * 60_000,
    ).toISOString()

    const { data: agendamento, error: agError } = await admin
        .from('agendamentos')
        .insert({
            tenant_id: tenantId,
            cliente_id: clienteId,
            servico_id: servicoId,
            data_hora: dataHora,
            data_hora_fim: dataHoraFim,
            status: 'confirmado',
        })
        .select('id, data_hora, status')
        .single()

    // Perda de corrida (D-05, AGE-04): a exclusion constraint `ag_sem_sobreposicao`
    // fechou o TOCTOU que a revalidação da engine (item 4) deixa aberto — outro
    // cliente confirmou o mesmo horário no intervalo entre a validação e este
    // INSERT. `23P01` = exclusion_violation (SQLSTATE, estável entre versões;
    // nunca comparar a .message, que embute org_id e o horário de terceiro). É
    // condição ESPERADA: devolve o MESMO discriminante que o BookingApp já
    // consome (solta o slot morto, refaz a grade, mostra o aviso âmbar) e NUNCA
    // chama reportarExcecao — reportar perda de corrida inundaria o Sentry.
    // Este ramo vem ANTES do erro_interno genérico de propósito.
    if (agError?.code === '23P01') {
        // Funil: abandono por double-booking, mesmo padrão protegido de :442-446.
        // Nunca afeta o retorno abaixo.
        try {
            capturarEventoTenant('booking_failed', tenantId, { motivo: 'slot_indisponivel' })
        } catch (analyticsErr) {
            console.error('[analytics] booking_failed não capturado (ignorado):', analyticsErr)
        }
        return { ok: false, motivo: 'slot_indisponivel' }
    }

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

    const { perfil, plano, degradadoPorErro } = resolvido

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
    //
    // É aqui que mora a metade RESTRITIVA da decisão tomada em
    // `resolverPerfilPublicoPorSlug`: com o plano indeterminado, a sanitização é
    // forçada ao nível gratuito. A forçagem é EXPLÍCITA de propósito, mesmo que
    // hoje `plano` já venha 'gratuito' na degradação — depender desse detalhe
    // faria de qualquer mudança futura no padrão conservador um vazamento de
    // recurso pago, e essa é a última defesa que sobrou nesta tela.
    const recursos = degradadoPorErro ? PLANOS.gratuito.recursos : PLANOS[plano].recursos
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
    // ⚠️ VALIDAÇÃO NA FRONTEIRA — e ela vem ANTES de tudo de propósito: antes de
    // `createAdminClient()`, antes de resolver o slug, antes do primeiro `await`.
    // A ordem não é estética, é a diferença entre recusar de graça e recusar
    // depois de já ter pago duas consultas ao banco.
    //
    // Os três argumentos desta função vêm de um navegador SEM SESSÃO: qualquer
    // um lê o id da Server Action no bundle de /book/<slug> e chama com o payload
    // que quiser. São entrada hostil por definição.
    //
    // `duracaoMinutos` em particular alimenta a condição de parada de um laço
    // SÍNCRONO na engine (`candidato + duracaoMinutos <= b`, em
    // `src/lib/booking-engine.ts`). Negativo, o valor deixa de limitar a grade ao
    // intervalo livre e passa a limitá-la à própria magnitude, linearmente.
    // Medido por HTTP contra build de produção, slug real, sem sessão:
    // `-5000000` custou 26.751 ms e 19,29 MB numa ÚNICA requisição — e não é
    // espera de I/O, é o event loop parado para TODAS as requisições em voo.
    // A Fricção Zero proíbe CAPTCHA, então validar a entrada é a única defesa
    // disponível. `scripts/verificar-travessia-server-action.sh` (vereditos
    // ENTRADA_HOSTIL e DATA_HOSTIL) é a trava que impede a regressão voltar.
    //
    // Nada do que chega aqui é logado nem reportado: é dado de visitante, e
    // entrada malformada é condição esperada — logar cada uma seria transformar
    // o mesmo endpoint num vetor de inundação de log.
    if (!FORMATO_DATA_ISO.test(dateStr) || !ehDataDeCalendario(dateStr)) {
        return { ok: false, motivo: 'data_invalida' }
    }

    if (
        !Number.isInteger(duracaoMinutos) ||
        duracaoMinutos <= 0 ||
        duracaoMinutos > DURACAO_MAXIMA_MINUTOS
    ) {
        return { ok: false, motivo: 'servico_invalido' }
    }

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
