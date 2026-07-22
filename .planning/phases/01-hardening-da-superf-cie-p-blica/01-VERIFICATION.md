---
phase: 01-hardening-da-superf-cie-p-blica
verified: 2026-07-22T03:05:00Z
status: gaps_found
score: 5/7 must-haves verified
behavior_unverified: 1
overrides_applied: 0
gaps:
  - truth: "A aplicação não sobe se as chaves de assinatura não estiverem configuradas (critério 5 do ROADMAP, segunda metade de SEG-05)"
    status: failed
    reason: >-
      Reproduzido de forma independente pelo verificador contra o build de produção,
      isolando a variável: com QSTASH_NEXT_SIGNING_KEY vazia, `next start` loga
      "Failed to prepare server ... Variáveis obrigatórias ausentes em produção:
      QSTASH_NEXT_SIGNING_KEY", responde HTTP 500 em `/` e O PROCESSO CONTINUA VIVO
      E ESCUTANDO. Controle com as 14 variáveis presentes responde HTTP 200. A
      aplicação sobe — só não serve nada. O critério, como escrito, é falso.
      NÃO é buraco de segurança: nenhum estado com chave ausente destranca o
      webhook (duas camadas verificadas). É defeito operacional: healthcheck de
      liveness marca o deploy como verde enquanto 100% das rotas falham.
    artifacts:
      - path: "src/instrumentation.ts"
        issue: "register() lança, mas o Next 16.2.10 converte a exceção em unhandledRejection e segue escutando — não há process.exit(1)"
      - path: "src/lib/env.ts"
        issue: "validarEnvObrigatorio() está correto e nomeia a variável; o que falha é a semântica de boot do framework acima dele"
    missing:
      - "Decisão humana: aceitar o desvio via override (com healthcheck HTTP de readiness no Railway como controle compensatório) OU alterar a semântica de boot (process.exit(1) após o throw em register())"
      - "Se aceito: corrigir a redação de SEG-05 em REQUIREMENTS.md e do critério 5 no ROADMAP, hoje marcados [x] Complete sobre um critério literalmente falso"
behavior_unverified_items:
  - truth: "O booking público continua funcionando exatamente como antes (critério 2 do ROADMAP, segunda metade)"
    test: "Percorrer o wizard completo de /book/avantis: serviço → data/hora → nome + WhatsApp → confirmar, até a tela 'Horário confirmado!', e conferir que o agendamento aparece na agenda do dashboard"
    expected: "Tela de sucesso renderiza e a linha cai na agenda; nenhuma etapa, campo, confirmação ou atraso novo (Fricção Zero)"
    why_human: >-
      O caminho de ESCRITA (lookup/criação de cliente + INSERT de agendamento com
      RETURNING sob as policies novas) não é exercitado por nenhum teste. A prova
      automatizada disponível cobre só LEITURA: /book/avantis → 200 e o canário de
      slug /book/ozm317u4 → 404. Regressão aqui degrada em silêncio (agenda vazia,
      sem erro). O CONTEXT §specifics chama isto de "regressão obrigatória e não
      negociável".
