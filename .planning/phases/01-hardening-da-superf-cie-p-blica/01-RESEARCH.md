# Phase 1: Hardening da superfície pública — Research

**Researched:** 2026-07-21
**Domain:** Privilégios Postgres (GRANT/REVOKE/DEFAULT PRIVILEGES) + RLS sob PostgREST/Supabase Data API; verificação de assinatura QStash em route handler do Next.js 16
**Confidence:** ALTA no inventário do código (tudo lido em arquivo e linha); MÉDIA nas afirmações sobre comportamento do PostgREST e do `Receiver` do QStash (documentação oficial + skill do projeto, sem execução contra o banco real nesta sessão)

> Este documento **não repete** `.planning/research/PITFALLS.md` nem `.planning/codebase/CONCERNS.md`. Onde um item já está lá, aqui está o que a pesquisa acrescenta: a superfície exata em colunas, o motivo pelo qual a correção óbvia (GRANT por coluna) **não satisfaz** o critério de sucesso 1, e o encadeamento de policies que precisa ser substituído em vez de removido.

---

## Summary

A superfície `anon` é maior do que "duas policies de INSERT". A migration `supabase/migrations/20260709161817_restaura_privilegios_dml_roles_api.sql` concedeu `SELECT, INSERT, UPDATE, DELETE` a `anon` em **todas** as tabelas do schema `public` — e replicou isso em `ALTER DEFAULT PRIVILEGES`, de modo que toda tabela futura nasce com o mesmo pacote. Hoje, a única coisa que separa a chave publicável de escrever em `perfis_empresas`, `servicos` ou `whatsapp_configs` é a ausência de policy de RLS. Onde a policy existe (`agendamentos`, `clientes`), a escrita direta está aberta de fato.

A correção intuitiva — replicar o `REVOKE SELECT` + `GRANT SELECT (colunas)` que `08_assinaturas.sql` já faz — **resolve o critério 3 e falha o critério 1**. O motivo é uma regra do Postgres, não uma limitação do Supabase: `SELECT` é exigido para qualquer coluna referenciada na query, **inclusive no `WHERE`**. A engine e as actions públicas filtram por `.eq('tenant_id', …)` em cinco tabelas; para isso funcionar, `tenant_id` precisa estar no GRANT; e uma coluna no GRANT é uma coluna raspável via `?select=tenant_id`. Ou seja: enquanto `anon` tiver qualquer leitura útil nessas tabelas, o `org_id` do Clerk de todos os tenants continua enumerável — só muda a tabela de onde sai. O critério 1 (`nem o org_id do Clerk`) e o GRANT por coluna são mutuamente incompatíveis.

O fato que destrava tudo: **nenhuma leitura pública acontece no browser**. Todas passam por Server Action/Server Component. Logo o caminho de menor esforço e maior redução de superfície é retirar `anon` da Data API por completo nas tabelas operacionais e servir o booking com o cliente privilegiado que o projeto já usa para as escritas — com projeção de colunas explícita, nunca `select('*')`.

**Primary recommendation:** revogar todo privilégio de `anon` no schema `public` (tabelas existentes + default privileges), substituir — não apagar — as policies `TO anon, authenticated` por equivalentes `TO authenticated` restritas ao próprio tenant, e migrar as quatro leituras públicas de `createClient()` para `createAdminClient()` com listas de colunas explícitas. No webhook, trocar o `?secret=` pelo `Receiver` do `@upstash/qstash` verificando `Upstash-Signature` contra o **body cru** com `url: req.url`, e falhar no boot via `src/instrumentation.ts` quando as chaves faltarem.

---

## User Constraints

> Não existe `CONTEXT.md` para esta fase (`/gsd-discuss-phase` ainda não rodou). As restrições abaixo vêm de `ROADMAP.md`, `PROJECT.md`, `CLAUDE.md` e `.claude/CLAUDE.md` e têm o mesmo peso de decisão travada para o planner.

### Decisões travadas

- **Fricção Zero é inegociável.** Nenhuma proteção desta fase pode adicionar etapa visível ao cliente final. O booking público precisa continuar funcionando **exatamente** como antes (critério de sucesso 2).
- **Banco é descartável nesta fase.** Não é produção, não há profissional real nem agendamento de cliente final, e o owner autorizou migration destrutiva sem cerimônia (2026-07-21). Não há requisito de backup nem de janela de manutenção.
- **Migrations podem ser editadas nesta fase** (relaxamento temporário; o hook de imutabilidade só é ativado na Phase 11).
- **Stack banida:** Prisma/Drizzle, better-auth, Mercado Pago. **Sem ORM** — SQL puro via `@supabase/ssr`.
- **Sem rotas REST próprias.** Mutações só em Server Actions; única exceção `src/app/api/webhooks/`.
- **`getToken({ template: 'supabase' })` é depreciado** — a integração é a nativa third-party auth (já implementada).
- Ordem de fases: esta fase **precede** a Phase 3 (rate limit) e a Phase 9 (cobrança). Enquanto o INSERT `anon` existir, rate limit na action é teatro.

### Discrição do Claude (decidir na pesquisa/plano)

- **Como** fechar a leitura `anon`: remover da Data API vs. GRANT por coluna vs. RPC `SECURITY DEFINER`. Ver `## Architecture Patterns` — a pesquisa recomenda a primeira e explica por que a segunda não fecha o critério 1.
- Escopo do `ALTER DEFAULT PRIVILEGES`: só `anon` ou `anon` + `authenticated`. Ver decisão D-2.
- Forma da verificação do QStash: `Receiver` manual vs. `verifySignatureAppRouter`.

### Fora de escopo (não puxar para esta fase)

- Rate limit, honeypot e qualquer anti-abuso — **Phase 3**.
- Exclusion constraint, `data_hora_fim`, dedupe de `clientes` — **Phase 2**.
- `assinaturas.tenant_id` de `CASCADE` para `RESTRICT`, varredura de `ON DELETE CASCADE` — **Phase 10**.
- Error tracking / observabilidade — **Phase 11**.
- Substituir `perfil.tenant_id` por `slug` no payload do browser — ver `## Open Questions` Q1; tem mérito de segurança mas é escopo novo.

---

## Phase Requirements

| ID | Descrição | Suporte da pesquisa |
|----|-----------|---------------------|
| SEG-01 | Visitante anônimo não insere agendamento nem cliente direto na Data API | Duas camadas: revogar o GRANT `INSERT` de `anon` (que hoje existe em **todas** as tabelas) **e** trocar as policies `FOR INSERT TO anon, authenticated` por `TO authenticated` com `WITH CHECK (tenant_id = jwt.org_id)` — a versão só-authenticated é necessária porque o dashboard insere agendamento e cliente com o client autenticado (`agendamentos.ts:286,319`) |
| SEG-02 | `perfis_empresas` deixa de ser enumerável | GRANT por coluna **não resolve** (ver `## Common Pitfalls` → Pitfall 1). Resolve: `REVOKE ALL … FROM anon` + `DROP POLICY` da leitura pública + leitura via cliente privilegiado. Atenção: hoje **não existe** outra policy de SELECT em `perfis_empresas`, então a policy tem que ser **substituída**, não removida |
| SEG-03 | `agendamentos` e `excecoes_agenda` expõem a `anon` só o que a engine consome | Colunas exatas mapeadas em `## Superfície mínima da página pública`. Com a recomendação principal (anon sem acesso) o critério é satisfeito com folga: `anon` não devolve coluna nenhuma |
| SEG-04 | Coluna/tabela nova nasce sem acesso `anon` | `alter default privileges for role postgres in schema public revoke …` — e a **regra escrita** em `docs/03`, porque `supabase db diff` **não emite GRANT/REVOKE** (documentado no próprio repo) |
| SEG-05 | Webhook de lembrete só aceita assinatura válida do QStash; app não sobe sem as chaves | `Receiver` de `@upstash/qstash` (pacote **não instalado** hoje) + `src/instrumentation.ts` (`register()` roda uma vez e precisa completar antes do servidor aceitar requisições — doc empacotada do Next 16.2.10). Usa `QSTASH_NEXT_SIGNING_KEY`, que **já está configurada** no `.env.local` e no Railway (correção de 2026-07-21) |

---

## Architectural Responsibility Map

| Capacidade | Tier primário | Tier secundário | Racional |
|------------|---------------|-----------------|----------|
| Autorização de acesso a dados operacionais | Database (GRANT + RLS) | API/Server Action | GRANT é a camada que RLS **não** substitui — sem privilégio, a policy nunca é avaliada |
| Leitura da página pública `/book/[slug]` | API / Server (Server Component + Server Action) | — | Nenhum componente do browser fala com o Supabase; não existe `createBrowserClient` no projeto |
| Escrita do booking público | API / Server Action | Database (RLS como rede) | Já é assim: validação na action → `createAdminClient()` |
| Projeção de colunas que chegam ao browser | API / Server (`page.tsx`) | — | `src/app/book/[slug]/page.tsx:64-72` já projeta o perfil; `servicos` ainda vai inteiro (ver Pitfall 5) |
| Autenticidade do webhook de lembrete | API / Route Handler | — | Assinatura HMAC verificada pela lib oficial; nada disso pertence ao banco |
| Presença das chaves de assinatura | Runtime boot (`instrumentation.ts`) | — | Falha precisa acontecer no boot, não na primeira requisição |

