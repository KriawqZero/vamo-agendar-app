import type { MotivoFalhaEmail } from './enviar'

/**
 * Traduz o identificador de erro do Resend para o vocabulário fechado nosso.
 *
 * Função pura, zero imports de runtime — testável sem tocar no SDK.
 *
 * Regra que não pode ser afrouxada: nome desconhecido cai em
 * `falha_transporte`, NUNCA no lado silencioso. Se o vocabulário do SDK mudar,
 * o erro tem que aparecer, não sumir.
 */
export function classificarErroResend(nome: string): MotivoFalhaEmail {
    switch (nome) {
        // Rejeição do Resend: dado ruim de entrada, não defeito nosso.
        // Não vai ao Sentry.
        case 'validation_error':
        case 'invalid_idempotent_request':
        case 'concurrent_idempotent_requests':
            return 'rejeitado'

        // Erro de configuração ou de programação nossa — merece Sentry.
        //
        // ⚠️ `invalid_from_address` e `security_error` estavam em `rejeitado`,
        // e a justificativa ("dado ruim de entrada") não se aplica a eles: o
        // `from` é CONSTANTE DE PRODUTO (`ENDERECO_REMETENTE`), não vem de
        // input nenhum. Se ele foi recusado — DKIM alterado, domínio suspenso,
        // remetente malformado — a causa é nossa e 100% dos e-mails param.
        // Silenciosamente, que é o oposto declarado de OPE-02.
        // `invalid_access` e `invalid_region` não constavam da tabela do plano
        // (o SDK instalado tem 21 literais, a tabela cobria 19): os dois são
        // problema de credencial/parâmetro nosso, não do fornecedor.
        case 'missing_required_field':
        case 'invalid_parameter':
        case 'invalid_attachment':
        case 'invalid_idempotency_key':
        case 'missing_api_key':
        case 'invalid_api_key':
        case 'restricted_api_key':
        case 'not_found':
        case 'method_not_allowed':
        case 'invalid_access':
        case 'invalid_region':
        case 'invalid_from_address':
        case 'security_error':
            return 'config_ausente'

        // Cota, limite de taxa, 5xx e falha de rede. `application_error` cobre
        // tanto 5xx quanto falha de rede (`statusCode: null`) — se algum dia
        // for preciso distinguir "Resend caiu" de "sem rede aqui", o
        // discriminante é `statusCode === null`.
        case 'daily_quota_exceeded':
        case 'monthly_quota_exceeded':
        case 'rate_limit_exceeded':
        case 'application_error':
        case 'internal_server_error':
            return 'falha_transporte'

        default:
            return 'falha_transporte'
    }
}
