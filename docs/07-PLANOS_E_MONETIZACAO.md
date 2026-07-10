# 07 - Planos e Monetização

Este documento define a regra de negócio do sistema de planos (Gratuito / Plus / Pro) do
**VamoAgendar**: o que cada plano libera, como o plano é trocado durante a fase de testes
(sem checkout real) e o roadmap para a integração de pagamento com o Asaas.

---

## 💳 Tabela de Planos

| Recurso | Gratuito (R$ 0) | Plus (R$ 9,90/mês · R$ 99,90/ano) | Pro (R$ 14,90/mês · R$ 149,90/ano) |
|---|---|---|---|
| Serviços ativos | até 2 | ilimitados | ilimitados |
| Link de agendamento | ✓ (código aleatório) | ✓ | ✓ |
| Link personalizado (slug) | ✕ | ✓ | ✓ |
| Cor personalizada | ✕ | ✓ | ✓ |
| Logo personalizado | ✕ | ✕ | ✓ |
| WhatsApp (confirmação + lembretes) | ✕ | ✕ | ✓ |

Os preços anuais de Plus e Pro exibem o selo visual **"-50%"** (equivalente a 2 meses
grátis frente ao mensal × 12).

> [!NOTE]
> O limite de serviços do Gratuito conta apenas os serviços com `ativo = true`. Um
> downgrade **nunca** desativa serviços automaticamente — apenas bloqueia criar ou
> reativar acima do limite; o próprio tenant escolhe quais 2 permanecem ativos.

---

## ⚠️ Checkout ainda não existe

**Não há pagamento real em produção.** O botão de upgrade em `/dashboard/plano` é
"Em breve" e permanece desabilitado — não existe checkout, nem lista de espera, nem
cobrança automática. Durante a fase de testes, o plano de um tenant é trocado
manualmente via SQL direto no Supabase (ver seção seguinte). A estrutura de dados,
porém, já nasce no formato que a integração Asaas exigirá, para que o checkout futuro
seja apenas "preencher a tabela via webhook" — sem retrabalho de lógica de gating.

---

## 🛠️ Troca manual de plano via SQL (fase de testes)

A tabela `assinaturas` não possui política de escrita para `authenticated`/`anon` —
apenas o dono do banco (via SQL manual agora, via webhook do Asaas com `service_role`
no futuro) pode alterar o plano de um tenant. Isso torna o plano **infraudável** pelo
cliente através da API.

```sql
-- Ativar Pro mensal para um tenant
insert into assinaturas (tenant_id, plano, ciclo, valor, status)
values ('org_XXXX', 'pro', 'MONTHLY', 14.90, 'ativa');

-- Simular inadimplência
update assinaturas set status = 'inadimplente' where tenant_id = 'org_XXXX';

-- Voltar ao Gratuito
update assinaturas set status = 'cancelada' where tenant_id = 'org_XXXX';
```

- **Ativar**: insere uma linha com `status = 'ativa'` no plano e ciclo desejados. O
  `valor` é livre (não há validação cruzada com `src/lib/planos.ts` no banco — é
  responsabilidade de quem roda o SQL manter consistência).
- **Simular inadimplência**: apenas atualiza `status` para `'inadimplente'` na linha
  vigente. O tenant **mantém todos os benefícios do plano**; o único efeito visível é o
  banner de pagamento pendente no dashboard.
- **Voltar ao Gratuito**: atualiza `status` para `'cancelada'`. Como o Gratuito é a
  **ausência de linha vigente** (nenhuma linha com `status IN ('ativa', 'inadimplente')`
  para aquele tenant), cancelar a assinatura é suficiente — não é preciso apagar a linha.

Um **índice único parcial** (`uq_assinatura_vigente_por_tenant`, sobre
`status IN ('ativa', 'inadimplente')`) impede que um tenant tenha duas assinaturas
vigentes simultâneas: para trocar de plano diretamente (ex.: Plus → Pro) é preciso
cancelar a linha atual antes de inserir a nova.

---

## 📍 Fonte da verdade no código

- **`src/lib/planos.ts`** — objeto congelado `PLANOS` com os 3 planos: id, nome, preço
  mensal/anual, selo de desconto, `limiteServicosAtivos` (`2` no Gratuito, `null` =
  ilimitado) e as flags de recursos (`linkPersonalizado`, `corPersonalizada`,
  `logoPersonalizado`, `whatsapp`). **UI e validações leem exclusivamente daqui** —
  alterar preço ou limite é alterar este arquivo, nunca duplicar o valor em outro lugar.
- **`src/lib/assinaturas.ts`** — resolve o plano vigente de um tenant a partir da tabela
  `assinaturas`:
  - `obterAssinaturaVigente(supabase, tenantId)` — para contextos autenticados (B2B).
    Retorna `{ plano, inadimplente, urlFaturaPendente }`.
  - `obterPlanoVigentePublico(supabase, tenantId)` — variante enxuta para o fluxo
    público (role `anon`), que só consegue ler `tenant_id`/`plano`/`status` por causa do
    GRANT por coluna (ver seção seguinte). Retorna apenas o `PlanoId`.

### Enforcement nas Server Actions (única camada de escrita)

- **`src/app/actions/servicos.ts`** — ao criar um serviço ativo ou reativar um inativo,
  conta os serviços `ativo = true` do tenant contra `PLANOS[plano].limiteServicosAtivos`;
  excedeu o limite → erro amigável com CTA para `/dashboard/plano`.
