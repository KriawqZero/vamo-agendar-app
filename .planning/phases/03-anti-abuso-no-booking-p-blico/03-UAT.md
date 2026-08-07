---
status: testing
phase: 03-anti-abuso-no-booking-p-blico
source: [03-VERIFICATION.md]
started: 2026-07-27T00:00:00Z
updated: 2026-07-27T20:30:00Z
---

## Current Test

number: 4
name: SC3 — o owner consegue ver quantas requisições foram barradas e por qual chave
expected: |
  Provocar um bloqueio real e conferir nos TRÊS painéis:

  - **Sentry Log** — evento `ratelimit.bloqueio` com os atributos `camada` e `chaveHash`,
    e SEM IP ou telefone crus em lugar nenhum;
  - **PostHog Activity** — eventos `booking_rate_limited` e `booking_honeypot`;
  - **Sentry Issue** — `ratelimit:teto_tenant_atingido` carregando só `tenantHash`.

  Atalho: `bash scripts/verificar-rate-limit-escrita.sh` já provoca 2 bloqueios reais de
  `escrita_ip` por execução — mas ele roda em `next start` LOCAL, então só serve se o
  Sentry/PostHog do ambiente local estiverem apontando para os projetos que você abre.

  Ressalva que vale mais que o resto: **teste verde não fecha observabilidade.** É a
  lição literal da quick task 260724, cujo incidente de origem era exatamente "nada
  apareceu em painel nenhum". Sentry Logs é produto separado de Issues — DSN válido não
  garante log ingerido.
awaiting: user response

## Tests

### 1. Provisionar Upstash Redis + env vars no Railway (GATE DE DEPLOY)

expected: Os dois databases criados na conta do QStash; as duas env vars no Railway; boot de produção sobe. Sem elas, boot cai com código 1 nomeando ambas.
blocking: sim — **enquanto isto não for feito, nenhuma das quatro camadas de rate limit barra coisa alguma, em ambiente nenhum**. O honeypot é a única defesa ativa hoje (não consulta Redis).
result: pass
passed_at: 2026-07-27
note: "Gate de deploy liberado pelo owner. Destrava os testes 2, 4 e 6, que exigem Redis real."

### 2. SC1 — script repetindo requisições para de conseguir criar agendamentos

expected: Com as credenciais de DEV no ambiente, subir `next start` e rodar um script repetindo POSTs de criação contra o mesmo slug. Os primeiros criam; a partir do teto a resposta vira `muitas_tentativas` e nenhum agendamento novo entra na agenda. Conferir que os contadores aparecem no database de **dev**, e não no de produção.
why_human: A suíte prova a DECISÃO do app sobre a resposta do fornecedor (limiter mockado); nunca prova a resposta do fornecedor. Depende do teste 1.
result: pass
passed_at: 2026-07-27
medido_por: "scripts/verificar-rate-limit-escrita.sh (commit a8b267f) — automatizado, reexecutável"
evidencia: |
  7 vereditos, 0 reprovações, contra `next start` de produção e Upstash Redis real:

    PREPARO            id de criarAgendamentoPublico (404b7ac2…) derivado do manifesto
    CONTROLE           GET / → 200, processo vivo
    JANELA_LIMPA       1ª sonda de 198.51.100.7 → `slug_invalido`
    PASSAGEM           as 10 sondas dentro do teto atravessaram → `slug_invalido`
    BLOQUEIO           as 2 acima do teto → `muitas_tentativas`
    ISOLAMENTO_POR_IP  198.51.100.8 → `slug_invalido` com o vizinho bloqueado
    SEM_VAZAMENTO      nenhum corpo devolveu IP cru, org_, tenant_id nem PGRST

  Nenhum agendamento criado, nenhum cliente gravado: as sondas usam slug
  inexistente com os demais campos válidos, então consomem token e morrem
  logo DEPOIS do rate limit (a ordem das guardas é o que torna isso possível).
contrafactual: |
  `SABOTAR_FORNECEDOR=1` (Upstash → host inexistente): BLOQUEIO **REPROVOU**,
  exit 0 no modo invertido. O harness nasceu depois do código, então o verde
  sozinho não valeria — este é o controle que prova que ele mede.

  De quebra provou o fail-open do D-02/D-03 contra fornecedor de verdade
  indisponível, não contra mock: com o Redis fora, as 12 sondas passaram e
  o booking seguiu funcionando.
