# Feature Research

**Domain:** SaaS de agendamento online para profissionais autônomos de beleza/estética no Brasil (B2B2C)
**Researched:** 2026-07-20
**Confidence:** MEDIUM (preços de páginas oficiais = MEDIUM/HIGH; comparativos de terceiros = LOW, quase todos escritos por concorrentes)

## Leitura de mercado (o que a pesquisa mudou na tese)

Três coisas apareceram com força suficiente para reordenar prioridades:

**1. O mercado se divide em duas ligas, não uma.** A liga *marketplace* (Booksy, Trinks, Avec/ex-SalãoVIP) vende descoberta de clientes e gestão completa por R$76–199/mês, e exige que o cliente final crie conta — porque a conta **é** o produto deles. A liga *ferramenta* (Agende-me, Azzend, AgendaIA, Simples Agenda, Tua Agenda, Minha Agenda, Barbeiro.app, AgendaClick) vende link de agendamento + WhatsApp por R$0–120/mês e já anuncia "sem cadastro, sem app" como benefício. O VamoAgendar está na liga *ferramenta*, e é contra ela que precisa ser comparado. Comparar-se ao Booksy é confortável e enganoso.

**2. Existe piso de preço grátis.** Agende-me tem plano gratuito permanente (1 agenda, 30 agendamentos/mês, 50 clientes); Barbeiro.app, AgendaClick e programasalao.com.br também anunciam gratuito. Tua Agenda começa em R$19,90 e Minha Agenda em R$22,90. R$39,90 pelo Pro é preço justo de mercado, mas o Gratuito do VamoAgendar (sem WhatsApp) é mais fraco que o gratuito do concorrente mais direto.

**3. O tema mais barulhento do mercado brasileiro não está no produto: sinal/PIX antecipado contra no-show.** É a maior concentração de conteúdo, marketing e promessa que apareceu na pesquisa — Agende-me, Azzend e Simples Agenda vendem isso como feature de primeira linha, e há uma indústria de conteúdo inteira (Frizzar) sobre "cobrança de sinal". É também a feature que mais colide com a regra de Fricção Zero. Essa tensão é a decisão de produto mais importante que este milestone deixa em aberto.

## Feature Landscape

### Table Stakes (Users Expect These)

Features que o profissional assume que existem. A ausência não é notada como falta de recurso — é notada como "esse sistema não serve".

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Link público de agendamento 24h com bloqueio automático de horário ocupado | É a razão de existir da categoria; **todo** concorrente entrega | — | ✅ Existe |
| Cadastro de serviços com duração e preço | Base de tudo; sem isso a agenda não calcula | — | ✅ Existe |
| Horários de funcionamento com múltiplas janelas por dia (almoço) | Autônoma de beleza quase sempre tem intervalo; janela única força gambiarra | — | ✅ Existe |
| Bloqueio de datas/exceções (feriado, folga, viagem) | Primeira coisa que quebra na semana 1 de uso real | — | ✅ Existe |
| Confirmação e lembrete automático por WhatsApp | Vendido por 100% dos concorrentes pesquisados como feature principal, não como extra. É onde a relação com a cliente brasileira acontece | — | ✅ Existe (Pro) |
| Agendamento manual/walk-in pelo profissional | Metade da agenda real entra pela boca; sistema que só aceita link é abandonado | — | ✅ Existe |
| Página pública com identidade do negócio (nome, logo, serviços) | O link vai para a bio do Instagram; página feia é vergonha pública | — | ✅ Existe (Pro para logo/cor) |
| Página funcionando bem no celular | O cliente final abre pelo Instagram, sempre no celular | — | ✅ Existe |
| **Cliente cancelar ou remarcar sozinho** | Azzend anuncia "reagendamento automático pelo cliente"; Trinks tem na tela "Meus Compromissos". Sem isso, todo cancelamento volta para o WhatsApp do profissional — exatamente o trabalho que o produto prometeu eliminar | MEDIUM | ❌ **Ausente** e marcado como out-of-scope. Ver "Lacunas" abaixo |
| **Sinal/PIX antecipado contra no-show** | Tema dominante do mercado BR; concorrentes de R$59,90 já entregam | HIGH | ❌ **Ausente**. Colide com Fricção Zero — decisão de produto pendente |
| Canal de suporte visível e humano | "Suporte humanizado" é item de bullet em Trinks, Agende-me e Belasis. Autônoma que travou no domingo não abre ticket, ela desiste | LOW | ⏳ No escopo do milestone (`contato@vamoagendar.com.br`) |
| Termos de uso e política de privacidade | Obrigação legal (LGPD) — o produto coleta nome e telefone de terceiro sem consentimento explícito hoje | LOW | ⏳ No escopo do milestone |
| Recibo/comprovante da assinatura | Autônoma que paga PJ precisa do comprovante; ausência gera chargeback e desconfiança | LOW | ⏳ No escopo do milestone |
| E-mail de boas-vindas com o link pronto | Sem isso o profissional não sabe o que colar na bio; é o momento de ativação | LOW | ⏳ No escopo do milestone |

