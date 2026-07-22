# Roadmap: VamoAgendar — Lançamento Público

## Overview

O produto está construído e funcionando. Este milestone não constrói features novas por
prazer: fecha buracos que já existem e entrega o que falta para receber tráfego real. A
sequência é organizada em camadas técnicas e ordenada por valor decrescente — superfície
pública fechada → agenda íntegra → anti-abuso → canal de e-mail → contato flexível →
diferencial visível → preço correto → autonomia do cliente → cobrança automática →
obrigações legais → observabilidade → abertura ao público.

A ordem não é preferência: as seis dependências duras abaixo foram verificadas contra o
código real e violá-las produz trabalho que não funciona ou que precisa ser refeito.

## Dependências duras

| Precede | Depende | Por quê |
|---|---|---|
| Etapa preparatória (fail-fast de env) | Phase 1 (SEG-05) | SEG-05 exige que a aplicação não suba sem as chaves de assinatura do QStash. O mecanismo de fail-fast nasce na etapa preparatória — a Phase 1 acrescenta as chaves dela à mesma lista, em vez de inventar um segundo caminho |
| Phase 1 (hardening da Data API) | Phase 3 (rate limit) | Enquanto o INSERT `anon` existir, o rate limit na Server Action é teatro — o atacante ignora a action e escreve direto no PostgREST |
| Phase 1 (hardening da Data API) | Phase 9 (cobrança) | A partir do checkout, os dados de cobrança passam a ser reais; o custo de um vazamento muda de categoria |
| Desnormalização da duração | Exclusion constraint | Ambas dentro da Phase 2, nesta ordem obrigatória: a constraint **não pode nem ser escrita** hoje, porque a duração vive em `servicos` e constraint só enxerga a própria linha |
| Phase 4 (templates de e-mail) | Phase 5 ("e-mail OU WhatsApp") | O booking só pode aceitar e-mail quando existir algo que envie e-mail |
| Phase 4 (e-mail funcionando) | Phase 12 (escalar convites) | O e-mail é o plano de continuidade caso o WhatsApp do profissional seja banido — e ban em Baileys costuma ser permanente |
| Phase 2 (exclusion constraint) | Phase 8 (cancelamento/remarcação) | Remarcação pública precisa da mesma proteção contra sobreposição do agendamento normal |

## Regra transversal de aceite

**Toda migration que adiciona ou aperta constraint só é aplicada depois de uma query de
pré-voo que conta as linhas violadoras em produção, com o resultado registrado no plano da
fase.** Migrations declarativas geradas por `supabase db diff` produzem DDL correto para
banco vazio — o diff não sabe nada dos dados que já estão lá. Vale para a exclusion
constraint (Phase 2), o unique de `clientes` (Phase 2), o `CHECK` de contato (Phase 5), o
`CHECK (plano = 'pro')` (Phase 7), o `ck_hora_fim_apos_inicio` já pendente, e qualquer
constraint das Phases 8 a 10.

## Rede de proteção do banco — condição, não fase

O banco atual **não é produção**: não há profissional real nem agendamento de cliente
final, e o owner autorizou explicitamente reestruturar, refazer e rodar migration
destrutiva sem cerimônia (2026-07-21). Por isso não existe fase de backup neste roadmap —
proteger lixo descartável seria trabalho sem risco coberto.

**A condição que reativa isso:** no instante em que existir dado de terceiro no banco —
primeiro profissional real ativado (Phase 12) ou qualquer migração para um banco de
produção — a ausência de rede de proteção deixa de ser aceitável. Nesse ponto, uma das
duas precisa estar valendo:

1. **Supabase Pro** — backup diário com 7 dias de retenção, e o projeto deixa de ser
   pausável por inatividade (pausa é exclusiva do Free). Depende de aprovação do sócio,
   sem data.

2. **`pg_dump` próprio antes de cada migration destrutiva** — se o Pro não tiver saído até
   lá, esta é a alternativa mínima, e ela custa um script.

Abrir ao público sem nenhuma das duas é risco aceito que precisa ser decidido
explicitamente, não descoberto.

## Barra mínima para abrir ao público

Não há data fixa de lançamento. O produto abre quando esta barra estiver satisfeita:

**Obrigatórias — Phases 1, 2, 3, 4, 5, 7, 10, 11, 12.**

- 1 a 3 são o que protege o critério de sucesso "sem que nada quebre no caminho"
- 4 e 5 entregam o canal de e-mail, que é o plano de continuidade do WhatsApp e portanto
  pré-requisito de escalar convites (Phase 12)

- 7 impede abrir vendendo um plano que vai morrer com um selo de desconto que mente
- 10 é obrigação legal, não escolha
- 11 é o que torna o critério de sucesso verificável — sem ela não há onde ver se
  agendamentos reais estão acontecendo

- 12 é a abertura em si

**Adiáveis para depois da abertura, nesta ordem de preferência de corte:**

1. **Phase 6 (diferencial visível)** — a mais barata das três; cortar aqui dói menos porque
   custa pouco para retomar

2. **Phase 8 (autonomia do cliente final)** — table stake, mas tem contorno: o canal de
   suporte visível da Phase 10 absorve os pedidos de cancelamento até ela existir

3. **Phase 9 (cobrança automática)** — o contorno é o de hoje: upgrade manual por SQL.
   ⚠️ Cortar a Phase 9 também adia **ATI-02** (owner pagando o próprio produto), e a
   abertura passa a acontecer sem cobrança automática — decisão que o owner precisa tomar
   explicitamente, não descobrir

Se as Phases 8 e 9 forem adiadas para depois da Phase 11, elas passam a rodar sob as
regras de migration imutável (fase DEV encerrada) — o que é o comportamento correto, só
precisa ser sabido antes.

## Phases

**Numeração:**

- Fases inteiras (1, 2, 3): trabalho planejado do milestone
- Fases decimais (2.1, 2.2): inserções urgentes depois do planejamento

