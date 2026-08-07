---
phase: quick/260807-ooq
plan: 01
subsystem: ferramental-de-verificacao
tags: [seed, supabase-local, rate-limit, harness, observabilidade, uat]
requires:
  - stack local do Supabase de pé (portas 544xx)
  - build de produção correspondente ao commit medido (modo externo do harness)
provides:
  - "supabase/seed.sql — tenant `salao-do-seed` utilizável a um `db reset --local` de distância"
  - "harness com modo ALVO_EXTERNO (mede servidor que não constrói, não sobe e não mata)"
  - "harness com modo MEDIR_HEADER_IP (responde qual header de IP o alvo usa, pelo próprio balde)"
affects:
  - .planning/phases/03-anti-abuso-no-booking-p-blico/03-UAT.md (testes 5 e 6 — notas, nenhum result alterado)
  - docs/PENDENCIAS.md (Verificações manuais da Phase 03 e Diferidos para o go-live)
tech-stack:
  added: []
  patterns:
    - "GUC de role com fallback literal para valor que o SQL não sabe gerar"
    - "sonda de controle gratuita antes de qualquer sonda paga (CONTROLE_DE_ID)"
    - "linha de veredito legível por máquina com vocabulário fechado (VEREDITO_HEADER)"
    - "tripwire por grep contra a fonte quando um snippet duplica lógica do código"
key-files:
  created:
    - supabase/seed.sql
  modified:
    - scripts/verificar-rate-limit-escrita.sh
    - eslint.config.mjs
    - CLAUDE.md
    - docs/RESET_AMBIENTE_DEV.md
    - docs/PENDENCIAS.md
    - .planning/phases/03-anti-abuso-no-booking-p-blico/03-UAT.md
decisions:
  - "D-Q1 aplicada: tenant_id do seed sai de GUC opcional com literal sintético — UPDATE posterior não existe (PK referenciada por FKs sem ON UPDATE CASCADE)"
  - "CONTROLE_DE_ID é aborto de preparação, não veredito — assim os dois modos mantêm exatamente 7 vereditos"
  - "eslint passa a ignorar supabase/.temp: subir a stack local não pode reprovar o gate de lint"
metrics:
  duration: ~75min
  tasks: 3
  files: 7
  completed: 2026-08-07
status: complete
---

# Quick task 260807-ooq: Seed local e harness contra alvo externo — Summary

Destravou as duas verificações humanas que sobraram da Phase 03 removendo o que as impede:
um seed que põe `/book/salao-do-seed` de pé a um `db reset --local` de distância, e um
harness que passa a mirar URL externa e a responder, **por observação do próprio balde do
rate limit**, qual header de IP o alvo usa como chave. Nenhum item de UAT foi marcado.

## Entrega 1 — `supabase/seed.sql`

Roda em todo `npx supabase db reset --local` (o CLI usa o caminho default `./seed.sql`;
não há bloco `[db.seed]` no `config.toml`). Cria um perfil com `slug` = `slug_gratuito` =
`salao-do-seed`, dois serviços ativos de durações diferentes (30 e 60 min) e horários de
segunda a sábado com N janelas por dia.

O `tenant_id` sai de `coalesce(nullif(current_setting('vamoagendar.org_id', true), ''),
'org_seed_local')`. **Sem GUC ligado o seed avisa no `RAISE NOTICE`** que o dashboard não
enxergará o tenant (o RLS compara com o claim `org_id` do JWT), que o booking público
funciona assim mesmo, e imprime a linha exata do `ALTER ROLE` — que se faz uma vez e
sobrevive ao reset (`pg_db_role_setting` com escopo de cluster).

### Prova: `db reset --local` + consulta ao banco