---

## Project Constraints (from CLAUDE.md)

Diretivas acionáveis que o plano precisa respeitar — o plan-checker deve conferir uma a uma:

1. **pnpm sempre**, nunca npm/yarn.
2. **Definition of Done:** `pnpm lint`, `pnpm test` e `pnpm build` passando com saída real mostrada.
3. **Mudança de schema:** arquivo em `supabase/schemas/` + migration gerada por `supabase db diff` (nunca escrita à mão) + RLS granular por ação + `COMMENT ON` nas tabelas/policies novas.
   ⚠️ **Conflito real nesta fase:** `docs/SUPABASE_DECLARATIVE-DATABASE-SCHEMA.md` documenta que `supabase db diff` **não emite `GRANT`/`REVOKE`**, e a lista de caveats do migra inclui explicitamente *column privileges*. A parte de privilégios **tem** que ser migration escrita à mão — é a exceção já registrada no projeto e já usada em `20260709193156_restringe_colunas_assinaturas_anon.sql`. As mudanças de **policy** continuam pelo fluxo declarativo normal.
4. **Policies granulares por ação** (`SELECT`/`INSERT`/`UPDATE`/`DELETE` — nunca `FOR ALL`) com role explícita (`TO authenticated` / `TO anon`).
5. **`auth.jwt()` sempre em subquery**: `(SELECT auth.jwt() ->> 'org_id')` — initPlan, evita avaliação por linha.
6. **Nomenclatura pt-BR**: tabelas no plural, colunas no singular, `snake_case`; domínio de negócio em português no TS.
7. **`COMMENT ON POLICY`** com a intenção de negócio em toda policy nova.
8. **Server Components por padrão**; `'use client'` só em ilhas.
9. **Estilo:** Prettier `tabWidth: 4`, `semi: false`, `singleQuote: true`, `printWidth: 100`. O hook de pré-commit reformata arquivos inteiros — diff inflado é esperado, não é scope creep.
10. **Erro em Server Action:** `console.error('Erro ao X:', error.message)` + `throw new Error('<mensagem pt-BR amigável>')`. Nunca vazar erro cru do Supabase para a UI.
11. **`docs/PENDENCIAS.md`** atualizado se a mudança criar ou adiar tarefas.
12. **Next.js 16 tem breaking changes** — consultar `node_modules/next/dist/docs/` antes de usar API do framework.

---

## Superfície `anon` hoje — inventário auditado

Estado verificado em `supabase/schemas/*.sql` e `supabase/migrations/20260709161817_restaura_privilegios_dml_roles_api.sql`. **Todos os GRANTs abaixo são `[VERIFIED: leitura do repositório]`.**

| Tabela | GRANT de tabela para `anon` | Policies que valem para `anon` | Existe policy de SELECT para `authenticated` sem ser via `anon`? |
|---|---|---|---|
| `perfis_empresas` | SELECT, INSERT, UPDATE, DELETE | `SELECT … TO anon, authenticated USING (true)` | ❌ **Não** — a policy é compartilhada |
| `servicos` | SELECT, INSERT, UPDATE, DELETE | `SELECT … TO anon, authenticated USING (ativo = true)` | ✅ Sim (`… TO authenticated USING (tenant_id = jwt.org_id)`) |
| `horarios_funcionamento` | SELECT, INSERT, UPDATE, DELETE | `SELECT … TO anon, authenticated USING (ativo = true)` | ✅ Sim |
| `excecoes_agenda` | SELECT, INSERT, UPDATE, DELETE | `SELECT … TO anon, authenticated USING (true)` | ❌ **Não** |
| `agendamentos` | SELECT, INSERT, UPDATE, DELETE | `SELECT … USING (true)` + `INSERT … WITH CHECK (tenant_id IS NOT NULL)` | ❌ **Não** (nem SELECT nem INSERT) |
| `clientes` | SELECT, INSERT, UPDATE, DELETE | `INSERT … TO anon, authenticated WITH CHECK (tenant_id IS NOT NULL)` | SELECT sim; **INSERT não** |
| `assinaturas` | SELECT **(tenant_id, plano, status)**, INSERT, UPDATE, DELETE | `SELECT … TO anon USING (true)` | ✅ Sim |
| `whatsapp_configs` | SELECT, INSERT, UPDATE, DELETE | nenhuma | ✅ Sim |
| `disparos_whatsapp` | SELECT, INSERT, UPDATE, DELETE | nenhuma | ✅ Sim |

**Três leituras que mudam o plano:**

1. `anon` tem `INSERT/UPDATE/DELETE` em **nove** tabelas, não em duas. Em sete delas só a ausência de policy segura a escrita. Basta alguém escrever uma policy permissiva por engano em qualquer fase futura para reabrir tudo. Fechar no nível de GRANT é o que torna isso robusto.
2. Quatro policies são **`TO anon, authenticated` sem par autenticado**: `perfis_empresas` (SELECT), `excecoes_agenda` (SELECT), `agendamentos` (SELECT e INSERT), `clientes` (INSERT). **Removê-las quebra o dashboard.** Elas têm que ser substituídas por versões `TO authenticated` restritas ao próprio tenant.
3. `assinaturas` já mostra o padrão de GRANT por coluna funcionando — e mostra também o limite dele: `tenant_id` está no GRANT porque `obterPlanoVigentePublico` filtra por ele, e `GET /rest/v1/assinaturas?select=tenant_id` devolve o `org_id` de todo tenant pagante. **Fechar só `perfis_empresas` não fecha o vazamento de `org_id`.**

### Nenhum cross-tenant read no caminho autenticado

Grep completo de `.from('perfis_empresas')` conferido (16 ocorrências). A única suspeita — checagem de slug já em uso — **não** faz SELECT cross-tenant: a unicidade é do índice e o erro é detectado por `error.code === '23505'` (`src/app/actions/perfis-empresas.ts:241-246`). Logo, restringir o SELECT de `perfis_empresas` ao próprio tenant para `authenticated` é seguro. `[VERIFIED: grep + leitura do arquivo]`

---

## Superfície mínima da página pública (resposta à pergunta 1)

Conjunto exato de colunas consumidas pelo fluxo público, extraído de `public-booking.ts`, `booking-engine.ts`, `assinaturas.ts`, `book/[slug]/page.tsx` e os componentes de `etapas/`. **`[VERIFIED: leitura do código]`**

| Tabela | Colunas lidas (`select`) | Colunas usadas em filtro (`WHERE`) | Origem |
|---|---|---|---|
| `perfis_empresas` | `tenant_id, slug, slug_gratuito, nome_estabelecimento, descricao, instagram, endereco, timezone, antecedencia_minima_minutos, horizonte_maximo_dias, cor_marca, logo_url, capa_url` | `slug`, `slug_gratuito`, `tenant_id` | `public-booking.ts:52,215,222,284` (hoje `select('*')` em duas delas) |
| `servicos` | `id, nome, descricao, preco, duracao_minutos` | `id`, `tenant_id`, `ativo` | `public-booking.ts:73,242`; `booking-engine.ts:248` |
| `horarios_funcionamento` | `hora_inicio, hora_fim` | `tenant_id`, `dia_semana`, `ativo` | `booking-engine.ts:196` |
| `excecoes_agenda` | `hora_inicio, hora_fim, bloqueado` | `tenant_id`, `data`, `bloqueado` | `booking-engine.ts:220` |
| `agendamentos` | `data_hora, status` + embed `servicos(duracao_minutos)` | `tenant_id`, `status`, `data_hora`, `id` (só na remarcação) | `booking-engine.ts:270-287` |
| `assinaturas` | `plano, status` | `tenant_id`, `status` | `assinaturas.ts:65` |

**Colunas que o fluxo público NÃO consome e que hoje estão expostas:** `perfis_empresas.telefone_contato`, `created_at`, `updated_at`; `agendamentos.id, cliente_id, servico_id, created_at, updated_at`; `excecoes_agenda.motivo, id, data, created_at, updated_at`; `clientes.*` inteiro; `assinaturas.tenant_id` (exposto sem necessidade de leitura — só de filtro).

**Chegam ao browser hoje** (`page.tsx:64-76` → `BookingApp`): `perfil` projetado em 7 campos (`tenant_id, nome_estabelecimento, descricao, instagram, endereco, timezone, horizonte_maximo_dias`), `personalizacao` sanitizada por plano, `tenantHash`, e **`servicos` inteiro do `select('*')`** — ou seja, `tenant_id`, `ativo`, `created_at` e `updated_at` de cada serviço viajam para o cliente sem uso. Corrigir isso é uma linha e cabe nesta fase.

⚠️ **`perfil.tenant_id` (= `org_id` do Clerk) já está no payload RSC da página pública por desenho** — `BookingApp` precisa dele para chamar `obterSlotsPublicos` e `criarAgendamentoPublico`. Fechar a Data API elimina a **enumeração em massa** (a lista inteira numa requisição), não a obtenção do `org_id` de **um** tenant cujo slug você já conhece. O plano não pode escrever um passo de verificação que afirme o contrário. Ver Q1 em `## Open Questions`.

---

## Standard Stack

### Core

