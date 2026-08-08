# A fábrica de marketing

**Versão:** v1 — 2026-07-28
**Decisão que a define:** D-19 (pipeline local em código) · D-14 (criativos) · D-17
(aprovação) · D-18 (métricas autônomas)
**Estado:** desenho aprovado. **Nada implementado.**

> Princípio: **o owner fornece matéria-prima bruta e julgamento; a fábrica faz o resto.**
> Ele nunca corta vídeo, nunca escreve legenda, nunca redimensiona, nunca narra.

---

## Visão geral

```
                    ┌── acervo de tela (gravação do produto)
                    ├── acervo bruto (clipes do celular do owner)
métricas do         ├── b-roll gerado (IA, caro, com cache)
lote anterior       └── voz sintetizada (IA, com cache)
      │                        │
      ▼                        ▼
 [1 PAUTA] → [2 ROTEIRO] → [3 PLANO VISUAL] → [4-6 PRODUÇÃO] → [7 MONTAGEM]
                                                                    │
                                            [9 CRÍTICO] ◄───────────┤
                                                 │                  │
                                                 ▼            [8 ADAPTAÇÃO]
                                        [10 MESA (Telegram)]        │
                                                 │                  │
                                          aprovado│                 ▼
                                                 └──────►  pecas/<lote>/ prontas
                                                                    │
                                                       owner sobe no agendador
                                                                    │
                                        [11 COLETA] ◄───────────────┘
                                             │
                                        [12 SÍNTESE] ──► ajusta a quota do próximo lote
```

## Estrutura de arquivos

```
.marketing/fabrica/
├── scripts/                 # o pipeline (Node/TS, versionado)
├── acervo/
│   ├── tela/                # gravações do produto — reutilizáveis, custo zero
│   ├── bruto/               # clipes do celular do owner (mãos, rua, bancada)
│   ├── gerado/              # b-roll de IA — CACHE, nunca regerar o mesmo
│   ├── voz/                 # narrações — CACHE por hash do texto
│   └── musica/              # trilhas livres de direitos
├── pauta/<lote-id>.json
├── lotes/<lote-id>.json     # estado: proposto → aprovado → publicado
├── pecas/<lote-id>/<peca-id>/{peca.json, video.mp4, preview.gif}
└── metricas/{bruto/, sintese/}
```

**Cache é regra, não otimização.** B-roll e voz são os únicos itens cobrados por unidade
gerada. Regerar o mesmo ativo é queimar dinheiro sem produzir nada novo.

---

## Os doze estágios

### 1 · Estrategista de pauta

| | |
|---|---|
| **Função** | Decidir o que o lote vai conter: quantas peças, de que tipo, para qual nicho, com que ângulo |
| **Entrada** | `metricas/sintese/` do lote anterior · quotas vigentes · `nichos.ts` · `POSICIONAMENTO.md` · peças já publicadas (para não repetir) |
| **Saída** | `pauta/<lote-id>.json` — array de `{pecaId, tipo, nicho, angulo, dorAlvo, hipotese}` |
| **Ferramentas** | Read do repositório. Sem rede |
| **Limites** | Pode ajustar **quota** entre tipos e nichos. **Não pode** trocar canal, criar tipo novo, mudar posicionamento nem tocar em preço |
| **Rubrica** | Nenhum ângulo repetido nos últimos 2 lotes · toda peça declara uma hipótese falsificável · quota respeita o teto de 20% de "utilidade" |
| **Teste** | Dado um `sintese` sintético em que "opinião" performou 3× e "utilidade" 0,3×, a quota seguinte precisa subir opinião e reduzir utilidade |
| **Custo** | ~R$ 0,50/lote |
| **Falha** | Sem métrica disponível → usa a quota inicial de `PLANO-PRE-LANCAMENTO.md` §4 e registra o motivo |
| **Autonomia** | **Total** (D-18) |

### 2 · Roteirista

