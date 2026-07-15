#!/usr/bin/env node
/**
 * Mock local da Evolution API para exercitar a UI de WhatsApp sem gateway real.
 *
 * Uso:
 *   node scripts/mock-evolution.mjs            # porta 8081
 *   EVOLUTION_API_URL=http://localhost:8081 pnpm dev
 *
 * Controle do estado simulado (sem reiniciar):
 *   curl -X POST 'http://localhost:8081/__mock/state?value=open'        # conectado
 *   curl -X POST 'http://localhost:8081/__mock/state?value=connecting'  # conectando
 *   curl -X POST 'http://localhost:8081/__mock/state?value=close'       # desconectado
 *   curl -X POST 'http://localhost:8081/__mock/state?value=qrcode'      # servindo QR
 *   curl -X POST 'http://localhost:8081/__mock/state?value=404'         # instância inexistente (falha)
 *
 * Matar o processo simula queda do gateway (estado "instavel" + timeout do sync).
 */
import http from 'node:http'

const PORT = process.env.MOCK_EVOLUTION_PORT || 8081

// Estado simulado da instância: 'qrcode' | 'connecting' | 'open' | 'close' | '404'
let estado = 'qrcode'

// PNG 1x1 transparente — suficiente para renderizar o <img> do QR na UI.
const QR_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

function json(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(body))
}

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`)
    const rota = url.pathname

    // Painel de controle do mock
    if (rota === '/__mock/state' && req.method === 'POST') {
        estado = url.searchParams.get('value') || 'qrcode'
        console.log(`[mock] estado da instância → ${estado}`)
        return json(res, 200, { estado })
    }

    if (rota === '/instance/create' && req.method === 'POST') {
        console.log('[mock] POST /instance/create')
        estado = 'qrcode'
        return json(res, 201, { hash: 'token-mock-instancia' })
    }

    if (rota.startsWith('/instance/connect/') && req.method === 'GET') {
        console.log(`[mock] GET ${rota} (estado=${estado})`)
        if (estado === '404') return json(res, 404, { error: 'instance does not exist' })
        if (estado === 'open') return json(res, 200, { instance: { state: 'open' } })
        return json(res, 200, { base64: `data:image/png;base64,${QR_BASE64}` })
    }

    if (rota.startsWith('/instance/connectionState/') && req.method === 'GET') {
        console.log(`[mock] GET ${rota} (estado=${estado})`)
        if (estado === '404') return json(res, 404, { error: 'instance does not exist' })
        const state = estado === 'qrcode' ? 'connecting' : estado
        return json(res, 200, { instance: { state } })
    }

    if (rota.startsWith('/instance/delete/') && req.method === 'DELETE') {
        console.log(`[mock] DELETE ${rota}`)
        estado = 'close'
        return json(res, 200, { status: 'SUCCESS' })
    }

    if (rota.startsWith('/message/sendText/') && req.method === 'POST') {
        console.log(`[mock] POST ${rota} (estado=${estado})`)
        if (estado !== 'open') return json(res, 400, { error: 'instance not connected' })
        return json(res, 201, { key: { id: 'mock-msg-id' }, status: 'PENDING' })
    }

    if (rota.startsWith('/instance/fetchInstances') && req.method === 'GET') {
        console.log(`[mock] GET ${rota}`)
        return json(res, 200, [{ token: 'token-mock-instancia' }])
    }

    json(res, 404, { error: `rota não mockada: ${req.method} ${rota}` })
})

server.listen(PORT, () => {
    console.log(`Mock da Evolution API em http://localhost:${PORT} (estado inicial: ${estado})`)
    console.log(`Rode o app com: EVOLUTION_API_URL=http://localhost:${PORT} pnpm dev`)
})
