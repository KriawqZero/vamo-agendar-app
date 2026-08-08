# Prompt para o Claude — reorientar o marketing do VamoAgendar

Você está dentro do repositório do VamoAgendar e possui acesso ao contexto real
do produto, ao `.marketing/`, ao `.planning/`, ao código e às Marketing Skills
instaladas em `.agents/skills/`.

O plano de marketing atual tomou uma direção que o owner não quer. Sua tarefa é
diagnosticar essa divergência, entrevistar o owner com profundidade usando
`AskUserQuestion` e, somente depois de validar todas as decisões, reescrever a
central de marketing e desenhar o sistema de automação.

## Correção de direção do owner

O owner declarou:

> Não quero mexer no site agora. Quero trabalhar marketing de verdade:
> criativos, postagens, distribuição e talvez tráfego pago. Quero usar o máximo
> do poder das IAs para automatizar tudo que fizer sentido.

Consequências:

- não execute agora tarefas de site, SEO técnico, sitemap, robots, Cloudflare,
  Search Console, Clerk Waitlist ou mudanças no cadastro;
- não trate pesquisa manual, grupos, DMs frias ou testes manuais de concorrente
  como pré-condição obrigatória para começar a produzir marketing;
- não mantenha tráfego pago proibido apenas porque o plano v1 proibiu; reavalie
  com o owner, incluindo objetivo, orçamento, canal, conversão e risco;
- não assuma que conteúdo, formato, cadência, canal, CTA, aprovação ou nível de
  automação já estão decididos;
- Avantis está fora do escopo desta sessão. A automação dela será discutida
  separadamente.

Isso não significa apagar tudo. O `.marketing` contém pesquisa de produto,
posicionamento, restrições factuais e ativos úteis. Preserve o que continuar
verdadeiro e substitua somente decisões estratégicas revogadas.

## Antes de perguntar

Leia integralmente, nesta ordem:

1. `CLAUDE.md`;
2. `.marketing/README.md`;
3. `.marketing/DECISOES.md`;
4. o arquivo mais recente em `.marketing/HISTORICO/`;
5. `.marketing/CONTEXTO.md`;
6. `.marketing/POSICIONAMENTO.md`;
7. `.marketing/PLANO-PRE-LANCAMENTO.md`;
8. `.marketing/CALENDARIO.md`;
9. `.marketing/BACKLOG.md`;
10. `.marketing/EXPERIMENTOS.md`;
11. `.marketing/METRICAS.md`;
12. `.marketing/PESQUISA.md`;
13. todos os arquivos em `.marketing/ativos/`;
14. `.agents/product-marketing.md`;
15. `.planning/PROJECT.md`, `.planning/ROADMAP.md` e as pesquisas que sustentam
    as decisões atuais;
16. `src/lib/nichos.ts` e os ativos reais de demonstração do produto.

Rode `git status` antes de qualquer edição. O working tree já contém mudanças e
muitos arquivos de skills não rastreados. Preserve tudo; não limpe, não
reverta, não mova e não assuma autoria.

Faça também um inventário das Marketing Skills instaladas. Use as skills
relevantes — especialmente as de estratégia, conselho, conteúdo, social,
vídeo, criativos, mídia paga, analytics e attribution — mas não invoque skills
só para aumentar a contagem. O objetivo é profundidade, não desfile de nomes.

## Regra principal: entrevistar antes de redesenhar

Use `AskUserQuestion` extensivamente.

- Use o número máximo de perguntas permitido em cada chamada.
- Prefira escolhas concretas com descrição e trade-off.
- Inclua opção de resposta livre quando a decisão não couber nas alternativas.
- Faça múltiplas rodadas. Não tente resolver tudo numa chamada.
- Nunca substitua `AskUserQuestion` por um bloco de perguntas em texto quando a
  ferramenta estiver disponível.
