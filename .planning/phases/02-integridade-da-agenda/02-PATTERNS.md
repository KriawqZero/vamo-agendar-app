# Phase 2: Integridade da agenda - Pattern Map

**Mapped:** 2026-07-23
**Files analyzed:** 9 (7 modificados, 1 migration nova, 1 função nova de banco)
**Analogs found:** 9 / 9 — todos com precedente forte no próprio repositório

Esta fase não cria arquivos "novos por role" (nenhum controller/página/componente novo). Ela
**modifica** superfícies existentes e adiciona **um** arquivo de migration + **uma** função de
banco. Por isso os melhores analogs são, quase sempre, o próprio arquivo sendo editado (padrão a
preservar) e os precedentes de migration/função da Phase 01. Match quality abaixo é "self/exact"
quando o analog é o padrão vizinho no mesmo arquivo, "exact" quando é um precedente idêntico em
outro arquivo.

## File Classification

| Arquivo (novo/modificado) | Role | Data Flow | Analog mais próximo | Match |
|---------------------------|------|-----------|---------------------|-------|
| `src/lib/booking-engine.ts` (:282-321) | pure lib (engine) | transform / read | próprio bloco `slotsOcupados` + query `servicosAtivos` (:258-296) | self/exact |
| `src/lib/__tests__/booking-engine.test.ts` | test (unit) | — | fixtures atuais `servicos:{duracao_minutos}` (:13-72) | self/exact |
| `src/app/actions/public-booking.ts` (:463-542) | server action | CRUD / request-response | próprio ramo `slot_indisponivel` (:440-451) + `agError` (:526-542) | self/exact |
| `src/app/actions/agendamentos.ts` (:236-465) | server action | CRUD / request-response | retorno discriminado do público + `criarAgendamentoManual` atual | exact |
| `src/app/dashboard/NovoAgendamentoModal.tsx` (:236-268) | component (client island) | request-response | próprio `catch` do `confirmar` (:254-266) + caixa vermelha (:581-585) | self/exact |
| `supabase/schemas/07_agendamentos.sql` | schema (declarative DDL) | — | `03_horarios_funcionamento.sql` (CHECK, COMMENT, função) | exact |
| `supabase/schemas/06_clientes.sql` | schema (declarative DDL) | — | UNIQUE + COMMENT ON CONSTRAINT do slug (migration 185755) | exact |
| Função `reaproveitar_ou_criar_cliente` (em `06_clientes.sql` ou `00_funcoes_sistema.sql`) | db function (RPC) | CRUD (upsert) | `substituir_horarios_funcionamento` (03:77-103) | exact |
| `supabase/migrations/<ts>_integridade_agenda.sql` | migration (hand-written) | — | `20260722185755_slug_gratuito_unico.sql` + `20260722183153_*` | exact |

## Pattern Assignments

### `src/lib/booking-engine.ts` (D-02, AGE-01/AGE-02)

**Analog:** o próprio arquivo — dois blocos vizinhos que NÃO devem se confundir.

**Query de ocupação a MODIFICAR** (:282-296) — remover o join `servicos`, adicionar `data_hora_fim`:
```typescript
// ATUAL (:282-296) — o join servicos( duracao_minutos ) SAI
let queryAgendamentos = supabase
    .from('agendamentos')
    .select(`
        data_hora,
        status,
        servicos (
            duracao_minutos
        )
    `)
    .eq('tenant_id', tenantId)
    .neq('status', 'cancelado')
    .gte('data_hora', inicio.toISOString())
    .lt('data_hora', fim.toISOString())
// DEPOIS: .select('data_hora, data_hora_fim, status') — sem join, sem @ts-expect-error
```