```
Applying migration 20260723162858_integridade_agenda.sql...
Seeding data from supabase/seed.sql...
NOTICE (00000): === seed do banco local ===
NOTICE (00000): Booking público: /book/salao-do-seed
NOTICE (00000): Criados: 2 serviço(s) ativo(s) e 11 janela(s) de funcionamento.
NOTICE (00000): tenant_id = org_seed_local (literal sintético — nenhum GUC ligado).
NOTICE (00000):   ⚠️  O DASHBOARD NÃO vai enxergar este tenant: o RLS compara tenant_id
NOTICE (00000):       com o claim org_id do JWT do Clerk, e este id não é de nenhuma org.
NOTICE (00000):       O BOOKING PÚBLICO funciona assim mesmo (a leitura pública roda com
NOTICE (00000):       cliente privilegiado, resolvendo o tenant pelo slug — sem Clerk).
NOTICE (00000):       Para o dashboard também enxergar, rode UMA vez no banco local:
NOTICE (00000):         ALTER ROLE postgres SET vamoagendar.org_id = '<seu org_...>';
NOTICE (00000):       e depois npx supabase db reset --local (o ajuste sobrevive ao reset).
Finished supabase db reset on branch master.
```

Asserções (perfil existe, slugs iguais, 2 serviços ativos, 2 durações distintas, ≥6 dias):

```
NOTICE:  ASSERCOES DO SEED OK
DO

   tenant_id    |     slug      | slug_gratuito |      nome_estabelecimento      |     timezone      | antecedencia_minima_minutos | horizonte_maximo_dias
----------------+---------------+---------------+--------------------------------+-------------------+-----------------------------+-----------------------
 org_seed_local | salao-do-seed | salao-do-seed | Salão do Seed (ambiente local) | America/Sao_Paulo |                          15 |                    14

         nome          | preco | duracao_minutos | ativo
-----------------------+-------+-----------------+-------
 Design de sobrancelha | 60.00 |              30 | t
 Design com henna      | 95.00 |              60 | t

 dia_semana | hora_inicio | hora_fim | total_janelas
------------+-------------+----------+---------------
          1 | 09:00:00    | 12:00:00 |            11
          1 | 13:00:00    | 18:00:00 |            11
          ... (seg–sex com duas janelas cada)
          6 | 09:00:00    | 13:00:00 |            11
(11 linhas)
```

### Prova: o link é utilizável de verdade

```
HTTP: 200
Salão do Seed (ambiente local) · Agendar horário
Salão do Seed (ambiente local)
Design com henna
Design de sobrancelha
PAGINA PUBLICA OK
```

Os dois serviços aparecem no HTML — a página não só responde 200, ela renderiza o catálogo
do seed. Expressão do GUC conferida em separado: `EXPRESSAO DO GUC OK` (`org_teste_do_guc`).

## Entrega 2 — modo `ALVO_EXTERNO` no harness

Regra que domina o modo: **sem `ALVO_EXTERNO`, nada muda**. Todo comportamento novo está
atrás de `MODO_EXTERNO`.

| Ramo novo | Comportamento | Provado por |
|---|---|---|
| alvo | `BASE_URL` = URL informada, barra final removida | execução com `.../3993/` mediu `http://127.0.0.1:3993` |
| ciclo de vida | sem build, sem `next start`, sem checagem de porta, `PID` vazio | `SERVIDOR SOBREVIVEU AO HARNESS`, alvo respondeu 200 depois |
| credenciais | checagem do `.env.local` só no modo local | PREPARO aprovado sem consultar nossas vars |
| portão de custo | sem `CONFIRMO_CUSTO_NO_ALVO=1` aborta 2 antes de qualquer sonda | exit 2 |
| incoerência | `SABOTAR_FORNECEDOR` + `ALVO_EXTERNO` aborta 2 | exit 2 |
| manifesto | ausente ⇒ aborta mandando construir no commit deployado | ramo escrito; não exercitado (manifesto presente) |
| CONTROLE_DE_ID | sonda gratuita exige 200 + `campos_obrigatorios` | verde no alvo certo, **exit 2** no alvo errado |

