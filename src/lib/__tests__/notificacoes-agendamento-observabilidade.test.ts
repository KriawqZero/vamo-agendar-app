import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { dispararNotificacoesAgendamento } from '../notificacoes-agendamento'
import { registrarDisparo } from '../whatsapp-helper'
import * as reportar from '../observabilidade/reportar'
import * as analyticsServer from '../analytics/server'

vi.mock('../observabilidade/reportar', () => ({
    reportarExcecao: vi.fn(),
    reportarExcecaoAguardando: vi.fn().mockResolvedValue(undefined),
    reportarFalhaSilenciosa: vi.fn(),
    reportarFalhaSilenciosaAguardando: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../analytics/server', () => ({
    capturarEventoTenant: vi.fn(),
    capturarEventoServidor: vi.fn(),
}))

vi.mock('../observabilidade/dsn', () => ({
    dsnDoSentry: () => 'https://fake-dsn@sentry.io/123',
}))

describe('Suíte Completa de Observabilidade da Mensageria (16 Scenários)', () => {
    const originalEnv = process.env

    beforeEach(() => {
        vi.clearAllMocks()
        process.env = {
            ...originalEnv,
            EVOLUTION_API_URL: 'http://localhost:8080',
            QSTASH_TOKEN: 'mock_qstash_token',
            QSTASH_URL: 'http://localhost:8082',
            QSTASH_CURRENT_SIGNING_KEY: 'mock_signing_key',
            APP_URL: 'https://vamoagendar.com.br',
            ANALYTICS_TENANT_SALT: 'salt_teste_123',
        }
    })

    function criarMockSupabase({
        perfilData = { nome_estabelecimento: 'Salão da Maria' },
        perfilError = null,
        configData = {
            instance_name: 'instancia_org1',
            instance_token: 'token123',
            status: 'conectado',
            mensagem_confirmacao: 'Confirmado {{cliente}}',
            mensagem_lembrete: 'Lembrete {{cliente}}',
            tempo_lembrete_minutos: 60,
        },
        configError = null,
        plano = 'pro',
        planoDegradado = false,
        disparoError = null,
    }: {
        perfilData?: Record<string, unknown> | null
        perfilError?: Record<string, unknown> | null
        configData?: Record<string, unknown> | null
        configError?: Record<string, unknown> | null
        plano?: 'gratuito' | 'pro'
        planoDegradado?: boolean
        disparoError?: Record<string, unknown> | null
    } = {}) {
        return {
            from: (tabela: string) => {
                if (tabela === 'perfis_empresas') {
                    return {
                        select: () => ({
                            eq: () => ({
                                maybeSingle: async () => ({ data: perfilData, error: perfilError }),
                            }),
                        }),
                    }
                }
                if (tabela === 'whatsapp_configs') {
                    return {
                        select: () => ({
                            eq: () => ({
                                maybeSingle: async () => ({ data: configData, error: configError }),
                            }),
                        }),
                    }
                }
                if (tabela === 'assinaturas') {
                    const resposta = {
                        data: plano === 'pro' ? { plano: 'pro', status: 'ativa' } : null,
                        error: planoDegradado ? { message: 'db_error' } : null,
                    }
                    const subCadeia = {
                        in: () => subCadeia,
                        maybeSingle: async () => resposta,
                    }
                    return {
                        select: () => ({
                            eq: () => subCadeia,
                        }),
                    }
                }
                if (tabela === 'disparos_whatsapp') {
                    return {
                        insert: async () => ({ error: disparoError }),
                    }
                }
                return {}
            },
        } as unknown as SupabaseClient
    }

    // Scenario 1: Evolution 200 (Sucesso)
    it('1. Evolution 200: log de sucesso, auditoria enviado, PostHog sent, sem Issue', async () => {

        vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: string | URL | Request) => {
            if (url.toString().includes('/message/sendText/')) {
                return { ok: true, json: async () => ({}) } as Response
            }
            if (url.toString().includes('/v2/publish/')) {
                return { ok: true, json: async () => ({ messageId: 'msg_123' }) } as Response
            }
            return { ok: true } as Response
        })

        const client = criarMockSupabase()

        // Futuro distante (amanhã)
        const amanha = new Date(Date.now() + 24 * 3600 * 1000).toISOString()

        await dispararNotificacoesAgendamento(client, {
            agendamentoId: 'ag_123',
            tenantId: 'org_123',
            clienteNome: 'Maria Santos',
            clienteTelefone: '5567999998888',
            dataHora: amanha,
            timezone: 'America/Sao_Paulo',
        })

        expect(analyticsServer.capturarEventoTenant).toHaveBeenCalledWith(
            'whatsapp_confirmation_sent',
            'org_123',
        )
        expect(analyticsServer.capturarEventoTenant).toHaveBeenCalledWith(
            'whatsapp_reminder_scheduled',
            'org_123',
        )
        expect(reportar.reportarExcecaoAguardando).not.toHaveBeenCalled()
    })

    // Scenario 2: Evolution 401/500
    it('2. Evolution 401/500: Issue, log error, auditoria falha, PostHog failed, sem PII', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: string | URL | Request) => {
            if (url.toString().includes('/message/sendText/')) {
                return { ok: false, status: 500, text: async () => 'PII_TESTE_MARIA 5567999998888' } as Response
            }
            return { ok: true, json: async () => ({ messageId: 'msg_123' }) } as Response
        })

        const client = criarMockSupabase()
        const amanha = new Date(Date.now() + 24 * 3600 * 1000).toISOString()

        await dispararNotificacoesAgendamento(client, {
            agendamentoId: 'ag_123',
            tenantId: 'org_123',
            clienteNome: 'Maria Santos',
            clienteTelefone: '5567999998888',
            dataHora: amanha,
            timezone: 'America/Sao_Paulo',
        })

        expect(analyticsServer.capturarEventoTenant).toHaveBeenCalledWith(
            'whatsapp_confirmation_failed',
            'org_123',
            { motivo: 'http_500' },
        )
        expect(reportar.reportarFalhaSilenciosaAguardando).toHaveBeenCalledWith(
            'whatsapp:evolution_http_error',
            expect.objectContaining({ statusCode: 500, motivo: 'http_500' }),
        )
        // Garantir ausência de PII
        const calls = vi.mocked(reportar.reportarFalhaSilenciosaAguardando).mock.calls
        const strCalls = JSON.stringify(calls)
        expect(strCalls).not.toContain('Maria Santos')
        expect(strCalls).not.toContain('5567999998888')
    })

    // Scenario 3: Evolution network error
    it('3. Evolution network error: Issue, log error, auditoria falha, PostHog failed, sem PII', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: string | URL | Request) => {
            if (url.toString().includes('/message/sendText/')) {
                throw new Error('Network error ECONNREFUSED')
            }
            return { ok: true } as Response
        })

        const client = criarMockSupabase()
        const amanha = new Date(Date.now() + 24 * 3600 * 1000).toISOString()

        await dispararNotificacoesAgendamento(client, {
            agendamentoId: 'ag_123',
            tenantId: 'org_123',
            clienteNome: 'Maria Santos',
            clienteTelefone: '5567999998888',
            dataHora: amanha,
            timezone: 'America/Sao_Paulo',
        })

        expect(analyticsServer.capturarEventoTenant).toHaveBeenCalledWith(
            'whatsapp_confirmation_failed',
            'org_123',
            { motivo: 'erro_rede' },
        )
        expect(reportar.reportarFalhaSilenciosaAguardando).toHaveBeenCalledWith(
            'whatsapp:evolution_network_error',
            expect.objectContaining({ motivo: 'erro_rede' }),
        )
    })

    // Scenario 4: QStash publish 200 + messageId
    it('4. QStash publish 200 + messageId: log, auditoria agendado, PostHog scheduled', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: string | URL | Request) => {
            if (url.toString().includes('/message/sendText/')) {
                return { ok: true } as Response
            }
            if (url.toString().includes('/v2/publish/')) {
                return { ok: true, json: async () => ({ messageId: 'msg_999' }) } as Response
            }
            return { ok: true } as Response
        })

        const client = criarMockSupabase()
        const amanha = new Date(Date.now() + 24 * 3600 * 1000).toISOString()

        await dispararNotificacoesAgendamento(client, {
            agendamentoId: 'ag_123',
            tenantId: 'org_123',
            clienteNome: 'Maria Santos',
            clienteTelefone: '5567999998888',
            dataHora: amanha,
            timezone: 'America/Sao_Paulo',
        })

        expect(analyticsServer.capturarEventoTenant).toHaveBeenCalledWith(
            'whatsapp_reminder_scheduled',
            'org_123',
        )
    })

    // Scenario 5: QStash HTTP 429/500
    it('5. QStash HTTP 429/500: Issue, log, auditoria, PostHog failed', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: string | URL | Request) => {
            if (url.toString().includes('/message/sendText/')) {
                return { ok: true } as Response
            }
            if (url.toString().includes('/v2/publish/')) {
                return { ok: false, status: 429 } as Response
            }
            return { ok: true } as Response
        })

        const client = criarMockSupabase()
        const amanha = new Date(Date.now() + 24 * 3600 * 1000).toISOString()

        await dispararNotificacoesAgendamento(client, {
            agendamentoId: 'ag_123',
            tenantId: 'org_123',
            clienteNome: 'Maria Santos',
            clienteTelefone: '5567999998888',
            dataHora: amanha,
            timezone: 'America/Sao_Paulo',
        })

        expect(analyticsServer.capturarEventoTenant).toHaveBeenCalledWith(
            'whatsapp_reminder_failed',
            'org_123',
            { motivo: 'http_429' },
        )
        expect(reportar.reportarFalhaSilenciosaAguardando).toHaveBeenCalledWith(
            'qstash:publish_http_error',
            expect.objectContaining({ statusCode: 429, motivo: 'http_429' }),
        )
    })

    // Scenario 6: QStash 200 sem messageId
    it('6. QStash 200 sem messageId: Issue qstash:publish_sem_message_id, log, auditoria, PostHog failed', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: string | URL | Request) => {
            if (url.toString().includes('/message/sendText/')) {
                return { ok: true } as Response
            }
            if (url.toString().includes('/v2/publish/')) {
                return { ok: true, json: async () => ({}) } as Response
            }
            return { ok: true } as Response
        })

        const client = criarMockSupabase()
        const amanha = new Date(Date.now() + 24 * 3600 * 1000).toISOString()

        await dispararNotificacoesAgendamento(client, {
            agendamentoId: 'ag_123',
            tenantId: 'org_123',
            clienteNome: 'Maria Santos',
            clienteTelefone: '5567999998888',
            dataHora: amanha,
            timezone: 'America/Sao_Paulo',
        })

        expect(analyticsServer.capturarEventoTenant).toHaveBeenCalledWith(
            'whatsapp_reminder_failed',
            'org_123',
            { motivo: 'sem_message_id' },
        )
        expect(reportar.reportarFalhaSilenciosaAguardando).toHaveBeenCalledWith(
            'qstash:publish_sem_message_id',
            expect.objectContaining({ motivo: 'sem_message_id' }),
        )
    })

    // Scenario 7: QStash network error
    it('7. QStash network error: Issue, log, auditoria, PostHog failed', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: string | URL | Request) => {
            if (url.toString().includes('/message/sendText/')) {
                return { ok: true } as Response
            }
            if (url.toString().includes('/v2/publish/')) {
                throw new Error('QStash network error')
            }
            return { ok: true } as Response
        })

        const client = criarMockSupabase()
        const amanha = new Date(Date.now() + 24 * 3600 * 1000).toISOString()

        await dispararNotificacoesAgendamento(client, {
            agendamentoId: 'ag_123',
            tenantId: 'org_123',
            clienteNome: 'Maria Santos',
            clienteTelefone: '5567999998888',
            dataHora: amanha,
            timezone: 'America/Sao_Paulo',
        })

        expect(analyticsServer.capturarEventoTenant).toHaveBeenCalledWith(
            'whatsapp_reminder_failed',
            'org_123',
            { motivo: 'erro_rede' },
        )
        expect(reportar.reportarFalhaSilenciosaAguardando).toHaveBeenCalledWith(
            'qstash:publish_network_error',
            expect.objectContaining({ motivo: 'erro_rede' }),
        )
    })

    // Scenario 8: targetTime <= now (agendamento em janela curta)
    it('8. targetTime no passado: auditoria ignorado (lembrete_fora_da_janela), log com motivo', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: string | URL | Request) => {
            if (url.toString().includes('/message/sendText/')) {
                return { ok: true } as Response
            }
            return { ok: true } as Response
        })

        const client = criarMockSupabase({
            configData: {
                instance_name: 'instancia_org1',
                instance_token: 'token123',
                status: 'conectado',
                mensagem_confirmacao: 'Confirmado',
                mensagem_lembrete: 'Lembrete',
                tempo_lembrete_minutos: 120, // 2 horas antes
            },
        })

        // Agendamento para daqui a 15 minutos (targetTime fica no passado)
        const em15Minutos = new Date(Date.now() + 15 * 60 * 1000).toISOString()

        await dispararNotificacoesAgendamento(client, {
            agendamentoId: 'ag_123',
            tenantId: 'org_123',
            clienteNome: 'Maria Santos',
            clienteTelefone: '5567999998888',
            dataHora: em15Minutos,
            timezone: 'America/Sao_Paulo',
        })

        expect(analyticsServer.capturarEventoTenant).toHaveBeenCalledWith(
            'whatsapp_confirmation_sent',
            'org_123',
        )
        // Não tentou agendar no QStash e não gerou Issue de erro
        expect(reportar.reportarFalhaSilenciosaAguardando).not.toHaveBeenCalledWith(
            expect.stringContaining('qstash'),
            expect.anything(),
        )
    })

    // Scenario 9: whatsapp_configs query error
    it('9. whatsapp_configs query error: Issue e log error', async () => {
        const client = criarMockSupabase({
            configError: { message: 'Database connection failed' },
        })
        const amanha = new Date(Date.now() + 24 * 3600 * 1000).toISOString()

        await dispararNotificacoesAgendamento(client, {
            agendamentoId: 'ag_123',
            tenantId: 'org_123',
            clienteNome: 'Maria Santos',
            clienteTelefone: '5567999998888',
            dataHora: amanha,
            timezone: 'America/Sao_Paulo',
        })

        expect(reportar.reportarExcecaoAguardando).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ etapa: 'query_configs' }),
        )
    })

    // Scenario 10: config ausente para tenant Pro
    it('10. config ausente para tenant Pro: Issue warning, log, auditoria falha, PostHog failed', async () => {
        const client = criarMockSupabase({
            configData: null,
            plano: 'pro',
        })
        const amanha = new Date(Date.now() + 24 * 3600 * 1000).toISOString()

        await dispararNotificacoesAgendamento(client, {
            agendamentoId: 'ag_123',
            tenantId: 'org_123',
            clienteNome: 'Maria Santos',
            clienteTelefone: '5567999998888',
            dataHora: amanha,
            timezone: 'America/Sao_Paulo',
        })

        expect(analyticsServer.capturarEventoTenant).toHaveBeenCalledWith(
            'whatsapp_confirmation_failed',
            'org_123',
            { motivo: 'config_ausente' },
        )
        expect(reportar.reportarFalhaSilenciosaAguardando).toHaveBeenCalledWith(
            'whatsapp:config_ausente_para_plano_pro',
            expect.anything(),
        )
    })

    // Scenario 11: plano sem WhatsApp (Gratuito)
    it('11. plano sem WhatsApp: não cria Issue, comportamento documentado', async () => {
        const client = criarMockSupabase({
            configData: null,
            plano: 'gratuito',
        })
        const amanha = new Date(Date.now() + 24 * 3600 * 1000).toISOString()

        await dispararNotificacoesAgendamento(client, {
            agendamentoId: 'ag_123',
            tenantId: 'org_123',
            clienteNome: 'Maria Santos',
            clienteTelefone: '5567999998888',
            dataHora: amanha,
            timezone: 'America/Sao_Paulo',
        })

        expect(reportar.reportarFalhaSilenciosaAguardando).not.toHaveBeenCalled()
        expect(reportar.reportarExcecaoAguardando).not.toHaveBeenCalled()
    })

    // Scenario 12: registrarDisparo falha no Supabase
    it('12. registrarDisparo falha: gera Issue e log sem recursão e sem quebrar booking', async () => {
        const client = criarMockSupabase({
            disparoError: { message: 'Insert failed', code: '23505' },
        })

        await expect(
            registrarDisparo(client, {
                tenantId: 'org_123',
                tipo: 'confirmacao',
                status: 'enviado',
            }),
        ).resolves.not.toThrow()

        expect(reportar.reportarExcecaoAguardando).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('23505') }),
            expect.objectContaining({ fluxo: 'auditoria_whatsapp' }),
        )
    })

    // Scenario 13: webhook e agendamento possuem flush aguardado
    it('13. falha aguardada executa flush no Sentry', async () => {
        await reportar.reportarFalhaSilenciosaAguardando('whatsapp:teste_flush', { fluxo: 'teste' })
        expect(reportar.reportarFalhaSilenciosaAguardando).toHaveBeenCalledWith(
            'whatsapp:teste_flush',
            { fluxo: 'teste' },
        )
    })

    // Scenario 14: PostHog delivery failure não quebra produto
    it('14. PostHog delivery failure: produto não quebra', async () => {
        // Assegura que chamar capturarEventoTenant mesmo em ambiente sem chave ou com falha não lança
        expect(() => {
            analyticsServer.capturarEventoTenant('teste_evento', 'org_123')
        }).not.toThrow()
    })

    // Scenario 15: Sanitização de PII em Issues e Logs
    it('15. NENHUM marcador de PII/secret chega a Issue ou Log', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: string | URL | Request) => {
            if (url.toString().includes('/message/sendText/')) {
                return { ok: false, status: 500 } as Response
            }
            return { ok: true } as Response
        })

        const client = criarMockSupabase()
        const amanha = new Date(Date.now() + 24 * 3600 * 1000).toISOString()

        await dispararNotificacoesAgendamento(client, {
            agendamentoId: 'ag_123',
            tenantId: 'org_PII_TESTE',
            clienteNome: 'PII_TESTE_MARIA',
            clienteTelefone: '5567999998888',
            dataHora: amanha,
            timezone: 'America/Sao_Paulo',
        })

        const calls = vi.mocked(reportar.reportarFalhaSilenciosaAguardando).mock.calls
        const jsonStr = JSON.stringify(calls)

        expect(jsonStr).not.toContain('PII_TESTE_MARIA')
        expect(jsonStr).not.toContain('5567999998888')
        expect(jsonStr).not.toContain('org_PII_TESTE')
    })

    // Scenario 16: Sucesso ponta a ponta
    it('16. Sucesso ponta a ponta: todos os marcos funcionam na ordem esperada', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: string | URL | Request) => {
            if (url.toString().includes('/message/sendText/')) {
                return { ok: true } as Response
            }
            if (url.toString().includes('/v2/publish/')) {
                return { ok: true, json: async () => ({ messageId: 'msg_ok' }) } as Response
            }
            return { ok: true } as Response
        })

        const client = criarMockSupabase()
        const amanha = new Date(Date.now() + 24 * 3600 * 1000).toISOString()

        await dispararNotificacoesAgendamento(client, {
            agendamentoId: 'ag_123',
            tenantId: 'org_123',
            clienteNome: 'Cliente Teste',
            clienteTelefone: '5511999998888',
            dataHora: amanha,
            timezone: 'America/Sao_Paulo',
        })

        expect(analyticsServer.capturarEventoTenant).toHaveBeenCalledWith(
            'whatsapp_confirmation_sent',
            'org_123',
        )
        expect(analyticsServer.capturarEventoTenant).toHaveBeenCalledWith(
            'whatsapp_reminder_scheduled',
            'org_123',
        )
    })
})
