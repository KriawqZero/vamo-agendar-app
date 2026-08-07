---
status: complete
phase: 03-anti-abuso-no-booking-p-blico
source: [03-VERIFICATION.md]
started: 2026-07-27T00:00:00Z
updated: 2026-07-27T20:30:00Z
---

## Current Test

number: —
name: nenhum
expected: |
  UAT ENCERRADO em 2026-08-07: 5 aprovados, 0 pendentes, 2 diferidos para a Phase 11
  (testes 6 e 7 — header de IP da Railway e calibração com tráfego real; registrados
  com dono, gatilho e detector em `docs/PENDENCIAS.md` §"Diferidos para o go-live").
awaiting: nothing

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
result: pass
passed_at: 2026-08-07
medido_por: "owner, evento inteiro aberto no painel do Sentry — a metade que nenhum instrumento fecha"
evidencia_do_owner: |
  Evento `019fde459d7a7baea0fcff9a8f75d279` (release `a0c5093`, 22:08:52Z), os 19
  atributos auditados um a um:

    camada      escrita_ip          ✓ presente
    chaveHash   fab55e98a271f413    ✓ 16 hex, forma canônica
    codigo      ratelimit.bloqueio  ✓ sintético
    message     "Requisição pública bloqueada por rate limit"  ✓ estática
    severity    warn                ✓ como o código emite

  E o que se procurava NÃO achar: nenhum valor em formato de IP, nenhum telefone,
  nenhum `org_` — nem nos atributos nossos nem nos automáticos do SDK.

  Único atributo que identifica algo: `server.address: fedora`, o hostname da
  máquina que emitiu. Entra pelo bypass de prefixo `server.` do SDK, não é dado de
  cliente final, e em produção vira o hostname do container. É um dos três achados
  já registrados em `docs/PENDENCIAS.md` — conhecido, não violação.

ressalva: |
  A Issue `ratelimit:teto_tenant_atingido` continua NUNCA exercitada: as sondas do
  harness usam slug inexistente e morrem antes das camadas de telefone e de tenant.
  Ela é o único alarme acionável da fase — o que existe para "ataque às 3h da
  manhã". Exercitá-la exige slug real e ~30 tentativas, o que cria agendamentos.
  Fica para tráfego real ou para uma sessão em que se aceite o resíduo.

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
medido_pelo_orquestrador_em_2026-08-07: |
  Depois do conserto das allowlists (quick task 260807-m5m), um run do harness
  local provocou dois bloqueios reais e os atributos CHEGARAM ao Sentry — lidos
  via MCP, não inferidos:

    22:20:25Z  codigo=ratelimit.bloqueio  camada=escrita_ip  chaveHash=85c199a0fb2436b9
    22:15:46Z  codigo=ratelimit.bloqueio  camada=escrita_ip  chaveHash=5b4cc78ee8963f37
    22:15:18Z  codigo=ratelimit.bloqueio  camada=escrita_ip  chaveHash=d44412b34d32b42b

  `chaveHash` distinto por run porque o IP da sonda muda — correlaciona com o
  contador do Redis sem que o IP exista em lugar nenhum, que era o ponto.

  Isso fecha objetivamente a metade "os atributos estão lá?". O que continua do
  owner é a varredura do evento INTEIRO no painel procurando o que NÃO pode estar
  lá (IP ou telefone cru em qualquer atributo, inclusive os automáticos do SDK) —
  a metade que nenhum instrumento fecha por construção.

