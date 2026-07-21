# Pitfalls Research

**Domain:** SaaS B2B2C de agendamento (Brasil) abrindo ao público — multi-tenant com RLS, billing recorrente Asaas, e-mail transacional em domínio novo, WhatsApp não-oficial
**Researched:** 2026-07-20
**Confidence:** MEDIUM (fontes oficiais Asaas/Supabase/PostgreSQL/Gmail cruzadas com o schema real do repositório; a parte de LGPD é síntese de fontes secundárias — MEDIUM-BAIXA, precisa de revisão humana antes de virar texto jurídico)

> Este documento **não repete** o `.planning/codebase/CONCERNS.md`. Onde um item já está catalogado lá, aqui está o que a pesquisa acrescenta: o modo de falha real no lançamento, o que dispara, e o detalhe técnico que faz a correção ingênua não funcionar.

---

## Critical Pitfalls

### Pitfall 1: Fechar a política de INSERT `anon` e achar que a superfície acabou

**What goes wrong:**
A correção óbvia da Data API é remover as policies `INSERT ... WITH CHECK (tenant_id IS NOT NULL)` de `agendamentos` e `clientes`. Isso resolve a escrita — mas a leitura continua aberta e é ela que expõe o negócio inteiro. Hoje:

- `perfis_empresas`: `SELECT TO anon USING (true)`, **sem GRANT por coluna**. Um `GET /rest/v1/perfis_empresas?select=*` devolve a lista completa de todos os profissionais da plataforma: `tenant_id` (= o `org_...` do Clerk), slug, configurações e o que mais existir na tabela. É a base de clientes do VamoAgendar servida em JSON — material perfeito para concorrente e para phishing dirigido ("olá, sou do suporte VamoAgendar, sua assinatura expirou").
- `agendamentos`: `SELECT TO anon USING (true)` com todas as colunas. Agenda de todos os tenants, com `cliente_id` e `servico_id` para pivotar.
- `excecoes_agenda`: expõe `motivo` — texto livre escrito pelo profissional ("cirurgia", "viagem com o namorado").

**Why it happens:**
As políticas foram escritas quando a página pública lia direto pela role `anon` e precisava de fato desses dados. A leitura hoje passa por `obterDadosBookingPublico`/`obterSlotsDisponiveis` no servidor, mas a policy nunca foi estreitada junto — a mudança de arquitetura não invalidou a policy automaticamente.

**How to avoid:**
Tratar `anon` como "o que um bot vai baixar inteiro", não como "o que a minha página precisa". Concretamente:

1. Para cada tabela com `SELECT TO anon`, aplicar o padrão que `assinaturas` já usa: `REVOKE SELECT ON <tabela> FROM anon; GRANT SELECT (col, col) ON <tabela> TO anon;`.
2. Estreitar o `USING (true)` para o que o fluxo público realmente exige — em `agendamentos`, o público precisa saber que existe ocupação num intervalo, não quem é o cliente.
3. Melhor ainda: como toda a leitura pública já é server-side, considerar **remover as policies `anon`** e servir o booking via `createClient()` com service role em função dedicada, ou expor só uma RPC `SECURITY DEFINER` que devolve slots. Menos policy = menos superfície.
4. Rodar `ALTER DEFAULT PRIVILEGES ... REVOKE` no schema `public` para que a próxima tabela criada não nasça exposta (é o modelo opt-in para o qual o próprio Supabase está migrando).

**Warning signs:**
- Qualquer `USING (true)` sem um `GRANT (colunas)` correspondente no mesmo arquivo.
- Uma tabela nova sendo criada em `supabase/schemas/` sem bloco de REVOKE/GRANT.
- Teste manual que passa: `curl "$SUPABASE_URL/rest/v1/perfis_empresas?select=*" -H "apikey: $ANON_KEY"` retornando mais de uma linha, ou colunas que não aparecem na página pública.

**Phase to address:**
Fase de hardening da Data API — **antes** do billing, porque a partir do checkout a tabela `assinaturas` passa a ter `asaas_customer_id`/`asaas_subscription_id` reais e o custo de um vazamento muda de categoria.

---

### Pitfall 2: A exclusion constraint que resolve o double-booking não pode ser criada na forma atual da tabela

**What goes wrong:**
A solução planejada (`EXCLUDE USING gist (tenant_id WITH =, tstzrange(...) WITH &&)`) **não tem como ser escrita hoje**: `agendamentos` guarda apenas `data_hora`; a duração vem de `servicos.duracao_minutos` via join. Uma exclusion constraint só enxerga colunas da própria linha — não dá para consultar outra tabela numa expressão de constraint, nem numa `GENERATED ALWAYS AS ... STORED` (colunas geradas exigem expressão imutável sobre a mesma linha). Descobrir isso no meio da fase é perder o dia.

E há três armadilhas encadeadas depois disso:

1. **`NOT VALID` não existe para exclusion constraint.** O manual do PostgreSQL restringe `NOT VALID` a foreign key, `CHECK` e not-null. `ADD CONSTRAINT ... EXCLUDE` sempre varre a tabela e falha inteira com `conflicting key value violates exclusion constraint` se **uma única** linha existente viola. Não há caminho de "aplica agora, valida depois".
2. **Não dá para reaproveitar índice criado com `CREATE INDEX CONCURRENTLY`.** `ADD CONSTRAINT ... USING INDEX` só vale para `UNIQUE`/`PRIMARY KEY`. A exclusion constrói o índice GiST na hora, sob `ACCESS EXCLUSIVE`. Irrelevante no volume atual (segundos), mas fecha a porta do "aplicar sem downtime" quando o volume crescer.
3. **Cancelado precisa ficar de fora.** Sem `WHERE (status <> 'cancelado')` no predicado, um horário cancelado continua bloqueando o slot para sempre — e aí o bug fica invisível até o profissional reclamar que "sumiu horário da agenda".

**Why it happens:**
A constraint é descrita em uma linha na lista de pendências ("exclusion constraint com tstzrange"), o que esconde que ela é na verdade uma migração de dados (desnormalizar duração) + limpeza de dados legados + constraint.

**How to avoid:**
Sequenciar em quatro passos, nesta ordem:

1. Adicionar `duracao_minutos int` (ou `data_hora_fim timestamptz`) em `agendamentos`, backfill a partir de `servicos`, tornar `NOT NULL`. **Bônus:** isso mata de graça o bug do "assume 30 min para serviço desativado" (`booking-engine.ts:143`), porque a duração deixa de depender de um join que o `anon` não enxerga.
2. Rodar um `SELECT` de pré-voo que lista as sobreposições já existentes no banco (`self-join` com `&&`) e resolvê-las **antes** de tentar a migration. Fazer isso como query, não como tentativa-e-erro de migration.
3. `CREATE EXTENSION IF NOT EXISTS btree_gist;` — obrigatório porque a constraint mistura igualdade (`tenant_id`) com range.
4. Criar a constraint com predicado parcial excluindo `cancelado`.

**Warning signs:**
- A migration de exclusion foi escrita antes de existir coluna de duração/fim em `agendamentos` → ela não vai nem compilar.
- A migration passou no banco de dev mas ninguém rodou a query de pré-voo em produção → vai falhar exatamente no go-live, com o banco já com dados reais.
- Teste de cancelamento + reagendamento no mesmo horário retornando erro de constraint → faltou o predicado.

**Phase to address:**
Fase de atomicidade do agendamento. A desnormalização da duração é pré-requisito e deve ser um item separado no roadmap, não uma sub-tarefa.

---

### Pitfall 3: O erro da exclusion constraint vaza a existência de agendamento de outro tenant (e chega cru na tela do cliente)

**What goes wrong:**
Checagens de integridade — unique, exclusion, foreign key — **sempre bypassam RLS**. É comportamento documentado do PostgreSQL, com aviso explícito sobre "covert channel". Consequências concretas aqui:

