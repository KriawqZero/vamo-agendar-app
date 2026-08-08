# Backlog de marketing — v2

**Revisado:** 2026-07-28 após a reorientação (D-12)
**Priorização:** ICE — Impacto (1–5) × Confiança (1–5) × Facilidade (1–5). Máximo 125.

Estados: `⬜ aberto` · `🔵 em andamento` · `✅ feito` · `🧊 congelado` · `❌ descartado`

---

## Agora — construir a fábrica

| # | Item | I | C | F | Score | Estado |
|---|---|---|---|---|---|---|
| F-01 | ~~Protótipo de uma peça completa~~ | — | — | — | — | ✅ **2026-07-28** — aprovado pelo owner ("postaria") |
| F-01b | ~~Lote 01: uma peça por nicho~~ | — | — | — | — | ✅ **2026-07-28** — 4 peças (barbeiro, manicure, lash, sobrancelhas), todas aprovadas na sonda, **custo total R$ 0**. Legendas por canal em cada `peca.json` |
| F-01c | **Publicar o lote 01** — subir as 4 peças, com áudio nativo escolhido no app (D-20). É o primeiro dado real do projeto e destrava E-07 e E-08 | 5 | 5 | 4 | **100** | ⬜ **próxima** |
| F-05b | **Trilha nativa no upload** (D-20) — a fábrica não produz música; escolher o áudio da plataforma na hora de publicar | 3 | 5 | 5 | **75** | ⬜ hábito |
| F-02 | **Página de conversão** — sessão de código à parte, guiada por `ativos/brief-pagina-conversao.md`. Destrava métrica norte, CTA das peças e destino de mídia | 5 | 5 | 4 | **100** | ⬜ |
| F-03 | **Assinar ferramentas** — agendador, TTS PT-BR, geração de vídeo/imagem. Confirmar preços reais antes | 4 | 5 | 5 | **100** | ⬜ |
| F-04 | **TikTok `@vamoagendar`** + bios dos 4 perfis (copy pronta em `ativos/perfis-sociais.md`) | 3 | 5 | 5 | **75** | ⬜ |
| F-05 | **Capturador de tela do produto** — Playwright gravando os 4 fluxos (`booking-completo`, `horario-some-ao-confirmar`, `cadastrar-servico`, `link-na-bio`). Custo zero e é o único ativo de prova | 5 | 4 | 4 | **80** | ⬜ |
| F-06 | **Pipeline completo** (Fase 3) — estágios 1–9 encadeados, primeiro lote de 3 peças com teto de custo | 5 | 4 | 2 | **40** | ⬜ |
| F-07 | **Mesa de aprovação no Telegram** (Fase 4) | 4 | 4 | 3 | **48** | ⬜ |
| F-08 | **Acervo bruto** — hábito de captar clipes de 5s no celular (mãos, rua, tesoura, bancada). Cada clipe captado é b-roll que não precisa ser gerado, e geração é o item caro | 4 | 4 | 5 | **80** | ⬜ |
| F-09 | **Testes de regressão do crítico** — peças-isca com preço, número inventado, tom de LinkedIn e promessa falsa. Todas precisam ser reprovadas | 5 | 5 | 4 | **100** | ⬜ |

---

## Próximo — operar e medir

| # | Item | I | C | F | Score | Estado |
|---|---|---|---|---|---|---|
| F-10 | **Coleta de métricas + síntese automática** (Fase 6) | 4 | 4 | 3 | **48** | ⬜ |
| F-11 | **Conta de anúncios + R$ 5–10/dia de aprendizado** (D-16) | 3 | 4 | 4 | **48** | ⬜ |
| F-12 | **Primeira campanha real** — só com a barra batida (≥ 3× a média própria ou ~10 mil views) | 4 | 3 | 3 | **36** | 🧊 gatilho |
| F-13 | **OG image própria** — hoje é o default do template; todo link compartilhado aparece sem identidade | 3 | 5 | 4 | **60** | ⬜ |
| F-14 | **Publicação automática por API** (Fase 8) | 3 | 2 | 2 | **12** | 🧊 |
| F-15 | **Rascunho de resposta a comentário e DM** (Fase 8) | 4 | 3 | 2 | **24** | 🧊 adiado pelo owner |

---

## Congelado pela reorientação (D-12) — correto, mas não é esta fase

| # | Item | Gatilho para descongelar |
|---|---|---|
| M-01 | `sitemap.ts` + `robots.ts` + as duas rotas em `isPublicRoute` (`/sitemap.xml` responde `307 → /sign-in` hoje) | Sessão de site |
| M-02b | Desligar o `robots.txt` gerenciado no Cloudflare — o produto está invisível para crawler de IA por default de fornecedor (D-09) | 15 min no painel, quando o owner quiser |
| M-02c | `llms.txt` na raiz | Junto do M-01 |
| M-10 | Validar volume de busca por nicho | Antes de qualquer expansão de SEO |
| M-12 | Segundo lote de nichos programáticos | Depois do M-10 |
| M-13 | Schema.org nas verticais | Sessão de site |
| M-15 | Eixo cidade (`/para/[nicho]/[cidade]`) | Congelado — ICP é nacional (D-07) |

---

## Depois do go-live

| # | Item | Gatilho |
|---|---|---|
| M-16 | **Contador de agenda densa como mensagem** ("N vãos invendáveis evitados este mês") — dá número real ao diferencial hoje mudo, e é o único conteúdo que nenhum concorrente consegue copiar | Phase 6 do roadmap |
| M-17 | Programa de indicação | 10 profissionais ativos com agendamento real |
| M-18 | Fluxos de e-mail de ativação e retenção | Phase 4 do roadmap |
| M-19 | Primeiros casos reais (com autorização, sem inventar número) | 3 profissionais com 30 dias de uso |
| M-20 | Ferramenta grátis como isca | Se o orgânico já tiver sinal |

---

## Descartado (com motivo, para não voltar por esquecimento)

| Item | Motivo |
|---|---|
| Blog / conteúdo longo | Não é o formato onde o ICP consome nada |
| LinkedIn | O ICP não está lá |
| Product Hunt | Audiência de tecnologia americana; produto pt-BR para profissional de beleza |
| Newsletter | Sem lista e sem tempo de escrita recorrente |
| Comunidade própria | Custo de manutenção alto, retorno lento, e não há quem reunir |
| Build in public no X | Audiência de devs; não gera cliente do ICP |
| Influenciador pago | Cobra caro e exige prova social que não existe |
| Conteúdo educativo genérico de beleza | Compra seguidor sem correlação com quem paga por agenda |
| **Avatar de IA falando** | Alto risco de leitura de golpe nesse nicho, e colide com o tom honesto — o único ativo de marca que existe hoje |
| **DM fria em volume** | Revogada por D-12. O conteúdo virou o canal de contato |
| **n8n para a fábrica** | Workflow visual quebra em silêncio e se debuga mal; código é versionado e testável (D-19) |
