---
phase: 01-hardening-da-superf-cie-p-blica
plan: 03
subsystem: mensageria
tags: [seguranca, webhook, qstash, autenticacao, fail-fast]
status: complete
requires:
  - "src/lib/observabilidade/reportar.ts (reportarFalhaSilenciosa, da etapa preparatória)"
  - "src/lib/env.ts + src/instrumentation.ts (mecanismo de fail-fast já existente)"
provides:
  - "verificarAssinaturaQstash — verificação criptográfica de requisição do QStash"
  - "webhook /api/webhooks/lembrete autenticado por assinatura (401 sem assinatura válida)"
  - "motivo de falha silenciosa qstash_sem_chave_assinatura no publisher"
  - "QSTASH_NEXT_SIGNING_KEY na lista de boot obrigatório em produção"
affects:
  - "plano 01-05 (UAT do lembrete ponta a ponta e prova empírica do fail-fast de boot)"
  - "qualquer ambiente novo: sem as duas chaves de assinatura o boot de produção recusa subir"
tech-stack:
  added:
    - "@upstash/qstash ^2.11.2 (SDK oficial — Receiver para verificação de assinatura)"
  patterns:
    - "credencial de máquina verificada por assinatura, nunca por comparação de segredo em query string"
    - "env de segurança ausente lança em vez de cair em default"
key-files:
  created:
    - src/lib/qstash-assinatura.ts
    - src/lib/__tests__/qstash-assinatura.test.ts
  modified:
    - src/app/api/webhooks/lembrete/route.ts
    - src/lib/whatsapp-helper.ts
    - src/lib/env.ts
    - src/lib/__tests__/env.test.ts
    - vitest.config.ts
    - package.json
    - pnpm-lock.yaml
decisions:
  - "Chaves lidas na CHAMADA, não em constante de módulo: constante congela no import e obrigaria o teste a driblar o bundler"
  - "url: req.url em vez de constante montada de APP_URL — a claim sub do JWT carrega a query string dos lembretes já em voo"
  - "Receiver mockado no teste: forjar JWS exigiria as chaves reais; o alvo é o contrato do módulo, a criptografia é da lib oficial"
  - "O parâmetro secret continua na URL publicada nesta fase (Deferred) — só o default embutido morreu"
metrics:
  duration: ~25min
  tasks: 3
  commits: 5
  files_changed: 9
  tests_added: 5
  completed: 2026-07-22
---

# Phase 01 Plano 03: Autenticação criptográfica do webhook de lembrete — Summary

Webhook do QStash passou a exigir assinatura real (`Receiver` do SDK oficial sobre corpo cru e `req.url`), o default de credencial embutida (`|| 'secret-key'`) foi extinto dos dois lados, e produção deixa de subir sem as duas chaves de assinatura.

## O que mudou

O caminho antigo comparava `?secret=` da query string contra `process.env.QSTASH_CURRENT_SIGNING_KEY || 'secret-key'`. Esse `||` é o problema inteiro: num ambiente sem a variável, o segredo do webhook virava uma string pública de oito caracteres, e quem a chutasse disparava WhatsApp em nome de qualquer tenant. O mesmo default existia no publisher (`whatsapp-helper.ts`), então corrigir só o consumidor deixaria o buraco aberto pelo outro lado.

Agora:

- `src/lib/qstash-assinatura.ts` expõe `verificarAssinaturaQstash({ assinatura, corpoCru, url })`. Sem header → `false` sem sequer instanciar o `Receiver`. Chave ausente → **lança** nomeando a variável (em produção o boot já morreu antes; em dev, falha barulhenta é melhor que porta aberta). Assinatura inválida → `false`. Não existe caminho permissivo.
- `route.ts` lê o corpo com `req.text()` **uma única vez**, autentica, e só então faz `JSON.parse` — corpo não verificado nunca é parseado (ASVS V5). Tudo do passo 3 em diante (payload, cancelado, gating de plano, `registrarDisparo`, analytics, catch com Sentry) ficou intacto.
- `agendarLembreteQStash` ganhou guard espelhando o padrão do `QSTASH_TOKEN`: sem chave de assinatura, `console.warn` + `reportarFalhaSilenciosa('qstash:sem_chave_assinatura')` + `{ ok: false, motivo: 'qstash_sem_chave_assinatura' }`.
- `QSTASH_NEXT_SIGNING_KEY` entrou em `OBRIGATORIAS_EM_PRODUCAO` — uma linha na lista que já existia, sem caminho novo, como o comentário (b) do arquivo previa desde a etapa preparatória.

## Por que `url: req.url` e não uma constante

A claim `sub` do JWT do QStash contém a URL de publicação **com a query string**. Os lembretes já enfileirados (até 14 dias à frente) foram publicados para `…/api/webhooks/lembrete?secret=<valor>`. Montar a URL de `APP_URL` daria mismatch e mataria todos eles em silêncio — e mensageria falha em silêncio por design, então ninguém descobriria até um cliente não receber lembrete. `req.url` casa nos dois formatos e a migração fica sem janela cega.

