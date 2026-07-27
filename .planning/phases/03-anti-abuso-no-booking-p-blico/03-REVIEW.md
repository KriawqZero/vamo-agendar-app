---
phase: 03-anti-abuso-no-booking-p-blico
reviewed: 2026-07-27T00:00:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - src/lib/rate-limit.ts
  - src/lib/__tests__/rate-limit.test.ts
  - src/lib/env.ts
  - src/lib/__tests__/env.test.ts
  - src/lib/observabilidade/log.ts
  - src/lib/observabilidade/__tests__/log.test.ts
  - src/app/actions/public-booking.ts
  - src/app/actions/__tests__/public-booking-validacao.test.ts
  - src/app/book/[slug]/BookingApp.tsx
  - src/app/book/[slug]/etapas/EtapaContato.tsx
  - src/app/book/[slug]/mensagens.ts
  - src/app/book/__tests__/mensagens.test.ts
  - src/app/book/__tests__/honeypot-campo.test.ts
  - docs/01-ARQUITETURA_E_STACK.md
  - docs/PENDENCIAS.md
findings:
  critical: 4
  warning: 9
  info: 3
  total: 16
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-07-27
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

> Convenção de severidade: `CR-` = **BLOCKER** (comportamento incorreto, vulnerabilidade
> ou risco de perda de disponibilidade — precisa ser resolvido antes de abrir ao público).
> `WR-` = **WARNING** (degrada qualidade, robustez ou veracidade da documentação).
> `IN-` = informativo.

## Summary

Revisão adversarial das quatro camadas de `slidingWindow`, do honeypot e da telemetria da
fase. O que foi verificado contra o código instalado, e não apenas contra o comentário:
`@upstash/ratelimit@2` de fato usa `try/finally` **sem** `catch` em `limit()`
(`node_modules/@upstash/ratelimit/dist/index.mjs:797-812`), então a assunção A1 do RESEARCH
se confirma e o `try/catch` local é o único tratador; `reason: 'timeout'` existe mesmo no
tipo `RatelimitResponseType` e é produzido pelo `Promise.race` do `applyTimeout`. O
fail-open funciona nos dois modos de falha, o no-op sem env é real, e as chaves enviadas ao
fornecedor terceiro são de fato hasheadas — nenhum valor cru de IP, telefone ou `org_id`
chega ao Redis, ao Sentry ou ao PostHog nos caminhos existentes.

O que **não** se sustenta é o outro lado: os quatro achados críticos estão todos no eixo
disponibilidade/robustez, e três deles se compõem entre si. A extração de IP confia na
primeira entrada de `x-forwarded-for` quando o próprio repositório já documenta em
`opcoes-sentry.ts` que a Railway envia `x-real-ip` em toda requisição (CR-01); o teto por
tenant conta **tentativas**, não criações, o que permite negar agendamento a um tenant
inteiro por uma hora com 30 requisições (CR-02); todo caminho de rejeição faz I/O de
terceiro **aguardado**, o que torna rejeitar mais caro que aceitar exatamente sob flood
(CR-03); e o balde `'desconhecido'` converte ausência do header em queda total do booking
público sem nenhum detector (CR-04).

Nenhum achado é sobre PII: nesse eixo a fase está sólida, com asserções negativas de
verdade. Os problemas são de calibragem de defesa e de custo do caminho de rejeição.

---

## Critical Issues (BLOCKER)

### CR-01: Extração de IP confia na primeira entrada de `x-forwarded-for`, com `x-real-ip` disponível e ignorado

**File:** `src/lib/rate-limit.ts:200-223`
**Issue:**
A primeira entrada de `x-forwarded-for` só é o cliente real se o edge **descartar** o header
enviado pelo cliente. Se ele apenas **anexa** (comportamento da maioria dos proxies), a
primeira entrada é o valor que o atacante escreveu. O comentário reconhece isso como
assunção A2 e se apoia em "fórum oficial, não doc formal" — mas o próprio repositório já
tem a informação mais forte escrita e verificada em outro módulo:

```
src/lib/observabilidade/opcoes-sentry.ts:71
// `x-real-ip` (que o Railway põe em toda requisição), `cf-connecting-ip` ...
```

`x-real-ip` é header de valor único posto pelo proxy — não é lista concatenável pelo
cliente, e por isso é estritamente mais difícil de forjar que a primeira posição do XFF.
Ele está disponível, está documentado no repo, e não é consultado aqui.

Consequência concreta se a assunção estiver errada:

1. `escrita_ip` e `leitura_ip` (metade das camadas da fase) são contornadas com um header;
2. `leitura_ip` é a **única** camada do caminho de leitura — ali não existe defesa em
   profundidade nenhuma, ao contrário do que o comentário afirma ("quem segura o ataque são
   as camadas de telefone e tenant", que não rodam em `obterSlotsPublicos`);
3. o custo de explorar o CR-02 abaixo cai a zero.

Não há tampouco validação de que o valor extraído se pareça com um IP: qualquer string vira
balde próprio.

**Fix:**

```ts
export async function ipDoVisitante(): Promise<string> {
    try {
        const cabecalhos = await headers()
        // Header de valor único posto pelo proxy — não é lista que o cliente
        // consiga estender. Preferido sobre XFF pela mesma razão do opcoes-sentry.ts.
        const real = cabecalhos.get('x-real-ip')?.trim()
        if (real && ehIpPlausivel(real)) return real

        // Fallback: com UM proxy confiável, o cliente real é a entrada MAIS À
        // DIREITA que o proxy anexou, não a primeira (que o cliente controla).
        const encaminhado = cabecalhos.get('x-forwarded-for')
        const partes = encaminhado?.split(',').map((p) => p.trim()).filter(Boolean) ?? []
        const candidato = partes.at(-1)
        if (candidato && ehIpPlausivel(candidato)) return candidato

        return 'desconhecido' // ver CR-04
    } catch {
        return 'desconhecido'
    }
}
```

Antes do go-live, validar por medição (custa um `curl` contra o deploy com
`X-Forwarded-For: 1.2.3.4` forjado e conferir qual valor chega) — a assunção A2 hoje é
crença, não medida, e é ela que sustenta duas das quatro camadas.

---

### CR-02: `teto_tenant` conta TENTATIVAS, não criações — 30 requisições negam agendamento a um tenant por uma hora

**File:** `src/app/actions/public-booking.ts:576-646`, `src/lib/rate-limit.ts:140-157`
**Issue:**
`limit()` é check-then-consume — o comentário de `escrita_telefone` (linhas 113-132) sabe
disso e calibra por causa disso. Mas a mesma propriedade não foi aplicada ao teto por
tenant, que é consumido:

- **antes** da consulta de serviço (linha 659), da engine de disponibilidade (675) e do
  INSERT (745) — ou seja, uma requisição com `servicoId` inválido gasta token;
- **em paralelo** com a camada de telefone (`Promise.all`, linha 576) — uma requisição já
  condenada pelo bloqueio de telefone **ainda assim** queima o token do tenant.

O resultado é um caminho barato de negação de serviço contra o Core Value do produto: 30
requisições com slug válido e `servicoId` lixo (ou com um telefone já queimado) esvaziam a
janela, e a partir daí **todo visitante legítimo daquele tenant recebe `muitas_tentativas`
por uma hora**. Com o CR-01 aberto, satisfazer a camada de IP (10/10 min) custa um header
forjado, então o ataque inteiro é 30 requisições de um único cliente.

Isso **não** é o risco documentado. O D-09 aceitou "não impedir o enchimento total do
horizonte"; o que existe aqui é o inverso — o atacante nega agendamentos sem criar nenhum.
E o próprio código descreve o comportamento errado:

```
src/lib/rate-limit.ts:140  // Teto por tenant (D-09) — 30 criações por hora, somadas TODAS as origens.
docs/01-ARQUITETURA_E_STACK.md  | `teto_tenant` | 30 / 1 h | ... |
```

São 30 **tentativas**, não 30 criações.

**Fix:** separar leitura de consumo. A lib expõe `getRemaining(identifier)`, que consulta
sem gastar token:

```ts
// ANTES do trabalho caro: só CONSULTA, não consome.
const { remaining } = await limiterTenant.getRemaining(chaveTenant)
if (remaining <= 0) { /* bloqueia + telemetria + Issue */ }

// ... resolve serviço, valida slot, INSERT ...

// DEPOIS da criação bem-sucedida: consome o token de uma criação REAL.
await verificarLimite('teto_tenant', [tenantId])
```

Mínimo aceitável, se `getRemaining` não for adotado: mover a checagem de tenant para depois
das validações de serviço e de slot, e **sequenciar** em relação à camada de telefone
(ver WR-02). Isso não fecha o vetor, mas eleva o custo do ataque de "30 requisições
quaisquer" para "30 requisições que passem por todas as validações".

---

### CR-03: O caminho de REJEIÇÃO faz I/O de terceiro aguardado — rejeitar custa mais que aceitar

**File:** `src/app/actions/public-booking.ts:411-425, 517-533, 589-604, 624-643, 997-1009`;
`src/lib/observabilidade/log.ts:210-225`; `src/lib/rate-limit.ts:245-271`
**Issue:**
Todo bloqueio e toda captura de honeypot fazem `await logOperacionalAguardando.warn(...)`,
que internamente faz `await Sentry.flush(2000)` — uma ida de rede ao Sentry **antes** de a
resposta voltar ao visitante. E o `teto_tenant` soma a isso um segundo flush
(`reportarFalhaSilenciosaAguardando`, linha 633). O PostHog é diferido por `after()`, então
não entra na latência, mas continua sendo um cliente novo + `capture` + `shutdown` por
evento (`src/lib/analytics/server.ts:19-41`).

Três consequências, todas do mesmo defeito:

1. **O limitador amplifica carga em vez de descartá-la.** Bloqueio em massa só acontece sob
   flood — que é justamente quando cada requisição rejeitada passa a segurar um slot do
   servidor esperando uma ida de rede a terceiro. Rejeitar ficou mais caro que aceitar.
2. **A cota de Sentry e de PostHog vira alvo.** Não há throttle, dedup nem amostragem: é
   um evento por requisição bloqueada, escolhido pelo atacante. O caminho do **honeypot** é
   o pior deles — ele nunca chama `verificarLimite` (comprovado pelo próprio teste,
   `public-booking-validacao.test.ts:710`), então é literalmente um endpoint sem teto que
   dispara um flush de Sentry e um evento de PostHog por requisição.
3. **O teto de latência declarado no mesmo módulo é falso.** `TIMEOUT_MS = 500`
   (`rate-limit.ts:53-59`) diz "a Fricção Zero não admite meio segundo de espera extra" — e
   na falha do fornecedor a espera real é 500 ms **mais** até 2000 ms de flush, **por
   camada**. `criarAgendamentoPublico` tem três checagens (uma sequencial + duas paralelas):
   pior caso ~5 s adicionados a um agendamento legítimo durante uma indisponibilidade do
   Redis, que é exatamente o cenário que o fail-open existe para tornar indolor.

**Fix:**

- No caminho de bloqueio, trocar a variante aguardada pela fire-and-forget embrulhada em
  `after()` (o mesmo mecanismo que o PostHog já usa) — a Server Action não termina o
  processo, ela responde e o runtime da Railway é Node de vida longa; o motivo original do
  `flush` (incidente 260724) era runtime que congela, não este caso.
- Limitar a emissão: logar só a **primeira** rejeição de cada janela por chave (o
  `RatelimitResponse` traz `remaining`/`reset`, dá para emitir apenas na transição) em vez
  de uma por requisição.
- Em `verificarLimite`, throttlar `ratelimit:redis_unavailable` para no máximo um reporte
  por N segundos por processo (um `let ultimoReporte = 0` em escopo de módulo resolve).
  Durante uma queda do Upstash, hoje sai uma Issue por checagem por requisição.

---

### CR-04: Balde `'desconhecido'` transforma header ausente em queda TOTAL do booking público, sem detector

**File:** `src/lib/rate-limit.ts:213-223`
**Issue:**
Quando o IP é indeterminável, todos os visitantes caem no **mesmo** balde. O comentário
justifica pelo ângulo do atacante ("esconder o IP não compra janela infinita") e não
considera o ângulo oposto, que é o de disponibilidade: se o header sumir por qualquer razão
de infraestrutura, o produto inteiro passa a ter **10 escritas por 10 minutos e 60 leituras
por minuto no total**, para todos os tenants somados.

Isso não é hipotético. `next start` acessado diretamente (sem proxy à frente) não recebe
`x-forwarded-for` — é exatamente a topologia usada nas medições de performance registradas
nos comentários deste mesmo repositório. Uma mudança de proxy, um health check interno ou
uma migração de plataforma produzem o mesmo estado. E como as duas variáveis do Upstash
agora são obrigatórias em produção (`src/lib/env.ts:57-58`), o no-op que antes seria a
válvula de escape deixou de existir: em produção as camadas estão sempre ligadas.

Agravante: **não há sinal nenhum**. Nada loga, nada reporta e nada mede "IP indeterminável".
O bloqueio resultante é indistinguível de tráfego real batendo no teto, e é a única
situação em toda a fase em que um problema de infraestrutura produz bloqueio — o oposto
declarado da postura fail-open do módulo (contrato 5 do cabeçalho).

**Fix:**

```ts
const ip = /* x-real-ip, depois XFF — ver CR-01 */
if (!ip) {
    // Fail-OPEN coerente com o contrato 5: infra quebrada nunca bloqueia agendamento.
    // Emitido uma vez por processo para não virar o próprio vetor de inundação.
    avisarUmaVezPorProcesso('ratelimit:ip_indeterminavel', { fluxo: 'rate_limit' })
    return null // e `verificarLimite` devolve PASSE quando a chave é nula
}
```

Se a decisão for manter o balde compartilhado (é defensável), então o detector é
obrigatório: uma Issue sintética única por processo quando o header estiver ausente. Sem
ela, o modo de falha mais caro da fase é também o mais silencioso.

---

## Warnings

### WR-01: `hashChaveRateLimit` é a terceira cópia literal do mesmo hash, sem separação de domínio, com fallback de salt silencioso

**File:** `src/lib/rate-limit.ts:194-197` (vs. `src/lib/analytics/tenant.ts:12-15` e
`src/lib/observabilidade/hash.ts:12-15`)
**Issue:** As três funções são byte a byte idênticas: `sha256(salt + valor)` truncado em 16
hex. Duas consequências:

1. `hashChaveRateLimit(tenantId) === hashTenantId(tenantId)`. A chave do contador
   `rl:escrita:tenant:<hash>` no Redis é **exatamente** o `tenantHash` publicado no Sentry e
   no PostHog. Quem vê um evento de telemetria consegue apontar o balde correspondente no
   store do fornecedor — correlação cruzada que a pseudonimização deveria justamente
   impedir.
2. `process.env.ANALYTICS_TENANT_SALT ?? ''`: sem salt, `sha256(telefone)` tem espaço de
   busca de ~10¹¹ (segundos de força bruta) e `sha256(IPv4)` de 2³². A degradação é total e
   **silenciosa** — nada avisa. Em produção o salt é obrigatório, mas o módulo cujo
   argumento inteiro é "a Upstash é fornecedor TERCEIRO" não deveria depender de outra lista
   para garantir a própria premissa.

**Fix:** um helper único com separação de domínio explícita e falha visível sem salt:

```ts
// src/lib/observabilidade/hash.ts
export function hashComSal(dominio: string, valor: string): string {
    const salt = process.env.ANALYTICS_TENANT_SALT
    if (!salt) avisarUmaVezPorProcesso('hash:sem_salt')
    return createHash('sha256').update(`${salt ?? ''}|${dominio}|${valor}`).digest('hex').slice(0, 16)
}
// rate-limit.ts: hashComSal('ratelimit:ip', ip) — nunca colide com hashTenantId.
```

---

### WR-02: `Promise.all` faz a camada de telefone e a de tenant se contaminarem

**File:** `src/app/actions/public-booking.ts:576-582`
**Issue:** O comentário justifica o paralelismo pela latência ("o cliente legítimo paga a
latência de UMA ida ao Redis"), mas o efeito colateral não foi considerado: como as duas
consomem token, uma requisição **bloqueada pelo telefone** já gastou o token do tenant antes
de a decisão existir. Um único telefone repetindo tentativas queima o orçamento do tenant
sem nunca criar nada — é o motor barato do CR-02.

**Fix:** sequenciar (telefone primeiro, que é a camada mais apertada e mais barata de
decidir), ou usar `getRemaining` para o tenant conforme o CR-02. O custo é uma ida a mais ao
Redis apenas no caminho já bloqueado, que é o caminho que deveria ser barato de qualquer
forma.

---

### WR-03: Bloqueio de LEITURA mostra cópia de falha de carregamento + botão que realimenta o limitador

**File:** `src/app/book/[slug]/mensagens.ts:134-139`; `src/app/book/[slug]/BookingApp.tsx:169`
**Issue:** `muitas_tentativas` na caixa de horários reusa `COPY_ERRO_SLOTS` ("Não foi
possível carregar os horários. Tente de novo.") acompanhada do botão "Tentar de novo", que
dispara `setTentativaSlots` e refaz a chamada bloqueada — consumindo outro token.

O racional do D-10 é "quem é barrado numa grade é script, e script não lê tela". Mas a fase
inteira argumenta o contrário em todo lugar: CGNAT de operadora faz **cliente real** dividir
IP, e foi por isso que o caminho de escrita ganhou cópia honesta própria
(`COPY_MUITAS_TENTATIVAS`). O leitor real barrado recebe uma informação falsa sobre a causa
e um convite explícito para insistir. A assimetria entre as duas superfícies não tem
justificativa de produto, só de economia de string.

**Fix:** rotear `muitas_tentativas` para `COPY_MUITAS_TENTATIVAS` também em
`COPIA_DA_CAIXA_DE_HORARIOS`, e desabilitar o botão de retry por alguns segundos quando o
motivo for esse. A cópia já existe — custa uma linha.

---

### WR-04: Asserção negativa do bloqueio de IP não cobre a variante de Issue que a fase usa

**File:** `src/app/actions/__tests__/public-booking-validacao.test.ts:395-400`
**Issue:** O teste "NÃO abre Sentry Issue" verifica `reportarExcecaoMock` e
`reportarFalhaSilenciosaMock`, mas **não** `reportarFalhaSilenciosaAguardandoMock` — que é
exatamente a variante que esta fase usa para abrir Issue (`ratelimit:teto_tenant_atingido`,
linha 633 da action). Acrescentar uma Issue ao caminho de bloqueio de IP manteria este teste
verde.

Os blocos de telefone (linha 480) e de leitura (linha 613) **fazem** essa asserção. O de IP
é o único fora do padrão — a lacuna está no primeiro caminho escrito, não nos posteriores.

**Fix:**

```ts
expect(reportarFalhaSilenciosaAguardandoMock).not.toHaveBeenCalled()
```

---

### WR-05: Honeypot depende do global `crypto.randomUUID()` sem import e sem versão de Node pinada

**File:** `src/app/actions/public-booking.ts:434`; `package.json` (sem `engines`, sem `.nvmrc`)
**Issue:** É a única ocorrência de `crypto.randomUUID` no `src/` inteiro, e usa o global —
disponível a partir do Node 19. O repositório declara `@types/node: ^20` mas **não** pina a
versão em `engines` nem em `.nvmrc` (registrado no próprio levantamento de stack: "versão
não pinada"). Num runtime mais antigo isso é `ReferenceError` → 500 — e 500 é precisamente a
resposta que faz o bot voltar, ou seja, a falha inverte o objetivo do honeypot no seu ponto
mais sensível. O comentário logo acima ("`new Date()` aqui não é preguiça, é o que impede a
armadilha de virar 500") mostra que o risco foi pensado para a data e não para o UUID.

**Fix:** `import { randomUUID } from 'node:crypto'` no topo do arquivo e usar `randomUUID()`;
adicionalmente, declarar `"engines": { "node": ">=20" }` no `package.json`.

---

### WR-06: A suíte do honeypot prova texto-fonte, não geometria — um campo visível passaria verde

**File:** `src/app/book/__tests__/honeypot-campo.test.ts:102-115`
**Issue:** As asserções são `String.includes` / regex sobre o arquivo lido do disco. A
invisibilidade depende de `-left-[9999px]`, um valor arbitrário do Tailwind v4 que precisa
ser **gerado**: se a classe não for emitida (mudança de `content`, o bloco migrar para um
arquivo fora do scan, um utilitário conflitante ganhar precedência), o resultado é um
`<input type="text">` vazio e **visível** no meio do formulário de contato — e todas as
asserções continuam passando, porque a string ainda está no fonte.

O mesmo vale para `aria-hidden` e `tabIndex`: o teste prova que o atributo está escrito, não
que ele tem efeito. A limitação é reconhecida no cabeçalho da suíte e o UAT manual está
registrado em `docs/PENDENCIAS.md`, o que é honesto — mas o modo de falha (campo visível em
produção) não tem sinal automatizado nenhum.

**Fix:** complementar com um teste de render (jsdom + `@testing-library/react`) que afirme
`getComputedStyle(input).position === 'absolute'` e `left` negativo, ou — mais barato e
suficiente — pinar a classe também no CSS gerado por um snapshot do build. Alternativa sem
dependência nova: trocar o valor arbitrário por um `style={{ position: 'absolute', left: '-9999px' }}`
inline, que não depende de geração de classe e continua sendo posicionamento (não supressão).

---

### WR-07: A allowlist "fechada" do log valida CHAVE, nunca VALOR

**File:** `src/lib/observabilidade/log.ts:30-58, 122-140`
**Issue:** `sanitizarAtributosLog` filtra por nome de chave. `chaveHash` e `camada` aceitam
qualquer string — inclusive um IP cru, se um chamador futuro esquecer de hashear. O
invariante nunca-PII neste caminho é, portanto, **convenção de chamador**, não estrutura,
apesar de o JSDoc do campo afirmar "a allowlist fechada é o que garante isso" (linha 36). O
teste de log (`log.test.ts:139-159`) prova que a chave `ip` é descartada, mas não que o
**valor** de `chaveHash` tem forma de hash.

**Fix:** validar a forma no ponto de sanitização — é barato e transforma a garantia em
estrutural:

```ts
if (chave === 'chaveHash' && !/^[0-9a-f]{16}$/.test(String(valor))) continue
```

---

### WR-08: Três afirmações da documentação nova não correspondem ao código

**File:** `docs/01-ARQUITETURA_E_STACK.md` (seção "Anti-abuso do booking público")
**Issue:**

1. *"Fail-open com teto de ~500 ms"* — falso. O caminho de falha aguarda adicionalmente
   `Sentry.flush(2000)` por camada (ver CR-03). O teto real é ~2,5 s por camada.
2. *Tabela: `teto_tenant` | 30 / 1 h*, e no código "30 **criações** por hora" — a
   implementação conta **tentativas** (ver CR-02). A diferença é a que separa "risco aceito
   de enchimento de agenda" de "negação de agendamento a custo de 30 requisições".
3. *Justificativa de `obterDadosBookingPublico` ficar fora do teto*: "O custo de deixá-la
   aberta é baixo e conhecido: uma requisição por VISITA (o page load), contra dezenas de
   consultas de grade na mesma sessão" (`public-booking.ts:837-841`). Essa contagem assume
   comportamento de navegador — precisamente o que o modelo de ameaça rejeita em todo o
   resto do arquivo ("qualquer um lê o id da Server Action no bundle e chama com o payload
   que quiser", linha 942). Um script chama a action num laço: quatro consultas com cliente
   privilegiado por requisição, sem teto algum. O argumento de **UX** (bloqueio viraria 404)
   continua correto e é suficiente para a decisão; o argumento de **custo** não.

**Fix:** corrigir as três frases. A decisão de deixar `obterDadosBookingPublico` aberta pode
permanecer — mas registrada como risco residual medido pelo eixo certo, não como custo
baixo.

---

### WR-09: `verificarLimite` não valida `partesChave` — chave vazia vira balde global

**File:** `src/lib/rate-limit.ts:236-243`
**Issue:** `partesChave.map(hashChaveRateLimit).join(':')` aceita `[]` (chave vazia) e
`['']` (hash de string vazia). Nos dois casos, todos os chamadores daquela camada passam a
dividir um único balde. O tipo `string[]` não impede array vazio, e `tenantId` vem do banco
— um `tenant_id` vazio numa linha basta para o `teto_tenant` de todos os tenants colapsar
num contador só.

**Fix:**

```ts
if (partesChave.length === 0 || partesChave.some((p) => !p?.trim())) return true // fail-open
```

---

## Info

### IN-01: `console.error` por slug não resolvido contradiz o comentário do mesmo arquivo

**File:** `src/app/actions/public-booking.ts:1021`
**Issue:** `console.error('Slug público não resolvido ao buscar horários:', resolvido.motivo)`
loga uma linha por slug inválido vindo de visitante anônimo. Sessenta linhas acima, o
comentário da mesma função declara a regra oposta: "Nada do que chega aqui é logado nem
reportado ... logar cada uma seria transformar o mesmo endpoint num vetor de inundação de
log" (linhas 957-959). A linha é anterior a esta fase, mas a fase acrescentou o racional que
a contradiz — e com o CR-01 aberto, o teto de leitura não a limita de verdade.
**Fix:** remover a linha ou trocá-la por `logOperacional` com amostragem.

### IN-02: `MENSAGENS_LOG` exportado como `Record<string, string>` mutável

**File:** `src/lib/observabilidade/log.ts:64`
**Issue:** Qualquer módulo pode reescrever uma frase de log em runtime. Sem impacto hoje;
`as const` + `satisfies Record<string, string>` (ou `Object.freeze`) elimina a categoria.

### IN-03: Honeypot ecoa `dataHora` de volta sem validar

**File:** `src/app/actions/public-booking.ts:435-437`
**Issue:** O sucesso falso devolve o `dataHora` recebido verbatim, e `BookingApp` o passa a
`formatarDataHoraLonga` (linha 428). Para o bot é irrelevante. Para o falso-positivo que o
próprio D-07 nomeia como pior desfecho (autofill preenchendo o campo de uma pessoa real), a
tela pode exibir "Invalid Date" numa confirmação — o que ao menos daria sintoma, mas por
acidente. Vale registrar junto do item de UAT do honeypot já aberto em `PENDENCIAS.md`.

---

_Reviewed: 2026-07-27_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