**Derivação de ocupação a MODIFICAR** (:310-321) — `end` sai de `data_hora_fim`, não do `|| 30`:
```typescript
// ATUAL (:310-321) — a substituir integralmente
const slotsOcupados: Intervalo[] = (agendamentos || []).map((ag) => {
    const [h, m] = horaLocal(ag.data_hora, timezone).split(':').map(Number)
    const start = h * 60 + m
    // @ts-expect-error — join do Supabase tipado como array; runtime é objeto único
    const duracao = ag.servicos?.duracao_minutos || 30   // ← REMOVER (fonte do AGE-02)
    const end = start + duracao
    return { start, end }
})
// DEPOIS: end de data_hora_fim via horaLocal; tratar cruzamento de meia-noite (Pitfall 4:
// se dia local de data_hora_fim > dia de data_hora, end += 1440)
```

**NÃO TOCAR** — query de `servicosAtivos` (:258-274) que alimenta `menorDuracaoAtiva`. É a menor
duração dos serviços ativos para a regra anti-buraco, coisa DIFERENTE de ocupação. Confundir as
duas quebra a grade. As funções puras `calcularIntervalosLivres`/`gerarSlotsAntiBuraco` não mudam.

---

### `src/lib/__tests__/booking-engine.test.ts` (SC1/SC2)

**Analog:** as próprias fixtures existentes (:13-72, :108-247).

Hoje `interface Agendamento` e o `fakeSupabase` modelam agendamento como
`{ data_hora, status, servicos:{ duracao_minutos } }`. Depois de D-02: a interface perde o
`servicos` aninhado e ganha `data_hora_fim`; cada fixture de ocupação passa `data_hora_fim` em vez
do serviço aninhado (ex.: `data_hora:'…T12:00:00Z', data_hora_fim:'…T12:30:00Z'`). Casos novos
obrigatórios: (AGE-02) agendamento cujo serviço mudou/desativou continua ocupando pelo
`data_hora_fim`; (Pitfall 4) agendamento que cruza meia-noite.

---

### `src/app/actions/public-booking.ts` (D-01 upsert, D-05 23P01, grava data_hora_fim)

**Analog:** o próprio arquivo — o ramo `slot_indisponivel` já existe (:440-451) e é o molde do
retorno discriminado; o bloco `agError` (:526-542) é onde o novo ramo `23P01` entra ANTES do reporte.

**Padrão de retorno discriminado JÁ PRESENTE** (:440-451) — reusar, não recriar:
```typescript
try {
    capturarEventoTenant('booking_failed', tenantId, { motivo: 'slot_indisponivel' })
} catch (analyticsErr) { console.error('[analytics] …', analyticsErr) }
return { ok: false, motivo: 'slot_indisponivel' }
```

**Ramo novo a INSERIR antes de :526** (D-05) — discriminar `23P01`, NÃO reportar ao Sentry:
```typescript
if (agError?.code === '23P01') {
    // Perda de corrida: condição ESPERADA. NUNCA reportarExcecao (inundaria o Sentry).
    // Opcional: capturarEventoTenant('booking_failed', tenantId, { motivo:'slot_indisponivel' })
    return { ok: false, motivo: 'slot_indisponivel' }
}
if (agError || !agendamento) {   // permanece: erro_interno genuíno
    reportarExcecao(erroSinteticoSupabase(agError, 'agendamento_sem_retorno'), {
        fluxo: 'booking_publico', etapa: 'criar_agendamento' })
    return { ok: false, motivo: 'erro_interno' }
}
```

**Upsert COALESCE a SUBSTITUIR** (:463-511) — o select-then-insert vira uma chamada de RPC:
```typescript
// ATUAL (:463-511): .select().maybeSingle() → se não achou, .insert() — NÃO ATÔMICO
// DEPOIS: const { data: clienteId, error } = await admin
//   .rpc('reaproveitar_ou_criar_cliente', {
//       p_tenant_id: tenantId, p_telefone: telefoneLimpo,
//       p_nome: nomeLimpo, p_email: emailLimpo || null })
// Manter o mesmo padrão de tratamento de erro de infra já usado (:470-482):
//   reportarExcecao(erroSinteticoSupabase(error), { fluxo:'booking_publico', etapa:'buscar_cliente' })
//   return { ok:false, motivo:'erro_interno' }
```

