---
phase: 01-hardening-da-superf-cie-p-blica
verified: 2026-07-22T20:07:30Z
status: gaps_found
score: 11/13 must-haves verificados
behavior_unverified: 1
overrides_applied: 0
re_verification:
    previous_status: gaps_found
    previous_score: 7/9
    gaps_closed:
        - "Gap 1 — a chave HMAC saiu da URL publicada. Medido por leitura direta: `whatsapp-helper.ts:158` publica `${APP_URL}/api/webhooks/lembrete` sem query string, e `grep -rn 'secret=' src/ scripts/` só devolve comentários, testes e a sonda de regressão do harness de boot. Os quatro `console.error` que ecoavam corpo de gateway viraram `http_<status>` (linhas 95, 178, 224). O resíduo (a chave já circulou) ficou registrado com dono e prazo em `docs/PENDENCIAS.md:806` — data-limite 2026-08-05"
        - "Gap 2 — o erro esperado atravessa a fronteira de flight em build de PRODUÇÃO. Reproduzido por mim: `bash scripts/verificar-travessia-server-action.sh` → exit 0, 5 vereditos, 0 reprovados (PREPARO, CONTROLE, SLOTS_ERRO com `slug_invalido`, ESCRITA_VALIDACAO com `campos_obrigatorios`, SEM_VAZAMENTO). `BookingApp.tsx:282` decide por `res.motivo === 'slot_indisponivel'`; nenhum `.includes()` de mensagem restou. As três cópias contratadas no 01-UI-SPEC continuam byte a byte em `mensagens.ts:27,52,58`"
        - "Gap 3 — `docs/PENDENCIAS.md` coerente com o código: o item do webhook (:1200) está riscado com o comando que prova, e o item de rotação (:806) nasceu aberto, com dono e data. Contagem da seção de UAT conferida por comando: 7 abertas / 0 marcadas"
    gaps_remaining: []
    regressions:
        - "Nenhuma regressão de comportamento introduzida pela 2ª rodada. `pnpm lint` exit 0, `npx tsc --noEmit` exit 0, `pnpm test` 15 arquivos / 228 testes em 521 ms (hermético), `pnpm test:integracao` 13/13 em 8,40 s contra o Supabase de dev"
    novos_achados:
        - "CR-02 do 01-REVIEW.md REPRODUZIDO EMPIRICAMENTE por mim (não confirmado por leitura): o harness de superfície anônima sai 0 e imprime uma afirmação positiva de fechamento com as 11 checagens em HTTP 000. Vira gap bloqueante"
        - "CR-01 do 01-REVIEW.md REPRODUZIDO EMPIRICAMENTE POR HTTP contra build de produção, com slug público real e sem sessão: 26.751 ms de laço síncrono e 19,29 MB de resposta numa ÚNICA requisição anônima. Vira gap bloqueante"
gaps:
    - truth: "`scripts/verificar-superficie-anon.sh` — 'checagem que não prova nada não pode passar' (must-have do plano 01-15)"
      status: failed
      reason: >-
          MEDIDO, NÃO INFERIDO. Copiei o harness e `supabase/schemas/` para um diretório
          isolado, escrevi um `.env.local` apontando para um host Supabase inexistente e
          rodei o script sem tocar em mais nada. Resultado: as 11 checagens registraram
          `HTTP 000 sem 42501 — não provou permissão negada`, o veredito COBERTURA passou
          ("9 declarada(s), 9 coberta(s)"), e a última linha foi
          `Resumo: 11 checagem(ns), 0 reprovada(s) — a role anon não devolveu linha nenhuma.`
          com EXIT CODE 0. Uma afirmação positiva de segurança emitida a partir de zero
          medição.
          A causa está em `:398-401`: o exit code é decidido só por `REPROVADAS -eq 0`;
          `INCONCLUSIVAS` é impresso e descartado. O conserto do WR-08 foi real e eu o
          confirmei na mesma execução (o `000` virou INCONCLUSIVO, não ESPERADO — o eixo
          do NOME da tabela está fechado), mas o falso verde apenas mudou de eixo: o da
          IDENTIDADE DO ALVO segue aberto. O segundo cenário do review (projeto errado ⇒
          PGRST205 ⇒ `tabela_declarada` confere o nome contra arquivos LOCAIS ⇒ tudo
          ESPERADO) não precisei reproduzir, porque `:262-273` e `:319-329` são explícitos.
          Por que isto é gap e não aviso: este é o instrumento que o `ROADMAP.md:195` e o
          `01-04-PLAN.md:170` nomeiam como prova de SEG-01, SEG-02 e SEG-03, e o cabeçalho
          do próprio script promete o oposto do que ele faz. Sem controle positivo de alvo,
          o exit 0 dele não é evidência — e a fase inteira já foi queimada duas vezes por
          critério que lê como satisfeito enquanto a medição diz outra coisa.
          Não contamina as conclusões desta verificação: SC1, SC2 e SC3 foram
          remedidos por mim por caminho independente, com controle positivo de identidade
          do alvo (a mesma URL respondendo 200 com linhas reais sob `service_role`).
      artifacts:
          - path: "scripts/verificar-superficie-anon.sh"
            issue: "linhas 398-401 — o exit code ignora INCONCLUSIVAS e imprime frase de fechamento; não há controle positivo de identidade do alvo"
      missing:
          - "Contador `ESPERADAS`; se `ESPERADAS -eq 0`, sair 2 com 'nenhuma checagem produziu PROVA POSITIVA'"
          - "Controle de identidade do alvo: uma tabela sabidamente inexistente tem de ser DISTINGUÍVEL de uma tabela declarada e fechada; se forem indistinguíveis, sair 2"
          - "Enquanto isso não existir, nenhum documento do projeto pode citar o exit 0 deste script como prova de fechamento — só a leitura linha a linha do relatório"
    - truth: "A superfície pública anônima não entrega ao visitante um jeito de derrubar o processo com uma requisição"
      status: failed
      reason: >-
          MEDIDO POR HTTP CONTRA BUILD DE PRODUÇÃO, com slug público real (`avantis`), sem
          sessão, invocando a Server Action pelo id derivado do manifesto (`70efdce3…`),
          num dia com janela de funcionamento ativa (2026-07-27):

          duracaoMinutos=30        →     525 ms |      2.179 bytes
          duracaoMinutos=-100000   →   1.123 ms |    378.054 bytes
          duracaoMinutos=-5000000  →  26.751 ms | 19.291.480 bytes

          `obterSlotsPublicos` (`public-booking.ts:560`) repassa os três argumentos do
          navegador sem validação nenhuma; `duracaoMinutos` alimenta a condição de parada
          do laço em `booking-engine.ts:144`
          (`for (let candidato = a; candidato + duracaoMinutos <= b; candidato += 15)`).
          Negativo, o valor deixa de limitar a grade ao intervalo livre e passa a limitá-la
          à própria magnitude. Medi também a função pura isolada: -1.000.000 → 66.707
          entradas em 9 ms; -100.000.000 → 6.666.707 entradas em 1.237 ms. O crescimento é
          linear e o laço é SÍNCRONO: o event loop fica bloqueado para todas as requisições
          em voo, não só a do atacante.
          A inversão do modelo de confiança é acidental e está provada por contraste dentro
          do próprio repositório: o fluxo AUTENTICADO `obterSlotsDashboard`
          (`agendamentos.ts:189`) valida `dateStr` com `/^\d{4}-\d{2}-\d{2}$/`; o fluxo
          PÚBLICO E ANÔNIMO não valida nada. Medi a consequência colateral disso também:
          `dateStr = "nao-e-uma-data"` devolve `{ ok: true, slots: [] }` — exatamente a
          "grade calculada errada, sem sintoma" que o JSDoc da função afirma ter eliminado.
          Ressalvas honestas: (a) NÃO é regressão desta fase — `git show
          master:src/app/actions/public-booking.ts:295` mostra a mesma ausência de
          validação, e esta fase melhorou o argumento (`tenantId` → `slug`) sem fechar a
          porta; (b) NÃO falsifica a letra de nenhum dos 5 Success Criteria, que falam da
          chave publicável e do webhook. É gap porque a fase se chama "hardening da
          superfície pública", o milestone é abrir ao público, e a Fricção Zero proíbe
          CAPTCHA — a validação de entrada é a ÚNICA defesa disponível.
          Conferi o deferimento antes de reportar: a Phase 3 NÃO cobre isto. O SC1 dela é
          sobre teto de CRIAÇÃO de agendamentos por repetição; um rate limit deixa a
          primeira requisição passar, e uma requisição basta.
      artifacts:
          - path: "src/app/actions/public-booking.ts"
            issue: "linhas 560-591 — `slug`, `dateStr` e `duracaoMinutos` chegam do navegador de um visitante sem sessão e seguem sem validação"
          - path: "src/lib/booking-engine.ts"
            issue: "linha 144 — `duracaoMinutos` é a condição de parada do laço, sem guarda de sinal nem de tipo"
      missing:
          - "Validar na fronteira da action pública devolvendo discriminante (`data_invalida`, `servico_invalido` já são membros de `MotivoPublico`, então os dois `Record` de `mensagens.ts` compilam sem edição)"
          - "Guarda de profundidade na função pura: `if (!Number.isInteger(duracaoMinutos) || duracaoMinutos <= 0) return []` no topo de `gerarSlotsAntiBuraco` — é o invariante de verdade e sobrevive a um terceiro chamador"
          - "Replicar a validação de `duracaoMinutos` em `obterSlotsDashboard`, que hoje valida só `dateStr`"
