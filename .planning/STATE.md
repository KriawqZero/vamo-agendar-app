---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: Lançamento público
current_phase: 02
current_phase_name: integridade-da-agenda
status: complete
stopped_at: Completed 02-01-PLAN.md
last_updated: "2026-07-23T16:24:18.757Z"
last_activity: 2026-07-23
progress:
  total_phases: 2
  completed_phases: 1
  total_plans: 25
  completed_plans: 20
last_activity_desc: "Phase 01 FECHADA (aceitando gaps não-bloqueantes). Os cinco Success Criteria do ROADMAP foram medidos DIRETAMENTE na 4ª verificação (acesso DDL ao banco): SC1/SC2/SC3 anônimos em 401/42501 com controle positivo, SC4 exercitado por objeto descartável criado e removido (anon f/f/f, service t/t/t), SC5 por harness de boot e webhook — o GOAL está alcançado. Dos 3 gaps que não falsificavam nenhum SC: CR-02 (escrita pública sem teto de campo) foi CORRIGIDO nos commits e7adc01/738a896/600e429 com pnpm test 241/241, lint e build verdes; WR-03 (PENDENCIAS descrevendo o mundo pré-fase) foi CORRIGIDO; CR-01 (falso-verde do harness em alvo parcial) fica como DÍVIDA DEFERIDA — é instrumento quebrado, não vulnerabilidade, e os SC foram provados por DDL direto, não por esse script. Próximo: /gsd-discuss-phase 02"
---

# Project State

## Project Reference

See: .planning/PROJECT.md (atualizado 2026-07-21)

**Core value:** Um agendamento real, feito por um cliente final que nunca ouviu falar do VamoAgendar, cair na agenda do profissional sem que nada quebre no caminho.
**Current focus:** Phase 02 — integridade-da-agenda

## Current Position

Phase: 02 (integridade-da-agenda) — EXECUTING
Plan: 2 of 6

### Planejamento da 3ª rodada (2026-07-22, branch `fase-01-gaps-rodada-3`)

Três planos, serialização estrita (um por wave), commits `951cd98` (criação) e `ba46c4b` (correções do plan-checker):

- **01-17 (wave 1, tracer)** — GAP A: `scripts/verificar-superficie-anon.sh` ganha contador `ESPERADAS` (exit 2 quando nenhuma checagem produziu prova positiva) e veredito de identidade do alvo. O controle re-executável `scripts/verificar-controle-harness-anon.sh` **nasce vermelho** — é critério de aceite, não observação: 4 vereditos, 4 reprovados antes do conserto, provado por `test $? -eq 1`. Cobre três eixos de falso verde, incluindo um que o code review não tinha (alvo que nega tudo uniformemente). O stub é `node:http` efêmero em `mktemp -d`, sem Docker e sem tocar o `.env.local` real
- **01-18 (wave 2, depende de 01-17)** — GAP B: validação na fronteira de `obterSlotsPublicos` **antes** de `createAdminClient()`, guarda de profundidade no topo de `gerarSlotsAntiBuraco`, e replicação da validação de `duracaoMinutos` em `obterSlotsDashboard`. Fecha por **teto medido**, não por mudança de forma: a mesma sonda com `-5000000` contra `next start` tem de devolver `servico_invalido` em < 1.000 ms e < 10.000 bytes (linha de base legítima: 525 ms / 2.179 bytes; o gap abriu em 26.751 ms / 19.291.480 bytes). Os vereditos `ENTRADA_HOSTIL`/`DATA_HOSTIL` exigem o discriminante esperado **e a ausência de `slug_invalido`** no corpo — é o que prova que a guarda roda antes da resolução do slug
- **01-19 (wave 3, depende de 01-18)** — ITEM C: o alcance real da D-03 escrito em `docs/03-PADROES_DE_BANCO_DE_DADOS.md` (a garantia vale para objetos criados por `postgres`; tabela criada por `supabase_admin` ainda herda `anon`/`authenticated` — default de plataforma que a migration não tocou), registro coerente em `PENDENCIAS.md` incluindo os dez avisos da 2ª rodada de review como **ponteiros** com a colisão de numeração resolvida, e gate que reexecuta as 8 provas encadeadas sobre o HEAD final

**Fronteira medida antes de escrever:** `criarAgendamentoPublico` lê `duracao_minutos` do banco e deriva `dateStr` de um `Date` já validado por `isNaN` — nenhum valor do navegador alcança o laço da engine pelo caminho de ESCRITA. Por isso o GAP B é estritamente o caminho de LEITURA, e o WR-03 diferido (escrita pública sem limite de tamanho) continua diferido, com a fronteira escrita em voz alta nos dois planos.

**Achado de tipagem que o relatório de verificação não tinha:** `ResultadoSlots` declara a falha como `MotivoLeituraPublica = Extract<MotivoPublico, 'slug_invalido' | 'erro_interno'>`, então `data_invalida` e `servico_invalido` **não** compilam contra ele apesar de serem membros de `MotivoPublico`. O 01-18 manda criar alias próprio em vez de alargar `MotivoLeituraPublica` — sem isso o executor bateria em erro de compilação no meio do plano.

### Resultado da 3ª passagem de verificação (2026-07-22)

**Os 3 gaps da passagem anterior fecharam** — cada um remedido por caminho independente, não herdado de SUMMARY. SC1, SC2 e SC3 foram medidos anonimamente com controle positivo de alvo (9/9 tabelas e 2/2 RPCs em 401/42501, depois de provar que a URL é o banco deste projeto). SC4 ficou como "presente, não exercitado" no relatório principal porque o verificador não recebeu o MCP do Supabase; o **adendo do orquestrador** o remediu por `pg_default_acl` (ver `01-VERIFICATION.md` §Adendo).

**Dois gaps NOVOS entram, ambos bloqueantes.** Vieram do code review em profundidade da rodada (`01-REVIEW.md`, commit `8edb32d`, 2 blockers + 10 warnings) e foram **reproduzidos empiricamente** pelo verificador, não confirmados por leitura:

