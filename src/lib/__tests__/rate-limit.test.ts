/**
 * Suíte HERMÉTICA do módulo de rate limit — sem rede, sem Redis, sem Upstash.
 *
 * O que ela pina, e por que cada um importa:
 *
 * - NO-OP sem env (D-04): dev sem as variáveis do Upstash não pode ter o fluxo
 *   público quebrado nem bloqueado por engano.
 * - Bloqueio real: `success: false` da lib vira `false` aqui — é o único retorno
 *   que muda o fluxo do booking.
 * - FAIL-OPEN nos DOIS modos de falha do fornecedor (D-02/D-03), que é o ponto
 *   mais fácil de implementar pela metade: rejeição rápida (rede/credencial) e
 *   `reason: 'timeout'`. Nos dois casos a requisição PASSA e a falha vira Issue
 *   sintética ESTÁTICA — mensagem interpolada estilhaçaria o agrupamento do
 *   Sentry (baseline da quick task 260724).
 * - Chave pseudonimizada (D-11): o valor cru do IP não pode aparecer no
 *   argumento que vai ao store do fornecedor terceiro. Asserção NEGATIVA, que é
 *   a única forma de provar ausência.
 *
 * As env vars são variadas por caso, então cada bloco recarrega o módulo
 * (`vi.resetModules()` + import dinâmico): a decisão no-op x real acontece no
 * LOAD, em escopo de módulo, e stub de env depois do import não a alcança.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Import de TIPO apenas (apagado na compilação): não carrega o módulo real e
// por isso não quebra a recarga por caso feita com `import()` dinâmico.
import type { CamadaRateLimit } from '@/lib/rate-limit'

const { limitMock, reportarMock, reportarSincronoMock, headersMock, configsCriadas } = vi.hoisted(
    () => ({
        limitMock: vi.fn(),
        reportarMock: vi.fn(async () => {}),
        reportarSincronoMock: vi.fn(),
        headersMock: vi.fn(),
        /**
         * Configuração de CADA limiter instanciado no load do módulo. É o que
         * torna as constantes de calibração (janela, tokens, prefixo, timeout)
         * verificáveis sem exportar os limiters — número de calibração que
         * ninguém consegue ler de fora é número que muda sozinho na próxima
         * edição.
         */
        configsCriadas: [] as Array<{
            prefix: string
            timeout: number
            limiter: { algoritmo: string; tokens: number; janela: string }
        }>,
    }),
)

vi.mock('@upstash/ratelimit', () => ({
    Ratelimit: class RatelimitFake {
        static slidingWindow(tokens: number, janela: string) {
            return { algoritmo: 'slidingWindow', tokens, janela }
        }
        config: { prefix: string }
        constructor(config: { prefix: string }) {
            this.config = config
            configsCriadas.push(config as unknown as (typeof configsCriadas)[number])
        }
        // O prefixo viaja como SEGUNDO argumento para que a suíte prove qual
        // limiter atendeu a chamada — com um mock só compartilhado entre as
        // camadas, sem isto "consultou o Redis" e "consultou a camada certa"
        // seriam indistinguíveis.
        limit = (chave: string) => limitMock(chave, this.config.prefix)
    },
}))

vi.mock('@upstash/redis', () => ({
    Redis: class RedisFake {
        config: unknown
        constructor(config: unknown) {
            this.config = config
        }
    },
}))

vi.mock('next/headers', () => ({ headers: headersMock }))

vi.mock('@/lib/observabilidade/reportar', () => ({
    reportarFalhaSilenciosaAguardando: reportarMock,
    // Variante SÍNCRONA: é a do detector de IP indeterminável (CR-04), que é
    // sinal de estado emitido uma vez por processo — nunca vale segurar a
    // resposta do visitante por ele.
    reportarFalhaSilenciosa: reportarSincronoMock,
}))

/** IP de fixture — nunca pode aparecer cru no argumento enviado ao Redis. */
const IP_FIXTURE = '203.0.113.7'
/** Telefone e tenant de fixture — mesma exigência de ausência do IP. */
const TELEFONE_FIXTURE = '5567999998888'
const TENANT_FIXTURE = 'org_teste_123'

/**
 * Recarrega o módulo com ou sem as credenciais do Upstash. String vazia é
 * suficiente para o caminho no-op (o guard é por valor falsy) e evita depender
 * de remoção de variável do ambiente real.
 */
