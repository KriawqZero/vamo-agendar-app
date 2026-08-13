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

import { headers } from 'next/headers'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { emitirDepoisDaResposta } from './observabilidade/apos-resposta'
import { permitirEmissao, permitirUmaVezPorProcesso } from './observabilidade/emissao'
import { hashComSal } from './observabilidade/hash'
import {
    reportarFalhaSilenciosa,
    reportarFalhaSilenciosaAguardando,
} from './observabilidade/reportar'

/**
 * As quatro camadas do desenho da fase — todas com limiter real desde o 03-04
 * (`escrita_ip` no 03-01, `escrita_telefone` e `teto_tenant` no 03-03,
 * `leitura_ip` aqui).
 *
 * A regra que continua valendo para quem acrescentar a quinta: camada declarada
 * neste tipo mas SEM entrada em `LIMITERS` devolve PASSE, nunca bloqueio
 * acidental.
 */
export type CamadaRateLimit =
    'escrita_ip' | 'escrita_telefone' | 'escrita_email' | 'teto_tenant' | 'leitura_ip'

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
 * PASSE em `verificarLimite`, que é o estado correto no no-op de dev e o padrão
 * seguro para qualquer camada declarada antes de existir.
 *
 * As três camadas de escrita têm papéis DIFERENTES e é por isso que existem
 * três, e não uma calibrada no meio: IP é o filtro folgado que barra o script
 * ingênuo sem punir CGNAT; telefone é o filtro apertado que impede encher a
 * agenda com um número só; o teto de tenant é o desacelerador do ataque que já
 * derrotou os outros dois rotacionando IP e telefone. A quarta protege o outro
 * eixo: LEITURA, onde o abuso não lota a agenda, martela o banco.
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

          // Gêmeo do `escrita_telefone` para o eixo aberto pela Phase 5, quando o
          // telefone virou opcional. Sem ele, `escrita_telefone` era simplesmente
          // PULADO no caminho só-e-mail (não havia chave), e o booking ficava com
          // duas camadas onde o caminho com WhatsApp tem três.
          //
          // A assimetria não era só de contagem. A Phase 5 plugou nesse caminho o
          // envio de e-mail transacional PARA O ENDEREÇO QUE O VISITANTE DIGITOU,
          // com nome de exibição controlado por ele, a partir de um domínio
          // verificado COMPARTILHADO por todos os tenants. Sem teto por endereço,
          // o booking público vira relay: marcações de spam e hard bounces
          // derrubam a reputação do remetente e, com ela, todo o e-mail
          // transacional de todos os tenants — inclusive as boas-vindas da Phase 4.
          // Verificação de posse (OTP) está fora de questão pela Fricção Zero, o
          // que faz do teto a única defesa disponível neste eixo.
          //
          // Mesma janela do telefone, pela mesma razão do D-08: o token é gasto na
          // TENTATIVA, e o cliente que perde uma corrida de double-booking repete.
          // Chave é e-mail normalizado + tenant, espelhando a composta do telefone.
          escrita_email: new Ratelimit({
              redis,
              limiter: Ratelimit.slidingWindow(5, '1 h'),
              prefix: 'rl:escrita:email',
              timeout: TIMEOUT_MS,
          }),

          // Teto por tenant (D-09) — 30 CRIAÇÕES por hora, somadas TODAS as
          // origens. "Criações" é literal desde o CR-02 da revisão: esta camada
          // é a única consultada por `verificarLimiteSemConsumir` antes do
          // trabalho e consumida só DEPOIS do INSERT bem-sucedido. Antes ela
          // contava TENTATIVAS, e 30 requisições com `servicoId` lixo negavam
          // agendamento a um tenant inteiro por uma hora — o atacante bloqueava
          // a agenda sem criar nada, que é o inverso do risco que o D-09 aceitou.
          //
          // O papel dele é explicitamente parcial e está declarado
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

          // Teto de LEITURA por IP — 60 consultas de grade por minuto. É o mais
          // folgado de todos os quatro, e a folga é o REQUISITO, não uma
          // concessão: um cliente legítimo escolhendo horário navega dias no
          // calendário e cada troca de data dispara uma consulta de slots; um
          // CGNAT de operadora móvel soma clientes distintos no mesmo IP; e a
          // regra de ouro do produto (Fricção Zero, ABU-02) proíbe que a defesa
          // seja sentida por quem só queria agendar.
          //
          // Por isso o erro assimétrico está escolhido de propósito: calibrar
          // folgado demais só REDUZ proteção contra o script; calibrar apertado
          // demais ADICIONA fricção a cliente real, que é o dano irreversível.
          // Quem 60/min barra de verdade é quem não lê tela — o script que
          // varre a grade inteira do horizonte para mapear a agenda (D-10).
          //
          // Constante de CALIBRAÇÃO (A6), reversível: mexer aqui não muda
          // contrato nenhum. O número certo só se conhece com tráfego real, e
          // essa verificação está registrada como backstop do plano.
          leitura_ip: new Ratelimit({
              redis,
              limiter: Ratelimit.slidingWindow(60, '1 m'),
              prefix: 'rl:leitura:ip',
              timeout: TIMEOUT_MS,
          }),
      }
    : {}

