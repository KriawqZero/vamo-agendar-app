/**
 * Suíte HERMÉTICA de `src/lib/assinaturas.ts` — sem rede, sem banco.
 *
 * O que ela existe para travar (WR-07): as duas funções tratavam QUALQUER erro
 * de leitura como "esse tenant é gratuito". No caminho público a consequência
 * mudou de escala nesta fase — `resolverPerfilPublicoPorSlug` compara o slug
 * acessado com o slug EFETIVO do plano, então um erro de leitura de trinta
 * segundos transformava `/book/<slug-customizado>` de um tenant pagante num 404
 * indistinguível de "essa agenda não existe". Sem alerta, sem evento, sem linha
 * no Sentry: num fluxo sem sessão ninguém reclama de página que não abriu.
 *
 * A distinção que cada caso abaixo prova é a mesma frase, dita de dois jeitos:
 * "este tenant não tem assinatura ativa" é condição de NEGÓCIO e degrada para
 * gratuito em silêncio, como sempre; "não consegui LER a assinatura" é falha de
 * infraestrutura, precisa ser distinguível pelo chamador e precisa avisar.
 *
 * O dublê de `SupabaseClient` é um objeto encadeável com os quatro métodos que
 * as funções usam. Mock de banco só provaria que o mock funciona — mas aqui o
 * objeto de prova não é o banco, é a REAÇÃO A UM `error` que o banco devolve.
 * Essa reação é lógica pura e merece prova hermética.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const reportarMock = vi.fn()

// Substituído ANTES do import de `assinaturas.ts`: o objetivo é assertar sobre
// o CONTEXTO passado ao reporte, não sobre o SDK do Sentry (que a suíte de
// `reportar.test.ts` já cobre).
vi.mock('@/lib/observabilidade/reportar', () => ({
    reportarFalhaSilenciosa: (...args: unknown[]) => reportarMock(...args),
    reportarExcecao: vi.fn(),
    reportarExcecaoAguardando: vi.fn(),
}))

import { obterAssinaturaVigente, obterPlanoVigentePublico } from '../assinaturas'

// ---------------------------------------------------------------------------
// Dublê encadeável — `from().select().eq().in().maybeSingle()`
// ---------------------------------------------------------------------------

interface RespostaSimulada {
    data: Record<string, unknown> | null
    error: Record<string, unknown> | null
}

function dubleSupabase(resposta: RespostaSimulada) {
    const tabelas: string[] = []
    const filtros: Array<[string, unknown]> = []

    const cadeia = {
        select: () => cadeia,
        eq: (coluna: string, valor: unknown) => {
            filtros.push([coluna, valor])
            return cadeia
        },
        in: (coluna: string, valores: unknown) => {
            filtros.push([coluna, valores])
            return cadeia
        },
        maybeSingle: async () => resposta,
    }

    const cliente = {
        from: (tabela: string) => {
            tabelas.push(tabela)
            return cadeia
        },
    }

    return { cliente: cliente as unknown as SupabaseClient, tabelas, filtros }
}

const TENANT_FICTICIO = 'org_ficticio_da_suite'

beforeEach(() => {
    reportarMock.mockReset()
})

// ---------------------------------------------------------------------------
// Caminho PÚBLICO — o que o WR-07 derrubava
// ---------------------------------------------------------------------------

describe('obterPlanoVigentePublico', () => {
    it('devolve o plano da linha vigente e NÃO marca degradação', async () => {
        const { cliente, tabelas, filtros } = dubleSupabase({
            data: { plano: 'pro', status: 'ativa' },
            error: null,
        })

        const resultado = await obterPlanoVigentePublico(cliente, TENANT_FICTICIO)

        expect(resultado).toEqual({ plano: 'pro', degradadoPorErro: false })
        expect(reportarMock).not.toHaveBeenCalled()
        // A leitura continua sendo a de sempre: `assinaturas`, filtrada pelo tenant.
        expect(tabelas).toEqual(['assinaturas'])
        expect(filtros).toContainEqual(['tenant_id', TENANT_FICTICIO])
    })

    it('trata AUSÊNCIA de linha vigente como condição de negócio, sem alarmar', async () => {
        // Não ter assinatura é o estado normal de todo tenant gratuito. Se isto
        // virasse alarme, o Sentry encheria de ruído e o owner pararia de olhar
        // a ferramenta — que é exatamente como um detector morre.
        const { cliente } = dubleSupabase({ data: null, error: null })

        const resultado = await obterPlanoVigentePublico(cliente, TENANT_FICTICIO)

        expect(resultado).toEqual({ plano: 'gratuito', degradadoPorErro: false })
        expect(reportarMock).not.toHaveBeenCalled()
    })

    it('ignora plano desconhecido na linha sem marcar degradação', async () => {
        const { cliente } = dubleSupabase({
            data: { plano: 'enterprise_que_nao_existe', status: 'ativa' },
            error: null,
        })

        const resultado = await obterPlanoVigentePublico(cliente, TENANT_FICTICIO)

        expect(resultado).toEqual({ plano: 'gratuito', degradadoPorErro: false })
        expect(reportarMock).not.toHaveBeenCalled()
    })

    it('distingue ERRO DE LEITURA: degrada para gratuito MAS marca degradadoPorErro', async () => {
        // O coração do WR-07. O padrão conservador continua ('gratuito'), mas o
        // chamador passa a poder decidir — e é essa decisão que impede o link
        // público de um tenant pagante de virar 404 durante um soluço.
        const { cliente } = dubleSupabase({
            data: null,
            error: { code: '42501', message: 'permission denied for table assinaturas' },
        })

        const resultado = await obterPlanoVigentePublico(cliente, TENANT_FICTICIO)

        expect(resultado).toEqual({ plano: 'gratuito', degradadoPorErro: true })
        expect(reportarMock).toHaveBeenCalledTimes(1)
        expect(reportarMock.mock.calls[0][0]).toBe('assinaturas:leitura_publica_falhou')
    })

    it('rotula a falha pelo SQLSTATE, que é enum e não carrega dado nenhum', async () => {
        const { cliente } = dubleSupabase({
            data: null,
            error: { code: '42501', message: 'permission denied' },
        })

        await obterPlanoVigentePublico(cliente, TENANT_FICTICIO)

        expect(reportarMock.mock.calls[0][1]).toEqual({ rotulo: 'supabase:42501' })
    })

    it('usa marcador explícito quando o erro não traz código', async () => {
        const { cliente } = dubleSupabase({
            data: null,
            error: { message: 'falha de rede sem código' },
        })

        await obterPlanoVigentePublico(cliente, TENANT_FICTICIO)

        expect(reportarMock.mock.calls[0][1]).toEqual({ rotulo: 'supabase:sem_codigo' })
    })

    // -----------------------------------------------------------------------
    // INVARIANTE ANTI-PII (T-01-16-04)
    // -----------------------------------------------------------------------
    it('INVARIANTE: o contexto do reporte não carrega tenantId, slug nem a mensagem do Postgres', async () => {
        // A `.message` do Postgres embute LITERAIS DO INPUT, e no caminho
        // público o input é dado de visitante. Asserção NEGATIVA e explícita
        // sobre tudo que foi passado ao reporte, não só sobre o contexto: se
        // alguém acrescentar um terceiro argumento amanhã, este caso pega.
        const slugDoVisitante = 'bela-unhas-do-visitante'
        const { cliente } = dubleSupabase({
            data: null,
            error: {
                code: '22P02',
                message: `invalid input syntax for type uuid: "${slugDoVisitante}"`,
                details: `tenant ${TENANT_FICTICIO} sem permissão`,
                hint: slugDoVisitante,
            },
        })

        await obterPlanoVigentePublico(cliente, TENANT_FICTICIO)

        const serializado = JSON.stringify(reportarMock.mock.calls)
        expect(serializado).not.toContain(slugDoVisitante)
        expect(serializado).not.toContain(TENANT_FICTICIO)
        expect(serializado).not.toContain('org_')
        expect(serializado).not.toContain('invalid input syntax')
        // E o que SOBRA é suficiente para investigar: rótulo + SQLSTATE.
        expect(serializado).toContain('22P02')
    })
})

// ---------------------------------------------------------------------------
// Caminho do DASHBOARD — a forma não muda, só ganha o detector
// ---------------------------------------------------------------------------

describe('obterAssinaturaVigente', () => {
    it('mantém a forma do retorno para uma assinatura ativa, sem reportar nada', async () => {
        const { cliente } = dubleSupabase({
            data: { plano: 'pro', status: 'ativa', url_fatura_pendente: null },
            error: null,
        })

        const resultado = await obterAssinaturaVigente(cliente, TENANT_FICTICIO)

        expect(resultado).toEqual({
            plano: 'pro',
            inadimplente: false,
            urlFaturaPendente: null,
        })
        expect(reportarMock).not.toHaveBeenCalled()
    })

    it('mantém o plano e levanta a flag quando a assinatura está inadimplente', async () => {
        const { cliente } = dubleSupabase({
            data: {
                plano: 'pro',
                status: 'inadimplente',
                url_fatura_pendente: 'https://fatura.exemplo/1',
            },
            error: null,
        })

        const resultado = await obterAssinaturaVigente(cliente, TENANT_FICTICIO)

        expect(resultado).toEqual({
            plano: 'pro',
            inadimplente: true,
            urlFaturaPendente: 'https://fatura.exemplo/1',
        })
        expect(reportarMock).not.toHaveBeenCalled()
    })

    it('sem linha vigente devolve Gratuito sem alarmar', async () => {
        const { cliente } = dubleSupabase({ data: null, error: null })

        const resultado = await obterAssinaturaVigente(cliente, TENANT_FICTICIO)

        expect(resultado).toEqual({
            plano: 'gratuito',
            inadimplente: false,
            urlFaturaPendente: null,
        })
        expect(reportarMock).not.toHaveBeenCalled()
    })

    it('erro de leitura mantém a forma do retorno E passa a reportar com rótulo próprio', async () => {
        // Aqui o profissional está LOGADO e vê o plano errado na tela, então o
        // modo de falha nunca foi silencioso do mesmo jeito. O que faltava era
        // o sinal — e o rótulo próprio é o que separa, no Sentry, "caiu no
        // dashboard de um profissional" de "caiu no link público de um cliente".
        const { cliente } = dubleSupabase({
            data: null,
            error: { code: '57014', message: 'canceling statement due to statement timeout' },
        })

        const resultado = await obterAssinaturaVigente(cliente, TENANT_FICTICIO)

        expect(resultado).toEqual({
            plano: 'gratuito',
            inadimplente: false,
            urlFaturaPendente: null,
        })
        expect(reportarMock).toHaveBeenCalledTimes(1)
        expect(reportarMock.mock.calls[0][0]).toBe('assinaturas:leitura_dashboard_falhou')
        expect(reportarMock.mock.calls[0][1]).toEqual({ rotulo: 'supabase:57014' })
    })
})
