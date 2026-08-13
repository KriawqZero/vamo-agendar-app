import React from 'react'
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
import {
    reportarExcecaoAguardando,
    reportarFalhaSilenciosaAguardando,
} from './observabilidade/reportar'
import { erroSinteticoSupabase } from './observabilidade/erro-supabase'
import { logOperacional } from './observabilidade/log'
import { hashTenantId, hashAgendamentoId } from './observabilidade/hash'
import { enviarEmail } from './email/enviar'
import { ENDERECO_REMETENTE } from './email/remetente'
import { ConfirmacaoAgendamento } from '@/emails/ConfirmacaoAgendamento'
import { render } from 'react-email'

interface NotificacoesAgendamentoParams {
    agendamentoId: string
    tenantId: string
    clienteNome: string
    clienteTelefone?: string | null
    clienteEmail?: string | null
    servicoNome?: string
    dataHora: string // ISO string em UTC
    timezone: string // Fuso IANA do estabelecimento
}

/**
 * Fase de notificações pós-agendamento: confirmação assíncrona por E-mail (via Resend)
 * e por WhatsApp (via Evolution API + QStash), ambos disparados sem travar a UI.
 *
 * NUNCA lança — qualquer falha é capturada, logada no Sentry e auditada.
 */
export async function dispararNotificacoesAgendamento(
    client: SupabaseClient,
    {
        agendamentoId,
        tenantId,
        clienteNome,
        clienteTelefone,
        clienteEmail,
        servicoNome,
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

        // Leitura do perfil da empresa (para obter nome do estabelecimento, e-mail de contato, endereço)
        const { data: perfil, error: perfilError } = await client
            .from('perfis_empresas')
            .select('nome_estabelecimento, email_contato, endereco')
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
        // Fallback é a constante de produto, não um literal digitado à mão: o
        // valor anterior ('nao-responda@vamoagendar.com.br') divergia do endereço
        // real em dois pontos — hífen a mais e sem o subdomínio `mail.` — e é
        // domínio sem MX. Todo tenant sem `email_contato` mandava confirmação
        // cujo "Responder" bounceava.
        const emailContato = perfil?.email_contato || ENDERECO_REMETENTE

        // -------------------------------------------------------------------------
        // 1. CANAL DE E-MAIL TRANSACIONAL (Resend)
        // -------------------------------------------------------------------------
        if (clienteEmail && clienteEmail.trim()) {
            try {
                const dataHoraStr = formatarDataHora(dataHora, timezone)
                const htmlEmail = await render(
                    React.createElement(ConfirmacaoAgendamento, {
                        nomeCliente: clienteNome,
                        nomeEstabelecimento: empresaNome,
                        nomeServico: servicoNome || 'Atendimento / Serviço',
                        dataHoraFormatada: dataHoraStr,
                        endereco: perfil?.endereco || undefined,
                    }),
                )

                const resultadoEmail = await enviarEmail({
                    nomeEstabelecimento: empresaNome,
                    para: clienteEmail.trim(),
                    replyTo: emailContato,
                    assunto: `${empresaNome} via VamoAgendar: Agendamento Confirmado`,
                    html: htmlEmail,
                    idempotencyKey: `confirmacao-booking/${agendamentoId}`,
                })

                if (resultadoEmail.ok) {
                    logOperacional.info('email.confirmacao.enviado', contextoMeta)
                    capturarEventoTenant('email_confirmation_sent', tenantId)
                } else {
                    logOperacional.warn('email.confirmacao.falhou', {
                        ...contextoMeta,
                        motivo: resultadoEmail.motivo,
                    })
                    capturarEventoTenant('email_confirmation_failed', tenantId, {
                        motivo: resultadoEmail.motivo,
                    })
                }
            } catch (emailErr) {
                console.error('Erro ao enviar e-mail de confirmação de agendamento:', emailErr)
                await reportarFalhaSilenciosaAguardando(
                    'email:falha_envio_confirmacao',
                    contextoMeta,
                )
            }
        }

        // -------------------------------------------------------------------------
        // 2. CANAL DE WHATSAPP (Evolution API + QStash)
        // -------------------------------------------------------------------------
        if (clienteTelefone && clienteTelefone.trim()) {
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
                    logOperacional.warn('whatsapp.config.ausente_pro', contextoMeta)
                    await reportarFalhaSilenciosaAguardando(
                        'whatsapp:config_ausente_para_plano_pro',
                        contextoMeta,
                    )
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
                    logOperacional.warn('whatsapp.confirmacao.desconectado', contextoMeta)
                    await reportarFalhaSilenciosaAguardando(
                        'whatsapp:desconectado_ao_confirmar',
                        contextoMeta,
                    )
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
                        clienteTelefone.trim(),
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
                logOperacional.info('whatsapp.plano.sem_whatsapp', contextoMeta)
            }
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
