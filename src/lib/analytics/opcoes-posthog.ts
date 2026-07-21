/**
 * Opções de init do PostHog — FONTE ÚNICA das travas anti-PII.
 *
 * O init do browser (`src/instrumentation-client.ts`) e o cliente de servidor
 * (`src/lib/analytics/server.ts`) consomem estes objetos por spread. Estar aqui
 * (e não como literal dentro do `if` do init) é o que permite que
 * `src/lib/__tests__/opcoes-posthog.test.ts` afirme sobre cada flag — mesmo
 * contrato do `opcoes-sentry.ts`.
 *
 * ⚠️ MOTIVO DE EXISTIR: o wizard oficial (`npx @posthog/wizard`) apagou estas
 * travas duas vezes, em 2026-07-21, porque elas moravam dentro da função de
 * init que ele reescreveu. Enquanto forem asserção de teste, o próximo wizard
 * não consegue removê-las sem deixar o CI vermelho.
 *
 * Sem imports do SDK de propósito: o objeto precisa ser inspecionável em teste
 * de Node sem carregar `posthog-js` (que é browser-only).
 */

/**
 * Região do projeto é US. O host é OPCIONAL por isso — tratar `undefined` como
 * "PostHog desligado" transformaria um env faltando no pior modo de falha do
 * produto: nenhum erro, nenhum log, e simplesmente nenhum evento chegando.
 * `NEXT_PUBLIC_POSTHOG_HOST` NÃO entra em `src/lib/env.ts` justamente porque
 * tem default.
 */
export const HOST_POSTHOG_PADRAO = 'https://us.i.posthog.com'

/** Host de ingestão: o do ambiente quando existe, senão a região US. */
export function hostPostHog(): string {
    return process.env.NEXT_PUBLIC_POSTHOG_HOST || HOST_POSTHOG_PADRAO
}

/**
 * Opções do `posthog.init()` no browser.
 *
 * As CINCO primeiras são invariante de produto, não preferência: `/book/[slug]`
 * é público e sem login, e quem digita nome e telefone ali é um desconhecido
 * que nunca criou conta e nunca aceitou termo nenhum. Nenhuma delas pode virar
 * toggle de painel — configuração remota é reversível por qualquer pessoa com
 * acesso ao projeto do PostHog e não deixa rastro no git.
 */
export const opcoesInitPostHog = {
    // 1. Pageview automático capturaria a URL de toda página visitada.
    capture_pageview: false,
    // 2. Perfil de pessoa só depois de `identify` — que só acontece no
    //    dashboard, com o hash do tenant. Visitante de `/book/[slug]` nunca
    //    vira pessoa no PostHog.
    person_profiles: 'identified_only',
    // 3. Autocapture serializaria cliques e submits do formulário público.
    autocapture: false,
    // 4. Replay de sessão gravaria a tela onde o cliente final digita nome e
    //    telefone. Mesma regra que o Sentry aplica não instalando a integração
    //    de replay.
    disable_session_recording: true,
    // 5. Survey é conteúdo remoto renderizado por cima do wizard de
    //    agendamento — superfície que ninguém revisou.
    disable_surveys: true,

    // O Sentry é o dono do error tracking. O caminho do PostHog não passa por
    // `sanitizarEventoSentry` nem pelo `beforeSend`, então ligar isto criaria
    // uma SEGUNDA superfície de exceção sem nenhuma das travas de
    // `opcoes-sentry.ts` — stack com variáveis locais de Server Action pública
    // inclui `nome` e `telefone`.
    capture_exceptions: false,

    // ⚠️ As três abaixo são `undefined` no SDK, e `undefined` aqui significa
    // "o painel decide" (remote config). É exatamente o furo que
    // `disable_session_recording` fecha — deixá-las implícitas seria travar a
    // porta e esquecer a janela. Heatmap e dead click serializam o elemento
    // clicado na página pública; rageclick idem, e nada na taxonomia de
    // `docs/08` consome esses eventos hoje.
    capture_heatmaps: false,
    capture_dead_clicks: false,
    rageclick: false,

    // Fragmento de URL fora de todo campo automático. O SDK só liga isto
    // sozinho a partir do snapshot de defaults `'2026-06-25'`; aqui é
    // explícito. Mesma decisão que `sanitizarBreadcrumb` já toma do lado do
    // Sentry.
    disable_capture_url_hashes: true,
} as const

/**
 * Opções do cliente `posthog-node`.
 *
 * `flushAt: 1` + `flushInterval: 0` desligam o batch: route handler e Server
 * Action do Next são derrubados por invocação, e evento enfileirado sem flush
 * é evento perdido em silêncio. Quem garante o envio é o `await shutdown()` de
 * `server.ts` — estas opções só removem a espera entre enfileirar e mandar.
 */
export const opcoesServidorPostHog = {
    flushAt: 1,
    flushInterval: 0,

    // Mesmo motivo do `capture_exceptions: false` do browser: error tracking é
    // do Sentry, e este caminho não tem sanitização nenhuma.
    enableExceptionAutocapture: false,

    // O IP que o PostHog enxerga num evento de servidor é o do datacenter, não
    // o do usuário: a geolocalização resultante seria dado inventado, e ainda
    // assim dado de localização. Sem valor analítico, com custo de privacidade.
    disableGeoip: true,
} as const
