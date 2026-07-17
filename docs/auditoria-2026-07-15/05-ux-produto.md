---
status: temporario
gerado: 2026-07-15 18:52
agente: ux-produto
modelo: sonnet
---

# Auditoria UX/Produto — VamoAgendar (2026-07-15)

Percurso feito inteiramente pelo código (páginas, Server Actions, componentes) e pela
documentação viva em `docs/`. Nenhum arquivo existente foi alterado. Onde havia
ambiguidade, decidi pela leitura mais razoável e registrei a decisão junto ao achado.

---

## 1. Onboarding do tenant (B2B) — do signup ao link agendável

**Caminho real, contado pelo código:**

1. `/sign-up` (`src/app/sign-up/[[...sign-up]]/page.tsx`) — widget `<SignUp />` do Clerk, copy honesta ("grátis · sem cartão · leva um minuto"), evento `signup_started` disparado no mount.
2. Primeira visita a `/dashboard` (`src/app/dashboard/page.tsx`): se não houver `orgId` ativo, a tela trava em "Selecione uma Organização" — texto sem nenhum botão de ação, apenas instrução para usar o menu lateral (linhas 26-40).
3. `obterPerfilEmpresa()` (`src/app/actions/perfis-empresas.ts:22-88`) auto-provisiona o perfil no primeiro load (nome vindo da org do Clerk, slug aleatório de 8 caracteres) — **zero fricção aqui, ponto forte real**: o link público existe antes de qualquer configuração manual.
4. Checklist "primeiros passos" no `DashboardClient.tsx` (linhas 367-432): 2 passos acionáveis (cadastrar serviço, configurar horários) + 1 passo informativo (compartilhar link, sem CTA, libera sozinho quando os 2 acima completam).
5. Passo 1 → `/dashboard/servicos`: modal único (nome, descrição, preço, duração, ativo) — direto, sem sub-etapas.
6. Passo 2 → `/dashboard/agenda`: a página abre por padrão na aba **"Perfil da Empresa"** (`AgendaClient.tsx:79`, `abaAtiva` inicial = `'perfil'`), não na aba "Horários Comerciais" que é o que o checklist pediu. O usuário precisa notar e clicar na aba certa. Os defaults de horário (seg–sex 08h–18h, fim de semana fechado) já resolvem a maioria dos casos — um clique em "Salvar Horários" basta se os defaults servirem.
7. Link volta a aparecer "ativo" no dashboard, com botão de copiar.

**Atritos encontrados:**

- **Tela "Selecione uma Organização" sem saída própria** (`src/app/dashboard/page.tsx:26-40`, mesmo texto duplicado em `src/app/dashboard/agenda/page.tsx:14-28`). Severidade **MÉDIA** — depende de uma configuração do Clerk ("Create first organization automatically") que a própria `docs/PENDENCIAS.md` (item P1.10) lista como "conferir se já aplicada", ou seja, não há confirmação de que está ligada em todos os ambientes. Se não estiver, o dono de barbearia sem paciência esbarra numa tela morta no primeiro acesso. Correção: adicionar um botão/CTA explícito nessa tela (ex.: abrir o `OrganizationSwitcher`/criar org direto), independente da configuração do Clerk.
- **Checklist manda para a aba errada** (`AgendaClient.tsx:79` vs. `DashboardClient.tsx:389` que linka para `/dashboard/agenda` genérico). Severidade **BAIXA**. Correção barata: query param (`/dashboard/agenda?aba=horarios`) lido no `useState` inicial.
- **Checklist pode mentir sobre o progresso**: as duas contagens (`countHorarios`, serviços ativos) em `src/app/dashboard/page.tsx:94-120` não checam `error` do Supabase — falha silenciosa vira "não configurado" mesmo com tudo certo (já registrado em `docs/PENDENCIAS.md` item 9, não é achado novo, mas relevante para este fluxo). Severidade **BAIXA/MÉDIA**.

**Onde o dono desiste, honestamente:** o fluxo em si é curto (2 telas + 2 formulários). O ponto de abandono mais provável não é a quantidade de passos, e sim a tela de organização sem saída no primeiro acesso, **se** a configuração do Clerk não estiver correta — é a única parede sem porta do onboarding.

---

## 2. Fluxo de agendamento

### 2.1 Pelo negócio (dashboard)