**INSERT do agendamento** (:513-524) — adicionar `data_hora_fim` ao payload (calculado de
`data_hora + servico.duracao_minutos`; `servico.duracao_minutos` já está em escopo, usado no
`booking_completed` :547).

**Nota anti-PII (:470-482):** o padrão vigente já reporta `erroSinteticoSupabase` SEM nenhum dado
do cliente e devolve motivo genérico. Preservar — a `.message` do Postgres embute literais do input.

---

### `src/app/actions/agendamentos.ts` (D-03 duração original, D-04 walk-in 23P01, grava data_hora_fim)

**Analog:** o retorno discriminado do público (padrão a espelhar) + a estrutura atual de
`criarAgendamentoManual` (:236-394) e `remarcarAgendamento` (:401-467).

**D-04 — ramo `23P01` a INSERexpandR no INSERT do walk-in** (hoje :361-364 faz `throw`):
```typescript
// ATUAL (:361-364): if (agError || !agendamento) { console.error(...); throw new Error('Erro ao criar o agendamento.') }
// DEPOIS — o walk-in usa createClient() authenticated (RLS por tenant_id): a busca já é
// escopada ao próprio tenant, é legítimo devolver o detalhe (agenda do próprio profissional).
if (agError?.code === '23P01') {
    const { data: conflito } = await supabase
        .from('agendamentos')
        .select('data_hora, data_hora_fim, clientes(nome), servicos(nome)')
        .eq('tenant_id', orgId)
        .neq('status', 'cancelado')
        .lt('data_hora', dataHoraFimTentado)   // overlap: início do outro < fim tentado
        .gt('data_hora_fim', dataHora)          // e fim do outro > início tentado
        .maybeSingle()
    return { ok: false, motivo: 'slot_ocupado',
             conflito: conflito && { cliente: conflito.clientes?.nome,
                                     servico: conflito.servicos?.nome,
                                     horario: conflito.data_hora } }
}
```
**Contrato de retorno MUDA:** `criarAgendamentoManual` hoje devolve o agendamento cru ou `throw`.
D-04 exige retorno discriminado (`{ ok:false, motivo:'slot_ocupado', conflito }` / `{ ok:true, ... }`).
O consumidor `NovoAgendamentoModal.tsx` precisa passar a tratá-lo (ver abaixo).

**D-03 — remarcação congela a duração ORIGINAL** (hoje :434-437 pega do serviço vigente):
```typescript
// ATUAL (:434-437): duracao vem de servicos(duracao_minutos) || 30 — REABRE o bug da fase
// DEPOIS: o SELECT (:419-424) deve trazer data_hora e data_hora_fim do agendamento;
// novoDataHoraFim = novaDataHora + (data_hora_fim − data_hora) original.
// O UPDATE (:453-462) passa a gravar data_hora E data_hora_fim.
```

**Reuso da RPC no walk-in** (:305-331): o ramo "cadastro por telefone" deve chamar a MESMA
`reaproveitar_ou_criar_cliente` — com o unique `(tenant_id, telefone)` no lugar, o `.insert()`
solto passa a poder falhar com `23505` numa corrida; a RPC resolve atomicamente.

**Guard clauses e error handling a PRESERVAR:** `const { orgId } = await auth(); if (!orgId) throw`
no topo (:244-247); `console.error('… em pt-BR', error.message)` antes de qualquer retorno.

---

### `src/app/dashboard/NovoAgendamentoModal.tsx` (consome retorno discriminado D-04)

**Analog:** o próprio `catch` do `confirmar` (:254-266) e a caixa vermelha de erro (:337-341, :581-585).

