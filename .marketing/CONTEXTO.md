# Contexto — o que o marketing precisa saber sobre o produto

**Atualizado:** 2026-07-28
**Fonte:** leitura direta do repositório (`src/app/page.tsx`, `src/lib/nichos.ts`,
`src/lib/planos.ts`, `docs/05`, `docs/07`, `docs/08`, `.planning/PROJECT.md`,
`.planning/ROADMAP.md`, `.planning/research/`)

Posicionamento e ICP moram em `.agents/product-marketing.md`. Este arquivo registra o
**estado material**: o que existe, o que não existe, e o que impede o marketing de agir.

---

## Estado real em 2026-07-28

| Dimensão | Estado |
|---|---|
| Produto | Funcional. Agenda, engine de disponibilidade, WhatsApp, personalização, planos — tudo construído |
| Lançamento | **Fase 3 de 12** do roadmap `.planning/ROADMAP.md`. Sem data fixa |
| Usuários reais | **Zero.** Nenhum profissional, nenhum agendamento de cliente final |
| Receita | **Zero.** Checkout não existe (Asaas só tem sandbox) |
| Prova social | **Zero.** Nenhum depoimento, nenhum case, nenhum print de uso real |
| Domínio | `vamoagendar.com.br` no ar, atrás de Cloudflare |
| Divulgação feita até hoje | Nenhuma |

**Leitura honesta:** isto não é "aquecer para o dia do lançamento". É pré-lançamento de
verdade — validar público, mensagem e canal enquanto o código fecha, e chegar no go-live
com gente já convencida em vez de audiência genérica.

---

## Ativos de marketing que JÁ existem (e estão parados)

Isto é o achado mais importante da investigação. O produto tem mais ativo de marketing
pronto do que a maioria dos projetos tem no dia do lançamento.

### 1. Landing principal narrativa — `src/app/page.tsx`

Um dia contado no relógio (22:31 → 09:12 → 08:00 → fecho), com dois modos de iluminação
(dia/noite) que mudam o texto. Sem faixa de seção, sem card de feature, sem "por que nos
escolher". É copy de nível alto e é o padrão de tom que tudo o mais deve seguir.

### 2. Quatro landings verticais SSG — `/para/[nicho]`