### Prova: modo externo contra um `next start` local

```
################################################################
#  ALVO EXTERNO — O SERVIDOR NÃO É GERENCIADO POR ESTE SCRIPT  #
################################################################
  Medindo: http://127.0.0.1:3993
  … build NÃO executado (modo externo) — o manifesto local é o do commit que você construiu
  [APROVADO]  PREPARO            id de criarAgendamentoPublico (prefixo 409449d9…) derivado do manifesto LOCAL — a correspondência com o alvo é medida no CONTROLE_DE_ID, não assumida
  [APROVADO]  CONTROLE           GET http://127.0.0.1:3993/ devolveu 200 — o alvo externo está no ar
  … CONTROLE_DE_ID OK: o alvo resolveu o id para `criarAgendamentoPublico` (devolveu `campos_obrigatorios`, sem gastar token)
  [APROVADO]  JANELA_LIMPA       1ª sonda de 198.51.100.196 respondeu `slug_invalido`
  [APROVADO]  PASSAGEM           as 10 sondas dentro do teto atravessaram
  [APROVADO]  BLOQUEIO           as 2 sondas acima do teto devolveram `muitas_tentativas`
  [APROVADO]  ISOLAMENTO_POR_IP  198.51.100.197 respondeu `slug_invalido` com o vizinho bloqueado
  [APROVADO]  SEM_VAZAMENTO      nenhum corpo devolveu IP cru, org_, tenant_id nem PGRST

7 vereditos, 0 reprovações
harness saiu 0
SERVIDOR SOBREVIVEU AO HARNESS (modo externo nao mata processo)
alvo ainda responde: 200
```

### Prova: o CONTROLE_DE_ID reprova quando deve (controle vermelho)

Alvo sintético que responde 200 em tudo mas não tem Server Action nenhuma:

```
  [APROVADO]  CONTROLE           GET http://127.0.0.1:3992/ devolveu 200 — o alvo externo está no ar
ERRO DE PREPARAÇÃO: CONTROLE_DE_ID falhou: a sonda de controle devolveu HTTP 200 e o corpo
NÃO trouxe `campos_obrigatorios`. Corpo: ok
  Hipótese mais provável: a árvore de trabalho local NÃO é o commit deployado […]
  Segunda hipótese, para 403/500 […]: a proteção de origem das Server Actions do Next […]
  Nenhuma sonda de contagem foi disparada […] não consumiu token nenhum.
exit=2
CONTROLE_DE_ID REPROVOU COMO DEVIA: alvo sem a action aborta em 2, nunca vira veredito
```

Esse é o ponto inteiro do ramo: **200 + corpo diferente** é exatamente o desfecho que o
harness classificaria como veredito se ninguém perguntasse antes.

### Prova: os dois portões

```
ERRO DE PREPARAÇÃO: modo externo exige CONFIRMO_CUSTO_NO_ALVO=1 (nota 13). O QUE ISSO CUSTA
em https://vamoagendar.com.br: […] o IP que rodar este script pode ficar sem poder criar
agendamento pela duração da janela (10/10min). O QUE NÃO ACONTECE: […] nenhum agendamento e
nenhum cliente são gravados (nota 5). Nenhuma sonda foi disparada.
exit=2 → PORTAO DE CUSTO OK (abortou sem sondar)

ERRO DE PREPARAÇÃO: SABOTAR_FORNECEDOR=1 é INCOERENTE com ALVO_EXTERNO. […] o harness
mediria o alvo INTACTO e chamaria o resultado de contrafactual […]
exit=2 → INCOERENCIA RECUSADA OK
```

Os dois abortos foram os únicos comandos apontados para `vamoagendar.com.br` nesta sessão, e
nenhum deles disparou sonda — **o deploy de produção não recebeu tráfego deste trabalho.**

## Entrega 3 — modo `MEDIR_HEADER_IP`

