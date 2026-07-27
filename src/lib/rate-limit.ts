/**
 * Rate limit das superfícies PÚBLICAS do booking (visitante sem sessão).
 *
 * Contrato deste módulo, nesta ordem — mesmo formato de
 * `observabilidade/reportar.ts` e `observabilidade/log.ts`:
 *
 * 1. NUNCA lança. Guarda de abuso que derruba a requisição inverte o próprio
 *    propósito: quem paga a conta é o cliente final que só queria agendar.
 * 2. NO-OP sem env (`UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`), com
 *    aviso único de console fora de produção e de teste (D-04). Em PRODUÇÃO
 *    este caminho não existe: as duas variáveis entram na lista de obrigatórias
 *    de `src/lib/env.ts` e o boot cai sem elas — rate limiter silenciosamente
 *    desligado em produção é exatamente o falso-verde que o projeto já pagou
 *    caro para eliminar.
 * 3. A chave NUNCA recebe valor cru. IP e telefone são dado pessoal, e a Upstash
 *    é fornecedor TERCEIRO: `rl:escrita:ip:203.0.113.7` seria dado pessoal
 *    armazenado fora do Supabase. Toda parte de chave passa por
 *    `hashChaveRateLimit` (mesma forma de `observabilidade/hash.ts`) — invariante
 *    nunca-PII do projeto, que vale para todo store, não só para telemetria (D-11).
 * 4. O algoritmo é `slidingWindow` em TODAS as camadas (exigência do ROADMAP):
 *    janela fixa deixa passar o dobro do limite na virada de janela, que é
 *    justamente o instante que um script encontra sozinho.
 * 5. FAIL-OPEN com reporte quando o fornecedor falha (D-02/D-03). Os dois modos
 *    de falha têm tratamentos diferentes e ambos são necessários: Redis LENTO é
 *    coberto pelo `timeout` nativo da lib (resolve `success: true` com
 *    `reason: 'timeout'`), e erro de rede/credencial REJEITA a Promise — medido
 *    no fonte instalado (`limit()` é `try/finally` sem `catch`, então a rejeição
 *    do cliente Redis sobe intacta), o que confirma a assunção A1 do RESEARCH.
 *
 * É o ÚNICO ponto do código que conhece `@upstash/*`. As actions consomem
 * `verificarLimite`, uma função de domínio — é o que mantém a troca de backend
 * (reversibilidade "costly" do D-01) localizada num arquivo só.
 */

import { createHash } from 'node:crypto'
import { headers } from 'next/headers'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { reportarFalhaSilenciosaAguardando } from './observabilidade/reportar'

/**
 * As quatro camadas do desenho da fase, declaradas de uma vez.
 *
 * As TRÊS de escrita já têm limiter real (`escrita_ip` no 03-01, `escrita_telefone`
 * e `teto_tenant` aqui); `leitura_ip` devolve passe até o plano 03-04 instanciá-la.
 * Camada sem instância é PASSE — nunca bloqueio acidental.
 */
export type CamadaRateLimit = 'escrita_ip' | 'escrita_telefone' | 'teto_tenant' | 'leitura_ip'

/**
 * Teto de latência da checagem antes de liberar a requisição (D-03).
 *
 * Upstash saudável responde em poucos milissegundos — 500 ms já é anomalia, e a
 * Fricção Zero não admite meio segundo de espera extra para o cliente final por
 * causa de uma guarda que existe para barrar script.
 */
const TIMEOUT_MS = 500

const urlDoRedis = process.env.UPSTASH_REDIS_REST_URL
const tokenDoRedis = process.env.UPSTASH_REDIS_REST_TOKEN

/**
 * Instanciado em ESCOPO DE MÓDULO de propósito, nunca dentro do handler: o
 * `ephemeralCache` default da lib (um `Map` em memória) só bloqueia reincidente
 * sem ida ao Redis enquanto o objeto sobrevive entre requisições — e o processo
 * do Railway é Node de vida longa (`next start`). Criar o limiter por chamada
 * mataria o cache e transformaria cada tentativa de flood num comando pago.
 */
const redis =
    urlDoRedis && tokenDoRedis ? new Redis({ url: urlDoRedis, token: tokenDoRedis }) : null

