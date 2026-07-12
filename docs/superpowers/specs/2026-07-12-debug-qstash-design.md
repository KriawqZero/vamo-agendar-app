# Página de debug do QStash (temporária)

**Data**: 2026-07-12
**Status**: aprovado
**Natureza**: ferramenta descartável de diagnóstico — remover após resolver o bug dos lembretes.

## Problema

A confirmação síncrona via Evolution API chega no WhatsApp, mas o **lembrete agendado via QStash nunca chega**. A cadeia publish → entrega QStash → webhook `/api/webhooks/lembrete` → Evolution falha em silêncio em alguma etapa (todas as falhas são `console.error` engolidos, por design frictionless). Não há visibilidade nem forma de testar manualmente — em dev local o QStash nem consegue entregar (precisa de URL pública).

Suspeitas já levantadas (a ferramenta deve confirmar/descartar):

1. Default de `QSTASH_URL` no código é `https://qstash-us-east-1.upstash.io`; o endpoint atual é `https://qstash.upstash.io`.
2. Caso silencioso `targetTime <= now` em `public-booking.ts` (agendamento próximo demais → lembrete nunca publicado, sem log).
3. Secret na query string divergente entre publish e webhook (401 na entrega).

## Solução

Página de debug `/debug/qstash` no próprio app, protegida, que dá visibilidade de toda a cadeia e permite disparos manuais. Funciona em dev e em produção.

### Proteção e ciclo de vida

- Todo o código isolado em dois lugares: `src/app/debug/qstash/` (page + client) e `src/app/actions/debug-qstash.ts` — fácil de apagar depois.
- Página e actions só funcionam com `DEBUG_QSTASH=1` no env; caso contrário `notFound()` / erro.
- `/debug` não está em `isPublicRoute` no `proxy.ts`, então o Clerk já exige login (dupla proteção, sem código novo).

### Dados exibidos (Server Component, na carga)

1. **Logs do QStash**: `GET {QSTASH_URL}/v2/logs` (Bearer `QSTASH_TOKEN`), filtrado por `url` contendo `/api/webhooks/lembrete`. Para cada evento: horário, `messageId`, estado (CREATED/ACTIVE/RETRY/ERROR/IN_PROGRESS/DELIVERED/CANCELLED), URL de destino, `notBefore` convertido para America/Sao_Paulo, e — quando presentes — status HTTP e corpo da resposta devolvida pelo webhook (decodificar base64 se aplicável). Renderização defensiva: campos ausentes não quebram a página.
2. **Agendamentos recentes** (admin client, últimos ~20): id, data_hora, status, tenant_id, nome do cliente, e se o tenant tem `whatsapp_configs` com `status = 'conectado'`. Correlação com mensagens QStash pelo `agendamentoId` no body do evento, quando disponível.
3. **Sanidade de env**: presença (não o valor) de `QSTASH_TOKEN` e `QSTASH_CURRENT_SIGNING_KEY`; valores efetivos de `QSTASH_URL`, `APP_URL` e `EVOLUTION_API_URL` (expõe defaults errados na hora).

### Ações manuais (ilha client + Server Actions)

- **Disparar lembrete agora** (por agendamento): a action faz `POST` no próprio `/api/webhooks/lembrete?secret=...` (origem local da própria instância) e devolve o status + corpo da resposta ao client. Testa a lógica do webhook sem QStash — funciona em localhost.
- **Publicar teste no QStash (+60s)** (por agendamento): replica o publish de `agendarLembreteQStash` inline na action (com `Date.now() + 60_000`), porque o helper só retorna boolean e o objetivo aqui é capturar status e corpo da resposta do QStash. Testa o ciclo completo (só útil quando `APP_URL` é alcançável publicamente).
- **Refresh** da página (`router.refresh()`) para acompanhar tentativas de entrega.

Resultado de cada ação exibido inline na página (status + JSON de resposta), com feedback de pending (`useActionState`/`useFormStatus`).

### Fora de escopo

- Tabela de log persistente, retries automáticos, correção dos bugs encontrados (vem depois, com a ferramenta pronta).
- Testes automatizados — ferramenta descartável.
- Estilização premium — layout funcional com Tailwind básico (zinc), mobile ok mas otimizado para desktop.

## Critério de sucesso

Abrir `/debug/qstash` em produção e conseguir responder: a mensagem foi publicada? O QStash tentou entregar? Que resposta HTTP o webhook devolveu? E, em dev, conseguir exercitar o webhook diretamente com um agendamento real.
