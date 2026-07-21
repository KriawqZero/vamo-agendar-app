---
phase: 1
slug: hardening-da-superficie-publica
status: draft
shadcn_initialized: false
preset: none
created: 2026-07-21
---

# Phase 1 — UI Design Contract

> Contrato visual e de interação da fase. Gerado por `gsd-ui-researcher`, verificado por `gsd-ui-checker`.

---

## Veredito de escopo — leia antes de tudo

**Esta fase não introduz nenhuma superfície visual nova.** Nenhuma tela, nenhum componente, nenhum estado, nenhum texto, nenhuma mudança de layout ou de estilo.

É uma fase de banco e de webhook: `REVOKE` dos privilégios de `anon` nas nove tabelas, substituição das quatro policies compartilhadas, e verificação real de assinatura do QStash. Os cinco critérios de sucesso são todos verificados com `curl` anônimo contra a Data API — nenhum deles é visual.

O frontend é tocado em exatamente **dois arquivos**, e a mudança é estrutural, não visual:

| Arquivo | Mudança | Natureza |
|---|---|---|
| `src/app/book/[slug]/page.tsx:64-72` | deixa de passar `perfil.tenant_id` para `BookingApp` | remoção de prop |
| `src/app/book/[slug]/BookingApp.tsx` | passa a trabalhar com `slug` no lugar de `tenantId`; repassa `slug` às duas Server Actions públicas | troca de identificador |

Somam-se a isso duas mudanças **server-side** que não tocam componente mas que podem degradar a UI em silêncio: a leitura pública migra para `createAdminClient()` (D-02) e `select('*')` passa a ser proibido no caminho público (D-02, mitigação 2).

**O critério de aceite visual desta fase é a ausência de diferença:** um cliente final que abre `/book/[slug]` antes e depois não pode perceber nada. Fricção Zero é inegociável — nenhuma etapa, campo, confirmação ou atraso novo.

Este documento existe porque o `ui_safety_gate` disparou por heurística de repositório ("tem frontend"), e o owner escolheu fechar o portão pelo caminho previsto em vez de pular. Portanto ele **não decide design**: ele trava invariantes e enumera o que precisa continuar idêntico.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | **none** — shadcn não inicializado, e **não deve ser inicializado nesta fase** |
| Preset | não aplicável |
| Component library | nenhuma. Componentes próprios em `src/app/book/[slug]/` (`CabecalhoEstabelecimento`, `PainelMarca`, `BarraInferior`, `RodapeAcaoDesktop`, `StepperVertical`, `ResumoAgendamento`, `etapas/Etapa*`) |
| Token layer | Tailwind CSS v4 CSS-first — `@theme inline` em `src/app/globals.css`, tokens semânticos em pt-BR (`palco`, `bastidor`, `camarim`, `giz`, `nevoa`, `penumbra`, `fio`, `fio-forte`, `veu`, `fantasma`, `marca`, `marca-forte`, `marca-suave`), tema claro/escuro por classe via `next-themes` |
| Icon library | nenhuma — SVG inline (`stroke="currentColor"`, `aria-hidden="true"`) |
| Font | `font-display` = Poppins (títulos), `font-sans` = Geist Sans (corpo), `font-mono` = Geist Mono (preço, hora, wordmark) |

**Portão do shadcn — resolvido como "não":** o projeto já tem sistema de design próprio, derivado de identidade visual **paga e fechada** (gradiente `#3DBAED → #3961D5`, roxo `#4219B0`, Poppins). Introduzir shadcn aqui significaria trocar a camada de tokens de uma fase de segurança de banco — scope creep com risco de regressão visual em toda a superfície pública, exatamente o que esta fase precisa não fazer. `Tool: none`; portão de registry não se aplica.

---

## Spacing Scale

**Herdado, não decidido nesta fase. Nenhum valor novo é introduzido.**

A escala é a padrão do Tailwind (passo de `0.25rem` = 4px). Valores efetivamente usados no caminho afetado:

