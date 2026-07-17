---
status: temporario
gerado: 2026-07-15 18:54
agente: arquitetura
modelo: sonnet
---

# Auditoria de Arquitetura — VamoAgendar (2026-07-15)

Mapeamento da estrutura **real** do código (54 arquivos `.ts`/`.tsx` em `src/`), não da
estrutura idealizada nos docs. Metodologia: leitura direta de todo `src/app` e `src/lib`,
grep de uso cruzado para cada export (evitar falso-positivo de "código morto"), leitura
do schema declarativo em `supabase/schemas/` para achados de escala, e comparação
frase-a-frase de `CLAUDE.md`/`docs/01-08` contra o código.

**Decisão de ambiguidade registrada**: o mandato pede achados com severidade, mas não
define os limiares. Usei: **ALTA** = afeta correção, segurança ou vai custar retrabalho
doloroso (migração de dados, race condition, dado errado) quando o volume crescer;
**MEDIA** = duplicação/inconsistência que aumenta custo de manutenção mas não quebra nada
hoje; **BAIXA** = nit de consistência ou achado informativo sem ação urgente.

---

## 1. Organização de rotas/módulos

```
src/app/
  actions/          8 arquivos, 'use server' — mutações E leituras (ver §2)
  api/webhooks/      1 rota (lembrete QStash) — única exceção às Server Actions, conforme docs
  book/[slug]/       fluxo público B2C (Fricção Zero)
  dashboard/         área B2B autenticada (layout + 5 seções: hoje/agenda/serviços/whatsapp/plano)
  para/[nicho]/      landings verticais SSG (feature mais recente, commit 0820b09)
  sign-in|sign-up/   telas Clerk
src/lib/             engine de disponibilidade, timezone, planos, assinaturas, whatsapp,
                     analytics (client+server), nichos, supabase (server+admin)
src/components/analytics/  3 ilhas client "renderiza null" para instrumentação
```

Estrutura é rasa e previsível — não há indireção desnecessária (nenhum
`services/`, `repositories/`, `hooks/` genérico criado "para o futuro"). Isso é
coerente com a regra de simplicidade do projeto e **não é um achado negativo**.

### Proporção e justificativa de `'use client'`

16 arquivos usam `'use client'`. Verifiquei cada um individualmente contra o motivo
declarado de interatividade:

| Arquivo | Motivo real (verificado) | Justificado? |
|---|---|---|
| `DashboardClient.tsx`, `AgendaClient.tsx`, `ServicosClient.tsx`, `WhatsappClient.tsx`, `BookingWizard.tsx`, `NovoAgendamentoModal.tsx` | `useState`/`useTransition`/`useRouter`, formulários com validação incremental, polling, modais com focus-trap | Sim |
| `NavPrincipal.tsx` | `usePathname()` para estado ativo do link | Sim |
| `CtaUpgrade.tsx` | `onClick` para capturar evento de analytics | Sim (mínimo necessário) |
| `LuzAmbiente.tsx`, `Reveal.tsx` | `useRef`/`useEffect` com listeners de mouse/IntersectionObserver | Sim |
| `SeletorTema.tsx` | `useTheme()` (next-themes) + `useSyncExternalStore` | Sim |
| `DemoAgendamento.tsx` | Simulação de wizard na landing (não toca banco) | Sim |
| `AnalyticsProvider.tsx`, `CapturaEvento.tsx`, `IdentificacaoAnalytics.tsx`, `src/lib/analytics/client.ts` | `useEffect` de mount único, renderizam `null` — padrão deliberado para instrumentar Server Components sem convertê-los | Sim |

**Achado (BAIXA)**: não encontrei nenhum `'use client'` desnecessário. Todos os 16 casos
têm justificativa concreta de interatividade ou de browser API. Isso é o oposto do que a
missão pedia para caçar — vale registrar como constatação positiva e não forçar um
achado onde não há.