- **`scripts/verificar-superficie-anon.sh` certifica fechamento sem ter medido.** Com o alvo inalcançável, as 11 checagens registram `HTTP 000`, a COBERTURA passa, e a saída é `0 reprovada(s) — a role anon não devolveu linha nenhuma` com **exit 0**. Causa em `:398-401`: o exit code é decidido só por `REPROVADAS -eq 0`; `INCONCLUSIVAS` é impresso e descartado. É o instrumento que o `ROADMAP.md:195` nomeia como prova de SEG-01/02/03. O conserto do WR-08 (01-15) foi real e fechou o eixo do NOME da tabela — o falso verde apenas mudou para o eixo da IDENTIDADE DO ALVO
- **`obterSlotsPublicos` não valida entrada.** `duracaoMinutos` chega cru de chamador anônimo e alimenta o limite do laço síncrono de `gerarSlotsAntiBuraco` (`booking-engine.ts:144`). Medido por HTTP contra build de produção, slug real, sem sessão: `-5000000` → **26.751 ms e 19,29 MB numa única requisição**, com o event loop parado para todas as outras em voo. Não é regressão (o `master` tem a mesma ausência), mas a fase É o hardening da superfície pública, a Fricção Zero proíbe CAPTCHA, e a Phase 3 não cobre — rate limit deixa a primeira requisição passar, e uma basta. A inversão que mostra ser acidental: o fluxo **autenticado** `obterSlotsDashboard` valida `dateStr` por regex (`agendamentos.ts:189`); o **anônimo** não valida nada

O que a rodada de fato fechou no código, e o que em cada item não é código:

  1. `whatsapp-helper.ts` publicava `QSTASH_CURRENT_SIGNING_KEY` em texto claro na query string de todo lembrete — a mesma chave HMAC com que o webhook autentica desde o 01-03. **METADE DE CÓDIGO FECHADA no 01-11**: a URL publicada é agora a rota limpa, e quatro `console.error` deixaram de despejar corpo de gateway no log (o da Evolution ecoava telefone e texto personalizado — CR-04). Cinco testes travam os dois defeitos, provados vermelhos na reversão. **CONTINUA ABERTO o que código não conserta**: a chave já circulou por log de acesso e pelo console da Upstash, e a rotação é ação do owner no painel, depois de a fila secar (≤ 14 dias). **O 01-13 transformou isso em item escrito**: `docs/PENDENCIAS.md` §"🔑 Rotação das signing keys do QStash" — dono nomeado (só o owner fecha), data-limite **2026-08-05**, etapa 1 registrada como feita e etapa 2 nascida aberta, com o passo-a-passo de depois da troca. Por isso SEG-05 continua NÃO marcado como concluído em REQUIREMENTS.md
  2. Em build de produção o React só transporta o `digest` do erro da Server Action, então a copy contratada no `01-UI-SPEC` e a recuperação de double-booking estavam mortas na tela. **FECHADO NO CÓDIGO** — metade de LEITURA no 01-10, metade de ESCRITA no **01-12**: `criarAgendamentoPublico` devolve `{ ok: false, motivo }`, o `BookingApp` decide por `res.motivo === 'slot_indisponivel'` (a comparação por substring saiu do arquivo, `grep` devolve `0`) e o harness ganhou o quinto veredito `ESCRITA_VALIDACAO`, provado por contrafactual (reprova com `1:E{"digest":"3871214289"}` quando a guarda volta a `throw`). **O SC4 da Phase 2 deixou de ser insatisfazível por construção.** Continua aberto o que código não fecha: ninguém VIU o aviso âmbar na tela — é item do UAT humano e só o owner marca

  3. **FECHADO NO 01-15** — WR-02 e WR-08. A default privilege passou a cobrir FUNCTIONS, e a prova empírica exigida pelo plano **reprovou o conserto na primeira tentativa**: o SQL que o code review e o plano prescreviam (`... in schema public revoke all on functions from public`) é um no-op nomeado pela própria doc do PostgreSQL 17 ("per-schema default privileges can only add, not remove, global privileges"). A forma global foi aplicada (migration `20260722183153`, ledger 19 = 19 arquivos) e o buraco foi medido pelos dois lados: função descartável criada ANTES respondia `HTTP 200` com o próprio retorno a `POST /rest/v1/rpc/<nome>` com a chave publicável; a criada DEPOIS responde `42501 permission denied`. `service_role` preservado (suíte de integração verde). O harness `verificar-superficie-anon.sh` deixou de classificar qualquer não-200 como esperado — exige `42501`, reprova nome de tabela ausente dos schemas declarativos e reprova tabela declarada sem checagem (veredito `COBERTURA`), com as três reprovações vistas VERMELHAS antes do commit. **Consequência para a fase: o script volta a ser evidência FORTE** — o 01-12 o havia rebaixado a sinal fraco justamente por causa do WR-08

  4. **FECHADO NO 01-14** — CR-03, o furo de isolamento entre tenants que sobrou depois de a Data API ser fechada. `slug` e `slug_gratuito` são lidos pela MESMA URL: são dois membros de um namespace só, e o namespace não tinha dono. O tenant A gravava em `slug` o `slug_gratuito` de B — que é o link que B divulga depois de um downgrade — e a página de A passava a ser servida no link de B, com os agendamentos de B (nome e telefone de clientes finais) caindo na base de A. Fechado em três camadas, porque a de baixo não expressa a regra sozinha (a colisão é ENTRE LINHAS): `UNIQUE` em `slug_gratuito` (migration `20260722185755`, ledger **20 versions = 20 arquivos**), checagem cruzada em `salvarPerfilEmpresa` antes do upsert, e recusa de resolução ambígua em `resolverPerfilPublicoPorSlug` (as duas buscas passam a ser feitas sempre, em paralelo). **As duas camadas foram vistas VERMELHAS separadamente**: com o fallback encadeado restaurado, o teste devolveu o perfil do sequestrador com o nome dele no corpo; com a constraint derrubada do banco, o INSERT duplicado passou. Pré-voo obrigatório rodado antes do DDL — duas consultas, as duas vazias. `verificar-superficie-anon.sh` continua 11/0 com cobertura 9/9

  5. **FECHADO NO 01-16** — WR-07, o último da rodada e o único com decisão de produto de verdade. `obterPlanoVigentePublico` tratava **qualquer** erro de leitura como `'gratuito'`, e nesta fase isso deixou de ser detalhe: como `resolverPerfilPublicoPorSlug` compara o slug acessado com o slug EFETIVO do plano, uma falha de leitura de trinta segundos fazia `/book/<slug-customizado>` responder **404** para os clientes de um tenant Pro — sem alerta, sem evento, e sem ninguém para reclamar, porque cliente final não reclama de página que não abriu. O retorno virou `{ plano, degradadoPorErro }`, separando "não consegui LER a assinatura" de "este tenant não TEM assinatura" (que é condição de negócio e continua muda, para o detector não morrer de ruído). A saída **(B)** do plano foi implementada com a assimetria escrita junto do código: **permissivo na disponibilidade** (com o plano indeterminado, aceita `perfil.slug` ou `perfil.slug_gratuito`) e **restritivo no que é pago** (cor, logo e capa forçados a nulo — com o RLS bypassado por D-02, essa sanitização é a defesa ÚNICA do 01-UI-SPEC §29). O webhook de lembrete parou de confundir transitório com definitivo: `plano_indeterminado` vira `status: 'falha'` + **500** para o QStash retentar (seguro porque nenhuma mensagem foi enviada ainda, então retry não duplica), enquanto `plano_sem_whatsapp` continua `ignorado` + 200. **Ameaça aceita e nomeada (T-01-16-06)**: durante a janela, tenant recém-rebaixado tem o slug customizado antigo resolvendo — transitório, sem dado de terceiro, sem nada pago na tela; reverter é apagar um bloco `if`, e o reporte ao Sentry sobrevive nas duas escolhas. Suíte hermética nova (`assinaturas.test.ts`, 11 casos, com asserção NEGATIVA de que o contexto do reporte não carrega identificador nem `.message` do Postgres) e 5 casos novos de integração, os dois centrais vistos VERMELHOS antes do código. Contagens: 217 → 228 herméticos, 8 → 13 de integração; os três harnesses da fase continuam 0 reprovações