- Se a constraint for `EXCLUDE (tstzrange WITH &&)` **sem** `tenant_id WITH =`, um visitante consegue mapear a agenda de qualquer profissional por tentativa-e-erro, mesmo com RLS perfeito.
- Mesmo com `tenant_id` na constraint, a mensagem de erro do PostgreSQL inclui o valor conflitante (`Key (tenant_id, periodo)=(org_..., [...)) conflicts with existing key`). Se esse erro subir pelo Supabase client e for renderizado no `BookingApp.tsx`, o cliente final vê o `org_id` do Clerk e o horário exato do agendamento de outra pessoa.

**Why it happens:**
A intuição é "RLS está ligado, então nada vaza". RLS filtra **linhas em queries**; não filtra checagem de constraint nem texto de erro. E o caminho feliz do desenvolvimento nunca dispara a constraint, então o erro nunca é visto.

**How to avoid:**
- `tenant_id WITH =` sempre presente na constraint.
- Capturar `23P01` (`exclusion_violation`) explicitamente na action pública e traduzir para uma mensagem de domínio: "esse horário acabou de ser reservado, escolha outro" + recarregar os slots. Nunca repassar `error.message` do PostgREST para a UI pública.
- Teste automatizado que provoca a corrida (dois inserts concorrentes) e assere que a segunda resposta é a mensagem traduzida, não o texto do banco.

**Warning signs:**
- `catch` genérico na action que faz `return { erro: error.message }`.
- Ausência de teste que force a violação — se nunca disparou, ninguém sabe o que aparece na tela.

**Phase to address:**
Fase de atomicidade do agendamento, junto com a constraint. Não é item separado.

---

### Pitfall 4: A mesma classe de falha vai derrubar a remoção do plano Plus e o dedupe de clientes

**What goes wrong:**
Duas mudanças do milestone têm exatamente o formato "constraint nova contra dados existentes" e vão falhar do mesmo jeito:

1. **Extinção do Plus.** `assinaturas` tem `plano text NOT NULL CHECK (plano IN ('plus','pro'))`. Trocar para `CHECK (plano = 'pro')` falha se houver **qualquer** linha `plus` no banco, incluindo linhas antigas com `status = 'cancelada'` que ninguém lembra que existem. `CHECK` aceita `NOT VALID` (diferente da exclusion), então há saída — mas o padrão declarativo do projeto gera a constraint validada.
2. **Cliente único por telefone.** `clientes` **não tem** unique em `(tenant_id, telefone)`, e a action "reaproveita cliente existente por telefone" faz select-then-insert — duas requisições simultâneas do mesmo telefone criam duas linhas. Quando alguém for adicionar o unique index depois, ele falha contra as duplicatas já criadas. Pior: a duplicata quebra silenciosamente o histórico do profissional ("essa cliente já veio aqui?") e duplica o disparo de WhatsApp/e-mail.

**Why it happens:**
Migrations declarativas geradas por `supabase db diff` produzem DDL correto para um banco vazio. O diff não sabe nada sobre os dados que já estão lá.

**How to avoid:**
Estabelecer uma regra de fase: **toda migration que adiciona ou aperta constraint vem acompanhada de uma query de pré-voo** que conta as linhas violadoras em produção, rodada e registrada antes da aplicação. Para o Plus: `UPDATE`/`DELETE` das linhas legadas primeiro (o próprio PROJECT.md afirma que ninguém assina Plus — a query de pré-voo é o que transforma isso de crença em fato). Para `clientes`: dedupe + unique index `(tenant_id, telefone)`, o que de quebra torna o "reaproveitar cliente" um `ON CONFLICT DO UPDATE` atômico em vez de select-then-insert.

**Warning signs:**
- Migration de constraint sem query de contagem no plano da fase.
- `docs/PENDENCIAS.md` já registra o precedente: `ck_hora_fim_apos_inicio` precisa de pre-flight contra dados legados. É o mesmo padrão se repetindo.

**Phase to address:**
Fase de monetização (Plus) e fase de atomicidade (clientes). A **regra** de pré-voo deve ser um critério de aceite transversal do milestone.

---

### Pitfall 5: Webhook Asaas — a fila pausa em silêncio e os eventos morrem em 14 dias

**What goes wrong:**
O modo de falha mais caro do Asaas não é o webhook duplicado, é o webhook **parado**. A documentação é explícita: entrega é *at least once*, o endpoint precisa responder 2xx, e após **15 falhas consecutivas a fila de sincronização é pausada**. Asaas manda um e-mail ao titular da conta e para de entregar. Os eventos ficam retidos por **14 dias** e depois são descartados permanentemente.

Tradução no lançamento: um deploy que quebra o handler numa sexta-feira, ou um `throw` não tratado em cima de um payload com campo inesperado, e na segunda-feira a fila está pausada. Todos os pagamentos confirmados nesse intervalo não chegaram, os assinantes pagaram e continuam sem acesso Pro, e se passarem 14 dias sem alguém reativar manualmente no painel, **não há como reprocessar** — a reconciliação vira trabalho manual contra a API do Asaas.

Agrava aqui: o único aviso é um e-mail para o titular da conta Asaas, e o projeto **não tem error tracking nem alerta em produção** (registrado no CONCERNS).

**Why it happens:**
Handler de webhook é escrito no caminho feliz. Processar o negócio de forma síncrona dentro do request faz qualquer erro de banco virar 500 → falha de entrega. E o desenvolvedor testa com o payload do sandbox, que é sempre bem-formado.

**How to avoid:**
1. Handler em duas etapas, como o próprio Asaas recomenda: **persistir o payload cru e responder 2xx imediatamente**; processar depois. Uma tabela `eventos_asaas (id text primary key, payload jsonb, processado_em timestamptz)` resolve idempotência e durabilidade de uma vez — o `id` do evento como PK faz o replay virar `ON CONFLICT DO NOTHING`.
2. Retornar 2xx também para evento que você não conhece. Erro de parsing não pode virar 500.
3. Configurar o header `asaas-access-token` e comparar em tempo constante — é a autenticação do webhook, e é opcional (ou seja, fácil de esquecer).
4. Marcar o webhook como **envio sequencial** — a ordem importa: `PAYMENT_CONFIRMED` seguido de `PAYMENT_OVERDUE` fora de ordem deixa o tenant marcado inadimplente com a fatura paga.
5. Escrever no roadmap um item de **verificação da fila**: um cron simples que consulta o status do webhook via API do Asaas e avisa o owner. Sem isso, o único detector é o cliente reclamando.

**Warning signs:**
- Handler que faz `await supabase.update(...)` antes do `return 200`.
- Ausência de tabela de eventos → não existe idempotência, só torcida.
- Nenhum teste com o mesmo `event.id` entregue duas vezes.

**Phase to address:**
Fase de billing. O handler idempotente é pré-requisito do checkout, não um refinamento posterior.

---

### Pitfall 6: Cobrança em duplicidade — o `uq_assinatura_vigente_por_tenant` protege o seu banco, não o bolso do cliente

**What goes wrong:**
O índice único parcial `uq_assinatura_vigente_por_tenant ON assinaturas (tenant_id) WHERE status IN ('ativa','inadimplente')` garante que **sua** tabela tenha uma assinatura vigente por tenant. Ele não impede que existam **duas subscriptions no Asaas** para o mesmo tenant. Cenários reais:

- O profissional clica "Assinar" duas vezes (ou o link de checkout é aberto em duas abas, ou ele volta e refaz porque achou que travou). Dois checkouts criados, dois cartões debitados, e o segundo `SUBSCRIPTION_CREATED` bate no unique index e o handler engole o erro como "já existe" — você para de rastrear a segunda subscription mas ela continua cobrando todo mês.
- O profissional cancela e reassina. `status='cancelada'` sai do índice parcial, nova linha entra. Se o cancelamento não foi propagado ao Asaas, ficam duas assinaturas ativas lá.

O sintoma é o pior possível para um produto que está pedindo confiança dos primeiros clientes: cobrança dupla no cartão de quem acabou de decidir apostar em você.

**Why it happens:**
A assinatura vive em dois sistemas e só um deles tem constraint. O checkout Asaas é criado por uma chamada de API sem chave de idempotência do lado da aplicação.