- **`src/app/actions/perfis-empresas.ts`** — o perfil é **auto-provisionado** no
  primeiro acesso ao dashboard (`obterPerfilEmpresa` cria a linha com o nome da
  organização no Clerk e um slug aleatório, gravado também em `slug_gratuito`),
  garantindo que todo tenant nasça com link de agendamento. **Slug efetivo por plano**
  (`obterSlugEfetivo` em `src/lib/planos.ts`): com link personalizado vale `slug`;
  sem o recurso vale `slug_gratuito` — num downgrade, o link customizado **para de
  resolver imediatamente** em `/book/[slug]` (validação em `obterDadosBookingPublico`),
  mas fica **reservado** e volta a valer num re-upgrade. No Gratuito a action rejeita
  alterações de slug; Plus/Pro editam livremente. Salvar `cor_marca` exige Plus ou
  superior. O **logo não é input do usuário**: para tenants Pro com a preferência
  `exibir_logo` ligada (toggle na agenda, exclusivo do Pro), `salvarPerfilEmpresa`
  sincroniza em `logo_url` o logo da organização configurado no Clerk
  (`organization.imageUrl`, apenas se `hasImage`); caso contrário, `logo_url` fica nulo.
- **`src/app/actions/whatsapp.ts`** — todas as actions de conexão/configuração exigem
  Pro (`PLANOS[plano].recursos.whatsapp`).

### Defesa em profundidade nos disparos

Mesmo com a instância do WhatsApp conectada, um tenant rebaixado não deve continuar
disparando mensagens. Por isso o plano é revalidado também nos pontos de disparo, além
das Server Actions de configuração:

- **`src/app/actions/public-booking.ts`** — antes de enviar a confirmação síncrona,
  verifica `PLANOS[plano].recursos.whatsapp` via `obterPlanoVigentePublico`.
- **`src/app/api/webhooks/lembrete/route.ts`** — antes de disparar o lembrete
  assíncrono agendado no QStash, repete a mesma verificação.

Em ambos os casos, se o tenant não tiver mais o plano Pro, o envio é pulado
silenciosamente — o agendamento em si nunca falha por causa do plano (Fricção Zero para
o cliente final).

---

## 🚦 Regra de inadimplência

Quando a assinatura vigente está com `status = 'inadimplente'`:

- O tenant **mantém todos os benefícios do plano contratado** — nada é bloqueado ou
  degradado automaticamente.
- Um **banner persistente** aparece em todas as telas do dashboard (renderizado no
  layout, não em páginas isoladas): "Não foi possível realizar seu pagamento — resolva
  o mais rápido possível", com link para `url_fatura_pendente ?? '/dashboard/plano'`.
- Não há período de carência formal nem downgrade automático nesta fase — essas regras
  ficam definidas apenas quando o billing real (Asaas) entrar em produção.
- `status = 'cancelada'` (manual ou, futuramente, via webhook de estorno/chargeback)
  equivale ao plano Gratuito: sem linha vigente, sem benefícios pagos.

---

## 🗺️ Roadmap da integração Asaas (fora do escopo atual)

A estrutura da tabela `assinaturas` já nasce no formato que a API do Asaas exige, para
que a implementação futura seja apenas "o webhook escreve na tabela" — sem alterar
nenhuma regra de gating já implementada.

1. **Customer**: `POST /v3/customers` (nome + CPF/CNPJ obrigatórios) → guardar o
   `cus_...` retornado em `asaas_customer_id`.
2. **Subscription**: `POST /v3/subscriptions` com `customer`, `billingType`
   (`PIX`/`BOLETO`/`CREDIT_CARD`), `value`, `cycle` (`MONTHLY`/`YEARLY` — por isso a
   coluna `ciclo` já usa esse enum) e `nextDueDate` → guardar o `sub_...` retornado em
   `asaas_subscription_id`.
3. **Webhook `/api/webhooks/asaas`** (a criar; validar o header
   `asaas-access-token`) — cada evento escreve na tabela `assinaturas`:
   - `PAYMENT_CONFIRMED` / `PAYMENT_RECEIVED` → `status = 'ativa'`, atualiza
     `proximo_vencimento`, limpa `url_fatura_pendente`;
   - `PAYMENT_OVERDUE` → `status = 'inadimplente'`, salva o `invoiceUrl` recebido em
     `url_fatura_pendente`;
   - `PAYMENT_REFUNDED` / `PAYMENT_CHARGEBACK_REQUESTED` → `status = 'cancelada'`.
4. **Sandbox**: `api-sandbox.asaas.com`, para testar o fluxo completo antes de ir a
   produção.

Nenhuma regra de gating muda quando essa integração for implementada — o webhook apenas
passa a escrever automaticamente na mesma tabela que hoje é editada via SQL manual.

---

## 🔒 Recursos preparados mas não implementados

- **`cor_marca`** e **`logo_url`** já existem como colunas em `perfis_empresas` e na UI
  do dashboard (cor como campo bloqueado por cadeado — Plus+; logo como preview do logo
  da organização no Clerk, sincronizado no save para tenants Pro). **A página pública de
  booking (`/book/[slug]`) ainda não consome esses valores** — aplicar a cor
  personalizada e o logo no booking público
  está fora do escopo desta etapa.
- O **link personalizado (slug editável)** já é gated corretamente nas Server Actions,
  mas a experiência de "reivindicar" um slug amigável na UI segue simples (campo de
  texto com validação), sem sugestões automáticas ou verificação de disponibilidade em
  tempo real.
