/**
 * Fail-fast de configuração em produção.
 *
 * Disparado pelo `register()` de `src/instrumentation.ts`, ANTES de qualquer
 * init de terceiro. Em produção, variável obrigatória ausente derruba o boot
 * com a lista completa dos nomes que faltam; fora de produção não faz nada.
 *
 * (a) CRITÉRIO DE ENTRADA NA LISTA: "a ausência desta variável falha em
 *     silêncio ou falha tarde". Por isso as chaves do Clerk ficam de fora —
 *     sem elas o boot já morre com mensagem clara e imediata, e duplicar isso
 *     aqui só criaria risco de errar o nome e derrubar produção à toa.
 *
 * (b) A Phase 1 (SEG-05) acrescentou `QSTASH_NEXT_SIGNING_KEY` a esta mesma
 *     lista, como previsto: uma linha, nenhum caminho novo. O mecanismo continua
 *     extensível do mesmo jeito — não inventar um segundo caminho.
 *
 * (c) GATILHO PARA INSTALAR ZOD: quando a primeira variável exigir validação
 *     de FORMATO, e não só de presença, o `filter` abaixo deixa de servir e o
 *     zod passa a valer o pacote. Hoje a regra é uma só ("existe e não é
 *     vazio") e não se beneficia de nada que o zod oferece.
 *
 * (d) Variável `NEXT_PUBLIC_*` precisa existir no BUILD para chegar ao bundle
 *     do browser. Esta validação é de RUNTIME e não substitui isso.
 *
 * (e) ⚠️ Quatro das quatorze são `NEXT_PUBLIC_*`, e isso tem modo de falha
 *     próprio: o acesso precisa ser DINÂMICO (indexar `process.env` pelo nome
 *     vindo da lista), nunca acesso literal por propriedade. Acesso literal a
 *     `NEXT_PUBLIC_*` é substituído por valor em tempo de build, e a validação
 *     passaria a conferir o que foi congelado no build em vez do que existe no
 *     runtime. O pressuposto que sustenta a lista é que **o Railway usa o mesmo
 *     env em build e em runtime**. Num ambiente onde essas variáveis
 *     existissem só no build, o fail-fast derrubaria o boot por engano. Se
 *     algum dia build e runtime forem separados, esta lista precisa ser
 *     partida em duas.
 */

export const OBRIGATORIAS_EM_PRODUCAO = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_SECRET_KEY',
    'QSTASH_TOKEN',
    'QSTASH_URL',
    'QSTASH_CURRENT_SIGNING_KEY',
    'QSTASH_NEXT_SIGNING_KEY',
    'EVOLUTION_API_URL',
    'EVOLUTION_GLOBAL_API_KEY',
    'APP_URL',
    'ANALYTICS_TENANT_SALT',
    'NEXT_PUBLIC_POSTHOG_KEY',
    'NEXT_PUBLIC_SENTRY_DSN',
    'RESEND_API_KEY',
] as const

/**
 * Lança se alguma obrigatória estiver ausente em produção, nomeando TODAS as
 * que faltam de uma vez — senão o owner descobre uma variável por deploy.
 */
export function validarEnvObrigatorio(): void {
    if (process.env.NODE_ENV !== 'production') return

    const ambiente = process.env as Record<string, string | undefined>
    const ausentes = OBRIGATORIAS_EM_PRODUCAO.filter((nome) => !ambiente[nome]?.trim())

    if (ausentes.length > 0) {
        throw new Error(`Variáveis obrigatórias ausentes em produção: ${ausentes.join(', ')}`)
    }
}

// O encerramento de fato do processo (process.exit/process.stderr) vive em
// `src/lib/env-boot.ts`, separado deste módulo porque aquelas APIs não existem
// no runtime edge. Este arquivo (env.ts) só lê `process.env` — que existe no
// edge — então pode ser importado estaticamente por `src/instrumentation.ts`
// sem contaminar o bundle edge. Ver o comentário de topo de `env-boot.ts`.
