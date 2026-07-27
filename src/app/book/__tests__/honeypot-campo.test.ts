/**
 * Pino dos atributos do CAMPO ARMADILHA (honeypot) do booking público.
 *
 * Por que a asserção é de FONTE e não de render (padrão herdado da Phase 01, que
 * lê o arquivo do disco com `node:fs`): o que precisa ser travado aqui não é o
 * comportamento do componente, é a FORMA exata de cada atributo. Um render em
 * jsdom provaria que o input existe — e existiria igual se alguém trocasse a
 * ocultação off-screen por `display:none`, renomeasse o campo para `website` ou
 * apagasse o `tabIndex`. Todos esses três "refactors" são invisíveis num teste de
 * comportamento e são exatamente os que quebram a armadilha.
 *
 * O que cada grupo de asserção protege:
 *
 * 1. Invisibilidade por POSICIONAMENTO. Parte dos bots pula campo suprimido por
 *    `display:none`/`hidden` (assunção A4 do RESEARCH) — se alguém "limpar" o
 *    wrapper para uma classe de utilidade que suprime a renderização, a armadilha
 *    deixa de pegar qualquer um e nada no produto dá sintoma.
 * 2. Inércia para pessoa real. `tabIndex={-1}` + `aria-hidden` são o que garante
 *    que quem navega por teclado ou leitor de tela nunca chega ao campo.
 * 3. Distância do vocabulário de AUTOFILL. O pior desfecho nomeado pelo owner no
 *    D-07 é pessoa real recebendo sucesso falso, e o caminho para isso é o
 *    navegador preenchendo o campo sozinho. Por isso o nome é neutro e o
 *    `autoComplete` é `off`.
 * 4. O fio até a action. Campo que não viaja no submit é armadilha desligada.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const RAIZ = process.cwd()

const FONTE_ETAPA_CONTATO = readFileSync(
    join(RAIZ, 'src/app/book/[slug]/etapas/EtapaContato.tsx'),
    'utf8',
)

const FONTE_BOOKING_APP = readFileSync(join(RAIZ, 'src/app/book/[slug]/BookingApp.tsx'), 'utf8')

/**
 * Recorta o bloco do campo armadilha (wrapper + input) para que as asserções
 * NEGATIVAS falem só dele: `display:none` em qualquer outro ponto do arquivo é
 * assunto de outra pessoa, e um recorte largo demais transformaria este teste em
 * um veto genérico sobre o componente inteiro.
 */
function blocoDoCampoArmadilha(fonte: string): string {
    // `lastIndexOf`, e não `indexOf`: o comentário em pt-BR acima do campo cita o
    // próprio atributo, e ancorar na primeira ocorrência recortaria o bloco do
    // telefone junto — as asserções negativas passariam a falar de outro campo.
    const posicaoDoCampo = fonte.lastIndexOf('name="info_adicional"')
    expect(posicaoDoCampo, 'campo armadilha ausente do EtapaContato').toBeGreaterThan(-1)

    const abertura = fonte.lastIndexOf('<div', posicaoDoCampo)
    const fechamento = fonte.indexOf('</div>', posicaoDoCampo)
    const bloco = fonte.slice(abertura, fechamento + '</div>'.length)

    // Trava do recorte: bloco largo demais (que engolisse os campos legítimos)
    // faria as asserções negativas abaixo passarem por acidente.
    expect(bloco, 'recorte do campo armadilha capturou HTML vizinho').not.toContain('name="nome"')
    expect(bloco).not.toContain('name="telefone"')

    return bloco
}

const BLOCO = blocoDoCampoArmadilha(FONTE_ETAPA_CONTATO)

describe('campo armadilha do booking público — atributos de invisibilidade', () => {
    it('declara o input com o nome NEUTRO contratado', () => {
        // O nome é contrato dos dois lados do fio: o `formData.get` do
        // BookingApp e o `infoAdicional` da action dependem dele. E é neutro de
        // propósito — nome como `honeypot` ou `nao_preencher` entregaria a
        // armadilha para qualquer bot que leia o HTML.
        expect(BLOCO).toContain('name="info_adicional"')
    })

    it('tira o campo da ordem de tabulação', () => {
        expect(BLOCO).toContain('tabIndex={-1}')
    })

    it('esconde o campo do leitor de tela (wrapper e input)', () => {
        const ocorrencias = BLOCO.match(/aria-hidden="true"/g) ?? []
        expect(ocorrencias.length).toBeGreaterThanOrEqual(2)
    })

    it('desliga o autofill do navegador no campo', () => {
        // Autofill preenchendo o campo = pessoa real recebendo sucesso falso
        // (Pitfall 6, o pior desfecho do D-07).
        expect(BLOCO).toContain('autoComplete="off"')
    })

    it('não usa vocabulário que as heurísticas de autofill reconhecem', () => {
        // As heurísticas do navegador casam por `name`/`autocomplete`. Estes são
        // os nomes clássicos de honeypot que o autofill preenche sozinho.
        for (const vocabulario of ['website', 'url', 'address', 'phone2', 'email2', 'company']) {
            expect(BLOCO, `nome de campo com risco de autofill: ${vocabulario}`).not.toContain(
                `name="${vocabulario}"`,
            )
        }
    })

    it('oculta por POSICIONAMENTO off-screen, não por supressão de renderização', () => {
        // Positivo: o wrapper tira o campo da tela empurrando-o para fora dela.
        expect(BLOCO).toMatch(/-left-\[\d{4,}px\]/)

        // Negativos: parte dos bots ignora campo suprimido — com `display:none`
        // ou `hidden` a armadilha continuaria invisível para pessoas E para os
        // bots que ela deveria pegar, sem nenhum sintoma no produto.
        expect(BLOCO).not.toContain('display:none')
        expect(BLOCO).not.toContain('display: none')
        expect(BLOCO).not.toContain('className="hidden')
        // Atributo `hidden` do JSX: casa `<input hidden`/` hidden={...}`, e NÃO
        // casa `overflow-hidden` nem `aria-hidden` (ambos precedidos de `-`).
        expect(BLOCO).not.toMatch(/\shidden[\s=/>]/)
    })

    it('não associa nenhum <label> ao campo', () => {
        expect(BLOCO).not.toContain('<label')
    })

    it('mantém os campos legítimos de contato intactos', () => {
        // Controle positivo: a armadilha é um ACRÉSCIMO. Nome e WhatsApp seguem
        // rotulados, com autofill LIGADO no vocabulário correto — é isso que faz
        // o cliente real preencher em dois toques.
        expect(FONTE_ETAPA_CONTATO).toContain('name="nome"')
        expect(FONTE_ETAPA_CONTATO).toContain('autoComplete="name"')
        expect(FONTE_ETAPA_CONTATO).toContain('name="telefone"')
        expect(FONTE_ETAPA_CONTATO).toContain('autoComplete="tel-national"')
    })
})

describe('campo armadilha — fio até a Server Action', () => {
    it('lê o campo do FormData no submit do BookingApp', () => {
        expect(FONTE_BOOKING_APP).toContain("formData.get('info_adicional')")
    })

    it('repassa o valor lido na chamada de criarAgendamentoPublico', () => {
        // Sem o repasse, o campo existiria na tela e a action nunca saberia —
        // armadilha desligada, e nenhum teste de componente acusaria.
        expect(FONTE_BOOKING_APP).toContain('infoAdicional')
    })
})
