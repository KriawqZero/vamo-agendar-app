---
phase: 01-hardening-da-superf-cie-p-blica
plan: 19
subsystem: documentacao (padrões de banco + registro de pendências)
tags: [gap-closure, seg-04, seg-05, pg_default_acl, registro, code-review, uat]

# Dependency graph
requires:
    - phase: 01-hardening-da-superf-cie-p-blica (plano 01-17)
      provides: 'scripts/verificar-controle-harness-anon.sh — o controle que devolve ao projeto o direito de citar o exit 0 do harness anônimo'
    - phase: 01-hardening-da-superf-cie-p-blica (plano 01-18)
      provides: 'validação na fronteira pública e os vereditos ENTRADA_HOSTIL/DATA_HOSTIL — o fechamento que este plano registra'
    - phase: 01-hardening-da-superf-cie-p-blica (01-VERIFICATION.md §Adendo)
      provides: 'a medição de pg_default_acl que estabeleceu o limite do SC4 e nomeou a role que escapa'
provides:
    - 'A regra de default privilege do docs/03 passa a dizer para qual role vale, com a tabela medida, a consulta não-mutante e a procedência'
    - 'Gatilho de conferência para o caminho da plataforma, no checklist de tabela nova'
    - 'docs/PENDENCIAS.md com os dois fechamentos da rodada, cada um com o comando que o prova'
    - 'A condição escrita que sustenta toda citação do exit 0 do harness anônimo, nos três lugares onde ele é citado'
    - 'Os dez warnings da 2ª rodada de review registrados como ponteiros, e a colisão de rótulos WR-* entre rodadas resolvida por escrito'
affects: [phase-07-primeira-tabela-nova, qualquer-fase-que-habilite-extensao, proxima-rodada-de-hardening]

# Tech tracking
tech-stack:
    added: []
    patterns:
        - 'Gate de reexecução: as oito provas rodam sobre o HEAD final antes do primeiro Edit'
        - 'Afirmação de documento acompanhada da consulta que a estabelece, não-mutante e reexecutável'
        - 'Direito de citar exit code de harness escrito junto da condição que o sustenta'
        - 'Achado registrado como ponteiro (rótulo + uma linha + seção), nunca reanalisado no registro'

key-files:
    created:
        - .planning/phases/01-hardening-da-superf-cie-p-blica/01-19-SUMMARY.md
    modified:
        - docs/03-PADROES_DE_BANCO_DE_DADOS.md
        - docs/PENDENCIAS.md

key-decisions:
    - 'A medição de pg_default_acl foi REEXECUTADA nesta sessão pelo MCP da Supabase, com identidade do alvo conferida antes — o documento registra a medição própria e cita a do adendo como concordante, em vez de citar medição de terceiro'
    - 'A anotação da condição do exit 0 foi aplicada nos TRÊS lugares onde o harness é citado, não só na seção nova — a truth exige que nenhum documento cite sem nomear o controle'
    - 'Os dois blockers da 2ª rodada entraram na lista de ponteiros como fechados, com o plano que os fechou, em vez de sumirem por já estarem registrados acima'
    - 'Nenhum dos dez warnings foi consertado, reanalisado ou estimado — registrar e resolver são atos diferentes'
    - 'Nenhum item de UAT tocado e REQUIREMENTS.md intocado: a marcação de requisito é do fluxo de verificação, não deste plano'

patterns-established:
    - 'Consulta de conferência mora uma vez só, no documento que ensina a regra; o registro de pendência aponta para lá em vez de duplicar o SQL'
    - 'Quando dois artefatos de rodadas diferentes compartilham prefixo de rótulo, o documento diz qual é qual e onde cada análise vive antes de listar qualquer um'

requirements-completed: []

