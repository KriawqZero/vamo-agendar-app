---
phase: 03-anti-abuso-no-booking-p-blico
plan: 06
subsystem: docs
tags: [fechamento-de-fase, decisao-registrada, risco-aceito, gate-de-deploy, definition-of-done]

requires:
  - phase: 03-01
    provides: "a decisão D-01 implementada (Upstash Redis via REST) e o user_setup das duas env vars, aberto desde então"
  - phase: 03-04
    provides: "as duas env vars em OBRIGATORIAS_EM_PRODUCAO — o que transforma o provisionamento em gate de DEPLOY"
  - phase: 03-05
    provides: "o item human_judgment do autofill do honeypot, deferido explicitamente para este plano"
provides:
  - "docs/01-ARQUITETURA_E_STACK.md §Anti-abuso do booking público — desenho das quatro camadas + honeypot e a alternativa RPC/Postgres documentada como NÃO escolhida (exigência literal do ROADMAP)"
  - "docs/PENDENCIAS.md — provisionamento do Upstash como gate de DEPLOY, risco aceito da cota do Free com detector nomeado, e as verificações manuais da fase nascendo ABERTAS"
  - "Decisão registrada sobre ABU-01/02/03: seguem abertos, com a razão escrita na própria linha do requisito"
  - "Gate da fase reexecutado sobre o HEAD final, com saída real"
affects: []

tech-stack:
  added: []
  patterns:
    - "Alternativa recusada é documentada com o que se PERDE ao recusá-la, não só com o racional da escolha — sem isso o registro é justificação, não decisão"
    - "Requisito que não fecha por código carrega a razão na PRÓPRIA linha do requisito (precedente SEG-05), não só no SUMMARY que ninguém relê"

key-files:
  created:
    - .planning/phases/03-anti-abuso-no-booking-p-blico/03-06-SUMMARY.md
  modified:
    - docs/01-ARQUITETURA_E_STACK.md
    - docs/PENDENCIAS.md
    - .planning/REQUIREMENTS.md

key-decisions:
  - "ABU-01, ABU-02 e ABU-03 seguem ABERTOS — a fase termina sem marcar nenhum dos três requisitos que ela reivindica, porque o rate limit inteiro roda em no-op sem as credenciais do Upstash"
  - "ABU-02 é o mais próximo de fechável e mesmo assim fica aberto: a fricção que ele proíbe é a do FALSO POSITIVO, e os dois modos de falso positivo desta fase falham em silêncio"
  - "A razão de cada requisito aberto entrou em .planning/REQUIREMENTS.md (fora do files_modified do plano) porque SUMMARY não é onde alguém olha para saber se um requisito fechou"
  - "O item pré-existente de rate limit em PENDENCIAS não foi reescrito: ganhou um bloco de registro datado ao lado, no estilo do '✅ Registro de fechamento — plano 01-08' do próprio arquivo"
  - "A linha de metadados 'Última atualização' de PENDENCIAS foi atualizada — é convenção do arquivo, não um item"

patterns-established:
  - "Bloco de fechamento de fase em PENDENCIAS distingue explicitamente CÓDIGO ESCRITO de PROTEÇÃO ATIVA, e diz qual dos dois o teste verde prova"

requirements-completed: []

