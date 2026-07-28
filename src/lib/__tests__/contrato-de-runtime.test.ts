/**
 * Trava o vínculo entre `engines.node` e o Node que o `packageManager` exige.
 *
 * POR QUE ESTE ARQUIVO EXISTE — incidente de 2026-07-28, deploy `7afc7f71`:
 *
 * O ciclo de code review da Phase 03 acrescentou `"engines": { "node": ">=20" }`
 * ao package.json (achado WR-05, cuja parte legítima era importar `randomUUID`
 * de `node:crypto` em vez de usar o global). O piso `>=20` parecia inofensivo e
 * derrubou o deploy de produção.
 *
 * A cadeia:
 *   1. O Railpack lê `engines.node` e resolve para o PISO do range — Node 20.20.2.
 *   2. O `packageManager` do projeto é pnpm@11.9.0, que declara `node >=22.13`.
 *   3. pnpm 11 carrega `node:sqlite`, builtin que só existe a partir do Node 22.
 *   4. `pnpm install --frozen-lockfile` morreu com ERR_UNKNOWN_BUILTIN_MODULE,
 *      antes de instalar uma única dependência.
 *
 * O que torna esse defeito traiçoeiro: ANTES do campo `engines` existir, o
 * resolvedor usava o próprio default (Node 22+) e tudo funcionava. Declarar um
 * piso ABAIXO do exigido não afrouxou nada — deu permissão explícita para o
 * resolvedor escolher uma versão quebrada. Nada no repositório sinalizava a
 * contradição: `pnpm test`, `pnpm build`, `pnpm lint` e `tsc --noEmit` passavam
 * todos, porque a máquina de desenvolvimento roda Node 24.
 *
 * Nenhum teste podia pegar isso, e é por isso que este existe.
 *
 * Se for preciso trocar o `packageManager`, confira o Node exigido pela versão
 * nova (`pnpm view pnpm@<versao> engines`) e atualize AQUI e no package.json —
 * nunca só num dos dois.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Piso de Node exigido pelo pnpm da linha 11.x, medido em 2026-07-28 com
 * `pnpm view pnpm@11.9.0 engines` → `{ "node": ">=22.13" }`.
 */
const NODE_MINIMO_DO_PNPM = { major: 22, minor: 13 }

interface PackageJson {
    packageManager?: string
    engines?: { node?: string }
}

function lerPackageJson(): PackageJson {
    const caminho = join(process.cwd(), 'package.json')
    return JSON.parse(readFileSync(caminho, 'utf-8')) as PackageJson
}

/** Extrai `{ major, minor }` do piso de um range simples do tipo `>=22.13`. */
function pisoDoRange(range: string): { major: number; minor: number } | null {
    const casado = range.match(/^>=\s*(\d+)(?:\.(\d+))?/)
    if (!casado) return null
    return { major: Number(casado[1]), minor: Number(casado[2] ?? 0) }
}

describe('contrato de runtime (package.json)', () => {
    it('declara engines.node — sem ele o resolvedor de build escolhe sozinho', () => {
        const pkg = lerPackageJson()
        expect(pkg.engines?.node).toBeTypeOf('string')
        expect(pkg.engines?.node).not.toBe('')
    })

    it('declara packageManager pinado — é dele que sai a exigência de Node', () => {
        const pkg = lerPackageJson()
        expect(pkg.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/)
    })

    it('o piso de engines.node NÃO é menor que o Node exigido pelo pnpm do projeto', () => {
        const pkg = lerPackageJson()
        const piso = pisoDoRange(pkg.engines?.node ?? '')

        // Um range que este teste não sabe ler é motivo de FALHA, nunca de passe
        // silencioso: piso ilegível é exatamente o estado em que o defeito volta
        // sem ninguém ver.
        expect(
            piso,
            `engines.node = "${pkg.engines?.node}" não está na forma ">=X.Y" que este contrato sabe verificar. ` +
                `Ou ajuste o formato, ou estenda pisoDoRange() — não relaxe a asserção.`,
        ).not.toBeNull()

        const emCentesimos = (v: { major: number; minor: number }) => v.major * 1000 + v.minor

        expect(
            emCentesimos(piso!),
            `engines.node declara piso ${piso!.major}.${piso!.minor}, abaixo do Node ` +
                `${NODE_MINIMO_DO_PNPM.major}.${NODE_MINIMO_DO_PNPM.minor} que ${pkg.packageManager} exige. ` +
                `O resolvedor de build do Railway escolhe o PISO do range: com um piso baixo demais ele instala ` +
                `um Node em que o pnpm nem carrega (node:sqlite ausente), e o deploy morre no install. ` +
                `Foi assim que o deploy 7afc7f71 caiu em 2026-07-28.`,
        ).toBeGreaterThanOrEqual(emCentesimos(NODE_MINIMO_DO_PNPM))
    })

    it('o pnpm declarado continua sendo a linha 11.x que NODE_MINIMO_DO_PNPM descreve', () => {
        const pkg = lerPackageJson()
        const major = Number(pkg.packageManager?.match(/^pnpm@(\d+)\./)?.[1])

        // Se o projeto pular para pnpm 12+, a constante acima deixa de descrever a
        // realidade e este teste avisa — em vez de continuar verde comparando com
        // o requisito de uma versão que não está mais em uso.
        expect(
            major,
            `packageManager mudou para uma linha de pnpm que NODE_MINIMO_DO_PNPM não descreve. ` +
                `Rode 'pnpm view ${pkg.packageManager?.replace('@', '@')} engines' e atualize a constante junto.`,
        ).toBe(11)
    })
})
