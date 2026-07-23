---
phase: 01-hardening-da-superf-cie-p-blica
plan: 17
subsystem: testing
tags: [bash, harness, postgrest, supabase, data-api, rls, privilegios, controle-negativo]

requires:
    - phase: 01-hardening-da-superf-cie-p-blica (plano 01-15)
      provides: "harness de superfície anônima com veredito COBERTURA e exigência de 42501 (fechamento do WR-08 no eixo do NOME da tabela)"
    - phase: 01-hardening-da-superf-cie-p-blica (planos 01-05 e 01-12)
      provides: "os dois harnesses irmãos que servem de analog de gerência de processo e de formato de quatro vereditos"
provides:
    - "scripts/verificar-controle-harness-anon.sh — controle re-executável do instrumento, quatro vereditos, que reprova de propósito nos três estados em que o harness não tem o que medir"
    - "contador ESPERADAS em verificar-superficie-anon.sh: zero prova positiva passa a sair 2 em vez de imprimir frase de fechamento"
    - "veredito ALVO (identidade do alvo) por par referência + canário, rodado antes de todas as checagens e sempre, inclusive com filtro"
    - "o direito de citar o exit 0 de verificar-superficie-anon.sh como evidência de SEG-01/02/03"
affects: [01-18, 01-19, verificacao-4a-rodada, phase-07, phase-09]

tech-stack:
    added: []
    patterns:
        - "Controle de instrumento: o harness que certifica ganha um harness que o reprova, e o controle nasce vermelho antes do conserto"
        - "Stub HTTP efêmero em node:http dentro de mktemp -d para medir como um verificador reage a um alvo que mente — sem Docker, sem dependência nova"
        - "Ambiente sintético ESCRITO pelo script (host .invalid da RFC 2606 + valor de chave obviamente falso), nunca copiado do ambiente real"

key-files:
    created:
        - scripts/verificar-controle-harness-anon.sh
    modified:
        - scripts/verificar-superficie-anon.sh

key-decisions:
    - "Exit 0 de harness de segurança exige PROVA POSITIVA, não ausência de reprovação: com o alvo mudo, ausência de reprovação é ausência de medição — e o contador ESPERADAS é o que transforma isso em código de saída 2"
    - "Identidade do alvo é veredito de BATERIA, não checagem: entra ao lado da COBERTURA (decisão add-alongside), não conta como checagem nem alimenta o contador de prova positiva, e roda SEMPRE — escopo reduzido pode dispensar cobertura, nunca identidade"
    - "Fechamento se prova por PAR, não por sonda única: referência declarada respondendo 42501 (o host respondeu, é um PostgREST, o portão do Postgres se pronunciou) + canário inexistente respondendo PGRST205 (o alvo sabe dizer não-existe). Indistinguíveis, sai 2"
    - "O canário tem guarda própria: se o nome passar a constar dos schemas declarativos o script ABORTA — canário que existe não distingue nada, e um canário sem função é o mesmo defeito por outra porta"
    - "O terceiro eixo de falso verde (alvo que nega TUDO uniformemente) não estava no code review nem no relatório de verificação e entrou como veredito TUDO_NEGADO — sem ele o conserto fecharia um eixo e abriria outro pela terceira vez"

patterns-established:
    - "Controle negativo executado dentro da própria task: a guarda do canário foi vista falhando (canário = assinaturas → aborto 2) antes de a constante ser revertida — condicional que ninguém viu falhar não é guarda"
    - "Contrafactual completo no relatório: 4 vereditos vermelhos antes do conserto e 4 verdes depois, colados lado a lado, é o que distingue 'consertou' de 'sempre esteve assim'"

requirements-completed: [SEG-01, SEG-02, SEG-03]

