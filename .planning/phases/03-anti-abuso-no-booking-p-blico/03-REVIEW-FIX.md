---
phase: 03-anti-abuso-no-booking-p-blico
fixed_at: 2026-07-27T00:00:00Z
review_path: .planning/phases/03-anti-abuso-no-booking-p-blico/03-REVIEW.md
iteration: 1
findings_in_scope: 13
fixed: 13
skipped: 0
status: all_fixed
---

# Phase 03: Relatório de correção da revisão de código

**Escopo aplicado:** critical + warning (CR-01..04, WR-01..09). Os três `IN-` ficaram
fora do escopo pedido e continuam abertos no `03-REVIEW.md`.

**Resumo:**

- Achados no escopo: 13
- Corrigidos: 13
- Pulados: 0

**Gates (saída real, sobre o HEAD final, worktree limpo):**

| Gate | Resultado |
|---|---|
| `pnpm lint` | exit 0 |
| `pnpm test` | **23 arquivos / 381 testes**, todos verdes (baseline: 22 / 353 → +1 arquivo, +28 casos) |
| `pnpm build` | exit 0, 14 rotas |
| `npx tsc --noEmit` | exit 0 |

Nenhum teste foi removido. Quatro asserções foram **alteradas**, todas listadas na seção
"Expectativas de teste que mudaram" — nenhuma delas foi ajustada para acomodar a mudança:
as quatro pinavam o comportamento que a revisão apontou como defeito.

---

## Correções aplicadas

### CR-01: extração de IP confiava na primeira entrada de `x-forwarded-for`

**Arquivos:** `src/lib/rate-limit.ts`, `src/lib/__tests__/rate-limit.test.ts`
**Commit:** `c0ca2ce`
**Status:** corrigido — **exige verificação humana** (medição pendente, ver abaixo)

`ipDoVisitante` passou a preferir `x-real-ip` (header de valor único posto pelo proxy, que
o cliente não consegue estender — e que o próprio repo já documenta como presente em toda
requisição da Railway, em `observabilidade/sanitizacao.ts`). O fallback lê a entrada **mais
à direita** de `x-forwarded-for`, e **só ela**: cair para a penúltima quando a última é lixo
devolveria a escolha do balde ao atacante, que controla tudo à esquerda do que o proxy
anexou. Acrescentei validação de forma (`normalizarIp` + `ehIpPlausivel`, cobrindo IPv4,
IPv6 e as duas formas com porta) — sem ela, `x-real-ip: <string aleatória>` compra uma
janela nova por requisição e a camada deixa de contar IPs para contar strings.

**O que não foi resolvido por código, de propósito:** a ordem escolhida é estritamente
mais difícil de forjar que a anterior, mas continua sendo *inferência*. A medição que a
revisão pede (`curl` com headers forjados contra o deploy) foi registrada como item **(d)**
das verificações manuais da Phase 03 em `docs/PENDENCIAS.md`, com o caso de falha nomeado:
se a Railway tiver mais de um hop anexando ao XFF e não puser `x-real-ip`, a entrada mais à
direita seria o IP interno do edge e somaria visitantes distintos num balde só.

---

### CR-02: `teto_tenant` contava tentativas, não criações

**Arquivos:** `src/lib/rate-limit.ts`, `src/app/actions/public-booking.ts`,
`src/lib/__tests__/rate-limit.test.ts`,
`src/app/actions/__tests__/public-booking-validacao.test.ts`
**Commit:** `6e0bb9b`
**Status:** corrigido — **exige verificação humana** (mudança de semântica de contagem)

Separei leitura de consumo, que é o que devolve significado ao número:

- `verificarLimiteSemConsumir` (nova, usa `getRemaining`) decide **antes** do trabalho caro,
  sem gastar token.
- `verificarLimite('teto_tenant', …)` passou a ser chamada **depois do INSERT
  bem-sucedido** — o token sai quando um agendamento real entra na agenda.

**Detalhe que a sugestão da revisão não cobria e que teria virado um bug novo:**
`getRemaining` **não** recebe o `timeout` da lib — medido no fonte instalado, `applyTimeout`
embrulha só o `limit()`. Adotá-la crua teria criado a única consulta do módulo sem teto de
latência, numa fase cujo argumento inteiro é que meio segundo de espera extra já é
inaceitável. `verificarLimiteSemConsumir` traz o próprio `Promise.race` de 500 ms com
fail-open e o mesmo reporte sintético.

