# Project Research Summary

**Projeto:** VamoAgendar — milestone de lançamento público
**Domínio:** SaaS B2B2C de agendamento (Brasil), multi-tenant Clerk→JWT→RLS, produto já construído
**Pesquisado:** 2026-07-20
**Confiança:** MÉDIA-ALTA (stack e arquitetura verificadas contra código e docs oficiais; features baseadas em material de marketing de concorrentes; LGPD precisa de revisão humana)

## Executive Summary

Este não é um projeto novo: é a passagem de um produto funcional para o ar. As quatro pesquisas convergem numa conclusão desconfortável — **o trabalho crítico deste milestone não é construir features, é fechar buracos que já existem e criar rede de proteção antes de tocar em schema com dados reais**. A superfície `anon` da Data API do Supabase hoje serve, em JSON, a lista completa de profissionais da plataforma (com `org_id` do Clerk), a agenda de todos os tenants e o texto livre de `excecoes_agenda.motivo`. E o plano Free do Supabase não tem backup nenhum — retenção zero, sem PITR — justamente no milestone que mais mexe em schema (dropar policies, REVOKE/GRANT, extinguir o Plus, desnormalizar duração, criar exclusion constraint, apagar dados de teste).

A abordagem recomendada é uma sequência com **dependências duras, não preferências de ordem**. `pg_dump` + keep-alive vêm antes de qualquer migration. Hardening da Data API vem antes do rate limit (enquanto o INSERT `anon` existir, rate limit na Server Action é teatro — o atacante ignora a action) e antes do billing (a partir do checkout, `assinaturas` passa a ter `asaas_customer_id` real e o custo de vazamento muda de categoria). A desnormalização da duração em `agendamentos` vem antes da exclusion constraint (ela não pode nem ser escrita hoje: a constraint só enxerga colunas da própria linha, e a duração vive em `servicos`). A remoção do Plus vem antes da modelagem de preço (senão `precos.ts` nasce com ramo morto). O e-mail funcionando vem antes de escalar convites (é o plano de continuidade do ban de WhatsApp, que em Baileys costuma ser permanente).

Os riscos maiores são de três tipos. **Irreversíveis:** migration destrutiva sem dump; ban de número; reputação de domínio queimada. **Silenciosos por construção:** fila do Asaas pausada após 15 falhas (eventos morrem em 14 dias), cota do Resend estourada, WhatsApp desconectado — o produto foi desenhado para falhar em silêncio para o cliente final, e sem observabilidade o owner é o último a saber. **De confiança com os primeiros clientes:** cobrança em duplicidade e double-booking real — ambos baratos de prevenir agora e caros de recuperar depois. A mitigação transversal é barata: dump antes de cada migration destrutiva, query de pré-voo antes de cada constraint nova, idempotência por PK em tabela de eventos, e uma página de operação do owner com quatro números.

## Key Findings

### Recommended Stack

Nada da stack existente muda. As adições são poucas e a maioria reaproveita fornecedor já contratado. Asaas entra **sem SDK** (`fetch` direto — os pacotes npm são não-oficiais, abandonados desde 2022 e nenhum cobre `/v3/checkouts`), o que é o mesmo padrão já usado para Evolution API e QStash. Resend confirma-se como escolha correta e ativa. Rate limiting entra por `@upstash/ratelimit` — argumento decisivo é que **não é vendor novo**: a conta Upstash já existe pelo QStash.

**Tecnologias novas:**
- **Asaas API v3 via `fetch`** — assinatura recorrente; header é `access_token`, **não** `Authorization: Bearer`, e `User-Agent` é obrigatório para contas criadas após 13/06/2024
- **`resend@6.17.2` + `@react-email/{components,render}`** — 3 e-mails transacionais; SDK **não lança** em erro, devolve `{ data, error }`
- **`@upstash/ratelimit@2.0.8` + `@upstash/redis@1.38.0`** — `slidingWindow` (nunca `fixedWindow`, que permite o dobro na virada da janela)
- **`@upstash/qstash@2.11.2`** — só pelo `verifySignatureAppRouter`, para substituir o `?secret=` com fallback `'secret-key'`; exige `QSTASH_NEXT_SIGNING_KEY`, que **não existe hoje** no ambiente
- **`btree_gist`** (extensão Postgres) — habilita `EXCLUDE USING gist (tenant_id WITH =, periodo WITH &&)`, a única defesa contra double-booking imune a race condition

**Guard que elimina uma classe inteira de bug:** validar no boot que o prefixo de `ASAAS_API_KEY` (`$aact_hmlg_` vs `$aact_prod_`) bate com a base URL configurada. Custa 5 linhas e impede "cobrei de verdade achando que era teste".

### Expected Features