/**
 * Domínio de hash deste módulo. Ver `hashComSal`: é o que impede a chave do
 * contador no Redis de coincidir com o `tenantHash` publicado na telemetria.
 */
const DOMINIO_HASH = 'ratelimit'

/**
 * Pseudonimiza uma parte de chave antes de ela virar chave no store de um
 * fornecedor terceiro.
 *
 * Delega ao helper único de `observabilidade/hash.ts` — hash artesanal diferente
 * por módulo é como o invariante nunca-PII se perde, e três cópias literais da
 * mesma expressão foram o que produziu o WR-01. Custa microssegundos e não muda
 * o comportamento do limite: o hash é determinístico, então o mesmo IP cai
 * sempre no mesmo balde.
 *
 * ⚠️ `hashChaveRateLimit(tenantId) !== hashTenantId(tenantId)`, e a diferença é
 * o ponto: antes eram o MESMO valor, e quem via um evento de telemetria
 * conseguia apontar o balde correspondente no Redis da Upstash.
 */
export function hashChaveRateLimit(valor: string): string {
    return hashComSal(DOMINIO_HASH, valor)
}

/** IPv4 pontuado, sem validar a faixa de cada octeto (isso é o `.every` abaixo). */
const FORMATO_IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/

/**
 * O texto tem FORMA de endereço IP?
 *
 * Não é validação canônica e não precisa ser: o objetivo é impedir que uma
 * string arbitrária escolhida pelo atacante vire balde próprio no Redis. Sem
 * isto, `x-forwarded-for: qualquer-coisa-aleatoria` compra uma janela nova a
 * cada requisição — a camada de IP deixa de contar IPs e passa a contar
 * strings.
 */
function ehIpPlausivel(valor: string): boolean {
    // 45 = maior IPv6 textual possível (IPv4-mapped com máscara).
    if (valor.length === 0 || valor.length > 45) return false
    if (FORMATO_IPV4.test(valor)) {
        return valor.split('.').every((octeto) => Number(octeto) <= 255)
    }
    // IPv6: hexadecimal com pelo menos um `:`. A forma exata não importa aqui,
    // só o fato de o conjunto de caracteres ser fechado.
    return valor.includes(':') && /^[0-9a-f:.]+$/i.test(valor)
}

/**
 * Normaliza uma entrada de header de IP e devolve `null` se ela não parecer um
 * endereço. Cobre as duas formas com porta que proxies escrevem na prática:
 * `[2001:db8::1]:443` e `203.0.113.7:54321`.
 */