**How to avoid:**
- Antes de criar checkout, **consultar o Asaas** por subscription ativa do `asaas_customer_id` daquele tenant — a fonte de verdade da cobrança é o Asaas, não a sua tabela.
- Gravar `asaas_customer_id` no tenant assim que o customer é criado (reutilizar, nunca criar customer novo a cada tentativa) e usar `externalReference = tenant_id` para reconciliar.
- Persistir a intenção de checkout antes de chamar a API, com o `id` do checkout, e desabilitar o botão via `useFormStatus` (o projeto já usa esse padrão).
- Cancelamento no seu lado **sempre** chama a API do Asaas; nunca só muda `status` local.

**Warning signs:**
- Fluxo de checkout que cria `customer` no Asaas em toda invocação.
- Handler de `SUBSCRIPTION_CREATED` com `on conflict do nothing` sem log.
- Nenhuma tela onde o owner vê "tenant X ↔ subscription Y" para conferir manualmente nos primeiros dias.

**Phase to address:**
Fase de billing.

---

### Pitfall 7: A virada sandbox → produção do Asaas quebra em lugares que o sandbox não consegue simular

**What goes wrong:**
Sandbox e produção são ambientes **totalmente isolados**, com chaves distintas e **irrecuperáveis** (a chave é exibida uma única vez). O que o sandbox esconde:

- **Aprovação de conta é automática no sandbox** (qualquer imagem serve como documento). Em produção a conta precisa passar por verificação real — que é exatamente a dependência externa sem prazo já registrada no PROJECT.md.
- **CPF/CNPJ é validado de verdade em produção.** O campo `cpfCnpj` do `customerData` exige apenas dígitos (11 ou 14). Se o formulário do dashboard aceitar `123.456.789-00` formatado, ou não pedir CPF, o checkout de produção rejeita — e você descobre com o primeiro cliente pagante, não em teste. O projeto **hoje não coleta CPF/CNPJ do profissional em lugar nenhum**: isso é um campo novo no cadastro, não um detalhe de integração.
- **Cartão recusado, antifraude, chargeback** não existem no sandbox. O estado "assinou mas o pagamento falhou" precisa ter tela.
- **Webhook precisa ser recriado** na conta de produção com nova URL e novo `asaas-access-token`. Esquecer isso é o cenário do Pitfall 5 desde o minuto zero.

**Why it happens:**
"Construído em sandbox" (decisão consciente e correta do PROJECT.md) cria a ilusão de que só falta trocar a variável de ambiente.

**How to avoid:**
Escrever a checklist de virada como artefato da fase de billing, não como tarefa improvisada no dia: chave nova salva no gerenciador de segredos, webhook recriado + token, `ASAAS_BASE_URL` parametrizada (não hard-coded), coleta de CPF/CNPJ existindo no formulário com máscara na UI e `replace(/\D/g,'')` antes de enviar (mesmo padrão que o projeto já usa para telefone), e um pagamento real de R$ 1 feito pelo próprio owner antes de convidar qualquer profissional.

**Warning signs:**
- URL do Asaas escrita direto no código em vez de env.
- Nenhum campo de CPF/CNPJ no cadastro do profissional quando o checkout já está pronto.
- A chave de produção nunca foi gerada "porque ainda não precisa" — quando precisar, o fluxo de geração e o comportamento "exibida uma vez" viram surpresa.

**Phase to address:**
Fase de billing (construção em sandbox) + item explícito de "virada de chave" na fase de go-live, com a checklist já escrita.

---

### Pitfall 8: Inadimplência sem prazo vira plano Pro grátis para sempre

**What goes wrong:**
O modelo atual: `status = 'inadimplente'` **mantém os benefícios** e mostra um banner. Não existe carência definida (registrado como "indefinido" no CONCERNS). Sem prazo, `inadimplente` é um estado absorvente: quem para de pagar continua com WhatsApp, personalização e todo o Pro indefinidamente. Como o custo marginal do Pro é real (instância Evolution dedicada por tenant), isso é prejuízo direto, não só receita perdida.

O erro simétrico é pior: implementar o corte e cortar **no mesmo dia** do `PAYMENT_OVERDUE`. Boleto/PIX no Brasil compensam com atraso, cartão tem retry automático do Asaas, e um profissional que perde o WhatsApp por um atraso de 1 dia perde agendamentos — e vira churn com reclamação pública.

**Why it happens:**
A regra de negócio de inadimplência é escrita como "mostra banner" (fácil) e o corte fica para "depois" (nunca).

**How to avoid:**
Decidir e escrever **um número** no roadmap: carência de N dias após `proximo_vencimento` (7 a 15 é o intervalo defensável para o público-alvo), com degradação em degraus — banner → aviso por e-mail → downgrade para Gratuito. Downgrade tem que ser **reversível e não-destrutivo**: os dados de personalização (`cor_marca`/`logo_url`) permanecem na tabela e só param de ser servidos pela sanitização do `obterDadosBookingPublico` (a arquitetura já está certa para isso). E o lembrete de WhatsApp já agendado no QStash para daqui a dois dias precisa de defesa no ponto de disparo, senão o tenant rebaixado continua enviando.

**Warning signs:**
- Nenhuma data no schema que permita calcular "há quantos dias está inadimplente".
- Downgrade implementado como `UPDATE perfis_empresas SET logo_url = NULL` — destrutivo, o cliente perde a arte ao voltar.

**Phase to address:**
Fase de monetização/billing. É decisão de produto, precisa sair da fase de discussão com um número.

---

### Pitfall 9: Domínio novo mandando e-mail para quem nunca se cadastrou é a receita exata do bloqueio

**What goes wrong:**
O VamoAgendar vai fazer, num domínio sem histórico nenhum, exatamente o que os filtros de spam usam para identificar remetente ruim:

- **Destinatário que nunca deu o e-mail para você.** O cliente final digita o e-mail no `/book/[slug]` — para o profissional, não para o VamoAgendar. Ele recebe uma mensagem de um remetente desconhecido. Parcela desses vai clicar em "marcar como spam", e não por má-fé: ele não reconhece o nome. Gmail/Yahoo/Microsoft querem reclamação **abaixo de 0,1%** e tratam **0,3%** como linha vermelha. Com volume baixo no início, **três reclamações em mil e-mails já estouram**.
- **Endereço nunca validado.** Fricção Zero significa nenhum OTP, nenhuma confirmação. Todo erro de digitação (`gmial.com`) vira hard bounce. Bounce alto + domínio novo = pior combinação possível para reputação inicial.
- **DNS mal alinhado.** O Resend faz alinhamento **estrito em DKIM** e relaxado em SPF — ou seja, o DMARC precisa passar via DKIM. DMARC publicado direto em `p=reject` antes de confirmar entrega derruba o próprio e-mail.

**Why it happens:**
"E-mail transacional não é marketing, então não tem problema de reputação." A isenção real que existe (transacional dispensa o one-click unsubscribe do RFC 8058) é sobre **um requisito formal**, não sobre reputação. O filtro não sabe que é transacional; ele sabe que gente marcou como spam.

**How to avoid:**
1. **Remetente que o destinatário reconhece.** O `From` do e-mail para o cliente final deve levar o nome do estabelecimento no display name (`"Studio Marina (via VamoAgendar)" <agendamentos@vamoagendar.com.br>`) e `Reply-To` apontando para o profissional. Isso muda materialmente a taxa de reclamação, porque o cliente reconhece quem agendou.
2. **Assunto e corpo que explicam o contexto na primeira linha**: "Seu horário no Studio Marina está confirmado". Não "Bem-vindo ao VamoAgendar".
3. **SPF + DKIM + DMARC `p=none`** no lançamento, com `rua` apontando para um endereço monitorado. Endurecer para `quarantine` só depois de semanas de relatório limpo.
4. **Subdomínio dedicado para transacional** (`mail.vamoagendar.com.br` ou similar) — isola a reputação do domínio raiz, que você vai querer usar para e-mail próprio e talvez marketing depois.
5. **Suppression list**: webhook de bounce/complaint do Resend gravando o endereço e nunca mais enviando. Sem isso, um endereço morto é reenviado a cada agendamento.
6. **Ramp-up manual**: os primeiros profissionais convidados são também o warm-up. Não convidar 30 no mesmo dia.
7. **Teto do plano Free do Resend**: 100 e-mails/dia, 3.000/mês, 1 domínio. Um profissional com agenda cheia (confirmação + lembrete + recibo) consome isso rápido. O e-mail vai falhar **silenciosamente no melhor dia do lançamento** se ninguém observar a cota.

