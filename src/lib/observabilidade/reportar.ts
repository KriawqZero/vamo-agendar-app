/**
 * Borda de reporte ao Sentry para falhas que hoje morrem no console.
 *
 * Contrato, nesta ordem:
 * 1. NUNCA lança. Falha de observabilidade não pode quebrar o produto — é o
 *    mesmo contrato que `src/lib/analytics/` já cumpre.
 * 2. NO-OP sem DSN (guard antes de qualquer coisa, igual a `analytics/client.ts`).
 * 3. Nunca recebe PII. Contexto aceita só rótulo, código e afins — jamais nome,
 *    telefone, e-mail ou texto de mensagem.
 *
 * ⚠️ O SDK é carregado por IMPORT DINÂMICO dentro da função, e o motivo é
 * concreto: import estático puxaria `@sentry/node` + instrumentações OTel para
 * dentro de `whatsapp-helper.test.ts` (que importa este módulo por
 * transitividade) e obrigaria a mexer no `vitest.config.ts`. Não trocar por
 * import de topo.
 */

type ContextoObservabilidade = Record<string, string | number | boolean | null>

/**
 * DSN lido em RUNTIME, e o acesso dinâmico não é estilo.
 *
 * `process.env.NEXT_PUBLIC_SENTRY_DSN` escrito literalmente é substituído pelo
 * VALOR em tempo de build. Num ambiente onde build e runtime têm envs
 * diferentes (Dockerfile multi-stage, cache de build, CI separado do deploy),
 * o literal viraria `undefined` no bundle e TODO `reportarExcecao` seria no-op
 * em silêncio — com o fail-fast de `env.ts` reportando tudo verde, porque ele
 * lê `process.env` dinamicamente e encontra a variável. Sentry morto sem
 * sintoma é exatamente o que OPE-02 não pode ser.
 *
 * O literal fica de fallback: no bundle do browser `process.env` não existe em
 * runtime, e ali só o valor congelado no build funciona.
 */
function dsn(): string | undefined {
    const ambiente = process.env as Record<string, string | undefined>
    return ambiente.NEXT_PUBLIC_SENTRY_DSN?.trim() || process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()
}

/** Reporta uma exceção ao Sentry. No-op sem DSN; nunca lança. */
export function reportarExcecao(erro: unknown, contexto?: ContextoObservabilidade): void {
    if (!dsn()) return
    try {
        void import('@sentry/nextjs')
            .then((Sentry) => {
                Sentry.captureException(erro, contexto ? { extra: contexto } : undefined)
            })
            .catch(() => {})
    } catch {
        // Silêncio proposital: ver contrato 1 no cabeçalho.
    }
}

/**
 * Variante AGUARDADA, para quem termina a requisição logo depois de reportar.
 *
 * `reportarExcecao` dispara `import().then()` sem ninguém esperar: em processo
 * Node de vida longa o evento normalmente sai, mas num runtime que congela
 * assim que a resposta é devolvida (edge, serverless) ele se perde — e o
 * webhook de lembrete devolve `NextResponse.json` na linha seguinte ao reporte.
 * `flush` espera a fila esvaziar, com teto de 2s para não segurar a resposta.
 *
 * Mesmo contrato de sempre: NUNCA lança, no-op sem DSN.
 */
export async function reportarExcecaoAguardando(
    erro: unknown,
    contexto?: ContextoObservabilidade,
): Promise<void> {
    if (!dsn()) return
    try {
        const Sentry = await import('@sentry/nextjs')
        Sentry.captureException(erro, contexto ? { extra: contexto } : undefined)
        await Sentry.flush(2000)
    } catch {
        // Silêncio proposital: ver contrato 1 no cabeçalho.
    }
}

/**
 * Reporta uma falha que nunca vira exceção — os pontos que hoje apenas
 * devolvem `motivo` e seguem. Embrulha o rótulo num `Error` sintético para que
 * o Sentry agrupe por rótulo em vez de por stack.
 *
 * Usar SOMENTE em falha inesperada. Condição esperada de negócio (WhatsApp
 * desconectado, plano sem WhatsApp, agendamento cancelado) NÃO entra aqui:
 * ruído é como o owner para de olhar a ferramenta, e é assim que OPE-02 volta
 * a ser falso seis semanas depois.
 */
export function reportarFalhaSilenciosa(rotulo: string, contexto?: ContextoObservabilidade): void {
    reportarExcecao(new Error(rotulo), contexto)
}
