# Phase 4: Canal de e-mail transacional - Context

**Gathered:** 2026-08-07
**Status:** Ready for planning

<domain>
## Phase Boundary

O produto passa a falar por e-mail com o **profissional** (B2B), sem queimar a reputação de
um domínio que não tem histórico nenhum. Cobre EML-01 (boas-vindas com o link
`/book/[slug]`), EML-04 (remetente reconhecível) e EML-06 (supressão de bounce).

O e-mail ao **cliente final** é EML-03 e mora na Phase 5 — fora daqui. O recibo de
assinatura é EML-02 e mora na Phase 9 — fora daqui.

A etapa preparatória já entregou o transporte e esta fase **consome, não reescreve**:
`enviarEmail` (nunca lança, vocabulário fechado de motivos, `desativado` sem credencial),
`montarRemetente` (`"<Estabelecimento> via VamoAgendar" <naoresponda@mail.vamoagendar.com.br>`
com sanitização RFC 5322) e `classificarErroResend` (21 códigos do SDK, com `403` no send
tratado como defeito nosso). O DNS DKIM está verificado desde 2026-07-21.

O que esta fase constrói: o **gatilho** do primeiro e-mail, a **auditoria** de envio com
trava de idempotência, o **retorno de bounce** vindo do Resend, e a **camada de template**
HTML que as Phases 5 e 9 vão herdar.

</domain>

<decisions>
## Implementation Decisions

### Endereço do profissional

- **D-01:** o endereço vem do **Clerk por padrão** (e-mail de quem criou a organização —
  `clerkClient` já é usado em `perfis-empresas.ts:79`), com uma coluna nova
  `perfis_empresas.email_contato` (nullable) que **ganha quando preenchida**, exposta como
  campo opcional na tela de perfil do dashboard. O Clerk garante endereço verificado desde
  o primeiro segundo (bounce é o que queima domínio novo); o override existe porque o
  e-mail de login frequentemente não é o e-mail que a pessoa lê.
  — **Reversibility:** costly — a coluna é migration nova em tabela com leitura pública
  sanitizada; remover depois exige migration reversa e limpeza da UI.
- **D-02:** **nenhum `reply-to`**. O remetente `naoresponda@` é literal: mensagem
  automática do produto não é para ser respondida, e responder não entra no escopo desta
  fase nem de fase futura. Decisão explícita do owner.
  — **Reversibility:** reversible.
- **D-03:** consequência direta de D-02 — `enviarEmail` (`src/lib/email/enviar.ts:48`)
  passa a aceitar `replyTo` **opcional**. Hoje ele recusa o envio sem esse campo, tratando
  a ausência como erro de programação. É alteração cirúrgica no wrapper da etapa
  preparatória, não reescrita; a guarda de `para`/`assunto` permanece intacta.
  — **Reversibility:** reversible.
- **D-04:** ⚠️ **o Success Criteria 2 da fase é dividido.** A metade "chega identificado
  pelo estabelecimento" fecha aqui (já pronta em `montarRemetente`). A metade "responder
  vai para o profissional, não para o VamoAgendar" **migra para a Phase 5**, onde o
  destinatário é o cliente final e responder-e-cair-no-salão é o comportamento certo.
  EML-04 passa a ser fechado em duas fases. Não é corte de escopo: é a única leitura em
  que a segunda metade faz sentido, porque nesta fase o destinatário É o profissional e
  reply-to para ele mesmo seria defeito.
  — **Reversibility:** reversible — é escrituração de critério, não código.

### Gatilho do boas-vindas e auditoria de envio

- **D-05:** **tabela nova de auditoria de e-mails transacionais**, no espírito da
  `disparos_whatsapp` já existente. Escolhida sobre as alternativas mais baratas (coluna de
  data no perfil; só o retorno do upsert) porque serve as Phases 5 e 9 sem retrabalho e
  porque dá ao produto os dois canais auditáveis da mesma forma. Custo aceito: migration +
  RLS + policies granulares por ação nesta fase, e não na seguinte.
  — **Reversibility:** one-way — tabela nova com RLS e policies; desfazer exige migration
  destrutiva, e a partir da Phase 5 haverá linhas de dois fluxos diferentes dependendo dela.