**Confirmação de isolamento de camada**: `grep` em todos os 16 arquivos client por
`supabase` retornou vazio — nenhum client component importa o cliente Supabase
diretamente. Toda leitura/escrita client-side passa por Server Actions
(`src/app/actions/*`). Isso é o padrão correto e está sendo seguido sem exceção.

---

## 2. Fluxo de dados: três padrões coexistindo (MEDIA)

A documentação (`docs/04-PADROES_DE_FRONTEND.md`) só normatiza **mutações** via Server
Actions. Na prática, para **leituras** em Server Components coexistem três padrões sem
critério declarado de quando usar qual:

1. **Via função `'use server'` em `src/app/actions/*`** reaproveitada como data-fetcher
   (`listarAgendamentos`, `obterPerfilEmpresa`, `listarHorariosFuncionamento`).
2. **Query inline direta no `page.tsx`** via `createClient()` — ex.:
   `src/app/dashboard/page.tsx:83-120` consulta `whatsapp_configs`, `servicos` e
   `horarios_funcionamento` diretamente, ao lado de chamadas para `listarAgendamentos`
   (padrão 1) na mesma função.
3. **Helper de `src/lib/` que recebe o client Supabase como parâmetro**
   (`obterAssinaturaVigente(supabase, orgId)` em `src/lib/assinaturas.ts:18`), chamado a
   partir de 6 pontos diferentes (`layout.tsx` + 5 `page.tsx`).

**Por que importa**: não há uma regra clara de "onde mora uma leitura nova" — cada nova
feature decide de novo. Hoje isso só custa consistência de estilo; conforme mais
desenvolvedores (ou agentes) tocarem o código, aumenta a chance de leituras redundantes
ou de RLS sendo contornado por engano (o padrão 2, com `createClient()` solto no meio de
um `page.tsx`, é o mais fácil de copiar errado).

**Arquivos**: `src/app/dashboard/page.tsx`, `src/app/dashboard/agenda/page.tsx`,
`src/app/dashboard/servicos/page.tsx`, `src/app/dashboard/whatsapp/page.tsx`,
`src/app/dashboard/plano/page.tsx`, `src/app/dashboard/layout.tsx`.

### N+1 real e não cacheado: `obterAssinaturaVigente` (MEDIA)

Todo carregamento de página do dashboard executa `obterAssinaturaVigente()` **duas
vezes**: uma em `src/app/dashboard/layout.tsx:27-28` (para montar a sidebar com o nome
do plano) e outra dentro do próprio `page.tsx` correspondente (`dashboard/page.tsx:112`,
`agenda/page.tsx:37`, `servicos/page.tsx:34`, `whatsapp/page.tsx:31`, `plano/page.tsx:70`)
— seis pontos de chamada no total, cada um criando seu próprio `createClient()`.

Não há `React.cache()` nem `unstable_cache` envolvendo essa função. É possível que a
memoização de fetch do Next.js dedupe a chamada dentro do mesmo request (mesma URL/
headers), mas isso depende de comportamento interno do framework que **não está sendo
garantido explicitamente** pelo código — e o dado em questão faz gating de plano pago,
então uma eventual falha de dedupe não é apenas custo de performance, é uma consulta a
mais na tabela `assinaturas` por navegação, multiplicada por tenant e por volume.
Recomendação (não implementada, é achado): envolver `obterAssinaturaVigente` em
`React.cache()` para tornar a garantia explícita e independente de comportamento
implícito do framework.

**Arquivos**: `src/lib/assinaturas.ts:18-44`, `src/app/dashboard/layout.tsx:24-29`.

---

## 3. Duplicação concreta

### 3.1 Bloco "Selecione uma Organização" — 4 cópias idênticas (MEDIA)

O mesmo bloco JSX (ícone SVG + título + parágrafo, só o parágrafo muda) aparece
verbatim em:

- `src/app/dashboard/page.tsx:26-40`
- `src/app/dashboard/agenda/page.tsx:14-27`
- `src/app/dashboard/servicos/page.tsx:13-26`
- `src/app/dashboard/whatsapp/page.tsx:14-27`