### Differentiators (Competitive Advantage)

Avaliação honesta primeiro, tabela depois.

#### Candidato A — Fricção Zero (cliente agenda sem login, cadastro, e-mail ou OTP)

**Veredito: paridade na liga onde o produto compete; diferencial real apenas contra os líderes de mercado. Não é razão de escolha hoje.**

O que a pesquisa mostrou:

- **Contra a liga marketplace: é diferença real e estrutural.** Trinks instrui o cliente a clicar "Sou novo no Trinks", informar dados e **criar senha**. Booksy mantém uma seção inteira de central de ajuda dedicada a "Conta Booksy"; o site brasileiro promete apenas que *baixar o app* é opcional — não que a conta seja. E isso não é acidente que eles vão corrigir: a conta é o ativo do modelo de negócio deles (marketplace, descoberta, remarketing). Eles **não podem** copiar o VamoAgendar aqui.
- **Contra a liga ferramenta: é commodity de copy.** Azzend ("sem app e sem cadastro do cliente"), AgendaIA ("agendam diretamente, sem cadastro") e RobotiZap ("sem cadastro e sem fricção") já vendem exatamente essa frase. Um profissional comparando três landing pages vai ler a mesma promessa nas três.
- **Problema mais grave que a paridade: o comprador não sente o benefício.** Quem paga é o profissional; quem sofre a fricção é a cliente dele. B2B2C clássico — o valor é real e a percepção é de terceiro. O profissional só atribui valor a isso depois de ter perdido agendamento por causa de cadastro, o que exige que ele já tenha usado Booksy/Trinks e se frustrado. Ou seja: **funciona como argumento de migração, não como argumento de adoção.**
- **Tem custo mensurável.** Sem identidade do cliente não há cancelamento self-service, histórico, fidelidade nem remarketing — três dos quais os concorrentes vendem como features. A Fricção Zero é a causa direta da lacuna de "cliente cancela sozinho" listada em table stakes.

**Onde ainda pode virar diferencial:** a implementação é mais radical que a dos concorrentes de copy. Vale investigar se Azzend/AgendaIA realmente não pedem nada ou se "sem cadastro" significa "sem senha, mas com confirmação por SMS/e-mail". Se a diferença for real, o ângulo defensável não é "sem cadastro" (todo mundo diz) — é a **taxa de conclusão do funil**, mensurável no PostHog. "94% de quem abre o link conclui o agendamento" é uma afirmação que o concorrente não consegue copiar sem ter o número.

#### Candidato B — Grade anti-buraco (não oferecer slot que deixe sobra invendável)

**Veredito: tecnicamente incomum de verdade no segmento e no preço — mas hoje é ativo de engenharia, não diferencial de produto, porque é invisível.**

O que a pesquisa mostrou:

- **Praticamente todo mundo trata buraco de agenda de forma REATIVA, depois que o buraco já existe:** fila de encaixe (Belle Software), busca de horários vagos (Graces), mapa de calor de ocupação (Trinks), waitlist automática (Zenoti, Vagaro), sugestão de encaixe por IA (Easy Salon, Anolla). Todos assumem o buraco como fato consumado e tentam preencher depois.
- **Prevenir o buraco no momento da oferta é raro.** O análogo mais próximo encontrado é o "Precision Scheduling" do Boulevard — produto americano, tier enterprise, longe deste segmento e deste preço. Nenhum concorrente brasileiro de baixo custo anuncia nada equivalente.
- **Mas ninguém consegue ver.** O profissional não observa o agendamento que não virou buraco. O valor entregue é exatamente o tipo que não aparece: ausência de um problema que ele nunca soube que teria. Sem instrumentação e sem narrativa, isso é engenharia bonita com zero impacto em conversão ou retenção.
- **E pode ser lido como bug.** "O site diz que não tem horário, mas eu sei que ela está livre às 14h" é uma reclamação plausível e desgastante, principalmente para quem tem serviços de durações muito diferentes.

**O que transforma em diferencial (custo baixo, alto retorno):** dar nome e número. Um cartão no dashboard — "sua agenda ficou X% mais densa" ou "N janelas invendáveis evitadas este mês" — converte o invisível em argumento. Nomear ("Agenda Densa", "Encaixe Automático") transforma característica em feature vendável. **Isto é a coisa mais barata que o produto pode fazer para deixar de não ter diferencial.**

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Tornar a grade anti-buraco visível e nomeada (métrica no dashboard + nome próprio + copy na landing) | Converte o único mecanismo genuinamente incomum do produto em razão de escolha comunicável. Concorrentes brasileiros só fazem encaixe reativo | LOW (a engine já existe; falta contagem e UI) | **Maior retorno por hora de trabalho do backlog inteiro.** Requer escape hatch: permitir que o profissional afrouxe a regra |
| Fricção Zero medida, não só afirmada (taxa de conclusão do funil no PostHog exposta na landing) | "Sem cadastro" é copy comum; número de conversão é prova que só quem mede tem | LOW (PostHog já instrumentado; falta o número real) | Precisa de volume real primeiro — pós-lançamento |
| Foco explícito no solo ("não é um ERP de salão") | Todo concorrente empurra estoque, comissão, multi-profissional e conta digital para quem atende sozinha. Simplicidade radical é posicionamento defensável e barato | LOW (é copy e disciplina de escopo) | Alinhado ao out-of-scope já decidido. Vira desvantagem quando a cliente cresce e contrata a segunda pessoa |
| Preço fundador vitalício R$29,90 até 02/02/2027 | Já decidido; funciona como razão de urgência na ausência de razão de produto | — | ⏳ No escopo do milestone. Vale a honestidade: desconto não é diferencial, é aluguel de tempo para encontrar um |
| Marketplace / descoberta de clientes | O que Booksy e Trinks realmente vendem — trazer cliente novo, não organizar o existente | HIGH | ❌ Não fazer. Exige densidade de oferta que não existe; é o fosso deles, não terreno de disputa |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Controle de estoque de produtos | Todo concorrente tem; parece que falta | Irrelevante para quem atende sozinha e não revende. Infla o onboarding com telas que o usuário nunca preenche e aumenta a sensação de "sistema complicado" — a queixa nº1 sobre os grandes | Não construir. Usar a ausência como posicionamento |
| Comissão por profissional | Aparece em toda tabela comparativa | Comissão só existe com equipe; o cliente-alvo não tem equipe. Puxa junto multi-profissional, papéis e rateio | Não construir enquanto o alvo for solo |
| Conta digital / carteira / adquirência própria | Trinks e Avec vendem "conta digital integrada" | Vira instituição financeira: KYC, suporte de dinheiro, chargeback, risco regulatório. Devora um produto pequeno | Se houver demanda de pagamento, integrar PIX de terceiro (o Asaas já está na stack) sem custodiar valor |
| Cadastro/login do cliente final para ver histórico e fidelidade | Habilita cancelamento self-service, programa de pontos, remarketing | Destrói a única promessa clara que o produto tem. E o efeito colateral é o que gera reclamação nos grandes | Link mágico assinado no lembrete de WhatsApp/e-mail — dá cancelamento self-service **sem** conta. Ver "Lacunas" |
| App nativo para o profissional | "Meus concorrentes têm app" | Duas plataformas para manter, ciclo de review, push notification. PWA resolve o caso real (abrir a agenda no celular) | PWA instalável. Já é out-of-scope, manter assim |
| Chatbot de IA para agendar pelo WhatsApp | AgendaIA, Gendo e Easy Salon vendem "IA"; parece atraso não ter | Custo por conversa, risco de agendar errado, e sobe o risco de bloqueio na Evolution API — que o PROJECT.md já identifica como a peça mais frágil da stack | Manter o link. Se a conversa for o gargalo, resolver com template de resposta rápida antes de IA |
| Múltiplos planos com matriz de features | Parece maximizar receita | O Plus já provou que não funciona (está sendo extinto). Matriz de plano em produto pequeno gera suporte, bug de gating e dúvida na hora da compra | Gratuito + Pro. Já decidido — manter a disciplina |
| Cobrança por mensagem de WhatsApp | Repassa custo variável | Agende-me usa "WhatsApp ilimitado sem cobrança por mensagem" como argumento contra Tua Agenda (R$0,46/msg). Cobrança por mensagem é lida como pegadinha | Manter ilimitado dentro do Pro. É o que o mercado premia |
| CAPTCHA no booking público para conter abuso | Reação natural ao risco de spam | Fricção visível é violação direta da regra inegociável e mata a conversão do cliente legítimo | Rate limit + honeypot invisível — já é o caminho escolhido no milestone. Correto |

