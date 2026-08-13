import React from 'react'
import { render } from 'react-email'
import { BoasVindas } from '../emails/BoasVindas'
import { enviarEmail, type MotivoFalhaEmail, type ResultadoEmail } from './email/enviar'
import { createAdminClient } from './supabase/admin'

export interface ParametrosGarantirEnvioBoasVindas {
    tenantId: string
    email: string
    replyTo?: string
    nomeProfissional: string
    nomeEstabelecimento: string
    slug: string
    urlBase?: string
}

export type ResultadoEnvioBoasVindas =
    { ok: true; id?: string; ignoradoPorIdempotencia?: boolean } | { ok: false; motivo: string }

/**
 * Falhas que retentar NÃO conserta: sem chave de API, config incompleta, ou o
 * provedor recusando o envio (domínio não verificado, endereço malformado).
 *
 * A distinção não é cosmética. O índice de idempotência solta a chave apenas em
 * `falhou`, e o gatilho de envio vive no layout do dashboard — que roda a cada
 * renderização de servidor. Sem separar permanente de transitório, cada page view
 * gravava uma linha nova e batia no Resend de novo, repetindo a MESMA rejeição
 * contra o MESMO endereço: exatamente o comportamento que queima reputação de
 * domínio e que o EML-06 existe para impedir.
 */
const MOTIVOS_PERMANENTES: readonly MotivoFalhaEmail[] = [
    'desativado',
    'config_ausente',
    'rejeitado',
]

/**
 * Teto de tentativas para a falha TRANSITÓRIA (rede). Sem ele, uma indisponibilidade
 * prolongada do provedor viraria um laço sem fim de linhas em `tb_email_log`, na
 * cadência dos page views do dashboard.
 */
const TETO_TENTATIVAS = 3

function statusDaFalha(motivo: MotivoFalhaEmail, tentativaAtual: number): 'falhou' | 'descartado' {
    if (MOTIVOS_PERMANENTES.includes(motivo)) return 'descartado'
    return tentativaAtual >= TETO_TENTATIVAS ? 'descartado' : 'falhou'
}

export async function garantirEnvioBoasVindas(
    params: ParametrosGarantirEnvioBoasVindas,
): Promise<ResultadoEnvioBoasVindas> {
    const chaveIdempotencia = `boas-vindas/${params.tenantId}`
    const supabase = createAdminClient()

    // Quantas vezes já tentamos. O índice parcial libera a chave a cada 'falhou',
    // então o histórico mora nas linhas anteriores, não num contador na linha viva.
    const { count: tentativasAnteriores } = await supabase
        .from('tb_email_log')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', params.tenantId)
        .eq('chave_idempotencia', chaveIdempotencia)

    const tentativaAtual = (tentativasAnteriores ?? 0) + 1

    // 1. Registra o disparo pendente para travar concorrência
    const { data: logExistente, error: erroInsert } = await supabase
        .from('tb_email_log')
        .insert({
            tenant_id: params.tenantId,
            chave_idempotencia: chaveIdempotencia,
            tipo_email: 'boas-vindas',
            status: 'pendente',
            tentativas: tentativaAtual,
        })
        .select('id, status')
        .single()

    if (erroInsert) {
        // 23505 = índice de idempotência. Já existe disparo pendente, enviado ou
        // descartado — em qualquer um dos três casos não há nada a fazer aqui.
        if (erroInsert.code === '23505') {
            return { ok: true, ignoradoPorIdempotencia: true }
        }
        return { ok: false, motivo: `erro_banco: ${erroInsert.code || erroInsert.message}` }
    }

    const logId = logExistente.id

    const registrarFalha = async (status: 'falhou' | 'descartado', motivo: string) => {
        await supabase
            .from('tb_email_log')
            .update({ status, erro: motivo, atualizado_em: new Date().toISOString() })
            .eq('id', logId)
    }

    try {
        // 2. Renderiza o template React Email
        const html = await render(
            React.createElement(BoasVindas, {
                nomeProfissional: params.nomeProfissional,
                nomeEstabelecimento: params.nomeEstabelecimento,
                slug: params.slug,
                urlBase: params.urlBase,
            }),
        )

        // 3. Dispara o e-mail via wrapper de transporte
        const replyToDestino = params.replyTo?.trim() || params.email

        const res: ResultadoEmail = await enviarEmail({
            nomeEstabelecimento: params.nomeEstabelecimento,
            para: params.email,
            replyTo: replyToDestino,
            assunto: 'Bem-vindo ao VamoAgendar! Sua agenda online está pronta',
            html,
            idempotencyKey: chaveIdempotencia,
        })

        if (res.ok) {
            await supabase
                .from('tb_email_log')
                .update({
                    status: 'enviado',
                    resend_id: res.id,
                    atualizado_em: new Date().toISOString(),
                })
                .eq('id', logId)

            return { ok: true, id: res.id }
        }

        await registrarFalha(statusDaFalha(res.motivo, tentativaAtual), res.motivo)
        return { ok: false, motivo: res.motivo }
    } catch (err) {
        // Exceção na renderização do template é defeito nosso e determinístico:
        // retentar reproduz. Terminal, para não renascer a cada page view.
        const mensagemErro = err instanceof Error ? err.message : String(err)
        await registrarFalha('descartado', mensagemErro)

        return { ok: false, motivo: 'falha_excecao' }
    }
}