achado: |
  A PRIMEIRA tentativa de contrafactual usava `UPSTASH_REDIS_REST_URL=` vazia e
  foi impedida pelo produto: o `next start` morreu no boot com
  `[boot] Variáveis obrigatórias ausentes em produção: UPSTASH_REDIS_REST_URL`.
  É evidência não planejada de que o fail-fast do D-04 (teste 1) funciona de
  verdade — e o motivo de o contrafactual ter mudado de eixo.

### 3. SC2 — o cliente legítimo não percebe nada, inclusive nos dois falsos-positivos

expected: (a) salvar endereço no autofill e conferir que `info_adicional` continua vazio ao autopreencher; (b) percorrer a etapa de contato só pelo teclado — o foco pula direto de WhatsApp para o CTA; (c) abrir `/book/<slug>` em celular e desktop sem deslocamento de layout; (d) com Redis real, medir a latência acrescentada ao caminho de sucesso (são 3 idas ao Redis); (e) depois de abrir ao público, acompanhar a taxa de `booking_honeypot`.
why_human: A suíte prova a FORMA dos atributos lendo o fonte do disco — nunca o comportamento de um motor de layout nem de uma heurística de autofill proprietária. E os dois falsos-positivos **falham em silêncio**: ninguém reclama de página que barrou, e muito menos de um agendamento que a tela confirmou.
result: pass
passed_at: 2026-07-27
medido_por: "owner, em navegador real — NÃO automatizado, e é por isso que conta"
ressalva: |
  O item (e) — acompanhar a taxa de `booking_honeypot` no PostHog — é o único dos
  cinco que **não fecha aqui por construção**: depende de tráfego público, que ainda
  não existe. Ele é o detector permanente do falso-positivo de autofill, cujo
  desfecho ruim (pessoa real vendo confirmação de agendamento inexistente) é
  silencioso: ninguém reclama de tela que confirmou. Continua registrado em
  `docs/PENDENCIAS.md` como acompanhamento pós-lançamento, não como item fechado.

### 4. SC3 — o owner consegue ver quantas requisições foram barradas e por qual chave

expected: Provocar um bloqueio real e conferir nos painéis: Sentry Log `ratelimit.bloqueio` com `camada` e `chaveHash` (e **sem** IP ou telefone crus); PostHog `booking_rate_limited` e `booking_honeypot` no Activity; Sentry Issue `ratelimit:teto_tenant_atingido` carregando só `tenantHash`.
why_human: Em no-op nada é barrado, logo nada é emitido. E teste verde **não** fecha observabilidade — é a lição literal da quick task 260724, cujo incidente de origem era exatamente "nada apareceu em painel nenhum". Sentry Logs é produto separado de Issues: DSN válido não garante log ingerido.
result: [pending]
verificado_pelo_agente: |
  A metade "CHEGOU?" foi medida pelo orquestrador em 2026-07-27 via MCP do Sentry,
  do PostHog e do Supabase, provocando os eventos com sondas contra `next start`
  real. A metade "o CONTEÚDO está limpo?" continua sendo do owner — ver abaixo.

  **Sentry Logs** (projeto `vamo-agendar-app`):
    00:36:36Z  warn  codigo=ratelimit.bloqueio  "Requisição pública bloqueada por rate limit"
    00:16:37Z  warn  codigo=ratelimit.bloqueio  (run anterior)
    00:41:15Z  warn  codigo=honeypot.captura    "Campo armadilha preenchido no booking público"

  **PostHog** (`$is_server: True` em todos):
    20:41:16  booking_honeypot
    20:36:37  booking_rate_limited  camada=escrita_ip   (×2 — o run limpo)
    20:16:37  booking_rate_limited  camada=escrita_ip   (×2 — run anterior)

  Dois eventos por execução do harness, que é exatamente o número de bloqueios que
  ele provoca. Correspondência 1:1 com as sondas, não coincidência.

  **Anti-PII, lado PostHog — verificado no schema, não por leitura de amostra:** as
  ÚNICAS propriedades de `booking_rate_limited` são `camada` (custom) mais as
  automáticas do SDK (`$lib`, `$is_server`, `$geoip_disable`, `$virt_*`). Não existe
  propriedade de IP, telefone nem `org_id` — nem vazia, nem preenchida.

  **O honeypot não tocou em nada — provado no banco, não por asserção de teste.**
  A resposta da sonda trouxe `{"ok":true,"agendamento":{"id":"f8f4dd30-08a7-40b8-abb3-5418c5bc4d24","status":"confirmado"}}`.
  Consulta direta ao Postgres depois disso:
    agendamento_sintetico_existe .......... 0   (o id que a tela mostrou não existe)
    agendamentos_criados_nas_ultimas_3h ... 0   (nenhuma sonda criou nada)
    clientes_das_sondas_por_nome .......... 0
    clientes_das_sondas_por_telefone ...... 0
    total_agendamentos_no_banco ........... 3   (os pré-existentes, intocados)
