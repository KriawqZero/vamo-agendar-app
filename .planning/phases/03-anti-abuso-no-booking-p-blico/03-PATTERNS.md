# Phase 3: Anti-abuso no booking público - Mapa de Padrões

**Mapeado:** 2026-07-27
**Arquivos analisados:** 8 (2 novos, 6 modificados)
**Analogs encontrados:** 8 / 8

## File Classification

| Arquivo (novo/modificado) | Role | Data Flow | Analog mais próximo | Qualidade |
|---|---|---|---|---|
| `src/lib/rate-limit.ts` (NOVO) | service/utility | request-response (guarda) | `src/lib/analytics/server.ts` (no-op sem env) + `src/lib/observabilidade/reportar.ts` (nunca-lança) | role-match forte |
| `src/lib/__tests__/rate-limit.test.ts` (NOVO) | test | — | `src/app/actions/__tests__/public-booking-validacao.test.ts` | exact |
| `src/app/actions/public-booking.ts` | server action | request-response (CRUD B2C) | ele mesmo — padrões internos já estabelecidos (fronteira, discriminante, 23P01) | exact (self) |
| `src/app/book/[slug]/mensagens.ts` | config/copy | transform (discriminante → copy) | ele mesmo — os dois `Record` exaustivos | exact (self) |
| `src/app/book/[slug]/BookingApp.tsx` | component (ilha client) | request-response | ele mesmo — roteamento por `res.motivo` no `useActionState` | exact (self) |
| `src/lib/env.ts` | config | — | ele mesmo — lista `OBRIGATORIAS_EM_PRODUCAO` | exact (self) |
| `src/lib/observabilidade/log.ts` | utility (observabilidade) | event-driven | ele mesmo — `MENSAGENS_LOG` + `CHAVES_PERMITIDAS_LOG`; variante aguardada a espelhar de `reportar.ts` | exact |
| Extensão de `hash.ts` (telefone/IP) | utility | transform | `src/lib/observabilidade/hash.ts` (`hashAgendamentoId`) | exact |

## Pattern Assignments

### `src/lib/rate-limit.ts` (service, guarda de fronteira) — NOVO

**Analogs:** `src/lib/analytics/server.ts` (no-op sem credencial), `src/lib/observabilidade/reportar.ts` (nunca lança + variante aguardada), `src/lib/env.ts` (comentário de contrato no topo).

**Padrão de no-op sem env** — copiar de `src/lib/analytics/server.ts:60-72`:

```typescript
export function capturarEventoServidor(
    evento: string,
    props?: PropsEvento,
    distinctId: string = 'server',
): void {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return
    try {
        after(() => enviarAoPostHog(evento, props, distinctId))
    } catch {
        // Fora de contexto de request (ex.: job interno): fire-and-forget.
        void enviarAoPostHog(evento, props, distinctId)
    }
}
```
→ Para o rate limit: guard de env no escopo de módulo (`Redis` instanciado só se `UPSTASH_REDIS_REST_URL` + token existirem, senão `null` + aviso de console em dev — D-04). Instâncias de `Ratelimit` em escopo de módulo (nunca dentro do handler — anti-pattern nomeado no RESEARCH: mata o `ephemeralCache`).

**Padrão de "nunca lança" com fail-open** — copiar a estrutura de `src/lib/observabilidade/reportar.ts:47-59` (variante aguardada):

```typescript
export async function reportarExcecaoAguardando(
    erro: unknown,
    contexto?: ContextoObservabilidade,
): Promise<void> {
    if (!dsn()) return
    try {
        const Sentry = await import('@sentry/nextjs')
        Sentry.captureException(erro, contexto ? { extra: contexto } : undefined)
        await Sentry.flush(2000)
    } catch {
        // Silêncio proposital: ver contrato 1 no cabeçalho.
    }
}
```
→ Para `checarComFailOpen`: `try/catch` em volta de `limiter.limit(chave)`; rejeição rápida E `reason === 'timeout'` viram `reportarFalhaSilenciosaAguardando('ratelimit:redis_unavailable', {...})` e devolvem "passa" (D-02/D-03). O RESEARCH §Pattern 2 já traz o esqueleto pronto.

**Padrão de cabeçalho-contrato** — copiar o formato de `reportar.ts:1-16` e `log.ts:1-11`: JSDoc de topo enumerando o contrato ("1. NUNCA lança. 2. NO-OP sem env. 3. Nunca recebe PII crua — chave sempre pseudonimizada."). Todos os módulos de infraestrutura do projeto abrem assim.

**Padrão de pseudonimização da chave** — copiar de `src/lib/observabilidade/hash.ts:12-15`:

```typescript
export function hashAgendamentoId(agendamentoId: string): string {
    const salt = process.env.ANALYTICS_TENANT_SALT ?? ''
    return createHash('sha256').update(`${salt}${agendamentoId}`).digest('hex').slice(0, 16)
}
```
→ Mesma forma exata (sha256 + `ANALYTICS_TENANT_SALT` + truncado a 16) para telefone e IP antes de virarem chave do Redis ou atributo de telemetria. Adicionar as funções novas no próprio `hash.ts` ou no módulo de rate limit — nunca hash artesanal diferente.

---

### `src/app/actions/public-booking.ts` (server action, escrita + leituras)

**Analog:** o próprio arquivo — três padrões internos a estender, não substituir.

**1. Posição da guarda de fronteira** — o comentário-manifesto de `obterSlotsPublicos` (linhas 676-698) É o contrato do 01-18:

```typescript
// ⚠️ VALIDAÇÃO NA FRONTEIRA — e ela vem ANTES de tudo de propósito: antes de
// `createAdminClient()`, antes de resolver o slug, antes do primeiro `await`.
// A ordem não é estética, é a diferença entre recusar de graça e recusar
// depois de já ter pago duas consultas ao banco.
if (!FORMATO_DATA_ISO.test(dateStr) || !ehDataDeCalendario(dateStr)) {
    return { ok: false, motivo: 'data_invalida' }
}
```
→ Honeypot e camada de IP entram AQUI (antes de `createAdminClient()`, linha 385 na escrita / 711 na leitura). Camadas de telefone+tenant entram logo APÓS `resolverPerfilPublicoPorSlug` (linha 389-400), antes da consulta de serviço — resolução do Pitfall 1 do RESEARCH (slug tem furo de dois namespaces).

**2. Discriminante como valor, nunca throw** — padrão do tipo fechado (linhas 104-112):

```typescript
export type MotivoPublico =
    | 'campos_obrigatorios'
    | 'telefone_invalido'
    | 'data_invalida'
    | 'slug_invalido'
    | 'servico_invalido'
    | 'slot_indisponivel'
    | 'erro_interno'
    | 'email_invalido'
```
→ Adicionar `| 'muitas_tentativas'`. Para a leitura, ALARGAR o alias próprio `MotivoSlotsPublicos` (linha 132-133) — decisão 01-18: cada alias diz o que o SEU produtor produz; não tocar `MotivoLeituraPublica`.

**3. Condição esperada sem Sentry Issue + evento de funil protegido** — o ramo 23P01 (linhas 521-530) é o espelho exato de "bloqueio de rate limit é rotina":

```typescript
if (agError?.code === '23P01') {
    // Funil: abandono por double-booking, mesmo padrão protegido de :442-446.
    try {
        capturarEventoTenant('booking_failed', tenantId, { motivo: 'slot_indisponivel' })
    } catch (analyticsErr) {
        console.error('[analytics] booking_failed não capturado (ignorado):', analyticsErr)
    }
    return { ok: false, motivo: 'slot_indisponivel' }
}
```
→ Bloqueio por IP/telefone segue esta forma: telemetria protegida por `try/catch` que nunca afeta o `return`, discriminante `muitas_tentativas`, ZERO `reportarExcecao`. Só o teto por tenant (D-12) e a falha do Redis (D-02) escalam a Issue — aí o analog é o padrão de `reportarFalhaSilenciosa` da linha 245-248 (mensagem sintética estática + contexto `{ fluxo, etapa }` sem dado do visitante), trocado pela variante **aguardada**.

**4. Bloqueio de IP ANTES do tenant existir** → usar `capturarEventoServidor` (não `capturarEventoTenant`) — a variante sem tenant já existe em `analytics/server.ts:60`.

---

### `src/app/book/[slug]/mensagens.ts` (copy do discriminante novo)

**Analog:** o próprio arquivo — o padrão de constante nova é `COPY_EMAIL_INVALIDO` (linhas 75-81, o último membro adicionado):

```typescript
export const COPY_EMAIL_INVALIDO = 'E-mail inválido. Confira o endereço ou deixe o campo em branco.'
```
→ Criar `COPY_MUITAS_TENTATIVAS = 'Muitas tentativas seguidas. Aguarde um instante e tente de novo.'` (redação contratada no D-07) com JSDoc explicando a causa.

**Os dois `Record` exaustivos** (linhas 110-121 e 137-146) quebram o `tsc` até ganharem a entrada — por construção:

```typescript
const COPIA_DA_CAIXA_DE_HORARIOS: Record<MotivoPublico, string> = {
    // ...
    // `email_invalido` só existe no caminho de ESCRITA; nunca chega à caixa de
    // horários. O membro existe aqui apenas para manter o Record exaustivo.
    email_invalido: COPY_ERRO_SLOTS,
}
```
→ `muitas_tentativas` na caixa de horários mapeia para `COPY_ERRO_SLOTS` existente (D-10, zero copy nova na leitura); em `COPIA_DO_ENVIO` mapeia para `COPY_MUITAS_TENTATIVAS`. Nunca adicionar `default` — o exaustivo é o desenho (Pitfall 5).

---

### `src/app/book/[slug]/BookingApp.tsx` (honeypot + roteamento do motivo)

**Analog:** o próprio arquivo, dois pontos.

**1. Roteamento por discriminante no submit** (linhas 279-300) — o ramo de `muitas_tentativas` cai no `else` genérico já existente, SEM código novo de roteamento:

```typescript
} else if (res.motivo === 'slot_indisponivel') {
    // Recuperação de double-booking: ...
} else {
    setErroEnvio(mensagemDeEnvio(res.motivo))
}
```
→ `mensagemDeEnvio` já resolve a copy nova via o `Record`. O trabalho no componente é só o honeypot.

**2. Leitura do form + campo novo** — o submit handler lê `formData` (linhas 261-262):

```typescript
const nomeInformado = String(formData.get('nome') ?? '').trim()
const telefoneLimpo = String(formData.get('telefone') ?? '').replace(/\D/g, '')
```
→ Ler o campo honeypot do mesmo jeito (`String(formData.get('<nome-fora-do-vocabulario-de-autofill>') ?? '')`) e passá-lo como campo opcional novo de `AgendamentoPublicoParams` na chamada de `criarAgendamentoPublico` (linhas 272-278). O `<input>` em si vive em `EtapaContato` (`src/app/book/[slug]/etapas/EtapaContato.tsx` — o form é `id="form-contato"`); atributos exigidos pelo Pitfall 6: `autocomplete="off"`, `tabIndex={-1}`, `aria-hidden="true"`, ocultação por posicionamento off-screen (não `display:none`), `name` fora do vocabulário de autofill.

**Sucesso falso na action** — a forma do retorno deve ser idêntica a `AgendamentoCriado` (public-booking.ts:160-164, `{ id, data_hora, status }`); o RESEARCH §Pattern 5 traz o snippet.

---

### `src/lib/env.ts` (env vars do Redis)

**Analog:** o próprio arquivo — precedente citado no comentário (b), linhas 12-15: a Phase 1 acrescentou `QSTASH_NEXT_SIGNING_KEY` como "uma linha, nenhum caminho novo".

```typescript
export const OBRIGATORIAS_EM_PRODUCAO = [
    // ...
    'QSTASH_NEXT_SIGNING_KEY',
    // ...
] as const
```
→ Acrescentar `'UPSTASH_REDIS_REST_URL'` e `'UPSTASH_REDIS_REST_TOKEN'` (ou os nomes escolhidos) à lista. Nada mais. Teste analog: `src/lib/__tests__/env.test.ts` (estender).

---

### `src/lib/observabilidade/log.ts` (códigos novos + possível variante aguardada)

**Analog:** o próprio arquivo + `reportar.ts` para a variante aguardada.

**Códigos novos em `MENSAGENS_LOG`** (linhas 53-97) — seguir a convenção `dominio.evento` com frase amigável em pt-BR:

```typescript
export const MENSAGENS_LOG: Record<string, string> = {
    'qstash.lembrete.falha_http': 'Falha HTTP ao agendar lembrete no QStash',
    // ...
}
```
→ Entradas novas do tipo `'ratelimit.bloqueio': 'Requisição pública bloqueada por rate limit'`, `'honeypot.captura': '...'`. Atributo novo (ex.: `camada`, `chaveHash`) exige entrada em `AtributosLogOperacional` (linhas 15-30) **e** em `CHAVES_PERMITIDAS_LOG` (linhas 32-47) **e** asserção em `log.test.ts` — allowlist é fechada, com teste.

**Variante aguardada de `logOperacional`** (Pitfall 3 / Open Question 4): espelhar a diferença `reportarExcecao` → `reportarExcecaoAguardando` de `reportar.ts:23-59` — mesma emissão, mas com `await import('@sentry/nextjs')` + `await Sentry.flush(2000)` em vez de `void import(...).then(...)`. A versão fire-and-forget de `log.ts:141-151` (`void import('@sentry/nextjs').then(...)`) é exatamente o mecanismo que perdeu o evento no incidente 260724 — não usar em ponto imediatamente anterior a `return` de Server Action.

---