- **D-06:** a trava contra reenvio é uma coluna `chave_idempotencia` com restrição
  **UNIQUE**, cujo valor é exatamente a MESMA string que já vai ao Resend no parâmetro
  `idempotencyKey` do wrapper (`boas-vindas/<tenant_id>`; na Phase 5 vira
  `confirmacao/<agendamento_id>`). Grava primeiro, envia depois: se a linha já existe, o
  banco recusa e o e-mail nem é tentado. O parâmetro que a etapa preparatória deixou
  preparado passa a ter dono, e duas abas simultâneas são decididas pelo banco, não pela
  sorte — mesmo racional da exclusion constraint da Phase 2.
  — **Reversibility:** costly — a chave vira contrato compartilhado com as Phases 5 e 9.
- **D-07:** falha de envio **não** consome a trava: a restrição de unicidade é **índice
  único parcial sobre status `enviado`**. Linha com status `falhou` não bloqueia nova
  tentativa, e a próxima abertura do dashboard tenta de novo sozinha. A alternativa
  ("apaga a linha") foi recusada porque tabela de auditoria que apaga o próprio histórico
  deixa de ser auditoria; a alternativa "nunca mais tenta, owner age à mão" foi recusada
  porque vira tarefa recorrente do owner num produto que vai convidar profissionais em
  ritmo escalonado. — **Reversibility:** reversible.
- **D-08:** a tabela **não grava o endereço de destino** — mesma regra da
  `disparos_whatsapp`. Grava: `tenant_id`, tipo do e-mail, `chave_idempotencia`, status
  (`enviado` / `falhou` / `rejeitado` / `sem_destinatario`), o id devolvido pelo Resend e a
  data. Para investigar um caso específico, o id abre o registro completo no painel do
  Resend. Invariante do projeto (nunca PII em lugar que não precisa dela) preservado, e a
  Phase 10 não ganha mais um lugar para caçar dado pessoal.
  — **Reversibility:** reversible.
- **D-09:** o gatilho é o **auto-provisionamento em `obterPerfilEmpresa()`**
  (`src/app/actions/perfis-empresas.ts:75-95`) — o único instante do código em que o
  sistema sabe que uma conta nasceu, porque o projeto **não tem webhook do Clerk nem
  tabela de usuários sincronizada** (decisão de arquitetura registrada no CLAUDE.md, não a
  reverter aqui). ⚠️ A função roda em **toda** página do dashboard, para sempre — é D-06
  que impede o reenvio, não a posição da chamada. O envio não pode bloquear a primeira
  carga do dashboard (usar o padrão `after()` já estabelecido no projeto para
  `capturarEventoTenant`). — **Reversibility:** reversible.
- **D-10:** sem endereço utilizável (busca no Clerk falha, ou nenhum e-mail verificado):
  **não envia, registra `sem_destinatario` e segue** — o dashboard abre normalmente. A
  falha vira reporte ao Sentry pela variante **aguardada**
  (`reportarFalhaSilenciosaAguardando`), porque é anomalia de conta ou defeito nosso, não
  condição de negócio esperada. Mesmo tratamento que o WhatsApp desconectado já recebe:
  e-mail nunca quebra a entrada do profissional no produto.
  — **Reversibility:** reversible.

### Supressão de bounce (EML-06)

- **D-11:** o Success Criteria 3 **já é verdade pelo fornecedor** — confirmado na doc atual
  do Resend (`/websites/resend`, §Suppression List e §Webhooks): hard bounce ou reclamação
  de spam adicionam o endereço a uma lista de supressão automaticamente, e envios futuros
  para ele são bloqueados pelo próprio Resend. **Nenhuma lista de supressão nossa é
  construída.** O que a fase constrói é o *saber*, não o *bloquear*.
  — **Reversibility:** reversible.
- **D-12:** rota nova `POST /api/webhooks/resend` escutando o evento
  **`suppression.added`**, com **verificação de assinatura** (o Resend assina por Svix —
  mesmo princípio da assinatura do QStash que a Phase 1 implementou no webhook de
  lembrete). É a exceção autorizada à regra "sem rotas REST": webhook de terceiro
  (`src/app/api/webhooks/`). A rota precisa constar em `isPublicRoute` de `src/proxy.ts`.
  O segredo de assinatura entra na lista de obrigatórias em produção de `src/lib/env.ts`.
  — **Reversibility:** costly — rota pública nova com verificação de assinatura e env
  obrigatória; remover depois exige limpar proxy, env e a lista de obrigatórias.
- **D-13:** o tenant afetado é identificado **cruzando o `source_id` do payload com o id do
  Resend já gravado na tabela de auditoria (D-08)** — nunca pelo endereço. É o que permite
  saber quem ficou mudo **sem jamais gravar e-mail** em lugar nenhum. O payload traz o
  endereço em claro: ele é usado para o cruzamento em memória se necessário e **descartado**
  — não é persistido, não vai a log, não vai ao Sentry.
  — **Reversibility:** reversible.