resta_para_o_owner: |
  1. **Conteúdo dos Sentry Logs.** Confirmei que os logs CHEGARAM com o código
     sintético certo; não consegui ler os atributos `camada` e `chaveHash` pelo MCP
     (o agente de busca do Sentry descarta atributos customizados da query — é
     limitação da ferramenta, não ausência do dado). Olhar um log no painel e
     confirmar os dois atributos presentes E nenhum IP/telefone cru é a parte que
     não dá para terceirizar: foi exatamente uma trava dessas que o incidente
     260724 mostrou não fechar por teste.
  2. **Sentry Issue `ratelimit:teto_tenant_atingido` NÃO foi exercitada.** As
     sondas usam slug inexistente e morrem antes das camadas de telefone e tenant.
     Exercitá-la exigiria slug real e ~30 tentativas, o que criaria agendamentos no
     banco. Fica para tráfego real ou para uma sessão em que se aceite o resíduo.

### 5. Copy nova do bloqueio de leitura em navegador real (nasce da ratificação do D-10)

expected: Ver na tela "Muitas tentativas seguidas. Aguarde um instante e tente de novo." com o botão em `Aguarde {N}s` desabilitado, em mobile e desktop. Confirmar que a contagem **não** trava o visitante além da janela e **não** desloca o layout.
why_human: Item que nasce da decisão do owner de 2026-07-27 (ratificação do desvio do D-10, `03-VERIFICATION.md` §override_log). Nenhum executor pode marcá-lo — ninguém viu esta tela ainda.
result: [pending]

### 6. Medir qual header de IP a Railway realmente entrega

expected: `curl -H 'X-Forwarded-For: 1.2.3.4' -H 'X-Real-IP: 5.6.7.8'` contra o deploy, comparando o `chaveHash` do Sentry Log com o hash de cada candidato. O app deve enxergar `5.6.7.8`. E a Issue `ratelimit:ip_indeterminavel` **não** deve aparecer em produção.
why_human: Item (d), aberto pelo CR-01 do code review. A ordem `x-real-ip` → última entrada do XFF é estritamente mais difícil de forjar que a anterior, mas continua sendo **inferência**: a fonte da garantia era fórum oficial, não doc formal, e duas das quatro camadas dependem dela.
result: deferred
deferred_at: 2026-08-07
deferred_to: Phase 11 (Observabilidade e go-live)
deferral_note: |
  Mede o comportamento do proxy da Railway — inalcançável sem deploy em produção.
  Registrado com dono (owner), gatilho (primeiro deploy) e detector (a Issue
  `ratelimit:ip_indeterminavel` aparecendo em produção) em `docs/PENDENCIAS.md`
  §"Diferidos para o go-live" e nas notas de execução da Phase 11 no ROADMAP.
  Risco aceito: até a medição, a camada de IP pode agrupar visitantes distintos
  num balde só ou ser forjável. O fail-open do CR-04 garante que o erro degrada
  para "não protege", nunca para "bloqueia cliente legítimo".

### 7. Calibração dos limites com dado real

expected: Uma sessão legítima de escolha de horário chega perto de 60 consultas/min? Um salão movimentado divulgando o link estoura 10 escritas/10 min no mesmo IP? Folga confortável nos dois — se chegar perto, o número **sobe**.
why_human: O erro é assimétrico: folgado demais reduz proteção e é reversível; apertado demais adiciona fricção a cliente real, e esse dano é irreversível (ninguém volta para reclamar).
result: deferred
deferred_at: 2026-08-07
deferred_to: Phase 11 (Observabilidade e go-live) / Phase 12
deferral_note: |
  Precisa de tráfego real — não existe sessão legítima nem salão movimentado para medir
  antes da abertura ao público. Mesmo registro do teste 6. Junto dele foi diferido o
  acompanhamento da taxa de `booking_honeypot`, que é o detector do pior desfecho da
  fase (autofill preenchendo o campo de uma pessoa real, que vê confirmação de um
  agendamento que não existe e não reclama, porque a tela confirmou).

## Summary

total: 7
passed: 3
issues: 0
pending: 2
deferred: 2
skipped: 0
blocked: 0

## Gaps
