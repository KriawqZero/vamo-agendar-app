---
name: nova-feature
description: Use quando for implementar uma nova feature completa no VamoAgendar (invocar com /nova-feature <descrição da feature>).
disable-model-invocation: true
---

# Nova feature: $ARGUMENTS

Workflow em 6 fases, executadas **na ordem e sem pular nenhuma**.

## Fase 1 — Explorar (sem implementar)

- Ler o código relevante e os arquivos de `docs/` ligados ao domínio da feature
  (usar o índice do CLAUDE.md; `docs/PENDENCIAS.md` é leitura obrigatória antes
  de nova etapa).
- **PROIBIDO editar ou criar qualquer arquivo nesta fase.** "Só um esboço",
  "só um stub para testar uma ideia" — não. Exploração é leitura.

## Fase 2 — Plano

Produzir um plano contendo, nesta ordem:

1. **Arquivos afetados** (existentes e novos, com caminho).
2. **Mudanças de schema/migration**, se houver (arquivo em `supabase/schemas/`
   + migration gerada via `supabase stop && supabase db diff -f <nome>`).
3. **Pontos ambíguos**, cada um com uma recomendação concreta.
4. **Ordem de implementação** (passo a passo).

## Fase 3 — PARAR e aguardar aprovação explícita

Apresentar o plano e **encerrar o turno**. Só avançar quando o usuário aprovar
explicitamente. Perguntas, comentários ou ajustes ao plano **não são aprovação** —
ajustar o plano e parar de novo.

## Fase 4 — Implementar passo a passo

- Seguir a ordem de implementação aprovada.
- Após **cada arquivo alterado**, rodar `pnpm tsc --noEmit` e corrigir erros
  antes de tocar no próximo arquivo — não acumular quebras para o final.

## Fase 5 — Verificação final

- Delegar ao subagent **`verificador`** (Agent tool), que roda typecheck, lint,
  testes e build e retorna apenas as falhas — ou uma linha de resumo numérico se
  tudo passou.
- Colar na resposta o retorno real do verificador — nunca afirmar "passou" sem
  evidência.
- Se o subagent não estiver disponível na sessão, rodar diretamente
  `pnpm lint && pnpm tsc --noEmit && pnpm test` e mostrar o output real.
- Enquanto não existir script `test` no `package.json`, essa etapa é reportada
  como "sem testes configurados" (não é falha).

## Fase 6 — Commit (sem push)

- Commit com mensagem descritiva seguindo o padrão do histórico do repo
  (`feat(escopo): descrição` em pt-BR).
- **Não fazer push** — isso é decisão do usuário.

## Fase 7 (opcional) — Documentação viva

Após o commit, **oferecer** ao usuário atualizar `docs/arquitetura.md` e
`docs/schema.md` delegando ao subagent **`documentador`**. Só executar se o
usuário aceitar — não rodar por conta própria.
