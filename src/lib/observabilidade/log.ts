/**
 * Logger estruturado para observabilidade operacional do VamoAgendar.
 *
 * Contrato:
 * 1. NUNCA lança exceção.
 * 2. NO-OP se o DSN do Sentry não estiver configurado.
 * 3. Trabalha com mensagens amigáveis em português no título do log, preservando
 *    o código técnico no atributo `codigo` para busca e filtro.
 * 4. NUNCA aceita PII (nome, telefone, e-mail, texto de mensagem, token, URL completa, payload ou objetos/erros brutos).
 * 5. Aceita SOMENTE a allowlist tipada de atributos (`AtributosLogOperacional`).
 */

import { atributoDeLogPermitido } from './atributos-log'
import type { AtributosLogOperacional } from './atributos-log'
import { dsnDoSentry } from './dsn'

// Reexportado para não mexer em nenhum consumidor: o tipo sempre morou aqui, e
// a reexportação mantém isso verdadeiro depois da extração para a fonte única.
export type { AtributosLogOperacional } from './atributos-log'

/**
 * Mapeamento de códigos operacionais internos para frases amigáveis e claras
 * exibidas na linha principal dos logs do Sentry.
 */
export const MENSAGENS_LOG: Record<string, string> = {
    'mensageria.iniciada': 'Iniciando processamento de mensageria do agendamento',
    'whatsapp.telefone.ausente': 'Telefone do cliente não foi informado',
    'whatsapp.perfis.query_error': 'Falha ao consultar perfil da empresa no banco',
    'whatsapp.configs.query_error': 'Falha ao consultar configurações do WhatsApp no banco',
    'whatsapp.config.ausente_pro': 'Configuração do WhatsApp ausente para tenant Pro',
    'whatsapp.plano.sem_whatsapp': 'Notificações ignoradas: plano sem recurso de WhatsApp',
    'whatsapp.confirmacao.desconectado': 'Confirmação não enviada: WhatsApp desconectado',
    'whatsapp.confirmacao.tentativa': 'Enviando mensagem de confirmação via WhatsApp',
    'whatsapp.confirmacao.enviada': 'Mensagem de confirmação enviada com sucesso',
    'whatsapp.confirmacao.falha_http': 'Falha HTTP ao enviar mensagem de confirmação',
    'whatsapp.confirmacao.falha_rede': 'Falha de rede ao enviar mensagem de confirmação',
    'qstash.lembrete.fora_da_janela': 'Lembrete ignorado: horário do agendamento é fora da janela',
    'qstash.lembrete.tentativa': 'Agendando lembrete no QStash',
    'qstash.lembrete.agendado': 'Lembrete agendado com sucesso no QStash',
    'qstash.lembrete.sem_token': 'Lembrete não agendado: QSTASH_TOKEN ausente',
    'qstash.lembrete.sem_chave_assinatura':
        'Lembrete não agendado: chave de assinatura QStash ausente',
    'qstash.lembrete.sem_message_id': 'QStash não retornou ID da mensagem agendada',
    'qstash.lembrete.falha_http': 'Falha HTTP ao agendar lembrete no QStash',
    'qstash.lembrete.falha_rede': 'Falha de rede ao agendar lembrete no QStash',
    'qstash.cancelamento.sem_token': 'Cancelamento ignorado: QSTASH_TOKEN ausente',
    'qstash.cancelamento.sucesso': 'Lembrete cancelado com sucesso no QStash',
    'qstash.cancelamento.falha_http': 'Falha HTTP ao cancelar lembrete no QStash',
    'qstash.cancelamento.falha_rede': 'Falha de rede ao cancelar lembrete no QStash',
    'qstash.webhook.recebido': 'Webhook de lembrete QStash recebido',
    'qstash.webhook.assinatura_invalida': 'Assinatura inválida no webhook de lembrete',
    'qstash.webhook.payload_incompleto': 'Payload incompleto no webhook de lembrete',
    'qstash.webhook.payload_validado': 'Payload validado no webhook de lembrete',
    'qstash.webhook.agendamento_nao_encontrado':
        'Agendamento não encontrado no webhook de lembrete',
    'qstash.webhook.agendamento_cancelado': 'Lembrete ignorado: agendamento foi cancelado',
    'qstash.webhook.plano_indeterminado': 'Falha de leitura do plano no webhook de lembrete',
    'qstash.webhook.plano_sem_whatsapp': 'Lembrete ignorado: plano sem recurso de WhatsApp',
    'qstash.webhook.cliente_sem_contato': 'Lembrete ignorado: cliente sem telefone',
    'whatsapp.lembrete.desconectado': 'Lembrete ignorado: WhatsApp está desconectado',
    'whatsapp.lembrete.enviado': 'Mensagem de lembrete enviada com sucesso',
    'whatsapp.lembrete.falha': 'Falha ao enviar mensagem de lembrete via WhatsApp',
    'qstash.webhook.excecao': 'Erro interno no webhook de lembrete',
    'auditoria_whatsapp.persistida': 'Disparo registrado no banco de auditoria com sucesso',
    'auditoria_whatsapp.falha_insert': 'Falha ao registrar disparo no banco de auditoria',
    'auditoria_whatsapp.falha_inesperada': 'Exceção inesperada ao registrar disparo',
    'notificacoes_agendamento.excecao':
        'Exceção inesperada ao disparar notificações do agendamento',
    'analytics_posthog.falha_entrega': 'Falha ao entregar evento ao PostHog',
    'whatsapp.status.sincronizado': 'Status da integração WhatsApp sincronizado com sucesso',
    // Anti-abuso do booking público (Phase 3). Bloqueio é ROTINA, não incidente:
    // vive como Log pesquisável e taxa no PostHog, nunca como Sentry Issue — a
    // Issue fica reservada ao que exige ação do owner.
    'ratelimit.bloqueio': 'Requisição pública bloqueada por rate limit',
    'honeypot.captura': 'Campo armadilha preenchido no booking público',
    'sistema.fatal': 'Erro fatal no sistema',
}

