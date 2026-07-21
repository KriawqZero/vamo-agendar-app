# Phase 1: Hardening da superfície pública - Context

**Gathered:** 2026-07-21
**Status:** Ready for planning

<domain>
## Phase Boundary

A chave publicável que vai no bundle do frontend deixa de dar acesso a qualquer coisa no banco, e o webhook de lembrete passa a exigir assinatura criptográfica do QStash.

Esta fase **não** adiciona capacidade nova ao produto. Fecha superfície que já existe e está aberta. O booking público precisa continuar funcionando exatamente como hoje, do ponto de vista do cliente final — Fricção Zero é inegociável.

Cobre SEG-01 a SEG-05.
</domain>

<evidencia_medida>
## Superfície aberta hoje — medida, não inferida (2026-07-21)

Verificado com a chave publicável real contra a Data API, e com `psql` lendo `information_schema` / `pg_policies` no banco. **Este é o estado do banco, não o do schema declarativo.**

**Privilégios (`GRANT`) concedidos à role `anon`:**

`DELETE, INSERT, SELECT, UPDATE` em **todas as nove** tabelas do schema `public` — `agendamentos`, `clientes`, `disparos_whatsapp`, `excecoes_agenda`, `horarios_funcionamento`, `perfis_empresas`, `servicos`, `whatsapp_configs`. Única exceção parcial: `assinaturas`, que não tem `SELECT` (é a única tabela feita corretamente e serve de padrão).

Origem: `supabase/migrations/20260709161817_restaura_privilegios_dml_roles_api.sql`, que também configurou `ALTER DEFAULT PRIVILEGES` — **toda tabela nova nasce aberta**.

**Políticas de linha (RLS) que se aplicam a `anon`:**

| Tabela | Comando | Condição real no banco | Efeito medido |
|---|---|---|---|
| `perfis_empresas` | SELECT | `true` | tabela inteira: `tenant_id`, `slug`, `nome_estabelecimento`, `telefone_contato`, `endereco`, `instagram`, configs de agendamento |
| `agendamentos` | SELECT | `true` | agenda de todos os tenants: `data_hora`, `status`, `cliente_id`, `servico_id`, `tenant_id` — **5 linhas devolvidas na medição** |
| `excecoes_agenda` | SELECT | `true` | bloqueios, incluindo `motivo` (texto livre) |
| `horarios_funcionamento` | SELECT | `ativo = true` | ok |
| `servicos` | SELECT | `ativo = true` | ok |
| `assinaturas` | SELECT | `true` | **bloqueado na prática** — não há `GRANT SELECT`. Prova de que o portão importa tanto quanto o porteiro |
| `agendamentos` | INSERT | `tenant_id IS NOT NULL` | não filtra nada — o `tenant_id` é público |
| `clientes` | INSERT | `tenant_id IS NOT NULL` | idem |
| `clientes`, `whatsapp_configs`, `disparos_whatsapp` | (sem policy SELECT) | — | 0 linhas — protegidos por ausência de policy, com o `GRANT` aberto por baixo |

**Leitura da medição:** `UPDATE`/`DELETE` anônimos estão bloqueados apenas por não existir policy — o privilégio está concedido. Qualquer policy criada no futuro nessas tabelas abre escrita destrutiva sem que ninguém perceba.

**Fato que viabiliza fechar tudo:** não existe `createBrowserClient` no projeto. Nenhum código no navegador fala com o Supabase — toda leitura já passa pelo servidor Next.js.
</evidencia_medida>

<decisions>
## Implementation Decisions

### Superfície pública

- **D-01: `anon` perde o acesso à Data API por completo.** `REVOKE` de todos os privilégios nas nove tabelas, não `GRANT` por coluna. Motivo técnico decisivo: o Postgres exige `SELECT` em qualquer coluna referenciada, **inclusive no `WHERE`** — e o caminho público filtra por `tenant_id` em cinco tabelas. Liberar coluna manteria `tenant_id` legível, e `?select=tenant_id` continuaria devolvendo a lista de todos os tenants. GRANT por coluna não fecha o critério 1. O padrão que o ROADMAP mandava replicar (`08_assinaturas.sql`) resolve o portão, não este caso.
- **D-07: policies compartilhadas são SUBSTITUÍDAS, nunca só removidas.** Quatro policies são `TO anon, authenticated` **sem par autenticado**: `perfis_empresas` (SELECT), `excecoes_agenda` (SELECT), `agendamentos` (SELECT e INSERT), `clientes` (INSERT). Dropar sem recriar o par `TO authenticated` quebra o dashboard — e quebra em silêncio, porque o padrão do projeto é degradar (agenda aparece vazia) em vez de estourar erro. Cada `DROP POLICY` vem acompanhado do `CREATE POLICY ... TO authenticated USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'))`, com `auth.jwt()` em subquery pela regra de performance do projeto.
- Conferir que toda action autenticada que faz `.insert(...).select(...)` continua enxergando a própria linha: `INSERT ... RETURNING` exige que a linha passe na policy de SELECT. Pontos a verificar: `agendamentos.ts:318-320`, `clientes` em `agendamentos.ts:285-286`, `upsert(...).select()` em `perfis-empresas.ts:234-238`.

