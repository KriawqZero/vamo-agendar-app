import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import DebugQStashClient from './DebugQStashClient'
import type { AgendamentoDebug, EventoQStash, SanidadeEnv } from './types'

// Mesmo default do src/lib/whatsapp-helper.ts: consultar o host que o publish usa
const QSTASH_URL = process.env.QSTASH_URL || 'https://qstash-us-east-1.upstash.io'

export const dynamic = 'force-dynamic'

function decodificarBase64(valor: unknown): string | null {
    if (typeof valor !== 'string' || valor === '') return null
    try {
        return Buffer.from(valor, 'base64').toString('utf-8')
    } catch {
        return valor
    }
}

function extrairAgendamentoId(corpoJson: string | null): string | null {
    if (!corpoJson) return null
    try {
        const parsed = JSON.parse(corpoJson)
        return typeof parsed.agendamentoId === 'string' ? parsed.agendamentoId : null
    } catch {
        return null
    }
}

function mascararSecret(url: string): string {
    return url.replace(/secret=[^&]+/g, 'secret=***')
}

async function buscarLogsQStash(): Promise<{ eventos: EventoQStash[]; erro: string | null }> {
    const token = process.env.QSTASH_TOKEN
    if (!token) {
        return { eventos: [], erro: 'QSTASH_TOKEN não configurado — impossível consultar logs.' }
    }

    try {
        const response = await fetch(`${QSTASH_URL}/v2/logs?count=100`, {
            headers: { 'Authorization': `Bearer ${token}` },
            cache: 'no-store'
        })

        if (!response.ok) {
            return { eventos: [], erro: `QStash respondeu ${response.status} ao listar logs: ${await response.text()}` }
        }

        const data = await response.json()
        const brutos: Record<string, unknown>[] = data.events ?? data.logs ?? []

        const eventos: EventoQStash[] = brutos
            .filter((e) => typeof e.url === 'string' && e.url.includes('/api/webhooks/lembrete'))
            .map((e) => {
                const corpo = decodificarBase64(e.body)
                return {
                    messageId: typeof e.messageId === 'string' ? e.messageId : '—',
                    estado: typeof e.state === 'string' ? e.state : '—',
                    url: mascararSecret(e.url as string),
                    horario: typeof e.time === 'number' ? e.time : null,
                    notBefore: typeof e.notBefore === 'number' ? e.notBefore : null,
                    proximaEntrega: typeof e.nextDeliveryTime === 'number' ? e.nextDeliveryTime : null,
                    respostaStatus: typeof e.responseStatus === 'number' ? e.responseStatus : null,
                    respostaCorpo: decodificarBase64(e.responseBody),
                    corpo,
                    agendamentoId: extrairAgendamentoId(corpo),
                    erro: typeof e.error === 'string' ? e.error : null,
                }
            })

        return { eventos, erro: null }
    } catch (err) {
        return {
            eventos: [],
            erro: `Falha de rede ao consultar ${QSTASH_URL}/v2/logs: ${err instanceof Error ? err.message : String(err)}`
        }
    }
}

async function buscarAgendamentos(): Promise<AgendamentoDebug[]> {
    const supabase = createAdminClient()

    const { data: agendamentos } = await supabase
        .from('agendamentos')
        .select('id, data_hora, status, tenant_id, clientes (nome), servicos (nome)')
        .order('data_hora', { ascending: false })
        .limit(20)

    const { data: configs } = await supabase
        .from('whatsapp_configs')
        .select('tenant_id, status, tempo_lembrete_minutos')

    const configPorTenant = new Map(
        (configs ?? []).map((c) => [c.tenant_id as string, c])
    )

    return (agendamentos ?? []).map((ag) => {
        // Supabase Client pode devolver relações como array
        const cliente = Array.isArray(ag.clientes) ? ag.clientes[0] : ag.clientes
        const servico = Array.isArray(ag.servicos) ? ag.servicos[0] : ag.servicos
        const config = configPorTenant.get(ag.tenant_id as string)

        return {
            id: ag.id as string,
            dataHora: ag.data_hora as string,
            status: ag.status as string,
            tenantId: ag.tenant_id as string,
            clienteNome: cliente?.nome ?? '—',
            servicoNome: servico?.nome ?? '—',
            whatsappStatus: config?.status ?? null,
            tempoLembreteMinutos: config?.tempo_lembrete_minutos ?? null,
        }
    })
}

export default async function DebugQStashPage() {
    if (process.env.DEBUG_QSTASH !== '1') {
        notFound()
    }

    const sanidade: SanidadeEnv = {
        qstashToken: Boolean(process.env.QSTASH_TOKEN),
        signingKey: Boolean(process.env.QSTASH_CURRENT_SIGNING_KEY),
        supabaseSecret: Boolean(process.env.SUPABASE_SECRET_KEY),
        qstashUrl: process.env.QSTASH_URL ?? null,
        appUrl: process.env.APP_URL ?? null,
        evolutionUrl: process.env.EVOLUTION_API_URL ?? null,
    }

    const [{ eventos, erro }, agendamentos] = await Promise.all([
        buscarLogsQStash(),
        buscarAgendamentos(),
    ])

    return (
        <DebugQStashClient
            eventos={eventos}
            erroLogs={erro}
            agendamentos={agendamentos}
            sanidade={sanidade}
        />
    )
}