deferred: []
behavior_unverified_items:
    - truth: "SC4 — uma tabela (e, desde o plano 01-15, uma função) nova criada no schema `public` não aparece na Data API sem GRANT explícito"
      test: "Criar um objeto descartável no schema `public` pelo role `postgres`, consultar `has_table_privilege`/`has_function_privilege` para `anon`, `authenticated` e `service_role`, tentar `GET /rest/v1/<tabela>` e `POST /rest/v1/rpc/<funcao>` com a chave publicável, e remover o objeto"
      expected: "`anon` e `authenticated` sem privilégio, `service_role` com privilégio, e a chamada com a chave publicável devolvendo 42501 / PGRST205"
      why_human: >-
          Exige DDL, e esta sessão não tem caminho até lá: o subagente verificador não
          recebe as ferramentas MCP do Supabase, `.env.local` não traz `DATABASE_URL` nem
          `SUPABASE_ACCESS_TOKEN`, e o CLI responde `LegacyPlatformAuthRequiredError`.
          Não afirmo o critério nem o reprovo — declaro o que consegui e o que não consegui
          medir. Ver a seção "SC4" no corpo do relatório para o que foi possível estabelecer
          por via indireta.
human_verification:
    - test: "Reconferir SC4 com DDL (o orquestrador tem o MCP do Supabase; o verificador não)"
      expected: "Objeto descartável nasce fechado para `anon`/`authenticated` e aberto para `service_role`, nas duas classes (TABLES e FUNCTIONS)"
      why_human: "Precisa de DDL; ver `behavior_unverified_items`"
    - test: "Wizard completo de `/book/[slug]` no navegador, em `next start` sobre build de produção — nunca em `pnpm dev`"
      expected: "Serviço → data/hora → contato → 'Horário confirmado!', e a linha aparecendo na agenda do dashboard, sem fricção nova"
      why_human: "Renderização e fluxo de tela não se inferem de código HTTP nem de suíte. Item 1 de `docs/PENDENCIAS.md:859`"
    - test: "Recuperação de double-booking NA TELA, em `next start`"
      expected: "Aviso âmbar `Este horário já foi preenchido ou está indisponível. Por favor, selecione outro.`, volta para a etapa de data/hora, grade refeita"
      why_human: "O prognóstico virou positivo (o discriminante atravessa — veredito ESCRITA_VALIDACAO), mas quem vê a tela é o olho humano. Item 2 de `docs/PENDENCIAS.md`"
    - test: "Caixa de erro de slots NA TELA, em `next start`"
      expected: "`Não foi possível carregar os horários. Tente de novo.` com `role=\"alert\"` e o botão `Tentar de novo` reexecutando a busca"
      why_human: "Item 3 de `docs/PENDENCIAS.md`"
    - test: "Dashboard tela a tela sob as policies tenant-scoped, incluindo reativar um serviço inativo"
      expected: "Nenhuma tela degrada em branco depois do DROP das policies residuais do plano 01-08"
      why_human: "Item 4 de `docs/PENDENCIAS.md`"
    - test: "Personalização por plano na página pública"
      expected: "Pro exibe cor/logo/capa; gratuito não exibe nada disso — inclusive durante degradação de leitura de `assinaturas`"
      why_human: "Com o RLS fora do caminho público (D-02), a sanitização por plano é defesa ÚNICA. Item 5 de `docs/PENDENCIAS.md`"
    - test: "Lembrete do QStash ponta a ponta, com a URL de destino já sem query string"
      expected: "A mensagem chega; nenhum 401 no log (401 indicaria mismatch de URL atrás do proxy — WR-04 deferido)"
      why_human: "O caminho de falha é inteiramente silencioso por design. Item 6 de `docs/PENDENCIAS.md`"
    - test: "Backstops visuais com dado extremo (20+ serviços, `horizonte_maximo_dias = 30`, nomes longos)"
      expected: "Layout não quebra em mobile nem em desktop"
      why_human: "São as truths `verification: backstop` dos planos 01-10 e 01-12. Item 7 de `docs/PENDENCIAS.md`"