BASELINE (sem header forjado; bloqueada ⇒ aborta) → ENCHER (dois candidatos até bloquear;
nunca bloqueou ⇒ inconclusivo e saída 2) → DISCRIMINAR (três sondas) → VEREDITO por tabela
verdade, fechado em quatro valores e impresso como última linha legível por máquina.

### Prova: controle de resposta conhecida

Contra um `next start` local, sem proxy na frente, o `X-Real-IP` da própria sonda é o único
candidato possível — a resposta é conhecida ANTES de medir:

```
--- 1. BASELINE: a chave que o alvo usa para NÓS está limpa? -------------
    BASELINE passou (`slug_invalido`) — linha de base válida.

--- 2. ENCHER: sondas com os DOIS headers forjados ------------------------
    Bloqueou na sonda #11 — há um balde cheio para interrogar.

--- 3. DISCRIMINAR: três sondas, uma de cada forma -----------------------
    sem header forjado ................. PASSOU
    só X-Real-IP (203.0.113.239) ....... BLOQUEADO
    só X-Forwarded-For (192.0.2.239) . PASSOU

VEREDITO_HEADER: x-real-ip
harness saiu 0
ALVO SOBREVIVEU
CONTROLE DE RESPOSTA CONHECIDA OK
```

Reproduzido em segunda execução independente (candidatos `203.0.113.243` / `192.0.2.243`),
mesmo veredito.

### Prova: hashes e o que os protege

Sem sal no shell, o ramo correto disparou:

```
    ANALYTICS_TENANT_SALT ausente no ambiente deste shell: nenhum hash
    impresso. Hash com sal vazio é hash errado que PARECE certo […]
```

Com sal sintético, os hashes saem — e o **valor do sal não aparece na saída** (`grep -c` do
valor na saída completa: `0`):

```
    X-Real-IP         203.0.113.243   -> 9f56cdba9562bf60
    X-Forwarded-For   192.0.2.243     -> 9a8abcf126a35fba

    ⚠️ Se o sal deste shell NÃO for o mesmo do alvo, os dois hashes vão
    diferir do painel — e isso NÃO significa que nenhum dos candidatos foi
    usado. Quem manda é o veredito do balde, acima.
    Não cole estes hashes em issue/PR […]
```

Tripwire da duplicata, testado contra o fonte real e contra cópias mutadas:

```
--- tripwire contra o fonte REAL (tem de casar):
  dominio: CASOU
  truncamento: CASOU
--- tripwire contra copia MUTADA (tem de NAO casar):
  dominio: NAO CASOU — tripwire dispararia
  truncamento: NAO CASOU — tripwire dispararia
```

## Não-regressão do instrumento (o que custou uma fase inteira para existir)

Reexecutados **depois** de todas as mudanças:

```
7 vereditos, 0 reprovações — a camada `escrita_ip` barra de verdade e barra por chave.
modo padrao saiu 0

CONTRAFACTUAL OK — com o Upstash inalcançável, o veredito BLOQUEIO REPROVOU.
contrafactual saiu 0
```

Mesmos 7 vereditos, mesma ordem, mesmo texto, mesmos códigos de saída. O contrafactual
continua exigindo vermelho e obtendo-o.

## Definition of Done — os quatro gates, saída real

```
$ pnpm lint
$ eslint
=== lint exit: 0

$ pnpm test
 Test Files  25 passed (25)
      Tests  409 passed (409)
=== test exit: 0

$ npx tsc --noEmit
=== tsc exit: 0

$ pnpm build
✓ Generating static pages using 11 workers (14/14)
=== build exit: 0
```

Baseline anterior era 381 testes em 23 arquivos (fim da Phase 03); hoje 409 em 25 — o
crescimento veio da quick task `260807-m5m`, não desta. Esta task não acrescentou teste:
nem SQL de seed nem bash são cobertos por `vitest`, e a prova da entrega são os `<verify>`
acima.

