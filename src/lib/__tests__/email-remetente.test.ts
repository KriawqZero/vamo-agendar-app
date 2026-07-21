import { describe, it, expect } from 'vitest'

import { montarRemetente, ENDERECO_REMETENTE } from '../email/remetente'

/**
 * O nome do estabelecimento vem do banco e é input de usuário. `<`, `>`, `"` e
 * caracteres de controle quebram o header — propriedade do RFC 5322, não do
 * Resend.
 */
describe('montarRemetente', () => {
    it('monta o header com o sufixo do produto e o endereço verificado', () => {
        expect(montarRemetente('Salão da Maria')).toBe(
            `Salão da Maria via VamoAgendar <${ENDERECO_REMETENTE}>`,
        )
    })

    it('remove sinais de maior/menor e aspas do nome', () => {
        const header = montarRemetente('Salão <script> "da" Maria>')
        expect(header).not.toContain('<script')
        expect(header).not.toContain('"')
        // O único par de <> que sobra é o que delimita o endereço.
        expect(header).toBe(`Salão script da Maria via VamoAgendar <${ENDERECO_REMETENTE}>`)
    })

    it('produz header numa linha só mesmo com quebra de linha no nome', () => {
        const header = montarRemetente('Salão\r\nBcc: invasor@exemplo.com')
        expect(header).not.toContain('\n')
        expect(header).not.toContain('\r')
    })

    it('cai no rótulo genérico quando o nome é vazio ou só espaço', () => {
        expect(montarRemetente('')).toBe(`Estabelecimento via VamoAgendar <${ENDERECO_REMETENTE}>`)
        expect(montarRemetente('   ')).toBe(
            `Estabelecimento via VamoAgendar <${ENDERECO_REMETENTE}>`,
        )
    })

    it('cai no rótulo genérico quando a sanitização esvazia o nome', () => {
        expect(montarRemetente('<<>>')).toBe(
            `Estabelecimento via VamoAgendar <${ENDERECO_REMETENTE}>`,
        )
    })

    it('o remetente é constante de produto, não variável de ambiente', () => {
        expect(ENDERECO_REMETENTE).toBe('naoresponda@mail.vamoagendar.com.br')
    })
})