| Biblioteca | Versão | Propósito | Por que é o padrão |
|---|---|---|---|
| `@upstash/qstash` | `2.11.2` | `Receiver` para validar o JWT do header `Upstash-Signature` | SDK oficial da Upstash (repo `upstash/qstash-js`), 452k downloads/semana, é o que a doc do QStash e a skill do projeto (`.agents/skills/upstash/upstash-qstash-js/`) mandam usar. Verificação de assinatura é criptografia — não se escreve à mão `[VERIFIED: npm registry + skill do projeto]` |

**Instalação:**

```bash
pnpm add @upstash/qstash
```

Nada mais é instalado nesta fase. Toda a parte de banco é DDL.

### Já na stack, usado sem instalar nada

| Recurso | Onde | Uso nesta fase |
|---|---|---|
| `createAdminClient()` | `src/lib/supabase/admin.ts` | Passa a servir também as **leituras** públicas; o JSDoc do arquivo precisa ser atualizado (hoje diz "restrito a dois pontos") |
| `instrumentation.ts` | convenção do Next.js (arquivo **não existe** no projeto) | Falha hard no boot quando faltarem as chaves de assinatura |
| Event trigger `rls_auto_enable` | `supabase/schemas/00_funcoes_sistema.sql` | Já garante RLS ligado em tabela nova. SEG-04 é o par que faltava: garantir que o **privilégio** também nasça fechado |

### Alternativas consideradas

| Em vez de | Poderia usar | Trade-off |
|---|---|---|
| `Receiver` manual | `verifySignatureAppRouter` de `@upstash/qstash/nextjs` | Menos código, mas embrulha o handler inteiro, dificulta o log em pt-BR do 401 e não deixa passar `url` explicitamente. Fica como plano B |
| Leitura pública via `createAdminClient()` | RPC `SECURITY DEFINER` concedida a `anon` | Mais forte conceitualmente (nenhuma service key no caminho de leitura), mas exige mover a janela do dia e a agregação de 4 tabelas para SQL — a engine é TS e bem testada. Ver D-1 |
| Leitura pública via `createAdminClient()` | `REVOKE SELECT` + `GRANT SELECT (colunas)` em cada tabela | **Não satisfaz o critério de sucesso 1** — ver Pitfall 1 |

---

## Package Legitimacy Audit

| Pacote | Registro | Idade | Downloads | Repo | Veredito | Disposição |
|---|---|---|---|---|---|---|
| `@upstash/qstash` | npm | criado 2022-06-14 (última publicação 2026-07-14) | 452.546/semana | `github.com/upstash/qstash-js` | `SUS` (motivo: `too-new`, por causa da **publicação** recente da 2.11.2, não da criação do pacote) | **Aprovado** — o sinal `too-new` é falso positivo: o pacote tem 4 anos, é o SDK oficial citado pela documentação da Upstash e pela skill `.agents/skills/upstash/`, sem `postinstall` |

**Pacotes removidos por veredito `SLOP`:** nenhum.
**Pacotes sinalizados como suspeitos que exigem checkpoint humano:** nenhum — o `SUS` acima é justificado e documentado; o planner **não** precisa inserir `checkpoint:human-verify` para instalá-lo.

Comando de conferência para o plano:

```bash
npm view @upstash/qstash version repository.url
npm view @upstash/qstash scripts.postinstall   # esperado: vazio
```

---

## Architecture Patterns

### Diagrama — fluxo de dados depois da fase

```
NAVEGADOR (cliente final, sem sessão)
    │  GET /book/[slug]
    ▼
┌─────────────────────────────────────────────────────────────┐
│ Next.js Server (Server Component / Server Action)           │
│                                                             │
│  page.tsx ──► obterDadosBookingPublico(slug)                │
│                    │                                        │
│  BookingApp ──► obterSlotsPublicos(tenantId, data, dur)     │
│                    │                                        │
│  BookingApp ──► criarAgendamentoPublico({...})              │
│                    │  1. valida tenant / serviço / slot     │
│                    │  2. reexecuta a engine                 │
│                    ▼                                        │
└────────────────────┼────────────────────────────────────────┘
                     │  createAdminClient()  (service_role)
                     │  SEMPRE com .eq('tenant_id', <resolvido no servidor>)
                     │  SEMPRE com lista de colunas explícita
                     ▼
        ┌──────────────────────────────────────┐
        │ Supabase / PostgREST                 │
        │                                      │
        │  role anon ──► SEM GRANT ALGUM ──► ✗ │   ← superfície fechada
        │  role authenticated ──► RLS por tenant│
        │  role service_role ──► bypassa RLS   │
        └──────────────────────────────────────┘

QSTASH (lembrete agendado)
    │  POST /api/webhooks/lembrete   (header Upstash-Signature)
    ▼
┌─────────────────────────────────────────────────────────────┐
│ route.ts                                                    │
│   1. body = await req.text()      ◄── CRU, uma única vez    │
│   2. receiver.verify({ signature, body, url: req.url })     │
│      falhou ──► 401, sem tocar no banco                     │
│   3. JSON.parse(body) ──► fluxo atual (admin client)        │
└─────────────────────────────────────────────────────────────┘

BOOT DO SERVIDOR
   src/instrumentation.ts register() ──► chaves ausentes ──► throw ──► servidor não sobe
```

### Decisão D-1: como a leitura pública passa a acontecer

**Recomendado: `anon` perde a Data API; a leitura pública usa `createAdminClient()`.**

Racional:

- Todas as leituras públicas já são server-side — a mudança é de uma linha por função, sem tocar em componente.
- É a única opção que satisfaz o critério 1 literalmente (nem lista de profissionais, nem `org_id`).
- Satisfaz o critério 3 com folga: `anon` não devolve coluna nenhuma de `agendamentos`/`excecoes_agenda`.
- Uma chave publicável vazada passa a valer **zero** — não é "menos dados", é nada.

Custo real e como contê-lo: o caminho de leitura pública passa a rodar com service role, que bypassa RLS. Mitigações que o plano deve tornar obrigatórias:

1. Toda query do caminho público carrega `.eq('tenant_id', …)` com o `tenantId` **resolvido no servidor** (do slug, em `obterDadosBookingPublico`) ou validado contra `perfis_empresas` antes do uso.
2. **Proibido `select('*')`** no caminho público. Lista de colunas explícita, sempre — é o que impede uma coluna futura (ex.: `cpf_cnpj` da Phase 9, `preco_travado` da Phase 7) de vazar sozinha para o RSC payload.
3. Atualizar o JSDoc de `src/lib/supabase/admin.ts`, que hoje afirma "restrito a dois pontos do fluxo público" e passa a ser três.
4. Verificação por grep no plano: `grep -rn "select('\*')" src/app/actions/public-booking.ts` deve voltar vazio.

Alternativa se o owner recusar service role no caminho de leitura: RPC `SECURITY DEFINER` — ver D-1b em `## Open Questions`.

### Decisão D-2: escopo do `ALTER DEFAULT PRIVILEGES`

O projeto já tem uma linha de `ALTER DEFAULT PRIVILEGES … GRANT` viva em `20260709161817`. SEG-04 é literalmente invertê-la. A escolha é para quais roles:

| Opção | Efeito | Custo |
|---|---|---|
| **A — só `anon`** | Tabela nova não aparece para a chave publicável. Para `authenticated` aparece, mas sem policy (e o event trigger garante RLS ligado) ela devolve zero linha | Nenhum atrito operacional novo |
| **B — `anon` + `authenticated`** (recomendado) | Tabela nova não aparece na Data API para ninguém sem GRANT explícito — critério 4 satisfeito ao pé da letra | Toda tabela nova precisa de uma migration escrita à mão com o GRANT. `db diff` **não** vai gerar. Vira regra em `docs/03` e risco de "permission denied" esquecido |

Recomendo **B**, com a regra escrita, porque é a direção para a qual o próprio Supabase está migrando e porque o custo (uma linha de GRANT por tabela nova) é pequeno perto do benefício de a superfície nunca crescer por acidente. Mas é uma escolha que o owner deve confirmar: a Phase 7 (`perfis_cobranca`) e a Phase 9 (`eventos_asaas`) já vão sentir.

🚨 **Em qualquer das opções, `service_role` NÃO pode perder as default privileges.** A migration `20260709161817` documenta o precedente: um `ALTER DEFAULT PRIVILEGES … REVOKE` ad hoc já quebrou todo o acesso via PostgREST neste projeto uma vez. Se `service_role` perder o GRANT em tabelas futuras, o `createAdminClient()` — e portanto o booking público inteiro — quebra na próxima tabela criada, com erro `permission denied` que ninguém vai associar à causa.

### Padrão 1: substituir policy compartilhada, nunca só remover

Quatro policies são `TO anon, authenticated` **sem par autenticado**. O padrão correto:

```sql
-- Fonte do padrão: supabase/schemas/03_horarios_funcionamento.sql (policy 1b)
DROP POLICY "Permitir SELECT público para todos" ON excecoes_agenda;

CREATE POLICY "Permitir SELECT do próprio tenant para autenticados"
ON excecoes_agenda FOR SELECT TO authenticated
USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

COMMENT ON POLICY "Permitir SELECT do próprio tenant para autenticados" ON excecoes_agenda IS
'Bloqueios da agenda são dado do profissional (o campo motivo é texto livre e pode ser sensível). A página pública lê exceções pelo servidor com cliente privilegiado, nunca pela role anon.';
```

O `(SELECT auth.jwt() …)` em subquery é obrigatório pela regra de performance do projeto (initPlan).

