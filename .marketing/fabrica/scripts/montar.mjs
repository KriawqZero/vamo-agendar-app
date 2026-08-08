#!/usr/bin/env node
/**
 * Estágio 7 (parte 2) da fábrica — monta o MP4 vertical a partir das cenas renderizadas.
 *
 * Determinístico: só ffmpeg, sem serviço externo e sem custo. Corte seco entre cenas
 * (é o idioma nativo do formato) com respiro leve de escala para o quadro não morrer.
 * O áudio é sintetizado aqui mesmo — um toque curto a cada mensagem nova. Sem trilha
 * licenciada, o vídeo sai com os toques e silêncio; não inventamos música.
 *
 * Uso: node montar.mjs <dir-das-cenas> [--saida <arquivo.mp4>]
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const FPS = 30
const L = 1080
const A = 1920

const ff = (args) => execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args])

/**
 * Nem toda build de ffmpeg traz libx264 (a do Fedora usada aqui só tem libopenh264).
 * H.264 é obrigatório: é o que Instagram, TikTok, YouTube e Facebook aceitam sem
 * transcodificar. Detecta em vez de assumir — e falha ruidosamente se não houver.
 */
function escolherEncoder() {
    const lista = execFileSync('ffmpeg', ['-hide_banner', '-encoders'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
    })
    if (/^\s*V\S*\s+libx264\b/m.test(lista)) {
        return { nome: 'libx264', qualidade: ['-preset', 'medium', '-crf', '17'] }
    }
    if (/^\s*V\S*\s+libopenh264\b/m.test(lista)) {
        // openh264 não tem CRF; bitrate alto porque o conteúdo é texto e UI (bordas duras)
        return { nome: 'libopenh264', qualidade: ['-b:v', '12M', '-profile:v', 'high'] }
    }
    throw new Error('nenhum encoder H.264 disponível no ffmpeg — instale libx264 ou libopenh264')
}

const ENCODER = escolherEncoder()

function segmento(png, segundos, destino) {
    const frames = Math.round(segundos * FPS)
    // Pré-amplia e reduz para o zoompan não tremer em 1080p, e volta ao quadro final.
    const respiro = [
        `scale=${L * 2}:${A * 2}`,
        `zoompan=z='min(1+0.00035*on,1.035)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${L * 2}x${A * 2}:fps=${FPS}`,
        `scale=${L}:${A}:flags=lanczos`,
        'format=yuv420p',
    ].join(',')
    ff([
        '-loop', '1', '-i', png,
        '-t', String(segundos),
        '-vf', respiro,
        '-r', String(FPS),
        '-c:v', ENCODER.nome, ...ENCODER.qualidade,
        destino,
    ])
}

function trilhaDeToques(marcas, total, destino, trabalho) {
    const toque = join(trabalho, 'toque.wav')
    // Toque curto e discreto — mensagem chegando, não notificação de aplicativo.
    // A fonte `sine` do lavfi sai por volta de -18 dBFS, não em escala cheia: sem o
    // ganho explícito o toque fica inaudível no celular (medido: pico de -34 dB).
    ff([
        '-f', 'lavfi', '-i', 'sine=frequency=1046:duration=0.18',
        '-af', [
            'volume=12dB',
            'afade=t=in:st=0:d=0.008',
            'afade=t=out:st=0.04:d=0.14',
            'aformat=sample_rates=48000:channel_layouts=stereo',
        ].join(','),
        toque,
    ])

    const entradas = marcas.flatMap(() => ['-i', toque])
    const atrasos = marcas
        .map((ms, i) => `[${i}:a]adelay=${Math.round(ms)}|${Math.round(ms)}[t${i}]`)
        .join(';')
    const mix = `${marcas.map((_, i) => `[t${i}]`).join('')}amix=inputs=${marcas.length}:normalize=0[m]`
    ff([
        ...entradas,
        '-filter_complex', `${atrasos};${mix};[m]apad,atrim=0:${total}[a]`,
        '-map', '[a]', '-c:a', 'aac', '-b:a', '128k',
        destino,
    ])
}

function main() {
    const [, , dirCenas, ...resto] = process.argv
    if (!dirCenas) {
        console.error('uso: node montar.mjs <dir-das-cenas> [--saida <arquivo.mp4>]')
        process.exit(1)
    }
    const cenasDir = resolve(dirCenas)
    const manifesto = JSON.parse(readFileSync(join(cenasDir, 'cenas.json'), 'utf8'))
    const iSaida = resto.indexOf('--saida')
    const saida = iSaida >= 0 ? resolve(resto[iSaida + 1]) : join(dirname(cenasDir), 'video.mp4')

    const trabalho = join(cenasDir, '.tmp')
    rmSync(trabalho, { recursive: true, force: true })
    mkdirSync(trabalho, { recursive: true })

    console.log(`montando ${manifesto.id} — ${manifesto.cenas.length} cenas, ${manifesto.duracaoTotal}s`)

    const partes = []
    const marcas = []
    let t = 0
    for (const [i, c] of manifesto.cenas.entries()) {
        const seg = join(trabalho, `seg-${String(i).padStart(2, '0')}.mp4`)
        segmento(join(cenasDir, c.arquivo), c.segundos, seg)
        partes.push(seg)
        // Toque só quando entra mensagem nova na conversa
        if (c.tipo === 'conversa') marcas.push(t * 1000 + 60)
        t += c.segundos
        process.stdout.write(`  ${c.arquivo} ✓\n`)
    }

    const lista = join(trabalho, 'lista.txt')
    writeFileSync(lista, partes.map((p) => `file '${p}'`).join('\n'))
    const mudo = join(trabalho, 'mudo.mp4')
    ff(['-f', 'concat', '-safe', '0', '-i', lista, '-c', 'copy', mudo])

    const audio = join(trabalho, 'audio.m4a')
    trilhaDeToques(marcas, manifesto.duracaoTotal, audio, trabalho)

    ff([
        '-i', mudo, '-i', audio,
        '-map', '0:v', '-map', '1:a',
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
        '-movflags', '+faststart', '-shortest',
        saida,
    ])

    // Prévia leve para a mesa de aprovação no Telegram
    const previa = saida.replace(/\.mp4$/, '-previa.gif')
    ff([
        '-i', saida,
        '-vf', `fps=10,scale=360:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
        previa,
    ])

    rmSync(trabalho, { recursive: true, force: true })
    console.log(`\nvídeo:  ${saida}`)
    console.log(`prévia: ${previa}`)
}

main()