Escopo aprovado pelo owner nesta sessão inclui ainda quatro achados do code review: CR-03 (`slug_gratuito` sem UNIQUE → sequestro de link público entre tenants, com PII de cliente final) em 01-14; WR-02 (default privileges não cobre FUNCTIONS) e WR-08 (harness de superfície com falso verde) em 01-15; WR-07 (`assinaturas.ts` degrada tenant pago a gratuito) em 01-16. WR-01, WR-03, WR-04 e WR-06 ficaram fora, diferidos com razão e gatilho escritos no 01-13.

Ordem de execução, serialização estrita (um plano por wave): 01-10 → 01-11 → 01-12 → 01-13 → 01-15 → 01-14 → 01-16

Continua aberto também o **UAT humano** (7 itens, só o owner pode fechar). Os dois com prognóstico negativo — "Recuperação de double-booking na tela" e "Caixa de erro de slots na tela" — deixaram de ter o caminho de dados quebrado embaixo; agora dependem só de alguém olhar a tela
Last activity: 2026-07-23

Progress: [████████░░] 80% (19/19 planos executados; a 4ª verificação (HEAD `7937aed`) mediu os cinco Success Criteria DIRETAMENTE e todos passaram — o GOAL está alcançado. Dos 3 gaps que não falsificavam nenhum SC, **CR-02 e WR-03 foram corrigidos** no fechamento e **CR-01 ficou como dívida deferida** (instrumento de harness, não vulnerabilidade). **Phase 01 marcada COMPLETA** em 2026-07-23, aceitando o gap não-bloqueante)

### Resultado da 4ª passagem de verificação (2026-07-22, HEAD `7937aed`)

Primeira verificação das quatro com acesso DDL ao banco de dev — os cinco Success Criteria foram medidos por HTTP/psql, não herdados de SUMMARY nem de exit code de harness:

- **SC1** (`perfis_empresas` não enumerável): anon `select=*`/`tenant_id`/`telefone_contato` → **401/42501**, controle positivo sob `service_role` devolve a linha
- **SC2** (POST anônimo rejeitado + booking intacto): `agendamentos`/`clientes` → 401/42501; travessia 7/7, grade legítima `dur=30` completa em 890 ms, `pnpm test` 235/235
- **SC3** (colunas mínimas): `cliente_id`/`motivo`/`data_hora`/`servico_id` → 401/42501 (anon não lê coluna nenhuma das duas tabelas)
- **SC4** (objeto novo nasce fechado): **exercitado** — `sonda_sc4_*` tabela+função criadas como `postgres`, `anon`/`authenticated` f/f/f, `service_role` t/t/t, por `has_*_privilege` e por HTTP; objetos removidos
- **SC5** (webhook assinado + boot fail-fast): veredito `WEBHOOK` 401×3 + 200 controle, veredito `MORTE` (código 1 + porta recusando), `QSTASH_NEXT_SIGNING_KEY` na lista de obrigatórias

**Os 2 gaps da 3ª rodada fecharam e foram re-medidos** (harness de alvo-morto sai 2; DoS `-5000000` → 9-10 ms / 109 bytes). No fechamento da Phase 01 os 3 gaps que a 4ª verificação reproduziu foram todos dispositados — **CR-02 e WR-03 corrigidos, CR-01 deferido como dívida**. Nenhum falsificava um SC:

1. **CR-01 — DÍVIDA DEFERIDA:** `verificar-superficie-anon.sh` dá falso-verde em alvo parcialmente aberto: stub com `perfis_empresas` fechada e as outras 7 tabelas reabertas a `anon` mas vazias (`200 []`) → exit **0** com `4 com prova positiva, 0 reprovada(s)` e a frase de fechamento. É o instrumento quebrado, não vulnerabilidade — os SC foram provados por medição DDL direta, não por esse exit code. Regra registrada em `PENDENCIAS.md`: não citar o script como prova de fechamento até o conserto (cobertura por tabela + veredito `ALVO_PARCIAL` no controle). **Não é gap aberto — é dívida com gatilho.**
2. ~~**CR-02** — escrita pública sem teto de campo~~ **RESOLVIDO no fix 738a896**: `criarAgendamentoPublico` passou a recusar, antes de `createAdminClient()`, nome fora de 1..120 chars e e-mail (opcional) sem formato válido ou acima de 254 chars (`email_invalido`). Prova hermética em `public-booking-validacao.test.ts` (createAdminClient não é chamado na recusa). Resta espelhar o CHECK no banco (`06_clientes.sql`) — fora do escopo deste fix, anotado no `missing` do `01-VERIFICATION.md`
3. ~~**WR-03** — PENDENCIAS descrevia o mundo pré-fase~~ **RESOLVIDO** (commit `8605962`): a frase em `docs/PENDENCIAS.md` que afirmava que o INSERT direto pela Data API contorna a action foi corrigida — as migrations `20260722060000`+`20260722055941` revogaram a Data API de `anon` (anon POST → 42501), o que a torna falsa. Definition of Done §6 satisfeita.