`NovoAgendamentoModal.tsx` — modal em 4 passos (cliente → serviço → horário → resumo), bottom-sheet no mobile / modal centrado no desktop, busca de cliente com debounce, cadastro inline, reaproveita cliente por telefone, engine de disponibilidade compartilhada com o fluxo público, bloqueio de conflito sem override. **Editar e cancelar agendamentos existem** (`atualizarStatusAgendamento`, `remarcarAgendamento` em `src/app/actions/agendamentos.ts`), acessíveis diretamente na "linha do dia" (`DashboardClient.tsx:554-583`, botões concluir/remarcar/cancelar por atendimento). Cancelamento pede confirmação nativa (`window.confirm`) — funcional, mas não é um destaque de UX, é aceitável para uso interno. **Bem resolvido, sem achados de severidade alta.**

### 2.2 Pelo cliente final (`/book/[slug]`)

Wizard de 3 passos (serviço → data/hora → contato) + tela de sucesso, sem login — cumpre a Fricção Zero na criação.

**Atritos encontrados:**

- **Inconsistência WhatsApp-ou-e-mail entre UI e Server Action** (achado confirmado no código, já rastreado em `docs/PENDENCIAS.md` P1.8, mas vale detalhar o efeito real): `BookingWizard.tsx:157-161` valida "informe WhatsApp OU e-mail"; `criarAgendamentoPublico` em `src/app/actions/public-booking.ts:33` exige `clienteTelefone` incondicionalmente e devolve o erro genérico `"Preencha todos os campos obrigatórios."` — que não aponta qual campo falta. Um cliente que preenche só e-mail passa pela validação do formulário e recebe um erro que não faz sentido para ele (pensou ter preenchido tudo). Severidade **ALTA** — é abandono silencioso no último passo do funil, exatamente onde a conversão importa mais.
- **Sem cancelamento/reagendamento pelo cliente final** — busca no código (`grep` por "cancelar"/"remarcar" em `src/app/book/`) não encontra nada; confirmado também em `docs/PENDENCIAS.md` ("Depois de evidência"). Depois de agendar, a tela de sucesso só oferece "Novo Agendamento" (`BookingWizard.tsx:482-496`). Severidade **ALTA** para retenção (ver seção 4).
- **Achado novo — `telefone_contato` do estabelecimento é buscado mas nunca exibido**: `PerfilEmpresa.telefone_contato` está tipado e vem no `perfil` (`BookingWizard.tsx:13`), mas não aparece em nenhum lugar do JSX do wizard (`grep` confirma zero ocorrências de `telefone_contato`/`wa.me`/`whatsapp` fora da declaração de tipo). Ou seja: o cliente que quer avisar que vai atrasar, pedir para remarcar ou tirar uma dúvida **não tem nenhum número para contatar** na própria página de agendamento — precisa já saber o WhatsApp do profissional por outro canal. Como não existe cancelamento/remarcação self-service (item acima), esse é o único caminho de contato que sobraria, e ele está morto na tela. Severidade **ALTA**. Correção de baixo esforço: exibir `telefone_contato` (quando preenchido) como link `wa.me` na tela de sucesso e/ou no cabeçalho do wizard.
- **BookingWizard foge do sistema de tokens visuais do resto do produto** — usa paleta `zinc-*`/gradiente `violet/indigo` (`page.tsx:40-41`, `BookingWizard.tsx` inteiro) em vez dos tokens `palco/bastidor/marca/giz` usados no dashboard (já notado para `WhatsappClient.tsx` em `docs/PENDENCIAS.md` item 9, mas o booking público é a tela de **maior exposição para terceiros** — é a primeira impressão de marca para todo cliente final, mais importante que uma tela interna). Severidade **BAIXA** (não bloqueia conversão), mas relevante para coerência de marca — sinalizando para o time de design/branding.

---

## 3. WhatsApp-first — veredito honesto

**Não é WhatsApp-first. É um sistema web com notificação de WhatsApp acoplada.** Evidências concretas do código:

- O agendamento **sempre nasce no formulário web** (`/book/[slug]`); não há nenhum ponto de entrada via WhatsApp (bot, link `wa.me` com deep-link de agendamento, etc.).
- A integração é **estritamente unidirecional**: `enviarMensagemWhatsApp` (`whatsapp-helper.ts`) chama `POST /message/sendText` da Evolution API. Busquei por qualquer rota que receba mensagens inbound do WhatsApp (`find src/app/api/webhooks`) — existe **apenas** `src/app/api/webhooks/lembrete/route.ts`, que é acionado pelo QStash (saída agendada), não pela Evolution API. **Não há webhook para respostas do cliente.**
- Os templates padrão (`mensagem_confirmacao`, `mensagem_lembrete` em `docs/06-MENSAGERIA_E_WHATSAPP.md`) são avisos informativos ("está confirmado", "passando para lembrar") — nenhum tem call-to-action de responder, confirmar presença ou cancelar.
- Reforça o ponto 2.2: nem o *contato* com o estabelecimento está exposto na tela de booking, então mesmo a única "conversa" possível (cliente manda mensagem por fora) depende do cliente já ter o número salvo.
- WhatsApp existe hoje só como **canal de saída, exclusivo do plano Pro**, com boa engenharia por trás (máquina de estados, log de auditoria `disparos_whatsapp`, cancelamento de lembrete ao cancelar/remarcar) — a parte que existe é sólida e confiável. O que falta para o "first" ser real:
  1. Webhook de entrada da Evolution API para processar respostas (ex.: "C" confirma, "R" pede remarcação).
  2. Algum ponto de entrada de agendamento iniciado pelo próprio WhatsApp (mesmo que simples, redirecionando para o link `/book/[slug]`).
  3. Expor o contato do estabelecimento na tela pública (achado acima) — pré-requisito mínimo antes de qualquer coisa mais sofisticada.

Isso não é necessariamente errado como decisão de produto atual — `docs/PENDENCIAS.md` já classifica "IA no WhatsApp" e fluxos avançados como "fora da visão atual" — mas o rótulo "WhatsApp-first" não corresponde ao que o código faz hoje, e a promessa deveria ser recalibrada em qualquer copy de venda (landing, planos) para "confirmação e lembrete automáticos por WhatsApp", que é o que de fato existe e funciona bem.

---

## 4. Retenção operacional

| Mecanismo | Estado |
|---|---|
| Lembrete automático | **Existe e é robusto** — agendado no QStash, com realinhamento em remarcação e cancelamento ao cancelar (`src/app/actions/agendamentos.ts`, `notificacoes-agendamento.ts`). |
| Confirmação prévia (o cliente confirma presença) | **Não existe.** A confirmação enviada é apenas informativa; não há mecanismo de resposta que module o status do agendamento. |
| Tratamento de no-show | **Não existe.** Não há status `no_show` no schema (`agendamentos.status`: pendente/confirmado/concluido/cancelado, conforme `CLAUDE.md`) nem fluxo para o profissional marcar isso — hoje ele provavelmente usa "cancelado" ou "concluído" para representar um não-comparecimento, o que contamina as métricas de faturamento estimado (`DashboardClient.tsx:154-156` soma `confirmado`+`concluido` como faturamento previsto). |
| Reagendamento fácil (pelo negócio) | **Existe e é bom** — `remarcarAgendamento`, acessível em um clique na linha do dia. |
| Reagendamento fácil (pelo cliente final) | **Não existe** (ver seção 2.2). Isso é o que mais pesa para MRR: cliente que precisa remarcar e não consegue sozinho tende a simplesmente não aparecer ou não remarcar — perda de receita para o profissional, que é quem paga a assinatura. |

Sem confirmação prévia acionável nem tratamento de no-show, o produto ainda não fecha o ciclo que justificaria cobrar por "reduzir furos na agenda" como argumento de venda — hoje ele reduz esquecimento (lembrete), não reduz no-show ativamente.

---

## 5. Estados: vazio, erro, loading, offline

- **Nenhum `error.tsx`, `loading.tsx` ou `not-found.tsx` existe em todo o projeto** (busca recursiva em `src/` não encontra nenhum). Isso significa:
  - Qualquer exceção não tratada em um Server Component (ex.: falha do Supabase, timeout) cai no error overlay genérico do Next/React, sem fallback com marca do produto — inclusive em `/book/[slug]`, a tela de maior exposição pública.
  - Navegação entre rotas do dashboard (`/dashboard` → `/dashboard/agenda`) não tem esqueleto de carregamento nativo do App Router; a página só aparece quando os dados terminam de chegar (pode gerar uma transição "seca" em conexões lentas — parte real do público-alvo em regiões com internet móvel instável).
  - Severidade **MÉDIA** — não impede o uso no caminho feliz, mas numa falha real (banco fora do ar, etc.) o cliente final vê uma tela de erro do Next sem marca nem instrução, na página que "não pode ter fricção".