async function carregarModulo(comCredenciais: boolean) {
    vi.resetModules()
    configsCriadas.length = 0
    vi.stubEnv('UPSTASH_REDIS_REST_URL', comCredenciais ? 'https://redis-de-teste.local' : '')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', comCredenciais ? 'token-de-teste' : '')
    return import('@/lib/rate-limit')
}

beforeEach(() => {
    limitMock.mockReset()
    reportarMock.mockReset()
    reportarSincronoMock.mockReset()
    headersMock.mockReset()
})

afterEach(() => {
    vi.unstubAllEnvs()
})

describe('verificarLimite — no-op sem credenciais do Upstash (D-04)', () => {
    it('devolve PASSE e não consulta o fornecedor', async () => {
        const { verificarLimite } = await carregarModulo(false)

        await expect(verificarLimite('escrita_ip', [IP_FIXTURE])).resolves.toBe(true)
        // A prova de que é no-op de verdade, e não "passou por acaso": nenhum
        // comando foi enviado ao Redis.
        expect(limitMock).not.toHaveBeenCalled()
    })

    it('devolve PASSE para camada declarada sem limiter próprio', async () => {
        const { verificarLimite } = await carregarModulo(true)

        // As QUATRO camadas do desenho já têm limiter (a de leitura entrou no
        // 03-04), então a garantia "camada sem instância é PASSE, nunca bloqueio
        // acidental" só continua verificável com um nome fora do mapa. Ela é o
        // que protege um plano futuro que declare uma camada em
        // `CamadaRateLimit` antes de instanciá-la.
        await expect(
            verificarLimite('camada_futura' as CamadaRateLimit, [IP_FIXTURE]),
        ).resolves.toBe(true)
        expect(limitMock).not.toHaveBeenCalled()
    })

    it('devolve PASSE nas camadas de telefone e tenant sem credenciais', async () => {
        const { verificarLimite } = await carregarModulo(false)

        // No-op vale para as TRÊS camadas de escrita, não só para a primeira:
        // dev sem Upstash não pode ter o booking barrado por camada nova.
        await expect(
            verificarLimite('escrita_telefone', [TELEFONE_FIXTURE, TENANT_FIXTURE]),
        ).resolves.toBe(true)
        await expect(verificarLimite('teto_tenant', [TENANT_FIXTURE])).resolves.toBe(true)
        expect(limitMock).not.toHaveBeenCalled()
    })
})

describe('verificarLimite — decisão do fornecedor', () => {
    it('BLOQUEIA quando a janela estourou (success: false)', async () => {
        const { verificarLimite } = await carregarModulo(true)
        limitMock.mockResolvedValue({ success: false, remaining: 0 })

        await expect(verificarLimite('escrita_ip', [IP_FIXTURE])).resolves.toBe(false)
        expect(limitMock).toHaveBeenCalledTimes(1)
        // Bloqueio é condição ESPERADA de negócio: nada de Sentry Issue, senão
        // a fila de erro vira o log de acesso do endpoint público.
        expect(reportarMock).not.toHaveBeenCalled()
    })

    it('PASSA dentro da janela sem reportar nada', async () => {
        const { verificarLimite } = await carregarModulo(true)
        limitMock.mockResolvedValue({ success: true, remaining: 9 })

        await expect(verificarLimite('escrita_ip', [IP_FIXTURE])).resolves.toBe(true)
        expect(reportarMock).not.toHaveBeenCalled()
    })
})