O `confirmar` hoje depende de `throw`/`catch` e faz **string-matching** na mensagem
(`msg.includes('conflita') || msg.includes('indisponível')`) para voltar ao passo de horário e
forçar refetch (`setSlotsCarregados(null)`). Com D-04, `criarAgendamentoManual` passa a devolver
`{ ok:false, motivo:'slot_ocupado', conflito }` — trocar o string-matching por checagem do
discriminante, montar a cópia pt-BR COM o detalhe (`conflito.cliente`/`conflito.servico`/horário) e
manter o mesmo efeito (`setSlotSelecionado(null); setSlotsCarregados(null); setPasso('horario')`).

**Padrão de caixa de aviso a reusar** (:337-341 / :581-585 — âmbar para conflito, vermelho para erro):
```tsx
<div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/[0.08] p-3 text-sm text-red-700 dark:text-red-300">
    {erro}
</div>
// Para o aviso de conflito (não-erro), espelhar com paleta âmbar (amber-500/30 · amber-700),
// coerente com o aviso âmbar do double-booking público (BookingApp).
```

---

### `supabase/schemas/07_agendamentos.sql` (data_hora_fim, CHECK, periodo, EXCLUDE, COMMENT)

**Analog para o CHECK:** `03_horarios_funcionamento.sql` (o precedente `ck_hora_fim_apos_inicio`
citado no research) — replicar `CHECK (data_hora_fim > data_hora)` nomeado
`ck_agendamento_fim_apos_inicio`.

**Analog para COMMENT ON CONSTRAINT:** a migration 185755 (COMMENT explicando a intenção de negócio,
não só a mecânica). Toda coluna/constraint nova exige `COMMENT ON` (Definition of Done do projeto).

O schema declarativo é a fonte da verdade e reflete o estado FINAL. A DDL que APERTA
(extension, backfill, NOT NULL, EXCLUDE, GRANT) mora na migration à mão — ver abaixo. Aqui entram
as declarações finais: `data_hora_fim timestamptz NOT NULL`, o CHECK, a coluna `periodo`
(gerada OU alimentada por trigger — decidido pelo teste empírico) e a `EXCLUDE USING gist
(tenant_id WITH =, periodo WITH &&) WHERE (status <> 'cancelado')`.

---

### `supabase/schemas/06_clientes.sql` (UNIQUE tenant_id,telefone)

**Analog:** a UNIQUE do slug (migration 185755) + as policies já existentes neste arquivo (:14-40).

Adicionar `UNIQUE (tenant_id, telefone)` + `COMMENT ON CONSTRAINT` com a intenção (dedupe atômico,
insumo da Phase 5). As 4 policies granulares por ação (SELECT/INSERT/UPDATE/DELETE `TO authenticated`
com `(SELECT auth.jwt() ->> 'org_id')` em subquery) permanecem — a RPC roda como `SECURITY INVOKER`
e depende delas no fluxo walk-in.

**`nome` é NOT NULL (:4), `email` é nullable (:6):** é exatamente o que faz o COALESCE de D-01
funcionar — `COALESCE(clientes.nome, EXCLUDED.nome)` sempre mantém o nome curado; `email` preenche
o vazio.

---

### Função `reaproveitar_ou_criar_cliente` (nova — em `06_clientes.sql` ou `00_funcoes_sistema.sql`)

**Analog EXATO:** `substituir_horarios_funcionamento` em `03_horarios_funcionamento.sql:77-103` —
mesma família de "operação atômica que o supabase-js não expressa, resolvida por função no banco".

