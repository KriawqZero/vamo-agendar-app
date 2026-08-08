# Estratégia de marketing — v2

**Versão:** v2 — 2026-07-28 (substitui a v1 do mesmo dia; a v1 vive no histórico)
**Horizonte:** 90 dias, com lançamento estimado em 4–8 semanas
**Decisões que a sustentam:** D-12 a D-19 em `DECISOES.md`

> A v1 assumiu um fundador com 5h/semana, orçamento zero e obrigação de validar mensagem
> antes de produzir. Nenhuma das três premissas era verdadeira. A v2 parte do que é:
> horas irregulares mas sem teto, orçamento acima de R$ 600/mês, lançamento perto, e
> vontade de automatizar o máximo possível.

---

## 1. Objetivo e métricas

**Objetivo dos 90 dias:** construir demanda e fila — chegar no lançamento com gente
querendo entrar, não com audiência genérica.

**Sucesso em 30 dias**, nas palavras do owner: conteúdo saindo sozinho, um criativo com
sinal claro, e lista crescendo — sendo que a lista depende da página de conversão (D-15).

### Métrica norte

**Sinal de criativo:** número de peças que batem a barra de promoção — desempenho ≥ 3× a
média do próprio perfil, ou ~10 mil visualizações orgânicas.

Não é seguidores. Não é alcance total. É a pergunta "alguma coisa que produzimos
funcionou de verdade?" — porque é ela que decide onde o dinheiro de mídia vai, e é o único
número que se converte diretamente em decisão.

Quando a página de conversão existir, a métrica norte volta a ser **inscritos na fila**
(D-06 sai do congelamento).

### Indicadores

| Indicador | Onde | Meta 30 dias |
|---|---|---|
| Peças publicadas | agendador | 20–30 |
| Peças acima da barra | agendador | ≥ 1 |
| Conversas geradas (DM + comentário de ICP) | manual | ≥ 10 |
| Lotes produzidos e aprovados | `fabrica/pecas/` | ≥ 2 |
| Horas humanas por lote | registro | ≤ 4h |
| Custo por peça publicada | `METRICAS.md` | linha de base |

**Custo por peça é indicador de primeira classe**, não contabilidade. É ele que diz se a
fábrica está economizando ou queimando dinheiro — e o item caro (geração de b-roll) é
cobrado por segundo.

---

## 2. Público e mensagem

Sem mudanças de fundo — a pesquisa da v1 continua válida e está em
`.agents/product-marketing.md` e `POSICIONAMENTO.md`.

**ICP:** profissional autônomo de beleza que atende sozinho, nacional (D-07).
**Categoria:** agenda para quem atende sozinho.
**Quatro nichos em produção:** barbeiro, manicure, lash designer, designer de sobrancelhas
— os mesmos que já têm landing e copy escrita em `src/lib/nichos.ts`. A métrica concentra
o esforço depois (D-14); ninguém escolhe agora.

**Guardrails de veracidade, inalterados e inegociáveis:**
nenhum número não medido · nenhum depoimento fabricado · nenhuma promessa de recurso
inexistente (multi-profissional, pagamento pelo app, sinal/PIX, app nativo) · nunca esconder
que WhatsApp automático é do plano Pro · **nenhum preço e nenhum "grátis"** (D-13).

---

## 3. Canais

Quatro, alimentados pela mesma peça vertical com adaptação por plataforma (D-14).

| Canal | Papel | Por quê |
|---|---|---|
| **TikTok** | laboratório | Melhor alcance orgânico frio e feedback em horas. É onde a barra de promoção vai ser batida primeiro, se for |
| **Instagram Reels** | casa | Onde o ICP mora e já recebe pedido de horário. Perfil `@vamoagendar` criado |
| **YouTube Shorts** | rastro | Custo marginal zero (mesma peça) e o único que deixa pegada pesquisável no Google depois |
| **Facebook** | público esquecido | Manicure e barbeiro de 30–50 anos vivem lá, é onde estão os grupos grandes, e a mídia paga é mais barata |

