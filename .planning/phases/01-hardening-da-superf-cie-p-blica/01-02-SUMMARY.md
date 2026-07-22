---
phase: 01-hardening-da-superf-cie-p-blica
plan: 02
subsystem: api
tags: [supabase, service-role, rls, projecao-explicita, server-actions, next, rsc, multi-tenant]

# Dependency graph
requires:
  - phase: 01-01
    provides: "REVOKE de assinaturas para anon + padrão D-02 (leitura pública por cliente privilegiado) exercitado na primeira função + método de rastreio por call site"
provides:
  - "Caminho público inteiro (perfil, plano, serviços, engine de disponibilidade, lookup de cliente) servido por createAdminClient() — nenhuma leitura pública resta na role anon"
  - "resolverPerfilPublicoPorSlug — porta de entrada única do caminho público: slug → tenant_id, sempre no servidor"
  - "COLUNAS_PERFIL_PUBLICO (13) e COLUNAS_SERVICO_PUBLICO (5) — projeção explícita substituindo select('*')"
  - "Contrato por slug nas duas actions públicas: criarAgendamentoPublico({ slug, … }) e obterSlotsPublicos(slug, …)"
  - "Payload RSC de /book/[slug] sem org_id do Clerk (PerfilPublico perdeu tenant_id)"
  - "JSDoc de admin.ts com os três pontos autorizados — incluindo a contrapartida obrigatória das leituras públicas"
affects: [01-04, 01-05, phase-05-clientes, phase-07-cobranca]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Projeção explícita por constante de módulo no caminho público: coluna nova no banco não entra sozinha no payload do browser (vazamento por omissão)"
    - "Identificador de tenant sai do servidor, nunca entra dele: o browser manda slug, o servidor devolve tenant_id"
    - "Com service role no caminho, filtro de tenant + lista de colunas viram a defesa que o RLS deixou de fazer — critério de aceite, não recomendação"
    - "Fallback silencioso em leitura pública é bug, não robustez: slug não resolvido falha visível em vez de calcular grade com fuso e regras padrão"

key-files:
  created: []
  modified:
    - src/app/actions/public-booking.ts
    - src/app/book/[slug]/page.tsx
    - src/app/book/[slug]/BookingApp.tsx
    - src/lib/supabase/admin.ts
    - src/lib/assinaturas.ts

key-decisions:
  - "tenantHash continua derivado de hashTenantId(perfil.tenant_id) no servidor — derivar do slug trocaria a chave do funil e quebraria a série histórica do PostHog"
  - "obterSlotsPublicos com slug não resolvido passa a LANÇAR (copy travada do UI-SPEC) em vez de cair em TIMEZONE_PADRAO/15/14: o fallback devolvia grade calculada errada sem sintoma nenhum"
  - "Colunas de FILTRO (tenant_id, ativo) ficam fora da projeção que viaja ao browser — filtrar por uma coluna não exige selecioná-la"
  - "A sanitização de personalização por plano vira a ÚNICA defesa contra tenant gratuito exibir cor/logo/capa pagas: com RLS bypassado não há segunda barreira"

patterns-established:
  - "Um único resolvedor slug→tenant para todo o caminho público, com validação de slug efetivo embutida — impossível esquecer a checagem em uma das três funções"
  - "Erro de leitura com service role é falha de infraestrutura, não 'não existe': reportar ao Sentry antes de devolver null, senão vira 404 silencioso"

requirements-completed: [SEG-02, SEG-03]

