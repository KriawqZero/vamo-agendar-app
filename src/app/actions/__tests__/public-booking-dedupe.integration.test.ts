/**
 * Suíte de INTEGRAÇÃO da deduplicação de clientes por contato flexível (BOO-03).
 *
 * Por que ela existe, e por que substituiu um teste unitário: o arquivo anterior
 * (`public-booking-dedupe.test.ts`) não importava uma única linha de código de
 * produção. Ele declarava uma função `simularLookup` DENTRO do próprio teste e
 * verificava essa função — ou seja, provava que o autor sabia descrever a regra,
 * nunca que a regra existia no sistema. Passava verde com a migration revertida,
 * e mesmo assim era listado no `05-VALIDATION.md` como a prova do SC4.
 *
 * Por que é de INTEGRAÇÃO e não de unidade: a deduplicação NÃO mora em
 * TypeScript. Ela é o corpo da RPC `reaproveitar_ou_criar_cliente`, em plpgSQL,
 * e o que a torna correta são dois índices ÚNICOS do banco mais o
 * `EXCEPTION WHEN unique_violation`. Nada disso aparece num mock: um Supabase
 * fabricado provaria apenas que o mock devolve o que mandaram devolver.
 *
 * Por que NÃO roda no `pnpm test`: o glob padrão exclui `*.integration.test.ts`
 * (ver `vitest.config.ts`). O `pnpm test` é a Definition of Done e precisa
 * continuar hermético. Ponto de entrada: `pnpm test:integracao`.
 *
 * ⚠️ Consequência assumida e registrada em `docs/PENDENCIAS.md`: enquanto esta
 * suíte não roda no gate, o `pnpm test` NÃO cobre a deduplicação. Isso é pior em
 * cobertura e melhor em honestidade do que o verde falso que havia antes.
 */

import { existsSync, readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createAdminClient } from '@/lib/supabase/admin'

const NOMES_CREDENCIAIS = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SECRET_KEY'] as const
const CAMINHO_ENV = process.env.CAMINHO_ENV_LOCAL ?? '.env.local'

/**
 * Lê APENAS as duas variáveis necessárias. Nunca propaga o que leu — nem valor,
 * nem prefixo, nem comprimento. Mesmo contrato da suíte de escrita.
 */