coverage:
  - id: D1
    description: "A alternativa RPC atômica no Postgres está documentada como NÃO escolhida, com o racional do D-01 e o que se perde na recusa"
    verification:
      - kind: manual
        ref: "docs/01-ARQUITETURA_E_STACK.md §'Alternativa considerada e NÃO escolhida: RPC atômica no Postgres'"
        status: pass
      - kind: command
        ref: "grep -qi 'não escolhida' docs/01-ARQUITETURA_E_STACK.md"
        status: pass
    human_judgment: false
  - id: D2
    description: "PENDENCIAS registra o provisionamento Upstash como ação do owner com gate de deploy (2 databases D-05, env no Railway antes do deploy, D-04 amplia a janela de crash-loop)"
    verification:
      - kind: manual
        ref: "docs/PENDENCIAS.md §'🔴 Provisionamento do Upstash Redis — ação do OWNER, gate de DEPLOY'"
        status: pass
    human_judgment: false
  - id: D3
    description: "PENDENCIAS registra o risco aceito da cota do Upstash Free com o detector nomeado (rajada de ratelimit:redis_unavailable) e o gatilho de reavaliação"
    verification:
      - kind: manual
        ref: "docs/PENDENCIAS.md §'⚖️ Risco ACEITO com detector — cota do Upstash Free'"
        status: pass
    human_judgment: false
  - id: D4
    description: "A suíte completa roda verde sobre o HEAD final da fase, com as contagens registradas"
    verification:
      - kind: command
        ref: "pnpm lint && pnpm test && pnpm build && npx tsc --noEmit"
        status: pass
    human_judgment: false
  - id: D5
    description: "Prova comportamental do SC1: script real repetindo POSTs contra next start com Redis real para de criar agendamentos ao bater o teto"
    verification: []
    human_judgment: true
    rationale: "Backstop declarado no próprio plano. Toca serviço externo, portanto fora do pnpm test hermético, e depende das credenciais do Upstash que ninguém provisionou. Nasceu ABERTO em docs/PENDENCIAS.md §'Verificações manuais da Phase 03', item (a)."
  - id: D6
    description: "Bloqueios e capturas aparecem de fato nos painéis do owner (Sentry Logs, Sentry Issue no teto por tenant, PostHog)"
    verification: []
    human_judgment: true
    rationale: "Backstop declarado no plano. Teste verde não fecha observabilidade — é a lição literal do baseline 260724, cujo incidente de origem era 'nada apareceu em painel nenhum'. Com o rate limit em no-op nada sequer é emitido. Nasceu ABERTO em PENDENCIAS, item (b)."

metrics:
  duration: ~18min
  completed: 2026-07-27

status: complete
---

# Phase 3 Plano 06: Fechamento da fase — Summary

**A fase termina com o código provado e os três requisitos que ela reivindica ainda abertos, e essa é a entrega: o que falta está escrito com dono, gatilho e detector, em vez de marcado para a fase parecer concluída.**

## Performance

- **Duration:** ~18 min
- **Tasks:** 2 (mais a decisão sobre os requisitos, que o plano atribui a este fechamento)
- **Files modified:** 3 modificados, 1 criado (este SUMMARY)
- **Suíte:** 353 testes em 22 arquivos (baseline pré-fase: 280 em 20)

## Accomplishments

- **A exigência literal do ROADMAP foi satisfeita.** A nota de execução da Phase 3 dizia "escolher um e desprovisionar ou documentar o outro". O escolhido foi o Upstash Redis (D-01); o outro — RPC atômica no Postgres — agora tem seção própria em `docs/01-ARQUITETURA_E_STACK.md`, com o racional da recusa **e** com a vantagem que se perde ao recusá-la. Registro que só diz por que a escolha foi boa é justificação; decisão registrada diz também o que custou.
- **O provisionamento do Upstash deixou de ser folclore de SUMMARY e virou item com dono e gatilho.** Ele estava aberto desde o 03-01, mencionado em cinco SUMMARYs seguidos — arquivos que ninguém relê. Agora está em `docs/PENDENCIAS.md`, na seção "Obrigatório antes do lançamento público", marcado como **gate de DEPLOY**: o 03-04 pôs as duas variáveis em `OBRIGATORIAS_EM_PRODUCAO`, então deploy antes do provisionamento não sobe. O comportamento é o desejado; o que faltava era eliminar a surpresa.
- **O risco aceito nasceu com detector, não com boa vontade.** Cota do Free esgotada por ataque sustentado joga as quatro camadas em fail-open — a inversão clássica de um limitador permissivo. O detector é a rajada da Issue `ratelimit:redis_unavailable`, e está escrito por quê não existe outro: bloqueio que deixa de acontecer não gera evento nenhum.
- **Os itens humanos das cinco execuções anteriores foram consolidados num lugar só.** Prova comportamental do SC1, verificação de painel dos três pilares e o campo do honeypot em navegador real (deferido explicitamente pelo 03-05) — todos com checkbox aberta e com a frase que o projeto já aprendeu a escrever: nada aqui foi aprovado.
- **O gate rodou antes de qualquer documento afirmar coisa alguma.** `lint`, `test`, `build` e `tsc` sobre o HEAD final, com saída real observada, e só então a linha de fechamento entrou em PENDENCIAS. É a regra registrada da Phase 01 ("gap closure escreve documento só depois da prova").

## Task Commits

