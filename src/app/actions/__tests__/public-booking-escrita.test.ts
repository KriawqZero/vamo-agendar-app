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
 *
 * ⚠️ O QUE ESTA SUÍTE NÃO PROVA, e é preciso dizer em voz alta: ela chama a
 * action EM PROCESSO, sem nenhuma serialização de flight. Verde aqui significa
 * "o produtor devolve o discriminante certo", nunca "o discriminante chega ao
 * navegador". Foi exatamente essa confusão que manteve o gap 2 verde enquanto o
 * caminho estava morto em produção. Quem prova a travessia da fronteira é
 * `scripts/verificar-travessia-server-action.sh`, contra `next start`.
 */

import { existsSync, readFileSync } from 'node:fs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// Únicos TRÊS mocks da suíte, e cada um por um motivo concreto:
// 1. mensageria — nenhuma chamada pode sair para a Evolution API nem enfileirar
//    lembrete no QStash por causa de um teste (WhatsApp para número inventado).
//    A FIAÇÃO continua provada, por asserção sobre o mock.
// 2. analytics — `capturarEventoTenant` chama `after()` de 'next/server', que
//    LANÇA fora de um contexto de request.
// 3. assinaturas — mock PARCIAL, e este merece explicação: por padrão a função
//    real roda (o comentário original desta suíte dizia "assinaturas é
//    exatamente o que precisa ser real aqui", e continua sendo). O override
//    existe para UM caso que o banco não sabe produzir sob demanda: a FALHA DE
//    LEITURA de `assinaturas`. A alternativa seria revogar privilégio no banco
//    compartilhado no meio da suíte — efeito colateral global para provar um
//    ramo local. Injetar a falha na fronteira da função é a única forma de
//    exercitar o comportamento novo contra linhas REAIS do banco (perfil com
//    `cor_marca` gravada, dois slugs de verdade), que é justamente o que uma
//    suíte hermética não provaria.
// Nada além disso é mockado: cliente Supabase, engine de disponibilidade e
// planos continuam reais.
vi.mock('@/lib/notificacoes-agendamento', () => ({
    dispararNotificacoesAgendamento: vi.fn(async () => {}),
}))
vi.mock('@/lib/analytics/server', () => ({
    capturarEventoTenant: vi.fn(),
    capturarEventoServidor: vi.fn(),
}))
vi.mock('@/lib/assinaturas', async (importarOriginal) => {
    const real = await importarOriginal<typeof import('@/lib/assinaturas')>()
    return { ...real, obterPlanoVigentePublico: vi.fn(real.obterPlanoVigentePublico) }
})

import { createAdminClient } from '@/lib/supabase/admin'
import { diaLocal, somarDias } from '@/lib/timezone'
import { dispararNotificacoesAgendamento } from '@/lib/notificacoes-agendamento'
import { obterPlanoVigentePublico } from '@/lib/assinaturas'
import {
    criarAgendamentoPublico,
    obterDadosBookingPublico,
    obterSlotsPublicos,
} from '@/app/actions/public-booking'
import type { AgendamentoCriado } from '@/app/actions/public-booking'
import { COPY_SLOT_INDISPONIVEL, mensagemDeEnvio } from '@/app/book/[slug]/mensagens'

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

const TELEFONE_FORMATADO = '(11) 98888-7777'
const TELEFONE_SANITIZADO = '11988887777'

/**
 * Tenant VIZINHO descartável — o sequestrador do CR-03. Existe só dentro do caso
 * que o usa, e o `finally` o remove passe ou falhe: o banco de dev tem um tenant
 * real só, e provar colisão entre dois exige montar o segundo aqui dentro (é o
 * padrão que o plano 01-08 estabeleceu para provar RLS sem navegador).
 */
const TENANT_VIZINHO = 'org_teste_integracao_booking_vizinho'
const SLUG_GRATUITO_VIZINHO = 'teste-integracao-booking-vizinho-gratuito'
const SLUG_CUSTOMIZADO_VIZINHO_CONSTRAINT = 'teste-integracao-booking-vizinho-constraint'

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
    // O vizinho descartável é removido pelo `finally` de cada caso que o cria;
    // repetir aqui é o cinto de segurança para a execução que morre no meio.
    await removerTenantVizinho()
}