| Token Tailwind | Valor | Uso no booking público |
|---|---|---|
| `gap-2` / `mt-2` | 8px | grade de slots, chips de data |
| `p-3` / `mt-3` | 12px | avisos (`role="alert"`), cabeçalho compacto |
| `p-4` / `mt-4` | 16px | cards de serviço, blocos de etapa |
| `px-5` / `p-5` | 20px | padding lateral mobile, card de sucesso |
| `mt-6` / `pt-6` | 24px | `<dl>` da tela de sucesso |
| `px-7` / `pt-7` | 28px | painel de marca desktop |
| `mt-8` / `px-8` | 32px | quebras de bloco, padding `sm:` |
| `px-10` / `py-10` | 40px | padding `md:`/`lg:` |
| `pb-40` | 160px | folga para a barra inferior fixa (mobile) |

**Exceções já existentes (inerentes ao sistema, não introduzidas aqui):** `mt-0.5` (2px), `gap-1.5` (6px), `px-3.5` (14px), `py-2.5` (10px), `pb-[max(env(safe-area-inset-bottom),0.75rem)]`.

**Alvo de toque:** `min-h-11` (44px) e `min-h-12` (48px) em todo controle tocável do fluxo. **Invariante:** nenhum alvo de toque pode encolher nesta fase.

---

## Typography

**Herdado, não decidido nesta fase.** Tamanhos e pesos em uso no caminho afetado:

| Role | Classe | Size | Weight | Line height |
|------|--------|------|--------|-------------|
| Metadado / rótulo `<dt>` | `text-[10px]` uppercase tracking-wider | 10px | 600 | padrão Tailwind |
| Auxiliar / chip / preço secundário | `text-xs` | 12px | 400–600 | 1.333 |
| Corpo e controles | `text-sm` | 14px | 400–600 | 1.428 |
| Título de etapa (`font-display`) | `text-lg font-semibold` | 18px | 600 | 1.555 |
| Título de sucesso (`font-display`) | `text-xl font-bold` | 20px | 700 | 1.4 |
| Nome do estabelecimento (`font-display`) | `text-2xl font-bold` | 24px | 700 | `leading-tight` |

**Invariante:** nenhum tamanho, peso ou família muda nesta fase. Se um diff desta fase tocar `text-`, `font-` ou `leading-` em qualquer arquivo de `src/app/book/`, é regressão — não melhoria.

---

## Color

**Herdado, não decidido nesta fase.** Valores em `src/app/globals.css`.

| Role | Token | Claro | Escuro | Uso |
|------|-------|-------|--------|-----|
| Dominante (60%) | `--palco` | `#f7f8fc` | `#09090b` | fundo da página |
| Secundária (30%) | `--bastidor` | `#ffffff` | `#101014` | cards, barra inferior, `<dl>` de sucesso |
| Acento (10%) | `--marca` | `#3961d5` | `#3dbaed` | ver lista reservada abaixo |
| Acento do tenant (Pro) | `--acento` / `--acento-texto` | `perfis_empresas.cor_marca` sanitizada por plano | idem | substitui `--marca` quando o tenant é Pro e tem cor válida |
| Sucesso | `emerald-100/600` (claro), `emerald-950/40` + `emerald-400` (escuro) | — | — | ícone de check da tela de sucesso |
| Erro | `red-50/200/700` (claro), `red-950/20` + `red-400` (escuro) | — | — | caixa de erro de slots e de envio |
| Aviso | `amber-50/200/800` (claro), `amber-950/20` + `amber-400` (escuro) | — | — | aviso de slot tomado (double-booking) |

**Acento reservado exclusivamente para** (via `classesAcento()` em `src/app/book/[slug]/acento.ts`):

1. CTA principal da barra inferior e do rodapé desktop (`cta`)
2. Preenchimento de chip de data e de slot **selecionado** (`fill`)
3. Borda do card de serviço **selecionado** (`borda`)
4. Tint sutil de fundo do card de serviço selecionado (`tint`)
5. Segmentos preenchidos da barra de progresso (`barra`)
6. Avatar-inicial de fallback quando não há logo
7. Halo desfocado de fundo do painel de marca desktop e faixa curta sem capa

Fora dessa lista, nada usa acento. **Regra inegociável, já implementada:** a cor do tenant nunca pinta texto sobre as superfícies do tema — contraste não é garantido nos dois temas. O texto sobre o acento é calculado no servidor por contraste WCAG (`corTextoSobre` em `src/lib/cores.ts`).