coverage:
    - id: D1
      description: "O harness de superfície anônima não emite mais afirmação positiva de fechamento a partir de zero medição: sem nenhuma checagem ESPERADA ele sai 2 nomeando a causa"
      requirement: SEG-01
      verification:
          - kind: integration
            ref: "bash scripts/verificar-controle-harness-anon.sh (veredito ALVO_MORTO) — harness saiu 2 contra host .invalid, frase de fechamento ausente"
            status: pass
      human_judgment: false
    - id: D2
      description: "O harness distingue 'tabela fechada' de 'este não é o banco deste projeto': o veredito ALVO exige referência declarada com 42501 e canário inexistente com PGRST205"
      requirement: SEG-02
      verification:
          - kind: integration
            ref: "bash scripts/verificar-controle-harness-anon.sh (vereditos PROJETO_ERRADO e TUDO_NEGADO) — harness saiu 2 nos dois modos do stub"
            status: pass
          - kind: integration
            ref: "bash scripts/verificar-superficie-anon.sh — linha [ALVO] com referência 'agendamentos' HTTP 401/42501 e canário HTTP 404/PGRST205"
            status: pass
      human_judgment: false
    - id: D3
      description: "O instrumento ganhou controle próprio e re-executável, provado capaz de medir a falha ANTES do conserto"
      requirement: SEG-03
      verification:
          - kind: integration
            ref: "bash scripts/verificar-controle-harness-anon.sh — 1ª execução (commit 4308161): 4 vereditos, 4 REPROVADO(S), exit 1; 2ª execução (commit 59ded5a): 4 vereditos, 0 reprovados, exit 0"
            status: pass
      human_judgment: false
    - id: D4
      description: "O veredito do harness sobre o alvo real não regrediu: 11 checagens ESPERADO por 42501 e COBERTURA 9 declaradas / 9 cobertas"
      requirement: SEG-01
      verification:
          - kind: integration
            ref: "bash scripts/verificar-superficie-anon.sh — exit 0, 11 checagens, 11 com prova positiva, COBERTURA 9/9"
            status: pass
          - kind: integration
            ref: "bash scripts/verificar-fail-fast-boot.sh — 4 vereditos, 0 reprovados (harness irmão não afetado)"
            status: pass
      human_judgment: false
    - id: D5
      description: "A guarda do canário foi demonstrada falhando (controle negativo executado e revertido na mesma task)"
      verification:
          - kind: integration
            ref: "TABELA_CANARIO='assinaturas' → bash scripts/verificar-superficie-anon.sh → exit 2 nomeando o canário; constante revertida"
            status: pass
      human_judgment: false

duration: 25min
completed: 2026-07-22
status: complete
---

# Phase 1 Plano 17: Conserto do instrumento antes de medir — Summary

**`verificar-superficie-anon.sh` deixou de poder afirmar fechamento sem ter medido: um contador de prova positiva decide o exit code e um par referência+canário prova que o alvo é o banco deste projeto — com um controle re-executável de quatro vereditos que nasceu vermelho antes do conserto.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-22T20:48:00Z (aprox.)
- **Completed:** 2026-07-22T21:13:28Z
- **Tasks:** 2
- **Files modified:** 2 (1 criado, 1 alterado)

## Accomplishments

- **O falso verde virou comando.** `scripts/verificar-controle-harness-anon.sh` reproduz por script os três estados em que o harness não tem o que medir e exige que ele reprove nos três. Não é mais preciso "conferir com atenção": roda-se o controle.
- **Prova positiva passou a decidir o exit code.** O contador `ESPERADAS` incrementa no ramo final de `registrar()`; com ele em zero o script sai **2** nomeando a causa (alvo inalcançável, projeto errado ou rede caída) em vez de imprimir a frase de fechamento. Era o defeito exato de `:398-401`, onde `INCONCLUSIVAS` era impresso e descartado.
- **A identidade do alvo passou a ser medida em toda execução.** O veredito `ALVO` roda antes de todas as checagens e sempre — inclusive com filtro na linha de comando. Referência: a primeira tabela declarada que responder `42501`. Canário: `tabela_canario_do_harness_9f3a2b`, que tem de responder `PGRST205`/404 e **nunca** `42501`. Indistinguíveis, sai 2 imprimindo as duas sondas lado a lado.
- **Um terceiro eixo de falso verde foi fechado — e ele não estava em relatório nenhum.** Um alvo que nega tudo uniformemente (gateway hostil, proxy autenticando na frente, rate limit devolvendo 401) é indistinguível de fechamento real para qualquer sonda que só olhe tabelas que existem. O veredito `TUDO_NEGADO` é o que denuncia.
- **O veredito sobre o alvo real não mudou.** 11 checagens `ESPERADO` por `42501`, `COBERTURA` 9/9, exit 0. O que mudou foi o direito de citar esse exit 0 como evidência.

