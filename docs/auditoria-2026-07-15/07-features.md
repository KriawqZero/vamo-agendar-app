---
status: temporario
gerado: 2026-07-15 20:39
agente: features
modelo: sonnet
---

# 07 — Gap Analysis de Features e Backlog Priorizado (versão revisada)

## Premissas e método

**Esta é a versão revisada com `02-arquitetura.md` como insumo.** A primeira versão
deste arquivo foi gerada quando `docs/auditoria-2026-07-15/02-arquitetura.md` ainda não
existia e as estimativas de esforço vieram só de inspeção direta do código. O 02 agora
existe (3 ALTA / 9 MEDIA / 5 BAIXA) e esta versão incorpora seus achados nas
estimativas P/M/G, nas dependências e na sequência recomendada. A inspeção direta
original (schemas em `supabase/schemas/`, `src/app/actions/public-booking.ts`,
`src/app/actions/agendamentos.ts`, `src/lib/whatsapp-helper.ts`,
`src/app/book/[slug]/BookingWizard.tsx`) permanece válida e é convergente com o 02.

Achados do 02 que mudam a leitura de features:

- **Índices ausentes** em `agendamentos (tenant_id, data_hora)` e
  `clientes (tenant_id, telefone)` (ALTA) — booking engine e lookup de cliente fazem
  sequential scan; vira item novo de `[LANCAMENTO]` (L6), porque "cobrar de cliente
  real" implica tráfego real.
- **Validação de telefone duplicada em 6 pontos** com mensagens divergentes (MEDIA) —
  muda o escopo recomendado de L1 (o conserto do bug de validação é o momento natural
  de extrair `src/lib/telefone.ts`, senão nasce a 7ª cópia).
- **`obterAssinaturaVigente()` sem `React.cache()`**, chamada 2x por navegação em 6
  pontos (MEDIA) — vira dependência explícita de L5 (com billing real, `assinaturas`
  passa a ser hot path de gating pago).
- **Resend e Asaas com zero código** (grep confirmado no 02) — confirma que L5 é
  greenfield (G se sustenta) e reforça a decisão de L1 (e-mail não existe mesmo;
  remover a promessa da UI é o único caminho honesto).
- **Vitest existe com 32 testes** cobrindo booking-engine, timezone e whatsapp-helper
  (o `CLAUDE.md` que diz o contrário está desatualizado — achado 8.1 do 02) — reduz o
  risco de regressão dos itens que tocam a engine (R1 fase 2, R2), dando mais
  confiança às estimativas sem alterá-las de letra.
- **Client components de página inteira a 500-680 linhas** sem decomposição (MEDIA) —
  `BookingWizard.tsx` está em 501 linhas; L1+L2+R1 adicionam UI nele e o empurram para
  o teto informal de ~700 que o 02 recomenda. Não muda o esforço de nenhum item
  isolado, mas entra como nota de execução.

`docs/lixo/` não foi consultado (material descartado).

Escala de esforço: **P** (horas a ~1 dia, um ou dois arquivos, sem migration ou com
migration trivial), **M** (poucos dias, toca schema + action + UI), **G** (mais de uma
semana, envolve infraestrutura nova — ex.: webhook de entrada, mecanismo de
autenticação sem login).

---

## Gap analysis (a): o que concorrentes têm e importa, que o VamoAgendar não tem

Cruzando `06-mercado.md` com o código:

1. **Nenhum gap de feature "básica" real.** Lembrete/confirmação por WhatsApp (padrão
   do setor) e agendamento sem login (padrão do setor) — o VamoAgendar já tem os dois,
   bem implementados no lado de saída. Não há corrida para alcançar aqui.
2. **App nativo para o cliente final** (Trinks, Booksy, AppBarber, Fresha têm). Já
   represado em `docs/PENDENCIAS.md` como "Depois de evidência" com gatilho explícito
   (retenção comprovada no mobile web + pedido recorrente) — concordo com a decisão
   registrada: nenhum concorrente pesquisado tem "não ter app" como motivo de
   reclamação, e o booking web já é mobile-first de verdade (auditoria UX, seção 6).
3. **Pedido de avaliação pós-atendimento automático** (Trinks tem, na "Rotina de
   Mensagens"). Barato de descrever, fora da visão do produto atual (`docs/05`: não é
   CRM). Ver `[NAO-AGORA]`.
4. **Cancelamento/reagendamento self-service pelo cliente final** — **não verificado**
   se os concorrentes oferecem (`06-mercado.md` não testou esse fluxo ponta a ponta em
   nenhum deles). Não entra como gap "porque o concorrente tem" — entra como item de
   retenção por mérito próprio: é o atrito nº1 da auditoria UX, confirmado por leitura
   direta do código (`grep` por "cancelar"/"remarcar" em `src/app/book/` retorna
   vazio). Tratado em `[RETENCAO]`.

