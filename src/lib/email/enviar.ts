import { reportarExcecao } from '../observabilidade/reportar'
import { classificarErroResend } from './classificar'
import { montarRemetente } from './remetente'

/**
 * Wrapper de envio transacional (D-04). A função NUNCA lança, em nenhum
 * caminho, e nenhuma frase interna do Resend atravessa esta fronteira.
 *
 * Achados da pesquisa que a Phase 4 vai precisar e que se perdem se não
 * ficarem registrados aqui:
 *
 * - `rejeitado` cobre rejeição SÍNCRONA (endereço malformado, domínio não
 *   verificado). NÃO é bounce: bounce é assíncrono, acontece depois do 202.
 * - O Resend JÁ mantém lista de supressão própria, com API de primeira classe
 *   (`resend.suppressions.*`) e eventos de webhook tipados. Endereço que deu
 *   hard bounce entra em supressão por construção do fornecedor — o que
 *   provavelmente dispensa tabela nossa para EML-06.
 */

export type MotivoFalhaEmail = 'desativado' | 'config_ausente' | 'rejeitado' | 'falha_transporte'

export type ResultadoEmail = { ok: true; id: string } | { ok: false; motivo: MotivoFalhaEmail }

export interface ParamsEmail {
    /** Nome do tenant — vira o nome de exibição do remetente (EML-04). */
    nomeEstabelecimento: string
    para: string
    /** E-mail do profissional: responder tem que ir para ele (EML-04). */
    replyTo: string
    assunto: string
    html: string
    /**
     * Determinística por intenção de negócio (`boas-vindas/<tenantId>`), nunca
     * aleatória — senão não protege contra duplo clique. Quem define as chaves
     * é a Phase 4; o parâmetro entra agora porque acrescentá-lo depois mudaria
     * assinatura pública.
     */
    idempotencyKey?: string
}

export async function enviarEmail(params: ParamsEmail): Promise<ResultadoEmail> {
    // D-04 define `config_ausente` como "faltou remetente/destinatário — erro
    // de programação". Sem esta guarda o campo vazio ia para o Resend, voltava
    // como `validation_error` e virava `rejeitado`: um bug nosso classificado
    // como culpa do dado de entrada, sem Sentry e sem log. Vem ANTES do guard
    // de credencial de propósito — erro de programação é erro de programação
    // com ou sem chave.
    if (!params.para?.trim() || !params.replyTo?.trim() || !params.assunto?.trim()) {
        reportarExcecao(new Error('email:config_ausente'), { fluxo: 'enviar_email' })
        return { ok: false, motivo: 'config_ausente' }
    }

    const apiKey = process.env.RESEND_API_KEY?.trim()

    // EML-05: sem credencial o produto funciona igual. Estado ESPERADO em dev —
    // silencioso de propósito, não vai ao Sentry e não vira console.error.
    if (!apiKey) return { ok: false, motivo: 'desativado' }

    try {
        // ⚠️ O client é construído DENTRO do guard: `new Resend(undefined)`
        // LANÇA (verificado em resend dist/index.mjs:1150). Instanciar no topo
        // do módulo derrubaria o import inteiro em dev sem credencial —
        // exatamente o oposto do EML-05. Não mover para fora.
        const { Resend } = await import('resend')
        const resend = new Resend(apiKey)

        const { data, error } = await resend.emails.send(
            {
                from: montarRemetente(params.nomeEstabelecimento),
                to: params.para,
                replyTo: params.replyTo,
                subject: params.assunto,
                html: params.html,
            },
            params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined,
        )

        if (error) {
            const motivo = classificarErroResend(error.name)

            // Domínio que perde verificação devolve `validation_error` com 403
            // ("Domain is not verified"), que cairia em `rejeitado` e sumiria —
            // com 100% dos e-mails parados. 403 no `send` é sempre permissão
            // NOSSA (domínio, chave restrita, modo de teste); endereço
            // malformado do chamador vem como 422. O motivo devolvido continua
            // sendo `rejeitado`: quem muda é a visibilidade, não o contrato
            // (D-04 intacto, nenhum motivo novo).
            const rejeicaoQueEDefeitoNosso = motivo === 'rejeitado' && error.statusCode === 403

            // D-05: falha inesperada vai ao Sentry; `rejeitado` não vai, porque
            // é dado ruim de entrada, não defeito nosso. Ao Sentry vai só o
            // identificador de erro (enum fechado) e o código HTTP —
            // `error.message` NUNCA atravessa esta fronteira.
            if (
                motivo === 'falha_transporte' ||
                motivo === 'config_ausente' ||
                rejeicaoQueEDefeitoNosso
            ) {
                reportarExcecao(new Error(`resend:${error.name}`), {
                    statusCode: error.statusCode,
                })
            }

            return { ok: false, motivo }
        }

        if (!data?.id) {
            reportarExcecao(new Error('resend:resposta_sem_id'))
            return { ok: false, motivo: 'falha_transporte' }
        }

        return { ok: true, id: data.id }
    } catch (err) {
        // Este catch existe para GARANTIR o contrato "nunca lança", não porque
        // seja caminho esperado: o SDK documentadamente devolve `{ data, error }`
        // até em falha de rede. Não apagar achando que é código morto.
        reportarExcecao(err)
        return { ok: false, motivo: 'falha_transporte' }
    }
}