**Invariante crítico de plano:** `cor_marca`, `logo_url` e `capa_url` continuam sendo consumidos **apenas** pelo objeto `personalizacao` devolvido por `obterDadosBookingPublico`, já sanitizado pelo plano vigente. O `perfil` devolvido continua com os três campos neutralizados em `null`. Com a migração para `createAdminClient()` a leitura passa a bypassar RLS — a sanitização por plano vira a **única** defesa contra um tenant gratuito exibir personalização paga. Se ela se perder, a regressão é simultaneamente visual e de monetização, e é silenciosa.

---

## Copywriting Contract

**Nenhum texto novo é escrito nesta fase.** Esta tabela existe para travar as strings que já existem e que a refatoração pode quebrar sem que ninguém veja.

| Element | Copy (deve permanecer literal) | Origem |
|---------|-------------------------------|--------|
| CTA principal (etapas serviço/data-hora) | `Continuar` | `BarraInferior.tsx:67`, `RodapeAcaoDesktop.tsx` |
| CTA principal (etapa contato) | `Confirmar agendamento` | `BarraInferior.tsx:58` |
| CTA em envio (pending) | `Confirmando…` (reticências como caractere único `…`) | `BarraInferior.tsx:58` |
| Empty — sem serviços | `Este estabelecimento ainda não publicou serviços. Volte em breve.` | `etapas/EtapaServico.tsx:42` |
| Empty — sem slots no dia | `Sem horários livres neste dia. Escolha outra data acima.` | `etapas/EtapaDataHora.tsx:129` |
| Empty — resumo sem serviço | `Escolha um serviço para começar` | `ResumoAgendamento.tsx:44` |
| Error — falha ao carregar slots (fallback client) | `Erro ao carregar horários disponíveis.` + botão `Tentar de novo` | `BookingApp.tsx:159`, `EtapaDataHora.tsx:124` |
| Error — envio sem serviço/slot | `Escolha o serviço e o horário antes de confirmar.` | `BookingApp.tsx:246` |
| Error — nome vazio | `Informe seu nome.` | `BookingApp.tsx:252` |
| Error — telefone inválido (client) | `Informe o WhatsApp com DDD (10 ou 11 dígitos).` | `BookingApp.tsx:256` |
| Error — fallback de envio | `Não foi possível confirmar o agendamento. Tente outro horário.` | `BookingApp.tsx:273` |
| ⚠️ Aviso — slot tomado (double-booking) | `Este horário já foi preenchido ou está indisponível. Por favor, selecione outro.` | `public-booking.ts:106` |
| Sucesso — título | `Horário confirmado!` | `etapas/EtapaSucesso.tsx:50` |
| Sucesso — CTA secundário | `Agendar outro horário` | `etapas/EtapaSucesso.tsx:107` |
| Slug inexistente (`not-found`) | `Agenda não encontrada` / `Este link não leva a nenhuma agenda ativa. Confira o endereço com quem enviou — pode ter faltado uma letra.` | `not-found.tsx:8,11` |
| Reforço de Fricção Zero | `Sem cadastro — seus dados servem só para este agendamento.` | `etapas/EtapaContato.tsx:46` |
| Selo do produto | `Agendamento facilitado por` + `VamoAgendar` | `EtapaServico.tsx:86`, `EtapaSucesso.tsx:111` |

**Ação destrutiva nesta fase:** nenhuma na UI. (O `REVOKE`/`DROP POLICY` é destrutivo no banco e tem seu próprio critério de aceite no PLAN — não tem representação visual.)

### 🚨 Acoplamento de string que a refatoração pode quebrar em silêncio

`BookingApp.tsx:274` decide a recuperação de double-booking por **substring**:

```
if (mensagem.includes('já foi preenchido'))
```

A mensagem vem literalmente de `public-booking.ts:106`. Enquanto casar, o cliente é levado de volta à etapa de data/hora, o slot morto é solto, a grade é refeita (`setTentativaSlots`) e o aviso âmbar aparece. Se a refatoração das actions reescrever essa mensagem, a recuperação degrada em silêncio para uma caixa vermelha estática embaixo do formulário de contato — e o cliente fica preso num horário que não existe mais. **Nenhuma mensagem de erro das duas actions públicas pode ser reescrita nesta fase.**

### Regra sobre erros novos