## Task Commits

1. **Task 1 (tracer): O controle do instrumento nasce e REPROVA** — `4308161` (test)
2. **Task 2: O harness ganha prova positiva e controle de identidade do alvo** — `59ded5a` (fix)

## O contrafactual completo — vermelho antes, verde depois

### Antes do conserto (commit `4308161`, `bash scripts/verificar-controle-harness-anon.sh` → **exit 1**)

```
Controle do harness de superfície anônima
Harness sob controle: scripts/verificar-superficie-anon.sh   |   Porta do stub: 3993

  [REPROVADO] ALVO_MORTO      o harness saiu 0 (exigido 2) e imprimiu a frase de fechamento=1 (exigido 0) — host reservado por RFC 2606 que não resolve: toda checagem vira HTTP 000 e nada foi medido
  --- últimas linhas do relatório do harness (ALVO_MORTO) ---
  - whatsapp_configs — GET ?select=tenant_id&limit=1 — HTTP 000 sem 42501 — não provou permissão negada (rede/gateway/rate limit?):
  - disparos_whatsapp — GET ?select=tenant_id&limit=1 — HTTP 000 sem 42501 — não provou permissão negada (rede/gateway/rate limit?):

Resumo: 11 checagem(ns), 0 reprovada(s) — a role anon não devolveu linha nenhuma.
  [REPROVADO] PROJETO_ERRADO  o harness saiu 0 (exigido 2) e imprimiu a frase de fechamento=1 (exigido 0) — alvo em que nenhuma tabela declarada existe: o harness confere os nomes contra arquivos LOCAIS, então tudo vira ESPERADO sem que o banco deste projeto tenha sido tocado
  --- últimas linhas do relatório do harness (PROJETO_ERRADO) ---

  [COBERTURA]    todas as tabelas declaradas                             9 declarada(s), 9 coberta(s) por pelo menos uma checagem

Resumo: 11 checagem(ns), 0 reprovada(s) — a role anon não devolveu linha nenhuma.
  [REPROVADO] TUDO_NEGADO     o harness saiu 0 (exigido 2) e imprimiu a frase de fechamento=1 (exigido 0) — alvo que nega TUDO indiscriminadamente, inclusive nome inexistente: gateway hostil e fechamento real ficam indistinguíveis sem sonda de canário
  --- últimas linhas do relatório do harness (TUDO_NEGADO) ---

  [COBERTURA]    todas as tabelas declaradas                             9 declarada(s), 9 coberta(s) por pelo menos uma checagem

Resumo: 11 checagem(ns), 0 reprovada(s) — a role anon não devolveu linha nenhuma.
  [REPROVADO] CONTROLE        o harness real saiu 0 (exigido 0) e imprimiu o rótulo [ALVO]=0 (exigido 1) — exit 0 sem veredito de identidade do alvo não distingue 'é este banco' de 'o instrumento não olha para o alvo'

Resumo: 4 vereditos, 4 REPROVADO(S):
  - ALVO_MORTO — o harness saiu 0 (exigido 2) e imprimiu a frase de fechamento=1 (exigido 0) — ...
  - PROJETO_ERRADO — o harness saiu 0 (exigido 2) e imprimiu a frase de fechamento=1 (exigido 0) — ...
  - TUDO_NEGADO — o harness saiu 0 (exigido 2) e imprimiu a frase de fechamento=1 (exigido 0) — ...
  - CONTROLE — o harness real saiu 0 (exigido 0) e imprimiu o rótulo [ALVO]=0 (exigido 1) — ...
```

**A linha que reproduz o gap por comando**, exatamente como o critério de aceite exige:

> `[REPROVADO] ALVO_MORTO   o harness saiu 0 (exigido 2) e imprimiu a frase de fechamento=1 (exigido 0) — host reservado por RFC 2606 que não resolve: toda checagem vira HTTP 000 e nada foi medido`

E a distinção que o `CONTROLE` deixa legível: o harness real **já saía 0** — a reprovação dele é por **ausência do rótulo `[ALVO]`**, não por veredito errado. "O veredito está certo" e "o instrumento não mede" são coisas diferentes, e o relatório diz qual das duas está acontecendo.

### Depois do conserto (commit `59ded5a`, mesmo comando → **exit 0**)