| | |
|---|---|
| **Função** | Transformar cada item da pauta em roteiro plano a plano |
| **Entrada** | Item da pauta · `nichos.ts` (conversas de dor já escritas) · `ativos/roteiros-video.md` · guardrails |
| **Saída** | `{pecaId, duracaoAlvo, planos:[{ordem, segundos, tipoImagem, descricao, textoTela, narracao}], legendaBase, hipotese}` |
| **Ferramentas** | Read. Sem rede |
| **Limites** | 15–35 s · máximo 1 linha de texto na tela por plano · nunca menciona preço, "grátis", recurso inexistente ou número não medido |
| **Exemplos** | Bom: as quatro conversas de `nichos.ts` — fala real de profissão, sem adjetivo. Ruim: "Descubra como revolucionar sua agenda!" |
| **Rubrica** | Abre por cena, nunca por benefício · a última fala da dor é sempre a do profissional (é a que dói) · o produto aparece resolvendo, não sendo apresentado |
| **Teste** | Um roteiro contendo "R$", "grátis" ou "%" é rejeitado automaticamente antes do crítico |
| **Custo** | ~R$ 0,30/peça |
| **Falha** | Roteiro fora do limite de duração → reescreve uma vez; falhando de novo, marca a peça como `descartada` e segue o lote |
| **Autonomia** | Total até a mesa de aprovação |

### 3 · Diretor de imagem

| | |
|---|---|
| **Função** | Resolver de onde vem cada plano — e é aqui que o custo do lote é decidido |
| **Entrada** | Roteiro · índice do `acervo/` |
| **Saída** | Roteiro anotado com `fonte: tela \| bruto \| gerado \| imagem \| texto` e o caminho do ativo, ou o prompt de geração |
| **Ferramentas** | Read, listagem do acervo |
| **Limites** | **Ordem de preferência obrigatória: acervo existente → gravação de tela → clipe bruto do owner → geração por IA.** Teto de 6 segundos gerados por peça sem aprovação explícita |
| **Rubrica** | Toda peça precisa de pelo menos um plano de produto real (tela) — sem isso vira publicidade genérica sem prova |
| **Teste** | Um lote de 12 peças não pode ultrapassar 60 s de b-roll gerado no total |
| **Custo** | ~R$ 0,20/peça (a decisão é barata; o que ela decide é caro) |
| **Falha** | Ativo faltando no acervo → rebaixa para texto sobre fundo da marca em vez de gerar |
| **Autonomia** | Total dentro do teto; acima dele, pede aprovação |

### 4 · Capturador do produto *(determinístico)*

| | |
|---|---|
| **Função** | Gravar a tela do produto executando fluxos reais |
| **Entrada** | Nome do fluxo (`booking-completo`, `horario-some-ao-confirmar`, `cadastrar-servico`, `link-na-bio`) |
| **Saída** | `acervo/tela/<fluxo>-<viewport>.mp4` |
| **Ferramentas** | Playwright headed com captura de vídeo, contra o app rodando local |
| **Limites** | **Nunca** grava com dado real de terceiro — tenant de demonstração fixo, nomes fictícios. Viewport de celular por padrão |
| **Rubrica** | Sem PII na tela · sem barra de URL de localhost visível · cursor visível e movimento em velocidade humana |
| **Teste** | Frame final do fluxo `booking-completo` contém a tela de sucesso; um assert de OCR ou de seletor antes de salvar |
| **Custo** | **R$ 0** |
| **Falha** | Fluxo quebrado (o produto mudou) → falha ruidosa, não silenciosa: o lote não usa gravação desatualizada |
| **Autonomia** | Total — é leitura, não escrita |

### 5 · Gerador de voz *(API)*

| | |
|---|---|
| **Função** | Narração PT-BR |
| **Entrada** | Texto de narração do roteiro |
| **Saída** | `acervo/voz/<sha256-do-texto>.mp3` |
| **Ferramentas** | API de TTS PT-BR |
| **Limites** | Uma voz fixa para todas as peças (consistência substitui rosto) · cache obrigatório por hash |
| **Rubrica** | Sotaque brasileiro neutro · ritmo de conversa, não de locução de propaganda |
| **Teste** | Mesmo texto duas vezes → zero chamadas de API na segunda |
| **Custo** | ~R$ 0,10–0,40/peça |
| **Falha** | API fora → peça sai sem narração, só com texto na tela. **Não bloqueia o lote** |
| **Autonomia** | Total |

