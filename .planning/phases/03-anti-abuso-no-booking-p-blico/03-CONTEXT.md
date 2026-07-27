# Phase 3: Anti-abuso no booking público - Context

**Gathered:** 2026-07-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Um script repetindo requisições não consegue lotar a agenda de um profissional, e o
cliente legítimo não percebe absolutamente nada. Cobre ABU-01 a ABU-03.

A fase entrega três proteções sobre a superfície pública existente (as três Server
Actions de `src/app/actions/public-booking.ts` — desde a Phase 01 elas são o **único**
caminho: a Data API `anon` foi revogada, então rate limit na action deixou de ser teatro):

1. **Rate limit em camadas** (ABU-01): chave composta por camada — IP folgado, telefone
   normalizado apertado, `tenant_id` como teto horário — sobre a escrita
   (`criarAgendamentoPublico`), mais teto folgado por IP nas leituras (`obterSlotsPublicos`,
   `obterDadosBookingPublico`). Sempre `slidingWindow`, nunca `fixedWindow`.
2. **Honeypot com sucesso falso** (ABU-01): campo invisível no formulário público; bot que
   preenche recebe tela de sucesso e vai embora — sem agendamento criado, sem WhatsApp
   disparado.
3. **Visibilidade do owner** (ABU-03): bloqueios contados nos pilares de observabilidade
   existentes (PostHog + Sentry Log), com escalação a Sentry Issue apenas no estouro do
   teto por tenant.

**Não** adiciona fricção visível: nenhum CAPTCHA, nenhum campo visível novo, nenhum
atraso perceptível (ABU-02). Fricção Zero é inegociável.

A exclusion constraint da Phase 02 já impede sobreposição — o abuso residual que esta
fase fecha é encher **slots distintos** em massa e martelar leitura por volume.

</domain>

<decisions>
## Implementation Decisions

### Backend do contador

- **D-01:** Upstash Redis com `@upstash/ratelimit` (`slidingWindow`). A decisão pendente
  do owner registrada no ROADMAP foi tomada nesta discussão: Redis vence a RPC atômica no
  Postgres porque contador de abuso em endpoint anônimo não deve competir pelo orçamento
  de escrita do Supabase Free (o atacante decidiria quantos writes o banco gasta), a lib
  traz `slidingWindow` pronto via HTTP/REST, e o fornecedor já está contratado (mesma
  conta do QStash). A alternativa RPC/Postgres deve ser **documentada como não escolhida**
  (exigência do ROADMAP: "escolher um e desprovisionar ou documentar o outro").
  — **Reversibility:** costly — trocar de backend depois exige reimplementar a janela
  deslizante e re-provisionar; nenhuma migration, mas toca todos os pontos de checagem.
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

### Superfícies e resposta ao bloqueio

- **D-06:** escrita protegida pelas três camadas compostas; leituras protegidas apenas
  por teto de IP **bem folgado** — um cliente legítimo navegando o calendário gera
  dezenas de chamadas de `obterSlotsPublicos` em minutos e **nunca** pode esbarrar no
  limite (SC2). — **Reversibility:** reversible.
  - *Ratificação de desvio (owner, 2026-07-27, durante o plan-phase):* nesta fase apenas
    `obterSlotsPublicos` ganha o teto de leitura; `obterDadosBookingPublico` fica fora
    porque seu contrato `null→notFound()` transformaria bloqueio em 404 para visitante
    legítimo (violação de ABU-02 pior que o risco coberto). Reavaliação em fase futura se
    necessário. A decisão original acima permanece como escrita.
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

### Visibilidade do owner (ABU-03)

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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Escopo e requisitos desta fase
- `.planning/ROADMAP.md` §"Phase 3: Anti-abuso no booking público" — Goal, 3 Success
  Criteria e notas de execução (chave composta por camada; `slidingWindow` nunca
  `fixedWindow`; honeypot com sucesso falso; calibrar com dado real)
- `.planning/REQUIREMENTS.md` — ABU-01, ABU-02, ABU-03
- `.planning/ROADMAP.md` §"Dependências duras" — Phase 1 (hardening da Data API) precede
  o rate limit; satisfeita: o INSERT `anon` foi revogado, a action é o único caminho

### Insumo herdado das Phases 01/02
- `.planning/phases/01-hardening-da-superf-cie-p-blica/01-CONTEXT.md` — padrão de retorno
  discriminado; `createAdminClient` no caminho público
- `.planning/phases/02-integridade-da-agenda/02-CONTEXT.md` — D-05 (23P01 →
  `slot_indisponivel` sem Sentry: perda de corrida é condição esperada — mesmo racional
  vale para bloqueio de rate limit)
- `.planning/STATE.md` §"⛳ Quick task 260724" — baseline de observabilidade que esta fase
  REUSA (nunca reimplementar): `logOperacional`, variantes `*Aguardando`, mensagens
  sintéticas estáticas, pseudonimização

### Observabilidade (contrato para código novo)
- `src/lib/observabilidade/log.ts` — `logOperacional` com allowlist fechada de atributos
  (atributos novos de rate limit entram na allowlist com teste)
