# Phase 1: Hardening da superfície pública - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-21
**Phase:** 01-hardening-da-superficie-publica
**Areas discussed:** quem lê o banco na página pública, alcance do fechamento por padrão, `org_id` no payload do browser, aplicação do DDL, chave de assinatura do QStash

---

## Nota de método

Esta discussão aconteceu **depois** da pesquisa, invertendo a ordem usual do GSD. Isso mudou a qualidade das opções: as áreas cinzentas apresentadas foram as que `01-RESEARCH.md` isolou como decisão do owner, não hipóteses do orquestrador.

O owner declarou não ser especialista em Supabase e pediu que o problema fosse explicado sem jargão, para poder julgar se era problema de verdade. A primeira rodada de perguntas foi rejeitada por excesso de termo técnico e reformulada. Antes de reformular, a superfície aberta foi **medida** contra a Data API real e contra `pg_policies` — a evidência está em CONTEXT.md §`<evidencia_medida>`. A decisão foi tomada em cima de números, não de descrição.

Contexto declarado pelo owner: *"Por estarmos usando supabase, segurança é CRUCIAL pra evitar ataques, saas criados com supabase tem uma taxa de vazamento altíssima por conta de má configuração."* Isso explica a escolha consistente pela opção mais fechada nas três decisões estruturais.

---

## Quem lê os dados do booking depois que a porta pública fecha

| Option | Description | Selected |
|--------|-------------|----------|
| O servidor, com a chave secreta (`createAdminClient()`) | Chave privilegiada que nunca sai do servidor, já usada hoje para gravar, passa a ler também. Uma linha por função, nenhum componente tocado. Cria o risco de ler outro tenant se algum filtro for esquecido — compensado por três mitigações viráveis critério de aceite | ✓ |
| Funções-guichê no banco (RPC `SECURITY DEFINER`) | Porta estreita em vez de porta larga. Custo: reescrever em SQL o cálculo de horários que hoje tem 442 linhas de teste em TypeScript | |
| Misto: guichê só para resolver o slug | Pega a maior parte do ganho sem reescrever a lógica testada; custo de manter duas mecânicas no mesmo caminho | |

**User's choice:** o servidor, com a chave secreta.
**Notes:** apresentado com a ressalva de que a RPC `SECURITY DEFINER` **também** ignora RLS — a escolha real é entre superfície ampla com código testado e superfície estreita com lógica reescrita, não entre "seguro" e "inseguro". A opção escolhida é a de menor delta e preserva a cobertura de teste da engine.

---

## Alcance do fechamento por padrão (tabela nova nasce fechada para quem?)

| Option | Description | Selected |
|--------|-------------|----------|
| Só para `anon` | Resolve o risco real (a chave do bundle) e não cobra nada depois. Para `authenticated` a tabela aparece mas devolve zero linha sem policy | |
| Para `anon` **e** `authenticated` | Cumpre o critério 4 ao pé da letra. Cobra migration manual de `GRANT` por tabela nova, que o `db diff` não gera; a primeira conta chega na Phase 7 | ✓ |

**User's choice:** para `anon` e `authenticated`.
**Notes:** custo recorrente aceito explicitamente. A regra precisa ficar escrita em `docs/03` nesta fase, senão reaparece como `permission denied` inexplicável na Phase 7 ou 9.

---

## `org_id` no payload do browser

| Option | Description | Selected |
|--------|-------------|----------|
| Corrigir junto, nesta fase | ~30 linhas em 3 arquivos; com a chave secreta lendo, é metade da compensação da decisão anterior e não um extra | ✓ |
| Deixar para a Phase 8 | Com a porta fechada o identificador vira código opaco; a Phase 8 já reescreve essas funções. Risco: se a Phase 8 for cortada, fica | |

**User's choice:** corrigir nesta fase.
**Notes:** a pesquisa recomendava adiar para a Phase 8. O owner puxou para dentro, coerente com a postura de segurança declarada — e o argumento a favor é técnico, não só de zelo: a mitigação 1 da decisão de leitura exige que o tenant seja resolvido no servidor, o que é exatamente esta correção.

---

## Como o DDL chega ao banco

| Option | Description | Selected |
|--------|-------------|----------|
| Claude roda, owner aprova cada comando | Mantém o histórico de migrations alinhado; owner vê o SQL antes | |
| Owner cola no SQL editor do painel | Nenhuma escrita partindo do agente; risco de esquecer o registro da versão e desalinhar o histórico | |
| Liberar permissão de `psql` no settings | Execução sem interrupção; escritas no banco perdem a confirmação como última barreira | ✓ |

**User's choice:** liberar a permissão.
**Notes:** a pergunta original oferecia MCP do Supabase como caminho. O owner informou que o Supabase estaria acessível por CLI. A verificação mostrou que **a CLI não está autenticada** (sem access token) e que a direct connection é IPv6-only, inalcançável desta máquina — mas que o **pooler `aws-1-sa-east-1`** funciona com a senha do Postgres, com DDL confirmado. A opção "conectar MCP" foi descartada por não agregar nada. Note `aws-1`: a documentação diz `aws-0`, e é por isso que a primeira varredura de regiões falhou.

---

## Chave de assinatura do QStash

| Option | Description | Selected |
|--------|-------------|----------|
| Owner pega a chave agora, antes de planejar | Plano nasce sem checkpoint e roda inteiro | ✓ |
| Primeira tarefa da fase é a parada para pegar a chave | Necessário no começo porque a correção faz a aplicação recusar subir sem as chaves | |
| Webhook por último, separado das tarefas de banco | Entrega o fechamento da porta primeiro; webhook fica para a próxima sessão se o dia acabar | |

**User's choice:** pega agora.
**Notes:** o owner perguntou se `QSTASH_NEXT_SIGNING_KEY` era funcionalidade nova do QStash, já que usava o serviço só para agendar. Não é: o QStash já assina toda requisição que envia; o projeto é que nunca verificou a assinatura, conferindo em vez disso uma senha em query string com fallback literal `'secret-key'` no código. As duas chaves (atual e próxima) existem para rotação sem downtime e são ambas exigidas pelo construtor `Receiver` — confirmado na documentação oficial via Context7, não de memória.

---

## Claude's Discretion

- Ordem interna das tarefas e agrupamento em waves
- Forma exata dos testes de regressão do booking público
- Redação das policies autenticadas substitutas, seguindo `03_horarios_funcionamento.sql` (policy 1b)
- Onde colocar a falha dura por chave ausente (`instrumentation.ts` ou módulo) — a pesquisa marca confiança MÉDIA no comportamento de exceção no boot do Next 16.2.10; validar empiricamente

## Deferred Ideas

- Remover `?secret=` da URL de publicação do QStash — redundante depois da assinatura, mas os lembretes em trânsito foram publicados com ele. Reavaliar depois que a fila drenar (14 dias)
- Bug do "assume 30 minutos" na duração — escopo da Phase 2; não consertar de passagem, para não confundir a verificação daquela fase
- Revisar a permissão de `psql` liberada quando houver cliente real no banco