describe('verificarLimite — fail-open nos dois modos de falha (D-02/D-03)', () => {
    it('PASSA quando limit() REJEITA (rede/credencial) e reporta a Issue sintética', async () => {
        const { verificarLimite } = await carregarModulo(true)
        limitMock.mockRejectedValue(new Error('fetch failed'))

        await expect(verificarLimite('escrita_ip', [IP_FIXTURE])).resolves.toBe(true)

        expect(reportarMock).toHaveBeenCalledTimes(1)
        expect(reportarMock).toHaveBeenCalledWith('ratelimit:redis_unavailable', {
            fluxo: 'rate_limit',
            camada: 'escrita_ip',
            motivo: 'erro',
        })
    })

    it('PASSA quando a lib libera por TIMEOUT e reporta a MESMA Issue sintética', async () => {
        const { verificarLimite } = await carregarModulo(true)
        limitMock.mockResolvedValue({ success: true, reason: 'timeout', remaining: 0 })

        await expect(verificarLimite('escrita_ip', [IP_FIXTURE])).resolves.toBe(true)

        expect(reportarMock).toHaveBeenCalledTimes(1)
        // Rótulo IDÊNTICO ao da rejeição: é o mesmo problema (o fornecedor não
        // respondeu) e agrupar junto é o desenho. A distinção vive no `motivo`,
        // que é contexto, não mensagem.
        expect(reportarMock).toHaveBeenCalledWith('ratelimit:redis_unavailable', {
            fluxo: 'rate_limit',
            camada: 'escrita_ip',
            motivo: 'timeout',
        })
    })
})

describe('verificarLimite — invariante nunca-PII na chave (D-11)', () => {
    it('não envia o valor cru da chave ao fornecedor', async () => {
        const { verificarLimite, hashChaveRateLimit } = await carregarModulo(true)
        limitMock.mockResolvedValue({ success: true, remaining: 9 })

        await verificarLimite('escrita_ip', [IP_FIXTURE])

        const chaveEnviada = String(limitMock.mock.calls[0]?.[0] ?? '')
        // Asserção NEGATIVA: a única forma de provar ausência. A Upstash é
        // fornecedor terceiro — chave crua ali seria dado pessoal fora do
        // Supabase.
        expect(chaveEnviada).not.toContain(IP_FIXTURE)
        expect(chaveEnviada).toBe(hashChaveRateLimit(IP_FIXTURE))
    })

    it('hasheia cada parte separadamente e une por ":"', async () => {
        const { verificarLimite, hashChaveRateLimit } = await carregarModulo(true)
        limitMock.mockResolvedValue({ success: true, remaining: 9 })

        await verificarLimite('escrita_telefone', [TELEFONE_FIXTURE, TENANT_FIXTURE])

        const composta = [
            hashChaveRateLimit(TELEFONE_FIXTURE),
            hashChaveRateLimit(TENANT_FIXTURE),
        ].join(':')
        // A chave composta é o que de fato viaja ao fornecedor, e nenhuma das
        // duas partes cruas sobrevive nela. Telefone é PII de cliente final que
        // nunca fez cadastro — é o pior valor possível para deixar num store de
        // terceiro.
        expect(limitMock).toHaveBeenCalledWith(composta, 'rl:escrita:tel')
        expect(composta).not.toContain(TELEFONE_FIXTURE)
        expect(composta).not.toContain(TENANT_FIXTURE)
        expect(composta.split(':')).toHaveLength(2)
    })
})

describe('camada escrita_telefone — anti ench-agenda com número único (D-08)', () => {
    it('usa slidingWindow de 5 tentativas por hora no prefixo rl:escrita:tel', async () => {
        await carregarModulo(true)

        const config = configsCriadas.find((c) => c.prefix === 'rl:escrita:tel')
        expect(config).toBeDefined()
        // 5, e não 3: `limit()` consome o token na TENTATIVA (check-then-consume,
        // sem refund), então a família que perde uma corrida de double-booking e
        // re-tenta já gastou 4. É a implementação do "~3 agendamentos/h" do D-08
        // com a margem que o "~" autoriza (Pitfall 4 do RESEARCH).
        expect(config?.limiter).toEqual({ algoritmo: 'slidingWindow', tokens: 5, janela: '1 h' })
        expect(config?.timeout).toBe(500)
    })

    it('consulta o limiter de telefone com a chave composta telefone+tenant', async () => {
        const { verificarLimite, hashChaveRateLimit } = await carregarModulo(true)
        limitMock.mockResolvedValue({ success: true, remaining: 4 })

        await verificarLimite('escrita_telefone', [TELEFONE_FIXTURE, TENANT_FIXTURE])

        // O tenant entra na chave de propósito: o mesmo telefone agendando em
        // DOIS estabelecimentos diferentes são dois baldes, senão a cliente fiel
        // de dois salões seria barrada por usar o produto como esperado.
        expect(limitMock).toHaveBeenCalledWith(
            `${hashChaveRateLimit(TELEFONE_FIXTURE)}:${hashChaveRateLimit(TENANT_FIXTURE)}`,
            'rl:escrita:tel',
        )
    })

    it('BLOQUEIA quando a janela do telefone estourou, sem abrir Issue', async () => {
        const { verificarLimite } = await carregarModulo(true)
        limitMock.mockResolvedValue({ success: false, remaining: 0 })

        await expect(
            verificarLimite('escrita_telefone', [TELEFONE_FIXTURE, TENANT_FIXTURE]),
        ).resolves.toBe(false)
        expect(reportarMock).not.toHaveBeenCalled()
    })

    it('PASSA com Issue sintética quando o fornecedor REJEITA (fail-open, D-02)', async () => {
        const { verificarLimite } = await carregarModulo(true)
        limitMock.mockRejectedValue(new Error('fetch failed'))

        await expect(
            verificarLimite('escrita_telefone', [TELEFONE_FIXTURE, TENANT_FIXTURE]),
        ).resolves.toBe(true)
        expect(reportarMock).toHaveBeenCalledWith('ratelimit:redis_unavailable', {
            fluxo: 'rate_limit',
            camada: 'escrita_telefone',
            motivo: 'erro',
        })
    })
})