**Fecha junto o WR-02.** Com o tenant apenas consultando, o `Promise.all` deixa de
contaminar — e essa é uma solução melhor que a sequência sugerida no WR-02, porque o
cliente legítimo continua pagando a latência de **uma** ida ao Redis, não de duas somadas
(ABU-02/D-06). Sequenciar teria corrigido a contaminação cobrando fricção de quem não fez
nada errado.

---

### CR-03: o caminho de rejeição fazia I/O de terceiro aguardado

**Arquivos:** `src/lib/observabilidade/apos-resposta.ts` (novo), `src/lib/rate-limit.ts`,
`src/app/actions/public-booking.ts` + as duas suítes
**Commit:** `5e87c32`
**Status:** corrigido — **exige verificação humana** (os intervalos de throttle são
calibração, e calibração só se confirma com tráfego real)

Duas travas, uma para cada metade do defeito:

1. **`emitirDepoisDaResposta`** roda a emissão em `after()` do Next — o mesmo mecanismo que
   `analytics/server.ts` já usava para o PostHog. **Isto não é voltar à fire-and-forget:**
   a variante aguardada (`Sentry.flush`) continua sendo a usada dentro do callback, e o
   runtime segura a invocação até ele terminar. O evento perdido do incidente 260724
   continua impossível; o que saiu foi o flush da frente da resposta do visitante.
2. **`permitirEmissao`** (novo `src/lib/observabilidade/emissao.ts`) corta a repetição: um
   log de rotina por minuto por camada, uma Issue de teto por 15 min por tenant, uma Issue
   de Redis indisponível por minuto por camada. A chave do throttle é sempre estática (ou
   derivada de `tenantHash`, que vem do banco) — chave derivada de dado do visitante faria o
   `Map` crescer sem teto, que seria o mesmo vetor por outra porta.

**O PostHog ficou de fora do throttle, de propósito.** É ele que responde "quanto está
sendo barrado" (e, no honeypot, é o detector de autofill preenchendo o campo de uma pessoa
real). Detector amostrado não detecta. Isso deixa um **risco residual nomeado**: sob flood,
cada requisição bloqueada ainda instancia um cliente PostHog e faz `capture` + `shutdown`
— fora do caminho da resposta (`after()`), mas com custo de rede de saída. Trocar a
fidelidade da taxa por economia de I/O seria cegar justamente o instrumento da fase.

---

### CR-04: balde `'desconhecido'` transformava header ausente em queda total

**Arquivos:** `src/lib/rate-limit.ts`, `src/lib/observabilidade/emissao.ts` (novo),
`src/app/actions/public-booking.ts`, `src/lib/__tests__/rate-limit.test.ts`
**Commit:** `025690a`
**Status:** corrigido — **exige verificação humana** (é mudança de política de defesa)

`ipDoVisitante` devolve `null` quando não sabe, e `verificarLimite` responde PASSE a uma
chave que não consegue formar. Acrescentei o detector que faltava: Issue sintética estática
`ratelimit:ip_indeterminavel`, **uma vez por processo** — sinal de estado repetido a cada
requisição seria o próprio vetor de inundação do CR-03.

Escolhi o fail-open (a primeira opção da revisão) em vez de manter o balde compartilhado com
detector: manter o balde preserva um modo em que um problema de infraestrutura derruba o
booking público inteiro, e o contrato 5 do módulo e a Fricção Zero dizem o contrário. O que
se perde está escrito no código: proteção por IP some enquanto o header sumir. O que
sobrevive: as camadas de telefone e tenant no caminho de escrita, e o detector avisando.

**Fecha junto o WR-09,** com a mesma guarda: `montarChave` devolve `null` para lista vazia
e para qualquer parte em branco. Um `tenant_id` vazio numa linha bastava para o
`teto_tenant` de todos os tenants colapsar num contador só.

---

### WR-01: hash sem separação de domínio e com fallback de salt silencioso

**Arquivos:** `src/lib/observabilidade/hash.ts`,
`src/lib/observabilidade/__tests__/hash.test.ts` (novo), `src/lib/rate-limit.ts`,
`vitest.config.ts`
**Commit:** `1dc0eeb`

`hashComSal(dominio, valor)` resolve as duas metades: o domínio entra no material do hash
com separador próprio, e a ausência de salt abre Issue `hash:sem_salt` uma vez por processo.
`hashChaveRateLimit` delega com o domínio `ratelimit`, então
`hashChaveRateLimit(tenantId) !== hashTenantId(tenantId)` — a chave do contador na Upstash
deixou de ser o mesmo valor publicado no Sentry e no PostHog.