---

# Phase 1: Hardening da superfície pública — Relatório de verificação (3ª rodada)

**Goal da fase:** A chave publicável que vai no bundle deixa de dar acesso a qualquer coisa além do estritamente necessário para a página pública funcionar, e o webhook de lembrete só aceita quem o QStash assinou
**Verificado:** 2026-07-22T20:07:30Z, sobre o HEAD `8edb32d`
**Status:** gaps_found
**Reverificação:** Sim — 3ª passagem, depois da 2ª rodada de fechamento de gaps (planos 01-10 a 01-16)

## Nota de método, antes de qualquer veredito

Duas coisas moldaram esta verificação.

A primeira é a regra que esta fase pagou caro para aprender: **critério que lê como
satisfeito enquanto a medição diz outra coisa é o defeito.** Por isso não herdei o exit
code de nenhum harness como prova. Remedi SC1, SC2 e SC3 por caminho independente, com
`curl` anônimo direto contra o projeto Supabase do repositório, e — o que o harness não
faz — **com controle positivo de identidade do alvo**: antes de qualquer medição anônima,
provei que aquela URL é o banco deste projeto, respondendo 200 com linhas reais sob
`service_role` nas quatro tabelas centrais, e devolvendo `PGRST205` para um nome de tabela
inventado. Sem esse par, "fechado" e "não é este banco" são indistinguíveis.

A segunda é uma limitação de ferramenta que declaro em vez de contornar com prosa: **este
subagente não recebeu as ferramentas MCP do Supabase.** Só tenho `Read`, `Write`, `Bash` e
`Skill`. `.env.local` não traz `DATABASE_URL` nem `SUPABASE_ACCESS_TOKEN`, e o CLI responde
`LegacyPlatformAuthRequiredError`. Consequência concreta: não consigo executar DDL, e por
isso **SC4 não foi remedido nesta sessão**. Tudo o que passa por PostgREST eu medi; o que
exige DDL, não. Onde não medi, digo que não medi.

## Alcance do goal

### Truths observáveis

| # | Truth | Status | Evidência |
|---|---|---|---|
| 1 | **SC1** — `curl` anônimo em `perfis_empresas` não devolve a lista de profissionais, nem `telefone_contato`, nem o `org_id` | ✓ VERIFICADO | Medido por mim. Cinco projeções (`*`, `tenant_id`, `telefone_contato`, `slug`, `nome_estabelecimento`) → **HTTP 401 / código 42501** `permission denied for table perfis_empresas`. Zero bytes de dado. Controle positivo: a mesma URL sob `service_role` devolve `[{"tenant_id":"org_…"}]` |
| 2 | **SC2a** — POST anônimo em `agendamentos` e `clientes` é rejeitado | ✓ VERIFICADO | Medido por mim, com payload plausível: os dois → **401 / 42501** `permission denied for table …`, com o `hint` do Postgres pedindo o `GRANT INSERT` que não existe |
| 3 | **SC2b** — o booking público continua funcionando **exatamente como antes** | ✓ VERIFICADO — gap anterior fechado | Três medições independentes: (a) `verificar-travessia-server-action.sh` → exit 0, 5/5 vereditos contra `next start`; (b) `pnpm test:integracao` → **13/13** em 8,40 s com escrita real no Supabase de dev; (c) sonda HTTP minha contra o build de produção com o slug real `avantis` → `{"ok":true,"slots":[{"time":"08:…}]}`, grade completa em 525 ms. Era `✗ FAILED` na verificação anterior |
| 4 | **SC3** — `agendamentos` e `excecoes_agenda` sem `cliente_id` e sem `motivo` para `anon` | ✓ VERIFICADO | Medido por mim: `?select=cliente_id` e `?select=motivo` → 401/42501. Satisfeito com folga — a role anon não lê coluna nenhuma das duas tabelas (∅ ⊂ colunas da engine) |
| 5 | **SC4** — tabela (e função) nova não aparece na Data API sem GRANT explícito | ⚠️ **PRESENTE, COMPORTAMENTO NÃO EXERCITADO** | Mecanismo presente e lido linha a linha nas duas migrations. Aplicação da de TABELAS provada por efeito colateral observável (ver abaixo). A de FUNÇÕES não tem efeito observável e exige DDL, que esta sessão não tem. Vai para verificação humana — não conto como verificado |
| 6 | **SC5a** — POST sem assinatura válida do QStash é rejeitado | ✓ VERIFICADO | Veredito `WEBHOOK` de `verificar-fail-fast-boot.sh`, rodado por mim contra build de produção: **401 sem assinatura \| 401 com `?secret=` legado \| 401 com `Upstash-Signature` forjado \| 200 no controle `GET /`** |
| 7 | **SC5b** — a aplicação **não sobe** sem as chaves de assinatura | ✓ VERIFICADO | Veredito `MORTE`, rodado por mim: o `next start` encerrou com **código 1**, nomeou `QSTASH_NEXT_SIGNING_KEY` em `stderr` e a porta **recusou conexão**. Veredito `CONTROLE`: 200 com as quatorze presentes. Veredito `BUILD`: `pnpm build` continua saindo 0 com a variável vazia |
| 8 | **GOAL, 2ª metade** — "o webhook de lembrete só aceita quem o QStash assinou" | ✓ VERIFICADO — gap anterior fechado | `whatsapp-helper.ts:158` publica `${APP_URL}/api/webhooks/lembrete`, sem query string. `grep -rn "secret=" src/ scripts/` só devolve comentário, teste e a sonda de regressão. Os quatro `console.error` de gateway viraram `http_<status>` (:95, :178, :224). O resíduo — a chave já circulou em URL publicada e em log — está registrado com dono e data-limite 2026-08-05 em `docs/PENDENCIAS.md:806` |
| 9 | **01-15** — "checagem que não prova nada não pode passar" | ✗ **REPROVADO** | Reproduzi: com o alvo inalcançável, 11 checagens em HTTP 000, **exit 0** e a frase `0 reprovada(s) — a role anon não devolveu linha nenhuma`. Ver gap 1 |
| 10 | **01-14** — o namespace do slug público ganhou dono | ✓ VERIFICADO | O `UNIQUE` está **no banco**, não só no repositório: sonda não-mutante `POST ?on_conflict=slug_gratuito` com `Prefer: resolution=ignore-duplicates` → **201** (o Postgres aceitou a especificação ON CONFLICT), enquanto o **controle negativo** na coluna sem índice (`on_conflict=nome_estabelecimento`) → **42P10** `there is no unique or exclusion constraint matching the ON CONFLICT specification`. Confirmação de não-mutação: a tabela seguiu com 1 linha. Cruzado com o teste de integração `:595`, que mede o `23505` pelo outro lado |
| 11 | **01-10/01-12** — erro esperado atravessa a fronteira de flight com identidade preservada | ✓ VERIFICADO | Harness rodado por mim contra `next start`: `SLOTS_ERRO` carrega `slug_invalido`, `ESCRITA_VALIDACAO` carrega `campos_obrigatorios`, `SEM_VAZAMENTO` não acha slug, `org_`, `PGRST` nem `tenant_id` em corpo nenhum. Nenhum `digest` opaco |
| 12 | **01-16** — falha de leitura em `assinaturas` não derruba o link público, e a degradação continua restritiva no que é pago | ✓ VERIFICADO | 11 casos herméticos em `src/lib/__tests__/assinaturas.test.ts` exercitam a transição (inclusive o invariante de que o contexto do reporte não carrega `tenantId`, slug nem `.message`), mais 5 casos de integração com banco real (:664, :683, :697, :733, :745) — incluindo os dois **controles** que impedem o "passa porque recusa tudo" |
| 13 | **01-13** — registro coerente, rotação datada, UAT intocado | ✓ VERIFICADO | Contado por comando na seção `docs/PENDENCIAS.md:859`: **7 abertas / 0 marcadas**. Item de rotação em `:806` com dono ("só o owner fecha") e data-limite 2026-08-05, etapa 1 escrita como feita e etapa 2 nascida aberta. Item antigo do webhook riscado em `:1200`, com o comando que prova |

