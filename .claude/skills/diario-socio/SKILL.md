---
name: diario-socio
description: Use para atualizar o painel de progresso do sócio (página com link fixo) com os dias trabalhados desde a última atualização (invocar com /diario-socio).
disable-model-invocation: true
---

# Diário do sócio

Atualiza `docs/relatorios-socio/painel.html` — a página que o sócio-investidor
(leigo, sem vocabulário técnico) abre pelo link fixo para acompanhar o dia a dia
do projeto. Executar os passos **na ordem**.

## 1. Ler o estado atual

- Ler `docs/relatorios-socio/CONFIG.md`.
- Determinar o período do levantamento: do dia seguinte a
  `ultima_atualizacao_painel` até hoje. Se o valor for `(nunca)`, usar os
  últimos 7 dias.
- Se o início do período cair depois de hoje (painel já atualizado hoje),
  informar o usuário e encerrar aqui — não invocar o subagente.

## 2. Levantar os dias trabalhados

- Invocar o subagente **`relator-socio`** (Agent tool) com o prompt contendo:
  - `modo: diario`
  - `período: de AAAA-MM-DD a AAAA-MM-DD` (o período do passo 1)

## 3. Checar se há algo para publicar

- Se a resposta for exatamente `Nenhum dia trabalhado no período.`, informar o
  usuário e **encerrar aqui** sem tocar no painel nem no CONFIG.
- Nunca reprocessar um dia que já apareça no painel — o período do passo 1 já
  evita isso (começa no dia seguinte à última atualização), mas ao inserir as
  entradas no passo 4 confirme visualmente que nenhuma data bate com uma
  entrada já existente antes de escrever.

## 4. Montar ou atualizar o painel

Arquivo: `docs/relatorios-socio/painel.html`.

- **Se o arquivo não existir** (primeira execução): antes de escrever
  qualquer HTML, carregar as skills `artifact-design` e `dataviz` (tool
  Skill) para calibrar a página e a barra de progresso. Depois criar o
  arquivo seguindo a "Spec de design do painel" abaixo.
- **Se já existir**: ler o HTML atual e inserir as linhas novas retornadas
  pelo `relator-socio` no **topo** da seção "Últimas atualizações" (mais
  recente primeiro). Manter no máximo ~4 semanas de entradas visíveis —
  remover as mais antigas do fim da lista ao ultrapassar esse limite.
- Atualizar o placar "X de Y passos críticos concluídos" contando os itens
  de `docs/PENDENCIAS.md` pela **regra canônica** documentada na seção
  "Placar rumo ao lançamento" de `.claude/agents/relator-socio.md` (itens
  numerados de `## 🔴 P0` + subseções de `## 🟠 Obrigatório antes do
  lançamento público`; item parcialmente resolvido conta como pendente; na
  dúvida, pendente). Usar a mesma regra é obrigatório: o painel e o
  relatório semanal nunca podem mostrar placares diferentes. Não pedir esse
  número ao `relator-socio` em modo diário — não faz parte do contrato do
  modo.
- Atualizar a lista "Relatórios semanais" lendo a seção "Relatórios semanais
  publicados" do CONFIG (um link por linha, mais recente primeiro).
- Atualizar a data do rodapé para hoje (`DD/MM/AAAA`).

## 5. Gate de revisão — obrigatório

- Mostrar ao usuário um preview textual: as entradas novas que vão entrar no
  painel + o placar atualizado (X de Y).
- **Só publicar após aprovação explícita.** Pedido de ajuste não é aprovação
  — ajustar e mostrar de novo.

## 6. Publicar

- Tool Artifact: `file_path` = `docs/relatorios-socio/painel.html`, favicon
  `📈` (manter estável entre republicações — nunca trocar), `title`:
  "VamoAgendar — Progresso".
- Se `artifact_url` já existir no CONFIG, passar como `url` (mantém o link
  fixo que o sócio já tem salvo).
- Se `artifact_url` for `(pendente)`: publicar sem `url`, gravar a URL
  retornada em `artifact_url` no CONFIG, e avisar o usuário que o artifact
  nasce **privado** — ele precisa compartilhar o link com o sócio pelo
  claude.ai antes que o sócio consiga abri-lo.

