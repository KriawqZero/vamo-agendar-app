---
phase: 5
slug: contato-flexivel-no-booking
status: context_gathered
created: 2026-08-08
---

# Phase 05 — Contato flexível no booking

> Contexto e decisões de implementação coletadas durante a discussão da fase com o usuário.
> Guia a pesquisa (`/gsd-plan-phase`) e o planejamento.

---

## Domain Boundary

Permitir que o cliente final conclua agendamentos públicos informando WhatsApp, E-mail ou ambos, recebendo as confirmações e lembretes pelos canais informados sem que o tempo de resposta da UI seja impactado pela latência de transporte externo.

---

## Canonical Refs

- [ROADMAP.md](file:///home/marcilio/Files/VamoAgendar/vamo-agendar-app/.planning/ROADMAP.md) — Phase 5 specs and requirements (BOO-01, BOO-02, BOO-03, EML-03)
- [REQUIREMENTS.md](file:///home/marcilio/Files/VamoAgendar/vamo-agendar-app/.planning/REQUIREMENTS.md) — Requisitos funcionais de booking e e-mail
- [src/app/actions/public-booking.ts](file:///home/marcilio/Files/VamoAgendar/vamo-agendar-app/src/app/actions/public-booking.ts) — Action de criação de agendamento público
- [src/app/book/[slug]/etapas/EtapaContato.tsx](file:///home/marcilio/Files/VamoAgendar/vamo-agendar-app/src/app/book/[slug]/etapas/EtapaContato.tsx) — Form de dados de contato do cliente
- [src/lib/email/enviar.ts](file:///home/marcilio/Files/VamoAgendar/vamo-agendar-app/src/lib/email/enviar.ts) — Transporte de e-mail via Resend

---

## Decisions Captured

### 1. Validação & Campos no Formulário (BOO-01)
- **Campos**: Nome (obrigatório), WhatsApp (opcional com máscara), E-mail (opcional com sintaxe válida).
- **Regra de Obrigatoriedade**: Deve ser fornecido **pelo menos um meio de contato** (WhatsApp OU E-mail).
- **Rejeição**: Caso ambos os campos estejam vazios, o formulário na UI (`EtapaContato.tsx`) e a Server Action (`public-booking.ts`) bloqueiam o envio e retornam a mensagem: `"Informe pelo menos um meio de contato (WhatsApp ou E-mail) para confirmar o agendamento."`.

### 2. Deduplicação e Sanitização de Clientes (BOO-02)
- **Alteração de Schema**: A coluna `telefone` na tabela `clientes` passa a ser `NULLABLE`, acrescida de constraint `CHECK (telefone IS NOT NULL OR email IS NOT NULL)`.
- **Ordem de Busca (Lookup)**:
  1. Tenta buscar cliente existente no tenant pelo `telefone` (normalizado).
  2. Caso não encontre (ou `telefone` ausente), busca pelo `email` (normalizado em minúsculas).
  3. Caso encontre registro existente, reaproveita o `cliente_id` e atualiza o dado ausente (ex: insere o e-mail no cliente achado por telefone).
  4. Caso não encontre nenhum registro, cria uma nova linha em `clientes`.

### 3. Envio Assíncrono & Canais de Notificação (BOO-03, EML-03)
- **Envio nos Canais Informados**:
  - Se o cliente informou apenas WhatsApp: dispara confirmação via WhatsApp.
  - Se o cliente informou apenas E-mail: dispara confirmação via E-mail (assunto: `"<Estabelecimento> via VamoAgendar: Agendamento Confirmado"`).
  - Se o cliente informou AMBOS os canais: dispara confirmação em **ambos** (WhatsApp E E-mail).
- **Execução Assíncrona (`after()`)**:
  - O envio de e-mail/WhatsApp e o agendamento de lembrete no QStash são desacoplados do request principal e movidos para `after()` do Next.js.
  - A Server Action grava o agendamento no banco de dados e retorna `ok: true` imediatamente, garantindo a exibição instantânea da tela de sucesso na UI do cliente final.
  - Erros em transportes de e-mail/WhatsApp são tratados via observabilidade (`reportarFalhaSilenciosaAguardando` / Sentry) e jamais revertem o agendamento gravado.

---

## Code Context

- `src/app/actions/public-booking.ts`: Atualizar RPC / query de busca de cliente e envolver notificação em `after()`.
- `supabase/migrations/`: Migration SQL para tornar `clientes.telefone` nullable com `CHECK (telefone IS NOT NULL OR email IS NOT NULL)`.
- `src/app/book/[slug]/etapas/EtapaContato.tsx`: Reintroduzir o campo de e-mail opcional e aviso de "pelo menos um contato".