human_verification:
  - test: "Wizard completo de /book/[slug] até a tela de sucesso, com a linha caindo na agenda"
    expected: "Sucesso renderiza; agendamento na agenda; nenhuma fricção nova"
    why_human: "Caminho de escrita sem cobertura de teste; agravado pela troca tenantId → slug do plano 01-02"
  - test: "Recuperação de double-booking — duas abas no mesmo slot"
    expected: "A segunda volta à etapa de data/hora com aviso âmbar e grade refeita"
    why_human: "Acoplamento por substring 'já foi preenchido' (public-booking.ts:179 ↔ BookingApp.tsx:276) verificado no código, nunca na tela"
  - test: "Dashboard tela a tela sob as policies tenant-scoped novas"
    expected: "Agenda carrega; agendamento manual salva E a linha volta; exceção salva; perfil salva; serviços listam"
    why_human: "RETURNING depende de passar na policy de SELECT; falha aparece como tela vazia sem erro"
  - test: "Personalização por plano — tenant Pro vs. gratuito"
    expected: "Pro exibe cor/logo/capa; gratuito não exibe nada"
    why_human: "Com RLS bypassado no caminho público, a sanitização por plano virou defesa ÚNICA (regressão visual e de monetização, silenciosa)"
  - test: "Lembrete do QStash ponta a ponta com agendamento real"
    expected: "Mensagem chega; nenhum 401 no log do webhook"
    why_human: "Mismatch de URL atrás de proxy só aparece em tráfego real; mensageria falha em silêncio por design"
  - test: "Caixa de erro de slots com slug inexistente"
    expected: "Copy 'Não foi possível carregar os horários. Tente de novo.' na caixa vermelha role=alert"
    why_human: "String está no código (public-booking.ts:373) e compila; nunca foi renderizada"
  - test: "Backstops visuais com dado extremo (UI#6, #13, #17, #22, #24, #31)"
    expected: "20+ serviços, horizonte_maximo_dias=30, nomes longos — layout não quebra"
    why_human: "Truths marcadas verification: backstop no plano 01-05; não inferíveis de código"
---

# Phase 1: Hardening da superfície pública — Verification Report

**Phase Goal:** A chave publicável que vai no bundle deixa de dar acesso a qualquer coisa além do estritamente necessário para a página pública funcionar, e o webhook de lembrete só aceita quem o QStash assinou
**Verified:** 2026-07-22
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth (critério do ROADMAP) | Status | Evidence |
|---|---|---|---|
| 1 | SC1 — `curl` anônimo em `perfis_empresas` não devolve a lista de profissionais, nem `telefone_contato`, nem o `org_id` | ✓ VERIFIED | Harness rodado no HEAD: `select=*` e `select=tenant_id,telefone_contato` → 401/42501. Portão e porteiro fechados: `20260722060000` revoga todos os privilégios de `anon`; `20260722055941` dropa a policy `SELECT público` e cria a substituta `TO authenticated USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'))`. Schema declarativo (`01_perfis_empresas.sql`) bate com o banco — zero `TO anon` |
| 2 | SC2a — POST anônimo em `agendamentos` e `clientes` é rejeitado | ✓ VERIFIED | Harness: 401/42501 nas duas tabelas (baseline era 409/23503, barrado por FK e não pelo portão). Policies `INSERT público para visitantes` dropadas com substitutas `TO authenticated` no mesmo arquivo (D-07 honrada) |
| 3 | SC2b — o booking público continua funcionando exatamente como antes | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Leitura provada: `/book/avantis` → 200, `/book/ozm317u4` → 404 (canário contrapositivo). Código de escrita presente e corretamente ligado. Mas o percurso serviço → sucesso → linha na agenda não foi percorrido por ninguém. Ver Human Verification |
| 4 | SC3 — `agendamentos` e `excecoes_agenda` sem `cliente_id` nem `motivo` para `anon` | ✓ VERIFIED | Harness: `select=cliente_id` e `select=motivo` → 401/42501. Satisfeito com folga: `anon` perdeu a Data API inteira (D-01), zero colunas ⊂ colunas necessárias |
| 5 | SC4 — tabela nova não aparece na Data API sem GRANT explícito | ✓ VERIFIED | Provado empiricamente: tabela descartável `public.teste_superficie` criada; `role_table_grants` mostrou grants só para `postgres` e `service_role`, zero para `anon`/`authenticated`; curl anônimo → 401/42501; tabela removida. Metade "regra escrita" de SEG-04 em `docs/03` §"Privilégios da Data API" (itens a–e + checklist). 🚨 Prohibition honrada: li as duas migrations linha a linha — `service_role` não aparece em nenhuma linha de `revoke`, e ganha `grant all` nas default privileges |
| 6 | SC5a — POST sem assinatura válida do QStash é rejeitado | ✓ VERIFIED | **Probe próprio do verificador** contra o build de produção (porta 3990): `/` → 200 (controle); POST sem header → **401**; POST com `?secret=secret-key` legado → **401**; POST com `Upstash-Signature` forjado → **401**; 3 warnings "Tentativa de acesso não autorizada" no log. `JSON.parse` só depois de autenticado (route.ts:40). Fallback `\|\| 'secret-key'` extinto nos DOIS lados — `grep -rn "secret-key" src/ scripts/` volta vazio |
| 7 | SC5b — a aplicação não sobe sem as chaves de assinatura configuradas | ✗ FAILED | **Reproduzido pelo verificador, isolando a variável:** `QSTASH_NEXT_SIGNING_KEY=""` → `next start` → "Failed to prepare server ... Variáveis obrigatórias ausentes em produção: QSTASH_NEXT_SIGNING_KEY" → HTTP 500 em `/` → **PROCESSO VIVO**. Controle (14 presentes) → HTTP 200. A aplicação sobe; só não serve nada |