O produto compete na **liga ferramenta** (Agende-me, Azzend, AgendaIA, R$0–120/mês), não na liga marketplace (Booksy, Trinks). Nessa liga, "sem cadastro do cliente" é **commodity de copy** — os três principais concorrentes já anunciam exatamente essa frase. A Fricção Zero é diferencial real apenas contra os líderes, e funciona como argumento de migração, não de adoção.

**Table stakes já entregues:** link público, serviços, N janelas por dia, exceções, WhatsApp automático, walk-in, página no celular.

**Table stakes ausentes:** cliente cancelar/remarcar sozinho (a liga inteira entrega) e sinal/PIX antecipado (tema mais barulhento do mercado brasileiro). Ambos fora de escopo neste milestone — o primeiro tem saída sem violar Fricção Zero (link mágico assinado no lembrete), o segundo colide de forma insolúvel.

**Table stakes no escopo:** canal de suporte visível, termos + privacidade, recibo de assinatura, e-mail de boas-vindas com o link pronto (é o momento de ativação).

**Diferencial disponível e mudo:** a grade anti-buraco é o **único** item em que o produto está sozinho na tabela comparativa — todo concorrente trata buraco de agenda de forma reativa (fila de encaixe, waitlist, mapa de calor). Prevenir na oferta é raro; o análogo mais próximo encontrado é enterprise americano. Mas é invisível: o profissional não observa o agendamento que não virou buraco. Dar nome e número (cartão no dashboard: "N janelas invendáveis evitadas este mês") é, pela análise de features, **a melhor relação valor/custo do backlog inteiro** — LOW cost, e ataca diretamente a ausência de diferencial que o PROJECT.md aceitou como out-of-scope.

**Adiar (v1.x/v2+):** cancelamento por link mágico, escape hatch da regra anti-buraco, faturamento previsto do mês, sinal/PIX, multi-profissional, marketplace.

### Architecture Approach

Descoberta que muda o desenho: **nenhum componente do browser fala com o Supabase**. Não existe `createBrowserClient` no projeto; o fluxo B2C usa `anon` apenas porque `createClient()` omite o header `Authorization` quando não há sessão. Consequência: o raio de alcance da publishable key é exatamente a superfície de GRANT da role `anon`, e essa superfície pode ser reduzida **sem tocar uma linha de frontend**. Isso torna o hardening uma fase de baixo risco e alto retorno — e é a razão de ele vir primeiro.

O padrão central do billing é assimétrico: **a Server Action inicia, o webhook decide**. A action tem `orgId` e cria customer/subscription; ela nunca concede o plano, porque só o webhook sabe que o dinheiro entrou. Isso preserva a propriedade "plano infraudável" — o tenant não tem caminho de escrita para o próprio status.

**Componentes novos:**
1. `src/lib/asaas/client.ts` — wrapper HTTP puro, sem Supabase e sem `auth()`; testável com fetch mockado
2. `src/app/api/webhooks/asaas/route.ts` — **única** porta de escrita em `assinaturas`; valida token, grava evento, aplica transição, responde 2xx rápido
3. `perfis_cobranca` (tabela nova) — `asaas_customer_id`, `preco_travado`, `fundador_em`. Tabela separada porque `perfis_empresas` tem `SELECT TO anon USING (true)` e toda coluna nova ali nasce pública
4. `eventos_asaas` (tabela nova) — PK = id do evento do Asaas; é o mecanismo de idempotência **e** o material de replay. Zero políticas RLS
5. `src/lib/precos.ts` — puro, sem I/O: `resolverPrecoPro`, `calcularSeloDesconto` (o bug do `-50%` existe porque o selo é string em `planos.ts`; derivar fecha a classe inteira)
6. `src/lib/email/{cliente,templates}.ts` + `notificacoes-billing.ts` — no-op sem `RESEND_API_KEY`, **nunca lança**, espelhando `notificacoes-agendamento.ts`
7. `12_grants_publicos.sql` — superfície pública consolidada em um arquivo, auditável em uma leitura

**Regra de decisão de efeitos:** estado de negócio é síncrono antes da resposta; comunicação (e-mail, WhatsApp, analytics) vai em `after()`; trabalho durável vai no QStash. `after()` **não é fila** — se o processo morrer, o e-mail se perde em silêncio. Ganho colateral: mover as notificações para fora do caminho síncrono de `criarAgendamentoPublico` faz a tela de sucesso aparecer assim que o INSERT commita.

### Critical Pitfalls

1. **Fechar o INSERT `anon` e achar que acabou** — a leitura é o buraco maior. `perfis_empresas` com `USING (true)` sem GRANT por coluna serve a base de clientes inteira em JSON, insumo perfeito para phishing dirigido aos profissionais. Prevenção: `REVOKE SELECT` + `GRANT SELECT (colunas)` em toda tabela com acesso `anon`, `ALTER DEFAULT PRIVILEGES ... REVOKE` no schema `public`, e teste com `curl` anônimo.

