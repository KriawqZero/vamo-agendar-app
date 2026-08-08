# Product Marketing Context

**Document version:** v2
**Last updated:** 2026-07-28

> Documento de contexto que **todos os marketing skills leem automaticamente**.
> Nome canônico exigido pelos skills: `.agents/product-marketing.md` (o nome legado
> `product-marketing-context.md` foi descontinuado pelo skill `product-marketing`).
> A central de marketing viva fica em `.marketing/` — este arquivo é só o contexto
> compartilhado; estratégia, plano e histórico moram lá.

---

## Product Overview

**One-liner:**
Link de agendamento para o profissional autônomo brasileiro que atende sozinho — a cliente
marca o horário sem baixar app, sem criar conta e sem senha.

**What it does:**
O profissional cadastra serviços (com duração e preço), seus dias e horários de atendimento
e suas folgas. O VamoAgendar gera um link público (`vamoagendar.com.br/sua-marca`) que mostra
**apenas os horários realmente livres**, calculados em tempo real. A cliente escolhe serviço →
data/hora → informa nome e WhatsApp → confirma. No plano Pro, ela recebe confirmação na hora e
lembrete automático antes do horário, pelo WhatsApp do próprio profissional.

**Product category:**
Agendamento online para profissional autônomo. A prateleira onde o cliente procura:
*"sistema de agendamento para barbearia"*, *"app de agenda para manicure"*,
*"link de agendamento"*, *"agenda online salão"*. **Não** é "gestão de salão", "ERP de
beleza" nem "marketplace de beleza" — e a diferença importa, porque essas três prateleiras
têm concorrentes muito maiores e um cliente diferente.

**Product type:**
SaaS B2B2C self-serve. B2B: o profissional assina e gerencia. B2C: o cliente final usa o link
público e **nunca** cria conta (regra de Fricção Zero, inegociável).

**Business model:**
Freemium com assinatura mensal do profissional (Asaas). O VamoAgendar **não** processa o
pagamento do serviço prestado — o dinheiro do corte/da unha continua indo direto pro
profissional, do jeito dele.

| Plano | Preço | O que entrega |
|---|---|---|
| Gratuito | R$ 0 para sempre | Até 2 serviços ativos, link com código aleatório, agenda anti-conflito |
| Pro | **R$ 39,90/mês** — R$ 29,90 travado vitaliciamente para quem assinar até 02/02/2027 | Serviços ilimitados, link personalizado, cor/logo/capa da marca, confirmação + lembrete automáticos no WhatsApp |

> ⚠️ **Divergência ativa entre código e decisão.** O `src/lib/planos.ts` e a landing ainda
> mostram Plus R$ 9,90 e Pro R$ 14,90 com selo "-50%". A decisão registrada no
> `.planning/PROJECT.md` extingue o Plus e leva o Pro a R$ 39,90 (Phase 7 do roadmap).
> **Nenhuma peça de marketing pode citar preço até a Phase 7 fechar** — ver
> `.marketing/DECISOES.md` D-03.

---

## Target Audience

**Target companies:**
Não são empresas — são pessoas físicas que faturam sozinhas. Profissional autônomo de
beleza/estética, **uma pessoa, uma agenda**, atendendo entre 5 e 15 clientes por dia, em
estúdio próprio, em casa ou em espaço alugado. Faturamento típico R$ 3–12 mil/mês.

**Decision-makers:**
Uma pessoa só. Ela é usuária, campeã, decisora e compradora ao mesmo tempo. **Não existe
comitê de compra, não existe ciclo de vendas, não existe procurement.** Qualquer framework
B2B que pressuponha múltiplos stakeholders está sendo aplicado errado aqui — a decisão é
emocional e leva minutos, não semanas.

**Primary use case:**
Parar de negociar horário por mensagem no meio de um atendimento.

**Jobs to be done:**
1. *"Me tira do meio da conversa de agenda pra eu conseguir atender."* — o job funcional.
2. *"Me faz parecer profissional sem eu ter que fingir que sou uma empresa."* — o job social;
   é por isso que cor, logo e link com o nome dela vendem tanto quanto a automação.
3. *"Faz a cliente lembrar do horário pra minha cadeira não ficar vazia."* — o job econômico.

**Use cases:**
- Link na bio do Instagram, que é onde o cliente do nicho já procura.
- Link fixado/no status do WhatsApp Business, resposta pronta para "tem horário?".
- Remarcação fora do expediente (a cliente escolhe o novo horário às 23h; o profissional
  libera o antigo no painel no dia seguinte).
- Walk-in: profissional registra no painel o cliente que apareceu sem marcar, pela mesma engine.