Custo futuro: qualquer ajuste visual (novo texto, novo ícone, dark mode) exige editar 4
arquivos manualmente — o tipo de duplicação que gera divergência silenciosa (um
`page.tsx` fica desatualizado e ninguém percebe até um usuário reportar). Extrair para
um componente `EstadoSemOrganizacao` resolveria com uma mudança pequena e sem risco.

### 3.2 `formatarTelefone` — duplicação byte-a-byte (MEDIA)

A mesma função de máscara de telefone (14 linhas, lógica idêntica caractere por
caractere) existe em dois arquivos:

- `src/app/dashboard/NovoAgendamentoModal.tsx:42-55`
- `src/app/book/[slug]/BookingWizard.tsx:32-45`

Nenhum dos dois importa de um módulo compartilhado. `src/lib/timezone.ts` já é, por
convenção do próprio projeto (ver comentário no topo do arquivo, "P0.4"), a fonte única
para lógica de data/hora repetida — o mesmo padrão não foi replicado para telefone.

### 3.3 Validação de telefone (sanitização + regra 10-11 dígitos) — 6 pontos (MEDIA)

`telefone.replace(/\D/g, '')` seguido da checagem `length < 10 || length > 11` aparece
sem uma função compartilhada em:

- `src/app/actions/public-booking.ts:37-40`
- `src/app/actions/agendamentos.ts:268-270`
- `src/app/actions/whatsapp.ts:464-466`
- `src/app/dashboard/NovoAgendamentoModal.tsx:212-216` (client, replicando a mesma regra
  para dar feedback antes do round-trip ao servidor — legítimo do ponto de vista de UX,
  mas ainda assim é a mesma regra escrita à mão de novo)
- variações em `src/app/actions/perfis-empresas.ts:198` e `src/app/actions/clientes.ts:26`
  (sanitização sem a validação de tamanho)

**Por que importa mais do que parece**: hoje as 3 cópias server-side já têm mensagens de
erro ligeiramente diferentes para a mesma regra ("Número de WhatsApp inválido..." vs
"Informe o WhatsApp do cliente com DDD..."). Se a regra mudar (ex.: aceitar telefone
internacional, ou relaxar para 8 dígitos fixo), é preciso lembrar de tocar em 6 lugares.
Não há teste que amarre esses 6 pontos entre si — o `whatsapp-helper.test.ts` cobre
lógica de mensageria, não essa validação de formato.

**Recomendação de escopo pequeno**: um `src/lib/telefone.ts` com `sanitizarTelefone` e
`validarTelefone` resolveria 3.2 e 3.3 juntos, no mesmo espírito de `timezone.ts`.

---

## 4. Código morto

Verifiquei cruzando todo export de `src/lib/*` e `src/app/actions/*` contra seus
importadores em todo o repositório (não apenas leitura visual — grep de cada símbolo).

**Achado único (BAIXA)**: `capturarEventoServidor` (`src/lib/analytics/server.ts:55`) é
exportado mas só é chamado internamente pelo próprio módulo, dentro de
`capturarEventoTenant` (linha 74). Nenhum outro arquivo do projeto o importa
diretamente — todo disparo de evento server-side no código real passa pela variante
`capturarEventoTenant` (que exige um `orgId`). A variante "anônima" (`distinctId`
default `'server'`) documentada em `docs/08-ANALYTICS_E_FUNIL.md:49` como parte do
design não tem hoje nenhum consumidor real. Não é grave — é uma API pública sem uso, não
uma rota morta — mas é o tipo de coisa que vale podar ou marcar explicitamente como
"reservado para uso futuro" no comentário, porque hoje o comentário do arquivo não deixa
isso claro.

Nenhum componente, página ou rota órfã foi encontrado. Todos os 8 arquivos de topo em
`src/app/*.tsx` (`PalcoAuth`, `DiaNoite`, `LogoMarca`, `LuzAmbiente`, `Reveal`,
`SeletorTema`, `DemoAgendamento`) têm pelo menos 2 importadores confirmados por grep.