```
Controle do harness de superfície anônima
Harness sob controle: scripts/verificar-superficie-anon.sh   |   Porta do stub: 3993

  [APROVADO]  ALVO_MORTO      o harness saiu 2 e não afirmou fechamento — host reservado por RFC 2606 que não resolve: toda checagem vira HTTP 000 e nada foi medido
  [APROVADO]  PROJETO_ERRADO  o harness saiu 2 e não afirmou fechamento — alvo em que nenhuma tabela declarada existe: o harness confere os nomes contra arquivos LOCAIS, então tudo vira ESPERADO sem que o banco deste projeto tenha sido tocado
  [APROVADO]  TUDO_NEGADO     o harness saiu 2 e não afirmou fechamento — alvo que nega TUDO indiscriminadamente, inclusive nome inexistente: gateway hostil e fechamento real ficam indistinguíveis sem sonda de canário
  [APROVADO]  CONTROLE        contra o alvo real o harness saiu 0 e imprimiu o veredito [ALVO] — o instrumento aprova o que deve aprovar

Resumo: 4 vereditos, 0 reprovados — o harness reprova nos três estados em que não tem o que medir e aprova o alvo real.
```

### O harness real, depois do conserto (`bash scripts/verificar-superficie-anon.sh` → **exit 0**)

```
Verificação da superfície anônima da Data API
Alvo: https://<projeto>.supabase.co
Escopo: todas as tabelas operacionais
Tabelas derivadas de supabase/schemas/*.sql (9): agendamentos assinaturas clientes disparos_whatsapp excecoes_agenda horarios_funcionamento perfis_empresas servicos whatsapp_configs
ESPERADO exige 42501 no corpo, ou PGRST205/404 em nome declarado.

  [ALVO]         identidade confirmada por referência + canário        referência 'agendamentos' HTTP 401/42501 | canário 'tabela_canario_do_harness_9f3a2b' HTTP 404: {"code":"PGRST205",...}

  [ESPERADO]     perfis_empresas — GET ?select=*                       HTTP 401/42501: {"code":"42501",...}
  [ESPERADO]     perfis_empresas — GET ?select=tenant_id,telefone_contato HTTP 401/42501: {"code":"42501",...}
  [ESPERADO]     agendamentos — POST anônimo                           HTTP 401/42501: {"code":"42501",...}
  [ESPERADO]     clientes — POST anônimo                               HTTP 401/42501: {"code":"42501",...}
  [ESPERADO]     agendamentos — GET ?select=cliente_id                  HTTP 401/42501: {"code":"42501",...}
  [ESPERADO]     excecoes_agenda — GET ?select=motivo                   HTTP 401/42501: {"code":"42501",...}
  [ESPERADO]     servicos — GET ?select=tenant_id&limit=1               HTTP 401/42501: {"code":"42501",...}
  [ESPERADO]     horarios_funcionamento — GET ?select=tenant_id&limit=1 HTTP 401/42501: {"code":"42501",...}
  [ESPERADO]     assinaturas — GET ?select=tenant_id&limit=1            HTTP 401/42501: {"code":"42501",...}
  [ESPERADO]     whatsapp_configs — GET ?select=tenant_id&limit=1       HTTP 401/42501: {"code":"42501",...}
  [ESPERADO]     disparos_whatsapp — GET ?select=tenant_id&limit=1      HTTP 401/42501: {"code":"42501",...}

  [COBERTURA]    todas as tabelas declaradas                             9 declarada(s), 9 coberta(s) por pelo menos uma checagem

Resumo: 11 checagem(ns), 11 com prova positiva, 0 reprovada(s) — a role anon não devolveu linha nenhuma.
```

Comparado com a linha de base medida no início deste plano (`11 checagem(ns), 0 reprovada(s)`), o veredito sobre o alvo real é o mesmo — mudou a contagem de prova positiva impressa (`11 com prova positiva`) e entrou a linha `[ALVO]`.

### Controle negativo do canário (executado e revertido nesta task)

Com `TABELA_CANARIO='assinaturas'` (nome que EXISTE nos schemas):

```
Verificação da superfície anônima da Data API
Alvo: https://<projeto>.supabase.co
...
ERRO: o canário 'assinaturas' consta de supabase/schemas/*.sql — um canário que existe não distingue nada, e a bateria voltaria a não saber dizer se o alvo é este banco.
EXIT=2
```