---

## Personas

Persona única. A tabela existe para registrar que a análise foi feita, não para inflar o doc.

| Persona | Cares about | Challenge | Value we promise |
|---------|-------------|-----------|------------------|
| **Profissional que atende sozinho** (barbeiro, manicure, lash designer, designer de sobrancelhas) | Não perder cliente; não parecer amador; não trabalhar de graça respondendo mensagem | A agenda mora na cabeça, no caderno e em 40 conversas do WhatsApp ao mesmo tempo | O link responde "que horas tem?" por você, com os horários certos, 24h por dia |

---

## Problems & Pain Points

**Core problem:**
A negociação de horário acontece por mensagem, de forma assíncrona, **exatamente enquanto o
profissional está com as mãos ocupadas em outro cliente**. Cada agendamento custa de 3 a 6
mensagens trocadas ao longo de horas.

**Why alternatives fall short:**
- **Caderninho / agenda de papel:** só funciona quando o profissional está presente e com a
  mão livre. Não trabalha às 22h, que é quando o cliente decide.
- **WhatsApp puro:** a conversa *é* o problema. Adicionar catálogo ou resposta automática não
  resolve, porque nada disso sabe quais horários estão livres.
- **Concorrentes da liga ferramenta** (Agende-me, Azzend, AgendaIA, R$ 0–120/mês): entregam o
  link, mas tratam buraco de agenda de forma **reativa** — fila de encaixe, lista de espera,
  mapa de calor. Ninguém previne o buraco na hora de oferecer o horário.
- **Marketplaces** (Booksy, Trinks): caros para quem atende sozinho, e o cliente passa a ser
  do marketplace. Vários exigem que o cliente final baixe app ou crie conta.

**What it costs them:**
- A máquina desligada e o cliente da cadeira esperando enquanto ele digita.
- Vaga presa: duas clientes "vão ver e avisam", dois horários bloqueados que ninguém marca.
- No-show em horário longo (aplicação de cílios de 2h vale R$ 160–200 perdidos de uma vez).
- Horário nobre de fim de tarde vazio — o que mais dói e o mais fácil de vender.

**Emotional tension:**
Nunca desliga. Culpa por demorar a responder. Medo silencioso de que a cliente vá pra
concorrente que respondeu primeiro. E o desconforto de sentir que "não sou organizada",
quando o problema é estrutural e não de caráter.

---

## Competitive Landscape

**Direct:** *Agende-me, Azzend, AgendaIA, Belasis, Barbeiro.app (liga ferramenta, R$ 0–120/mês)*
— entregam link público e lembrete de WhatsApp. Falham porque tratam buraco de agenda depois
que ele existe (encaixe, waitlist) e porque vários se posicionam como "sistema de gestão",
carregando uma complexidade que quem atende sozinho não quer.
⚠️ **Não verificado empiricamente:** os três principais anunciam "sem cadastro do cliente" em
copy, mas ninguém executou um booking real neles. Item aberto em `.marketing/PESQUISA.md`.

**Secondary:** *WhatsApp Business com catálogo e mensagem automática* — é o que a maioria usa
hoje e é grátis. Falha porque a resposta automática não conhece a agenda: ela devolve "já te
respondo", não "quinta às 14h está livre".

**Indirect:** *Booksy, Trinks (marketplaces)* — resolvem descoberta de cliente novo, não
organização de agenda. Falham para este ICP por preço, por sequestrar a relação com a cliente
e por exigirem que o cliente final instale app ou crie conta.

**Alternativa nula:** *não fazer nada / caderninho*. É o concorrente mais forte de todos e o
que mais ganha. Nunca subestimar.

---

## Differentiation

**Key differentiators:**

1. **Grade anti-buraco** — o único ponto em que o produto está sozinho na faixa de preço.
   A engine nunca oferece um horário que crie uma sobra invendável entre dois agendamentos.
   Se aceitar às 14h30 deixar um vão de 20 min que nenhum serviço do profissional preenche,
   aquele horário simplesmente não é oferecido. Resultado: a agenda fecha **densa**, sem
   ninguém precisar administrar encaixe. *(Fonte: `.planning/research/FEATURES.md` — nenhum
   concorrente brasileiro desta liga previne; todos tratam depois.)*
2. **Fricção Zero de verdade, do lado do cliente final** — sem cadastro, sem senha, sem OTP,
   sem app. O link abre e funciona. É regra de arquitetura, não configuração.
3. **Escopo declarado com honestidade** — o produto diz na própria copy o que **não** é
   (não é agenda de equipe, não cobra pelo app, não é aplicativo pra instalar). Isso vende
   melhor pro autônomo do que a promessa genérica de "tudo o que seu salão precisa".