## 7. Atualizar o estado

- Gravar `ultima_atualizacao_painel` = hoje (`AAAA-MM-DD`) em
  `docs/relatorios-socio/CONFIG.md`.

## 8. Lembrete do relatório semanal

- A cadência oficial do relatório semanal é **toda sexta-feira**. Se hoje for
  sexta e `ultimo_relatorio_semanal` tiver 4 dias ou mais (evita cobrar de
  novo quem gerou no meio da semana) — ou se o último relatório tiver mais
  de 7 dias em qualquer dia (sexta esquecida) — lembrar o usuário: "hoje é
  dia de rodar /relatorio-socio".

---

## Spec de design do painel

Página estática, HTML autocontido (o tool Artifact bloqueia recursos
externos — sem CDN, sem Google Fonts, sem fetch para fora).

- **Contrato do Artifact**: escrever apenas o conteúdo da página, com um
  `<title>` estável ("VamoAgendar — Progresso") — **sem** `<!DOCTYPE>`,
  `<html>`, `<head>` ou `<body>` próprios: o Artifact envolve o arquivo no
  esqueleto ao publicar. CSS/JS sempre inline.

- **Mobile-first**: o sócio abre no celular. Layout de coluna única,
  tipografia legível sem zoom, toques com área confortável.
- **Theme-aware**: suportar claro e escuro via `prefers-color-scheme` como
  padrão, com overrides explícitos `:root[data-theme="dark"]` /
  `:root[data-theme="light"]` (o toggle de tema do viewer estampa
  `data-theme` na raiz e precisa vencer nos dois sentidos).
- **Identidade visual oficial do VamoAgendar**: gradiente azul
  `#3DBAED → #3961D5` com roxo `#4219B0` como acento (cabeçalho, barra de
  progresso, destaques). Tipografia: font-stack com fallback —
  `Poppins, -apple-system, 'Segoe UI', sans-serif` — **nunca** link para
  Google Fonts (bloqueado pelo CSP do artifact).
- **Seções, nesta ordem**:
  1. Cabeçalho com o nome do produto.
  2. "Rumo ao lançamento" — placar "X de Y passos críticos concluídos" +
     barra de progresso + **lista nomeada dos passos críticos** em linguagem
     leiga, cada um com status visível (concluído / em andamento / a fazer),
     agrupados por status. Incluir nota fixa de que a lista pode ganhar
     itens novos conforme o projeto avança (o total muda — sinal de
     cuidado, não de atraso).
  3. "Também antes do lançamento" — as melhorias importantes não-críticas
     (seção `## 🟡 P1` do PENDENCIAS.md) que entram antes do MVP, mesma
     linguagem leiga, com status individual (item absorvido por um passo
     crítico é anotado como tal, não some).
  4. "Últimas atualizações" — dia a dia, mais recente primeiro.
  5. "Relatórios semanais" — lista de links pros Google Docs (lidos da
     seção "Relatórios semanais publicados" do CONFIG).
  6. Rodapé: "Atualizado em DD/MM/AAAA".
- **Manutenção das listas de passos** (a cada execução): reconciliar as
  seções 2 e 3 com o estado atual do PENDENCIAS.md — status que mudou,
  itens novos que surgiram nas seções 🔴/🟠/🟡 (entram na lista
  correspondente), itens absorvidos/reorganizados. A tradução leiga de um
  item novo segue as regras do `relator-socio` (zero jargão).
- **Regras de conteúdo, inegociáveis**:
  - Linguagem 100% leiga: zero jargão, zero siglas, zero nomes técnicos
    (nada de "RLS", "migration", "engine", "endpoint" — o `relator-socio`
    já entrega as linhas nesse tom; não reintroduzir termos técnicos ao
    montar o HTML).
  - **Nunca** incluir dados sensíveis: nomes de clientes, valores
    financeiros, detalhes de segurança/infraestrutura. A página pode virar
    pública por link — tratar como se já fosse.