function normalizarIp(bruto: string | null | undefined): string | null {
    let ip = bruto?.trim() ?? ''
    if (!ip) return null

    const comColchetes = /^\[([^\]]+)\](?::\d+)?$/.exec(ip)
    if (comColchetes) {
        ip = comColchetes[1]
    } else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip)) {
        ip = ip.slice(0, ip.indexOf(':'))
    }

    return ehIpPlausivel(ip) ? ip : null
}

/**
 * IP do visitante atrás do proxy da Railway.
 *
 * ⚠️ A ORDEM DAS FONTES É A DEFESA, e ela mudou por medida de risco (CR-01 da
 * revisão da fase). Antes esta função lia a PRIMEIRA entrada de
 * `x-forwarded-for`, apoiada na assunção A2 do RESEARCH ("o edge descarta o
 * header do cliente e anexa o IP de conexão") — assunção cuja fonte era fórum
 * oficial, não doc formal. Se o proxy apenas ANEXA em vez de descartar
 * (comportamento da maioria), a primeira entrada é o valor que o atacante
 * escreveu, e duas das quatro camadas da fase caem com um header forjado.
 *
 * 1. `x-real-ip` primeiro. É header de valor ÚNICO posto pelo proxy — não é
 *    lista que o cliente consiga estender —, e o próprio repositório já
 *    documenta e verifica que a Railway o põe em toda requisição (ver a
 *    allowlist de headers em `observabilidade/sanitizacao.ts`).
 * 2. `x-forwarded-for` como fallback, lendo a entrada MAIS À DIREITA e só ela:
 *    com um proxy confiável na frente, a última entrada é a que ele anexou; as
 *    anteriores são texto do cliente. Cair para a penúltima quando a última é
 *    lixo devolveria o controle ao atacante, então lixo na última = sem IP.
 * 3. Toda candidata passa por `normalizarIp`: string que não tem forma de IP
 *    nunca vira balde.
 *
 * ⚠️ IP indeterminável devolve `null`, NUNCA um balde compartilhado (CR-04). O
 * balde `'desconhecido'` anterior tinha um modo de falha que ninguém mediu: se o
 * header sumisse por qualquer razão de infraestrutura — `next start` sem proxy
 * na frente, health check interno, troca de plataforma —, TODOS os visitantes de
 * TODOS os tenants passavam a dividir 10 escritas por 10 min e 60 leituras por
 * min. Um problema de infra virava queda total do booking público, sem nenhum
 * sinal, que é o oposto exato do contrato 5 deste módulo.
 *
 * `null` significa "não sei", e `verificarLimite` responde PASSE a uma chave que
 * não sabe formar. Esconder o IP não compra nada extra, porque quem já tinha IP
 * continua contado e as camadas de telefone e tenant seguem valendo no caminho
 * de escrita. O que se perde é proteção; o que se ganha é não derrubar o produto
 * por causa de um header. `headers()` é assíncrona no Next 16.
 */
export async function ipDoVisitante(): Promise<string | null> {
    try {
        const cabecalhos = await headers()

        const real = normalizarIp(cabecalhos.get('x-real-ip'))
        if (real) return real

        const partes = cabecalhos.get('x-forwarded-for')?.split(',') ?? []
        const anexadoPeloProxy = normalizarIp(partes.at(-1))
        if (anexadoPeloProxy) return anexadoPeloProxy

        avisarIpIndeterminavel()
        return null
    } catch {
        // Contrato 1: fora de contexto de requisição (job, teste), não há IP e
        // não há incidente — nada a reportar.
        return null
    }
}

/**
 * O detector que faltava (CR-04): sem ele, "a infra parou de mandar o header" é
 * indistinguível de "ninguém acessou", e a camada de IP fica desligada em
 * silêncio.
 *
 * Uma vez por processo e nunca mais: é um sinal de ESTADO, não um evento por
 * requisição — repetir só transformaria o próprio detector no vetor de inundação
 * que o CR-03 descreve.
 */
