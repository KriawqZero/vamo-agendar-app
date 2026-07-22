---
phase: 01-hardening-da-superf-cie-p-blica
verified: 2026-07-22T15:51:28Z
status: gaps_found
score: 7/9 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 5/7
  gaps_closed:
    - "Gap 1 — fail-fast de boot: o processo agora MORRE. Reproduzido pelo verificador com `bash scripts/verificar-fail-fast-boot.sh` no HEAD 4596463: veredito MORTE APROVADO (código 1, `QSTASH_NEXT_SIGNING_KEY` nomeada em stderr, curl 7 = recusa de conexão), CONTROLE APROVADO (200, processo vivo). Exit 0, 4 vereditos, 0 reprovados"
    - "Gap 2 (metade servidor) — o caminho de ESCRITA do booking passou a ser exercitado: `pnpm test:integracao` roda 6 testes contra o Supabase de dev (cliente novo + RETURNING, reaproveitamento por telefone, sanitização, rejeição de slot ocupado, cópia de erro de slots) e passa. `pnpm test` continua hermético (13 arquivos / 198 testes em 381 ms)"
    - "Gap 3 (lado repositório) — a migration `20260722145948` existe com os dois DROP POLICY, os schemas declarativos 02/03 não contêm mais a policy, e a migration não tem nenhuma linha de grant/revoke"
  gaps_remaining:
    - "Gap 3 (lado banco): não reproduzível nesta sessão — sem MCP do Supabase e sem token do CLI, não consegui consultar `pg_policies` nem repetir a contagem cross-tenant 2→1"
  regressions:
    - "Nenhuma regressão de código introduzida pelo fechamento de gaps. `pnpm lint`, `pnpm test` e `pnpm build` verdes; harness de superfície anônima segue exit 0 com 11 checagens e 0 reprovadas"
  novos_achados:
    - "CR-01 e CR-02 do 01-REVIEW.md foram verificados de forma independente e PROCEDEM — viram os dois gaps bloqueantes desta reverificação"