if (!redis && process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
    // Aviso ÚNICO, no load: sem as duas variáveis o rate limit inteiro está em
    // no-op. Em dev isso é o comportamento desejado (D-04/D-05: não consumir a
    // janela de um database compartilhado com produção), mas precisa ser visível
    // — desligado em silêncio é indistinguível de funcionando.
    console.warn(
        '[rate-limit] UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN ausentes: rate limit em NO-OP (toda requisição passa).',
    )
}

/**
 * Limiters por camada. `Partial` de propósito: camada sem entrada aqui devolve
 * PASSE em `verificarLimite`, que é o estado correto tanto no no-op de dev
 * quanto na camada de leitura, ainda não implementada.
 *
 * As três camadas de escrita têm papéis DIFERENTES e é por isso que existem
 * três, e não uma calibrada no meio: IP é o filtro folgado que barra o script
 * ingênuo sem punir CGNAT; telefone é o filtro apertado que impede encher a
 * agenda com um número só; o teto de tenant é o desacelerador do ataque que já
 * derrotou os outros dois rotacionando IP e telefone.
 */
const LIMITERS: Partial<Record<CamadaRateLimit, Ratelimit>> = redis
    ? {
          // 10 requisições por 10 minutos, por IP. Constante de CALIBRAÇÃO
          // deliberadamente folgada: CGNAT de operadora móvel faz clientes
          // distintos dividirem o mesmo IP, e um salão que divulgou o link
          // recebe rajada legítima. IP é a camada mais frouxa das três — quem
          // aperta de verdade são as duas abaixo.
          // `analytics` fica no default (false): o CONTEXT veda a flag da
          // Upstash como substituto do D-11, e ligá-la custaria comandos extras
          // no Redis mais a obrigação de aguardar o `pending`.
          escrita_ip: new Ratelimit({
              redis,
              limiter: Ratelimit.slidingWindow(10, '10 m'),
              prefix: 'rl:escrita:ip',
              timeout: TIMEOUT_MS,
          }),

          // ⚠️ CONVERSÃO DO D-08, escrita aqui porque o número no código não é
          // o número da decisão — e a diferença entre os dois é uma escolha,
          // não um descuido.
          //
          // O D-08 diz "~3 agendamentos por hora" por telefone. `limit()` é
          // check-then-consume: o token é gasto na TENTATIVA, antes de o
          // agendamento existir, e `slidingWindow` não tem refund. O caso que a
          // decisão protege — mãe agendando três serviços com o mesmo número —
          // gasta 4 tokens se UMA das tentativas perder a corrida de
          // double-booking e for repetida. Com 3, a terceira criança ficaria de
          // fora por causa de uma colisão de horário.
          //
          // 5 tentativas/h é a implementação do "~3 agendamentos/h" com a margem
          // que o "~" da decisão explicitamente autoriza. É constante de
          // CALIBRAÇÃO, reversível: mexer aqui não muda nenhum contrato.
          //
          // A chave é telefone + tenant (composta em `verificarLimite`): o mesmo
          // número agendando em dois estabelecimentos são dois baldes, senão a
          // cliente fiel de dois salões seria barrada por usar o produto como
          // esperado.
          escrita_telefone: new Ratelimit({
              redis,
              limiter: Ratelimit.slidingWindow(5, '1 h'),
              prefix: 'rl:escrita:tel',
              timeout: TIMEOUT_MS,
          }),

          // Teto por tenant (D-09) — 30 criações por hora, somadas TODAS as
          // origens. O papel dele é explicitamente parcial e está declarado
          // assim no CONTEXT: não impede o enchimento total do horizonte de um
          // tenant pequeno, DESACELERA o ataque distribuído (IPs e telefones
          // rotativos, que derrotam as duas camadas acima) o bastante para a
          // Issue do D-12 dar tempo de reação humana. O enchimento total é risco
          // ACEITO pelo owner, desde que exista o detector.
          //
          // 30/h é folgado para o perfil real do produto (profissional autônomo
          // e pequena empresa): um salão que criasse 30 agendamentos numa hora
          // pelo link público estaria tendo um dia excepcional, e é justamente
          // por isso que o estouro merece alarme em vez de silêncio.
          teto_tenant: new Ratelimit({
              redis,
              limiter: Ratelimit.slidingWindow(30, '1 h'),
              prefix: 'rl:escrita:tenant',
              timeout: TIMEOUT_MS,
          }),
      }
    : {}