**Warning signs:**
- Relatório DMARC (`rua`) não configurado → você não tem como saber que está falhando.
- Nenhum log de envio/bounce no produto — sem isso o e-mail tem o mesmo problema do WhatsApp: falha invisível.
- `From` genérico do VamoAgendar em e-mail destinado ao cliente final.

**Phase to address:**
Fase de e-mails transacionais. A configuração de DNS é do owner e bloqueia — deve estar no roadmap como dependência externa com folga de propagação (24-48h), igual ao Asaas.

---

### Pitfall 10: LGPD — o direito de exclusão colide com `ON DELETE CASCADE` e apaga a agenda do profissional

**What goes wrong:**
Um cliente final pede exclusão dos dados (direito do art. 18). A implementação óbvia é `DELETE FROM clientes WHERE id = ...`. Mas `agendamentos.cliente_id` tem `ON DELETE CASCADE`: apagar o cliente **destrói todos os agendamentos dele**, inclusive os já concluídos, inclusive os futuros. O profissional perde histórico e, se o agendamento for futuro, o horário desaparece da agenda dele sem aviso — ele vai simplesmente não atender alguém que ia aparecer.

Há um conflito jurídico real embutido: o registro do atendimento é dado do **profissional** (controlador) para fins fiscais e de defesa em processo — hipóteses que a própria LGPD reconhece para retenção mesmo após pedido de eliminação. Apagar tudo não é o mais conservador; é o mais destrutivo.

Além disso, no papel de **operador**, o VamoAgendar não decide sozinho: o pedido do titular sobre dados inseridos pelo profissional deveria ser encaminhado ao controlador (o profissional), com o VamoAgendar executando a instrução.

**Why it happens:**
`ON DELETE CASCADE` foi escolhido para facilitar limpeza em dev. A LGPD entra na pauta como documento (termos + política) e não como mudança de schema, então ninguém revisita as FKs.

**How to avoid:**
- Implementar exclusão como **anonimização**, não `DELETE`: `nome = 'Cliente removido'`, `telefone = NULL`, `email = NULL`, mantendo o agendamento como registro do atendimento. Preserva a agenda do profissional e satisfaz a finalidade da eliminação (o dado deixa de identificar pessoa). Exige `telefone` virar nullable.
- Revisar todos os `ON DELETE CASCADE` do schema antes do go-live com a pergunta "que dado de terceiro isso destrói?". Já há um caso conhecido (`assinaturas.tenant_id` deveria ser `RESTRICT`) — a varredura completa é barata e precisa acontecer uma vez.
- Definir **base legal por finalidade** e escrever na política: agendamento = execução de contrato/procedimento preliminar a pedido do titular (o cliente final pediu o horário); confirmação e lembrete = execução do mesmo contrato; qualquer coisa promocional = base separada, e hoje não existe. Consentimento não é a base certa aqui e usá-la cria a obrigação de permitir revogação que quebraria o serviço.
- Nomear os **subprocessadores reais** na política: Clerk, Supabase, Railway, Asaas, Resend, Upstash QStash, Evolution API, PostHog — quase todos com transferência internacional, o que exige menção. Política genérica de template que não os cita é falsa.
- Definir e escrever **prazo de retenção**. "Guardamos para sempre" não é uma resposta.
- Canal do encarregado/contato: o `contato@vamoagendar.com.br` já previsto serve, desde que a política diga que serve.

**Warning signs:**
- Política de privacidade gerada por template sem nome de subprocessador.
- Nenhuma rota/procedimento (mesmo manual, mesmo por e-mail) para atender pedido de exclusão — obrigação existe desde o primeiro titular.
- `DELETE FROM clientes` aparecendo em qualquer action.

**Phase to address:**
Fase de obrigações de lançamento (jurídico) **e** uma tarefa de schema na fase de hardening (FKs + `telefone` nullable + rotina de anonimização). São duas coisas, não uma.

---

### Pitfall 11: O pico de divulgação do lançamento é o cenário que mais rápido bane o número do WhatsApp

**What goes wrong:**
Bans em ferramentas não-oficiais (Baileys/Evolution) são tipicamente **permanentes**, não bloqueios temporários. O que acelera:

- **Número novo com volume imediato.** O número que acabou de ser conectado e já dispara dezenas de mensagens é o padrão mais óbvio de abuso. Exatamente o perfil de um profissional que acabou de se cadastrar no lançamento.
- **Mensagens quase idênticas em sequência.** Os templates são do produto; se vários tenants usarem o texto padrão, o mesmo corpo sai de números diferentes — assinatura de disparo em massa.
- **Cadência mecânica.** Confirmação síncrona no instante do agendamento e lembretes disparados pelo QStash caem em horários exatos, sem jitter.
- **Lembrete de madrugada.** `tempo_lembrete_minutos` alto num agendamento das 8h dispara às 2h. Mensagem noturna de número novo é sinal forte, e ainda irrita o cliente (que reporta).
- **Destinatário que nunca conversou com aquele número.** Toda mensagem do VamoAgendar é um primeiro contato outbound. É o padrão de risco mais alto que existe no WhatsApp.
- **Reportar como spam** é o gatilho mais rápido de todos, e um cliente final que não sabe o que é VamoAgendar reporta.

E há a assimetria que torna isso caro: WhatsApp é **o motivo principal de pagar o Pro**. O ban não degrada o produto, ele remove a proposta de valor do plano pago — para o tenant banido, e potencialmente para vários se o padrão de disparo for o mesmo.

**Why it happens:**
Em piloto controlado (o estado atual, validado só com mocks) nada disso aparece. O risco é estritamente função de volume e de "quantos números novos ao mesmo tempo".

**How to avoid:**
- **Escalonar os convites.** O item "primeiros profissionais convidados e ativados com acompanhamento" já está no PROJECT.md; a pesquisa reforça que ele é **também** uma medida técnica de proteção, não só de suporte. Poucos tenants por semana.
- **Jitter no envio.** Atraso aleatório de dezenas de segundos antes da confirmação síncrona e no lembrete. Custa pouco e quebra o padrão fixo.
- **Janela de silêncio.** Não disparar entre ~21h e ~8h no fuso do tenant (a informação de timezone já existe em `perfis_empresas`); reagendar para a abertura da janela.
- **Teto diário por instância**, crescente com a idade da instância. Recusar (e logar) acima do teto em vez de enviar.
- **Variar o texto**: incentivar o profissional a personalizar o template no onboarding, ou variar tokens/saudação por conta própria.
- **Fallback de e-mail já é a mitigação certa.** A regra "e-mail OU WhatsApp" prevista no milestone é, na prática, o plano de continuidade do ban. Vale garantir que o e-mail funcione **antes** de escalar o WhatsApp — ordem de fases importa aqui.
- **Detecção**: `disparos_whatsapp` já existe como log append-only. Falta a leitura: uma taxa de falha por instância que o owner consiga ver. Ban se manifesta como falha em cascata numa instância só.

**Warning signs:**
- Aumento de erro numa instância específica em `disparos_whatsapp`.
- QR Code pedindo reconexão repetidamente (`GET /instance/connect`) — precursor comum.
- Vários tenants ativados na mesma semana com o template padrão intacto.

**Phase to address:**
Não é uma fase de código; é uma **regra de operação do lançamento** que deve estar escrita como critério da fase de ativação dos primeiros profissionais. As mitigações técnicas (jitter, janela de silêncio, teto) são pequenas e cabem na fase de e-mails/mensageria.

