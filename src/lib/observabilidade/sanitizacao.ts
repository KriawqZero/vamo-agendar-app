/**
 * Sanitização anti-PII de eventos e breadcrumbs do Sentry.
 *
 * ZERO imports — nem o SDK do Sentry, nem tipos dele. O tipo estrutural mínimo
 * é declarado aqui de propósito: assim as funções ficam testáveis em Vitest sem
 * puxar `@sentry/node` + instrumentações OTel para dentro da suíte, e nenhuma
 * variável nova precisa entrar no `vitest.config.ts`.
 *
 * ⚠️ Isto é defesa em profundidade, NÃO a única barreira. O SDK já não manda
 * cookie nem corpo de requisição por padrão (só o tamanho inferido do
 * `content-length`), e `opcoesBaseSentry` desliga as categorias na origem. Esta
 * camada existe porque `/book/[slug]` é a página onde o cliente final digita
 * nome e telefone, e ali "quase certo" não serve.
 */

interface RequisicaoDoEvento {
    method?: string
    url?: string
    headers?: unknown
    query_string?: unknown
    data?: unknown
    cookies?: unknown
}

// Sem index signature de propósito: com ela, os tipos `ErrorEvent` e
// `Breadcrumb` do SDK deixam de ser atribuíveis a estas interfaces e os hooks
// `beforeSend`/`beforeBreadcrumb` não aceitam estas funções.
export interface FormatoDeEvento {
    request?: RequisicaoDoEvento
    user?: unknown
    extra?: Record<string, unknown>
}

/**
 * ALLOWLIST das chaves de `extra`.
 *
 * `extra` é onde `reportarExcecao` escreve o contexto por construção
 * (`captureException(erro, { extra: contexto })`), e o tipo do parâmetro é um
 * `Record<string, …>`: nada impede uma fase futura de escrever
 * `reportarExcecao(err, { email: destinatario })`. Denylist falharia em
 * silêncio nesse dia; allowlist obriga uma linha explícita aqui, que é a
 * revisão que a regra "nunca PII" precisa ter.
 */
const CHAVES_DE_EXTRA_PERMITIDAS = new Set([
    'fluxo',
    'etapa',
    'rotulo',
    'statusCode',
    'motivo',
    'tenantHash',
])

/**
 * ALLOWLIST dos campos de `request`. Tudo o que não estiver aqui — `data`
 * (corpo da Server Action), `cookies`, `query_string`, `env` e qualquer campo
 * que o SDK passe a mandar amanhã — é removido por construção.
 */
const CAMPOS_DE_REQUISICAO_PERMITIDOS = new Set(['method', 'url', 'headers'])

/**
 * ALLOWLIST dos headers. `user-agent` fica porque é o que dá atribuição de
 * navegador/SO aos erros de `/book/[slug]` — a razão de o Sentry de browser
 * existir nesta etapa. Os headers de IP (`x-real-ip`, `cf-connecting-ip`,
 * `true-client-ip`, `forwarded`) caem aqui por não estarem na lista: IP de
 * cliente final é dado pessoal sob a LGPD, e o Railway põe `x-real-ip` em
 * toda requisição.
 */
const HEADERS_PERMITIDOS = new Set(['content-type', 'accept-language', 'user-agent'])

/** Apaga do objeto toda chave fora da allowlist. Muta no lugar. */
function manterSomente(
    alvo: Record<string, unknown>,
    permitidas: Set<string>,
    insensivelACaixa = false,
): void {
    for (const chave of Object.keys(alvo)) {
        const comparavel = insensivelACaixa ? chave.toLowerCase() : chave
        if (!permitidas.has(comparavel)) delete alvo[chave]
    }
}