function avisarIpIndeterminavel(): void {
    if (!permitirUmaVezPorProcesso('ratelimit:ip_indeterminavel')) return

    console.warn(
        '[rate-limit] IP do visitante indeterminável (x-real-ip e x-forwarded-for ausentes ou malformados): as camadas por IP estão em PASSE.',
    )
    reportarFalhaSilenciosa('ratelimit:ip_indeterminavel', { fluxo: 'rate_limit' })
}

/**
 * Monta a chave pseudonimizada, ou `null` quando ela não se deixa formar.
 *
 * ⚠️ Parte AUSENTE (`null`, `undefined`, vazia ou só espaços) e lista vazia
 * devolvem `null`, e quem recebe `null` responde PASSE (CR-04/WR-09). Sem esta
 * guarda, `[]` e `['']` produziam uma chave que TODOS os chamadores daquela
 * camada dividiam: um `tenant_id` vazio numa linha bastaria para o `teto_tenant`
 * de todos os tenants colapsar num contador só, e um IP indeterminável faria o
 * mesmo com o booking inteiro. "Não sei formar a chave" é caso de fail-open,
 * igual a "o fornecedor não respondeu" — nunca de bloqueio.
 */
function montarChave(partesChave: Array<string | null | undefined>): string | null {
    if (partesChave.length === 0) return null
    if (partesChave.some((parte) => !parte?.trim())) return null

    return partesChave.map((parte) => hashChaveRateLimit(parte as string)).join(':')
}

/** Marcador de "o fornecedor não respondeu dentro do teto". */
const TEMPO_ESGOTADO = Symbol('rate-limit:timeout')

/**
 * Janela mínima entre dois reportes de indisponibilidade do fornecedor, POR
 * CAMADA e por processo.
 *
 * Sem ela, uma queda do Upstash produzia uma Issue por checagem por requisição —
 * três por tentativa de agendamento. O sinal que o owner precisa é "o Redis está
 * fora", e ele chega inteiro na primeira; as outras milhares só queimam cota
 * justamente durante o incidente (CR-03).
 */
const INTERVALO_INDISPONIBILIDADE_MS = 60_000

/**
 * Reporta a indisponibilidade do fornecedor com entrega garantida (`flush`), mas
 * DEPOIS da resposta e no máximo uma vez por minuto por camada.
 *
 * O `emitirDepoisDaResposta` é o que devolve verdade ao `TIMEOUT_MS` declarado no
 * topo deste arquivo: com o flush aguardado em linha, a espera real numa falha do
 * fornecedor era 500 ms MAIS até 2000 ms de flush, por camada — pior caso ~5 s
 * somados a um agendamento legítimo durante uma queda do Redis, que é exatamente
 * o cenário que o fail-open existe para tornar indolor.
 */
function reportarIndisponibilidade(camada: CamadaRateLimit, motivo: 'timeout' | 'erro'): void {
    if (!permitirEmissao(`ratelimit:redis_unavailable:${camada}`, INTERVALO_INDISPONIBILIDADE_MS)) {
        return
    }

    emitirDepoisDaResposta(() =>
        reportarFalhaSilenciosaAguardando('ratelimit:redis_unavailable', {
            fluxo: 'rate_limit',
            camada,
            motivo,
        }),
    )
}

/**
 * Aplica o teto de `TIMEOUT_MS` a uma promessa do fornecedor.
 *
 * Existe porque `limit()` traz timeout nativo e `getRemaining()` NÃO traz —
 * medido no fonte instalado (`applyTimeout` só embrulha o `limit`). Sem isto, a
 * consulta sem consumo do CR-02 seria o único ponto do módulo sem teto de
 * latência, justamente numa fase cujo argumento inteiro é que meio segundo de
 * espera extra já é inaceitável para o cliente final.
 */
async function comTeto<T>(promessa: Promise<T>): Promise<T | typeof TEMPO_ESGOTADO> {
    let cronometro: ReturnType<typeof setTimeout> | undefined
    try {
        return await Promise.race([
            promessa,
            new Promise<typeof TEMPO_ESGOTADO>((resolve) => {
                cronometro = setTimeout(() => resolve(TEMPO_ESGOTADO), TIMEOUT_MS)
            }),
        ])
    } finally {
        if (cronometro) clearTimeout(cronometro)
    }
}