## Desvios do plano

### 1. [Rule 3 — Bloqueio] `pnpm lint` reprovava por causa de `supabase/.temp/`

- **Encontrado em:** gate final da Definition of Done.
- **Problema:** subir a stack local (`npx supabase start`, feito hoje) cria
  `supabase/.temp/start-secrets/.../main/index.ts` — o runtime minificado das Edge Functions
  do CLI. O diretório é `.gitignore`d, mas o flat config do ESLint 9 **não lê o
  `.gitignore`**, então `pnpm lint` passou a sair 1 com 154 erros (`prefer-const` em código
  minificado de terceiro). Nada disso é código nosso, e nenhum arquivo do projeto reprovou.
- **Correção:** `supabase/.temp/**` acrescentado ao `globalIgnores` de `eslint.config.mjs`,
  com o motivo escrito no comentário.
- **Commit:** `071ca80`.

### 2. `next start` sem `APP_URL` morre no boot — e isso é o produto funcionando

A primeira tentativa de subir o alvo local para o modo externo falhou:

```
[boot] Variáveis obrigatórias ausentes em produção: APP_URL
[boot] Encerrando o processo com código 1 — sem essa configuração a aplicação não tem como
servir requisição nenhuma.
```

Não é bug e não foi contornado no harness: é o fail-fast do D-04, e o modo externo
propositalmente **não** injeta env no alvo (o ambiente é de quem hospeda). `APP_URL` foi
passada ao servidor alvo no comando que o sobe — que é o papel de quem opera o deploy, não
do instrumento de medição. Registrado aqui porque a leitura errada ("o harness precisa
injetar env") reintroduziria a dependência que o modo externo existe para eliminar.

### 3. `CONTROLE_DE_ID` ficou como preparação, não como oitavo veredito

O plano o descreve como "novo aborto". Implementado assim: imprime uma linha `… CONTROLE_DE_ID
OK` e aborta com 2 quando falha, sem entrar na contagem. Consequência desejada: os dois modos
mantêm exatamente **7 vereditos**, então a asserção de não-regressão continua valendo palavra
por palavra.

## Verificação humana — o que NÃO foi fechado

- **Nenhum item do `03-UAT.md` foi marcado.** Conferido por comando: `grep -c 'result: pass'`
  → `3` (os mesmos de antes), e o diff do arquivo não altera **nenhuma** linha `result:` nem o
  bloco `## Summary`. O que entrou foram duas notas: `pre_requisito_de_ambiente_caiu` no teste
  5 e `instrumento_disponivel` no teste 6.
- **O teste 6 continua `deferred`.** O que caducou foi a justificativa ("inalcançável sem
  deploy em produção" — o deploy existe), não a pendência. Reclassificar é decisão do owner.
- **O harness NÃO foi rodado contra produção.** Os dois comandos apontados para
  `vamoagendar.com.br` foram os testes dos portões, e ambos abortaram antes de qualquer sonda.
  Disparar contra o deploy é decisão do owner, e o custo está declarado na mensagem do portão.
- **Equivalência do snippet de hash com `hashComSal` foi verificada por leitura do fonte + o
  tripwire automatizado**, não por execução do código TypeScript real lado a lado. É o desenho
  que o plano pediu (duplicata declarada + tripwire), mas vale dizer em voz alta o que a prova
  é e o que ela não é.

## Known Stubs

Nenhum.

## Self-Check: PASSED

Arquivos: `supabase/seed.sql`, `scripts/verificar-rate-limit-escrita.sh`, `eslint.config.mjs`,
`CLAUDE.md`, `docs/RESET_AMBIENTE_DEV.md`, `docs/PENDENCIAS.md`, `03-UAT.md` — todos FOUND.
Commits `a0c5093`, `9bf52a3`, `071ca80` — todos FOUND em `git log`.
