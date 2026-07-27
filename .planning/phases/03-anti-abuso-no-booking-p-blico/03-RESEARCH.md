# Phase 3: Anti-abuso no booking público - Research

**Researched:** 2026-07-27
**Domain:** Rate limiting em camadas (Upstash Redis REST) + honeypot em Server Actions públicas do Next.js 16
**Confidence:** HIGH (código do projeto medido diretamente) / MEDIUM (API da lib via docs oficiais) / LOW (comportamento do proxy da Railway)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Backend do contador

- **D-01:** Upstash Redis com `@upstash/ratelimit` (`slidingWindow`). A decisão pendente
  do owner registrada no ROADMAP foi tomada nesta discussão: Redis vence a RPC atômica no
  Postgres porque contador de abuso em endpoint anônimo não deve competir pelo orçamento
  de escrita do Supabase Free (o atacante decidiria quantos writes o banco gasta), a lib
  traz `slidingWindow` pronto via HTTP/REST, e o fornecedor já está contratado (mesma
  conta do QStash). A alternativa RPC/Postgres deve ser **documentada como não escolhida**
  (exigência do ROADMAP: "escolher um e desprovisionar ou documentar o outro").
  — **Reversibility:** costly.
- **D-02:** fail-open com reporte quando o Redis falhar (erro ou timeout): a requisição
  passa sem contar e a falha vira Sentry Issue sintética (ex.:
  `ratelimit:redis_unavailable`) pelas variantes **aguardadas**
  (`reportarFalhaSilenciosaAguardando`). Coerente com Fricção Zero e com o precedente da
  Phase 01 (WR-07): permissivo na disponibilidade. Indisponibilidade do fornecedor nunca
  derruba o booking. — **Reversibility:** reversible.
- **D-03:** teto de latência de **~500 ms** na checagem antes de desistir e liberar
  (fail-open); timeout conta como falha e é reportado como em D-02. Upstash saudável
  responde em poucos ms — 500 ms já é anomalia. — **Reversibility:** reversible.
- **D-04:** as env vars do Redis entram na lista de **obrigatórias em produção** de
  `src/lib/env.ts` (boot cai sem elas, como as outras treze). Em dev, ausência = rate
  limit **no-op com aviso claro** no console. Rate limiter silenciosamente desligado em
  produção é o falso-verde que o projeto já pagou para eliminar. ⚠️ Amplia a janela de
  crash-loop registrada nos Blockers do STATE — provisionar antes do deploy.
  — **Reversibility:** reversible.
- **D-05:** **databases separados** para prod e dev na Upstash (isolamento físico dos
  contadores; teste em dev nunca consome janela de tenant real). Se o plano da Upstash
  cobrar por database extra, dev opera em no-op (D-04) em vez de pagar.
  — **Reversibility:** reversible.

#### Superfícies e resposta ao bloqueio

- **D-06:** escrita protegida pelas três camadas compostas; leituras protegidas apenas
  por teto de IP **bem folgado** — um cliente legítimo navegando o calendário gera
  dezenas de chamadas de `obterSlotsPublicos` em minutos e **nunca** pode esbarrar no
  limite (SC2). — **Reversibility:** reversible.
