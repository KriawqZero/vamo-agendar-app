# Métricas — v2

**Revisado:** 2026-07-28 após a reorientação (D-12)

A partir da Fase 6 da fábrica, **este arquivo passa a ser escrito automaticamente** pelo
estágio 12 (`FABRICA.md`). Até lá, é preenchido à mão em sessão de leitura.

---

## Métrica norte

**Sinal de criativo:** número de peças que batem a barra de promoção.

**Barra (basta uma):**
- desempenho ≥ **3× a média** das peças do próprio perfil, **ou**
- ~**10 mil visualizações** orgânicas numa peça

É a pergunta "alguma coisa que produzimos funcionou de verdade?" — e ela decide onde o
dinheiro de mídia vai (D-16). Não é seguidores, não é alcance total.

**Valor atual: 0** — nenhuma peça produzida.

> A métrica norte volta a ser **inscritos na fila** quando a página de conversão existir
> (D-06 sai do congelamento). Enquanto não existir, contar inscrito é contar zero por
> construção, não por fracasso.

---

## Indicadores

| Indicador | Onde medir | Meta 30 dias | Atual |
|---|---|---|---|
| Peças publicadas | agendador | 20–30 | **0** |
| Peças acima da barra | agendador | ≥ 1 | **0** |
| Lotes produzidos e aprovados | `fabrica/lotes/` | ≥ 2 | **0** |
| Conversas geradas (DM + comentário de ICP) | manual | ≥ 10 | **0** |
| Horas humanas por lote | registro na sessão | ≤ 4h | — |
| **Custo por peça publicada** | `metricas/sintese/` | medir, sem meta | — |
| Retenção média por tipo de conteúdo | agendador | ≥ 30% | — |
| `landing_viewed` por `nicho` | PostHog | linha de base | **nunca consultado** |

**Custo por peça é indicador de primeira classe.** É ele que diz se a fábrica economiza ou
queima dinheiro, e o item dominante (geração de b-roll) é cobrado por segundo. Custo acima
de R$ 25/peça é gatilho de corte (`PLANO-PRE-LANCAMENTO.md` §10).

---

## O que já está instrumentado no PostHog

Mapa completo em `docs/08-ANALYTICS_E_FUNIL.md`.

**Funil B2B:** `landing_viewed` (com propriedade `nicho`) → `signup_completed` →
`first_service_created` → `schedule_configured`
**Funil B2C:** `booking_completed`, `booking_failed`, `booking_rate_limited`

**UTMs** são anexadas automaticamente pelo `posthog-js` como propriedades iniciais da
pessoa. Consequência: **toda peça precisa carregar UTM**, senão a atribuição some.

Padrão obrigatório, aplicado pelo estágio 8 da fábrica:

```
?utm_source=instagram|tiktok|youtube|facebook
&utm_medium=social
&utm_campaign=organico|pago
&utm_content=<pecaId>
```

`utm_content` com o id da peça é o que permite ligar desempenho de criativo a
comportamento no site. Sem ele, sabe-se que "veio do TikTok" e nada mais.

---

## O que falta instrumentar

| # | Evento | Para quê | Depende de |
|---|---|---|---|
| 1 | `waitlist_joined` (com `nicho` e origem) | Fechar o funil de conversão | F-02 (página) |
| 2 | Insight de funil no PostHog: `landing_viewed` → `waitlist_joined`, com breakdown por `nicho` | Responder "qual vertical converte" com dado | evento 1 |

---

## Regras de higiene

1. **Todo número tem data e fonte.** Número sem data não serve pra comparar.
2. **Alcance e impressão são observáveis, não decidem nada.**
3. **Amostra mínima de 5 peças por tipo** antes de concluir qualquer coisa sobre o tipo —
   é a mesma trava que o estágio 12 aplica sozinho.
4. **Ajuste máximo de 15 pontos percentuais de quota por lote**, para não oscilar por ruído.
5. **`sem_dado` nunca vira zero.** A diferença muda a conclusão.
6. **Renomear evento quebra insight em silêncio** — regra herdada de `docs/08`, vale igual
   para marketing.

---

## Histórico de medições

*(Nenhuma medição registrada. A primeira sai da primeira sessão de leitura, depois do
primeiro lote publicado.)*

Formato — o mesmo que o estágio 12 vai escrever sozinho:

```markdown
### AAAA-MM-DD — lote <id>
| Indicador | Valor | vs. medição anterior |
**Leitura:** (uma frase honesta, inclusive quando for ruim)
**Amostra:** (quantas peças por tipo — declarar quando for insuficiente)
**Quota ajustada:** (de → para, por tipo; ou "sem alteração, amostra insuficiente")
**Decisão humana necessária:** (o que a fábrica não pode decidir sozinha)
```
