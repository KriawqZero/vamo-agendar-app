import * as Sentry from '@sentry/nextjs'

import { validarEnvObrigatorio, encerrarBootPorEnvAusente } from './lib/env'

/**
 * Hook de instrumentação do Next. Faz duas coisas, nesta ordem obrigatória.
 *
 * ⚠️ Este hook NÃO roda durante `next build` — verificado no Next 16.2.10
 * instalado (`dist/server/lib/router-utils/instrumentation-globals.external.js`
 * retorna cedo quando `NEXT_PHASE === 'phase-production-build'`). Por isso o
 * `pnpm build` local sem secrets continua funcionando de graça, sem precisar de
 * nenhum guard extra aqui. Em `next start`, a validação de env encerra o
 * processo explicitamente (ver o bloco abaixo), porque o framework sozinho não
 * encerra.
 */
export async function register() {
    // 1) Fail-fast de configuração ANTES de qualquer import dinâmico de
    //    terceiro. Invertido, um env faltando estouraria dentro do init do
    //    Sentry com a mensagem errada.
    //
    //    O try/catch existe por um fato MEDIDO no plano 01-05: o Next 16.2.10
    //    converte a rejeição saída daqui em `unhandledRejection` e SEGUE
    //    escutando na porta, respondendo 500 em toda rota. Para um healthcheck
    //    de liveness isso é um deploy verde com 100% do tráfego falhando — pior
    //    de detectar que um crash loop, que ao menos dispara rollback sozinho.
    //    Por isso o encerramento é explícito.
    //
    //    Guarda de runtime: só no `nodejs`. No runtime edge não existe
    //    `process.exit`, e lá o comportamento anterior (relançar) é preservado.
    try {
        validarEnvObrigatorio()
    } catch (erro) {
        if (process.env.NEXT_RUNTIME === 'nodejs') {
            encerrarBootPorEnvAusente(erro instanceof Error ? erro.message : String(erro))
        }
        throw erro
    }

    // 2) Import DINÂMICO, e isso não é cosmético: o SDK de Node precisa
    //    inicializar antes que as libs instrumentadas (http, undici, pg) sejam
    //    carregadas. Import estático no topo deste arquivo quebra essa ordem.
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        await import('./sentry.server.config')
    }
    if (process.env.NEXT_RUNTIME === 'edge') {
        await import('./sentry.edge.config')
    }
}

/**
 * É ESTA LINHA, e só ela, que faz exceção de Server Action chegar ao Sentry
 * (`routeType: 'action'`). Sem ela, OPE-02 é falso mesmo com o SDK instalado e
 * o DSN configurado. Não remover.
 *
 * ⚠️ Erro lançado DENTRO de `onRequestError` é engolido pelo Next (ele apenas
 * loga e segue) — este hook não serve como caminho de fail-fast.
 */
export const onRequestError = Sentry.captureRequestError
