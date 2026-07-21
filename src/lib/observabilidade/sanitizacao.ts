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
    url?: string
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
}

export interface FormatoDeBreadcrumb {
    category?: string
    data?: { url?: unknown }
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
 * `beforeSend`: corta querystring, corpo, cookies e identidade de usuário.
 * Genérica sobre o formato do evento para ser atribuível ao hook do SDK sem
 * briga de tipo. Evento sem `request` passa incólume, sem lançar.
 */
export function sanitizarEventoSentry<T extends FormatoDeEvento>(evento: T): T {
    if (evento.request) {
        if (typeof evento.request.url === 'string') {
            evento.request.url = semQuerystring(evento.request.url)
        }
        delete evento.request.query_string
        delete evento.request.data
        delete evento.request.cookies
    }
    delete evento.user
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
