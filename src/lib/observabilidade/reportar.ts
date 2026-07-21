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

function dsn(): string | undefined {
    return process.env.NEXT_PUBLIC_SENTRY_DSN
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
