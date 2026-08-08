# Posicionamento e mensagem

**Atualizado:** 2026-07-28
**Status:** hipótese fundamentada — **não validada com cliente real**. Toda afirmação aqui
é falsificável e deve ser testada contra as conversas de `PESQUISA.md`.

---

## A frase de posicionamento

> **Para o profissional que atende sozinho, o VamoAgendar é o link que responde
> "que horas tem?" no seu lugar — e só oferece horários que fecham a agenda sem deixar
> buraco.**

Duas metades, e a ordem importa:

- A primeira metade (**o link responde por você**) é o que faz a pessoa parar de rolar.
  É a dor que ela reconhece em meio segundo.
- A segunda metade (**sem deixar buraco**) é o que faz ela escolher você em vez do
  concorrente. É a única coisa que nenhum concorrente brasileiro desta faixa faz.

Vender só a primeira é virar commodity — "sem cadastro" já está na copy de três
concorrentes. Vender só a segunda é vender algo que ninguém pediu, porque ninguém sabe
que tem esse problema.

---

## A categoria que reivindicamos

**Agenda para quem atende sozinho.**

Não "sistema de gestão para salão". Não "plataforma de beleza". Não "marketplace".

Isso é escolha de prateleira, e ela corta clientes de propósito. Salão com 4 cadeiras não
é nosso — e dizer isso em voz alta é o que faz o autônomo confiar, porque ele passou a
vida vendo software feito para empresa maior que a dele e sentindo que o problema era ele.

---

## Hierarquia de mensagem

Ordem de apresentação, do gancho à prova. Nenhuma peça precisa usar os cinco níveis; toda
peça precisa começar pelo nível 1.

**Nível 1 — O gancho (a cena):**
A conversa de agenda que interrompe o atendimento. *"Deixa eu ver aqui e te falo."*
Nunca abrir por benefício abstrato. Sempre por cena reconhecível.

**Nível 2 — A virada:**
Essa conversa não precisa existir. O link mostra os horários realmente livres, o cliente
escolhe, e acabou.

**Nível 3 — A prova de que é fácil pro cliente dela:**
Sem cadastro, sem senha, sem app. Três toques. *(Esta é a objeção nº 1 — ver
`.agents/product-marketing.md`. Ela precisa ser respondida antes de qualquer feature.)*

**Nível 4 — O diferencial:**
A grade não oferece horário que deixa vão invendável. A agenda fecha densa sozinha.

**Nível 5 — O reforço de identidade:**
Sua cor, sua logo, seu nome no link. Parecer profissional sem fingir ser empresa.

---

## Ângulos de mensagem por nicho

Já escritos e testáveis em `src/lib/nichos.ts`. Resumo do que muda em cada um — usar isso
para escolher ângulo de vídeo e de DM, não reinventar:

| Nicho | Dor mais aguda | Ângulo que puxa |
|---|---|---|
| **Barbeiro** | Celular vibrando com o cliente na cadeira; horário nobre de fim de tarde virando furo | Máquina desligada = dinheiro parado |
| **Manicure** | Vaga presa no *"vou ver com meu marido e te aviso"* enquanto outra cliente queria o mesmo horário | Quem quer o horário confirma na hora, e ele some para as outras |
| **Lash designer** | Remarcação interrompendo aplicação de 2h; falta em sessão longa é buraco caro | Encaixe errado em sessão longa custa muito |
| **Designer de sobrancelhas** | Direct chamando no milímetro do fio | O direct volta a ser vitrine, não central de atendimento |

**Aposta de priorização:** começar por **manicure e barbeiro**. Manicure tem a maior
densidade de profissionais autônomas no Brasil e é o nicho mais nativo de Instagram;
barbeiro tem o ticket de dor mais óbvio e é o mais fácil de abordar presencialmente.
Lash e sobrancelhas entram na sequência. — *hipótese, ver `EXPERIMENTOS.md` E-02.*

---

## Nomear o diferencial

A grade anti-buraco é invisível por natureza: ninguém observa o agendamento que **não**
virou buraco. Um diferencial invisível precisa de nome e de número.

**Nome de trabalho:** *agenda densa* / *grade que não deixa buraco*.
**Nunca usar:** "algoritmo", "inteligência artificial", "otimização", "engine".
O profissional não compra algoritmo. Ele compra "meu dia fecha sem sobra".

**Forma correta de dizer (concreta, sem número inventado):**
> "Se aceitar você às 14h30 deixar um vão de 20 minutos que não cabe nenhum serviço seu,
> aquele horário não aparece. Não é o sistema escondendo horário — é ele não vendendo um
> pedaço de dia que ia ficar parado."

**Forma proibida:**
> "Aumente sua ocupação em até 30%."
Nada foi medido. Número inventado queima o único ativo de tom que existe.

O suporte forte disso é a **Phase 6** do roadmap (o painel mostra ao profissional quantos
vãos invendáveis foram evitados). Quando ela fechar, o diferencial ganha número real e a
mensagem sobe de nível — está registrado em `BACKLOG.md` como gatilho.

---

## A diretriz criativa do owner: o produto entra de leve

Declarada em 2026-07-28 e incorporada como critério de aprovação (D-14):

> A peça precisa funcionar como conteúdo por mérito próprio, com o produto aparecendo de
> forma sutil.

Na prática: a cena é a estrela; o link resolve e sai de cena. **Peça que só faz sentido
como anúncio é peça reprovada.**

O risco desse formato é conhecido e está sendo medido (E-11 em `EXPERIMENTOS.md`): conteúdo
sutil costuma alcançar mais e converter menos. Por isso a contraprova do experimento não é
alcance, é comentário e DM de profissional do nicho — alcance sem intenção é vaidade cara.

---

## O que nunca dizer

Regras duras. Violação aqui não é questão de gosto, é dano.

1. **Nenhum número que não foi medido.** Sem "reduza faltas em X%", sem "economize N horas".
2. **Nenhum depoimento fabricado, ilustrativo ou "de exemplo".** Não existe cliente.
3. **Nenhum preço — e nenhum "grátis"** (D-13, que endurece a D-03). O valor no código está
   errado, e sem âncora de preço a peça precisa ganhar pela dor e pela demonstração, que é
   exatamente o que se quer descobrir nesta fase.
4. **Nenhuma promessa de recurso que não existe:** multi-profissional, pagamento pelo app,
   sinal/PIX antecipado, app nativo, cancelamento pelo próprio cliente (Phase 8, ainda não).
5. **Nunca omitir que WhatsApp automático é do plano Pro.** A landing é explícita nisso.
   Conteúdo que esconde cria a pior classe de decepção: a descoberta no cadastro.
6. **Nunca falar com o cliente final como se ele fosse nosso lead.** Ele é cliente do
   profissional. Fricção Zero é regra de arquitetura, e também de marketing.
7. **Nada de vocabulário corporativo:** plataforma, solução, gestão, otimizar, escalar,
   workflow, disruptivo, "transforme seu negócio".

---

## Tom, em uma regra

A landing já define: **cenas, não adjetivos.** Antes de publicar qualquer texto, o teste é
a pergunta do `texto-publico`: *isso parece template ou texto de IA?* Se a peça poderia
ter sido escrita para qualquer SaaS trocando o nome, ela está errada — mesmo que esteja
bem escrita.
