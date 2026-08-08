# Decisões de marketing

Log append-only. Decisão nova vai no topo. **Nunca reescrever decisão antiga** — se ela
mudou, entra uma nova revogando a anterior, com o motivo.

Formato: `D-NN · data · decisão · alternativas descartadas · motivo · reversibilidade`

---

## D-20 · 2026-07-28 · Trilha é a nativa da plataforma, escolhida no upload

**Decisão:** a fábrica **não** produz nem licencia música. A peça sai com os toques de
mensagem sintetizados e silêncio no resto; a trilha entra no app da plataforma, na hora de
publicar.

**Descartado:** gerar música por IA; baixar trilha "livre de direitos" de origem duvidosa;
assinar biblioteca de música.

**Motivo:** áudio nativo do TikTok e do Instagram é gratuito, já licenciado, e é **sinal de
distribuição** — subir um MP3 próprio joga fora esse sinal e ainda cria risco de direito
autoral. A escolha certa é literalmente um toque na tela no momento do upload.

**Consequência:** economiza uma linha inteira de custo e uma classe de risco jurídico. E
transfere um passo de 10 segundos para o owner, que já vai estar no app publicando.

---

## D-19 · 2026-07-28 · A fábrica é pipeline local em código, não workflow visual

**Decisão:** scripts versionados no repositório + `ffmpeg` + Claude Code como cérebro,
rodando na máquina do owner sob comando.

**Descartado:** n8n (disponível por MCP e tecnicamente viável); gatilho agendado autônomo.

**Motivo:** é a stack onde o owner tem experiência, e isso é gestão de risco, não gosto.
Workflow visual quebra em silêncio e se debuga mal; pipeline em código é versionado,
testável, e roda igual daqui a seis meses. O gatilho agendado foi descartado por ora
porque a produção depende de matéria-prima que só o owner fornece (gravação bruta) — uma
fábrica que dispara sozinha sem insumo produz lote vazio.

**Reversível:** sim. Se a operação virar rotina, o gatilho agendado entra depois.

---

## D-18 · 2026-07-28 · Métricas automáticas com autonomia para ajustar a pauta

**Decisão:** a fábrica coleta os números pelo agendador, sintetiza em `METRICAS.md` e
**já altera a pauta do lote seguinte** — mais do que puxou, menos do que não puxou — sem
perguntar ao owner.

**Motivo:** é o único ponto do sistema em que autonomia total é barata e reversível. Errar
a pauta de um lote custa um lote; a peça ainda passa pela aprovação humana antes de existir
publicamente. Autonomia aqui compra a coisa mais valiosa para quem tem horas irregulares:
o sistema não para de aprender nas semanas em que o owner some.

**Limite duro:** ajustar pauta ≠ mudar estratégia. Trocar nicho de foco, canal, tipo de
conteúdo ou posicionamento continua exigindo decisão humana registrada aqui.

---

## D-17 · 2026-07-28 · Aprovação por Telegram; publicação manual via agendador

**Decisão:** a fábrica entrega o lote pronto e o submete à aprovação num bot de Telegram.
Aprovado, o arquivo fica pronto numa pasta e **o owner sobe manualmente** no agendador
(Metricool/Buffer ou similar), que distribui para os quatro canais.

**Descartado:** publicação automática por API; IA publicando dentro de regras.

**Motivo:** publicar é ação pública e irreversível, e as APIs nativas de Instagram e TikTok
exigem conta business e revisão de app — semanas de trabalho para automatizar o passo mais
barato do processo. O agendador resolve o "postar quatro vezes" com um upload só, que é 90%
do ganho por 10% do custo.

**Custo aceito:** ~10 minutos de trabalho humano por lote.

**Reversível:** sim, e o caminho está desenhado — publicação automática entra na fase 8 da
implementação, se e quando o owner quiser.

---

## D-16 · 2026-07-28 · Mídia paga: exceção de aprendizado registrada, verba real só com barra

**Decisão em duas partes:**

1. **Agora:** R$ 5–10/dia (teto de R$ 300/mês) exclusivamente para o owner aprender a
   operar o gerenciador de anúncios antes de precisar dele. É gasto de treinamento, não
   canal de aquisição.
2. **Verba real:** só depois que um criativo provar sinal orgânico. **Barra dupla, basta
   uma:** desempenho ≥ 3× a média das peças do próprio perfil, **ou** ~10 mil
   visualizações orgânicas numa peça.