coverage:
  - id: D1
    description: "Todas as leituras do caminho público migradas para createAdminClient() com projeção explícita e filtro de tenant resolvido no servidor"
    requirement: SEG-02
    verification:
      - kind: integration
        ref: "grep -n \"select('*')\" src/app/actions/public-booking.ts → 0 linhas; grep -rn 'supabase/server' src/app/book/ → nenhum"
        status: pass
      - kind: e2e
        ref: "curl /book/avantis → 200 e /book/ozm317u4 → 404 (contrafactual de slug do 01-01: leitura degradada inverteria os dois códigos)"
        status: pass
      - kind: unit
        ref: "pnpm test — 13 arquivos, 196 testes passando (baseline do 01-03 preservada)"
        status: pass
    human_judgment: false
  - id: D2
    description: "org_id do Clerk fora do payload do browser e das assinaturas das duas actions públicas"
    requirement: SEG-03
    verification:
      - kind: integration
        ref: "grep -c 'tenant_id' 'src/app/book/[slug]/BookingApp.tsx' → 0; grep -n 'hashTenantId(perfil.tenant_id)' page.tsx → exatamente 1 linha (:80)"
        status: pass
      - kind: e2e
        ref: "curl /book/avantis → 200 com o payload já sem tenant_id na projeção de page.tsx"
        status: pass
    human_judgment: false
  - id: D3
    description: "obterSlotsPublicos falha visível quando o slug não resolve, em vez de devolver grade calculada com fuso e regras padrão"
    verification:
      - kind: integration
        ref: "public-booking.ts:373 — throw 'Não foi possível carregar os horários. Tente de novo.' (copy mandatória do UI-SPEC); pnpm build exit 0"
        status: pass
    human_judgment: true
    rationale: "O caminho só dispara em corrida real (downgrade de plano com a aba do cliente aberta). O que a automação prova é que a copy está no lugar certo e compila; que a caixa vermelha com 'Tentar de novo' renderiza esse texto é UAT do 01-05"
  - id: D4
    description: "Wizard público completo (serviço → data/hora → contato → sucesso) sem regressão de comportamento nem de copy após a troca de contrato"
    verification:
      - kind: e2e
        ref: "curl /book/avantis → 200 (a página resolve e renderiza com o contrato novo)"
        status: pass
    human_judgment: true
    rationale: "Herdado do 01-01 (D3) e agravado aqui: este plano trocou o identificador que as duas actions recebem. O 200 prova que o RSC monta; o percurso à mão até a tela de sucesso é a regressão obrigatória do CONTEXT §specifics e continua pendente para o 01-05"
  - id: D5
    description: "JSDocs de admin.ts e assinaturas.ts coerentes com a superfície real (três pontos autorizados; GRANT por coluna extinto)"
    verification:
      - kind: integration
        ref: "grep -c 'dois pontos' src/lib/supabase/admin.ts → 0; item 3 presente enumerando as leituras públicas com a contrapartida"
        status: pass
    human_judgment: false

# Metrics
duration: ~12min
completed: 2026-07-22
status: complete
---

# Phase 01 Plan 02: Leituras públicas no cliente privilegiado, por slug — Summary

**O caminho público inteiro passou a ler pelo `createAdminClient()` com lista de colunas escrita à mão e `tenant_id` resolvido no servidor a partir do slug — e o `org_id` do Clerk deixou de existir no payload do browser e nas assinaturas das duas Server Actions públicas, tornando o tenant controlado pelo cliente uma impossibilidade estrutural antes do 01-04 fechar a Data API.**

## Performance

- **Duration:** ~12 min de implementação (`2eb048c` fecha o 01-03 às 01:31:21; os três commits deste plano em 01:38:26, 01:42:38 e 01:43:35 -0400). Bookkeeping fechado em sessão separada — ver "Issues Encountered".
- **Tasks:** 3 de 3
- **Files modified:** 5

## Accomplishments

- **Nenhuma leitura pública resta na role `anon`.** `src/app/book/` não importa mais `@/lib/supabase/server` em lugar nenhum, e `public-booking.ts` também não. É exatamente o pré-requisito que o 01-04 precisa para dar `REVOKE` total sem derrubar a página pública.
- **`select('*')` extinto do caminho público.** As duas projeções que o 01-01 deixou de propósito para este plano (`perfis_empresas` e `servicos`) viraram constantes de módulo. O `servicos` que ia inteiro para o browser agora leva cinco colunas.
- **`resolverPerfilPublicoPorSlug` unificou a mecânica que existia solta em uma função.** As três funções exportadas passam pela mesma porta: busca por `slug` → fallback `slug_gratuito` → validação de slug efetivo pelo plano vigente. Não dá mais para uma delas esquecer a checagem.
- **`obterSlotsPublicos` parou de mentir quando o slug não resolve.** Antes caía em `TIMEZONE_PADRAO`/antecedência 15/horizonte 14 e devolvia uma grade calculada com as regras erradas, sem erro nenhum. Agora lança a copy travada.
- **O `tenantHash` do funil ficou intacto** — continua derivando do `org_id` cru no servidor (`page.tsx:80`). Derivar do slug teria trocado a chave e partido a série do PostHog em duas.

## As leituras públicas, uma a uma (insumo do 01-04)

Esta é a tabela que o 01-04 precisa antes de fechar a Data API: **toda linha abaixo já roda com service role.** Nenhuma delas volta a depender de `anon`.