**How we do it differently:**
Todo mundo pergunta "quando você está livre?". O VamoAgendar pergunta "quando você está livre
**de um jeito que ainda dá pra vender o resto do dia**?".

**Why that's better:**
Buraco de agenda é receita perdida que nunca aparece em relatório nenhum — o profissional não
observa o agendamento que não virou buraco. Prevenir custa zero de esforço pra ele. Remediar
(encaixe, lista de espera) custa atenção, que é exatamente o recurso escasso.

**Why customers choose us:**
Hoje: ainda não escolhem — não existe cliente pagante. **Zero prova social.** Esta é a maior
restrição de marketing do projeto e está registrada como tal, não como detalhe.

---

## Objections

| Objection | Response |
|-----------|----------|
| "Minha cliente não vai saber usar / é mais velha" | Não tem cadastro, não tem senha, não tem app pra baixar. É abrir um link, igual abrir uma foto que você mandou. São três toques. |
| "Vou perder o contato com a cliente" | O WhatsApp continua seu, o número continua seu, a cliente continua sua. O link tira só a negociação de horário — o resto da conversa fica onde sempre esteve. |
| "Já uso o WhatsApp Business, tem catálogo" | O catálogo mostra o que você faz. Ele não sabe se quinta às 14h está livre — quem responde isso ainda é você, no meio do atendimento. |
| "É mais um custo por mês" | Uma falta evitada no mês já paga. E o plano gratuito existe pra você testar com 2 serviços antes de decidir. |
| "E se der conflito e marcar dois no mesmo horário?" | O horário some da tela no instante em que alguém confirma, e o banco tem trava contra dois agendamentos sobrepostos. |
| "Já tentei um desses e ninguém usou" | Provavelmente porque pediram cadastro da cliente. Aqui ela não cria conta. |

**Anti-persona:**
- Salão com **várias profissionais** ou várias cadeiras (multi-profissional não existe).
- Quem precisa **cobrar sinal/PIX antecipado** (colide com a arquitetura Fricção Zero).
- Quem quer **app nativo próprio** com a marca dele na loja.
- Quem tem recepcionista — o problema já tem dono.
- Quem quer sistema fiscal, estoque ou comissionamento.

---

## Switching Dynamics

**Push:** responder "tem horário?" no meio de um atendimento; vaga presa em "vou ver e te
aviso"; a cliente que não apareceu; o sábado que não lotou porque ele não deu conta de
responder todo mundo.

**Pull:** o link que trabalha às 22h; o lembrete que sai sozinho de manhã; a página com a cor
e a logo dele; a sensação de "isso me faz parecer profissional".

**Habit:** o caderninho funciona *bem o bastante*, e o WhatsApp é onde a cliente já está —
mandar ela pra outro lugar parece risco. Mudar exige cadastrar serviço por serviço, que é
trabalho num dia que já não sobra tempo.

**Anxiety:** "minha cliente não vai usar"; "vou perder o toque pessoal"; "e se o sistema
marcar errado e eu ficar mal com a cliente"; "e se eu montar tudo e não valer nada".

> A ansiedade dominante **não é preço, é vergonha social** — o medo é passar vergonha com a
> cliente, não gastar R$ 39,90. Toda copy de conversão deve atacar isso antes de atacar preço.

---

## Customer Language

**How they describe the problem:**
- "Fico o dia todo respondendo *que horas tem?*"
- "Ela disse que ia ver com o marido e me avisar, e sumiu"
- "Deu bolo de novo" / "deu furo"
- "Não consigo nem terminar um atendimento sem o celular tocar"
- "Minha agenda tá no caderninho mesmo"
- "Marquei duas no mesmo horário e passei o maior perrengue"

**How they describe us:**
Ainda não existe fala verbatim de cliente — **nenhuma entrevista foi feita**. Capturar as
primeiras é a tarefa nº 1 do plano (ver `.marketing/PESQUISA.md`). Até lá, toda "fala de
cliente" em copy é invenção e está proibida.

**Words to use:**
horário · encaixe · atendimento · cliente / clienta · manutenção · direct · link na bio ·
agenda · furo · bolo · folga · seu link · sua marca

**Words to avoid:**
plataforma · solução · gestão · otimizar · workflow · empoderar · revolucionar · escalar ·
onboarding · dashboard (usar "painel") · disruptivo · "transforme seu negócio" · qualquer
número inventado de aumento de faturamento