**Score:** 11/13 truths verificados (1 reprovado, 1 presente com comportamento não exercitado)

### SC4 — o que consegui estabelecer, e o que não

Separo isto do resto porque é o único critério que não medi.

**O que consegui:** a migration de TABELAS (`20260722060000`) foi de fato aplicada ao banco,
e isso não é inferência de ledger — é efeito colateral observável. Ela carrega, além das
`ALTER DEFAULT PRIVILEGES`, um `revoke all on all tables in schema public from anon`, e eu
varri **as nove tabelas declaradas** com a chave publicável: as nove devolveram 401/42501.
As duas funções que já existiam também: `rls_auto_enable` → 42501, e
`substituir_horarios_funcionamento(jsonb)`, chamada com o parâmetro certo → 42501.

**O que não consegui:** provar o comportamento sobre objetos FUTUROS. A migration de
FUNÇÕES (`20260722183153`) contém *apenas* duas `ALTER DEFAULT PRIVILEGES` — nenhum efeito
observável por PostgREST —, e a verificação exige criar e destruir um objeto descartável.
Sem DDL, não dá.

**Como pesei a evidência de terceiro:** li o `01-15-SUMMARY.md` procurando falso verde e
não achei. Ao contrário: a prova empírica **reprovou o conserto na primeira tentativa** (a
função descartável criada depois do primeiro SQL ainda nascia com `=X` para `PUBLIC`,
porque `ALTER DEFAULT PRIVILEGES ... IN SCHEMA public REVOKE ... FROM PUBLIC` é um no-op
conhecido), o diagnóstico foi registrado com a citação da documentação, e só a terceira
função descartável mediu `postgres=X|service_role=X` com `anon = false` e RPC real
devolvendo 42501. Um contrafactual assim — objeto criado ANTES e DEPOIS do conserto — é
exatamente o que distingue "fechou" de "sempre esteve assim". É evidência forte. Mas é
evidência de outra sessão, sobre objetos que já foram destruídos, e a regra desta fase é
que eu meça. Marco como não exercitado e mando para reconferência.

### Required Artifacts