- `src/lib/observabilidade/reportar.ts` — `reportarFalhaSilenciosaAguardando` /
  `reportarExcecaoAguardando` (obrigatórias em Server Action)
- `src/lib/observabilidade/hash.ts` — `tenantHash` (padrão de pseudonimização a estender
  para telefone/IP)
- `src/lib/analytics/server.ts` — `capturarEventoTenant` (evento PostHog server-side,
  no-op sem credenciais)
- `docs/09-OBSERVABILIDADE_E_EMAIL.md` — travas anti-PII e fail-fast de env
- `docs/06-MENSAGERIA_E_WHATSAPP.md` — mapa de estados dos quatro pilares (referência de
  como estados novos são catalogados)

### Código que a fase modifica
- `src/app/actions/public-booking.ts` — as três actions públicas
  (`criarAgendamentoPublico:337`, `obterDadosBookingPublico:581`, `obterSlotsPublicos:671`);
  a checagem de rate limit entra na fronteira, ANTES de `createAdminClient()` e da
  resolução do slug (padrão do 01-18: recusar de graça, não depois de pagar consultas)
- `src/app/book/[slug]/mensagens.ts` — copy nova do discriminante `muitas_tentativas`
  (constante única alimenta tela e asserção de teste — padrão da Phase 01)
- `src/app/book/[slug]/BookingApp.tsx` — consumo do discriminante novo + campo honeypot
  no formulário
- `src/lib/env.ts` — env vars do Redis na lista de obrigatórias de produção

### Padrões obrigatórios do projeto
- `CLAUDE.md` §"Observabilidade da mensageria" e §"Regra de Falha Silenciosa"
- `.agents/skills/upstash/SKILL.md` — referência de SDKs Upstash (Ratelimit/Redis)
- `docs/PENDENCIAS.md` — atualizar se a fase criar/adiar tarefas (Definition of Done §6)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Discriminante `MotivoPublico` + retorno `{ ok: false, motivo }` (`public-booking.ts`):
  `muitas_tentativas` é um membro novo no padrão existente; o `BookingApp` já roteia por
  `res.motivo`.
- Caixa de erro de slots da Phase 01 (copy em `mensagens.ts`): reusada como resposta ao
  bloqueio de leitura (D-10) — zero comportamento novo na UI de leitura.
- Quatro pilares de observabilidade da quick task 260724: D-11/D-12 são consumidores, não
  reimplementação. Allowlist de `log.ts` é fechada — atributos novos exigem edição da
  lista + teste.
- `formatarTelefone`/sanitização `replace(/\D/g, '')` já normaliza o telefone — a chave da
  camada D-08 usa o telefone já normalizado pela action.
- `@upstash/qstash` já está em `package.json`; `@upstash/ratelimit` + `@upstash/redis`
  são dependências novas do mesmo fornecedor.

### Established Patterns
- Validação na fronteira da Server Action ANTES de qualquer I/O (Phase 01, plano 01-18) —
  o rate limit é mais uma guarda de fronteira, na mesma posição.
- Erro esperado = valor de retorno discriminado, nunca `throw` (em produção o React só
  transporta o digest). Bloqueio de rate limit é condição esperada: **não** vai ao Sentry
  como Issue (exceto D-12) — espelha o 23P01 da Phase 02.
- Env obrigatória em produção derruba o boot (`env.ts`); variável nova que falharia em
  silêncio entra na lista (regra escrita no CLAUDE.md).
- Suíte `pnpm test` é hermética por desenho; prova que toca serviço externo é opt-in
  (`EXIGIR_INTEGRACAO=1`).

### Integration Points
- `criarAgendamentoPublico` é também o ponto onde o honeypot é avaliado — a action decide
  "sucesso falso" antes de tocar banco/engine/mensageria.
- PostHog server-side via `capturarEventoTenant` (não-bloqueante, `after()`); eventos de
  bloqueio entram no mesmo canal do funil existente.
- Provisionamento Upstash (2 databases Redis + env vars no Railway) é ação do owner e
  gate de execução — sem ele, produção não sobe (D-04).

</code_context>

<specifics>
## Specific Ideas

- O owner escolheu **erro honesto** no rate limit da escrita justamente pelo cenário
  CGNAT: "sucesso falso para uma pessoa real = ela acha que agendou e não agendou" é o
  desfecho que ele considera pior que qualquer abuso — a dissuasão máxima perde para a
  confiança do cliente final.
- O owner aceitou que o teto por tenant (D-09) **não impede** o enchimento total do
  horizonte — o papel dele é desacelerar o ataque para a observabilidade (D-11/D-12) dar
  tempo de reação humana. O SC1 se prova pela combinação das camadas, não por uma só.
- A escalação de Issue (D-12) foi escolhida para o cenário "ataque às 3h da manhã": sem
  ela, o ataque só aparece quando o owner abre o PostHog.

</specifics>

<deferred>
## Deferred Ideas

- **Mostrar ao profissional (tenant B2B) os bloqueios da própria página pública** — tela
  nova de dashboard, capacidade nova fora do escopo; se virar requisito, candidata a fase
  futura de autonomia/transparência do profissional.

</deferred>

---

*Phase: 03-anti-abuso-no-booking-publico*
*Context gathered: 2026-07-27*