### 6 · Gerador de b-roll e imagem *(API — o item caro)*

| | |
|---|---|
| **Função** | Produzir os planos de apoio que não existem no acervo |
| **Entrada** | Prompt do diretor de imagem |
| **Saída** | `acervo/gerado/<hash>.mp4` / `.png` |
| **Ferramentas** | API de geração de vídeo e de imagem |
| **Limites** | Teto por peça (6 s) e por lote (60 s) · **nunca gerar pessoa identificável** (colide com D-04 e com o risco de leitura de golpe) · cache obrigatório |
| **Rubrica** | Plausível para a profissão retratada · nada de mão com seis dedos · nada de estética "IA genérica" que denuncia a origem |
| **Teste** | Custo do lote calculado **antes** de gerar e apresentado na mesa de aprovação; acima do teto, o lote não gera |
| **Custo** | ~R$ 2–8/peça, dominante no orçamento |
| **Falha** | Cota estourada ou API fora → rebaixa para acervo bruto ou texto. Nunca trava o lote |
| **Autonomia** | Dentro do teto |

### 7 · Montador *(determinístico)*

| | |
|---|---|
| **Função** | Juntar planos, voz, texto, trilha e marca num MP4 vertical |
| **Entrada** | Roteiro anotado + ativos resolvidos |
| **Saída** | `pecas/<lote>/<peca>/video.mp4` + `preview.gif` |
| **Ferramentas** | `ffmpeg` |
| **Limites** | 1080×1920 · legenda queimada (a maioria assiste sem som) · identidade oficial (`#3DBAED`→`#3961D5`, `#4219B0`, Poppins) — **nunca outra paleta** |
| **Rubrica** | Nenhum texto cortado pela área de UI da plataforma · primeiro frame legível como capa · sem silêncio no início |
| **Teste** | Sonda de duração, resolução e presença de faixa de áudio em todo MP4 antes de ir para a mesa |
| **Custo** | **R$ 0** |
| **Falha** | `ffmpeg` falha → peça marcada como `erro`, com o comando registrado. O lote continua |
| **Autonomia** | Total |

### 8 · Adaptador por plataforma

| | |
|---|---|
| **Função** | Uma peça, quatro destinos |
| **Entrada** | Peça montada + legenda base |
| **Saída** | `peca.json` com `{instagram, tiktok, youtube, facebook}`, cada um com legenda, hashtags, primeiro comentário, título e link com UTM |
| **Limites** | Hashtags por plataforma (TikTok poucas e específicas; Instagram moderado; YouTube título é o que importa; Facebook quase nenhuma) · UTM sempre com `utm_content=<pecaId>` |
| **Rubrica** | A legenda do TikTok não pode parecer legenda de Instagram · nenhum "link na bio" enquanto não houver destino (D-15) |
| **Teste** | Todo destino tem UTM válida e nenhuma legenda ultrapassa o limite da plataforma |
| **Custo** | ~R$ 0,20/peça |
| **Falha** | Falta de adaptação → usa a legenda base e sinaliza na mesa |
| **Autonomia** | Total |

### 9 · Crítico

O portão de qualidade. **Reprova, não conserta.**

| | |
|---|---|
| **Função** | Julgar cada peça em quatro eixos e devolver veredito com motivo |
| **Entrada** | `peca.json` + roteiro + `video.mp4` |
| **Saída** | `{pecaId, veredito: aprovada\|revisar\|reprovada, eixos:{veracidade, autenticidade, natividade, clareza}, motivos[]}` |
| **Rubrica** | **Veracidade (eliminatório):** nenhum número não medido, nenhum preço, nenhum "grátis", nenhum recurso inexistente, nada que esconda que WhatsApp é do Pro. **Autenticidade:** passa no teste "isso parece template ou texto de IA?" — se serviria para qualquer SaaS trocando o nome, reprova. **Natividade:** parece conteúdo daquela plataforma, não anúncio reaproveitado. **Clareza:** dá pra entender sem som e sem contexto |
| **Limites** | Não reescreve. Peça `revisar` volta ao estágio 2 uma única vez |
| **Testes de regressão** | Um conjunto fixo de peças-isca — uma com preço, uma com número inventado, uma escrita em tom de LinkedIn, uma que promete multi-profissional. **Todas precisam ser reprovadas.** Se alguma passar, o crítico está quebrado e o lote não sai |
| **Custo** | ~R$ 0,50/peça |
| **Falha** | Crítico indisponível → **o lote não vai para a mesa**. Este é o único ponto em que falhar bloqueia de propósito |
| **Autonomia** | Total para reprovar. Zero para aprovar sozinho — quem aprova é o owner |