---

### Pitfall 12: Supabase Free — a pausa por inatividade é o risco menor; o irreversível é não ter PITR durante o hardening

**What goes wrong:**
O owner aceitou o risco conscientemente, e a análise de risco do PROJECT.md ("pausa é auto-limitante, perda de dados cresce com o sucesso") está correta na direção — mas a pesquisa muda o peso:

- **Pausa (7 dias sem atividade):** derruba todos os `/book/[slug]` simultaneamente. Dados **não** são perdidos; o projeto volta com os dados intactos. Só é irrecuperável pelo Studio se ficar pausado **mais de 90 dias**. Ou seja: é um incidente de disponibilidade, não de dados, e o custo real é a mensagem que o cliente final vê e o profissional descobrindo que o link dele estava morto. **Mitigação custa zero**: qualquer atividade de banco algumas vezes por dia impede a pausa — um cron do QStash (já na stack, já pago) batendo num endpoint que faz um `SELECT 1`. Não precisa de GitHub Actions nem serviço novo.
- **Ausência de backup (retenção zero):** este é o que morde. O sistema de backup de Pro/Team **não roda** no Free — não existe snapshot, não existe PITR. E o risco não vem do sucesso; vem **deste milestone**. As fases planejadas são justamente as que mexem em schema com dados reais: dropar policies, `REVOKE`/`GRANT`, extinguir o plano Plus, remover dados de teste "preservando um tenant do owner", desnormalizar duração, adicionar exclusion constraint. Um `DELETE` sem `WHERE` ou uma migration de limpeza mal filtrada durante a fase de hardening não tem desfazer.

**Why it happens:**
"Free tier" é lido como "mais lento/menor", não como "sem rede de proteção".

**How to avoid:**
- **Keep-alive**: cron QStash → rota que faz uma query trivial. Custo zero, elimina 100% do risco de pausa.
- **Backup próprio**: `pg_dump` agendado (o mesmo cron pode invocar) gravando em storage barato ou até em repositório privado criptografado. É um script, não uma migração de plano.
- **Regra dura de fase**: nenhuma migration destrutiva roda em produção sem um `pg_dump` imediatamente antes, verificado. Isso é mais barato que o plano Pro e cobre o cenário real.
- **Toda limpeza de dados de teste rodada primeiro como `SELECT`** com o mesmo `WHERE`, conferindo a contagem, e só então convertida em `DELETE`.

**Warning signs:**
- A fase de "remover dados de teste" chegando ao roadmap sem item de dump anterior.
- Nenhum dump com data recente quando alguém perguntar.

**Phase to address:**
Fase de go-live/operação — mas o `pg_dump` e o keep-alive precisam existir **antes** da primeira fase que toca schema em produção, não depois. Na prática: são as primeiras tarefas do milestone.

---

### Pitfall 13: Rate limit anti-abuso que bloqueia cliente legítimo (e a ordem que faz ele funcionar)

**What goes wrong:**
Rate limit por IP no booking público falha nos dois sentidos no Brasil: CGNAT de operadora móvel faz clientes diferentes compartilharem IP (bloqueia gente de verdade), e um script com IPs rotativos passa direto. Pior: **enquanto o INSERT `anon` direto na Data API existir, o rate limit na Server Action é decorativo** — o atacante ignora a action inteira. A ordem das fases determina se a proteção funciona ou é teatro.

**Why it happens:**
Rate limit é pensado como middleware genérico ("por IP, 10/min") em vez de proteção de um fluxo de negócio específico.

**How to avoid:**
- Hardening da Data API **primeiro**, rate limit depois. Não é preferência, é dependência.
- Chave composta e por camada: IP (limite folgado), `telefone normalizado` (limite apertado — o mesmo número não agenda 8 vezes em 5 minutos), `tenant_id` (teto de criações por hora, que é o limite que protege a agenda do profissional).
- **Honeypot** — campo escondido que só bot preenche. Fricção zero real: o cliente nunca vê. Ao detectar, responder **sucesso falso** em vez de erro; bot que recebe erro tenta de novo, bot que recebe sucesso vai embora.
- Limite deve produzir **erro observável para o owner**, não só 429 silencioso. Um profissional legítimo bloqueado precisa aparecer em algum lugar.

**Warning signs:**
- Limite calibrado sem olhar dados reais: um salão movimentado pode legitimamente receber vários agendamentos no mesmo minuto ao divulgar o link.
- Rate limit implementado antes de fechar a Data API.

**Phase to address:**
Fase de anti-abuso, **depois** da fase de hardening da Data API.

---

### Pitfall 14: Falha silenciosa por design + zero observabilidade = você é o último a saber

**What goes wrong:**
A regra "se o WhatsApp do tenant estiver desconectado, o fluxo falha silenciosamente para o cliente" é **correta** do ponto de vista de produto (Fricção Zero). Combinada com a ausência de error tracking em produção (registrado no CONCERNS), ela produz um sistema em que quase todo erro é invisível:

- WhatsApp desconectado há 3 dias → cliente não é avisado, profissional não sabe, ninguém reporta.
- Fila do Asaas pausada → assinantes pagando sem acesso.
- Cota do Resend estourada → e-mails param.
- Webhook de lembrete retornando 401 por env faltando → lembretes simplesmente não acontecem.

Cada um desses é silencioso por construção. O detector padrão vira "cliente reclama", e no perfil de usuário do VamoAgendar (profissional autônomo ocupado) ele não reclama: ele volta para o caderninho.

**Why it happens:**
Observabilidade é a única coisa cujo valor só aparece quando algo quebra, e cada falha individualmente parece coberta ("tem o log de disparos").

**How to avoid:**
Não precisa de stack de observabilidade. Precisa de **uma superfície de leitura**: uma página de operação, visível só para o owner, que responda quatro perguntas — instâncias WhatsApp conectadas vs. total, disparos com erro nas últimas 24h, agendamentos criados hoje, e último webhook Asaas recebido. Mais um error tracking gratuito (Sentry free) para exceções não tratadas. É meia fase de trabalho e converte quatro falhas silenciosas em quatro números observáveis.

**Warning signs:**
- Perguntar "quantos agendamentos aconteceram ontem?" e a resposta exigir abrir o SQL editor.
- O critério de sucesso do milestone é "agendamentos reais acontecendo" — se não existe onde ver isso, o critério não é verificável.

