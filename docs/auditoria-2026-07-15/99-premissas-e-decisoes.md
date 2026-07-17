---
status: temporario
gerado: 2026-07-15 19:13
agente: orquestrador
modelo: fable-5
---

# Premissas e decisões da auditoria (2026-07-15)

Registro de tudo que foi decidido sem consulta ao owner, conforme o regime autônomo
combinado no início da sessão.

## Decisões do orquestrador

1. **Pasta**: `docs/auditoria-2026-07-15/` (data de execução).
2. **Frontmatter**: o formato pedido (`status: ... | gerado: ... | agente: ... | modelo: ...`)
   foi interpretado como YAML de 4 chaves, para compatibilidade com Obsidian — coerente com
   o pedido de wikilinks no índice.
3. **Modelos**: nenhum subagent usou o modelo da sessão principal. Agente 1 = haiku;
   agentes 2–8 = sonnet, todos via subagent general-purpose com override explícito de
   modelo. Os 3 arquivos de consolidação (00, 99, _INDICE) são da sessão principal e levam
   `agente: orquestrador / modelo: fable-5` — a spec só previa sonnet|haiku para subagents,
   e assinar o modelo real é mais honesto que forjar um dos dois.
4. **Agente 1**: `pnpm install --frozen-lockfile` (para não tocar o lockfile). Efeitos
   colaterais em `node_modules/` e `.next/` foram considerados aceitáveis (artefatos de
   build, fora do controle de versão).
5. **Agente 7 despachado após 5 e 6, antes do 2 concluir** — exatamente como a spec de
   paralelismo pedia. Consequência: `02-arquitetura.md` ainda não existia quando o 7 rodou;
   as estimativas de esforço (P/M/G) vieram de inspeção direta do código.
   **SUPERADA em 2026-07-15 20:39**: a pedido do owner, o mesmo agente refez o
   `07-features.md` com o 02 como insumo. Resultado: nenhuma estimativa P/M/G mudou de
   letra (o 02 confirmou as leituras); entrou o item novo L6 — índices
   `agendamentos(tenant_id, data_hora)` e `clientes(tenant_id, telefone)` como
   pré-requisito de lançamento — e a sequência recomendada mudou na posição 3
   (L6 pareado com R3, por serem duas migrations pequenas no mesmo fluxo declarativo).
6. **Política de .env**: nenhum agente leu valores de `.env*`. O agente de segurança
   verificou apenas nomes de variáveis, uso de `NEXT_PUBLIC_*` e presença no `.gitignore`.
7. **Contagem de severidade do relatório de UX**: o agente 5 não reportou contagem própria;
   os números no fechamento da auditoria vieram de contagem de marcadores no arquivo
   (≈ 6 ALTA / 5 MÉDIA / 4 BAIXA) e são aproximados (marcadores podem se repetir no top 5).

## Divergências encontradas entre instruções/docs e realidade (não corrigidas — proibição de escrita)

1. **CLAUDE.md e PENDENCIAS.md afirmam "não há framework de testes"** — falso desde
   2026-07-13: existe `vitest.config.ts`, script `pnpm test` e 32 testes passando
   (booking-engine, timezone, whatsapp-helper). Detalhe em `02-arquitetura.md`.
2. **`docs/01-ARQUITETURA_E_STACK.md` lista Resend e Asaas como stack em uso** — zero
   código/dependência de ambos; `docs/05`, `docs/07` e PENDENCIAS.md já dizem o contrário.
   Inconsistência interna dos docs, registrada em `02-arquitetura.md`.

Nenhum arquivo fora desta pasta foi modificado (conferido via `git status` ao final:
apenas `?? docs/auditoria-2026-07-15/`).

## Principais premissas assumidas pelos agentes (detalhe nos arquivos de origem)

- **[[08-precificacao]]**: RAM por instância Evolution conectada ~200–300 MB (sem fonte
  oficial precisa) → ~10–15 tenants Pro por VPS de 4 GB (~R$ 25/mês, Hetzner CX22, fonte
  vpsbenchmarks.com, consulta 2026-07-15). Supabase Pro (~R$ 127,50/mês) tratado como
  obrigatório desde o lançamento (free tier pausa projeto após 7 dias de inatividade,
  incompatível com Fricção Zero). Vercel Pro ~R$ 102/mês. Perfis de tenant: leve 50 /
  médio 200 / pesado 600 agendamentos/mês.
- **[[06-mercado]]**: dados marcados NÃO VERIFICADO quando a fonte era ambígua ou
  inacessível — principais: preço Booksy Brasil (R$ 99 anunciado vs US$ 29,99 na página
  global), faixa de entrada da Avec/SalãoVIP, AgendaPro precificado em USD mesmo na página
  /br/. Todos os quantitativos usados têm URL + data (2026-07-15) no arquivo.
- **[[04-banco]]**: análise 100% estática (schemas declarativos + migrations + grep de
  queries); nenhum comando contra banco local ou remoto.
- **[[07-features]]**: registrou discordância fundamentada da classificação de
  PENDENCIAS.md que adia o cancelamento self-service do cliente final para "depois de
  evidência" — o dano de no-show/abandono é silencioso e não gera a evidência esperada.

## Seções incompletas

Nenhuma. Os 8 agentes concluíram sem falha bloqueante. Único desvio de expectativa: a spec
do agente 1 previa `pnpm test` possivelmente ausente; o script existe e passou (32/32) —
registrado como divergência de documentação, não como falha.
