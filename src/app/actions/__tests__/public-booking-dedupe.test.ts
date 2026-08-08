import { describe, expect, it, vi } from 'vitest'

describe('Deduplicação de clientes por Telefone e E-mail', () => {
    it('deve priorizar busca por telefone e em seguida por e-mail no lookup', () => {
        const simularLookup = (
            telefone?: string | null,
            email?: string | null,
            bancoClientes: Array<{ id: string; telefone: string | null; email: string | null }> = []
        ) => {
            // 1. Busca por Telefone se informado
            if (telefone) {
                const achadoPorTelefone = bancoClientes.find((c) => c.telefone === telefone)
                if (achadoPorTelefone) return { id: achadoPorTelefone.id, motivo: 'encontrado_por_telefone' }
            }
            // 2. Busca por E-mail se informado e não achou por telefone
            if (email) {
                const achadoPorEmail = bancoClientes.find(
                    (c) => c.email?.toLowerCase() === email.toLowerCase()
                )
                if (achadoPorEmail) return { id: achadoPorEmail.id, motivo: 'encontrado_por_email' }
            }
            // 3. Não achou
            return { id: 'novo-id-gerado', motivo: 'cliente_novo_criado' }
        }

        const clientesExistentes = [
            { id: 'c1', telefone: '5511999999999', email: 'joao@example.com' },
            { id: 'c2', telefone: null, email: 'maria@example.com' },
            { id: 'c3', telefone: '5511888888888', email: null },
        ]

        // Caso 1: Busca por Telefone existente
        expect(simularLookup('5511999999999', 'outro@example.com', clientesExistentes)).toEqual({
            id: 'c1',
            motivo: 'encontrado_por_telefone',
        })

        // Caso 2: Telefone ausente, busca por E-mail existente
        expect(simularLookup(null, 'maria@example.com', clientesExistentes)).toEqual({
            id: 'c2',
            motivo: 'encontrado_por_email',
        })

        // Caso 3: Telefone novo, e-mail existente (não achou por tel, achou por e-mail)
        expect(simularLookup('5511777777777', 'maria@example.com', clientesExistentes)).toEqual({
            id: 'c2',
            motivo: 'encontrado_por_email',
        })

        // Caso 4: Cliente totalmente novo
        expect(simularLookup('5511666666666', 'novo@example.com', clientesExistentes)).toEqual({
            id: 'novo-id-gerado',
            motivo: 'cliente_novo_criado',
        })
    })
})