**Conflito resolvido:** o `.planning/PROJECT.md` lista tráfego pago em *Out of Scope*
("mídia paga só depois que o funil mostrar conversão"). A exceção de aprendizado foi
**escrita lá**, separada de "tráfego pago como canal", para documentação e realidade não
divergirem — foi exatamente essa divergência que produziu o problema do preço na landing.

**Alvo criativo declarado pelo owner:** peça que funciona como conteúdo por mérito próprio,
com o produto aparecendo de forma sutil. Isso é diretriz de criação, não de mídia — está
em `POSICIONAMENTO.md`.

---

## D-15 · 2026-07-28 · A página de conversão entra em sessão própria, com briefing escrito

**Decisão:** não se mexe no site nesta sessão. A página que recebe a demanda é trabalho de
uma sessão dedicada, possivelmente já nos próximos dias, guiada por
`ativos/brief-pagina-conversao.md`.

**Motivo:** "construir fila" sem lugar onde a fila exista é contradição — e o owner
reconheceu isso, pedindo instrução escrita para executar direito depois em vez de improvisar
agora. Enquanto ela não existir, o conteúdo constrói alcance e conversa, não lista.

**Consequência assumida:** as primeiras semanas de conteúdo não capturam contato. É perda
real e aceita conscientemente, não descuido.

---

## D-14 · 2026-07-28 · Sistema de criativos: quatro canais, quatro tipos, estoque em lote

**Canais:** Instagram (Reels), TikTok, YouTube Shorts e Facebook (página + Reels) — os
quatro, alimentados pela mesma peça vertical, com adaptação por plataforma.

**Tipos de conteúdo:** dor encenada · demonstração do produto · utilidade para o nicho ·
opinião com aresta. **Revoga D-05** (um formato só, repetido).

**Presença humana:** sem rosto (D-04 preservada), com três fontes de imagem — gravação de
tela do produto, **captação própria do owner** (mãos, cidade, quarto, objetos; sem
aparecer) e b-roll gerado por IA. Narração em voz sintetizada PT-BR. Descartado avatar de
IA falando: nesse nicho tem alto risco de leitura de golpe e colide com o tom honesto, que
é o único ativo de marca que existe hoje.

**Edição:** determinística, por `ffmpeg`, dentro da fábrica. **"Não sei editar" deixa de
ser restrição** — o owner fornece matéria-prima bruta, nunca corta nada.

**Cadência:** estoque em lote. Uma sessão produz 10–15 peças, aprovadas em bloco, que saem
distribuídas por 2–3 semanas. Escolhido porque as horas do owner são irregulares (semanas
de zero, dias inteiros) e cadência diária morreria na primeira semana ausente.

**Nicho:** produzir para os quatro que já têm landing (barbeiro, manicure, lash designer,
designer de sobrancelhas) e deixar a métrica concentrar o esforço, em vez de escolher agora.

---

## D-13 · 2026-07-28 · Comunicação sem preço e sem "grátis" (endurece D-03)

**Decisão:** nenhuma peça cita valor **nem menciona plano gratuito**.

**Motivo:** D-03 já proibia valor porque o código mostra R$ 14,90 e a decisão é R$ 39,90.
O owner estendeu para "grátis" também. O ganho é maior do que parece: sem âncora de preço,
a peça precisa ganhar pela dor e pela demonstração — que é exatamente o que se quer
descobrir nesta fase. Preço entra quando houver o que vender e onde comprar.

---

## D-12 · 2026-07-28 · Reorientação estratégica — marketing vira produção e distribuição

**Decisão do owner, que redefine a v1 inteira:**

> "Não quero mexer no site agora. Quero trabalhar marketing de verdade: criativos,
> postagens, distribuição e talvez tráfego pago. Quero usar o máximo do poder das IAs
> para automatizar tudo que fizer sentido."

**Contexto novo que a v1 não tinha:** lançamento estimado em **4–8 semanas**, orçamento
**acima de R$ 600/mês**, horas do owner **irregulares e sem teto**, e disposição para
automação agressiva.

**Revoga:**

| Decisão | Por que caiu |
|---|---|
| **D-01** teto de 5h/semana | As horas são irregulares por natureza — às vezes zero, às vezes um dia inteiro. Um teto semanal não descreve a realidade e induzia um plano pequeno demais |
| **D-02** pesquisa antes de aquisição | A pesquisa deixa de ser portão e vira subproduto: comentário e DM gerados pelo conteúdo entregam fala verbatim sem depender de abordagem fria |
| **D-05** um formato só, repetido | Substituída pelo sistema de quatro tipos da D-14 |
| **D-06** métrica norte = lista de fundadores | Sem página de conversão (D-15), a métrica norte muda para sinal de criativo. Volta a valer quando a página existir |
| **D-11** meta de 6 conversas por DM fria | O conteúdo passa a ser o canal de contato. DM fria sai do caminho crítico |