**Phase to address:**
Fase de go-live. Pequena, mas é o que torna o critério de sucesso do milestone mensurável — sem ela, o milestone não tem como ser declarado concluído.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|---|---|---|---|
| Manter `USING (true)` em SELECT `anon` e "só" fechar o INSERT | Metade do trabalho, fecha o buraco de escrita | Base de clientes e agenda de todos os tenants continuam raspáveis; vazamento não gera erro, então nunca é detectado | Nunca neste milestone — é o item que o próprio critério de sucesso ("sem incidente de segurança") proíbe |
| Rate limit só na Server Action | Rápido, sem tocar em SQL | Zero proteção real enquanto o INSERT `anon` existir; dá falsa sensação de "protegido" | Só depois do hardening da Data API |
| Processar webhook Asaas sincronamente no handler | Menos código, sem tabela de eventos | Qualquer erro vira 500 → 15 falhas pausam a fila → eventos somem em 14 dias | Nunca — o custo de acertar é uma tabela com PK |
| Exclusion constraint sem `WHERE status <> 'cancelado'` | DDL mais curto | Horário cancelado bloqueia o slot para sempre; bug se manifesta como "sumiu horário" semanas depois | Nunca |
| `ON DELETE CASCADE` como padrão de FK | Limpeza fácil em dev | Exclusão LGPD apaga a agenda do profissional; delete de perfil destrói histórico de billing | Aceitável só em tabelas cujo filho não tem valor para terceiro (ex.: `horarios_funcionamento`) |
| Sem CPF/CNPJ no cadastro porque "sandbox não exige" | Cadastro mais curto | Checkout de produção rejeita no primeiro cliente pagante; campo novo em formulário já em uso | Nunca — coletar desde o começo do checkout |
| Supabase Free sem dump automatizado | R$ 0/mês, decisão já tomada | Nenhuma migration destrutiva tem desfazer, justamente no milestone que mais mexe em schema | Aceitável **com** `pg_dump` manual verificado antes de cada migration destrutiva |
| DMARC direto em `p=reject` para "fazer certo de uma vez" | Um passo a menos | Derruba o próprio e-mail transacional sem sinal claro de causa | Nunca antes de semanas de relatório `rua` limpo |
| Convidar muitos profissionais na mesma semana | Validação mais rápida | Vários números novos disparando ao mesmo tempo = perfil de banimento; e um ban derruba a proposta de valor do Pro | Nunca antes do fallback por e-mail estar funcionando |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|---|---|---|
| Supabase Data API | Confiar em RLS e ignorar `GRANT` — privilégio default do schema `public` expõe tabela nova automaticamente | `ALTER DEFAULT PRIVILEGES ... REVOKE` + `REVOKE SELECT` na tabela + `GRANT SELECT (colunas)` por role, como `assinaturas` já faz |
| Supabase Free | Assumir que "sem backup" = "backup menos frequente" | Retenção é **zero**; `pg_dump` próprio antes de toda migration destrutiva |
| Supabase Free | Achar que a pausa apaga dados | Pausa preserva os dados; só é irrecuperável pelo Studio após 90 dias. O dano é indisponibilidade dos `/book/[slug]` |
| Asaas webhooks | Processar síncrono e devolver o status do processamento | Persistir payload cru com `event.id` como PK → responder 2xx → processar assíncrono |
| Asaas webhooks | Ignorar duplicata assumindo entrega exactly-once | Entrega é **at least once** com o mesmo `id`; `ON CONFLICT DO NOTHING` na tabela de eventos |
| Asaas webhooks | Não configurar `asaas-access-token` (é opcional) | Configurar e comparar em tempo constante; sem ele o endpoint aceita qualquer POST |
| Asaas webhooks | Deixar envio não-sequencial | Marcar sequencial — `PAYMENT_CONFIRMED` chegando depois de `PAYMENT_OVERDUE` inverte o estado da assinatura |
| Asaas API | `cpfCnpj` formatado (`123.456.789-00`) | Só dígitos: 11 (CPF) ou 14 (CNPJ) — mesmo tratamento que o projeto já dá ao telefone |
| Asaas sandbox | Achar que o sandbox valida como produção | Sandbox aprova conta automaticamente e não simula recusa/antifraude/chargeback; chaves e dados são isolados e a key é exibida uma única vez |
| Resend | Publicar DMARC estrito antes de validar entrega | `p=none` + `rua` monitorado; endurecer depois. DMARC do Resend passa via **DKIM** (alinhamento estrito), não via SPF |
| Resend | Ignorar o teto do Free (100/dia, 3.000/mês, 1 domínio) | Monitorar cota; e-mail falha silenciosamente no dia de maior movimento |
| Resend | Sem tratamento de bounce/complaint | Webhook gravando supressão; nunca reenviar para endereço morto (não há OTP validando o que o cliente digitou) |
| QStash | Secret em query string com fallback `'secret-key'` | Verificar `Upstash-Signature` com a lib oficial; **falhar hard** se a env estiver ausente, em vez de cair em default |
| QStash | Agendar lembrete sem reavaliar plano/janela no disparo | Webhook já re-checa status do agendamento; precisa também re-checar plano vigente e janela de horário civilizado |
| Evolution API | Tratar como API com SLA | Sem SLA, ban geralmente permanente; toda funcionalidade precisa de caminho alternativo (e-mail) |
| Clerk Organizations | Assumir que `org_id` sempre existe no token | Usuário sem organização ativa gera claim ausente → toda policy `tenant_id = auth.jwt()->>'org_id'` retorna vazio e o dashboard aparece **vazio, não com erro**. Garantir criação automática da primeira org e tratar o estado sem org |
| PostgreSQL | Esperar `NOT VALID` em exclusion constraint | Só existe para FK, CHECK e NOT NULL; exclusion sempre valida a tabela toda e falha se houver conflito |
| PostgreSQL | Assumir que RLS protege mensagem de erro de constraint | Checagens de integridade bypassam RLS por design; erro pode revelar dado de outro tenant |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|---|---|---|---|
| Tabela de eventos Asaas sem expurgo | Tabela cresce indefinidamente; Free tem 500MB de banco | Job de limpeza de eventos processados > 90 dias | Não pelo volume de billing (dezenas/mês); pelo acúmulo em anos |
| `disparos_whatsapp` append-only sem retenção | Mesma coisa, com volume muito maior (2 disparos por agendamento) | Definir retenção (ex.: 180 dias) desde já | Primeiro tenant com agenda cheia + alguns meses |
| Engine recalculando slots a cada mudança de dia no calendário | Latência visível no booking com muitos agendamentos no mês | Já é aceitável; medir antes de otimizar | Centenas de agendamentos ativos por tenant |
| Índice GiST da exclusion constraint | Escrita mais lenta que btree | Irrelevante nesta escala; a constraint compra correção, o custo é aceitável | Dezenas de milhares de linhas por tenant |
| Queries sequenciais do dashboard (já em CONCERNS) | Dashboard lento no primeiro carregamento | `Promise.all` | Já perceptível; agrava com latência de rede do Free |
| Confirmação de WhatsApp síncrona dentro da Server Action | Cliente final espera o round-trip da Evolution API para ver "confirmado" | Já é um risco de UX hoje; jitter (anti-ban) **agrava** — o jitter precisa ser assíncrono via QStash, não `sleep` no request | Instância lenta ou desconectada com timeout longo |

## Security Mistakes

| Mistake | Risk | Prevention |
|---|---|---|
| Manter `SELECT anon USING (true)` em `perfis_empresas` | Lista completa de clientes do VamoAgendar (com `org_id` do Clerk) raspável por qualquer um; insumo para phishing dirigido aos profissionais | `REVOKE SELECT` + `GRANT` só das colunas que a página pública renderiza; idealmente servir via RPC |
| `SELECT anon USING (true)` em `agendamentos` | Agenda completa de todos os tenants; padrão de movimento de cada negócio | Estreitar para o intervalo consultado e às colunas de ocupação, ou eliminar o acesso `anon` |
| `motivo` de `excecoes_agenda` legível publicamente | Texto livre, potencialmente dado sensível do profissional | Remover `motivo` do GRANT `anon` |
| Erro de constraint repassado à UI pública | Vaza `org_id` e horário de agendamento de terceiro (RLS não cobre erro de integridade) | Capturar `23P01`/`23505` e traduzir; nunca renderizar `error.message` do PostgREST |
| Webhook de lembrete com fallback `'secret-key'` | Endpoint efetivamente aberto se a env faltar em produção — permite disparar WhatsApp arbitrário em nome de tenants | Verificar assinatura QStash; `throw` no boot se a env não existir |
| Webhook Asaas sem verificação de origem | POST forjado marca assinatura como paga → Pro grátis | `asaas-access-token` + comparação em tempo constante |
| `createAdminClient()` (service role) usado sem revalidar tenant | Bypassa RLS inteiramente; um `tenant_id` vindo do request sem validação escreve em qualquer tenant | Todo uso de admin client precisa do `tenant_id` derivado de fonte confiável (slug resolvido no servidor ou `orgId` da sessão), nunca do corpo da requisição |
| Storage sem RLS em `storage.objects` (já em CONCERNS) | Toda a segurança do bucket vive nas actions | Nenhuma escrita de Storage fora de `imagens-perfil.ts`; revisar em code review de qualquer fase que toque upload |
| Dados de teste "removidos preservando um tenant" | `DELETE` mal filtrado em banco sem backup = perda irreversível | `SELECT` com o mesmo `WHERE` + conferência de contagem + `pg_dump` antes |
| Política de privacidade que não nomeia subprocessadores | Declaração falsa sobre transferência internacional de dados | Listar Clerk, Supabase, Railway, Asaas, Resend, Upstash, Evolution, PostHog |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---|---|---|
| E-mail para o cliente final assinado como "VamoAgendar" | Destinatário não reconhece o remetente → marca como spam → derruba a reputação do domínio para todos os tenants | Display name com o nome do estabelecimento, `Reply-To` do profissional, assunto que cita o estabelecimento |
| Erro genérico quando o slot é tomado na corrida | Cliente vê "erro ao agendar" e desiste — é o exato momento de maior intenção | Mensagem específica + recarregar slots automaticamente e manter o cliente no fluxo |
| Corte imediato de acesso no primeiro `PAYMENT_OVERDUE` | Profissional perde WhatsApp por atraso de 1 dia de boleto/retry de cartão e perde agendamentos | Carência definida em dias + degradação em degraus (banner → e-mail → downgrade) |
| Lembrete de WhatsApp de madrugada | Cliente irritado reporta a mensagem — e reporte é o gatilho mais rápido de ban | Janela de silêncio no fuso do tenant, com reagendamento para a abertura |
| "E-mail OU WhatsApp" implementado como dois campos opcionais sem explicação | Cliente preenche nenhum ou não entende por que precisa | Deixar explícito que é para receber a confirmação; validar que ao menos um foi preenchido com mensagem clara |
| Cliente final sem forma de cancelar | Ele simplesmente não aparece; no-show é o custo real do profissional | Fora de escopo neste milestone — mas o canal de contato visível é o mínimo, e vale medir quantos escrevem pedindo cancelamento |
| Profissional descobre que o WhatsApp caiu pelo cliente | Perde confiança no produto inteiro | Falha silenciosa **para o cliente**, ruidosa **para o profissional** — a regra já existe, precisa estar viva no dashboard |