**Score:** 5/7 truths verified (1 present, behavior-unverified; 1 failed)

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `scripts/verificar-superficie-anon.sh` | Harness com três vereditos, exit≠0 em aberto ou inconclusivo | ✓ VERIFIED | 253 linhas; 11 checagens cobrindo os critérios 1, 2, 3 e 3b; `INCONCLUSIVO` para `200 []` (não conta como prova); exit 0/1/2 |
| `src/lib/qstash-assinatura.ts` | Verificação por `Receiver`, chave ausente lança | ✓ VERIFIED | 62 linhas; chaves lidas na chamada (não em constante de módulo); `currentSigningKey` + `nextSigningKey` para rotação; sem caminho permissivo |
| `src/lib/__tests__/qstash-assinatura.test.ts` | Contrato do módulo | ✓ VERIFIED | Rodado: 4 testes passando em 131 ms. Cobre header ausente, rejeição do Receiver, pass-through literal de corpo/URL e o throw nomeando a variável |
| `src/app/api/webhooks/lembrete/route.ts` | Bloco de auth substituído | ✓ VERIFIED | `req.text()` uma vez, `url: req.url`, 401 antes de qualquer toque no banco |
| `src/lib/env.ts` | `QSTASH_NEXT_SIGNING_KEY` na lista | ✓ VERIFIED | Linha 44; lista de 14; teste `env.test.ts` afirma sobre presença e tamanho |
| `src/app/actions/public-booking.ts` | Contrato por slug + projeções explícitas | ✓ VERIFIED | `COLUNAS_PERFIL_PUBLICO` e `COLUNAS_SERVICO_PUBLICO` como constantes; `grep "select('\*')"` volta vazio; `resolverPerfilPublicoPorSlug` é a única porta de entrada, com `maybeSingle()` |
| `src/app/book/[slug]/page.tsx` | Payload sem `tenant_id` | ✓ VERIFIED | Projeção explícita de 6 campos para `BookingApp`; `tenant_id` só entra em `hashTenantId(perfil.tenant_id)`. Confirmado no payload RSC (dev e produção) |
| `src/app/book/[slug]/BookingApp.tsx` | Trabalha com slug | ✓ VERIFIED | `slug: string` na interface; passado a `obterSlotsPublicos` (l.150) e `criarAgendamentoPublico` (l.263) |
| `src/lib/supabase/admin.ts` | JSDoc com o terceiro ponto | ✓ VERIFIED | "restrito a três pontos"; item 3 enumera as leituras públicas e as duas contrapartidas obrigatórias |
| `supabase/migrations/20260722055941_fecha_policies_anon.sql` | Policies substituídas | ✓ VERIFIED | 5 DROP + 4 CREATE `TO authenticated` + `COMMENT ON POLICY`; o 5º (assinaturas) sem substituta com justificativa correta (a policy `1b` já cobre). Cabeçalho documenta o bloco de ~250 linhas de privilégio podado do diff |
| `supabase/migrations/20260722060000_fecha_data_api_para_anon.sql` | Privilégios, escrita à mão | ✓ VERIFIED | `revoke all ... from anon` + `alter default privileges for role postgres ... revoke ... from anon, authenticated` + `grant all ... to service_role`. O `for role postgres` está lá (default privileges não são herdadas por membership) |
| `docs/03-PADROES_DE_BANCO_DE_DADOS.md` | Regra da D-03 escrita | ✓ VERIFIED | §"Privilégios da Data API (portão antes do porteiro)", itens a–e com snippet e checklist |
| `docs/PENDENCIAS.md` | Handoffs | ✓ VERIFIED | Pitfall 8 (:720), policies residuais com Risco 1/Risco 2 e procedimento de fechamento (:660–704), UAT pendente item a item (:799–842), WR-02 (:907) |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `BookingApp.tsx` | `public-booking.ts` | `slug` nas duas actions | ✓ WIRED | l.150 e l.263; `tenantId` não aparece mais na interface |
| `public-booking.ts:179` | `BookingApp.tsx:276` | substring "já foi preenchido" | ✓ WIRED | Acoplamento preservado na refatoração — as duas pontas casam |
| `obterDadosBookingPublico` | `obterPlanoVigentePublico(admin, …)` | cliente privilegiado | ✓ WIRED | l.71 passa `admin`. Se recebesse o anon, todo tenant pago degradaria para gratuito em silêncio — o canário `/book/ozm317u4` → 404 é o contrapositivo que prova que não degradou |
| `route.ts` | `verificarAssinaturaQstash` → `Receiver` | duas chaves | ✓ WIRED | Provado por probe HTTP (401×3) e por unit test |
| `env.ts` | `instrumentation.ts register()` | `validarEnvObrigatorio()` | ⚠️ PARCIAL | A chamada existe e é a primeira linha do `register()`. O throw chega ao Next, que o converte em `unhandledRejection` e **segue escutando** — o elo funciona até a borda do framework e para ali. É a causa do gap 1 |
| `ALTER DEFAULT PRIVILEGES … grant all to service_role` | `createAdminClient()` | privilégio em objetos futuros | ✓ WIRED | Presente na migration; sem ele a próxima tabela (Phase 7 `perfis_cobranca`) derrubaria o booking |
| `obterSlotsDisponiveis` | engine com `supabase: admin` | tenant do servidor | ✓ WIRED | As 4 queries da engine carregam `.eq('tenant_id', tenantId)` e projeção explícita — nenhuma `select('*')` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `page.tsx` → `BookingApp` | `perfil`, `servicos`, `personalizacao` | `obterDadosBookingPublico` (admin client, DB real) | Sim — `/book/avantis` → 200 com payload de 119 KB do tenant real | ✓ FLOWING |
| `BookingApp` → grade de horários | `slots` | `obterSlotsPublicos(slug, …)` → engine → 4 queries com `.eq('tenant_id')` | Sim (leitura); grade renderizada não observada por humano | ✓ FLOWING |
| `personalizacao` | `corMarca/logoUrl/capaUrl` | sanitizada por `PLANOS[plano].recursos` | Sim para Pro; a poda para gratuito não foi observada na tela | ⚠️ ver Human Verification |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Webhook rejeita sem assinatura | `curl -X POST /api/webhooks/lembrete` (build de produção) | HTTP 401 | ✓ PASS |
| Webhook rejeita o `?secret=` legado | `curl -X POST '…?secret=secret-key'` | HTTP 401 | ✓ PASS |
| Webhook rejeita assinatura forjada | `curl -X POST -H 'Upstash-Signature: eyJ…'` | HTTP 401 | ✓ PASS |
| App saudável (controle) | `curl /` com as 14 variáveis presentes | HTTP 200 | ✓ PASS |
| Boot morre sem a chave | `QSTASH_NEXT_SIGNING_KEY="" next start` | HTTP 500, **processo vivo** | ✗ FAIL |
| Contrato do módulo de assinatura | `npx vitest run src/lib/__tests__/qstash-assinatura.test.ts` | 4/4 passando, 131 ms | ✓ PASS |
| Fallback inseguro extinto | `grep -rn "secret-key" src/ scripts/` | vazio (exit 1) | ✓ PASS |
| Sem `select('*')` no caminho público | `grep "select('\*')" public-booking.ts assinaturas.ts` | vazio (exit 1) | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
|---|---|---|---|
| `scripts/verificar-superficie-anon.sh` | `bash scripts/verificar-superficie-anon.sh` | exit 0 — 11 checagens, 0 reprovadas, **0 inconclusivas** | ✓ PASS (rodado pelo orquestrador neste HEAD) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| SEG-01 | 01-04, 01-05 | Visitante anônimo não insere agendamento nem cliente direto na Data API | ✓ SATISFIED | Truth 2. Fechado no portão (revoke) E no porteiro (policy substituída) |
| SEG-02 | 01-01, 01-02, 01-04, 01-05 | `perfis_empresas` deixa de ser enumerável com a chave publicável | ✓ SATISFIED | Truth 1. Ver ressalva sobre `authenticated` em Anti-Patterns |
| SEG-03 | 01-02, 01-04, 01-05 | `agendamentos`/`excecoes_agenda` expõem a `anon` só as colunas da engine | ✓ SATISFIED | Truth 4 — zero colunas, satisfeito com folga |
| SEG-04 | 01-04, 01-05 | Coluna nova nasce sem acesso `anon` (regra escrita + privilégio revogado) | ✓ SATISFIED | Truth 5. Ambas as metades. O caso "coluna nova" é satisfeito *a fortiori*: sem SELECT algum, coluna nova em tabela existente também é inacessível |
| SEG-05 | 01-03, 01-05 | Webhook só aceita assinatura válida; a aplicação não sobe sem as chaves | ⚠️ PARCIAL | Primeira metade ✓ (truth 6, probe próprio). Segunda metade ✗ (truth 7) |