⚠️ Lembrete que o próprio schema documenta: `INSERT/UPDATE … RETURNING` (o `.select()` do supabase-js) **exige que a linha passe no SELECT**. Ao trocar as policies de SELECT, conferir que toda action autenticada que faz `.insert(...).select(...)` continua enxergando a própria linha. `agendamentos.ts:318-320`, `clientes` em `agendamentos.ts:285-286` e o `upsert(...).select()` de `perfis-empresas.ts:234-238` são os pontos a verificar.

### Padrão 2: privilégios em migration escrita à mão

```sql
-- supabase/migrations/<ts>_fecha_data_api_para_anon.sql
-- Escrita à mão POR NECESSIDADE: `supabase db diff` não emite GRANT/REVOKE
-- (docs/SUPABASE_DECLARATIVE-DATABASE-SCHEMA.md; column privileges está na
-- lista de caveats do migra). Mesmo precedente de
-- 20260709193156_restringe_colunas_assinaturas_anon.sql.

-- 1. Tabelas e sequences existentes: anon perde tudo.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- 2. Tabelas futuras criadas pelo role postgres (é o role que aplica migrations).
--    Default privileges valem SÓ para objetos criados pelo role indicado e NÃO
--    são herdadas por membership — por isso o FOR ROLE postgres é obrigatório.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;

-- 3. service_role continua com tudo — o createAdminClient() depende disso.
alter default privileges for role postgres in schema public
  grant all on tables to service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to service_role;
```

Ordem importa: `REVOKE`/`GRANT` de coluna só funciona depois de revogar o privilégio de tabela, porque **o grant de tabela não é afetado por operação de coluna** — é a mesma razão pela qual `08_assinaturas.sql` faz `REVOKE SELECT` antes do `GRANT SELECT (…)`. `[CITED: postgresql.org/docs/current/sql-grant.html]`

Manter o bloco também em `supabase/schemas/*.sql` (como `08_assinaturas.sql` já faz) para documentar a intenção junto da tabela, sabendo que ele é **decorativo do ponto de vista do diff** — quem aplica é a migration.

### Padrão 3: verificação do QStash com body cru

```typescript
// src/app/api/webhooks/lembrete/route.ts
import { Receiver } from '@upstash/qstash'

const receiver = new Receiver({
    currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
    nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
})

export async function POST(req: NextRequest) {
    const assinatura = req.headers.get('upstash-signature')
    if (!assinatura) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
    }

    // O body só pode ser lido UMA vez e a verificação exige o texto cru:
    // JSON.parse só depois de validar.
    const corpoCru = await req.text()

    try {
        await receiver.verify({ signature: assinatura, body: corpoCru, url: req.url })
    } catch {
        console.warn('Assinatura QStash inválida no webhook de lembrete.')
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
    }

    const { agendamentoId, tenantId } = JSON.parse(corpoCru)
    // ... fluxo atual, sem mudanças
}
```

`url: req.url` (e não uma constante montada de `APP_URL`) é a escolha certa **aqui**, por dois motivos concretos:

1. Os lembretes já agendados no QStash foram publicados para `…/api/webhooks/lembrete?secret=<valor>`. A claim `sub` do JWT contém essa URL **com a query string**. Uma constante sem `?secret=` daria mismatch e mataria em silêncio todo lembrete em voo (até 14 dias à frente, pelo `horizonte_maximo_dias` padrão). `req.url` casa nos dois formatos e a migração fica sem janela cega.
2. Continua entregando a proteção real do parâmetro `url`: a assinatura precisa ter sido emitida para o endpoint que está sendo chamado.

Risco a documentar: se a aplicação rodar atrás de um proxy que reescreve host ou esquema, `req.url` pode divergir do publicado e produzir 401 legítimo. Sintoma: lembrete parando de sair com `Assinatura QStash inválida` no log. Conserto: montar a URL a partir de `APP_URL`, depois de esvaziar a fila do QStash.

### Padrão 4: falhar no boot

```typescript
// src/instrumentation.ts  (arquivo novo — o projeto usa src/, então é src/instrumentation.ts)
export function register() {
    const obrigatorias = ['QSTASH_CURRENT_SIGNING_KEY', 'QSTASH_NEXT_SIGNING_KEY']
    const faltando = obrigatorias.filter((nome) => !process.env[nome])
    if (faltando.length > 0) {
        throw new Error(
            `Variáveis de ambiente obrigatórias ausentes: ${faltando.join(', ')}. ` +
                'Sem as chaves de assinatura do QStash o webhook de lembrete não pode ser autenticado.',
        )
    }
}
```

`register()` "é chamada **uma vez** quando uma nova instância do servidor Next.js é iniciada, e precisa completar antes de o servidor estar pronto para atender requisições" — doc empacotada do Next 16.2.10, `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md:18`. `[VERIFIED: docs empacotadas do Next 16.2.10]`

**Não** colocar o `throw` no escopo de módulo do route handler: o Next avalia módulos de rota durante o `next build`, e isso quebraria `pnpm build` em qualquer ambiente sem as chaves — violando a Definition of Done do projeto. `register()` roda só no boot de runtime.

### Anti-padrões

- **Achar que RLS substitui GRANT.** A role precisa do privilégio **e** de passar na policy. A migration `20260709161817` existe exatamente porque alguém aprendeu isso do jeito difícil neste repositório.
- **`FOR ALL` em policy.** Proibido pelo CLAUDE.md e mais frágil: mistura leitura e escrita numa expressão só.
- **`auth.jwt()` fora de subquery.** Vira avaliação por linha.
- **`req.json()` antes de verificar a assinatura.** Consome o body e impede a verificação; e faz o servidor parsear entrada não autenticada.
- **Deletar policy compartilhada sem substituir.** Quatro delas seguram o dashboard.
- **Editar `supabase/migrations/` à mão para DDL de tabela/policy.** A exceção autorizada é **só** para GRANT/REVOKE/DEFAULT PRIVILEGES, que o diff não gera.

---

## Don't Hand-Roll

| Problema | Não construir | Usar | Por quê |
|---|---|---|---|
| Autenticar o webhook do QStash | Comparação de secret em query string, HMAC próprio, comparação com `===` | `Receiver` de `@upstash/qstash` | Assinatura é JWT com rotação de chave (tenta `current`, depois `next`), expiração de 5 min e comparação em tempo constante. Reimplementar é o caminho para timing attack e para quebrar na primeira rotação de chave `[CITED: skill upstash-qstash-js/verification/receiver.md]` |
| Esconder colunas de uma role | View "pública" nova, coluna calculada, filtro na aplicação | `REVOKE` + `GRANT (colunas)` — ou, aqui, revogar tudo | O banco é a única camada que não pode ser contornada pelo PostgREST |
| Impedir que tabela nova nasça exposta | Checklist, code review, comentário no schema | `ALTER DEFAULT PRIVILEGES` (+ o event trigger `rls_auto_enable` que já existe) | Controle que executa sozinho não depende de alguém lembrar |
| Garantir RLS ligado em tabela nova | Nada — **já está pronto** | Event trigger `ensure_rls` (`00_funcoes_sistema.sql`) | Não reescrever; SEG-04 é a metade de privilégios que falta |
| Validar env obrigatória | `if (!x) return 401` espalhado por arquivo | `register()` de `instrumentation.ts` | Falha uma vez no boot, não N vezes em produção com o sintoma errado |

**Insight central:** nesta fase, quase nenhum código novo é escrito. O trabalho é **retirar** privilégio e **substituir** policy. Toda linha de lógica nova inventada aqui é superfície nova.

---

## Common Pitfalls

### Pitfall 1: GRANT por coluna não esconde `tenant_id` — e por isso não fecha o critério 1

**O que dá errado:** o plano replica o padrão de `08_assinaturas.sql` em `perfis_empresas`, `servicos`, `horarios_funcionamento`, `excecoes_agenda` e `agendamentos`, dá o trabalho por feito, e `GET /rest/v1/servicos?select=tenant_id` continua devolvendo o `org_id` de todo tenant da plataforma.

**Por que acontece:** duas regras do Postgres se combinam.

1. `SELECT` é exigido para **qualquer** coluna referenciada na query, inclusive as usadas só no `WHERE`. `[CITED: postgresql.org/docs/current/sql-grant.html]`
2. As cinco tabelas do fluxo público são filtradas por `.eq('tenant_id', tenantId)`. Sem `tenant_id` no GRANT, a query da engine falha com `42501`.

Logo `tenant_id` **tem** que estar no GRANT para o produto funcionar, e estar no GRANT significa estar raspável. Não existe combinação de GRANT por coluna que satisfaça ao mesmo tempo "a engine filtra por tenant" e "o `org_id` não é legível". E RLS não resolve o outro lado: a policy é `USING (true)` porque uma role anônima e sem estado não tem como ser amarrada a um slug específico.

**Como evitar:** aceitar que o critério 1 exige remover `anon` da Data API (D-1) ou trocar por RPC `SECURITY DEFINER` com o slug como argumento. GRANT por coluna continua sendo a ferramenta certa para o caso de `assinaturas` — onde a role legitimamente precisa ler algo — e a ferramenta errada para "não quero ser enumerado".

**Sinais de alerta:** um passo do plano que diz "aplicar GRANT por coluna em `perfis_empresas`" sem dizer o que acontece com `USING (true)`.

---