A constante foi revertida para `tabela_canario_do_harness_9f3a2b` antes do commit (`git diff` do commit `59ded5a` confirma o valor final). Sem esta demonstração, a guarda seria uma condicional que ninguém viu falhar.

## Files Created/Modified

- `scripts/verificar-controle-harness-anon.sh` (**novo**, 339 linhas) — controle re-executável de quatro vereditos. Sobe um stub HTTP em `node:http` (escrito por heredoc dentro de `mktemp -d`, modo por argumento), monta ambiente sintético e mede o exit code do harness sob teste. `set -m` só no lançamento, PID em `$!`, `kill -- -"$PID"` no `trap`; `setsid` proibido. Porta em `PORTA_CONTROLE` (padrão 3993), aborto com 2 se ocupada ou se o stub não subir.
- `scripts/verificar-superficie-anon.sh` (**alterado**, +131 / −3) — contador `ESPERADAS`, constante `TABELA_CANARIO`, sondas de referência e canário, veredito `ALVO`, portão de prova positiva antes do "Resumo", e cabeçalho reescrito com o significado enumerado do exit 0 e o nome do controle.

## Decisions Made

- **Exit 0 de harness de segurança exige prova positiva, não ausência de reprovação.** Contra um alvo mudo, "nenhuma reprovação" e "nenhuma medição" produzem o mesmo relatório. O contador `ESPERADAS` é o que separa os dois — e ele decide o exit code, senão seria mais um número impresso e descartado, como `INCONCLUSIVAS` era.
- **Identidade do alvo é veredito de bateria (decisão `add-alongside` do plano, mantida).** `ALVO` entra ao lado da `COBERTURA`: não conta como checagem, não alimenta o contador de prova positiva, tem rótulo próprio. O gatilho de promoção continua escrito: um **terceiro** controle de nível de bateria (por exemplo "a chave usada é mesmo a publicável") deixa de justificar um quarto bloco solto e passa a exigir um conceito próprio com registrador e contagem.
- **`ALVO` roda sempre, inclusive com filtro na linha de comando.** Escopo reduzido pode dispensar cobertura — não pode dispensar saber contra o que se está medindo.
- **Os três cenários negativos do controle exigem exit 2 E ausência da frase de fechamento.** O plano exigia só o exit 2; a asserção extra é estritamente mais forte e custa nada: um relatório que sai 2 e ainda afirma fechamento seria o mesmo defeito por outra porta.
- **A referência é a primeira tabela declarada que responder `42501`, varrendo a lista derivada** — nunca um nome redigitado. Uma tabela renomeada numa fase futura não quebra o veredito, e `PGRST205` na referência não serve por ser exatamente o sinal ambíguo que o veredito existe para desfazer.

## Deviations from Plan

Nenhuma deviation de regra 1-4. Duas notas de execução, registradas por honestidade:

**1. Asserção mais forte que a pedida nos cenários negativos.** O plano exigia `exit code == 2` para `PROJETO_ERRADO` e `TUDO_NEGADO`; a implementação exige também ausência da frase de fechamento, como já era exigido de `ALVO_MORTO`. É estritamente mais restritivo, satisfaz o critério literal, e está escrito junto do código.

**2. `git status --porcelain` lista dois caminhos, não um.** O critério de escopo da Task 1 pedia "exatamente um arquivo novo". `.planning/STATE.md` aparecia como modificado **antes de qualquer edição minha** — é a escrituração do próprio orquestrador desta execução (`Phase: … — EXECUTING`, `Plan: 1 of 19`), não produto deste plano. Escopo do plano conferido pelo caminho que importa: `git diff --name-only c8e2205..HEAD` lista **apenas** os dois arquivos de `scripts/`, e `grep -E '^(src/|supabase/|package\.json)'` sobre essa lista devolve vazio.

**Total deviations:** 0 auto-fixed.
**Impact on plan:** nenhum. O plano foi executado na ordem que ele mesmo prescreve — controle primeiro, vermelho, e só então o conserto.

## Verificação do plano (os 6 itens)