- **Estados vazios**: bem tratados onde existem — "Nenhum serviço cadastrado" com CTA (`ServicosClient.tsx:159-174`), "Nenhum bloqueio futuro" (`AgendaClient.tsx:598-601`), "Nenhum disparo registrado ainda" (`WhatsappClient.tsx:632-635`), "Nenhum atendimento neste dia" no dashboard. Ponto positivo consistente.
- **Erro de action**: tratado com mensagens inline nos formulários (padrão `try/catch` + `setErro`) em praticamente todos os componentes revisados — boa cobertura, mensagens específicas na maioria dos casos (exceção: o erro genérico do booking público citado na seção 2.2).
- **WhatsApp desconectado**: bem resolvido — 6 estados visuais claros (`WhatsappClient.tsx`), recuperação sem suporte, mensagem de teste, log de disparos traduzido para pt-BR. É o fluxo de erro mais maduro do produto.
- **Offline**: nenhum tratamento (nem service worker, nem detecção de `navigator.onLine`, nem mensagens de retry específicas para falha de rede — os `catch` genéricos cobrem o caso, mas sem diferenciar "sem internet" de "erro do servidor"). Severidade **BAIXA** para o estágio atual (produto ainda não lançado publicamente), mas relevante seguir sem regressão à medida que cresce o uso mobile.

---

## 6. Mobile

Verificação por classes Tailwind responsivas nas telas críticas:

- **Booking público** (`BookingWizard.tsx`): `max-w-xl mx-auto`, grades `grid-cols-3`, botões de tamanho adequado a toque, sem overflow horizontal aparente. Funcional em viewport de celular.
- **Dashboard principal** (`DashboardClient.tsx`): construído mobile-first de verdade — FAB fixo para novo agendamento em telas pequenas (`sm:hidden`, linha 655-663), régua de dias com `overflow-x-auto`, cabeçalho com CTA escondido em mobile e reaparecendo como FAB. Bom trabalho aqui.
- **Modal de agendamento manual** (`NovoAgendamentoModal.tsx`): bottom-sheet no mobile (`items-end sm:items-center`, `rounded-t-3xl`), usa `max-h-[88dvh]` (não `vh`) para acomodar teclado virtual — detalhe correto e pouco comum de se acertar.
- **Páginas de configuração** (`ServicosClient.tsx`, `AgendaClient.tsx`, `WhatsappClient.tsx`): usam grids que colapsam para 1 coluna em mobile (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`), formulários com campos de largura total — funcionais, mas com padding/toques mais apertados que o dashboard principal (herdados do estilo antigo `zinc-*`, ainda não migrado para os tokens `palco/bastidor`, conforme já registrado em `docs/PENDENCIAS.md`).

Nenhum achado de severidade alta em mobile — o produto é genuinamente mobile-first nos fluxos mais importantes (booking e dashboard do dia a dia).

---

## Os 5 atritos que mais custam cliente

1. **[ALTA]** Cliente final não tem como cancelar/remarcar sozinho, **e nem consegue contatar o estabelecimento pela própria página de booking** (`telefone_contato` buscado mas nunca renderizado em `BookingWizard.tsx`) — o único caminho de retenção quando um horário não serve mais é o cliente desistir. Isso custa receita ao profissional, que é quem paga a assinatura.
2. **[ALTA]** Inconsistência WhatsApp-ou-e-mail entre `BookingWizard.tsx` e `criarAgendamentoPublico` (`public-booking.ts:33`) — cliente que só informa e-mail recebe erro genérico e incompreensível no último passo do funil, exatamente onde perder conversão dói mais.
3. **[ALTA]** "WhatsApp-first" não é real: canal 100% de saída, sem webhook de entrada, sem ponto de agendamento iniciado por WhatsApp. Se essa promessa está em landing/copy de venda, é uma expectativa que o produto atual não entrega — risco de decepção pós-compra do plano Pro.
4. **[MÉDIA]** Zero `error.tsx`/boundary de erro em qualquer rota, incluindo `/book/[slug]` — uma falha real de infraestrutura mostra a tela de erro crua do Next na página que deveria ser a mais robusta e "sem fricção" do produto.
5. **[MÉDIA]** Tela "Selecione uma Organização" (`dashboard/page.tsx`, `dashboard/agenda/page.tsx`) sem nenhum botão de ação, dependente de uma configuração do Clerk que a própria `docs/PENDENCIAS.md` marca como não confirmada em todos os ambientes — risco real de parede sem porta no primeiro acesso de um dono de barbearia sem paciência.

Pontos fortes que vale preservar: onboarding B2B genuinamente curto (perfil auto-provisionado, checklist claro), agendamento manual/remarcação pelo profissional bem resolvidos e mobile-first de verdade, máquina de estados do WhatsApp e log de disparos maduros para o que se propõem a fazer (canal de saída confiável).