coverage:
    - id: D1
      description: 'As oito provas da fase saem 0 sobre o HEAD final f473437, antes de qualquer edição de documento'
      requirement: SEG-04
      verification:
          - kind: integration
            ref: 'controle-harness 0 | superficie-anon 0 | travessia 0 | fail-fast 0 | pnpm test 0 | test:integracao 0 | lint 0 | build 0 — saídas coladas abaixo'
            status: pass
      human_judgment: false
    - id: D2
      description: 'O instrumento de superfície continua distinguindo alvo real de alvo que não mede nada: veredito [ALVO] impresso e quatro vereditos de controle aprovados'
      requirement: SEG-01
      verification:
          - kind: integration
            ref: 'verificar-superficie-anon.sh imprime [ALVO] (referência 42501 + canário PGRST205); verificar-controle-harness-anon.sh → 4 vereditos, 0 reprovados'
            status: pass
      human_judgment: false
    - id: D3
      description: 'A fronteira pública continua recusando entrada hostil antes de qualquer I/O'
      requirement: SEG-01
      verification:
          - kind: integration
            ref: 'verificar-travessia-server-action.sh → "7 vereditos, 0 reprovados", com ENTRADA_HOSTIL e DATA_HOSTIL presentes'
            status: pass
      human_judgment: false
    - id: D4
      description: 'A regra de default privilege está qualificada pela role criadora, com a tabela de quatro linhas medida e a consulta não-mutante embutida'
      requirement: SEG-04
      verification:
          - kind: static
            ref: 'grep -c pg_default_acl docs/03 → 4 (base 0); grep -c supabase_admin docs/03 → 3 (base 0)'
            status: pass
      human_judgment: false
    - id: D5
      description: 'A medição de pg_default_acl foi reexecutada nesta sessão contra o projeto deste repositório e bate com o adendo'
      requirement: SEG-04
      verification:
          - kind: integration
            ref: 'MCP supabase get_project_url → https://cimeiteyueeolwmlouxi.supabase.co (mesmo alvo do harness); execute_sql da consulta → 4 linhas relevantes idênticas à tabela do adendo'
            status: pass
      human_judgment: false
    - id: D6
      description: 'docs/PENDENCIAS.md registra os dois fechamentos com o comando que os prova e o item novo com dono e gatilho'
      requirement: SEG-05
      verification:
          - kind: static
            ref: 'grep -c verificar-controle-harness-anon docs/PENDENCIAS.md → 4 (base 0); grep -c supabase_admin → 1 (base 0)'
            status: pass
      human_judgment: false
    - id: D7
      description: 'Os sete itens de UAT humano continuam abertos e não aprovados'
      requirement: SEG-05
      verification:
          - kind: static
            ref: 'grep -cE "^- \[ \]" docs/PENDENCIAS.md → 7 e grep -ciE "^- \[x\]" → 0, medidos antes da edição, depois da edição e depois do hook de prettier; git diff não mostra nenhuma linha da seção de UAT'
            status: pass
      human_judgment: false
    - id: D8
      description: 'Definition of Done verde sobre o HEAD final 45245f1'
      verification:
          - kind: integration
            ref: 'pnpm lint 0 | pnpm test 15 arquivos / 235 testes em 434 ms | pnpm build 0 — saídas coladas abaixo'
            status: pass
      human_judgment: false
    - id: D9
      description: 'Os sete itens de UAT humano executados no navegador pelo owner'
      verification: []
      human_judgment: true
      rationale: 'Nenhum executor os fecha. Este plano os contou (7 abertas / 0 marcadas) e não tocou em nenhum — a contagem é o controle automatizado disso.'

# Metrics
duration: ~30min
completed: 2026-07-22
status: complete
---

# Phase 01 Plan 19: Fechamento da 3ª rodada — o registro passa a bater com a medição Summary

**As oito provas da fase rodaram sobre o HEAD final antes do primeiro `Edit` e saíram todas 0; só então a regra de default privilege do `docs/03` ganhou a qualificação que faltava — ela vale para o que o `postgres` cria, e o caminho da plataforma escapa — e `docs/PENDENCIAS.md` passou a registrar os dois fechamentos da rodada com o comando que prova cada um, o item novo da escapada com dono e gatilho, e os dez warnings da 2ª rodada como ponteiros, com os sete itens de UAT humano intocados.**

## Performance

- **Duration:** ~30 min
- **Completed:** 2026-07-22
- **Tasks:** 3
- **Files modified:** 2 documentos (nenhum arquivo em `src/`, `supabase/` ou `scripts/`)

## Task Commits

1. **Task 1: Gate de reexecução** — sem artefato de repo, por desenho. O que a task produz é **medição**; as oito saídas estão coladas abaixo, com o HEAD anotado.
2. **Task 2: A regra do SC4 passa a dizer para qual role vale** — `afc4336` (docs)
3. **Task 3: O registro de pendências passa a bater com o que a rodada mediu** — `45245f1` (docs)

---

## Task 1 — o gate, com a saída real

**HEAD medido: `f473437`.** Árvore limpa no início (`git status --porcelain` vazio) e limpa
ao fim da task — nenhum documento foi aberto para edição antes destes oito exit 0. O
primeiro commit deste plano (`afc4336`) é posterior a todos eles.

### Prova 1 — `bash scripts/verificar-controle-harness-anon.sh`

