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
import { reportarExcecaoAguardando, reportarFalhaSilenciosaAguardando } from './observabilidade/reportar'
import { erroSinteticoSupabase } from './observabilidade/erro-supabase'
import { logOperacional } from './observabilidade/log'
import { hashTenantId, hashAgendamentoId } from './observabilidade/hash'

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
 * NUNCA lança — qualquer falha é capturada, logada no Sentry e auditada no banco.
 * Mensageria jamais pode quebrar a criação de um agendamento (invariante do produto).
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
    const tenantHash = hashTenantId(tenantId)
    const agendamentoHash = hashAgendamentoId(agendamentoId)
    const contextoMeta = {
        fluxo: 'notificacoes_agendamento',
        tenantHash,
        agendamentoHash,
    }

    try {
        logOperacional.info('mensageria.iniciada', contextoMeta)

        // Sem telefone não há canal de WhatsApp — trata-se como invariante quebrado
        if (!clienteTelefone || !clienteTelefone.trim()) {
            logOperacional.error('whatsapp.telefone.ausente', contextoMeta)
            await reportarFalhaSilenciosaAguardando('whatsapp:telefone_ausente', contextoMeta)
            await registrarDisparo(client, {
                tenantId,
                agendamentoId,
                tipo: 'confirmacao',
                status: 'falha',
                motivo: 'telefone_ausente',
            })
            capturarEventoTenant('whatsapp_confirmation_failed', tenantId, {
                motivo: 'telefone_ausente',
            })
            return
        }

        // Leitura do perfil da empresa
        const { data: perfil, error: perfilError } = await client
            .from('perfis_empresas')
            .select('nome_estabelecimento')
            .eq('tenant_id', tenantId)
            .maybeSingle()

        if (perfilError) {
            logOperacional.error('whatsapp.perfis.query_error', contextoMeta)
            await reportarExcecaoAguardando(
                erroSinteticoSupabase(perfilError, 'perfis_query_error'),
                { ...contextoMeta, etapa: 'query_perfil' },
            )
        }

        const empresaNome = perfil?.nome_estabelecimento || 'Estabelecimento'

        // Leitura das configurações de WhatsApp
        const { data: config, error: configError } = await client
            .from('whatsapp_configs')
            .select('*')
            .eq('tenant_id', tenantId)
            .maybeSingle()

        if (configError) {
            logOperacional.error('whatsapp.configs.query_error', contextoMeta)
            await reportarExcecaoAguardando(
                erroSinteticoSupabase(configError, 'configs_query_error'),
                { ...contextoMeta, etapa: 'query_configs' },
            )
        }

        const { plano } = await obterPlanoVigentePublico(client, tenantId)
        const planoTemWhatsapp = PLANOS[plano].recursos.whatsapp

        if (planoTemWhatsapp) {
            if (!config || !config.instance_name) {
                // Tenant Pro sem whatsapp_configs: falha operacional acionável
                logOperacional.warn('whatsapp.config.ausente_pro', contextoMeta)
                await reportarFalhaSilenciosaAguardando('whatsapp:config_ausente_para_plano_pro', contextoMeta)
                await registrarDisparo(client, {
                    tenantId,
                    agendamentoId,
                    tipo: 'confirmacao',
                    status: 'falha',
                    motivo: 'config_ausente',
                })
                capturarEventoTenant('whatsapp_confirmation_failed', tenantId, {
                    motivo: 'config_ausente',
                })
            } else if (config.status !== 'conectado' || !config.instance_token) {
                // Tenant tem config, mas status não é conectado
                logOperacional.warn('whatsapp.confirmacao.desconectado', contextoMeta)
                await reportarFalhaSilenciosaAguardando('whatsapp:desconectado_ao_confirmar', contextoMeta)
                await registrarDisparo(client, {
                    tenantId,
                    agendamentoId,
                    tipo: 'confirmacao',
                    status: 'falha',
                    motivo: 'whatsapp_desconectado',
                })
                capturarEventoTenant('whatsapp_confirmation_failed', tenantId, {
                    motivo: 'whatsapp_desconectado',
                })
            } else {
                // Envio de confirmação
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
                    contextoMeta,
                )

                await registrarDisparo(client, {
                    tenantId,
                    agendamentoId,
                    tipo: 'confirmacao',
                    status: envio.ok ? 'enviado' : 'falha',
                    motivo: envio.ok ? null : envio.motivo,
                })

                if (envio.ok) {
                    capturarEventoTenant('whatsapp_confirmation_sent', tenantId)
                } else {
                    capturarEventoTenant('whatsapp_confirmation_failed', tenantId, {
                        motivo: envio.motivo ?? null,
                    })
                }

                // Agendamento do lembrete futuro
                const targetTime = dateObj.getTime() - config.tempo_lembrete_minutos * 60 * 1000
                const now = Date.now()

                if (targetTime <= now) {
                    // Agendamento próximo onde o lembrete ficaria no passado
                    logOperacional.info('qstash.lembrete.fora_da_janela', contextoMeta)
                    await registrarDisparo(client, {
                        tenantId,
                        agendamentoId,
                        tipo: 'lembrete',
                        status: 'ignorado',
                        motivo: 'lembrete_fora_da_janela',
                    })
                } else {
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
                        capturarEventoTenant('whatsapp_reminder_scheduled', tenantId)
                    } else {
                        await registrarDisparo(client, {
                            tenantId,
                            agendamentoId,
                            tipo: 'lembrete',
                            status: 'falha',
                            motivo: agendado.motivo,
                        })
                        capturarEventoTenant('whatsapp_reminder_failed', tenantId, {
                            motivo: agendado.motivo ?? null,
                        })
                    }
                }
            }
        } else {
            // Plano sem WhatsApp (Gratuito): condição normal de negócio
            logOperacional.info('whatsapp.plano.sem_whatsapp', contextoMeta)
        }
    } catch (err) {
        console.error('Erro ao processar notificações automáticas do agendamento:', err)
        logOperacional.error('notificacoes_agendamento.excecao', contextoMeta)
        await reportarExcecaoAguardando(err, {
            ...contextoMeta,
            etapa: 'disparar_notificacoes',
        })
    }
}
