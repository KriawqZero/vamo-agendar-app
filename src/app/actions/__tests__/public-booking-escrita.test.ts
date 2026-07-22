/**
 * Suíte de INTEGRAÇÃO do caminho de ESCRITA do booking público.
 *
 * Por que ela existe: toda a prova automatizada da Phase 1 cobria LEITURA
 * (`/book/<slug>` → 200, canário → 404). O caminho de escrita — lookup/criação
 * de cliente por telefone, INSERT do agendamento e o `RETURNING` do `.select()`
 * sob as policies e privilégios novos — não era exercitado por teste nenhum,
 * logo depois de o plano 01-02 ter trocado o identificador que as duas Server
 * Actions públicas recebem (`tenantId` → `slug`). Regressão aqui degrada em
 * SILÊNCIO: agenda vazia, sem erro na tela.
 *
 * Por que é de INTEGRAÇÃO e não de unidade: o gap é justamente o comportamento
 * sob as policies e os privilégios REAIS do banco. Um mock de Supabase provaria
 * apenas que o mock funciona — o `RETURNING` que o RLS pode bloquear, a FK que
 * pode recusar, o filtro por tenant que pode estar errado, nada disso aparece.
 *
 * Por que ela NÃO roda no `pnpm test`: esta suíte escreve e apaga no Supabase de
 * dev. O `pnpm test` é a Definition of Done do projeto e precisa continuar
 * hermético — o `vitest.config.ts` a exclui do glob padrão e só a coleta com
 * EXIGIR_INTEGRACAO=1. O único ponto de entrada é `pnpm test:integracao`.
 *
 * O banco de dev é explicitamente descartável (CLAUDE.md §"fase atual: DEV" e
 * docs/RESET_AMBIENTE_DEV.md). Ainda assim a fixture é determinística e a
 * limpeza roda ANTES de criar e DEPOIS da suíte, filtrando sempre pelo
 * `tenant_id` de teste: nenhum tenant real é lido ou escrito.
 */

import { existsSync, readFileSync } from 'node:fs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// Únicos dois mocks da suíte, e cada um por um motivo concreto:
// 1. mensageria — nenhuma chamada pode sair para a Evolution API nem enfileirar
//    lembrete no QStash por causa de um teste (WhatsApp para número inventado).
//    A FIAÇÃO continua provada, por asserção sobre o mock.
// 2. analytics — `capturarEventoTenant` chama `after()` de 'next/server', que
//    LANÇA fora de um contexto de request.
// Nada além disso é mockado: cliente Supabase, engine de disponibilidade,
// planos e assinaturas são exatamente o que precisa ser real aqui.
vi.mock('@/lib/notificacoes-agendamento', () => ({
    dispararNotificacoesAgendamento: vi.fn(async () => {}),
}))
vi.mock('@/lib/analytics/server', () => ({
    capturarEventoTenant: vi.fn(),
    capturarEventoServidor: vi.fn(),
}))

import { createAdminClient } from '@/lib/supabase/admin'
import { diaLocal, somarDias } from '@/lib/timezone'
import { dispararNotificacoesAgendamento } from '@/lib/notificacoes-agendamento'
import { criarAgendamentoPublico, obterSlotsPublicos } from '@/app/actions/public-booking'

// ---------------------------------------------------------------------------
// Credenciais — só os NOMES aparecem em qualquer saída, nunca os valores
// ---------------------------------------------------------------------------

const NOMES_CREDENCIAIS = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SECRET_KEY'] as const

/**
 * Caminho do arquivo de env consultado. O override existe por um motivo só:
 * permitir provar que `pnpm test:integracao` REPROVA sem credenciais sem mover,
 * renomear ou escrever no `.env.local` real.
 */
const CAMINHO_ENV = process.env.CAMINHO_ENV_LOCAL ?? '.env.local'

/**
 * Lê APENAS as duas variáveis necessárias do arquivo de env, em modo leitura.
 * Mesmo estilo do `scripts/verificar-superficie-anon.sh`: casa a linha pelo
 * nome, corta no primeiro `=`, remove aspas.
 *
 * ⚠️ Devolve `null` por AUSÊNCIA (arquivo ou chave inexistente) e NUNCA propaga
 * nada do que leu — nem valor, nem valor parcial, nem comprimento, nem prefixo.
 * O conteúdo lido não entra em `expect`, snapshot, `console.*` nem em
 * `Error.message`, em ramo nenhum. Este teste jamais escreve em arquivo de env.
 */