## Feature Dependencies

```
[Link público de agendamento]
    └──requires──> [Serviços + Horários + Exceções]
                       └──requires──> [Engine de disponibilidade]

[Grade anti-buraco] ──enhances──> [Engine de disponibilidade]
[Métrica "agenda densa"] ──requires──> [Grade anti-buraco]
                          ──requires──> [Instrumentação de funil]

[WhatsApp confirmação + lembrete] ──requires──> [Instância Evolution conectada]
                                   ──requires──> [Gating de plano Pro]

[Cliente cancela sozinho] ──requires──> [Link mágico assinado no lembrete]
                          ──conflicts──> [Cadastro do cliente]   <-- e é por isso que precisa do link mágico

[Sinal/PIX antecipado] ──conflicts──> [Fricção Zero]
                       ──requires──> [Asaas em produção]

[Checkout de assinatura] ──requires──> [Asaas aprovado em produção]
[Recibo de assinatura]   ──requires──> [Webhook Asaas]
                         ──requires──> [Resend com domínio verificado]
[E-mail de boas-vindas]  ──requires──> [Resend com domínio verificado]
[Booking aceita e-mail OU WhatsApp] ──requires──> [Resend com domínio verificado]
```

### Dependency Notes

- **Métrica "agenda densa" requer contagem na engine:** hoje `gerarSlotsAntiBuraco` descarta candidatos silenciosamente. Para virar número exibível, precisa contar quantos foram descartados e por quê — mudança pequena e localizada, mas é pré-requisito de toda a narrativa de diferencial.
- **Cliente cancela sozinho conflita com Fricção Zero, e o link mágico é a saída:** o token assinado vai no lembrete que já é enviado. O cliente clica e cancela sem nunca ter criado nada. Preserva a regra e fecha a lacuna de table stakes.
- **Sinal/PIX conflita com Fricção Zero de forma insolúvel:** exigir pagamento antes de confirmar é fricção por definição. Não há truque técnico. É escolha de produto — e a saída provável é torná-lo opcional por serviço, com a Fricção Zero permanecendo o padrão.
- **Três itens de comunicação travam no mesmo ponto externo:** boas-vindas, recibo e confirmação ao cliente final dependem todos da verificação SPF/DKIM do domínio no Resend, que é tarefa de DNS do owner. É a dependência de maior alcance do milestone — deve ser iniciada no dia 1, não quando o código estiver pronto.

## MVP Definition

### Launch With (v1) — abrir ao público

