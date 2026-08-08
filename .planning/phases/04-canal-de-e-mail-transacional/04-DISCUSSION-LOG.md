# Phase 4: Canal de e-mail transacional - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-07
**Phase:** 04-canal-de-e-mail-transacional
**Areas discussed:** Endereço do profissional, Gatilho do boas-vindas, Supressão de bounce, Como o HTML é feito

**Nota de forma:** o owner pediu, na seleção das áreas, que as perguntas fossem
apresentadas em linguagem leiga — "me fale o que é, o que é o problema real, e quais as
alternativas". Todas as perguntas abaixo seguiram esse formato.

---

## Endereço do profissional

### De onde o sistema tira o endereço de e-mail do profissional?

| Option | Description | Selected |
|--------|-------------|----------|
| Do Clerk, sem campo novo | Zero fricção e endereço já verificado; acopla ao Clerk e fica ambíguo se houver duas pessoas na conta | |
| Campo novo no perfil, preenchido por ele | Dado nosso e escolha do profissional; campo vazio = nenhum e-mail, e digitação errada vira bounce | |
| Clerk como padrão, com opção de trocar | Funciona sozinho desde o primeiro segundo e permite redirecionar; a mais cara — migration + tela + precedência | ✓ |

**User's choice:** Clerk como padrão, com opção de trocar
**Notes:** Implica coluna `email_contato` nullable em `perfis_empresas` + campo na tela de
perfil + regra de precedência (campo preenchido ganha do Clerk).

### O que vai no Reply-To do e-mail de boas-vindas?

| Option | Description | Selected |
|--------|-------------|----------|
| contato@vamoagendar.com.br | Endereço certo já gravado; hoje não há MX, então a resposta se perde até a Phase 10 | |
| O próprio e-mail do profissional | Cumpre a letra do SC2; ele responderia para si mesmo, o que parece defeito | |
| Sem Reply-To (herda o naoresponda@) | Mais honesto; exige alterar o wrapper da etapa preparatória | ✓ |

**User's choice:** Sem Reply-To (resposta livre do owner)
**Notes:** Texto do owner: *"NAO é pra responder as mensagens automaticas, isso não entra
no escopo e nem deve entrar, é um naoresponda@"*. Consequências registradas em CONTEXT como
D-02, D-03 e D-04: `enviarEmail` passa a aceitar `replyTo` opcional, e a metade "responder
vai para o profissional" do Success Criteria 2 migra para a Phase 5, onde o destinatário é
o cliente final.

---

## Gatilho do boas-vindas

### Como o sistema garante que o boas-vindas sai uma vez só, para sempre?

| Option | Description | Selected |
|--------|-------------|----------|
| Coluna de data no perfil | Definitiva, auditável e barata; uma coluna a mais na migration que a fase já teria | |
| Só o retorno da criação do perfil | Zero schema novo; se o envio falhar, o profissional nunca mais recebe e ninguém sabe | |
| Tabela própria de e-mails enviados | Serve Phases 5 e 9 e vira auditoria de verdade; infraestrutura maior do que esta fase precisa | ✓ |

**User's choice:** Tabela própria de e-mails enviados
**Notes:** Custo aceito conscientemente — migration + RLS + policies granulares nesta fase
em troca de as Phases 5 e 9 herdarem pronto, e de os dois canais (WhatsApp e e-mail)
ficarem auditáveis da mesma forma.

### Qual mecanismo impede o reenvio, dentro da tabela nova?

| Option | Description | Selected |
|--------|-------------|----------|
| Coluna de chave única reaproveitada | Mesma string do `idempotencyKey` do Resend, com UNIQUE; um mecanismo serve todos os e-mails futuros | ✓ |
| Restrição única por tenant + tipo | Legível, mas só funciona para e-mail que sai uma vez por tenant na vida | |
| Consulta antes de enviar | Migration mínima; é a corrida que a Phase 2 gastou uma fase inteira eliminando | |

**User's choice:** Coluna de chave única reaproveitada

### O endereço de destino fica gravado na tabela de auditoria?

| Option | Description | Selected |
|--------|-------------|----------|
| Não — mesma regra da disparos_whatsapp | Coerente com a trava anti-PII; investigar caso específico exige abrir o painel do Resend | ✓ |
| Sim — endereço gravado junto | Investigação por SQL; dado pessoal duplicado que a Phase 10 teria que caçar | |
| Endereço pseudonimizado (hash) | Agrupa por destinatário sem PII; não resolve "foi para o endereço errado" | |

**User's choice:** Não — mesma regra da disparos_whatsapp
**Notes:** Decisão que depois se revelou sinérgica com a área de bounce — o cruzamento por
`source_id` dispensa o endereço.

### O que acontece com a linha da tabela quando o envio falha?

| Option | Description | Selected |
|--------|-------------|----------|
| Status 'falhou' e a próxima visita tenta de novo | Cura sozinha e preserva histórico; exige índice único parcial | ✓ |
| Apaga a linha | Trava simples; auditoria que apaga o próprio histórico deixa de ser auditoria | |
| Nunca mais tenta; falha vira alerta no Sentry | Máxima simplicidade no banco; vira tarefa manual recorrente do owner | |

**User's choice:** Status 'falhou' e a próxima visita tenta de novo

### E quando o profissional não tem e-mail utilizável?