8 itens de verificação humana (7 UAT de tela + rotação de chave do owner) seguem ABERTOS, não marcados

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Atualizado após cada plano concluído*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01 P01 | 46min | 2 tasks | 4 files |
| Phase 01 P03 | ~25min | 3 tasks | 9 files |
| Phase 01 P02 | ~12min | 3 tasks | 5 files |
| Phase 01 P04 | ~35min | 3 tasks | 8 files |
| Phase 01 P05 | ~45min | 3 tasks | 1 files |
| Phase 01 P07 | ~28min | 3 tasks | 4 files |
| Phase 01 P06 | ~50min | 2 tasks | 5 files |
| Phase 01 P08 | ~22min | 3 tasks | 3 files |
| Phase 01 P09 | ~35min | 3 tasks | 5 files |
| Phase 01 P10 | ~33min | 2 tasks | 6 files |
| Phase 01 P11 | ~35min | 2 tasks | 2 files |
| Phase 01 P12 | 17min | 3 tasks | 6 files |
| Phase 01 P13 | ~30min | 2 tasks | 3 files |
| Phase 01 P15 | ~50min | 2 tasks | 3 files |
| Phase 01 P14 | ~35min | 3 tasks | 5 files |
| Phase 01 P16 | ~65min | 2 tasks | 7 files |
| Phase 01 P17 | ~25min | 2 tasks | 2 files |
| Phase 01 P18 | ~31min | 2 tasks | 5 files |
| Phase 01 P19 | ~30min | 3 tasks | 2 files |
| Phase 02 P01 | 5min | 2 tasks | 2 files |

## Accumulated Context

### Decisions

Log completo em PROJECT.md (Key Decisions). Decisões que governam o trabalho atual:

- **Roadmap**: estrutura por camadas técnicas, 12 fases, ordenadas por valor decrescente para que qualquer corte caia no item menos crítico
- **Roadmap**: barra mínima para abrir = Phases 1-5, 7, 10, 11, 12. Adiáveis nesta ordem: 6 (diferencial), 8 (autonomia do cliente), 9 (cobrança — contorno é upgrade manual por SQL)
- **Roadmap**: DIF-01/DIF-02 antecipados ao checkout por decisão do owner ("uso real vale mais que receita neste milestone")
- **Roadmap**: AUT-01 a AUT-09 promovidos de v2 para v1 — table stake que toda a concorrência entrega
- **Rede de proteção do banco removida do v1 (2026-07-21)**: o banco atual não é produção e migration destrutiva está autorizada pelo owner; o Pro (backup diário, sem pausa) entra quando o sócio aprovar. Volta a ser obrigatória quando existir dado de terceiro — condição escrita no ROADMAP.md e no PROJECT.md
- **Hardening antes do checkout**: rate limit na Server Action é teatro enquanto o INSERT `anon` existir
- [Phase ?]: apply_migration do MCP não preserva a version do arquivo — toda aplicação exige corrigir version/name por DML no ledger em seguida (01-04 aplica mais duas)
- [Phase ?]: Prova de leitura privilegiada por contrafactual de slug: /book/<slug-pago> 200 E /book/<slug_gratuito> 404 — um 200 sozinho não distingue os dois mundos
- [Phase ?]: Assinatura do QStash substitui conferencia de secret em query string no webhook de lembrete
- [Phase ?]: Chaves de assinatura lidas na chamada, nunca em constante de modulo
- [Phase ?]: url: req.url preserva os lembretes ja enfileirados com query string
- [Phase ?]: Leituras publicas por slug: o browser manda slug, o servidor devolve tenant_id — resolverPerfilPublicoPorSlug e a porta unica das tres funcoes publicas
- [Phase ?]: Projecao explicita por constante de modulo no caminho publico: com service role no caminho, pedir a linha inteira e vazamento por omissao (coluna nova entra sozinha no payload)
- [Phase ?]: tenantHash continua derivado do org_id cru no servidor — derivar do slug trocaria a chave do funil e partiria a serie do PostHog
- [Phase ?]: Fallback silencioso em leitura publica e bug: obterSlotsPublicos com slug nao resolvido lanca, em vez de calcular grade com fuso e regras padrao
- [Phase ?]: Default privileges revogadas para anon E authenticated: tabela nova nasce fora da Data API; custo aceito é migration manual de GRANT por tabela, a partir da Phase 7
- [Phase ?]: Saída de supabase db diff é rascunho, não artefato: forçado a diffar privilégio o migra gera o CONTRÁRIO (revoke service_role em tudo, grant truncate a anon) — privilégio mora em migration escrita à mão
- [Phase ?]: mcp__supabase__apply_migration está proibido: o método correto é execute_sql para o DDL + INSERT manual no ledger com a version do arquivo (duas confirmações, 01-01 e 01-04)
- [Phase ?]: supabase db diff sobe shadow database em Docker — única exceção de container do projeto, exige aprovação prévia (CLAUDE.md §Infraestrutura)
- [Phase ?]: Assuncao A1 refutada: sem env obrigatoria o boot do Next 16 NAO mata o processo — ele segue escutando e responde 500 em toda rota; healthcheck de deploy precisa ser por HTTP, nunca por liveness de processo
- [Phase ?]: Criterio 5 satisfeito na substancia por duas camadas (app nao serve nada + verificarAssinaturaQstash lanca sem chave), registrado como insatisfeito na forma — mudar semantica de boot e decisao de arquitetura, nao improviso de plano de verificacao
- [Phase ?]: Policies residuais de servicos/horarios_funcionamento registradas e nao fechadas: migration nao aplicavel criaria drift 18 arquivos x 17 versions no ledger; o conserto futuro e DROP puro, a substituta 1b ja existe
- [Phase ?]: Assertiva de vazamento por PADRAO e nao por substring: grep 'org_' falseia em producao por causa da baggage do Sentry (sentry-org_id=N)
- [Phase ?]: [Phase 01]: pnpm test hermetico por desenho — suite de integracao fora do glob padrao do vitest, opt-in por EXIGIR_INTEGRACAO=1 com dono unico no script test:integracao; contagem que NAO cresce (13 arquivos / 196 testes) e a prova, nao o sintoma
- [Phase ?]: [Phase 01]: Suite que toca banco reprova em vez de pular — sentinela que nunca e pulada + banner em stderr; pulo silencioso e como o gap volta sem ninguem ver
- [Phase ?]: [Phase 01]: Acoplamento por substring entre modulos nao importaveis juntos e pinado por assercao de FONTE (o teste le BookingApp.tsx do disco) derivada de uma constante unica
- [Phase ?]: [Phase 01]: Horario do agendamento de teste sai da propria engine (obterSlotsPublicos), nunca de literal cravado — e o que exercita a validacao por igualdade exata em vez de contorna-la
- [Phase ?]: [Phase 01]: CAMINHO_ENV_LOCAL e o mecanismo de provar a sentinela sem mover, renomear ou escrever no .env.local real; a falha e por AUSENCIA e so os NOMES das variaveis aparecem na saida
- [Phase ?]: [Phase 01]: Boot de producao encerra de verdade (process.exit(1)) quando falta env obrigatoria — guardado por NODE_ENV=production e por NEXT_RUNTIME==='nodejs'; no edge o comportamento anterior (relancar) e preservado
- [Phase ?]: [Phase 01]: Harness de boot mede o status DO SERVIDOR — set -m para o job ganhar grupo de processos proprio, wait no PID capturado em $!, curl 7 (recusa de conexao) como asserção de porta morta; setsid proibido porque $! deixaria de ser o servidor
- [Phase ?]: [Phase 01]: Harness nasce ANTES do conserto e a primeira execucao tem de REPROVAR — harness escrito depois nunca prova que mediria a falha
- [Phase ?]: [Phase 01]: Complemento de env identico nas duas execucoes do harness: quatro das quatorze obrigatorias nao existem no .env.local, e sem injeta-las o CONTROLE seria impossivel e a mensagem do MORTE listaria cinco nomes em vez de um
- [Phase ?]: [Phase 01]: Tres diagnosticos de Edge Runtime (process.stderr/process.exit em env.ts) registrados em PENDENCIAS, nao silenciados — aliasar process por globalThis esconderia o sinal em vez de resolve-lo
- [Phase ?]: [Phase 01]: Policies PERMISSIVAS se somam por OR — uma policy compartilhada sem clausula de tenant ANULA o escopo da tenant-scoped que convive com ela; foi como servicos/horarios_funcionamento vazavam catalogo e tenant_id cross-tenant para toda conta logada
- [Phase ?]: [Phase 01]: Prova de RLS sem navegador — transacao revertida com set_config('request.jwt.claims') + set local role authenticated, e um tenant vizinho DESCARTAVEL criado dentro da propria transacao quando o banco de dev tem um tenant so; converte veredito INCONCLUSIVO em conclusivo sem persistir nada
- [Phase ?]: [Phase 01]: Nao-regressao de dashboard depois de DROP POLICY se mede pela linha INATIVA do proprio tenant — as ativas passavam pelas duas policies e nao distinguem nada; a inativa e o unico caso que a 1b cobre a mais e o que sustenta reativar servico e o RETURNING
- [Phase ?]: [Phase 01]: DDL e INSERT no ledger emitidos numa UNICA chamada de execute_sql, portanto na mesma transacao — fecha a janela de desalinhamento repo/ledger que o procedimento em dois passos deixava aberta
- [Phase ?]: [Phase 01]: Gap closure escreve documento so depois da prova — as quatro provas (superficie anon, fail-fast de boot, escrita do booking, Definition of Done) rodaram sobre o HEAD final antes do primeiro Edit; criterio que le como satisfeito enquanto a medicao diz o contrario foi o defeito que queimou a fase uma vez
- [Phase ?]: [Phase 01]: Correcao de requisito preserva o historico do erro — SEG-05 vira [x] mas registra que a segunda metade foi medida como falsa e por qual plano foi fechada, com o harness nomeado
- [Phase ?]: [Phase 01]: Item de UAT parcialmente coberto diz PRIMEIRO o que a automacao NAO cobre; nenhum executor pode marcar item de UAT, e a contagem 7 abertas / 0 marcadas em PENDENCIAS e o controle automatizado disso
- [Phase ?]: [Phase 01]: Hermeticidade do pnpm test virou regra viva em docs/PENDENCIAS.md — test:integracao e o unico ponto de entrada da suite que toca o banco, e reincluí-la no glob padrao faria toda Definition of Done futura escrever no Supabase de dev
- [Phase ?]: Erro esperado de Server Action e valor de retorno discriminado, nunca throw: em build de producao o React so transporta o digest (medido: 1:E{"digest":"2760064589"}). throw so vale onde nenhum catch de cliente consome a .message
- [Phase ?]: Copia de UI publica mora no cliente numa constante unica que alimenta a tela e a assercao de teste — copia divergente fica impossivel por construcao (src/app/book/[slug]/mensagens.ts)
- [Phase ?]: Harness de fronteira de flight: o id da Server Action e sempre derivado de .next/server/server-reference-manifest.json, nunca literal — id colado a mao sobrevive a refatoracao que o invalida e deixa o harness verde para sempre
- [Phase ?]: 01-11: a guarda de QSTASH_CURRENT_SIGNING_KEY foi preservada com papel novo — não monta mais a URL, só recusa publicar lembrete que o webhook depois não conseguiria autenticar
- [Phase ?]: 01-11: SEG-05 NÃO foi marcado como concluído — a metade criptográfica está fechada, mas a chave já circulou e a rotação é ação do owner rastreada no 01-13
- [Phase ?]: 01-12: duas superficies de UI com copias diferentes para o mesmo discriminante exigem DOIS mapeadores exaustivos — um mapeador so obrigaria a reescrever copia travada
- [Phase ?]: 01-12: erro_interno colapsa as tres falhas de infra numa copia so para o visitante; a distincao sobrevive no etapa do reportarExcecao, que e quem precisa dela
- [Phase ?]: 01-12: veredito novo de harness so entra depois de provado por contrafactual — reverter o conserto e ver REPROVADO com o digest opaco
- [Phase ?]: [Phase 01]: Risco que sobrevive a uma fase só existe se estiver escrito com dono e prazo — a rotação das signing keys do QStash virou item datado (2026-08-05) em docs/PENDENCIAS.md, nascido ABERTO, porque só o owner mexe no painel da Upstash
- [Phase ?]: [Phase 01]: Correção de decisão registrada é anotação datada e atribuída, nunca reescrita — o deferimento do parâmetro na URL do QStash (01-CONTEXT.md) mantém o texto original e ganha ao lado a medição que o refuta (route.ts:30 verifica contra req.url)
- [Phase ?]: [Phase 01]: Drift de documentação fora do files_modified do plano é REGISTRADO com a medição que o refuta, não corrigido em silêncio nem ignorado — docs/09:124-125 e os JSDoc de src/lib/observabilidade ficaram em docs/PENDENCIAS.md com gatilho
- [Phase ?]: [Phase 01]: 01-15: default privilege de FUNCTIONS tem de ser GLOBAL — a doc do PostgreSQL 17 nomeia 'ALTER DEFAULT PRIVILEGES IN SCHEMA ... REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC' como comando INEFICAZ (por-schema so ADICIONA, nunca REMOVE privilegio global); o SQL prescrito pelo code review e pelo plano foi aplicado, medido e reprovado
- [Phase ?]: [Phase 01]: 01-15: prova de privilegio de funcao e dupla — catalogo (has_function_privilege) E rede (POST /rest/v1/rpc/<nome> com a chave publicavel); o contrafactual foi HTTP 200 devolvendo o retorno na funcao criada ANTES do conserto contra 42501 na criada DEPOIS
- [Phase ?]: [Phase 01]: 01-15: no harness de superficie, nome de tabela desconhecido REPROVA em vez de ficar inconclusivo — inconclusivo nao derruba exit code, e o defeito do WR-08 e exatamente a checagem que fica verde para sempre
- [Phase ?]: [Phase 01]: 01-15: veredito COBERTURA obriga toda tabela declarada em supabase/schemas a aparecer em alguma checagem; lista derivada da fonte da verdade com piso de sanidade que aborta (codigo 2) em vez de ficar verde
- [Phase ?]: [Phase 01]: 01-14: slug e slug_gratuito sao UM namespace publico, nao duas colunas — a regra de unicidade vale sobre o namespace e a colisao entre elas e ENTRE LINHAS, portanto fora do alcance de qualquer constraint; fecha em tres camadas (UNIQUE no banco, checagem na action, recusa de ambiguidade no resolver)
- [Phase ?]: [Phase 01]: 01-14: checagem cross-tenant sob RLS e decorativa por construcao — a policy do proprio tenant faz a consulta voltar SEMPRE vazia; usa createAdminClient com projecao de uma coluna e head:true, e o que sai e o veredito, nunca o dado do vizinho
- [Phase ?]: [Phase 01]: 01-14: constraint nomeada perfis_empresas_slug_gratuito_key (padrao <tabela>_<coluna>_key) e nao o uq_ sugerido pelo review — e o nome que o Postgres da a um UNIQUE inline, e e o que impede db diff futuro de propor dropar e recriar
- [Phase ?]: [Phase 01]: 01-14: desambiguar slug usa duas consultas .eq() em paralelo, nunca or() interpolando o slug do visitante — filtro do PostgREST montado com dado de URL e injecao de filtro
- [Phase ?]: [Phase 01]: 01-14: no teste do sequestro, a assinatura pro do tenant vizinho E parte da prova — sem plano com link personalizado o sequestro nem acontece e o caso ficaria verde sem provar nada
- [Phase ?]: [Phase 01]: 01-16: falha de infraestrutura e condicao de negocio nunca colapsam no mesmo valor de retorno — obterPlanoVigentePublico devolve { plano, degradadoPorErro }; o padrao conservador continua, mas vem com a confissao de quanto se sabe
- [Phase ?]: [Phase 01]: 01-16: fail-open/fail-closed decidido por EIXO e nao por funcao — permissivo na disponibilidade (o link publico fica no ar), restritivo no que e pago (cor/logo/capa forcados a nulo); provar so um dos lados era a armadilha
- [Phase ?]: [Phase 01]: 01-16: HTTP 500 para retry so e seguro ANTES da primeira tentativa de envio — plano_indeterminado devolve 500 porque nenhuma mensagem saiu; depois de uma tentativa, retry vira duplicacao de mensagem (WR-06)
- [Phase ?]: [Phase 01]: 01-16: sanitizacao forcada e escrita EXPLICITAMENTE mesmo quando o valor corrente ja a implica — depender de o padrao conservador ser 'gratuito' faria de qualquer mudanca futura desse padrao um vazamento de recurso pago
- [Phase ?]: [Phase 01]: 01-16: comentario nao repete o token que um grep-guard da fase vigia — prosa citando tenantId cega a guarda que deveria pegar o vazamento; duas contagens derivaram por isso e os comentarios foram reescritos
- [Phase ?]: [Phase 01]: 01-16: falha que o banco nao sabe produzir sob demanda e injetada na FRONTEIRA da funcao (mock parcial de assinaturas), preservando linhas reais no resto da suite — a alternativa era revogar privilegio no banco compartilhado no meio da suite
- [Phase 01]: 01-17: exit 0 de harness de seguranca exige PROVA POSITIVA, nunca ausencia de reprovacao — contra alvo mudo, 'nenhuma reprovacao' e 'nenhuma medicao' produzem o mesmo relatorio; o contador ESPERADAS decide o exit code, senao seria mais um numero impresso e descartado como INCONCLUSIVAS era
- [Phase 01]: 01-17: fechamento se prova por PAR, nunca por sonda unica — referencia declarada respondendo 42501 (host respondeu, e PostgREST, o portao do Postgres se pronunciou) + canario inexistente respondendo PGRST205; indistinguiveis, sai 2, porque 'fechado' e 'nao e este banco' sao a mesma resposta para quem so olha tabelas que existem
- [Phase 01]: 01-17: identidade do alvo e veredito de BATERIA (add-alongside, ao lado de COBERTURA) — nao conta como checagem, nao alimenta o contador de prova positiva, e roda SEMPRE inclusive com filtro: escopo reduzido dispensa cobertura, nunca identidade
- [Phase 01]: 01-17: o canario tem guarda propria que aborta com 2 se o nome passar a constar dos schemas declarativos — canario que existe nao distingue nada, e a guarda foi vista FALHANDO (canario=assinaturas) antes de a constante ser revertida
- [Phase 01]: 01-17: o terceiro eixo de falso verde (alvo que nega TUDO uniformemente — gateway hostil, proxy autenticando na frente, rate limit em 401) nao estava no code review nem no relatorio de verificacao; sem o veredito TUDO_NEGADO o conserto fecharia um eixo e abriria outro pela terceira vez
- [Phase ?]: [Phase 01]: 01-18: validacao de entrada na fronteira da Server Action publica vem ANTES de createAdminClient() e da resolucao do slug — a ordem e a diferenca entre recusar de graca e recusar depois de pagar duas consultas, e e provada por asserção NEGATIVA (ausencia de slug_invalido no corpo), nunca so pelo discriminante esperado
- [Phase ?]: [Phase 01]: 01-18: o invariante mora em DOIS lugares — fronteira da action (porteiro, recusa antes de I/O) e funcao pura exportada (contrato que um terceiro chamador futuro herda); guarda so na action deixaria gerarSlotsAntiBuraco desprotegida
- [Phase ?]: [Phase 01]: 01-18: vista estreita de uniao fechada e alias PROPRIO (MotivoSlotsPublicos), nunca alargamento do alias do vizinho — MotivoLeituraPublica descreve o que a resolucao de perfil produz, e ela nao sabe produzir data_invalida nem servico_invalido
- [Phase ?]: [Phase 01]: 01-18: teto de duracao (1440 min) e seguro por construcao, nao restricao de produto — janelas de funcionamento sao horas dentro de um dia, entao duracao acima disso ja devolvia lista vazia silenciosa; o teto troca a lista vazia por discriminante honesto, com CONTROLE POSITIVO provando que a grade legitima nao mudou
- [Phase ?]: [Phase 01]: 01-18: entrada hostil de visitante nao e logada nem reportada ao Sentry — e condicao esperada, e logar cada uma transformaria o mesmo endpoint anonimo num vetor de inundacao de log
- [Phase 01]: 01-19: a medição de pg_default_acl foi reexecutada nesta sessão pelo MCP da Supabase, com identidade do alvo conferida antes — o docs/03 registra medição própria (HEAD f473437) concordante com a do adendo (HEAD 8edb32d), em vez de citar medição de terceiro
- [Phase 01]: 01-19: a condição que sustenta a citação do exit 0 do harness anônimo foi escrita nos TRÊS pontos onde o PENDENCIAS o cita, não só na seção nova — quem remover scripts/verificar-controle-harness-anon.sh remove o direito de citar o exit code
- [Phase 01]: 01-19: os dez warnings da 2ª rodada de review entraram no PENDENCIAS como ponteiros (rótulo + uma linha + seção), sem conserto proposto, e a colisão de rótulos WR-* entre a 1ª e a 2ª rodada foi resolvida por escrito com o comando que recupera o relatório antigo do git
- [Phase 01]: 01-19: escapada de plataforma aceita com registro (T-01-19-02) — tabela criada por supabase_admin herda anon/authenticated; item aberto com dono (quem habilitar a extensão) e gatilho (próxima habilitação), sem conserto preventivo
- [Phase ?]: 02-01: engine deriva ocupação de data_hora_fim (D-02); join servicos + fallback || 30 removidos — fecha AGE-01/AGE-02
- [Phase ?]: 02-01: agendamento que cruza a meia-noite soma 1440*diffDias ao end (Pitfall 4), em vez de clampar