`erroSlots` é renderizado como `err.message` **verbatim** na caixa vermelha da etapa de data/hora (`BookingApp.tsx:157-161` → `EtapaDataHora.tsx:116`). Consequência direta: **todo `throw new Error(...)` novo em `obterSlotsPublicos` vira copy visível ao cliente final.**

Ao trocar o parâmetro de `tenantId` para `slug`, surge um caminho de falha que hoje não existe: slug que não resolve (caso real — downgrade de plano invalida o slug customizado enquanto a aba está aberta). Contrato:

- **Proibido** inventar copy nova para esse caso. Se a action lançar, a mensagem deve ser exatamente `Não foi possível carregar os horários. Tente de novo.` — mesma família de tom das existentes, com caminho de saída (o botão `Tentar de novo` já está lá).
- **Proibido** vazar erro cru do Supabase ou texto técnico (`slug`, `tenant`, `org_`, código PostgREST) para essa caixa — é regra do CLAUDE.md e aqui ela é literalmente visível ao cliente final.
- **Proibido** deixar o caminho cair em `TIMEZONE_PADRAO` / `antecedencia 15` / `horizonte 14` silenciosamente quando o perfil não resolve. Hoje isso já acontece (`public-booking.ts:294-298`) e é aceitável porque o `tenantId` vinha validado da página; com a resolução por slug, falhar visível é melhor do que oferecer grade calculada no fuso errado.

---

## Invariantes de comportamento — o contrato real desta fase

Afirmações checáveis. Cada uma é uma coisa que já funciona hoje e que a refatoração pode quebrar sem sintoma. O executor e o verificador provam a fase contra esta lista.

### A. Identificador e payload

| # | Invariante | Como verificar |
|---|---|---|
| A1 | `perfil.tenant_id` **não** aparece mais no payload RSC de `/book/[slug]` | `curl -s http://localhost:3000/book/<slug> \| grep -c 'org_'` → `0` |
| A2 | O `tenantHash` de analytics continua sendo calculado no **servidor** a partir do `org_id` cru (`hashTenantId(perfil.tenant_id)` em `page.tsx:76`), com o mesmo valor de antes | evento `booking_started` no PostHog com o mesmo hash dos eventos server-side (`capturarEventoTenant`); se o hash passar a derivar do slug, o funil deixa de casar |
| A3 | Nenhum `org_...` viaja como propriedade de analytics | grep em `src/app/book/` por `tenant_id` fora de `page.tsx` → vazio |
| A4 | `servicos` deixa de viajar inteiro para o browser: só `id, nome, descricao, preco, duracao_minutos` | inspecionar payload RSC — sem `ativo`, `tenant_id`, `created_at`, `updated_at` |

### B. Colunas que a UI pública renderiza — anti-degradação silenciosa

`select('*')` sai; entra lista explícita. **Coluna esquecida na lista não gera erro: gera campo vazio.** Esta é a enumeração completa do que o caminho público consome hoje. Nenhuma pode faltar.

| Coluna de `perfis_empresas` | Onde aparece / o que faz | Sintoma se faltar |
|---|---|---|
| `slug` | `obterSlugEfetivo` (plano com link personalizado) | **página inteira vira 404** |
| `slug_gratuito` | `obterSlugEfetivo` (plano gratuito/Plus) | **página inteira vira 404** |
| `tenant_id` | filtro de serviços, plano vigente, `tenantHash` (server-only) | página 404 ou funil sem tenant |
| `nome_estabelecimento` | `<h1>` no cabeçalho mobile e no painel desktop, `<dd>` da tela de sucesso, `<title>` da metadata, inicial do avatar de fallback | título vazio, avatar vazio, aba do navegador sem nome |
| `descricao` | bio (`line-clamp-2` mobile / `line-clamp-3` desktop) e `<meta description>` de fallback | bio some — indistinguível de tenant que não preencheu |
| `instagram` | chip no cabeçalho e no painel + link na tela de sucesso | chip some silenciosamente |
| `endereco` | chip + link do Google Maps no cabeçalho, painel e tela de sucesso | endereço some da confirmação — o cliente não sabe onde ir |
| `timezone` | grade de datas (`datasDisponiveis`) e `formatarDataHoraLonga` na tela de sucesso | **cai em `TIMEZONE_PADRAO`: horários e data de confirmação errados, sem nenhum erro** |
| `horizonte_maximo_dias` | quantidade de chips de data na etapa data/hora | cai em 14 — tenant com horizonte diferente passa a mostrar grade errada |
| `antecedencia_minima_minutos` | `regrasAcesso` de `obterSlotsPublicos` e da revalidação de `criarAgendamentoPublico` | cai em 15 — oferece slot que deveria estar fora da antecedência |
| `cor_marca` | `personalizacao.corMarca` → `--acento` (Pro) | página de tenant Pro perde a cor paga e parece plano gratuito |
| `logo_url` | `personalizacao.logoUrl` (Pro) | logo some, cai no avatar-inicial |
| `capa_url` | `personalizacao.capaUrl` (Pro) + imagem de OpenGraph | capa some, OG cai para `/og.png` |