### 10 · Mesa de aprovação *(Telegram)*

| | |
|---|---|
| **Função** | Levar o lote ao owner e capturar a decisão |
| **Entrada** | Peças aprovadas pelo crítico |
| **Saída** | `lotes/<lote-id>.json` com `{pecaId, decisao: aprovada\|rejeitada\|ajustar, comentario}` |
| **Ferramentas** | Bot de Telegram (`sendVideo` + teclado inline) |
| **Limites** | Envia **preview leve**, não o MP4 final · mostra custo acumulado do lote · nada segue sem decisão explícita |
| **Rubrica** | Um toque por peça · resumo do lote antes das peças (quantas, de que tipo, custo, hipóteses) |
| **Teste** | Reenvio da mesma peça não duplica decisão (idempotência por `pecaId`) |
| **Custo** | R$ 0 |
| **Falha** | Bot fora → fallback para página HTML local com o mesmo lote |
| **Autonomia** | **Nenhuma.** É o portão humano |

### 11 · Coletor de métricas

| | |
|---|---|
| **Função** | Puxar desempenho por peça e por canal |
| **Entrada** | `pecaId` publicados |
| **Saída** | `metricas/bruto/<data>.json` — views, retenção, salvamentos, comentários, cliques |
| **Ferramentas** | API do agendador |
| **Limites** | Só leitura. Nunca escreve em plataforma |
| **Teste** | Peça sem métrica aparece como `sem_dado`, nunca como zero — a diferença muda a conclusão |
| **Custo** | R$ 0 (incluso no agendador) |
| **Falha** | API fora → mantém o último dado e sinaliza defasagem |
| **Autonomia** | Total |

### 12 · Sintetizador de aprendizado

| | |
|---|---|
| **Função** | Transformar número em decisão de pauta |
| **Entrada** | `metricas/bruto/` + histórico |
| **Saída** | Seção nova em `METRICAS.md` + quotas atualizadas para o estágio 1 |
| **Limites** | **Amostra mínima de 5 peças por tipo antes de mexer em quota.** Ajuste máximo de 15 pontos percentuais por lote — evita oscilação por ruído |
| **Rubrica** | Toda conclusão cita o número que a sustenta · declara quando a amostra é insuficiente em vez de concluir mesmo assim |
| **Teste** | Com 3 peças de um tipo, a quota **não** pode mudar |
| **Custo** | ~R$ 1/lote |
| **Falha** | Sem dado → não altera nada e escreve o porquê |
| **Autonomia** | **Total sobre quota. Zero sobre estratégia** (D-18) |

---

## Custo estimado

| Item | Por mês |
|---|---|
| Agendador (4 canais + métricas) | R$ 60–120 |
| Voz sintetizada | R$ 30–130 |
| Geração de vídeo/imagem | R$ 100–400 |
| Chamadas de modelo (pauta, roteiro, crítico, síntese) | R$ 20–60 |
| **Fábrica** | **R$ 210–710** |
| Mídia de aprendizado (D-16) | R$ 150–300 |

Com 2 lotes de 12 peças por mês: **R$ 9–30 por peça publicada**, contra 4h humanas por lote.
Números são ordens de grandeza a confirmar antes de assinar qualquer coisa — preços de
ferramenta mudam e o conhecimento de base vai até maio/2026.

---

## Plano de implementação

Nenhuma fase depois da 1 acontece sem autorização específica.

