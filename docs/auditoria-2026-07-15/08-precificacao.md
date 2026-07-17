---
status: temporario
gerado: 2026-07-15 19:07
agente: precificacao
modelo: sonnet
---

# 08 — Precificação: custo real, estrutura de planos e preço do Pro

Construído sobre os quatro insumos obrigatórios (`05-ux-produto.md`, `06-mercado.md`,
`07-features.md`, `docs/07-PLANOS_E_MONETIZACAO.md`) mais leitura direta do código de
mensageria (`src/lib/whatsapp-helper.ts`, `src/lib/notificacoes-agendamento.ts`),
schema (`supabase/schemas/07_agendamentos.sql`, `09_disparos_whatsapp.sql`), config de
infra (`docker/evolution/`) e busca web para preços públicos de infraestrutura (fontes e
datas citadas em cada número). Nenhum arquivo existente foi lido de `.env*` nem secret
algum foi acessado — os valores de infra vêm de documentação pública dos provedores.

**Câmbio usado nas conversões** (fonte: busca agregada citando ECB/Remessa Online,
consultado 2026-07-15): EUR/BRL ≈ R$ 5,82; USD/BRL ≈ R$ 5,10 (via EUR/USD ≈ 1,14).
Registro como **PREMISSA**: câmbio flutua diariamente, os valores em R$ deste documento
são uma fotografia de 2026-07-15, não uma garantia de custo futuro.

---

## a) Custo por tenant

### O que o código realmente usa (não o que os docs prometem)

Confirmado por grep e leitura direta:

- **Resend**: zero código, zero dependência em `package.json` (achado já registrado em
  `docs/auditoria-2026-07-15/02-arquitetura.md` §8.2). **Custo hoje: R$ 0** — não é uma
  integração ativa, é uma linha na "stack oficial" que ainda não foi implementada.
- **PostHog**: `src/lib/analytics/server.ts:22,60` e `src/lib/analytics/client.ts:20`
  fazem `if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return` antes de qualquer chamada —
  no-op confirmado sem credenciais. **Custo hoje: R$ 0**, por decisão de produto, não por
  indisponibilidade.
- **Evolution API**: self-hosted via `docker/evolution/docker-compose.yml` (Evolution +
  Postgres próprio + Redis próprios, containers separados do Supabase). Chamada real de
  envio é `POST {EVOLUTION_API_URL}/message/sendText/{instanceName}`
  (`whatsapp-helper.ts:75`) — **sem cobrança por mensagem de nenhum provedor terceiro**
  (não é Twilio nem API oficial da Meta). O único custo é a VPS que hospeda os três
  containers.
- **QStash**: usado para o lembrete assíncrono (`agendarLembreteQStash`,
  `whatsapp-helper.ts:103`) e para cancelá-lo em remarcação/cancelamento
  (`cancelarLembreteQStash`, chamado em `src/app/actions/agendamentos.ts:130,443`).
- **Supabase**: `@supabase/ssr` + `@supabase/supabase-js`, único banco operacional do
  produto (não é o Postgres interno da Evolution).
- **Clerk**: autenticação B2B via integração nativa de terceiros (JWT, sem sincronizar
  `auth.users` do Supabase — conforme `CLAUDE.md`).
- **Hospedagem do Next.js**: nenhum arquivo de config (`vercel.json`, etc.) declara o
  alvo de deploy; o `README.md` só tem o texto padrão do `create-next-app` mencionando
  Vercel. **PREMISSA**: trato Vercel como a hospedagem, por ser o caminho de menor
  atrito para Next.js 16 App Router e coerente com a stack (Server Actions, ISR das
  landings de nicho SSG). Se a decisão real for outra (self-host, Railway, etc.), o
  número muda, mas a ordem de grandeza do argumento central deste documento (custo
  marginal por tenant ≈ zero) não muda.

### Preço público de cada peça de infra (consultado 2026-07-15)