| Artefato | Esperado | Status | Detalhes |
|---|---|---|---|
| `src/lib/whatsapp-helper.ts` | URL publicada sem segredo; log sem corpo de gateway | ✓ VERIFICADO | `:158` sem query string; `:95`, `:178`, `:224` reduzidos a `http_<status>`. Restam `:107` e `:194`, que logam o erro de **rede** (não corpo de gateway) — aceitável |
| `src/lib/__tests__/whatsapp-helper.test.ts` | Trava que pode falhar | ✓ VERIFICADO | Faz parte dos 228 casos herméticos; o fixture injeta a URL de destino e a chave no corpo e assere ausência — trava com poder de reprovar |
| `src/app/book/[slug]/mensagens.ts` | Cópias contratadas, uma constante por caso | ✓ VERIFICADO | As três cópias do 01-UI-SPEC §Copywriting Contract conferidas byte a byte (`:27`, `:52`, `:58`). Os dois `Record<MotivoPublico, string>` tornam membro novo um erro de `tsc`, não um `undefined` na tela |
| `src/app/book/[slug]/BookingApp.tsx` | Decisão por discriminante | ✓ VERIFICADO | `:282` compara `res.motivo === 'slot_indisponivel'`; nenhum `.includes()` de mensagem restou. ⚠️ WR-07: três cópias visíveis ao cliente continuam inline em `:258,264,268` |
| `scripts/verificar-travessia-server-action.sh` | Harness de fronteira, id derivado do manifesto | ✓ VERIFICADO | 340 linhas. Rodado: exit 0, 5/5. Deriva o id do `server-reference-manifest.json` (conferi rodando a mesma derivação por fora: prefixo `70efdce3`), aborta com 2 se não derivar, e proíbe `setsid` pelo motivo certo |
| `scripts/verificar-superficie-anon.sh` | Veredito por código específico e cobertura | ⚠️ **PARCIAL** | O eixo do NOME está consertado (confirmei: `000` vira INCONCLUSIVO, não ESPERADO). O eixo da IDENTIDADE DO ALVO não — gap 1 |
| `scripts/verificar-fail-fast-boot.sh` | 4 vereditos, exit 0 só com os quatro | ✓ VERIFICADO | Rodado: exit 0, "4 vereditos, 0 reprovados" |
| `supabase/migrations/20260722183153_…` | Default privilege cobrindo FUNCTIONS | ⚠️ PRESENTE, NÃO EXERCITADO | Conteúdo correto e assimetria conhecida (revoke global, grant por schema — WR-09). Aplicação não reproduzível aqui |
| `supabase/migrations/20260722185755_…` | `UNIQUE` em `slug_gratuito` + `COMMENT ON CONSTRAINT` | ✓ VERIFICADO | Constraint **provada viva no banco** (sonda ON CONFLICT com controle negativo). `COMMENT ON CONSTRAINT` presente e escrito em intenção de negócio |
| `src/app/actions/perfis-empresas.ts` | Checagem cruzada antes do upsert | ⚠️ PARCIAL | A guarda existe, usa `createAdminClient()` pelo motivo certo (sob RLS a consulta voltaria vazia e a checagem seria decorativa) e projeta uma coluna com `head: true`. Mas é **unidirecional** — WR-06 |
| `src/lib/assinaturas.ts` | `{ plano, degradadoPorErro }` + reporte | ✓ VERIFICADO | Contrato presente e coberto por 11 casos herméticos. ⚠️ `:65` e `:133` ainda logam `.message` crua — WR-02 |
| `src/app/api/webhooks/lembrete/route.ts` | `plano_indeterminado` distinguido | ✓ VERIFICADO | Ramo presente, devolve 500 para o QStash retentar. ⚠️ WR-10: o vocabulário não entrou no `COMMENT ON COLUMN` de `09_disparos_whatsapp.sql` |
| `docs/PENDENCIAS.md` | Coerente com o código | ✓ VERIFICADO | Gap 3 da rodada anterior fechado. Contagem de UAT conferida por comando |
| `package.json` | Porta de entrada para os harnesses | ✗ **AUSENTE** | `scripts` tem só `dev/build/start/lint/test/test:integracao`. Não há `.husky/` nem `.github/workflows/`. Os três harnesses só rodam se alguém lembrar do caminho completo — WR-03 |

### Verificação dos elos (key links)

| De | Para | Via | Status | Detalhes |
|---|---|---|---|---|
| `agendarLembreteQStash` | QStash / log de acesso / console da Upstash | URL de destino publicada | ✓ **CORTADO** | Era ⚠️ WIRED INDEVIDAMENTE. Hoje publica sem query string |
| `route.ts:29` | `verificarAssinaturaQstash` → `Receiver` | duas chaves, `url: req.url` | ✓ WIRED | 401×3 medidos. `JSON.parse` só depois de autenticado (`:38`) |
| `obterSlotsPublicos` | `BookingApp` → caixa vermelha | discriminante `motivo` pela fronteira de flight | ✓ **WIRED em produção** | Era ✗ NOT_WIRED. Veredito `SLOTS_ERRO` |
| `criarAgendamentoPublico` | `BookingApp:282` → aviso âmbar + `setTentativaSlots` | `res.motivo === 'slot_indisponivel'` | ✓ WIRED | Veredito `ESCRITA_VALIDACAO` + integração `:432`. É o elo que o SC4 da Phase 2 precisa vivo |
| `salvarPerfilEmpresa` → `perfis_empresas` (UNIQUE) → `resolverPerfilPublicoPorSlug` | três camadas do namespace | recusa na escrita, constraint, recusa de ambiguidade | ⚠️ **WIRED, uma direção só** | As três camadas existem e a do meio está provada no banco; a guarda de escrita não cobre o sentido `slug_gratuito` sorteado × `slug` alheio — WR-06 |
| `obterSlotsPublicos` | `gerarSlotsAntiBuraco` (laço) | `duracaoMinutos` cru do navegador | ⚠️ **WIRED INDEVIDAMENTE** | Gap 2. O elo transporta entrada hostil direto para a condição de parada de um laço síncrono |
| `ALTER DEFAULT PRIVILEGES … grant … to service_role` | `createAdminClient()` | privilégio em objetos futuros | ⚠️ PRESENTE, NÃO EXERCITADO | Sem este elo a próxima RPC derruba o caminho público inteiro (D-02). WR-09: o grant de FUNCTIONS é por schema e o revoke é global |

### Trace de dados (Nível 4)

| Artefato | Variável | Origem | Produz dado real? | Status |
|---|---|---|---|---|
| `obterSlotsPublicos` | `slots` | engine com `supabase: admin`, slug resolvido no servidor | Sim — medido por HTTP contra produção: `avantis`/2026-07-27 devolveu grade completa (2.179 bytes de slots) | ✓ FLUINDO |
| `criarAgendamentoPublico` | `agendamento` (RETURNING) | INSERT real via `createAdminClient()` | Sim — 13/13 na suíte de integração, com reaproveitamento de cliente por telefone e recusa de slot ocupado | ✓ FLUINDO |
| `res.motivo` → caixa vermelha / aviso âmbar | `motivo` | Server Action → flight → `mensagemDeMotivo` | Sim — o discriminante atravessa a fronteira em build de produção | ✓ FLUINDO (era ✗ HOLLOW) |
| `obterPlanoVigentePublico` | `{ plano, degradadoPorErro }` | SELECT em `assinaturas` | Sim — 5 casos de integração com perfil real gravado, incluindo controles | ✓ FLUINDO |

### Spot-checks comportamentais