**Órfãos:** nenhum. Os 5 IDs mapeados para a Phase 1 em `REQUIREMENTS.md` §Traceability são reivindicados por planos.

⚠️ **`REQUIREMENTS.md` marca SEG-05 como `[x]` e `Complete`** (linhas 17 e 151) sobre um critério cuja segunda metade é literalmente falsa. Corrigir junto da resolução do gap.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| — | — | `TBD`/`FIXME`/`XXX` nos arquivos da fase | — | Nenhum. Scan limpo |
| — | — | `TODO`/`HACK`/`PLACEHOLDER` nos arquivos da fase | — | Nenhum. Scan limpo |
| `supabase/schemas/02_servicos.sql` | 19–20 | Policy `"Permitir SELECT público para todos"` `TO anon, authenticated USING (ativo = true)` | ⚠️ Warning | Ver análise abaixo |
| `supabase/schemas/03_horarios_funcionamento.sql` | 21–22 | idem | ⚠️ Warning | Ver análise abaixo |
| `src/lib/whatsapp-helper.ts` | 147 | `QSTASH_CURRENT_SIGNING_KEY` viaja na query string da URL publicada | ℹ️ Info | Ver análise abaixo |

#### Policies residuais em `servicos` e `horarios_funcionamento` — julgamento

**Não bloqueiam SEG-01.** SEG-01 trata de INSERT anônimo em `agendamentos`/`clientes`; estas são policies de SELECT em duas outras tabelas. Para `anon` são inertes hoje — sem privilégio, a policy nunca é avaliada (confirmado pelo harness: as duas tabelas devolvem 401/42501). A decisão do plano 01-05 de registrar em vez de fechar está tecnicamente correta: migration não aplicável criaria drift de 18 arquivos contra 17 versions, e a análise de que a D-07 não se aplica (a substituta `1b` já existe) confere com o que li nos dois schemas.