| Option | Description | Selected |
|--------|-------------|----------|
| Não envia, registra e segue | Nunca quebra a entrada no produto; owner vê acontecer; mesmo tratamento do WhatsApp desconectado | ✓ |
| Envia só quando o endereço for verificado no Clerk | Protege a reputação; profissional fica sem o link e sem aviso | |
| Aceita qualquer endereço que o Clerk devolver | Máxima entrega; assume bounce como normal, e supressão deixa o profissional mudo | |

**User's choice:** Não envia, registra e segue

---

## Supressão de bounce

**Insumo apurado antes de perguntar:** documentação atual do Resend consultada via
context7 (`/websites/resend`) confirmou que hard bounce e reclamação de spam adicionam o
endereço à lista de supressão **automaticamente**, com bloqueio automático de envios
futuros. O Success Criteria 3 da fase já é verdade sem código nosso — o que restava
decidir era se o produto quer *ficar sabendo*.

### A fase constrói alguma coisa para bounce, ou confia só no Resend?

| Option | Description | Selected |
|--------|-------------|----------|
| Webhook do Resend recebendo o aviso | Deixa de depender só da palavra do fornecedor e acaba com o profissional mudo invisível; maior peça de código da fase | ✓ |
| Nada — confia no Resend e verifica no painel | Zero código, proteção de reputação já garantida; cegueira se propaga para Phases 5 e 9 | |
| Consultar a lista antes de cada envio | Descobre sem webhook; chamada de rede a mais por envio e descoberta tardia | |

**User's choice:** Webhook do Resend recebendo o aviso

### O que o sistema faz depois de descobrir que o e-mail foi suprimido?

| Option | Description | Selected |
|--------|-------------|----------|
| Registra + Sentry Issue para o owner | Owner descobre no dia; volume baixo torna o contato direto proporcional; profissional não vê nada | ✓ |
| Registra + avisa o profissional no dashboard | Fecha o ciclo e escala; UI e copy novas, a fase passaria a mexer no dashboard | |
| Só registra o estado, sem alerta | Fase menor, Phase 11 exibiria; até lá o dado existe e ninguém olha | |

**User's choice:** Registra + Sentry Issue para o owner
**Notes:** A opção não escolhida virou ideia deferida no CONTEXT, com gatilho de promoção
escrito (mais de uma dúzia de profissionais ativos).

---

## Como o HTML é feito

### Como o HTML dos e-mails é produzido?

| Option | Description | Selected |
|--------|-------------|----------|
| React Email, do próprio Resend | Elimina trabalho repetido e dá pré-visualização; duas dependências novas | ✓ |
| Função pura em TypeScript devolvendo HTML | Zero dependência e testável; HTML de e-mail à mão quebra em cliente específico sem aviso | |
| Função pura, com um layout base único | Meio-termo; é construir à mão uma versão pequena do que o React Email já é | |

**User's choice:** React Email

### Quanta identidade visual entra no e-mail de boas-vindas?

| Option | Description | Selected |
|--------|-------------|----------|
| Sóbrio: logo pequeno, cor no botão, resto textual | Perfil associado à aba Principal, com a marca presente; não impressiona | |
| Só texto, sem imagem nenhuma | Máxima entregabilidade; primeiro contato sem nada da identidade paga | |
| Completo: capa colorida com a marca | Primeira impressão forte; é o perfil que mais empurra para Promoções, num domínio de reputação zero | ✓ |

**User's choice:** Completo: capa colorida com a marca
**Notes:** Escolha feita **contra a recomendação**, com o custo nomeado antes: o Success
Criteria 4 mede exatamente em qual aba o e-mail cai. Discordância registrada e decisão do
owner respeitada; a pergunta seguinte buscou preservar a escolha reduzindo o risco.

### Como a capa colorida com a marca é construída?

| Option | Description | Selected |
|--------|-------------|----------|
| Bloco de cor em HTML + logo pequeno | Mesmo impacto visual sem o sinal de "e-mail feito de imagem"; idêntico em todo cliente | ✓ |
| Banner de imagem única com o gradiente | Fidelidade total à arte; sinal que mais pesa para Promoções e topo vazio onde imagem é bloqueada | |
| Gradiente real com fallback para cor sólida | Máxima fidelidade sem imagem; VML é marcação legada fácil de quebrar | |

**User's choice:** Bloco de cor em HTML + logo pequeno
**Notes:** Mitigação acordada do custo da decisão anterior.

---

## Claude's Discretion

- Hospedagem do logo do e-mail (URL absoluta estável servida pelo domínio do app)
- Copy do e-mail de boas-vindas — tom por `docs/05-PRODUTO_E_VISAO.md` e pela rule global
  de texto público
- Tratamento do teto de 100/dia e 3.000/mês do plano Free (o `classificar.ts` já mapeia as
  duas cotas para `falha_transporte`; avaliar se merece Issue própria)
- Nomes exatos de tabela, colunas, tipos de e-mail, código sintético da Issue e env vars
- Forma dos testes, respeitando a hermeticidade do `pnpm test`
- Execução do UAT humano do Success Criteria 4 (Gmail, Outlook e domínio corporativo)

## Deferred Ideas

- Avisar o profissional no dashboard que os e-mails não chegam nele — candidata à Phase 11
- Caixa de entrada real no domínio (`contato@vamoagendar.com.br`, sem MX hoje) — Phase 10