/**
 * Pseudonimiza uma parte de chave antes de ela virar chave no store de um
 * fornecedor terceiro.
 *
 * Mesma forma EXATA de `hashAgendamentoId` (sha256 + `ANALYTICS_TENANT_SALT` +
 * hex truncado a 16) — hash artesanal diferente por módulo é como o invariante
 * nunca-PII se perde. Custa microssegundos e não muda o comportamento do limite:
 * o hash é determinístico, então o mesmo IP cai sempre no mesmo balde.
 */
export function hashChaveRateLimit(valor: string): string {
    const salt = process.env.ANALYTICS_TENANT_SALT ?? ''
    return createHash('sha256').update(`${salt}${valor}`).digest('hex').slice(0, 16)
}

/**
 * IP do visitante atrás do proxy da Railway.
 *
 * A PRIMEIRA entrada de `x-forwarded-for` é o cliente real: o edge da Railway
 * descarta o header enviado pelo cliente e anexa o IP de conexão. ⚠️ A fonte
 * dessa garantia é fórum oficial, não doc formal (assunção A2 do RESEARCH) — se
 * o header for forjável, um script rotaciona a chave de IP de graça e quem
 * segura o ataque são as camadas de telefone e tenant. Defesa em camadas existe
 * exatamente para essa possibilidade.
 *
 * IP indeterminável vira balde PRÓPRIO (`'desconhecido'`), nunca exceção: todos
 * os "sem IP" dividem uma janela só, então esconder o IP não compra janela
 * infinita. `headers()` é assíncrona no Next 16.
 */
export async function ipDoVisitante(): Promise<string> {
    try {
        const cabecalhos = await headers()
        const encaminhado = cabecalhos.get('x-forwarded-for')
        const ip = encaminhado?.split(',')[0]?.trim()
        return ip && ip.length > 0 ? ip : 'desconhecido'
    } catch {
        // Contrato 1: fora de contexto de requisição, o balde comum resolve.
        return 'desconhecido'
    }
}

/**
 * Consulta a camada indicada. `true` = PASSA, `false` = BLOQUEADO.
 *
 * `true` cobre três situações que o chamador não precisa distinguir e não deve
 * tentar: passou dentro da janela, no-op por falta de env, e fail-open por falha
 * do fornecedor. A única resposta que muda o fluxo do booking é o `false`.
 *
 * `partesChave` recebe os valores CRUS (IP, telefone, tenant) e a
 * pseudonimização acontece aqui dentro — assim nenhum chamador consegue esquecer
 * de hashear, que é a única forma de o contrato 3 ser violado.
 */
export async function verificarLimite(
    camada: CamadaRateLimit,
    partesChave: string[],
): Promise<boolean> {
    const limiter = LIMITERS[camada]
    if (!limiter) return true

    const chave = partesChave.map(hashChaveRateLimit).join(':')

    try {
        const resultado = await limiter.limit(chave)

        if (resultado.reason === 'timeout') {
            // Redis lento: a lib já LIBEROU a requisição (`success: true`), e o
            // que resta é não deixar a degradação passar despercebida.
            await reportarFalhaSilenciosaAguardando('ratelimit:redis_unavailable', {
                fluxo: 'rate_limit',
                camada,
                motivo: 'timeout',
            })
        }

        return resultado.success
    } catch {
        // Rejeição rápida (rede, credencial inválida, endpoint fora do ar):
        // mesmo destino do timeout. Indisponibilidade de fornecedor NUNCA
        // derruba o booking (D-02) — o Core Value do projeto é o agendamento
        // real chegando à agenda, e uma guarda de abuso não pode ser o que o
        // impede.
        await reportarFalhaSilenciosaAguardando('ratelimit:redis_unavailable', {
            fluxo: 'rate_limit',
            camada,
            motivo: 'erro',
        })
        return true
    }
}