### Quem lê os dados da página pública

- **D-02: a leitura pública passa a usar `createAdminClient()` (service role).** Escolha do owner entre três opções apresentadas. Menor delta: uma linha por função, nenhum componente tocado, a engine de disponibilidade em TypeScript (442 linhas de teste) é preservada.
- **Risco aceito conscientemente:** o service role ignora RLS, então um esquecimento de filtro passa a poder ler dados de outro tenant — hoje a policy serviria de rede. **Três mitigações são critério de aceite, não recomendação:**
  1. Todo query do caminho público carrega `.eq('tenant_id', …)` com o valor **resolvido no servidor a partir do slug**, nunca vindo do cliente.
  2. **Proibido `select('*')` no caminho público** — lista de colunas explícita sempre. É o que impede uma coluna futura (`cpf_cnpj` da Phase 7, `preco_travado`) de vazar sozinha para o RSC payload. Verificável: `grep -rn "select('\*')" src/app/actions/public-booking.ts` deve voltar vazio.
  3. Atualizar o JSDoc de `src/lib/supabase/admin.ts`, que hoje afirma "restrito a dois pontos do fluxo público" e passa a ser três.
- Alternativas descartadas pelo owner: RPC `SECURITY DEFINER` para tudo (jogaria fora a cobertura de teste da engine) e o meio-termo com RPC só para o lookup por slug (duas mecânicas no mesmo caminho).

### Fechamento por padrão

- **D-03: `ALTER DEFAULT PRIVILEGES` revoga para `anon` E `authenticated`.** Escolha do owner pela opção mais fechada: tabela nova não aparece na Data API para ninguém sem `GRANT` explícito, cumprindo o critério 4 ao pé da letra.
- **Custo aceito explicitamente:** toda tabela nova passa a exigir uma migration escrita à mão com o `GRANT`, e `supabase db diff` **não gera** isso. A primeira conta chega na Phase 7 (`perfis_cobranca`) e na Phase 9 (`eventos_asaas`). A regra precisa ficar escrita em `docs/03-PADROES_DE_BANCO_DE_DADOS.md` nesta fase, senão vira "permission denied" inexplicável daqui a duas fases.
- 🚨 **`service_role` NUNCA entra no `REVOKE`.** O snippet oficial da Supabase inclui `service_role`; copiá-lo quebra `createAdminClient()` na próxima tabela criada — e, com a D-02, isso derruba o booking público inteiro. O repositório já tem o precedente: `20260709161817` existe justamente porque um `ALTER DEFAULT PRIVILEGES ... REVOKE` ad hoc já quebrou o acesso via PostgREST neste projeto uma vez.

### Identificador do tenant no navegador

- **D-04: o `org_id` sai do payload do browser nesta fase.** `src/app/book/[slug]/page.tsx:65` envia `perfil.tenant_id` para `BookingApp`, que devolve em `obterSlotsPublicos` e `criarAgendamentoPublico`. As actions passam a receber `slug` e resolver o tenant no servidor. ~30 linhas em 3 arquivos.
- Motivo de estar aqui e não na Phase 8: com a D-02, um `tenant_id` que vem do cliente é exatamente o que não se pode confiar — isto **é** a mitigação 1 da D-02, não um extra.

### Webhook do QStash (SEG-05)

- **D-05: verificação de assinatura real, com falha dura na ausência de chave.** Substituir a conferência de `?secret=` por `Receiver` de `@upstash/qstash` (pacote a instalar — hoje o QStash é chamado por `fetch` cru), validando o header `Upstash-Signature` contra `currentSigningKey` + `nextSigningKey`.
- **O fallback `|| 'secret-key'` está em DOIS lugares** — `src/app/api/webhooks/lembrete/route.ts:14` e `src/lib/whatsapp-helper.ts:116`. Corrigir só um deixa o buraco aberto.
- `receiver.verify()` precisa do **body cru** (`await req.text()`), não do JSON parseado, e do `url` da requisição recebida.
- ⚠️ **Lembretes já enfileirados no QStash são estado vivo fora do repositório**, até 14 dias à frente, publicados com `?secret=` na URL. A assinatura é calculada sobre a URL, então passar `url: req.url` é o que evita rejeitá-los e matar lembretes em silêncio.
- A aplicação deve **recusar subir** sem as chaves configuradas, em vez de cair em default inseguro.

