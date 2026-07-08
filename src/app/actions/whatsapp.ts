'use server'

import { createClient } from '@/lib/supabase/server'
import { auth } from '@clerk/nextjs/server'

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080'
const EVOLUTION_GLOBAL_API_KEY = process.env.EVOLUTION_GLOBAL_API_KEY || 'global_key_here'

/**
 * Busca as configurações de WhatsApp da organização logada.
 */
export async function obterWhatsappConfig() {
    const { orgId } = await auth()
    if (!orgId) {
        throw new Error('Não autorizado. Nenhuma organização ativa.')
    }

    const supabase = await createClient()

    const { data, error } = await supabase
        .from('whatsapp_configs')
        .select('*')
        .eq('tenant_id', orgId)
        .maybeSingle()

    if (error) {
        console.error('Erro ao buscar whatsapp_configs:', error.message)
        throw new Error('Erro ao carregar configurações do WhatsApp.')
    }

    return data
}

/**
 * Atualiza os templates de mensagens e o tempo do lembrete.
 */
export async function salvarTemplatesMensagem(
    mensagemConfirmacao: string,
    mensagemLembrete: string,
    tempoLembreteMinutos: number
) {
    const { orgId } = await auth()
    if (!orgId) {
        throw new Error('Não autorizado. Nenhuma organização ativa.')
    }

    if (!mensagemConfirmacao.trim() || !mensagemLembrete.trim() || tempoLembreteMinutos <= 0) {
        throw new Error('Preencha os templates e o tempo do lembrete corretamente.')
    }

    const supabase = await createClient()

    // O status e dados de conexão de instância não mudam aqui
    const { data, error } = await supabase
        .from('whatsapp_configs')
        .update({
            mensagem_confirmacao: mensagemConfirmacao.trim(),
            mensagem_lembrete: mensagemLembrete.trim(),
            tempo_lembrete_minutos: tempoLembreteMinutos,
            updated_at: new Date().toISOString()
        })
        .eq('tenant_id', orgId)
        .select()
        .single()

    if (error) {
        console.error('Erro ao salvar templates do WhatsApp:', error.message)
        throw new Error('Erro ao salvar templates no banco de dados.')
    }

    return data
}

/**
 * Cria uma nova instância na Evolution API para a organização autenticada.
 */