Risco herdado do RESEARCH, registrado aqui: atrás de proxy que reescreva host ou esquema, `req.url` pode divergir do publicado e produzir 401 legítimo. Sintoma: `Assinatura QStash inválida` no log e linhas `falha`/`lembrete` em `disparos_whatsapp`. Conserto: montar de `APP_URL` depois de esvaziar a fila.

## Gate de legitimidade do pacote (executado antes do install)

```
version = '2.11.2'
repository.url = 'git+https://github.com/upstash/qstash-js.git'
scripts.postinstall → vazio
```

Ambos bateram com o esperado do RESEARCH, então o install seguiu sem escalar. O veredito `SUS` do audit era falso-positivo (`too-new` disparado pela publicação recente da 2.11.2, não pela criação do pacote em 2022).

## Verificação

`pnpm lint`, `pnpm test` e `pnpm build` — os três rodados com saída real:

- **lint**: eslint sem nenhuma linha de saída
- **test**: 13 arquivos, **196 testes passando** (baseline era 191; +4 da suíte nova, +1 de env)
- **build**: exit 0, 14 páginas geradas, rota `ƒ /api/webhooks/lembrete` compilada

Prova empírica contra o dev server (o do owner, na :3000 — Next 16 recusa um segundo `next dev` no mesmo diretório, então usei o que estava de pé):

| Requisição | HTTP |
|---|---|
| POST sem header de assinatura | 401 `{"error":"Não autorizado."}` |
| POST com `?secret=secret-key` (o default extinto) | 401 |
| POST com `Upstash-Signature` forjado | 401 |
| POST com o **secret real** na query string | 401 |

A última linha é a decisiva: com o código antigo esse mesmo request autenticaria e seguiria para o 404 de agendamento inexistente. O 401 prova que o caminho de query string morreu de fato, e não só no arquivo em disco.

Greps de aceitação:

- `grep -rn "secret-key" src/` → **0 linhas** (os dois defaults extintos)
- `grep -c "searchParams" route.ts` → 0; `grep -c "req.json()" route.ts` → 0
- `req.text()` na linha 21, `JSON.parse` na linha 40 (ordem correta)
- `grep -c "?secret=" whatsapp-helper.ts` → 1 (o parâmetro fica; só o default saiu)
- `OBRIGATORIAS_EM_PRODUCAO` com 14 entradas, travadas por teste

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Bloqueante] `env.test.ts` fixava a contagem da lista em 13**

- **Encontrado em:** Task 3
- **Problema:** `expect(OBRIGATORIAS_EM_PRODUCAO).toHaveLength(13)` quebraria assim que a décima quarta entrada entrasse — o plano listava só `env.ts` nos arquivos da task.
- **Correção:** contagem atualizada para 14 e acrescentado um caso que trava as **duas** chaves de assinatura pelo nome (a contagem sozinha não impede alguém trocar uma entrada por outra).
- **Commit:** a63a143

**2. [Rule 1 - Ajuste de critério] comentário mencionando `?secret=` inflava o grep de aceitação**

- **Encontrado em:** Task 3
- **Problema:** o comentário que explica por que o parâmetro fica usava o literal `?secret=`, fazendo `grep -c` devolver 2 em vez de 1 e disparando falso alarme em qualquer auditoria futura desse grep.
- **Correção:** comentário reescrito para "o parâmetro `secret`". Nenhuma mudança de comportamento.
- **Commit:** a63a143

### Nota de ambiente (não é deviation)

O critério de aceitação da Task 2 pedia `pnpm dev` na :3000. Já havia um `next dev` do owner rodando nesse diretório e o Next 16 recusa um segundo processo (`Another next dev server is already running`, PID 2132544). Verifiquei contra o servidor existente, que já tinha recompilado o código novo — a tabela de curls acima é a evidência.

## Known Stubs

Nenhum. Todo caminho tocado está ligado ponta a ponta; a única verificação que não roda aqui é a assinatura criptográfica real (mockada no teste por decisão explícita do plano), cuja prova de integração é o UAT do lembrete no plano 01-05.

## Threat Flags

Nenhuma superfície nova. As mudanças fecham T-01-07, T-01-08 e T-01-SC do registro do plano; T-01-09 (secret em query string) segue com disposição `accept` documentada — a assinatura no header passou a ser a autenticação real e o parâmetro virou redundante, a remover quando a fila secar.

## Self-Check: PASSED

- `src/lib/qstash-assinatura.ts` — FOUND
- `src/lib/__tests__/qstash-assinatura.test.ts` — FOUND
- Commits `3c0f1c5`, `37a7c98`, `f478ce2`, `c6cbb7f`, `a63a143` — todos presentes em `git log`
- Zero deleções de arquivo em todo o intervalo do plano (`git diff --diff-filter=D` vazio)