**Preserva:** D-03 (endurecida pela D-13), D-04 (sem rosto), D-07 (ICP nacional),
D-08 (perfil de marca), e todos os guardrails de veracidade — nenhum número não medido,
nenhum depoimento fabricado, nenhuma promessa de recurso inexistente.

**Congela a execução, sem revogar:** D-09 (liberar crawlers de IA no Cloudflare) e
D-10 (Clerk Waitlist). Continuam corretas; são tarefas de site, e site não é esta sessão.

---

## D-11 · 2026-07-28 · ~~Pesquisa 100% remota~~ — REVOGADA pela D-12 · Pesquisa 100% remota — e a lista de espera vira o canal principal dela

**Decisão do owner:** sem pesquisa presencial. Nada de "ser cliente".

**Consequência honesta, e ela é grande:** DM fria converte 5–15% em resposta e menos ainda
em conversa. Dez conversas por DM pura exigem 100–150 abordagens, o que a 15/semana leva
**dois meses e meio**, não quatro semanas. Manter a meta de 10 conversas no Ato 1 sem
mudar o método seria planejar para fracassar.

**Redesenho:** a pesquisa deixa de depender só de abordagem fria e passa a ter três
entradas, da mais quente para a mais fria:

1. **Quem entrar na lista de espera** — pessoa que já levantou a mão. Mensagem pessoal de
   uma pergunta só ("antes de te avisar, me conta: como você marca horário hoje?").
   Taxa de resposta incomparavelmente maior que DM fria, porque o interesse já existe.
   **Esta vira a fonte primária.**
2. **DM fria** — continua, com o pedido reduzido: em vez de "me dá 15 minutos", *"me
   responde uma coisa"*. Áudio conta como conversa.
3. **Leitura de comunidade** — grupos de Facebook/WhatsApp do nicho, só observando.
   Não gera conversa, gera **fala verbatim**, que é metade do que a pesquisa existe para
   produzir. Custo zero e assíncrono.

**Meta revisada do Ato 1:** 6 conversas (não 10) + 30 falas verbatim colhidas de
comunidade. As outras 4 conversas migram para o Ato 2, alimentadas pela lista de espera.

**Reversível:** sim. Se em 6 semanas a lista de espera não trouxer conversa, revisitar.

---

## D-10 · 2026-07-28 · Lista de espera pelo Clerk Waitlist, não por formulário próprio

**Decisão:** usar o `<Waitlist />` do Clerk e ativar o **Waitlist mode** no painel, em vez
de construir captura própria de e-mail ou WhatsApp.

**Descartado:** campo de WhatsApp próprio com tabela no Supabase; campo de e-mail próprio.

**Motivo (a proposta veio do owner e é melhor que a minha):**

1. **Zero código de backend.** Sem tabela, sem migration, sem RLS, sem Server Action. Num
   orçamento de 5h/semana, isso é a diferença entre existir esta semana e existir em três.
2. **Não depende da Phase 4.** O Clerk envia o e-mail de confirmação com a infra dele —
   a captura funciona antes do Resend, do DNS e do SPF/DKIM estarem de pé.
3. **O convite do go-live já vem pronto.** Aprovar no painel dispara o convite. Sem isso,
   a lista viraria uma planilha e o convite seria trabalho manual no pior dia possível.
4. **Waitlist mode fecha o cadastro — e isso é um ganho, não um efeito colateral.** Hoje
   um estranho consegue criar conta e usar um produto sem termos de uso, sem checkout, sem
   e-mail transacional e com o rate limit ainda em no-op (`STATE.md`: ABU-01/02/03 abertos
   sem as vars do Upstash). Deixar entrar agora não é generosidade — é queimar o lead
   permanentemente com uma primeira impressão de produto pela metade.
5. É infraestrutura já paga.

**Custo aceito:** captura **só e-mail**. Sem WhatsApp, que teria taxa de preenchimento
maior nesse público. Contra-argumento que fecha a questão: o Clerk exige e-mail para
autenticar de qualquer forma, então e-mail é o dado de que você realmente precisa — e
quem não digita um e-mail para garantir preço vitalício não era lead sério.

**Atribuição por nicho não se perde:** o `posthog-js` já anexa as UTMs iniciais à pessoa.
Com todo link carregando `utm_content=<nicho>`, dá para saber de qual vertical veio cada
inscrito sem tocar no Clerk.

