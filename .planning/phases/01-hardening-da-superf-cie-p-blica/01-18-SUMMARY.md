---
phase: 01-hardening-da-superf-cie-p-blica
plan: 18
subsystem: superfície pública de leitura (Server Action anônima + engine de disponibilidade)
tags: [seguranca, dos, validacao-de-entrada, friccao-zero, harness]
requires:
    - 01-17 (harness de superfície anônima consertado — o instrumento que mede fechamento)
    - 01-12 (fronteira de flight com discriminante, harness de travessia com 5 vereditos)
    - 01-10 (MotivoPublico e os dois Record exaustivos de mensagens.ts)
provides:
    - "obterSlotsPublicos recusa entrada hostil ANTES de createAdminClient() e da resolução do slug"
    - "gerarSlotsAntiBuraco tem guarda de profundidade na primeira linha (invariante da função pura)"
    - "obterSlotsDashboard valida duracaoMinutos, restaurando a simetria com o fluxo público"
    - "scripts/verificar-travessia-server-action.sh com 7 vereditos (ENTRADA_HOSTIL e DATA_HOSTIL)"
affects:
    - src/app/actions/public-booking.ts
    - src/lib/booking-engine.ts
    - src/app/actions/agendamentos.ts
    - src/lib/__tests__/booking-engine.test.ts
    - scripts/verificar-travessia-server-action.sh
tech-stack:
    added: []
    patterns:
        - "Validação de entrada na FRONTEIRA da Server Action pública, antes de qualquer I/O"
        - "Invariante replicado na função pura: fronteira é porteiro, função pura é contrato"
        - "Veredito de harness que assere ORDEM por asserção NEGATIVA (ausência de slug_invalido)"
key-files:
    created: []
    modified:
        - src/app/actions/public-booking.ts
        - src/lib/booking-engine.ts
        - src/app/actions/agendamentos.ts
        - src/lib/__tests__/booking-engine.test.ts
        - scripts/verificar-travessia-server-action.sh
decisions:
    - "Alias próprio MotivoSlotsPublicos em vez de alargar MotivoLeituraPublica — cada tipo diz o que o seu produtor produz"
    - "Teto de duração = 1440 min, seguro por construção: janelas de funcionamento são horas dentro de um dia"
    - "Entrada hostil não é logada nem reportada — logar cada uma transformaria o endpoint em vetor de inundação de log"
    - "obterSlotsDashboard mantém `throw` (não vira discriminante) — o dashboard tem sessão, tela e error boundary próprio"
metrics:
    duration: ~31min
    tasks: 2
    files: 5
    completed: 2026-07-22
requirements: [SEG-01, SEG-02]
status: complete
---

# Phase 01 Plan 18: Fronteira pública recusa entrada hostil — Summary

Uma requisição anônima com `duracaoMinutos = -5000000` custava **26.751 ms e 19,29 MB** de event loop parado; passou a custar **6 ms e 109 bytes**, recusada na fronteira antes de `createAdminClient()` e antes de o slug ser resolvido — provado por dois vereditos de harness vistos vermelhos antes e verdes depois, contra build de produção.

## O que foi feito

### Task 1 — a fronteira pública recusa antes de gastar I/O (commit `6577f5b`)

O harness de travessia ganhou `ENTRADA_HOSTIL` e `DATA_HOSTIL` **antes** do conserto, reusando `sondar_action()` e o id derivado do manifesto. A asserção dos dois é mais forte que a de `avaliar_travessia`: além de exigir o discriminante e a ausência de `digest`, cada um exige a **ausência de `slug_invalido`** no corpo — é o que prova a ORDEM, e não só o discriminante.

Depois, a validação entrou no topo de `obterSlotsPublicos`: `dateStr` contra a **mesma regex** que o fluxo autenticado já usava, mais a checagem de que a data existe no calendário (reserialização — sem ela, mês 13 e dia 45 passam na regex e voltam a produzir grade errada sem sintoma); `duracaoMinutos` inteiro, positivo e não maior que `DURACAO_MAXIMA_MINUTOS` (24×60).

`ResultadoSlots` passou a usar `MotivoSlotsPublicos`, alias próprio formado por `MotivoLeituraPublica` mais `data_invalida` e `servico_invalido`. `MotivoLeituraPublica` ficou intacto: ele descreve o que a **resolução de perfil** produz, e a resolução não sabe produzir esses dois.

### Task 2 — o invariante mora também na função pura (commit `28c3fde`)

`gerarSlotsAntiBuraco` ganhou a guarda na **primeira linha** (`booking-engine.ts:153`). A fronteira da action é o porteiro; esta é o contrato — a função é exportada e pura, e um terceiro chamador futuro herda a proteção.

`obterSlotsDashboard` passou a validar `duracaoMinutos` ao lado do `dateStr` que já validava, no mesmo estilo de recusa (`throw`) que a função pratica. Era o fluxo **autenticado** validando menos que devia.

## Evidências — saída real colada

