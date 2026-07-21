import type { SupabaseClient } from '@supabase/supabase-js'
import { formatarDataHora } from './timezone'
import {
    processarMensagemTemplate,
    enviarMensagemWhatsApp,
    agendarLembreteQStash,
    registrarDisparo,
} from './whatsapp-helper'
import { PLANOS } from './planos'
import { obterPlanoVigentePublico } from './assinaturas'
import { capturarEventoTenant } from './analytics/server'
import { reportarExcecao } from './observabilidade/reportar'

interface NotificacoesAgendamentoParams {
    agendamentoId: string
    tenantId: string
    clienteNome: string
    clienteTelefone: string
    dataHora: string // ISO string em UTC
    timezone: string // Fuso IANA do estabelecimento
}

/**
 * Fase de notificações pós-agendamento: confirmação síncrona via WhatsApp e
 * lembrete futuro agendado no QStash, ambos registrados em `disparos_whatsapp`.
 *
 * NUNCA lança — qualquer falha é engolida e apenas logada. Mensageria jamais
 * pode quebrar a criação de um agendamento (invariante do produto).
 *
 * `client` precisa enxergar `whatsapp_configs` do tenant: no fluxo público
 * (visitante anon) é o cliente privilegiado; no fluxo B2B o cliente
 * autenticado do próprio tenant também serve (RLS permite).
 */
export async function dispararNotificacoesAgendamento(
    client: SupabaseClient,
    {
        agendamentoId,
        tenantId,
        clienteNome,
        clienteTelefone,
        dataHora,
        timezone,
    }: NotificacoesAgendamentoParams,
): Promise<void> {
    try {
        // Sem telefone não há canal de WhatsApp — nada a disparar nem registrar.
        if (!clienteTelefone) return

        const { data: perfil } = await client
            .from('perfis_empresas')
            .select('nome_estabelecimento')
            .eq('tenant_id', tenantId)
            .maybeSingle()

        const empresaNome = perfil?.nome_estabelecimento || 'Estabelecimento'

        const { data: config } = await client
            .from('whatsapp_configs')
            .select('*')
            .eq('tenant_id', tenantId)
            .maybeSingle()

        const plano = await obterPlanoVigentePublico(client, tenantId)
        const planoTemWhatsapp = PLANOS[plano].recursos.whatsapp

        // Sem config ou plano sem WhatsApp: mensageria não faz parte do fluxo
        // deste tenant — não há disparo a registrar.
        if (config && planoTemWhatsapp) {
            if (config.status !== 'conectado' || !config.instance_token) {
                // O tenant tem o recurso, mas a conexão não está ativa: falha silenciosa
                // para o cliente (frictionless), registrada para auditoria do profissional.
                await registrarDisparo(client, {
                    tenantId,
                    agendamentoId,
                    tipo: 'confirmacao',
                    status: 'falha',
                    motivo: 'whatsapp_desconectado',
                })
                // Analytics: espelho agregado do disparo (fonte da verdade é o Postgres).
                capturarEventoTenant('whatsapp_confirmation_failed', tenantId, {
                    motivo: 'whatsapp_desconectado',
                })
            } else {
                const dateObj = new Date(dataHora)
                const dataHoraStr = formatarDataHora(dataHora, timezone)

                const textoConfirmacao = processarMensagemTemplate({
                    template: config.mensagem_confirmacao,
                    clienteNome,
                    empresaNome,
                    dataHoraStr,
                })

                const envio = await enviarMensagemWhatsApp(
                    config.instance_name,
                    config.instance_token,
                    clienteTelefone,
                    textoConfirmacao,
                )

                await registrarDisparo(client, {
                    tenantId,
                    agendamentoId,
                    tipo: 'confirmacao',
                    status: envio.ok ? 'enviado' : 'falha',
                    motivo: envio.ok ? null : envio.motivo,
                })
                // Analytics: espelho agregado do disparo (fonte da verdade é o Postgres).
                if (envio.ok) {
                    capturarEventoTenant('whatsapp_confirmation_sent', tenantId)
                } else {
                    capturarEventoTenant('whatsapp_confirmation_failed', tenantId, {
                        motivo: envio.motivo ?? null,
                    })
                }

                const targetTime = dateObj.getTime() - config.tempo_lembrete_minutos * 60 * 1000
                const now = Date.now()

                if (targetTime > now) {
                    const agendado = await agendarLembreteQStash(
                        agendamentoId,
                        tenantId,
                        targetTime,
                    )

                    if (agendado.ok) {
                        await registrarDisparo(client, {
                            tenantId,
                            agendamentoId,
                            tipo: 'lembrete',
                            status: 'agendado',
                            qstashMessageId: agendado.messageId,
                        })
                        // Analytics: espelho agregado do disparo (fonte da verdade é o Postgres).
                        capturarEventoTenant('whatsapp_reminder_scheduled', tenantId)
                    } else {
                        await registrarDisparo(client, {
                            tenantId,
                            agendamentoId,
                            tipo: 'lembrete',
                            status: 'falha',
                            motivo: agendado.motivo,
                        })
                        // Falha no agendamento do lembrete: mesmo evento de falha do
                        // lembrete, distinguível pelo motivo (ex.: qstash_sem_token).
                        capturarEventoTenant('whatsapp_reminder_failed', tenantId, {
                            motivo: agendado.motivo ?? null,
                        })
                    }
                }
            }
        }
    } catch (err) {
        console.error('Erro ao processar notificações automáticas do agendamento:', err)
        // Este catch engole QUALQUER exceção inesperada do fluxo de mensageria
        // por contrato do produto (a falha não pode atrapalhar o cliente final).
        // Sem este reporte, a exceção morre no console do Railway.
        reportarExcecao(err, { fluxo: 'notificacoes_agendamento' })
    }
}
