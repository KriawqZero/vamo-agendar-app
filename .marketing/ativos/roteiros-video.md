# Roteiros de vídeo — formato "a conversa que não precisa existir"

**Formato único** (D-05). Reels + TikTok, vertical 9:16, 15–25 segundos, sem rosto.
Voz off opcional. Fonte dos diálogos: `src/lib/nichos.ts` — não inventar conversa nova
enquanto as quatro que já existem não tiverem rodado.

---

## A estrutura (vale para todos)

**0–2s · O gancho visual.** Tela de conversa do WhatsApp, dedo digitando. Nenhum texto
explicativo ainda. Quem é do nicho reconhece a cena antes de ler qualquer coisa.

**2–10s · A conversa.** As falas entram uma a uma, com o timing de mensagem chegando.
A última fala é sempre a **sua** — a que empurra pra frente sem resolver.

**10–13s · O silêncio.** Um beat parado na última mensagem. Sem trilha, ou trilha caindo.
É o momento em que a pessoa se vê ali.

**13–22s · A virada.** Corte para a tela do link. Serviço → dia → hora → confirmado.
Gravação de tela real do produto, sem mock, sem animação de apresentação.

**22–25s · O fecho.** Uma linha de texto na tela. Nunca mais que uma.

**Legenda sempre queimada no vídeo** — a maioria assiste sem som.

---

## R-01 · Barbeiro

**Diálogo** (de `nichos.ts`, nicho `barbeiro`, seção `dor`):

> — E aí! Consegue me encaixar hoje ainda?
> — Hoje só 18h30, fechou?
> — 18h30 não dá… e amanhã cedo?
> — **Te falo quando terminar esse corte**

**Silêncio na última fala.**

**Virada:** tela do link. Corte + barba selecionado → quinta → 15h → confirmado.

**Fecho:** `essa conversa não precisa existir`

**Voz off (opcional):** "Enquanto você digita isso, a máquina tá desligada e o cliente da
cadeira tá esperando."

---

## R-02 · Manicure

**Diálogo** (nicho `manicure`):

> — Oi! Consegue me encaixar no sábado?
> — Sábado tenho 8h ou 16h40!
> — Vou ver com meu marido e te aviso!
> — **Fechou? Preciso confirmar pra segurar a vaga…**

**Silêncio.**

**Virada:** a tela do link mostra o sábado; alguém confirma 16h40; **o horário some da
lista**. O sumiço é o ponto do vídeo — filmar isso com clareza.

**Fecho:** `quem quer o horário confirma na hora. e ele some pras outras.`

**Voz off:** "Enquanto ela vê com o marido, duas vagas ficam presas."

---

## R-03 · Lash designer

**Diálogo** (nicho `lash-designer`):

> — Amiga, preciso remarcar a manutenção de amanhã!
> — Tranquilo! Tenho quinta às 14h
> — Quinta só consigo depois das 17h… tem?
> — **Deixa eu conferir a agenda e te falo**

**Silêncio.**

**Virada:** aplicação de 2h e manutenção de 80 min lado a lado na tela — os horários
oferecidos são diferentes, porque a duração é diferente.

**Fecho:** `três interrupções no meio de um volume russo`

**Voz off:** "Sessão de duas horas. Três vezes largando a pinça pra responder isso."

---

## R-04 · Designer de sobrancelhas

**Diálogo** (nicho `designer-de-sobrancelhas`):

> — Oi! Tem horário pra design com henna essa semana?
> — Tenho quinta 10h ou sexta 16h!
> — Quinta não consigo… sexta tem mais cedo?
> — **Te respondo assim que acabar o atendimento**

**Silêncio.**

**Virada:** o link na bio do Instagram sendo tocado, e o agendamento acontecendo em três
toques.

**Fecho:** `o direct volta a ser vitrine`

---

## Variações para o experimento E-01

Três aberturas diferentes, mesmo nicho, mesma duração, mesma semana — para descobrir qual
dor puxa mais retenção. **Só a abertura muda; a virada e o fecho ficam idênticos.**

| Braço | Dor | Abertura |
|---|---|---|
| A | **Interrupção** | A conversa chegando com o cliente na cadeira (é o R-01 padrão) |
| B | **Prejuízo** | Tela do horário vazio às 18h30 num sábado. "Ela não apareceu." |
| C | **Vaga presa** | Duas conversas abertas ao mesmo tempo, as duas dizendo "vou ver e te aviso" |

---

## Regras de produção

1. **Gravação de tela real do produto.** Nada de mockup, nada de animação de
   apresentação. A prova é o produto funcionando — é o único ativo de prova que existe.
2. **Nunca citar preço** (D-03).
3. **Nunca esconder que WhatsApp automático é do plano Pro.** Se o vídeo mostrar lembrete
   automático, a legenda diz "plano Pro". A landing é explícita nisso e o conteúdo não
   pode ser menos honesto que a landing.
4. **Nenhum número não medido.** Nada de "reduza faltas em 40%".
5. **Sem trend dançante, sem áudio viral aleatório.** Trilha discreta, ou silêncio.
6. **Identidade visual oficial:** azul `#3DBAED` → `#3961D5`, roxo `#4219B0`, Poppins.
   Nunca outra paleta.
7. **Link na bio com UTM** — `?utm_source=instagram|tiktok&utm_medium=organic&utm_campaign=pre-lancamento&utm_content=<id do vídeo>`.
   Sem isso a atribuição no PostHog some.

---

## O que medir por vídeo

Retenção média (%) · salvamentos · comentários · cliques no link da bio nas 48h seguintes.

**Salvamento vale mais que curtida** neste nicho: quem salva é quem pretende voltar, e é
o sinal mais próximo de intenção real que a plataforma entrega de graça.
