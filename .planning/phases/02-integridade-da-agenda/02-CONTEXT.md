# Phase 2: Integridade da agenda - Context

**Gathered:** 2026-07-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Dois clientes nunca ocupam o mesmo horário do mesmo profissional, e o tamanho de um
agendamento não muda depois que ele foi marcado. Cobre AGE-01 a AGE-05.

A fase entrega quatro garantias de integridade, todas sobre dados que **já existem**:

1. **Duração congelada** (AGE-01/AGE-02): o agendamento passa a guardar o próprio horário
   de término (`data_hora_fim`), imune a edições posteriores da duração do serviço e à
   desativação do serviço. A engine deixa de derivar ocupação do join com `servicos` (e do
   fallback `|| 30`).
2. **Proteção atômica contra double-booking** (AGE-03/AGE-04): exclusion constraint no
   banco (`btree_gist` + `tstzrange` + `EXCLUDE ... tenant_id WITH =, periodo WITH && WHERE
   status <> 'cancelado'`), fechando a janela TOCTOU entre validar o slot e inserir. Vale
   nos dois fluxos de escrita: público (`createAdminClient`) e walk-in do dashboard
   (autenticado).
3. **Mensagem amigável na perda de corrida** (AGE-04): quem perde a corrida vê cópia
   honesta, nunca a mensagem do PostgreSQL com `org_id`/horário de terceiro.
4. **Dedupe atômico de cliente** (AGE-05): unique `(tenant_id, telefone)` convertendo o
   select-then-insert em upsert atômico.

**Não** adiciona capacidade nova ao produto. Fricção Zero é inegociável — nenhuma proteção
pode adicionar etapa, campo ou atraso visível ao cliente final.

**A ordem interna é obrigatória** (ROADMAP.md), não sugestão: `data_hora_fim` preenchida
pela action → query de pré-voo → extension + coluna `periodo` + exclusion constraint +
unique de telefone. A etapa 3 não pode nem ser escrita antes da 1: hoje a duração vive em
`servicos` e uma exclusion constraint só enxerga a própria linha.

</domain>

<decisions>
## Implementation Decisions

Todas as decisões abaixo são de **comportamento/produto** — a mecânica de banco
(tipo das colunas, extension, forma da constraint, waves) está travada no ROADMAP.md
§"Phase 2" e é discrição técnica do planner/researcher.

### Dedupe de cliente reincidente (AGE-05)

- **D-01: upsert atômico com COALESCE — preenche só o que falta, nunca sobrescreve.** O
  `ON CONFLICT (tenant_id, telefone) DO UPDATE` grava `nome = COALESCE(clientes.nome,
  EXCLUDED.nome)` e `email = COALESCE(clientes.email, EXCLUDED.email)`, retornando o `id`.
  Um cliente reincidente que informou um e-mail que antes faltava passa a tê-lo gravado
  (insumo direto da Phase 5, que reconhece por e-mail); um nome/e-mail que o profissional
  já curou no dashboard **nunca** é sobrescrito pela página pública. Substitui o
  select-then-insert de `public-booking.ts:463-511`, que era não-atômico (duas requisições
  simultâneas com o mesmo telefone criavam duas linhas). — **Reversibility:** costly — o
  unique `(tenant_id, telefone)` é migration; a política COALESCE em si é local à action.

### Congelamento e remarcação da duração (AGE-01/AGE-02)

- **D-02: a duração congela no ato da reserva e é lida de `data_hora_fim`, não do serviço.**
  A engine (`booking-engine.ts:311-321`) deixa de calcular `end` a partir de
  `ag.servicos?.duracao_minutos || 30` e passa a usar `data_hora_fim`. Isso fecha AGE-01
  (editar a duração do serviço não move o término de agendamentos já marcados) e AGE-02
  (serviço desativado continua ocupando o tempo reservado — nunca mais o `|| 30`) de uma
  vez. — **Reversibility:** one-way — `data_hora_fim NOT NULL` é migration imutável após a
  Phase 11.
