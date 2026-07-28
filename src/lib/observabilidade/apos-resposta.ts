/**
 * Emissão de telemetria FORA do caminho da resposta, sem abrir mão da entrega.
 *
 * ⚠️ Este módulo existe para resolver uma tensão real entre duas regras do
 * projeto, e a resolução está escrita aqui para não ser desfeita por engano:
 *
 * - A regra de mensageria (baseline 260724) manda usar as variantes AGUARDADAS
 *   (`Sentry.flush`) em Server Action, webhook ou route handler que pode encerrar
 *   logo depois — a fire-and-forget perde o evento quando o runtime congela.
 * - O CR-03 da revisão da Phase 3 mostrou que aplicar isso no caminho de
 *   REJEIÇÃO de um endpoint público inverte o propósito da defesa: rejeitar passa
 *   a custar mais que aceitar, porque cada requisição barrada segura um slot do
 *   servidor esperando uma ida de rede a terceiro — exatamente sob flood, que é
 *   quando o bloqueio em massa acontece.
 *
 * `after()` do Next satisfaz as duas: o callback roda DEPOIS de a resposta sair,
 * e o runtime mantém a invocação viva até ele terminar. O `flush` continua lá
 * dentro (a entrega segue garantida), só deixou de estar na frente do visitante.
 * É o mesmo mecanismo que `analytics/server.ts` já usa para o PostHog.
 *
 * Contrato: NUNCA lança e nunca propaga a falha da emissão — observabilidade
 * quebrada não pode mudar a resposta que o visitante recebe.
 */

import { after } from 'next/server'

export function emitirDepoisDaResposta(emitir: () => Promise<void>): void {
    try {
        after(() => emitir().catch(() => {}))
    } catch {
        // Fora de contexto de requisição (job interno, teste): não há resposta
        // para ficar na frente de, então emitir direto é o comportamento certo.
        void emitir().catch(() => {})
    }
}