2. **A exclusion constraint não pode ser criada na forma atual da tabela** — `agendamentos` só tem `data_hora`; a duração vem de join com `servicos`. Constraint e coluna gerada só enxergam a própria linha. Pior: `NOT VALID` **não existe** para exclusion (só FK/CHECK/NOT NULL), então não há "aplica agora, valida depois" — os dados precisam estar limpos antes. E `data_hora + interval` é STABLE (DST), não IMMUTABLE, então falha em coluna gerada; a forma que passa é `tstzrange(data_hora, data_hora_fim, '[)')`. É migração de dados + limpeza + constraint, três itens, não um.

3. **Checagens de integridade bypassam RLS** — comportamento documentado do PostgreSQL, com aviso explícito de "covert channel". Sem `tenant_id WITH =` na constraint, um visitante mapeia a agenda de qualquer profissional por tentativa-e-erro. E a mensagem de erro do Postgres inclui o valor conflitante: se `error.message` subir para o `BookingApp.tsx`, o cliente final vê o `org_id` do Clerk e o horário de outra pessoa. Capturar `23P01` e traduzir.

4. **A fila do webhook Asaas pausa em silêncio e os eventos morrem em 14 dias** — 15 respostas não-2xx consecutivas pausam a sincronização; o único aviso é um e-mail ao titular da conta. Um `await enviarRecibo()` no caminho síncrono derruba o billing inteiro por um problema de e-mail. Prevenção: persistir payload cru com `event.id` como PK, responder 2xx, processar em `after()`, retornar 2xx até para evento desconhecido.

5. **Supabase Free não tem backup, e o risco é deste milestone** — retenção zero, sem PITR. Um `DELETE` mal filtrado na fase de "remover dados de teste preservando um tenant do owner" não tem desfazer. `pg_dump` antes de cada migration destrutiva é mais barato que o plano Pro e cobre o cenário real. A pausa por inatividade, em contraste, custa zero para mitigar: cron QStash → `SELECT 1`.

6. **Domínio novo mandando e-mail para quem nunca se cadastrou** — o cliente final deu o e-mail ao profissional, não ao VamoAgendar. Gmail/Yahoo querem reclamação abaixo de 0,1%; com volume baixo, três reclamações em mil já estouram. E Fricção Zero significa endereço nunca validado → todo `gmial.com` vira hard bounce. Prevenção: `From` com display name do estabelecimento (`"Studio Marina (via VamoAgendar)"`), `Reply-To` do profissional, subdomínio dedicado, DMARC `p=none` com `rua` monitorado, supressão de bounce, e ramp-up manual de convites.

## Implications for Roadmap

Granularidade fina, execução sequencial. As setas `→` marcam dependências **duras** (a fase seguinte não funciona ou não pode ser escrita sem a anterior); as demais são ordenação por valor decrescente.

### Fase 1: Rede de proteção do banco
**Racional:** é a única fase que precisa existir antes de literalmente todas as outras que tocam schema. Sem PITR no Free, o dump é a única recuperação possível. O keep-alive custa zero e elimina 100% do risco de pausa.
**Entrega:** `pg_dump` agendado (verificado por restauração única em ambiente descartável) + cron QStash batendo em rota com `SELECT 1` + a regra dura escrita: nenhuma migration destrutiva sem dump imediatamente antes.
**Evita:** Pitfall 12 (Free sem backup), pausa por inatividade.
**Dependência dura:** → toda fase de schema.

### Fase 2: Hardening da Data API
**Racional:** `curl` anônimo hoje devolve a base de clientes da plataforma. É baixo risco (nenhum código de browser fala com o Supabase) e alto retorno. **Precisa vir antes do rate limit** (senão o atacante ignora a Server Action) e **antes do billing** (`assinaturas` vai ganhar `asaas_customer_id` real).
**Entrega:** `DROP POLICY` dos INSERTs `anon` + `REVOKE INSERT`; `12_grants_publicos.sql` com REVOKE/GRANT por coluna consolidados (fora `cliente_id` de `agendamentos` e `motivo` de `excecoes_agenda`); `ALTER DEFAULT PRIVILEGES ... REVOKE`; regra escrita no `docs/03`: toda coluna nova em tabela com leitura `anon` nasce sem GRANT.
**Evita:** Pitfalls 1, 13 (parcial).
**Verificação:** `curl` com anon key não devolve linha nem coluna além do público; POST anônimo em `/rest/v1/agendamentos` retorna 401/403.