Resumo honesto: a lacuna real não é "feature que falta para copiar concorrente" — é
"feature que falta para reter o cliente que já veio" e "modelo de cobrança que falta
para não repetir o erro de confiança do setor" (este último é território do agente
PRECIFICACAO, mas tem uma face de produto tratada abaixo).

## Gap analysis (b): o que o VamoAgendar tem ou pode ter que eles não têm

1. **WhatsApp incluso na mensalidade sem metering** — vantagem **estrutural
   existente**, não feature a construir: Evolution API self-hosted
   (`EVOLUTION_API_URL` próprio, sem custo por mensagem de terceiro), enquanto Trinks,
   AppBarber, Fresha e AgendaPro cobram por pacote/crédito/mensagem à parte. O
   trabalho de produto é **não destruir isso** — ver `[NAO-AGORA]` item 5. A decisão
   de preço é do agente PRECIFICACAO; não há bloqueio técnico.
2. **Cancelamento de assinatura sem fricção** — hoje não existe checkout real (botão
   "Em breve"; o 02 confirma zero código Asaas), então também não existe fricção de
   cancelamento ainda. Folha em branco: dá para nascer sem o padrão de reclamação nº1
   do setor (Trinks, AppBarber, Booksy, Avec). Decisão de desenho a tomar **junto** da
   implementação do checkout, não depois.
3. **Fatura previsível, plano único sem add-on** — já é verdade em
   `src/lib/planos.ts` (tabela fechada, sem cobrança por mensagem/SMS/NFe à parte).
   Preservar essa simplicidade ao integrar o Asaas é decisão de produto, não só de
   preço.
4. **Nenhum app obrigatório para agendar** — verdade hoje, mas não é diferencial
   *provado* de mercado; tratar como algo a preservar, não a vender agressivamente sem
   evidência.

---

## Backlog priorizado

### [LANCAMENTO] — pré-requisito pra cobrar de cliente real

| # | Item | Impacto | Esforço | Dependências |
|---|---|---|---|---|
| L1 | Corrigir inconsistência WhatsApp-ou-e-mail no booking público **extraindo junto `src/lib/telefone.ts`**. `BookingWizard.tsx:157-161` aceita WhatsApp OU e-mail; `criarAgendamentoPublico` (`public-booking.ts:33`) exige telefone e devolve erro genérico. Decisão já registrada (`docs/PENDENCIAS.md` P1.8): WhatsApp obrigatório, remover promessa de e-mail. O 02 (§3.2/3.3) mostra a mesma validação reescrita em 6 pontos com mensagens divergentes — este conserto é o momento de centralizar (`sanitizarTelefone`/`validarTelefone`), no espírito de `timezone.ts`. | Alto (conversão — abandono silencioso no último passo do funil) | P (a extração adiciona horas, não dias) | Nenhuma |
| L2 | Exibir `telefone_contato` do estabelecimento como link `wa.me` na tela de booking. Campo já buscado (`BookingWizard.tsx:13`) mas nunca renderizado; `anon` já lê a coluna, então é puramente UI. Resolve a ambiguidade do item de integridade em `docs/PENDENCIAS.md` (cogita esconder a coluna de `anon` "se a página pública não o exibir") — esta implementação decide **não** esconder; registrar a decisão. Nota de execução: `BookingWizard.tsx` está em 501 linhas (02 §6.2) — L1+L2 juntos são a hora de extrair a tela de sucesso para subcomponente. | Alto (único canal de contato do cliente enquanto R1 não existir) | P | Nenhuma |
| L3 | `error.tsx`/`not-found.tsx`/`loading.tsx` pelo menos em `/book/[slug]` (idealmente também `/dashboard`). Zero boundary no projeto hoje — falha real cai no overlay cru do Next, sem marca, na página de maior exposição a terceiros. | Médio (proteção de marca; sobe conforme houver tráfego real) | P | Nenhuma |
| L4 | CTA explícito na tela "Selecione uma Organização" (`dashboard/page.tsx`, `dashboard/agenda/page.tsx`), independente da configuração do Clerk. O 02 (§3.1) achou **4 cópias idênticas** do bloco (também em `servicos/page.tsx` e `whatsapp/page.tsx`) — implementar extraindo o componente `EstadoSemOrganizacao`, senão o CTA nasce em 1 cópia e as outras 3 divergem. | Médio (risco de abandono no primeiro acesso se a config do Clerk falhar) | P | Nenhuma |
| L5 | Checkout Asaas completo, incluindo **cancelamento de assinatura self-service desenhado desde o início** (sem multa, sem e-mail/suporte). Roteiro técnico em `docs/07-PLANOS_E_MONETIZACAO.md`; o 02 confirma que é greenfield (zero código/dependência Asaas) — G se sustenta. Incluir no escopo: `React.cache()` em `obterAssinaturaVigente` (02 §2 — com billing real, a função vira hot path de gating pago chamado 2x por navegação em 6 pontos) e corrigir a divergência do `docs/01` que lista Asaas/Resend como stack pronta (02 §8.2). | Alto (é o pré-requisito literal para monetizar) | G | Hardening da Data API (`docs/PENDENCIAS.md`, item de integridade — `assinaturas` passa a carregar dados reais); L6 recomendado antes (tráfego real em cima de sequential scan) |
| L6 | **(novo, do 02 §6.1 — ALTA)** Índices `agendamentos (tenant_id, data_hora)` e `clientes (tenant_id, telefone)`. O booking engine (toda troca de data no `/book/[slug]` + revalidação anti-double-booking), `listarAgendamentos` (todo load do dashboard) e o lookup de cliente por telefone fazem sequential scan hoje — invisível em dev, incidente em produção. Migration pequena via schema declarativo + `db diff`. | Alto sob tráfego real (hoje zero sintoma — exatamente por isso precisa vir antes do lançamento, não depois) | P | Nenhuma; é pré-requisito soft de L5/lançamento |

