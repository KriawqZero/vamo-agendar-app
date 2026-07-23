/**
 * Encerramento do boot por env ausente — APIs SÓ do runtime Node.
 *
 * ⚠️ Este módulo usa `process.exit`/`process.stderr`, que NÃO existem no runtime
 * edge. Por isso ele é separado de `src/lib/env.ts` (que é edge-safe) e
 * carregado por `import()` DINÂMICO, apenas no branch `NEXT_RUNTIME === 'nodejs'`
 * de `src/instrumentation.ts`. Enquanto ninguém o importar estaticamente a partir
 * de código que também é empacotado para o edge, ele não entra naquele bundle e
 * o Turbopack não acusa "A Node.js API is used ... not supported in the Edge
 * Runtime". Não reintroduza um import estático deste módulo em `instrumentation.ts`.
 *
 * Não há import nenhum no topo, de propósito: um módulo só-Node (`node:fs`)
 * arrastaria dependência desnecessária e a saída por `process.stderr` já resolve.
 */

/**
 * Código de saída do processo quando o boot é abortado por env ausente.
 *
 * Precisa ser ≠ 0: é isso que um orquestrador de deploy (Railway) usa para
 * reprovar a release e reverter sozinho. `0` significaria "encerrou com
 * sucesso" e reintroduziria o falso verde por outro caminho.
 */
export const CODIGO_SAIDA_ENV_AUSENTE = 1

/**
 * Encerra o processo nomeando a variável que faltou, em duas linhas de stderr.
 *
 * A escrita vem ANTES da saída: no Linux `process.stderr` é síncrono para
 * arquivo, TTY e pipe, então a mensagem chega inteira ao log do deploy antes de
 * o processo morrer. Invertida a ordem, o operador perderia a causa.
 */
export function encerrarBootPorEnvAusente(mensagem: string): never {
    process.stderr.write(`[boot] ${mensagem}\n`)
    process.stderr.write(
        `[boot] Encerrando o processo com código ${CODIGO_SAIDA_ENV_AUSENTE} — ` +
            'sem essa configuração a aplicação não tem como servir requisição nenhuma.\n',
    )
    process.exit(CODIGO_SAIDA_ENV_AUSENTE)
}