### 1. Fail-first do harness (ANTES do conserto) — exit 1

```
  [REPROVADO] ENTRADA_HOSTIL    contém servico_invalido=0 (exigido 1), contém digest=0 (exigido 0), contém slug_invalido=1 (exigido 0) — corpo observado: 0:{"a":"$@1",…}|1:{"ok":false,"motivo":"slug_invalido"}
  [REPROVADO] DATA_HOSTIL       contém data_invalida=0 (exigido 1), contém digest=0 (exigido 0), contém slug_invalido=1 (exigido 0) — corpo observado: 0:{"a":"$@1",…}|1:{"ok":false,"motivo":"slug_invalido"}

Resumo: 7 vereditos, 2 REPROVADO(S):
EXIT=1
```

O corpo de cada um mostrava `slug_invalido` — a prova de que hoje a validação nem existia e o que respondia era a resolução de slug, depois de duas consultas ao banco.

### 2. Harness DEPOIS do conserto — exit 0, sete vereditos

```
  [APROVADO]  PREPARO           ids de obterSlotsPublicos (prefixo 70efdce3…) e criarAgendamentoPublico (prefixo 40488c27…) derivados de .next/server/server-reference-manifest.json
  [APROVADO]  CONTROLE          GET / devolveu 200 e o processo seguiu vivo
  [APROVADO]  SLOTS_ERRO        o corpo da resposta carrega o discriminante `slug_invalido` e nenhum `digest` opaco
  [APROVADO]  ESCRITA_VALIDACAO o corpo da resposta carrega o discriminante `campos_obrigatorios` e nenhum `digest` opaco
  [APROVADO]  ENTRADA_HOSTIL    recusado na fronteira com `servico_invalido`, sem `digest` e sem `slug_invalido` (o slug nem chegou a ser resolvido)
  [APROVADO]  DATA_HOSTIL       recusado na fronteira com `data_invalida`, sem `digest` e sem `slug_invalido` (o slug nem chegou a ser resolvido)
  [APROVADO]  SEM_VAZAMENTO     nenhum dos quatro corpos carrega o slug do visitante, org_, PGRST ou tenant_id

Resumo: 7 vereditos, 0 reprovados
EXIT=0
```

**Os dois corpos observados depois do conserto**, capturados em tempo de execução (não lidos de arquivo):

```
ENTRADA_HOSTIL: 0:{"a":"$@1","f":"","q":"","i":false,"b":"EM5NgbLzytxPbbF9zLXM5"}|1:{"ok":false,"motivo":"servico_invalido"}
DATA_HOSTIL:    0:{"a":"$@1","f":"","q":"","i":false,"b":"EM5NgbLzytxPbbF9zLXM5"}|1:{"ok":false,"motivo":"data_invalida"}
```

Nenhum dos dois carrega `slug_invalido`.

### 3. Teto MEDIDO por HTTP contra `next start` do build de produção, slug real `avantis`

| Payload | ANTES (relatório de verificação) | DEPOIS (medido nesta execução) |
|---|---|---|
| `duracaoMinutos=30` (legítimo) | 525 ms / 2.179 bytes | **799 ms / 2.180 bytes**, `{"ok":true,"slots":[…]}` |
| `duracaoMinutos=-100000` | 1.123 ms / 378.054 bytes | **10 ms / 109 bytes**, `servico_invalido` |
| `duracaoMinutos=-5000000` | **26.751 ms / 19.291.480 bytes** | **6 ms / 109 bytes**, `servico_invalido` |
| `dateStr="nao-e-uma-data"` | `{"ok":true,"slots":[]}` (grade errada sem sintoma) | **7 ms / 106 bytes**, `data_invalida` |

Critério de aceite era `< 1.000 ms` e `< 10.000 bytes` para o caso de `-5000000`: observados **6 ms** e **109 bytes** — três ordens de grandeza abaixo do que abriu o gap, e abaixo da própria linha de base legítima.

**Registro honesto, como o plano exigiu:** com a guarda no topo, a resposta não depende mais de o slug resolver nem de a data ter janela ativa. A comparação continua válida porque a guarda **removeu a possibilidade de alcançar o laço**, não porque as duas execuções sejam idênticas. O caso legítimo saiu em 799 ms contra os 525 ms do relatório — mesma ordem, máquina sob carga de build; o que importa é que a **grade completa continua saindo** (2.180 bytes de slots reais, `08:00`, `08:30`, `08:45`, …), que é o controle positivo de Fricção Zero.

### 4. Fail-first da função pura — a medida do defeito

```
=== RED: grande magnitude ===
AssertionError: expected 333374 to be +0 // Object.is equality
=== RED: duração zero ===
AssertionError: expected [ +0, 30, 45, 60 ] to deeply equal []
=== RED: fracionária ===
AssertionError: expected [ +0, 29.5 ] to deeply equal []
=== RED: duração inválida devolve (via obterSlotsDisponiveis) ===
AssertionError: expected [ { time: '08:00', …(1) }, …(40) ] to deeply equal []
```