O agendador publica nos quatro a partir de um upload só. Sem ele, "quatro canais" viraria
quatro vezes o trabalho — e por isso ele é a única assinatura realmente estrutural.

---

## 4. Formatos e cadência

**Quatro tipos, em quota por lote** (a quota é o ponto de partida; a fábrica a ajusta
sozinha conforme o desempenho — D-18):

| Tipo | Quota inicial | O que é |
|---|---|---|
| **Dor encenada** | 40% | A conversa de WhatsApp que interrompe o atendimento. Roteiro já escrito por profissão em `nichos.ts` |
| **Demonstração** | 30% | Gravação de tela real: o link funcionando, o horário sumindo quando alguém confirma. Único ativo de prova que existe |
| **Utilidade** | 20% | Ajuda o profissional mesmo sem o produto (no-show, precificação, encaixe). Traz alcance e atrai quem nunca vai pagar — por isso não é maioria |
| **Opinião com aresta** | 10% | Posições que criam inimigo: "cobrar sinal não resolve no-show". Gera comentário, e comentário é o canal de contato enquanto não há página |

**Presença:** sem rosto. Tela + voz sintetizada PT-BR + b-roll (gerado ou captado pelo
owner). Sem avatar de IA falando.

**Cadência:** estoque em lote. Uma sessão produz 10–15 peças; aprovação em bloco no
Telegram; distribuição por 2–3 semanas. Sobrevive às semanas em que o owner não aparece —
que é a razão de existir.

**Diretriz criativa declarada pelo owner:** a peça precisa funcionar como conteúdo por
mérito próprio, com o produto aparecendo de forma sutil. Peça que só faz sentido como
anúncio é peça reprovada.

---

## 5. Sistema de criativos

Arquitetura completa em `FABRICA.md`. Em uma frase: **o owner fornece matéria-prima bruta
e julgamento; a fábrica faz o resto.**

O que o owner faz: grava clipes soltos no celular quando quiser (mãos, rua, tesoura,
celular na bancada), e aprova ou rejeita peças no Telegram.
O que ele nunca faz: cortar vídeo, escrever legenda, escolher hashtag, redimensionar,
montar, narrar.

---

## 6. Distribuição orgânica

Um upload por peça no agendador → quatro canais. Legenda, hashtags e primeiro comentário
adaptados por plataforma pela fábrica.

Comentários e DMs continuam **100% manuais** por ora — decisão consciente de adiar (o owner
preferiu não integrar Instagram ainda). É a maior dívida operacional do plano: comentário
respondido em 20 minutos vale muito mais que em 6 horas, e hoje ninguém garante os 20
minutos. Entra na fase 8 da implementação.

---

## 7. Mídia paga

**Agora:** R$ 5–10/dia, teto de R$ 300/mês, com uma finalidade só — o owner aprender a
operar o gerenciador antes de precisar dele. Exceção registrada no `.planning/PROJECT.md`
(D-16).

**Verba real:** liberada quando uma peça bater a barra (≥ 3× a média própria **ou** ~10 mil
views orgânicas). Aí o dinheiro vai em cima de algo que já provou, e a taxa de queima cai
para perto de zero.

**Nunca antes:** anunciar sem destino de conversão é comprar visita para uma página onde
não há o que fazer.

---

## 8. Conversão

Enquanto não houver página (D-15), o conteúdo constrói **alcance e conversa**, não lista.
A perda é real e foi aceita conscientemente.

O briefing da página está escrito em `ativos/brief-pagina-conversao.md` para ser executado
numa sessão dedicada — possivelmente nos próximos dias. Quando ela existir:
a métrica norte volta a ser inscritos na fila, a mídia paga ganha destino, e o CTA das
peças muda de "me chama" para "entra na lista".

---

## 9. Aprendizado e atribuição