| # | Tabela | Onde | Colunas projetadas | Filtro de tenant |
|---|---|---|---|---|
| 1 | `perfis_empresas` | `public-booking.ts:36-40` | `COLUNAS_PERFIL_PUBLICO` (13) | `.eq('slug', slug)` — **é o resolvedor**, não tem tenant ainda |
| 2 | `perfis_empresas` | `public-booking.ts:43-47` (fallback) | `COLUNAS_PERFIL_PUBLICO` | `.eq('slug_gratuito', slug)` — idem |
| 3 | `assinaturas` | `assinaturas.ts:71-76` via `obterPlanoVigentePublico` | `plano, status` | `.eq('tenant_id', …)` em `assinaturas.ts:74` |
| 4 | `servicos` (catálogo) | `public-booking.ts:321-326` | `COLUNAS_SERVICO_PUBLICO` (5) | `.eq('tenant_id')` + `.eq('ativo', true)` |
| 5 | `servicos` (duração no ato) | `public-booking.ts:145-151` | `duracao_minutos, nome` | `.eq('tenant_id')` + `id` + `ativo` |
| 6 | `clientes` (lookup por telefone) | `public-booking.ts:193-198` | `id` | `.eq('tenant_id')` + `telefone` |
| 7 | `horarios_funcionamento` | `booking-engine.ts:194-199` | `hora_inicio, hora_fim` | `.eq('tenant_id')` |
| 8 | `excecoes_agenda` | `booking-engine.ts:218-222` | `hora_inicio, hora_fim, bloqueado` | `.eq('tenant_id')` |
| 9 | `servicos` (menor duração ativa) | `booking-engine.ts:246-250` | `duracao_minutos` | `.eq('tenant_id')` |
| 10 | `agendamentos` (ocupação) | `booking-engine.ts:268-280` | `data_hora, status, servicos(duracao_minutos)` | `.eq('tenant_id')` |

**As 13 colunas de `COLUNAS_PERFIL_PUBLICO`:** `tenant_id, slug, slug_gratuito, nome_estabelecimento, descricao, instagram, endereco, timezone, antecedencia_minima_minutos, horizonte_maximo_dias, cor_marca, logo_url, capa_url`. As três últimas são lidas **para serem sanitizadas pelo plano** e voltam `null` no objeto `perfil` — quem consome personalização lê a chave `personalizacao`, nunca as colunas cruas.

**As 5 de `COLUNAS_SERVICO_PUBLICO`:** `id, nome, descricao, preco, duracao_minutos`. `ativo` e `tenant_id` são colunas de filtro e ficaram deliberadamente fora — filtrar por uma coluna não exige selecioná-la, e o payload do browser não tem por que carregá-las.

**Leituras que NÃO foram migradas — o blast radius que sobra para o 01-04:** nenhuma no caminho público. O que continua na role `authenticated` é todo o dashboard B2B (`src/app/actions/*.ts` fora de `public-booking.ts`, via `createClient()` de `@/lib/supabase/server`) — e isso é o desenho correto, não dívida: ali o RLS é a defesa e deve continuar sendo. O 01-04 só precisa garantir que o `REVOKE` mire `anon` e não encoste em `authenticated`. As tabelas que o 01-01 mediu como abertas a `anon` e ainda estão (`perfis_empresas`, `servicos`, `horarios_funcionamento`, `agendamentos`, mais as três com `200 []` que só parecem fechadas por estarem vazias) já não têm nenhum consumidor legítimo em `anon` — o privilégio delas virou puro excedente.

## Contrato novo das actions públicas (`tenantId` → `slug`)

**O que o browser manda agora:**

```ts
criarAgendamentoPublico({ slug, servicoId, dataHora, clienteNome, clienteTelefone, clienteEmail? })
obterSlotsPublicos(slug, dateStr, duracaoMinutos)
```

O `slug` vem de `params` da URL e é passado a `BookingApp` como prop nova (`page.tsx:68`). `PerfilPublico` perdeu o campo `tenant_id` — `grep -c "tenant_id" BookingApp.tsx` → **0**.

**Onde o `tenant_id` é resolvido no servidor:** `resolverPerfilPublicoPorSlug` (`public-booking.ts:35-77`), chamado nas três funções exportadas (`:125`, `:310`, `:366`). O `tenant_id` sai do perfil encontrado e alimenta tudo daí para frente — filtros das queries 4-10 da tabela acima, `tenant_id` dos dois `INSERT`, e os três `capturarEventoTenant`. **Um valor vindo do navegador não escolhe mais em qual tenant se lê nem se escreve.**