**Desvio consciente da sugestão:** `hashTenantId` e `hashAgendamentoId` **não** foram
migradas. Migrá-las mudaria os valores já publicados em telemetria, quebrando correlação com
o histórico, sem fechar nada a mais — a colisão que importava era entre o store do
fornecedor e o hash publicado, e ela morre com **um** dos dois lados mudando de domínio. A
duplicação literal das duas continua registrada como dívida cosmética.

`ANALYTICS_TENANT_SALT` entrou no `env` do vitest para que a suíte exercite o caminho
salgado, que é o único que existe em produção; a ausência tem caso de teste próprio.

---

### WR-02: `Promise.all` fazia telefone e tenant se contaminarem

**Commit:** `6e0bb9b` (junto do CR-02)

Corrigido pela mudança de semântica, não pela sequência. Ver a explicação no CR-02: a
consulta sem consumo elimina a contaminação sem cobrar a ida extra ao Redis que sequenciar
custaria ao cliente legítimo. Há asserção dedicada — "tentativa bloqueada pelo TELEFONE não
queima o token do tenant".

---

### WR-03: bloqueio de leitura mostrava cópia de falha de carregamento

**Arquivos:** `src/app/book/[slug]/mensagens.ts`, `src/app/book/[slug]/BookingApp.tsx`,
`src/app/book/[slug]/etapas/EtapaDataHora.tsx`, `src/app/book/__tests__/mensagens.test.ts`
**Commit:** `c6c43c2`

`COPIA_DA_CAIXA_DE_HORARIOS.muitas_tentativas` passou a apontar para
`COPY_MUITAS_TENTATIVAS`; os outros oito discriminantes ficaram intactos. O botão "Tentar de
novo" vira "Aguarde Ns" por 10 segundos **apenas** quando o motivo é esse — para qualquer
outra falha continua imediato, então nada disso existe para quem não foi barrado (Fricção
Zero preservada).

Concordo com o argumento da revisão contra o D-10: a fase inteira sustenta que CGNAT faz
cliente real dividir IP, e foi por isso que o caminho de escrita ganhou copy honesta. Manter
a assimetria era dar ao leitor real uma informação falsa sobre a causa, debaixo de um botão
que o convidava a queimar outro token.

---

### WR-04: asserção negativa do bloqueio de IP não cobria a variante aguardada

**Arquivo:** `src/app/actions/__tests__/public-booking-validacao.test.ts`
**Commit:** `ecd3244`

Acrescentadas `reportarFalhaSilenciosaAguardandoMock` e `reportarExcecaoAguardandoMock` ao
"NÃO abre Sentry Issue" do bloqueio de IP — o único dos três blocos fora do padrão.

---

### WR-05: honeypot dependia do global `crypto.randomUUID()`

**Arquivos:** `src/app/actions/public-booking.ts`, `package.json`
**Commit:** `98a27c0`

`import { randomUUID } from 'node:crypto'` + `"engines": { "node": ">=20" }`. Num runtime
mais antigo o global seria `ReferenceError` → 500, e 500 é exatamente a resposta que faz o
bot voltar: a falha inverteria o objetivo da armadilha no ponto mais sensível dela.

---

### WR-06: a suíte do honeypot provava texto-fonte, não geometria

**Arquivos:** `src/app/book/[slug]/etapas/EtapaContato.tsx`,
`src/app/book/__tests__/honeypot-campo.test.ts`
**Commit:** `dcea435`

Escolhi a alternativa **sem dependência nova** que a própria revisão aponta: trocar
`-left-[9999px]` por `style` inline. Elimina o modo de falha em vez de instrumentá-lo —
style inline não depende de a classe arbitrária ser gerada pelo Tailwind, e continua sendo
posicionamento (nunca `display:none`/`hidden`, que parte dos bots pula). Um teste de render
em jsdom exigiria `@testing-library/react` + `jsdom` para vigiar um risco que deixou de
existir, o que contraria a regra de simplicidade do CLAUDE.md.

---

### WR-07: a allowlist "fechada" do log validava chave, nunca valor

**Arquivos:** `src/lib/observabilidade/log.ts`,
`src/lib/observabilidade/__tests__/log.test.ts`
**Commit:** `908147b`