```
Controle do harness de superfície anônima
Harness sob controle: scripts/verificar-superficie-anon.sh   |   Porta do stub: 3993

  [APROVADO]  ALVO_MORTO      o harness saiu 2 e não afirmou fechamento — host reservado por RFC 2606 que não resolve: toda checagem vira HTTP 000 e nada foi medido
  [APROVADO]  PROJETO_ERRADO  o harness saiu 2 e não afirmou fechamento — alvo em que nenhuma tabela declarada existe: o harness confere os nomes contra arquivos LOCAIS, então tudo vira ESPERADO sem que o banco deste projeto tenha sido tocado
  [APROVADO]  TUDO_NEGADO     o harness saiu 2 e não afirmou fechamento — alvo que nega TUDO indiscriminadamente, inclusive nome inexistente: gateway hostil e fechamento real ficam indistinguíveis sem sonda de canário
  [APROVADO]  CONTROLE        contra o alvo real o harness saiu 0 e imprimiu o veredito [ALVO] — o instrumento aprova o que deve aprovar

Resumo: 4 vereditos, 0 reprovados — o harness reprova nos três estados em que não tem o que medir e aprova o alvo real.
CONTROLE_EXIT=0
```

### Prova 2 — `bash scripts/verificar-superficie-anon.sh`

```
Verificação da superfície anônima da Data API
Alvo: https://cimeiteyueeolwmlouxi.supabase.co
Escopo: todas as tabelas operacionais
Tabelas derivadas de supabase/schemas/*.sql (9): agendamentos assinaturas clientes disparos_whatsapp excecoes_agenda horarios_funcionamento perfis_empresas servicos whatsapp_configs
ESPERADO exige 42501 no corpo, ou PGRST205/404 em nome declarado.

  [ALVO]         identidade confirmada por referência + canário        referência 'agendamentos' HTTP 401/42501 | canário 'tabela_canario_do_harness_9f3a2b' HTTP 404: {"code":"PGRST205",…

  [ESPERADO]     perfis_empresas — GET ?select=*                       HTTP 401/42501: {"code":"42501",…
  [ESPERADO]     perfis_empresas — GET ?select=tenant_id,telefone_contato HTTP 401/42501: {"code":"42501",…
  [ESPERADO]     agendamentos — POST anônimo                          HTTP 401/42501: {"code":"42501",…
  [ESPERADO]     clientes — POST anônimo                              HTTP 401/42501: {"code":"42501",…
  [ESPERADO]     agendamentos — GET ?select=cliente_id                 HTTP 401/42501: {"code":"42501",…
  [ESPERADO]     excecoes_agenda — GET ?select=motivo                  HTTP 401/42501: {"code":"42501",…
  [ESPERADO]     servicos — GET ?select=tenant_id&limit=1              HTTP 401/42501: {"code":"42501",…
  [ESPERADO]     horarios_funcionamento — GET ?select=tenant_id&limit=1 HTTP 401/42501: {"code":"42501",…
  [ESPERADO]     assinaturas — GET ?select=tenant_id&limit=1           HTTP 401/42501: {"code":"42501",…
  [ESPERADO]     whatsapp_configs — GET ?select=tenant_id&limit=1      HTTP 401/42501: {"code":"42501",…
  [ESPERADO]     disparos_whatsapp — GET ?select=tenant_id&limit=1     HTTP 401/42501: {"code":"42501",…

  [COBERTURA]    todas as tabelas declaradas                             9 declarada(s), 9 coberta(s) por pelo menos uma checagem

Resumo: 11 checagem(ns), 11 com prova positiva, 0 reprovada(s) — a role anon não devolveu linha nenhuma.
SUPERFICIE_EXIT=0
```

**A linha `[ALVO]` está lá**, com a referência declarada em 42501 e o canário em PGRST205 —
é o critério que distingue a árvore que o 01-17 deixou de qualquer outra. **11 checagens, 11
com prova positiva** (o contador novo) e **COBERTURA 9/9**.

### Prova 3 — `bash scripts/verificar-travessia-server-action.sh`

```
Verificação da travessia de erro esperado pela fronteira de Server Action
Actions alvo: obterSlotsPublicos (leitura) e criarAgendamentoPublico (escrita)   |   Porta: 3992

  … rodando pnpm build (pode levar ~1 min)
  [APROVADO]  PREPARO           ids de obterSlotsPublicos (prefixo 70efdce3…) e criarAgendamentoPublico (prefixo 40488c27…) derivados de .next/server/server-reference-manifest.json
  [APROVADO]  CONTROLE          GET / devolveu 200 e o processo seguiu vivo
  [APROVADO]  SLOTS_ERRO        o corpo da resposta carrega o discriminante `slug_invalido` e nenhum `digest` opaco
  [APROVADO]  ESCRITA_VALIDACAO o corpo da resposta carrega o discriminante `campos_obrigatorios` e nenhum `digest` opaco
  [APROVADO]  ENTRADA_HOSTIL    recusado na fronteira com `servico_invalido`, sem `digest` e sem `slug_invalido` (o slug nem chegou a ser resolvido)
  [APROVADO]  DATA_HOSTIL       recusado na fronteira com `data_invalida`, sem `digest` e sem `slug_invalido` (o slug nem chegou a ser resolvido)
  [APROVADO]  SEM_VAZAMENTO     nenhum dos quatro corpos carrega o slug do visitante, org_, PGRST ou tenant_id

Resumo: 7 vereditos, 0 reprovados — os erros esperados dos DOIS caminhos públicos atravessam a fronteira com identidade preservada, e a entrada hostil é recusada antes de qualquer I/O.
TRAVESSIA_EXIT=0
```