- **D-14:** ao receber a supressão: registra o estado na tabela e abre **Sentry Issue
  acionável** com mensagem **sintética e estática** (ex.: `email:endereco_suprimido`),
  variante aguardada, tenant apenas como `tenantHash`. Padrão exato da quick task
  `260724-observabilidade-mensageria` — consumir, nunca reimplementar. O volume esperado é
  baixo (primeiros profissionais convidados um a um), então o owner resolvendo por contato
  direto é proporcional. — **Reversibility:** reversible.

### Camada de template HTML

- **D-15:** **React Email** (`@react-email/components` + `@react-email/render`),
  dependências novas do mesmo fornecedor do `resend` já instalado. Escolhido sobre função
  pura em TS porque elimina trabalho real e repetido (compatibilidade com Outlook/Gmail é
  o problema de verdade, e as Phases 5 e 9 herdam o layout pronto) e porque dá
  pré-visualização local — a diferença entre revisar antes e descobrir na caixa de entrada.
  Coerente com a regra do projeto: otimizar complexidade TOTAL do sistema, não número de
  dependências. — **Reversibility:** costly — trocar depois reescreve todo template
  existente, incluindo os das fases seguintes.
- **D-16:** **visual completo com a identidade da marca** (azul `#3DBAED`→`#3961D5`, roxo
  `#4219B0`, logo de `artes-aprovadas-design/`). Escolha do owner, feita com o custo
  nomeado: e-mail muito visual tem perfil de newsletter e empurra a classificação para a
  aba Promoções, que é exatamente o que o Success Criteria 4 mede, num domínio de
  reputação zero. — **Reversibility:** reversible.
- **D-17:** a capa é **faixa de cor sólida montada em HTML + logo pequeno por cima** —
  **não** banner de imagem única, e **não** gradiente via VML. Mitiga o custo de D-16 sem
  abrir mão do visual: o sinal que pesa na classificação é razão alta de imagem por texto,
  não cor; o comportamento fica idêntico em Gmail, Outlook e apps de celular; e quem
  bloqueia imagem por padrão (comum em Outlook corporativo) continua vendo a faixa
  colorida em vez de um topo vazio. O gradiente real foi descartado porque o Outlook
  desktop ignora `background-image` do CSS de qualquer forma, e VML é marcação legada,
  fácil de quebrar numa edição futura. — **Reversibility:** reversible.

### Claude's Discretion

- **Hospedagem do logo do e-mail** — bucket público `imagens-perfis` já existente,
  domínio próprio, ou embutido. Preferir URL absoluta estável e servida pelo próprio
  domínio do app; e-mail não pode depender de path relativo.
- **Copy do e-mail de boas-vindas** — o que ele diz além do link. Regras que valem:
  `docs/05-PRODUTO_E_VISAO.md` para tom, e a rule global de texto público (nada que soe a
  template ou a IA; nenhum número não medido; nenhum depoimento — não existe cliente
  ainda). O link `/book/[slug]` do profissional é o núcleo da peça, não um detalhe.
- **Teto de 100 e-mails/dia e 3.000/mês do plano Free do Resend** — o `classificar.ts` já
  mapeia `daily_quota_exceeded`/`monthly_quota_exceeded` para `falha_transporte`, que vai
  ao Sentry. Avaliar se isso basta ou se merece Issue própria com mensagem sintética
  distinta; o volume desta fase (um e-mail por tenant novo) está longe do teto, mas a
  Phase 5 muda a conta.
- **Nomes exatos** da tabela, das colunas, dos tipos de e-mail, do código sintético da
  Issue e das env vars do webhook.
- **Forma dos testes** — respeitar a regra viva: `pnpm test` é hermético por desenho;
  prova que toca serviço externo é opt-in (`EXIGIR_INTEGRACAO=1`).
- **Verificação do Success Criteria 4** (chegada em Gmail, Outlook e domínio corporativo,
  com a aba registrada) é **UAT humano** — nenhum executor pode marcar. Nasce aberto,
  registrado com dono.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Escopo e requisitos desta fase
- `.planning/ROADMAP.md` §"Phase 4: Canal de e-mail transacional" — Goal, 4 Success
  Criteria e notas de execução (DNS resolvido; remetente; SPF/DMARC ainda pendentes; sem
  MX em lugar nenhum; SDK do Resend não lança; teto do Free)
- `.planning/REQUIREMENTS.md` — EML-01, EML-04, EML-06 (e a nota sobre por que a categoria
  EML está partida em quatro destinos)