### Fase 1 — Documentação e decisões ✅ concluída nesta sessão
`.marketing/` reorientado, decisões D-12 a D-19, este documento.
**Risco:** zero. **Rollback:** `git checkout`.

### Fase 2 — Protótipo de criativos ✅ concluída em 2026-07-28
**Entregue:** `scripts/render-cenas.mjs` (roteiro JSON → 10 PNGs 1080×1920 via Chrome
headless), `scripts/montar.mjs` (PNGs → MP4 H.264 com áudio sintetizado),
`scripts/verificar.mjs` (sonda de aceite), `roteiros/R-01-barbeiro.json`, quatro capturas
reais do produto em `acervo/tela/`, Poppins 400/600/800 em `acervo/fonte/`, e a peça
`pecas/R-01-barbeiro/` — 25 s, 1080×1920, 13 MB, **custo R$ 0**.
**Teste:** sonda aprovou a peça e **reprovou** um arquivo sem áudio e outro em 720×1280.
**Aceite:** pendente — o owner precisa assistir e dizer se postaria.
**Rollback:** apagar `pecas/` e `scripts/`.

**Duas descobertas que mudaram o desenho:**
1. **O ffmpeg desta máquina não tem `libx264`, só `libopenh264`.** O montador detecta o
   encoder disponível em vez de assumir, e falha ruidosamente se não houver nenhum H.264 —
   H.264 é o que as quatro plataformas aceitam sem transcodificar.
2. **A fonte `sine` do lavfi sai a ~−18 dBFS, não em escala cheia.** A primeira montagem
   saiu com pico de −34 dB, inaudível no celular. Virou regra na sonda: **pico abaixo de
   −20 dB reprova a peça.**

### Fase 3 — Pipeline completo local
**Arquivos:** estágios 1–9 encadeados por um `fabrica/scripts/lote.ts`.
**Dependências:** contas de TTS e geração. **Permissões:** chaves de API em `.env.local`.
**Risco:** médio — custo real começa aqui. **Mitigação:** teto de gasto por lote,
verificado antes de gerar.
**Teste:** lote de 3 peças dentro do teto de custo. **Aceite:** custo real em ±30% do
estimado. **Rollback:** desligar geração e cair para acervo.

### Fase 4 — Mesa de aprovação no Telegram
**Arquivos:** `fabrica/scripts/mesa.ts`, bot novo.
**Permissões:** token de bot; **canal privado, só o owner**.
**Risco:** baixo. Nada público. **Teste:** aprovar e rejeitar peça, e o estado persistir.
**Rollback:** página HTML local.

### Fase 5 — Agendador
**Permissões:** conta e API do agendador escolhido.
**Risco:** primeiro ponto em que existe ação pública — mitigado porque **o upload é manual**
(D-17). **Aceite:** uma peça publicada nos 4 canais a partir de um upload.
**Rollback:** publicar à mão em cada rede.

### Fase 6 — Métricas e síntese
**Arquivos:** estágios 11–12.
**Risco:** baixo. **Teste:** a quota muda com dado suficiente e **não muda** com dado
insuficiente. **Aceite:** `METRICAS.md` escrito sozinho e legível.
**Rollback:** congelar quotas.

### Fase 7 — Mídia paga
Só depois da barra de promoção (D-16). Contas de anúncio, público, criativo vencedor.
**Permissões:** gerenciador de anúncios. **Risco:** dinheiro. **Rollback:** pausar campanha.

### Fase 8 — Autonomia progressiva
Publicação automática por API e rascunho de resposta a comentários e DMs. Só entra depois
de 4–6 semanas de rubrica do crítico batendo com o julgamento do owner.
**Risco:** alto — ação pública sem revisão. **Rollback:** voltar para aprovação manual.

---

## O que a fábrica nunca faz sem autorização específica

1. Publicar em qualquer plataforma
2. Gastar acima do teto declarado do lote
3. Enviar mensagem em nome do owner (DM, comentário, e-mail)
4. Mudar estratégia, canal, nicho ou posicionamento
5. Gerar pessoa identificável
6. Citar preço, "grátis", número não medido ou recurso inexistente
7. Tocar em código de produto ou em qualquer coisa fora de `.marketing/`