/**
 * Sanitiza o objeto de atributos antes de enviar ao Sentry.logger,
 * garantindo que apenas chaves da allowlist com tipos simples atravessam — e que
 * os campos de hash carregam mesmo um hash.
 *
 * O julgamento em si mora em `atributos-log.ts`, compartilhado com o
 * `beforeSendLog` — as duas barreiras precisam concordar, e a única forma de
 * garantir isso é não haver duas listas. Contrato público inalterado: mesma
 * assinatura, `undefined` quando nada sobra, nunca lança.
 */
export function sanitizarAtributosLog(
    atributos?: Record<string, unknown>,
): Record<string, string | number | boolean> | undefined {
    if (!atributos || typeof atributos !== 'object') return undefined

    const limpo: Record<string, string | number | boolean> = {}

    // Descarta em SILÊNCIO, sem lançar: o contrato 1 vale acima de tudo, e um
    // atributo a menos no log é infinitamente melhor que um telefone a mais no
    // fornecedor terceiro.
    for (const [chave, valor] of Object.entries(atributos)) {
        if (atributoDeLogPermitido(chave, valor)) {
            limpo[chave] = valor
        }
    }

    return Object.keys(limpo).length > 0 ? limpo : undefined
}

type NivelLog = 'info' | 'warn' | 'error' | 'fatal'

type SdkSentry = typeof import('@sentry/nextjs')

/**
 * Miolo COMPARTILHADO pelas duas variantes: título amigável + sanitização.
 *
 * Existe para que a allowlist seja aplicada em um lugar só — duas cópias da
 * sanitização é como uma delas envelhece sem a outra e a barreira anti-PII passa
 * a valer só metade das vezes.
 */
function prepararLog(
    codigo: string,
    atributos?: AtributosLogOperacional,
): { tituloLog: string; atributosLimpos?: Record<string, string | number | boolean> } {
    const tituloLog = MENSAGENS_LOG[codigo] ?? codigo
    const atributosComCodigo: Record<string, unknown> = {
        codigo,
        ...(atributos as Record<string, unknown>),
    }
    return { tituloLog, atributosLimpos: sanitizarAtributosLog(atributosComCodigo) }
}

