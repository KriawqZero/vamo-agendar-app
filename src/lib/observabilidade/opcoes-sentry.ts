/**
 * Opções-base do Sentry — FONTE ÚNICA das travas anti-PII.
 *
 * Os três arquivos de init (`sentry.server.config.ts`, `sentry.edge.config.ts`
 * e `instrumentation-client.ts`) consomem este objeto por spread. Se algum
 * deles montar as opções à mão, a trava vaza por esse arquivo — por isso o
 * teste `src/lib/__tests__/opcoes-sentry.test.ts` afirma sobre ESTE objeto, e
 * não sobre configuração de painel.
 *
 * Sem imports do SDK de propósito (mesmo motivo de `sanitizacao.ts`).
 *
 * ⚠️ `sendDefaultPii` está DEPRECADO e sai no v11 do SDK. Verificado em
 * `@sentry/core@10.67.0` (`build/types/types/options.d.ts:350`): quando
 * `dataCollection` também está definido, **`sendDefaultPii` é ignorado**. Ele
 * fica aqui apenas documentando a intenção; quem de fato governa é o bloco
 * granular abaixo.
 */

export const opcoesBaseSentry = {
    // Só erro nesta etapa. Atenção: sob Turbopack o `treeshake` do
    // `withSentryConfig` é no-op — isto zera o TRÁFEGO de trace, mas o código
    // do tracing continua no bundle. O custo real está medido no SUMMARY.
    tracesSampleRate: 0,
    maxBreadcrumbs: 20,

    // Deprecado; mantido como documentação da intenção. Ver comentário acima.
    sendDefaultPii: false,

    // API viva (verificada em @sentry/core@10.67.0, types/datacollection.d.ts).
    dataCollection: {
        // Nenhum `user.*` populado por instrumentação.
        userInfo: false,
        // `false` = não coletar nada. O default do SDK é `true`.
        cookies: false,
        // Default do SDK coleta os quatro tipos de corpo; `[]` desliga todos.
        httpBodies: [],
        // `urlQueryParams` substitui o `queryParams` deprecado. A querystring de
        // `/book/[slug]` é o vetor de PII mais provável da página pública.
        urlQueryParams: false,
        httpHeaders: {
            request: { deny: ['cookie', 'authorization', 'x-forwarded-for'] },
            response: { deny: ['set-cookie'] },
        },
        // ⚠️ Os dois abaixo são `true` por padrão no SDK e NÃO estavam na
        // pesquisa — são vetores reais de PII neste projeto:
        // - variáveis locais de uma Server Action pública incluem `nome` e
        //   `telefone` do cliente final;
        // - dados de query do banco incluem parâmetros e linhas retornadas,
        //   ou seja, a linha de `clientes`.
        stackFrameVariables: false,
        databaseQueryData: false,
    },
}
// Sem `as const`: os arrays viriam `readonly` e deixariam de ser atribuíveis às
// opções do SDK (`deny: string[]`, `httpBodies: HttpBodyCollectionTarget[]`).
// A trava contra afrouxamento é o teste unitário + o `tsc` dos arquivos de init.