describe('camada teto_tenant — desacelerador do ataque distribuído (D-09)', () => {
    it('usa slidingWindow de 30 criações por hora no prefixo rl:escrita:tenant', async () => {
        await carregarModulo(true)

        const config = configsCriadas.find((c) => c.prefix === 'rl:escrita:tenant')
        expect(config).toBeDefined()
        // O teto NÃO impede o enchimento total do horizonte — desacelera o
        // ataque o bastante para a Issue do D-12 dar tempo de reação humana.
        expect(config?.limiter).toEqual({ algoritmo: 'slidingWindow', tokens: 30, janela: '1 h' })
        expect(config?.timeout).toBe(500)
    })

    it('consulta o limiter de tenant com a chave de UM elemento', async () => {
        const { verificarLimite, hashChaveRateLimit } = await carregarModulo(true)
        limitMock.mockResolvedValue({ success: true, remaining: 29 })

        await verificarLimite('teto_tenant', [TENANT_FIXTURE])

        expect(limitMock).toHaveBeenCalledWith(
            hashChaveRateLimit(TENANT_FIXTURE),
            'rl:escrita:tenant',
        )
        const chaveEnviada = String(limitMock.mock.calls[0]?.[0] ?? '')
        expect(chaveEnviada).not.toContain(TENANT_FIXTURE)
    })

    it('BLOQUEIA quando o teto do tenant estourou', async () => {
        const { verificarLimite } = await carregarModulo(true)
        limitMock.mockResolvedValue({ success: false, remaining: 0 })

        await expect(verificarLimite('teto_tenant', [TENANT_FIXTURE])).resolves.toBe(false)
        // A Issue do teto (D-12) é responsabilidade da AÇÃO, não do módulo: aqui
        // o bloqueio é decisão pura, e o módulo só abre Issue quando o
        // FORNECEDOR falha. Misturar os dois papéis faria a Issue de ataque
        // aparecer também no caminho de leitura, onde ela não significa nada.
        expect(reportarMock).not.toHaveBeenCalled()
    })

    it('PASSA com Issue sintética quando a lib libera por TIMEOUT (fail-open, D-03)', async () => {
        const { verificarLimite } = await carregarModulo(true)
        limitMock.mockResolvedValue({ success: true, reason: 'timeout', remaining: 0 })

        await expect(verificarLimite('teto_tenant', [TENANT_FIXTURE])).resolves.toBe(true)
        expect(reportarMock).toHaveBeenCalledWith('ratelimit:redis_unavailable', {
            fluxo: 'rate_limit',
            camada: 'teto_tenant',
            motivo: 'timeout',
        })
    })
})