### Pending Todos

Nenhum ainda.

### Blockers/Concerns

- ✅ **RESOLVIDO 2026-07-21 — DNS do subdomínio de e-mail.** `mail.vamoagendar.com.br` verificado no Resend, DKIM propagado (conferido por `dig`). Deixou de bloquear a Phase 4. Remetente: `naoresponda@mail.vamoagendar.com.br`. Restam dois TXT opcionais do owner: DMARC `p=` com `rua` e SPF do subdomínio — nenhum impede enviar
- **Nenhum endereço do domínio recebe e-mail** (sem MX na raiz e no subdomínio). O `suporte@`/`contato@` da Phase 10 exige provedor de caixa próprio — o Resend só envia. Decisão adiada por escolha do owner em 2026-07-21
- **Aprovação da conta Asaas para produção**: dependência externa sem prazo, fora do controle do owner. Não bloqueia a construção (sandbox), bloqueia ATI-02 na Phase 12
- **Upgrade para Supabase Pro**: depende de aprovação do sócio, sem data. Não bloqueia nenhuma fase, mas é a condição para haver dado de terceiro no banco — sem ele, `pg_dump` antes de migration destrutiva volta a ser obrigatório
- **Decisão pendente do owner** (Phase 3): Upstash Redis vs. RPC atômica no Postgres para o rate limit; o Redis do Railway não serve (TCP, pertence à Evolution API)
- **Revisão jurídica humana** dos termos e da política antes de publicar (Phase 10) — menor confiança de toda a pesquisa
- **Precedência de lookup** quando telefone e e-mail batem em clientes diferentes: decidir na Phase 5, não descobrir em produção
- 🚨 **Janela de crash-loop aberta agora (quick task 260721-jif).** A lista de treze variáveis obrigatórias em produção já está valendo no `master`. Deploy de produção **antes** de provisionar `ANALYTICS_TENANT_SALT`, `NEXT_PUBLIC_SENTRY_DSN` e `RESEND_API_KEY` no Railway derruba o boot de propósito. É o comportamento pedido (OPE-02 e SEG-05 dependem dele), mas o intervalo entre merge e configuração é risco real. Duas saídas escritas em `docs/PENDENCIAS.md`: provisionar antes, ou remover as quatro da lista no mesmo commit do deploy
- ✅ **RESOLVIDO no 01-02 — `pnpm build` não rodado no 01-01.** Os três comandos da Definition of Done rodaram verdes sobre o HEAD do 01-02: lint exit 0, 196 testes, build exit 0 com 14 páginas
- UAT do wizard completo de /book/avantis pendente (regressão obrigatória do CONTEXT §specifics); o contrafactual de slug prova só a leitura do plano — **agravado pelo 01-02**, que trocou o identificador recebido pelas duas actions públicas (`tenantId` → `slug`). Escopo do 01-05
- Caixa de erro de slots nunca vista renderizando a copy nova do 01-02 ("Não foi possível carregar os horários. Tente de novo."); teste barato no UAT do 01-05: chamar `obterSlotsPublicos('slug-inexistente', …)`
- UAT do dashboard sob as policies tenant-scoped novas do 01-04 (agenda, agendamento manual com RETURNING, exceção de agenda, perfil) — Pitfall 3: policy substituta errada deixa a tela VAZIA sem estourar erro. Escopo do 01-05
- UAT humano da Phase 1 NAO EXECUTADO (7 itens: wizard completo, double-booking, dashboard tela a tela, personalizacao Pro x gratuito, lembrete QStash ponta a ponta, caixa de erro de slots, backstops visuais). Checklist com o motivo de cada um em docs/PENDENCIAS.md secao 'UAT humano pendente da Phase 1'. Owner ausente na execucao do 01-05 — registrado como pendente, nunca aprovado
- ✅ **RESOLVIDO no 01-08 — as duas policies de SELECT {anon,authenticated} com USING (ativo = true).** Removidas do banco e do schema declarativo pela migration `20260722145948_fecha_policies_residuais_servicos_horarios.sql`. Medido sob role `authenticated` com claim `org_id` em transação revertida: **2 tenants distintos visíveis antes, 1 depois**; a linha INATIVA do próprio tenant continua visível (a `1b` cobre, o `RETURNING` não regrediu). Ledger em 18 versions = 18 arquivos. A edição de `docs/PENDENCIAS.md` foi feita no 01-09: a seção "Superfície remanescente" e o bloco 🔴 de enumeração de `org_id` estão marcados como fechados, com migration, version e evidências
- Dashboard nunca percorrido à mão sob o regime pós-DROP do 01-08 — em especial **reativar um serviço inativo**, que é o caso que a prova SQL cobre no banco e não na tela (Pitfall 3: policy quebrada degrada em silêncio). Entra no UAT humano da Phase 1
- Rotação das signing keys do QStash no painel da Upstash (ação do owner, depois de a fila secar em ≤ 14 dias) — sem ela, a chave que já circulou continua válida. Item datado no 01-13
- **Custo colateral aceito no 01-15 (não é bloqueador, é aviso para as fases 2, 7 e 9):** a revogação de `EXECUTE` para `PUBLIC` em funções futuras é **global** por obrigação do Postgres (por-schema não remove privilégio global). Consequência: função criada pelo role `postgres` em **qualquer** schema — extensão inclusive — nasce sem `EXECUTE` para `PUBLIC`, e chamá-la por `anon`/`authenticated` exige `GRANT EXECUTE` explícito. A falha é alta e clara (`permission denied for function ...`), nunca silenciosa; a regra e o checklist estão em `docs/03` §"Privilégios da Data API"