### Fase 3: Assinatura real do webhook de lembrete
**Racional:** independente de tudo, pequena, e fecha um endpoint efetivamente aberto (`?secret=` com fallback `'secret-key'` transforma env ausente em porta destrancada — permite disparar WhatsApp arbitrário em nome de tenants). Pertence ao bloco de segurança e não vale adiar.
**Entrega:** `verifySignatureAppRouter`; `agendarLembreteQStash` para de anexar `?secret=`; `QSTASH_NEXT_SIGNING_KEY` provisionada; app **falha ao subir** sem as envs, sem default.

### Fase 4: Desnormalização da duração em `agendamentos`
**Racional:** **pré-requisito não-negociável** da exclusion constraint, e item separado no roadmap por decisão explícita da pesquisa de pitfalls (esconder isso como sub-tarefa é perder o dia). Bônus grátis: mata o bug do "assume 30 min para serviço desativado" (`booking-engine.ts:143`) e conserta a incorreção de negócio de agendamentos passados mudarem de tamanho quando o profissional edita a duração.
**Entrega:** `data_hora_fim timestamptz` preenchida pela action a partir da duração no ato da reserva; backfill conferido; `NOT NULL` depois do backfill.
**Dependência dura:** ← Fase 1 (dump), ← Fase 2 (caminho de escrita único, senão não há onde preencher).

### Fase 5: Atomicidade do agendamento
**Racional:** double-booking é o cenário que mais rápido faz o profissional voltar para o caderninho. A revalidação em application code tem janela; o índice GiST não tem.
**Entrega:** query de pré-voo de sobreposições existentes (rodada e registrada **antes** da migration); `CREATE EXTENSION btree_gist`; coluna gerada `periodo tstzrange`; `EXCLUDE ... WHERE (status <> 'cancelado')`; tratamento de `23P01` traduzido na action pública **e** no walk-in de `actions/agendamentos.ts`; dedupe de `clientes` + unique `(tenant_id, telefone)` convertendo o select-then-insert em upsert atômico.
**Evita:** Pitfalls 2, 3, 4 (parte `clientes`).
**Verificação:** dois inserts concorrentes → exatamente um sucesso e um erro de domínio; teste assere a mensagem traduzida, não a do PostgreSQL; cancelar + reagendar no mesmo horário funciona.

### Fase 6: Anti-abuso (rate limit + honeypot)
**Racional:** só faz sentido **depois** da Fase 2. Não é preferência, é dependência.
**Entrega:** `@upstash/ratelimit` com `slidingWindow`, `ephemeralCache` no escopo do módulo, chave composta por camada (IP folgado — CGNAT no Brasil faz clientes legítimos colidirem; telefone normalizado apertado; `tenant_id` como teto horário), limiter separado e mais estrito para e-mail; honeypot com **sucesso falso** (bot que recebe erro tenta de novo); `analytics: true` para enxergar se o limite está derrubando cliente legítimo.
**Tensão a resolver no planejamento:** STACK recomenda Upstash Redis; ARCHITECTURE recomenda RPC atômica no Postgres. Ver "Contradições" abaixo.

### Fase 7: Extinção do Plus + modelo de preço
**Racional:** **precisa vir antes** do checkout — senão `precos.ts` e o gating nascem com ramo morto. E é uma migration de constraint contra dados existentes: mesma classe de falha da Fase 5.
**Entrega:** query de pré-voo confirmando zero linhas `plus` (transforma a crença do PROJECT.md em fato); `CHECK (plano = 'pro')`; `PlanoId` sem `'plus'`; `perfis_cobranca` com `ON DELETE RESTRICT`; `precos.ts` puro com `resolverPrecoPro` e `calcularSeloDesconto` derivado (fecha o bug do `-50%` para sempre); status `pendente` incluído no `uq_assinatura_vigente_por_tenant`.
**Nota:** entrega o preço correto **sem** depender do checkout — é o corte de emergência natural se a disponibilidade apertar.

### Fase 8: Coleta de CPF/CNPJ + `asaas/client.ts` + checkout em sandbox
**Racional:** CPF/CNPJ **não existe hoje em lugar nenhum do projeto** e é validado de verdade em produção (só dígitos, 11 ou 14). Descobrir isso com o primeiro cliente pagante é o pior momento possível. É campo novo em formulário já em uso, não detalhe de integração.
**Entrega:** campo com máscara na UI e `replace(/\D/g,'')` no payload (mesmo padrão do telefone); wrapper HTTP puro; `actions/assinatura.ts` que garante reuso do `asaas_customer_id` (nunca cria customer novo a cada tentativa), grava `pendente` via admin client e redireciona; guard de prefixo de chave no boot; botão desabilitado por `useFormStatus`.
**Evita:** Pitfalls 6 (cobrança dupla), 7 (virada sandbox→prod).