**333.374 entradas** no `Set` para `-5000000` num único intervalo `[480, 1080]` — dez horas de agenda. O caso `-Infinity` só entrou na asserção depois da guarda: sem ela a condição de parada nunca fecha e o laço não termina.

### 5. Definition of Done

```
pnpm test        → 15 arquivos / 235 testes, 448ms, exit 0   (base: 15 / 228, 435ms → +7 casos)
pnpm test:integracao → 1 arquivo / 13 testes, 8.02s, exit 0  (13/13, sem regressão do caminho de escrita)
pnpm lint        → exit 0
pnpm build       → exit 0
npx tsc --noEmit → exit 0
```

`pnpm test` continua hermético e abaixo de 2 s (448 ms). `tsc` exit 0 é a prova de que os dois `Record` de `mensagens.ts` continuam exaustivos e nenhum consumidor quebrou.

### 6. Não-regressão dos harnesses vizinhos

```
verificar-superficie-anon.sh          → 11 checagens, 11 com prova positiva, 0 reprovadas, exit 0
verificar-controle-harness-anon.sh    → 4 vereditos, 0 reprovados, exit 0
verificar-fail-fast-boot.sh           → 4 vereditos, 0 reprovados, exit 0
```

O conserto do 01-17 não regrediu.

### 7. Critérios estruturais conferidos por leitura

- **A guarda está no TOPO, não no meio.** Em `public-booking.ts`, `obterSlotsPublicos` começa na linha **618**; a validação de `dateStr` está na **646**, a de `duracaoMinutos` na **651**, e a primeira ocorrência de `createAdminClient()` dentro da função está na **658**. A recusa acontece antes de qualquer I/O.
- **A guarda da engine está na primeira linha da função:** `booking-engine.ts:153`, imediatamente após a assinatura que fecha na 152.
- **`mensagens.ts` não foi tocado.** `git diff --name-only` das duas tasks lista apenas os cinco arquivos do `files_modified` do plano.
- **O fluxo autenticado recusa:** `grep -c 'duracaoMinutos' src/app/actions/agendamentos.ts` foi de **5 → 7**, e a validação (linha 205) vem antes da primeira consulta ao banco (`createClient()` na 209).

## Deviations from Plan

O plano executou exatamente como escrito no código. Duas anotações de processo:

**1. [Rule 2 — correção de marcação prematura] SEG-02 foi revertido para não-concluído.**
O `requirements mark-complete` do frontmatter (`requirements: [SEG-01, SEG-02]`) marcou `SEG-02` como `[x]` em `REQUIREMENTS.md`. Este plano **não mediu SEG-02** — `perfis_empresas` não ser enumerável é prova de `verificar-superficie-anon.sh`, e quem reexecuta as oito provas sobre o HEAD final é o 01-19. A tabela de rastreabilidade do próprio arquivo continua marcando SEG-01 e SEG-02 como `Gaps Found`, e a fase permanece **reprovada** até a 4ª verificação. Marcar aqui repetiria literalmente o defeito que já queimou esta fase duas vezes ("critério que lê como satisfeito enquanto a medição diz o contrário"), então a marcação foi desfeita. `SEG-01` ficou como já estava antes deste plano (`[x]`, fechado por planos anteriores).

**2. Ajuste cosmético, sem impacto:** ao acrescentar a nota 7 ao cabeçalho do harness, ela foi reposicionada **depois** da nota 6 para preservar a numeração crescente do bloco de notas técnicas.

## Fronteira de escopo respeitada

O WR-03 (escrita pública sem limite de tamanho de nome/e-mail) **continua diferido**, com o gatilho escrito em `docs/PENDENCIAS.md`. Nada neste plano tocou `clienteNome` nem `clienteEmail`, e a distinção não é retórica: `criarAgendamentoPublico` lê `duracao_minutos` **do banco** e deriva `dateStr` de um `Date` já validado por `isNaN` — o caminho de escrita não repassa valor controlado pelo navegador para o laço da engine.

## Known Stubs

Nenhum. Nenhuma funcionalidade ficou com dado mockado, valor vazio hardcoded ou placeholder.

## Threat Flags

Nenhuma superfície de segurança nova além da coberta pelo `<threat_model>` do plano. As duas respostas novas (`servico_invalido` e `data_invalida` no caminho de leitura) entraram na varredura do veredito `SEM_VAZAMENTO`, que passou a cobrir quatro corpos em vez de dois — T-01-18-04 mitigado e medido.

## Commits

| Task | Commit | O quê |
|---|---|---|
| 1 | `6577f5b` | fronteira pública recusa entrada hostil antes de qualquer I/O + dois vereditos de harness |
| 2 | `28c3fde` | guarda de profundidade na engine e simetria de validação no dashboard |

## Self-Check: PASSED

Arquivos modificados conferidos por `git diff --name-only` (5/5 presentes); commits `6577f5b` e `28c3fde` conferidos por `git log`.
