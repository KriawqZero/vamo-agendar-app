---
status: temporario
gerado: 2026-07-15 20:43
agente: orquestrador
modelo: fable-5
---

# Índice — Auditoria VamoAgendar 2026-07-15

- [[LEIA-ME]] — Versão curta e sem tecniquês: só o que muda decisão, em 5 minutos de leitura. Comece por aqui.
- [[00-resumo-executivo]] — Os 5 achados mais importantes, CRÍTICOS nominais, 3 ações de maior retorno, recomendação de preço e o veredito honesto sobre distância do lançamento.
- [[01-verificacao]] — Typecheck/lint/testes/build/audit: build ok, 32/32 testes, 13 erros de lint, 2 CVEs moderadas, zero testes em `src/app/actions/`.
- [[02-arquitetura]] — Estrutura real do código: índices ausentes, duplicações concretas, docs divergentes da realidade (3 ALTA / 9 MÉDIA / 5 BAIXA).
- [[03-seguranca]] — O mais crítico: RLS permissivo na Data API (escrita/leitura anônima cross-tenant), webhook com fallback hardcoded, `instance_token` no browser (3 CRÍTICO / 5 ALTO / 3 MÉDIO / 4 BAIXO).
- [[04-banco]] — Schema vs domínio: double-booking sem constraint, sem índices em `agendamentos`, duração/preço sem snapshot (1 CRÍTICO / 2 ALTO / 4 MÉDIO / 3 BAIXO).
- [[05-ux-produto]] — Fluxos percorridos pelo código: booking fricção zero real, bug telefone/e-mail na conversão, cliente final sem canal de cancelamento, veredito "não é WhatsApp-first".
- [[06-mercado]] — Concorrentes com preço e fonte (consulta 2026-07-15): faixa R$ 40–80 de entrada, trial sem cartão como padrão, WhatsApp incluso sem metering como lacuna real.
- [[07-features]] — Gap analysis e backlog em 4 categorias (revisado com o 02 como insumo); sequência recomendada: bug do booking → contato wa.me → índices + status no_show → error boundaries → cancelamento self-service.
- [[08-precificacao]] — Custo marginal ≈ R$ 0/tenant, piso fixo R$ 258,50/mês, Pro único R$ 59,90 (anual R$ 599, fundador R$ 39,90), trial 14 dias sem cartão, break-even com 5 pagantes.
- [[99-premissas-e-decisoes]] — Toda premissa assumida, decisões tomadas sem consulta e divergências docs vs realidade encontradas no caminho.
