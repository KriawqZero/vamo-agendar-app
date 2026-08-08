# fabrica/ — pipeline de produção

Arquitetura completa e racional em `../FABRICA.md`. Este arquivo é só o manual de operação.

**Estado:** Fase 2 (protótipo de criativo) **concluída**. Estágios 7 (montagem) e a sonda de
aceite estão implementados e funcionando; pauta, roteirista, crítico, mesa e métricas ainda
não existem.

---

## Rodar

```bash
cd .marketing/fabrica

# 1. roteiro (JSON) → cenas (PNG 1080x1920)
node scripts/render-cenas.mjs roteiros/R-01-barbeiro.json

# 2. cenas → MP4 vertical com áudio
node scripts/montar.mjs pecas/R-01-barbeiro/cenas

# 3. sonda de aceite — nada vai para a mesa sem passar
node scripts/verificar.mjs pecas/R-01-barbeiro/video.mp4
```

Reprodutível: mesmo roteiro + mesmo acervo = mesmos pixels. Não há chamada de rede em
nenhum dos três passos.

## Dependências

| O quê | Por quê | Verificado nesta máquina |
|---|---|---|
| `ffmpeg` com encoder H.264 | Montagem e áudio | ✅ 7.1.5 com `libopenh264` (**sem** `libx264` — o script detecta e se adapta) |
| Google Chrome / Chromium | Renderiza as cenas HTML → PNG | ✅ `google-chrome` |
| Node 18+ | Os scripts | ✅ v24 |
| ImageMagick | Recorte das capturas do produto | ✅ |

Nenhuma delas custa dinheiro.

## Acervo

| Pasta | O que é | Regra |
|---|---|---|
| `acervo/tela/` | Gravações/capturas do produto real | Reutilizável, custo zero. **É o único ativo de prova que existe** |
| `acervo/bruto/` | Clipes que o owner grava no celular | Cada clipe aqui é b-roll que não precisa ser gerado — e geração é o item caro |
| `acervo/gerado/` | B-roll de IA | **Cache obrigatório.** Regerar o mesmo ativo é queimar dinheiro |
| `acervo/voz/` | Narrações | Cache por hash do texto |
| `acervo/fonte/` | Poppins 400/600/800 (TTF) | Identidade oficial. Nunca outra fonte |
| `acervo/musica/` | Vazio, e provavelmente continua | Ver "trilha" abaixo |

## Trilha: a decisão é não ter

A fábrica **não inventa música** e não baixa trilha de origem duvidosa. O vídeo sai com os
toques de mensagem sintetizados e silêncio no resto.

A trilha certa é a **nativa da plataforma**, escolhida na hora do upload. Ela é gratuita,
já licenciada, e áudio nativo é sinal de distribuição para o algoritmo — usar um MP3
próprio joga isso fora. É passo do owner no agendador, não da fábrica.

## Como as capturas do produto foram feitas

Nesta fase, à mão: navegador aberto em `vamoagendar.com.br/para/barbeiro`, o widget de
demonstração isolado por CSS injetado, ampliado, e cada uma das 4 etapas fotografada e
recortada. Os PNGs ficaram em `acervo/tela/` e são reutilizáveis em qualquer peça futura.

O estágio 4 do `FABRICA.md` (capturador determinístico, com Playwright gravando vídeo dos
fluxos) substitui isso na Fase 3. **Enquanto não existir, vale a regra:** se o produto
mudar de visual, as capturas ficam desatualizadas em silêncio — recapturar faz parte de
qualquer mudança de UI que apareça em peça.

## A sonda de aceite

`verificar.mjs` reprova o que quebra sem avisar: resolução fora de 1080×1920, codec que não
é H.264, duração fora de 12–40s, ausência de faixa de áudio, pico de áudio abaixo de −20 dB
(inaudível no celular), arquivo grande demais, e primeiro frame quase preto (vira capa ruim
na grade do perfil).

Testada nos dois sentidos: aprova a peça boa e reprova arquivo sem áudio e com resolução
errada. Sonda que só sabe aprovar não é sonda.

## O que ainda não existe

Estágios 1 (pauta), 2 (roteirista), 3 (diretor de imagem), 4 (capturador determinístico),
5 (voz), 6 (b-roll gerado), 8 (adaptador por plataforma), 9 (crítico), 10 (mesa no
Telegram), 11 (coleta) e 12 (síntese). Todos especificados em `../FABRICA.md` com entrada,
saída, limites, rubrica, testes, custo, fallback e autonomia.

Hoje, o roteiro é escrito à mão em `roteiros/*.json` e a adaptação por plataforma vive em
`pecas/<id>/peca.json`, também à mão.
