# Prestação de contas ao sócio — como funciona

Criado em 2026-07-16. Sistema de comunicação de progresso do VamoAgendar para o
sócio-financiador (leigo em tecnologia), montado sobre o Claude Code. Este
documento explica o que existe, como usar e o que é de fato automático.

## O que o sócio recebe

Dois artefatos, com papéis diferentes:

1. **Painel de progresso** — página web com **link fixo** (ele salva uma vez e
   pronto), hospedada como Artifact no claude.ai. Mostra o placar "X de Y passos
   críticos concluídos" com a lista nomeada dos passos, as melhorias
   não-críticas que também entram antes do MVP, o dia a dia do projeto e os
   links dos relatórios semanais. Atualizada via `/diario-socio`.
2. **Relatório semanal** — um Google Doc novo **toda sexta-feira**, na pasta
   "VamoAgendar — Acompanhamento" do Drive, com a leitura da semana em
   linguagem de investidor: o que andou, onde estamos rumo ao lançamento e o
   próximo marco. Gerado via `/relatorio-socio`; o link vai pro sócio por
   WhatsApp.

Todo o conteúdo é derivado de duas fontes: o histórico do git (o que aconteceu,
dia a dia, em qualquer branch) e o `docs/PENDENCIAS.md` (o que falta e as
prioridades). Ninguém precisa "alimentar" a automação — trabalhar e commitar já
é alimentar.

## As peças

| Peça | Onde | Papel |
|---|---|---|
| Agente `relator-socio` | `.claude/agents/relator-socio.md` | Traduz git + PENDENCIAS para linguagem leiga de investidor (modo diário e modo semanal). Bash travado em `git log`/`git diff`. |
| Skill `/diario-socio` | `.claude/skills/diario-socio/SKILL.md` | Atualiza o painel com os dias trabalhados desde a última execução. |
| Skill `/relatorio-socio` | `.claude/skills/relatorio-socio/SKILL.md` | Gera o relatório da semana, publica o Google Doc e entrega a mensagem pro WhatsApp. |
| `CONFIG.md` | `docs/relatorios-socio/CONFIG.md` | Estado compartilhado: URL do painel, ID da pasta do Drive, datas, links publicados. |
| `painel.html` | `docs/relatorios-socio/painel.html` | Fonte versionada do painel (o que está publicado no link fixo). |
| `historico/` | `docs/relatorios-socio/historico/` | Markdown de cada relatório semanal aprovado. |

## Como usar

**Ao fim de um dia de trabalho (ou quando lembrar):**

```
/diario-socio
```

Levanta os dias desde a última atualização (dias esquecidos entram sozinhos —
nada se perde), mostra o preview das entradas novas, e após o teu ok republica
o painel **no mesmo link**. Rodar duas vezes no mesmo dia não duplica nada.

**Toda sexta-feira** (o próprio `/diario-socio` lembra):

```
/relatorio-socio
```

Gera o relatório da semana, apresenta o texto completo pra revisão — **nada é
publicado sem aprovação explícita** —, cria o Google Doc na pasta do Drive,
salva o histórico e entrega a mensagem pronta pra colar no WhatsApp do sócio.

## Isso é automatizado?

Resposta honesta: é **semi-automático por decisão de projeto**, não por
limitação preguiçosa.

- **Automático de verdade**: a coleta. O git registra tudo com data; qualquer
  execução reconstrói o período que faltar, então não existe "esqueci de anotar".
  A tradução pra linguagem leiga, a contagem do placar e a montagem de
  painel/doc/mensagem também são automáticas.
- **Manual de propósito**: o disparo (`/diario-socio`, `/relatorio-socio`) e a
  aprovação antes de publicar. O texto vai pro financiador do projeto — a regra
  é que nenhuma palavra chega nele sem revisão do Marcilio. Como a revisão já é
  manual, o disparo automático ganharia pouco.
- **Por que não tem cron**: o agendador interno do Claude Code morre com a
  sessão, e execuções sem supervisão não teriam quem aprovar o texto. Se um dia
  a disciplina de rodar falhar repetidamente, o upgrade natural é uma rotina
  agendada na nuvem que gera o rascunho e manda notificação push — está
  documentado como evolução, não implementado.

## Limitações conhecidas

- O conector do Google Drive **não atualiza nem apaga** arquivos — só cria. Por
  isso os docs semanais são imutáveis (um por semana) e o "conteúdo vivo" mora
  no painel, que suporta republicação no mesmo URL.
- O painel só atualiza dentro de uma sessão do Claude Code (o Artifact é
  ferramenta de sessão).
- A contagem do placar depende da estrutura do `PENDENCIAS.md` (seções 🔴 P0,
  🟠 Obrigatório antes do lançamento e 🟡 P1). Se a estrutura mudar muito, o
  `relator-socio` avisa em vez de chutar — mas vale conferir o placar no preview.
- Compartilhamento é manual e única vez: o painel pelo menu de share da própria
  página; a pasta do Drive pelo botão de compartilhar do Google.

## Registro de decisões

- Painel = Artifact (única forma de link fixo atualizável com as ferramentas
  atuais); Drive = docs imutáveis semanais. Decidido em 2026-07-16 após
  descobrir a limitação do conector.
- Cadência do relatório: **sexta-feira** (decisão de 2026-07-16).
- Ângulo do conteúdo: investidor ("está andando? o que falta pra lançar?"),
  nunca changelog técnico. Zero jargão é regra inegociável do `relator-socio`.
- O placar pode **crescer** (itens críticos novos entram na conta). O painel
  avisa isso explicitamente pro sócio não ler aumento de total como atraso.