**Glossary:**
| Term | Meaning |
|------|---------|
| Fricção Zero | Regra de arquitetura: o cliente final nunca faz login, cadastro ou OTP. Inegociável. |
| Grade anti-buraco | Engine que só oferece horários que não criam sobra invendável entre agendamentos. |
| Buraco / sobra invendável | Vão entre dois agendamentos curto demais para caber qualquer serviço do profissional. |
| Tenant | O profissional/estabelecimento assinante (termo interno — **nunca** usar em copy). |
| Walk-in | Cliente que aparece sem marcar e é registrado pelo profissional no painel. |
| Fundador | Quem assinar o Pro até 02/02/2027 e trava R$ 29,90 vitalício. |

---

## Brand Voice

**Tone:** concreto e cinematográfico. A landing conta um dia inteiro no relógio — 22:31, 06:47,
09:12 — em vez de listar benefícios. Cenas, não adjetivos.

**Style:** direto, coloquial-adulto, frases curtas. Mostra a dor pela cena ("cliente na cadeira,
celular vibrando"), não pelo rótulo ("ineficiência operacional"). Nunca usa ponto de exclamação
para criar entusiasmo.

**Personality:** honesto · concreto · calmo · cinematográfico · anti-vendedor

**Regra de honestidade herdada da landing (não negociar):** a copy declara o que o produto
**não** faz, cita explicitamente quando um recurso é exclusivo do Pro, e nunca promete número
que não foi medido. É o ativo de marca mais valioso que existe hoje — quebrar isso na primeira
campanha destrói o único diferencial de tom que o produto tem.

---

## Proof Points

**Metrics:** nenhuma. Zero profissionais reais, zero agendamentos de cliente final, zero receita.
**Customers:** nenhum.
**Testimonials:** nenhum. **É proibido fabricar, ilustrar ou "exemplificar" depoimento.**

**Value themes:**
| Theme | Proof disponível hoje |
|-------|------------------------|
| A cliente marca sozinha, sem cadastro | ✅ Demo interativa e clicável na landing (`DemoAgendamento`) e as 4 landings verticais |
| A agenda fecha densa, sem buraco | ⚠️ A engine existe e é testada, mas **nada no produto mostra isso pro profissional** (Phase 6 do roadmap) |
| Lembrete automático reduz falta | ⚠️ Funciona, mas o número de redução **não foi medido** — não citar percentual |
| Sua marca na página | ✅ Cor, logo e capa funcionam (Pro) |

**O ativo de prova mais forte que existe hoje é o produto funcionando ao vivo.** Enquanto não
houver cliente, a prova é demonstração, não depoimento.

---

## Goals

**Business goal (pré-lançamento):** construir demanda e fila — chegar ao go-live (estimado
em 4–8 semanas a partir de 2026-07-28) com profissionais querendo entrar, não com audiência
genérica.

**Conversion action, hoje:** não existe. A página de conversão está briefada em
`.marketing/ativos/brief-pagina-conversao.md` e será construída em sessão dedicada (D-15).
Enquanto isso, o conteúdo constrói alcance e conversa — comentário e DM são o ponto de
contato, e isso é perda assumida conscientemente.
**Conversion action, quando a página existir:** entrar na fila.
**Conversion action (pós-lançamento):** criar conta → cadastrar 1º serviço → publicar o link.

**Métrica norte atual:** sinal de criativo — peças que batem ≥ 3× a média do próprio perfil
ou ~10 mil views orgânicas. É ela que libera verba de mídia (D-16).

**Current metrics:** PostHog instrumentado e funcionando (evento `landing_viewed` com
propriedade `nicho`; funil B2B e B2C mapeados em `docs/08-ANALYTICS_E_FUNIL.md`). Volume atual
de tráfego: desprezível — nunca houve divulgação.

**Regra de comunicação vigente (D-13):** nenhuma peça cita preço **nem menciona plano
gratuito**. "Preço de fundador" pode ser usado como condição, sem número.

---

## Changelog

*Newest first. Uma linha por revisão: o que mudou e por quê.*

- v2 (2026-07-28) — Reorientação estratégica (D-12): marketing vira produção e distribuição
  de criativos com fábrica de IA. Atualizadas as seções **Goals** e a regra de preço
  (agora nem "grátis", D-13). Posicionamento, ICP, dores, objeções e voz **não mudaram** —
  a pesquisa que os sustenta continua válida. Lançamento estimado em 4–8 semanas.
- v1 (2026-07-28) — Contexto inicial, auto-drafted do repositório (landing, `nichos.ts`,
  `planos.ts`, `docs/05` e `docs/07`, `.planning/PROJECT.md` e `.planning/research/`) e
  ajustado com duas respostas do owner: **zero rede no nicho** e **conteúdo sem rosto**.
