# Design: Sistema de Planos (Gratuito / Plus / Pro)

**Data**: 2026-07-09 · **Status**: aprovado pelo usuário

## Contexto e objetivo

O app está funcional com tudo liberado para todos os tenants. Este design prepara o
sistema de planos com limites e gating de recursos, **sem checkout nem pagamento real**.
Durante os testes, o plano é alterado manualmente via SQL no Supabase. A estrutura nasce
no formato que a integração Asaas vai exigir, para que o checkout futuro seja apenas
"preencher a tabela via webhook" — sem migração de lógica.

## Decisões de produto (confirmadas com o usuário)

1. **Escopo**: estrutura + gating. Cor personalizada e logo ganham colunas no banco e
   campos bloqueados na UI, mas a página pública de booking ainda não os consome.
2. **Link no Free**: código aleatório opaco (ex.: `/book/x7k2m9qa`). Slug editável é
   recurso Plus/Pro.
3. **WhatsApp**: a integração inteira (conexão, confirmação, lembrete) é exclusiva do
   plano Pro.
4. **Limite de serviços no Free (2)**: conta apenas serviços `ativo = true`. Downgrade
   não desativa nada — apenas bloqueia criar/reativar acima do limite; o tenant escolhe
   quais 2 ficam ativos.
5. **CTA de upgrade**: botão "Em breve" desabilitado (sem checkout, sem lista de espera).
6. **Inadimplência**: o tenant **mantém os benefícios do plano**, mas um banner
   persistente aparece em todo o dashboard: "Não foi possível realizar seu pagamento —
   resolva o mais rápido possível" com link para a fatura pendente (Asaas `invoiceUrl`;
   enquanto não existe, aponta para `/dashboard/plano`). Período de carência formal fica
   para quando o billing real entrar. `cancelada` = Gratuito.

## Tabela de planos

| Recurso | Gratuito (R$ 0) | Plus (R$ 9,90/mês · R$ 99,90/ano) | Pro (R$ 14,90/mês · R$ 149,90/ano) |
|---|---|---|---|
| Serviços ativos | até 2 | ilimitados | ilimitados |
| Link de agendamento | ✓ (código aleatório) | ✓ | ✓ |
| Link personalizado (slug) | ✕ | ✓ | ✓ |
| Cor personalizada | ✕ | ✓ | ✓ |
| Logo personalizado | ✕ | ✕ | ✓ |
| WhatsApp (confirmação + lembretes) | ✕ | ✕ | ✓ |

Selo visual "-50%" nos preços anuais de Plus e Pro.

## Arquitetura

### 1. Banco — novo schema declarativo `supabase/schemas/08_assinaturas.sql`

```
assinaturas
  id                     uuid PK default gen_random_uuid()
  tenant_id              text NOT NULL REFERENCES perfis_empresas(tenant_id) ON DELETE CASCADE
  plano                  text NOT NULL CHECK (plano IN ('plus','pro'))
  ciclo                  text NOT NULL CHECK (ciclo IN ('MONTHLY','YEARLY'))   -- enum idêntico ao Asaas
  valor                  numeric(10,2) NOT NULL
  status                 text NOT NULL CHECK (status IN ('ativa','inadimplente','cancelada'))
  asaas_customer_id      text NULL      -- cus_..., preenchido quando o checkout existir
  asaas_subscription_id  text NULL      -- sub_..., idem
  proximo_vencimento     date NULL      -- espelho do nextDueDate do Asaas
  url_fatura_pendente    text NULL      -- invoiceUrl do pagamento em atraso (banner de inadimplência)
  created_at / updated_at timestamptz
```

- Índice único parcial: **uma** assinatura com `status IN ('ativa','inadimplente')` por
  tenant.
- **Plano Gratuito = ausência de linha vigente** (igual será com billing real).
- **RLS**: SELECT para `authenticated` do próprio tenant
  (`tenant_id = (SELECT auth.jwt() ->> 'org_id')`). **Nenhuma** política de escrita para
  `authenticated`/`anon` — escreve apenas o dono do banco (SQL manual agora, webhook
  Asaas com `service_role` depois). Plano infraudável pelo cliente.

### 2. Colunas preparatórias em `perfis_empresas`

`cor_marca text NULL` e `logo_url text NULL`. A UI exibe os campos bloqueados por
cadeado; o booking público ainda não os usa.

### 3. Fonte da verdade — `src/lib/planos.ts`

Objeto congelado exportando os 3 planos: id, nome, preço mensal/anual, selo de desconto,
`limiteServicosAtivos` (`2` no Free, `null` = ilimitado) e flags de recursos
(`linkPersonalizado`, `corPersonalizada`, `logoPersonalizado`, `whatsapp`). **UI e
validações leem exclusivamente daqui.**