function lerCredenciaisSupabase(): Record<string, string> | null {
    if (!existsSync(CAMINHO_ENV)) return null

    let conteudo: string
    try {
        conteudo = readFileSync(CAMINHO_ENV, 'utf8')
    } catch {
        return null
    }

    const linhas = conteudo.split('\n')
    const encontradas: Record<string, string> = {}

    for (const nome of NOMES_CREDENCIAIS) {
        const linha = linhas.find((l) => l.trimStart().startsWith(`${nome}=`))
        if (!linha) return null
        const bruto = linha.slice(linha.indexOf('=') + 1).trim()
        const valor = bruto.replace(/^['"]|['"]$/g, '')
        if (!valor) return null
        encontradas[nome] = valor
    }

    return encontradas
}

const credenciais = lerCredenciaisSupabase()
const temCredenciais = credenciais !== null

/** Banner de PULO BARULHENTO: pulo silencioso é como o gap volta sem ninguém ver. */
function bannerPulo(): string {
    const linhas = [
        'SUÍTE DE INTEGRAÇÃO DO BOOKING PÚBLICO — NÃO EXECUTADA',
        '',
        'O caminho de ESCRITA do booking público (lookup/criação de cliente,',
        'INSERT do agendamento e o RETURNING sob as policies da Phase 1) NÃO',
        'foi verificado nesta execução.',
        '',
        `Motivo: ${NOMES_CREDENCIAIS.join(' e ')}`,
        `não encontradas em ${CAMINHO_ENV}.`,
        '',
        'Para verificar de verdade: pnpm test:integracao',
    ]
    const moldura = `+${'-'.repeat(72)}+`
    return ['', moldura, ...linhas.map((l) => `| ${l}`), moldura, ''].join('\n')
}

if (!temCredenciais) {
    console.warn(bannerPulo())
}

// ---------------------------------------------------------------------------
// Fixture determinística
// ---------------------------------------------------------------------------

/**
 * Tenant de teste com valor FIXO, não aleatório: sufixo aleatório acumula lixo
 * no banco toda vez que uma execução morre no meio do caminho.
 */
const TENANT_TESTE = 'org_teste_integracao_booking'
const SLUG_CUSTOMIZADO_TESTE = 'teste-integracao-booking-customizado'
const SLUG_GRATUITO_TESTE = 'teste-integracao-booking-gratuito'
const TIMEZONE_TESTE = 'America/Sao_Paulo'
const DURACAO_SERVICO_TESTE = 30

let admin: SupabaseClient
let servicoIdTeste: string
let dataAlvo: string

/** Ordem obrigatória: `agendamentos.servico_id` é ON DELETE RESTRICT. */
async function limparTenantDeTeste(): Promise<void> {
    await admin.from('agendamentos').delete().eq('tenant_id', TENANT_TESTE)
    await admin.from('clientes').delete().eq('tenant_id', TENANT_TESTE)
    // A cascata do perfil resolve `servicos` e `horarios_funcionamento`.
    await admin.from('perfis_empresas').delete().eq('tenant_id', TENANT_TESTE)
}

async function prepararTenantDeTeste(): Promise<void> {
    const { error: pErro } = await admin.from('perfis_empresas').insert({
        tenant_id: TENANT_TESTE,
        slug: SLUG_CUSTOMIZADO_TESTE,
        slug_gratuito: SLUG_GRATUITO_TESTE,
        nome_estabelecimento: 'Fixture de Integração — Booking',
        timezone: TIMEZONE_TESTE,
        antecedencia_minima_minutos: 0,
        horizonte_maximo_dias: 30,
    })
    if (pErro) throw new Error(`Falha ao criar o perfil da fixture: ${pErro.message}`)

    const { data: servico, error: sErro } = await admin
        .from('servicos')
        .insert({
            tenant_id: TENANT_TESTE,
            nome: 'Serviço de integração',
            preco: 50,
            duracao_minutos: DURACAO_SERVICO_TESTE,
            ativo: true,
        })
        .select('id')
        .single()
    if (sErro || !servico) throw new Error(`Falha ao criar o serviço da fixture: ${sErro?.message}`)
    servicoIdTeste = servico.id

    // Semana inteira aberta: é o que torna o teste independente do dia em que roda.
    const { error: hErro } = await admin.from('horarios_funcionamento').insert(
        [0, 1, 2, 3, 4, 5, 6].map((dia) => ({
            tenant_id: TENANT_TESTE,
            dia_semana: dia,
            hora_inicio: '08:00:00',
            hora_fim: '18:00:00',
            ativo: true,
        })),
    )
    if (hErro) throw new Error(`Falha ao criar os horários da fixture: ${hErro.message}`)

    // Sem linha em `assinaturas` de propósito: o plano vigente é `gratuito`, e
    // no gratuito o slug EFETIVO é o `slug_gratuito` — é por ele que todas as
    // chamadas desta suíte passam.
}

// ---------------------------------------------------------------------------
// Sentinela — nunca é pulada. É o que impede um pulo silencioso de virar
// falso verde: sob `pnpm test:integracao` a variável está setada, então faltar
// credencial precisa REPROVAR, não pular.
// ---------------------------------------------------------------------------

describe('sentinela da suíte de integração', () => {
    it('reprova (em vez de pular) quando EXIGIR_INTEGRACAO=1 e não há credenciais', () => {
        if (process.env.EXIGIR_INTEGRACAO !== '1') {
            expect(process.env.EXIGIR_INTEGRACAO).not.toBe('1')
            return
        }

        expect(
            temCredenciais,
            `EXIGIR_INTEGRACAO=1 exige a suíte de integração, mas ${NOMES_CREDENCIAIS.join(
                ' e/ou ',
            )} não foram encontradas em "${CAMINHO_ENV}". ` +
                'O caminho de ESCRITA do booking público NÃO foi verificado.',
        ).toBe(true)
    })
})

// ---------------------------------------------------------------------------
// Integração de verdade
// ---------------------------------------------------------------------------

describe.skipIf(!temCredenciais)(
    'escrita do booking público (EXIGE credenciais do Supabase de dev)',
    () => {
        beforeAll(async () => {
            for (const nome of NOMES_CREDENCIAIS) {
                process.env[nome] = credenciais![nome]
            }
            admin = createAdminClient()

            await limparTenantDeTeste()
            await prepararTenantDeTeste()

            dataAlvo = somarDias(diaLocal(new Date(), TIMEZONE_TESTE), 2)
        })

        afterAll(async () => {
            await limparTenantDeTeste()
        })

        it('cria cliente novo e grava o agendamento, devolvendo a linha pelo RETURNING', async () => {
            // O horário sai da PRÓPRIA engine: `criarAgendamentoPublico` valida o
            // slot por igualdade exata contra a saída de `obterSlotsDisponiveis`,
            // então consumir essa saída é o que exercita o contrato anti
            // double-booking em vez de contorná-lo com um literal cravado.
            const slots = await obterSlotsPublicos(
                SLUG_GRATUITO_TESTE,
                dataAlvo,
                DURACAO_SERVICO_TESTE,
            )
            expect(
                slots.length,
                `A fixture de horários não cobriu ${dataAlvo} — nenhum slot devolvido.`,
            ).toBeGreaterThan(0)

            const agendamento = await criarAgendamentoPublico({
                slug: SLUG_GRATUITO_TESTE,
                servicoId: servicoIdTeste,
                dataHora: slots[0].datetime,
                clienteNome: 'Cliente de Integração',
                // Formatado de propósito: a sanitização é por remoção de não-dígitos.
                clienteTelefone: '(11) 98888-7777',
            })

            expect(agendamento.id).toBeTruthy()
            expect(agendamento.data_hora).toBeTruthy()
            expect(agendamento.status).toBe('confirmado')

            const { data: linhaAgendamento } = await admin
                .from('agendamentos')
                .select('id, tenant_id, cliente_id, servico_id, status')
                .eq('id', agendamento.id)
                .single()
            expect(linhaAgendamento?.tenant_id).toBe(TENANT_TESTE)
            expect(linhaAgendamento?.servico_id).toBe(servicoIdTeste)

            const { data: clientes } = await admin
                .from('clientes')
                .select('id, telefone')
                .eq('tenant_id', TENANT_TESTE)
            expect(clientes).toHaveLength(1)
            expect(clientes![0].telefone).toBe('11988887777')
            expect(clientes![0].telefone).toMatch(/^\d+$/)

            // Fiação da mensageria provada sem nada sair pela rede.
            expect(dispararNotificacoesAgendamento).toHaveBeenCalledTimes(1)
            expect(dispararNotificacoesAgendamento).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    agendamentoId: agendamento.id,
                    tenantId: TENANT_TESTE,
                }),
            )
        })
    },
)
