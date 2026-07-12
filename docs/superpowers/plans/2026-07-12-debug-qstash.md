# Página de Debug do QStash — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Página temporária `/debug/qstash` que dá visibilidade da cadeia publish → QStash → webhook de lembrete e permite disparos manuais, para diagnosticar por que os lembretes de WhatsApp nunca chegam.

**Architecture:** Server Component (`page.tsx`) carrega logs da API REST do QStash, agendamentos recentes via admin client do Supabase e sanidade de env; ilha client (`DebugQStashClient.tsx`) renderiza tabelas e botões que chamam Server Actions (`debug-qstash.ts`). Tudo gated por `DEBUG_QSTASH=1` e protegido por login Clerk (rota `/debug` não é pública no `proxy.ts`).

**Tech Stack:** Next.js 16 App Router, React 19 (`useTransition`), Supabase admin client (`createAdminClient`), API REST do QStash (`GET /v2/logs`, `POST /v2/publish/*`), Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-07-12-debug-qstash-design.md`

## Global Constraints

- Ferramenta **descartável**: todo código novo restrito a `src/app/debug/qstash/` e `src/app/actions/debug-qstash.ts`. Não modificar código de produção existente.
- Página e actions só funcionam com `DEBUG_QSTASH=1`; caso contrário `notFound()` / erro.
- Domínio em pt-BR (`dispararLembreteAgora`, `publicarTesteQStash`, `eventos`, `sanidade`).
- Mutações só via Server Actions — nenhuma rota REST nova.
- Sem testes automatizados (não há framework no projeto; ferramenta descartável). Verificação: `pnpm lint`, `pnpm build` e smoke manual.
- Gerenciador de pacotes: **pnpm**. Nenhuma dependência nova.
- Renderização defensiva dos logs do QStash: campo ausente nunca quebra a página.
- O secret nunca aparece em URLs exibidas (mascarar `secret=...` → `secret=***`).

---

### Task 1: Tipos compartilhados + Server Actions de debug

**Files:**
- Create: `src/app/debug/qstash/types.ts`
- Create: `src/app/actions/debug-qstash.ts`

**Interfaces:**
- Consumes: `headers()` de `next/headers`; envs `QSTASH_TOKEN`, `QSTASH_URL`, `QSTASH_CURRENT_SIGNING_KEY`, `APP_URL`, `DEBUG_QSTASH`.
- Produces:
  - `types.ts`: interfaces `EventoQStash`, `AgendamentoDebug`, `SanidadeEnv`, `ResultadoAcaoDebug` (usadas pelas Tasks 2 e 3).
  - `debug-qstash.ts`: `dispararLembreteAgora(agendamentoId: string, tenantId: string): Promise<ResultadoAcaoDebug>` e `publicarTesteQStash(agendamentoId: string, tenantId: string): Promise<ResultadoAcaoDebug>`.

- [ ] **Step 1: Criar `src/app/debug/qstash/types.ts`**

```typescript
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
```

- [ ] **Step 2: Criar `src/app/actions/debug-qstash.ts`**

Observação: o publish é replicado inline (não reusa `agendarLembreteQStash`) porque o helper retorna apenas boolean e o objetivo é capturar status e corpo da resposta do QStash. Os defaults de env espelham `src/lib/whatsapp-helper.ts` de propósito — o debug deve se comportar como o código de produção.

```typescript
'use server'

import { headers } from 'next/headers'
import type { ResultadoAcaoDebug } from '@/app/debug/qstash/types'

// Defaults idênticos aos de src/lib/whatsapp-helper.ts: o debug deve
// reproduzir exatamente o comportamento do código de produção.
const QSTASH_URL = process.env.QSTASH_URL || 'https://qstash-us-east-1.upstash.io'
const APP_URL = process.env.APP_URL || 'https://vamoagendar.com.br'
const WEBHOOK_SECRET = process.env.QSTASH_CURRENT_SIGNING_KEY || 'secret-key'