### 4. Leitura do plano — `src/lib/assinaturas.ts` (server-only)

`obterAssinaturaVigente(supabase, tenantId)` retorna
`{ plano: 'gratuito' | 'plus' | 'pro', inadimplente: boolean, urlFaturaPendente: string | null }`:

- assinatura `ativa` → plano dela, `inadimplente: false`;
- assinatura `inadimplente` → plano dela, `inadimplente: true` (benefícios mantidos +
  banner);
- nada / `cancelada` → `gratuito`.

### 5. Enforcement (Server Actions — única camada de escrita)

- **`servicos.ts`**: criar serviço ativo ou reativar inativo conta os `ativo = true`
  do tenant; excedeu o limite do plano → erro amigável com CTA de upgrade.
- **`perfis-empresas.ts`**: no Free, o slug é gerado aleatoriamente na criação do perfil
  e a action rejeita alterações de slug; Plus/Pro editam livremente. Salvar `cor_marca`
  exige Plus+; `logo_url` exige Pro.
- **`whatsapp.ts`**: todas as actions exigem Pro. Defesa em profundidade: o disparo da
  confirmação (public-booking) e o webhook do lembrete também verificam o plano — tenant
  rebaixado com WhatsApp conectado para de enviar silenciosamente, sem quebrar o
  agendamento.

### 6. UI

- **`/dashboard/plano`** (nova página): 3 cards com preços, selo -50% no anual, recursos
  com ✓/🔒, plano atual destacado, botão "Em breve" desabilitado. Item "Plano" na
  sidebar com badge do plano atual.
- **Banner de inadimplência**: renderizado no layout do dashboard quando
  `inadimplente = true`, presente em todas as telas, linkando para
  `url_fatura_pendente ?? /dashboard/plano`.
- **Serviços**: contador "N/2 serviços ativos · plano Gratuito"; botão de criar/ativar
  desabilitado no limite com link para `/dashboard/plano`.
- **Agenda/perfil**: campo slug com cadeado "Plus" no Free; campos cor (cadeado "Plus")
  e logo (cadeado "Pro") visíveis porém desabilitados conforme o plano.
- **WhatsApp**: tela de upsell no lugar do conteúdo para não-Pro.
- Padrão de dados: o `page.tsx` (Server Component) busca o plano e passa como prop;
  componentes client não decidem gating sozinhos.

## Integração Asaas futura (fora do escopo, guia para não virar gambiarra)

Pesquisado na documentação oficial do Asaas (2026-07):

1. **Customer**: `POST /v3/customers` (nome + CPF/CNPJ obrigatórios) → guardar `cus_...`
   em `asaas_customer_id`.
2. **Subscription**: `POST /v3/subscriptions` com `customer`, `billingType`
   (`PIX`/`BOLETO`/`CREDIT_CARD`), `value`, `cycle` (`MONTHLY`/`YEARLY` — por isso o
   enum da coluna `ciclo`), `nextDueDate` → guardar `sub_...` em
   `asaas_subscription_id`.
3. **Webhook `/api/webhooks/asaas`** (validar header `asaas-access-token`):
   - `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED` → `status = 'ativa'`, atualiza
     `proximo_vencimento`, limpa `url_fatura_pendente`;
   - `PAYMENT_OVERDUE` → `status = 'inadimplente'`, salva `invoiceUrl` em
     `url_fatura_pendente`;
   - `PAYMENT_REFUNDED`/`PAYMENT_CHARGEBACK_REQUESTED` → `status = 'cancelada'`.
4. Sandbox: `api-sandbox.asaas.com`.

Nada do gating muda quando isso for implementado — o webhook apenas escreve na tabela
que este design cria.

## Troca manual de plano (fase de testes)

```sql
-- Ativar Pro mensal para um tenant
insert into assinaturas (tenant_id, plano, ciclo, valor, status)
values ('org_XXXX', 'pro', 'MONTHLY', 14.90, 'ativa');

-- Simular inadimplência
update assinaturas set status = 'inadimplente' where tenant_id = 'org_XXXX';

-- Voltar ao Gratuito
update assinaturas set status = 'cancelada' where tenant_id = 'org_XXXX';
```

## Fora do escopo

Aplicar cor/logo no booking público, checkout, webhook Asaas, período de carência
formal, e-mails de cobrança, lista de espera.

## Documentação de negócio

Além deste spec, a implementação cria `docs/07-PLANOS_E_MONETIZACAO.md` (padrão de
numeração do projeto) com: tabela de planos, aviso de que checkout não existe, SQL de
troca manual, localização da fonte da verdade (`src/lib/planos.ts`) e o roadmap Asaas
acima.