describe('camada leitura_ip — teto folgado da grade de slots (D-06/D-10)', () => {
    it('usa slidingWindow de 60 leituras por minuto no prefixo rl:leitura:ip', async () => {
        await carregarModulo(true)

        const config = configsCriadas.find((c) => c.prefix === 'rl:leitura:ip')
        expect(config).toBeDefined()
        // O número é BEM folgado de propósito e a folga é o requisito, não o
        // efeito colateral: um cliente legítimo navegando o calendário dispara
        // dezenas de chamadas de slots em poucos minutos, e CGNAT de operadora
        // móvel soma clientes distintos no mesmo IP. Errar para o folgado só
        // reduz proteção; errar para o apertado adiciona fricção, que a regra de
        // ouro do produto proíbe (ABU-02).
        expect(config?.limiter).toEqual({ algoritmo: 'slidingWindow', tokens: 60, janela: '1 m' })
        expect(config?.timeout).toBe(500)
    })

    it('consulta o limiter de leitura com o IP hasheado, nunca cru', async () => {
        const { verificarLimite, hashChaveRateLimit } = await carregarModulo(true)
        limitMock.mockResolvedValue({ success: true, remaining: 59 })

        await expect(verificarLimite('leitura_ip', [IP_FIXTURE])).resolves.toBe(true)

        expect(limitMock).toHaveBeenCalledWith(hashChaveRateLimit(IP_FIXTURE), 'rl:leitura:ip')
        const chaveEnviada = String(limitMock.mock.calls[0]?.[0] ?? '')
        expect(chaveEnviada).not.toContain(IP_FIXTURE)
    })

    it('BLOQUEIA quando a janela de leitura estourou, sem abrir Issue', async () => {
        const { verificarLimite } = await carregarModulo(true)
        limitMock.mockResolvedValue({ success: false, remaining: 0 })

        await expect(verificarLimite('leitura_ip', [IP_FIXTURE])).resolves.toBe(false)
        // Mesma natureza dos outros bloqueios de rotina: o alarme do Sentry
        // continua reservado ao teto por tenant e à falha do fornecedor.
        expect(reportarMock).not.toHaveBeenCalled()
    })

    it('PASSA com Issue sintética quando o fornecedor REJEITA (fail-open, D-02)', async () => {
        const { verificarLimite } = await carregarModulo(true)
        limitMock.mockRejectedValue(new Error('fetch failed'))

        await expect(verificarLimite('leitura_ip', [IP_FIXTURE])).resolves.toBe(true)
        expect(reportarMock).toHaveBeenCalledWith('ratelimit:redis_unavailable', {
            fluxo: 'rate_limit',
            camada: 'leitura_ip',
            motivo: 'erro',
        })
    })

    it('devolve PASSE sem credenciais do Upstash (no-op, D-04)', async () => {
        const { verificarLimite } = await carregarModulo(false)

        await expect(verificarLimite('leitura_ip', [IP_FIXTURE])).resolves.toBe(true)
        expect(limitMock).not.toHaveBeenCalled()
    })
})

/** Monta um `headers()` falso a partir de um mapa nome → valor. */
function cabecalhos(mapa: Record<string, string>) {
    return { get: (nome: string) => mapa[nome] ?? null }
}