| Coluna de `servicos` | Onde aparece | Sintoma se faltar |
|---|---|---|
| `id` | chave de seleção, `servicoId` da action | seleção quebra |
| `nome` | card de serviço, resumo/comanda, tela de sucesso | card sem nome |
| `descricao` | linha secundária truncada do card | some (opcional — degradação aceitável, mas não intencional) |
| `preco` | card (`toLocaleString` BRL) e comanda | `R$ NaN` ou vazio |
| `duracao_minutos` | card (`N min`), comanda e **cálculo de slots** | grade de horários errada |

Colunas usadas **apenas em filtro** e que continuam necessárias na query (não na projeção): `servicos.ativo`, `servicos.tenant_id`, `perfis_empresas.slug`/`slug_gratuito`/`tenant_id`.

### C. Estados e interações que devem permanecer idênticos

| # | Invariante | Verificação (UAT manual — obrigatório pelo CONTEXT §specifics) |
|---|---|---|
| C1 | Wizard completo funciona: serviço → data/hora → contato → sucesso, sem login, sem OTP, sem campo novo | percorrer `/book/<slug>` até a tela de sucesso e conferir o agendamento na agenda do dashboard |
| C2 | Skeleton de carregamento de slots continua sendo 9 blocos `h-11 animate-pulse` dentro de `aria-live="polite"` | trocar de data e observar |
| C3 | Empty de slots mostra a caixa tracejada com a copy travada acima | escolher um dia sem horário |
| C4 | Erro de slots mostra caixa vermelha + `Tentar de novo`, e o retry refaz a busca (`setTentativaSlots`) | derrubar a action e clicar em `Tentar de novo` |
| C5 | Recuperação de double-booking: volta para data/hora, solta o slot, refaz a grade e mostra o aviso âmbar | duas abas confirmando o mesmo slot |
| C6 | Nome e WhatsApp digitados **não** se perdem ao voltar de etapa (estado vive no `BookingApp`) | preencher contato → voltar → avançar |
| C7 | Máscara de telefone (`formatarTelefone`) e validação de 10–11 dígitos inalteradas | digitar `11999999999` |
| C8 | Progresso (barra mobile e `StepperVertical` desktop) e navegação retroativa pelo stepper continuam funcionando; nunca pula para etapa futura | clicar em etapas anteriores no desktop |
| C9 | Foco é movido para o `<h2>` da etapa **apenas após navegação** (`autoFoco={jaNavegou}`), nunca no carregamento inicial | tab/leitor de tela |
| C10 | Animações direcionais (`desliza-passo-*` no `lg`, `aparecer-rapido` no mobile) e `prefers-reduced-motion` inalteradas | alternar a preferência do SO |
| C11 | Slug desconhecido continua caindo em `notFound()` com status **404 real** (disparado em `generateMetadata`, antes do streaming) | `curl -o /dev/null -w '%{http_code}' /book/inexistente` → `404` |
| C12 | Tema claro/escuro do booking inalterado nos dois modos | alternar tema |
| C13 | Personalização Pro (cor/logo/capa) continua sanitizada por plano; tenant gratuito não passa a exibir cor/logo/capa | comparar um tenant Pro e um gratuito depois da migração para `createAdminClient()` |
| C14 | Metadata (`<title>`, `<meta description>`, imagem OG) idêntica | ver fonte da página |

### D. Efeito colateral esperado, não é regressão

