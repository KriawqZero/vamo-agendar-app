# Phase 2: Integridade da agenda - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-23
**Phase:** 02-integridade-da-agenda
**Areas discussed:** Dedupe de cliente reincidente, Duração na remarcação, Colisão no walk-in do dashboard, Backfill dos agendamentos atuais

---

## Dedupe de cliente reincidente (AGE-05)

| Option | Description | Selected |
|--------|-------------|----------|
| Preencher só o que falta (COALESCE) | Nunca sobrescreve dado já gravado; captura e-mail que antes faltava. Insumo para a Phase 5. | ✓ |
| Preservar tudo (comportamento de hoje) | ON CONFLICT DO NOTHING. Zero mudança, mas nunca grava e-mail novo. | |
| Atualizar sempre para o mais recente | DO UPDATE de nome/e-mail. Risco: página pública sobrescreve nome curado pelo profissional. | |

**User's choice:** Preencher só o que falta (COALESCE)
**Notes:** Decisão olha para a Phase 5 — reconhecimento por e-mail — sem deixar o cliente final sobrescrever dado curado no dashboard.

---

## Duração na remarcação (AGE-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Manter a duração original reservada | novo término = novo início + duração congelada. Coerente com o goal da fase. | ✓ |
| Pegar a duração atual do serviço | Recalcula com a duração vigente (comportamento de hoje, `|| 30`). Reabre parcialmente o bug. | |

**User's choice:** Manter a duração original reservada
**Notes:** —

---

## Colisão no walk-in do dashboard (SC3/SC4)

| Option | Description | Selected |
|--------|-------------|----------|
| Aviso amigável + recarregar a agenda | Mensagem clara de conflito + agenda recarregada. Sem consulta extra. | |
| Aviso com detalhe do que ocupa | Mostra o agendamento conflitante (cliente/serviço). Legítimo por ser a agenda dele. | ✓ |
| Mesmo tratamento do fluxo público | Reusa `slot_indisponivel` e a cópia genérica do cliente final. | |

**User's choice:** Aviso com detalhe do que ocupa
**Notes:** Assimetria B2B/B2C intencional — o profissional é dono da agenda e pode ver o próprio conteúdo. Requer buscar o agendamento conflitante ao receber `23P01`.

---

## Backfill dos agendamentos atuais

| Option | Description | Selected |
|--------|-------------|----------|
| Backfill por melhor esforço, preservar tenant do owner | `data_hora + duração atual do serviço`; violadoras resolvidas no pré-voo. | |
| Limpar agendamentos de teste antes | Banco descartável — apagar agendamentos de teste e aplicar a constraint em terreno limpo. | ✓ |
| Backfill fixo sem depender do serviço | `data_hora + 30min` para toda linha antiga. Grava duração errada. | |

**User's choice:** Limpar agendamentos de teste antes
**Notes:** A migration ainda deve conter o passo de backfill (roda em produção no go-live via a mesma migration; produção começa limpa via OPE-04). A limpeza de dev só garante pré-voo sem violadoras. Preservar o tenant do owner.

---

## Claude's Discretion

- Ordem interna das tarefas e agrupamento em waves (respeitando a ordem obrigatória do ROADMAP).
- Coluna gerada `periodo tstzrange` vs trigger `BEFORE INSERT OR UPDATE` (plano B do ROADMAP).
- Forma dos testes (engine sobre `data_hora_fim`, atomicidade do double-booking, upsert COALESCE).
- Redação das cópias pt-BR (discriminante público já existe; cópia do walk-in é nova).
- Como buscar o agendamento conflitante do walk-in sem vazar mais que cliente + serviço.

## Deferred Ideas

- Precedência de lookup telefone × e-mail em clientes diferentes → Phase 5.
- Duração customizada por agendamento (diferente do serviço) → fora de escopo (nova capacidade).
- Remarcação pública sem login (link assinado) → Phase 8.