### Aplicação das mudanças no banco

- **D-06: DDL aplicado por `psql` pelo pooler.** Verificado em 2026-07-21:
  - CLI do Supabase **não** está autenticada (sem access token; `db push`/`link` não funcionam).
  - Direct connection (`db.<ref>.supabase.co`) resolve **apenas para IPv6** e a máquina do owner não tem rota IPv6 — inalcançável.
  - **Funciona:** `aws-1-sa-east-1.pooler.supabase.com:5432`, usuário `postgres.<ref>`, senha em `SUPABASE_POSTGRES_PASSWORD`. Postgres 17.6, DDL confirmado por transação revertida. Note `aws-1` — a documentação e os tutoriais dizem `aws-0`, que não existe para este projeto.
  - `supabase_migrations.schema_migrations` legível: 14 migrations, batendo com os 14 arquivos do repo. Toda aplicação manual precisa inserir a `version` correspondente para não desalinhar o histórico.
- MCP do Supabase **não** é necessário e não deve ser conectado para esta fase.
- `supabase db diff` **não emite `GRANT`/`REVOKE`** — a parte de privilégios é migration escrita à mão (exceção já documentada em `docs/SUPABASE_DECLARATIVE-DATABASE-SCHEMA.md`, com precedente em `20260709193156`). As mudanças de policy seguem o fluxo declarativo normal via `supabase/schemas/`.

### Pré-requisitos do owner (fora de código)

- **`QSTASH_CURRENT_SIGNING_KEY` e `QSTASH_NEXT_SIGNING_KEY` no `.env.local`** — painel do Upstash → QStash → Signing Keys. O owner declarou que pega **antes** do planejamento. Sem elas, a D-05 faz a aplicação recusar subir e o `pnpm dev` para.
- **Permissão de `psql` liberada** no settings do projeto, para que a execução não pare a cada comando. O owner optou por isso conscientemente; razoável enquanto o banco é descartável, a revisar quando houver cliente real.

### Claude's Discretion

- Ordem interna das tarefas e agrupamento em waves.
- Forma exata dos testes de regressão do booking público.
- Redação das policies autenticadas substitutas, seguindo o padrão de `supabase/schemas/03_horarios_funcionamento.sql` (policy 1b).
- Se o `throw` por chave ausente vai em `instrumentation.ts` ou no módulo — a pesquisa marca confiança MÉDIA no comportamento de exceção no boot do Next 16.2.10; validar empiricamente e escolher o que falhar de forma visível.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Pesquisa e escopo desta fase
- `.planning/phases/01-hardening-da-superf-cie-p-blica/01-RESEARCH.md` — inventário auditado da superfície, mapa de policies, padrões de código, script de verificação por `curl`, e o log de suposições
- `.planning/ROADMAP.md` §"Phase 1: Hardening da superfície pública" — Goal, 5 critérios de sucesso e notas de execução
- `.planning/REQUIREMENTS.md` — SEG-01 a SEG-05
- `.planning/research/PITFALLS.md` — armadilhas do milestone; a seção sobre Data API, `GRANT`/RLS e QStash é diretamente aplicável
- `.planning/codebase/CONCERNS.md` — dívida conhecida auditada com arquivo e linha

### Padrões obrigatórios do projeto
- `docs/03-PADROES_DE_BANCO_DE_DADOS.md` — schema declarativo, RLS granular por ação, nomenclatura; **a regra da D-03 precisa ser escrita aqui**
- `docs/02-SUPABASE_CLERK_INTEGRATION.md` — integração nativa Clerk↔Supabase, claim `org_id`, RLS
- `docs/06-MENSAGERIA_E_WHATSAPP.md` — fluxos e payloads Evolution API + QStash
- `docs/SUPABASE_DECLARATIVE-DATABASE-SCHEMA.md` — exceções ao fluxo declarativo (migrations manuais de privilégio)
- `.agents/skills/supabase/SKILL.md` e `.agents/skills/supabase-postgres-best-practices/SKILL.md`
- `.agents/skills/upstash/SKILL.md`