Regra aplicada: entra o que é **exigido para abrir**, não o que é exigido para competir.

- [ ] Hardening de segurança do booking anônimo (GRANT por coluna, INSERT restrito, atomicidade contra double-booking, rate limit + honeypot, assinatura real do QStash) — o critério de sucesso é "sem quebrar"; abrir com INSERT anônimo aberto é abrir quebrado
- [ ] Checkout Asaas em sandbox + gating automático — sem cobrar não há produto, e o sandbox destrava o trabalho sem depender de terceiro
- [ ] Plus extinto do código e do banco — vender plano condenado gera atrito com os primeiros clientes, e o custo de remoção hoje é zero
- [ ] Preço R$39,90 com fundador vitalício R$29,90 e selo com percentual correto (-25%) — selo errado é o primeiro sinal de desleixo que o comprador percebe
- [ ] E-mail de boas-vindas com o link pronto — é o momento de ativação; sem ele o profissional não sabe o que fazer
- [ ] Recibo de assinatura — obrigação comercial mínima
- [ ] Confirmação do agendamento ao cliente final por e-mail + booking aceitando **e-mail OU WhatsApp** — o produto passa a poder confirmar por dois canais, e a promessa do `docs/05` deixa de ser falsa
- [ ] Canal de suporte visível (`contato@vamoagendar.com.br`) — "suporte humanizado" é bullet padrão de todo concorrente; ausência de qualquer canal é sinal de amadorismo
- [ ] Termos de uso e política de privacidade — obrigação legal com dado de terceiro (LGPD)
- [ ] Migrations imutáveis, dados de teste removidos, PostHog ativo em produção — a barra operacional de "não perder dados de gente real"

### Add After Validation (v1.x)

- [ ] **Métrica "agenda densa" + nome próprio para a grade anti-buraco** — gatilho: dois primeiros profissionais ativos com agenda real. É a conversão mais barata de ativo técnico em diferencial que existe no backlog. *Candidato a subir para v1 se sobrar folga — é o único item que ataca diretamente a ausência de diferencial.*
- [ ] **Cancelamento/remarcação pelo cliente via link mágico assinado** — gatilho: primeiro profissional reclamando que continua recebendo cancelamento no WhatsApp. Fecha uma lacuna de table stakes sem violar a Fricção Zero
- [ ] Escape hatch da regra anti-buraco (toggle "mostrar todos os horários") — gatilho: primeira reclamação de "sumiu um horário que eu tinha"
- [ ] Taxa de conclusão do funil exposta como prova pública da Fricção Zero — gatilho: volume estatisticamente honesto (~100 sessões)
- [ ] Resumo simples do faturamento previsto no mês (só soma dos serviços agendados) — gatilho: pedido explícito. É o pedaço de "financeiro" com maior valor por linha de código, sem virar ERP

### Future Consideration (v2+)

- [ ] Sinal/PIX antecipado opcional por serviço — adiar até haver evidência de que a dor de no-show supera o ganho da Fricção Zero **nestes usuários**, não no mercado em geral. O mercado inteiro grita por isso; a base do VamoAgendar ainda não existe para confirmar
- [ ] Multi-profissional — adiar: muda o modelo de dados, a engine e o preço de uma vez. Já é out-of-scope, com gatilho no `PENDENCIAS.md`
- [ ] Migração para WhatsApp Cloud API — adiar até volume justificar, mas monitorar: o `PROJECT.md` já identifica Evolution/Baileys como a peça mais frágil, e o risco cresce com o sucesso
- [ ] Marketplace/descoberta — adiar indefinidamente. É o fosso do Booksy, não terreno de disputa para um produto sem densidade de oferta

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Hardening do booking anônimo | HIGH (invisível, mas o fracasso é terminal) | MEDIUM | P1 |
| Checkout Asaas + gating automático | HIGH | HIGH | P1 |
| Extinção do Plus + preço/selo corretos | MEDIUM | LOW | P1 |
| E-mails transacionais (boas-vindas, recibo, confirmação) | HIGH | MEDIUM (bloqueado por DNS) | P1 |
| Booking aceita e-mail OU WhatsApp | MEDIUM | LOW | P1 |
| Suporte visível + termos + privacidade | MEDIUM (alto se faltar) | LOW | P1 |
| Migrations imutáveis + limpeza + PostHog em prod | HIGH | LOW | P1 |
| **Métrica + nome para a grade anti-buraco** | **HIGH (é o diferencial disponível)** | **LOW** | **P1/P2 — melhor relação valor/custo do backlog** |
| Cancelamento pelo cliente via link mágico | HIGH | MEDIUM | P2 |
| Escape hatch da regra anti-buraco | MEDIUM | LOW | P2 |
| Faturamento previsto do mês | MEDIUM | LOW | P2 |
| Prova pública de conversão do funil | MEDIUM | LOW (depende de volume) | P2 |
| Sinal/PIX antecipado | HIGH no mercado, **desconhecido nesta base** | HIGH | P3 |
| Estoque, comissão, conta digital, marketplace, app nativo, chatbot IA | LOW para o alvo solo | HIGH | Não construir |