**Trabalho que sobra (pequeno):**
- Rota `/lista-de-espera` com o `<Waitlist />`
- Trocar os CTAs "Criar conta grátis" da landing e das 4 verticais para lá
- Adicionar a rota a `isPublicRoute` em `src/proxy.ts`
- `afterJoinWaitlistUrl` → página de obrigado que dispara `waitlist_joined` no PostHog
- Ativar Waitlist mode no painel do Clerk (**ação do owner**)

**Reversível:** sim — desativar o modo no painel devolve o cadastro aberto.

---

## D-09 · 2026-07-28 · Liberação total para crawlers de IA

**Decisão do owner:** liberar `GPTBot`, `ClaudeBot`, `Google-Extended`, `CCBot`,
`PerplexityBot` e demais agentes de IA.

**Descartado:** manter o bloqueio default do Cloudflare.

**Motivo:** produto novo, sem marca e sem backlink não tem o que proteger — tem o que ser
descoberto. Uma fatia crescente da busca por software passa por assistente ("qual sistema
de agendamento pra manicure que não pede cadastro do cliente?"), e essa pergunta é
exatamente a que o VamoAgendar responde melhor que os concorrentes. Ceder esse canal para
proteger copy que ninguém ainda leu é trocar visibilidade por nada.

**Custo aceito:** a copy das landings entra em base de treino de modelo.

**Execução (duas partes, e a segunda sozinha não funciona):**
1. **Painel Cloudflare** — desligar o `robots.txt` gerenciado / AI Crawl Control. É ele
   que serve hoje o bloco `# BEGIN Cloudflare Managed content` com os `Disallow`.
   **Ação do owner, não tem como fazer por código.**
2. **`src/app/robots.ts`** — robots próprio do projeto, `Allow: /` para todos, apontando
   para o sitemap. Entra junto do M-01.

**Reversível:** sim, a qualquer momento pelos dois mesmos lugares.

---

## D-08 · 2026-07-28 · Perfil de marca `@vamoagendar` (Instagram criado)

**Decisão do owner:** conta de marca, não pessoal. Instagram já criado.

**Motivo:** coerente com D-04 (sem rosto). Conta pessoal sem rosto e sem histórico não
constrói nada; conta de marca é o recipiente natural de um formato repetido (D-05).

**Pendente:** criar o TikTok com o mesmo handle antes que alguém pegue.

---

## D-07 · 2026-07-28 · ICP é nacional; a pesquisa presencial é local

**Decisão do owner:** o público-alvo são profissionais do Brasil inteiro, não de uma cidade.

**Consequência — e ela não é a que parece:** isso vale para **aquisição** (SEO, Instagram e
TikTok já são nacionais por natureza; nada muda). Não vale para **pesquisa**. As conversas
presenciais continuam sendo onde o owner mora, porque a variável que importa ali é ter 30
minutos de atenção de um profissional relaxado — e isso não escala nem precisa escalar. Dez
conversas não são amostra estatística de nada; são o antídoto contra escrever copy no
escuro. Um barbeiro que atende sozinho em Campo Grande e um em Recife respondem à mesma
mensagem no direct pelo mesmo motivo.

**Efeito colateral bom:** as landings verticais deixam de ter razão para ganhar eixo de
cidade tão cedo (M-15 segue congelado, agora com motivo mais forte).

---

## D-06 · 2026-07-28 · A métrica norte é lista de fundadores, não seguidores

**Decisão:** o sucesso do pré-lançamento é medido por profissionais que levantaram a mão,
não por audiência.

**Descartado:** meta de seguidores; meta de alcance; meta de visitas.

**Motivo:** seguidor no nicho de beleza é comprado com conteúdo genérico de utilidade
("5 dicas para sua unha durar mais") e não tem correlação com quem paga por software de
agenda. Perseguir audiência levaria o conteúdo exatamente para o lugar errado — e o
conteúdo errado é mais caro que conteúdo nenhum, porque consome as horas que não existem.

**Reversível:** sim, mas só com evidência de que audiência genérica converteu.

---

## D-05 · 2026-07-28 · Um formato de vídeo só, repetido

**Decisão:** todo conteúdo de vídeo usa o formato *"a conversa que não precisa existir"*,
derivado das conversas de dor já escritas em `src/lib/nichos.ts`.

**Descartado:** variedade de formatos; carrossel educativo; stories diários; trends.

**Motivo:** com 1,5h/semana, a variedade destrói a única vantagem disponível — a
repetição. Publicar um formato 30 vezes ensina qual dor puxa; publicar 30 formatos uma vez
não ensina nada. E o roteiro já existe escrito com precisão de profissão, o que elimina o
custo mais alto da produção de conteúdo.

**Reversível:** sim, se E-01 mostrar retenção abaixo de 30% nos três braços.

---

## D-04 · 2026-07-28 · Conteúdo sem rosto, voz off opcional

**Decisão do owner.** Nada de rosto em vídeo; voz off é aceitável.

**Motivo do owner:** startup 100% digital, operada por uma pessoa, sem lugar físico e sem
equipe para mostrar.

**Leitura de marketing:** a decisão é boa por um motivo adicional — neste nicho a estrela
do conteúdo é a dor do profissional e o produto funcionando, não o fundador. Conta sem
rosto é norma no segmento de beleza. O que substitui o rosto é **consistência de formato**
(ver D-05), não carisma.

**Reversível:** sim, decisão pessoal do owner.

---

## D-03 · 2026-07-28 · Nenhuma peça de marketing cita preço até a Phase 7 fechar

**Decisão:** proibido citar valor em qualquer peça pública.

**Motivo:** o código e a landing ainda mostram Plus R$ 9,90 e Pro R$ 14,90 com selo
"-50%". A decisão registrada em `.planning/PROJECT.md` extingue o Plus e leva o Pro a
R$ 39,90, com R$ 29,90 travado vitaliciamente para quem assinar até 02/02/2027. Divulgar
o preço atual é prometer um número que vai mudar — e o único ativo de tom que o produto
tem é a honestidade da copy.

**Consequência:** a lista de fundadores pode falar de *"preço travado de fundador"* como
condição, sem citar o valor, até a Phase 7 fechar.

**Reversível:** automaticamente, quando a Phase 7 fechar.

---

## D-02 · 2026-07-28 · Pesquisa antes de aquisição

**Decisão:** as primeiras semanas são de conversa com profissionais reais, não de campanha.

**Descartado:** começar publicando imediatamente; rodar anúncio de teste; lançar landing
de captura antes de falar com alguém.

**Motivo:** com zero rede e zero cliente, toda mensagem é hipótese. Publicar mensagem não
validada gasta o recurso mais escasso (horas do fundador) produzindo assets que vão
precisar ser refeitos. E `.agents/product-marketing.md` tem a seção de fala verbatim
declarada **vazia de propósito** — inventar depoimento é a linha que não se cruza.

**Reversível:** não durante o Ato 1. É o critério de passagem.

---

## D-01 · 2026-07-28 · Teto de 5 horas semanais para marketing

**Decisão:** todo o plano de marketing cabe em ~5h/semana. Se estourar, corta-se marketing,
não código.

**Descartado:** plano de marketing "adequado ao potencial do produto".

**Motivo:** as 4–5h/dia disponíveis já pertencem ao roadmap de lançamento, que está na
fase 3 de 12. Marketing que atrasa o produto é marketing ruim — e a barra de segurança do
lançamento (hardening, anti-abuso, jurídico) não é negociável por causa de um calendário
editorial.

**Reversível:** sim, quando o roadmap de código fechar.

---

## Decisões pendentes (bloqueiam ou vão bloquear)

*Escritas em português claro de propósito: jargão de marketing aqui já causou confusão uma vez.*

| # | Decisão | Quem decide | O que trava |
|---|---|---|---|
| ~~P-01~~ | ~~Cidade-base~~ | — | ✅ resolvida em D-07 |
| ~~P-02~~ | ~~Marca ou pessoal~~ | — | ✅ resolvida em D-08 |
| ~~P-03~~ | ~~Captura de interesse na landing~~ | — | ✅ resolvida em D-10 (Clerk Waitlist) |
| ~~P-04~~ | ~~Pesquisa presencial paga~~ | — | ✅ resolvida em D-11 (não; pesquisa 100% remota) |
| P-05 | **Quantos profissionais ativar por semana no lançamento.** O WhatsApp do produto roda em Evolution API (biblioteca não-oficial). Vários números novos disparando mensagem automática na mesma semana é o padrão que o WhatsApp usa pra identificar spam, e o banimento costuma ser permanente. Ativar 20 de uma vez pode banir metade e derrubar a proposta de valor do Pro | owner + técnico | Só o Ato 3 — pode ficar parada por ora |
| ~~P-06~~ | ~~Crawlers de IA~~ | — | ✅ resolvida em D-09 (liberação total) |