function lerCredenciaisSupabase(): boolean {
    if (!existsSync(CAMINHO_ENV)) return false
    let conteudo: string
    try {
        conteudo = readFileSync(CAMINHO_ENV, 'utf8')
    } catch {
        return false
    }
    const linhas = conteudo.split('\n')
    for (const nome of NOMES_CREDENCIAIS) {
        const linha = linhas.find((l) => l.trimStart().startsWith(`${nome}=`))
        if (!linha) return false
        const bruto = linha.slice(linha.indexOf('=') + 1).trim()
        if (!bruto.replace(/^['"]|['"]$/g, '')) return false
    }
    return true
}

const temCredenciais = lerCredenciaisSupabase()

if (!temCredenciais) {
    console.warn(
        [
            '',
            `+${'-'.repeat(72)}+`,
            '| SUÍTE DE INTEGRAÇÃO DA DEDUPLICAÇÃO — NÃO EXECUTADA',
            '|',
            '| A deduplicação de clientes por telefone e e-mail (BOO-03) NÃO foi',
            '| verificada nesta execução.',
            '|',
            `| Motivo: ${NOMES_CREDENCIAIS.join(' e ')} não encontradas em ${CAMINHO_ENV}.`,
            '|',
            '| Para verificar de verdade: pnpm test:integracao',
            `+${'-'.repeat(72)}+`,
            '',
        ].join('\n'),
    )
}

/** Tenant FIXO, não aleatório: sufixo aleatório acumula lixo a cada execução morta no meio. */
const TENANT_TESTE = 'org_teste_dedupe_contato_flexivel'

const descreve = temCredenciais ? describe : describe.skip

descreve('Deduplicação de clientes por telefone e e-mail (RPC real)', () => {
    const supabase = createAdminClient()

    const limpar = async () => {
        await supabase.from('clientes').delete().eq('tenant_id', TENANT_TESTE)
        await supabase.from('perfis_empresas').delete().eq('tenant_id', TENANT_TESTE)
    }

    const reaproveitar = async (telefone: string | null, nome: string, email: string | null) => {
        const { data, error } = await supabase.rpc('reaproveitar_ou_criar_cliente', {
            p_tenant_id: TENANT_TESTE,
            p_telefone: telefone,
            p_nome: nome,
            p_email: email,
        })
        if (error) throw new Error(`RPC falhou: ${error.code} ${error.message}`)
        return data as string
    }

    beforeAll(async () => {
        await limpar()
        const { error } = await supabase.from('perfis_empresas').insert({
            tenant_id: TENANT_TESTE,
            slug: 'teste-dedupe-contato-flexivel',
            slug_gratuito: 'teste-dedupe-contato-flexivel-g',
            nome_estabelecimento: 'Salão de Teste (dedupe)',
        })
        if (error) throw new Error(`fixture falhou: ${error.code} ${error.message}`)
    })

    afterAll(limpar)

    it('cria um cliente só com e-mail, sem telefone (BOO-01 no banco)', async () => {
        const id = await reaproveitar(null, 'Maria', 'maria@example.com')
        expect(id).toBeTruthy()

        const { data } = await supabase
            .from('clientes')
            .select('telefone, email')
            .eq('id', id)
            .single()
        expect(data?.telefone).toBeNull()
        expect(data?.email).toBe('maria@example.com')
    })

    it('reconhece o mesmo cliente pelo e-mail, sem duplicar', async () => {
        const primeiro = await reaproveitar(null, 'Maria', 'maria@example.com')
        const segundo = await reaproveitar(null, 'Maria de novo', 'maria@example.com')
        expect(segundo).toBe(primeiro)

        const { count } = await supabase
            .from('clientes')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', TENANT_TESTE)
        expect(count).toBe(1)
    })

    it('reconhece por e-mail ignorando a caixa das letras', async () => {
        const primeiro = await reaproveitar(null, 'Maria', 'maria@example.com')
        const segundo = await reaproveitar(null, 'Maria', 'MARIA@Example.COM')
        expect(segundo).toBe(primeiro)
    })

    it('dá precedência ao telefone quando os dois eixos apontam para clientes diferentes', async () => {
        const porTelefone = await reaproveitar('5511999999999', 'João', null)
        const porEmail = await reaproveitar(null, 'Ana', 'ana@example.com')
        expect(porEmail).not.toBe(porTelefone)

        // Telefone do João + e-mail da Ana: a RPC resolve pelo telefone primeiro.
        const resolvido = await reaproveitar('5511999999999', 'Qualquer', 'ana@example.com')
        expect(resolvido).toBe(porTelefone)
    })

    it('completa o contato que faltava sem sobrescrever o nome já curado', async () => {
        const id = await reaproveitar('5511888888888', 'Nome Curado', null)
        await reaproveitar('5511888888888', 'Nome Digitado Pelo Visitante', 'novo@example.com')

        const { data } = await supabase.from('clientes').select('nome, email').eq('id', id).single()
        expect(data?.nome).toBe('Nome Curado')
        expect(data?.email).toBe('novo@example.com')
    })

    it('não duplica sob concorrência no eixo de e-mail (CR-02 da revisão)', async () => {
        // O teste que o índice NÃO-único deixava passar. Com CREATE INDEX simples,
        // as duas chamadas encontram o SELECT vazio e ambas inserem; só o índice
        // ÚNICO faz a perdedora cair no EXCEPTION e devolver a linha da vencedora.
        const [a, b] = await Promise.all([
            reaproveitar(null, 'Concorrente A', 'corrida@example.com'),
            reaproveitar(null, 'Concorrente B', 'corrida@example.com'),
        ])
        expect(a).toBe(b)

        const { count } = await supabase
            .from('clientes')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', TENANT_TESTE)
            .eq('email', 'corrida@example.com')
        expect(count).toBe(1)
    })

    it('recusa cliente sem nenhum contato (ck_clientes_contato_obrigatorio)', async () => {
        await expect(reaproveitar(null, 'Sem Contato', null)).rejects.toThrow()
    })
})