| Comportamento | Comando | Resultado | Status |
|---|---|---|---|
| Controle positivo de identidade do alvo | `curl` sob `service_role` em 4 tabelas + nome inventado | 200 com linhas reais ×4; `PGRST205` no inventado | ✓ PASS |
| SC1 — `perfis_empresas` fechada a `anon` | `curl` anônimo, 5 projeções | 401/42501 em todas | ✓ PASS |
| SC2a — escrita anônima rejeitada | `POST` anônimo em `clientes` e `agendamentos` | 401/42501 nas duas | ✓ PASS |
| SC3 — colunas fechadas | `?select=cliente_id`, `?select=motivo` | 401/42501 | ✓ PASS |
| Varredura das 9 tabelas declaradas | `curl` anônimo em cada | 9/9 → 401/42501 | ✓ PASS |
| RPCs existentes fechadas a `anon` | `POST /rest/v1/rpc/…` com a chave publicável | 42501 nas duas | ✓ PASS |
| `UNIQUE` de `slug_gratuito` vivo no banco | `POST ?on_conflict=slug_gratuito` vs. controle negativo | 201 vs. **42P10** | ✓ PASS |
| Travessia de flight | `bash scripts/verificar-travessia-server-action.sh` | exit 0, 5 vereditos | ✓ PASS |
| Fail-fast + webhook | `bash scripts/verificar-fail-fast-boot.sh` | exit 0, 4 vereditos | ✓ PASS |
| Escrita ponta a ponta | `pnpm test:integracao` | 13/13, 8,40 s | ✓ PASS |
| Definition of Done | `pnpm lint` / `npx tsc --noEmit` / `pnpm test` | exit 0 / exit 0 / 15 arquivos, 228 testes, 521 ms | ✓ PASS |
| Hermeticidade de `pnpm test` | duração | 521 ms, sem rede | ✓ PASS |
| **Harness anônimo com alvo inalcançável** | script isolado + `.env.local` para host inexistente | **exit 0** com 11 checagens em HTTP 000 e frase de fechamento | ✗ **FAIL** |
| **DoS por `duracaoMinutos` negativo** | `POST Next-Action` anônimo contra `next start` | 30 → 525 ms/2 KB; **-5.000.000 → 26.751 ms/19,29 MB** | ✗ **FAIL** |
| `dateStr` malformado no fluxo público | `["avantis","nao-e-uma-data",30]` | `{"ok":true,"slots":[]}` — grade errada, sem sintoma | ✗ FAIL |
| Marcadores de dívida nos 20 arquivos da rodada | `grep -nE "TBD\|FIXME\|XXX"` | vazio | ✓ PASS |

### Execução de probes

| Probe | Comando | Resultado | Status |
|---|---|---|---|
| Superfície anônima | `bash scripts/verificar-superficie-anon.sh` | exit 0 — 11 ESPERADO com 42501 real, COBERTURA 9/9 | ⚠️ PASS **com instrumento desacreditado** (gap 1) |
| Travessia de Server Action | `bash scripts/verificar-travessia-server-action.sh` | exit 0 — 5 vereditos, 0 reprovados | ✓ PASS |
| Fail-fast de boot | `bash scripts/verificar-fail-fast-boot.sh` | exit 0 — 4 vereditos, 0 reprovados | ✓ PASS |
| Escrita do booking | `pnpm test:integracao` | exit 0 — 13/13 | ✓ PASS |

Sobre o primeiro: a execução real contra o alvo real deu 42501 em todas as 11 checagens, e
isso bate com a minha medição independente — o **veredito está certo**. O que está errado é
o **instrumento**, que emitiria a mesma frase e o mesmo exit 0 sem ter medido nada. Não uso
o exit dele como evidência em lugar nenhum deste relatório.

### Cobertura de requisitos

| Requisito | Planos que reivindicam | Descrição | Status | Evidência |
|---|---|---|---|---|
| SEG-01 | 01-04, 01-05, 01-07, 01-10, 01-12 | Visitante anônimo não insere agendamento nem cliente direto na Data API | ✓ SATISFEITO | Truth 2, medida por mim. Fechado no portão (`revoke`) e no porteiro (policies substituídas) |
| SEG-02 | 01-01, 01-02, 01-04, 01-05, 01-08, 01-14, 01-16 | `perfis_empresas` deixa de ser enumerável com a chave publicável | ✓ SATISFEITO | Truth 1, medida por mim. A extensão do 01-14 (namespace de slug com dono) também está satisfeita — truth 10, com a constraint provada viva no banco. **`REQUIREMENTS.md:14` continua `- [ ]`; a marcação é do fluxo, não deste relatório** |
| SEG-03 | 01-02, 01-04, 01-05, 01-15 | `agendamentos`/`excecoes_agenda` expõem a `anon` só as colunas da engine | ✓ SATISFEITO | Truth 4, medida por mim |
| SEG-04 | 01-04, 01-05, 01-08, 01-15 | Coluna/tabela nova nasce sem acesso `anon` (regra escrita + privilégio revogado) | ⚠️ **NÃO EXERCITADO NESTA SESSÃO** | Truth 5. Regra escrita conferida em `docs/03` §"Privilégios da Data API", agora cobrindo função/RPC. O comportamento exige DDL — ver `behavior_unverified_items` |
| SEG-05 | 01-03, 01-05, 01-06, 01-11, 01-13 | Webhook só aceita assinatura válida; a aplicação não sobe sem as chaves | ✓ SATISFEITO na parte de código | Truths 6, 7 e 8, todas medidas por mim. **Continua `- [ ]` em `REQUIREMENTS.md:17` por decisão deliberada dos planos 01-11 e 01-13, e a decisão está certa:** a metade criptográfica fechou, mas a chave já circulou em URL publicada e em log de acesso, e HMAC é simétrico — enquanto ela não for rotacionada, quem leu um log daquele período ainda forja um `Upstash-Signature` válido. Marcar o requisito como fechado com a chave velha em uso seria exatamente o tipo de "lê como satisfeito, medição diz outra coisa" que queimou esta fase duas vezes. A rotação é ação do owner, com data-limite 2026-08-05, em `docs/PENDENCIAS.md:806` |

**Órfãos:** nenhum. Os 5 IDs mapeados para a Phase 1 em `REQUIREMENTS.md:147-151` são
reivindicados por planos, e os 16 planos declaram `requirements`.

**Nota sobre o estado da rastreabilidade:** `REQUIREMENTS.md:147-151` ainda registra os
cinco como `Gaps Found`, e `SEG-01` está `[x]` enquanto `SEG-02`, `SEG-03` e `SEG-04` estão
`[ ]` apesar de satisfeitos (SEG-02 e SEG-03) ou apenas não remedidos (SEG-04). Isso é
consistente com o fato de a fase não ter fechado ainda — não é inconsistência a corrigir
agora.

### Anti-padrões encontrados

