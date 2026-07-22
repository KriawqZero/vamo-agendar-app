import { describe, it, expect, vi, afterEach } from 'vitest'

// Forjar um JWS válido do QStash exigiria as chaves reais da Upstash. O alvo
// aqui é o CONTRATO do módulo: o que ele entrega ao Receiver e o que faz com a
// resposta dele. A validação criptográfica em si é responsabilidade da lib
// oficial, e a prova ponta a ponta é o lembrete real do UAT (plano 01-05).
const { receiverConstruido, verificar } = vi.hoisted(() => ({
    receiverConstruido: vi.fn(),
    verificar: vi.fn(),
}))

vi.mock('@upstash/qstash', () => ({
    Receiver: class ReceiverFalso {
        constructor(opcoes: unknown) {
            receiverConstruido(opcoes)
        }
        verify(parametros: unknown) {
            return verificar(parametros)
        }
    },
}))

import { verificarAssinaturaQstash } from '../qstash-assinatura'

const URL_WEBHOOK = 'https://app.local/api/webhooks/lembrete?secret=valor-real'
const CORPO_CRU = '{"agendamentoId":"ag_1","tenantId":"org_1"}'

afterEach(() => {
    vi.unstubAllEnvs()
    receiverConstruido.mockReset()
    verificar.mockReset()
})

describe('verificarAssinaturaQstash', () => {
    it('recusa sem sequer instanciar o Receiver quando o header de assinatura falta', async () => {
        await expect(
            verificarAssinaturaQstash({
                assinatura: null,
                corpoCru: CORPO_CRU,
                url: URL_WEBHOOK,
            }),
        ).resolves.toBe(false)

        expect(receiverConstruido).not.toHaveBeenCalled()
        expect(verificar).not.toHaveBeenCalled()
    })

    it('recusa quando o Receiver rejeita (assinatura inválida ou corpo divergente)', async () => {
        verificar.mockRejectedValue(new Error('signature is invalid'))

        await expect(
            verificarAssinaturaQstash({
                assinatura: 'jws.invalido.aqui',
                corpoCru: CORPO_CRU,
                url: URL_WEBHOOK,
            }),
        ).resolves.toBe(false)
    })

    it('aceita e repassa corpo cru e url sem transformação alguma', async () => {
        verificar.mockResolvedValue(true)

        await expect(
            verificarAssinaturaQstash({
                assinatura: 'jws.valido.aqui',
                corpoCru: CORPO_CRU,
                url: URL_WEBHOOK,
            }),
        ).resolves.toBe(true)

        // Pass-through literal: qualquer normalização de corpo ou de URL aqui
        // invalidaria a assinatura (a claim `sub` do JWT carrega a URL publicada
        // COM a query string).
        expect(verificar).toHaveBeenCalledWith({
            signature: 'jws.valido.aqui',
            body: CORPO_CRU,
            url: URL_WEBHOOK,
        })
        // Rotação de chave sem quebra: as duas chaves vão para o Receiver.
        expect(receiverConstruido).toHaveBeenCalledWith({
            currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
            nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY,
        })
    })

    it('lança nomeando a variável quando QSTASH_NEXT_SIGNING_KEY está ausente', async () => {
        // Em produção o boot já morreu antes (env.ts); em dev, falha barulhenta
        // é melhor que default inseguro — que é justamente o que esta fase mata.
        vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', '')

        await expect(
            verificarAssinaturaQstash({
                assinatura: 'jws.valido.aqui',
                corpoCru: CORPO_CRU,
                url: URL_WEBHOOK,
            }),
        ).rejects.toThrow(/QSTASH_NEXT_SIGNING_KEY/)
    })
})