**Padrão a copiar** (assinatura, SECURITY INVOKER, search_path, REVOKE/GRANT, COMMENT):
```sql
CREATE OR REPLACE FUNCTION public.reaproveitar_ou_criar_cliente(
    p_tenant_id text, p_telefone text, p_nome text, p_email text DEFAULT NULL
) RETURNS uuid
LANGUAGE sql SECURITY INVOKER          -- INVOKER: preserva RLS do walk-in authenticated
SET search_path = ''                    -- schema-qualificar tudo (mesma prática da 03:81)
AS $$
    INSERT INTO public.clientes (tenant_id, telefone, nome, email)
    VALUES (p_tenant_id, p_telefone, p_nome, p_email)
    ON CONFLICT (tenant_id, telefone) DO UPDATE
        SET nome  = COALESCE(public.clientes.nome,  EXCLUDED.nome),
            email = COALESCE(public.clientes.email, EXCLUDED.email)
    RETURNING id;
$$;
-- GRANT explícito é OBRIGATÓRIO (default privilege de PUBLIC foi revogado em 01-15/183153):
REVOKE ALL ON FUNCTION public.reaproveitar_ou_criar_cliente(text,text,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reaproveitar_ou_criar_cliente(text,text,text,text)
    TO authenticated, service_role;   -- NADA para anon (anon não tem Data API)
COMMENT ON FUNCTION public.reaproveitar_ou_criar_cliente(text,text,text,text) IS '…';
```
Espelha exatamente o `REVOKE … FROM public, anon; GRANT EXECUTE … TO authenticated` da 03:101-102.
**NUNCA `SECURITY DEFINER`** — reabriria a porta de um authenticated gravar em tenant alheio.

---

### `supabase/migrations/<ts>_integridade_agenda.sql` (migration escrita À MÃO)

**Analog EXATO de forma e rigor:** `20260722185755_slug_gratuito_unico.sql` (cabeçalho explicando
por que é manual, bloco de pré-voo com contagens registradas no próprio arquivo, nome de constraint
que casa com o que o Postgres geraria) e `20260722183153_fecha_data_api_para_funcoes_futuras.sql`
(GRANT/REVOKE de privilégio, service_role NUNCA em linha de revoke).

**Padrões obrigatórios extraídos dos precedentes:**
- **Cabeçalho justificando a escrita manual** (185755:1-9): `db diff` sobe Docker (exceção que exige
  aprovação) e tende a emitir privilégio invertido — por isso extension/constraint/GRANT vão à mão.
