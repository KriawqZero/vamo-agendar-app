---
name: relatorio-socio
description: Use para gerar o relatório semanal do sócio e publicá-lo como Google Doc na pasta compartilhada do Drive (invocar com /relatorio-socio).
disable-model-invocation: true
---

# Relatório semanal do sócio

Gera o relatório semanal em PT-BR leigo para o sócio-investidor e publica como
Google Doc. **Cadência oficial: toda sexta-feira** (o `/diario-socio` lembra).
Este texto vai para o financiador do projeto — **nunca publicar sem aprovação
explícita**. Executar os passos na ordem.

## 1. Ler o estado atual

- Ler `docs/relatorios-socio/CONFIG.md`.
- Determinar o período: do dia seguinte a `ultimo_relatorio_semanal` até
  hoje. Se o valor for `(nunca)`, usar os últimos 7 dias.

## 2. Gerar o relatório

- Invocar o subagente **`relator-socio`** (Agent tool) com o prompt contendo:
  - `modo: semanal`
  - `período: de AAAA-MM-DD a AAAA-MM-DD` (o período do passo 1)
- A resposta é o relatório markdown completo: `# VamoAgendar — Semana DD a
  DD/MM`, `## Onde estamos rumo ao lançamento` (placar "X de Y passos
  críticos concluídos"), `## A semana, dia a dia`, `## Próximo marco`.

## 3. Gate de revisão — obrigatório, sem atalho

- Apresentar o texto completo do relatório ao usuário.
- Iterar até aprovação **explícita**. Silêncio, "parece bom" implícito ou
  passar para o próximo passo sem confirmação **não contam** — o texto vai
  para o financiador do projeto, peça a aprovação em palavras.
- Qualquer pedido de ajuste volta ao passo 2 ou é editado diretamente e
  reapresentado — nunca publicar a versão ainda não aprovada.

## 4. Preparar o Google Drive

- Garantir que as tools do MCP Google Drive estão carregadas: `ToolSearch`
  com `select:mcp__claude_ai_Google_Drive__create_file` (e demais tools do
  servidor que forem necessárias).
- Se `pasta_drive_id` no CONFIG for `(pendente)`: criar a pasta com
  `create_file`:
  - `title`: "VamoAgendar — Acompanhamento"
  - `mimeType`: `application/vnd.google-apps.folder`
  - sem conteúdo (nem `textContent` nem `base64Content`)
  - ⚠️ o schema da tool marca `mimeType` como depreciado em favor de
    `contentMimeType` — mas `contentMimeType` só se aplica "quando há
    conteúdo enviado", o que não é o caso de uma pasta vazia. Tentar
    `mimeType` primeiro (é o que a descrição da tool indica para criar
    pastas); se a chamada falhar ou for rejeitada, tentar
    `contentMimeType: application/vnd.google-apps.folder` sem conteúdo
    como alternativa antes de desistir.
  - Gravar o `id` retornado em `pasta_drive_id` no CONFIG.
  - Avisar o usuário que ele precisa compartilhar a pasta com o sócio
    manualmente no Drive — o MCP não gerencia permissões.

## 5. Criar o Google Doc

- Converter o relatório aprovado para **HTML simples** (`h1`/`h2`/`p`/`ul`/
  `strong` — sem CSS, sem tabelas complexas; a conversão HTML→Google Doc é a
  rota confiável).
- `create_file`:
  - `parentId`: o `pasta_drive_id` do CONFIG
  - `title`: "VamoAgendar — Semana DD a DD-MM" (datas do período do
    relatório)
  - `textContent`: o HTML montado acima
  - `contentMimeType`: `text/html`
  - A conversão para `application/vnd.google-apps.document` é automática —
    não passar `mimeType` nesta chamada.
- Guardar a `viewUrl` (ou campo equivalente de link) do arquivo retornado.

## 6. Salvar o histórico local

- Salvar o markdown aprovado em
  `docs/relatorios-socio/historico/AAAA-MM-DD.md` (data de hoje, geração do
  relatório).

## 7. Atualizar o CONFIG

- `ultimo_relatorio_semanal` = hoje (`AAAA-MM-DD`).
- Adicionar uma linha no **topo** da seção "Relatórios semanais publicados",
  no formato fixo documentado no próprio CONFIG:
  `- AAAA-MM-DD — [VamoAgendar — Semana DD a DD/MM](viewUrl)`

## 8. Mensagem pronta para o WhatsApp

- Entregar ao usuário uma mensagem curta (1–2 frases leigas + o link do
  doc), pronta para colar no WhatsApp do sócio.
- O texto precisa soar como o Marcilio escrevendo, não como template de IA
  (sem frases de efeito, sem entusiasmo artificial, sem estrutura
  previsível) — revisar antes de entregar.

## 9. Encadear com o painel

- Sugerir ao usuário rodar `/diario-socio` na sequência, para o painel
  passar a listar este novo relatório na seção "Relatórios semanais".