- `.planning/ROADMAP.md` §"Dependências duras" — Phase 4 precede a Phase 5 (o booking só
  pode aceitar e-mail quando existir algo que envie e-mail) e a Phase 12 (o e-mail é o
  plano de continuidade caso o WhatsApp do profissional seja banido)

### Código que a fase consome e NÃO reescreve (entregue na etapa preparatória)
- `src/lib/email/enviar.ts` — `enviarEmail`; contrato "nunca lança", vocabulário fechado
  `MotivoFalhaEmail`, `idempotencyKey` já no parâmetro. **Alteração autorizada por D-03:
  `replyTo` passa a ser opcional. Nada mais.**
- `src/lib/email/remetente.ts` — `montarRemetente`; endereço é constante de produto, e a
  sanitização quoted-string existe porque vírgula/ponto no nome do salão quebram o header
- `src/lib/email/classificar.ts` — tabela exaustiva dos 21 códigos do SDK; `Record` com
  garantia de compilador (SDK novo quebra o `tsc` em vez de silenciar)
- `src/lib/__tests__/email-enviar.test.ts` — asserções que travam o contrato acima

### Código que a fase modifica ou estende
- `src/app/actions/perfis-empresas.ts:48-114` — `obterPerfilEmpresa`; o
  auto-provisionamento (linhas 75-95) é o gatilho de D-09, e o `clerkClient` já está
  importado ali
- `supabase/schemas/01_perfis_empresas.sql` — coluna `email_contato` (D-01)
- `supabase/schemas/` — arquivo novo da tabela de auditoria de e-mail (D-05), numerado em
  ordem lexicográfica que respeite as FKs
- `src/lib/env.ts` — segredo de assinatura do webhook do Resend na lista de obrigatórias
  em produção (D-12)
- `src/proxy.ts` — `/api/webhooks/resend` em `isPublicRoute`
- `src/app/api/webhooks/lembrete/route.ts` — **precedente a espelhar**: verificação de
  assinatura de webhook de terceiro, feita na Phase 1

### Observabilidade (contrato para código novo, nunca reimplementar)
- `.planning/STATE.md` §"⛳ Quick task 260724-observabilidade-mensageria" — baseline
- `src/lib/observabilidade/reportar.ts` — `reportarFalhaSilenciosaAguardando` /
  `reportarExcecaoAguardando`, obrigatórias em Server Action, webhook e route handler
- `src/lib/observabilidade/log.ts` — `logOperacional` com allowlist **fechada** de
  atributos; atributo novo exige edição da lista + teste
- `src/lib/observabilidade/hash.ts` — `tenantHash`, pseudonimização obrigatória
- `docs/09-OBSERVABILIDADE_E_EMAIL.md` — travas anti-PII, fail-fast de env e a regra de
  **nunca rodar os wizards** do Sentry/PostHog
- `docs/06-MENSAGERIA_E_WHATSAPP.md` — mapa dos quatro pilares; referência de como um
  estado novo é catalogado

### Padrões obrigatórios do projeto
- `CLAUDE.md` §"Definition of Done", §"Banco de dados: schema declarativo" (RLS
  obrigatório, políticas granulares por ação, `COMMENT ON`, `auth.jwt()` em subquery),
  §"Regra de Falha Silenciosa"
- `docs/03-PADROES_DE_BANCO_DE_DADOS.md` — nomenclatura pt-BR e alcance real da revogação
  de default privileges (tabela nova nasce fora da Data API; **GRANT explícito é
  obrigatório**, consequência direta da Phase 1)
- `docs/SUPABASE_DECLARATIVE-DATABASE-SCHEMA.md` — exceções do fluxo declarativo
- `.planning/phases/01-hardening-da-superf-cie-p-blica/01-CONTEXT.md` — retorno
  discriminado; validação na fronteira antes de qualquer I/O
- `.planning/phases/03-anti-abuso-no-booking-p-blico/03-CONTEXT.md` — D-11/D-12: padrão de
  Issue sintética estática vs. log de rotina (o mesmo critério vale para D-14)

### Documentação externa consultada nesta discussão
- Resend, via context7 `/websites/resend` — §"Why are my emails landing on the Suppression
  List" (supressão automática após hard bounce/complaint, bloqueio automático de envios
  futuros) e §"Webhooks > Event Types > suppression.added" (payload com `email`, `origin`
  ∈ {bounce, complaint, manual} e `source_id` = id do e-mail que causou)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `enviarEmail` + `montarRemetente` + `classificarErroResend`: o transporte inteiro já
  existe, testado e com contrato escrito. A fase liga coisas a ele.