gaps:
  - truth: "O webhook de lembrete só aceita quem o QStash assinou (segunda metade do goal da fase)"
    status: failed
    reason: >-
      `src/lib/whatsapp-helper.ts:147` publica a chave HMAC de autenticação em texto
      claro na query string da URL de destino de TODO lembrete
      (`${APP_URL}/api/webhooks/lembrete?secret=${chaveAssinatura}`, onde
      `chaveAssinatura` é `QSTASH_CURRENT_SIGNING_KEY`). Desde o plano 01-03 essa é a
      MESMA chave com que `verificarAssinaturaQstash` autentica o webhook via
      `Receiver`. HMAC é simétrico: quem lê a URL forja um `Upstash-Signature` válido.
      A porta foi fechada e a chave ficou no capacho. Verificado por leitura direta de
      `whatsapp-helper.ts:131-148` e `qstash-assinatura.ts:34-54`.
      A justificativa escrita no próprio código ("a fila tem lembretes em voo e o
      webhook casa a assinatura contra a URL completa") é FALSA para publicações NOVAS
      e eu conferi por quê: `route.ts:29` verifica contra `req.url`, ou seja, contra a
      URL que a requisição de fato trouxer — mensagens já enfileiradas continuam
      validando com a URL antiga quer as novas carreguem o parâmetro ou não. O webhook
      nem lê mais `?secret=`.
      Vetores de exposição reais, todos fora do alcance da sanitização do Sentry:
      log de acesso HTTP de qualquer hop entre QStash e Railway; console do QStash
      (URL de destino visível na listagem por até 14 dias); e
      `whatsapp-helper.ts:164-167`, que despeja `await response.text()` do QStash no log
      da aplicação — corpo de erro que costuma ecoar a URL de destino.
      Não é regressão desta fase (o parâmetro é pré-existente), mas é a fase que
      transformou aquele valor na chave de autenticação e declarou o critério fechado.
    artifacts:
      - path: "src/lib/whatsapp-helper.ts"
        issue: "linha 147 concatena QSTASH_CURRENT_SIGNING_KEY na URL publicada; linhas 164-167 logam o corpo de erro cru do QStash"
      - path: ".planning/phases/01-hardening-da-superf-cie-p-blica/01-CONTEXT.md"
        issue: "linha 176 difere a remoção do parâmetro sob a premissa técnica de 'duas gerações de URL', que é falsa"
    missing:
      - "Publicar sem o parâmetro: `const webhookUrl = `${APP_URL}/api/webhooks/lembrete`` — lembretes já enfileirados continuam validando porque a verificação usa `req.url`"
      - "Logar só `response.status` nos dois `console.error` de whatsapp-helper.ts (nunca o corpo do gateway)"
      - "Depois que a fila secar (≤ 14 dias): rotacionar as signing keys no painel da Upstash — a chave atual já circulou em URL publicada e em log"
      - "Registrar o item em docs/PENDENCIAS.md como risco vivo pós-Phase 1 (hoje não está em lugar nenhum)"
  - truth: "O booking público continua funcionando exatamente como antes (critério 2 do ROADMAP, segunda metade)"
    status: failed
    reason: >-
      PROVADO EMPIRICAMENTE PELO VERIFICADOR, não inferido. Contra o build de produção
      deste HEAD (`next start` na porta 3992), invoquei a Server Action
      `obterSlotsPublicos` (id `70efdce379…` extraído do bundle) com um slug
      inexistente. A resposta de flight foi, na íntegra:
      `1:E{"digest":"2760064589"}` — só o digest, mensagem nenhuma. Confirmado na
      origem: em `react-server-dom-webpack-server.node.production.js` a assinatura é
      `emitErrorChunk(request, id, digest)` (na versão de desenvolvimento é
      `(request, id, digest, error, debug, owner)`), e o bundle de cliente de produção
      carrega a string "The specific message is omitted in production builds…".
      Consequências concretas, ambas em caminho que ESTA fase criou ou pinou:
      (a) a cópia `Não foi possível carregar os horários. Tente de novo.` — contrato
      verbatim do 01-UI-SPEC, nascida nesta fase (conferi: em `master`,
      `obterSlotsPublicos` NÃO lançava, caía em fuso e regras padrão) — nunca chega à
      tela; o cliente final vê texto de framework em inglês na caixa vermelha;
      (b) `mensagem.includes('já foi preenchido')` em `BookingApp.tsx:276` é sempre
      `false` em produção, então a recuperação de double-booking (aviso âmbar + grade
      refeita) não acontece: o visitante fica preso na etapa de contato olhando para um
      horário que não existe mais.
      A suíte do plano 01-07 dá verde nos dois casos porque chama a action EM PROCESSO,
      sem serialização de flight — o próprio comentário do teste admite não provar a
      renderização, mas o efeito prático é sinal verde num caminho morto em produção.
      Em `pnpm dev` tudo funciona, que é exatamente o que faz o defeito passar batido.
    artifacts:
      - path: "src/app/actions/public-booking.ts"
        issue: "linhas 170-181 e 366-374 modelam erro esperado como `throw`; a mensagem não atravessa a fronteira da Server Action em produção"
      - path: "src/app/book/[slug]/BookingApp.tsx"
        issue: "linhas 157-165 e 271-287 decidem a UX por `err.message` / `mensagem.includes(...)`"
      - path: "src/app/actions/__tests__/public-booking-escrita.test.ts"
        issue: "linhas 363-435 provam o produtor em processo e o acoplamento por asserção de fonte — não a travessia; falso verde"
    missing:
      - "Modelar erro esperado como VALOR DE RETORNO discriminado (`{ ok: false, motivo: 'slot_indisponivel' | 'slug_invalido' | ... }`) e reservar `throw` para o inesperado"
      - "`BookingApp` decidir pelo `motivo`, nunca por substring de mensagem"
      - "Teste que exercite a travessia (ou, no mínimo, remover a asserção de fonte que hoje sugere cobertura que não existe)"
  - truth: "docs/PENDENCIAS.md descreve o webhook de lembrete como ele é hoje (item 6 da Definition of Done do CLAUDE.md)"
    status: partial
    reason: >-
      `docs/PENDENCIAS.md:1071-1077` ainda afirma que "o secret trafega em query string
      **e o fallback `'secret-key'` vale nos dois lados**" e que "o ideal é migrar para
      verificação da assinatura real do QStash". As duas afirmações são falsas hoje:
      `grep -rn "secret-key" src/ scripts/` volta vazio (conferido) e a verificação por
      `Receiver` foi implementada no plano 01-03. Ao mesmo tempo, a parte que CONTINUA
      verdadeira e virou o achado mais grave da fase (a chave de assinatura na query
      string) não aparece como pendência viva em seção nenhuma. O resto do documento é
      exemplar nisso — a seção de superfície remanescente (:647) tem registro de
      fechamento com medição — o que torna esta entrada uma inconsistência isolada.
    artifacts:
      - path: "docs/PENDENCIAS.md"
        issue: "linhas 1071-1077 descrevem como aberto o que a fase fechou e omitem o que ficou aberto"
    missing:
      - "Marcar a autenticação por assinatura como fechada, apontando src/lib/qstash-assinatura.ts"
      - "Abrir item novo para a chave na query string com o plano de duas etapas (parar de publicar agora; rotacionar depois da fila secar)"
deferred:
  - truth: "A recuperação VISUAL de double-booking (aviso âmbar, grade refeita, cliente de volta na etapa de data/hora)"
    addressed_in: "Phase 2"
    evidence: >-
      Success Criteria 4 da Phase 2: "Quem perde a corrida vê 'esse horário acabou de
      ser reservado, escolha outro' com os horários recarregados — nunca a mensagem do
      PostgreSQL". É o mesmo comportamento. ⚠️ Atenção: a Phase 2 NÃO conseguirá
      satisfazer esse critério enquanto o mecanismo do gap 2 não for trocado — o
      diagnóstico é insumo obrigatório do planejamento dela.
behavior_unverified_items: []
orchestrator_followup:
  - truth: "As duas policies residuais de SELECT compartilhadas com `anon` em `servicos` e `horarios_funcionamento` não existem mais NO BANCO"
    status: verified
    quando: "2026-07-22, pelo orquestrador do execute-phase, sobre o mesmo HEAD que o verificador avaliou"
    porque_aqui: >-
      O verificador registrou este item como `behavior_unverified` porque o subagente
      não recebe as ferramentas MCP do Supabase e o CLI não está autenticado. O
      orquestrador tem o MCP, então a reconferência foi feita na hora em vez de virar
      dívida — a ressalva de método do verificador estava certa, só não precisava
      sobreviver à sessão.
    evidencia: >-
      `select tablename, policyname, roles, cmd, qual from pg_policies where
      schemaname='public' and tablename in ('servicos','horarios_funcionamento')`
      devolveu 8 linhas, TODAS com `roles = {authenticated}`. Nenhuma com `anon`,
      nenhuma chamada 'Permitir SELECT público para todos'. Nas duas tabelas a ÚNICA
      policy de SELECT restante é 'Permitir SELECT do próprio tenant para autenticados',
      com `qual = (tenant_id = ( SELECT (auth.jwt() ->> 'org_id'::text)))`.
    por_que_isso_basta: >-
      Policies permissivas somam por `OR`. Com uma só policy de SELECT por tabela não há
      segundo termo para somar, então o predicado efetivo para qualquer conta autenticada
      é exatamente `tenant_id = próprio` — não `(ativo = true) OR (tenant_id = próprio)`.
      A contagem cross-tenant 2→1 do plano 01-08 é consequência aritmética disso, não
      precisa ser remedida. A cláusula `TO anon` (a armadilha carregada) também sumiu:
      não há policy alguma para a role `anon` nas duas tabelas.
    bonus: >-
      `list_migrations` devolveu 18 versions alinhadas com os 18 arquivos de
      `supabase/migrations/`, com a version própria do arquivo
      (`20260722145948_fecha_policies_residuais_servicos_horarios`) — o desalinhamento
      de ledger que o `apply_migration` costuma causar não ocorreu.
---

# Phase 1: Hardening da superfície pública — Verification Report (reverificação)

**Phase Goal:** A chave publicável que vai no bundle deixa de dar acesso a qualquer coisa além do estritamente necessário para a página pública funcionar, e o webhook de lembrete só aceita quem o QStash assinou
**Verified:** 2026-07-22T15:51:28Z (HEAD `4596463`)
**Status:** gaps_found
**Re-verification:** Sim — após o fechamento dos três gaps (planos 01-06 a 01-09)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | SC1 — `curl` anônimo em `perfis_empresas` não devolve a lista de profissionais, nem `telefone_contato`, nem o `org_id` | ✓ VERIFIED | Harness rodado por mim neste HEAD: `?select=*` e `?select=tenant_id,telefone_contato` → **HTTP 401 / code 42501** (`permission denied`, não 404) |
| 2 | SC2a — POST anônimo em `agendamentos` e `clientes` é rejeitado | ✓ VERIFIED | Harness: 401/42501 nas duas tabelas |
| 3 | SC2b — o booking público continua funcionando **exatamente como antes** | ✗ **FAILED** | Provado por mim contra o build de produção: a Server Action devolve `1:E{"digest":"2760064589"}` — sem mensagem. A copy nova desta fase nunca chega à tela e a recuperação de double-booking morre. Ver gap 2 |
| 4 | SC3 — `agendamentos` e `excecoes_agenda` sem `cliente_id` nem `motivo` para `anon` | ✓ VERIFIED | Harness: `?select=cliente_id` e `?select=motivo` → 401/42501. Satisfeito com folga (zero colunas ⊂ colunas necessárias) |
| 5 | SC4 — tabela nova não aparece na Data API sem GRANT explícito | ✓ VERIFIED | Mecanismo lido linha a linha em `20260722060000`: `alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated` + `grant all on tables to service_role`. `service_role` não aparece em nenhuma linha de `revoke` (as 2 ocorrências do grep estão em comentário). Prova empírica com tabela descartável foi feita na verificação anterior; não reproduzível nesta sessão (sem acesso a banco) |
| 6 | SC5a — POST sem assinatura válida do QStash é rejeitado | ✓ VERIFIED | Veredito `WEBHOOK` do harness, contra build de produção: **401 sem assinatura \| 401 com `?secret=` legado \| 401 com `Upstash-Signature` forjado \| 200 no controle `GET /`** |
| 7 | SC5b — a aplicação **não sobe** sem as chaves de assinatura | ✓ **VERIFIED — gap 1 fechado** | Veredito `MORTE`: "o processo do next encerrou com **código 1**, nomeou `QSTASH_NEXT_SIGNING_KEY` em stderr e a porta **recusou conexão (curl 7)**". Veredito `CONTROLE`: 200 com as quatorze presentes. Era `✗ FAILED` na verificação anterior |
| 8 | GOAL — "o webhook de lembrete **só aceita quem o QStash assinou**" | ✗ **FAILED** | A chave HMAC que autentica o webhook é publicada em texto claro na query string de todo lembrete (`whatsapp-helper.ts:147`). Quem lê um log forja assinatura válida. Ver gap 1 |
| 9 | Gap 3 — as policies residuais de `servicos`/`horarios_funcionamento` sumiram **do banco** | ✓ VERIFIED | Lado repositório verificado pelo verificador (migration + schemas + zero grant/revoke). Lado banco confirmado pelo orquestrador no mesmo HEAD: `pg_policies` devolve 8 linhas nas duas tabelas, todas `{authenticated}`, e a única de SELECT em cada uma é a do próprio tenant — ver `orchestrator_followup` |

**Score:** 7/9 truths verified (2 failed, 0 uncertain — a truth 9 saiu de UNCERTAIN depois que o orquestrador consultou `pg_policies` pelo MCP)

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|---|---|---|
| 1 | Recuperação **visual** de double-booking (aviso âmbar, grade refeita) | Phase 2 | SC4 da Phase 2: "Quem perde a corrida vê 'esse horário acabou de ser reservado, escolha outro' com os horários recarregados". ⚠️ A Phase 2 não fecha esse critério sem antes trocar o mecanismo do gap 2 |

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `scripts/verificar-fail-fast-boot.sh` | 4 vereditos, exit 0 só com os quatro | ✓ VERIFIED | 307 linhas. Rodado por mim: exit 0. Li o script antes: `set -m` para o PGID próprio, `setsid` explicitamente proibido, complemento de dev idêntico nas duas execuções (isola a variável alvo) |
| `src/lib/env.ts` — `encerrarBootPorEnvAusente` | Encerra nomeando a variável | ✓ VERIFIED | `process.stderr.write` (nunca `node:fs` — o módulo é empacotado para o edge), escrita ANTES do `process.exit(1)`, `CODIGO_SAIDA_ENV_AUSENTE = 1` |
| `src/instrumentation.ts` | Guarda de encerramento no `register()` | ✓ VERIFIED | `try { validarEnvObrigatorio() } catch { if (NEXT_RUNTIME === 'nodejs') encerrarBootPorEnvAusente(...); throw }` — o edge preserva o relançar. JSDoc corrigido: não afirma mais que a rejeição sozinha derruba o processo |
| `src/lib/__tests__/env.test.ts` | Contrato do encerramento pinado | ✓ VERIFIED | 11 casos; espia `process.exit` com sentinela, assere `CODIGO_SAIDA_ENV_AUSENTE === 1` e comenta o modo de falha (`exitCode = 0` disfarçado de fix) |
| `src/app/actions/__tests__/public-booking-escrita.test.ts` | Escrita real contra o Supabase de dev | ⚠️ VERIFIED com ressalva | 438 linhas, escrita real via `createAdminClient()`, fixture determinística, teardown antes e depois. Rodado: **6/6 em 6,35 s**. Ressalva: o caso 'acoplamento nas DUAS pontas' (l.390-399) é asserção de FONTE e dá verde num caminho morto em produção (gap 2) |
| `vitest.config.ts` | Alias `@` + exclusão condicional | ✓ VERIFIED | `EXIGIR_INTEGRACAO === '1'` destrava; `configDefaults.exclude` espalhado corretamente. Hermeticidade provada: `pnpm test` = 13 arquivos / 198 testes em **381 ms** (sem rede) |
| `package.json` | Script `test:integracao` | ✓ VERIFIED | `EXIGIR_INTEGRACAO=1 vitest run src/app/actions/__tests__/public-booking-escrita.test.ts` |
| `supabase/migrations/20260722145948_…` | DROP das duas policies, sem privilégio | ✓ VERIFIED | 2 `drop policy if exists`; `grep -vE '^\s*--' \| grep -icE 'grant\|revoke'` → 0. Cabeçalho documenta por que a D-07 não se aplica (a policy `1b` da `20260709165703` já cobre, inclusive linhas inativas) |
| `supabase/schemas/02_servicos.sql`, `03_horarios_funcionamento.sql` | Policy removida do declarativo | ✓ VERIFIED | Nenhum `TO anon` executável restou nos schemas; as duas ocorrências de "TO anon" são comentário explicando a armadilha desarmada |
| `.planning/REQUIREMENTS.md` | SEG-05 corrigido | ✓ VERIFIED | Linha 17 descreve o comportamento real (encerra com código 1 após nomear a variável) e nomeia o comando que prova; linha 151 saiu de `Partial` para `Complete` |
| `.planning/ROADMAP.md` | Nota de execução com a evidência | ✓ VERIFIED | Nota nomeia `scripts/verificar-fail-fast-boot.sh` e os quatro vereditos, e registra honestamente que a primeira medição encontrou o processo sobrevivendo |
| `docs/PENDENCIAS.md` | Coerente com o código | ⚠️ PARCIAL | Três blocos corretos (superfície fechada :647, hermeticidade :1170-1192, UAT honesto :806-880). **Quarto bloco stale**: :1071-1077 — ver gap 3 |
| `src/lib/whatsapp-helper.ts` | Sem fallback inseguro | ⚠️ PARCIAL | Fallback `'secret-key'` extinto (grep vazio). Mas a chave de assinatura continua na URL publicada — gap 1 |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `instrumentation.ts register()` | `process.exit(1)` | `validarEnvObrigatorio()` → `encerrarBootPorEnvAusente()` | ✓ **WIRED** | Era ⚠️ PARCIAL. Fecha agora: veredito MORTE mediu código 1 + porta recusando conexão |
| `route.ts` | `verificarAssinaturaQstash` → `Receiver` | duas chaves, `url: req.url` | ✓ WIRED | 401×3 no harness; `JSON.parse` só depois de autenticado (l.39) |
| `EXIGIR_INTEGRACAO=1` | `vitest.config.ts` `exclude` | `test:integracao` | ✓ WIRED | Único caminho que toca o banco; `pnpm test` mediu 381 ms |
| `public-booking.ts:179` | `BookingApp.tsx:276` | substring "já foi preenchido" | ✗ **NOT_WIRED em produção** | As duas pontas casam no código-fonte, mas a mensagem **não atravessa** a Server Action em produção. A verificação anterior marcou ✓ WIRED por leitura; a medição diz o contrário |
| `public-booking.ts:373` | caixa vermelha de slots | `err.message` | ✗ **NOT_WIRED em produção** | Mesmo mecanismo |
| `whatsapp-helper.ts:147` | log de acesso / console do QStash | query string da URL publicada | ⚠️ **WIRED indevidamente** | Publica o segredo de autenticação. Gap 1 |
| `ALTER DEFAULT PRIVILEGES … grant all to service_role` | `createAdminClient()` | privilégio em objetos futuros | ✓ WIRED | Sem isso a próxima tabela derrubaria o booking |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `criarAgendamentoPublico` | `agendamento` (RETURNING) | INSERT real via `createAdminClient()` no Supabase de dev | Sim — `agendamento.id` truthy, `status='confirmado'`, linha conferida no banco com `tenant_id` e `servico_id` certos | ✓ FLOWING |
| `clientes` (lookup por telefone) | `clienteId` | SELECT + INSERT reais | Sim — 1 linha só após dois agendamentos com o mesmo telefone; `telefone` gravado como `11988887777` (só dígitos) | ✓ FLOWING |
| `obterSlotsPublicos` | `slots` | engine com `supabase: admin`, slug resolvido no servidor | Sim — grade não vazia, e o segundo primeiro-slot ≠ do primeiro (a grade se refaz) | ✓ FLOWING |
| `err.message` → caixa de erro da UI | `mensagem` | Server Action → flight | **Não** — em produção chega `{"digest":"…"}` e o cliente monta a mensagem genérica em inglês | ✗ **HOLLOW** |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Superfície anônima fechada | `bash scripts/verificar-superficie-anon.sh` | 11 checagens, 0 reprovadas, 0 inconclusivas, exit 0 | ✓ PASS |
| Boot morre sem a chave | veredito `MORTE` do harness | código 1, variável nomeada em stderr, curl 7 | ✓ PASS |
| Build imune ao fail-fast | veredito `BUILD` | `pnpm build` exit 0 com `QSTASH_NEXT_SIGNING_KEY` vazia | ✓ PASS |
| App saudável (controle) | veredito `CONTROLE` | `GET /` → 200, processo vivo | ✓ PASS |
| Webhook fechado | veredito `WEBHOOK` | `401,401,401,200` | ✓ PASS |
| Escrita do booking ponta a ponta (servidor) | `pnpm test:integracao` | 1 arquivo, **6 testes**, 0 pulados, 6,35 s | ✓ PASS |
| Definition of Done | `pnpm lint` / `pnpm test` / `pnpm build` | exit 0 / 13 arquivos, 198 testes / exit 0 | ✓ PASS |
| Hermeticidade de `pnpm test` | duração e contagem | 381 ms, integração fora do glob | ✓ PASS |
| **Mensagem de Server Action atravessa em produção** | `curl -X POST /book/qualquer -H 'Next-Action: 70efdce379…' --data '["slug-inexistente","2026-08-01",30]'` contra `next start` | `1:E{"digest":"2760064589"}` — **mensagem ausente** | ✗ **FAIL** |
| Fallback `'secret-key'` extinto | `grep -rn "secret-key" src/ scripts/` | vazio | ✓ PASS |
| Sem `select('*')` no caminho público | `grep "select('\*')" public-booking.ts assinaturas.ts booking-engine.ts` | vazio | ✓ PASS |
| `service_role` fora de todo `revoke` | `grep -rniE "revoke.*service_role" supabase/migrations/` | 2 ocorrências, **ambas em comentário** | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
|---|---|---|---|
| Superfície anônima | `bash scripts/verificar-superficie-anon.sh` | exit 0 | ✓ PASS |
| Fail-fast de boot | `bash scripts/verificar-fail-fast-boot.sh` | exit 0 — "4 vereditos, 0 reprovados" | ✓ PASS |
| Escrita do booking | `pnpm test:integracao` | exit 0 — 6/6 | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| SEG-01 | 01-04, 01-05, 01-07 | Visitante anônimo não insere agendamento nem cliente direto na Data API | ✓ SATISFIED | Truth 2. Fechado no portão (revoke) e no porteiro (policy substituída) |
| SEG-02 | 01-01, 01-02, 01-04, 01-05, 01-08 | `perfis_empresas` deixa de ser enumerável com a chave publicável | ✓ SATISFIED | Truth 1. A extensão do 01-08 (cross-tenant por conta autenticada) também está satisfeita — truth 9, confirmada no banco pelo orquestrador |
| SEG-03 | 01-02, 01-04, 01-05 | `agendamentos`/`excecoes_agenda` expõem a `anon` só as colunas da engine | ✓ SATISFIED | Truth 4 |
| SEG-04 | 01-04, 01-05, 01-08 | Coluna/tabela nova nasce sem acesso `anon` (regra escrita + privilégio revogado) | ✓ SATISFIED | Truth 5. Regra escrita em `docs/03` §"Privilégios da Data API". ⚠️ WR-02 do review: a default privilege cobre TABLES e SEQUENCES, **não FUNCTIONS** — RPC nova nasce executável por `anon`. Não falsifica SEG-04 como escrito ("tabela"/"coluna"), mas é o mesmo modo de falha por outra porta |
| SEG-05 | 01-03, 01-05, 01-06 | Webhook só aceita assinatura válida; a aplicação não sobe sem as chaves | ⚠️ **PARCIAL** | Segunda metade ✓ (truth 7, gap 1 fechado e reproduzido). Primeira metade satisfeita na LETRA (truth 6: 401×3) mas comprometida no ESPÍRITO pela chave publicada na URL (truth 8, gap 1 novo) |

**Órfãos:** nenhum. Os 5 IDs mapeados para a Phase 1 em `REQUIREMENTS.md` §Traceability (:147-151) são reivindicados por planos, e todos os 9 planos declaram `requirements`.

⚠️ **`REQUIREMENTS.md:17` e `:151` marcam SEG-05 como `[x]`/`Complete`.** A correção do plano 01-09 está certa quanto ao fail-fast — eu reproduzi. Mas o texto declara SEG-05 fechado sem mencionar que a chave que autentica o webhook é publicada em toda mensagem. Rever junto do gap 1.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| — | — | `TBD`/`FIXME`/`XXX` nos 16 arquivos de código/script da fase | — | Nenhum. Scan limpo |
| — | — | `TODO`/`HACK`/`PLACEHOLDER` nos mesmos arquivos | — | Nenhum. Scan limpo |
| `src/lib/whatsapp-helper.ts` | 147 | Segredo de autenticação em query string | 🛑 **Blocker** | Gap 1 |
| `src/lib/whatsapp-helper.ts` | 164-167 | `console.error(..., await response.text())` do QStash | 🛑 **Blocker** (agrava o 147) | Corpo de erro do QStash costuma ecoar a URL de destino → a chave vai para o log da aplicação |
| `src/lib/whatsapp-helper.ts` | 87-99 | `console.error(..., await response.text())` da Evolution | ⚠️ Warning | CR-04 do review. `docs/09:123-125` afirma, como fato observado, que esse payload ecoa telefone e o texto já personalizado — e usa isso para justificar a trava de breadcrumb do Sentry. A trava foi ao Sentry; o log do Railway continua recebendo. Viola o invariante "nunca PII em log". Não é critério desta fase, mas vive num arquivo entregue por ela |
| `src/app/actions/public-booking.ts` / `BookingApp.tsx` | 170-181, 366-374 / 157-165, 271-287 | Erro esperado modelado como `throw` através de Server Action | 🛑 **Blocker** | Gap 2 |
| `supabase/schemas/01_perfis_empresas.sql` + `public-booking.ts:36-50` | 3-4 / 36-50 | `slug_gratuito` sem UNIQUE e sem checagem cruzada com `slug` | ⚠️ Warning | CR-03 do review. Pré-existente, mas é o furo de isolamento entre tenants que sobrou depois de a Data API ser fechada — e a fase é o hardening da superfície pública. Cenário: tenant A grava `slug = <slug_gratuito de B>`; a resolução tenta `slug` primeiro; o link público de B passa a servir a página de A e os agendamentos de B (com nome e telefone dos clientes finais) caem na base de A |
| `supabase/migrations/20260722060000` | 55-68 | `ALTER DEFAULT PRIVILEGES` cobre TABLES/SEQUENCES, não FUNCTIONS | ⚠️ Warning | WR-02. Função nova no `public` nasce com `EXECUTE` para `PUBLIC` e o PostgREST a expõe como RPC — chamável com a chave publicável sem GRANT novo. O projeto já conhece o remédio (`03_horarios_funcionamento.sql:101` revoga à mão, uma por função) |
| `scripts/verificar-superficie-anon.sh` | 148-158 | Classifica como ESPERADO qualquer código ≠ 200 | ℹ️ Info | WR-08. Nesta execução o risco não se materializou: as 11 checagens devolveram `42501` (permission denied), não `PGRST205`/404. Mas uma tabela renomeada numa fase futura ficaria verde para sempre |
| `src/lib/assinaturas.ts` | 78-81 | Qualquer erro de leitura degrada o tenant a `gratuito` | ⚠️ Warning | WR-07. Depois desta fase a consequência mudou de escala: `resolverPerfilPublicoPorSlug` compara `obterSlugEfetivo(perfil, plano) !== slug`, então falha transitória em `assinaturas` faz `/book/<slug-customizado>` responder **404** para os clientes de um tenant pagante, sem alerta |

### Human Verification Required

Os sete itens registrados em `docs/PENDENCIAS.md:806-880` continuam **abertos e não aprovados** — o plano 01-09 honrou a proibição de fechá-los por conta própria, e conferi item a item. Dois foram reduzidos (não fechados) pelo 01-07:

1. **Wizard completo de `/book/[slug]` na tela** — o servidor está provado por comando; a tela, não. O que falta: as etapas no navegador, a transição para "Horário confirmado!" e a linha aparecendo na agenda do dashboard, sem fricção nova.
2. **Recuperação de double-booking na tela** — ⚠️ **agora com prognóstico negativo**: pelo gap 2 este item deve REPROVAR em build de produção. Testar em `next start`, não em `pnpm dev` (em dev funciona, e é isso que esconde o defeito).
3. **Caixa de erro de slots na tela** — mesma ressalva: em produção a copy contratada não aparece.
4. **Dashboard tela a tela sob as policies tenant-scoped** — incluindo reativar um serviço inativo (caso que passou a importar depois do DROP do 01-08).
5. **Personalização por plano** — Pro exibe cor/logo/capa; gratuito não. Com o RLS bypassado no caminho público, a sanitização por plano é defesa ÚNICA.
6. **Lembrete do QStash ponta a ponta** — um 401 no log indica mismatch de URL atrás do proxy (WR-04); o caminho de falha é inteiramente silencioso.
7. **Backstops visuais com dado extremo** — 20+ serviços, `horizonte_maximo_dias = 30`, nomes longos.

**Item novo desta reverificação:** nenhum. O único candidato — confirmar no banco a remoção das policies residuais — foi resolvido pelo orquestrador logo após a verificação, com o MCP do Supabase que o subagente não tinha. Ver `orchestrator_followup` no frontmatter.

### Gaps Summary

**O fechamento de gaps entregou o que prometeu, e eu reproduzi cada prova em vez de aceitar o SUMMARY.**

O gap 1 fechou de verdade: o `next start` de produção com `QSTASH_NEXT_SIGNING_KEY` vazia agora encerra com código 1, nomeia a variável em `stderr` e a porta recusa conexão — o `curl 7` é a diferença entre um deploy que o Railway reverte sozinho e o falso verde de antes. O harness que prova isso é honesto: li o script antes de rodá-lo, confirmei que `setsid` está proibido (ele mascararia o código de saída), que o complemento de dev é idêntico nas duas execuções (isolando a variável alvo) e que a semântica do `@next/env` sustenta o contrafactual — `processEnv` só preenche a partir do `.env.local` quando `typeof l[chave] === 'undefined'`, e `env VAR=` deixa string vazia, não `undefined`. O gap 2 fechou pela metade que importava mais em termos de risco silencioso: o caminho de ESCRITA do booking agora é exercitado contra o Supabase de dev com escrita real, e `pnpm test` continua hermético (381 ms, sem rede). O gap 3 está correto no repositório, e a documentação da fase (`REQUIREMENTS`, `ROADMAP`, `PENDENCIAS`) foi reparada com uma honestidade que merece registro — os sete itens de UAT não foram fabricados como feitos.

**O que impede o fechamento formal são dois achados que a revisão de código levantou e que eu verifiquei por conta própria. Os dois procedem.**

O primeiro é o mais grave, porque ataca exatamente a metade do goal que a fase se propôs a fechar. `whatsapp-helper.ts:147` publica `QSTASH_CURRENT_SIGNING_KEY` — a chave HMAC com que o webhook autentica desde o plano 01-03 — em texto claro na query string da URL de destino de todo lembrete. HMAC é simétrico: quem lê essa URL num log de acesso da Railway, no console do QStash (até 14 dias) ou na linha `console.error(..., await response.text())` logo abaixo, forja um `Upstash-Signature` válido e dispara WhatsApp em nome de qualquer tenant. A fase fechou a porta com uma fechadura criptográfica correta e deixou a chave no capacho. E a justificativa escrita no próprio código não se sustenta: conferi que `route.ts:29` valida contra `req.url`, ou seja, mensagens já em voo continuam casando com a URL antiga **independentemente** de as novas carregarem o parâmetro. Não existe problema de "duas gerações de URL" — a premissa que sustentou o deferimento no `01-CONTEXT.md:176` é falsa. Custa uma linha parar de publicar o parâmetro; a rotação das chaves fica para depois de a fila secar.

O segundo eu não inferi de leitura de código: medi. Contra o build de produção deste HEAD, invoquei a Server Action `obterSlotsPublicos` com um slug inexistente e recebi `1:E{"digest":"2760064589"}` — só o digest, mensagem nenhuma. Isso mata dois contratos desta fase de uma vez. A copy `Não foi possível carregar os horários. Tente de novo.` é contrato verbatim do `01-UI-SPEC` e nasceu **nesta fase** (em `master` a função não lançava, caía em fuso e regras padrão); em produção o cliente final vê texto de framework em inglês. E `mensagem.includes('já foi preenchido')` é sempre `false` em produção, então a recuperação de double-booking não acontece: o visitante fica preso na etapa de contato olhando para um horário que não existe mais. A suíte do 01-07 dá verde nos dois porque chama a action em processo — o comentário do teste admite não provar a renderização, mas o efeito é sinal verde num caminho morto. Em `pnpm dev` tudo funciona, que é precisamente o que fez o defeito atravessar nove planos, um review e uma verificação.

O terceiro gap é pequeno e barato: `docs/PENDENCIAS.md:1071-1077` ainda descreve como aberto o que esta fase fechou (o fallback `'secret-key'`, extinto — grep vazio; a migração para assinatura real, feita) e não registra em lugar nenhum o risco que continua vivo. A Definition of Done do projeto exige esse arquivo coerente.

**Uma ressalva de método, para não vender prova que não fiz:** o lado banco do gap 3 — `pg_policies` sem linha para `anon` e a contagem cross-tenant caindo de 2 para 1 — não foi reproduzido nesta sessão. Não tenho as ferramentas MCP do Supabase e o CLI não está autenticado. O harness anônimo devolve 401/42501 nas duas tabelas, mas isso prova o REVOKE, não o DROP: uma policy inerte produziria exatamente o mesmo erro. Fica como item de reconferência, não como afirmação.

> **Ressalva resolvida (orquestrador, mesmo HEAD).** O orquestrador do `execute-phase` tem o MCP do Supabase e consultou `pg_policies` na sequência: 8 linhas nas duas tabelas, todas `{authenticated}`, e a única policy de SELECT restante em cada uma é `Permitir SELECT do próprio tenant para autenticados` com `qual = (tenant_id = ( SELECT (auth.jwt() ->> 'org_id'::text)))`. Como policies permissivas somam por `OR` e não sobrou segundo termo, o predicado efetivo é só o do próprio tenant — a contagem 2→1 é consequência aritmética disso. O verificador estava certo em não afirmar; a lacuna era de ferramenta, não de evidência. Detalhes em `orchestrator_followup` no frontmatter.

**Nota de priorização honesta:** dos dois bloqueadores, o gap 1 é de segurança e o gap 2 é de produto. Nenhum dos dois é regressão introduzida pelo fechamento de gaps — os dois são dívida que a fase carregou desde o começo e que só apareceu quando alguém foi olhar a produção em vez do código. O gap 1 custa uma linha de código mais uma rotação agendada. O gap 2 custa uma refatoração de contrato (erro esperado como valor de retorno em vez de `throw`), e é insumo obrigatório do planejamento da Phase 2, cujo SC4 depende exatamente do mecanismo que está quebrado.

---

_Verified: 2026-07-22T15:51:28Z_
_Verifier: Claude (gsd-verifier) — reverificação sobre HEAD `4596463`_
