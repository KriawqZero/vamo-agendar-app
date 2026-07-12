// Tipos da página temporária de debug do QStash (ver docs/superpowers/specs/2026-07-12-debug-qstash-design.md)

export interface EventoQStash {
    messageId: string
    estado: string
    url: string
    horario: number | null
    notBefore: number | null
    proximaEntrega: number | null
    respostaStatus: number | null
    respostaCorpo: string | null
    corpo: string | null
    agendamentoId: string | null
    erro: string | null
}

export interface AgendamentoDebug {
    id: string
    dataHora: string
    status: string
    tenantId: string
    clienteNome: string
    servicoNome: string
    whatsappStatus: string | null
    tempoLembreteMinutos: number | null
}

export interface SanidadeEnv {
    qstashToken: boolean
    signingKey: boolean
    supabaseSecret: boolean
    qstashUrl: string | null
    appUrl: string | null
    evolutionUrl: string | null
}

export interface ResultadoAcaoDebug {
    ok: boolean
    status?: number
    corpo?: string
    mensagem: string
}