- `idempotencyKey` em `ParamsEmail`: parâmetro já previsto pela etapa preparatória
  justamente para esta fase definir as chaves — D-06 o adota como chave dupla (Resend +
  banco).
- `clerkClient()` em `perfis-empresas.ts:79`: o acesso ao Clerk no servidor já está no
  arquivo que vai disparar o e-mail. Nenhuma integração nova.
- `disparos_whatsapp`: molde direto da tabela de D-05 — append-only, por tenant, sem PII
  de conteúdo. Copiar a forma, inclusive as policies.
- Webhook de lembrete (`api/webhooks/lembrete/route.ts`): precedente completo de webhook
  de terceiro com assinatura verificada, rota pública declarada e segredo em env
  obrigatória.
- `after()` do Next (padrão em `src/lib/analytics/server.ts`): forma estabelecida de não
  bloquear a resposta com trabalho de terceiros.

### Established Patterns
- Erro esperado é **valor de retorno discriminado**, nunca `throw` — em build de produção
  o React só transporta o `digest`.
- Falha inesperada usa a variante **aguardada** do Sentry em Server Action/webhook; a
  fire-and-forget perde o evento quando o processo encerra.
- Mensagem de Issue é **sintética e estática** por modo de falha — é o que mantém o
  agrupamento do Sentry inteiro.
- Tabela nova nasce **fora** da Data API (default privileges revogadas na Phase 1) — o
  GRANT explícito é parte da migration, não um detalhe esquecível.
- Mutações só por Server Action; rota REST só para webhook de terceiro.
- `pnpm test` é hermético; prova que toca serviço externo é opt-in.

### Integration Points
- `obterPerfilEmpresa()` — gatilho do boas-vindas (D-09), roda em toda página do dashboard.
- Tela de perfil do dashboard — campo `email_contato` (D-01).
- `POST /api/webhooks/resend` — superfície pública nova (D-12); precisa de `isPublicRoute`.
- Painel do Resend — provisionamento do webhook e do segredo de assinatura é **ação do
  owner**, e é gate de execução: sem ele o SC3 não é verificável.
- ⚠️ **SPF do subdomínio e DMARC `p=none` com `rua`** continuam ausentes no DNS (registro
  TXT cada). Não impedem enviar — no Resend o alinhamento DMARC passa por DKIM, e o DKIM
  está válido — mas hoje o envio acontece sem relatório nenhum. Ação de DNS do owner.

</code_context>

<specifics>
## Specific Ideas

- O owner foi categórico sobre o `naoresponda@`: "não é pra responder as mensagens
  automáticas, isso não entra no escopo e nem deve entrar". A ausência de reply-to é
  intencional e não deve ser "consertada" por nenhum agente adiante — é a razão de D-03 e
  D-04 existirem por escrito.
- Na escolha do visual, o owner optou pelo completo com a marca depois de o custo ser
  nomeado (risco de aba Promoções num domínio de reputação zero, medido pelo próprio SC4).
  D-17 é a mitigação acordada: mesmo impacto visual, sem o sinal que pesa na classificação.
- O owner pediu explicitamente que as decisões fossem apresentadas em linguagem leiga —
  o que é, qual o problema real, quais as alternativas. Vale para qualquer checkpoint que
  os agentes de planejamento e execução venham a abrir com ele nesta fase.
- A tabela de auditoria (D-05) foi escolhida sabendo que é a opção mais cara das três: o
  owner comprou infraestrutura que as Phases 5 e 9 herdam, em vez do mínimo que fecharia
  só esta fase.

</specifics>

<deferred>
## Deferred Ideas

- **Avisar o próprio profissional, no dashboard, que os e-mails não estão chegando nele** —
  discutido em D-14 e não escolhido. Fecharia o ciclo (quem pode corrigir é avisado no
  lugar onde o campo de correção está), mas é componente de UI e copy novos, e a fase
  passaria a mexer no dashboard além do campo de D-01. Candidata natural à **Phase 11**,
  que já tem o painel do owner no escopo. Gatilho para promover: mais de uma dúzia de
  profissionais ativos, quando contato direto do owner deixar de escalar.
- **Caixa de entrada real no domínio** (`contato@vamoagendar.com.br`) — não há registro MX
  em lugar nenhum hoje, então nenhum endereço do domínio recebe e-mail. O Resend só envia;
  receber exige provedor próprio. Já está no escopo da **Phase 10** (canal de suporte
  visível) e não bloqueia nada aqui, dado D-02.

</deferred>

---

*Phase: 04-canal-de-e-mail-transacional*
*Context gathered: 2026-08-07*