### Fase 9: Webhook Asaas idempotente
**Racional:** **fase mais arriscada do milestone** — única que combina dependência externa, idempotência e ordem de eventos. Merece plano próprio e testes do redutor em vitest, sem rede. O handler idempotente é pré-requisito do checkout, não refinamento posterior.
**Entrega:** `eventos_asaas` com PK = id do evento e upsert `ignoreDuplicates`; comparação em tempo constante do `asaas-access-token`; guarda de monotonicidade por `dateCreated`; 2xx antes do processamento e 2xx para payload desconhecido; envio sequencial marcado no painel; materialização de `preco_travado` com `AND preco_travado IS NULL` (idempotente por construção); checklist de virada sandbox→produção **escrita como artefato**; ação de reconciliação sob demanda; expurgo de eventos > 90 dias (o payload tem PII).
**Verificação:** mesmo `event.id` entregue duas vezes não duplica efeito; dois cliques em "Assinar" → uma subscription no painel Asaas.

### Fase 10: Regra de inadimplência com número
**Racional:** sem prazo, `inadimplente` é estado absorvente — Pro grátis para sempre, com custo marginal real (instância Evolution por tenant). Mas cortar no mesmo dia do `PAYMENT_OVERDUE` é pior: boleto/PIX compensam com atraso e o cartão tem retry automático. **Precisa sair da discussão com um número.**
**Entrega:** carência de N dias (7–15 é o intervalo defensável) com degradação em degraus — banner → e-mail → downgrade; downgrade **não-destrutivo** (dados de personalização permanecem, só param de ser servidos pela sanitização); defesa no ponto de disparo do QStash para lembretes já agendados de tenant rebaixado.

### Fase 11: E-mails transacionais
**Racional:** os três e-mails travam no mesmo ponto externo — verificação SPF/DKIM do domínio, que é tarefa de DNS do owner com propagação de 24–48h. **É a dependência de maior alcance do milestone e deve ser iniciada no dia 1**, em paralelo, não quando o código estiver pronto. O código descola do DNS pelo guard de env (no-op sem credencial, como o PostHog já faz).
**Entrega:** subdomínio `mail.vamoagendar.com.br` com SPF + DKIM + MX + DMARC `p=none` e `rua` monitorado; `email/{cliente,templates}`; boas-vindas, recibo e confirmação ao cliente final; `From` com display name do estabelecimento e `Reply-To` do profissional; `idempotencyKey` derivada do domínio; supressão de bounce; cota observável com comportamento definido ao estourar.
**Dependência dura:** → Fase 15 (o e-mail é o plano de continuidade do ban de WhatsApp; escalar convites antes disso é imprudente).

### Fase 12: "E-mail OU WhatsApp" no booking + `after()` nas notificações
**Racional:** depende dos templates existirem. Muda contrato em cadeia — vale mapear antes de planejar.
**Entrega:** `clientes.telefone` nullable + `CHECK (telefone IS NOT NULL OR email IS NOT NULL)`; lookup com fallback por e-mail e precedência decidida explicitamente; validação "pelo menos um" no client **e** na action; notificações movidas para `after()` (Fricção Zero medida em milissegundos); mitigações anti-ban de baixo custo (jitter assíncrono via QStash — nunca `sleep` no request; janela de silêncio no fuso do tenant; teto diário por instância).

### Fase 13: Obrigações jurídicas + anonimização LGPD
**Racional:** são **duas coisas, não uma** — documento publicado e mudança de schema. `agendamentos.cliente_id` tem `ON DELETE CASCADE`: atender um pedido de exclusão com `DELETE FROM clientes` destrói a agenda do profissional, inclusive agendamentos futuros que ele vai simplesmente não atender.
**Entrega:** rotina de anonimização (`nome = 'Cliente removido'`, contatos NULL, agendamento preservado); varredura completa dos `ON DELETE CASCADE` com a pergunta "que dado de terceiro isso destrói?"; termos + política nomeando os subprocessadores reais (Clerk, Supabase, Railway, Asaas, Resend, Upstash, Evolution, PostHog — quase todos com transferência internacional), base legal por finalidade e prazo de retenção declarado.
**Risco:** a parte jurídica é a de menor confiança de toda a pesquisa. Precisa de revisão humana antes de publicar.

### Fase 14: Observabilidade do owner + go-live
**Racional:** o critério de sucesso do milestone é "agendamentos reais acontecendo". **Se não existe onde ver isso, o critério não é verificável** e o milestone não tem como ser declarado concluído. E quatro modos de falha do sistema são silenciosos por construção.
**Entrega:** página de operação visível só ao owner respondendo quatro perguntas (instâncias conectadas vs. total, disparos com erro em 24h, agendamentos hoje, último webhook Asaas recebido); Sentry free para exceções não tratadas; PostHog verificado com evento real chegando em produção; limpeza de dados de teste (`SELECT` com o mesmo `WHERE` + conferência de contagem + dump antes); hook de imutabilidade de migrations **ativado**, não só existente; canal de suporte visível.