**Duas ressalvas que a fase documentou parcialmente:**

1. **Armadilha carregada** (o executor documentou): um único `GRANT ... TO anon` futuro nessas tabelas reabre toda linha `ativo = true` sem que nenhuma policy nova precise ser escrita. É a inversão exata do princípio que a própria migration `20260722060000` argumenta.

2. **Leitura cross-tenant por `authenticated`, hoje** (documentado como "Risco 1", mas com um detalhe a mais que a verificação encontrou): `authenticated` manteve os privilégios nas tabelas existentes por desenho, e as policies são permissivas e somadas por `OR` — logo, para um usuário logado, `(ativo = true) OR (tenant próprio)` resolve para **todos os tenants**. Isso inclui `servicos.tenant_id`, ou seja, **a lista de `org_id` de todos os profissionais com serviço ativo é obtível por qualquer conta autenticada**, junto de nome e preço dos serviços. O cadastro é self-service e aberto. Isso não viola a letra de SEG-02 ("com a chave publicável" — fechado, verificado), mas arranha o espírito ("a lista de profissionais da plataforma não é obtível"). É **pré-existente e não agravado pela fase** — antes, `perfis_empresas` estava aberta a `anon` com `USING (true)`, o que era estritamente pior. Recomendo tratar como o primeiro item da próxima sessão com acesso a banco, seguindo o procedimento já escrito em `PENDENCIAS.md:696-704`.

