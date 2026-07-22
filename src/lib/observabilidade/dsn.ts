/**
 * Leitura do DSN do Sentry — fonte única para os arquivos de init e para a
 * borda de reporte.
 *
 * ⚠️ O acesso DINÂMICO vem primeiro, e isso não é estilo:
 * `process.env.NEXT_PUBLIC_SENTRY_DSN` escrito literalmente é substituído pelo
 * VALOR em tempo de build. Num ambiente onde build e runtime têm envs
 * diferentes (Dockerfile multi-stage, cache de build, CI separado do deploy),
 * o literal viraria `undefined` no bundle: `Sentry.init` nunca rodaria, todo
 * `reportarExcecao` seria no-op, e o fail-fast de `src/lib/env.ts` — que lê
 * `process.env` dinamicamente e encontra a variável no runtime — reportaria
 * tudo verde. Sentry morto sem sintoma é exatamente o que OPE-02 não pode ser.
 *
 * O acesso literal fica de FALLBACK porque no bundle do browser `process.env`
 * não existe em runtime: ali só o valor congelado no build funciona.
 *
 * O `env.ts` já documenta esse modo de falha (nota `e`) — este módulo é ele
 * aplicado, em vez de só descrito.
 */
export function dsnDoSentry(): string | undefined {
    const ambiente = process.env as Record<string, string | undefined>
    return ambiente.NEXT_PUBLIC_SENTRY_DSN?.trim() || process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()
}
