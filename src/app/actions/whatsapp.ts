'use server'

import { createClient } from '@/lib/supabase/server'
import { auth } from '@clerk/nextjs/server'
import { PLANOS } from '@/lib/planos'
import { obterAssinaturaVigente } from '@/lib/assinaturas'
import {
    mapearEstadoEvolution,
    enviarMensagemWhatsApp,
    registrarDisparo,
    type ResultadoEnvio
} from '@/lib/whatsapp-helper'

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080'
const EVOLUTION_GLOBAL_API_KEY = process.env.EVOLUTION_GLOBAL_API_KEY || 'global_key_here'

async function exigirPlanoComWhatsapp(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string) {
    const { plano } = await obterAssinaturaVigente(supabase, orgId)
    if (!PLANOS[plano].recursos.whatsapp) {
        throw new Error('A integração com WhatsApp é um recurso do plano Pro. Faça upgrade em Plano no menu.')
    }
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

    await exigirPlanoComWhatsapp(supabase, orgId)

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

    await exigirPlanoComWhatsapp(supabase, orgId)

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

        let instanceToken: string | undefined

        if (response.ok) {
            const dataRes = await response.json()
            // v2.3.7 retorna hash como string; versões anteriores usavam hash.apikey
            instanceToken = typeof dataRes.hash === 'string' ? dataRes.hash : dataRes.hash?.apikey
        } else {
            const errText = await response.text()

            // Instância já existe no gateway (ex.: tentativa anterior que não concluiu
            // o fluxo): recupera o token dela em vez de falhar.
            if (errText.includes('already in use')) {
                const fetchRes = await fetch(
                    `${EVOLUTION_API_URL}/instance/fetchInstances?instanceName=${instanceName}`,
                    { headers: { 'apikey': EVOLUTION_GLOBAL_API_KEY } }
                )
                if (fetchRes.ok) {
                    const instancias = await fetchRes.json()
                    instanceToken = Array.isArray(instancias) ? instancias[0]?.token : undefined
                }
            }

            if (!instanceToken) {
                console.error('Erro na resposta do Evolution API:', errText)
                throw new Error('Falha ao criar instância no gateway de WhatsApp.')
            }
        }

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
    } catch (err) {
        console.error('Erro ao criar conexão com WhatsApp:', err)
        throw new Error(err instanceof Error && err.message ? err.message : 'Erro de comunicação com o gateway do WhatsApp.')
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
        // (o formato atual da Evolution API aninha o estado em instance.state)
        if (dataRes.status === 'CONNECTED' || dataRes.state === 'open' || dataRes.instance?.state === 'open') {
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
    } catch (err) {
        console.error('Erro ao obter QR Code:', err)
        throw new Error(err instanceof Error && err.message ? err.message : 'Erro de comunicação ao buscar QR Code.')
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
    } catch (err) {
        console.error('Erro ao desconectar WhatsApp:', err)
        throw new Error(err instanceof Error && err.message ? err.message : 'Erro ao processar desconexão.')
    }
}

/**
 * Sincroniza o status persistido no banco com o estado real da instância no
 * gateway (Evolution API). Somente leitura de plano (a página já barra antes),
 * então NÃO faz gate de plano. Nunca lança exceção que derrube a página SSR:
 * qualquer falha degrada para 'instavel' quando cabível.
 *
 * Regras da máquina de estados:
 * - gateway 'open' SEMPRE promove a 'conectado' (sobrescreve instavel/falha);
 * - banco 'aguardando_qrcode' + gateway connecting/close → mantém 'aguardando_qrcode';
 * - gateway inalcançável (timeout/rede) → 'instavel' se o banco dizia 'conectado';
 * - HTTP 404 (instância inexistente no gateway) com linha no banco → 'falha'.
 */