`sanitizarAtributosLog` passou a exigir forma de hash (16 hex) em `chaveHash`, `tenantHash`
e `agendamentoHash`. Estendi aos três em vez de só ao `chaveHash` sugerido: os três têm a
mesma forma canônica, custam a mesma linha, e deixar dois validados pela convenção do
chamador manteria metade do defeito. Descarte é silencioso — o contrato 1 (nunca lança) vale
acima de tudo, e um atributo a menos no log é melhor que um telefone a mais no fornecedor.

---

### WR-08: três afirmações da documentação não correspondiam ao código

**Arquivos:** `docs/01-ARQUITETURA_E_STACK.md`, `docs/PENDENCIAS.md`,
`src/app/actions/public-booking.ts`
**Commit:** `25997ce`

As duas primeiras afirmações voltaram a ser **verdadeiras** por causa do CR-03 e do CR-02, e
a doc passou a descrever o mecanismo além do número. A terceira (o argumento de **custo**
para `obterDadosBookingPublico` ficar fora do teto) foi **retirada** da doc e do comentário
no código: ela assume comportamento de navegador, que é precisamente o que o modelo de
ameaça rejeita no resto do arquivo. A decisão permanece — o argumento de UX a sustenta
sozinho — registrada como risco residual medido pelo eixo certo (carga no Supabase, não
número de page loads).

`docs/PENDENCIAS.md` ganhou o item **(d)** das verificações manuais da fase, referente à
medição pendente do CR-01.

---

### WR-09: `verificarLimite` não validava `partesChave`

**Commit:** `025690a` (junto do CR-04)

Mesma guarda, em `montarChave`. Casos de teste próprios para `[]`, `['']`, `['   ']`,
`[null]` e parte `undefined` numa chave composta.

---

## Expectativas de teste que mudaram

Quatro asserções foram alteradas. Nenhuma foi ajustada para acomodar código novo — as
quatro pinavam exatamente o comportamento que a revisão apontou como defeito, o que é o
caso em que reescrever a asserção é a correção e não o encobrimento dela.

1. **`rate-limit.test.ts`: "usa a PRIMEIRA entrada de x-forwarded-for"** → substituída por
   cinco casos (prioridade do `x-real-ip`, entrada mais à direita do XFF, porta/colchetes,
   recusa de valor sem forma de IP, recusa de fallback para a penúltima). A antiga era a
   descrição fiel do vetor do CR-01: um teste que exigia que o código lesse o valor que o
   atacante controla.
2. **`rate-limit.test.ts`: `ipDoVisitante()` → `'desconhecido'`** → `null`. O balde comum
   era o defeito do CR-04, não um contrato.
3. **`mensagens.test.ts`: `mensagemDeMotivo('muitas_tentativas') === COPY_ERRO_SLOTS`** →
   `COPY_MUITAS_TENTATIVAS`. A antiga travava uma copy que informa a causa errada ao
   visitante (WR-03). Acrescentei asserções de que os outros discriminantes da caixa de
   horários **não** mudaram.
4. **`honeypot-campo.test.ts`: `toMatch(/-left-\[\d{4,}px\]/)`** → asserção sobre o `style`
   inline, mais o negativo complementar (a ocultação não pode voltar a depender de classe
   gerada). A antiga era precisamente a asserção que o WR-06 descreve como incapaz de
   detectar o campo ficando visível.

Fixtures atualizadas (não são mudança de expectativa, e sim correção de fixture):
`hash_123`, `hash_456` e `abc123` viraram valores com forma de hash em `log.test.ts` —
nenhum deles corresponde ao que qualquer função de hash do projeto produz.

---

## Itens fora do escopo, ainda abertos

- **IN-01** (`console.error` por slug não resolvido contradiz o comentário do mesmo
  arquivo), **IN-02** (`MENSAGENS_LOG` mutável) e **IN-03** (honeypot ecoa `dataHora` sem
  validar) continuam abertos no `03-REVIEW.md`. O escopo pedido foi critical + warning.
  Vale notar que o IN-01 ficou **mais** relevante depois destas correções: com o teto de
  leitura em PASSE quando o IP é indeterminável (CR-04), aquela linha volta a não ter teto
  algum.
- **Verificação humana pendente (CR-01):** item (d) em `docs/PENDENCIAS.md`.
- **Calibração dos intervalos de throttle (CR-03):** 60 s para rotina e 15 min para a Issue
  de teto são escolhas defensáveis, não medidas. Só tráfego real diz se a amostragem do log
  caso-a-caso está apertada demais para investigar um incidente.

---

_Corrigido em: 2026-07-27_
_Fixer: Claude (gsd-code-fixer)_
_Iteração: 1_