export async function criarInstanciaWhatsApp() {
    const { orgId } = await auth()
    if (!orgId) {
        throw new Error('Não autorizado. Nenhuma organização ativa.')
    }

    // Higieniza o orgId do Clerk para ser usado como nome da instância (somente letras, números e hífens)
    const instanceName = `instancia-${orgId.replace(/[^a-zA-Z0-9-]/g, '')}`.toLowerCase()

    const supabase = await createClient()

    try {
        // 1. Chamar Evolution API para criar instância
        const response = await fetch(`${EVOLUTION_API_URL}/instance/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': EVOLUTION_GLOBAL_API_KEY
            },
            body: JSON.stringify({
                instanceName,
                qrcode: true,
                integration: 'WHATSAPP-BAILEYS'
            })
        })

        if (!response.ok) {
            const errText = await response.text()
            console.error('Erro na resposta do Evolution API:', errText)
            throw new Error('Falha ao criar instância no gateway de WhatsApp.')
        }

        const dataRes = await response.json()
        const instanceToken = dataRes.hash?.apikey

        if (!instanceToken) {
            throw new Error('Evolution API não retornou a chave apikey da instância.')
        }

        // 2. Salvar configurações no Supabase usando upsert
        const { data, error } = await supabase
            .from('whatsapp_configs')
            .upsert({
                tenant_id: orgId,
                instance_name: instanceName,
                instance_token: instanceToken,
                status: 'aguardando_qrcode',
                updated_at: new Date().toISOString()
            }, { onConflict: 'tenant_id' })
            .select()
            .single()

        if (error) {
            console.error('Erro ao salvar instância no banco:', error.message)
            throw new Error('Erro ao registrar a instância de WhatsApp no banco de dados.')
        }

        return data
    } catch (err: any) {
        console.error('Erro ao criar conexão com WhatsApp:', err)
        throw new Error(err.message || 'Erro de comunicação com o gateway do WhatsApp.')
    }
}

/**
 * Busca o QR Code de conexão (base64) diretamente do Evolution API.
 * Se a API indicar que já está conectado, atualiza o status no banco de dados.
 */
export async function obterQrCodeWhatsApp(instanceName: string) {
    const { orgId } = await auth()
    if (!orgId) {
        throw new Error('Não autorizado.')
    }

    try {
        // Buscar conexão na Evolution API
        const response = await fetch(`${EVOLUTION_API_URL}/instance/connect/${instanceName}`, {
            method: 'GET',
            headers: {
                'apikey': EVOLUTION_GLOBAL_API_KEY
            }
        })

        if (!response.ok) {
            // Se a instância já estiver conectada, a Evolution API pode retornar um erro HTTP ou status correspondente
            const errText = await response.text()
            console.warn('Conexão/QR Code retorno da Evolution API:', errText)

            // Vamos checar o status real da instância fazendo um GET no status geral
            const statusRes = await fetch(`${EVOLUTION_API_URL}/instance/connectionState/${instanceName}`, {
                method: 'GET',
                headers: {
                    'apikey': EVOLUTION_GLOBAL_API_KEY
                }
            })

            if (statusRes.ok) {
                const statusData = await statusRes.json()
                if (statusData.instance?.state === 'open' || statusData.state === 'open') {
                    // Atualiza banco para conectado
                    const supabase = await createClient()
                    await supabase
                        .from('whatsapp_configs')
                        .update({ status: 'conectado', updated_at: new Date().toISOString() })
                        .eq('tenant_id', orgId)
                    
                    return { status: 'conectado', qrcode: null }
                }
            }

            throw new Error('Erro ao gerar QR Code. Tente reiniciar a instância.')
        }

        const dataRes = await response.json()

        // Se retornar conectado diretamente na resposta
        if (dataRes.status === 'CONNECTED' || dataRes.state === 'open') {
            const supabase = await createClient()
            await supabase
                .from('whatsapp_configs')
                .update({ status: 'conectado', updated_at: new Date().toISOString() })
                .eq('tenant_id', orgId)

            return { status: 'conectado', qrcode: null }
        }

        // Caso retorne QR Code base64
        // A Evolution API pode retornar no campo code, base64 ou qrcode
        const qrcode = dataRes.base64 || dataRes.qrcode || dataRes.code

        if (!qrcode) {
            throw new Error('QR Code não retornado pelo gateway.')
        }

        return { status: 'aguardando_qrcode', qrcode }
    } catch (err: any) {
        console.error('Erro ao obter QR Code:', err)
        throw new Error(err.message || 'Erro de comunicação ao buscar QR Code.')
    }
}

/**
 * Desconecta e exclui a instância de WhatsApp da Evolution API e do banco.
 */
export async function desconectarWhatsApp(instanceName: string) {
    const { orgId } = await auth()
    if (!orgId) {
        throw new Error('Não autorizado.')
    }

    const supabase = await createClient()

    try {
        // 1. Chamar Evolution API para deletar instância
        const response = await fetch(`${EVOLUTION_API_URL}/instance/delete/${instanceName}`, {
            method: 'DELETE',
            headers: {
                'apikey': EVOLUTION_GLOBAL_API_KEY
            }
        })

        if (!response.ok) {
            console.error('Instância já deletada ou erro na chamada de delete:', await response.text())
        }

        // 2. Atualizar banco de dados para desconectado e limpar tokens
        const { error } = await supabase
            .from('whatsapp_configs')
            .update({
                instance_token: null,
                status: 'desconectado',
                updated_at: new Date().toISOString()
            })
            .eq('tenant_id', orgId)

        if (error) {
            console.error('Erro ao atualizar status de desconexão:', error.message)
            throw new Error('Erro ao salvar status de desconexão no banco.')
        }

        return true
    } catch (err: any) {
        console.error('Erro ao desconectar WhatsApp:', err)
        throw new Error(err.message || 'Erro ao processar desconexão.')
    }
}