### Fase 15: Ativação escalonada dos primeiros profissionais
**Racional:** não é fase de código, é **regra de operação escrita como critério**. Vários números novos disparando na mesma semana é o perfil exato de banimento — e o ban não degrada o Pro, remove a proposta de valor dele.
**Entrega:** poucos tenants por semana; template personalizado no onboarding (texto idêntico saindo de números diferentes é assinatura de disparo em massa); acompanhamento da taxa de erro por instância em `disparos_whatsapp`; pagamento real de valor simbólico feito pelo próprio owner antes do primeiro convite.

### Phase Ordering Rationale

Dependências duras, todas identificadas pela pesquisa e não negociáveis:

- **Dump/keep-alive → tudo que toca schema.** Sem PITR, a única recuperação é o último dump. A pesquisa é explícita: "é por isso que o dump precede a primeira fase de schema, não a última".
- **Hardening da Data API → rate limit.** Enquanto o INSERT `anon` existir, o rate limit na Server Action é decorativo — o atacante ignora a action inteira e vai direto ao PostgREST.
- **Hardening da Data API → billing.** A partir do checkout, `assinaturas` tem `asaas_customer_id` real; vazamento muda de categoria. É a decisão já registrada no `docs/07` e no PROJECT.md.
- **Desnormalização da duração → exclusion constraint.** A constraint não pode nem ser escrita hoje. E a duração só pode ser preenchida se o caminho de escrita já for único — o que só vale depois do hardening.
- **Remoção do Plus → modelagem de preço.** `precos.ts` nasceria com ramo morto.
- **Templates de e-mail → "e-mail OU WhatsApp".**
- **E-mail funcionando → escalar convites.** O e-mail é o plano de continuidade do ban de WhatsApp.
- **Query de pré-voo → toda migration que adiciona ou aperta constraint.** Deve ser **critério de aceite transversal do milestone**, não item de uma fase. Vale para o Plus, para a exclusion, para o unique de `clientes` e para o `ck_hora_fim_apos_inicio` que já está pendente. Migrations declarativas geradas por `db diff` produzem DDL correto para banco vazio; o diff não sabe nada dos dados que já estão lá.

Fases que correm em paralelo ao caminho principal: **11 (DNS)** deve começar no dia 1 por causa da propagação; **3** pode ser feita a qualquer momento depois de 2.

Corte de emergência, se a disponibilidade de 4-5h/dia apertar: **1→2→3→4→5** já satisfazem a barra de segurança; **7** entrega o preço correto sem checkout; **8–10** podem esperar, com upgrade manual via SQL como hoje. O que **não** pode ser cortado é 1, 2 e 5 — são exatamente o que protege o critério "sem quebrar".

### Research Flags

Fases que precisam de `--research-phase` no planejamento:
- **Fase 9 (webhook Asaas)** — a fase mais arriscada: dependência externa + idempotência + ordem de eventos. Duas lacunas concretas a resolver no primeiro request contra o sandbox: `/v3/checkouts` aceita `customer` (`cus_…`) já existente ou só `customerData` inline? E qual o nome exato dos eventos de assinatura vs. pagamento no payload real?
- **Fase 5 (atomicidade)** — a imutabilidade do construtor `tstzrange` em coluna gerada está em confiança MEDIUM-HIGH; se a migration reclamar, o plano B é trigger `BEFORE INSERT OR UPDATE`. Vale confirmar antes de planejar o resto.
- **Fase 13 (LGPD)** — menor confiança de toda a pesquisa. Nenhuma fonte primária da ANPD sobre este fluxo foi localizada. Precisa de revisão jurídica humana, não de mais pesquisa técnica.
- **Fase 11 (e-mail)** — não pela stack (verificada), mas porque a entregabilidade só se conhece testando: verificar em Gmail, Outlook e um domínio corporativo, checando a aba (Principal vs. Promoções vs. Spam).

Fases com padrões estabelecidos (pular research):
- **Fases 1, 2, 3, 6, 7, 12, 14** — todas com padrão já documentado e verificado, ou espelhando estrutura que já existe no projeto (`notificacoes-agendamento.ts`, `imagens-perfil.ts`, `whatsapp-helper.ts`, o REVOKE/GRANT que `assinaturas` já faz corretamente).

## Confidence Assessment