1. **Task 1: decisão D-01 documentada + os três blocos de PENDENCIAS** — `b2c25e7`
2. **Task 2: gate da fase + linha de fechamento com as contagens** — `3463da8`
3. **Decisão sobre ABU-01/02/03 registrada em REQUIREMENTS.md** — `13a34ff` (ver Deviations)

**Plan metadata:** ver commit de fechamento (`docs(03-06)`).

## Gate da fase — saída real sobre o HEAD final

Rodado sobre `b2c25e7` (todos os planos 03-01 a 03-05 mergeados neste branch):

| Comando | Resultado |
|---|---|
| `pnpm lint` | **exit 0**, sem saída |
| `pnpm test` | **353 passed (353)** em **22 arquivos**, exit 0, 871 ms |
| `pnpm build` | **exit 0**, compilado em 6.0s, 14 rotas geradas |
| `npx tsc --noEmit` | **exit 0** |

Duas observações sobre o que essas contagens provam e o que não provam:

- **353 > 280.** O baseline pré-fase eram 280 testes em 20 arquivos; a fase só acrescentou, e nenhum arquivo existente regrediu. O critério de aceite do plano ("estritamente maior que 280") está satisfeito com folga de 73 provas.
- **O `pnpm build` rodou sem as variáveis do Upstash no ambiente** — conferido: nenhuma `UPSTASH_REDIS_REST_*` no ambiente do shell nem no `.env.local`. É a prova viva do no-op do D-04: dev e build seguem funcionando com o rate limit desligado, e é exatamente por isso que produção precisa da lista de obrigatórias para não repetir o mesmo silêncio.

## Files Created/Modified

- `docs/01-ARQUITETURA_E_STACK.md` — Upstash Redis (`@upstash/ratelimit` + `@upstash/redis`) acrescentado ao item 5 da stack oficial, com a nota de que o acesso é HTTP/REST; **seção nova** "🛡️ Anti-abuso do booking público (rate limit + honeypot)" entre o modelo multi-tenant e o aviso de tecnologias descartadas: os dois eixos e por que nenhum fecha sozinho, tabela das quatro camadas com janela/superfície/papel, as quatro propriedades transversais (chave pseudonimizada, fail-open com teto de 500 ms, bloqueio como condição esperada, resposta honesta), a exclusão deliberada de `obterDadosBookingPublico`, o honeypot, a **alternativa RPC/Postgres não escolhida** com os três argumentos do D-01 mais o custo aceito, a incompatibilidade do Redis da Railway (TCP × HTTP/REST) e a consequência operacional das env obrigatórias
- `docs/PENDENCIAS.md` — quatro blocos novos na seção "Obrigatório antes do lançamento público", todos **depois** do item pré-existente de rate limit e sem tocá-lo: (1) bloco de registro em citação, distinguindo código escrito de proteção ativa e explicando por que os ABU seguem abertos; (2) 🔴 provisionamento do Upstash como ação do owner e gate de deploy, com o passo a passo e a regra "nomes de variável, nunca valores"; (3) ⚖️ risco aceito da cota do Free com detector, mitigadores e gatilho de reavaliação; (4) 🧪 verificações manuais da fase em três grupos (script do SC1 + calibração, painéis, campo do honeypot em navegador real), todas com checkbox aberta. Mais a linha de fechamento com as contagens do gate e a linha de metadados "Última atualização"
- `.planning/REQUIREMENTS.md` — nota em citação acima do bloco Anti-abuso + anotação em cada uma das três linhas ABU, explicando por que continuam `[ ]`. Tabela de rastreabilidade intocada (`Pending` nos três)

## Decisions Made

**Os três requisitos da fase seguem abertos, e essa é a decisão principal deste plano.** Todos os cinco planos anteriores declinaram de marcá-los, cada um empurrando a decisão para o fechamento. A decisão do fechamento é a mesma, agora com o argumento completo em vez de "o próximo plano decide": as quatro camadas de rate limit rodam em **no-op** sem `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`, então em execução real toda requisição passa. Marcar ABU-01 afirmaria que "script repetindo requisições não consegue lotar a agenda" num ambiente onde nada barra nada. O honeypot está ativo e não depende do Redis, mas cobre outro eixo — script que chama a Server Action direto não preenche formulário.

