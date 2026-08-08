#!/usr/bin/env node
/**
 * Sonda de aceite do estágio 7 — nenhuma peça vai para a mesa de aprovação sem passar.
 * Verifica o que quebra em silêncio: resolução errada, faixa de áudio ausente, áudio
 * inaudível, duração fora da faixa do formato e primeiro frame preto (capa ruim).
 *
 * Uso: node verificar.mjs <video.mp4>
 * Saída: exit 0 se passou, 1 se falhou.
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const REGRAS = {
    largura: 1080,
    altura: 1920,
    duracaoMin: 12,
    duracaoMax: 40,
    picoMinDb: -20, // abaixo disso ninguém ouve no celular
    tamanhoMaxMb: 280, // teto prático dos agendadores
}

const probe = (args) =>
    execFileSync('ffprobe', ['-v', 'error', ...args], { encoding: 'utf8' }).trim()

/** ffmpeg escreve as medições em stderr, não em stdout — daí o spawnSync. */
const medir = (args) => spawnSync('ffmpeg', args, { encoding: 'utf8' }).stderr ?? ''

function picoDb(video) {
    const m = medir(['-i', video, '-af', 'volumedetect', '-f', 'null', '/dev/null']).match(
        /max_volume:\s*(-?[\d.]+) dB/,
    )
    return m ? Number(m[1]) : null
}

function primeiroFrameEscuro(video) {
    const m = medir([
        '-i', video,
        '-vf', 'select=eq(n\\,0),signalstats,metadata=print',
        '-frames:v', '1', '-f', 'null', '/dev/null',
    ]).match(/YAVG=([\d.]+)/)
    return m ? Number(m[1]) < 18 : false
}

function main() {
    const video = resolve(process.argv[2] ?? '')
    if (!video || !existsSync(video)) {
        console.error('uso: node verificar.mjs <video.mp4>')
        process.exit(1)
    }

    const falhas = []
    const avisos = []

    const [l, a] = probe([
        '-select_streams', 'v:0', '-show_entries', 'stream=width,height',
        '-of', 'csv=p=0:s=x', video,
    ]).split('x').map(Number)
    if (l !== REGRAS.largura || a !== REGRAS.altura)
        falhas.push(`resolução ${l}x${a}, esperado ${REGRAS.largura}x${REGRAS.altura}`)

    const codec = probe(['-select_streams', 'v:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', video])
    if (codec !== 'h264') falhas.push(`codec de vídeo ${codec}, esperado h264`)

    const dur = Number(probe(['-show_entries', 'format=duration', '-of', 'csv=p=0', video]))
    if (dur < REGRAS.duracaoMin || dur > REGRAS.duracaoMax)
        falhas.push(`duração ${dur.toFixed(1)}s fora da faixa ${REGRAS.duracaoMin}–${REGRAS.duracaoMax}s`)

    const temAudio = probe(['-select_streams', 'a:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', video])
    if (!temAudio) {
        falhas.push('sem faixa de áudio — plataformas penalizam e o vídeo lê como quebrado')
    } else {
        const pico = picoDb(video)
        if (pico === null) avisos.push('não foi possível medir o pico de áudio')
        else if (pico < REGRAS.picoMinDb)
            falhas.push(`pico de áudio ${pico} dB — inaudível no celular (mínimo ${REGRAS.picoMinDb} dB)`)
    }

    const mb = statSync(video).size / 1024 / 1024
    if (mb > REGRAS.tamanhoMaxMb) falhas.push(`arquivo com ${mb.toFixed(0)} MB, acima do teto`)

    if (primeiroFrameEscuro(video))
        avisos.push('primeiro frame quase preto — vira capa ruim na grade do perfil')

    console.log(`${video}`)
    console.log(`  ${l}x${a} · ${codec} · ${dur.toFixed(1)}s · ${mb.toFixed(1)} MB · áudio ${temAudio || 'AUSENTE'}`)
    for (const a of avisos) console.log(`  ⚠ ${a}`)
    for (const f of falhas) console.log(`  ✗ ${f}`)
    if (!falhas.length) console.log('  ✓ aprovado na sonda — liberado para a mesa')
    process.exit(falhas.length ? 1 : 0)
}

main()