## "Looks Done But Isn't" Checklist

- [ ] **Hardening da Data API:** frequentemente para na remoção das policies de INSERT — verificar com `curl` anônimo que `perfis_empresas`, `agendamentos`, `excecoes_agenda` e `clientes` não devolvem coluna nem linha além do estritamente público
- [ ] **Exclusion constraint:** frequentemente falta a coluna de duração/fim em `agendamentos`, o `btree_gist`, o predicado `status <> 'cancelado'` e o tratamento de `23P01` na action — verificar com dois inserts concorrentes reais
- [ ] **Agendamento manual (walk-in):** a mesma proteção atômica precisa valer em `actions/agendamentos.ts`, não só no fluxo público — verificar que o profissional também recebe erro tratado
- [ ] **Webhook Asaas:** frequentemente falta idempotência por `event.id`, resposta 2xx antes do processamento e verificação do `asaas-access-token` — verificar reenviando o mesmo evento duas vezes e conferindo que nada duplicou
- [ ] **Checkout:** frequentemente falta coleta de CPF/CNPJ e reuso do `asaas_customer_id` — verificar que clicar duas vezes em "Assinar" não gera duas subscriptions no painel Asaas
- [ ] **Inadimplência:** frequentemente falta o prazo de carência e a defesa nos pontos de disparo do WhatsApp — verificar que um tenant rebaixado para de enviar mensagem, inclusive lembrete já agendado no QStash
- [ ] **E-mail transacional:** frequentemente falta o `Reply-To` do profissional, o `rua` do DMARC, o tratamento de bounce e o monitoramento da cota — verificar entrega real em Gmail, Outlook e um domínio corporativo, checando a aba (Principal vs. Promoções vs. Spam)
- [ ] **"E-mail OU WhatsApp":** frequentemente a validação é só no cliente — verificar que a Server Action rejeita os dois vazios
- [ ] **Webhook de lembrete:** frequentemente fica no secret por query string — verificar que sem a env o processo **falha ao subir**, não cai em default
- [ ] **LGPD:** frequentemente para nos documentos publicados — verificar que existe um procedimento executável de exclusão, que ele **não** dispara o cascade em `agendamentos`, e que os subprocessadores reais estão nomeados
- [ ] **Remoção de dados de teste:** frequentemente falta o dump anterior e a conferência por `SELECT` — verificar contagem antes e depois
- [ ] **Métricas de funil:** frequentemente o PostHog fica no-op porque a env não subiu no Railway — verificar um evento real chegando no painel em produção
- [ ] **Keep-alive do Supabase:** frequentemente não existe — verificar que há atividade de banco registrada em todos os últimos 7 dias
- [ ] **Migrations imutáveis:** o hook está pronto em `.claude/hooks/migrations-prod.md` mas desativado — verificar que foi ativado, não só que existe

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---|---|---|
| Vazamento pela Data API descoberto após o lançamento | MEDIUM | Fechar as policies e GRANTs imediatamente (aplicação já não depende delas — as escritas usam admin client, então o risco de quebrar o fluxo é baixo); avaliar o que foi exposto; comunicar os profissionais se houver dado deles envolvido |
| Double-booking real acontecendo | MEDIUM | Query de detecção de sobreposições ativas; contato manual do profissional com um dos clientes; acelerar a constraint. **O dano é de confiança, e é o cenário que mais rápido faz o profissional voltar para o caderninho** |
| Fila do webhook Asaas pausada | MEDIUM se < 14 dias, HIGH depois | Corrigir o handler → reativar a fila no painel → eventos pendentes são reentregues. Passados 14 dias: reconciliar manualmente listando subscriptions/payments pela API e conferindo contra `assinaturas` |
| Cobrança em duplicidade | HIGH (reputacional) | Cancelar a subscription duplicada no Asaas, estornar, comunicar proativamente **antes** do cliente perceber. Com os primeiros clientes, a comunicação franca custa menos que o silêncio |
| Domínio de e-mail com reputação queimada | HIGH — lenta | Parar os envios; corrigir causa (bounce/complaint); usar **subdomínio novo** para transacional e reconstruir devagar. Reputação de domínio não se conserta rápido — por isso o subdomínio dedicado desde o início é barato |
| Número de WhatsApp banido | HIGH para o tenant | Ban costuma ser permanente: novo número, nova instância, novo QR Code, e o profissional perde o número que os clientes conhecem. Mitigação real é o fallback por e-mail funcionando e o escalonamento dos convites |
| Migration destrutiva sem backup | CRÍTICO / potencialmente irreversível | Sem PITR no Free, a recuperação é o último `pg_dump` — se não existir, não há recuperação. **É por isso que o dump precede a primeira fase de schema, não a última** |
| Projeto Supabase pausado | LOW | Retomar pelo painel; dados intactos. Instalar o keep-alive na sequência |
| Exclusion constraint falhando ao aplicar | LOW | A migration falha sem aplicar nada (é transacional); rodar a query de pré-voo, limpar as sobreposições, reaplicar |

## Pitfall-to-Phase Mapping

Nomes de fase são descritivos — o roadmap decide a numeração. A **ordem** entre elas é o que importa e está justificada.

