# Phase 3: Anti-abuso no booking público - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-27
**Phase:** 03-anti-abuso-no-booking-publico
**Areas discussed:** Backend do contador, Superfícies e resposta ao bloqueio, Visibilidade do owner (ABU-03)

---

## Backend do contador

### Qual backend para o contador de rate limit?

| Option | Description | Selected |
|--------|-------------|----------|
| Upstash Redis (Recomendado) | @upstash/ratelimit com slidingWindow pronto, HTTP/REST, mesma conta do QStash, não gasta write do Supabase Free | ✓ |
| RPC atômica no Postgres | Zero fornecedor novo; sliding window em SQL próprio, write no banco Free a cada requisição pública | |

**User's choice:** Upstash Redis
**Notes:** Argumento decisivo apresentado: contador de abuso em endpoint anônimo não deve competir pelo orçamento do banco de produção no plano Free — o atacante decidiria quantos writes o banco gasta.

### Quando o Upstash Redis estiver indisponível (timeout/erro), o que o booking faz?

| Option | Description | Selected |
|--------|-------------|----------|
| Fail-open + Sentry (Recomendado) | Requisição passa sem contar; falha vira Sentry Issue sintética com variantes aguardadas | ✓ |
| Fail-closed | Sem contador, sem booking — indisponibilidade do fornecedor derruba o booking de todos | |
| Híbrido por superfície | Fail-open na leitura, fail-closed na escrita | |

**User's choice:** Fail-open + Sentry
**Notes:** Coerente com Fricção Zero e o precedente da Phase 01 (WR-07): permissivo na disponibilidade.

### As env vars do Redis entram na lista de obrigatórias de produção (fail-fast no boot)?

| Option | Description | Selected |
|--------|-------------|----------|
| Obrigatórias em prod (Recomendado) | Boot de produção cai sem elas; dev sem vars = no-op com aviso | ✓ |
| Opcionais com no-op | Deploy nunca quebra, mas produção pode rodar desprotegida sem ninguém notar | |

**User's choice:** Obrigatórias em prod

### Qual o teto de latência da checagem de rate limit antes de desistir e liberar (fail-open)?

| Option | Description | Selected |
|--------|-------------|----------|
| ~500 ms (Recomendado) | 500 ms já é anomalia para o Upstash; timeout conta como falha → Sentry | ✓ |
| ~1000 ms | Mais tolerância antes de reportar; piora máxima de 1s em cenário degradado | |
| Sem timeout próprio | Confia no timeout padrão do fetch/lib | |

**User's choice:** ~500 ms

### Como isolar os contadores de dev e produção no Redis?

| Option | Description | Selected |
|--------|-------------|----------|
| Databases separados (Recomendado) | Isolamento físico; se plano cobrar por database extra, dev opera em no-op | ✓ |
| Mesmo database, prefixo por ambiente | Isolamento apenas lógico — bug de prefixo mistura os mundos | |
| Dev sempre no-op | Só produção tem Redis; prova só por teste unitário com mock | |

**User's choice:** Databases separados

---

## Superfícies e resposta ao bloqueio

### Quais superfícies recebem rate limit?

| Option | Description | Selected |
|--------|-------------|----------|
| Escrita + leituras folgadas (Recomendado) | Escrita com camadas compostas; leituras só com teto por IP bem folgado | ✓ |
| Só a escrita | ABU-01 fala de lotar agenda; leitura ficaria sem teto de volume | |
| Tudo com o mesmo tratamento | Mesmas chaves e limites nas três actions — risco de falso positivo na navegação | |

**User's choice:** Escrita + leituras folgadas

### O que quem estoura o limite na ESCRITA recebe?

| Option | Description | Selected |
|--------|-------------|----------|
| Erro honesto (Recomendado) | Discriminante novo muitas_tentativas + copy amigável; sucesso falso fica só no honeypot | ✓ |
| Sucesso falso também aqui | Máxima dissuasão, mas cliente legítimo pego por CGNAT acha que agendou e não agendou | |
| Reusar slot_indisponivel | Menos código, mas mente sobre a causa | |