### Código que é fonte de padrão
- `supabase/schemas/08_assinaturas.sql` — `REVOKE SELECT` + `GRANT SELECT (colunas)` feito corretamente; é a única tabela hoje protegida no portão
- `supabase/schemas/03_horarios_funcionamento.sql` — policy 1b, padrão da policy autenticada substituta
- `supabase/migrations/20260709161817_restaura_privilegios_dml_roles_api.sql` — a migration que abriu os nove `GRANT`s e o `ALTER DEFAULT PRIVILEGES`; é literalmente o que a D-01 e a D-03 invertem
- `supabase/migrations/20260709193156_*.sql` — precedente de migration de privilégio escrita à mão

### Arquivos que a fase modifica
- `src/app/api/webhooks/lembrete/route.ts` — fallback inseguro na linha 14
- `src/lib/whatsapp-helper.ts` — fallback inseguro na linha 116; publicação no QStash
- `src/lib/supabase/admin.ts` — JSDoc a atualizar (D-02, mitigação 3)
- `src/app/actions/public-booking.ts` — projeção explícita e `tenant_id` resolvido no servidor
- `src/app/book/[slug]/page.tsx` — linha 65, para de enviar `perfil.tenant_id` ao cliente
- `src/app/book/[slug]/BookingApp.tsx` — passa a trabalhar com `slug`
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `createAdminClient()` (`src/lib/supabase/admin.ts`): já existe e já é usado no caminho público para escrita; a D-02 estende o uso para leitura, não introduz mecanismo novo.
- `08_assinaturas.sql`: o padrão de portão fechado já está escrito e funcionando no próprio repositório — a fase replica, não inventa.
- Engine de disponibilidade (`src/lib/booking-engine.ts`): funções puras com 442 linhas de teste. A D-02 foi escolhida justamente para preservá-la intacta.

### Established Patterns
- Server Actions como única via de mutação; rota REST só para webhook de terceiro. A fase não cria rota nova.
- RLS com `(SELECT auth.jwt() ->> 'org_id')` em subquery (initPlan) — obrigatório nas policies substitutas.
- Mensageria falha em silêncio para o cliente final. Isso torna o risco do QStash mais sério: um webhook quebrado não gera reclamação, gera lembrete que não chega.

### Integration Points
- `src/proxy.ts`: `/api/webhooks(.*)` é rota pública; permanece.
- `supabase/schemas/*.sql`: ordem lexicográfica respeita FKs; as policies substitutas entram nos arquivos correspondentes.
- `vitest.config.ts`: já fixa envs de QStash para constantes de módulo — a D-05 provavelmente exige acrescentar as chaves de assinatura ali, senão a suíte quebra ao introduzir a falha dura.
</code_context>

<specifics>
## Specific Ideas

- O owner pediu explicitamente que a explicação e as decisões fossem tomadas sem depender de conhecimento prévio de Supabase, e citou que "SaaS criados com Supabase têm taxa de vazamento altíssima por má configuração". Isso é o contexto que explica por que ele escolheu a opção mais fechada nas três decisões estruturais (D-02, D-03, D-04). Planos e revisões desta fase devem tratar "fechou de verdade" como critério, não "fechou o que o roadmap pedia".
- A verificação de cada critério de sucesso deve ser feita com `curl` anônimo real contra a Data API — o script está pronto em `01-RESEARCH.md` §"Verificação anônima da Data API". Afirmação de que fechou sem o `curl` rodado não conta.
- Regressão obrigatória e não negociável: o wizard de `/book/[slug]` completo, do serviço até a tela de sucesso, verificado à mão depois das mudanças de permissão.
</specifics>

<deferred>
## Deferred Ideas

- **Trocar `?secret=` da URL de publicação do QStash** por publicação limpa (a assinatura torna o parâmetro redundante). Não fazer nesta fase: os lembretes em trânsito foram publicados com ele, e removê-lo agora exigiria lidar com duas gerações de URL. Reavaliar depois que a fila drenar (14 dias).
- **Bug do "assume 30 minutos"** na duração de agendamento: a pesquisa nota que ele pode ser mascarado por mudanças desta fase. É escopo da Phase 2 (`data_hora_fim`), não daqui — mas o plano não deve "consertar de passagem", para não confundir a verificação da Phase 2.
- **Revisar a permissão de `psql` liberada** no settings quando houver cliente real no banco. Registrado junto da condição de rede de proteção em `.planning/ROADMAP.md`.
</deferred>

---

*Phase: 01-hardening-da-superficie-publica*
*Context gathered: 2026-07-21*
