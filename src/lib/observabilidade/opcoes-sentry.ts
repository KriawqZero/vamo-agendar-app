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

/**
 * Nome da integração de console no SDK — verificado em
 * `@sentry/core@10.67.0` (`build/cjs/integrations/console.js:12`).
 */
export const NOME_INTEGRACAO_CONSOLE = 'Console'

/**
 * Remove a integração `Console` da lista de defaults do SDK.
 *
 * `consoleIntegration()` é DEFAULT nos runtimes de servidor e de edge (não no
 * browser, onde o breadcrumb de console vem da `breadcrumbsIntegration`). Ela
 * transforma todo `console.error` do projeto em breadcrumb com `message` e
 * `data.arguments`, e é lá que a PII e o `?secret=` do QStash moram. O browser
 * já desliga isso em `instrumentation-client.ts`; esta função é a mesma trava
 * para servidor e edge.
 */
export function semIntegracaoDeConsole<T extends { name: string }>(integracoes: T[]): T[] {
    return integracoes.filter((integracao) => integracao.name !== NOME_INTEGRACAO_CONSOLE)
}

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
        // ⚠️ ALLOWLIST, e o motivo é estrutural: definir `dataCollection`
        // troca a BASE de defaults do SDK — `resolveDataCollectionOptions.js:18`
        // passa a usar o conjunto permissivo em vez do conjunto de
        // `sendDefaultPii: false`. Com isso, um `deny` nosso SUBSTITUI a
        // PII_HEADER_SNIPPETS embutida (`['forwarded','-ip','remote-','via','-user']`)
        // em vez de somar a ela — `x-real-ip` (que o Railway põe em toda
        // requisição), `cf-connecting-ip`, `true-client-ip` e o header
        // `Forwarded` voltariam a ser coletados. Com allowlist, header novo
        // fica de fora por construção.
        httpHeaders: {
            request: { allow: ['content-type', 'accept-language', 'user-agent'] },
            response: { allow: ['content-type'] },
        },
        // Sem IA no projeto hoje. Vinha `true/true` do conjunto permissivo, ou
        // seja: uma trava desligada sem ninguém ter decidido isso.
        genAI: { inputs: false, outputs: false },
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