- **Bloco de pré-voo registrado no arquivo** (185755:38-43 registra "as duas consultas voltaram
  VAZIAS"). Replicar: (a) duplicatas `(tenant_id, telefone)`; (b) sobreposições ativas pós-backfill.
  `NOT VALID` não existe para EXCLUDE — a constraint SÓ pode ser criada em terreno limpo.
- **Ordem interna obrigatória** (ROADMAP): coluna nullable → backfill (`data_hora + duracao_minutos`)
  → `NOT NULL` → CHECK → `CREATE EXTENSION btree_gist WITH SCHEMA extensions` → `periodo` → EXCLUDE
  → UNIQUE de clientes → RPC → GRANTs. Aplicar `periodo`/constraint antes de `NOT NULL` produz range
  de limite infinito (Pitfall 1).
- **service_role nunca entra em linha de REVOKE** (183153:52-62) — todo o caminho público roda com
  `createAdminClient()` (service_role); revogar sem conceder quebra a próxima função.
- **Aplicação via `execute_sql`, NUNCA `apply_migration`** (não preserva version). DDL + INSERT no
  ledger `supabase_migrations.schema_migrations` na MESMA chamada; depois `list_migrations` e
  realinhar `version`/`name` por DML (Pitfall 5).
- **Teste empírico da coluna gerada** (primeira tarefa da wave 3): `CREATE TEMP TABLE` com
  `GENERATED ALWAYS AS (tstzrange(a,b,'[)'))` — passou → coluna gerada; falhou (`generation
  expression is not immutable`) → trigger `BEFORE INSERT OR UPDATE` (analog de estilo:
  `set_periodo_agendamento` espelhando o padrão plpgsql de `rls_auto_enable`/`substituir_horarios`).

## Shared Patterns

### Retorno discriminado (nunca `throw` para erro esperado)
**Fonte:** `public-booking.ts:440-451` (+ `mensagens.ts` como fonte única de cópia).
**Aplicar a:** ambos os fluxos de escrita (público já usa; walk-in passa a usar com D-04).
Erro esperado atravessa a fronteira de flight como VALOR (`{ ok:false, motivo }`), nunca `throw` —
em produção o React só transporta o `digest`. O `slot_indisponivel` já existe e já é consumido pelo
`BookingApp`; a fase reusa. Para o walk-in, o novo `slot_ocupado` nasce espelhando esse molde.

### Condição esperada NÃO vai ao Sentry
**Fonte:** contraste `reportarExcecao` (:478,504,530) presente só para erro de infra; ausente no
ramo `slot_indisponivel` (:450).
**Aplicar a:** o ramo `23P01` (D-04/D-05) NÃO chama `reportarExcecao`. Perda de corrida é esperada.
Teste obrigatório: mock de `reportarExcecao` provando que NÃO foi chamado na corrida.

### Cópia pt-BR como fonte única + Record exaustivo
**Fonte:** `src/app/book/[slug]/mensagens.ts` (`COPY_SLOT_INDISPONIVEL` :51; `Record<MotivoPublico>`
:110/:137 sem `default`, para quebrar o `tsc` se surgir membro novo).
**Aplicar a:** público reusa `slot_indisponivel` sem tocar `mensagens.ts`. A cópia do walk-in é NOVA
e mora no dashboard (não em `mensagens.ts`, que é do booking público) — mas segue a mesma disciplina:
uma constante por caso, verbatim.

### Anti-PII no erro de banco
**Fonte:** `public-booking.ts:470-482` — reporta `erroSinteticoSupabase` sem dado do cliente,
devolve motivo genérico. A `.message` do Postgres embute literais do input.
**Aplicar a:** todo tratamento de erro de INSERT/RPC das actions. No público, a mensagem crua do PG
(com `org_id`/horário de terceiro) NUNCA atravessa para a UI. No walk-in, devolve-se só
cliente+serviço do PRÓPRIO tenant (RLS já escopa), nunca a `error.message`.

### Privilégio explícito para objeto novo de banco
**Fonte:** `03_horarios_funcionamento.sql:101-102` (`REVOKE … FROM public, anon; GRANT … TO
authenticated`) e migration `183153` (default privilege de PUBLIC revogado globalmente).
**Aplicar a:** a RPC nova nasce SEM `EXECUTE` para PUBLIC — precisa de `GRANT EXECUTE … TO
authenticated, service_role` explícito, nada para `anon`. Falha sem o GRANT é alta e clara
(`permission denied for function`), nunca silenciosa.

### COMMENT ON obrigatório
**Fonte:** todos os schemas + migrations do projeto.
**Aplicar a:** toda coluna nova (`data_hora_fim`, `periodo`), constraint (`ck_…`, `ag_sem_sobreposicao`,
`clientes_tenant_telefone_key`) e a função nova — `COMMENT ON` com a intenção de NEGÓCIO.

## No Analog Found

Nenhum arquivo desta fase fica sem precedente. Todos os padrões — retorno discriminado, RPC atômica,
migration à mão com pré-voo, GRANT explícito, CHECK de ordem temporal, coluna/trigger de período —
têm análogo direto no repositório (Phase 01 e schemas existentes). O único ponto sem precedente de
CÓDIGO é a decisão coluna-gerada-vs-trigger para `periodo`, resolvida por **teste empírico** (não por
analog): uma linha de DDL descartável decide.

## Metadata

**Analog search scope:** `src/lib/booking-engine.ts`, `src/app/actions/{public-booking,agendamentos}.ts`,
`src/app/dashboard/NovoAgendamentoModal.tsx`, `src/app/book/[slug]/mensagens.ts`,
`supabase/schemas/{00,03,06,07}_*.sql`, `supabase/migrations/{20260722183153,20260722185755}_*.sql`.
**Files scanned:** 10 lidos diretamente + inventário de `supabase/schemas/` e `supabase/migrations/`.
**Pattern extraction date:** 2026-07-23
</content>
</invoke>