**ABU-02 merece o argumento separado, porque é o único com caso real para ser marcado.** Ele pede ausência: nenhum CAPTCHA, nenhum campo visível novo, nenhuma etapa a mais. Tudo isso é verdade hoje e é verificável por leitura do código. Ficou aberto assim mesmo porque a fricção que o requisito proíbe é a do **falso positivo**, e ela tem dois modos nesta fase — limite mal calibrado barrando cliente legítimo (CGNAT faz clientes reais dividirem IP) e autofill preenchendo o honeypot de uma pessoa real, que recebe confirmação de um agendamento que não existe. **Os dois falham em silêncio:** ninguém reclama de uma página que barrou, e ninguém reclama de um agendamento que a tela confirmou. Marcar ABU-02 com o limitador em no-op seria marcar a ausência de fricção de um mecanismo que nunca funcionou — verdade trivial hoje, e nada garante que continue verdade no dia em que ele ligar.

**A razão de cada requisito aberto foi escrita na própria linha do requisito, não só aqui.** SUMMARY é artefato de execução; ninguém volta a ele para saber se um requisito fechou. `REQUIREMENTS.md` é onde se olha, e o arquivo já tinha o precedente: a linha do SEG-05 carrega a história do que foi medido como falso e por qual plano foi fechado. As três linhas ABU agora carregam o mesmo tipo de registro, com o detalhe que mais importa para quem vier depois: **não são fecháveis só por código**.

**O item pré-existente de rate limit em PENDENCIAS não foi reescrito.** Ele descreve o mundo pré-fase ("ainda não há rate limit, honeypot nem CAPTCHA") e a instrução do plano era só acrescentar. Reescrevê-lo apagaria a análise que justifica o desenho; deixá-lo sozinho deixaria uma frase falsa no arquivo. A saída é a que o próprio arquivo já usa duas vezes (o "✅ Registro de fechamento — plano 01-08" e o bloco da Phase 1 dentro do item de integridade): um bloco de registro datado **ao lado**, dizendo o que mudou e o que continua valendo.

**A seção nova do docs/01 registra o que se PERDE ao recusar a RPC.** O plano pedia o racional da recusa; a vantagem da alternativa (zero fornecedor novo para provisionar, monitorar e pagar) entrou junto porque decisão registrada sem custo declarado envelhece mal — daqui a seis meses, com uma conta da Upstash na mesa, alguém vai perguntar por que não se usou o banco que já existe, e a resposta tem que incluir o que foi trocado por quê.

## Deviations from Plan

### 1. [Rule 2 — Acréscimo exigido pelo escopo] `.planning/REQUIREMENTS.md` editado, fora do `files_modified`

- **Encontrado durante:** fechamento, ao decidir os três ABU
- **Questão:** o `files_modified` do plano lista só `docs/01-ARQUITETURA_E_STACK.md` e `docs/PENDENCIAS.md`, mas o frontmatter reivindica `requirements: [ABU-01, ABU-02, ABU-03]` e este plano é o único que pode decidi-los
- **Ação:** os três seguem `[ ]` (nenhuma marcação), e a **razão** de cada um foi escrita na respectiva linha, mais uma nota de bloco acima das três. A tabela de rastreabilidade ficou intocada — `Pending` nos três, sem inventar valor novo de status que quebrasse o vocabulário do arquivo
- **Arquivos modificados:** `.planning/REQUIREMENTS.md`
- **Commit:** `13a34ff`
- **Por que não bastava o SUMMARY:** a decisão precisa estar onde a pergunta é feita. Quem abrir `REQUIREMENTS.md` daqui a dois meses vê três checkboxes vazias numa fase marcada como concluída — sem a anotação, isso lê como esquecimento, e a saída mais provável é alguém "corrigir" marcando

### 2. [Registro] A linha "Última atualização" de PENDENCIAS foi alterada

- **Questão:** o critério de aceite diz "nenhum item pré-existente alterado ou removido"
- **Ação:** a linha foi atualizada de 2026-07-24 para 2026-07-27, preservando por escrito a referência anterior (a quick task 260724 e o P0.12-desktop)
- **Por quê:** é a linha de metadados que o próprio arquivo mantém a cada atualização, não um item da lista. Deixá-la apontando para a quick task depois de acrescentar quatro blocos tornaria o cabeçalho falso
- **Verificação:** o `git diff` da Task 1 registrou **228 inserções e 1 deleção** nos dois arquivos — a única deleção é essa linha, substituída

---

**Total de deviations:** 2 (1 acréscimo de arquivo exigido pelo escopo, 1 registro de alteração de metadado)
**Impacto no plano:** nenhum. As duas tasks foram executadas como escritas.