- **D-07:** escrita barrada devolve **erro honesto**: discriminante novo
  `muitas_tentativas` no padrão de retorno discriminado existente + copy amigável em
  `src/app/book/[slug]/mensagens.ts` (tom: "Muitas tentativas seguidas. Aguarde um
  instante e tente de novo."). Sucesso falso é **exclusivo do honeypot**: no rate limit a
  certeza de bot é menor (CGNAT de operadora móvel faz clientes distintos dividirem IP), e
  sucesso falso para uma pessoa real = ela acha que agendou e não agendou — o pior desfecho
  para a confiança no produto. — **Reversibility:** reversible.
- **D-08:** camada do telefone: **~3 agendamentos por hora** (sliding window de 1h) do
  mesmo telefone normalizado no mesmo tenant. Acomoda o caso família (mãe agendando para
  si e filhos com o mesmo número em minutos) e barra ench-agenda com número único.
  — **Reversibility:** reversible — é constante de calibração.
- **D-09:** teto por tenant: **~30 agendamentos criados por hora** somando todas as
  origens. Não impede o enchimento total do horizonte — **desacelera** o ataque
  distribuído (telefones e IPs rotativos) o bastante para a visibilidade do ABU-03 dar
  tempo de reação humana. — **Reversibility:** reversible — constante de calibração.
- **D-10:** leitura barrada mostra a **caixa de erro existente** da Phase 01 ("Não foi
  possível carregar os horários. Tente de novo.") — zero copy nova, comportamento já
  testado, e quem é barrado de verdade é script que não lê tela.
  — **Reversibility:** reversible.

#### Visibilidade do owner (ABU-03)

- **D-11:** bloqueios aparecem nos pilares existentes, sem UI nova: `logOperacional`
  (warn, código sintético estático, ex.: `ratelimit:bloqueio`, com camada e chave
  **pseudonimizada** nos atributos da allowlist) para investigação, + evento PostHog para
  taxa agregada por tenant. Telefone e IP são dado pessoal: **nunca** entram crus em
  telemetria — hash com salt, padrão `tenantHash` existente (invariante do projeto, não
  foi re-discutido). — **Reversibility:** reversible.
- **D-12:** estouro do **teto por tenant** escala para Sentry Issue acionável com
  mensagem sintética estática (ex.: `ratelimit:teto_tenant_atingido`), variante aguardada,
  tenant só como `tenantHash`. Bloqueios por IP/telefone são rotina e ficam só em
  log+PostHog — a Issue é reservada ao sinal raro de ataque real em andamento.
  — **Reversibility:** reversible.

### Claude's Discretion

- **Honeypot** (área não selecionada para discussão — seguir as notas do ROADMAP):
  campo invisível no formulário público, **sucesso falso** na captura (bot que recebe
  sucesso vai embora; bot que recebe erro tenta de novo), nenhum agendamento criado,
  nenhum WhatsApp/lembrete disparado, nenhum cliente gravado. Visibilidade segue o padrão
  de D-11 (código próprio, ex.: `honeypot:captura`). Detalhes de implementação (nome do
  campo, CSS de ocultação, acessibilidade — leitores de tela não podem anunciá-lo) são do
  planner/executor.
- Janelas e valores exatos da camada de IP (escrita) e do teto de leitura por IP —
  calibrar com a nota do ROADMAP (salão movimentado divulgando o link recebe rajada
  legítima; CGNAT faz clientes dividirem IP — IP é a camada mais **folgada** das três).
- Obtenção do IP real atrás do proxy (Railway/`x-forwarded-for`) e comportamento quando o
  IP não é determinável (tratar como chave própria, nunca crashar).
- Nomes exatos das env vars, dos códigos sintéticos e das chaves no Redis; config fina da
  lib (`analytics` flag da Upstash é opcional e não substitui D-11).
- Forma dos testes: unitários com mock da lib; se houver prova de integração, respeitar a
  regra viva (suíte que toca serviço externo é opt-in, fora do `pnpm test` hermético).

### Deferred Ideas (OUT OF SCOPE)

- **Mostrar ao profissional (tenant B2B) os bloqueios da própria página pública** — tela
  nova de dashboard, capacidade nova fora do escopo; se virar requisito, candidata a fase
  futura de autonomia/transparência do profissional.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ABU-01 | Script repetindo requisições não consegue lotar a agenda de um profissional | Três camadas de `slidingWindow` sobre `criarAgendamentoPublico` + teto de leitura por IP + honeypot com sucesso falso (§Architecture Patterns). A metade "pela Data API" do SC1 já está fechada pela Phase 1 (INSERT `anon` revogado, 42501 medido) — a action é o único caminho de escrita |
| ABU-02 | Cliente legítimo não percebe nenhuma fricção nova (sem CAPTCHA, sem etapa extra) | Honeypot invisível (sem campo visível novo), latência da checagem ≤ 500 ms com fail-open (D-03), leitura com teto folgado que sessão legítima não alcança (D-06), erro honesto com copy amigável no caso raro de bloqueio de escrita (D-07). Pitfall 6 cobre o risco de autofill gerar sucesso falso para pessoa real |
| ABU-03 | Owner consegue ver se o limite está barrando gente legítima | Reuso dos 4 pilares da quick task 260724: `logOperacional.warn` com código estático + camada + chave pseudonimizada, evento PostHog por tenant (`capturarEventoTenant`) e por servidor (`capturarEventoServidor` para bloqueio de IP pré-resolução), escalação a Sentry Issue só no teto por tenant (D-12) |
</phase_requirements>

## Summary

A fase adiciona três guardas à superfície pública existente sem tocar em schema de banco:
rate limit em camadas via `@upstash/ratelimit` + `@upstash/redis` (HTTP/REST, mesma conta
Upstash do QStash), honeypot com sucesso falso no formulário do `BookingApp`, e
observabilidade de bloqueio consumindo os pilares que já existem. Não há migration, não há
Docker, não há rota nova — o trabalho é inteiro em Server Actions, uma lib nova de
`src/lib/`, o formulário público e `src/lib/env.ts`.

A API da lib casa com as decisões travadas quase um-para-um: `Ratelimit.slidingWindow(n,
"janela")` é o algoritmo exigido; a opção `timeout` do construtor implementa exatamente o
fail-open com teto de latência do D-03 (requisição **passa** com `reason: 'timeout'` quando
o Redis não responde a tempo — default 5 s, configurável para 500 ms); `prefix` separa as
camadas; `ephemeralCache` em escopo de módulo bloqueia reincidente sem ida ao Redis (o
processo do Railway é Node de vida longa, então o cache funciona de verdade). O que a
opção `timeout` **não** cobre é rejeição rápida (erro de rede/credencial que rejeita antes
do timeout) — a chamada precisa de `try/catch` próprio para o fail-open do D-02 valer nos
dois modos de falha.

Os dois pontos que exigem decisão de arquitetura do planner (documentados em §Architecture
Patterns): (1) a chave da camada de tenant não existe na fronteira — o `tenant_id` só nasce
depois de `resolverPerfilPublicoPorSlug`, então ou a camada de tenant roda **depois** da
resolução (chave exata, custo de duas queries já pago) ou usa o slug como chave (de graça,
mas um tenant tem até dois slugs válidos e o atacante dobraria o orçamento); (2)
`logOperacional` é fire-and-forget (`void import(...)`) — o mesmo mecanismo que engoliu o
incidente da quick task 260724 em Server Action — e o log de bloqueio do D-11 é emitido
imediatamente antes de um `return`, então precisa de entrega garantida (via `after()` +
flush ou variante aguardada).

**Primary recommendation:** instalar `@upstash/ratelimit@^2.0.8` + `@upstash/redis@^1.38.0`,
concentrar toda a lógica num módulo novo `src/lib/rate-limit.ts` (factory que devolve
no-op sem env em dev), checar IP na fronteira antes de qualquer I/O e telefone+tenant logo
após a resolução do slug, com todas as chaves pseudonimizadas por hash com salt antes de
irem ao Redis.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Contagem de janela deslizante | Upstash Redis (REST) | — | Estado compartilhado entre requisições; atômico via script Redis da lib; não gasta write do Supabase Free (D-01) |
| Decisão de bloqueio | Server Action (fronteira) | — | Único caminho de escrita pós-Phase 1; é onde o discriminante nasce e onde a Fricção Zero é preservada |
| Honeypot (campo + sucesso falso) | Frontend (form) + Server Action | — | O campo vive no `BookingApp`; a decisão de sucesso falso é do servidor, antes de qualquer I/O |
| Copy do bloqueio | Frontend (`mensagens.ts`) | — | Padrão da Phase 01: servidor devolve discriminante, cliente escolhe a copy (flight apaga `.message` em produção) |
| Visibilidade do owner | Sentry Log + PostHog + Sentry Issue | — | Pilares existentes da quick task 260724; nenhuma UI nova (deferred) |
| Fail-fast de env em produção | `src/lib/env.ts` (boot) | — | Mecanismo existente; D-04 acrescenta duas linhas à lista |
| Obtenção do IP real | Proxy da Railway → header | Server Action (`headers()`) | Railway seta `x-forwarded-for`; a action lê via `headers()` de `next/headers` (API assíncrona no Next 16) |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@upstash/ratelimit` | 2.0.8 (npm, 2026-07) | Algoritmo `slidingWindow` atômico sobre Redis REST, com `timeout` fail-open, `prefix` e `ephemeralCache` | Decisão travada D-01; lib oficial do fornecedor já contratado (QStash); skill de referência em `.agents/skills/upstash/upstash-ratelimit-js/` `[VERIFIED: npm view 2.0.8]` — mas ver o gate de legitimidade abaixo |
| `@upstash/redis` | 1.38.0 (npm, 2026-07) | Cliente Redis HTTP/REST (o Redis da Railway é TCP e não serve — nota do ROADMAP) | Dependência declarada da própria `@upstash/ratelimit`; `[VERIFIED: npm registry + skill oficial no repo]` |

### Supporting (já existentes — REUSAR, nunca reimplementar)

| Asset | Purpose | When to Use |
|-------|---------|-------------|
| `logOperacional` (`src/lib/observabilidade/log.ts`) | Sentry Log estruturado, allowlist fechada | Todo bloqueio (D-11) — atributo novo exige editar `CHAVES_PERMITIDAS_LOG` + `MENSAGENS_LOG` + teste |
| `reportarFalhaSilenciosaAguardando` (`reportar.ts`) | Sentry Issue com `Sentry.flush(2000)` | Redis indisponível (D-02) e teto por tenant (D-12) — obrigatória a variante aguardada em Server Action |
| `hashTenantId` / padrão de `hash.ts` | Pseudonimização sha256+salt truncada | Estender o padrão para telefone e IP (chave do Redis e atributo de telemetria) |
| `capturarEventoTenant` / `capturarEventoServidor` (`analytics/server.ts`) | Evento PostHog via `after()`, no-op sem credencial | Taxa agregada de bloqueio; a variante `Servidor` serve para bloqueio de IP antes de o tenant existir |
| `MotivoPublico` + `mensagens.ts` | Discriminante fechado + copy no cliente | `muitas_tentativas` é membro novo; os dois `Record` exaustivos quebram o `tsc` até ganharem a entrada — por construção |
| `OBRIGATORIAS_EM_PRODUCAO` (`src/lib/env.ts`) | Fail-fast de boot | Acrescentar as duas env vars do Redis (D-04) — "uma linha, nenhum caminho novo" |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Upstash Redis | RPC atômica no Postgres (Supabase) | **Rejeitada pelo owner (D-01)** e deve ser documentada como não escolhida: contador de abuso em endpoint anônimo faria o atacante decidir quantos writes o Supabase Free gasta; sliding window em SQL é código próprio a manter; latência de round-trip similar. Vantagem que perde: zero fornecedor novo |
| `timeout` da lib (500 ms) | `Promise.race` próprio | A opção nativa já devolve `success: true, reason: 'timeout'` — implementar por fora seria duplicar o que a lib faz. O `try/catch` externo continua necessário para rejeição rápida |
| `analytics: true` da lib | Pilares próprios (D-11) | O CONTEXT já decide: a flag é opcional e **não substitui** D-11. Recomendação: deixar `analytics: false` (default) — evita comandos extras no Redis e a obrigação de aguardar `pending` |

**Installation:**
```bash
pnpm add @upstash/ratelimit @upstash/redis
```

**Version verification:** `npm view @upstash/ratelimit version` → `2.0.8` e
`npm view @upstash/redis version` → `1.38.0`, ambos consultados em 2026-07-27
`[VERIFIED: npm registry]`. Nenhum dos dois tem script `postinstall` `[VERIFIED: npm view]`.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@upstash/ratelimit` | npm | anos (última publish 2026-01-12) | 1.851.367/sem | **ausente no metadado do registry** (repo real: github.com/upstash/ratelimit-js `[ASSUMED]`) | [SUS] | Flagged — planner insere `checkpoint:human-verify` antes do install |
| `@upstash/redis` | npm | anos (última publish 2026-05-05) | 4.258.910/sem | github.com/upstash/redis-js | [OK] | Approved |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** `@upstash/ratelimit` [WARNING: flagged as
suspicious — verify before using.] — o motivo do verdict é **exclusivamente** o campo
`repository` ausente no metadado da última publish; os demais sinais são fortes (1,85M
downloads/semana, escopo `@upstash` — o mesmo do `@upstash/qstash` já instalado neste
`package.json` —, sem `postinstall`, docs oficiais e skill no próprio repo referenciando o
pacote). O checkpoint humano é barato: confirmar no `npm view @upstash/ratelimit` que o
escopo é o oficial da Upstash e que o tarball vem de `registry.npmjs.org`.

## Architecture Patterns

### System Architecture Diagram

```text
CAMINHO DE ESCRITA (criarAgendamentoPublico)

Navegador /book/[slug]                      Script/bot (chama a action direto)
        │                                            │
        ▼                                            ▼
┌──────────────────────────────────────────────────────────────────┐
│ Server Action: criarAgendamentoPublico (fronteira, antes de I/O) │
│                                                                  │
│ 1. honeypot preenchido? ──sim──► SUCESSO FALSO                   │
│    (zero I/O de banco; telemetria honeypot:captura;              │
│     nenhum cliente/agendamento/WhatsApp)                         │
│ 2. validações baratas existentes (campos, telefone, nome,        │
│    e-mail, data) — inalteradas                                   │
│ 3. RATE LIMIT camada IP  ──estouro──► { ok:false,                │
│    (chave hash(ip), folgada)           motivo:'muitas_tentativas'}│
│    │  Redis falhou/timeout? → FAIL-OPEN + Sentry Issue (D-02/03) │
│    ▼                                                             │
│ 4. createAdminClient() + resolverPerfilPublicoPorSlug (existente)│
│    ▼                                                             │
│ 5. RATE LIMIT camada telefone (hash(tel), por tenant, ~3/h)      │
│    + TETO por tenant (~30/h) — em paralelo (Promise.all)         │
│    │  telefone estourou ──► muitas_tentativas (log+PostHog)      │
│    │  teto do tenant estourou ──► muitas_tentativas              │
│    │       + Sentry Issue ratelimit:teto_tenant_atingido (D-12)  │
│    ▼                                                             │
│ 6. serviço → engine (revalida slot) → RPC cliente → INSERT       │
│    (23P01 → slot_indisponivel) → notificações   — tudo existente │
└──────────────────────────────────────────────────────────────────┘
        │                                     │
        ▼                                     ▼
   BookingApp roteia por res.motivo      Telemetria (D-11):
   'muitas_tentativas' → copy nova       logOperacional.warn (código estático,
   em mensagens.ts (D-07)                camada, chave pseudonimizada)
                                         + PostHog (capturarEventoTenant /
                                           capturarEventoServidor p/ camada IP)

CAMINHO DE LEITURA (obterSlotsPublicos, obterDadosBookingPublico)

  fronteira → RATE LIMIT por IP bem folgado (uma camada só, D-06)
      estouro → { ok:false, motivo:'muitas_tentativas' }
                → BookingApp mostra a caixa de erro EXISTENTE (D-10)
      (obterDadosBookingPublico: page.tsx converte falha em notFound() —
       ver Open Question 2)
```

### Recommended Project Structure

```text
src/
├── lib/
│   ├── rate-limit.ts              # NOVO — factory + camadas + fail-open + no-op dev
│   ├── __tests__/
│   │   └── rate-limit.test.ts     # NOVO — unitário com mock de @upstash/ratelimit
│   ├── env.ts                     # +2 linhas em OBRIGATORIAS_EM_PRODUCAO (D-04)
│   └── observabilidade/log.ts     # códigos novos em MENSAGENS_LOG (+ allowlist se preciso)
├── app/
│   ├── actions/public-booking.ts  # honeypot + 3 camadas na escrita + 1 na leitura
│   └── book/[slug]/
│       ├── mensagens.ts           # COPY_MUITAS_TENTATIVAS + entrada nos 2 Records
│       └── BookingApp.tsx         # campo honeypot no form; roteamento do motivo novo
```

### Pattern 1: Módulo de rate limit com no-op em dev (D-04)

**What:** factory em escopo de módulo que devolve os limiters reais quando as env vars
existem e um no-op com aviso de console quando não existem — nunca lança na ausência.
**When to use:** é o único ponto do código que conhece `@upstash/*`; as actions consomem
uma função de domínio (`verificarLimite(camada, chave)`), não a lib crua — o que torna o
mock dos testes trivial e a troca de backend (reversibilidade do D-01) localizada.

```typescript
// Padrão composto de: skill oficial .agents/skills/upstash/upstash-ratelimit-js/
// + docs oficiais via Context7 (upstash.com/docs/redis/sdks/ratelimit-ts/features)
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// Escopo de módulo, de propósito: o processo do Railway é Node de vida longa
// (next start), então o ephemeralCache default (new Map()) bloqueia reincidente
// sem ida ao Redis — reason: 'cacheBlock'.
const redis =
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
        ? new Redis({
              url: process.env.UPSTASH_REDIS_REST_URL,
              token: process.env.UPSTASH_REDIS_REST_TOKEN,
          })
        : null // dev sem env: no-op com aviso (D-04); em produção o boot já caiu (env.ts)

const limiterEscritaIp = redis
    ? new Ratelimit({
          redis,
          limiter: Ratelimit.slidingWindow(10, '10 m'), // constante de calibração
          prefix: 'rl:escrita:ip',
          timeout: 500, // D-03: timeout → passa com reason:'timeout'
      })
    : null
```

### Pattern 2: fail-open completo (timeout NATIVO + try/catch para rejeição)

**What:** o `timeout: 500` da lib cobre Redis LENTO (a lib resolve `success: true,
reason: 'timeout'`); erro de rede/credencial que **rejeita** a Promise antes do timeout
não é coberto e estoura como exceção `[ASSUMED — verificar no executor com mock que
rejeita]`. O fail-open do D-02 só é completo com os dois tratamentos.

```typescript
// D-02 + D-03: nunca deixar a checagem derrubar o booking
async function checarComFailOpen(limiter: Ratelimit, chave: string) {
    try {
        const res = await limiter.limit(chave)
        if (res.reason === 'timeout') {
            // Passou por timeout: conta como falha de fornecedor (D-03)
            await reportarFalhaSilenciosaAguardando('ratelimit:redis_unavailable', {
                fluxo: 'rate_limit',
                motivo: 'timeout',
            })
        }
        return res.success // bloqueio real: success === false
    } catch {
        // Rejeição rápida (rede/credencial): mesmo destino do timeout
        await reportarFalhaSilenciosaAguardando('ratelimit:redis_unavailable', {
            fluxo: 'rate_limit',
            motivo: 'erro',
        })
        return true // fail-open
    }
}
```

### Pattern 3: obtenção do IP em Server Action (Next.js 16)

**What:** `headers()` de `next/headers` é **assíncrona** no Next 16 e funciona dentro de
Server Actions `[CITED: node_modules/next/dist/docs/01-app/03-api-reference/04-functions/headers.md]`.
Atrás do proxy da Railway, o IP real do cliente é a **primeira** entrada de
`x-forwarded-for` — a Railway remove o header enviado pelo cliente e o edge dela anexa o
IP de conexão, então o leftmost não é forjável `[ASSUMED: fóruns oficiais da Railway
(station.railway.com), não é doc formal — ver Assumptions A2]`.

```typescript
import { headers } from 'next/headers'

async function ipDoVisitante(): Promise<string> {
    const h = await headers()
    const xff = h.get('x-forwarded-for')
    const ip = xff?.split(',')[0]?.trim()
    // IP indeterminável = chave própria, nunca crash (Claude's Discretion do CONTEXT):
    // todos os "sem IP" dividem um balde só — script que esconde IP não ganha janela infinita.
    return ip && ip.length > 0 ? ip : 'desconhecido'
}
```

### Pattern 4: chave pseudonimizada no Redis (invariante nunca-PII)

**What:** telefone e IP crus não entram em telemetria (D-11) — e a recomendação desta
pesquisa é estender o mesmo princípio à **chave do Redis**: a Upstash é fornecedor
terceiro, e a chave `rl:escrita:tel:5567999...` seria dado pessoal armazenado fora do
Supabase. Hash sha256+salt truncado (padrão exato de `hash.ts`) custa microssegundos, não
muda o comportamento do limite e mantém o invariante do projeto em todos os stores.

```typescript
// Espelha hashTenantId/hashAgendamentoId (src/lib/observabilidade/hash.ts)
const chaveTelefone = `${hashComSalt(telefoneLimpo)}:${hashComSalt(tenantId)}`
```

### Pattern 5: honeypot com sucesso falso na action tipada

**What:** `criarAgendamentoPublico` recebe **objeto tipado**, não `FormData` — o campo
honeypot precisa (a) existir como input invisível no form do `BookingApp`, (b) ser lido do
`formData` no submit handler e (c) viajar como campo novo (opcional) de
`AgendamentoPublicoParams`. A checagem é a PRIMEIRA da action (antes até das validações
baratas): custo zero, e o bot recebe sucesso plausível mesmo com payload lixo.

```typescript
// Na action, antes de tudo:
if (honeypot && honeypot.trim().length > 0) {
    // Telemetria (D-11, código próprio) — SEM tenant resolvido: usar
    // capturarEventoServidor; log com código estático 'honeypot.captura'.
    // Nenhum banco, nenhum WhatsApp, nenhum cliente gravado.
    return {
        ok: true,
        agendamento: {
            id: crypto.randomUUID(), // forma idêntica a AgendamentoCriado
            data_hora: dataHora,
            status: 'confirmado',
        },
    }
}
```

**Cobertura honesta das duas defesas:** honeypot pega bot que preenche formulário
(crawler/autofill de spam); script que chama a Server Action direto com payload próprio
**não preenche** o honeypot — para ele existe o rate limit. As camadas não competem, se
complementam; nenhuma sozinha prova o SC1 (o CONTEXT §specifics diz isso textualmente).

### Anti-Patterns to Avoid

- **`fixedWindow`:** proibido pelo ROADMAP — permite o dobro na virada da janela.
- **`throw` para bloqueio:** bloqueio é condição ESPERADA; em produção o React só
  transporta o digest. Sempre valor discriminado (padrão medido na Phase 01).
- **Sentry Issue por bloqueio de IP/telefone:** é rotina, não incidente — só log+PostHog
  (D-11); Issue é exclusiva do teto por tenant (D-12) e da falha do Redis (D-02). Espelha
  o 23P01 da Phase 02 (perda de corrida não vai ao Sentry).
- **Instanciar `Ratelimit`/`Map` dentro do handler:** mata o `ephemeralCache` (docs
  oficiais nomeiam o pitfall) — tudo em escopo de módulo.
- **`analytics: true` como substituto do D-11:** o CONTEXT já veda; e a flag obrigaria a
  aguardar `pending` em cada chamada.
- **Interpolar valor na mensagem da Issue:** mensagem sintética ESTÁTICA
  (`ratelimit:teto_tenant_atingido`) — interpolação estilhaça o agrupamento (baseline
  260724).
- **Reimplementar pilar de observabilidade:** os quatro existem e são contrato
  (STATE §⛳); a fase é consumidora.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Janela deslizante atômica | Contador próprio em Redis (GET/INCR/EXPIRE) ou tabela no Postgres | `Ratelimit.slidingWindow` | A lib executa script atômico no Redis e trata a proporcionalidade da janela anterior; check-and-set manual tem corrida entre leitura e incremento |
| Timeout fail-open | `Promise.race` artesanal | opção `timeout` do construtor | Nativa, devolve `reason: 'timeout'` distinguível para o reporte do D-03 |
| Cache de reincidente | Set/Map próprio com TTL manual | `ephemeralCache` (default) | Já integrado à decisão de bloqueio (`reason: 'cacheBlock'`), zero código |
| Pseudonimização | Hash novo | padrão `hash.ts` (sha256+salt truncado) | Mesmo salt `ANALYTICS_TENANT_SALT`, mesma forma, mesmos testes de referência |
| Copy de bloqueio | String na action | constante em `mensagens.ts` + entrada nos 2 `Record` | Contrato da Phase 01: fonte única alimenta tela e teste; `Record` exaustivo força a decisão no `tsc` |
| Fail-fast de env | Validação própria | lista `OBRIGATORIAS_EM_PRODUCAO` | O comentário do próprio arquivo manda: "não inventar um segundo caminho" |

**Key insight:** neste domínio o custo escondido não é escrever o contador — é acertar
atomicidade sob concorrência, virada de janela e modo de falha do fornecedor. A lib
resolve os três; o que sobra para o projeto é exatamente o que a lib não sabe: composição
das camadas, chaves pseudonimizadas, discriminante e telemetria — e isso é código de
domínio do projeto, não infra.

## Common Pitfalls

### Pitfall 1: a camada de tenant não tem chave na fronteira

**What goes wrong:** o CONTEXT manda a checagem entrar "ANTES de `createAdminClient()` e
da resolução do slug", mas o `tenant_id` só existe DEPOIS de `resolverPerfilPublicoPorSlug`
— e a chave por slug tem furo: um tenant responde por até dois slugs (`slug` +
`slug_gratuito`), então o atacante alternando os dois dobraria o orçamento das camadas de
telefone e tenant.
**Why it happens:** o padrão 01-18 ("recusar de graça") foi escrito para validação de
entrada, que não depende de estado; duas das três camadas dependem.
**How to avoid:** dividir a guarda em dois pontos — camada de **IP** na fronteira (recusa
de graça, é ela que segura o flood barato), camadas de **telefone+tenant** imediatamente
após a resolução do slug (chave exata por `tenant_id`, antes da engine/RPC/INSERT, que são
o custo real). O ataque distribuído que só a camada de tenant pega já pagou as duas
queries de resolução de qualquer forma — é o caso raro, e o D-09 existe para desacelerar,
não para economizar query.
**Warning signs:** plano que usa slug como chave de tenant, ou que roda as três camadas
depois da resolução (aí a camada de IP deixa de ser recusa de graça).

### Pitfall 2: `limit()` pode LANÇAR além de estourar o timeout

**What goes wrong:** confiar só no `timeout: 500` deixa o fail-open incompleto — rejeição
rápida (DNS, credencial errada, 401 do REST) estoura como exceção e derruba o booking, o
oposto exato do D-02.
**Why it happens:** o `timeout` da lib é um race contra lentidão; rejeição chega antes.
**How to avoid:** `try/catch` em volta de toda chamada (`Pattern 2`), com o mesmo reporte
`ratelimit:redis_unavailable`. Provar por teste unitário com mock cujo `limit` rejeita.
`[ASSUMED: comportamento de rejeição inferido do desenho da API; o executor confirma
lendo o fonte instalado em node_modules]`
**Warning signs:** teste de "Redis fora do ar" ausente da suíte; nenhuma asserção de que
a action devolve `ok: true` com o limiter quebrado.

### Pitfall 3: `logOperacional` fire-and-forget morre com a Server Action

**What goes wrong:** o log de bloqueio (D-11) é emitido na linha imediatamente anterior a
um `return` de Server Action — exatamente o cenário em que `void import('@sentry/nextjs')`
perde o evento, a causa raiz documentada do incidente 260724 (STATE: "Server Action/webhook
do Next 16 encerram antes de a Promise do Sentry enviar").
**Why it happens:** `log.ts` só tem versão fire-and-forget; as variantes aguardadas
existem apenas em `reportar.ts`.
**How to avoid:** o planner precisa escolher um mecanismo de entrega: (a) variante
aguardada de `logOperacional` com `Sentry.flush` (espelho das de `reportar.ts`), ou (b)
embrulhar em `after()` de `next/server` com o flush dentro do callback (o `after` mantém o
contexto vivo até o callback terminar `[CITED: node_modules/next/dist/docs/.../after.md]`).
O evento PostHog não tem esse problema — `capturarEventoServidor` já usa `after()`.
**Warning signs:** bloqueio testado em dev "aparece no painel" e em produção não — o
mesmo falso-verde que o projeto já pagou uma vez.

### Pitfall 4: contar TENTATIVAS achando que conta AGENDAMENTOS

**What goes wrong:** `limit()` consome o token na checagem (check-then-consume), antes de
o agendamento existir. O caso família do D-08 (mãe agendando 3 serviços com o mesmo
telefone) que perde UMA corrida de double-booking e re-tenta já gasta 4 tokens — com o
limite em 3/h, a terceira criança fica de fora. `slidingWindow` não tem refund.
**Why it happens:** a semântica natural de qualquer limiter é por requisição, e o D-08
foi redigido em "agendamentos por hora".
**How to avoid:** implementar o "~3 agendamentos/h" do D-08 como ~5 tentativas/h — o "~"
da decisão é explicitamente margem de calibração ("constante de calibração"). Registrar a
conversão no plano para o owner enxergar o número real.
**Warning signs:** teste que só cobre o caminho feliz de N agendamentos e nenhum caso
"retry de double-booking dentro da mesma janela".

### Pitfall 5: `muitas_tentativas` estilhaça os tipos fechados — e isso é o desenho

**What goes wrong:** adicionar o membro em `MotivoPublico` quebra a compilação em três
lugares de uma vez: os dois `Record` exaustivos de `mensagens.ts` e — se a leitura também
devolver o motivo — o alias `MotivoSlotsPublicos` (que é vista estreita, decisão 01-18:
**alargar o alias próprio**, nunca `MotivoLeituraPublica`).
**Why it happens:** os `Record` são exaustivos sem `default` de propósito (membro novo
não compila até alguém decidir a copy).
**How to avoid:** na caixa de horários, `muitas_tentativas` → `COPY_ERRO_SLOTS`
(existente, D-10); no envio, → constante nova `COPY_MUITAS_TENTATIVAS` ("Muitas tentativas
seguidas. Aguarde um instante e tente de novo." — tom contratado no D-07). Lembrar que o
gate de tipo do projeto é `npx tsc --noEmit` — `pnpm test` e `pnpm build` não pegam erro
de tipo em `.test.ts` (lição registrada na memória do projeto).
**Warning signs:** `mensagens.test.ts` (em `src/app/book/__tests__/`) vermelho por copy
divergente; executor "consertando" o Record com `default`.

### Pitfall 6: autofill do navegador preenchendo o honeypot = pessoa real com sucesso falso

**What goes wrong:** o pior desfecho nomeado pelo owner no D-07 — "ela acha que agendou e
não agendou" — pode acontecer pelo honeypot se o autofill do Chrome preencher o campo
invisível (autofill preenche campos fora da viewport quando reconhece o `name`).
**Why it happens:** heurísticas de autofill casam por `name`/`autocomplete` — os mesmos
atributos que atraem bots atraem o autofill.
**How to avoid:** `name` fora do vocabulário de autofill (nada de `website`, `url`,
`address`, `phone2`), `autocomplete="off"`, `tabIndex={-1}`, `aria-hidden="true"`,
ocultação por posicionamento fora da tela (não `display:none` — parte dos bots pula campos
`display:none` `[ASSUMED: prática folclórica de anti-spam, sem medição própria]`). E
monitorar: se `honeypot:captura` aparecer no PostHog em taxa incompatível com tráfego de
bot, é autofill capturando gente real — o evento do D-11 é também o detector desse
falso-positivo.
**Warning signs:** taxa de captura do honeypot correlacionada com conversão caindo.

### Pitfall 7: leitura bloqueada em `obterDadosBookingPublico` vira 404

**What goes wrong:** `obterDadosBookingPublico` devolve `null` para `page.tsx`, que chama
`notFound()`. Se o teto de leitura bloquear essa função, o visitante (legítimo sob CGNAT,
no limite folgado mal calibrado) veria 404 — pior que a caixa de erro do D-10 e
indistinguível de "agenda não existe".
**Why it happens:** o contrato `null → notFound()` foi desenhado para slug inexistente.
**How to avoid:** duas opções para o planner (Open Question 2): aplicar o teto de leitura
só em `obterSlotsPublicos` (que tem canal de erro discriminado e a caixa do D-10; é ela
que um script martelaria para varrer a grade), ou criar retorno distinto no page load. A
opção 1 é a mais simples e cobre o vetor real — recomendada.
**Warning signs:** teste de bloqueio de leitura esperando 404.

### Pitfall 8: janelas do Upstash Free e custo por comando

**What goes wrong:** cada `limit()` custa comandos Redis; 3 camadas na escrita + 1 na
leitura multiplicam. O plano Free da Upstash tem cota diária de comandos; um ataque
sustentado consome a cota e joga tudo em fail-open — o atacante "desliga" o limiter
gastando a cota `[ASSUMED: modelo de cobrança da Upstash por comandos; conferir o plano
vigente da conta no provisionamento]`.
**Why it happens:** é o análogo Redis do argumento que descartou o Postgres no D-01.
**How to avoid:** `ephemeralCache` mitiga (reincidente bloqueado não vai ao Redis);
ordem das checagens curto-circuita (IP primeiro; bloqueado não consulta as outras); e o
fail-open com Sentry Issue (D-02) garante que o esgotamento não passa despercebido.
Registrar no plano como risco aceito com detector.
**Warning signs:** `ratelimit:redis_unavailable` em rajada no Sentry.

## Code Examples

Ver §Architecture Patterns (Patterns 1–5) — todos derivados de: skill oficial no repo
(`.agents/skills/upstash/upstash-ratelimit-js/`), docs oficiais Upstash via Context7
(`upstash.com/docs/redis/sdks/ratelimit-ts/{features,methods}`) e docs locais do Next 16
(`node_modules/next/dist/docs/`). O retorno de `limit()` `[CITED: Context7 /websites/upstash_redis_sdks_ratelimit-]`:

```typescript
type RatelimitResponse = {
    success: boolean
    limit: number
    remaining: number
    reset: number // unix ms
    pending: Promise<unknown> // analytics/sync — irrelevante com analytics: false
    reason?: 'timeout' | 'cacheBlock' | 'denyList' | undefined
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `fixedWindow` | `slidingWindow` | sempre disponível na lib | Elimina o dobro-na-virada; exigência do ROADMAP |
| CAPTCHA para anti-abuso | Defesa invisível em camadas (rate limit + honeypot) | decisão de produto (Fricção Zero) | Nenhuma fricção para o cliente final |
| `@upstash/ratelimit` v1 | v2 (atual 2.0.8) | 2024→ | API `limit()/RatelimitResponse` estável; v2 trouxe `enableProtection`/deny list e `dynamicLimits` `[CITED: docs oficiais]` |
| `middleware.ts` para rate limit | Checagem na própria Server Action | arquitetura deste projeto | O projeto usa `src/proxy.ts` (Clerk) e o único caminho de escrita é a action — guarda na fronteira da action, padrão 01-18 |

**Deprecated/outdated:**
- Redis TCP (ex.: o da Railway) para este fim: a lib é HTTP/REST; o Redis da Railway
  pertence à Evolution API (nota do ROADMAP).
- `getToken({ template: 'supabase' })`, rotas REST próprias etc. — proibições gerais do
  projeto continuam valendo; nenhuma é tocada por esta fase.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `limit()` rejeita (lança) em erro de rede/credencial em vez de resolver | Pitfall 2 / Pattern 2 | Se nunca lança, o `try/catch` é redundante (inócuo); se lança e não for tratado, booking cai com Redis fora — violação direta do D-02. O `try/catch` é barato: manter nas duas hipóteses |
| A2 | Na Railway, o primeiro IP de `x-forwarded-for` é o cliente real e não é forjável (edge remove o header do cliente) | Pattern 3 | Se forjável, script rotaciona a chave de IP de graça — mas as camadas de telefone/tenant continuam valendo (defesa em camadas existe para isso). Fonte: fóruns oficiais station.railway.com, não doc formal |
| A3 | Repo fonte de `@upstash/ratelimit` é github.com/upstash/ratelimit-js (metadado ausente no npm) | Package Legitimacy Audit | Mitigado pelo checkpoint humano pré-install |
| A4 | Bots de formulário pulam campos `display:none` com mais frequência que campos off-screen | Pitfall 6 | Honeypot menos eficaz — sem dano ao cliente legítimo; o rate limit cobre o resto |
| A5 | Upstash Free tem cota diária de comandos que um ataque sustentado esgota | Pitfall 8 | Se a cota for outra, muda só a urgência do detector — o fail-open+Issue já cobre |
| A6 | Números de calibração sugeridos (IP escrita ~10/10min; leitura ~60/min por IP; telefone ~5 tentativas/h como implementação do "~3 agendamentos/h") | Patterns / Pitfall 4 | São constantes de calibração declaradas reversíveis (D-08/D-09); errar para o folgado só reduz proteção, nunca adiciona fricção |

## Open Questions (RESOLVED)

Todas as 5 questões foram resolvidas durante o planning (2026-07-27) — a resolução de
cada uma vive em conteúdo executável dos planos, anotada abaixo.

1. **Onde exatamente rodam as camadas de telefone e tenant?**
   - What we know: o CONTEXT manda a checagem para a fronteira (padrão 01-18), mas a chave
     de tenant só existe pós-resolução; slug como chave tem o furo dos dois slugs.
   - What's unclear: se o planner prefere fidelidade literal ao "antes da resolução" ou a
     chave exata.
   - Recommendation: IP na fronteira; telefone+tenant pós-resolução (Pitfall 1). Registrar
     a escolha no plano com o racional.
   - ✅ **Resolvida no plano 03-03**: IP na fronteira; checagem composta telefone+tenant
     pós-resolução do slug (Task 2, com o racional do Pitfall 1 registrado no plano).
2. **Bloqueio de leitura cobre `obterDadosBookingPublico`?**
   - What we know: `null → notFound()` faria bloqueio virar 404 (Pitfall 7); o vetor real
     de varredura é `obterSlotsPublicos`, que tem canal de erro discriminado.
   - Recommendation: teto de leitura só em `obterSlotsPublicos`; deixar o page load fora
     nesta fase (uma requisição por visita, custo baixo, e a Vercel/Railway não têm CDN
     configurado na frente para confundir a contagem).
   - ✅ **Resolvida no plano 03-04** (teto só em `obterSlotsPublicos`;
     `obterDadosBookingPublico` fora) — **desvio do D-06 ratificado pelo owner em
     2026-07-27 durante o plan-phase**; ratificação anotada no 03-CONTEXT.md (D-06) e no
     próprio plano 03-04.
3. **Onde documentar a alternativa RPC/Postgres não escolhida (exigência do D-01/ROADMAP)?**
   - Recommendation: seção curta num doc de domínio (ex.: acrescentar a `docs/01` ou doc
     próprio da fase) + nota em `docs/PENDENCIAS.md` se algo ficar adiado (Definition of
     Done §6). Decisão de forma é do planner.
   - ✅ **Resolvida no plano 03-06**: documentação da alternativa não escolhida com o
     racional do D-01 + itens de `docs/PENDENCIAS.md`.
4. **Entrega do Sentry Log de bloqueio (Pitfall 3): variante aguardada de `logOperacional`
   ou `after()` com flush?**
   - Recommendation: variante aguardada espelhando `reportar.ts` — mecanismo já provado
     no baseline 260724 e testável do mesmo jeito.
   - ✅ **Resolvida no plano 03-02**: `logOperacionalAguardando` (variante aguardada com
     `Sentry.flush`), consumida nos pontos de bloqueio dos planos seguintes.
5. **Confirmação do plano Upstash sobre segundo database (D-05):** ação do owner no
   provisionamento; se pago, dev fica em no-op (a própria decisão já prevê o desvio).
   - ✅ **Resolvida**: provisionamento registrado como ação do owner no `user_setup` do
     plano 03-01 + gate de deploy e desvio previsto (no-op em dev) registrados em
     PENDENCIAS no plano 03-06.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | runtime | ✓ | v24.15.0 | — |
| pnpm | install/test | ✓ | 11.9.0 (pinado) | — |
| `@upstash/qstash` (mesma conta Upstash) | precedente de fornecedor | ✓ | ^2.11.2 instalado | — |
| Upstash Redis DB (prod) | contador em produção | ✗ (provisionamento do owner — gate de execução, CONTEXT §Integration Points) | — | **Sem fallback**: D-04 derruba o boot de produção sem as env vars — provisionar ANTES do deploy (amplia a janela de crash-loop do STATE) |
| Upstash Redis DB (dev) | contador em dev | ✗ (mesmo gate) | — | No-op com aviso (D-04/D-05) — dev funciona sem |
| Docker / Supabase CLI | — | não requerido | — | Fase sem mudança de schema: nenhuma migration, nenhum `db diff` |

**Missing dependencies with no fallback:**
- Upstash Redis de produção + env vars no Railway — ação do owner, gate de deploy (não de
  desenvolvimento). O plano deve conter um checkpoint explícito de provisionamento.

**Missing dependencies with fallback:**
- Upstash Redis de dev — no-op declarado por decisão (D-04/D-05).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.10 |
| Config file | `vitest.config.ts` (suíte hermética; integração opt-in via `EXIGIR_INTEGRACAO=1`) |
| Quick run command | `pnpm test` (280 testes / 20 arquivos verdes no baseline) |
| Full suite command | `pnpm lint && pnpm test && pnpm build` + `npx tsc --noEmit` (gate de tipo — `pnpm test`/`build` não pegam erro de tipo em `.test.ts`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ABU-01 | Estouro de cada camada devolve `muitas_tentativas`; honeypot devolve sucesso falso sem tocar banco | unit (mock de `@upstash/ratelimit` e do módulo de domínio) | `pnpm test -- src/lib/__tests__/rate-limit.test.ts` | ❌ Wave 0 |
| ABU-01 | Action pública consulta o limiter ANTES de `createAdminClient` (camada IP) — asserção de que o admin client não é chamado na recusa | unit | `pnpm test -- src/app/actions/__tests__/public-booking-validacao.test.ts` (padrão já existente no arquivo) | ✅ (estender) |
| ABU-02 | Fail-open: limiter rejeitando/timeout → `ok: true` no fluxo; nenhuma copy nova visível fora do bloqueio; campo honeypot com atributos de invisibilidade/acessibilidade | unit + asserção de FONTE (padrão da Phase 01: teste lê `BookingApp.tsx` do disco) | `pnpm test` | ❌ Wave 0 |
| ABU-02 | Copy do D-07 travada byte a byte, Records exaustivos | unit | `pnpm test -- src/app/book/__tests__/mensagens.test.ts` | ✅ (estender) |
| ABU-03 | Bloqueio emite `logOperacional.warn` com código estático + atributos da allowlist (sem PII crua); teto de tenant emite Issue aguardada; PostHog chamado | unit com spies | `pnpm test -- src/lib/observabilidade/__tests__/log.test.ts` + teste novo | ✅ (allowlist) / ❌ (integração dos pontos de disparo — Wave 0) |

### Sampling Rate

- **Per task commit:** `pnpm test`
- **Per wave merge:** `pnpm lint && pnpm test && pnpm build && npx tsc --noEmit`
- **Phase gate:** suíte completa verde antes de `/gsd-verify-work`; prova comportamental
  do SC1 (script repetindo requisições contra `next start` até bater o teto) é candidata a
  harness de fase — se tocar Redis real, respeitar a regra viva: fora do `pnpm test`
  hermético, opt-in como a suíte de integração

### Wave 0 Gaps

- [ ] `src/lib/__tests__/rate-limit.test.ts` — cobre ABU-01/ABU-02 (camadas, fail-open,
  no-op sem env, timeout como falha reportada)
- [ ] Testes de honeypot (sucesso falso sem I/O; atributos do campo por asserção de fonte)
  — cobre ABU-01/ABU-02
- [ ] Testes dos pontos de telemetria de bloqueio — cobre ABU-03
- [ ] Framework: nenhum install novo (Vitest presente); mock de `@upstash/ratelimit` via
  `vi.mock`, sem rede

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Fluxo B2C é anônimo por decisão de produto (Fricção Zero); B2B intocado (Clerk) |
| V3 Session Management | no | Sem sessão no caminho público |
| V4 Access Control | yes (herdado) | Data API `anon` revogada (Phase 1); action é o único caminho — pré-condição do SC1 |
| V5 Input Validation | yes (existente) | Validação de fronteira da Phase 1 permanece; honeypot é campo novo validado como string opcional com teto de tamanho |
| V6 Cryptography | yes (mínimo) | Pseudonimização sha256+salt (padrão `hash.ts`) — nunca hand-roll além disso |
| V11 Business Logic (anti-automation) | **yes — núcleo da fase** | `@upstash/ratelimit` slidingWindow em camadas + honeypot; é o requisito ABU-01 |

### Known Threat Patterns for este stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Flood de escrita por script (IP único) | DoS | Camada IP `slidingWindow` na fronteira, antes de qualquer I/O |
| Ench-agenda com telefone único | DoS/Tampering | Camada telefone (~3 agendamentos/h por tenant, D-08) |
| Ataque distribuído (IPs+telefones rotativos) | DoS | Teto por tenant (D-09) — desacelera; D-12 alerta o humano |
| Bot de formulário (spam genérico) | Spoofing | Honeypot com sucesso falso |
| Spoof de `x-forwarded-for` | Spoofing | Railway remove o header do cliente (A2); IP indeterminável cai em balde próprio, nunca crash |
| PII em store de terceiro (chave Redis, telemetria) | Information Disclosure | Hash com salt em toda chave e atributo (invariante do projeto) |
| Fornecedor de rate limit fora do ar | DoS (do limiter) | Fail-open + Sentry Issue aguardada (D-02/D-03) — indisponibilidade nunca derruba o booking |
| Log flooding pelo próprio endpoint | DoS | Entrada hostil não é logada (decisão 01-18); bloqueio loga código estático com atributos enxutos |

## Project Constraints (from CLAUDE.md)

- **pnpm sempre**; Definition of Done = `pnpm lint` + `pnpm test` + `pnpm build` com saída
  real mostrada (adicionar `npx tsc --noEmit` — gate de tipo registrado na memória).
- **Sem rotas REST novas** — a fase trabalha só em Server Actions existentes (nenhum
  webhook novo é necessário).
- **Fricção Zero inegociável** — nenhuma proteção pode adicionar fricção visível (ABU-02).
- **Falha silenciosa ≠ esconder do owner** — bloqueio silencioso para o cliente, sempre
  visível nos pilares (D-11/D-12).
- **Variantes aguardadas** (`*Aguardando`) obrigatórias em Server Action que encerra em
  seguida; mensagens de Issue sintéticas e estáticas; identificadores só pseudonimizados.
- **Sem mudança de schema nesta fase** → não se aplicam as regras de migration/RLS; se um
  plano futuro criar tabela, todas as regras de `docs/03` voltam a valer.
- **Tecnologias banidas** (Prisma/Drizzle, better-auth, Mercado Pago) — não tocadas.
- **Next.js 16 tem breaking changes** — consultar `node_modules/next/dist/docs/` (feito:
  `headers()` assíncrona confirmada na doc local).
- **`docs/PENDENCIAS.md`** atualizado se a fase criar/adiar tarefas (inclui o item de
  provisionamento do owner e a documentação da alternativa não escolhida).
- **Domínio em português**: `muitas_tentativas`, códigos `ratelimit:*`/`honeypot:*`,
  nomes de função em pt-BR.

## Sources

### Primary (HIGH confidence)

- Código do projeto medido nesta sessão: `src/app/actions/public-booking.ts` (três actions,
  fronteira, discriminantes), `src/lib/env.ts`, `src/lib/observabilidade/{log,reportar,hash}.ts`,
  `src/lib/analytics/server.ts`, `src/app/book/[slug]/{mensagens.ts,BookingApp.tsx}`,
  `vitest.config.ts`, `package.json`
- Docs locais do Next.js 16: `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/{headers,after}.md`
- npm registry: versões e ausência de `postinstall` de `@upstash/ratelimit@2.0.8` e
  `@upstash/redis@1.38.0` (`npm view`, 2026-07-27)

### Secondary (MEDIUM confidence)

- Context7 `/websites/upstash_redis_sdks_ratelimit-` — `timeout`, `ephemeralCache`,
  `RatelimitResponse`, `reason` (docs oficiais Upstash; seam classificou context7 como
  MEDIUM). Digests cacheados no research-store (chaves `6e39...` e `e133...`)
- Skill oficial no repo: `.agents/skills/upstash/upstash-ratelimit-js/{overview,features,algorithms}.md`

### Tertiary (LOW confidence)

- WebSearch: comportamento do `x-forwarded-for` na Railway (station.railway.com,
  answeroverflow) — marcado A2 no Assumptions Log
- Conhecimento de treinamento: heurísticas de honeypot/autofill (A4), modelo de cota da
  Upstash Free (A5)

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — decisão travada pelo owner (D-01) + pacotes verificados no
  registry + docs oficiais concordantes; único senão é o verdict [SUS] por metadado
- Architecture: HIGH — todo o encaixe foi lido do código real do projeto (fronteira,
  discriminantes, pilares); os dois pontos ambíguos viraram Open Questions com recomendação
- Pitfalls: MEDIUM — os pitfalls 1, 3, 5 e 7 são derivados de medição/história do próprio
  projeto (alta confiança); 2, 6 e 8 dependem de comportamento de terceiro não medido
  nesta sessão (marcados no Assumptions Log)

**Research date:** 2026-07-27
**Valid until:** 2026-08-26 (stack estável; rechecar versão da lib no install)