## Competitor Feature Analysis

| Feature | Booksy | Trinks | Agende-me / Azzend / AgendaIA | VamoAgendar |
|---------|--------|--------|-------------------------------|-------------|
| Preço de entrada | ~R$99/mês (BR); US$29,99 base + US$20/usuário extra | R$76/mês para 1–2 profissionais (oficial); comparativos citam R$79–199 | Agende-me: grátis permanente (30 agend./mês) e ~R$59,90 pago; Azzend R$70; AgendaIA R$98 | **R$39,90** (R$29,90 fundador vitalício) |
| Cliente precisa criar conta | Sim — central de ajuda tem seção "Conta Booksy"; só o *app* é opcional | Sim — "Sou novo no Trinks" + criar senha | Não — os três anunciam "sem cadastro" | **Não** |
| Cliente cancela/remarca sozinho | Sim (via conta) | Sim, tela "Meus Compromissos" | Azzend anuncia reagendamento pelo cliente | **Não** — lacuna |
| WhatsApp automático | Sim | Automação de WhatsApp só em planos superiores | Agende-me: ilimitado sem cobrança por msg. Tua Agenda cobra R$0,46/msg | Sim, ilimitado no Pro |
| Sinal/PIX antecipado | Sim (pagamento integrado) | Sim (conta digital) | Agende-me e Azzend anunciam sinal PIX | **Não** — lacuna |
| Financeiro / estoque / comissão | Sim, +40 relatórios | Sim, forte (130+ relatórios em comparativos) | Parcial | **Não** — decisão de escopo |
| Otimização de buraco de agenda | Não anunciada | Mapa de calor (analítico, reativo) | Não anunciada. Belle Software e Graces têm fila de encaixe; Easy Salon sugere encaixe por IA | **Preventiva na geração de slots — sem análogo BR encontrado** |
| Marketplace / descoberta | Sim — é o produto | Sim | Não | Não |
| Plano gratuito permanente | Não | Não (5 dias de teste) | Agende-me, Barbeiro.app, AgendaClick: sim | Sim (sem WhatsApp) |

**Leitura da tabela:** o VamoAgendar é o mais barato entre os pagos, empata em Fricção Zero com a liga ferramenta, ganha dos marketplaces nela, e perde em duas features que a liga inteira entrega — cancelamento pelo cliente e sinal/PIX. A única linha em que ele está sozinho é a grade anti-buraco. **Se existe um diferencial para comunicar, é aquele — e ele está mudo.**

## Sources