A exceção deliberada: `tenantHash={hashTenantId(perfil.tenant_id)}` em `page.tsx:80`. O `org_id` cru continua entrando na função de hash **no servidor**; o que viaja é o pseudônimo. Trocar por hash do slug seria trivial e errado — mudaria a chave de todo o funil.

## Call sites verificados (o método que o 01-01 deixou como lição)

O 01-01 registrou: rastreio por **call site**, não por função. Cada read que este plano rewireou foi conferido por quem chama:

| Read migrada | Call sites conferidos | Cliente que cada um passa |
|---|---|---|
| `resolverPerfilPublicoPorSlug` (perfil + plano) | `public-booking.ts:125` (`criarAgendamentoPublico`), `:310` (`obterDadosBookingPublico`), `:366` (`obterSlotsPublicos`) — os **três** únicos, confirmado por grep no arquivo | `admin` nos três; cada função instancia `createAdminClient()` na própria entrada (`:121`, `:306`, `:364`) |
| `obterDadosBookingPublico` | `page.tsx:14` via `cache()`, consumido por `generateMetadata` (`:18`) **e** pelo componente de página (`:44`) — dois consumidores, uma query por request | não recebe cliente; instancia o admin internamente |
| `obterSlotsDisponiveis` (engine, queries 7-10) | 4 call sites de produção: `public-booking.ts:161` e `:378` (públicos, passam `admin`), `agendamentos.ts:196`, `:320` e `:424` (dashboard B2B, passam o cliente autenticado) | públicos → `admin`; B2B → `authenticated`. **A engine recebe o cliente por parâmetro — migrar os públicos não tocou o B2B** |
| `obterPlanoVigentePublico` | os 5 call sites já mapeados no 01-01 seguem válidos; o deste plano é `public-booking.ts:71`, dentro do resolvedor | `admin` |
| `obterSlotsPublicos` / `criarAgendamentoPublico` | `BookingApp.tsx:149` e `:262` — os dois únicos consumidores em toda a árvore (grep em `src/`) | ambos migrados para `slug` no mesmo commit |

Nenhum consumidor ficou para trás, e nenhum caminho B2B foi arrastado junto.

## Pré-verificação da D-07 (para o 01-04 trocar as policies de SELECT)

O `must_have` do plano pedia conferir que as ações autenticadas com `.insert/.upsert(...).select(...)` continuam enxergando a própria linha depois que o 01-04 mexer nas policies. Conferido — as três gravam `tenant_id = orgId` vindo de `auth()`:

- `agendamentos.ts:302-307` — insert de `clientes` com `tenant_id: orgId`, `.select('id, nome, telefone')`
- `agendamentos.ts:335-342` — insert de `agendamentos` com `tenant_id: orgId`, `.select('id, data_hora, status')`
- `perfis-empresas.ts:218` + `:234-238` — `payload.tenant_id = orgId`, `.upsert(payload, { onConflict: 'tenant_id' }).select()`

(As referências do plano eram `agendamentos.ts:318-320`, `:285-286` e `perfis-empresas.ts:234-238`; as duas primeiras deslocaram algumas linhas desde o planejamento. O conteúdo é o mesmo.)

## Task Commits

1. **Task 1: `public-booking.ts` — admin client, projeções explícitas e contrato por slug** — `145ebb7` (feat)
2. **Task 2: `page.tsx` + `BookingApp.tsx` — `org_id` fora do payload do browser** — `ff61d49` (feat)
3. **Task 3: JSDocs honestos — `admin.ts` e `assinaturas.ts`** — `0919405` (docs)

## Files Created/Modified

- `src/app/actions/public-booking.ts` (+134/−74) — as duas constantes de projeção, o resolvedor por slug, as três funções migradas para `admin`, contrato por slug e a falha visível em `obterSlotsPublicos`.
- `src/app/book/[slug]/page.tsx` (+5/−1) — `slug={slug}` entra, `tenant_id` sai da projeção; `hashTenantId(perfil.tenant_id)` intacto.
- `src/app/book/[slug]/BookingApp.tsx` (+6/−4) — prop `slug`, `PerfilPublico` sem `tenant_id`, os três consumos trocados (chamada de slots, dependência do `useEffect`, payload do agendamento).
- `src/lib/supabase/admin.ts` (+17/−11) — JSDoc de dois para três pontos autorizados, com a contrapartida (filtro do servidor + colunas explícitas) escrita junto do item 3.
- `src/lib/assinaturas.ts` (+8/−3) — JSDoc de `obterPlanoVigentePublico`: o GRANT por coluna foi revogado, e o `tenantId` é responsabilidade do chamador.

