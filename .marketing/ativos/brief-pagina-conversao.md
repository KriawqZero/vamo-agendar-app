# Briefing — página de conversão

**Para uma sessão dedicada de código.** Escrito em 2026-07-28 (D-15) porque o owner vai
executar isso em outra sessão e pediu instrução para não improvisar.

**Ler antes:** `.marketing/POSICIONAMENTO.md`, `DECISOES.md` (D-03, D-10, D-13, D-15, D-16)
e `.marketing/PLANO-PRE-LANCAMENTO.md`.

---

## O problema que ela resolve

Hoje quem chega pelo conteúdo não tem o que fazer. Não dá pra criar conta com segurança
(produto sem termos, sem checkout, sem e-mail transacional, rate limit ainda em no-op) e
não dá pra deixar contato. Cada visitante interessado é perdido em silêncio.

Enquanto ela não existir: a métrica norte é sinal de criativo, mídia paga não tem destino, e
as peças não podem usar "link na bio" como chamada.

---

## O que ela precisa ser

**Mecanismo: `<Waitlist />` do Clerk** (D-10, que continua válida — só estava congelada).
Disponível desde `@clerk/nextjs` 6.2.0; o projeto está no `^7.5.12`.

Por que não formulário próprio: sem tabela, sem migration, sem RLS, sem Server Action; o
e-mail de confirmação sai pela infra do Clerk, então **não depende da Phase 4** (Resend/DNS);
e o convite do go-live já vem pronto — aprovar no painel dispara.

**Escopo mínimo:**

1. Rota `/lista-de-espera` (pública) com o componente, no visual da landing
2. `isPublicRoute` em `src/proxy.ts` recebendo a rota
3. CTAs "Criar conta grátis" da landing e das 4 verticais apontando pra lá
4. Waitlist mode ativado no painel do Clerk — **ação do owner**
5. `afterJoinWaitlistUrl` → página de obrigado que dispara `waitlist_joined` no PostHog
6. Uma linha declarando o uso do dado ("só para te avisar quando abrir")

**Ganho colateral do Waitlist mode:** ele fecha o cadastro aberto. Hoje um estranho
consegue entrar num produto pela metade — e primeira impressão ruim queima o lead
permanentemente.

---

## Copy da página

Segue a hierarquia de `POSICIONAMENTO.md`: cena primeiro, promessa depois.

**Título:** `Sua agenda vai parar de morar no seu WhatsApp.`

**Subtítulo:**
`O VamoAgendar ainda não abriu. Deixa seu e-mail que eu te aviso — e quem entrar no começo
trava o preço de fundador, pra sempre.`

**Abaixo do formulário:**
`Sem spam. Só um e-mail quando abrir.`

**Guardrails que valem aqui:**
- **Nenhum valor e nenhum "grátis"** (D-13). "Preço de fundador" como condição, sem número
- Nada de contagem regressiva falsa nem "vagas limitadas" inventado — a janela de fundador
  vai até 02/02/2027 e isso é verdade suficiente
- Nenhum depoimento, nenhum número de usuário, nenhum logo

---

## Como saber que funcionou

- `waitlist_joined` chegando no PostHog com a UTM de origem preservada
- Funil `landing_viewed` → `waitlist_joined` montado, com breakdown por `nicho`
- Um teste ponta a ponta feito pelo owner: inscrever, aprovar no painel, receber o convite

---

## Efeitos no marketing quando ela subir

1. A métrica norte volta a ser **inscritos na fila** (D-06 sai do congelamento)
2. As peças ganham CTA de verdade — o adaptador por plataforma (`FABRICA.md` §8) libera
   "link na bio"
3. Mídia paga passa a ter destino, e a barra de promoção (D-16) vira acionável
4. Quem entra na fila vira fonte de pesquisa: uma pergunta pessoal a quem já levantou a mão
   converte muito mais que DM fria

---

## Fora de escopo

Termos de uso e política de privacidade (Phase 10 do roadmap), captura de WhatsApp, campo
de nicho no formulário, e qualquer automação de e-mail além do que o Clerk já faz.