- **D-03: remarcar mantém a duração ORIGINAL reservada.** `remarcarAgendamento`
  (`agendamentos.ts:437`, hoje `Number(servicoObj?.duracao_minutos) || 30`) passa a
  calcular `novo data_hora_fim = nova data_hora + (data_hora_fim − data_hora) original`.
  Remarcar é o mesmo agendamento em outro horário — o tamanho reservado não muda, coerente
  com o goal da fase. Pegar a duração vigente do serviço reabriria parcialmente o bug que a
  fase fecha. — **Reversibility:** reversible.

### Colisão no walk-in do dashboard (AGE-03/AGE-04, SC3/SC4)

- **D-04: no walk-in, aviso amigável COM o detalhe do agendamento que ocupa o horário.**
  Quando o INSERT do walk-in (`criarAgendamentoManual`, `agendamentos.ts:350`) falha com
  `23P01` (exclusion_violation), a action busca o agendamento conflitante do próprio tenant
  (período sobreposto, `status <> 'cancelado'`) e devolve cliente + serviço para a UI, que
  exibe o aviso e **recarrega a agenda**. É legítimo mostrar o detalhe porque é a agenda do
  próprio profissional — não há dado de terceiro em jogo (diferente do fluxo público). O
  que **nunca** aparece é a mensagem crua do PostgreSQL. — **Reversibility:** reversible.
- **D-05: no fluxo público, o erro `23P01` mapeia para o discriminante `slot_indisponivel`
  já existente — não para `erro_interno`.** O caminho da mensagem amigável (SC4) já foi
  construído na Phase 01 (plano 01-12): `criarAgendamentoPublico` devolve `{ ok: false,
  motivo: 'slot_indisponivel' }` e o `BookingApp` já consome esse discriminante (solta o
  slot morto, refaz a grade, mostra o aviso âmbar). A Phase 2 só precisa **discriminar** o
  `23P01` no `catch`/checagem de erro do INSERT (`public-booking.ts:526`) e roteá-lo para
  `slot_indisponivel`, **sem** reportá-lo ao Sentry (é condição esperada de corrida, não
  exceção). Hoje qualquer `agError` cai em `erro_interno` + `reportarExcecao`, o que
  violaria o SC4. — **Reversibility:** reversible.

### Backfill dos dados existentes (AGE-01/AGE-03)