| Item | Preço | Fonte |
|---|---|---|
| VPS p/ Evolution+Postgres+Redis (2 vCPU/4GB/40GB, ex. Hetzner CX22 ou equivalente) | ~€4,35/mês ≈ **R$ 25/mês** | [vpsbenchmarks.com/hosters/hetzner/plans/cx22](https://www.vpsbenchmarks.com/hosters/hetzner/plans/cx22); nota: o CX22 aparece listado como descontinuado em uma das fontes — uso como proxy de um plano equivalente atual, não como garantia de SKU específico |
| Supabase Free | $0 — 500 MB DB, 5 GB egress, 50k MAU, **projeto pausa após 7 dias de inatividade** | [supabase.com/pricing](https://supabase.com/pricing); [supabase.com/docs/guides/platform/free-project-pausing](https://supabase.com/docs/guides/platform/free-project-pausing) |
| Supabase Pro | $25/mês (inclui US$10 de crédito de compute) — 8 GB DB ($0,125/GB extra), 250 GB egress ($0,09/GB extra), 100k MAU ($0,00325/MAU extra), sem pausa | [supabase.com/pricing](https://supabase.com/pricing) |
| Vercel Pro | $20/mês/seat — Hobby proíbe uso comercial | [vercel.com/pricing](https://vercel.com/pricing) |
| Upstash QStash | Grátis até 1.000 msgs/dia (~30k/mês); acima disso PAYG US$1/100k msgs; planos fixos a partir de US$180/mês (não necessário nesta escala) | [upstash.com/pricing/qstash](https://upstash.com/pricing/qstash) |
| Clerk | Grátis até 50.000 MRU (monthly retained users), Organizations incluso no plano base | [clerk.com/pricing](https://clerk.com/pricing) |
| Resend (se/quando implementado) | Grátis até 3.000 e-mails/mês (100/dia) | [resend.com/pricing](https://resend.com/pricing) |

**Nota técnica sobre Supabase MAU**: o contador de MAU da Supabase mede uso do serviço
Supabase Auth (`auth.users`). Como o projeto usa Clerk como IdP externo via integração
nativa de terceiros e **não sincroniza usuários em `auth.users`** (confirmado em
`CLAUDE.md` e na arquitetura de RLS via `auth.jwt() ->> 'org_id'`), a leitura mais
consistente é que esse contador **não se aplica** aqui. Registro como **PREMISSA não
100%-verificável** sem acesso ao dashboard de billing real — mas mesmo na hipótese
pessimista (contar), 100.000 MAU inclusos no Pro é folga enorme frente a qualquer
projeção realista de tenants (dezenas) × usuários por tenant.

**Decisão de ambiguidade sobre Supabase Free vs. Pro**: trato o **Pro como obrigatório
desde o lançamento público**, não como algo que só passa a valer em algum volume — o
pause automático após 7 dias de inatividade é incompatível com a promessa de Fricção
Zero do produto: se um tenant configura a conta e não recebe agendamento por uma semana
(cenário normal para um negócio pequeno em fase de divulgação), a página pública
`/book/[slug]` cai, e o próximo cliente que tentar agendar vê uma página fora do ar. Isso
não é um trade-off aceitável para o funil que a auditoria de UX (`05-ux-produto.md`)
descreve como já frágil sem `error.tsx`. **DECISÃO**: Supabase Pro entra no piso fixo,
não no "quando crescer".

### Custo marginal por agendamento (a contagem pedida)

Para um tenant no plano com WhatsApp ativo (hoje: Pro), cada agendamento gera:

- **2 mensagens WhatsApp** via Evolution self-hosted: 1 confirmação síncrona
  (`dispararNotificacoesAgendamento`, chamada em `criarAgendamentoPublico`) + 1 lembrete
  assíncrono agendado no QStash (`notificacoes-agendamento.ts:105-133`). **Custo direto
  por mensagem: R$ 0** — essa é exatamente a vantagem estrutural que `07-features.md`
  (gap b.1) já identificou; nenhum provedor de mensageria cobra por envio aqui.
- **1 a 2 linhas em `disparos_whatsapp`**: 1 para a confirmação (`enviado`/`falha`) + 1
  para o lembrete (`agendado`/`falha`), conforme `06-MENSAGERIA_E_WHATSAPP.md` — cada
  linha tem ~9 colunas majoritariamente curtas (uuid, texto curto, timestamp); estimativa
  de ~200-250 bytes/linha com overhead de índice (`supabase/schemas/09_disparos_whatsapp.sql`
  tem 2 índices).
- **1 linha em `agendamentos`** (~250-300 bytes com os 2 índices que a auditoria de banco
  recomenda adicionar — hoje a tabela só tem PK).
- **~0,5 linha em `clientes`** — **PREMISSA**: uso 50% de taxa de cliente novo/mês (metade
  dos agendamentos é de cliente já cadastrado, reaproveitado por telefone via
  `criarAgendamentoPublico`); não há dado real de retenção de clientes no código para
  calibrar isso com precisão.
- **1 chamada QStash `publish`** (agendar lembrete) + **~0,15 chamada `DELETE`** por
  agendamento — **PREMISSA**: taxa de cancelamento/remarcação de ~15% do volume (nem
  todo agendamento é cancelado ou remarcado; a auditoria de UX não fornece uma taxa real
  observada, é uma estimativa de ordem de grandeza para negócios de serviço).

### Os três perfis

Mantenho os perfis do enunciado (leve/médio/pesado) — são compatíveis com a arquitetura
"1 tenant = 1 agenda" confirmada na auditoria de banco (§B3): com grade de 15 min e
serviços de 15-60 min, um profissional sozinho trabalhando 8-10h/dia em ~22 dias úteis
comporta de ~350 a ~700 agendamentos/mês dependendo da duração do serviço — 600/mês
(pesado) é plausível para um negócio de serviço rápido (ex. barbearia, manicure), não
para serviços de 60 min+.

| Perfil | Agend./mês | Msgs WhatsApp/mês | Linhas `disparos_whatsapp`/mês | Linhas `agendamentos`/mês | Linhas `clientes`/mês (premissa 50%) | Chamadas QStash/mês (publish+delete) | Armazenamento novo/mês (estimado) |
|---|---|---|---|---|---|---|---|
| **Leve** (50/mês) | 50 | 100 | 100 | 50 | 25 | ~58 | ~45 KB |
| **Médio** (200/mês) | 200 | 400 | 400 | 200 | 100 | ~230 | ~180 KB |
| **Pesado** (600/mês) | 600 | 1.200 | 1.200 | 600 | 300 | ~690 | ~540 KB |

**Custo marginal direto de infra, nos três perfis: R$ 0,00/mês, arredondando.**

Isso não é um erro de conta — é o achado central desta seção. Nenhum dos três drivers de
custo variável (mensagem WhatsApp, linha de banco, chamada QStash) tem preço unitário
diferente de zero na escala de um único tenant, mesmo no perfil pesado:

- Mensageria: R$ 0/mensagem (self-hosted).
- Armazenamento: 540 KB/mês do tenant mais pesado equivale a ~0,0000063% do 1º GB
  incluso no Supabase Pro — anos para importar em custo mensurável.
- QStash: mesmo 690 chamadas/mês de 1 tenant pesado estão a ~2 ordens de grandeza do
  free tier (30.000/mês); ver seção (d) para o ponto em que isso deixa de ser grátis
  em agregado.

O que **de fato** custa dinheiro é a **conexão WhatsApp em si** (o "slot" de RAM que a
sessão Baileys ocupa na VPS, 24/7, esteja o tenant enviando 1 ou 1.200 mensagens/mês) — e
esse custo é por *tenant conectado*, não por *mensagem enviada*. É um custo em degrau
(step cost), tratado na seção (d).

**PREMISSA sem fonte oficial precisa**: não encontrei um número documentado de RAM por
sessão Baileys/Evolution em produção (a busca só confirmou "1-4 GB é suficiente para uma
instância leve", sem detalhar por-sessão). Uso **200-300 MB por instância conectada**
como estimativa de ordem de grandeza (relatos de comunidade sobre sessões Node.js/
WebSocket de porte similar), reservando ~1 GB da VPS de 4 GB para o SO + Postgres +
Redis + processo base do Evolution. Isso dá **~10-15 tenants Pro conectados
simultaneamente por VPS de 4 GB** antes de precisar de um segundo nó. Esse número
deveria ser validado com um teste de carga real antes do lançamento — é o número mais
frágil deste documento porque não tem fonte pública confiável, apenas ordem de grandeza.

---

## b) Estrutura de planos

### Divergência declarada logo de início

O projeto concebe hoje **Gratuito (R$0) / Plus (R$9,90 · R$99,90/ano) / Pro (R$14,90 ·
R$149,90/ano)** em `src/lib/planos.ts`. **Minha recomendação diverge nos dois eixos**:
elimino o nível Plus e reancoro o preço do único plano pago muito acima do praticado
hoje. Justificativa completa abaixo e em (c); aqui só registro a divergência para não
escondê-la.

### Opção 1 — Gratuito + Pro

**Que limite torna o Gratuito útil-mas-insuficiente?** O código já responde isso
parcialmente: `limiteServicosAtivos: 2` no Gratuito (`planos.ts:34`) é razoável — dá pra
um autônomo testar o fluxo completo com 1-2 serviços, mas qualquer negócio real (salão,
clínica) tem mais de 2 serviços ativos. O que falta no desenho atual não é o limite de
serviços, é o fato de o Gratuito **não incluir WhatsApp nem branding** (`recursos.whatsapp:
false`, `linkPersonalizado: false`) — ou seja, ele já é "insuficiente" o bastante; a
pergunta real é se ele deveria continuar existindo como estava concebido (3º nível
paralelo ao Plus) ou mudar de papel (ver recomendação final).

**Custo de carregar N tenants gratuitos que nunca convertem**: pela conta da seção (a),
**é essencialmente R$ 0/tenant/mês em infra direta** — um tenant gratuito não consome
Evolution (WhatsApp é gated Pro-only no código atual, `whatsapp.ts` e
`public-booking.ts` revalidam isso nos pontos de disparo) e o volume de linhas/egress de
um tenant que nunca configura nada é próximo de zero. Mesmo 500 tenants gratuitos
inativos não moveriam o ponteiro de custo de infra deste documento.

**O risco específico apontado no mandato** ("WhatsApp gera custo de infra por tenant
ativo mesmo sem receita") **não se materializa na configuração atual do código** —
justamente porque `PLANOS.gratuito.recursos.whatsapp === false` e há defesa em
profundidade nos dois pontos de disparo (`public-booking.ts`, `webhooks/lembrete/route.ts`).
Esse risco **só nasceria** se uma decisão futura movesse WhatsApp para o tier gratuito.
Dado o achado da seção (a) — cada tenant Pro conectado ocupa um "slot" fixo de ~200-300 MB
independente de receita —, colocar WhatsApp no Gratuito criaria exatamente o cenário que
o item `[NAO-AGORA] #5` de `07-features.md` alerta a não fazer (ali sobre metering, aqui
o equivalente inverso): **DECISÃO explícita deste documento: WhatsApp nunca entra no
tier sem custo, independente de como os tiers pagos forem reestruturados.** Numa
proporção freemium típica (5-10% conversão), 100 cadastros gratuitos com WhatsApp
grátis exigiriam ~7-10 VPS extras (R$175-250/mês) só para sustentar conexões que nunca
geram receita — a única forma de esse risco virar real é essa decisão de produto errada,
não o volume em si.

### Opção 2 — Só Pro com trial

**Conversão típica de trial em SaaS SMB** (fonte: busca agregada — ChartMogul/
GrowthSpree, dados 2025-2026, consultado 2026-07-15):

- **Opt-in, sem cartão**: 8,9%-18,2% conforme o estudo, mediana ~14% (faixa 8-22%).
- **Opt-out, com cartão obrigatório**: 31,4%-48,8%, mediana ~44% (faixa 35-55%) — 3-4x
  melhor conversão, mas 30-50% menos volume de topo de funil (fricção de cadastro afasta
  quem não tem intenção séria).

Fontes: [growthspreeofficial.com — B2B SaaS Trial-to-Paid Benchmarks 2026](https://www.growthspreeofficial.com/blogs/b2b-saas-trial-to-paid-conversion-rate-benchmarks-2026-by-trial-type-acv-length-credit-card),
[ChartMogul SaaS Conversion Report](https://chartmogul.com/reports/saas-conversion-report/).

**Cartão ou não?** `06-mercado.md` já documenta que **nenhum concorrente relevante
pesquisado exige cartão no trial** (Trinks, Booksy, AppBarber, Simples Agenda, AgendaPro
— todos "sem cartão" declarado). Exigir cartão divergiria do padrão de entrada do setor
inteiro e, mais importante, contradiria a identidade central do próprio produto
("Fricção Zero" é a regra de ouro do CLAUDE.md — aplicada ao cliente final, mas a
inconsistência de pedir fricção extra do profissional logo no primeiro contato é um mau
sinal de coerência de marca). **DECISÃO: trial sem cartão**, aceitando a conversão mais
baixa (opt-in) em troca de coerência com o produto e com o mercado.

**7 dias bastam para um negócio de agenda semanal sentir valor?** Não, na prática mais
provável. Um salão/barbearia/clínica tem ciclo de clientes que se repete semanalmente —
7 dias corridos captura no máximo 1 ciclo completo, **e só se o profissional configurar
tudo no primeiro dia**. A própria auditoria de UX (`05-ux-produto.md` §1) documenta
atrito real de onboarding (tela "Selecione uma Organização" sem CTA, checklist que manda
para a aba errada) que pode consumir 1-2 dos 7 dias só na configuração, antes de o
profissional sequer começar a receber agendamentos de teste. **Avaliando 14 dias como
alternativa séria** (pedido explícito do mandato): 14 dias garante pelo menos 2 ciclos
semanais completos após a configuração, e é exatamente o valor usado por um dos
concorrentes mais bem avaliados do levantamento (Booksy, 14 dias, sem cartão,
nota 8,7 não é da Booksy mas a doc não reporta reclamação de trial curto). **DECISÃO: 14
dias, não 7** — o ganho de dar tempo real para o produto provar valor (reduzir
esquecimento via WhatsApp, ver a agenda se preencher) supera o custo de 7 dias a mais de
um trial que já não tem custo marginal relevante (seção a).

### Opção 3 — Nota sobre plano superior futuro

Não recomendo para o lançamento. Candidato natural: um tier "Studio"/"Equipe" quando
multi-profissional deixar de ser `[NAO-AGORA]` (hoje deliberadamente fora de escopo,
decisão do owner registrada em `docs/PENDENCIAS.md` conforme `07-features.md`) — a
mudança de "1 tenant = 1 agenda" para múltiplos profissionais é uma reescrita do motor de
disponibilidade (achado B3 da auditoria de banco), não um flag de plano; construir um
tier pago em cima de uma feature que não existe é vender promessa. Não avançar até o
gatilho de produto já definido (profissionais recusando adotar especificamente por essa
ausência) disparar.

### Recomendação final (com a divergência explícita)

**Gratuito (vitrine, papel novo) + Pro único (tudo incluso) + trial de 14 dias sem
cartão no Pro para todo cadastro novo.**

Divergências concretas do que `planos.ts` concebe hoje:

1. **Elimino o tier Plus.** Hoje o Plus paga por branding (slug + cor) mas não tem
   WhatsApp — o diferencial estrutural mais forte do produto (mensageria sem metering,
   `07-features.md` gap b.1) fica trancado atrás de um 3º degrau que a maioria dos
   tenants talvez nunca alcance. Fundir Plus+Pro num único plano pago que inclui
   branding **e** WhatsApp ataca de frente a lacuna de mercado nº1 identificada em
   `06-mercado.md`: "ninguém pesquisado oferece um preço único e completo sem
   escalonamento por add-on" — hoje o próprio VamoAgendar replica esse escalonamento
   internamente (Plus sem WhatsApp, Pro com), o que anula parte da mensagem "sem letra
   miúda" antes mesmo de chegar ao mercado.
2. **Todo cadastro novo nasce com Pro por 14 dias**, sem cartão — não é o "Gratuito"
   atual do primeiro contato. Ao fim do trial sem conversão, o tenant cai para um
   Gratuito residual (mantenho o papel de vitrine: link público ativo, 1-2 serviços,
   sem WhatsApp, sem branding) — que continua existindo por dois motivos que a conta de
   custo por si só não capturaria: (i) o link `/book/[slug]` de um tenant gratuito é
   distribuição orgânica de baixo custo (cada agendamento expõe a marca VamoAgendar a um
   cliente final que nunca ouviu falar do produto) e (ii) reduz o atrito de reativação —
   se o dono quiser voltar a pagar depois, a conta e o histórico já existem.
3. **Trade-off que registro contra a própria recomendação, por honestidade**: um
   freemium perpétuo tem valor de aquisição orgânica/SEO que um trial-only elimina após
   14 dias — hoje não há canal de aquisição pago validado na auditoria, então "grátis
   vira vitrine compartilhável" pode valer mais do que a conta de custo puro sugere.
   É por isso que a recomendação **mantém** um Gratuito residual em vez de recomendar
   "só Pro, sem gratuito nenhum" — um meio-termo, não a opção 2 pura do mandato.

Isso é uma mudança de modelo, não só de preço — se o objetivo da auditoria for só
recalibrar `precoMensal`/`precoAnual` sem tocar na estrutura de 3 planos, a recomendação
mínima é: mover `whatsapp: true` para o Plus também (ou remover o Plus da tabela pública
e tratá-lo como desconto interno), porque a composição atual desconecta preço de valor
percebido.

---

## c) Preço do Pro

### As três âncoras

**Teto (concorrência comparável, de `06-mercado.md`)**: faixa de entrada 1 profissional
R$ 39,90 (Simples Agenda) a R$ 79,90 (AppBarber), com Trinks em R$ 76 e Fresha em R$
39,95 — mas **nenhum desses preços inclui WhatsApp sem cobrança separada**. Um plano
único que já embute WhatsApp sem metering está entregando o que os concorrentes cobram
como add-on por cima da mensalidade — isso justifica mirar a **faixa alta** do intervalo
de entrada observado (R$ 70-90), não a mais barata, sem furar o teto psicológico do
segmento (acima de ~R$ 90-100 já entra na faixa de "pequena equipe" do mercado, onde o
produto perde o enquadramento de "1 profissional").

**Piso (custo × margem mínima saudável, de (a))**: o custo variável por tenant é ~R$
0,00 (seção a) — então o piso de precificação **não é definido pelo custo marginal**,
e sim pelo fixo amortizado. Fixo total estimado (seção d): ~R$ 260/mês na largada. Com
10 tenants pagantes, ratear apenas o fixo já dá ~R$ 26/tenant — para uma margem bruta
saudável de SaaS (70%+), o piso seria R$ 26 ÷ 0,30 ≈ R$ 87/tenant *se houvesse só 10
pagantes*. Esse número cai rápido com mais tenants (ver tabela de d): a 30 pagantes, o
piso de margem saudável já cai para ~R$ 12/tenant. Ou seja, **o piso real de
sustentabilidade é muito baixo** — o preço de mercado, não o custo, é quem ancora o valor
mínimo aceitável (abaixo de ~R$ 40 soa amador para quem já viu concorrente cobrando R$
76-99, achado de percepção de `06-mercado.md`).

**Percepção (o que salão/clínica de cidade média paga sem fricção)**: usando "custo de 1
no-show evitado/mês" como argumento — ticket médio de um corte simples em cidade média
brasileira fica em **R$ 50-65** (fonte: busca agregada sobre precificação de barbearia
2026, consultado 2026-07-15; ticket médio de barbearia intermediária em capital do
Sudeste R$ 70-85). Se o lembrete automático por WhatsApp evitar **1 no-show por mês** —
premissa conservadora, já que reduzir esquecimento é exatamente o que o produto faz hoje
(seção 4 de `05-ux-produto.md` confirma o lembrete como "existe e é robusto") — a
assinatura já se paga sozinha com um preço na faixa de R$ 50-60/mês, sem precisar
argumentar economia de tempo, profissionalização de imagem ou qualquer benefício mais
difícil de provar.

### Preço sugerido

| | Valor | Racional |
|---|---|---|
| **Mensal** | **R$ 59,90** | Dentro do teto de mercado (R$ 70-90 sem WhatsApp incluso — R$ 59,90 com WhatsApp incluso é competitivo mesmo abaixo do teto), acima do piso de percepção de "1 no-show evitado" (R$ 50-65), muito acima do piso de custo (R$ 26-87 conforme volume). |
| **Anual** | **R$ 599,00** (equivalente a R$ 49,92/mês) | Desconto de ~17% frente ao mensal ×12 (R$ 718,80) — **não** os "-50%" que `planos.ts` pratica hoje. Um desconto de 50% no anual é bandeira vermelha de precificação: ou o preço mensal está superfaturado (não é o caso aqui, está ancorado em mercado) ou o desconto está sacrificando margem sem necessidade — 15-20% é a faixa comum de desconto anual saudável em SaaS B2B, o suficiente para incentivar comprometimento de caixa sem parecer que o preço mensal é "fake". |
| **Fundador/lançamento** | **R$ 39,90/mês, vitalício, para os primeiros ~50 assinantes** | Abaixo do teto de mercado, ainda muito acima do piso de custo (R$ 39,90 cobre o fixo rateado mesmo com poucos pagantes — ver break-even em (d)), cria urgência genuína sem precisar de desconto insustentável. Não recomendo estender esse preço além de um lote fixo de vagas — usar como alavanca de aquisição para os primeiros clientes reais (pilotos), não como preço de tabela permanente. |

**Nota de honestidade**: os preços hoje codificados em `src/lib/planos.ts` (Plus R$9,90,
Pro R$14,90) estão **3-4x abaixo até do piso de percepção calculado aqui**, e ~5-8x
abaixo do teto de mercado. Não é um problema de o produto "estar caro demais" — é o
oposto: ao preço atual, o produto sinaliza (para um dono de negócio que já pesquisou
Trinks/AppBarber) que é um projeto amador ou instável, mesmo quando tecnicamente não é.
Preço baixo demais também é fricção de conversão num mercado B2B onde o comprador associa
preço a confiabilidade de algo que toca a agenda/renda dele.

---

## d) Break-even e projeção

### Piso fixo de infra (independente do nº de tenants, dentro da faixa projetada)

| Item | Custo mensal |
|---|---|
| VPS Evolution+Postgres+Redis (1 nó, até ~10-15 tenants Pro conectados) | R$ 25 |
| Supabase Pro (obrigatório desde o lançamento, ver seção a) | R$ 127,50 |
| Vercel Pro (1 seat) | R$ 102,00 |
| QStash | R$ 0 (dentro do free tier até muito além de 80 tenants, ver abaixo) |
| Clerk | R$ 0 (dentro do free tier, 50k MRU) |
| Resend | R$ 0 (não implementado) |
| Domínio (~R$ 50/ano) | ~R$ 4 |
| **Total** | **≈ R$ 258,50/mês** |

### Quantos pagantes cobrem a infra

Ao preço recomendado (R$ 59,90/mês): **R$ 258,50 ÷ R$ 59,90 ≈ 4,3 → 5 tenants pagantes**
cobrem o piso fixo total. Ao preço de fundador (R$ 39,90/mês): **R$ 258,50 ÷ R$ 39,90 ≈
6,5 → 7 tenants**. Como o custo marginal por tenant é ~R$ 0 (seção a), **todo tenant além
do break-even é quase 100% margem de contribuição**, até o próximo degrau de VPS.

### MRR projetado (todos os tenants no plano Pro único, R$ 59,90/mês — cenário
conservador de composição 100% Pro, já que é o único plano pago recomendado)

| Tenants pagantes | MRR | VPS Evolution necessárias (premissa ~12/nó, ponto médio de 10-15) | Fixo total estimado | Margem bruta | % margem |
|---|---|---|---|---|---|
| 10 | R$ 599,00 | 1 | R$ 258,50 | R$ 340,50 | 56,8% |
| 30 | R$ 1.797,00 | 3 | R$ 258,50 + 2×R$25 = R$ 308,50 | R$ 1.488,50 | 82,8% |
| 80 | R$ 4.792,00 | 7 | R$ 258,50 + 6×R$25 = R$ 408,50 | R$ 4.383,50 | 91,5% |

Supabase Pro e Vercel Pro **não precisam de novo degrau** em nenhum desses três pontos:
o cálculo de armazenamento da seção (a) mostra ~540 KB/mês para o tenant mais pesado —
mesmo 80 tenants pesados simultâneos ficariam na casa de dezenas de MB/mês de
crescimento, ordens de grandeza abaixo dos 8 GB inclusos no Supabase Pro; egress
projetado (~90 MB/mês/tenant pesado × 80 ≈ 7,2 GB/mês no cenário mais pesado possível)
fica bem dentro dos 250 GB inclusos.

**QStash em 80 tenants, todos no perfil pesado (limite superior irreal, mas útil como
teste de estresse)**: 80 × 690 chamadas/mês ≈ 55.200/mês ≈ 1.840/dia — isso **ultrapassa**
o free tier de 1.000/dia. Nesse cenário extremo, o custo vira PAYG: 55.200 msgs/mês a
US$1/100k ≈ US$0,55/mês ≈ **R$ 2,80/mês** — irrelevante mesmo no pior caso.

### Sensibilidade: custo da Evolution/VPS dobrando

Duas formas de "dobrar" esse custo, ambas testadas:

1. **O preço da VPS dobra** (de R$25 para R$50/nó, ex. reajuste do provedor ou upgrade
   de plano por necessidade de mais CPU): no cenário de 80 tenants (6 nós adicionais),
   o fixo de infra sobe de R$408,50 para R$ 258,50 + 6×R$50 = **R$ 558,50/mês** — a
   margem cai de 91,5% para **88,3%**. Impacto real: -3,2 p.p. de margem.
2. **A capacidade por nó cai pela metade** (premissa de RAM por instância dobrar, de
   ~250 MB para ~500 MB, reduzindo de ~12 para ~6 tenants Pro por VPS — cenário mais
   provável de "o custo real dobrar" do que o preço do provedor mudar): em 80 tenants,
   o nº de nós necessários dobra de 7 para 14 (80÷6, arredondado para cima), fixo sobe
   para R$ 258,50 + 13×R$25 (13 nós extras além do já contado no piso) = **R$ 583,50/mês**
   — margem cai para **87,8%**, efeito de **-3,7 p.p.**, ligeiramente pior que o cenário 1
   porque o arredondamento por nó pesa mais em fatias menores de capacidade.

**A maior sensibilidade de custo deste modelo não é o preço da VPS nem a densidade de
instâncias por nó — é a taxa de conversão do trial.** Mesmo dobrando o pior driver de
custo variável identificado (capacidade de WhatsApp por VPS), a margem bruta projetada
em 80 tenants cai de 91,5% para ~87,8-88,3% — um ajuste fino. Já uma conversão de trial abaixo
do piso de break-even (5-7 pagantes, seção acima) significa o fixo de ~R$260-560/mês
saindo do próprio bolso do fundador todo mês, com zero receita para absorver — esse é o
risco financeiro real do modelo, não o custo de infra por tenant, que a seção (a) já
mostrou ser estruturalmente desprezível graças ao WhatsApp self-hosted sem metering.

---

## Fontes consultadas (resumo, todas 2026-07-15)

vpsbenchmarks.com/hosters/hetzner/plans/cx22, hetzner.com/pressroom/new-cx-plans,
supabase.com/pricing, supabase.com/docs/guides/platform/free-project-pausing,
vercel.com/pricing, upstash.com/pricing/qstash, clerk.com/pricing, resend.com/pricing,
busca agregada sobre trial-to-paid conversion (growthspreeofficial.com, chartmogul.com),
busca agregada sobre câmbio EUR/USD/BRL (ECB, Remessa Online), busca agregada sobre
ticket médio de barbearia/salão em cidades médias brasileiras 2026.