function garantirDebugAtivo() {
    if (process.env.DEBUG_QSTASH !== '1') {
        throw new Error('Debug do QStash desativado. Defina DEBUG_QSTASH=1 no ambiente.')
    }
}

/**
 * Chama o webhook de lembrete diretamente na própria instância (sem QStash),
 * para testar a lógica do webhook isolada — funciona em localhost.
 */
export async function dispararLembreteAgora(
    agendamentoId: string,
    tenantId: string
): Promise<ResultadoAcaoDebug> {
    garantirDebugAtivo()

    const h = await headers()
    const host = h.get('host') ?? 'localhost:3000'
    const proto = h.get('x-forwarded-proto') ?? 'http'
    const url = `${proto}://${host}/api/webhooks/lembrete?secret=${WEBHOOK_SECRET}`

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agendamentoId, tenantId }),
            cache: 'no-store'
        })
        const corpo = await response.text()
        return {
            ok: response.ok,
            status: response.status,
            corpo,
            mensagem: response.ok
                ? 'Webhook executado diretamente (sem QStash).'
                : 'Webhook retornou erro — veja o corpo da resposta.'
        }
    } catch (err) {
        return {
            ok: false,
            mensagem: `Falha de rede ao chamar o webhook: ${err instanceof Error ? err.message : String(err)}`
        }
    }
}

/**
 * Publica uma mensagem de teste no QStash com entrega em ~60s, replicando o
 * publish de agendarLembreteQStash mas capturando a resposta completa.
 * Só faz sentido quando APP_URL é alcançável publicamente.
 */