### Pitfall 2: `select('*')` quebra com GRANT parcial — e o projeto tem dois

**O que dá errado:** `obterDadosBookingPublico` faz `select('*')` em `perfis_empresas` (linhas 216, 223) e em `servicos` (linha 242). Sob qualquer regime de GRANT parcial, o PostgREST lê a tabela inteira e o Postgres responde `42501 permission denied for table` — a página pública inteira vira 404 (`obterDadosBookingPublico` devolve `null` quando dá erro no perfil). O sintoma é catastrófico e não tem mensagem apontando para a causa.

**Por que acontece:** `select=*` significa ler todas as colunas; privilégio parcial não cobre isso. É a mesma armadilha de sentido inverso à do Pitfall 1: lá o GRANT era largo demais, aqui é estreito demais para o que o código pede. `[VERIFIED: regra do Postgres + relatos convergentes de usuários Supabase]`

**Como evitar:** trocar os dois `select('*')` por lista explícita **na mesma tarefa** que mexe em privilégio, nunca depois. Vale mesmo adotando D-1 (onde tecnicamente `select('*')` continuaria funcionando com service role): a lista explícita é o que impede coluna futura de vazar para o payload do browser.

**Sinais de alerta:** `/book/<slug>` retornando 404 logo depois da migration; `grep -rn "select('\*')" src/app/actions/public-booking.ts` com resultado.

---

### Pitfall 3: remover as policies `TO anon, authenticated` quebra o dashboard, não o booking

**O que dá errado:** o plano lê "remover policies de INSERT `anon`" e faz `DROP POLICY "Permitir INSERT público para visitantes" ON agendamentos`. O booking público continua funcionando (usa `createAdminClient()`), e o **agendamento manual do dashboard** para de funcionar — porque `src/app/actions/agendamentos.ts:318-320` insere com o client autenticado e a policy dropada era `TO anon, authenticated`. Mesma coisa em `clientes` (insert em `agendamentos.ts:285-286`).

E há o caso pior, silencioso: `perfis_empresas`, `excecoes_agenda` e `agendamentos` **não têm nenhuma outra policy de SELECT**. Removê-las deixa o dashboard lendo zero linha — e como o padrão do projeto é degradar em vez de explodir (`obterAssinaturaVigente` cai para gratuito em erro; `booking-engine` retorna `[]`), o sintoma vira "a agenda apareceu vazia", não "erro de permissão".

**Como evitar:** para cada uma das quatro policies compartilhadas, **substituir** por uma versão `TO authenticated` com `tenant_id = (SELECT auth.jwt() ->> 'org_id')`. Checklist mínimo de regressão manual no dashboard: agenda carrega, novo agendamento manual salva, bloqueio/exceção salva, aba Perfil salva, serviços listam.

**Sinais de alerta:** plano com verbo "remover"/"dropar" em `perfis_empresas`, `excecoes_agenda`, `agendamentos` ou `clientes` sem o `CREATE POLICY` correspondente na mesma tarefa.

---

### Pitfall 4: `ALTER DEFAULT PRIVILEGES` amplo derruba o produto inteiro — precedente no próprio repositório

**O que dá errado:** um `alter default privileges … revoke all on tables from anon, authenticated, service_role` (que é o snippet que a documentação do Supabase publica) tira também o `service_role`. Nenhuma tabela existente quebra na hora — mas a **próxima** tabela criada (Phase 7: `perfis_cobranca`; Phase 9: `eventos_asaas`) nasce inacessível ao `createAdminClient()`, e o booking público quebra numa fase que não tem nada a ver com privilégios.

**Por que acontece:** o snippet oficial da Supabase inclui `service_role` porque assume o modelo "zero client DB access" onde o backend usa conexão direta. Aqui o backend usa a Data API com a secret key.

**Como evitar:** copiar o snippet e **editar**: revogar de `anon` (+ `authenticated`, se D-2 = B) e **reafirmar** `grant all on tables/sequences to service_role`. O comentário na migration deve dizer por quê, apontando para `20260709161817`, que registra a vez em que isso já aconteceu.

**Sinais de alerta:** a string `service_role` aparecendo em qualquer linha de `revoke` da migration.

---

### Pitfall 5: fechar a Data API não fecha o RSC payload

**O que dá errado:** a fase é declarada concluída e o `org_id` do tenant continua obtível abrindo `/book/<slug>` e lendo o payload RSC — porque `page.tsx:65` passa `perfil.tenant_id` para o componente cliente, que precisa dele para chamar as actions. Um passo de verificação escrito como "o `org_id` não é mais obtível" seria falso.

**Por que acontece:** o `tenant_id` é o identificador que as Server Actions públicas recebem como parâmetro do browser hoje. Fechar o banco não muda o contrato da action.

**Como evitar:** escrever o critério pelo que ele realmente é — *a lista de profissionais e os `org_id` em massa deixam de ser obteníveis com a chave publicável*. Quem conhece um slug continua obtendo aquele `org_id` específico. Se o owner quiser fechar também isso, é a mudança de contrato descrita em Q1. Aproveitar a passagem para trocar `servicos` (hoje `select('*')` → objeto inteiro no payload) por projeção explícita.

**Sinais de alerta:** critério de verificação redigido como "org_id não aparece em lugar nenhum".

---

### Pitfall 6: os lembretes já agendados no QStash são estado vivo fora do repositório

**O que dá errado:** existem mensagens no QStash publicadas para `…/api/webhooks/lembrete?secret=<valor antigo>`, com entrega marcada para até 14 dias à frente. Elas não estão no git, não estão no banco, e a fase muda o contrato do endpoint que elas vão chamar. Se a verificação passar a exigir uma `url` sem a query string, todas falham com 401 e o cliente final simplesmente não recebe lembrete — falha silenciosa por desenho (a mensageria falha em silêncio para o cliente).

**Como evitar:** `url: req.url` (Padrão 3) torna a transição transparente. Como reforço, o plano pode listar/limpar a fila do QStash — `docs/RESET_AMBIENTE_DEV.md` já documenta o QStash como um dos quatro serviços com estado.

**Sinais de alerta:** aumento de linhas com `status = 'falha'` e `tipo = 'lembrete'` em `disparos_whatsapp` depois do deploy; log com `Assinatura QStash inválida`.

---

### Pitfall 7: a nova env var trava o dev antes de alguém perceber — ❌ RETRATADO

> **⚠️ Retratação (2026-07-21, posterior à pesquisa).** Este pitfall partia de uma premissa falsa e **não deve gerar tarefa no plano**. `QSTASH_NEXT_SIGNING_KEY` **já está configurada** no `.env.local` e no Railway: o `.env.example` versionado documenta as quatro variáveis do QStash (`QSTASH_URL`, `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`) com valores censurados. Verificado pelo owner.
>
> **Como o erro entrou:** a conclusão veio de um `grep` em `src/`, que estava correto — nenhum código lê a variável hoje, porque nada verifica assinatura. O salto foi tratar *"não é lida pelo código"* como *"não está configurada no ambiente"*. A pesquisa registrou honestamente que `.env.local` não foi lido (regra de segredos), mas mesmo assim afirmou a ausência como fato, em vez de marcá-la como suposição no `## Assumptions Log`. O `.env.example`, que é versionado e não contém segredo, teria respondido a pergunta.
>
> **Regra que fica:** afirmação sobre *estado de ambiente* (env configurada, serviço provisionado, conta ativa) é suposição até ser verificada por fonte que enxergue o ambiente. `grep` em código responde apenas o que o código lê.

**O que continua valendo deste item:** a **ordem** importa por outro motivo. Assim que o boot passar a exigir as chaves, qualquer ambiente que não as tenha para de subir. Como elas já existem no `.env.local` e no Railway, não há passo humano a fazer — mas a tarefa que adiciona a exigência deve vir acompanhada, no mesmo bloco, de acrescentar `QSTASH_CURRENT_SIGNING_KEY` e `QSTASH_NEXT_SIGNING_KEY` ao bloco `env` de `vitest.config.ts`. O arquivo já documenta por quê: constantes de módulo são avaliadas no import, e stub por teste não alcança. Sem isso, a suíte quebra no momento em que a falha dura entra.

**Sinais de alerta:** `pnpm test` falhando por env ausente logo depois da tarefa que introduz a verificação de assinatura.

---

### Pitfall 8: o bug do "assume 30 min" some sozinho e mascara a Phase 2

**O que dá errado:** `booking-engine.ts:303` assume 30 minutos quando o embed `servicos(duracao_minutos)` volta nulo. Ele volta nulo hoje porque a policy `USING (ativo = true)` esconde serviço desativado da role `anon`. Com a leitura pública passando pelo `service_role` (que bypassa RLS), o embed passa a devolver a duração real — o fallback deixa de disparar no fluxo público. É uma melhoria, mas **não planejada**, e ela invalida qualquer teste da Phase 2 escrito para reproduzir o sintoma no caminho público.

**Como evitar:** registrar isso no handoff da fase. AGE-01/AGE-02 continuam necessários — a duração ainda vem por join e ainda muda quando o profissional edita o serviço; só o sintoma "assume 30 min" muda de lugar (continua valendo se o join falhar por outro motivo). O plano da Phase 2 precisa saber que o repro mudou.

**Sinais de alerta:** teste da Phase 2 que tenta provar o bug desativando um serviço e passando pelo fluxo público.

