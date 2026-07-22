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

/**
 * Acoplamento por SUBSTRING entre produtor e consumidor, sem nenhum tipo que o
 * sustente: `criarAgendamentoPublico` lança uma mensagem que CONTÉM este trecho
 * e `BookingApp.tsx` decide a recuperação de double-booking com
 * `mensagem.includes(...)` exatamente sobre ele.
 *
 * Intenção de negócio: sem o casamento, o cliente final fica preso numa caixa
 * vermelha estática embaixo do formulário de contato, olhando para um horário
 * que não existe mais — em vez de voltar para a grade refeita com o aviso âmbar.
 *
 * Uma constante ÚNICA usada nas duas asserções: reescrever qualquer uma das
 * pontas deixa este teste vermelho, em vez de quebrar a UX em silêncio.
 */
const TRECHO_DOUBLE_BOOKING = 'já foi preenchido'

const TELEFONE_FORMATADO = '(11) 98888-7777'
const TELEFONE_SANITIZADO = '11988887777'

let admin: SupabaseClient
let servicoIdTeste: string
let dataAlvo: string
let datetimeOcupado: string
let clienteIdPrimeiro: string

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

/**
 * Desembrulha o retorno DISCRIMINADO de `obterSlotsPublicos` (`{ ok, slots }` |
 * `{ ok, motivo }`). Falhar aqui, nomeando o `motivo`, é muito melhor do que o
 * teste morrer três linhas adiante lendo `.datetime` de `undefined`.
 */
async function slotsLivresDaFixture(): Promise<{ time: string; datetime: string }[]> {
    const resultado = await obterSlotsPublicos(SLUG_GRATUITO_TESTE, dataAlvo, DURACAO_SERVICO_TESTE)
    if (!resultado.ok) {
        throw new Error(
            `obterSlotsPublicos devolveu { ok: false, motivo: '${resultado.motivo}' } para a fixture — a grade não pôde ser calculada.`,
        )
    }
    return resultado.slots
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
            const slots = await slotsLivresDaFixture()
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
                clienteTelefone: TELEFONE_FORMATADO,
            })
            datetimeOcupado = slots[0].datetime

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
            clienteIdPrimeiro = linhaAgendamento!.cliente_id

            const { data: clientes } = await admin
                .from('clientes')
                .select('id, telefone')
                .eq('tenant_id', TENANT_TESTE)
            expect(clientes).toHaveLength(1)
            expect(clientes![0].telefone).toBe(TELEFONE_SANITIZADO)
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

        it('reaproveita o cliente existente pelo telefone, em vez de duplicar a linha', async () => {
            // A grade é refeita depois do primeiro agendamento: o primeiro slot
            // livre agora é necessariamente outro horário.
            const slots = await slotsLivresDaFixture()
            expect(slots.length).toBeGreaterThan(0)
            expect(slots[0].datetime).not.toBe(datetimeOcupado)

            const segundo = await criarAgendamentoPublico({
                slug: SLUG_GRATUITO_TESTE,
                servicoId: servicoIdTeste,
                dataHora: slots[0].datetime,
                // Nome diferente de propósito: o lookup é por tenant + telefone.
                clienteNome: 'Outro Nome Mesmo Telefone',
                clienteTelefone: TELEFONE_FORMATADO,
            })

            const { data: clientes } = await admin
                .from('clientes')
                .select('id')
                .eq('tenant_id', TENANT_TESTE)
                .eq('telefone', TELEFONE_SANITIZADO)
            expect(clientes).toHaveLength(1)

            const { data: linhaSegundo } = await admin
                .from('agendamentos')
                .select('cliente_id')
                .eq('id', segundo.id)
                .single()
            expect(linhaSegundo?.cliente_id).toBe(clienteIdPrimeiro)
        })

        it('rejeita horário já ocupado sem gravar nada, com a mensagem que a UI reconhece', async () => {
            const contar = async () => {
                const { count } = await admin
                    .from('agendamentos')
                    .select('id', { count: 'exact', head: true })
                    .eq('tenant_id', TENANT_TESTE)
                return count
            }

            const antes = await contar()

            const erro = await criarAgendamentoPublico({
                slug: SLUG_GRATUITO_TESTE,
                servicoId: servicoIdTeste,
                dataHora: datetimeOcupado,
                clienteNome: 'Cliente Atrasado',
                clienteTelefone: '(11) 97777-6666',
            }).then(
                () => null,
                (e: unknown) => e,
            )

            expect(erro).toBeInstanceOf(Error)
            expect((erro as Error).message).toContain(TRECHO_DOUBLE_BOOKING)
            expect(await contar()).toBe(antes)
        })

        // Aqui existia um caso chamado 'mantém o acoplamento de string casando
        // nas DUAS pontas', que lia a FONTE de `BookingApp.tsx` e da action com
        // `readFileSync` e assertava a substring nas duas. Foi REMOVIDO de
        // propósito, não esquecido: prova em processo + leitura de fonte nunca
        // provaram a travessia de flight, e davam verde exatamente enquanto o
        // caminho estava morto em produção (é literalmente um item da lista
        // `missing` do gap 2 do 01-VERIFICATION.md). Quem cobre isso agora é
        // `scripts/verificar-travessia-server-action.sh`, contra `next start`.
        // Não reintroduzir a asserção de fonte achando que sumiu cobertura.

        // Este caminho de falha NASCEU com a troca de identificador do plano
        // 01-02 (`tenantId` → `slug`, per D-04): antes o slug não resolver não
        // era um erro, era uma grade calculada com fuso e regras padrão — errada
        // e sem sintoma. Hoje a action RESOLVE com um discriminante fechado, e a
        // cópia em pt-BR é escolhida no cliente (`mensagens.ts`) — pinada por
        // igualdade estrita na suíte hermética `src/app/book/__tests__/`.
        //
        // ⚠️ O que este caso NÃO cobre: que a cópia chega à TELA dentro da caixa
        // vermelha com role="alert" e que o botão "Tentar de novo" funciona.
        // Isso continua sendo item de olho humano em docs/PENDENCIAS.md
        // §"UAT humano pendente da Phase 1".
        it('devolve { ok: false, motivo: "slug_invalido" } — sem rejeitar — quando o slug não resolve', async () => {
            const slugInexistente = 'slug-que-nao-existe-integracao-9f3a2b'

            // A promessa RESOLVE: erro esperado deixou de ser exceção. Se ela
            // rejeitar, o `.then` de rejeição devolve o erro e o `toEqual` abaixo
            // reprova nomeando o que voltou.
            const resultado = await obterSlotsPublicos(
                slugInexistente,
                dataAlvo,
                DURACAO_SERVICO_TESTE,
            ).then(
                (valor) => valor,
                (e: unknown) => ({ rejeitou: true, erro: String(e) }),
            )

            expect(resultado).toEqual({ ok: false, motivo: 'slug_invalido' })

            // Não-vazamento sobre o objeto INTEIRO serializado, não só sobre uma
            // mensagem: o discriminante é enum fechado e isso precisa ficar
            // provado — nada de identificador interno numa caixa visível ao
            // cliente final (regra do CLAUDE.md).
            const serializado = JSON.stringify(resultado)
            expect(serializado).not.toContain(slugInexistente)
            expect(serializado).not.toContain('tenant')
            expect(serializado).not.toContain('org_')
            expect(serializado).not.toContain('PGRST')
        })
    },
)