| Área | Confiança | Notas |
|------|-----------|-------|
| Stack | **ALTA** | Versões exatas verificadas no registro npm; endpoints e headers do Asaas em docs oficiais; imutabilidade do `tstzrange` em MEDIUM-HIGH com plano B definido |
| Features | **MÉDIA** | Preços de páginas oficiais são MEDIUM/HIGH; comparativos são LOW — quase todos escritos por concorrentes com viés declarado. **Zero evidência de usuário real** |
| Arquitetura | **ALTA** na parte local, **MÉDIA** na externa | O que vem do código e das docs do Next 16 em `node_modules` é verificação direta; Asaas/Resend/QStash foram lidos em docs de fornecedor via web |
| Pitfalls | **MÉDIA-ALTA** | Docs oficiais Asaas/Supabase/PostgreSQL/Gmail cruzadas com o schema real do repositório; a parte de LGPD é síntese de fontes secundárias — MÉDIA-BAIXA |

**Confiança geral:** MÉDIA-ALTA para a ordem de construção e os riscos técnicos; MÉDIA-BAIXA para as decisões de produto e mercado.

### Contradições e tensões entre as pesquisas

Três pontos onde as pesquisas discordam entre si ou do PROJECT.md. Todos precisam de decisão explícita, não de descoberta em produção.

**1. Riscos do Supabase Free — PITFALLS contradiz o PROJECT.md.** O PROJECT.md registrava: "o risco de pausa é auto-limitante — só dispara no cenário de fracasso; o de perda de dados cresce com o sucesso". A pesquisa de pitfalls **mantém a direção mas inverte o peso**:
- A **pausa** é menos grave do que parece: dados não são perdidos, só são irrecuperáveis pelo Studio após 90 dias — é incidente de disponibilidade, não de dados. E a mitigação custa **zero**: cron QStash com `SELECT 1`. Não precisa de GitHub Actions nem serviço novo.
- A **ausência de backup** é mais grave e **não cresce com o sucesso — o risco é agora, deste milestone**. As fases planejadas são exatamente as que mexem em schema com dados reais: dropar policies, REVOKE/GRANT, extinguir o Plus, remover dados de teste "preservando um tenant do owner", desnormalizar duração, adicionar exclusion constraint. Um `DELETE` mal filtrado durante o hardening não tem desfazer.

Isso não invalida a decisão de ficar no Free — reforça que ela só é defensável **com** `pg_dump` verificado antes de cada migration destrutiva. *(Correção já aplicada ao PROJECT.md em 2026-07-20, commit `8812d00`.)*

**2. Onde vive o rate limit — STACK vs. ARCHITECTURE.** STACK recomenda `@upstash/ratelimit` + Upstash Redis (algoritmos em Lua, atômicos, mesma conta do QStash, free tier de 500K comandos/mês). ARCHITECTURE recomenda RPC atômica no Postgres, argumentando que não há Redis de aplicação provisionado. As duas leituras são defensáveis, mas há um fato que decide: **o Redis do Railway está provisionado e ocioso** (o `INTEGRATIONS.md` registra "Caching: None", e o Redis existente é da Evolution API). A recomendação da síntese é seguir a STACK (Upstash, por ser fornecedor já contratado e por não gastar write no Supabase Free — o recurso mais escasso) e **desprovisionar ou documentar explicitamente** o Redis ocioso, em vez de manter dois por inércia. A decisão vale 10 minutos na Fase 6, mas precisa ser tomada, não herdada.

**3. Lançar sem diferencial — FEATURES tensiona o out-of-scope do PROJECT.md.** O PROJECT.md coloca "construir um diferencial competitivo antes de lançar" fora de escopo, com racional sólido (construir diferencial em dias é inviável). A pesquisa de features concorda com o diagnóstico mas discorda da conclusão prática: **o diferencial já está construído e é a grade anti-buraco** — o único item da tabela comparativa em que o produto está sozinho. Falta apenas contá-lo. O custo é LOW (a engine já existe; `gerarSlotsAntiBuraco` só precisa contar quantos candidatos descartou e por quê) e é apontado como a melhor relação valor/custo do backlog inteiro. **Recomendação:** não entra no caminho crítico, mas vale existir como fase opcional no fim do roadmap. Se entrar, precisa vir com escape hatch (toggle "mostrar todos os horários"), porque a regra também pode ser lida como bug ("sei que ela está livre às 14h").

### Gaps a Resolver

- **CPF/CNPJ do profissional não existe no cadastro.** Não é detalhe de integração; é campo novo em formulário já em uso. Tratar como item próprio da Fase 8, não sub-tarefa do checkout.
- **`/v3/checkouts` aceita `customer` existente?** — resolver no primeiro request contra o sandbox (5 minutos). Se não aceitar, correlacionar pelo webhook.
- **Imutabilidade do `tstzrange` em coluna gerada** — confirma-se na primeira migration; plano B (trigger) já definido.
- **Carência de inadimplência sem número** — decisão de produto do owner. 7 a 15 dias é o intervalo defensável, mas o número precisa ser escrito antes de planejar a Fase 10.
- **Precedência de lookup quando telefone e e-mail batem em clientes diferentes** — decidir na Fase 12, não descobrir em produção.
- **"Sem cadastro" dos concorrentes não foi verificado literalmente** — Azzend, AgendaIA e RobotiZap afirmam em copy; ninguém executou um booking real. Se a diferença for real, muda a avaliação da Fricção Zero de "paridade" para "diferencial subcomunicado". Vale 30 minutos do owner, fora do caminho de código.
- **Nenhuma evidência de usuário real em toda a pesquisa de features.** Isso é limitação estrutural, não falha — e é exatamente o que a aposta declarada do owner (lançar e descobrir com os primeiros profissionais) existe para resolver.

