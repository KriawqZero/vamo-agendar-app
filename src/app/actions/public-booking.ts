'use server'

import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { obterSlotsDisponiveis } from '@/lib/booking-engine'
import { diaLocal, TIMEZONE_PADRAO } from '@/lib/timezone'
import { dispararNotificacoesAgendamento } from '@/lib/notificacoes-agendamento'
import { PLANOS, obterSlugEfetivo } from '@/lib/planos'
import type { PlanoId } from '@/lib/planos'
import { obterPlanoVigentePublico } from '@/lib/assinaturas'
import { ehHexValida } from '@/lib/cores'
import { capturarEventoServidor, capturarEventoTenant } from '@/lib/analytics/server'
import {
    hashChaveRateLimit,
    ipDoVisitante,
    verificarLimite,
    verificarLimiteSemConsumir,
} from '@/lib/rate-limit'
import type { AtributosLogOperacional } from '@/lib/observabilidade/log'
import { logOperacionalAguardando } from '@/lib/observabilidade/log'
import { emitirDepoisDaResposta } from '@/lib/observabilidade/apos-resposta'
import { permitirEmissao } from '@/lib/observabilidade/emissao'
import {
    reportarExcecao,
    reportarFalhaSilenciosa,
    reportarFalhaSilenciosaAguardando,
} from '@/lib/observabilidade/reportar'
import { hashTenantId } from '@/lib/observabilidade/hash'
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
/**
 * Janela mínima entre dois Sentry LOGS de ROTINA do endpoint público (bloqueio
 * de rate limit, captura de honeypot), por causa e por processo.
 *
 * ⚠️ O throttle é a metade do CR-03 que o `after()` sozinho não resolve. Sem
 * ele, cada requisição barrada emite um evento — e quantas requisições existem é
 * escolha do ATACANTE. A cota do Sentry vira alvo, e ela acaba exatamente durante
 * o ataque que deveria estar sinalizando. O caminho do honeypot era o pior: nunca
 * passa por `verificarLimite`, então é literalmente um endpoint sem teto.
 *
 * O que se perde é pequeno e conhecido: sob flood, o log caso-a-caso vira uma
 * amostra por minuto por camada em vez de uma linha por requisição — e as linhas
 * descartadas seriam todas iguais. O VOLUME continua medido com fidelidade total
 * pelo PostHog, que é quem responde "quanto está sendo barrado" e por isso não é
 * amostrado. Fora de ataque, bloqueio é raro e nada é descartado.
 */
const INTERVALO_LOG_ROTINA_MS = 60_000

/**
 * Janela mínima entre duas Issues do teto por tenant, POR TENANT.
 *
 * Mais larga que a de rotina porque o alarme do D-12 precisa alcançar um humano
 * UMA vez, não trinta. A chave inclui o `tenantHash` para que o ataque a um
 * tenant não silencie o alarme de outro; o `Map` cresce com o número de tenants
 * reais (o `tenant_id` vem do perfil resolvido no banco, nunca do visitante),
 * então não é vetor de crescimento sem teto.
 */
const INTERVALO_ISSUE_TETO_TENANT_MS = 15 * 60_000

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
/**
 * Emite o Sentry Log de rotina do endpoint público sem segurar a resposta e sem
 * deixar o atacante escolher o volume (CR-03).
 *
 * Duas travas, cada uma para um defeito diferente: `permitirEmissao` corta a
 * repetição, e `emitirDepoisDaResposta` tira o `Sentry.flush(2000)` da frente do
 * visitante mantendo a entrega garantida (`after()` do Next — o runtime segura a
 * invocação até o callback terminar). A variante AGUARDADA continua sendo a usada
 * lá dentro: o incidente 260724 perdeu evento por fire-and-forget puro, e isso
 * não volta.
 */