**`7 vereditos, 0 reprovados`** — não 5. A árvore medida é a que o 01-18 deixou.

### Prova 4 — `bash scripts/verificar-fail-fast-boot.sh`

```
Verificação do fail-fast de boot em produção
Variável alvo: QSTASH_NEXT_SIGNING_KEY   |   Porta: 3991

  … rodando pnpm build com QSTASH_NEXT_SIGNING_KEY vazia (pode levar ~1 min)
  [APROVADO]  BUILD      pnpm build saiu 0 com QSTASH_NEXT_SIGNING_KEY vazia
  [APROVADO]  MORTE      o processo do next encerrou com código 1, nomeou QSTASH_NEXT_SIGNING_KEY em stderr e a porta recusou conexão (curl 7)
  [APROVADO]  CONTROLE   com as quatorze presentes, GET / devolveu 200 e o processo seguiu vivo
  [APROVADO]  WEBHOOK    sem assinatura 401 | secret em query 401 | assinatura forjada 401 | GET / 200

Resumo: 4 vereditos, 0 reprovados — o boot morre de verdade e o webhook segue fechado.
BOOT_EXIT=0
```

### Prova 5 — `pnpm test`

```
$ vitest run

 RUN  v4.1.10 /mnt/Files/VamoAgendar/vamo-agendar-app

 Test Files  15 passed (15)
      Tests  235 passed (235)
   Start at  17:36:54
   Duration  428ms (transform 886ms, setup 0ms, import 1.33s, tests 289ms, environment 1ms)

TEST_EXIT=0
```

**Hermético: 428 ms**, muito abaixo do teto de 2 s — nenhuma rede, nenhum banco. **15
arquivos / 235 testes**; a linha de base da 3ª verificação era 228, e o delta de **+7** vem
dos casos de guarda que o 01-18 acrescentou à função pura.

### Prova 6 — `pnpm test:integracao`

```
$ EXIGIR_INTEGRACAO=1 vitest run src/app/actions/__tests__/public-booking-escrita.test.ts

 RUN  v4.1.10 /mnt/Files/VamoAgendar/vamo-agendar-app

 Test Files  1 passed (1)
      Tests  13 passed (13)
   Start at  17:37:03
   Duration  7.77s (transform 81ms, setup 0ms, import 122ms, tests 7.56s, environment 0ms)

INTEGRACAO_EXIT=0
```

**13 passando, nenhum pulado** — a linha de resumo não traz `skipped`, o que significa
credenciais presentes e escrita real contra o Supabase de dev.

### Provas 7 e 8 — `pnpm lint` e `pnpm build`

```
########## pnpm lint ##########
$ eslint
LINT_EXIT=0

########## pnpm build ##########
✓ Generating static pages using 11 workers (14/14) in 414ms

Route (app)
┌ ƒ /
├ ○ /_not-found
├ ƒ /api/webhooks/lembrete
├ ƒ /book/[slug]
├ ƒ /dashboard
├ ƒ /dashboard/agenda
├ ƒ /dashboard/plano
├ ƒ /dashboard/servicos
├ ƒ /dashboard/whatsapp
├ ● /para/[nicho]
│ ├ /para/designer-de-sobrancelhas
│ ├ /para/lash-designer
│ ├ /para/manicure
│ └ /para/barbeiro
├ ƒ /sign-in/[[...sign-in]]
└ ƒ /sign-up/[[...sign-up]]

ƒ Proxy (Middleware)
BUILD_EXIT=0
```

### Contagem da seção de UAT

```
$ grep -cE '^- \[ \]' docs/PENDENCIAS.md    →  7
$ grep -ciE '^- \[x\]' docs/PENDENCIAS.md   →  0
```

**7 abertas / 0 marcadas — exatamente o esperado.** Nenhuma divergência para reportar como
achado. As sete caixas do arquivo inteiro são as sete da seção de UAT (linhas 885–926 no
HEAD medido); não existe caixa de seleção em nenhuma outra parte do documento, o que é
proposital desde o plano 01-09 — é isso que faz a contagem global valer como controle da
seção.

### Estado da árvore ao fim da task

```
$ git status --porcelain
(vazio)
```