| Arquivo | Linha | Padrão | Severidade | Impacto |
|---|---|---|---|---|
| — | — | `TBD`/`FIXME`/`XXX` nos 20 arquivos da rodada | — | Varredura limpa |
| `scripts/verificar-superficie-anon.sh` | 398-401 | Exit 0 com afirmação positiva a partir de zero medição | 🛑 **Blocker** | Gap 1 |
| `src/app/actions/public-booking.ts` + `src/lib/booking-engine.ts` | 560-591 / 144 | Entrada anônima sem validação alimentando condição de parada de laço síncrono | 🛑 **Blocker** | Gap 2 |
| `src/app/actions/public-booking.ts` | 179, 368, 398, 422, 500 | `.message` crua do Postgres no `console.error` do caminho público | ⚠️ Warning | WR-02. `:368` filtra por `telefone` e `:398` insere `nome`/`telefone` — é PII de terceiro indo para o log do Railway, contra o invariante permanente do projeto. O remédio existe e está importado no mesmo arquivo (`erroSinteticoSupabase`, usado três linhas abaixo para o contexto do Sentry) e foi aplicado nesta rodada **só** no `whatsapp-helper.ts` |
| `src/lib/assinaturas.ts` / `src/lib/booking-engine.ts` | 65, 133 / 203, 226, 253, 292 | Mesmo padrão, mesma cadeia de chamada pública | ⚠️ Warning | WR-02 |
| `package.json` + ausência de `.husky/` e `.github/` | — | Três harnesses sem porta de entrada nomeada | ⚠️ Warning | WR-03. Trava que ninguém roda não trava nada. O padrão certo é conhecido no projeto (`test:integracao` ganhou script) |
| `src/app/actions/perfis-empresas.ts` | 184, 82-93 | Guarda cruzada de namespace unidirecional | ⚠️ Warning | WR-06. Consequência é 404 nos dois links (não vazamento entre tenants), sem sintoma em dashboard nenhum |
| `supabase/migrations/20260722183153` | 93-101 | `REVOKE` global, `GRANT` para `service_role` por schema | ⚠️ Warning | WR-09. Função criada fora do schema `public` nasce inexecutável também pelo `createAdminClient()`, que atende todo o caminho público desde a D-02 |
| `src/app/actions/public-booking.ts` | 224-226 | Condicional apresentada como guarda que não pode ser falsa | ⚠️ Warning | WR-01. Comportamento é o pretendido; o problema é que o próximo leitor vai acreditar numa restrição que não existe |
| `src/app/book/__tests__/mensagens.test.ts` | 45-53 | `TODOS_OS_MOTIVOS` não é exaustivo por construção, e o JSDoc promete que é | ⚠️ Warning | WR-05. Sem buraco no comportamento (os dois `Record` quebram o `tsc`), mas com buraco na promessa do teste |
| `src/app/book/[slug]/BookingApp.tsx` | 258, 264, 268 | Três cópias visíveis ao cliente fora de `mensagens.ts` | ⚠️ Warning | WR-07 |
| `src/app/actions/public-booking.ts` | 70 | `ResolucaoPerfil` exportado e nunca importado | ℹ️ Info | WR-08. Superfície exportada crescendo por inércia num arquivo `'use server'` |
| `supabase/schemas/09_disparos_whatsapp.sql` | `COMMENT ON COLUMN motivo` | `plano_indeterminado` não entrou no vocabulário documentado | ⚠️ Warning | WR-10 |

### Verificação humana necessária

Oito itens, detalhados no frontmatter. Sete são os de `docs/PENDENCIAS.md:859`, que
continuam **abertos e não aprovados** — conferi por comando: 7 abertas, 0 marcadas.
Nenhum executor os tocou, o que está certo. Dois deles mudaram de prognóstico para
melhor nesta rodada (recuperação de double-booking e caixa de erro de slots: o
mecanismo que os matava foi consertado e eu medi o conserto), mas mecanismo consertado
não é tela conferida.

O oitavo é novo e é meu: **reconferir SC4 com DDL.** O orquestrador tem o MCP do Supabase;
este subagente não.

## Resumo dos gaps

**A 2ª rodada entregou os três gaps que prometeu, e eu reproduzi cada prova em vez de
aceitar SUMMARY.**