`barbeiro`, `manicure`, `lash-designer`, `designer-de-sobrancelhas`.
Fonte da verdade em `src/lib/nichos.ts`: cada nicho tem abertura, conversa de dor com 4
falas, três benefícios ancorados em horário do dia, serviços de demo com preço e duração
plausíveis, 4 perguntas de "como funciona" (incluindo **"o que o VamoAgendar não tenta
ser"**) e metadados de SEO.

> **Este arquivo é o motor criativo do conteúdo.** As conversas de dor de `nichos.ts` são
> roteiro de vídeo pronto — escritas com precisão de profissão que não se improvisa.
> Toda peça de conteúdo deve nascer daqui, não de brainstorm em branco.

### 3. Demo interativa clicável — `DemoAgendamento`

Na landing, o visitante mexe no fluxo real. Hoje é o **único ativo de prova que existe**.
Sem cliente, prova é demonstração — e essa demonstração já está construída.

### 4. Identidade visual paga e aprovada

Azul `#3DBAED` → `#3961D5` + roxo `#4219B0`, Poppins, logo em `artes-aprovadas-design/`.
Não propor paleta nova em peça nenhuma.

### 5. Instrumentação de funil PostHog

Eventos já emitidos: `landing_viewed` (com propriedade `nicho`), `signup_completed`,
`first_service_created`, `booking_completed`, `booking_failed`, `schedule_configured`,
`whatsapp_confirmation_sent`, entre outros. Mapa em `docs/08-ANALYTICS_E_FUNIL.md`.
**Dá pra medir funil de aquisição desde o primeiro visitante.**

---

## Buracos abertos que travam marketing

> ⚠️ **Congelados desde 2026-07-28 (D-12).** Os buracos B-1, B-2 e B-8 continuam reais e o
> diagnóstico continua correto — mas são tarefas de site, e site saiu do escopo desta fase.
> Estão em `BACKLOG.md` na seção "Congelado pela reorientação", com gatilho. **B-3 virou a
> página de conversão**, com briefing escrito em `ativos/brief-pagina-conversao.md` (D-15).

| # | Buraco | Impacto | Custo de fechar |
|---|---|---|---|
| B-1 | **Não existe `sitemap.ts`** e o `robots.txt` servido é o **gerenciado pelo Cloudflare**, não do projeto | Nenhuma sinalização própria de indexação. As 4 verticais dependem de descoberta por link, que não existe — ninguém aponta pra elas | Baixo (código, ~1h) |
| B-2 | **`/sitemap.xml` responde `307 → /sign-in`** — o `clerkMiddleware` protege a rota porque ela não está em `isPublicRoute` (`src/proxy.ts:3`) e o `matcher` não exclui `.xml`/`.txt` | **Armadilha silenciosa:** criar o `sitemap.ts` sem tocar no `proxy.ts` entrega ao Googlebot uma tela de login. O trabalho pareceria feito e não funcionaria | Uma linha em `src/proxy.ts` |
| B-3 | **Não existe lista de fundadores / captura de e-mail** | Todo visitante do pré-lançamento é perdido. Não há ação de conversão possível antes do go-live | Médio (código, meia sessão) |
| B-4 | **`og.png` é o default do template** | Todo link compartilhado no WhatsApp/Instagram aparece sem identidade | Baixo (design + código) |
| B-5 | **Preço na landing está desatualizado** (Plus R$ 9,90 / Pro R$ 14,90 com "-50%") | A decisão registrada extingue o Plus e leva o Pro a R$ 39,90. **Proibido citar preço em peça de marketing até a Phase 7 fechar** | Depende do roadmap (Phase 7) |
| B-6 | **Sem termos de uso e política de privacidade** | Bloqueia captação de e-mail com conforto jurídico e bloqueia o go-live | Phase 10 do roadmap |
| B-7 | **Nenhuma fala verbatim de cliente real** | Toda copy hoje é hipótese bem escrita, não evidência | Só conversa resolve — ver `PESQUISA.md` |
| B-8 | **O `robots.txt` gerenciado do Cloudflare bloqueia todos os crawlers de IA** (`GPTBot`, `ClaudeBot`, `Google-Extended`, `CCBot`, `Bytespider`, `meta-externalagent`, `Applebot-Extended`, `Amazonbot`) com `ai-train=no` | O produto é **invisível para descoberta via assistente de IA**. Foi default do Cloudflare, não decisão do owner. Busca clássica segue liberada (`search=yes`, `Allow: /`) | **Decidido em D-09: liberação total.** Execução em M-02b (painel Cloudflare, ação do owner) + M-01 (`robots.ts` próprio) |

**Verificado em 2026-07-28 (curl real contra produção):** o site responde **200** a
Googlebot, a navegador desktop e a mobile. O 403 visto em ferramentas de fetch é o
Cloudflare bloqueando o `ClaudeBot` especificamente, coerente com B-8 — **não** é bloqueio
de indexação. `/para/barbeiro`, `/para/manicure`, `/para/lash-designer` e
`/para/designer-de-sobrancelhas` respondem 200. **A hipótese de bloqueio de SEO está
descartada.**

---

## Restrições que moldam qualquer plano

*Revisadas em 2026-07-28 pela reorientação D-12 — as três primeiras mudaram por completo.*

1. **Tempo: irregular, sem teto.** Semanas de zero, dias inteiros dedicados. O teto de
   5h/semana da v1 foi revogado (D-01) porque não descrevia a realidade e induzia um plano
   pequeno demais. **Consequência de desenho:** o sistema tem que produzir em lote e
   sobreviver a ausências, não depender de cadência diária.
2. **Orçamento: acima de R$ 600/mês.** Fábrica (agendador + voz + geração de vídeo/imagem)
   entre R$ 210 e R$ 710/mês, mais até R$ 300/mês de mídia de aprendizado (D-16, exceção
   registrada no `.planning/PROJECT.md`).
3. **Lançamento estimado em 4–8 semanas.** Todo criativo precisa continuar servindo depois
   do go-live — nada que só faça sentido em pré-lançamento.
4. **Zero rede no nicho** (confirmado pelo owner). Toda aquisição começa fria — e por isso
   o conteúdo é o canal, não a abordagem 1:1.
5. **Sem rosto em conteúdo** (D-04, preservada). Voz sintetizada e b-roll sem pessoa
   identificável são aceitáveis; avatar de IA falando foi descartado.
5. **Fricção Zero é inegociável.** Nenhuma ação de marketing pode propor cadastro, cupom
   com login ou captura de dado do cliente final. O cliente final não é lead do
   VamoAgendar — é cliente do profissional.
6. **Honestidade da copy é ativo de marca.** A landing declara o que o produto não faz e
   marca recurso de Pro explicitamente. Quebrar isso na primeira campanha destrói o único
   diferencial de tom que existe.
7. **WhatsApp via Evolution API é a peça frágil da stack.** Volume alto de divulgação nos
   primeiros dias concentra risco de banimento de número. Isso limita o ritmo de ativação
   — é restrição de marketing, não só de engenharia.