describe('ipDoVisitante', () => {
    it('PREFERE x-real-ip, que o cliente não consegue estender (CR-01)', async () => {
        const { ipDoVisitante } = await carregarModulo(true)
        // O XFF traz um valor forjado na primeira posição — exatamente o ataque
        // que a leitura antiga (`split(',')[0]`) entregava de graça.
        headersMock.mockResolvedValue(
            cabecalhos({
                'x-real-ip': IP_FIXTURE,
                'x-forwarded-for': '1.2.3.4, 198.51.100.9',
            }),
        )

        await expect(ipDoVisitante()).resolves.toBe(IP_FIXTURE)
    })

    it('sem x-real-ip, usa a ÚLTIMA entrada de x-forwarded-for — a que o proxy anexou', async () => {
        const { ipDoVisitante } = await carregarModulo(true)
        headersMock.mockResolvedValue(
            cabecalhos({ 'x-forwarded-for': `1.2.3.4, 198.51.100.9, ${IP_FIXTURE}` }),
        )

        // A primeira entrada é texto do CLIENTE quando o proxy apenas anexa em
        // vez de descartar; a última é a única que o proxy escreveu.
        await expect(ipDoVisitante()).resolves.toBe(IP_FIXTURE)
    })

    it('aceita IP com porta e IPv6 entre colchetes', async () => {
        const { ipDoVisitante } = await carregarModulo(true)

        headersMock.mockResolvedValue(cabecalhos({ 'x-real-ip': `${IP_FIXTURE}:54321` }))
        await expect(ipDoVisitante()).resolves.toBe(IP_FIXTURE)

        headersMock.mockResolvedValue(cabecalhos({ 'x-real-ip': '[2001:db8::1]:443' }))
        await expect(ipDoVisitante()).resolves.toBe('2001:db8::1')
    })

    it('recusa valor sem forma de IP — string arbitrária não vira balde próprio', async () => {
        const { ipDoVisitante } = await carregarModulo(true)
        // Sem esta recusa, `x-real-ip: <string aleatória>` compraria uma janela
        // nova por requisição e a camada deixaria de contar IPs.
        headersMock.mockResolvedValue(
            cabecalhos({ 'x-real-ip': 'nao-sou-um-ip', 'x-forwarded-for': '999.999.999.999' }),
        )

        await expect(ipDoVisitante()).resolves.toBeNull()
    })

    it('não cai para a penúltima entrada do XFF quando a última é lixo', async () => {
        const { ipDoVisitante } = await carregarModulo(true)
        // Cair para a penúltima devolveria a escolha do balde ao atacante, que
        // controla tudo o que está à esquerda do que o proxy anexou.
        headersMock.mockResolvedValue(
            cabecalhos({ 'x-forwarded-for': `${IP_FIXTURE}, lixo-forjado` }),
        )

        await expect(ipDoVisitante()).resolves.toBeNull()
    })

    it('devolve null quando o header não existe — nunca lança, nunca balde comum (CR-04)', async () => {
        const { ipDoVisitante } = await carregarModulo(true)
        headersMock.mockResolvedValue({ get: () => null })

        // O balde `'desconhecido'` anterior somava TODOS os visitantes de TODOS
        // os tenants num contador só: header ausente por qualquer razão de infra
        // derrubava o booking público inteiro, sem sinal nenhum.
        await expect(ipDoVisitante()).resolves.toBeNull()
    })

    it('abre Issue sintética UMA vez por processo quando o IP é indeterminável (CR-04)', async () => {
        const { ipDoVisitante } = await carregarModulo(true)
        headersMock.mockResolvedValue({ get: () => null })

        await ipDoVisitante()
        await ipDoVisitante()
        await ipDoVisitante()

        // O detector é obrigatório (sem ele, "a infra parou de mandar o header"
        // é indistinguível de "ninguém acessou") mas não pode virar o próprio
        // vetor de inundação — daí uma emissão por processo, e só.
        expect(reportarSincronoMock).toHaveBeenCalledTimes(1)
        expect(reportarSincronoMock).toHaveBeenCalledWith('ratelimit:ip_indeterminavel', {
            fluxo: 'rate_limit',
        })
    })

    it('devolve null quando headers() lança (fora de requisição), sem reportar', async () => {
        const { ipDoVisitante } = await carregarModulo(true)
        headersMock.mockRejectedValue(new Error('fora de contexto de requisição'))

        await expect(ipDoVisitante()).resolves.toBeNull()
        // Job interno ou teste rodando fora de requisição não é incidente.
        expect(reportarSincronoMock).not.toHaveBeenCalled()
    })
})

describe('verificarLimite — chave que não se consegue formar é PASSE (CR-04/WR-09)', () => {
    it('devolve PASSE sem consultar o fornecedor quando o IP é null', async () => {
        const { verificarLimite } = await carregarModulo(true)

        await expect(verificarLimite('escrita_ip', [null])).resolves.toBe(true)
        expect(limitMock).not.toHaveBeenCalled()
    })

    it('devolve PASSE para lista VAZIA e para parte em branco', async () => {
        const { verificarLimite } = await carregarModulo(true)

        // `[]` e `['']` formavam uma chave que TODOS os chamadores da camada
        // dividiam — um `tenant_id` vazio numa linha bastava para o teto de
        // todos os tenants colapsar num contador só.
        await expect(verificarLimite('teto_tenant', [])).resolves.toBe(true)
        await expect(verificarLimite('teto_tenant', [''])).resolves.toBe(true)
        await expect(verificarLimite('teto_tenant', ['   '])).resolves.toBe(true)
        await expect(
            verificarLimite('escrita_telefone', [TELEFONE_FIXTURE, undefined]),
        ).resolves.toBe(true)
        expect(limitMock).not.toHaveBeenCalled()
    })
})