- **Ponto de atenção do 01-14 (não é bloqueador, é aviso para revisão futura de privilégio):** `salvarPerfilEmpresa` passou a usar `createAdminClient()` numa consulta — é a única forma de a checagem cruzada entre tenants não ser decorativa (sob RLS ela voltaria sempre vazia). O escopo é mínimo: projeção de UMA coluna (`tenant_id`), `head: true` e `.neq('tenant_id', orgId)`, e o que sai da função é o veredito. Ainda assim é um ponto a mais onde o cliente privilegiado aparece **fora** do fluxo público, e merece o olho de qualquer revisão de privilégio
- **Dívida aceita e datada por gatilho no 01-14:** a decisão `add-alongside` (duas colunas + constraint + duas camadas de aplicação) **não** cobre manter mais de um alias vivo (redirecionar link antigo depois de trocar o slug) nem um terceiro identificador público (domínio próprio, alias por campanha). Qualquer um dos dois virar requisito força a **promoção** para uma tabela de identificadores públicos — nunca uma terceira coluna. A Phase 7 (fim do Plus) revisita a relação plano↔slug e é o momento natural de reavaliar

### Quick Tasks Completed

| # | Description | Date | Commit | Status | Directory |
|---|-------------|------|--------|--------|-----------|
| 260721-jif | Fundação operacional — Sentry, PostHog e Resend (etapa preparatória, pré-requisito da Phase 1) | 2026-07-21 | b80c408 | Needs Review | [260721-jif-fundacao-operacional-sentry-posthog-e-re](./quick/260721-jif-fundacao-operacional-sentry-posthog-e-re/) |
| 2 | Adiciona "type": "http" ao servidor Sentry em .mcp.json (elimina warning do /mcp) | 2026-07-21 | ddcda54 | — | — |

**Status `Needs Review`**: as 4 tarefas de código fecharam e foram verificadas (0 gaps,
`pnpm lint`/`test`/`build` verdes, 164 testes). Os dois checkpoints dependem do owner:

- **Gate 1** — criar projeto no Sentry e no PostHog Cloud, colar o bloco de
  `260721-jif-ENV-BLOCO.md` no `.env.example`, provisionar as treze obrigatórias no Railway.
  Retomar informando: se colou o bloco, a região do PostHog e os slugs de org/projeto do Sentry

- **Gate 2** — validar visualmente que evento chega no PostHog, erro chega no Sentry (e a issue
  não carrega PII) e o e-mail de smoke test chega na caixa, anotando a aba (insumo da Phase 4)

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Dívida de ambiente | `DEBUG_QSTASH=1` está no `.env.example` e provavelmente nos ambientes (Railway incluso). Já listada como dívida no `PROJECT.md`; remover de `.env.example` e dos ambientes. Não é escopo da Phase 1 | Aberto | 2026-07-21 |

## Session Continuity

Last session: 2026-07-23T16:24:09.523Z
Stopped at: Completed 02-01-PLAN.md
Resume file: None