| # | Comando | Resultado |
|---|---|---|
| 1 | `bash scripts/verificar-controle-harness-anon.sh` | **exit 1** na Task 1 (4 reprovados) e **exit 0** na Task 2 (4 aprovados) — as duas saídas coladas acima |
| 2 | `bash scripts/verificar-superficie-anon.sh` | **exit 0**, `[ALVO]` aprovado, 11 checagens ESPERADO por `42501`, COBERTURA 9/9 |
| 3 | Controle negativo do canário | **exit 2** nomeando o canário; saída colada; constante revertida |
| 4 | `bash scripts/verificar-fail-fast-boot.sh` | **exit 0** — `4 vereditos, 0 reprovados` (BUILD, MORTE, CONTROLE, WEBHOOK) |
| 5 | `pnpm lint` | **exit 0** |
| 6 | `pnpm test` | **exit 0** — 15 arquivos, **228 testes**, mesma contagem do início do plano (suíte continua hermética) |

Asserções de escopo e de segredo:

| Asserção | Comando | Resultado |
|---|---|---|
| Nenhuma variável secreta referenciada no controle | `grep -vE '^[[:space:]]*#' scripts/verificar-controle-harness-anon.sh \| grep -cE 'SECRET_KEY\|SERVICE_ROLE\|QSTASH_\|EVOLUTION_\|RESEND_'` | `0` |
| Ambiente sintético escrito, não copiado | `grep -c 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=' scripts/verificar-controle-harness-anon.sh` | `1` |
| `setsid` ausente do código | `grep -vE '^[[:space:]]*#' … \| grep -c setsid` | `0` |
| Contador decide o exit code | `grep -vE '^[[:space:]]*#' scripts/verificar-superficie-anon.sh \| grep -c 'ESPERADAS'` | `5` (≥ 3 exigido) |
| Sem resíduo | `ls -d /tmp/tmp.*` após a execução; porta 3993 | vazio; **LIVRE** |
| Caminho público intocado | `git diff --name-only c8e2205..HEAD \| grep -E '^(src/\|supabase/\|package\.json)'` | **NENHUM** |

## Issues Encountered

Nenhum. O único ponto que exigia medição antes de decidir — se o PostgREST responderia `PGRST205` ou `42501` a um nome de tabela inexistente sob a role `anon` sem privilégio nenhum — foi resolvido pela própria execução: `HTTP 404` com `PGRST205`, o que é o que torna o par referência+canário discriminante neste projeto. Se um dia deixar de ser (uma versão do PostgREST que checasse privilégio antes de resolver o nome), o veredito `ALVO` reprova e sai 2 em vez de degradar silenciosamente — que é o comportamento correto.

## User Setup Required

Nenhum — nada de externo a configurar.

## Next Phase Readiness

- **O plano 01-18 pode afirmar o que vai afirmar.** Ele fecha o DoS por entrada não validada na superfície pública e vai medir superfície; a única bateria automatizada que mede superfície agora sabe dizer "não medi".
- **O plano 01-19 ganha um artefato a mais para reexecutar** sobre o HEAD final: as 8 provas encadeadas passam a ser 9, com `verificar-controle-harness-anon.sh` incluído. O gate dele deve rodar o controle **antes** de citar o exit 0 do harness.
- **Para a 4ª verificação:** o gap "checagem que não prova nada não pode passar" tem agora reprodução por comando nos dois sentidos. Reprovar o conserto é reverter o commit `59ded5a` e ver os quatro vereditos voltarem ao vermelho.
- **Aviso que sobrevive a este plano:** `ROADMAP.md:195` e `01-04-PLAN.md:170` citam o exit 0 deste harness como prova de SEG-01/02/03. Essa citação volta a ser legítima — mas só junto do controle. Um exit 0 do harness sem o controle ter sido rodado alguma vez continua sendo uma afirmação sobre um instrumento que ninguém conferiu.

## Self-Check: PASSED

- `scripts/verificar-controle-harness-anon.sh` — FOUND
- `scripts/verificar-superficie-anon.sh` — FOUND
- `.planning/phases/01-hardening-da-superf-cie-p-blica/01-17-SUMMARY.md` — FOUND
- Commits `4308161`, `59ded5a`, `05013be` — todos presentes em `git log --all`

---

_Phase: 01-hardening-da-superf-cie-p-blica_
_Plan: 17_
_Completed: 2026-07-22_