Nenhum arquivo editado. A ordem foi respeitada.

---

## Task 2 — `docs/03-PADROES_DE_BANCO_DE_DADOS.md`

**Escrito depois das oito provas.** A alínea (a) da §"🚪 Privilégios da Data API" ganhou um
bloco novo entre o parágrafo que descreve o efeito das duas migrations e as duas armadilhas
da linha de function. Nada foi removido: o diff é de **27 inserções e 0 remoções**, em dois
pontos.

**O que passou a estar escrito.** "Objeto novo nasce fechado" é verdade para objeto criado
**pelo `postgres`**, não para qualquer objeto que apareça no schema `public`. As duas
migrations são `for role postgres` — conferido nos arquivos antes de escrever
(`20260722060000:58,60,65,67` e `20260722183153:93,100`) — e default privilege vale por role
criadora. As migrations deste projeto rodam como `postgres`, então a regra cobre a rotina
inteira. O que escapa é o caminho da plataforma: `supabase_admin` cria com a ACL padrão de
plataforma, que concede `anon` e `authenticated`.

A **tabela de quatro linhas** entrou com as duas colunas de concessão legíveis, e logo abaixo
a observação de que a linha global de funções (`{postgres=X/postgres}`, sem `IN SCHEMA`) é
confirmação estrutural de que a forma aplicada no `20260722183153` é a que funciona — reforço
medido da armadilha 2, que a seção já documentava por citação da doc do PostgreSQL 17.

A **consulta** entrou como bloco SQL, com a nota de que é não-mutante e reexecutável, e é ela
o gatilho de conferência do checklist.

### Procedência: medição própria, não de terceiro

**O caminho que valeu foi a reexecução.** O MCP da Supabase está disponível nesta sessão,
então a consulta foi rodada por mim, com **identidade do alvo conferida antes**:
`get_project_url` devolveu `https://cimeiteyueeolwmlouxi.supabase.co` — a mesma URL contra a
qual o harness da prova 2 mediu, o que impede a versão silenciosa do erro que esta fase
combate (medir um banco e escrever sobre outro).

Resultado, filtrado nas quatro linhas que a tabela do documento reproduz:

```
escopo=(global)  criada_por=postgres         acl_padrao={postgres=X/postgres}
escopo=public    criada_por=postgres         acl_padrao={postgres=X/postgres,service_role=X/postgres}
escopo=public    criada_por=postgres         acl_padrao={postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
escopo=public    criada_por=supabase_admin   acl_padrao={postgres=arwdDxtm/supabase_admin,anon=arwdDxtm/supabase_admin,authenticated=arwdDxtm/supabase_admin,service_role=arwdDxtm/supabase_admin}
```

**Bate linha a linha com a tabela do adendo do orquestrador.** O documento registra a minha
medição — **2026-07-22, HEAD `f473437`** — e cita a anterior (2026-07-22, HEAD `8edb32d`,
`01-VERIFICATION.md` §Adendo) como concordante. Não foi preciso recorrer ao caminho
alternativo do plano (citar medição de terceiro com procedência), e a diferença importa: uma
afirmação com duas medições independentes concordantes, em HEADs diferentes, é mais forte que
uma citação.

**Detalhe fora da tabela, que confirma o argumento em vez de contrariá-lo:** a consulta
também devolve `storage` criado pelo `postgres` **com** `anon` e `authenticated`. Não é
contradição — é default privilege de outro schema, e `storage.objects` já é descrito no
`CLAUDE.md` como superfície sem RLS cuja escrita passa obrigatoriamente pelas actions com
`createAdminClient()`. A regra qualificada nesta task fala do schema `public`, que é o que o
SC4 afirma.

### Checklist

