#!/usr/bin/env node
/**
 * Estágio 7 (parte 1) da fábrica — renderiza cada cena do roteiro como PNG 1080x1920.
 *
 * Cada cena vira um HTML autocontido (fonte e imagens por file://) e é fotografada
 * pelo Chrome headless. Determinístico: mesmo roteiro + mesmo acervo = mesmos pixels.
 *
 * Uso: node render-cenas.mjs <roteiro.json> [--saida <dir>]
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const FABRICA = resolve(AQUI, '..')
const ACERVO = join(FABRICA, 'acervo')
const REPO = resolve(FABRICA, '..', '..')

const L = 1080
const A = 1920

// Identidade oficial — nunca outra paleta (memória: identidade-visual-oficial)
const MARCA = {
    azulClaro: '#3DBAED',
    azulEscuro: '#3961D5',
    roxo: '#4219B0',
    palco: '#0b0b0f',
    giz: '#f4f4f5',
    nevoa: '#a1a1aa',
    penumbra: '#71717a',
}

const CHROME =
    ['google-chrome', 'google-chrome-stable', 'chromium'].find((c) => {
        try {
            execFileSync('command', ['-v', c], { shell: true, stdio: 'ignore' })
            return true
        } catch {
            return false
        }
    }) ?? 'google-chrome'

const fonte = (peso) => `file://${join(ACERVO, 'fonte', `Poppins-${peso}.ttf`)}`

const base = () => `
@font-face{font-family:Poppins;src:url('${fonte(400)}');font-weight:400}
@font-face{font-family:Poppins;src:url('${fonte(600)}');font-weight:600}
@font-face{font-family:Poppins;src:url('${fonte(800)}');font-weight:800}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${L}px;height:${A}px;overflow:hidden}
body{background:${MARCA.palco};color:${MARCA.giz};font-family:Poppins,sans-serif;
  display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative}
/* Área segura: as plataformas cobrem topo e rodapé com UI própria */
.palco{width:100%;padding:300px 72px 400px;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:48px;height:100%}
.halo{position:absolute;width:1200px;height:1200px;border-radius:50%;
  background:radial-gradient(circle,${MARCA.azulEscuro}22 0%,transparent 62%);
  left:50%;top:50%;transform:translate(-50%,-50%);pointer-events:none}