## Decisões tomadas

- **`obterSlotsPublicos` falha em vez de degradar.** Era o único ponto do plano com copy nova autorizada, e o motivo é concreto: o fallback antigo produzia uma grade de horários calculada com fuso e regras de outro tenant (ou do padrão), oferecida ao cliente final como se fosse verdade. Erro visível com botão "Tentar de novo" é estritamente melhor que resposta errada silenciosa.
- **Colunas de filtro fora da projeção.** `.eq('tenant_id', …)` e `.eq('ativo', true)` funcionam sem que as colunas estejam no `select` — e mantê-las fora é o que impede o `tenant_id` de voltar ao payload por descuido em `obterDadosBookingPublico`.
- **Erro de leitura no resolvedor vai ao Sentry.** Com service role, um erro de query não é "slug não existe" — é infraestrutura. Sem o `reportarExcecao` (`public-booking.ts:57`) o sintoma seria um 404 e ninguém saberia que a página caiu. O slug nunca entra no contexto do evento: é dado do visitante.
- **A sanitização de personalização não foi tocada.** Com RLS bypassado ela virou defesa única (UI#29/C13): sem ela, tenant gratuito exibe cor/logo/capa pagas — regressão visual **e** de monetização, silenciosa nas duas pontas.

## Deviations from Plan

Nenhuma. As três tarefas saíram como escritas.

Duas divergências entre a **letra** de critérios de aceitação e o estado final, ambas artefato de contagem, nenhuma delas gap de implementação:

**1. `grep -c "eq('tenant_id'" src/app/actions/public-booking.ts` = 3, o critério pedia `>= 4`.**
A substância do critério ("todo query do caminho público filtra por tenant resolvido no servidor") está satisfeita: das dez leituras da tabela acima, duas são o próprio resolvedor por slug (não têm tenant ainda), uma filtra em `assinaturas.ts:74` e quatro filtram dentro de `booking-engine.ts` — nenhuma dessas seis é visível a um grep restrito a `public-booking.ts`. As três que restam no arquivo (`:149`, `:196`, `:324`) são exatamente as que deveriam estar lá. O número `4` do plano foi estimativa de planejamento que não contou os filtros que moram fora do arquivo. **Conferido query a query, não por contagem.**

**2. O commit `0919405` ("apenas mudanças de comentário") carrega uma linha executável reformatada.**
O hook de prettier do projeto reflowou a chamada `createSupabaseClient(...)` em `admin.ts` de multi-linha para a forma compacta. Diff conferido linha a linha: é só quebra de linha, zero mudança semântica (mesmos argumentos, mesmas opções de `auth`). Comportamento conhecido e documentado do hook — não é scope creep.

## Issues Encountered

**1. O executor original foi interrompido depois do último commit de código e antes do bookkeeping.** Os três commits de implementação estavam no `git log`, mas não havia SUMMARY, nem STATE atualizado, nem ROADMAP. Este fechamento **não reimplementou nada** — verificou cada critério de aceitação contra os diffs já commitados (`git show` nos três) e contra o estado atual dos arquivos em disco, e só então escreveu a documentação. Consequência honesta para as métricas: a `duration` acima cobre a janela dos commits de código, não o tempo total gasto no plano.

**2. Diagnósticos transitórios de TypeScript durante o refactor** (`Property 'tenant_id' is missing in type … PerfilPublico`, `Property 'slug' does not exist on … BookingAppProps`) apareceram no meio da troca de contrato de props e desapareceram quando os dois lados do contrato entraram. O build final é limpo. Registrado por transparência; não sobrou ponta solta — `grep -c "tenant_id" BookingApp.tsx` = 0 e `pnpm build` exit 0.

## Verificações executadas (saída real, medida sobre o HEAD atual)

- `pnpm lint` → **exit 0**, nenhuma linha de saída
- `pnpm test` → **13 arquivos, 196 testes passando**, exit 0 (baseline do 01-03 preservada — este plano não adicionou nem quebrou teste)
- `pnpm build` → **exit 0**, TypeScript compilado, 14 páginas geradas — **fecha a pendência nº 1 deixada pelo 01-01**, que não rodou o build
- `curl /book/avantis` → **200**; `curl /book/ozm317u4` → **404**

O par de curls é a prova forte. O único tenant do banco está em `pro`, assinatura `ativa`, `slug` = `avantis`, `slug_gratuito` = `ozm317u4`. Se qualquer leitura pública tivesse degradado silenciosamente para `gratuito` — que é o modo de falha desenhado de `obterPlanoVigentePublico` —, `obterSlugEfetivo` inverteria: `/book/avantis` daria 404 e `/book/ozm317u4` passaria a responder. A inversão não aconteceu.

Greps de aceitação:

- `grep -n "select('*')" src/app/actions/public-booking.ts` → **0 linhas**
- `grep -rn "supabase/server" src/app/book/` e em `public-booking.ts` → **nenhum**
- `grep -c "tenant_id" "src/app/book/[slug]/BookingApp.tsx"` → **0**
- `grep -n "hashTenantId(perfil.tenant_id)" "src/app/book/[slug]/page.tsx"` → **1 linha** (`:80`)
- `grep -c "dois pontos" src/lib/supabase/admin.ts` → **0**, com item 3 presente
- As três copies travadas literais no arquivo: `:128`, `:179`, `:210`/`:234`
- `Não foi possível carregar os horários. Tente de novo.` → `:373`, dentro de `obterSlotsPublicos`

## Known Stubs

Nenhum. Todo caminho tocado está ligado ponta a ponta.

## Threat Flags

Nenhuma superfície nova. O plano fecha `T-01-03` (payload RSC sem `org_`), `T-01-04` (filtro de tenant do servidor + colunas explícitas em toda query com service role) e `T-01-05` (copy de erro sem vazar slug/tenant/código do Postgres). `T-01-06` (tenant gratuito exibindo personalização paga) segue mitigado pela sanitização preservada — e agora **sem rede**: era defesa em profundidade, virou defesa única.

## Pendências deixadas por este plano

1. **UAT do wizard completo continua pendente** (D4). Herdada do 01-01 e agravada aqui: o identificador que as duas actions recebem mudou. `curl` prova que a página monta; serviço → data/hora → contato → tela de sucesso à mão é a regressão obrigatória do CONTEXT §specifics e é escopo do 01-05.
2. **A caixa de erro de slots nunca foi vista renderizando a copy nova** (D3). Reproduzir exige corrida de downgrade com a aba aberta; o teste barato é chamar `obterSlotsPublicos('slug-inexistente', …)` no UAT do 01-05.
3. **`docs/PENDENCIAS.md` não atualizado** — o plano não criou nem adiou tarefa de produto. As duas acima são de verificação da própria fase.

## User Setup Required

Nenhum.

## Next Phase Readiness

Pronto para o **01-04**, que herda:

- **Zero consumidores legítimos em `anon`** no caminho público — o `REVOKE` total pode mirar `perfis_empresas`, `servicos`, `horarios_funcionamento`, `agendamentos`, `clientes`, `excecoes_agenda`, `whatsapp_configs` e `disparos_whatsapp` sem derrubar a página. A tabela "leituras públicas, uma a uma" é o mapa de conferência.
- **A pré-verificação da D-07 feita** — as três gravações autenticadas com `.select()` gravam `tenant_id = orgId`, então a troca das policies de SELECT não cega o `RETURNING` delas.
- **O alerta do 01-01 continua valendo:** `excecoes_agenda`, `whatsapp_configs` e `disparos_whatsapp` devolvem `200 []` para `anon` — parecem fechadas e só estão vazias.
- **A regra do `apply_migration`** (corrigir a `version` por DML depois de aplicar) vale para as duas migrations do 01-04.
- **`pnpm build` rodado** — a Definition of Done do projeto está satisfeita nos três comandos pela primeira vez desde o início da fase.

## Self-Check: PASSED

Arquivos conferidos em disco: `src/app/actions/public-booking.ts`, `src/app/book/[slug]/page.tsx`, `src/app/book/[slug]/BookingApp.tsx`, `src/lib/supabase/admin.ts`, `src/lib/assinaturas.ts`, `01-02-SUMMARY.md`.
Commits conferidos no git: `145ebb7`, `ff61d49`, `0919405`.
Zero deleções de arquivo no intervalo do plano (`git diff --diff-filter=D` vazio nos três commits).

---
*Phase: 01-hardening-da-superficie-publica*
*Completed: 2026-07-22*