/** Entrega ao logger do SDK já carregado. Não decide nada — só emite. */
function entregarAoLogger(
    Sentry: SdkSentry,
    nivel: NivelLog,
    tituloLog: string,
    atributosLimpos?: Record<string, string | number | boolean>,
): void {
    if (!Sentry.logger || typeof Sentry.logger[nivel] !== 'function') return

    if (atributosLimpos) {
        Sentry.logger[nivel](tituloLog, atributosLimpos)
    } else {
        Sentry.logger[nivel](tituloLog)
    }
}

function emitirLogSentry(
    nivel: NivelLog,
    codigo: string,
    atributos?: AtributosLogOperacional,
): void {
    if (!dsnDoSentry()) return

    try {
        const { tituloLog, atributosLimpos } = prepararLog(codigo, atributos)

        // Import dinâmico ou acesso direto ao Sentry
        void import('@sentry/nextjs')
            .then((Sentry) => entregarAoLogger(Sentry, nivel, tituloLog, atributosLimpos))
            .catch(() => {})
    } catch {
        // Silêncio proposital: logging nunca quebra a aplicação
    }
}

/**
 * Variante AGUARDADA de `emitirLogSentry` — mesma diferença exata que separa
 * `reportarExcecao` de `reportarExcecaoAguardando` em `reportar.ts`.
 *
 * A fire-and-forget dispara `import().then()` sem ninguém esperar: em processo
 * Node de vida longa o evento normalmente sai, mas num ponto que encerra a
 * requisição na linha seguinte o runtime pode congelar antes da fila esvaziar —
 * e o log some. Foi assim que o incidente 260724 perdeu evento. `flush` espera a
 * entrega, com teto de 2s para não segurar a resposta do visitante.
 */
async function emitirLogSentryAguardando(
    nivel: NivelLog,
    codigo: string,
    atributos?: AtributosLogOperacional,
): Promise<void> {
    if (!dsnDoSentry()) return

    try {
        const { tituloLog, atributosLimpos } = prepararLog(codigo, atributos)
        const Sentry = await import('@sentry/nextjs')
        entregarAoLogger(Sentry, nivel, tituloLog, atributosLimpos)
        await Sentry.flush(2000)
    } catch {
        // Silêncio proposital: ver contrato 1 no cabeçalho.
    }
}

export const logOperacional = {
    info(codigo: string, atributos?: AtributosLogOperacional): void {
        emitirLogSentry('info', codigo, atributos)
    },
    warn(codigo: string, atributos?: AtributosLogOperacional): void {
        emitirLogSentry('warn', codigo, atributos)
    },
    error(codigo: string, atributos?: AtributosLogOperacional): void {
        emitirLogSentry('error', codigo, atributos)
    },
    fatal(codigo: string, atributos?: AtributosLogOperacional): void {
        emitirLogSentry('fatal', codigo, atributos)
    },
}

/**
 * Logger com ENTREGA GARANTIDA (`Sentry.flush`), para quem emite imediatamente
 * antes de um `return` de Server Action, de webhook ou de route handler.
 *
 * Use esta variante sempre que o processo puder congelar logo depois da emissão;
 * a fire-and-forget acima serve para o meio de um fluxo que ainda vai continuar.
 * Mesmo contrato de sempre: NUNCA lança, no-op sem DSN, allowlist fechada.
 */
export const logOperacionalAguardando = {
    info(codigo: string, atributos?: AtributosLogOperacional): Promise<void> {
        return emitirLogSentryAguardando('info', codigo, atributos)
    },
    warn(codigo: string, atributos?: AtributosLogOperacional): Promise<void> {
        return emitirLogSentryAguardando('warn', codigo, atributos)
    },
    error(codigo: string, atributos?: AtributosLogOperacional): Promise<void> {
        return emitirLogSentryAguardando('error', codigo, atributos)
    },
    fatal(codigo: string, atributos?: AtributosLogOperacional): Promise<void> {
        return emitirLogSentryAguardando('fatal', codigo, atributos)
    },
}