.rotulo{font-size:34px;font-weight:600;color:${MARCA.azulClaro};letter-spacing:.02em;text-align:center}
.rodape{font-size:32px;color:${MARCA.nevoa};text-align:center;line-height:1.35}
`

function cenaConversa(c) {
    const bolhas = c.bolhas
        .map((b) => {
            const meu = b.autor === 'voce'
            const cor = meu ? '#0f4c3f' : '#1e1e24'
            const anel = b.destaque
                ? `box-shadow:0 0 0 4px ${MARCA.azulClaro}66, 0 24px 60px -12px ${MARCA.azulClaro}55;`
                : ''
            return `<div class="linha ${meu ? 'dir' : 'esq'}">
        <div class="bolha" style="background:${cor};${anel}">${b.texto}
          <span class="hora">${meu ? '✓✓' : ''}</span>
        </div></div>`
        })
        .join('')

    return `<style>${base()}
  /* Âncora no topo: as mensagens crescem para baixo, como numa conversa de verdade.
     Centralizado, o painel "pulava" a cada corte porque mudava de altura. */
  .palco{justify-content:flex-start;padding-top:330px}
  .chat{width:100%;background:#0e0e13;border:1px solid #26262e;border-radius:44px;overflow:hidden}
  .top{display:flex;align-items:center;gap:24px;padding:36px 40px;border-bottom:1px solid #26262e;background:#131319}
  .av{width:86px;height:86px;border-radius:50%;background:#2a2a33;display:flex;align-items:center;
      justify-content:center;font-size:36px;font-weight:600;color:${MARCA.nevoa}}
  .nome{font-size:38px;font-weight:600}
  .sub{font-size:28px;color:${MARCA.azulClaro};margin-top:4px}
  .msgs{padding:44px 36px;display:flex;flex-direction:column;gap:28px}
  .linha{display:flex}.esq{justify-content:flex-start}.dir{justify-content:flex-end}
  .bolha{max-width:78%;padding:30px 34px;border-radius:34px;font-size:40px;line-height:1.32;position:relative}
  .esq .bolha{border-bottom-left-radius:12px}
  .dir .bolha{border-bottom-right-radius:12px}
  .hora{display:block;text-align:right;font-size:22px;color:#9fd6c4;margin-top:8px;height:22px}
  </style>
  <div class="halo"></div>
  <div class="palco">
    <div class="chat">
      <div class="top"><div class="av">C</div>
        <div><div class="nome">${c.cabecalho ?? 'Cliente'}</div>
        <div class="sub">${c.subtitulo ?? ''}</div></div></div>
      <div class="msgs">${bolhas}</div>
    </div>
    ${c.rodape ? `<div class="rodape">${c.rodape}</div>` : ''}
  </div>`
}

function cenaTitulo(c) {
    return `<style>${base()}
  .t{font-size:104px;font-weight:800;line-height:1.05;letter-spacing:-.03em;text-align:center}
  .t b{background:linear-gradient(135deg,${MARCA.azulClaro},${MARCA.azulEscuro});
       -webkit-background-clip:text;background-clip:text;color:transparent;font-weight:800}
  </style>
  <div class="halo"></div>
  <div class="palco"><div class="t">${c.texto.replace(/não precisa existir/, '<b>não precisa existir</b>')}</div></div>`
}

function cenaProduto(c) {
    const img = join(ACERVO, c.imagem)
    if (!existsSync(img)) throw new Error(`Ativo ausente no acervo: ${c.imagem}`)
    return `<style>${base()}
  /* Produto ocupa o quadro: em vertical, card pequeno lê como screenshot solto */
  .palco{padding:230px 32px 300px;gap:56px}
  .card{width:100%;border-radius:40px;overflow:hidden;
        box-shadow:0 40px 120px -30px rgba(0,0,0,.9),0 0 0 1px #ffffff14}
  .card img{display:block;width:100%}
  .rotulo{font-size:42px}
  </style>
  <div class="halo"></div>
  <div class="palco">
    <div class="rotulo">${c.rotulo ?? ''}</div>
    <div class="card"><img src="file://${img}"></div>
  </div>`
}

function cenaFecho(c) {
    const logo = join(REPO, 'public', 'logo-fundo-escuro.svg')
    return `<style>${base()}
  .t{font-size:110px;font-weight:800;line-height:1.04;letter-spacing:-.03em;text-align:center;
     background:linear-gradient(135deg,${MARCA.azulClaro},${MARCA.azulEscuro});
     -webkit-background-clip:text;background-clip:text;color:transparent}
  .logo{height:96px;opacity:.95}
  </style>
  <div class="halo"></div>
  <div class="palco">
    <div class="t">${c.texto}</div>
    ${existsSync(logo) ? `<img class="logo" src="file://${logo}">` : `<div class="rotulo">${c.apoio ?? ''}</div>`}
  </div>`
}

const RENDERIZADORES = {
    conversa: cenaConversa,
    titulo: cenaTitulo,
    produto: cenaProduto,
    fecho: cenaFecho,
}

function main() {
    const [, , roteiroPath, ...resto] = process.argv
    if (!roteiroPath) {
        console.error('uso: node render-cenas.mjs <roteiro.json> [--saida <dir>]')
        process.exit(1)
    }
    const roteiro = JSON.parse(readFileSync(roteiroPath, 'utf8'))
    const iSaida = resto.indexOf('--saida')
    const saida = iSaida >= 0 ? resto[iSaida + 1] : join(FABRICA, 'pecas', roteiro.id, 'cenas')
    mkdirSync(saida, { recursive: true })

    const total = roteiro.cenas.reduce((s, c) => s + c.segundos, 0)
    console.log(`roteiro ${roteiro.id} — ${roteiro.cenas.length} cenas, ${total.toFixed(1)}s`)

    for (const [i, cena] of roteiro.cenas.entries()) {
        const fn = RENDERIZADORES[cena.tipo]
        if (!fn) throw new Error(`tipo de cena desconhecido: ${cena.tipo}`)
        const n = String(i + 1).padStart(2, '0')
        const html = join(saida, `${n}-${cena.id}.html`)
        const png = join(saida, `${n}-${cena.id}.png`)
        writeFileSync(html, `<!doctype html><meta charset="utf-8">${fn(cena)}`)
        execFileSync(
            CHROME,
            [
                '--headless',
                '--disable-gpu',
                '--no-sandbox',
                '--hide-scrollbars',
                '--force-device-scale-factor=1',
                '--allow-file-access-from-files',
                '--default-background-color=0b0b0f',
                '--virtual-time-budget=1500',
                `--window-size=${L},${A}`,
                `--screenshot=${png}`,
                `file://${html}`,
            ],
            { stdio: 'ignore' },
        )
        console.log(`  ${n} ${cena.tipo.padEnd(9)} ${String(cena.segundos).padStart(4)}s  ${cena.id}`)
    }

    writeFileSync(
        join(saida, 'cenas.json'),
        JSON.stringify(
            {
                id: roteiro.id,
                duracaoTotal: total,
                cenas: roteiro.cenas.map((c, i) => ({
                    arquivo: `${String(i + 1).padStart(2, '0')}-${c.id}.png`,
                    segundos: c.segundos,
                    tipo: c.tipo,
                })),
            },
            null,
            2,
        ),
    )
    console.log(`\ncenas em ${saida}`)
}

main()