export async function sincronizarStatusWhatsApp() {
    const { orgId } = await auth()
    if (!orgId) {
        return null
    }

    const supabase = await createClient()

    // Nunca selecionar instance_token aqui: o retorno desta função é passado
    // como prop a um Client Component e seria serializado até o browser.
    const { data: config } = await supabase
        .from('whatsapp_configs')
        .select('id, instance_name, status, ultima_verificacao_em, mensagem_confirmacao, mensagem_lembrete, tempo_lembrete_minutos')
        .eq('tenant_id', orgId)
        .maybeSingle()

    // Sem config ou sem instância provisionada: nada a sincronizar.
    if (!config || !config.instance_name) {
        return config
    }

    let novoStatus = config.status
    let gatewayRespondeu = false

    try {
        const res = await fetch(
            `${EVOLUTION_API_URL}/instance/connectionState/${config.instance_name}`,
            {
                method: 'GET',
                headers: { 'apikey': EVOLUTION_GLOBAL_API_KEY },
                signal: AbortSignal.timeout(4000)
            }
        )

        if (res.status === 404) {
            // Instância não existe mais no gateway: exige reconexão.
            gatewayRespondeu = true
            novoStatus = 'falha'
        } else if (res.ok) {
            gatewayRespondeu = true
            const dataRes = await res.json().catch(() => null)
            const state = dataRes?.instance?.state ?? dataRes?.state
            const mapeado = mapearEstadoEvolution(state)

            if (mapeado === 'conectado') {
                novoStatus = 'conectado'
            } else if (
                config.status === 'aguardando_qrcode' &&
                (mapeado === 'conectando' || mapeado === 'desconectado')
            ) {
                // Ainda no fluxo de pareamento: preserva a tela de QR Code.
                novoStatus = 'aguardando_qrcode'
            } else {
                novoStatus = mapeado
            }
        } else {
            // Gateway alcançável, mas respondeu com erro inesperado: não confirmamos.
            if (config.status === 'conectado') {
                novoStatus = 'instavel'
            }
        }
    } catch (err) {
        // Timeout ou falha de rede: gateway inalcançável agora.
        console.error('Falha ao sincronizar status do WhatsApp (ignorada):', err)
        if (config.status === 'conectado') {
            novoStatus = 'instavel'
        }
    }

    const houveMudanca = novoStatus !== config.status

    if (houveMudanca || gatewayRespondeu) {
        const agora = new Date().toISOString()
        const patch: Record<string, unknown> = {}
        // updated_at continua significando "configuração alterada": só muda
        // junto com o status. A mera verificação usa ultima_verificacao_em.
        if (houveMudanca) {
            patch.status = novoStatus
            patch.updated_at = agora
            config.status = novoStatus
        }
        // Só marca "verificado" quando o gateway realmente respondeu.
        if (gatewayRespondeu) {
            patch.ultima_verificacao_em = agora
            config.ultima_verificacao_em = agora
        }

        const { error } = await supabase
            .from('whatsapp_configs')
            .update(patch)
            .eq('tenant_id', orgId)

        if (error) {
            console.error('Erro ao persistir status sincronizado do WhatsApp:', error.message)
        }
    }

    return config
}

/**
 * Reinicia a conexão: apaga a instância atual no gateway (ignorando erro) e
 * recria do zero. `criarInstanciaWhatsApp` já recupera instância órfã via
 * "already in use" → fetchInstances. Recurso do plano Pro.
 */
export async function reiniciarConexaoWhatsApp() {
    const { orgId } = await auth()
    if (!orgId) {
        throw new Error('Não autorizado. Nenhuma organização ativa.')
    }

    const supabase = await createClient()
    await exigirPlanoComWhatsapp(supabase, orgId)

    const { data: config } = await supabase
        .from('whatsapp_configs')
        .select('instance_name')
        .eq('tenant_id', orgId)
        .maybeSingle()

    if (config?.instance_name) {
        try {
            await fetch(`${EVOLUTION_API_URL}/instance/delete/${config.instance_name}`, {
                method: 'DELETE',
                headers: { 'apikey': EVOLUTION_GLOBAL_API_KEY }
            })
        } catch (err) {
            console.error('Erro ao deletar instância na reinicialização (ignorado):', err)
        }
    }

    return criarInstanciaWhatsApp()
}

/**
 * Envia uma mensagem de teste para validar a integração. Recurso do plano Pro.
 * Retorna resultado rico para feedback inline na UI.
 */
export async function enviarMensagemTesteWhatsApp(telefone: string): Promise<ResultadoEnvio> {
    const { orgId } = await auth()
    if (!orgId) {
        return { ok: false, motivo: 'nao_autorizado' }
    }

    const supabase = await createClient()
    await exigirPlanoComWhatsapp(supabase, orgId)

    const telefoneLimpo = telefone.replace(/\D/g, '')
    if (telefoneLimpo.length < 10 || telefoneLimpo.length > 11) {
        return { ok: false, motivo: 'telefone_invalido' }
    }

    const { data: config } = await supabase
        .from('whatsapp_configs')
        .select('*')
        .eq('tenant_id', orgId)
        .maybeSingle()

    if (!config || config.status !== 'conectado' || !config.instance_token) {
        return { ok: false, motivo: 'whatsapp_desconectado' }
    }

    const texto = 'Mensagem de teste do VamoAgendar: sua integração de WhatsApp está funcionando! 🎉'

    const envio = await enviarMensagemWhatsApp(
        config.instance_name,
        config.instance_token,
        telefoneLimpo,
        texto
    )

    await registrarDisparo(supabase, {
        tenantId: orgId,
        tipo: 'teste',
        status: envio.ok ? 'enviado' : 'falha',
        motivo: envio.ok ? null : envio.motivo
    })

    return envio
}

/**
 * Lista os últimos disparos de WhatsApp do tenant autenticado para auditoria.
 * O RLS já restringe ao tenant; o join traz o nome do cliente do agendamento.
 */
export async function listarDisparosWhatsApp(limite = 20) {
    const { orgId } = await auth()
    if (!orgId) {
        throw new Error('Não autorizado. Nenhuma organização ativa.')
    }

    const supabase = await createClient()

    const { data, error } = await supabase
        .from('disparos_whatsapp')
        .select(`
            id,
            tipo,
            status,
            motivo,
            created_at,
            agendamentos (
                clientes (
                    nome
                )
            )
        `)
        .eq('tenant_id', orgId)
        .order('created_at', { ascending: false })
        .limit(limite)

    if (error) {
        console.error('Erro ao listar disparos de WhatsApp:', error.message)
        return []
    }

    return data || []
}