/** Remove o tenant vizinho descartável. `assinaturas` tem FK ON DELETE CASCADE,
 *  mas apagar explicitamente deixa a ordem óbvia para quem ler depois. */
async function removerTenantVizinho(): Promise<void> {
    await admin.from('assinaturas').delete().eq('tenant_id', TENANT_VIZINHO)
    await admin.from('perfis_empresas').delete().eq('tenant_id', TENANT_VIZINHO)
}

/**
 * Personalização PAGA gravada num tenant que está no plano GRATUITO. Não é
 * cenário inventado: downgrade não zera as colunas, então esta é exatamente a
 * linha que um ex-Pro deixa no banco. É o que permite provar que a sanitização
 * por plano — defesa ÚNICA com o RLS bypassado (01-UI-SPEC §29) — continua
 * segurando inclusive na janela de degradação.
 */
const COR_MARCA_GRAVADA = '#a1b2c3'
const LOGO_GRAVADO = 'https://exemplo.invalido/logo-fixture.png'
const CAPA_GRAVADA = 'https://exemplo.invalido/capa-fixture.png'

async function prepararTenantDeTeste(): Promise<void> {
    const { error: pErro } = await admin.from('perfis_empresas').insert({
        tenant_id: TENANT_TESTE,
        slug: SLUG_CUSTOMIZADO_TESTE,
        slug_gratuito: SLUG_GRATUITO_TESTE,
        nome_estabelecimento: 'Fixture de Integração — Booking',
        timezone: TIMEZONE_TESTE,
        antecedencia_minima_minutos: 0,
        horizonte_maximo_dias: 30,
        cor_marca: COR_MARCA_GRAVADA,
        logo_url: LOGO_GRAVADO,
        capa_url: CAPA_GRAVADA,
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

/**
 * Desembrulha o retorno DISCRIMINADO de `criarAgendamentoPublico`
 * (`{ ok, agendamento }` | `{ ok, motivo }`) nos casos em que a criação PRECISA
 * dar certo. Mesmo motivo do helper acima: falhar aqui nomeando o `motivo` é
 * muito melhor do que o teste morrer três linhas adiante lendo `.id` de
 * `undefined` — foi assim que a mudança de contrato apareceu na medição RED.
 */
async function criarComSucesso(
    params: Parameters<typeof criarAgendamentoPublico>[0],
): Promise<AgendamentoCriado> {
    const resultado = await criarAgendamentoPublico(params)
    if (!resultado.ok) {
        throw new Error(
            `criarAgendamentoPublico devolveu { ok: false, motivo: '${resultado.motivo}' } onde a criação precisava dar certo.`,
        )
    }
    return resultado.agendamento
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

            const agendamento = await criarComSucesso({
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

            const segundo = await criarComSucesso({
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

        // O caso que a Phase 2 §SC4 depende. Até esta rodada a action LANÇAVA
        // aqui, e o `BookingApp` reconhecia a corrida por substring da mensagem —
        // comparação sempre falsa em build de produção, onde só o `digest`
        // atravessa. Agora o discriminante é o contrato, e é ele que este caso
        // assere. ⚠️ Isto continua sendo prova do PRODUTOR: a travessia da
        // fronteira é do harness (ver cabeçalho do arquivo).
        it('devolve { ok: false, motivo: "slot_indisponivel" } — sem rejeitar — no horário já ocupado, e não grava nada', async () => {
            const contar = async () => {
                const { count } = await admin
                    .from('agendamentos')
                    .select('id', { count: 'exact', head: true })
                    .eq('tenant_id', TENANT_TESTE)
                return count
            }

            const antes = await contar()

            // A promessa RESOLVE. Se ela rejeitar, o `.then` de rejeição devolve
            // o erro e o `toEqual` abaixo reprova nomeando o que voltou.
            const resultado = await criarAgendamentoPublico({
                slug: SLUG_GRATUITO_TESTE,
                servicoId: servicoIdTeste,
                dataHora: datetimeOcupado,
                clienteNome: 'Cliente Atrasado',
                clienteTelefone: '(11) 97777-6666',
            }).then(
                (valor) => valor,
                (e: unknown) => ({ rejeitou: true, erro: String(e) }),
            )

            expect(resultado).toEqual({ ok: false, motivo: 'slot_indisponivel' })

            // O coração do caso, inalterado: nada foi gravado na tentativa.
            expect(await contar()).toBe(antes)

            // Não-vazamento sobre o retorno INTEIRO serializado, não sobre uma
            // mensagem: o discriminante é enum fechado e isso precisa ficar
            // provado — nada de identificador interno numa caixa visível ao
            // cliente final (regra do CLAUDE.md).
            const serializado = JSON.stringify(resultado)
            expect(serializado).not.toContain(SLUG_GRATUITO_TESTE)
            expect(serializado).not.toContain('tenant')
            expect(serializado).not.toContain('org_')
            expect(serializado).not.toContain('PGRST')

            // E a ponta do cliente: este discriminante vira o aviso âmbar com a
            // cópia contratada. As duas pontas do caminho que a Phase 2 §SC4
            // precisa vivo ficam asseridas no mesmo caso.
            expect(mensagemDeEnvio('slot_indisponivel')).toBe(COPY_SLOT_INDISPONIVEL)
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

        // -------------------------------------------------------------------
        // INVARIANTE DO NAMESPACE PÚBLICO (CR-03)
        //
        // `slug` e `slug_gratuito` não são duas colunas independentes: são dois
        // membros de UM namespace — o identificador do tenant em /book/<slug>.
        // Este bloco é a trava que o `<assumption_delta_decision>` do plano
        // 01-14 prometeu: se uma fase futura reintroduzir a resolução por
        // "primeiro que achar" (o fallback encadeado que existia até aqui), ele
        // fica VERMELHO na hora, porque é exatamente o cenário do CR-03 que ele
        // monta — e o resolver antigo servia a página do sequestrador.
        //
        // O que a decisão NÃO cobre e ninguém deve inferir daqui: manter mais de
        // um alias vivo (redirecionar link antigo depois de trocar o slug) e um
        // terceiro identificador público (domínio próprio, alias por campanha).
        // Qualquer um dos dois virar requisito força a PROMOÇÃO para uma tabela
        // de identificadores públicos — não uma terceira coluna.
        // -------------------------------------------------------------------

        /**
         * Monta o sequestro do CR-03: o vizinho grava em `slug` o `slug_gratuito`
         * da fixture — que é o link que a fixture divulga, por estar no plano
         * gratuito.
         *
         * A assinatura PRO do vizinho não é decoração: sem plano com link
         * personalizado, `obterSlugEfetivo` do vizinho devolveria o
         * `slug_gratuito` dele, o slug acessado não seria o efetivo e a
         * resolução recusaria por outro motivo — o caso ficaria verde sem provar
         * nada. É o plano pago que torna o sequestro alcançável.
         */
        async function criarVizinhoSequestrador(): Promise<void> {
            const { error: pErro } = await admin.from('perfis_empresas').insert({
                tenant_id: TENANT_VIZINHO,
                slug: SLUG_GRATUITO_TESTE,
                slug_gratuito: SLUG_GRATUITO_VIZINHO,
                nome_estabelecimento: 'Vizinho descartável — sequestro de link',
                timezone: TIMEZONE_TESTE,
            })
            if (pErro) throw new Error(`Falha ao criar o vizinho descartável: ${pErro.message}`)

            const { error: aErro } = await admin.from('assinaturas').insert({
                tenant_id: TENANT_VIZINHO,
                plano: 'pro',
                ciclo: 'MONTHLY',
                valor: 14.9,
                status: 'ativa',
            })
            if (aErro) throw new Error(`Falha ao criar a assinatura do vizinho: ${aErro.message}`)
        }

        it('recusa a resolução quando o mesmo texto é `slug` de um tenant e `slug_gratuito` de outro', async () => {
            try {
                await criarVizinhoSequestrador()

                // Com o fallback encadeado, esta chamada casava na PRIMEIRA
                // query, encontrava o vizinho (pago, slug efetivo = o texto
                // acessado) e servia a página dele para quem visitou o link da
                // fixture. Recusar é a única resposta segura: escolher qualquer
                // um dos dois entrega a agenda de um tenant a visitante do outro.
                const dados = await obterDadosBookingPublico(SLUG_GRATUITO_TESTE)

                expect(
                    dados,
                    'A resolução devolveu um perfil para um slug ambíguo — é o sequestro do CR-03.',
                ).toBeNull()
            } finally {
                await removerTenantVizinho()
            }
        })

        it('o banco recusa um segundo perfil com `slug_gratuito` já existente (23505)', async () => {
            // A constraint provada por ESCRITA real, não por leitura de catálogo:
            // catálogo prova que o objeto existe, escrita prova que ele barra.
            const { error } = await admin.from('perfis_empresas').insert({
                tenant_id: TENANT_VIZINHO,
                slug: SLUG_CUSTOMIZADO_VIZINHO_CONSTRAINT,
                slug_gratuito: SLUG_GRATUITO_TESTE, // já pertence à fixture
                nome_estabelecimento: 'Vizinho descartável — duplicata de slug_gratuito',
                timezone: TIMEZONE_TESTE,
            })

            try {
                // Asserção pelo CÓDIGO SQLSTATE, nunca pelo texto: mensagem de
                // erro do Postgres muda entre versões, o código não.
                expect(
                    error,
                    'O INSERT com `slug_gratuito` duplicado passou — a constraint perfis_empresas_slug_gratuito_key não está no banco.',
                ).not.toBeNull()
                expect(error?.code).toBe('23505')
            } finally {
                // Se a constraint sumir e o INSERT passar, a linha não pode ficar.
                await removerTenantVizinho()
            }
        })

        it('CONTROLE: sem vizinho, o slug da fixture continua resolvendo o mesmo perfil', async () => {
            // Sem este caso, um resolver quebrado que recusasse TUDO passaria nos
            // dois acima. Ele é o que separa "recusa a ambiguidade" de "recusa".
            const dados = await obterDadosBookingPublico(SLUG_GRATUITO_TESTE)

            expect(dados).not.toBeNull()
            expect(dados!.perfil.tenant_id).toBe(TENANT_TESTE)
            expect(dados!.servicos.length).toBeGreaterThan(0)
        })

        // -------------------------------------------------------------------
        // DEGRADAÇÃO POR FALHA DE LEITURA DE PLANO (WR-07 / T-01-16-01..03)
        //
        // A decisão de produto registrada no objetivo do plano 01-16, em uma
        // frase: PERMISSIVO NA DISPONIBILIDADE, RESTRITIVO NO QUE É PAGO.
        // Enquanto o plano é desconhecido, o link fica no ar (o cliente final
        // de quem paga não vê "agenda não encontrada" por causa de um soluço de
        // infraestrutura) e nada pago aparece na tela.
        //
        // Os dois lados precisam de prova, e um sem o outro é armadilha: provar
        // só o lado permissivo transformaria a correção de disponibilidade num
        // vazamento de recurso pago; provar só o restritivo deixaria a saída (A)
        // — o 404 na cara do cliente — passar como se fosse a nova.
        // -------------------------------------------------------------------

        /**
         * Injeta a falha de leitura de `assinaturas` na fronteira da função,
         * pela duração de UMA chamada da action sob teste.
         *
         * O `finally` com `mockReset()` devolve a implementação REAL (é o
         * contrato de `vi.fn(impl)`), e isso não fica no fio da navalha: o caso
         * de CONTROLE logo abaixo roda o caminho real depois desta injeção e
         * reprovaria na hora se a restauração não acontecesse.
         */
        async function comLeituraDePlanoFalhando<T>(executar: () => Promise<T>): Promise<T> {
            const espiao = vi.mocked(obterPlanoVigentePublico)
            espiao.mockResolvedValue({ plano: 'gratuito', degradadoPorErro: true })
            try {
                return await executar()
            } finally {
                espiao.mockReset()
            }
        }

        it('sob degradação, o slug CUSTOMIZADO de um tenant gratuito volta a resolver (o link não cai)', async () => {
            // Este é o cenário do WR-07 com o sinal trocado. A fixture está no
            // plano gratuito, então em operação normal o slug efetivo dela é o
            // `slug_gratuito` e o customizado NÃO resolve (o caso de controle
            // abaixo prova que essa regra continua de pé). Sob degradação o
            // plano é DESCONHECIDO — e recusar o slug customizado nessa hora é
            // exatamente o que respondia 404 para os clientes de um tenant Pro.
            const dados = await comLeituraDePlanoFalhando(() =>
                obterDadosBookingPublico(SLUG_CUSTOMIZADO_TESTE),
            )

            expect(
                dados,
                'O link customizado caiu durante a falha de leitura de plano — é o 404 do WR-07 na cara do cliente de quem paga.',
            ).not.toBeNull()
            expect(dados!.perfil.tenant_id).toBe(TENANT_TESTE)
            expect(dados!.servicos.length).toBeGreaterThan(0)
        })

        it('CONTROLE: sem degradação, o slug customizado de um tenant gratuito continua NÃO resolvendo', async () => {
            // A regra de produto (downgrade invalida o link customizado na hora)
            // não foi afrouxada — só passou a ser condicional ao que se SABE do
            // plano. Sem este caso, a mudança acima seria indistinguível de
            // "removi a checagem de slug efetivo", que é regressão de
            // monetização.
            const dados = await obterDadosBookingPublico(SLUG_CUSTOMIZADO_TESTE)

            expect(
                dados,
                'O slug customizado de um tenant GRATUITO resolveu fora da janela de degradação — a regra de slug efetivo por plano foi perdida.',
            ).toBeNull()
        })

        it('sob degradação, nada pago aparece: cor, logo e capa voltam nulos mesmo gravados no perfil', async () => {
            // A metade "restritiva" da decisão, e a linha 29 do 01-UI-SPEC: com
            // o RLS bypassado pelo cliente privilegiado, esta sanitização é a
            // ÚNICA defesa. A saída permissiva na disponibilidade não pode virar
            // porta de entrada para recurso pago numa tela pública.
            const dados = await comLeituraDePlanoFalhando(() =>
                obterDadosBookingPublico(SLUG_CUSTOMIZADO_TESTE),
            )

            expect(dados).not.toBeNull()
            expect(
                dados!.personalizacao.corMarca,
                'A cor de marca vazou durante a janela de degradação — recurso pago exibido com o plano desconhecido.',
            ).toBeNull()
            expect(dados!.personalizacao.logoUrl).toBeNull()
            expect(dados!.personalizacao.capaUrl).toBeNull()

            // E os campos CRUS também: neutralizá-los no `perfil` é o que
            // impede consumo acidental fora do objeto `personalizacao`.
            expect(dados!.perfil.cor_marca).toBeNull()
            expect(dados!.perfil.logo_url).toBeNull()
            expect(dados!.perfil.capa_url).toBeNull()

            // A prova de que a fixture REALMENTE tem a personalização gravada —
            // sem isto, os `toBeNull()` acima passariam contra um perfil vazio e
            // não provariam sanitização nenhuma.
            const { data: linhaCrua } = await admin
                .from('perfis_empresas')
                .select('cor_marca, logo_url, capa_url')
                .eq('tenant_id', TENANT_TESTE)
                .single()
            expect(linhaCrua?.cor_marca).toBe(COR_MARCA_GRAVADA)
            expect(linhaCrua?.logo_url).toBe(LOGO_GRAVADO)
            expect(linhaCrua?.capa_url).toBe(CAPA_GRAVADA)
        })

        it('sob degradação, o slug do PROVISIONAMENTO também continua resolvendo', async () => {
            // As duas colunas do namespace são aceitas na janela de falha, não
            // só a customizada: o tenant que nunca personalizou o link é a
            // maioria, e ele não pode sair do ar junto.
            const dados = await comLeituraDePlanoFalhando(() =>
                obterDadosBookingPublico(SLUG_GRATUITO_TESTE),
            )

            expect(dados).not.toBeNull()
            expect(dados!.perfil.tenant_id).toBe(TENANT_TESTE)
        })

        it('sob degradação, a recusa de namespace ambíguo do plano 01-14 CONTINUA valendo', async () => {
            // A janela de degradação é o único momento em que dois candidatos
            // podem coexistir legitimamente na mesma decisão — então é onde a
            // recusa importa MAIS, não menos. Afrouxar a checagem de slug não
            // pode ter reaberto o sequestro do CR-03 por uma porta lateral.
            try {
                await criarVizinhoSequestrador()

                const dados = await comLeituraDePlanoFalhando(() =>
                    obterDadosBookingPublico(SLUG_GRATUITO_TESTE),
                )

                expect(
                    dados,
                    'A resolução devolveu um perfil para um slug ambíguo durante a degradação — o sequestro do CR-03 reabriu pela porta lateral.',
                ).toBeNull()
            } finally {
                await removerTenantVizinho()
            }
        })

        // -------------------------------------------------------------------
        // SC3 (AGE-03) — ATOMICIDADE DO DOUBLE-BOOKING CONTRA O BANCO REAL
        //
        // A atomicidade não é observável em teste hermético: um mock de
        // Supabase provaria só o mock. O que FECHA SC3 é a exclusion
        // constraint `ag_sem_sobreposicao` VIVA no banco (aplicada no 02-05)
        // recusando o segundo insert sobreposto com SQLSTATE 23P01, e a action
        // discriminando esse 23P01 para `slot_indisponivel` (02-03). Este caso
        // prova as duas pontas de uma vez, contra o Supabase de dev.
        //
        // ⚠️ `Promise.all` em processo APROXIMA a corrida, não a garante: a
        // serialização real é do banco. Por isso a asserção DEFINITIVA é o
        // COUNT de linhas ativas === 1 — o número que só a constraint sabe
        // segurar —, não a suposição de que os 8 flights colidiram no mesmo
        // instante. É a diferença que manteve o gap verde na Phase 1: verde de
        // produtor não é verde de garantia; aqui a garantia é a contagem.
        // -------------------------------------------------------------------
        it('SC3 público: N chamadas concorrentes ao MESMO slot → exatamente 1 ativo (constraint + 23P01)', async () => {
            // Terreno limpo: a contagem exata no fim só é verdadeira se nada
            // dos casos anteriores sobrar no intervalo-alvo. Ordem obrigatória
            // (agendamentos antes de clientes) por causa do ON DELETE RESTRICT.
            await admin.from('agendamentos').delete().eq('tenant_id', TENANT_TESTE)
            await admin.from('clientes').delete().eq('tenant_id', TENANT_TESTE)

            // Slot da PRÓPRIA engine (nunca literal cravado): é a saída que
            // `criarAgendamentoPublico` revalida por igualdade exata, então
            // consumi-la exercita o contrato anti double-booking em vez de
            // contorná-lo com um horário inventado.
            const slots = await slotsLivresDaFixture()
            expect(slots.length, `A fixture não cobriu ${dataAlvo}.`).toBeGreaterThan(0)
            const slotAlvo = slots[0].datetime

            const N = 8
            const resultados = await Promise.all(
                Array.from({ length: N }, (_, i) =>
                    criarAgendamentoPublico({
                        slug: SLUG_GRATUITO_TESTE,
                        servicoId: servicoIdTeste,
                        dataHora: slotAlvo,
                        // Mesmo telefone de propósito: força os 8 pela RPC atômica
                        // `reaproveitar_ou_criar_cliente` também sob concorrência.
                        clienteNome: `Concorrente ${i}`,
                        clienteTelefone: TELEFONE_FORMATADO,
                    }),
                ),
            )

            const vencedores = resultados.filter((r) => r.ok)
            const perdedores = resultados.filter((r) => !r.ok && r.motivo === 'slot_indisponivel')
            expect(vencedores).toHaveLength(1)
            expect(perdedores).toHaveLength(N - 1)
            // Nenhum outro motivo: um `erro_interno` disfarçado aqui seria a
            // corrida virando falha crua em vez de discriminante amigável.
            expect(resultados.filter((r) => !r.ok)).toHaveLength(N - 1)

            // A asserção DEFINITIVA — a que só a constraint no banco faz valer.
            const { count } = await admin
                .from('agendamentos')
                .select('id', { count: 'exact', head: true })
                .eq('tenant_id', TENANT_TESTE)
                .neq('status', 'cancelado')
            expect(count).toBe(1)

            // ---------------------------------------------------------------
            // Metade WALK-IN do SC3 no NÍVEL DA CONSTRAINT (role-agnóstico).
            //
            // A exclusion constraint não sabe quem chamou: dois inserts admin
            // diretos e sobrepostos, mesmo tenant, status <> 'cancelado',
            // provam a recusa INDEPENDENTE do fluxo — logo cobrem também o
            // walk-in autenticado, que grava na mesma tabela sob a mesma
            // constraint. A corrida walk-in autenticada EM PROCESSO (mock de
            // auth do Clerk) fica best-effort; a garantia que importa é a do
            // banco, e é esta. Fronteira registrada em SUMMARY/PENDENCIAS.
            // ---------------------------------------------------------------
            const { data: clienteWalkin, error: cwErr } = await admin
                .from('clientes')
                .insert({
                    tenant_id: TENANT_TESTE,
                    telefone: '11955554444',
                    nome: 'Walk-in Constraint',
                })
                .select('id')
                .single()
            expect(cwErr, cwErr?.message).toBeNull()

            // Par de períodos que SE SOBREPÕEM, ancorado longe do slot já
            // ocupado acima para isolar a causa da recusa na sobreposição
            // entre os DOIS inserts, não com o agendamento vencedor. A
            // constraint compara período por tenant e ignora horário comercial
            // (é overlap puro), então quaisquer instantes sobrepostos servem.
            const base = new Date(slotAlvo)
            base.setUTCHours(base.getUTCHours() + 3)
            const inicioA = base.toISOString()
            const fimA = new Date(base.getTime() + 30 * 60_000).toISOString()
            const inicioB = new Date(base.getTime() + 15 * 60_000).toISOString()
            const fimB = new Date(base.getTime() + 45 * 60_000).toISOString()

            const insertDireto = (dataHora: string, dataHoraFim: string) =>
                admin.from('agendamentos').insert({
                    tenant_id: TENANT_TESTE,
                    cliente_id: clienteWalkin!.id,
                    servico_id: servicoIdTeste,
                    data_hora: dataHora,
                    data_hora_fim: dataHoraFim,
                    status: 'confirmado',
                })

            const primeiro = await insertDireto(inicioA, fimA)
            expect(primeiro.error, primeiro.error?.message).toBeNull()

            const segundo = await insertDireto(inicioB, fimB)
            // SQLSTATE, nunca a .message (que embute org_id e o horário de
            // terceiro): o código é estável entre versões do Postgres.
            expect(
                segundo.error,
                'O segundo insert sobreposto passou — ag_sem_sobreposicao não está barrando no banco.',
            ).not.toBeNull()
            expect(segundo.error?.code).toBe('23P01')

            // Limpeza do que este caso criou. O afterAll também limpa; isto é o
            // cinto de segurança para não poluir contagens de casos futuros.
            await admin.from('agendamentos').delete().eq('tenant_id', TENANT_TESTE)
            await admin.from('clientes').delete().eq('tenant_id', TENANT_TESTE)
        })
    },
)