export async function publicarTesteQStash(
    agendamentoId: string,
    tenantId: string
): Promise<ResultadoAcaoDebug> {
    garantirDebugAtivo()

    const token = process.env.QSTASH_TOKEN
    if (!token) {
        return { ok: false, mensagem: 'QSTASH_TOKEN não configurado no ambiente.' }
    }

    const webhookUrl = `${APP_URL}/api/webhooks/lembrete?secret=${WEBHOOK_SECRET}`
    const notBefore = Math.floor((Date.now() + 60_000) / 1000)

    try {
        const response = await fetch(`${QSTASH_URL}/v2/publish/${webhookUrl}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Upstash-Not-Before': String(notBefore)
            },
            body: JSON.stringify({ agendamentoId, tenantId }),
            cache: 'no-store'
        })
        const corpo = await response.text()
        return {
            ok: response.ok,
            status: response.status,
            corpo,
            mensagem: response.ok
                ? `Publicado no QStash — entrega prevista em ~60s para ${APP_URL}. Use o refresh para acompanhar.`
                : 'QStash rejeitou o publish — veja o corpo da resposta.'
        }
    } catch (err) {
        return {
            ok: false,
            mensagem: `Falha de rede ao publicar no QStash: ${err instanceof Error ? err.message : String(err)}`
        }
    }
}
```

- [ ] **Step 3: Rodar lint**

Run: `pnpm lint`
Expected: sem erros novos (avisos pré-existentes de outros arquivos podem aparecer).

- [ ] **Step 4: Commit**

```bash
git add src/app/debug/qstash/types.ts src/app/actions/debug-qstash.ts
git commit -m "feat(debug): actions temporárias de disparo manual de lembrete QStash"
```

---

### Task 2: Ilha client com tabelas e botões de disparo

**Files:**
- Create: `src/app/debug/qstash/DebugQStashClient.tsx`

**Interfaces:**
- Consumes: `dispararLembreteAgora` / `publicarTesteQStash` da Task 1; tipos de `./types`.
- Produces: `DebugQStashClient` (default export), props `{ eventos: EventoQStash[]; erroLogs: string | null; agendamentos: AgendamentoDebug[]; sanidade: SanidadeEnv }` — consumido pela Task 3.

- [ ] **Step 1: Criar `src/app/debug/qstash/DebugQStashClient.tsx`**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { dispararLembreteAgora, publicarTesteQStash } from '@/app/actions/debug-qstash'
import type { AgendamentoDebug, EventoQStash, ResultadoAcaoDebug, SanidadeEnv } from './types'

interface Props {
    eventos: EventoQStash[]
    erroLogs: string | null
    agendamentos: AgendamentoDebug[]
    sanidade: SanidadeEnv
}

function formatarTimestamp(valor: number | null): string {
    if (!valor) return '—'
    // QStash mistura segundos e milissegundos conforme o campo
    const ms = valor < 1e12 ? valor * 1000 : valor
    return new Date(ms).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

const CORES_ESTADO: Record<string, string> = {
    DELIVERED: 'bg-emerald-100 text-emerald-700',
    ERROR: 'bg-red-100 text-red-700',
    FAILED: 'bg-red-100 text-red-700',
    CANCELLED: 'bg-red-100 text-red-700',
    RETRY: 'bg-amber-100 text-amber-700',
    IN_PROGRESS: 'bg-blue-100 text-blue-700',
    ACTIVE: 'bg-blue-100 text-blue-700',
    CREATED: 'bg-zinc-200 text-zinc-600',
}

export default function DebugQStashClient({ eventos, erroLogs, agendamentos, sanidade }: Props) {
    const router = useRouter()
    const [pendente, startTransition] = useTransition()
    const [resultados, setResultados] = useState<Record<string, ResultadoAcaoDebug>>({})

    function executar(chave: string, acao: () => Promise<ResultadoAcaoDebug>) {
        startTransition(async () => {
            const resultado = await acao()
            setResultados(prev => ({ ...prev, [chave]: resultado }))
        })
    }

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-8 text-sm">
            <header className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Debug QStash</h1>
                    <p className="text-zinc-500">Ferramenta temporária — remover após diagnóstico dos lembretes.</p>
                </div>
                <button
                    onClick={() => router.refresh()}
                    disabled={pendente}
                    className="rounded-lg border border-zinc-300 px-4 py-2 font-medium transition-all duration-200 hover:bg-zinc-100 disabled:opacity-50"
                >
                    Atualizar dados
                </button>
            </header>

            <section>
                <h2 className="text-lg font-semibold mb-3">Sanidade de ambiente</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-xl border border-zinc-200 p-4 font-mono text-xs">
                    <div>QSTASH_TOKEN: {sanidade.qstashToken ? '✅ presente' : '❌ ausente'}</div>
                    <div>QSTASH_CURRENT_SIGNING_KEY: {sanidade.signingKey ? '✅ presente' : '❌ ausente (usando fallback "secret-key")'}</div>
                    <div>SUPABASE_SECRET_KEY: {sanidade.supabaseSecret ? '✅ presente' : '❌ ausente'}</div>
                    <div>QSTASH_URL: {sanidade.qstashUrl ?? '⚠️ não definida — código usa default https://qstash-us-east-1.upstash.io'}</div>
                    <div>APP_URL: {sanidade.appUrl ?? '⚠️ não definida — código usa default https://vamoagendar.com.br'}</div>
                    <div>EVOLUTION_API_URL: {sanidade.evolutionUrl ?? '⚠️ não definida — código usa default http://localhost:8080'}</div>
                </div>
            </section>

            <section>
                <h2 className="text-lg font-semibold mb-3">Agendamentos recentes</h2>
                <div className="overflow-x-auto rounded-xl border border-zinc-200">
                    <table className="w-full text-left">
                        <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                            <tr>
                                <th className="px-3 py-2">Data/hora</th>
                                <th className="px-3 py-2">Cliente</th>
                                <th className="px-3 py-2">Serviço</th>
                                <th className="px-3 py-2">Status</th>
                                <th className="px-3 py-2">WhatsApp</th>
                                <th className="px-3 py-2">Lembrete (min)</th>
                                <th className="px-3 py-2">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                            {agendamentos.length === 0 && (
                                <tr><td colSpan={7} className="px-3 py-4 text-zinc-400">Nenhum agendamento encontrado.</td></tr>
                            )}
                            {agendamentos.map((ag) => {
                                const resultado = resultados[ag.id]
                                return (
                                    <tr key={ag.id} className="align-top">
                                        <td className="px-3 py-2 whitespace-nowrap">
                                            {new Date(ag.dataHora).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                                            <div className="text-[10px] text-zinc-400 font-mono">{ag.id}</div>
                                        </td>
                                        <td className="px-3 py-2">{ag.clienteNome}</td>
                                        <td className="px-3 py-2">{ag.servicoNome}</td>
                                        <td className="px-3 py-2">{ag.status}</td>
                                        <td className="px-3 py-2">{ag.whatsappStatus ?? 'sem config'}</td>
                                        <td className="px-3 py-2">{ag.tempoLembreteMinutos ?? '—'}</td>
                                        <td className="px-3 py-2 space-y-1 min-w-56">
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => executar(ag.id, () => dispararLembreteAgora(ag.id, ag.tenantId))}
                                                    disabled={pendente}
                                                    className="rounded-md bg-zinc-900 px-2.5 py-1.5 text-xs font-semibold text-white transition-all duration-200 hover:opacity-90 disabled:opacity-50"
                                                >
                                                    Disparar agora
                                                </button>
                                                <button
                                                    onClick={() => executar(ag.id, () => publicarTesteQStash(ag.id, ag.tenantId))}
                                                    disabled={pendente}
                                                    className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs font-semibold transition-all duration-200 hover:bg-zinc-100 disabled:opacity-50"
                                                >
                                                    QStash +60s
                                                </button>
                                            </div>
                                            {resultado && (
                                                <pre className={`whitespace-pre-wrap break-all rounded-md p-2 text-[11px] ${resultado.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
                                                    {resultado.mensagem}
                                                    {resultado.status != null && `\nHTTP ${resultado.status}`}
                                                    {resultado.corpo && `\n${resultado.corpo}`}
                                                </pre>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </section>

            <section>
                <h2 className="text-lg font-semibold mb-3">Logs do QStash (webhook de lembrete)</h2>
                {erroLogs && (
                    <div className="mb-3 rounded-lg bg-red-50 p-3 text-red-800">{erroLogs}</div>
                )}
                <div className="overflow-x-auto rounded-xl border border-zinc-200">
                    <table className="w-full text-left">
                        <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                            <tr>
                                <th className="px-3 py-2">Horário</th>
                                <th className="px-3 py-2">Estado</th>
                                <th className="px-3 py-2">Agendamento</th>
                                <th className="px-3 py-2">Entrega prevista</th>
                                <th className="px-3 py-2">Resposta do webhook</th>
                                <th className="px-3 py-2">Erro</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                            {eventos.length === 0 && !erroLogs && (
                                <tr><td colSpan={6} className="px-3 py-4 text-zinc-400">Nenhum evento do webhook de lembrete nos logs do QStash — nenhuma mensagem foi publicada (ou já expiraram da retenção).</td></tr>
                            )}
                            {eventos.map((ev, i) => (
                                <tr key={`${ev.messageId}-${i}`} className="align-top">
                                    <td className="px-3 py-2 whitespace-nowrap">
                                        {formatarTimestamp(ev.horario)}
                                        <div className="text-[10px] text-zinc-400 font-mono">{ev.messageId}</div>
                                    </td>
                                    <td className="px-3 py-2">
                                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CORES_ESTADO[ev.estado] ?? 'bg-zinc-100 text-zinc-600'}`}>
                                            {ev.estado}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 font-mono text-[11px] break-all">{ev.agendamentoId ?? ev.corpo ?? '—'}</td>
                                    <td className="px-3 py-2 whitespace-nowrap">
                                        {formatarTimestamp(ev.notBefore)}
                                        {ev.proximaEntrega != null && (
                                            <div className="text-[10px] text-zinc-400">próx. tentativa: {formatarTimestamp(ev.proximaEntrega)}</div>
                                        )}
                                    </td>
                                    <td className="px-3 py-2 max-w-72">
                                        {ev.respostaStatus != null ? `HTTP ${ev.respostaStatus}` : '—'}
                                        {ev.respostaCorpo && (
                                            <pre className="whitespace-pre-wrap break-all text-[11px] text-zinc-500">{ev.respostaCorpo}</pre>
                                        )}
                                    </td>
                                    <td className="px-3 py-2 text-red-700 max-w-56 break-all">{ev.erro ?? '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    )
}
```

- [ ] **Step 2: Rodar lint**

Run: `pnpm lint`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add src/app/debug/qstash/DebugQStashClient.tsx
git commit -m "feat(debug): ilha client da página de debug do QStash"
```

---

### Task 3: Server Component da página (loaders)

**Files:**
- Create: `src/app/debug/qstash/page.tsx`

**Interfaces:**
- Consumes: `DebugQStashClient` (Task 2), tipos (Task 1), `createAdminClient` de `@/lib/supabase/admin`.
- Produces: rota `/debug/qstash` (protegida por Clerk via `proxy.ts` + gate `DEBUG_QSTASH=1`).

- [ ] **Step 1: Criar `src/app/debug/qstash/page.tsx`**

Notas:
- `QSTASH_URL` resolve com o **mesmo default do helper de produção** para consultar exatamente o host que o publish usa.
- Resposta do `/v2/logs` tratada defensivamente (`data.events ?? data.logs ?? []`; campos opcionais).
- `body`/`responseBody` chegam em base64 — decodificar com `Buffer`.
- Secret mascarado nas URLs exibidas.

```tsx
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
```

- [ ] **Step 2: Rodar lint**

Run: `pnpm lint`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add src/app/debug/qstash/page.tsx
git commit -m "feat(debug): página temporária /debug/qstash com logs e disparos manuais"
```

---

### Task 4: Verificação de build e smoke manual

**Files:**
- Modify: `.env.local` (adicionar `DEBUG_QSTASH=1` — arquivo gitignored, sem commit)

**Interfaces:**
- Consumes: tudo das Tasks 1–3.
- Produces: build validado; instruções de uso para o operador.

- [ ] **Step 1: Habilitar a flag no env local**

Adicionar ao final de `.env.local`:

```
DEBUG_QSTASH=1
```

- [ ] **Step 2: Build de produção**

Run: `pnpm build`
Expected: build conclui sem erros; rota `/debug/qstash` listada como dinâmica (ƒ).

- [ ] **Step 3: Smoke manual (operador)**

1. `pnpm dev`, logar no Clerk e abrir `http://localhost:3000/debug/qstash`.
2. Conferir painel de sanidade (todas as envs presentes?).
3. Seção de logs do QStash carrega? Se vazia com "nenhuma mensagem foi publicada", já é um diagnóstico (publish nunca acontece).
4. Clicar **Disparar agora** num agendamento futuro de tenant com WhatsApp conectado → deve chegar mensagem no WhatsApp ou aparecer o erro exato do webhook inline.
5. Sem a flag (`DEBUG_QSTASH` removida), `/debug/qstash` deve responder 404.

- [ ] **Step 4: Registrar remoção futura**

Adicionar em `docs/PENDENCIAS.md` uma linha lembrando de remover `src/app/debug/qstash/` e `src/app/actions/debug-qstash.ts` (e a flag) após o diagnóstico. Commit:

```bash
git add docs/PENDENCIAS.md
git commit -m "docs: registrar remoção futura da página de debug do QStash"
```