function logarRotinaDepoisDaResposta(
    chaveDoThrottle: string,
    codigo: string,
    atributos: AtributosLogOperacional,
): void {
    if (!permitirEmissao(chaveDoThrottle, INTERVALO_LOG_ROTINA_MS)) return

    emitirDepoisDaResposta(() => logOperacionalAguardando.warn(codigo, atributos))
}

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
 * `muitas_tentativas` é o nono, da Phase 3: rate limit estourado devolve erro
 * HONESTO, nunca sucesso falso (D-07) — CGNAT de operadora faz clientes reais
 * dividirem IP, e "ela acha que agendou e não agendou" é o pior desfecho
 * possível para a confiança no produto.
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
    | 'muitas_tentativas'

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
 *
 * `muitas_tentativas` entrou aqui na Phase 3 pela MESMA razão, e só aqui: quem
 * produz o bloqueio é a guarda de leitura desta função. Alargar
 * `MotivoLeituraPublica` para acomodá-lo tornaria aquele tipo mentiroso — a
 * resolução de perfil não sabe produzir estouro de rate limit.
 */
type MotivoSlotsPublicos =
    | MotivoLeituraPublica
    | Extract<MotivoPublico, 'data_invalida' | 'servico_invalido' | 'muitas_tentativas'>

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
    /**
     * Campo ARMADILHA (honeypot) do formulário público — nome deliberadamente
     * neutro no fio, para que nem o payload nem o bundle denunciem a armadilha.
     * Pessoa real nunca o preenche (é invisível, fora da tabulação e não
     * anunciado por leitor de tela); vindo preenchido, quem enviou é bot.
     */
    infoAdicional?: string
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
    infoAdicional,
}: AgendamentoPublicoParams): Promise<ResultadoAgendamentoPublico> {
    // ⚠️ HONEYPOT — a PRIMEIRA instrução do corpo, antes até das validações de
    // graça, e a única resposta MENTIROSA deste arquivo inteiro.
    //
    // Por que primeiro: custo zero e independência total do resto do payload. Um
    // bot de formulário raramente preenche o resto direito, e a armadilha não
    // pode depender de `dataHora` ser parseável para funcionar — quem caiu já se
    // identificou no primeiro campo.
    //
    // Por que SUCESSO e não erro, e por que só aqui (D-07): bot que recebe erro
    // tenta de novo — com outro IP, outro telefone, outra sessão; bot que recebe
    // sucesso vai embora. A mentira só se justifica onde a certeza de ser bot é
    // ALTA, e ela é alta exatamente aqui: o campo é invisível, está fora da
    // ordem de tabulação, não é anunciado por leitor de tela e não casa com
    // vocabulário de autofill (ver o comentário do campo em `EtapaContato.tsx`).
    // No rate limit a certeza é bem menor — CGNAT de operadora faz clientes
    // REAIS dividirem IP —, e por isso lá o erro é honesto (`muitas_tentativas`)
    // e nunca sucesso falso: "ela acha que agendou e não agendou" é o pior
    // desfecho possível para a confiança no produto.
    //
    // O que a captura NÃO faz, e cada ausência é deliberada: não instancia o
    // cliente privilegiado, não gasta comando no Redis, não resolve slug, não
    // grava cliente, não roda a engine, não faz INSERT, não dispara WhatsApp nem
    // agenda lembrete. Um agendamento fantasma na agenda do profissional seria
    // pior que o spam que a armadilha existe para barrar.
    if (typeof infoAdicional === 'string' && infoAdicional.trim().length > 0) {
        // Telemetria da captura (D-11), com os mesmos dois destinos do bloqueio
        // de rate limit e pela mesma razão: captura é ROTINA de endpoint
        // público, então vive como Log pesquisável e taxa agregada — nunca como
        // Sentry Issue, que fica reservada ao que exige ação do owner.
        //
        // O evento do PostHog tem uma segunda função, e ela é a mais importante:
        // é o DETECTOR de falso-positivo. Se a taxa de captura for incompatível
        // com o tráfego de bot esperado, o que está preenchendo o campo é o
        // autofill do navegador — ou seja, PESSOA REAL recebendo sucesso falso,
        // o pior desfecho nomeado no D-07. Sem esse número, o defeito seria
        // invisível: ninguém reclama de um agendamento que a tela confirmou.
        //
        // `booking_completed` NÃO sai daqui: o funil do owner não pode contar
        // bot como cliente.
        //
        // O log vai pelo caminho THROTTLADO e DIFERIDO (CR-03), e este era o
        // ponto mais grave dos cinco: a captura nunca passa por
        // `verificarLimite`, então um `Sentry.flush(2000)` aguardado aqui fazia
        // de um endpoint SEM TETO um amplificador — cada requisição de bot
        // segurava um slot do servidor esperando uma ida de rede a terceiro. A
        // entrega continua garantida (o `flush` só saiu da frente da resposta).
        //
        // O evento do PostHog NÃO é throttlado, de propósito: é ele o detector
        // de falso-positivo de autofill, e detector amostrado não detecta.
        try {
            logarRotinaDepoisDaResposta('honeypot.captura', 'honeypot.captura', {
                fluxo: 'booking_publico',
            })
            // Sem propriedades: o slug é dado do VISITANTE, não do tenant
            // resolvido (a captura acontece antes de qualquer resolução), e
            // nome/telefone do payload jamais atravessam para fornecedor
            // terceiro.
            capturarEventoServidor('booking_honeypot')
        } catch (telemetriaErr) {
            // Observabilidade que falha nunca muda a resposta — aqui com um
            // agravante próprio: um erro devolvido ao bot o faria tentar de novo,
            // que é exatamente o que a armadilha existe para evitar.
            console.error('[honeypot] telemetria da captura não emitida (ignorada):', telemetriaErr)
        }

        // Forma IDÊNTICA a `AgendamentoCriado` — o bot precisa acreditar que
        // agendou. O fallback de data cobre payload malformado sem lançar: `new
        // Date()` aqui não é preguiça, é o que impede a armadilha de virar 500
        // (e 500 é erro, e erro faz o bot voltar).
        //
        // ⚠️ `randomUUID` IMPORTADO de `node:crypto`, nunca o global (WR-05): o
        // global existe a partir do Node 19 e o repositório passou a pinar
        // `engines: node >= 20` justamente por não ter como garantir isso antes.
        // Num runtime mais antigo, o global seria `ReferenceError` → 500 — e 500
        // é exatamente a resposta que faz o bot voltar, ou seja, a falha
        // inverteria o objetivo da armadilha no seu ponto mais sensível. O
        // comentário acima mostra que o risco foi pensado para a data e não para
        // o UUID.
        return {
            ok: true,
            agendamento: {
                id: randomUUID(),
                data_hora:
                    typeof dataHora === 'string' && dataHora ? dataHora : new Date().toISOString(),
                status: 'confirmado',
            },
        }
    }

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

    // ⚠️ RATE LIMIT POR IP — a posição é o desenho, e ela tem DOIS lados.
    //
    // Vem DEPOIS das validações acima porque todas elas são síncronas e de
    // graça: payload lixo não merece gastar um comando no Redis. E vem ANTES de
    // `createAdminClient()` pelo mesmo motivo do comentário-manifesto de
    // `obterSlotsPublicos` (padrão 01-18): a diferença entre recusar de graça e
    // recusar depois de já ter pago duas consultas ao banco. Um script que
    // repete a requisição não deve conseguir empurrar carga para o Supabase.
    //
    // A camada de IP é a mais FOLGADA das três da fase (10/10 min): CGNAT de
    // operadora móvel faz clientes distintos dividirem o mesmo IP, e um salão
    // que acabou de divulgar o link recebe rajada legítima. As camadas que
    // apertam de verdade (telefone e teto do tenant) entram depois da resolução
    // do slug, porque o `tenant_id` só nasce lá — plano 03-03.
    //
    // `verificarLimite` NUNCA lança e devolve PASSE quando o fornecedor falha
    // (fail-open, D-02): Redis fora do ar não pode ser o que impede um
    // agendamento real de chegar à agenda. O bloqueio é valor discriminado, como
    // toda falha esperada deste arquivo — nunca `throw`.
    const ipDoCliente = await ipDoVisitante()
    if (!(await verificarLimite('escrita_ip', [ipDoCliente]))) {
        // Bloqueio MUDO é bloqueio que ninguém consegue calibrar. A telemetria
        // tem dois destinos, cada um respondendo a uma pergunta diferente
        // (D-11): o Sentry Log responde "qual camada barrou qual chave" e é
        // pesquisável caso a caso; o PostHog responde "quanto está sendo
        // barrado" e é a taxa agregada que diz se 10/10 min está apertado
        // demais para CGNAT.
        //
        // A Sentry ISSUE NÃO é um dos destinos, e a ausência é deliberada:
        // bloqueio de IP é condição ESPERADA de um endpoint público, igual à
        // perda de corrida do `23P01` mais abaixo. Issue de rotina é como o
        // owner para de olhar a ferramenta — a Issue fica reservada ao teto por
        // tenant e à falha do Redis, que exigem ação humana.
        //
        // O log continua com ENTREGA GARANTIDA (`Sentry.flush`), mas emitido
        // depois da resposta e com throttle (CR-03): aguardá-lo em linha fazia
        // rejeitar custar mais que aceitar, exatamente sob flood. O `chaveHash` é
        // o MESMO hash usado na chave do contador — correlaciona log e Redis sem
        // que o IP exista em nenhum dos dois.
        try {
            logarRotinaDepoisDaResposta('ratelimit.bloqueio:escrita_ip', 'ratelimit.bloqueio', {
                fluxo: 'booking_publico',
                camada: 'escrita_ip',
                // IP indeterminável devolve `null` e a camada vira PASSE
                // (CR-04), então na prática este ramo sempre tem IP — o `?:`
                // existe para que o tipo não obrigue a inventar um placeholder
                // que viraria um `chaveHash` mentiroso no Sentry.
                chaveHash: ipDoCliente ? hashChaveRateLimit(ipDoCliente) : undefined,
            })
            // Variante Servidor, e não Tenant: aqui o slug ainda não foi
            // resolvido, então não existe `tenant_id` para atribuir o evento.
            capturarEventoServidor('booking_rate_limited', { camada: 'escrita_ip' })
        } catch (telemetriaErr) {
            // Mesmo padrão protegido do ramo `23P01`: observabilidade que
            // falha nunca pode mudar a resposta que o visitante recebe.
            console.error(
                '[rate-limit] telemetria de bloqueio não emitida (ignorada):',
                telemetriaErr,
            )
        }

        return { ok: false, motivo: 'muitas_tentativas' }
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

    // ⚠️ CAMADAS 2 e 3 DO RATE LIMIT — telefone e teto por tenant.
    //
    // POR QUE AQUI, e não na fronteira junto com a de IP: a chave exata destas
    // duas só existe DEPOIS da resolução. Usar o slug como chave dobraria o
    // orçamento de cada tenant, porque `slug` e `slug_gratuito` são dois textos
    // que abrem a MESMA agenda — um script alternando entre os dois teria o
    // dobro do limite de graça. Trocar exatidão por antecedência aqui seria
    // trocar a defesa pela aparência dela.
    //
    // O custo dessa escolha está pago e é pequeno: quem chega até esta linha já
    // passou pela camada de IP e as duas consultas de resolução são indexadas.
    // O que o bloqueio economiza é tudo o que vem DEPOIS — serviço, engine de
    // disponibilidade, RPC e INSERT —, que é onde mora o custo real do caminho.
    //
    // As duas correm em PARALELO de propósito: o cliente legítimo paga a
    // latência de UMA ida ao Redis, não de duas somadas (ABU-02/D-06). Nenhuma
    // das duas lança, e as duas devolvem PASSE se o fornecedor falhar (D-02).
    //
    // ⚠️ ASSIMETRIA DELIBERADA entre as duas, e é ela que fecha o CR-02/WR-02: a
    // de telefone CONSUME (é ela que precisa contar tentativa, porque tentativa
    // repetida com o mesmo número é exatamente o abuso que o D-08 mira), a de
    // tenant só CONSULTA. Enquanto as duas consumiam, uma requisição já
    // condenada pelo bloqueio de telefone ainda queimava o token do tenant, e
    // uma requisição com `servicoId` lixo também — 30 delas negavam agendamento
    // a um tenant inteiro por uma hora, sem criar nada. O token do tenant sai
    // agora depois do INSERT, onde "criação" quer dizer criação.
    const [passouTelefone, passouTenant] = await Promise.all([
        // Telefone + tenant: o mesmo número agendando em dois estabelecimentos
        // são dois baldes. Telefone JÁ normalizado, senão a formatação digitada
        // escolheria o balde.
        verificarLimite('escrita_telefone', [telefoneLimpo, tenantId]),
        verificarLimiteSemConsumir('teto_tenant', [tenantId]),
    ])

    if (!passouTelefone) {
        // Bloqueio de telefone é ROTINA — mesma natureza do bloqueio de IP: log
        // pesquisável + taxa agregada, e NENHUMA Issue. O que muda em relação à
        // camada de IP é a variante do PostHog: aqui o tenant já existe, e a
        // taxa POR TENANT é o que responde "esta agenda está sendo atacada?".
        try {
            logarRotinaDepoisDaResposta(
                'ratelimit.bloqueio:escrita_telefone',
                'ratelimit.bloqueio',
                {
                    fluxo: 'booking_publico',
                    camada: 'escrita_telefone',
                    chaveHash: hashChaveRateLimit(telefoneLimpo),
                    tenantHash: hashTenantId(tenantId),
                },
            )
            capturarEventoTenant('booking_rate_limited', tenantId, {
                camada: 'escrita_telefone',
            })
        } catch (telemetriaErr) {
            console.error(
                '[rate-limit] telemetria de bloqueio por telefone não emitida (ignorada):',
                telemetriaErr,
            )
        }

        return { ok: false, motivo: 'muitas_tentativas' }
    }

    if (!passouTenant) {
        // ⚠️ ESTE é o único bloqueio da fase que vira Sentry ISSUE (D-12).
        //
        // Estourar 30 criações numa hora, somadas TODAS as origens, não é um
        // cliente insistente: é ataque distribuído em andamento — alguém que já
        // derrotou as camadas de IP e telefone rotativando ambos. O teto não
        // impede o enchimento total do horizonte de um tenant pequeno (risco
        // ACEITO pelo owner), ele desacelera o ataque para que este alarme tenha
        // tempo de alcançar um humano. É o cenário "ataque às 3h da manhã": sem
        // Issue, o profissional descobre pela agenda lotada de nomes falsos.
        //
        // Mensagem SINTÉTICA e ESTÁTICA, variante AGUARDADA, tenant só como
        // hash — os três contratos de mensageria do CLAUDE.md, pelos três
        // motivos: agrupamento que não estilhaça sob ataque, evento que não se
        // perde quando o runtime congela no `return`, e invariante nunca-PII.
        //
        // O que mudou com o CR-03: as duas emissões saem DEPOIS da resposta e a
        // Issue é throttlada por tenant. Este era o pior caso de latência da
        // fase — dois `Sentry.flush(2000)` aguardados em série no mesmo ramo, e
        // um ramo que só acontece sob ataque, ou seja, exatamente quando segurar
        // slots do servidor é mais caro.
        const chaveIssueDoTenant = `ratelimit:teto_tenant_atingido:${hashTenantId(tenantId)}`
        try {
            logarRotinaDepoisDaResposta('ratelimit.bloqueio:teto_tenant', 'ratelimit.bloqueio', {
                fluxo: 'booking_publico',
                camada: 'teto_tenant',
                tenantHash: hashTenantId(tenantId),
            })
            capturarEventoTenant('booking_rate_limited', tenantId, { camada: 'teto_tenant' })
            // ACRÉSCIMO à telemetria de rotina, nunca substituição: o alarme
            // sozinho chegaria sem o histórico que permite dimensionar o ataque.
            if (permitirEmissao(chaveIssueDoTenant, INTERVALO_ISSUE_TETO_TENANT_MS)) {
                emitirDepoisDaResposta(() =>
                    reportarFalhaSilenciosaAguardando('ratelimit:teto_tenant_atingido', {
                        fluxo: 'booking_publico',
                        camada: 'teto_tenant',
                        tenantHash: hashTenantId(tenantId),
                    }),
                )
            }
        } catch (telemetriaErr) {
            console.error(
                '[rate-limit] telemetria do teto por tenant não emitida (ignorada):',
                telemetriaErr,
            )
        }

        return { ok: false, motivo: 'muitas_tentativas' }
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

    // ⚠️ AQUI, e só aqui, o token do teto por tenant é consumido (CR-02): o
    // agendamento já existe na agenda do profissional, então "30 por hora" volta
    // a significar 30 CRIAÇÕES por hora — que é o que o D-09 decidiu e o que a
    // documentação sempre afirmou. O retorno é ignorado de propósito: a decisão
    // de bloquear já foi tomada lá em cima, com a consulta sem consumo; o que
    // esta chamada faz é registrar o fato consumado para a PRÓXIMA requisição.
    //
    // Awaited, e não diferido: o contador só vale alguma coisa se for confiável,
    // e o custo é uma ida ao Redis com teto de 500 ms e fail-open — irrisório ao
    // lado do disparo de notificações que vem logo abaixo. Este é o caminho de
    // SUCESSO, que o atacante não consegue amplificar de graça.
    await verificarLimite('teto_tenant', [tenantId])

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
        clienteNome: nomeLimpo,
        clienteTelefone: telefoneLimpo,
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
    // ⚠️ SEM RATE LIMIT, e a ausência é decisão registrada — não esquecimento.
    //
    // O contrato desta função é `null` → `notFound()` em `page.tsx`. Um teto
    // aqui não teria como devolver "muitas tentativas": o bloqueio viraria
    // 404, e um visitante legítimo atrás de CGNAT veria "estabelecimento não
    // existe" — indistinguível de link quebrado, e o pior desfecho possível
    // para a confiança no produto. A função de LEITURA que ganhou teto é
    // `obterSlotsPublicos`, que tem canal de erro discriminado.
    //
    // ⚠️ O argumento de UX acima sustenta a decisão sozinho, e é só ele. O
    // argumento de CUSTO que acompanhava esta decisão foi RETIRADO (WR-08): ele
    // dizia "uma requisição por VISITA (o page load), contra dezenas de
    // consultas de grade na mesma sessão", e essa contagem assume comportamento
    // de NAVEGADOR — precisamente o que o modelo de ameaça rejeita em todo o
    // resto deste arquivo ("qualquer um lê o id da Server Action no bundle e
    // chama com o payload que quiser"). Um script chama esta action num laço:
    // quatro consultas com cliente privilegiado por requisição, sem teto algum.
    //
    // Risco residual nomeado e medido pelo eixo certo (carga no Supabase, não
    // número de page loads). Desvio do D-06 ratificado pelo owner em
    // 2026-07-27; reavaliação em fase futura se o page load virar alvo medido.
    //
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

    // ⚠️ TETO DE LEITURA POR IP — a quarta e última camada da fase.
    //
    // Esta é a função que um script martelaria: varrer a grade de um horizonte
    // inteiro para mapear a agenda (ou só para custar consultas ao Supabase)
    // significa repetir ESTA chamada, não o page load. Por isso é aqui que o
    // teto de leitura mora, e não em `obterDadosBookingPublico` — cujo contrato
    // `null` → `notFound()` transformaria bloqueio em 404 (ver o comentário
    // no topo daquela função).
    //
    // A posição repete o padrão 01-18 pelas duas razões de sempre: DEPOIS das
    // validações síncronas acima, porque payload lixo não merece gastar um
    // comando na cota do Redis; e ANTES de `createAdminClient()`, porque o que
    // o bloqueio precisa economizar é justamente a consulta ao banco que o
    // martelo estava buscando provocar.
    //
    // 60/min é BEM folgado de propósito (D-06/D-10): sessão legítima nunca
    // alcança, e a UI reusa a caixa de erro que já existe desde o 03-01 —
    // nenhuma copy nova, nenhuma fricção nova.
    const ipDoLeitor = await ipDoVisitante()
    if (!(await verificarLimite('leitura_ip', [ipDoLeitor]))) {
        // Mesmos dois destinos do bloqueio de escrita por IP, e nenhuma Issue:
        // barrar leitura num endpoint público é rotina, e Issue de rotina é
        // como o owner para de olhar a ferramenta bem na hora em que ela
        // importa. Variante SERVIDOR do PostHog porque o slug ainda não foi
        // resolvido — não existe tenant a quem atribuir o evento.
        try {
            logarRotinaDepoisDaResposta('ratelimit.bloqueio:leitura_ip', 'ratelimit.bloqueio', {
                fluxo: 'booking_publico',
                camada: 'leitura_ip',
                // Mesma razão do bloqueio de escrita: sem IP a camada libera
                // (CR-04), então aqui o IP existe.
                chaveHash: ipDoLeitor ? hashChaveRateLimit(ipDoLeitor) : undefined,
            })
            capturarEventoServidor('booking_rate_limited', { camada: 'leitura_ip' })
        } catch (telemetriaErr) {
            console.error(
                '[rate-limit] telemetria de bloqueio de leitura não emitida (ignorada):',
                telemetriaErr,
            )
        }

        return { ok: false, motivo: 'muitas_tentativas' }
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