#### `QSTASH_CURRENT_SIGNING_KEY` na query string — julgamento

`whatsapp-helper.ts:147` publica `…/lembrete?secret=${chaveAssinatura}` usando a própria chave de assinatura. Como o HMAC é simétrico, quem lê essa URL consegue **forjar** assinaturas válidas. Verificado no histórico: o comportamento é **pré-existente** (`master` fazia `QSTASH_CURRENT_SIGNING_KEY || 'secret-key'`), e a remoção do parâmetro é Deferred Idea explícita do CONTEXT enquanto a fila drena (14 dias). Duas mitigações reais reduzem isso a Info:

- Sentry não coleta a query string (`urlQueryParams: false` em `opcoes-sentry.ts`) e a integração `Console` é removida no servidor e no edge — os dois vetores de vazamento para terceiro estão fechados por configuração testada.
- A URL só transita entre a aplicação e o QStash, que já detém a chave.

Resta o log de acesso do Railway. Vale registrar como razão adicional (além da redundância) para executar a remoção do parâmetro quando a fila secar.

### Gaps Summary

A fase entregou o núcleo do seu objetivo com qualidade acima do comum: o portão (`GRANT`) e o porteiro (`RLS`) foram fechados juntos, as cinco policies compartilhadas foram substituídas e não apenas removidas, `service_role` ficou fora de toda linha de `revoke`, as três mitigações da D-02 estão implementadas e verificáveis (`tenant_id` resolvido no servidor, projeção explícita sem nenhum `select('*')`, JSDoc atualizado), a regra da D-03 está escrita onde a Phase 7 vai procurar, e o webhook rejeita com 401 tudo que não tenha assinatura — o que confirmei com probe próprio contra o build de produção, não por leitura do SUMMARY.

**Um gap bloqueia o fechamento formal:** o critério 5 do ROADMAP e a segunda metade de SEG-05 dizem "a aplicação não sobe se as chaves não estiverem configuradas". Isso é falso, e eu reproduzi de forma independente e isolada: o processo sobe, escuta e responde 500 em toda rota. É importante separar as duas leituras — **não é buraco de segurança** (nenhum estado com chave ausente destranca o webhook: a aplicação não serve nada e `verificarAssinaturaQstash` lança), mas **é defeito operacional real**, porque um healthcheck de liveness marca o deploy como saudável enquanto 100% do tráfego falha, sem rollback automático. O executor mediu isso corretamente, escreveu como insatisfeito e escalou em vez de improvisar `process.exit(1)` — a conduta certa. A decisão é do owner: aceitar via `override` (com readiness HTTP no Railway como controle compensatório) ou mudar a semântica de boot.

**Sete itens de UAT visual não foram executados** e estão registrados honestamente em `PENDENCIAS.md`. O mais crítico é o wizard de ponta a ponta: toda a prova automatizada da fase cobre leitura, e o caminho de **escrita** do booking — o que o Core Value da milestone define como sucesso — não foi exercitado por teste nem por humano depois de a fase ter trocado o identificador que as duas Server Actions públicas recebem. O CONTEXT §specifics chama isso de "regressão obrigatória e não negociável", e sem ele a fase não atingiu a própria barra de "fechou de verdade".

Duas observações não bloqueantes ficam registradas acima: as policies residuais de `servicos`/`horarios_funcionamento` (com a nuance de enumeração de `tenant_id` por conta autenticada, que amplia o "Risco 1" já documentado) e a chave de assinatura viajando na query string.

---

_Verified: 2026-07-22_
_Verifier: Claude (gsd-verifier)_