- Após cada rodada, sintetize internamente as respostas, identifique
  contradições e use a rodada seguinte para aprofundá-las.
- Não repita perguntas respondidas pelos arquivos ou pelo owner.
- Não faça perguntas cosméticas. Pergunte apenas o que muda estratégia,
  automação, esforço, custo ou risco.

### Rodada 1 — objetivo e limites

Esclareça pelo menos:

- objetivo principal dos próximos 30, 60 e 90 dias;
- o que conta como sucesso antes do produto estar pronto;
- se o teto de 5h/semana continua válido;
- orçamento disponível para conteúdo, ferramentas e tráfego;
- quanto trabalho manual o owner aceita por semana;
- quais ações ele considera “manuais desnecessárias”;
- quais fatos e restrições do plano atual continuam inegociáveis;
- relação entre marketing e roadmap de código;
- se o foco é validação, audiência, lista, demanda, lançamento ou combinação.

### Rodada 2 — público, mensagem e oferta

Esclareça pelo menos:

- ICP inicial e ordem dos nichos;
- se “quem atende sozinho” continua sendo a categoria;
- qual dor deve abrir a comunicação;
- importância relativa de Fricção Zero e grade anti-buraco;
- o que pode ou não ser dito antes de haver cliente;
- quando e como falar de preço;
- oferta/conversão possível sem mexer no site;
- destino desejado de comentários, DMs e cliques;
- grau de aresta da marca;
- se o owner aceita comparar ou nomear concorrentes.

Não peça ao owner para redefinir fatos do produto. Separe preferência de
restrição técnica e jurídica.

### Rodada 3 — conteúdo e criativos

Esclareça pelo menos:

- canais prioritários;
- formatos desejados e indesejados;
- vídeo, carrossel, imagem, story, anúncio e conteúdo demonstrativo;
- uso de rosto, voz, avatar, captura de tela e elementos gerados por IA;
- volume e cadência;
- reaproveitamento entre plataformas;
- identidade visual;
- equilíbrio entre dor, demonstração, prova técnica, opinião, educação e
  oferta;
- tolerância a tendências e formatos nativos de plataforma;
- critérios subjetivos que fazem o owner aprovar ou rejeitar uma peça.

### Rodada 4 — automação e autonomia

Esclareça pelo menos:

- o que deve ser automatizado de ponta a ponta;
- o que sempre precisa de aprovação;
- se a IA pode agendar após aprovação;
- se publicação automática é desejada no futuro;
- se respostas a comentários e DMs serão só rascunhadas ou enviadas;
- necessidade de Telegram como mesa de aprovação;
- criação automática de pauta, roteiro, arte, vídeo, legenda, versões e
  distribuição;
- coleta automática de métricas;
- atualização automática de `.marketing/`;
- frequência de revisão humana;
- tolerância a custo de modelos e ferramentas;
- contas, APIs, tokens e permissões que o owner aceita conectar.

Separe claramente:

- automação reversível;
- ação pública;
- gasto;
- mensagem em nome do owner;
- mudança de estratégia.

### Rodada 5 — tráfego pago

Como o owner disse “talvez”, não presuma nem descarte. Esclareça:

- objetivo da mídia paga;
- orçamento de teste e limite de perda;
- Meta, TikTok ou ambos;
- anúncio para perfil, DM, formulário nativo ou página;
- público frio, remarketing ou lookalike;
- duração mínima do teste;
- critério de corte;
- definição de criativo vencedor;
- necessidade de pixel/evento versus experimento nativo sem site;
- quem aprova campanha, orçamento e alterações;
- se criativo precisa provar sinal orgânico antes de receber mídia.

Não gaste dinheiro, não crie campanha real e não solicite credenciais nesta
etapa.

### Rodada 6 — confirmação

Depois das rodadas anteriores:

1. apresente um resumo curto das decisões;
2. liste conflitos com D-01 a D-11 e com `.planning/PROJECT.md`;
3. diga quais decisões antigas precisam ser revogadas, preservadas ou adiadas;
4. apresente as principais alternativas de arquitetura;
5. use `AskUserQuestion` para obter confirmação final.

Não altere arquivos antes dessa confirmação.

## Depois da confirmação

Somente depois de o owner aprovar o resumo:

### 1. Atualize a memória de marketing

- `DECISOES.md` é append-only: decisões novas entram no topo com novos IDs e
  revogam explicitamente as antigas; nunca reescreva o passado.
- Crie um novo arquivo em `HISTORICO/`.
- Atualize `CONTEXTO.md`, `POSICIONAMENTO.md`, `PLANO-PRE-LANCAMENTO.md`,
  `CALENDARIO.md`, `BACKLOG.md`, `EXPERIMENTOS.md`, `METRICAS.md` e
  `.agents/product-marketing.md` apenas conforme as respostas.
- Marque tarefas de site/SEO/Waitlist como adiadas ou congeladas, não feitas e
  não apagadas.
- Preserve fatos, guardrails de veracidade e divergências reais do produto.

### 2. Escreva a estratégia v2

A estratégia deve cobrir, conforme decidido na entrevista:

- objetivos e métricas;
- público e mensagem;
- canais;
- formatos e cadência;
- sistema de criativos;
- distribuição orgânica;
- mídia paga como experimento, se aprovada;
- conversão sem mudança de site;
- aprendizado e atribuição;
- critérios de corte;
- plano de 30/60/90 dias;
- horas humanas previstas.

Não transforme o plano em uma nova lista de tarefas manuais. Para cada tarefa,
registre quem executa:

- IA;
- automação determinística;
- owner;
- ação externa que exige aprovação.

### 3. Desenhe a fábrica de marketing com IA

Use as Marketing Skills e proponha uma arquitetura baseada nas respostas, sem
presumir previamente quais agentes existirão.

Ela pode contemplar:

- pesquisa de mercado e concorrentes;
- observação de tendências;
- estratégia e pauta;
- roteiros;
- geração/produção de criativos;
- captura automatizada do produto;
- edição/render;
- adaptação por plataforma;
- crítica de clareza, autenticidade, veracidade e adequação nativa;
- mesa de aprovação;
- agendamento/publicação;
- coleta de métricas;
- síntese de aprendizado;
- alimentação da rodada seguinte.

Para cada agente ou etapa, defina:

- função;
- entrada;
- saída/schema;
- ferramentas;
- limites;
- exemplos;
- rubrica;
- testes;
- custo;
- falha e fallback;
- autonomia permitida.

Não chame “prompt maior” de treinamento. Treinamento aqui significa contexto,
exemplos bons/ruins, rubrica, avaliação e regressão.

### 4. Proponha implementação

Separe em fases:

1. documentação e decisões;
2. protótipo de criativos;
3. pipeline local;
4. entrega para aprovação;
5. integração com plataformas;
6. métricas;
7. mídia paga;
8. autonomia progressiva.

Em cada fase, registre:

- arquivos;
- dependências;
- permissões;
- risco;
- teste;
- aceite;
- rollback.

Não implemente mudança de código, conecte contas, publique, agende, envie DM ou
gaste dinheiro sem uma autorização específica posterior. Nesta sessão, a
implementação autorizada é a reorientação documental do `.marketing/` e o
desenho técnico detalhado da fábrica.

## Entrega esperada

Ao final, entregue em português:

1. o que o owner decidiu;
2. quais decisões antigas foram revogadas ou adiadas;
3. como ficou a estratégia v2;
4. o que será automatizado;
5. o que continuará humano e por quê;
6. arquitetura proposta;
7. plano de implementação;
8. riscos e custos;
9. arquivos alterados;
10. próxima ação concreta.

O resultado deve refletir o que o owner quer, não a preferência do plano
anterior e não a opinião de um assistente externo.