- [ ] **Etapa preparatória: Fundação operacional** - Sentry, PostHog e Resend de pé antes da Phase 1 começar
- [ ] **Phase 1: Hardening da superfície pública** - A chave publicável deixa de servir a base de profissionais e a agenda de todos os tenants
- [ ] **Phase 2: Integridade da agenda** - Duração gravada no agendamento e proteção atômica contra double-booking
- [ ] **Phase 3: Anti-abuso no booking público** - Rate limit e honeypot sem nenhuma fricção visível ao cliente
- [ ] **Phase 4: Canal de e-mail transacional** - Resend em domínio próprio, com remetente reconhecível e supressão de bounce
- [ ] **Phase 5: Contato flexível no booking** - Cliente final agenda com e-mail OU WhatsApp e recebe a confirmação pelo que informou
- [ ] **Phase 6: Diferencial visível — agenda densa** - Profissional enxerga o buraco de agenda que a grade anti-buraco evitou
- [ ] **Phase 7: Fim do Plus e preço correto** - Um único plano pago, R$ 39,90 com fundador vitalício de R$ 29,90 e selo derivado
- [ ] **Phase 8: Autonomia do cliente final** - Cancelamento e remarcação por link assinado, sem login, cadastro ou código
- [ ] **Phase 9: Cobrança automática ponta a ponta** - Checkout Asaas em sandbox, webhook idempotente e regra de inadimplência com prazo
- [ ] **Phase 10: Obrigações jurídicas e LGPD executável** - Termos, política, canal de suporte e exclusão por anonimização
- [ ] **Phase 11: Observabilidade e go-live** - Painel do owner, error tracking, funil verificado e banco em modo produção
- [ ] **Phase 12: Ativação dos primeiros profissionais** - Convites escalonados com acompanhamento até o primeiro agendamento real

## Phase Details

### Etapa preparatória: Fundação operacional

**Goal**: O produto tem error tracking, funil e canal de e-mail de pé antes da Phase 1 começar — e a ausência de configuração em produção deixa de ser silenciosa
**Depends on**: Nada — é a primeira coisa do milestone. É pré-requisito obrigatório da Phase 1
**Requirements**: OPE-02, EML-05
**Success Criteria** (o que precisa ser VERDADE):

  1. Uma exceção não tratada em produção chega ao projeto do Sentry do owner, com rota e stack, sem depender de alguém reclamar
  2. Nenhum evento do Sentry carrega nome, telefone ou e-mail de cliente final — nem em querystring, nem em breadcrumb, nem em corpo de Server Action — e a trava está no código versionado, não em toggle de painel
  3. Sem `RESEND_API_KEY`, `enviarEmail` devolve `desativado`, nenhum fluxo quebra e nada é registrado como erro
  4. Um e-mail real sai de `naoresponda@mail.vamoagendar.com.br` identificado como `"<Estabelecimento> via VamoAgendar"`, com resposta indo ao profissional, e chega à caixa do owner
  5. Em produção, subir sem uma variável obrigatória derruba o boot listando todos os nomes ausentes de uma vez — e `pnpm build` local sem secrets continua funcionando
  6. Um evento real de funil aparece no projeto do PostHog do owner (a verificação com tráfego real de produção continua sendo OPE-03, na Phase 11)

**Plans**: 1 plano (quick task 260721-jif)

**Notas de execução:**

- Os três produtos vêm juntos de propósito: wrapper do Resend nascido antes do Sentry nasceria com `console.error`, que no Railway é linha de log que ninguém lê, e a Phase 4 herdaria a dívida de trocar depois
- O PostHog **já está implementado e correto** (`src/lib/analytics/`) — o que falta é projeto criado, chaves nos ambientes e verificação de que evento chega. Nenhuma linha de `analytics/` é reescrita aqui
- `tunnelRoute` e source maps do Sentry ficaram de fora com justificativa registrada em `docs/PENDENCIAS.md`; `tunnelRoute` colide com o matcher de `src/proxy.ts`
- A instrumentação cobre a lista fechada de pontos de falha silenciosa que existem hoje; a fila do Asaas (`ROADMAP.md:390`) não tem código ainda e é herança explícita da Phase 9

---

### Phase 1: Hardening da superfície pública

**Goal**: A chave publicável que vai no bundle deixa de dar acesso a qualquer coisa além do estritamente necessário para a página pública funcionar, e o webhook de lembrete só aceita quem o QStash assinou
**Depends on**: Etapa preparatória "Fundação operacional" (o fail-fast de env que SEG-05 exige nasce lá)
**Requirements**: SEG-01, SEG-02, SEG-03, SEG-04, SEG-05
**Success Criteria** (o que precisa ser VERDADE):

  1. `curl` anônimo em `/rest/v1/perfis_empresas` não devolve a lista de profissionais da plataforma — nem `telefone_contato`, nem o `org_id` do Clerk
  2. POST anônimo em `/rest/v1/agendamentos` e `/rest/v1/clientes` é rejeitado, e o booking público continua funcionando exatamente como antes
  3. `curl` anônimo em `agendamentos` e `excecoes_agenda` devolve só as colunas que a engine de disponibilidade consome — sem `cliente_id`, sem o texto livre de `motivo`
  4. Uma tabela nova criada no schema `public` não aparece na Data API sem GRANT explícito
  5. POST sem assinatura válida do QStash no webhook de lembrete é rejeitado, e a aplicação não sobe se as chaves de assinatura não estiverem configuradas