Toda peça carrega UTM (`utm_source`, `utm_campaign=organico|pago`, `utm_content=<id da
peça>`), o que preserva a atribuição no PostHog, que já anexa UTMs iniciais à pessoa.

A fábrica coleta os números pelo agendador, escreve a síntese em `METRICAS.md` e **ajusta a
quota do lote seguinte sozinha** (D-18) — mais do que puxou, menos do que não puxou.
Autonomia limitada a quota: trocar nicho, canal, tipo de conteúdo ou posicionamento
continua sendo decisão humana registrada em `DECISOES.md`.

---

## 10. Critérios de corte

Escritos antes de começar, porque depois vira opinião.

| Situação | Corte |
|---|---|
| 30 peças publicadas e nenhuma acima da barra | A mensagem ou o formato estão errados. Parar de produzir volume e voltar ao posicionamento |
| Um tipo de conteúdo com desempenho consistentemente pior em 2 lotes | Sai da quota. A fábrica faz isso sozinha (D-18) |
| Um canal sem tração após 6 semanas | Continua recebendo a peça (custo marginal zero pelo agendador), mas sai do relatório e da análise |
| Custo por peça acima de R$ 25 | Reduzir geração de b-roll e aumentar captação própria e gravação de tela |
| Lote consumindo mais de 4h humanas | A fábrica está mal desenhada. Consertar antes de produzir o próximo |
| Nenhum lote produzido em 3 semanas | O sistema não coube na vida real. Simplificar, não insistir |

---

## 11. Plano de 30 / 60 / 90 dias

### Dias 1–30 — a fábrica existir e girar

Construir o pipeline, produzir e publicar os dois primeiros lotes, assinar as ferramentas,
e — em sessão dedicada — a página de conversão.
**Sucesso:** 20–30 peças no ar, 2 lotes aprovados, custo por peça conhecido.

### Dias 31–60 — achar o que puxa

Terceiro e quarto lotes já com quota ajustada pelo desempenho. A barra de promoção sendo
perseguida de propósito. Primeiro teste de mídia (aprendizado). Página de conversão no ar,
métrica norte voltando a ser fila.
**Sucesso:** ≥ 1 peça acima da barra, nicho vencedor aparecendo no dado.

### Dias 61–90 — concentrar e monetizar o aprendizado

Produção concentrada no que venceu. Mídia paga real em cima das peças que provaram.
Lançamento acontecendo dentro dessa janela — o conteúdo passa a ter destino comercial.
**Sucesso:** fila com gente real, e um criativo pago com custo por interessado conhecido.

---

## 12. Quem executa o quê

Regra da v2: nenhuma tarefa entra no plano sem dono explícito.

| Tarefa | Executor |
|---|---|
| Pauta do lote, roteiros, legendas, hashtags | **IA** |
| Narração, b-roll gerado, imagens | **IA** (via APIs pagas) |
| Gravação de tela do produto | **Automação determinística** |
| Montagem, corte, adaptação por plataforma | **Automação determinística** (`ffmpeg`) |
| Crítica de veracidade, autenticidade e natividade | **IA** (rubrica em `FABRICA.md`) |
| Coleta de métricas e síntese | **IA + automação** |
| Ajuste de quota do próximo lote | **IA, autônoma** (D-18) |
| Captação de clipes brutos no celular | **Owner** |
| Aprovação do lote | **Owner** (Telegram) |
| Upload no agendador | **Owner** (~10 min/lote) |
| Resposta a comentários e DMs | **Owner** (adiado para automação) |
| Assinar ferramentas, criar contas de anúncio, gastar | **Owner** |
| Mudança de estratégia, canal, nicho ou posicionamento | **Owner**, registrada em `DECISOES.md` |

**Horas humanas previstas:** ~4h para produzir e aprovar um lote de 10–15 peças, mais
~10 min de upload. Dois lotes por mês = **~9h/mês**. O resto do tempo do owner continua no
código.