### [RETENCAO] — alavanca direta de MRR/churn

| # | Item | Impacto | Esforço | Dependências |
|---|---|---|---|---|
| R1 | Cancelamento/remarcação self-service pelo cliente final via link seguro (sem login — Fricção Zero preservada). Inexistente hoje; atrito de maior severidade da auditoria UX ("o que mais pesa para MRR"). **Discordância fundamentada mantida**: `docs/PENDENCIAS.md` classifica como "Depois de evidência", mas o dano é invisível (cliente que não remarca some sem gerar evidência — só receita perdida silenciosa). Fasear: fase 1 = só cancelamento (token por agendamento); fase 2 = remarcação reaproveitando `remarcarAgendamento` e a engine — que agora tem 32 testes de regressão (02 §8.1), reduzindo o risco da fase 2. | Alto (maior risco de MRR identificado nesta auditoria) | G (M se limitado à fase 1) | L6 recomendado antes (o fluxo adiciona consultas por token em `agendamentos` no caminho público); decisão do mecanismo de token/link a registrar antes de codar |
| R2 | Confirmação prévia acionável (cliente confirma presença respondendo o WhatsApp). Hoje a confirmação é só informativa. Exige webhook de entrada da Evolution API — infraestrutura inexistente (única rota de webhook, `lembrete`, é acionada pelo QStash). Considerar junto a política de retenção de `disparos_whatsapp` (02 §6.3 — append-only sem purga; canal de entrada multiplica o volume de eventos a auditar). | Alto (percepção de valor tangível — "reduziu meus furos" é o argumento de venda que falta) | G | Nenhuma técnica dura; compartilha a infraestrutura de webhook de entrada com qualquer bot futuro |
| R3 | Status `no_show` explícito no schema (`agendamentos.status` hoje: `pendente/confirmado/concluido/cancelado`) + botão na "linha do dia". Hoje contamina o faturamento estimado (`DashboardClient.tsx:154-156` soma `confirmado`+`concluido` sem distinguir quem não apareceu). Migration de CHECK trivial — pode sair no mesmo ciclo de `db diff` de L6. | Médio-alto (relatórios confiáveis; base para futura "taxa de comparecimento" como argumento comercial) | P/M | Nenhuma |

### [DIFERENCIAL] — o que vende contra concorrente

| # | Item | Impacto | Esforço | Dependências |
|---|---|---|---|---|
| D1 | WhatsApp incluso na mensalidade sem metering, comunicado como diferencial na copy de venda. Já é verdade estrutural (Evolution self-hosted); o trabalho é só copy — e a infraestrutura de landing já existe (template vertical SSG + `src/lib/nichos.ts`, 02 §7), então o custo marginal é mínimo. Bloqueado até a decisão de preço do agente PRECIFICACAO para não prometer o que a precificação depois desminta. | Alto (ataca a lacuna de precificação nº1 de `06-mercado.md`: custo variável escondido) | P (copy) | Decisão do agente PRECIFICACAO |
| D2 | Cancelamento de assinatura sem fricção como mensagem de venda ativa ("cancele com um clique, sem multa, sem e-mail"). Mesmo item técnico de L5, reforçado como vetor de posicionamento — ataca o padrão de reclamação transversal mais citado do setor (Trinks, AppBarber, Booksy, Avec). | Alto (diferenciação de confiança, defensável sem feature exclusiva) | Ver L5 | L5 |
| D3 | Contato direto (wa.me) exposto na própria página de agendamento, sem app para o cliente final. Mesmo item técnico de L2, como reforço de "sem fricção também depois de agendar". Impacto como diferencial de mercado **não verificado** (nenhum concorrente tem reclamação por esconder contato) — boa prática de produto, não prometer como exclusividade forte. | Médio | Ver L2 | L2 |