Com a leitura pública migrando para `service_role` (que bypassa RLS), o embed `servicos(duracao_minutos)` passa a devolver duração real também para serviço desativado, e o fallback "assume 30 minutos" de `booking-engine.ts:303` deixa de disparar no caminho público. É melhoria não planejada. **Não corrigir de passagem** — é escopo da Phase 2 (`data_hora_fim`), e mexer aqui confunde a verificação de lá.

---

## UI Considerations

Cobertura de **estados que já existem** no caminho afetado. Nenhum estado novo é criado; a coluna Resolution descreve a verdade que precisa continuar valendo depois da fase.

Applicable state considerations resolved: **7 covered, 2 backstop, 0 unresolved**

| Category | Element(s) | Status | Resolution / Reason |
|----------|------------|--------|---------------------|
| empty | lista de serviços | ✅ covered | Sem serviço ativo, a etapa de serviço renderiza a caixa tracejada com a copy travada em `## Copywriting Contract` (`EtapaServico.tsx:41`) |
| empty | grade de slots do dia | ✅ covered | Sem horário livre, renderiza a caixa tracejada com a copy travada; a fileira de datas continua navegável (`EtapaDataHora.tsx:127`) |
| empty | comanda/resumo sem seleção | ✅ covered | `ResumoAgendamento` mostra `Escolha um serviço para começar` e o CTA fica `disabled` com `opacity-50` |
| loading | busca de slots | ✅ covered | 9 skeletons `h-11 animate-pulse rounded-xl bg-veu` dentro de `aria-live="polite"`; nada de spinner novo |
| loading | envio do agendamento | ✅ covered | `useActionState` → CTA vira `Confirmando…` e `disabled`; nenhum overlay bloqueante |
| error | falha ao carregar slots | ✅ covered | Caixa vermelha `role="alert"` + `Tentar de novo` que reexecuta a busca; a copy renderizada é `err.message` — ver a regra de erros novos acima |
| error | slot tomado por outro cliente | ✅ covered | Aviso âmbar `role="alert"` na etapa de data/hora + grade refeita; depende do acoplamento de substring documentado acima |
| long-text | `nome_estabelecimento`, `descricao`, `endereco` longos | 🧪 backstop | Já contidos por `truncate` / `line-clamp-2` / `line-clamp-3` / `max-w-full`. Nenhuma mudança de fase mexe nisso; verificação visual com tenant de nome e endereço longos |
| overflow | fileira de datas com `horizonte_maximo_dias` alto | 🧪 backstop | Scroll horizontal com `snap-x` e scrollbar oculta no mobile; `lg:grid-cols-7` no desktop. Risco real só se `horizonte_maximo_dias` sumir da projeção (ver B) — verificação visual com horizonte 30 |

<!-- Status vocabulary (locked by probe-core projectTruths):
     ✅ covered   → a plain truth string lifted into must_haves.truths
     🧪 backstop  → a flat scalar { statement, verification: backstop }; at verify time, no explicit
                    evidence → insufficient_spec → human_needed (never a silent pass, #1154)
     ⚠ unresolved → an explicit planner assumption (surfaced, never silently dropped)
     Rows are REPLACED (not appended) on a probe re-run — idempotent. -->

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | nenhum — shadcn não é usado no projeto | não aplicável |
| terceiros | nenhum declarado | não aplicável |

Nenhum pacote de UI é instalado nesta fase. O único pacote novo do plano é `@upstash/qstash` (backend, SDK oficial da Upstash — auditoria de legitimidade já feita em `01-RESEARCH.md` §Package Legitimacy Audit, veredito aprovado).

---

## Fora de escopo — não fazer nesta fase

- Reestilizar, "melhorar" ou reorganizar qualquer coisa em `src/app/book/`
- Introduzir shadcn, biblioteca de componentes ou de ícones
- Trocar tokens, tamanhos de fonte, espaçamento ou paleta
- Reescrever qualquer string da tabela de copywriting
- Adicionar estado de carregamento, confirmação, toast ou telemetria visível
- Corrigir o bug do "assume 30 minutos" (Phase 2)
- Remover o `?secret=` da URL de publicação do QStash (adiado — fila em trânsito)

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending

---

*Phase: 01-hardening-da-superficie-publica*
*UI-SPEC gerado em 2026-07-21*