- **D-06: limpar os agendamentos de teste antes de aplicar a constraint.** O banco dev é
  descartável e migration destrutiva está autorizada (ROADMAP.md §"Rede de proteção do
  banco"). Em vez de backfillar `data_hora_fim` de agendamentos de teste e resolver
  eventuais sobreposições/duplicatas de telefone à mão, apagar os agendamentos de teste
  para aplicar `data_hora_fim NOT NULL`, a exclusion constraint e o unique de telefone em
  terreno limpo — o pré-voo obrigatório do ROADMAP encontra zero violadoras.
  - **Nota para o planner:** a migration em si (adiciona coluna nullable → backfill → `NOT
    NULL`) precisa continuar existindo e ser correta, porque é a **mesma** que roda em
    produção no go-live (Phase 11 congela migrations, e produção começa limpa via OPE-04).
    A limpeza de dev NÃO substitui o passo de backfill dentro da migration; ela só garante
    que o pré-voo de dev não tropece em dados de teste inconsistentes. Preservar o tenant
    do owner (alinhado a OPE-04) — a limpeza é dos **agendamentos**, não da estrutura nem
    do perfil. — **Reversibility:** one-way — dados apagados em dev não voltam (aceito: são
    descartáveis).

### Claude's Discretion

- Ordem interna das tarefas e agrupamento em waves (respeitando a ordem obrigatória do
  ROADMAP: `data_hora_fim` → pré-voo → constraint).
- Coluna gerada `periodo tstzrange` vs trigger `BEFORE INSERT OR UPDATE` — o ROADMAP marca
  confiança MÉDIA-ALTA na imutabilidade do construtor `tstzrange` em coluna gerada e define
  o trigger como plano B. Validar empiricamente e escolher.
- Forma exata dos testes (unitários da engine sobre `data_hora_fim`, prova de atomicidade
  do double-booking, prova do upsert COALESCE).
- Redação das cópias em pt-BR (o discriminante público já existe em
  `src/app/book/[slug]/mensagens.ts`; a cópia do walk-in é nova no dashboard).
- Como buscar o agendamento conflitante do walk-in (D-04) sem vazar mais que cliente +
  serviço.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Escopo e requisitos desta fase
- `.planning/ROADMAP.md` §"Phase 2: Integridade da agenda" — Goal, 5 Success Criteria,
  **ordem interna obrigatória** e notas de execução (NOT VALID não existe para exclusion
  constraint; `tenant_id WITH =` obrigatório; predicado `status <> 'cancelado'`; coluna
  gerada vs trigger)
- `.planning/ROADMAP.md` §"Regra transversal de aceite" — query de pré-voo obrigatória
  antes de toda migration que aperta constraint (vale para a exclusion constraint E o
  unique de `clientes`)
- `.planning/REQUIREMENTS.md` — AGE-01 a AGE-05
- `.planning/ROADMAP.md` §"Dependências duras" — Desnormalização da duração precede a
  exclusion constraint (ambas nesta fase, nesta ordem); Phase 2 (exclusion constraint)
  precede Phase 8 (remarcação pública)

### Insumo herdado da Phase 01 (crítico para o SC4)
- `.planning/phases/01-hardening-da-superf-cie-p-blica/01-CONTEXT.md` — D-02
  (`createAdminClient` no caminho público), padrão de retorno discriminado
- `.planning/STATE.md` — plano 01-12 desbloqueou o SC4: o erro esperado atravessa a
  fronteira de flight como valor de retorno (`res.motivo === 'slot_indisponivel'`), não
  mais como `throw` (que vira `1:E{"digest":…}` em produção)

### Padrões obrigatórios do projeto
- `docs/03-PADROES_DE_BANCO_DE_DADOS.md` — schema declarativo, RLS granular por ação,
  nomenclatura pt-BR, `COMMENT ON`, `auth.jwt()` em subquery; §"Privilégios da Data API"
  (funções novas nascem sem `EXECUTE` para `PUBLIC` — relevante se a fase criar RPC)
- `docs/SUPABASE_DECLARATIVE-DATABASE-SCHEMA.md` — exceções ao fluxo declarativo (a
  extension `btree_gist`, GRANT/REVOKE e outros privilégios são migration escrita à mão;
  `db diff` não os emite)
- `.agents/skills/supabase/SKILL.md` e `.agents/skills/supabase-postgres-best-practices/SKILL.md`
- `CLAUDE.md` §"Banco de dados: schema declarativo" e §"Engine de disponibilidade"

### Código que a fase modifica
- `src/lib/booking-engine.ts:311-321` — onde a ocupação é derivada de `data_hora`; passa a
  ler `data_hora_fim` em vez do join `servicos ( duracao_minutos ) || 30`
- `src/app/actions/public-booking.ts:463-524` — select-then-insert de cliente (vira upsert)
  e INSERT do agendamento (grava `data_hora_fim`; `23P01` → `slot_indisponivel`)
- `src/app/actions/agendamentos.ts:236-399` — `criarAgendamentoManual` (walk-in: grava
  `data_hora_fim`; trata `23P01` com detalhe) e `remarcarAgendamento:401-465` (duração
  original congelada)
- `supabase/schemas/05_agendamentos.sql` e `supabase/schemas/06_clientes.sql` — coluna
  `data_hora_fim`, `periodo`, exclusion constraint, unique `(tenant_id, telefone)`,
  `COMMENT ON`
- `src/app/book/[slug]/mensagens.ts` — cópia pt-BR do discriminante público (já existe;
  `slot_indisponivel` já mapeado)

### Contrato anti double-booking (não quebrar)
- `src/lib/booking-engine.ts` §`obterSlotsDisponiveis` — o formato da saída é contrato: a
  action pública re-executa a engine e valida por igualdade exata de `datetime` antes do
  INSERT. A exclusion constraint é a segunda linha de defesa (fecha o TOCTOU), não a
  substituta dessa validação.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `createAdminClient()` (`src/lib/supabase/admin.ts`): já é o cliente do caminho público de
  escrita — o upsert de cliente (RLS bypassado) roda com ele; o walk-in usa o cliente
  autenticado (RLS por `tenant_id`).
- Discriminante `MotivoPublico` + `ResultadoAgendamentoPublico` (`public-booking.ts:104-178`):
  `slot_indisponivel` já existe e já é consumido pelo `BookingApp`. A fase reusa, não cria.
- Engine de disponibilidade com ~442 linhas de teste puro: o congelamento de duração (D-02)
  muda **uma** fonte de dado (`data_hora_fim` em vez do join), preservando as funções puras
  (`calcularIntervalosLivres`, `gerarSlotsAntiBuraco`).
- Guarda de profundidade já existente em `gerarSlotsAntiBuraco` e validação de entrada em
  `obterSlotsPublicos`/`obterSlotsDashboard` (Phase 01, planos 01-18): a fase não reintroduz
  essa superfície.

### Established Patterns
- Server Actions como única via de mutação; erro esperado é **valor de retorno
  discriminado**, nunca `throw` (medido na Phase 01: em produção o React só transporta o
  `digest`). O mapeamento `23P01 → slot_indisponivel` segue esse padrão.
- Condição esperada de negócio **não** vai ao Sentry; falha inesperada vai por
  `reportarExcecao`/`reportarFalhaSilenciosa`. Perda de corrida (`23P01`) é esperada — não
  reportar.
- RLS granular por ação com `(SELECT auth.jwt() ->> 'org_id')` em subquery; a exclusion
  constraint **bypassa RLS por design** (checagem de integridade) — por isso `tenant_id
  WITH =` é obrigatório na constraint, senão um visitante mapeia a agenda de qualquer tenant
  por tentativa-e-erro.

### Integration Points
- `supabase/schemas/*.sql` em ordem lexicográfica (respeita FKs); a extension `btree_gist`
  e os privilégios são migration manual (não sai de `db diff`).
- `vitest.config.ts`: suíte hermética por padrão; a suíte de integração que toca o banco é
  opt-in por `EXIGIR_INTEGRACAO=1` (regra viva de `docs/PENDENCIAS.md`) — a prova de
  atomicidade do double-booking pertence a ela.
- `remarcarAgendamento` já existe e é reaproveitado pela Phase 8 (autonomia do cliente):
  congelar a duração aqui fixa o contrato antes.

</code_context>

<specifics>
## Specific Ideas

- O owner escolheu **COALESCE** no dedupe explicitamente para não deixar a página pública
  sobrescrever dado que o profissional curou, mas ainda capturar e-mail faltante — a
  decisão olha para a Phase 5 (contato flexível), não só para esta fase.
- O owner optou por **limpar** os agendamentos de teste em vez de backfillar dado
  descartável — coerente com "banco atual é descartável, prefira schema limpo a migrations
  incrementais". O planner ainda deve escrever o passo de backfill na migration (ela roda
  em produção depois), apenas sem depender de dados de dev para exercitá-lo.
- No walk-in, o owner quis o **detalhe do que ocupa** o horário (cliente/serviço), não a
  cópia genérica do cliente final — a assimetria B2B/B2C é intencional: o profissional é
  dono da agenda e pode ver o próprio conteúdo.

</specifics>

<deferred>
## Deferred Ideas

- **Precedência de lookup quando telefone e e-mail batem em clientes diferentes** — decisão
  de produto da **Phase 5** (contato flexível), já registrada nos Blockers do STATE. O
  unique desta fase é só `(tenant_id, telefone)`; `telefone` continua `NOT NULL` aqui e só
  vira nullable + `CHECK (telefone IS NOT NULL OR email IS NOT NULL)` na Phase 5.
- **Duração customizada por agendamento** (diferente da duração do serviço) — capacidade
  nova, fora do escopo. Hoje a duração vem sempre do serviço; a fase apenas a **congela**,
  não a torna editável por agendamento.
- **Remarcação pública sem login** (link assinado) — Phase 8. Reusa a proteção de
  sobreposição que esta fase entrega; por isso a Phase 2 precede a Phase 8.

</deferred>

---

*Phase: 02-integridade-da-agenda*
*Context gathered: 2026-07-23*