/** Verdadeiro para objeto navegável (exclui `null` e arrays de propósito). */
function ehObjeto(valor: unknown): valor is Record<string, unknown> {
    return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

export interface FormatoDeBreadcrumb {
    category?: string
    data?: { url?: unknown }
}

export interface FormatoDeLog {
    level?: string
    message?: string
    attributes?: Record<string, unknown>
}

/**
 * ALLOWLIST das chaves de `attributes` de log operacional.
 */
const ATRIBUTOS_DE_LOG_PERMITIDOS = new Set([
    'fluxo',
    'etapa',
    'operacao',
    'resultado',
    'provider',
    'motivo',
    'statusCode',
    'tenantHash',
    'agendamentoHash',
    'runtime',
    'tentativa',
    'retry',
    'duracaoMs',
])

/**
 * `beforeSendLog`: reduz `attributes` à sua allowlist e nega qualquer PII.
 */
export function sanitizarLogSentry<T extends FormatoDeLog>(log: T): T {
    if (log && typeof log === 'object' && log.attributes && typeof log.attributes === 'object') {
        const novosAtributos: Record<string, unknown> = {}
        for (const [chave, valor] of Object.entries(log.attributes)) {
            if (
                ATRIBUTOS_DE_LOG_PERMITIDOS.has(chave) ||
                chave.startsWith('sentry.') ||
                chave.startsWith('server.')
            ) {
                if (
                    typeof valor === 'string' ||
                    typeof valor === 'number' ||
                    typeof valor === 'boolean'
                ) {
                    novosAtributos[chave] = valor
                }
            }
        }
        log.attributes = novosAtributos
    }
    return log
}

/**
 * Categorias de breadcrumb que NUNCA saem deste processo.

 *
 * `console` é a mais perigosa do projeto inteiro, e não por hipótese: o
 * breadcrumb de console carrega `message` (texto formatado) E `data.arguments`
 * (os objetos crus). Dois caminhos reais passam por ali —
 * `whatsapp-helper.ts` loga o corpo de erro da Evolution (nome e telefone do
 * cliente final ecoados no payload) e o corpo de erro do QStash, cuja URL de
 * destino embute `?secret=<QSTASH_CURRENT_SIGNING_KEY>`. Um breadcrumb fica no
 * isolation scope da requisição e é anexado ao PRÓXIMO evento capturado, então
 * um contexto de reporte limpo não protege nada.
 */
const CATEGORIAS_DE_BREADCRUMB_DESCARTADAS = new Set(['console'])

/** Remove querystring E fragmento de uma URL, preservando o resto. */
function semQuerystring(url: string): string {
    return url.split(/[?#]/)[0]
}

/**
 * `beforeSend`: reduz `request` e `extra` às suas allowlists e nega o IP.
 *
 * ⚠️ ALLOWLIST onde é viável, denylist onde não é — a diferença importa e está
 * registrada em `docs/PENDENCIAS.md`. `request`, `request.headers` e `extra`
 * são allowlist: campo novo do SDK cai fora por construção. `message`,
 * `exception.values[].value`, `contexts` e `tags` NÃO são filtrados, porque
 * reduzi-los quebraria o agrupamento e a própria utilidade do evento; a
 * proteção deles é na origem (nenhum call site manda objeto de erro cru — ver
 * `erroSinteticoSupabase`).
 *
 * Genérica sobre o formato do evento para ser atribuível ao hook do SDK sem
 * briga de tipo. Evento sem `request` passa incólume, sem lançar.
 */
export function sanitizarEventoSentry<T extends FormatoDeEvento>(evento: T): T {
    // Escrita via `Record` para não brigar com o genérico `T` na atribuição.
    const bruto = evento as unknown as Record<string, unknown>

    const requisicao = bruto.request
    if (ehObjeto(requisicao)) {
        manterSomente(requisicao, CAMPOS_DE_REQUISICAO_PERMITIDOS)

        if (typeof requisicao.url === 'string') {
            requisicao.url = semQuerystring(requisicao.url)
        }
        if (ehObjeto(requisicao.headers)) {
            manterSomente(requisicao.headers, HEADERS_PERMITIDOS, true)
        }
    }

    if (ehObjeto(bruto.extra)) {
        manterSomente(bruto.extra, CHAVES_DE_EXTRA_PERMITIDAS)
    }

    // `delete evento.user` deixaria o campo ausente, e campo ausente devolve a
    // decisão de inferir IP para o toggle do painel do Sentry — exatamente o
    // que o CONTEXT proíbe. `ip_address: null` é a instrução explícita de não
    // guardar o IP, e vive no código versionado.
    bruto.user = { ip_address: null }

    return evento
}

/**
 * `beforeBreadcrumb`: devolver `null` DESCARTA o breadcrumb (contrato do SDK).
 *
 * Duas barreiras, nesta ordem:
 * 1. categoria descartada por allowlist invertida — nada de `console` sai;
 * 2. breadcrumbs de fetch/xhr guardam a URL completa em `data.url`, e a
 *    querystring de `/book/[slug]` pode carregar contato do cliente final.
 *
 * A trava (1) é redundante com a remoção da integração `Console` nos arquivos
 * de init, e isso é proposital: a integração é configuração, esta função é
 * código com teste. Breadcrumb sem `data.url` passa incólume.
 */
export function sanitizarBreadcrumb<T extends FormatoDeBreadcrumb>(breadcrumb: T): T | null {
    if (typeof breadcrumb.category === 'string') {
        if (CATEGORIAS_DE_BREADCRUMB_DESCARTADAS.has(breadcrumb.category)) return null
    }
    if (breadcrumb.data && typeof breadcrumb.data.url === 'string') {
        breadcrumb.data.url = semQuerystring(breadcrumb.data.url)
    }
    return breadcrumb
}
