# `.marketing/` — central de marketing do VamoAgendar

Marketing aqui é premissa contínua, igual código. Esta pasta é a memória: nenhuma sessão
de marketing começa do zero, e nenhuma decisão vive só na conversa.

## Como operar (regra de continuidade)

**Ao começar qualquer sessão de marketing:**

1. Ler `DECISOES.md` — as decisões já tomadas e o que foi descartado e por quê.
2. Ler o último arquivo de `HISTORICO/` — onde a sessão anterior parou.
3. Ler `PLANO-PRE-LANCAMENTO.md` (estratégia) e `CALENDARIO.md` (o que era pra estar
   acontecendo agora).
4. Continuar de onde parou. **Não replanejar do zero.** Se a estratégia precisa mudar,
   isso vira uma decisão nova em `DECISOES.md`, com o motivo escrito.

**Ao terminar qualquer sessão de marketing:**

1. Criar `HISTORICO/AAAA-MM-DD-sessao-NN.md` — o que foi feito, o que foi aprendido,
   o que ficou aberto, qual é a próxima tarefa.
2. Registrar decisões novas em `DECISOES.md` (com data, alternativas descartadas, motivo).
3. Atualizar `BACKLOG.md` e `EXPERIMENTOS.md` com o que mudou de estado.
4. Se um número foi medido, ele entra em `METRICAS.md` — nunca só na conversa.

## Mapa dos arquivos

| Arquivo | O que é | Quando ler |
|---|---|---|
| `FABRICA.md` | **A fábrica de marketing com IA:** os 12 estágios do pipeline, cada um com entrada, saída, limites, rubrica, testes, custo, fallback e autonomia; custos e implementação em 8 fases | Antes de construir ou mexer no pipeline |
| `CONTEXTO.md` | Fatos do produto que o marketing precisa saber: estado real, restrições, ativos que já existem, buracos abertos | Sempre, antes de propor qualquer coisa |
| `POSICIONAMENTO.md` | Mensagem central, hierarquia de mensagem, o que nunca dizer | Antes de escrever qualquer copy |
| `PESQUISA.md` | ICP, hipóteses por validar, roteiro de entrevista, registro das conversas | Antes de afirmar qualquer coisa sobre o cliente |
| `PLANO-PRE-LANCAMENTO.md` | **A estratégia v2:** objetivos, métricas, canais, formatos, sistema de criativos, mídia paga, 30/60/90 e quem executa cada tarefa | Toda sessão |
| `CALENDARIO.md` | Organizado por **sessões**, não por semanas — as horas do owner são irregulares e semana sem sessão não é atraso | Toda sessão |
| `BACKLOG.md` | Fila priorizada (ICE) com estado de cada item | Toda sessão |
| `EXPERIMENTOS.md` | Hipótese → métrica → critério de corte. Um experimento sem critério de corte não é experimento | Ao iniciar ou encerrar um teste |
| `METRICAS.md` | O que medir, onde está instrumentado, e os números medidos até hoje | Ao avaliar se algo funcionou |
| `DECISOES.md` | Log de decisões de marketing (data, alternativas, motivo, reversibilidade) | Sempre, no começo |
| `HISTORICO/` | Diário de sessões | Sempre, a última |
| `ativos/` | Copy, roteiros e briefings prontos pra usar — inclui `brief-pagina-conversao.md`, que é a instrução para a sessão de código que vai construir a captura de interessados | Na hora de executar |

> **Estado em 2026-07-28:** a estratégia está na **v2**, reorientada pela D-12 — marketing
> é produção e distribuição de criativos, com uma fábrica de IA fazendo o trabalho braçal.
> A v1 (site, SEO, pesquisa como portão) está **congelada, não apagada**: continua correta
> e volta quando for a vez dela. O diagnóstico técnico da v1 segue válido e está em
> `CONTEXTO.md` e no `BACKLOG.md`.

O contexto compartilhado que **os marketing skills leem automaticamente** vive fora daqui,
em `.agents/product-marketing.md` (nome canônico exigido pelos skills). Este `README` e o
`CONTEXTO.md` complementam; não duplicam.

## O que esta pasta não é

Não é lugar de rascunho solto, nem de "ideias que talvez". Ideia sem dono e sem critério
vai pro `BACKLOG.md` com nota honesta de que está congelada, ou não entra. Volume aqui é
custo, não produto.
