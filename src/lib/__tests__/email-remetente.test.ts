import { describe, it, expect } from 'vitest'

import { montarRemetente, ENDERECO_REMETENTE } from '../email/remetente'

/**
 * O nome do estabelecimento vem do banco e é input de usuário. O display name
 * é montado como quoted-string: os *specials* do RFC 5322 (`, ( ) : ; @ .`)
 * precisam ser literais seguros, não caracteres que quebrem o header — isso é
 * propriedade do RFC, não do Resend.
 */
describe('montarRemetente', () => {
    it('monta o header com o sufixo do produto e o endereço verificado', () => {
        expect(montarRemetente('Salão da Maria')).toBe(
            `"Salão da Maria via VamoAgendar" <${ENDERECO_REMETENTE}>`,
        )
    })

    it('remove sinais de maior/menor e aspas do nome', () => {
        const header = montarRemetente('Salão <script> "da" Maria>')
        expect(header).not.toContain('<script')
        // As únicas aspas que sobram delimitam o display name.
        expect(header).toBe(`"Salão script da Maria via VamoAgendar" <${ENDERECO_REMETENTE}>`)
    })

    it('produz header numa linha só mesmo com quebra de linha no nome', () => {
        const header = montarRemetente('Salão\r\nBcc: invasor@exemplo.com')
        expect(header).not.toContain('\n')
        expect(header).not.toContain('\r')
    })

    it('cai no rótulo genérico quando o nome é vazio ou só espaço', () => {
        expect(montarRemetente('')).toBe(
            `"Estabelecimento via VamoAgendar" <${ENDERECO_REMETENTE}>`,
        )
        expect(montarRemetente('   ')).toBe(
            `"Estabelecimento via VamoAgendar" <${ENDERECO_REMETENTE}>`,
        )
    })

    it('cai no rótulo genérico quando a sanitização esvazia o nome', () => {
        expect(montarRemetente('<<>>')).toBe(
            `"Estabelecimento via VamoAgendar" <${ENDERECO_REMETENTE}>`,
        )
    })

    it('o remetente é constante de produto, não variável de ambiente', () => {
        expect(ENDERECO_REMETENTE).toBe('naoresponda@mail.vamoagendar.com.br')
    })

    /**
     * CR-04: sem as aspas, cada um destes nomes gera um header que o parser lê
     * como lista de endereços ou como comentário — o Resend recusa e o tenant
     * nunca recebe nenhum e-mail, sem log e sem Sentry. Nomes assim são comuns
     * no público-alvo (salões, studios de sobrancelha).
     */
    describe('specials do RFC 5322 no nome do tenant', () => {
        it.each([
            ['vírgula', 'Studio Bela, Sobrancelhas'],
            ['parênteses', 'Studio Bela (Centro)'],
            ['ponto', 'Bela Ltda.'],
            ['dois-pontos', 'Bela: Studio'],
            ['ponto e vírgula', 'Bela; Studio'],
            ['arroba', 'Bela @ Centro'],
            ['colchetes', 'Bela [Centro]'],
        ])('preserva %s dentro da quoted-string', (_rotulo, nome) => {
            const header = montarRemetente(nome)

            expect(header).toBe(`"${nome} via VamoAgendar" <${ENDERECO_REMETENTE}>`)
            // O display name inteiro tem que estar entre UM par de aspas, e o
            // endereço tem que ser o único trecho fora delas.
            expect(header.match(/"/g)).toHaveLength(2)
            expect(header.indexOf('<')).toBeGreaterThan(header.lastIndexOf('"'))
        })

        it('a vírgula não pode terminar fora das aspas — seria separador de lista', () => {
            const header = montarRemetente('Studio Bela, Sobrancelhas')
            const forasDasAspas = header.slice(header.lastIndexOf('"') + 1)

            expect(forasDasAspas).not.toContain(',')
            expect(forasDasAspas.trim()).toBe(`<${ENDERECO_REMETENTE}>`)
        })

        it('barra invertida sai do nome — é escape dentro da quoted-string', () => {
            expect(montarRemetente('Bela \\ Studio')).toBe(
                `"Bela Studio via VamoAgendar" <${ENDERECO_REMETENTE}>`,
            )
        })
    })
})
