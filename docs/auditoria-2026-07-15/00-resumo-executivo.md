---
status: temporario
gerado: 2026-07-15 19:12
agente: orquestrador
modelo: fable-5
---

# Resumo executivo — Auditoria VamoAgendar (2026-07-15)

Consolidação dos 8 relatórios desta pasta. Cada afirmação abaixo tem detalhe, evidência
(arquivo:linha) e correção sugerida no relatório de origem, indicado entre parênteses.

## Os 5 achados mais importantes da auditoria

1. **A Data API do Supabase é uma porta lateral aberta que invalida toda a validação da
   aplicação** ([[03-seguranca]], C1+C2). As policies RLS de INSERT para `anon` em
   `agendamentos`/`clientes` exigem apenas `tenant_id IS NOT NULL`, e o SELECT público de
   `agendamentos` é `USING (true)`: qualquer pessoa com a publishable key (pública por
   design) cria agendamentos falsos em qualquer tenant sem passar pela engine de
   disponibilidade e lê a agenda completa de todos os tenants sem autenticação. A aplicação
   Next.js é cuidadosa (toda Server Action valida `orgId`), mas isso é irrelevante enquanto
   o banco aceitar requisições diretas com essas políticas. Já estava mapeado em
   PENDENCIAS.md; confirmado como **ainda não corrigido**.

2. **Double-booking só é impedido por check-then-act em código** ([[04-banco]], CRÍTICO).
   A engine re-executa a checagem de disponibilidade antes do INSERT, mas não há constraint
   de exclusão no banco (`EXCLUDE USING gist`): duas requisições simultâneas criam dois
   agendamentos no mesmo horário. Combinado com o achado 1, o double-booking nem precisa de
   race — basta um INSERT direto na Data API. Agrava: `agendamentos` não tem nenhum índice
   além da PK, e `duracao_minutos`/`preco` não são fotografados no agendamento (editar um
   serviço altera retroativamente a disponibilidade de agendamentos confirmados).

3. **Não há como cobrar de ninguém hoje** ([[07-features]], [[02-arquitetura]]). Asaas tem
   zero código no repositório (os próprios docs internos divergem sobre isso). Checkout e
   cancelamento de assinatura self-service são pré-requisitos de lançamento, esforço G. Os
   preços concebidos em `planos.ts` (R$ 9,90/14,90) estão 5–8x abaixo do piso de mercado —
   sinalizam produto amador, não produto barato ([[08-precificacao]], [[06-mercado]]).

4. **"WhatsApp-first" não corresponde ao código e nem seria diferencial** ([[05-ux-produto]],
   [[06-mercado]]). O produto é web-first com notificação de saída acoplada (só `sendText`,
   zero webhook de entrada). E lembrete por WhatsApp já é feature esperada do setor (Trinks,
   AppBarber, Avec têm). O diferencial real e defensável é outro: **WhatsApp incluso na
   mensalidade sem metering** (Evolution self-hosted, custo marginal ≈ R$ 0) — nenhum
   concorrente pesquisado oferece isso; todos cobram mensagem à parte, e "cobrança
   inesperada" é o padrão nº 1 de reclamação do segmento.

5. **O booking B2C perde conversão no último passo e o cliente final é um beco sem saída**
   ([[05-ux-produto]]). A UI promete "WhatsApp OU e-mail" mas a action exige telefone sempre
   (`public-booking.ts:33` vs `BookingWizard.tsx:157`) — erro genérico exatamente no momento
   da conversão. Depois de agendar, o cliente final não tem canal nenhum: não cancela, não
   remarca, e o `telefone_contato` do estabelecimento é buscado mas nunca renderizado.
   No-show sem tratamento (nem status no schema) é o maior risco silencioso de MRR.

## Todos os CRÍTICOS de segurança (nominal)

- **C1** — INSERT anônimo em `agendamentos`/`clientes` contorna toda a Server Action
  (policy exige só `tenant_id IS NOT NULL`; criação de registros falsos em qualquer tenant
  via Data API).
- **C2** — SELECT público sem filtro de tenant em `agendamentos` (`USING (true)`, todas as
  colunas; agenda de todos os tenants exposta sem autenticação).
- **C3** — Webhook de lembrete (`/api/webhooks/lembrete`) com autenticação fraca: secret em
  query string, fallback hardcoded `'secret-key'` nos dois lados, sem verificação da
  assinatura QStash (`Upstash-Signature`).

Fora da lista de segurança, mas de gravidade equivalente: o CRÍTICO de banco (double-booking
sem constraint) e o ALTO A1 de segurança (vazamento do `instance_token` da Evolution API
para o browser em `src/app/actions/whatsapp.ts`).

## As 3 ações de maior retorno

1. **Fechar a Data API**: reescrever as policies `anon` (INSERT com validação real ou mover
   criação para service_role; SELECT sem `USING (true)`), corrigir o webhook (assinatura
   QStash, sem fallback) e parar de retornar `instance_token` ao client. É a fronteira entre
   "demo" e "produto que pode ter cliente". Esforço P/M, retorno absoluto.
2. **Duas correções P de conversão**: aceitar e-mail sem telefone no booking (ou ajustar a
   UI para exigir telefone) e renderizar `telefone_contato` como link `wa.me`. Menor esforço
   de toda a auditoria, impacto direto no funil.
3. **Integridade no banco**: `EXCLUDE USING gist` contra double-booking, snapshot de
   `duracao_minutos`/`preco` no agendamento, índices `(tenant_id, data_hora)` em
   `agendamentos` e `(tenant_id, telefone)` UNIQUE em `clientes`. Fase DEV permite schema
   limpo — é o momento mais barato da vida do produto para fazer isso.

## Recomendação de plano e preço

Plano único **Pro a R$ 59,90/mês** (anual R$ 599 ≈ 17% de desconto; fundador R$ 39,90
vitalício para os ~50 primeiros), trial de **14 dias sem cartão** caindo para gratuito
residual (vitrine sem WhatsApp) — eliminar o plano Plus. Break-even da infra fixa
(≈ R$ 258,50/mês) com **5 pagantes**; detalhes e contas em [[08-precificacao]].

## A que distância este produto está de cobrar mensalidade

Mais perto do que a lista de achados sugere em experiência — dashboard maduro e mobile-first
de verdade, booking genuinamente fricção zero, mensageria de saída sólida, schema sem drift —
e mais longe do que parece em fundação: hoje não é possível receber **um real** (Asaas não
existe no código) e não seria responsável receber (a Data API aceita escrita e leitura
anônimas em dados de todos os tenants). A ordem do que falta é: (1º) os 3 CRÍTICOS de
segurança + `instance_token`, porque nenhum cliente pagante pode existir antes disso;
(2º) constraint de double-booking e índices, porque o primeiro conflito real destrói a
confiança que vende o produto; (3º) o bug telefone/e-mail e o canal de contato do cliente
final, porque é conversão vazando no último passo; (4º) checkout Asaas com cancelamento
self-service, porque é o que transforma tudo em receita; (5º) reposicionar preço antes do
primeiro cliente, porque R$ 9,90 é âncora da qual é caro sair depois. Nada disso é pesquisa
ou incerteza — é execução conhecida, majoritariamente P/M, com um único item G (Asaas). O
produto tem uma tese de diferenciação real (WhatsApp incluso sem metering), mas ela só vale
depois que a fundação parar de vazar.