**Plans**: 14/16 plans executed

Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Tracer: fecha o portão de `assinaturas` ponta a ponta + harness de verificação anônima (wave 1)
- [x] 01-03-PLAN.md — Webhook de lembrete assinado pelo QStash + fail-fast de boot (SEG-05/D-05) (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — Leitura pública via admin client, projeções explícitas e contrato por slug (D-02/D-04) (wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-04-PLAN.md — Banco fechado por padrão: REVOKE total de anon, policies substitutas e default privileges (D-01/D-03/D-07) (wave 3)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 01-05-PLAN.md — Verificação integrada dos 5 critérios + UAT obrigatório de booking e dashboard (wave 4)

**Fechamento de gaps** *(planejado em 2026-07-22 a partir de `01-VERIFICATION.md`; waves próprias, os cinco planos acima já estão concluídos)*

⛔ **Serialização estrita — um plano por wave, nunca em paralelo.** Os três primeiros rodam `pnpm build` e/ou tocam o Supabase de dev; qualquer par concorrente faz a prova medir a árvore errada (`.next/` compartilhado, fixture do tenant de teste apagada no meio, contagem cross-tenant da linha de base poluída). Foi o BLOCKER da revisão 1.

- [x] 01-07-PLAN.md — Suíte de integração do caminho de ESCRITA do booking contra o Supabase de dev (gap 2, SC2b) (wave 1)
- [x] 01-06-PLAN.md — Boot que morre de verdade sem as chaves + harness que prova (gap 1, SEG-05) (wave 2, depende de 01-07)
- [x] 01-08-PLAN.md — DROP das duas policies residuais de `servicos`/`horarios_funcionamento` (gap 3) (wave 3, depende de 01-06 e 01-07)
- [x] 01-09-PLAN.md — Gate de reexecução das provas + reparo de REQUIREMENTS/ROADMAP/PENDENCIAS (wave 4, depende dos três)

**2ª rodada de fechamento de gaps** *(planejada em 2026-07-22 a partir da reverificação sobre o HEAD `4596463`, que REPROVOU com 7/9 must-haves, e dos achados aprovados do `01-REVIEW.md`; waves próprias, os nove planos acima já estão concluídos)*

⛔ **Serialização estrita mantida — um plano por wave, nunca em paralelo.** Todos os sete constroem, tocam o Supabase de dev, ou dependem do estado que o anterior deixou. Os três modos de falha nomeados na rodada 1 (`.next/` compartilhado, fixture do tenant de teste apagada no meio, contagem cross-tenant poluída) continuam valendo integralmente.

- [x] 01-10-PLAN.md — **Tracer:** um erro esperado atravessa a fronteira de flight em build de produção, com harness que reprova antes do conserto (gap 2, parte 1) (wave 1)
- [x] 01-11-PLAN.md — A chave HMAC sai da URL publicada e o corpo do gateway sai do log (gap 1 / CR-01 + CR-04) (wave 2)
- [x] 01-12-PLAN.md — Caminho de escrita discriminado e recuperação de double-booking viva (gap 2, parte 2 — insumo obrigatório do SC4 da Phase 2) (wave 3)
- [x] 01-13-PLAN.md — `PENDENCIAS`/`CONTEXT`/`COVERAGE` coerentes, rotação de chave datada e os quatro deferimentos por escrito (gap 3 / WR-05) (wave 4)
- [x] 01-15-PLAN.md — Default privilege passa a cobrir FUNCTIONS e o harness anônimo para de dar verde sem provar nada (WR-02 + WR-08) (wave 5)
- [ ] 01-14-PLAN.md — Namespace do slug público deixa de ser sequestrável: UNIQUE, checagem cruzada e resolução não-ambígua (CR-03) (wave 6, depende de 01-15)
- [ ] 01-16-PLAN.md — Falha de leitura em `assinaturas` para de derrubar o link público de tenant pagante (WR-07) (wave 7)

**Por que o 01-15 vem antes do 01-14** (ordem trocada na revisão de planos): o 01-14 usa `scripts/verificar-superficie-anon.sh` como portão de não-regressão, mas o defeito WR-08 é **do próprio harness** — ele classifica como ESPERADO qualquer código diferente de 200, e só o 01-15 conserta isso. Medir fechamento de banco com o instrumento cuja calibração esta rodada admite estar quebrada é a circularidade que já queimou a fase duas vezes. Não há dependência técnica entre a constraint de slug e a default privilege de FUNCTIONS, então a troca custou apenas renumerar duas waves. O 01-12 (wave 3) também usa o harness e **não** pôde ser movido sem quebrar a ordem tracer→expansão; lá o exit 0 está registrado explicitamente como sinal fraco.

**Fora do escopo desta rodada, por decisão do owner:** WR-01 (a Server Action pública devolve `tenant_id` e `slug_gratuito` — o mais barato e o mais aderente ao tema da fase), WR-03 (escrita pública sem limite de tamanho nem validação de e-mail), WR-04 (verificação por `req.url` pode matar todos os lembretes atrás do proxy) e WR-06 (falha de transporte gera lembrete duplicado). Registrados com razão e gatilho de retorno em `docs/PENDENCIAS.md` pelo plano 01-13 — nenhum foi descartado.

**Notas de execução:**

- Fase de baixo risco e alto retorno: **nenhum componente do browser fala com o Supabase** (não existe `createBrowserClient` no projeto), então a superfície `anon` pode ser reduzida sem tocar em frontend
- A escrita operacional já usa `createAdminClient()` pós-validação — as policies de INSERT `anon` são superfície sem função
- Padrão a replicar: o `REVOKE SELECT` + `GRANT SELECT (colunas)` que `08_assinaturas.sql` já faz corretamente
- `ALTER DEFAULT PRIVILEGES ... REVOKE` no schema `public` + a regra escrita no `docs/03`
- SEG-05 fecha o `?secret=` com fallback `'secret-key'`, que hoje transforma env ausente em porta destrancada para disparar WhatsApp em nome de tenants
- ✅ O DNS do subdomínio de e-mail, que era o item mais atrasado do milestone, **foi resolvido em 2026-07-21** e não bloqueia mais nada — ver Phase 4
- **O critério 5 é provado por `bash scripts/verificar-fail-fast-boot.sh`** — quatro vereditos com o exit code como veredito: `BUILD` (o build continua saindo 0 com a variável vazia), `MORTE` (o `next start` de produção encerra com código 1, nomeia a variável em `stderr` e a porta recusa conexão), `CONTROLE` (o mesmo build com as quatorze presentes responde 200) e `WEBHOOK` (401 sem assinatura, 401 com o secret legado em query string, 401 com assinatura forjada, 200 no controle). É o comando a rodar antes de qualquer afirmação sobre SEG-05
- **A primeira medição da fase (plano 01-05, confirmada pelo verificador) encontrou o processo SOBREVIVENDO:** com uma obrigatória vazia o `next start` logava o erro, respondia 500 em toda rota e seguia escutando — deploy verde com 100% do tráfego falhando. Não era buraco de segurança, era defeito operacional. A semântica de boot foi alterada por decisão do owner no plano 01-06 (`process.exit(1)` guardado por produção + runtime `nodejs`), e só então o critério 5 passou a ser literalmente verdadeiro
- Os quatro planos do fechamento de gaps rodaram na ordem 01-07 → 01-06 → 01-08 → 01-09, um por wave; o 01-09 reexecutou as três provas sobre o HEAD final antes de escrever qualquer documento
- **A reverificação sobre o HEAD `4596463` REPROVOU com 7/9 must-haves**, com dois bloqueadores novos que o code review levantou e o verificador confirmou de forma independente: (1) a chave HMAC que autentica o webhook era publicada em texto claro na query string de todo lembrete — a porta foi fechada com fechadura correta e a chave ficou no capacho; (2) em build de produção o React transporta só o `digest` do erro de Server Action, então a copy contratada no `01-UI-SPEC` e a recuperação de double-booking estavam mortas na tela. Nenhum dos dois é regressão do fechamento de gaps — são dívida que a fase carregou desde o começo e que só apareceu quando alguém foi medir a produção em vez de ler o código
- **Lição de método da rodada 2, e a razão de o plano 01-10 ser um tracer:** teste que chama a Server Action **em processo** não prova a travessia, e verificação em `pnpm dev` não prova comportamento de produção. Foi um verde de suíte num caminho morto que deixou o defeito atravessar nove planos, um review e uma verificação. A partir daqui, toda afirmação sobre o que o cliente final vê exige `next start` sobre build de produção
- ⚠️ **O gap 2 é insumo obrigatório da Phase 2:** o Success Criteria 4 dela ("quem perde a corrida vê a mensagem amigável com os horários recarregados") é insatisfazível por construção enquanto o erro esperado não atravessar a fronteira. O plano 01-12 é o que o desbloqueia

---

### Phase 2: Integridade da agenda

**Goal**: Dois clientes nunca ocupam o mesmo horário do mesmo profissional, e o tamanho de um agendamento não muda depois que ele foi marcado
**Depends on**: Phase 1
**Requirements**: AGE-01, AGE-02, AGE-03, AGE-04, AGE-05
**Success Criteria** (o que precisa ser VERDADE):

  1. Editar a duração de um serviço não altera o horário de término de agendamentos já marcados
  2. Serviço desativado continua ocupando na agenda exatamente o tempo que foi reservado — a engine não assume mais 30 minutos
  3. Duas requisições simultâneas para o mesmo intervalo resultam em exatamente um agendamento ativo, tanto no fluxo público quanto no walk-in do dashboard
  4. Quem perde a corrida vê "esse horário acabou de ser reservado, escolha outro" com os horários recarregados — nunca a mensagem do PostgreSQL, que carrega o `org_id` e o horário de terceiro
  5. Agendar duas vezes com o mesmo telefone no mesmo tenant reaproveita o cliente existente, sem criar segunda linha nem duplicar disparo

**Plans**: TBD

**Ordem interna obrigatória** (não é sugestão — a etapa 3 não pode ser escrita antes da 1):

1. `data_hora_fim timestamptz` em `agendamentos`, preenchida pela action no ato da reserva, backfill conferido, `NOT NULL` depois do backfill
2. Query de pré-voo: sobreposições já existentes (self-join com `&&`) e duplicatas de `(tenant_id, telefone)` em `clientes` — resolvidas **antes** da migration
3. `CREATE EXTENSION btree_gist` + coluna `periodo tstzrange` + `EXCLUDE USING gist (tenant_id WITH =, periodo WITH &&) WHERE (status <> 'cancelado')` + unique `(tenant_id, telefone)` convertendo o select-then-insert em upsert atômico

**Notas de execução:**

- `NOT VALID` **não existe** para exclusion constraint (só FK, CHECK e NOT NULL) — não há "aplica agora, valida depois"; os dados precisam estar limpos antes
- `tenant_id WITH =` é obrigatório na constraint: sem ele, um visitante mapeia a agenda de qualquer profissional por tentativa-e-erro, porque checagem de integridade **bypassa RLS** por design
- Sem o predicado `status <> 'cancelado'`, horário cancelado bloqueia o slot para sempre e o bug só aparece semanas depois como "sumiu horário da agenda"
- Confiança MÉDIA-ALTA na imutabilidade do construtor `tstzrange` em coluna gerada; plano B definido é trigger `BEFORE INSERT OR UPDATE`

---

### Phase 3: Anti-abuso no booking público

**Goal**: Um script repetindo requisições não consegue lotar a agenda de um profissional, e o cliente legítimo não percebe absolutamente nada
**Depends on**: Phase 1, Phase 2
**Requirements**: ABU-01, ABU-02, ABU-03
**Success Criteria** (o que precisa ser VERDADE):

  1. Script repetindo requisições para de conseguir criar agendamentos ao bater o teto — tanto pela Server Action quanto pela Data API
  2. O cliente legítimo agenda sem nenhuma etapa nova: nenhum CAPTCHA, nenhum campo visível a mais, nenhum atraso perceptível
  3. O owner consegue ver quantas requisições foram barradas e por qual chave (IP, telefone ou tenant), o suficiente para saber se o limite está pegando gente de verdade

**Plans**: TBD

**Notas de execução:**

- Rate limit por IP puro falha nos dois sentidos no Brasil: CGNAT de operadora móvel faz clientes diferentes colidirem, e script com IP rotativo passa direto. Chave composta por camada: IP folgado, telefone normalizado apertado, `tenant_id` como teto horário
- `slidingWindow`, nunca `fixedWindow` (que permite o dobro na virada da janela)
- Honeypot com **sucesso falso**: bot que recebe erro tenta de novo; bot que recebe sucesso vai embora
- **Decisão pendente do owner** (10 minutos, mas precisa ser tomada e não herdada): Upstash Redis (recomendação da pesquisa — fornecedor já contratado pelo QStash, não gasta write no Supabase Free) vs. RPC atômica no Postgres. O Redis do Railway não serve: pertence à Evolution API e fala TCP, incompatível com a lib, que é HTTP/REST. Escolher um e desprovisionar ou documentar o outro
- Calibrar olhando dado real: um salão movimentado divulgando o link pode legitimamente receber vários agendamentos no mesmo minuto

---

### Phase 4: Canal de e-mail transacional

**Goal**: O produto consegue falar por e-mail com o profissional sem queimar a reputação de um domínio que não tem histórico nenhum
**Depends on**: Etapa preparatória "Fundação operacional" (SDK, wrapper e remetente do Resend já entregues lá). **DNS deixou de ser bloqueio** — ver notas
**Requirements**: EML-01, EML-04, EML-06
**Success Criteria** (o que precisa ser VERDADE):

  1. Profissional que acaba de criar a conta recebe um e-mail com o link `/book/[slug]` dele pronto para compartilhar
  2. O e-mail chega identificado pelo estabelecimento (`"<Estabelecimento> via VamoAgendar"`) e responder vai para o profissional, não para o VamoAgendar
  3. Endereço que deu hard bounce entra em supressão e não recebe novo envio
  4. A entrega foi verificada em Gmail, Outlook e um domínio corporativo, com a aba de chegada registrada (Principal, Promoções ou Spam)

**Plans**: TBD
**UI hint**: yes

**Notas de execução:**

- ✅ **DNS RESOLVIDO em 2026-07-21** — deixou de ser a dependência externa de maior alcance do milestone. Verificado de fora por `dig`: `resend._domainkey.mail.vamoagendar.com.br` responde com a chave pública do Resend, propagada. O subdomínio dedicado `mail.vamoagendar.com.br` está verificado no painel e isola a reputação do domínio raiz, como recomendado
- **Remetente**: `naoresponda@mail.vamoagendar.com.br`. Domínio verificado libera qualquer local-part — não é preciso verificar endereço por endereço
- ⚠️ **Ainda pendente no DNS (um registro TXT cada, sem propagação dolorosa):** DMARC `p=none` com `rua` monitorado — hoje não existe nem no subdomínio nem na raiz, então o envio acontece sem relatório nenhum; e SPF no subdomínio, que também está ausente. Nenhum dos dois impede enviar: no Resend o alinhamento DMARC passa por **DKIM**, e o DKIM está válido
- ⚠️ **Não há MX em lugar nenhum** — nem na raiz, nem no subdomínio. Isso é correto para `naoresponda@`, que não deve receber, mas significa que **nenhum endereço do domínio recebe e-mail hoje**. O canal de suporte da Phase 10 depende de resolver isso (Resend só envia; caixa de entrada exige provedor próprio)
- DMARC em `p=none` com `rua` monitorado; endurecer para `quarantine` só depois de semanas de relatório limpo. Publicar `p=reject` de saída derruba o próprio e-mail sem sinal claro de causa
- O SDK do Resend **não lança** em erro — devolve `{ data, error }`; o wrapper nunca pode lançar
- Teto do Free: 100 e-mails/dia, 3.000/mês, 1 domínio. Sem observação da cota, o e-mail falha em silêncio no melhor dia do lançamento
- EML-05 e o wrapper de envio foram entregues na etapa preparatória — esta fase consome `enviarEmail`, não o reescreve

---

### Phase 5: Contato flexível no booking

**Goal**: O cliente final agenda com o contato que ele tiver e recebe a confirmação por ele — sem que a promessa de `docs/05` continue sendo falsa
**Depends on**: Phase 2 (dedupe de clientes), Phase 4 (templates)
**Requirements**: BOO-01, BOO-02, BOO-03, EML-03
**Success Criteria** (o que precisa ser VERDADE):

  1. Cliente final conclui um agendamento informando só e-mail, só WhatsApp ou os dois; deixar os dois vazios é recusado no formulário **e** na Server Action, com mensagem que explica por quê
  2. Cliente que informou e-mail recebe a confirmação com o nome do estabelecimento no assunto, não "Bem-vindo ao VamoAgendar"
  3. A tela de sucesso aparece assim que o agendamento é gravado, sem esperar o envio de WhatsApp nem de e-mail
  4. Cliente que já agendou antes é reconhecido por qualquer um dos contatos e não vira segunda linha em `clientes`

**Plans**: TBD
**UI hint**: yes

**Notas de execução:**

- Muda contrato em cadeia: `clientes.telefone` vira nullable + `CHECK (telefone IS NOT NULL OR email IS NOT NULL)` — **query de pré-voo obrigatória** antes do CHECK
- **Decidir antes de planejar, não descobrir em produção:** precedência do lookup quando telefone e e-mail batem em clientes diferentes
- Notificações movidas para `after()` — ganho colateral: a Fricção Zero passa a ser medida em milissegundos, não no round-trip da Evolution API. `after()` **não é fila**: se o processo morrer, o e-mail se perde em silêncio
- Mitigações anti-ban de baixo custo que cabem aqui: jitter assíncrono via QStash (nunca `sleep` no request), janela de silêncio no fuso do tenant, teto diário por instância
- O `telefone` nullable desta fase é pré-requisito da anonimização da Phase 10

---

### Phase 6: Diferencial visível — agenda densa

**Goal**: O profissional enxerga o buraco de agenda que não aconteceu — o único item em que o produto está sozinho na faixa de preço, e que é invisível por natureza
**Depends on**: Phase 2
**Requirements**: DIF-01, DIF-02
**Success Criteria** (o que precisa ser VERDADE):

  1. O profissional vê no dashboard quantos horários invendáveis a grade anti-buraco evitou na agenda dele no mês, com o número vindo da própria engine — contado, não estimado
  2. O profissional consegue ligar "mostrar todos os horários" e a página pública dele passa a oferecer a grade completa, com o efeito da escolha explicado antes de confirmar
  3. Desligar o escape hatch devolve a grade anti-buraco sem precisar reconfigurar nada

**Plans**: TBD
**UI hint**: yes

**Notas de execução:**

- A lógica já existe: `gerarSlotsAntiBuraco` só precisa contar quantos candidatos descartou e por quê. Melhor relação valor/custo do backlog inteiro
- O escape hatch não é opcional: sem ele a regra também pode ser lida como bug ("eu sei que estou livre às 14h e o cliente não vê")
- Antecipada à monetização por decisão do owner — coerente com "uso real vale mais que receita neste milestone"
- Fixa o contrato final da grade antes da Phase 8, que reaproveita as `etapas/` do booking numa página pública nova

---

### Phase 7: Fim do Plus e preço correto

**Goal**: Existe um único plano pago, com o preço certo e um selo de desconto que não mente — sem depender do checkout existir
**Depends on**: Nada — o banco atual é descartável e migration destrutiva está autorizada
**Requirements**: PLA-01, PLA-02, PLA-03, PLA-04
**Success Criteria** (o que precisa ser VERDADE):

  1. "Plus" não aparece em nenhuma tela, em nenhum tipo do código e em nenhuma linha do banco
  2. Pro é oferecido a R$ 39,90, e quem assina até 02/02/2027 tem R$ 29,90 travado
  3. Um tenant fundador que cancela e reassina continua pagando R$ 29,90 — o preço travado é propriedade do tenant, não da linha de assinatura
  4. O selo mostra -25%, calculado a partir dos dois preços reais, e não existe caminho para escrever o percentual à mão

**Plans**: TBD
**UI hint**: yes

**Notas de execução:**

- **Query de pré-voo obrigatória:** contar linhas com `plano = 'plus'` (incluindo `status = 'cancelada'`, que ninguém lembra que existem) antes de apertar para `CHECK (plano = 'pro')`. É o que transforma a crença "ninguém assina Plus" em fato
- `precos.ts` puro, sem I/O: `resolverPrecoPro` e `calcularSeloDesconto` derivado — fecha para sempre a classe de bug do `-50%`, que existe porque o selo é string em `planos.ts`
- `perfis_cobranca` com `preco_travado`/`fundador_em` nasce aqui, em tabela separada de `perfis_empresas` (que tem leitura pública) e com `ON DELETE RESTRICT`
- Corte de emergência natural: entrega o preço correto sem depender da Phase 9

---

### Phase 8: Autonomia do cliente final

**Goal**: O cliente final cancela ou remarca sozinho pelo link que recebeu, sem conta, sem senha, sem código — table stake que toda a concorrência entrega, resolvido sem violar a Fricção Zero
**Depends on**: Phase 2 (exclusion constraint), Phase 4 (e-mail), Phase 5 (contato flexível), Phase 6 (contrato final da grade)
**Requirements**: AUT-01, AUT-02, AUT-03, AUT-04, AUT-05, AUT-06, AUT-07, AUT-08, AUT-09
**Success Criteria** (o que precisa ser VERDADE):

  1. O cliente abre o próprio agendamento por um link recebido na confirmação e no lembrete, sem login, cadastro ou código; o link vale para um único agendamento, não é adivinhável e não dá acesso a nenhum outro dado
  2. O cliente cancela pelo link e o horário volta a aparecer como livre na página pública imediatamente
  3. O cliente remarca escolhendo um novo horário na mesma tela, e a remarcação passa pela mesma proteção contra sobreposição do agendamento normal
  4. Passada a antecedência mínima definida pelo profissional, o link mostra o contato do estabelecimento em vez de permitir a ação
  5. O profissional vê a mudança na agenda e recebe e-mail, e o lembrete já agendado no QStash é cancelado ou realinhado conforme a ação

**Plans**: TBD
**UI hint**: yes

**Notas de execução:**

- Maior fase do milestone e maior do que parece: reintroduz grade de horários e revalidação numa página pública **sem sessão**
- Reaproveita as `etapas/` do booking público e a lógica de `remarcarAgendamento` já existente em `src/app/actions/agendamentos.ts`
- Promovida de v2 para v1 por decisão do owner
- A antecedência mínima para cancelar/remarcar é config nova por tenant — distinta da `antecedencia_minima_minutos` que já governa o agendamento
- Toda escrita passa por `createAdminClient()` com `tenant_id` derivado do token assinado, nunca do corpo da requisição

---

### Phase 9: Cobrança automática ponta a ponta

**Goal**: O profissional assina o Pro sozinho pelo dashboard e o acesso é liberado quando o dinheiro entra — sem o owner no meio, e sem nenhum caminho de auto-promoção
**Depends on**: Phase 1 (hardening), Phase 4 (e-mail), Phase 7 (modelo de preço)
**Requirements**: COB-01, COB-02, COB-03, COB-04, COB-05, COB-06, COB-07, COB-08, EML-02
**Success Criteria** (o que precisa ser VERDADE):

  1. O profissional informa CPF ou CNPJ válido, assina pelo dashboard e o Pro é liberado **só** depois do pagamento confirmado — nenhum caminho permite um tenant se auto-promover
  2. Clicar duas vezes em "Assinar" produz uma única assinatura no painel do Asaas, e o mesmo evento entregue duas vezes não duplica efeito nenhum
  3. Uma falha de e-mail ou de terceiro nunca derruba o processamento de cobrança, e o recibo do VamoAgendar chega ao profissional quando a assinatura é confirmada
  4. Assinante inadimplente é rebaixado após 10 dias em degraus (banner → e-mail → downgrade), e recupera logo, capa e cor intactos ao voltar a pagar
  5. O owner vira de sandbox para produção seguindo uma checklist escrita, sem risco de cobrar de verdade achando que é teste

**Plans**: TBD
**UI hint**: yes

**Notas de execução — fase mais arriscada do milestone** (única que combina dependência externa, idempotência e ordem de eventos; merece `--research-phase`):

- Padrão assimétrico central: **a Server Action inicia, o webhook decide**. A action tem `orgId` e cria customer/subscription; ela nunca concede o plano
- `eventos_asaas` com PK = id do evento: idempotência e material de replay de uma vez. Persistir cru → responder 2xx → processar em `after()`. 2xx até para evento desconhecido
- **15 respostas não-2xx consecutivas pausam a fila do Asaas em silêncio, e os eventos morrem em 14 dias.** Um `await enviarRecibo()` no caminho síncrono derruba o billing inteiro por um problema de e-mail
- Webhook marcado como **envio sequencial**: `PAYMENT_CONFIRMED` chegando depois de `PAYMENT_OVERDUE` inverte o estado da assinatura
- CPF/CNPJ **não existe hoje em lugar nenhum do projeto** e é validado de verdade em produção (só dígitos, 11 ou 14) — é campo novo em formulário já em uso, não detalhe de integração
- Reusar sempre o `asaas_customer_id`; nunca criar customer novo a cada tentativa. `externalReference = tenant_id` para reconciliar
- Guard no boot validando que o prefixo da `ASAAS_API_KEY` (`$aact_hmlg_` vs `$aact_prod_`) bate com a base URL: 5 linhas que impedem "cobrei de verdade achando que era teste"
- Downgrade **não-destrutivo**: personalização permanece na tabela e só para de ser servida pela sanitização. Defesa também no ponto de disparo do QStash, para lembretes já agendados de tenant rebaixado
- Sem SDK: `fetch` direto (os pacotes npm são não-oficiais e abandonados). Header é `access_token`, **não** `Authorization: Bearer`; `User-Agent` é obrigatório
- Expurgo de eventos com mais de 90 dias — o payload tem PII
- **Lacunas a resolver no primeiro request contra o sandbox:** `/v3/checkouts` aceita `customer` (`cus_…`) existente ou só `customerData` inline? Qual o nome exato dos eventos de assinatura vs. pagamento no payload real?

---

### Phase 10: Obrigações jurídicas e LGPD executável

**Goal**: O produto pode ser aberto ao público sem promessa falsa sobre dados, e um pedido de exclusão é atendível sem destruir a agenda do profissional
**Depends on**: Phase 5 (`telefone` nullable)
**Requirements**: JUR-01, JUR-02, JUR-03
**Success Criteria** (o que precisa ser VERDADE):

  1. Termos de uso e política de privacidade publicados nomeando os subprocessadores reais (Clerk, Supabase, Railway, Asaas, Resend, Upstash, Evolution, PostHog), com base legal por finalidade e prazo de retenção declarado
  2. O cliente final e o profissional encontram `contato@vamoagendar.com.br` sem procurar — visível no booking público e no dashboard
  3. Um pedido de exclusão é atendido por anonimização: o cliente deixa de ser identificável e os agendamentos do profissional continuam na agenda dele, inclusive os futuros

**Plans**: TBD
**UI hint**: yes

**Notas de execução:**

- São **duas coisas, não uma**: documento publicado e mudança de comportamento no schema
- `agendamentos.cliente_id` tem `ON DELETE CASCADE`: atender exclusão com `DELETE FROM clientes` destrói agendamentos futuros que o profissional ainda vai atender. A rotina é `nome = 'Cliente removido'` + contatos NULL, agendamento preservado
- Varredura completa dos `ON DELETE CASCADE` com a pergunta "que dado de terceiro isso destrói?" — já há um caso conhecido (`assinaturas.tenant_id` deveria ser `RESTRICT`)
- Consentimento **não** é a base legal certa para o agendamento: execução de contrato a pedido do titular. Usar consentimento cria obrigação de revogação que quebraria o serviço
- ⚠️ Parte de menor confiança de toda a pesquisa (nenhuma fonte primária da ANPD localizada). **Revisão jurídica humana obrigatória antes de publicar** — não é mais pesquisa técnica que resolve

---

### Phase 11: Observabilidade e go-live

**Goal**: O owner enxerga se o sistema está de pé sem abrir o SQL editor, e o banco sai da fase DEV livre
**Depends on**: Phase 1 até Phase 10 (todo o trabalho de schema precisa ter acontecido antes das migrations virarem imutáveis)
**Requirements**: OPE-01, OPE-03, OPE-04, OPE-05
**Success Criteria** (o que precisa ser VERDADE):

  1. Uma página visível só ao owner responde quatro perguntas num só lugar: instâncias de WhatsApp conectadas vs. total, disparos com erro nas últimas 24h, agendamentos criados hoje e último evento de cobrança recebido
  2. Um evento real de funil aparece no painel do PostHog de produção — verificado, não configurado
  3. O banco de produção não tem dados de teste, e o tenant do owner continua lá, claramente identificado
  4. Uma migration já aplicada não pode mais ser editada — hook de imutabilidade **ativado**, não só existente

**Plans**: TBD
**UI hint**: yes

**Notas de execução:**

- Quatro modos de falha do sistema são silenciosos por construção (WhatsApp desconectado, fila do Asaas pausada, cota do Resend estourada, lembrete com env faltando). Sem essa página, o detector padrão vira "cliente reclama" — e o profissional autônomo ocupado não reclama, ele volta para o caderninho
- Sem essa fase o critério de sucesso do milestone ("agendamentos reais acontecendo") não é verificável e o milestone não tem como ser declarado concluído
- Limpeza de dados de teste: `SELECT` com o mesmo `WHERE` + conferência de contagem antes de converter em `DELETE`. Se até esta fase o banco ainda for o Free sem backup, um `DELETE` mal filtrado não tem desfazer — ver "Rede de proteção do banco — condição, não fase" no topo deste roadmap
- O hook já existe pronto em `.claude/hooks/migrations-prod.md` — a entrega é ativá-lo
- OPE-02 foi entregue na etapa preparatória — esta fase assume o Sentry de pé e cobre o que sobra: o painel do owner (OPE-01) e o funil verificado com tráfego real (OPE-03)

---

### Phase 12: Ativação dos primeiros profissionais

**Goal**: Os primeiros profissionais reais entram no produto em ritmo que não queima o WhatsApp deles nem a reputação do domínio de e-mail
**Depends on**: Phase 4 (e-mail como plano de continuidade), Phase 9 (ATI-02 precisa de cobrança real), Phase 11
**Requirements**: ATI-01, ATI-02, ATI-03
**Success Criteria** (o que precisa ser VERDADE):

  1. O owner assinou o próprio produto com pagamento real antes de mandar o primeiro convite
  2. Os convites saem em ritmo escalonado — poucos tenants por semana, nunca vários números de WhatsApp novos disparando juntos — com o template do onboarding personalizado por tenant
  3. Cada profissional convidado é acompanhado até o primeiro agendamento real de um cliente que nunca ouviu falar do VamoAgendar, com a taxa de erro da instância dele observada em `disparos_whatsapp`
  4. O profissional tem um caminho dentro do produto para mandar feedback ao owner

**Plans**: TBD

**Notas de execução:**

- Não é fase de código: é **regra de operação escrita como critério**. Ban em Baileys costuma ser permanente, e o ban não degrada o Pro — remove a proposta de valor dele
- Texto idêntico saindo de números diferentes é assinatura de disparo em massa; personalizar o template no onboarding é medida técnica de proteção, não de marketing
- O ramp-up de convites é também o warm-up do domínio de e-mail: com volume baixo, três reclamações em mil já estouram o limiar de 0,1% do Gmail
- Se a Phase 9 for adiada, ATI-02 fica bloqueado pela aprovação da conta Asaas para produção — dependência externa sem prazo, fora do controle do owner
- Esta fase encerra o milestone: o critério de sucesso é um agendamento real caindo na agenda de um profissional real sem nada quebrar no caminho

## Progress

**Ordem de execução:** as fases executam em ordem numérica (1 → 2 → ... → 12). Execução sequencial, sem paralelização.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| Etapa preparatória. Fundação operacional | 0/1 | Not started | - |
| 1. Hardening da superfície pública | 14/16 | In Progress|  |
| 2. Integridade da agenda | 0/TBD | Not started | - |
| 3. Anti-abuso no booking público | 0/TBD | Not started | - |
| 4. Canal de e-mail transacional | 0/TBD | Not started | - |
| 5. Contato flexível no booking | 0/TBD | Not started | - |
| 6. Diferencial visível — agenda densa | 0/TBD | Not started | - |
| 7. Fim do Plus e preço correto | 0/TBD | Not started | - |
| 8. Autonomia do cliente final | 0/TBD | Not started | - |
| 9. Cobrança automática ponta a ponta | 0/TBD | Not started | - |
| 10. Obrigações jurídicas e LGPD executável | 0/TBD | Not started | - |
| 11. Observabilidade e go-live | 0/TBD | Not started | - |
| 12. Ativação dos primeiros profissionais | 0/TBD | Not started | - |

## Cobertura de requisitos

56 de 56 requisitos v1 mapeados, cada um para exatamente **um destino** — uma das 12 fases
ou a etapa preparatória. Nenhum órfão, nenhuma duplicata. Rastreabilidade completa em
`.planning/REQUIREMENTS.md`.

| Categoria | Requisitos | Fase |
|---|---|---|
| Superfície pública e integridade multi-tenant | SEG-01 a SEG-05 | 1 |
| Correção da agenda | AGE-01 a AGE-05 | 2 |
| Anti-abuso | ABU-01 a ABU-03 | 3 |
| Comunicação por e-mail | EML-01, EML-04, EML-06 | 4 |
| Comunicação por e-mail | EML-05 | Etapa preparatória |
| Comunicação por e-mail | EML-03 | 5 |
| Comunicação por e-mail | EML-02 | 9 |
| Booking público | BOO-01 a BOO-03 | 5 |
| Diferencial visível | DIF-01, DIF-02 | 6 |
| Planos e preço | PLA-01 a PLA-04 | 7 |
| Autonomia do cliente final | AUT-01 a AUT-09 | 8 |
| Cobrança | COB-01 a COB-08 | 9 |
| Obrigações de lançamento | JUR-01 a JUR-03 | 10 |
| Operação e go-live | OPE-01, OPE-03, OPE-04, OPE-05 | 11 |
| Operação e go-live | OPE-02 | Etapa preparatória |
| Ativação dos primeiros usuários | ATI-01 a ATI-03 | 12 |

**Por que EML está partido em quatro destinos:** EML-03 (confirmação ao cliente final) só é
verificável quando o booking coletar e-mail, o que acontece na Phase 5 — hoje o campo não
existe na UI pública. EML-02 (recibo da assinatura) só dispara quando o webhook de
cobrança existir, na Phase 9, e a pesquisa é explícita que o recibo não pode estar no
caminho síncrono do billing. Deixar os três na Phase 4 criaria dois critérios de sucesso
não verificáveis. EML-05 (o produto funciona sem credencial de e-mail) é propriedade do
wrapper de envio, e o wrapper nasce na **etapa preparatória** porque as Phases 4, 5 e 9 o
consomem — deixá-lo na Phase 4 faria a Phase 5 depender de código que ainda não existe.

---
*Roadmap criado: 2026-07-20*
*Granularidade: fine | Execução: sequencial | Modo: interativo*