---

## Code Examples

### Fechar `agendamentos` (policy declarativa + privilégio manual)

```sql
-- supabase/schemas/07_agendamentos.sql  (substitui as políticas 1 e 2 atuais)

-- 1. Leitura restrita ao profissional dono da agenda. A página pública lê a
--    ocupação pelo servidor com cliente privilegiado — a role anon não precisa
--    (e não deve) enxergar agendamento nenhum: cliente_id e servico_id
--    permitem pivotar a agenda de qualquer tenant.
CREATE POLICY "Permitir SELECT do próprio tenant para autenticados"
ON agendamentos FOR SELECT TO authenticated
USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

-- 2. Criação restrita ao profissional (agendamento manual do dashboard).
--    O booking público (B2C) escreve pela Server Action com createAdminClient()
--    após validar tenant, serviço e slot — nunca pela Data API.
CREATE POLICY "Permitir INSERT para membros da org autenticados"
ON agendamentos FOR INSERT TO authenticated
WITH CHECK (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

COMMENT ON POLICY "Permitir SELECT do próprio tenant para autenticados" ON agendamentos IS
'A agenda é dado operacional do tenant. O fluxo público de booking obtém ocupação pelo servidor, não pela role anon.';
COMMENT ON POLICY "Permitir INSERT para membros da org autenticados" ON agendamentos IS
'Agendamento manual do dashboard. A criação pelo cliente final passa pela Server Action pública, que valida e escreve com privilégio de serviço.';
```

### Projeção explícita no caminho público

```typescript
// src/app/actions/public-booking.ts — substitui o select('*')
// Colunas explícitas por contrato: coluna nova (ex.: cpf_cnpj na Phase 9) não
// entra sozinha no payload que vai para o browser.
const COLUNAS_PERFIL_PUBLICO =
    'tenant_id, slug, slug_gratuito, nome_estabelecimento, descricao, ' +
    'instagram, endereco, timezone, antecedencia_minima_minutos, ' +
    'horizonte_maximo_dias, cor_marca, logo_url, capa_url'

const COLUNAS_SERVICO_PUBLICO = 'id, nome, descricao, preco, duracao_minutos'
```

### Verificação anônima da Data API (resposta à pergunta 5)

Todos os comandos usam apenas variáveis públicas do `.env.local` (`NEXT_PUBLIC_*`) — nenhum segredo é lido.

```bash
# Carrega só as vars públicas necessárias
export SUPABASE_URL=$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2-)
export ANON_KEY=$(grep -E '^NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=' .env.local | cut -d= -f2-)

# --- Critério 1: perfis_empresas não é enumerável (nem colunas, nem contagem) ---
curl -s "$SUPABASE_URL/rest/v1/perfis_empresas?select=*" -H "apikey: $ANON_KEY" | head -c 400
curl -s "$SUPABASE_URL/rest/v1/perfis_empresas?select=tenant_id,telefone_contato" -H "apikey: $ANON_KEY"
# ESPERADO: erro de permissão (42501) ou PGRST205, NUNCA um array com linhas.

# --- Critério 2: escrita anônima é rejeitada ---
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$SUPABASE_URL/rest/v1/agendamentos" \
  -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' \
  -d '{"tenant_id":"org_teste","cliente_id":"00000000-0000-0000-0000-000000000000","servico_id":"00000000-0000-0000-0000-000000000000","data_hora":"2030-01-01T12:00:00Z"}'
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$SUPABASE_URL/rest/v1/clientes" \
  -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' \
  -d '{"tenant_id":"org_teste","nome":"bot","telefone":"11999999999"}'
# ESPERADO: 401/403/404 — nunca 201.

# --- Critério 3: agendamentos e excecoes_agenda sem colunas sensíveis ---
curl -s "$SUPABASE_URL/rest/v1/agendamentos?select=cliente_id" -H "apikey: $ANON_KEY"
curl -s "$SUPABASE_URL/rest/v1/excecoes_agenda?select=motivo" -H "apikey: $ANON_KEY"
# ESPERADO: erro de permissão. NUNCA um uuid de cliente nem texto de motivo.

# --- Critério 3b: as demais tabelas do fluxo também não vazam org_id ---
for t in servicos horarios_funcionamento assinaturas whatsapp_configs disparos_whatsapp; do
  printf '%-24s ' "$t"
  curl -s "$SUPABASE_URL/rest/v1/$t?select=tenant_id&limit=1" -H "apikey: $ANON_KEY"
  echo
done
# ESPERADO: nenhuma linha com org_... em nenhuma delas.

# --- Critério 4: tabela nova nasce fechada ---
# 1) criar via MCP/SQL editor:  create table public.teste_superficie (id int primary key);
curl -s "$SUPABASE_URL/rest/v1/teste_superficie?select=*" -H "apikey: $ANON_KEY"
# ESPERADO: PGRST205 (não está no schema cache) ou 42501. NUNCA "[]".
# 2) drop table public.teste_superficie;

# --- Critério 5: webhook rejeita POST sem assinatura ---
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/api/webhooks/lembrete \
  -H 'Content-Type: application/json' -d '{"agendamentoId":"x","tenantId":"org_x"}'
# ESPERADO: 401.
# E com o secret antigo (regressão do fallback 'secret-key'):
curl -s -o /dev/null -w '%{http_code}\n' -X POST 'http://localhost:3000/api/webhooks/lembrete?secret=secret-key' \
  -H 'Content-Type: application/json' -d '{"agendamentoId":"x","tenantId":"org_x"}'
# ESPERADO: 401.

# --- Regressão obrigatória: o booking público continua funcionando ---
curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:3000/book/<slug-real>"
# ESPERADO: 200 (e o wizard completo verificado à mão, até a tela de sucesso).
```

**Nota sobre os códigos esperados:** o PostgREST distingue dois cenários. Se a role perde todo privilégio na tabela, ela sai do schema cache e a resposta costuma ser **404 com `PGRST205`** ("Could not find the table … in the schema cache"). Se há privilégio mas a query toca coluna sem GRANT, é **42501** mapeado para 403. Ambos satisfazem o critério; o plano deve aceitar os dois e **falhar** apenas quando vier `200` com corpo de dados. `[CITED: docs.postgrest.org/en/latest/references/errors.html; supabase.com/docs/guides/troubleshooting/database-api-42501-errors]` — confiança MÉDIA: qual dos dois aparece depende de estado de cache, então o assert deve ser "não é 200 com linhas", não um código fixo.

---

## Runtime State Inventory

Fase de refatoração de privilégios + mudança de contrato de webhook. Estado que existe **fora** do repositório e que um grep não encontra:

| Categoria | O que foi encontrado | Ação necessária |
|---|---|---|
| **Dados armazenados** | Nenhuma linha muda de conteúdo — a fase mexe em privilégio e policy, não em dado. Banco é dev e descartável (autorização do owner de 2026-07-21) | Nenhuma migração de dados. Sem query de pré-voo: não há constraint sendo apertada |
| **Config de serviço vivo** | **QStash:** mensagens de lembrete já publicadas apontando para `…/api/webhooks/lembrete?secret=<valor>`, com entrega até ~14 dias à frente, invisíveis no git. **Supabase Cloud (`cimeiteyueeolwmlouxi`):** os GRANTs vivem só no banco — o `schemas/` não os reproduz por diff | QStash: `url: req.url` cobre a transição sem janela cega; opcionalmente esvaziar a fila (`docs/RESET_AMBIENTE_DEV.md` §4). Supabase: aplicar a migration manual no cloud e registrar a `version` em `supabase_migrations.schema_migrations` |
| **Estado registrado no SO** | Nenhum. Não há Task Scheduler, pm2, systemd nem launchd neste projeto — verificado por ausência de qualquer referência a esses mecanismos no repositório | Nenhuma |
| **Segredos e env vars** | ❌ **Corrigido em 2026-07-21:** `QSTASH_CURRENT_SIGNING_KEY` **e** `QSTASH_NEXT_SIGNING_KEY` já estão configuradas no `.env.local` e no Railway — o `.env.example` versionado documenta as quatro vars do QStash. A afirmação original de que a segunda "não existe em lugar nenhum" veio de `grep` em `src/` e confundiu "não é lida pelo código" com "não está no ambiente" | Nenhuma ação do owner. Ambas as chaves entram no bloco `env` de `vitest.config.ts` na mesma tarefa que introduz a falha dura; a lista de vars requeridas de `.claude/CLAUDE.md` é atualizada (lá sim estão ausentes) |
| **Artefatos de build / pacotes** | `@upstash/qstash` ausente de `node_modules` e de `package.json`. `pnpm-lock.yaml` muda com a instalação | `pnpm add @upstash/qstash`; lockfile commitado junto |

**A pergunta canônica:** depois que todo arquivo do repositório estiver atualizado, o que ainda tem o comportamento antigo? Resposta: (a) o banco no Supabase Cloud, até a migration manual ser aplicada; (b) as mensagens já enfileiradas no QStash; (c) o `.env.local` da máquina do owner e de qualquer ambiente de deploy.

---

## Environment Availability