| Pitfall | Prevention Phase | Verification |
|---|---|---|
| `pg_dump` + keep-alive ausentes | **Antes de tudo** — primeira tarefa do milestone | Dump com data recente existe e foi restaurado uma vez em ambiente descartável |
| Leitura `anon` larga demais (perfis, agendamentos, exceções) | Hardening da Data API | `curl` com anon key não devolve coluna/linha além do público em nenhuma das tabelas |
| Escrita `anon` direta (INSERT policies) | Hardening da Data API | POST anônimo em `/rest/v1/agendamentos` retorna 401/403 |
| Tabela nova nascendo exposta | Hardening da Data API | `ALTER DEFAULT PRIVILEGES ... REVOKE` aplicado; tabela de teste criada não aparece na Data API |
| Duração não desnormalizada bloqueando a constraint | Atomicidade do agendamento (pré-requisito) | `agendamentos.duracao_minutos` NOT NULL com backfill conferido |
| Migration de constraint falhando contra dados existentes | Atomicidade + Monetização (mesma regra) | Query de pré-voo executada em produção, resultado registrado no plano da fase |
| Double-booking na corrida | Atomicidade do agendamento | Teste de dois inserts concorrentes: exatamente um sucesso, um erro traduzido |
| Erro de constraint vazando dado de outro tenant | Atomicidade do agendamento | Teste assere a mensagem de domínio, não a do PostgreSQL |
| Duplicata de `clientes` por telefone | Atomicidade do agendamento | Unique `(tenant_id, telefone)` aplicado; upsert atômico substituindo select-then-insert |
| Rate limit decorativo | Anti-abuso — **depois** do hardening | Script de carga não consegue criar agendamentos além do teto, pela action e pela Data API |
| Webhook de lembrete com secret fraco | Anti-abuso / hardening | App não sobe sem `QSTASH_CURRENT_SIGNING_KEY`; POST sem assinatura válida → 401 |
| Webhook Asaas não-idempotente / fila pausável | Billing | Mesmo `event.id` entregue 2x não duplica efeito; handler responde 2xx a payload desconhecido |
| Cobrança em duplicidade | Billing | Dois cliques em "Assinar" → uma subscription no painel Asaas |
| CPF/CNPJ ausente | Billing | Campo existe no cadastro, com máscara na UI e só dígitos no payload |
| Virada sandbox → produção | Billing (checklist escrita) + Go-live (execução) | Pagamento real de valor simbólico feito pelo owner antes do primeiro convite |
| Inadimplência sem prazo | Monetização | Número de dias de carência escrito no schema/código; downgrade testado e reversível |
| Plano Plus com dados legados | Monetização | Query de pré-voo confirma zero linhas `plus`; CHECK apertado aplicado |
| Reputação de e-mail / spam | E-mails transacionais | SPF+DKIM+DMARC `p=none` com `rua` monitorado; entrega verificada em 3 provedores; supressão de bounce funcionando |
| Cota do Resend | E-mails transacionais | Cota observável; comportamento definido ao estourar (não pode falhar em silêncio) |
| Fallback quando o WhatsApp cai | E-mails transacionais — **antes** de escalar convites | Agendamento sem WhatsApp conectado ainda notifica por e-mail |
| Ban do número (jitter, janela de silêncio, teto) | Mensageria / operação | Nenhum disparo fora da janela civil do tenant; intervalo variável entre envios |
| Ban do número (escalonamento) | Ativação dos primeiros profissionais | Convites escalonados; taxa de erro por instância acompanhada |
| Exclusão LGPD destruindo agendamentos | Hardening (schema) + Jurídico (documento) | Rotina de anonimização testada: cliente anonimizado, agendamentos preservados |
| Política/termos genéricos | Obrigações de lançamento | Subprocessadores reais nomeados; base legal por finalidade; prazo de retenção declarado |
| Falhas silenciosas invisíveis | Go-live / observabilidade | Painel do owner responde: instâncias conectadas, erros de disparo 24h, agendamentos hoje, último webhook Asaas |
| Migrations mutáveis em produção | Go-live | Hook de imutabilidade ativado |

## Sources

**Alta confiança (documentação oficial):**
- Asaas — [Sobre os webhooks](https://docs.asaas.com/docs/sobre-os-webhooks), [Como implementar idempotência em Webhooks](https://docs.asaas.com/docs/como-implementar-idempotencia-em-webhooks), [Eventos para assinaturas](https://docs.asaas.com/docs/eventos-para-assinaturas), [Checkout com Assinatura (recorrente)](https://docs.asaas.com/docs/checkout-com-assinatura-recorrente), [Sandbox](https://docs.asaas.com/docs/sandbox), [Chaves de API](https://docs.asaas.com/docs/chaves-de-api)
- PostgreSQL — [ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html) (`NOT VALID` restrito a FK/CHECK/NOT NULL; lock de `ADD CONSTRAINT`), [Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) (checagens de integridade bypassam RLS — aviso de covert channel), [Range Types](https://www.postgresql.org/docs/current/rangetypes.html)
- Supabase — [Securing your API / Data API](https://supabase.com/docs/guides/api/securing-your-api), [Column Level Security](https://supabase.com/docs/guides/database/postgres/column-level-security), [Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing), [Restore project after 90-day pause](https://supabase.com/docs/guides/troubleshooting/restore-project-after-90-days-pause), [Clerk third-party auth](https://supabase.com/docs/guides/auth/third-party/clerk)
- Google — [Email sender guidelines FAQ](https://support.google.com/mail/answer/14229414) (limiares 0,1% / 0,3%; isenção de one-click unsubscribe para transacional)
- Resend — [Implementing DMARC](https://resend.com/docs/dashboard/domains/dmarc), [Account quotas and limits](https://resend.com/docs/knowledge-base/account-quotas-and-limits)

**Média confiança (comunidade e relatos):**
- Evolution API — [Issue #1840 (aquecimento de números)](https://github.com/EvolutionAPI/evolution-api/issues/1840), [Issue #1870 (banimento constante)](https://github.com/EvolutionAPI/evolution-api/issues/1870), [Issue #439 (bloqueio de instância)](https://github.com/EvolutionAPI/evolution-api/issues/439)
- [API Oficial WhatsApp vs Evolution API/Baileys](https://blog.tipefy.com/api-oficial-do-whatsapp-vs-evolution-api-e-baileys-o-que-muda-na-pratica-para-sua-empresa)
- [Postgres Row-Level Security Footguns — Bytebase](https://www.bytebase.com/blog/postgres-row-level-security-footguns/)
- [Supabase RLS Best Practices — Makerkit](https://makerkit.dev/blog/tutorials/supabase-rls-best-practices)
- [Supabase Free Tier Paused and Lost Data — SimpleBackups](https://simplebackups.com/blog/supabase-free-tier-paused)
- [Mailchimp Transactional — Reputation and Rejections](https://mailchimp.com/developer/transactional/docs/reputation-rejections/)

**Baixa confiança — precisa de validação humana:**
- LGPD: [LGPD para SaaS e microSaaS — Together Privacy](https://togetherprivacy.tech/blog/lgpd-para-saas-e-microsaas-cuidados-antes-de-lancar-app), [Controlador ou operador, quem sou eu? — LAPIN](https://lapin.org.br/wp-content/uploads/2021/04/Cartilha-Controlador-ou-Operador-quem-sou-eu-LAPIN.pdf), [Cláusulas LGPD em contratos SaaS](https://legale.com.br/blog/digital-contratos-de-tecnologia-saas-lgpd-guia-de-clausulas-essenciais/). **Nenhuma fonte primária da ANPD sobre este fluxo específico foi localizada.** A recomendação de base legal (execução de contrato para o agendamento, legítimo interesse para lembretes) é defensável e comum no mercado, mas termos de uso e política de privacidade publicados deveriam passar por revisão jurídica humana antes do go-live.

**Verificação contra o código do repositório (HIGH — leitura direta):**
- `supabase/schemas/07_agendamentos.sql` — ausência de coluna de duração/fim; `SELECT anon USING (true)`; `INSERT anon WITH CHECK (tenant_id IS NOT NULL)`; `fk_cliente ON DELETE CASCADE`
- `supabase/schemas/06_clientes.sql` — ausência de unique `(tenant_id, telefone)`; `telefone NOT NULL`
- `supabase/schemas/08_assinaturas.sql` — `uq_assinatura_vigente_por_tenant`; `CHECK (plano IN ('plus','pro'))`; padrão correto de `REVOKE`/`GRANT` por coluna (modelo a replicar)
- `supabase/schemas/01_perfis_empresas.sql` — `SELECT anon USING (true)` sem GRANT por coluna
- `src/app/actions/public-booking.ts` — escrita já usa `createAdminClient()` (as policies de INSERT `anon` são superfície sem função)
- `src/app/api/webhooks/lembrete/route.ts` — secret em query param com fallback `'secret-key'`

---
*Pitfalls research for: SaaS B2B2C de agendamento brasileiro abrindo ao público*
*Researched: 2026-07-20*