---

## 5. Acoplamentos perigosos

**Achado negativo esperado que não se confirmou**: não há módulo "que importa de tudo".
O arquivo com mais imports é `src/app/page.tsx` com 12 (razoável para uma página de
composição). Os arquivos de Server Actions mais longos (`agendamentos.ts` com 494
linhas, `whatsapp.ts` com 534) têm import lists enxutas (6-9 imports) e focadas no seu
próprio domínio — não há vazamento de responsabilidade entre domínios (ex.:
`whatsapp.ts` não importa nada de `agenda.ts` ou vice-versa).

**Gating de plano feito corretamente no servidor**: verifiquei especificamente o caso de
`limiteServicosAtivos` (limite de serviços ativos por plano), que é o tipo de regra que
frequentemente vaza para o client por engano. Em
`src/app/dashboard/servicos/ServicosClient.tsx:30` o client só usa o número para UI
otimista (desabilitar botão, mostrar contador); a contagem real contra o banco é
refeita em `src/app/actions/servicos.ts:59-85` na Server Action, então um client
adulterado não consegue burlar o limite. Esse é o padrão correto e está sendo seguido.

**Nenhum client component com query direta ao banco** (confirmado por grep, ver §1).

Não encontrei, portanto, achados de severidade ALTA nesta categoria — o que é
informação relevante para a auditoria como um todo: a separação de camadas está sendo
respeitada de forma consistente, mesmo sem enforcement automatizado (lint rule) para
isso.

---

## 6. Dívida estrutural — onde vai doer primeiro com crescimento

### 6.1 `agendamentos` e `clientes` sem índice secundário (ALTA)

`supabase/schemas/07_agendamentos.sql` e `supabase/schemas/06_clientes.sql` não têm
nenhum `CREATE INDEX` além da chave primária. Postgres **não indexa automaticamente**
colunas de foreign key — logo `tenant_id` em ambas as tabelas está sem índice.

Isso importa porque:
- `obterSlotsDisponiveis()` (`src/lib/booking-engine.ts:108-120`), chamada em toda
  navegação de data no booking público, todo carregamento do modal de agendamento
  manual e de novo na revalidação anti-double-booking, filtra `agendamentos` por
  `tenant_id + data_hora` (`.eq('tenant_id', ...).gte('data_hora', ...).lt('data_hora',
  ...)`) — sem índice composto `(tenant_id, data_hora)`.
- `listarAgendamentos()` (`src/app/actions/agendamentos.ts:22`), chamada em todo
  carregamento do dashboard, faz o mesmo filtro.
- O lookup de cliente existente por telefone em `criarAgendamentoPublico`
  (`src/app/actions/public-booking.ts:109-114`) filtra `clientes` por
  `tenant_id + telefone` sem índice.

Com poucos tenants e poucos agendamentos por tenant (estágio atual), o Postgres resolve
isso com sequential scan sem que ninguém note. É exatamente o tipo de problema que **não
aparece em dev e aparece de uma vez em produção** quando o volume cresce — cada
consulta de slot, que hoje é ~instantânea, passa a escanear a tabela `agendamentos`
inteira (todos os tenants) a cada chamada. Como o schema é declarativo
(`supabase/schemas/`), a correção é uma migration pequena
(`CREATE INDEX idx_agendamentos_tenant_data ON agendamentos (tenant_id, data_hora);` e
equivalente em `clientes (tenant_id, telefone)`), mas precisa ser feita antes do
crescimento, não depois — senão vira um incidente de produção em vez de uma migration
tranquila.

### 6.2 Componentes client "página inteira" sem decomposição (MEDIA)

Os client components de cada seção do dashboard já nascem grandes e tendem a crescer
junto com a feature, sem sinal de decomposição em subcomponentes:

| Arquivo | Linhas |
|---|---|
| `src/app/dashboard/whatsapp/WhatsappClient.tsx` | 670 |
| `src/app/dashboard/DashboardClient.tsx` | 679 |
| `src/app/dashboard/agenda/AgendaClient.tsx` | 649 |
| `src/app/dashboard/NovoAgendamentoModal.tsx` | 645 |
| `src/app/book/[slug]/BookingWizard.tsx` | 501 |

Nenhum desses hoje é ilegível ou incorreto — o código lido é bem comentado e a lógica
de estado é coerente (padrão "derivado, não setState no effect" está bem aplicado, ver
comentário em `NovoAgendamentoModal.tsx:84-86`). Mas é a categoria de arquivo que, à
medida que cada área ganha mais estados de UI (mais filtros na agenda, mais detalhes no
WhatsApp), vira difícil de revisar em diff e de testar. Vale um teto informal (ex.: "se
passar de ~700 linhas, quebrar em subcomponentes de apresentação") antes que a próxima
feature empurre um desses para 900+.

### 6.3 `disparos_whatsapp` como log append-only sem estratégia de retenção (MEDIA)

`supabase/schemas/09_disparos_whatsapp.sql` está corretamente indexado
(`idx_disparos_whatsapp_tenant_created`) e é intencionalmente append-only (comentário
explícito: "sem UPDATE nem DELETE pela aplicação"). Isso é uma decisão de auditoria
correta, mas não há política de retenção/arquivamento documentada em nenhum dos docs —
com WhatsApp exclusivo do plano Pro e cada agendamento gerando ao menos 1 linha
(confirmação síncrona) e potencialmente 2 (mais o lembrete), essa tabela cresce
proporcionalmente ao volume de agendamentos dos tenants Pro, para sempre, sem purga.
Não é urgente agora (poucos tenants Pro), mas é o tipo de dívida que fica mais cara
quanto mais se adia — vale decidir a política (partição por data? purga após N meses?)
antes que a tabela tenha milhões de linhas.

### 6.4 Ausência de cache explícito em leituras repetidas (MEDIA)

Além do caso já detalhado de `obterAssinaturaVigente` (§2), o padrão geral do projeto é
zero camada de cache — nem `React.cache()`, nem `unstable_cache`, nem Redis/Upstash KV
(apesar de já haver conta Upstash para QStash). Para o estágio atual (poucos tenants,
tráfego baixo) isso é a escolha certa — otimização prematura seria pior. Mas é um dos
primeiros lugares a olhar quando o volume crescer, porque a base de código não tem hoje
nenhum ponto de extensão já preparado para isso (nenhuma função de leitura foi escrita
pensando em "isso vai precisar de cache um dia").

### 6.5 Motor de disponibilidade acoplado a 3 round-trips sequenciais por chamada (BAIXA-MEDIA)

`obterSlotsDisponiveis()` faz 3 queries sequenciais (`horarios_funcionamento` →
`excecoes_agenda` → `agendamentos`) sem paralelizar com `Promise.all`. As duas primeiras
não dependem uma da outra e poderiam rodar em paralelo. Hoje o impacto é baixo (latência
de rede duplicada, não custo de CPU), mas é uma função chamada com alta frequência
(toda troca de data no booking público, todo carregamento do modal de agendamento
manual) — o tipo de round-trip que se soma quando multiplicado por milhares de
chamadas/dia.

**Arquivo**: `src/lib/booking-engine.ts:53-127`.

---

## 7. Onde a arquitetura está superdimensionada para o estágio atual

Diferente da seção anterior, aqui o achado é mais escasso — o projeto segue bem a regra
de simplicidade proporcional do próprio `CLAUDE.md`. O único candidato real:

**Landings verticais por nicho (`src/lib/nichos.ts`, 388 linhas + rota SSG dedicada)**
(BAIXA-MEDIA, é uma leitura de prioridade de produto, não um erro técnico): o projeto
investiu em copywriting extenso e uma arquitetura de landing compartilhada (commit
`0820b09`, "SSG e shared layout architecture") para múltiplos nichos verticais **antes**
de o checkout Asaas existir (`docs/07-PLANOS_E_MONETIZACAO.md:30-32`: "Checkout ainda
não existe... Não há pagamento real em produção"). Do ponto de vista de arquitetura em
si a implementação é limpa (SSG puro, `generateStaticParams`, sem `auth()`/`cookies()`
nos imports, conforme o próprio comentário do arquivo exige) — o achado não é "está mal
feito", é "é investimento de superfície (mais rotas, mais copy, mais conteúdo para
manter atualizado) em aquisição/SEO antes de o funil de monetização fechar". Não é um
problema de código; é um ponto que vale revisitar na priorização, já que
`docs/PENDENCIAS.md` já reconhece o checkout Asaas como bloqueador de lançamento.

Fora esse ponto, não encontrei abstrações não solicitadas, camadas extras,
microsserviços, filas além do QStash necessário, ou dependências supérfluas — o
`package.json` tem 8 dependências de produção, todas em uso confirmado.

---

## 8. Divergência entre documentação e realidade

### 8.1 "Não há framework de testes configurado" — FALSO (ALTA)

`CLAUDE.md` (raiz do projeto, seção Comandos) afirma textualmente: *"Não há framework de
testes configurado."* O mesmo texto aparece em `docs/PENDENCIAS.md:664-665` ("Não há
framework de testes configurado no repositório... Decisão pendente: escolher o runner
(Vitest é o candidato natural...)").

Isso não é mais verdade: `vitest.config.ts` existe na raiz, `package.json` tem
`"test": "vitest run"` e devDependency `vitest`, e há 370 linhas de teste real em
`src/lib/__tests__/` cobrindo exatamente as três áreas que o próprio
`docs/PENDENCIAS.md` (mesma seção) lista como prioritárias: `booking-engine.test.ts`
(137 linhas — slots, exceções, colisões), `timezone.test.ts` (92 linhas — limites de
dia), `whatsapp-helper.test.ts` (141 linhas). O commit que introduziu `vitest.config.ts`
é de 2026-07-13 — dois dias antes desta auditoria.

**Por que importa**: o `CLAUDE.md` é lido por agentes/desenvolvedores como fonte de
verdade operacional. A "Definition of Done" do próprio `CLAUDE.md` diz "sem testes
automatizados, o build é o gate obrigatório" — uma instrução que hoje está errada e pode
levar a não rodar `pnpm test` como parte do gate, deixando testes existentes sem
verificação em mudanças futuras no motor de disponibilidade ou em timezone (área que o
próprio projeto já identificou como de alto risco). É uma correção de baixo custo e alto
valor — a decisão já foi tomada e implementada, só falta o texto refletir isso.

### 8.2 `docs/01-ARQUITETURA_E_STACK.md` trata Resend e Asaas como stack já adotada, sem ressalva (MEDIA)

`docs/01-ARQUITETURA_E_STACK.md:23-31` lista Asaas e Resend na seção "Stack Oficial e
Definitiva" no mesmo nível de Clerk/Supabase/QStash, sem nenhuma nota de que ainda não
foram implementados. Na prática:

- `grep -rli "resend" src package.json` não retorna nada — zero código, zero dependência.
- `grep -rli "asaas" src package.json` idem — zero código, zero dependência.

Isso **não é uma surpresa não documentada** — `docs/05-PRODUTO_E_VISAO.md:30-36` e
`docs/07-PLANOS_E_MONETIZACAO.md:30-32` são explícitos e corretos sobre o checkout Asaas
não existir, e `docs/PENDENCIAS.md:375-380` documenta que "envio por e-mail **não
existe** (Resend não é usado em lugar nenhum do código)". O problema é a
**inconsistência entre os próprios docs**: quem lê só o `docs/01` (o primeiro da lista,
o mais "arquitetural") sai com a impressão de que a integração de pagamento e e-mail já
está pronta. Vale um aviso no `docs/01`, no mesmo padrão que ele já usa para tecnologias
descartadas, apontando que Resend/Asaas estão especificados mas não implementados, com
referência a `docs/PENDENCIAS.md`.

### 8.3 Diagrama do fluxo B2C inclui um passo não implementado sem marcação visual (BAIXA)

`docs/05-PRODUTO_E_VISAO.md:20-27` mostra um `mermaid flowchart` do fluxo do cliente
final com a etapa "C: Seleção de Profissional" no mesmo nível visual das etapas
implementadas; só o texto em prosa logo abaixo (item 3) esclarece "*(pós-MVP — ainda não
implementado)*". Quem só olha o diagrama não vê a diferença. Achado cosmético, mas fácil
de corrigir (nota tracejada ou cor diferente no nó do Mermaid).

### 8.4 Import relativo em vez do alias `@/` nas landings de nicho (BAIXA)

`src/app/para/[nicho]/page.tsx` e os arquivos que ele compõe usam import relativo
profundo (`'../../DemoAgendamento'`, `'../../Reveal'`, `'../../LuzAmbiente'`,
`'../../LogoMarca'`, `'../../SeletorTema'`, `'../../DiaNoite'`) enquanto o resto do
projeto usa consistentemente o alias `@/app/...`. Não é um bug, é uma inconsistência de
estilo que nenhum doc de padrões (`docs/04`) proíbe explicitamente porque não previa o
caso — vale adicionar a regra ("sempre `@/`, nunca relativo") já que a base é 100%
consistente nesse ponto em todo o resto do código.

---

## Resumo para o orquestrador

**Contagem de achados**: 3 ALTA · 9 MEDIA · 5 BAIXA (17 no total; alguns têm nota dupla
de severidade quando o impacto é intermediário).

**Os 5 mais importantes**:

1. **[ALTA]** `agendamentos` e `clientes` sem índice em `(tenant_id, data_hora)` /
   `(tenant_id, telefone)` — o motor de disponibilidade e o dashboard fazem sequential
   scan hoje; funciona por causa do volume baixo, não por design. Correção é uma
   migration pequena, mas precisa vir antes do crescimento.
2. **[ALTA]** `CLAUDE.md` e `docs/PENDENCIAS.md` afirmam "não há testes configurados" —
   falso: há Vitest com 370 linhas cobrindo booking-engine, timezone e whatsapp-helper
   desde 2026-07-13. Risco real de o gate de qualidade ser ignorado por desatualização
   do próprio texto que o define.
3. **[MEDIA]** `obterAssinaturaVigente()` é chamada 2x por navegação no dashboard
   (layout + page, 6 pontos de chamada), sem `React.cache()` — depende de comportamento
   implícito do Next para não duplicar a query numa tabela que faz gating de plano pago.
4. **[MEDIA]** Duplicação concreta em 3 frentes: bloco "Selecione uma Organização" (4
   cópias idênticas), `formatarTelefone` (duplicação byte-a-byte em 2 arquivos), e
   validação de telefone (mesma regra reescrita em 6 pontos com mensagens de erro
   divergentes).
5. **[MEDIA]** `docs/01-ARQUITETURA_E_STACK.md` lista Resend/Asaas como stack já
   adotada sem ressalva, contradizendo `docs/05`, `docs/07` e `docs/PENDENCIAS.md`
   (que corretamente marcam ambos como não implementados) — risco de um novo
   dev/agente assumir que pagamento/e-mail já funcionam.

**Achados positivos que vale registrar** (para não distorcer a leitura do orquestrador):
nenhum `'use client'` injustificado, nenhum client component toca Supabase diretamente,
gating de plano (limite de serviços) é reforçado no servidor mesmo com UI otimista no
client, e não há sinal de acoplamento "módulo que importa de tudo" nem over-engineering
fora do caso pontual das landings de nicho (§7).