| Dependência | Exigida por | Disponível | Versão | Fallback |
|---|---|---|---|---|
| Node.js | tudo | ✓ | v24.15.0 | — |
| pnpm | instalação do `@upstash/qstash` | ✓ | 11.9.0 | — |
| `curl` | verificação dos critérios 1-5 | ✓ | 8.15.0 | — |
| `jq` | inspeção das respostas | ✓ | 1.8.1 | não essencial |
| Docker (daemon) | shadow db efêmero do `supabase db diff` | ✓ | 29.6.1, daemon up | — |
| `npx supabase` | gerar migration das mudanças de **policy** | ✓ (via `npx -y supabase@latest`) | — | escrever a migration de policy à mão (permitido nesta fase DEV, mas fora do padrão) |
| **MCP do Supabase** | **aplicar** DDL no Supabase Cloud | ✗ ausente nesta sessão, mas **já pré-aprovado** em `.claude/settings.local.json` (`mcp__supabase__apply_migration`, `execute_sql`, `list_migrations`) | — | Basta o OAuth do owner — nenhuma permissão nova é necessária |
| **`psql` pelo pooler** | alternativa de aplicação direta | ✓ **verificado em 2026-07-21** | cliente 18.3 / servidor 17.6 | `aws-1-sa-east-1.pooler.supabase.com:5432`, usuário `postgres.<ref>`, senha em `SUPABASE_POSTGRES_PASSWORD`. DDL confirmado por transação revertida |

**Correção de 2026-07-21 — a aplicação de DDL não é bloqueio.** A pesquisa registrou que `psql` "exigiria a connection string, que não está entre as vars conhecidas". Está: `SUPABASE_POSTGRES_PASSWORD` existe no `.env.local` e o host se deriva do project ref. Duas ressalvas apuradas na verificação:

- A **direct connection** (`db.<ref>.supabase.co`) resolve **apenas para IPv6** e a máquina do owner não tem rota IPv6 — inalcançável. Só o pooler funciona.
- O prefixo do pooler é **`aws-1`**, não `aws-0` como dizem a documentação e os tutoriais. Uma varredura em `aws-0-*` retorna `ENOTFOUND tenant/user` em todas as regiões e parece "projeto não existe".

**Consequência para o plano:** cada tarefa de banco **não** precisa de `checkpoint:human-verify`, desde que uma das duas vias esteja liberada antes da execução — MCP autenticado (permissão já concedida) ou `Bash(psql -h aws-1-sa-east-1.pooler.supabase.com *)` no `permissions.allow`. Em qualquer via, registrar a `version` em `supabase_migrations.schema_migrations`. Não existe banco local — `docs/RESET_AMBIENTE_DEV.md` e a memória do projeto são explícitos: um stack Docker local do Supabase pode existir na máquina como resíduo e **engana**.

---

## Validation Architecture

### Test Framework

| Propriedade | Valor |
|---|---|
| Framework | Vitest ^4.1.10 |
| Arquivo de config | `vitest.config.ts` (include `src/**/*.test.ts`, bloco `env` com stubs de módulo) |
| Comando rápido | `pnpm vitest run src/lib/__tests__/<arquivo>.test.ts` |
| Suíte completa | `pnpm test` |
| Cobertura hoje | 4 suítes, todas em `src/lib/` — nenhuma Server Action, nenhum route handler, nenhum teste de RLS |

### Mapa requisito → verificação

| Req | Comportamento | Tipo | Comando automatizável | Arquivo existe? |
|---|---|---|---|---|
| SEG-01 | POST anônimo em `agendamentos`/`clientes` rejeitado | integração (HTTP contra a Data API) | `bash scripts/verificar-superficie-anon.sh` | ❌ Wave 0 |
| SEG-02 | `perfis_empresas` não enumerável por `anon` | integração | idem | ❌ Wave 0 |
| SEG-03 | `agendamentos`/`excecoes_agenda` sem `cliente_id`/`motivo` para `anon` | integração | idem | ❌ Wave 0 |
| SEG-04 | Tabela nova nasce sem acesso `anon` | manual (cria/derruba tabela descartável) | passo documentado no script, com confirmação humana | ❌ Wave 0 |
| SEG-05 | POST sem assinatura válida é rejeitado | unit | `pnpm vitest run src/lib/__tests__/qstash-assinatura.test.ts` | ❌ Wave 0 |
| SEG-05 | App não sobe sem as chaves | manual | `env -u QSTASH_NEXT_SIGNING_KEY pnpm start` → processo termina com erro | ❌ Wave 0 |
| Regressão | Booking público continua idêntico | manual (UAT) | wizard completo até a tela de sucesso + agendamento aparecendo na agenda | — |
| Regressão | Dashboard continua funcionando | manual (UAT) | agenda, novo agendamento manual, exceção, perfil, serviços | — |

**Por que tanto manual:** privilégio de banco não é testável em unidade sem um banco. E não há banco local. O que dá para automatizar de verdade é (a) o script de curl, que vira o artefato de prova da fase e continua servindo nas fases seguintes, e (b) a extração da verificação de assinatura para um módulo puro.

### Taxa de amostragem

- **Por commit de tarefa:** `pnpm lint && pnpm test` (rápido, sem banco).
- **Por tarefa de banco:** `bash scripts/verificar-superficie-anon.sh` + a regressão manual da tabela tocada.
- **Portão da fase:** `pnpm lint`, `pnpm test`, `pnpm build` verdes **e** o script de superfície com todos os itens em ESPERADO **e** UAT do booking público + dashboard.

### Lacunas da Wave 0

- [ ] `scripts/verificar-superficie-anon.sh` — encapsula os curls de `## Code Examples`, sai com código ≠ 0 se qualquer requisição devolver `200` com linhas. Cobre SEG-01 a SEG-04
- [ ] `src/lib/qstash-assinatura.ts` — extrai a verificação do route handler para um módulo testável (recebe `signature`, `body`, `url` e devolve `boolean`), permitindo mockar o `Receiver`. Cobre SEG-05
- [ ] `src/lib/__tests__/qstash-assinatura.test.ts` — casos: sem header → rejeita; assinatura inválida → rejeita; assinatura válida → aceita; body cru diferente do assinado → rejeita
- [ ] `vitest.config.ts` — acrescentar `QSTASH_CURRENT_SIGNING_KEY` e `QSTASH_NEXT_SIGNING_KEY` ao bloco `env`

---

## Security Domain

`security_enforcement: true`, `security_asvs_level: 1`, `security_block_on: high`.

### Categorias ASVS aplicáveis

| Categoria ASVS | Aplica | Controle padrão nesta fase |
|---|---|---|
| V2 Autenticação | Parcial | B2B via Clerk (fora de escopo). **O webhook é autenticação de máquina:** `Receiver` do `@upstash/qstash` substitui um secret em query string |
| V3 Gestão de sessão | Não | Cliente final nunca tem sessão (Fricção Zero); B2B é Clerk |
| V4 Controle de acesso | **Sim — núcleo da fase** | GRANT/REVOKE por role + RLS por `tenant_id`, com `(SELECT auth.jwt() ->> 'org_id')` em subquery. Toda escrita privilegiada com `tenant_id` derivado de fonte confiável, nunca do corpo da requisição |
| V5 Validação de entrada | Sim | Já existe na action pública (telefone `replace(/\D/g,'')`, serviço do mesmo tenant, slot revalidado). Nesta fase acrescenta: **não parsear body não autenticado** — `receiver.verify()` antes de `JSON.parse` |
| V6 Criptografia | Sim | Verificação de assinatura JWT delegada à lib oficial. **Nunca** comparar segredo com `===` nem implementar HMAC próprio |
| V7 Tratamento de erro e log | Sim | 401 genérico no webhook (sem revelar qual verificação falhou); `console.warn` com contexto em pt-BR; nunca repassar `error.message` do PostgREST à UI |
| V13 API e serviços web | Sim | Reduzir a superfície da Data API é literalmente o objetivo |

### Padrões de ameaça conhecidos para esta stack

| Padrão | STRIDE | Mitigação padrão |
|---|---|---|
| Enumeração da base de clientes via PostgREST com chave publicável | Information Disclosure | Revogar privilégio da role `anon`; RLS sozinho não basta |
| Escrita direta na Data API contornando a Server Action | Tampering | Revogar `INSERT/UPDATE/DELETE` de `anon` **e** remover as policies permissivas |
| Webhook forjado disparando WhatsApp em nome de tenants | Spoofing | Assinatura HMAC verificada com a lib oficial; falha hard se as chaves faltarem |
| Secret em query string (vaza em log de proxy, Referer, histórico) | Information Disclosure | Header `Upstash-Signature`, nunca query param |
| Fallback de credencial (`|| 'secret-key'`) transformando env ausente em porta aberta | Spoofing | Nunca usar `||` como default de segredo. Falhar no boot |
| Uso de service role sem revalidar tenant | Elevation of Privilege | `tenant_id` sempre resolvido no servidor (do slug) ou validado contra `perfis_empresas` antes de qualquer escrita |
| Privilégio nascendo aberto em objeto novo | Information Disclosure | `ALTER DEFAULT PRIVILEGES` + o event trigger `rls_auto_enable` que já existe |

**Item de risco ALTO desta fase, para o `security_block_on: high`:** o fallback `process.env.QSTASH_CURRENT_SIGNING_KEY || 'secret-key'` existe nos **dois** lados — em `route.ts:14` (verificação) e em `whatsapp-helper.ts:116` (publicação). Corrigir só o handler deixa o publisher montando URLs com o secret literal `secret-key` em ambiente sem env, o que é pior do que o estado atual (a URL com secret fica registrada no QStash). Os dois arquivos mudam na mesma tarefa.