### Decisões do owner registradas em 2026-07-20 (fecham gaps da pesquisa)

- **Checkout aberto na janela de fundador e pago fora dela vale R$ 29,90** — comportamento natural do Asaas (cobra o valor com que a subscription foi criada); aceito conscientemente em vez de invalidar checkouts pendentes na virada.
- **LGPD: só documentar por ora** — o direito de exclusão é descrito nos termos e atendido manualmente pelo owner via SQL. A armadilha do `ON DELETE CASCADE` em `agendamentos.cliente_id` permanece e deve ser tratada com anonimização manual, nunca `DELETE FROM clientes`.
- **Remetente dos e-mails: `"<Estabelecimento> via VamoAgendar"`** com `Reply-To` do profissional — reconhecível pela cliente final e transparente sobre a plataforma.

## Decisões que exigem o owner, não código

Ordenadas por quando travam o roadmap:

1. **DNS do subdomínio de e-mail** (SPF + DKIM + MX + DMARC `p=none`) — propagação de 24–48h, bloqueia três entregas. **Começar no dia 1.**
2. **Verificação da conta Asaas para produção** — único item com prazo fora do controle do owner. Não bloqueia a construção (sandbox), bloqueia a virada.
3. **Número de dias de carência da inadimplência** — decisão de produto, trava a Fase 10.
4. **Upstash Redis vs. Redis do Railway vs. RPC Postgres** — escolher um e desprovisionar/documentar o outro.
5. **Revisão jurídica humana** dos termos e da política antes de publicar.
6. **Ritmo de convites** dos primeiros profissionais — é decisão de risco (ban de WhatsApp), não de marketing.
7. **Se a métrica "agenda densa" entra no milestone** — o único item barato que ataca a ausência de diferencial reconhecida.

## Sources

### Primárias (ALTA confiança)
- Registro npm (`npm view`) — versões exatas, peers, `engines`, inexistência de SDK Asaas oficial
- `node_modules/next/dist/docs/` (16.2.10) — semântica de `after()`, Server Actions (CSRF Origin×Host, IDs criptografados, `bodySizeLimit`), backend-for-frontend, `redirect()` com URL externa
- Código do repositório — `supabase/schemas/*.sql`, `src/app/actions/public-booking.ts`, `src/lib/supabase/{server,admin}.ts`, `src/app/api/webhooks/lembrete/route.ts`
- Context7 `/llmstxt/asaas_llms_txt` — headers, endpoints, payloads, eventos de webhook
- PostgreSQL docs — `ALTER TABLE` (`NOT VALID` restrito a FK/CHECK/NOT NULL), Row Security Policies (integridade bypassa RLS), Range Types
- Supabase — Securing your Data API, Column Level Security, Project Pausing, blog de range columns
- Resend — quotas do free tier, domínios (SPF/DKIM/MX, recomendação de subdomínio), DMARC
- Google — Email sender guidelines FAQ (limiares 0,1% / 0,3%)
- Context7 `/websites/upstash_redis_sdks_ratelimit-` e `/websites/upstash_qstash`

### Secundárias (MÉDIA confiança)
- docs.asaas.com (webhooks, sandbox, chaves) — at-least-once, 15 falhas pausam a fila, retenção de 14 dias
- Páginas oficiais de Trinks, Booksy, Azzend, AgendaIA, Belle Software, Easy Salon — preços e promessas (material de marketing)
- Issues do repositório da Evolution API (#1840, #1870, #439) — aquecimento de números e banimento
- Bytebase, Makerkit, SimpleBackups — RLS footguns, boas práticas, free tier pausado

### Terciárias (BAIXA confiança — precisam de validação)
- Comparativos de Agende-me, Barbeiro.app, Belasis — **todos escritos por concorrentes**, viés declarado
- Frizzar — sinal como norma emergente; número de queda de no-show é de blog, não verificado
- Fontes de LGPD (Together Privacy, LAPIN, Legale) — **nenhuma fonte primária da ANPD sobre este fluxo foi localizada**; revisão jurídica humana obrigatória

---
*Pesquisa concluída: 2026-07-20*
*Pronto para roadmap: sim*