resta_para_o_owner: |
  1. **Varredura anti-PII do evento inteiro no painel.** Confirmei que os logs CHEGARAM com o código
     sintético certo; não consegui ler os atributos `camada` e `chaveHash` pelo MCP,
     e atribuí isso a limitação da ferramenta ("descarta atributos customizados da
     query — não ausência do dado"). ⚠️ **Essa atribuição estava ERRADA e foi
     corrigida em 2026-08-07 — ver `achado_2026-08-07` abaixo: os dois atributos
     realmente não estavam no log.** Olhar um log no painel e confirmar os dois
     atributos presentes E nenhum IP/telefone cru continua sendo a parte que não dá
     para terceirizar: foi exatamente uma trava dessas que o incidente 260724
     mostrou não fechar por teste.
  2. **Sentry Issue `ratelimit:teto_tenant_atingido` NÃO foi exercitada.** As
     sondas usam slug inexistente e morrem antes das camadas de telefone e tenant.
     Exercitá-la exigiria slug real e ~30 tentativas, o que criaria agendamentos no
     banco. Fica para tráfego real ou para uma sessão em que se aceite o resíduo.
achado_2026-08-07: |
  **A razão pela qual `camada` e `chaveHash` não apareciam foi encontrada e
  corrigida** (quick task 260807-m5m). Não era limitação do MCP: os atributos de
  fato NÃO estavam no log.

  Havia duas allowlists de atributos, duplicadas, e uma envelheceu. A Phase 03
  acrescentou `camada` e `chaveHash` à lista de `log.ts` (o nosso filtro) e não à
  do `beforeSendLog` em `sanitizacao.ts` — que é a ÚLTIMA barreira antes do
  fornecedor. Os dois atributos passavam pelo primeiro filtro e eram descartados
  DEPOIS de aprovados, no caminho de saída. É por isso que o log
  `ratelimit.bloqueio` da evidência acima (release `25997ce`, 2026-07-28T00:36:36Z)
  chegou com `codigo` e `fluxo` — que estavam nas duas listas — e sem `camada` nem
  `chaveHash`, que estavam só na primeira.

  Achado adicional, mais grave que o sintoma, revelado pelo par de asserções do
  teste novo: a cópia do `beforeSendLog` filtrava só por NOME de chave, sem validar
  forma. `tenantHash` valendo um IP cru ATRAVESSAVA a última barreira e ia para o
  fornecedor — a validação de forma (16 hex, WR-07) existia só na primeira. Fechado
  junto.

  O que a correção entrega: fonte única de julgamento (`atributos-log.ts`)
  consultada pelas duas barreiras, validação de forma de hash também na última,
  `camada` na allowlist de `extra` das Issues, e um teste que itera a allowlist
  exportada — se a bifurcação voltar, ele fica vermelho sem depender de ninguém
  lembrar de atualizá-lo.

  ⚠️ **O que isso muda na conferência do owner, e é o ponto que mais importa:** os
  dois atributos passam a viajar no log emitido **a partir do próximo deploy com
  este código**. Portanto **um log ANTERIOR a esse deploy não serve como prova —
  nem a favor nem contra**: ele foi emitido pela versão que descartava os
  atributos, e vai continuar sem eles no painel para sempre. A conferência precisa
  provocar um bloqueio NOVO, depois do deploy, e olhar esse log.

  Este teste continua `[pending]`. Instrumento nenhum fecha "olhei o painel e não
  havia PII" — só o owner fecha.

### 5. Copy nova do bloqueio de leitura em navegador real (nasce da ratificação do D-10)

expected: Ver na tela "Muitas tentativas seguidas. Aguarde um instante e tente de novo." com o botão em `Aguarde {N}s` desabilitado, em mobile e desktop. Confirmar que a contagem **não** trava o visitante além da janela e **não** desloca o layout.
why_human: Item que nasce da decisão do owner de 2026-07-27 (ratificação do desvio do D-10, `03-VERIFICATION.md` §override_log). Nenhum executor pode marcá-lo — ninguém viu esta tela ainda.
result: pass
passed_at: 2026-08-07
medido_por: "owner, em navegador real contra o tenant do `supabase/seed.sql` (`/book/salao-do-seed`)"
ressalva_do_registro: |
  O owner reportou o item como funcionando. O que ele NÃO reportou explicitamente,
  e portanto não está verificado aqui, é o comportamento do contador quando a
  janela ainda não limpou: o `esperaRetry` é fixo em 10 s (`BookingApp.tsx:70`)
  enquanto a janela do limiter é de 1 min, e o limiter consome token na tentativa
  — então o botão reabilita antes de a janela zerar, e insistir aos 10 s falha de
  novo e estende a janela.

  Não invalida a aprovação: o UAT pedia que a contagem não travasse o visitante
  ALÉM da janela, e 10 s < 60 s satisfaz isso. O que fica sem medição é a direção
  inversa. É constante de calibração, reversível, e o ajuste (se algum dia
  incomodar) não muda contrato nenhum.
pre_requisito_de_ambiente_caiu: |
  **2026-08-07 (quick task `260807-ooq`) — o que mudou é o CUSTO DE CHEGAR À TELA, não o
  teste.** Antes, ver esta tela exigia recadastrar perfil, serviços e horários à mão a cada
  reset do banco local. Agora:

    npx supabase start          # se ainda não estiver de pé
    npx supabase db reset --local
    pnpm dev
    # abrir http://localhost:3000/book/salao-do-seed

  `supabase/seed.sql` roda automaticamente no reset e cria o tenant `salao-do-seed` com dois
  serviços ativos (30 e 60 min) e horários de segunda a sábado.

  **O Clerk NÃO é necessário para esta tela** — verificado no fonte, não assumido:
  `obterDadosBookingPublico` (`src/app/actions/public-booking.ts`) usa `createAdminClient()`
  e resolve o tenant pelo slug em `resolverPerfilPublicoPorSlug`; nada no caminho de
  `/book/<slug>` consulta o Clerk. Por isso o `tenant_id` sintético do seed não atrapalha a
  página pública (o **dashboard**, esse sim, não enxerga o tenant sem o GUC — o seed avisa).

  Continua `[pending]`: nada aqui aproxima o item de aprovado. Ninguém viu esta tela ainda, e
  só o owner fecha item de UAT.

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
instrumento_disponivel: |
  **2026-08-07 (quick task `260807-ooq`) — o instrumento passou a existir. O item continua
  `deferred`: reclassificá-lo é decisão do owner, não do executor.**

  O que caducou foi a JUSTIFICATIVA do adiamento, não a pendência. O deferimento dizia
  "inalcançável sem deploy em produção"; o deploy existe desde 2026-08-07
  (`vamoagendar.com.br`, Railway). Faltava só poder mirar fora do `127.0.0.1` — e faltava um
  jeito de responder "qual header?" sem depender de painel.

  Comandos exatos:

    # NO COMMIT QUE ESTÁ DEPLOYADO — o id da Server Action sai deste manifesto e
    # só vale se corresponder ao build remoto (o harness ABORTA se não corresponder)
    pnpm build

    # (a) execução normal contra o deploy — os 7 vereditos de sempre, ~13 sondas
    ALVO_EXTERNO=https://vamoagendar.com.br CONFIRMO_CUSTO_NO_ALVO=1 \
      bash scripts/verificar-rate-limit-escrita.sh

    # (b) a medição deste teste — qual header o alvo usa como chave, ~16 sondas
    MEDIR_HEADER_IP=1 ALVO_EXTERNO=https://vamoagendar.com.br CONFIRMO_CUSTO_NO_ALVO=1 \
      bash scripts/verificar-rate-limit-escrita.sh

  **O oráculo é o próprio balde do rate limit, não o painel.** O `chaveHash` não volta na
  resposta HTTP, então comparar hashes no Sentry seria teste de crença. O script enche o
  balde com dois candidatos de faixas de documentação distintas (`X-Real-IP: 203.0.113.x`,
  RFC 5737 TEST-NET-3; `X-Forwarded-For: 192.0.2.x`, TEST-NET-1) e interroga três sondas.
  Tabela verdade, impressa também como última linha `VEREDITO_HEADER: <valor>`:

    sem header BLOQUEADA ....................  ip-da-conexao    DESFECHO BOM (não forjável)
    só X-Real-IP BLOQUEADA, sem-header passou  x-real-ip        forjável
    só X-Forwarded-For BLOQUEADA, idem ......  x-forwarded-for  forjável
    nenhuma bloqueada ......................   inconclusivo     NUNCA é aprovação

  Os hashes dos dois candidatos são impressos como CORROBORAÇÃO (para comparar com o
  `chaveHash` do Sentry Log), nunca como veredito — e só quando `ANALYTICS_TENANT_SALT`
  existe no shell e o tripwire confirma que a forma do hash não mudou no código.

  **⚠️ Custo declarado** (o portão `CONFIRMO_CUSTO_NO_ALVO=1` é obrigatório e imprime isto
  ANTES de disparar qualquer sonda): consome orçamento de rate limit real do alvo e escreve
  contadores no Redis dele; e no desfecho BOM quem enche o balde é o **IP real da máquina que
  rodar**, que fica sem poder criar agendamento no alvo pela janela inteira (10 min). O que
  NÃO acontece: as sondas usam slug inexistente e morrem em `slug_invalido`, depois do rate
  limit — nenhum agendamento e nenhum cliente são gravados.

  **Controle que prova que o instrumento discrimina:** contra um `next start` local, onde a
  resposta é conhecida de antemão (sem proxy na frente, o `X-Real-IP` da própria sonda é o
  único candidato possível), o veredito saiu `x-real-ip` em duas execuções independentes.
  Contra um alvo que responde 200 mas não tem a Server Action, o harness aborta (código 2) no
  CONTROLE_DE_ID em vez de produzir veredito.

  A segunda caixa deste teste — a Issue `ratelimit:ip_indeterminavel` NÃO aparecendo em
  produção — continua sendo olho no painel. Instrumento nenhum fecha isso.

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
passed: 5
issues: 0
pending: 0
deferred: 2
skipped: 0
blocked: 0

## Gaps
