# Phase 1 — API Coverage

**Decidido em:** 2026-07-21 (plan time)

## Supabase Data API (PostgREST)

No external API integration: a fase endurece a superfície **existente** do PostgREST (REVOKE/GRANT, RLS, DEFAULT PRIVILEGES) — nenhuma capacidade nova da Data API é consumida; capacidades são *retiradas* da role `anon`.

## QStash — `@upstash/qstash` (SDK instalado nesta fase)

A verificação de assinatura é capacidade nova consumida de um serviço já integrado (hoje o QStash é chamado por `fetch` cru). Matriz de cobertura da superfície do SDK:

| Capability | Decision | Reason |
|---|---|---|
| `Receiver` (verificação de `Upstash-Signature`, rotação current/next, comparação em tempo constante) | INTEGRATE | Núcleo do SEG-05 (D-05) — substitui o `?secret=` em query string |
| `Client.publishJSON` / publish via SDK | OPT-OUT | Trocar o publisher muda a URL publicada e colide com a fila em trânsito (lembretes com `?secret=` até 14 dias à frente) — remoção do `?secret=` está em Deferred Ideas do CONTEXT; reavaliar quando a fila drenar |
| `verifySignatureAppRouter` (wrapper de handler) | OPT-OUT | Embrulha o handler inteiro, dificulta o 401 com log pt-BR e não passa `url` explicitamente — `Receiver` manual é o plano A do RESEARCH; wrapper fica como plano B documentado |
| Schedules (cron) | OPT-OUT | O fluxo usa entrega única com `Upstash-Not-Before`; não há requisito de recorrência |
| Queues / flow control / parallelism | OPT-OUT | Volume atual não exige fila nomeada; anti-abuso é Phase 3 |
| DLQ / events API | OPT-OUT | Auditoria de disparo já existe em `disparos_whatsapp` (append-only); observabilidade de fila é Phase 11 |
| URL Groups / topics | OPT-OUT | Um único endpoint consumidor (`/api/webhooks/lembrete`) |

**Regra aplicada:** INTEGRATE por padrão; todo OPT-OUT com motivo de uma linha.