### `src/lib/__tests__/rate-limit.test.ts` + extensões de teste (NOVOS/estendidos)

**Analog:** `src/app/actions/__tests__/public-booking-validacao.test.ts` — o padrão completo de suíte hermética com mock hoisted e asserção do negativo:

**Mock hoisted + prova do negativo** (linhas 28-46):

```typescript
const { createAdminClientMock } = vi.hoisted(() => ({ createAdminClientMock: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: createAdminClientMock }))

/** Consulta encadeável que resolve sempre vazia — nenhuma linha, nenhum erro. */
function consultaVazia() {
    const consulta = {
        select: () => consulta,
        eq: () => consulta,
        order: () => consulta,
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({ data: null, error: null }),
    }
    return consulta
}
```

**Fixture válida + estragar UM campo** (linhas 52-64) e **asserção central** (linhas 73-77):

```typescript
expect(resultado.ok).toBe(false)
if (!resultado.ok) expect(resultado.motivo).toBe('campos_obrigatorios')
// A prova de "recusou antes de tocar o banco": o cliente privilegiado
// nunca foi instanciado.
expect(createAdminClientMock).not.toHaveBeenCalled()
```
→ Para a fase: `vi.mock` de `@upstash/ratelimit` (ou do módulo `@/lib/rate-limit`); asserções "bloqueio de IP recusa SEM chamar `createAdminClient`", "honeypot devolve `ok: true` SEM chamar `createAdminClient`", "limiter que rejeita → `ok: true` (fail-open) + `reportarFalhaSilenciosaAguardando` chamada".

**Teste de allowlist** — analog `src/lib/observabilidade/__tests__/log.test.ts:14-48`: entrada com PII deliberada (`telefone`, `orgId`...) + `expect(limpo).not.toHaveProperty(...)`. Estender com os atributos novos de rate limit.

**Teste de copy** — `src/app/book/__tests__/mensagens.test.ts` (estender): copy do D-07 travada byte a byte contra a constante.

## Shared Patterns

### Observabilidade de condição esperada vs. incidente
**Fonte:** `public-booking.ts:521-530` (23P01) vs. `:245-248` (`reportarFalhaSilenciosa`)
**Aplicar a:** todos os pontos de bloqueio
Regra: bloqueio rotineiro (IP/telefone, honeypot) = `logOperacional.warn` + PostHog, nunca Issue; teto de tenant e Redis fora do ar = Issue via variante **aguardada** com mensagem sintética estática (`ratelimit:teto_tenant_atingido`, `ratelimit:redis_unavailable`) e contexto só com rótulos (`{ fluxo, etapa, camada }`) — nunca dado do visitante.

### Pseudonimização
**Fonte:** `src/lib/observabilidade/hash.ts` (sha256 + `ANALYTICS_TENANT_SALT` + `.slice(0, 16)`)
**Aplicar a:** chave do Redis (telefone, IP, tenant) e todo atributo de telemetria. Invariante nunca-PII do projeto — vale também para o store do fornecedor terceiro (Upstash).

### Comentários de intenção em pt-BR
**Fonte:** todo o arquivo `public-booking.ts` — cada decisão não óbvia tem o porquê escrito junto ao código (ex.: linhas 676-698). Código novo da fase segue o mesmo estilo: JSDoc curto em exports, comentário de racional em cada guarda.

### Prettier/estilo
`tabWidth: 4`, sem `;`, aspas simples, `printWidth: 100` — o hook reformata; não lutar contra.

## No Analog Found

| Arquivo | Role | Data Flow | Motivo |
|---|---|---|---|
| — (parcial) `src/lib/rate-limit.ts` | service | guarda com estado remoto | Não existe consumidor de `@upstash/redis`/`@upstash/ratelimit` no repo (só `@upstash/qstash` via fetch em `notificacoes-agendamento.ts`). A API da lib vem do RESEARCH §Patterns 1-2 e da skill `.agents/skills/upstash/upstash-ratelimit-js/`; o "envelope" do módulo (no-op, nunca-lança, contrato no cabeçalho) vem dos analogs acima. ⚠️ RESEARCH marcou `@upstash/ratelimit` como [SUS] (metadado de repo ausente) — planner deve inserir `checkpoint:human-verify` antes do install |

## Metadata

**Escopo da busca:** `src/lib/`, `src/lib/observabilidade/`, `src/lib/analytics/`, `src/app/actions/` (+ `__tests__`), `src/app/book/[slug]/`
**Arquivos lidos:** 9 (public-booking.ts, log.ts, reportar.ts, hash.ts, env.ts, analytics/server.ts, mensagens.ts, BookingApp.tsx, testes de validação/log)
**Data de extração:** 2026-07-27