**User's choice:** Erro honesto
**Notes:** Racional aceito: no rate limit a certeza de bot é menor que no honeypot (CGNAT); sucesso falso para pessoa real é o pior desfecho para a confiança.

### Quantos agendamentos o MESMO telefone pode criar no mesmo profissional antes de ser barrado?

| Option | Description | Selected |
|--------|-------------|----------|
| ~3 por hora (Recomendado) | Acomoda o caso família; sliding window de 1h | ✓ |
| ~5 por dia | Janela maior; um bot com um número cria 5 antes de parar | |
| Planner calibra | Deixar o número exato para o planner/researcher | |

**User's choice:** ~3 por hora

### O que a página mostra quando a LEITURA de slots é barrada pelo limite?

| Option | Description | Selected |
|--------|-------------|----------|
| Caixa de erro existente (Recomendado) | Copy da Phase 01: "Não foi possível carregar os horários. Tente de novo." | ✓ |
| Copy específica de limite | Mais transparente, mas informa ao script que há rate limit | |
| Grade vazia silenciosa | Cliente legítimo em falso positivo veria agenda "lotada" — mentira ruim | |

**User's choice:** Caixa de erro existente

### Qual o teto de agendamentos criados por hora num mesmo profissional (todas as origens somadas)?

| Option | Description | Selected |
|--------|-------------|----------|
| ~30 por hora (Recomendado) | Acima de rajada legítima; desacelera ataque distribuído dando tempo de reação | ✓ |
| ~60 por hora | Folga dobrada para "link viralizou"; desacelera menos | |
| Planner calibra | Derivar de horizonte_maximo_dias e duração típica de slot | |

**User's choice:** ~30 por hora

---

## Visibilidade do owner (ABU-03)

### Onde o owner vê os bloqueios do rate limit?

| Option | Description | Selected |
|--------|-------------|----------|
| PostHog + Sentry Log (Recomendado) | Reusa os pilares prontos: logOperacional + evento PostHog; zero UI nova | ✓ |
| + tela no dashboard | Página de admin com contadores — UI nova + storage, escopo a mais | |
| Só analytics da Upstash | Mínimo de código, mas fora dos pilares e sem correlação com tenant/funil | |

**User's choice:** PostHog + Sentry Log
**Notes:** Pseudonimização de telefone/IP não foi re-perguntada — travada por invariante do projeto (nunca PII crua em telemetria).

### Estouro do teto por TENANT vira Sentry Issue (acionável), além do log e do PostHog?

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, Issue no teto do tenant (Recomendado) | Mensagem sintética estática, variante aguardada, tenantHash; IP/telefone só log+PostHog | ✓ |
| Não, tudo só log+PostHog | Ataque às 3h só aparece quando o owner abrir o PostHog | |

**User's choice:** Sim, Issue no teto do tenant
**Notes:** Escolhido pelo cenário "ataque às 3h da manhã".

---

## Claude's Discretion

- Mecânica do honeypot (área oferecida e não selecionada): campo invisível + sucesso
  falso conforme notas do ROADMAP; sem agendamento, sem WhatsApp, sem cliente gravado;
  visibilidade via `honeypot:captura` no mesmo padrão dos bloqueios.
- Janelas/valores exatos da camada de IP (escrita) e do teto de leitura por IP.
- Obtenção do IP real atrás do proxy (Railway) e fallback quando indeterminável.
- Nomes de env vars, códigos sintéticos, chaves Redis; config fina da lib.
- Forma dos testes (mock da lib no `pnpm test` hermético; integração opt-in).

## Deferred Ideas

- Mostrar ao profissional (tenant B2B) os bloqueios da própria página pública — capacidade
  nova de dashboard, fora do escopo da Phase 3.