---

## State of the Art

| Abordagem antiga | Abordagem atual | Quando mudou | Impacto aqui |
|---|---|---|---|
| Tabela nova no schema `public` já exposta na Data API por GRANT automático | Modelo opt-in: tabela nova sem GRANT não aparece | Projetos novos desde 30/05/2026; projetos existentes viram em 30/10/2026 | SEG-04 é antecipar essa virada. Fazer agora, no controle, é melhor do que descobrir em outubro `[CITED: github.com/orgs/supabase/discussions/45329]` |
| Secret compartilhado em query string para webhook | Assinatura JWT no header, com par de chaves e rotação | Padrão do QStash desde sempre; o projeto é que nunca migrou | SEG-05 |
| `getToken({ template: 'supabase' })` | Integração nativa third-party auth do Clerk | Já adotado no projeto | Nenhum trabalho nesta fase — só não regredir |

**Depreciado / a não reintroduzir:** secret em query string; `|| '<valor>'` como default de credencial; `select('*')` em caminho público.

---

## Assumptions Log

| # | Afirmação | Seção | Risco se estiver errada |
|---|---|---|---|
| A1 | Um `throw` dentro de `register()` do `instrumentation.ts` realmente impede o servidor de subir (a doc garante que `register()` completa antes de aceitar requisições, mas não descreve explicitamente o comportamento em caso de exceção) | Padrão 4 | Critério 5 parcialmente falso: o app subiria e o webhook falharia por outro caminho (o `Receiver` lançaria). **Mitigação:** verificar empiricamente com `env -u QSTASH_NEXT_SIGNING_KEY pnpm start` e, se o processo sobreviver, adicionar guarda também no módulo de verificação |
| A2 | O PostgREST devolve `PGRST205` (404) para tabela sem privilégio nenhum, e `42501` (403) quando há privilégio parcial e a query toca coluna não concedida | Code Examples | Assert do script de verificação escrito com o código errado. **Mitigação:** assertar "não é 200 com linhas", não um código fixo |
| A3 | `req.url` no route handler do Next 16 devolve a URL completa como o QStash a publicou (incluindo query string), sem reescrita de host | Padrão 3 | Lembretes rejeitados com 401 em produção, em silêncio. **Mitigação:** testar um lembrete real ponta a ponta antes de fechar a fase; plano B é montar a URL de `APP_URL` |
| A4 | O role que aplica migrations no Supabase Cloud (via MCP `execute_sql` ou SQL editor) é `postgres`, tornando `FOR ROLE postgres` a cláusula correta | Padrão 2 | `ALTER DEFAULT PRIVILEGES` não pega em tabelas futuras e SEG-04 falha em silêncio. **Mitigação:** o teste da tabela descartável (critério 4) prova isso empiricamente — é o teste que não pode ser pulado |
| A5 | Nenhum caminho autenticado depende de ler `perfis_empresas`, `excecoes_agenda` ou `agendamentos` de outro tenant | Inventário | Regressão no dashboard. **Mitigação parcial:** grep completo das 16 ocorrências de `perfis_empresas` já feito e nenhum cross-tenant encontrado; falta a mesma varredura em `agenda.ts` e nos Server Components do dashboard |
| A6 | Não existe `createBrowserClient` nem chamada direta ao Supabase a partir do browser | Toda a decisão D-1 | Se existir, fechar `anon` quebra o cliente. **Mitigação:** `grep -rn "createBrowserClient\|NEXT_PUBLIC_SUPABASE" src/` como primeira tarefa de verificação do plano |

---

## Open Questions

1. **O `org_id` deve sair do payload do browser?**
   - O que se sabe: `page.tsx:65` envia `perfil.tenant_id` para `BookingApp`, que o repassa a `obterSlotsPublicos` e `criarAgendamentoPublico`. Fechar a Data API elimina a enumeração em massa, não a leitura pontual pelo slug.
   - O que não está claro: se o owner considera isso dentro do critério "nem o `org_id` do Clerk".
   - Recomendação: **fora do escopo desta fase**, registrado como pendência. A correção é trocar o parâmetro das duas actions de `tenantId` para `slug` e resolver o slug no servidor — o que também elimina o `tenant_id` controlado pelo cliente (item do PITFALLS sobre service role). São ~30 linhas em 3 arquivos. Melhor lugar: Phase 8, que já vai mexer nas actions públicas para cancelamento/remarcação. Decidir no `/gsd-discuss-phase`.

2. **D-1b: o owner aceita service role no caminho de leitura pública?**
   - O que se sabe: as escritas já usam. A alternativa (RPC `SECURITY DEFINER`) evita isso mas move a agregação de 4 tabelas para SQL, contra uma engine em TS com 442 linhas de teste.
   - Recomendação: aceitar o service role, com as três mitigações da D-1 escritas como critério de aceite. Um meio-termo barato, se o owner quiser: só o lookup de perfil por slug vira RPC `SECURITY DEFINER` (é a query keyed, a que mais se beneficia), e a engine continua com o cliente privilegiado.

3. **D-2: `ALTER DEFAULT PRIVILEGES` também para `authenticated`?**
   - Recomendação: sim, com a regra escrita em `docs/03`. Mas é decisão de processo com custo recorrente (uma migration manual de GRANT por tabela nova, a partir da Phase 7) — precisa ser tomada explicitamente, não herdada.

4. **Aplicação do DDL no Supabase Cloud durante a execução.**
   - O que se sabe: não há banco local; o MCP do Supabase não está conectado nesta sessão.
   - Recomendação: o plano assume aplicação por passo humano (SQL editor + `INSERT` na `supabase_migrations.schema_migrations` com a mesma `version`) a menos que o MCP seja autenticado antes de `/gsd-execute-phase`. Rodar `get_advisors` (security) depois, para comparar com o baseline de zero findings.

---

## Sources

### Primárias (confiança ALTA)

- Código do repositório, lido em arquivo e linha: `supabase/schemas/00-09*.sql`, `supabase/migrations/20260709161817_*.sql`, `20260709193156_*.sql`, `src/app/actions/public-booking.ts`, `src/lib/booking-engine.ts`, `src/lib/assinaturas.ts`, `src/lib/supabase/{server,admin}.ts`, `src/lib/whatsapp-helper.ts`, `src/app/api/webhooks/lembrete/route.ts`, `src/app/book/[slug]/{page.tsx,BookingApp.tsx}`, `src/app/actions/{agendamentos,clientes,perfis-empresas}.ts`, `src/proxy.ts`, `vitest.config.ts`, `next.config.ts`, `package.json`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md` (doc empacotada do Next 16.2.10) — semântica de `register()`
- `.agents/skills/upstash/upstash-qstash-js/verification/{receiver.md,platform-specific/nextjs.md}` — API do `Receiver`, body cru, rotação de chave, `SignatureError`
- `docs/SUPABASE_DECLARATIVE-DATABASE-SCHEMA.md` — caveats do migra e a nota específica do projeto: `db diff` não emite GRANT/REVOKE
- `npm view @upstash/qstash` — versão 2.11.2, repo oficial, sem `postinstall`

### Secundárias (confiança MÉDIA)

- Context7 `/websites/upstash_qstash` — `Receiver.verify({ body, signature, url })`
- `postgresql.org/docs/current/sql-grant.html` — "the table-level grant is unaffected by a column-level operation"; SELECT exigido para valores lidos
- `postgresql.org/docs/current/sql-alterdefaultprivileges.html` — sintaxe, `FOR ROLE`, não-herança por membership
- `github.com/orgs/supabase/discussions/45329` — SQL oficial do opt-in, datas 30/05/2026 e 30/10/2026, role `postgres`

### Terciárias (confiança BAIXA — marcadas para validação empírica)

- Relatos convergentes de usuários Supabase sobre `select=*` falhar com GRANT parcial (a regra do Postgres sustenta a conclusão, mas nenhuma fonte primária afirma o comportamento do PostgREST literalmente) → A2, validar com o script de curl
- Distinção `PGRST205` vs `42501` conforme presença no schema cache → A2

---

## Metadata

**Quebra de confiança:**

- Inventário da superfície `anon` e colunas mínimas: **ALTA** — tudo lido em arquivo e linha, sem inferência
- Decisão arquitetural (D-1) e mapa de policies a substituir: **ALTA** — deriva do inventário mais uma regra documentada do Postgres
- Sintaxe e escopo de `ALTER DEFAULT PRIVILEGES`: **MÉDIA-ALTA** — doc oficial do Postgres + snippet oficial da Supabase; falta prova empírica de que o role criador é `postgres` neste projeto (A4)
- Comportamento do PostgREST em GRANT parcial e códigos de erro: **MÉDIA** — regra do Postgres é firme, o mapeamento HTTP é inferência apoiada em fontes secundárias (A2)
- `Receiver` do QStash: **ALTA** — skill oficial no repositório + Context7 concordantes
- `throw` em `register()` derrubando o boot: **MÉDIA** — a doc garante a ordem, não o comportamento em exceção (A1)

**Data da pesquisa:** 2026-07-21
**Válido até:** 2026-08-20 (30 dias). Exceção com prazo próprio: a virada de default privileges do Supabase em **30/10/2026** muda o baseline se a fase não tiver sido executada até lá.
