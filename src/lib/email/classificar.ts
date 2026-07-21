import type { ErrorResponse } from 'resend'

import type { MotivoFalhaEmail } from './enviar'

/**
 * Traduz o identificador de erro do Resend para o vocabulário fechado nosso.
 *
 * Função pura, zero imports de RUNTIME — o `import type` do SDK é apagado na
 * compilação, então isto continua testável sem tocar no Resend.
 *
 * Regra que não pode ser afrouxada: nome desconhecido cai em
 * `falha_transporte`, NUNCA no lado silencioso. Se o vocabulário do SDK mudar,
 * o erro tem que aparecer, não sumir.
 */
type CodigoResend = ErrorResponse['name']

/**
 * A tabela é `Record<CodigoResend, …>`, e é ISSO que dá a garantia de
 * compilador: quando o Resend acrescentar um literal ao `RESEND_ERROR_CODE_KEY`
 * numa atualização do SDK, `tsc` quebra por chave faltando. Um `switch` sobre
 * `string` — que era o que existia aqui — não confere nada, e o comentário do
 * teste prometia uma exaustividade que ninguém sustentava.
 */
const CLASSIFICACAO: Record<CodigoResend, MotivoFalhaEmail> = {
    // Rejeição do Resend: dado ruim de entrada, não defeito nosso.
    // Não vai ao Sentry (exceto 403 — ver `enviar.ts`).
    validation_error: 'rejeitado',
    invalid_idempotent_request: 'rejeitado',
    concurrent_idempotent_requests: 'rejeitado',

    // Erro de configuração ou de programação nossa — merece Sentry.
    //
    // ⚠️ `invalid_from_address` e `security_error` estavam em `rejeitado`, e a
    // justificativa ("dado ruim de entrada") não se aplica a eles: o `from` é
    // CONSTANTE DE PRODUTO (`ENDERECO_REMETENTE`), não vem de input nenhum. Se
    // ele foi recusado — DKIM alterado, domínio suspenso, remetente malformado
    // — a causa é nossa e 100% dos e-mails param. Silenciosamente, que é o
    // oposto declarado de OPE-02.
    invalid_from_address: 'config_ausente',
    security_error: 'config_ausente',
    missing_required_field: 'config_ausente',
    invalid_parameter: 'config_ausente',
    invalid_attachment: 'config_ausente',
    invalid_idempotency_key: 'config_ausente',
    missing_api_key: 'config_ausente',
    invalid_api_key: 'config_ausente',
    restricted_api_key: 'config_ausente',
    not_found: 'config_ausente',
    method_not_allowed: 'config_ausente',
    // Os dois abaixo não constavam da tabela do plano (o SDK instalado tem 21
    // literais, a tabela cobria 19): ambos são problema de credencial ou de
    // parâmetro nosso, não do fornecedor.
    invalid_access: 'config_ausente',
    invalid_region: 'config_ausente',

    // Cota, limite de taxa, 5xx e falha de rede. `application_error` cobre
    // tanto 5xx quanto falha de rede (`statusCode: null`) — se algum dia for
    // preciso distinguir "Resend caiu" de "sem rede aqui", o discriminante é
    // `statusCode === null`.
    daily_quota_exceeded: 'falha_transporte',
    monthly_quota_exceeded: 'falha_transporte',
    rate_limit_exceeded: 'falha_transporte',
    application_error: 'falha_transporte',
    internal_server_error: 'falha_transporte',
}

/**
 * `string & {}` mantém o autocomplete dos literais do SDK e ao mesmo tempo
 * aceita um nome desconhecido em runtime — que é o caso real quando o Resend
 * publica um código novo antes de atualizarmos o pacote.
 */
export function classificarErroResend(nome: CodigoResend | (string & {})): MotivoFalhaEmail {
    return CLASSIFICACAO[nome as CodigoResend] ?? 'falha_transporte'
}