## Issues Encountered

Nenhum. Os quatro comandos do gate passaram na primeira execução, e a ordem exigida pelo plano (provar antes de escrever) foi respeitada: a linha de fechamento de PENDENCIAS só foi escrita depois de as quatro saídas estarem na tela.

## Known Stubs

Nenhum stub de código — este plano não toca código.

**O stub que fecha a fase inteira continua sendo o mesmo desde o 03-01, e agora está escrito onde o owner olha:** sem `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`, as quatro camadas de rate limit rodam em no-op e nenhuma proteção de volume está ativa. O honeypot é a exceção — não consulta Redis e já funciona. A diferença entre este plano e os cinco anteriores é que a pendência deixou de viver só em SUMMARY e passou a existir em `docs/PENDENCIAS.md` com dono (owner), gatilho (próximo deploy de produção) e consequência declarada (o boot não sobe).

## User Setup Required

Tudo o que segue está detalhado em `docs/PENDENCIAS.md` — este é o índice:

1. **🔴 Provisionar o Upstash (gate de deploy).** 2 databases Redis na conta do QStash (prod + dev; se o plano cobrar pelo segundo, só o de prod e dev fica em no-op) e as duas variáveis no Railway **antes** do próximo deploy de produção. Deploy antes disso não sobe — de propósito.
2. **🧪 Prova comportamental do SC1.** Script repetindo POSTs contra `next start` com o Redis de dev, até a resposta virar `muitas_tentativas` sem criar agendamento novo. Fora do `pnpm test` hermético.
3. **🧪 Verificação de painel.** Sentry Log `ratelimit.bloqueio`, PostHog `booking_rate_limited`/`booking_honeypot` e a Issue `ratelimit:teto_tenant_atingido`, conferindo que nenhum deles carrega IP, telefone ou `org_id` cru.
4. **🧪 O campo do honeypot em navegador real** (celular e desktop, tabulação, autofill) e o acompanhamento da taxa de `booking_honeypot` depois da abertura ao público.
5. **⚖️ Calibração com dado real** dos quatro números (10/10 min, 5/1 h, 30/1 h, 60/1 min) — o erro é assimétrico: folgado demais é reversível, apertado demais não.

## Threat Flags

Nenhuma superfície nova — este plano não introduz código.

- **T-03-06-01** (decisão e risco da fase perdidos sem registro) — mitigado: decisão do D-01 em `docs/01`, provisionamento e risco aceito em `docs/PENDENCIAS.md`, cada um com dono e gatilho.
- **T-03-06-02** (deploy de produção antes do provisionamento derruba o boot) — mitigado no que é mitigável: o comportamento **é** o pedido (fail-fast do D-04), e o que o registro elimina é a surpresa. O item está na seção que o owner lê antes de lançar, com a consequência escrita em voz alta.

## Next Phase Readiness

A Phase 3 fecha em **código**, não em **efeito**. Todo o desenho está implementado e provado (353 testes), e a distância entre "implementado" e "protegendo" é um passo de painel do owner mais duas medições que nenhum executor alcança.

Para quem verificar a fase: os três Success Criteria do ROADMAP **não** são verificáveis por comando neste estado. O SC1 (script para de criar ao bater o teto) exige Redis real; o SC2 (cliente legítimo não percebe fricção) exige tráfego real para exercer o falso positivo; o SC3 (owner vê quantas foram barradas e por qual chave) exige olho no painel. O que é verificável por comando são as decisões *sobre* esses comportamentos, e essas estão verdes.

## Self-Check: PASSED

- `docs/01-ARQUITETURA_E_STACK.md` — FOUND (contém a seção "Anti-abuso do booking público" e "Alternativa considerada e NÃO escolhida")
- `docs/PENDENCIAS.md` — FOUND (14 ocorrências de "Upstash"; contém os quatro blocos novos e a linha de fechamento com as contagens)
- `.planning/REQUIREMENTS.md` — FOUND (três linhas ABU anotadas, todas ainda `[ ]`)
- Commits `b2c25e7`, `3463da8`, `13a34ff` — FOUND
- Working tree limpo salvo `docs/.obsidian/` (untracked, fora do escopo desta fase e nunca staged)

---
*Phase: 03-anti-abuso-no-booking-p-blico*
*Completed: 2026-07-27*