### [NAO-AGORA] — tentação a evitar, com o motivo

1. **Bot de agendamento via WhatsApp / "WhatsApp-first" completo** (agendamento
   iniciado no próprio WhatsApp). Tentador porque UX e mercado apontam a lacuna — mas
   é G+: exige a infraestrutura de webhook de entrada de R2 **mais** máquina de
   estados de conversa, reproduzindo em WhatsApp o que `/book/[slug]` já faz em 3
   cliques. Fazer R2 (confirmar/cancelar por resposta) antes de cogitar bot completo —
   não pular a etapa intermediária "já que o webhook vai ser aberto".
2. **App nativo.** Represado em `docs/PENDENCIAS.md` ("Depois de evidência"). A
   tentação de "parecer completo" contra Trinks/Booksy/AppBarber é real, mas o
   público-alvo não gerou sinal, e dois apps nativos são custo desproporcional ao
   estágio.
3. **Multi-profissional.** Represado (decisão do owner, 2026-07-10). Qualquer
   adiantamento muda a engine de disponibilidade no núcleo — resistir ao "adiantar
   porque é óbvio que vai precisar um dia".
4. **Pedido de avaliação pós-atendimento automático.** Existe em concorrente (Trinks),
   parece barato, mas está fora da visão (`docs/05`: não é CRM/marketing). Mais um
   gatilho de mensageria a manter sem evidência de demanda.
5. **Metering/limite de mensagens WhatsApp "para proteger custo de infra".** Tentação
   inversa de D1: cobrar por crédito "como todo mundo" destruiria o único diferencial
   de precificação real de `06-mercado.md`. Se custo de infra virar problema, a
   resposta é rate limiting técnico (já coberto em "Obrigatório antes do lançamento"
   no `docs/PENDENCIAS.md`), não metering visível ao cliente.
6. **(novo)** **Camada de cache genérica (Redis/Upstash KV) "aproveitando que o 02
   apontou zero cache".** O próprio 02 (§6.4) diz que zero cache é a escolha certa
   para o estágio — o único caso com justificativa concreta é `React.cache()` em
   `obterAssinaturaVigente`, já embutido no escopo de L5. Não generalizar um achado
   pontual em infraestrutura nova.

---

## Sequência recomendada dos próximos 5 itens

1. **L1 — corrigir WhatsApp-ou-e-mail + extrair `src/lib/telefone.ts`.** Continua o
   mais barato com dano ativo (perda de conversão silenciosa acontecendo hoje);
   decisão já registrada em `docs/PENDENCIAS.md`. O 02 só reforçou o escopo: sem a
   extração, a correção vira a 7ª cópia divergente da mesma regra.
2. **L2 — expor `telefone_contato` (wa.me) no booking.** P, mesmo arquivo de L1
   (`BookingWizard.tsx`) — fazer em sequência, aproveitando para extrair a tela de
   sucesso (arquivo em 501 linhas, teto informal de ~700 do 02 §6.2). Rede de
   segurança de retenção enquanto R1 não existe.
3. **L6 + R3 — índices `(tenant_id, data_hora)`/`(tenant_id, telefone)` e status
   `no_show`.** Duas migrations pequenas no mesmo fluxo declarativo
   (`supabase/schemas/` + `db diff`), naturalmente pareáveis numa mesma sessão de
   trabalho. L6 é o achado ALTA do 02 que precisa vir antes de tráfego real; R3
   destrava relatórios confiáveis que sustentam qualquer conversa futura de
   preço/valor.
4. **L3 — `error.tsx`/`loading.tsx` em `/book/[slug]`.** P, sem dependências, fecha o
   último atrito MÉDIO de baixo custo antes dos itens grandes.
5. **R1 fase 1 — cancelamento self-service do cliente final (só cancelar).** Maior
   alavancagem de retenção da auditoria; entra por último no top-5 porque exige
   decisão de arquitetura (mecanismo de token/link seguro) antes de codar, e agora
   também porque L6 (posição 3) deve preceder qualquer feature que adicione consultas
   a `agendamentos` no caminho público.

Deliberadamente fora do top-5: checkout Asaas completo (L5) e webhook de entrada (R2)
— ambos G, coerentes com a direção registrada do owner ("produto agora, lançamento
depois"): consolidar o núcleo primeiro, monetização e canal de entrada WhatsApp
depois. Quando L5 entrar, seu escopo já carrega `React.cache()` em
`obterAssinaturaVigente` e a correção do `docs/01` (ver tabela).
