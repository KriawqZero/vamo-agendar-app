# Experimentos — v2

**Revisado:** 2026-07-28 após a reorientação (D-12)

Regra: **experimento sem critério de corte não é experimento, é esperança.** Hipótese,
métrica única, prazo, e a frase "eu mato isso se ___".

Estados: `⬜ não iniciado` · `🔵 rodando` · `✅ confirmado` · `❌ refutado` · `⚠️ inconclusivo`

Na v2, os experimentos rodam **dentro dos lotes**, não como esforço separado. Cada peça
carrega uma hipótese declarada (estágio 1 da fábrica), e o estágio 12 fecha a conta.

---

## E-07 — Qual tipo de conteúdo puxa

**Hipótese:** dor encenada retém mais que demonstração, utilidade e opinião.

**Desenho:** a quota inicial (40/30/20/10) já é o desenho. Cada peça declara seu tipo, e o
desempenho por tipo se acumula ao longo dos lotes.

**Métrica única:** retenção média por tipo.

**Amostra mínima:** 5 peças por tipo. Abaixo disso, nada se conclui.

**Prazo:** fim do lote 2.

**Corte:** tipo com desempenho consistentemente pior em 2 lotes sai da quota — e o estágio
12 faz isso sozinho, dentro do limite de 15 pontos percentuais por lote.

**Estado:** ⬜ (bloqueado por F-06)

---

## E-08 — Qual nicho responde

**Hipótese:** manicure e barbeiro respondem mais que lash designer e designer de
sobrancelhas (densidade de profissionais e nativismo em vídeo curto).

**Desenho:** produzir para os quatro em rodízio, sem escolher antes (D-14).

**Métrica única:** retenção e salvamentos por nicho, com no mínimo 5 peças por nicho.

**Prazo:** fim do lote 3.

**Corte:** se os quatro empatarem dentro de 15%, o nicho não é a variável que importa — e
aí o esforço migra para testar tipo e ângulo, não profissão.

**Estado:** ⬜

---

## E-09 — Voz sintetizada muda retenção?

**Hipótese:** peças com narração retêm mais que peças só com texto na tela.

**Desenho:** metade do lote com voz, metade sem, distribuídas entre tipos e nichos para não
confundir a variável.

**Métrica única:** retenção média dos dois braços.

**Prazo:** fim do lote 2.

**Corte:** se não houver diferença acima de 10 pontos percentuais, **cancelar a assinatura
de TTS** e economizar R$ 30–130/mês. Este experimento se paga sozinho.

**Estado:** ⬜

---

## E-10 — B-roll gerado vale o que custa?

**Hipótese:** peças com b-roll gerado por IA retêm mais que peças feitas só com gravação de
tela e clipes brutos do celular.

**Desenho:** dois braços dentro do mesmo lote, mesmo roteiro sempre que possível.

**Métrica única:** retenção por real gasto — não retenção absoluta. Uma peça 10% melhor que
custa 8× mais é uma peça pior.

**Prazo:** fim do lote 3.

**Corte:** se o ganho por real não for claro, o teto de geração cai a zero e o acervo bruto
vira a fonte única. É o corte de maior impacto financeiro do plano.

**Estado:** ⬜

---

## E-11 — "Anúncio sutil" performa melhor que demonstração explícita?

**Hipótese do owner:** peça que funciona como conteúdo por mérito próprio, com o produto
aparecendo de leve, alcança mais que peça que é claramente sobre o produto.

**Desenho:** dois braços — produto no centro (demonstração) vs. produto de canto (a cena é
a estrela e o link aparece 2 segundos).

**Métrica única:** alcance e salvamentos. **Métrica de contraprova:** comentários e DMs de
ICP — porque alcance sem intenção é vaidade, e é exatamente o risco do formato sutil.

**Prazo:** fim do lote 2.

**Corte:** se o sutil alcançar mais mas gerar menos conversa, ele vira formato de topo de
funil, não formato padrão — e a quota se divide.

**Estado:** ⬜

---

## E-12 — O crítico concorda com o owner?

**Hipótese:** a rubrica do estágio 9 aprova e reprova as mesmas peças que o owner aprovaria
e reprovaria.

**Desenho:** durante os primeiros lotes, o owner vê **todas** as peças — inclusive as
reprovadas pelo crítico — e registra sua decisão. Compara-se.

**Métrica única:** taxa de concordância.

**Prazo:** fim do lote 3.

**Corte:** abaixo de 80% de concordância, o crítico não ganha nenhuma autonomia adicional e
a Fase 8 (publicação automática) fica bloqueada. **Este experimento é o portão da
autonomia** — sem ele, "a IA publica sozinha" seria fé, não engenharia.

**Estado:** ⬜

---

## Encerrados

### ~~E-01 a E-06~~ · ❌ cancelados em 2026-07-28

Cancelados pela reorientação (D-12). E-01 a E-04 assumiam um regime de produção manual e de
pesquisa como pré-condição; E-05 dependia de pesquisa presencial (já cancelada em D-11);
E-06 dependia da lista de espera existir, e ela foi adiada para a página de conversão (D-15).

O que continua vivo deles migrou: "qual dor puxa" virou E-07, "qual nicho responde" virou
E-08.

---

Formato ao encerrar:

```markdown
### E-NN — [título] · ✅/❌/⚠️ · encerrado em AAAA-MM-DD
**Resultado medido:** (o número, não a impressão)
**Amostra:** (quantas peças por braço)
**Conclusão:** (uma frase)
**O que muda por causa disso:** (decisão concreta; se não muda nada, o experimento
foi mal desenhado — registrar isso também)
```