A chave HMAC saiu da URL publicada — e o mais importante, saiu **com a premissa técnica
corrigida no registro**: a justificativa antiga ("a fila tem lembretes em voo e o webhook
casa a assinatura contra a URL completa") era falsa, o `01-CONTEXT.md` foi anotado sem
apagar o texto original, e o `COVERAGE.md` trocou a razão do OPT-OUT de `Client.publishJSON`
por uma que sobrevive a escrutínio. O erro esperado voltou a atravessar a fronteira de
flight, e isso não é leitura de código: é o veredito `SLOTS_ERRO` do harness contra
`next start`, mais o `ESCRITA_VALIDACAO` que a rodada acrescentou para o caminho de escrita.
O namespace do slug ganhou dono nas três camadas, e a do meio eu provei **viva no banco**,
com controle negativo — não pelo ledger, não pelo arquivo da migration. A degradação de
`assinaturas` virou dois eixos separados (permissiva na disponibilidade, restritiva no que é
pago) com controles que impediriam a suíte de passar por recusar tudo. E o registro ficou
honesto: sete itens de UAT abertos, rotação de chave com dono e data.

**O que impede o fechamento são dois achados do code review que eu não confirmei por
leitura — eu medi.**

O primeiro é sobre o instrumento. Copiei `verificar-superficie-anon.sh` e os schemas para um
diretório isolado, apontei o `.env.local` para um host que não existe, e rodei. As onze
checagens registraram `HTTP 000 — não provou permissão negada`. O veredito COBERTURA passou.
E a última linha foi `Resumo: 11 checagem(ns), 0 reprovada(s) — a role anon não devolveu
linha nenhuma`, com **exit code 0**. Este é o script que o `ROADMAP.md:195` e o
`01-04-PLAN.md:170` nomeiam como prova de SEG-01, SEG-02 e SEG-03, e cujo cabeçalho promete,
com todas as letras, que "checagem que não prova nada não pode passar". O conserto do WR-08
foi real — confirmei na mesma execução que o `000` vira INCONCLUSIVO e não ESPERADO —, mas
o falso verde apenas mudou do eixo do NOME para o eixo da IDENTIDADE DO ALVO. Um harness que
não consegue reprovar é pior que harness nenhum, porque documenta uma garantia inexistente,
e esta fase já foi queimada duas vezes por exatamente esse mecanismo. É por isso que
remedi SC1, SC2 e SC3 por caminho independente e com controle positivo de alvo — e é por
isso que o gap não contamina o veredito daqueles três critérios.

O segundo é sobre a superfície. Contra o build de produção deste HEAD, com o slug público
real, sem sessão, invoquei `obterSlotsPublicos` pelo id derivado do manifesto passando
`duracaoMinutos = -5000000`. A resposta levou **26.751 ms** e trouxe **19,29 MB**. Com `30`,
a mesma chamada leva 525 ms e traz 2 KB. O laço de `gerarSlotsAntiBuraco` é síncrono, então
esses 26 segundos não são espera de I/O: são o event loop parado para **todas** as
requisições em voo. O crescimento é linear e eu medi os dois pontos que definem a reta.
E a inversão do modelo de confiança está escrita no próprio repositório: o fluxo
**autenticado** valida `dateStr` com regex; o **anônimo** não valida nada — a ponto de
`dateStr = "nao-e-uma-data"` devolver `{ ok: true, slots: [] }`, que é literalmente a "grade
calculada errada, sem sintoma" que o JSDoc da função afirma ter eliminado.

Sou explícito sobre duas coisas aí, para não vender gravidade que não existe: **não é
regressão desta fase** (o `master` tem a mesma ausência de validação) e **não falsifica a
letra de nenhum dos cinco Success Criteria**, que falam da chave publicável e do webhook.
Reporto como gap por três razões concretas: a fase se chama hardening da superfície pública;
o milestone é abrir ao público; e a Fricção Zero proíbe CAPTCHA, o que faz da validação de
entrada a única defesa disponível. Conferi o deferimento antes de reportar — a Phase 3 não
cobre isto: o SC1 dela é teto de criação de agendamentos por repetição, e um rate limit
deixa a primeira requisição passar. Uma requisição basta.

**E uma ressalva de método que não posso omitir:** este subagente não recebeu as ferramentas
MCP do Supabase, e `.env.local` não tem `DATABASE_URL` nem token de CLI. Tudo que passa por
PostgREST eu medi — nove tabelas, duas funções, cinco projeções, dois POSTs, a constraint
por sonda ON CONFLICT com controle negativo. O que exige DDL, não. Por isso **SC4 fica como
"presente, comportamento não exercitado"**, e não como verificado: o mecanismo está nas duas
migrations, a de tabelas eu provei aplicada por efeito colateral observável, a de funções não
tem efeito observável, e a evidência de terceiro do `01-15-SUMMARY.md` é boa — inclusive
reprovou o próprio conserto na primeira tentativa, que é o sinal de que a prova era de
verdade — mas é de outra sessão, sobre objetos já destruídos. A lacuna é de ferramenta, não
de evidência, e ela vai para reconferência em vez de virar afirmação.

---

## Adendo do orquestrador — SC4 remedido por `pg_default_acl`

_Escrito por quem coordenou a execução, não pelo verificador. Motivo: o relatório acima
nomeia "reconferir SC4 com DDL" como tarefa do orquestrador, que tem o MCP do Supabase._

Medi o estado de repouso do mecanismo, sem escrever nada no banco — `pg_default_acl` é a
tabela que decide a ACL que **toda** tabela ou função futura vai herdar. É a causa, não o
efeito, então ela responde à pergunta do SC4 sem precisar criar objeto descartável:

| Objeto | Criado por | ACL padrão herdada | concede `anon` | concede `authenticated` |
|---|---|---|---|---|
| tabela em `public` | `postgres` | `{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}` | **não** | **não** |
| tabela em `public` | `supabase_admin` | `{postgres=…,anon=…,authenticated=…,service_role=…}` | sim | sim |
| função (escopo global) | `postgres` | `{postgres=X/postgres}` | **não** | **não** |
| função em `public` | `postgres` | `{postgres=X/postgres,service_role=X/postgres}` | **não** | **não** |

**O que isto estabelece:** as duas migrations estão aplicadas e vigentes. Tabela nova e
função nova criadas pelo `postgres` — que é a role sob a qual as migrations deste projeto
rodam — nascem sem `anon` e sem `authenticated`. A linha global de funções (`{postgres=X/postgres}`,
sem `IN SCHEMA`) é a confirmação estrutural de que a forma aplicada no `20260722183153` é a
que funciona, e não o no-op por schema que o WR-02 prescrevia.

**Um limite que o relatório principal não podia encontrar, e que vale mais que a confirmação:**
o SC4 está escrito como "uma tabela nova criada no schema `public`", sem qualificar a role
criadora. A medição mostra que a afirmação só vale para objetos criados pelo `postgres`.
Tabela criada pelo `supabase_admin` continua herdando `anon` e `authenticated` — é o default
de plataforma do Supabase, que a migration não tocou porque ela é `for role postgres`. Na
prática do projeto isso não abre buraco (nossas migrations rodam como `postgres`), mas a
extensão ou o recurso gerenciado que criar tabela em `public` pelo caminho da plataforma
escapa da regra. **Vale registrar em `docs/03-PADROES_DE_BANCO_DE_DADOS.md` §Privilégios da
Data API antes que alguém descubra por acidente.**

**O que continua não medido:** a travessia ponta a ponta por PostgREST (criar tabela, ver o
schema cache recarregar, receber 42501 no `curl` anônimo). O `01-15-SUMMARY.md` registra
exatamente esse contrafactual — 200 antes / 401 depois — mas sobre objetos já destruídos, em
outra sessão. O veredito honesto do SC4 sobe de *"presente, comportamento não exercitado"*
para **"mecanismo medido e vigente; travessia ponta a ponta ainda por observar"**. Não muda
o status da fase, que reprova pelos dois gaps acima.

Consulta usada (reexecutável, não-mutante):

```sql
select coalesce(n.nspname,'(global)') as escopo, pg_get_userbyid(d.defaclrole) as criada_por,
       d.defaclacl::text as acl_padrao
from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace
where d.defaclobjtype in ('r','f') order by d.defaclobjtype, escopo;
```

---

_Verificado: 2026-07-22T20:07:30Z_
_Verificador: Claude (gsd-verifier) — 3ª passagem, sobre o HEAD `8edb32d`_
_Adendo de SC4: Claude (orquestrador da execute-phase), mesma data, mesmo HEAD_