Exatamente **uma** linha nova no checklist de tabela nova, e ela é condicional: só se aplica
quando a tabela nascer pelo caminho da plataforma. A rotina de migration normal não ficou
mais pesada — a linha diz isso com todas as letras ("Tabela criada por migration não precisa
disto"). O checklist de function e as alíneas (b), (c) e (d) não foram tocados; o diff não
tem nenhuma linha removida naquela região.

Critérios por comando:

```
grep -c 'pg_default_acl' docs/03-PADROES_DE_BANCO_DE_DADOS.md:   4   (base antes da edição: 0)
grep -c 'supabase_admin' docs/03-PADROES_DE_BANCO_DE_DADOS.md:   3   (base antes da edição: 0)
git diff --stat:  1 file changed, 27 insertions(+)
hunks:  @@ -90,0 +91,26 @@  e  @@ -132,0 +159 @@   (duas inserções puras)
```

Os dois greps foram reconferidos **depois** do hook de prettier e mantiveram os mesmos
valores.

---

## Task 3 — `docs/PENDENCIAS.md`

Quatro registros, nenhum conserto. Diff: **152 inserções e 1 remoção** — a única linha
substituída é uma célula de tabela, descrita no item (b).

**(a) Item novo, ABERTO — a escapada de plataforma.** Nasceu como `###` na seção "🟠
Obrigatório antes do lançamento público", entre o fechamento da superfície remanescente e a
prevenção de double-booking — a vizinhança de Data API. Traz a consequência concreta
(extensão habilitada pelo painel cria como `supabase_admin` e a tabela nasce com `anon` e
`authenticated`), o motivo de ser aberto e não bloqueante (nenhuma extensão deste projeto
cria tabela em `public` hoje), o **dono** (quem habilitar a extensão ou o recurso), o
**gatilho** (a próxima habilitação) e o conserto se acontecer (migration manual de `revoke`).
A verificação **aponta** para a consulta que a Task 2 escreveu no `docs/03` em vez de
duplicar o SQL: uma cópia só, no documento que ensina a regra.

**(b) Fechamento do instrumento de superfície.** Seção nova com o título riscado e ✅, com o
que valia antes (exit code decidido só por `REPROVADAS -eq 0`, 11 checagens em HTTP 000 e a
frase de fechamento saindo 0), o que passou a valer (contador de prova positiva + veredito
`[ALVO]` por referência e canário) e o comando que prova
(`bash scripts/verificar-controle-harness-anon.sh`, com o registro de que ele saiu 1 antes do
conserto e 0 depois — controle capaz de reprovar).

**A condição foi escrita nos três lugares, não só na seção nova.** A truth do plano exige que
**nenhum** documento do projeto volte a citar o exit 0 do harness sem nomear o controle. O
documento citava em dois outros pontos: o bloco `>` de "hardening da Data API executado na
Phase 1" e a linha "Superfície `anon`" da tabela de evidências do plano 01-08. Os dois
ganharam a anotação — o primeiro em bloco, o segundo em célula (a única linha substituída do
diff). Em todos, a mesma frase de fundo: **quem remover o controle remove o direito de citar
o exit code.**

**(c) Fechamento do laço público sem validação.** Seção nova com os números medidos antes
(**26.751 ms e 19.291.480 bytes** numa única requisição anônima, contra 525 ms e 2.179 bytes
com `duracaoMinutos = 30`), a explicação de que o laço é síncrono e portanto o custo é o
event loop parado para todas as requisições em voo, o `{ ok: true, slots: [] }` que o
`dateStr` malformado devolvia, e o que passou a valer (validação na fronteira antes de
`createAdminClient()` e da resolução do slug + guarda de profundidade na função pura; 6 ms e
109 bytes depois). Comandos que provam:
`bash scripts/verificar-travessia-server-action.sh` (os dois vereditos novos, cuja asserção
inclui a **ausência** de `slug_invalido` — é o que prova a ordem) e `pnpm test`.

**A fronteira leitura × escrita está dita em voz alta**, porque o vizinho imediato é o WR-03
da 1ª rodada: isto fechou o caminho público de **LEITURA**; escrita pública sem limite de
tamanho nem validação de e-mail continua **diferida**, com o gatilho que já tinha.

**(d) A ambiguidade de rótulo, resolvida antes de qualquer lista.** A seção "Achados do code
review da Phase 1 diferidos" ganhou um aviso de abertura: os quatro itens dela usam a
numeração da **1ª rodada**, cujo relatório foi substituído no arquivo e vive só no histórico
do git — com o comando que o recupera,
`git show 4596463:.planning/phases/01-hardening-da-superf-cie-p-blica/01-REVIEW.md`. O
`01-REVIEW.md` do repositório é o da **2ª rodada**. A colisão foi verificada, não presumida:
`WR-03` é "escrita pública sem limite de tamanho" na 1ª rodada e "nenhum harness tem porta de
entrada" na 2ª. A regra ficou escrita: os dez da lista nova trazem a marca `(2ª rodada)`.

**Os dez warnings como ponteiros.** Cada um com rótulo, uma linha do que é, e a seção do
`01-REVIEW.md` onde está a análise com arquivo e linha. Nenhum conserto proposto, nenhuma
reanálise, nenhuma estimativa de esforço. Os **dois blockers** entraram na mesma lista
marcados como fechados, com o plano que fechou cada um (CR-01 → 01-18, CR-02 → 01-17) — em
vez de sumirem por já estarem registrados acima, o que faria a lista da 2ª rodada parecer
incompleta.

**O que não foi tocado:** a seção de UAT, o item de rotação de chave (`:806`), e
`REQUIREMENTS.md`.

Critérios por comando:

```
grep -c 'verificar-controle-harness-anon' docs/PENDENCIAS.md:   4   (base: 0)
grep -c 'supabase_admin' docs/PENDENCIAS.md:                    1   (base: 0)
grep -cE '^- \[ \]' docs/PENDENCIAS.md:                         7   (antes, depois e pós-hook)
grep -ciE '^- \[x\]' docs/PENDENCIAS.md:                        0   (antes, depois e pós-hook)
git diff | grep -c '^[+-].*UAT humano pendente':                0   (a seção não aparece em hunk nenhum)
git status --porcelain .planning/REQUIREMENTS.md:               vazio
linhas removidas no diff:  1  (a célula da tabela de evidências do 01-08)
```

### Definition of Done sobre o HEAD final `45245f1`

```
########## pnpm lint ##########
$ eslint
LINT_EXIT=0

########## pnpm test ##########
 Test Files  15 passed (15)
      Tests  235 passed (235)
   Start at  17:43:26
   Duration  434ms (transform 827ms, setup 0ms, import 1.27s, tests 318ms, environment 1ms)
TEST_EXIT=0

########## pnpm build ##########
Route (app)
┌ ƒ /
├ ○ /_not-found
├ ƒ /api/webhooks/lembrete
├ ƒ /book/[slug]
├ ƒ /dashboard
├ ƒ /dashboard/agenda
├ ƒ /dashboard/plano
├ ƒ /dashboard/servicos
├ ƒ /dashboard/whatsapp
├ ● /para/[nicho]
│ ├ /para/designer-de-sobrancelhas
│ ├ /para/lash-designer
│ ├ /para/manicure
│ └ /para/barbeiro
├ ƒ /sign-in/[[...sign-in]]
└ ƒ /sign-up/[[...sign-up]]

ƒ Proxy (Middleware)
BUILD_EXIT=0
```

Os três rodados de novo **depois** do commit da Task 3, sobre o HEAD final — não sobre o do
gate. Como as duas tasks só tocaram markdown, a expectativa era exatamente esta; a repetição
existe porque a Definition of Done vale para a entrega, e afirmar sem rodar é o que esta fase
combate.

---

## Decisions Made

- **A medição foi reexecutada em vez de citada.** O plano previa os dois caminhos; o MCP
  estava disponível, então a consulta rodou nesta sessão, com a identidade do alvo conferida
  antes dela. O documento registra a medição própria (HEAD `f473437`) e a concordância com a
  do adendo (HEAD `8edb32d`). Duas medições independentes concordantes em HEADs diferentes
  são um lastro melhor que uma citação com procedência.
- **A condição do exit 0 foi aplicada nos três pontos de citação.** A truth fala de "nenhum
  documento do projeto", não "a seção nova". Escrever a condição só onde ela é óbvia deixaria
  intactos justamente os dois lugares onde alguém lê o exit 0 sem contexto.
- **Os dois blockers entraram na lista de ponteiros como fechados.** Ficariam implícitos, já
  que têm seção própria acima; explicitá-los evita que a lista da 2ª rodada leia como
  "dez warnings e nada mais", perdendo o que a rodada resolveu.
- **A linha do checklist é condicional, e diz que é.** Inflar o checklist de tabela nova com
  uma conferência de banco em toda migration seria pagar imposto diário por um risco que só
  existe no caminho da plataforma.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Duas citações antigas do exit 0 do harness continuavam sem nomear o controle**

- **Found during:** Task 3, ao varrer `docs/PENDENCIAS.md` atrás de tudo que cita o
  instrumento
- **Issue:** o plano nomeia a criação da seção de fechamento, mas o mesmo arquivo já citava
  o exit 0 do harness em dois outros lugares — o bloco `>` de "hardening da Data API
  executado na Phase 1" e a linha "Superfície `anon`" da tabela de evidências do 01-08.
  Deixá-los como estavam violaria a truth 3 do próprio plano ("nenhum documento do projeto
  volta a citar o exit 0 sem nomear o controle que o sustenta") e, pior, os dois pontos são
  os que um leitor apressado encontra primeiro.
- **Fix:** anotação em ambos com a condição e o ponteiro para a seção nova; no segundo, a
  anotação entrou na própria célula, o que produziu a única linha substituída do diff.
- **Files modified:** `docs/PENDENCIAS.md`
- **Commit:** `45245f1`

---

**Total deviations:** 1 (coerência documental, dentro de `files_modified`)
**Impact on plan:** nenhum critério de aceite afrouxado; nenhum arquivo fora dos dois
declarados; nenhum item de UAT marcado; `REQUIREMENTS.md` intocado.

## Issues Encountered

**Nenhum bloqueio.** Um ponto de atenção registrado por honestidade: a consulta de
`pg_default_acl` devolve mais linhas do que as quatro da tabela do adendo — schemas `auth`,
`extensions`, `graphql`, `graphql_public`, `realtime` e `storage`. Duas delas concedem `anon`
e `authenticated` (`graphql`/`graphql_public`, criados por `supabase_admin`, e `storage`,
criado por `postgres`). Nenhuma contradiz a regra qualificada, que fala do schema `public`, e
`storage` já está descrito no `CLAUDE.md` como superfície deliberadamente sem RLS servida
pelas actions. Registrei isso aqui, e não no `docs/03`, porque a alínea (a) trata de Data API
no `public` e alargar o escopo dela seria expandir o plano.

## Known Stubs

Nenhum. Nenhum arquivo de código foi tocado, nenhum teste foi pulado, nenhum `<verify>` ficou
sem rodar, e nenhuma afirmação escrita nos dois documentos existe sem o comando
correspondente ter sido executado nesta sessão.

## Threat Flags

Nenhuma superfície nova de rede, auth, acesso a arquivo ou schema — o plano não altera
comportamento. Sobre o registro do próprio plano, contra o `<threat_model>`:

- **T-01-19-01** (regra de SC4 sem qualificar a role) — **mitigado**: a alínea (a) diz para
  qual role vale, com a tabela medida e a consulta re-executável.
- **T-01-19-02** (tabela criada pelo caminho da plataforma) — **aceito com registro**: item
  aberto em `docs/PENDENCIAS.md`, dono nomeado, gatilho na próxima habilitação de extensão ou
  recurso gerenciado, conferência apontando para a consulta.
- **T-01-19-03** (documento citando exit 0 de instrumento) — **mitigado nos três pontos de
  citação**, não só no novo. Ver a deviation.
- **T-01-19-04** (item de UAT marcado por executor) — **mitigado e conferido por comando**
  três vezes (antes da edição, depois da edição, depois do hook): 7 abertas, 0 marcadas. As
  seções novas foram escritas com listas `-` simples e sem nenhuma caixa de seleção, para não
  inflar a contagem que serve de controle.
- **T-01-19-05** (rótulos `WR-*` colidindo entre rodadas) — **mitigado**: a origem de cada
  conjunto está escrita antes das listas, com o comando que recupera o relatório da 1ª rodada
  do histórico do git, e a colisão foi verificada rótulo a rótulo em vez de presumida.
- **T-01-19-SC** (supply chain) — não se aplica: nenhum install, `package.json` e
  `pnpm-lock.yaml` intocados, diff restrito a dois arquivos de markdown.

## User Setup Required

Nenhum para desenvolver. **Para o owner, o que continua aberto e nomeado:**

1. **Os sete itens de UAT humano** em `docs/PENDENCIAS.md` §"🧪 UAT humano pendente da Phase
   1" — contados nesta sessão, intocados, e só o owner os fecha.
2. **A rotação das signing keys do QStash** (`:806`), com data-limite 2026-08-05 — este plano
   não a tocou.
3. **A escapada de plataforma**, item novo: quando habilitar a próxima extensão ou recurso
   gerenciado da Supabase, reexecutar a consulta de `pg_default_acl` do `docs/03` antes de
   assumir que a tabela nasceu fechada.

## Next Phase Readiness

**A rodada está fechada do lado do executor e pode ser reverificada.** Os dois gaps
bloqueantes da 3ª verificação foram fechados por código (01-17 e 01-18) e agora estão
refletidos no registro, na ordem certa: prova primeiro, documento depois. O resíduo do SC4
deixou de ser afirmação sem qualificação e virou regra com alcance declarado, medição própria
e gatilho de conferência.

**O que continua aberto está escrito com dono:** sete itens de UAT humano, dez warnings da 2ª
rodada como ponteiros, quatro achados diferidos da 1ª, a rotação de chave com prazo e a
escapada de plataforma. Nenhum requisito foi marcado como completo aqui — a marcação é do
fluxo de verificação, e este plano se proibiu de tocar `REQUIREMENTS.md`.

## Self-Check: PASSED

Arquivos declarados, conferidos por existência no disco:

```
FOUND: docs/03-PADROES_DE_BANCO_DE_DADOS.md
FOUND: docs/PENDENCIAS.md
FOUND: .planning/phases/01-hardening-da-superf-cie-p-blica/01-19-SUMMARY.md
```

Commits declarados, conferidos por `git log`:

```
FOUND: afc4336   (Task 2)
FOUND: 45245f1   (Task 3)
```

Nenhuma deleção de arquivo rastreado em nenhum dos dois commits
(`git diff --diff-filter=D --name-only HEAD~1 HEAD` vazio nas duas verificações).

---

_Phase: 01-hardening-da-superf-cie-p-blica_
_Completed: 2026-07-22_