Páginas oficiais de produto (confiança MEDIUM–HIGH para preço e promessa; são material de marketing):
- [Trinks — Planos e Preços](https://negocios.trinks.com/planos/) — R$76/mês para 1–2 profissionais, features por faixa
- [Trinks — Central de Ajuda: agendamento pelo cliente](https://ajuda.trinks.com/cliente-agendamento-online-atrav%C3%A9s-do-aplicativo) — cliente cria conta e senha
- [Booksy Brasil](https://booksy.com.br/) — promessa ao profissional; "baixar o app só se quiser"
- [Booksy — Central de Ajuda: Conta Booksy](https://help.booksy.com/hc/en-us/sections/21595658848402-Booksy-account) — existência da conta do cliente
- [Booksy Biz — Pricing](https://biz.booksy.com/pricing) — US$29,99 base + US$20/usuário
- [Azzend — Agendamento para salão](https://azzend.com.br/agendamento-para-salao-de-beleza) — "sem cadastro do cliente", R$70/120/200, PIX, reagendamento pelo cliente
- [AgendaIA](https://www.agendaiabr.com/) — "agendam diretamente, sem cadastro", R$98/198/398
- [RobotiZap](https://www.robotizap.com/sistema-de-agendamento-salao-de-beleza-whatsapp/) — "sem cadastro e sem fricção"
- [Avec (ex-SalãoVIP)](https://negocios.avec.app/) — 20 mil estabelecimentos, preço não publicado
- [Belle Software — Encaixe de agendamentos](https://ajuda.bellesoftware.com.br/knowledge-base/encaixe-de-agendamentos/) — fila de encaixe reativa
- [Easy Salon](https://easysalon.com.br/) — sugestão de encaixe por IA
- [Anolla — Best salon software](https://anolla.com/en/best-salon-software) — gap prevention por IA (mercado internacional)

Comparativos de terceiros (confiança LOW — quase todos escritos por concorrentes, com viés declarado):
- [Agende-me — Comparativo de sistemas 2026](https://agende-me.com/comparacao-sistemas-agendamento/) — tabela de preços do segmento, plano grátis permanente, três dores citadas (WhatsApp ilimitado, sinal PIX, plano grátis). **Autor é concorrente**
- [Barbeiro.app — Melhor sistema para barbearia 2026](https://www.barbeiro.app/blog/melhor-sistema-para-barbearia-2026) — faixas R$39–199. **Autor é concorrente**
- [Belasis — Comparativo 2026](https://www.belasis.com.br/melhor-sistema-para-salao-de-beleza-brasil-2026-agenda-financeiro-estoque/) — **autor é concorrente**

Contexto de mercado (confiança MEDIUM para tendência, LOW para números específicos):
- [Frizzar — Cobrança de sinal no salão de beleza](https://frizzar.com.br/blog/cobranca-de-sinal-salao-de-beleza/) — sinal como norma emergente; caso citado de queda de 30% para 10% de cancelamento (número de blog, **não verificado**); base legal nos arts. 417–420 do Código Civil
- [Exame — Booksy planeja dobrar operação no Brasil](https://exame.com/pme/com-aporte-de-us-70-mi-americana-booksy-planeja-dobrar-operacao-no-brasil/) — aporte de US$70 mi e expansão no BR
- [Reclame Aqui — Booksy](https://www.reclameaqui.com.br/empresa/booksy/lista-reclamacoes/?produto=0000000000001409) — reclamações de bloqueio de conta, SMS indesejado e dificuldade de cancelamento

### Lacunas de pesquisa

- **Não verificado se "sem cadastro" dos concorrentes é literal.** Azzend, AgendaIA e RobotiZap afirmam isso em copy; nenhum booking real foi executado para confirmar se há confirmação por SMS/e-mail no meio. **Se a diferença for real, muda a avaliação do Candidato A de "paridade" para "diferencial subcomunicado".** Vale 30 minutos: abrir os três links públicos e agendar de verdade.
- **Preço do Booksy Brasil e do Avec sem fonte primária.** O valor de R$99/mês veio de terceiros; a página BR do Booksy não publica preço e o Avec exige contato comercial.
- **Nenhuma evidência de usuário real.** Toda esta pesquisa é material de marketing e comparativo enviesado. Nada aqui substitui a conversa com os primeiros profissionais — que é exatamente a aposta declarada do owner e o mecanismo correto para resolver as duas grandes incógnitas (sinal/PIX e valor percebido da grade anti-buraco).

---
*Feature research for: SaaS de agendamento para autônomos de beleza no Brasil*
*Researched: 2026-07-20*