/**
 * Consulta a camada indicada CONSUMINDO um token. `true` = PASSA, `false` =
 * BLOQUEADO.
 *
 * `true` cobre três situações que o chamador não precisa distinguir e não deve
 * tentar: passou dentro da janela, no-op por falta de env, e fail-open por falha
 * do fornecedor. A única resposta que muda o fluxo do booking é o `false`.
 *
 * `partesChave` recebe os valores CRUS (IP, telefone, tenant) e a
 * pseudonimização acontece aqui dentro — assim nenhum chamador consegue esquecer
 * de hashear, que é a única forma de o contrato 3 ser violado.
 *
 * ⚠️ É CHECK-THEN-CONSUME: o token é gasto na TENTATIVA, não no resultado. Onde
 * essa diferença importa (o teto por tenant), use `verificarLimiteSemConsumir`
 * para decidir e chame esta função só depois do fato consumado.
 */
export async function verificarLimite(
    camada: CamadaRateLimit,
    partesChave: Array<string | null | undefined>,
): Promise<boolean> {
    const limiter = LIMITERS[camada]
    if (!limiter) return true

    const chave = montarChave(partesChave)
    if (chave === null) return true

    try {
        const resultado = await limiter.limit(chave)

        if (resultado.reason === 'timeout') {
            // Redis lento: a lib já LIBEROU a requisição (`success: true`), e o
            // que resta é não deixar a degradação passar despercebida.
            reportarIndisponibilidade(camada, 'timeout')
        }

        return resultado.success
    } catch {
        // Rejeição rápida (rede, credencial inválida, endpoint fora do ar):
        // mesmo destino do timeout. Indisponibilidade de fornecedor NUNCA
        // derruba o booking (D-02) — o Core Value do projeto é o agendamento
        // real chegando à agenda, e uma guarda de abuso não pode ser o que o
        // impede.
        reportarIndisponibilidade(camada, 'erro')
        return true
    }
}

/**
 * Consulta a camada SEM consumir token. `true` = ainda tem orçamento, `false` =
 * esgotado.
 *
 * ⚠️ Existe por causa do CR-02, e o defeito que ela corrige merece estar escrito
 * aqui: `limit()` é check-then-consume, então usar a mesma função para DECIDIR e
 * para CONTAR fazia o teto por tenant contar tentativas em vez de criações. O
 * efeito concreto era um caminho barato de negação de serviço contra o Core
 * Value do produto — 30 requisições com `servicoId` lixo (ou com um telefone já
 * queimado, que ainda assim queimava o token do tenant no `Promise.all`)
 * esvaziavam a janela, e a partir dali todo visitante legítimo daquele tenant
 * recebia `muitas_tentativas` por uma hora. O atacante negava agendamentos sem
 * criar nenhum, que é o inverso do risco aceito no D-09.
 *
 * Separar leitura de consumo é o que devolve o significado ao número: aqui só se
 * pergunta, e o token sai quando um agendamento REAL entra na agenda.
 *
 * Mesmo contrato de sempre: nunca lança, PASSE no no-op, PASSE na chave que não
 * se forma e PASSE quando o fornecedor falha.
 */
export async function verificarLimiteSemConsumir(
    camada: CamadaRateLimit,
    partesChave: Array<string | null | undefined>,
): Promise<boolean> {
    const limiter = LIMITERS[camada]
    if (!limiter) return true

    const chave = montarChave(partesChave)
    if (chave === null) return true

    try {
        const resultado = await comTeto(limiter.getRemaining(chave))

        if (resultado === TEMPO_ESGOTADO) {
            reportarIndisponibilidade(camada, 'timeout')
            return true
        }

        return resultado.remaining > 0
    } catch {
        reportarIndisponibilidade(camada, 'erro')
        return true
    }
}
