---
quick_id: 260721-jif
phase: quick-260721-jif
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: false
requirements: [OPE-02, EML-05]
files_modified:
  - .planning/ROADMAP.md
  - .planning/REQUIREMENTS.md
  - package.json
  - pnpm-lock.yaml
  - next.config.ts
  - src/instrumentation.ts
  - src/instrumentation-client.ts
  - src/sentry.server.config.ts
  - src/sentry.edge.config.ts
  - src/lib/env.ts
  - src/lib/observabilidade/opcoes-sentry.ts
  - src/lib/observabilidade/sanitizacao.ts
  - src/lib/observabilidade/reportar.ts
  - src/lib/email/classificar.ts
  - src/lib/email/remetente.ts
  - src/lib/email/enviar.ts
  - src/lib/whatsapp-helper.ts
  - src/lib/notificacoes-agendamento.ts
  - src/app/api/webhooks/lembrete/route.ts
  - src/app/actions/public-booking.ts
  - src/lib/__tests__/env.test.ts
  - src/lib/__tests__/opcoes-sentry.test.ts
  - src/lib/__tests__/email-classificar.test.ts
  - src/lib/__tests__/email-remetente.test.ts
  - src/lib/__tests__/email-enviar.test.ts
  - scripts/smoke-fundacao.mjs
  - docs/08-ANALYTICS_E_FUNIL.md
  - docs/01-ARQUITETURA_E_STACK.md
  - docs/PENDENCIAS.md
  - CLAUDE.md
  - .planning/quick/260721-jif-fundacao-operacional-sentry-posthog-e-re/260721-jif-ENV-BLOCO.md

user_setup:
  - service: sentry
    why: "Error tracking em produção — sem projeto criado não há DSN e OPE-02 é falso"
    env_vars:
      - name: NEXT_PUBLIC_SENTRY_DSN
        source: "Sentry -> Projects -> [projeto] -> Settings -> Client Keys (DSN)"
  - service: posthog
    why: "Projeto de produção do funil; o código já existe e está correto"
    env_vars:
      - name: NEXT_PUBLIC_POSTHOG_KEY
        source: "PostHog -> Settings -> Project -> Project API Key"
      - name: NEXT_PUBLIC_POSTHOG_HOST
        source: "Obrigatória SOMENTE se o projeto for criado na região EU (https://eu.i.posthog.com)"
      - name: ANALYTICS_TENANT_SALT
        source: "Gerada pelo owner (string aleatória longa). Nunca trocar depois — desconecta distinct_ids históricos"
  - service: resend
    why: "Envio transacional; DNS já verificado em 82db24e"
    env_vars:
      - name: RESEND_API_KEY
        source: "Resend -> API Keys -> Create API Key (permissão de envio)"
    dashboard_config:
      - task: "Confirmar que mail.vamoagendar.com.br continua com status Verified"
        location: "Resend -> Domains"

must_haves:
  truths:
    - "Uma exceção lançada por Server Action em produção vira evento no projeto do Sentry do owner, com rota e stack, sem depender de alguém reclamar (OPE-02)"
    - "As falhas que hoje morrem no console viram evento no Sentry: erro de transporte da Evolution, lembrete sem token do QStash, catch de topo das notificações, catch de topo do webhook de lembrete e as três perdas de causa raiz do booking público"
    - "Condição esperada (WhatsApp desconectado, plano sem WhatsApp, agendamento cancelado) NÃO vira evento no Sentry — só falha inesperada vira (D-05)"
    - "Nenhum evento do Sentry carrega nome, telefone, e-mail, querystring, corpo de Server Action, cookie ou identidade de usuário — e a trava é asserção de teste sobre o objeto de opções versionado, não toggle de painel (D-02)"
    - "Sem RESEND_API_KEY, enviarEmail devolve { ok: false, motivo: 'desativado' }, não lança e não registra erro (EML-05)"
    - "enviarEmail nunca lança em nenhum caminho, e nenhuma string interna do Resend atravessa a fronteira do wrapper (D-04)"
    - "Em NODE_ENV=production, variável obrigatória ausente derruba o boot com a lista COMPLETA dos nomes ausentes; pnpm build local sem secrets continua passando (D-03)"
    - "A etapa preparatória existe no ROADMAP.md com Goal, Requirements, Success Criteria e Notas, registrada como pré-requisito obrigatório da Phase 1"
    - "OPE-02 e EML-05 apontam para a etapa preparatória nas DUAS tabelas do REQUIREMENTS.md; OPE-03 continua na Phase 11; o total de 56 requisitos v1 não muda"
    - "As variáveis novas estão no .env.example — entregues pelo artefato 260721-jif-ENV-BLOCO.md e coladas pelo owner, porque .env* está fora do alcance do executor por permissão; a confirmação do owner no Gate 1 é o que fecha esse item"
  artifacts:
    - .planning/ROADMAP.md
    - .planning/REQUIREMENTS.md
    - src/instrumentation.ts
    - src/instrumentation-client.ts
    - src/sentry.server.config.ts
    - src/sentry.edge.config.ts
    - src/lib/env.ts
    - src/lib/observabilidade/opcoes-sentry.ts
    - src/lib/observabilidade/sanitizacao.ts
    - src/lib/observabilidade/reportar.ts
    - src/lib/email/classificar.ts
    - src/lib/email/remetente.ts
    - src/lib/email/enviar.ts
    - src/lib/__tests__/opcoes-sentry.test.ts
    - src/lib/__tests__/env.test.ts
    - src/lib/__tests__/email-classificar.test.ts
    - src/lib/__tests__/email-remetente.test.ts
    - src/lib/__tests__/email-enviar.test.ts
    - scripts/smoke-fundacao.mjs
    - .planning/quick/260721-jif-fundacao-operacional-sentry-posthog-e-re/260721-jif-ENV-BLOCO.md
  key_links:
    - "src/instrumentation.ts chama validarEnvObrigatorio() ANTES de qualquer import dinâmico de terceiro — invertido, um env faltando estoura dentro do init do Sentry com a mensagem errada"
    - "src/instrumentation.ts exporta onRequestError = Sentry.captureRequestError — sem essa linha nenhuma exceção de Server Action chega ao Sentry e OPE-02 é falso mesmo com o SDK instalado"
    - "opcoesBaseSentry é a ÚNICA fonte das travas anti-PII, consumida pelos três arquivos de init — se um deles montar as opções à mão, a trava vaza por esse arquivo"
    - "src/lib/email/enviar.ts constrói o client do Resend DENTRO do guard de 'desativado': o construtor lança com chave undefined (dist/index.mjs:1203) e derrubaria o import em dev"
    - "src/lib/observabilidade/reportar.ts importa o SDK dinamicamente e é no-op sem DSN — import estático puxaria @sentry/node para dentro de whatsapp-helper.test.ts e exigiria mexer no vitest.config.ts"
    - ".planning/ROADMAP.md: o 'Depends on' da Phase 1 aponta para a etapa preparatória — é o registro que impede a Phase 1 de começar sem esta fundação"
---

<objective>
Escrever e executar a etapa preparatória "Fundação operacional": fechar o buraco de
planejamento (a etapa é hoje uma referência órfã em `.planning/ROADMAP.md:193`, introduzida
pelo commit `82db24e` e nunca definida) e entregar a fundação de observabilidade e e-mail
que as Phases 4, 5, 9 e 11 assumem já existir.

Purpose: sem isto, a Phase 1 começa sobre uma dependência que não existe; o wrapper do
Resend nasceria com `console.error` (linha de log que ninguém lê no Railway) e a Phase 4
herdaria a dívida; e OPE-02 continuaria sendo uma promessa sem mecanismo.

Output: seção da etapa no ROADMAP + remapeamento no REQUIREMENTS; Sentry server+client com
PII travada no código; fail-fast de env no boot; wrapper do Resend com união discriminada;
instrumentação dos pontos de falha silenciosa que existem hoje no código.

**Requisitos entregues:** OPE-02 (exceção não tratada chega ao owner sem alguém reclamar),
EML-05 (produto funciona sem credencial de e-mail, no-op silencioso).

**Mapa de decisões travadas** (`260721-jif-CONTEXT.md` numera 1–5; aqui cita-se D-01..D-05):

- **D-01** — Mapeamento de requisitos: OPE-02 e EML-05 vêm para a etapa; OPE-03 fica na Phase 11
- **D-02** — Superfície do Sentry: server **+ client**, cobrindo `/book/[slug]`, com PII desligada no código versionado
- **D-03** — Fail-fast de configuração em produção, disparado pelo `instrumentation.ts`
- **D-04** — Assinatura do wrapper do Resend: união discriminada, vocabulário fechado, nunca lança
- **D-05** — Falha esperada devolve `motivo` e segue; falha inesperada vai ao Sentry sanitizada
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
</execution_context>

<context>
@.planning/quick/260721-jif-fundacao-operacional-sentry-posthog-e-re/260721-jif-CONTEXT.md
@.planning/quick/260721-jif-fundacao-operacional-sentry-posthog-e-re/260721-jif-RESEARCH.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@CLAUDE.md
@src/lib/analytics/server.ts
@src/lib/analytics/client.ts
@src/lib/whatsapp-helper.ts
@src/lib/notificacoes-agendamento.ts
@next.config.ts
@vitest.config.ts
</context>

<restricoes_de_execucao>
Valem para TODAS as tarefas. Violar qualquer uma invalida a entrega.

1. **pnpm sempre.** Nenhum `npm`/`yarn` em nenhum comando.
2. **`.env*` está fora do alcance do executor — leitura E escrita — por configuração de
   permissão desta sessão.** Não é convenção nem preferência do plano: foi verificado na
   prática durante o planejamento. `Read` em `.env.example` devolve
   `File is in a directory that is denied by your permission settings`, e `Bash` com
   `grep -c . .env.example` devolve `Permission to use Bash ... has been denied`. O mesmo
   fato já está registrado em
   `.planning/phases/01-hardening-da-superf-cie-p-blica/01-CONTEXT.md:95`.
   **Não tentar ler, editar nem grepar nenhum `.env*`** — a tentativa só produz um prompt de
   permissão inútil no meio da execução. Tudo que envolve esses arquivos é entregue ao owner
   por artefato versionado (ver tarefa 3b). Nunca pedir que o owner cole um secret no chat.
3. **Preservar integralmente** `.planning/phases/01-hardening-da-superf-cie-p-blica/01-CONTEXT.md`,
   `01-UI-SPEC.md`, `01-RESEARCH.md`, `01-DISCUSSION-LOG.md`. Nenhuma edição nesses arquivos.
4. **Não renumerar fases.** As 12 fases continuam 1 a 12; a etapa preparatória não recebe número.
5. **Prettier:** `tabWidth: 4`, sem ponto e vírgula, aspas simples, `printWidth: 100`.
   Comentários e nomes de domínio em **pt-BR**.
6. **Convenção do projeto:** rodar `pnpm tsc --noEmit` após cada arquivo alterado, não
   acumular quebra para o fim.
7. **Onde a pesquisa contradisser conhecimento de treinamento, a pesquisa ganha.** Antes de
   usar API do framework, conferir `node_modules/next/dist/docs/`.
8. **Sem `tunnelRoute` e sem source maps nesta etapa** — decidido e justificado na tarefa 2.
9. Commits em pt-BR, `feat(escopo): descrição`. Sem push. **Cada tarefa `auto` termina com
   commit próprio** — não acumular T1+T2+T3a para commitar no fim. O split T3a/T3b só protege
   contra estouro de contexto se o trabalho de cada tarefa já estiver commitado quando a
   seguinte começa; sem isso o isolamento é decorativo.
</restricoes_de_execucao>

<decisoes_do_planner>
Duas decisões que o CONTEXT delegou e uma que a pesquisa forçou. Estão aqui para serem
revisadas, não escondidas em meio às tarefas.

## 1. Alcance da instrumentação de Server Actions (achado #4 da pesquisa)

**A pesquisa apurou:** o Turbopack não instrumenta Server Action automaticamente; erro que a
action **lança** ainda chega via `onRequestError` (`routeType: 'action'`), mas erro que ela
**engole** chega como a mensagem amigável, sem causa raiz.

**Medição feita antes de decidir** (contagem real no repo, não impressão): as actions **não**
envolvem tudo em `try/catch` — há 18 blocos `catch` nos 8 arquivos, vários deles sendo o
`try/catch` de analytics. O padrão dominante é guard clause + conferência de `{ error }` do
Supabase → `console.error(error.message)` → `throw new Error('amigável')`, com 112 ocorrências
de `throw new Error` em `src/app/actions/`.

**Consequência:** OPE-02 lido ao pé da letra ("exceções **não tratadas** chegam ao owner") já
fica verdadeiro com a instalação base, porque esses 112 pontos **lançam** e o `onRequestError`
os captura. O que a instalação base **não** alcança é a falha que nunca vira exceção — que é
exatamente a classe descrita em `ROADMAP.md:390`.

**Decisão — menor escopo que torna OPE-02 verdadeiro.** Instrumentar apenas onde o erro
morre (não vira exceção) **ou** onde a causa raiz é apagada num fluxo sem sessão (o cliente
final não reclama: ele vai embora). Isso produz uma lista fechada de 7 pontos:

| Ponto | Arquivo | Por que entra |
|---|---|---|
| `agendarLembreteQStash` sem token | `src/lib/whatsapp-helper.ts:108` | "lembrete com env faltando", nomeado em `ROADMAP.md:390`. Devolve `motivo` e ninguém olha |
| Falha de transporte da Evolution (`http_5xx`, `erro_rede`) | `src/lib/whatsapp-helper.ts:88,94` | Vira linha de log e some. Só o `disparos_whatsapp` guarda, e ninguém consulta sem a Phase 11 |
| `catch` de topo das notificações | `src/lib/notificacoes-agendamento.ts:136` | Engole qualquer exceção inesperada do fluxo de mensageria por contrato do produto |
| `catch` de topo do webhook de lembrete | `src/app/api/webhooks/lembrete/route.ts:162` | Devolve 500 ao QStash e o erro morre no console do Railway |
| Falha ao buscar cliente | `src/app/actions/public-booking.ts:128` | Fluxo B2C: causa raiz apagada por "Erro ao processar dados de contato." |
| Falha ao cadastrar cliente | `src/app/actions/public-booking.ts:148` | idem |
| Falha ao criar agendamento | `src/app/actions/public-booking.ts:168` | idem — é literalmente o critério de sucesso do milestone quebrando |
| Cota do Resend estourada | (nasce instrumentado) | `daily_quota_exceeded`/`monthly_quota_exceeded` classificam como `falha_transporte`, que vai ao Sentry por construção do wrapper |
| Fila do Asaas pausada | — | **Não existe código hoje.** É Phase 9. Registrar como herança explícita, não fingir cobertura |

**O que fica de fora e por quê:** os outros ~105 `throw new Error` das actions B2B. Cada um
**já** produz evento no Sentry via `onRequestError`; acrescentar `captureException(causaRaiz)`
em cada um é um diff de 105 pontos cujo ganho é "mensagem melhor", não "evento existe ou não".
A fase que tocar cada action acrescenta onde a causa raiz importar. Isto é escopo mínimo
deliberado, **não** simplificação de decisão do owner.

**Falha esperada não vai ao Sentry** (D-05): `whatsapp_desconectado`, `plano_sem_whatsapp` e
`agendamento_cancelado` são condição de negócio, não defeito. Mandá-las ao Sentry criaria
ruído que faz o owner parar de olhar a ferramenta — que é a forma mais comum de OPE-02
voltar a ser falso seis semanas depois.

## 2. `tunnelRoute` e source maps: fora desta etapa

`tunnelRoute` colide com o matcher amplo de `src/proxy.ts` (a doc do Sentry pede *exclude*, e
o projeto só tem *isPublicRoute*) — risco de quebrar o gate do Clerk por um ganho de fração de
eventos de client. Source maps acrescentam um secret (`SENTRY_AUTH_TOKEN`), um passo de build e
um modo de falha novo (build quebra se o upload falhar) numa etapa cujo objetivo é ser
fundação estável; stack de servidor já chega legível. Os dois ficam registrados em
`docs/PENDENCIAS.md` com gatilho, não esquecidos.

## 3. `DEBUG_QSTASH=1` continua diferido

A dívida está registrada em `.planning/STATE.md` (Deferred Items) como "não é escopo da Phase 1".
**Não sai aqui.** Razões: o executor não tem permissão em `.env*` — verificado nesta sessão,
`Read` e `Bash` negados — então quem edita o arquivo é o owner; tirar de `.env.example` sem
tirar do Railway e do `.env.local` é cosmético; e limpar os ambientes é higiene de go-live, que
é Phase 11 (OPE-04). Fica intocado — decidido, não
esquecido.

## 4. Legitimidade dos pacotes

`260721-jif-RESEARCH.md` não traz tabela formal de auditoria de pacotes, mas traz evidência
mais forte que ela: `npm view` de ambos e leitura do código real em disco
(`resend@6.18.0 dist/index.mjs:1182-1290` e `dist/index.d.mts`), além de `peerDependencies`
de `@sentry/nextjs` confirmando Next 16. São os SDKs oficiais de dois fornecedores já
escolhidos pelo projeto. O risco residual (typosquat no nome digitado) é fechado por
verificação **automatizada** dentro das tarefas 2 e 3a — não por checkpoint humano, que aqui
seria teatro e violaria a regra desta sessão de só parar o owner no que depende de ação externa
dele.
</decisoes_do_planner>

<tasks>

<task type="auto">
  <name>Tarefa 1: Escrever a etapa preparatória no ROADMAP e remapear os requisitos</name>
  <files>.planning/ROADMAP.md, .planning/REQUIREMENTS.md</files>
  <action>
Fecha o buraco que originou esta task (D-01). Trabalho de documento puro, sem código, sem
credencial. Fazer PRIMEIRO: é a entrega de maior valor e não pode ficar refém do orçamento de
contexto das tarefas seguintes.

Use `Edit` com substituição escopada em ambos os arquivos. NUNCA `Write` — reescrever
`.planning/ROADMAP.md` inteiro destrói as 12 fases.

**A) `.planning/ROADMAP.md` — seis edições:**

1. Na lista de checkbox da seção `## Phases`, inserir uma linha ANTES da linha da Phase 1:
   `- [ ] **Etapa preparatória: Fundação operacional** - Sentry, PostHog e Resend de pé antes da Phase 1 começar`
   Manter a numeração 1–12 intacta.

2. Na tabela `## Dependências duras`, acrescentar uma linha (coluna 1 é o que vem primeiro):
   Precede = `Etapa preparatória (fail-fast de env)`; Depende = `Phase 1 (SEG-05)`; Por quê =
   `SEG-05 exige que a aplicação não suba sem as chaves de assinatura do QStash. O mecanismo de fail-fast nasce na etapa preparatória — a Phase 1 acrescenta as chaves dela à mesma lista, em vez de inventar um segundo caminho`.

3. Em `## Phase Details`, inserir uma seção NOVA imediatamente antes de `### Phase 1:`, com
   cabeçalho `### Etapa preparatória: Fundação operacional` e **sem número de fase**, no mesmo
   formato das fases existentes (Goal / Depends on / Requirements / Success Criteria / Plans /
   Notas de execução), conteúdo:

   - **Goal**: `O produto tem error tracking, funil e canal de e-mail de pé antes da Phase 1 começar — e a ausência de configuração em produção deixa de ser silenciosa`
   - **Depends on**: `Nada — é a primeira coisa do milestone. É pré-requisito obrigatório da Phase 1`
   - **Requirements**: `OPE-02, EML-05`
   - **Success Criteria** (o que precisa ser VERDADE), seis itens numerados:
     1. Uma exceção não tratada em produção chega ao projeto do Sentry do owner, com rota e stack, sem depender de alguém reclamar
     2. Nenhum evento do Sentry carrega nome, telefone ou e-mail de cliente final — nem em querystring, nem em breadcrumb, nem em corpo de Server Action — e a trava está no código versionado, não em toggle de painel
     3. Sem `RESEND_API_KEY`, `enviarEmail` devolve `desativado`, nenhum fluxo quebra e nada é registrado como erro
     4. Um e-mail real sai de `naoresponda@mail.vamoagendar.com.br` identificado como `"<Estabelecimento> via VamoAgendar"`, com resposta indo ao profissional, e chega à caixa do owner
     5. Em produção, subir sem uma variável obrigatória derruba o boot listando todos os nomes ausentes de uma vez — e `pnpm build` local sem secrets continua funcionando
     6. Um evento real de funil aparece no projeto do PostHog do owner (a verificação com tráfego real de produção continua sendo OPE-03, na Phase 11)
   - **Plans**: `1 plano (quick task 260721-jif)`
   - **Notas de execução**, quatro bullets:
     - Os três produtos vêm juntos de propósito: wrapper do Resend nascido antes do Sentry nasceria com `console.error`, que no Railway é linha de log que ninguém lê, e a Phase 4 herdaria a dívida de trocar depois
     - O PostHog **já está implementado e correto** (`src/lib/analytics/`) — o que falta é projeto criado, chaves nos ambientes e verificação de que evento chega. Nenhuma linha de `analytics/` é reescrita aqui
     - `tunnelRoute` e source maps do Sentry ficaram de fora com justificativa registrada em `docs/PENDENCIAS.md`; `tunnelRoute` colide com o matcher de `src/proxy.ts`
     - A instrumentação cobre a lista fechada de pontos de falha silenciosa que existem hoje; a fila do Asaas (`ROADMAP.md:390`) não tem código ainda e é herança explícita da Phase 9

4. No `### Phase 1`, trocar a linha `**Depends on**: Nada (primeira fase)` por
   `**Depends on**: Etapa preparatória "Fundação operacional" (o fail-fast de env que SEG-05 exige nasce lá)`.

5. No `### Phase 4`, trocar a linha de `**Requirements**` para `EML-01, EML-04, EML-06`;
   remover o critério de sucesso 3 (o do no-op sem `RESEND_API_KEY`, que agora é da etapa
   preparatória) e renumerar os seguintes; e acrescentar às Notas de execução o bullet:
   `EML-05 e o wrapper de envio foram entregues na etapa preparatória — esta fase consome enviarEmail, não o reescreve`.

6. No `### Phase 11`, trocar a linha de `**Requirements**` para `OPE-01, OPE-03, OPE-04, OPE-05`;
   remover o critério de sucesso 2 (o da exceção não tratada chegando ao owner) e renumerar os
   seguintes; e acrescentar às Notas de execução o bullet:
   `OPE-02 foi entregue na etapa preparatória — esta fase assume o Sentry de pé e cobre o que sobra: o painel do owner (OPE-01) e o funil verificado com tráfego real (OPE-03)`.

   Ainda no ROADMAP, na tabela `## Cobertura de requisitos`, quebrar as duas linhas afetadas:
   `Comunicação por e-mail | EML-01, EML-04, EML-06 | 4` e uma linha nova
   `Comunicação por e-mail | EML-05 | Etapa preparatória`; `Operação e go-live | OPE-01, OPE-03, OPE-04, OPE-05 | 11` e uma linha nova `Operação e go-live | OPE-02 | Etapa preparatória`.
   Na tabela `## Progress`, acrescentar a linha `| Etapa preparatória. Fundação operacional | 0/1 | Not started | - |` antes da linha da Phase 1.

7. **Duas frases em prosa que passam a mentir depois das edições acima** — corrigir as duas,
   senão o ROADMAP contradiz as próprias tabelas dele:

   - A frase de abertura da seção `## Cobertura de requisitos` diz hoje que os 56 requisitos
     estão mapeados "cada um para exatamente uma fase". Depois desta edição, dois deles mapeiam
     para algo que **não é fase**. Reescrever para: 56 de 56 requisitos v1 mapeados, cada um
     para exatamente **um destino** — uma das 12 fases ou a etapa preparatória. Nenhum órfão,
     nenhuma duplicata.
   - O parágrafo **"Por que EML está partido em três fases"** passa a ter quatro destinos.
     Trocar o título para "Por que EML está partido em quatro destinos" e acrescentar a
     explicação de EML-05: ele é propriedade do wrapper de envio, e o wrapper nasce na etapa
     preparatória porque as Phases 4, 5 e 9 o consomem — deixá-lo na Phase 4 faria a Phase 5
     depender de código que ainda não existe. Manter intactas as explicações de EML-03 e EML-02.

**B) `.planning/REQUIREMENTS.md` — quatro edições:**

1. Tabela `| Requirement | Phase | Status |`: trocar a Phase de **OPE-02** e de **EML-05** para
   `Etapa preparatória`. **OPE-03 continua `Phase 11`** — não tocar.
2. Tabela `### Por fase`: inserir uma linha antes da Phase 1 com
   `| — | Etapa preparatória: Fundação operacional | EML-05, OPE-02 | 2 |`; ajustar a Phase 4
   para `EML-01, EML-04, EML-06` com Qtd `3`; ajustar a Phase 11 para
   `OPE-01, OPE-03, OPE-04, OPE-05` com Qtd `4`.
3. Bloco `**Coverage:**`: manter `56 total` e `Mapped: 56`, `Unmapped: 0`. Ajustar a frase de
   abertura de `## Traceability` para dizer que cada requisito v1 mapeia para exatamente uma
   fase **ou para a etapa preparatória**.
4. Na `**Nota sobre a categoria EML**`, corrigir a lista final: os de infraestrutura de envio
   que ficam na Phase 4 passam a ser EML-01, EML-04 e EML-06; acrescentar que EML-05 saiu para
   a etapa preparatória porque é propriedade do wrapper, e o wrapper nasce lá.

Conferência final obrigatória antes de fechar a tarefa: somar as quantidades da tabela
`### Por fase` (2 + 5 + 5 + 3 + 3 + 4 + 2 + 4 + 9 + 9 + 3 + 4 + 3) e confirmar que dá **56**.
Se não der, o erro está numa das contagens editadas — corrigir antes de seguir.
  </action>
  <verify>
    <automated>grep -q '^### Etapa preparatória: Fundação operacional' .planning/ROADMAP.md && grep -E '^\| OPE-02 \| Etapa preparatória' .planning/REQUIREMENTS.md && grep -E '^\| EML-05 \| Etapa preparatória' .planning/REQUIREMENTS.md && grep -E '^\| OPE-03 \| Phase 11' .planning/REQUIREMENTS.md</automated>
    <automated>sed -n '/^### Phase 1:/,/^---$/p' .planning/ROADMAP.md | grep -q 'Depends on.*Fundação operacional' && echo 'Phase 1 depende da etapa preparatória (escopado ao bloco da Phase 1, não à referência da Phase 4)'</automated>
    <automated>test $(grep -cE '^### Phase (1|2|3|4|5|6|7|8|9|10|11|12):' .planning/ROADMAP.md) -eq 12</automated>
    <automated>awk -F'|' '$4 ~ /-[0-9][0-9]/ && $5 ~ /^ *[0-9]+ *$/ { s+=$5 } END { print "soma da coluna Qtd da tabela por fase:", s; exit s!=56 }' .planning/REQUIREMENTS.md</automated>
    <automated>grep -q '^\*\*Requirements\*\*: EML-01, EML-04, EML-06$' .planning/ROADMAP.md && grep -q '^\*\*Requirements\*\*: OPE-01, OPE-03, OPE-04, OPE-05$' .planning/ROADMAP.md && grep -q '^\*\*Requirements\*\*: OPE-02, EML-05$' .planning/ROADMAP.md</automated>
    <automated>git status --porcelain .planning/phases/01-hardening-da-superf-cie-p-blica/ | wc -l | grep -qx 0 && echo 'artefatos da Phase 1 intactos'</automated>
  </verify>
  <done>
A etapa preparatória tem seção própria no ROADMAP com Goal, Depends on, Requirements, seis
Success Criteria e Notas de execução; o `Depends on` **do bloco da Phase 1** aponta para ela
(verificado com escopo no bloco, não pela referência que a Phase 4 já tinha); as 12 fases seguem
numeradas 1 a 12; OPE-02 e EML-05 apontam para a etapa nas duas tabelas do REQUIREMENTS; OPE-03
continua na Phase 11; a soma da coluna Qtd dá 56 conferida por `awk`, não por leitura; as linhas
de `**Requirements**` das Phases 4 e 11 batem exatamente com o esperado; as duas frases em prosa
do ROADMAP foram corrigidas junto com as tabelas; e os quatro artefatos da Phase 1 estão sem
modificação no `git status`.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Tarefa 2: Sentry server+client com PII travada no código, e fail-fast de env no boot</name>
  <files>package.json, pnpm-lock.yaml, next.config.ts, src/instrumentation.ts, src/instrumentation-client.ts, src/sentry.server.config.ts, src/sentry.edge.config.ts, src/lib/env.ts, src/lib/observabilidade/opcoes-sentry.ts, src/lib/observabilidade/sanitizacao.ts, src/lib/observabilidade/reportar.ts, src/lib/__tests__/opcoes-sentry.test.ts, src/lib/__tests__/env.test.ts</files>
  <behavior>
Comportamento a fixar em teste ANTES da implementação (`src/lib/__tests__/opcoes-sentry.test.ts`
e `src/lib/__tests__/env.test.ts`). São funções e objetos puros: nenhum deles importa o SDK do
Sentry, e nenhuma variável nova entra no `vitest.config.ts`.

`opcoesBaseSentry` (objeto de opções versionado, D-02):
- `sendDefaultPii` é `false`
- `tracesSampleRate` é `0`
- a configuração de coleta de dados nega identidade de usuário, querystring e cookies (lista vazia / flag falsa em cada um)

`sanitizarEventoSentry` (função pura, genérica sobre o formato do evento):
- URL com querystring vira URL sem querystring
- a querystring separada do evento é removida
- o corpo da requisição é removido
- os cookies são removidos
- a identidade de usuário do evento é removida
- evento sem `request` passa incólume, sem lançar

`sanitizarBreadcrumb` (função pura):
- breadcrumb de fetch/xhr com querystring em `data.url` sai sem a querystring
- breadcrumb sem `data.url` passa incólume

`validarEnvObrigatorio` (D-03):
- fora de produção, com todas as variáveis ausentes, não lança
- em produção com todas presentes, não lança
- em produção com três ausentes, lança UMA vez e a mensagem contém os TRÊS nomes (não só o primeiro)
- string só com espaço em branco conta como ausente
- **acesso dinâmico ao ambiente**: uma variável `NEXT_PUBLIC_*` definida em runtime pelo teste é
  enxergada pela validação. Este caso existe para travar o modo de falha do W7: se alguém
  reescrever a função com acesso literal por propriedade, o valor é congelado em tempo de build
  e este teste quebra — que é o sinal desejado

Use `vi.stubEnv` por teste (Vitest 4) — nunca constante de módulo, para não precisar tocar em
`vitest.config.ts`.
  </behavior>
  <action>
Ordem obrigatória. O passo 0 tem que ser o primeiro porque a medição perde o sentido depois da
instalação.

**Passo 0 — baseline do bundle.** Rodar `pnpm build` e anotar o **First Load JS da rota
`/book/[slug]`** da saída. Guardar o número; ele vai para o SUMMARY e vira o critério de aceite
do custo do Sentry no client (a pesquisa avisa que `treeshake` é no-op sob Turbopack, então a
faixa "< 20 KB" da doc do Sentry não é alcançável por configuração — o que vale é a medida real).

**Passo 1 — instalar e conferir procedência.** `pnpm add @sentry/nextjs`. Antes de escrever
qualquer código, conferir a procedência com `pnpm view @sentry/nextjs repository.url dist-tags.latest`
e confirmar que o repositório é `getsentry/sentry-javascript`. Divergência aqui é typosquat:
parar e reportar, não seguir.

**Passo 2 — `src/lib/env.ts` (D-03).** TypeScript puro, **sem zod**. Exporta
`validarEnvObrigatorio(): void` e a constante da lista. Em `NODE_ENV !== 'production'`, retorna
imediatamente. Em produção, filtra os nomes cuja variável seja ausente ou só espaço em branco e,
havendo algum, lança um `Error` cuja mensagem começa por `Variáveis obrigatórias ausentes em produção:`
seguida da lista COMPLETA separada por vírgula (a lista completa de uma vez é o que evita o owner
descobrir uma variável por deploy).

Lista de obrigatórias, treze nomes exatos: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `QSTASH_TOKEN`, `QSTASH_URL`,
`QSTASH_CURRENT_SIGNING_KEY`, `EVOLUTION_API_URL`, `EVOLUTION_GLOBAL_API_KEY`, `APP_URL`,
`ANALYTICS_TENANT_SALT`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_SENTRY_DSN`, `RESEND_API_KEY`.

Escrever no cabeçalho do arquivo, em pt-BR, quatro comentários que a próxima sessão precisa ler:
(a) **o critério de entrada na lista** é "a ausência desta variável falha em silêncio ou falha
tarde" — por isso as chaves do Clerk ficam de fora: sem elas o boot já morre com mensagem clara
e imediata, e duplicar isso aqui só criaria risco de errar o nome e derrubar produção à toa;
(b) a **Phase 1 (SEG-05) acrescenta `QSTASH_NEXT_SIGNING_KEY`** a esta mesma lista — o mecanismo
nasce aqui e é extensível por uma linha (`QSTASH_CURRENT_SIGNING_KEY` já está); (c) o **gatilho
para instalar zod**: quando a primeira variável exigir validação de **formato**, e não só de
presença, o `filter` de vinte linhas deixa de servir e o zod passa a valer o pacote;
(d) variável `NEXT_PUBLIC_*` precisa existir no **build** para chegar ao bundle do browser —
esta validação é de runtime e não substitui isso.

⚠️ (e) **Quatro das treze são `NEXT_PUBLIC_*`, e isso tem modo de falha próprio.** O acesso
precisa ser **dinâmico** (indexar o objeto de ambiente pelo nome vindo da lista), nunca acesso
literal por propriedade: acesso literal a `NEXT_PUBLIC_*` é substituído por valor em tempo de
build, e a validação passaria a conferir o que foi congelado no build em vez do que existe no
runtime. Registrar no comentário o pressuposto que sustenta a lista: **o Railway usa o mesmo
env em build e em runtime**. Num ambiente onde essas variáveis existissem só no build, o
fail-fast derrubaria o boot por engano — que é exatamente o cenário `T-FO-03` (`high`, negação
de serviço) do modelo de ameaças deste plano. Se algum dia o build e o runtime forem separados,
esta lista precisa ser partida em duas.

**Passo 3 — módulos puros de observabilidade.** Criar `src/lib/observabilidade/sanitizacao.ts`
com `sanitizarEventoSentry` e `sanitizarBreadcrumb`, **zero imports** (nem o SDK do Sentry, nem
tipos dele — usar tipo estrutural mínimo local). Assinatura genérica
(`<T extends FormatoDeEvento>(evento: T): T`) para que a função seja atribuível ao hook do SDK
sem briga de tipo. Criar `src/lib/observabilidade/opcoes-sentry.ts` exportando
`opcoesBaseSentry` como objeto literal simples, também sem importar o SDK — é o objeto que os
três arquivos de init consomem por spread, e é a única fonte das travas anti-PII.

⚠️ **Confirmar a API antes de escrever.** A pesquisa apurou que `sendDefaultPii` está
**deprecado** e que o substituto vivo é o bloco granular `dataCollection` — mas esse ponto é
`[CITADO: doc]`, não verificado em `node_modules`. Antes de escrever o objeto, abrir
`node_modules/@sentry/core/build/types/types-hoist/options.d.ts` (ou equivalente na versão
instalada) e conferir se `dataCollection` existe e com que forma. Se existir: escrever
`sendDefaultPii: false` **e** o bloco granular (identidade de usuário desligada, corpo de
requisição vazio, cookies vazios, parâmetros de query vazios, e negação explícita dos headers
de cookie, autorização e IP encaminhado). Se **não** existir na versão instalada: manter
`sendDefaultPii: false` + sanitização, ajustar o teste de acordo e **registrar a divergência no
SUMMARY** — não inventar campo que o SDK não tem. Incluir também `tracesSampleRate: 0` (só erro
nesta etapa) e `maxBreadcrumbs: 20`.

**Passo 4 — `src/lib/observabilidade/reportar.ts`.** Exporta
`reportarExcecao(erro: unknown, contexto?: Record<string, string | number | boolean | null>): void`.
Contrato: **nunca lança** e é **no-op sem DSN** (guard antes de qualquer coisa, mesmo padrão de
`analytics/client.ts:25`). O SDK é carregado por **import dinâmico dentro da função**, com o
`.catch(() => {})` do lado. O motivo é concreto e precisa estar no comentário: import estático
puxaria `@sentry/node` + instrumentações OTel para dentro de `whatsapp-helper.test.ts` na hora
em que a tarefa 3a importar este módulo lá, e obrigaria a mexer no `vitest.config.ts`. Exportar
também `reportarFalhaSilenciosa(rotulo: string, contexto?)`, que embrulha o rótulo num `Error`
sintético — é o que a tarefa 3a usa nos pontos que hoje só devolvem `motivo`.

**Passo 5 — os quatro arquivos de init.** `src/instrumentation.ts` e
`src/instrumentation-client.ts` **em `src/`** (convenção do Next quando o projeto usa `src/`;
verificado em `node_modules/next/dist/docs/.../instrumentation.md`). Os dois
`src/sentry.*.config.ts` são import relativo comum.

`src/instrumentation.ts`: `register()` chama `validarEnvObrigatorio()` **como primeira linha**,
antes de qualquer import dinâmico de terceiro; depois `await import('./sentry.server.config')`
quando `process.env.NEXT_RUNTIME === 'nodejs'` e `await import('./sentry.edge.config')` quando
for `'edge'`. O import dinâmico não é cosmético: o SDK de Node precisa inicializar antes das
libs instrumentadas serem carregadas, e import estático no topo quebra essa ordem — escrever
isso no comentário. Exportar `onRequestError = Sentry.captureRequestError`: **é essa linha, e
só ela, que faz exceção de Server Action chegar ao Sentry**; sem ela OPE-02 é falso mesmo com o
SDK instalado. Comentar também que erro dentro de `onRequestError` é engolido pelo Next, então
esse hook não serve como caminho de fail-fast.

Os três arquivos de init seguem o mesmo esqueleto: ler `process.env.NEXT_PUBLIC_SENTRY_DSN` e
**só chamar `Sentry.init` se houver DSN** (a doc é explícita que `enabled: false` não evita todo
o overhead — não chamar init é o desligamento de verdade, e é o mesmo padrão de guard que
`analytics/client.ts` já usa). Espalhar `opcoesBaseSentry`, passar `environment: process.env.NODE_ENV`
e ligar `beforeSend`/`beforeBreadcrumb` às funções puras.

Exclusivo do `instrumentation-client.ts`: passar `integrations` com a integração de breadcrumbs
configurada com `dom: false` e `console: false` (mantendo fetch, history, xhr e sentry). `dom`
desligado é cinto e suspensório — a doc afirma que o breadcrumb de DOM captura id/classe do
elemento, não o valor do input, e a pesquisa registrou honestamente que não achou fonte de
vazamento; `console: false` é a trava real, porque os `console.error` do projeto carregam
contexto de negócio. Escrever no comentário deste arquivo que Session Replay **não é
instalado** — a integração de replay do SDK não é importada nem adicionada em `integrations`,
de modo que não existe toggle de painel capaz de ligá-la (mesma regra que `analytics/client.ts:35`
já aplica ao PostHog). Escrever também que o corpo da requisição **não** vaza por padrão (o SDK
só manda o tamanho inferido do `content-length`), para que a próxima sessão não trate a
sanitização como barreira única.

⚠️ Ao escrever esse comentário, **não citar o nome do identificador da integração de replay nem
o nome da propriedade de canvas do SDK**. A verificação automatizada desta tarefa é um grep
negativo, sem distinção entre maiúsculas e minúsculas, sobre `src/` inteiro — escrever o
identificador dentro de um comentário faz o próprio comentário reprovar a tarefa. Descreva o
recurso pelo conceito ("Session Replay", "a integração de replay do SDK"), nunca pelo símbolo.

Não passar `disableLogger`, `automaticVercelMonitors` nem opções de `webpack`: são no-op sob
Turbopack e emitem aviso de deprecação. Não configurar `tunnelRoute` nem source maps.

**Passo 6 — `next.config.ts`.** Embrulhar a exportação com `withSentryConfig(nextConfig, { org, project, silent: !process.env.CI })`, mantendo o objeto `nextConfig` existente
intocado. `org`/`project` ficam com o slug real depois do Gate 1; até lá, usar
`process.env.SENTRY_ORG` / `process.env.SENTRY_PROJECT` com fallback vazio e comentar que sem
upload de source map esses campos não afetam o build. A pesquisa marcou como suposição não
verificada (A3) que o wrapper preserva `images.remotePatterns` e
`experimental.serverActions.bodySizeLimit` — a verificação automatizada abaixo transforma isso
em fato ou em falha detectada agora.
  </action>
  <verify>
    <automated>pnpm exec vitest run src/lib/__tests__/opcoes-sentry.test.ts src/lib/__tests__/env.test.ts</automated>
    <automated>pnpm tsc --noEmit</automated>
    <automated>grep -q 'onRequestError' src/instrumentation.ts && grep -q 'validarEnvObrigatorio' src/instrumentation.ts && test -f src/instrumentation-client.ts && test -f src/sentry.server.config.ts && test -f src/sentry.edge.config.ts</automated>
    <automated>! grep -rqiE 'replayintegration|replayCanvas|Sentry\.Replay' src</automated>
    <automated>grep -q 'dom: false' src/instrumentation-client.ts && grep -q 'console: false' src/instrumentation-client.ts</automated>
    <automated>pnpm build && node -e "const c=require('./.next/required-server-files.json').config; const s=JSON.stringify(c); if(!s.includes('imagens-perfis')) throw new Error('withSentryConfig perdeu images.remotePatterns'); if(!s.includes('6mb')) throw new Error('withSentryConfig perdeu serverActions.bodySizeLimit'); console.log('next.config preservado: images e serverActions intactos')"</automated>
  </verify>
  <done>
`pnpm build` passa; a conferência do config resolvido prova que `images.remotePatterns` e
`bodySizeLimit: '6mb'` sobreviveram ao `withSentryConfig` (suposição A3 da pesquisa virou fato);
os testes puros de `opcoesBaseSentry`, `sanitizarEventoSentry`, `sanitizarBreadcrumb` e
`validarEnvObrigatorio` passam sem nenhuma variável nova no `vitest.config.ts`; `onRequestError`
está exportado; a integração de Session Replay não aparece em `src/`; e o First Load JS de
`/book/[slug]` antes e depois está anotado para o SUMMARY.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Tarefa 3a: Wrapper do Resend e instrumentação das falhas silenciosas</name>
  <files>src/lib/email/classificar.ts, src/lib/email/remetente.ts, src/lib/email/enviar.ts, src/lib/__tests__/email-classificar.test.ts, src/lib/__tests__/email-remetente.test.ts, src/lib/__tests__/email-enviar.test.ts, src/lib/whatsapp-helper.ts, src/lib/notificacoes-agendamento.ts, src/app/api/webhooks/lembrete/route.ts, src/app/actions/public-booking.ts</files>
  <behavior>
Comportamento a fixar em teste antes da implementação.

`classificarErroResend(nome)` — a tabela veio da união fechada de 21 literais do SDK
(`RESEND_ERROR_CODE_KEY`), então o mapeamento é exaustivo e conferível pelo compilador:
- `validation_error`, `invalid_from_address`, `security_error`, `invalid_idempotent_request`, `concurrent_idempotent_requests` → `rejeitado`
- `missing_required_field`, `invalid_parameter`, `invalid_attachment`, `invalid_idempotency_key`, `missing_api_key`, `invalid_api_key`, `restricted_api_key`, `not_found`, `method_not_allowed` → `config_ausente`
- `daily_quota_exceeded`, `monthly_quota_exceeded`, `rate_limit_exceeded`, `application_error`, `internal_server_error` → `falha_transporte`
- nome desconhecido (SDK novo) → `falha_transporte`, **nunca** o lado silencioso: se o vocabulário mudar, o erro tem que aparecer, não sumir

`montarRemetente(nomeEstabelecimento)` — o nome vem do banco e é input de usuário; `<`, `>`,
`"` e caracteres de controle quebram o header (propriedade do RFC 5322, não do Resend):
- nome limpo produz `Nome via VamoAgendar <naoresponda@mail.vamoagendar.com.br>`
- nome com sinais de maior/menor e aspas produz header sem esses caracteres
- nome com quebra de linha produz header numa linha só
- nome vazio ou só espaço cai no rótulo genérico de estabelecimento, nunca em header malformado

`enviarEmail(params)` — nunca lança, em nenhum caminho (mockar o módulo `resend` com `vi.mock`):
- sem chave de API → `{ ok: false, motivo: 'desativado' }`, sem construir o client e sem registrar erro
- SDK devolvendo sucesso → `{ ok: true, id }`
- SDK devolvendo erro de validação → `{ ok: false, motivo: 'rejeitado' }`
- SDK devolvendo cota diária estourada → `{ ok: false, motivo: 'falha_transporte' }`
- SDK **lançando** → `{ ok: false, motivo: 'falha_transporte' }`, sem propagar a exceção
- em nenhum caso o texto da mensagem de erro do Resend aparece no valor de retorno
  </behavior>
  <action>
**Passo 1 — instalar e conferir procedência.** `pnpm add resend`, seguido de
`pnpm view resend repository.url dist-tags.latest` confirmando `resend/resend-node`.

**Passo 2 — `src/lib/email/classificar.ts` e `src/lib/email/remetente.ts`.** Funções puras,
zero imports de runtime (tipo do SDK pode ser importado como `import type`). `remetente.ts`
exporta também a constante do endereço remetente `naoresponda@mail.vamoagendar.com.br` — é
constante de produto, **não** variável de ambiente: uma variável a menos para faltar em
produção e derrubar o boot. O sufixo do nome de exibição é ` via VamoAgendar` (EML-04).

**Passo 3 — `src/lib/email/enviar.ts` (D-04).** Exporta os tipos `MotivoFalhaEmail`
(`'desativado' | 'config_ausente' | 'rejeitado' | 'falha_transporte'`) e `ResultadoEmail`
(`{ ok: true; id: string } | { ok: false; motivo: MotivoFalhaEmail }`), e a função
`enviarEmail`. Parâmetros: nome do estabelecimento, destinatário, `replyTo` (e-mail do
profissional, EML-04), assunto, html, e `idempotencyKey` **opcional** repassado ao segundo
argumento do `send` — a Phase 4 é quem define quais e-mails existem e portanto quais chaves,
mas o parâmetro entra agora porque acrescentá-lo depois mudaria assinatura pública.

Quatro invariantes que precisam estar no código, não só na cabeça:
- ⚠️ **Construir o client DENTRO do guard de `desativado`.** `new Resend(undefined)` **lança**
  (verificado em `dist/index.mjs:1203`); instanciar no topo do módulo derrubaria o import
  inteiro em dev sem credencial — exatamente o oposto do EML-05. Comentar isso no código.
- `motivo` é vocabulário **nosso**: nenhuma frase interna do Resend atravessa a fronteira. Ao
  Sentry vai só o identificador de erro (enum fechado) e o código HTTP, nunca a mensagem.
- `falha_transporte` e `config_ausente` chamam `reportarExcecao` (D-05); `desativado` é
  silencioso — é o estado esperado em dev. `rejeitado` não vai ao Sentry: é dado ruim de
  entrada, não defeito nosso.
- O `catch` externo existe para **garantir o contrato** "nunca lança", não porque seja caminho
  esperado — o SDK documentadamente devolve `{ data, error }` até em falha de rede. Comentar,
  senão a próxima sessão apaga o catch achando que é morto.

Escrever também, em comentário, dois achados da pesquisa que a Phase 4 vai precisar e que se
perdem se não ficarem aqui: `rejeitado` cobre rejeição **síncrona**, não bounce (bounce é
assíncrono, depois do 202); e o Resend **já mantém lista de supressão própria** com API de
primeira classe, o que provavelmente dispensa tabela nossa para EML-06.

**Passo 4 — instrumentar a lista fechada de falhas silenciosas** (ver `<decisoes_do_planner>`
seção 1 para o porquê de cada ponto). Em todos, `reportarExcecao`/`reportarFalhaSilenciosa`
entra **ao lado** do `console.error` existente, nunca no lugar dele, e nunca muda o fluxo:

- `src/lib/whatsapp-helper.ts`: no retorno `qstash_sem_token` de `agendarLembreteQStash` (é o
  "lembrete com env faltando" nomeado em `ROADMAP.md:390`); e nos retornos de falha de
  transporte de `enviarMensagemWhatsApp` (código HTTP e erro de rede). Passar como contexto
  apenas o rótulo do motivo e o código HTTP — **jamais** telefone, nome ou texto da mensagem.
- `src/lib/notificacoes-agendamento.ts`: no `catch` de topo.
- `src/app/api/webhooks/lembrete/route.ts`: no `catch` de topo.
- `src/app/actions/public-booking.ts`: nos três pontos onde a causa raiz do Supabase é apagada
  pela mensagem amigável (busca de cliente, cadastro de cliente, criação do agendamento).
  Reportar a causa raiz **antes** do `throw` amigável, e sem incluir nenhum dado do cliente
  final no contexto.

Não instrumentar condição esperada — WhatsApp desconectado, plano sem WhatsApp e agendamento
cancelado continuam sendo apenas `registrarDisparo` + evento de analytics (D-05). Ruído de
Sentry é como OPE-02 volta a ser falso seis semanas depois.
  </action>
  <verify>
    <automated>pnpm exec vitest run src/lib/__tests__/email-classificar.test.ts src/lib/__tests__/email-remetente.test.ts src/lib/__tests__/email-enviar.test.ts</automated>
    <automated>pnpm tsc --noEmit</automated>
    <automated>grep -q 'reportarExcecao\|reportarFalhaSilenciosa' src/lib/whatsapp-helper.ts && grep -q 'reportarExcecao\|reportarFalhaSilenciosa' src/lib/notificacoes-agendamento.ts && grep -q 'reportarExcecao\|reportarFalhaSilenciosa' src/app/api/webhooks/lembrete/route.ts && grep -q 'reportarExcecao\|reportarFalhaSilenciosa' src/app/actions/public-booking.ts</automated>
    <automated>pnpm test</automated>
  </verify>
  <done>
O wrapper devolve `desativado` sem chave (sem construir o client), classifica os erros do SDK
pela tabela verificada e não lança em nenhum dos cinco caminhos testados, inclusive quando o SDK
lança; nenhuma string interna do Resend aparece no valor de retorno; os quatro arquivos da lista
fechada reportam ao Sentry sem alterar o fluxo nem carregar PII; condição esperada continua fora
do Sentry; e a suíte inteira (`pnpm test`) segue verde sem nenhuma variável nova no
`vitest.config.ts`.
  </done>
</task>

<task type="auto">
  <name>Tarefa 3b: Smoke test, documentação, bloco de env e Definition of Done</name>
  <files>scripts/smoke-fundacao.mjs, docs/08-ANALYTICS_E_FUNIL.md, docs/01-ARQUITETURA_E_STACK.md, docs/PENDENCIAS.md, CLAUDE.md, .planning/quick/260721-jif-fundacao-operacional-sentry-posthog-e-re/260721-jif-ENV-BLOCO.md</files>
  <action>
Tarefa separada da 3a de propósito: é o fim do orçamento de contexto, e o que degrada primeiro
quando o contexto aperta é justamente documentação e o `pnpm lint && pnpm test && pnpm build`
com saída real — que é o item 1 do Definition of Done do projeto. Isolar protege os dois.

**Passo 1 — `scripts/smoke-fundacao.mjs`.** ESM puro, no mesmo espírito de
`scripts/mock-evolution.mjs` que já existe. É o que o owner roda no **Gate 2** — o
executor nunca o roda com credencial. Requisitos: recebe o destinatário como argumento
(**sem argumento não envia nada**, só imprime o uso); lê `RESEND_API_KEY` e
`NEXT_PUBLIC_SENTRY_DSN` de `process.env`; envia um e-mail de teste com o remetente e o formato
de nome reais e `replyTo` no próprio destinatário; captura uma exceção sintética no Sentry e
aguarda o flush; imprime uma linha por produto (`resend: ok id=…` / `resend: falha motivo=…` /
`resend: desativado`, e o análogo para o Sentry); **nunca lança e sai sempre com código 0**.

Para o Sentry, tentar `@sentry/nextjs` e, se o import falhar fora do runtime do Next, cair para
`@sentry/node`; falhando os dois, imprimir a instrução alternativa (verificar pelo produto) em
vez de estourar. Registrar no cabeçalho do script, em pt-BR, que ele exercita **credenciais,
DNS e entrega** — e não a lógica do wrapper, que é coberta por teste unitário — para ninguém
confundir os dois níveis de garantia.

**Passo 2 — documentação (Definition of Done, item 6).**
- `docs/08-ANALYTICS_E_FUNIL.md`: na tabela de variáveis, `NEXT_PUBLIC_POSTHOG_KEY` e
  `ANALYTICS_TENANT_SALT` passam de "Obrigatória: não" para **"não em dev / sim em produção
  (validado no boot por `src/lib/env.ts`)"**. Isto é **mudança de contrato declarada**, não
  efeito colateral: o salt era opcional por design e o próprio doc já pedia configurá-lo em
  produção; a partir daqui a ausência derruba o boot em vez de degradar em silêncio. Repetir no
  doc o aviso que já está lá — trocar o salt depois desconecta os `distinct_id` históricos. O
  no-op em dev continua exatamente como está.
- `docs/01-ARQUITETURA_E_STACK.md` e `CLAUDE.md`: acrescentar Sentry (`@sentry/nextjs`, error
  tracking) e Resend (`resend`, SDK) à lista de stack oficial, uma linha cada, no formato das
  entradas existentes. Sem isso os documentos de stack passam a mentir por omissão.
- `docs/PENDENCIAS.md`, na seção "Demais preparações de lançamento": acrescentar os diferidos
  desta etapa, **cada um com gatilho**: (a) `tunnelRoute` do Sentry — gatilho: constatar perda
  relevante de evento de client por ad blocker; exige adicionar a rota ao matcher de
  `src/proxy.ts` e teste manual com ad blocker ligado; (b) source maps do Sentry — gatilho:
  primeiro erro de client cujo stack minificado não permitir diagnóstico; custa
  `SENTRY_AUTH_TOKEN` no ambiente de build; (c) instrumentação da causa raiz nos demais
  `throw new Error` das actions B2B — gatilho: cada fase que tocar a action; (d) fila do Asaas
  pausada como modo de falha silencioso — não tem código hoje, é Phase 9; (e) **Cache
  Components + Sentry têm issue aberta** — não se aplica hoje porque `cacheComponents` é opt-in
  e não está ligado, mas ligar depois exige revisitar o Sentry.

**Passo 3 — bloco do `.env.example`, entregue como artefato versionado.**

⚠️ **Não tentar ler, editar nem grepar `.env.example`.** A permissão está negada nesta sessão
para `Read` e para `Bash` (ver `<restricoes_de_execucao>` item 2). Tentar produz um prompt de
permissão inútil no meio da execução e não muda o resultado. Quem edita o arquivo é o owner.

Em vez disso, **escrever o bloco exato** em
`.planning/quick/260721-jif-fundacao-operacional-sentry-posthog-e-re/260721-jif-ENV-BLOCO.md`.
Assim o entregável existe em arquivo versionado, sobrevive ao fim da conversa e o owner tem o
que colar sem depender de rolar o chat.

Conteúdo do artefato: uma instrução curta de uma linha ("colar no fim do `.env.example`, sem
duplicar o que já estiver lá; nunca preencher valor real neste arquivo") e, em bloco de código,
os nomes exatos com valor vazio e um comentário de uma linha cada:

- `NEXT_PUBLIC_SENTRY_DSN` — sem DSN o SDK não inicializa (no-op explícito, não erro)
- `RESEND_API_KEY` — sem a chave o envio é no-op silencioso (EML-05)
- `NEXT_PUBLIC_POSTHOG_KEY` — só se ainda não constar do arquivo
- `NEXT_PUBLIC_POSTHOG_HOST` — só se ainda não constar; obrigatória **apenas** na região EU
- `ANALYTICS_TENANT_SALT` — só se ainda não constar; passa a ser obrigatória em produção

Como o executor não pode conferir o que já existe no `.env.example`, o artefato precisa marcar
as três últimas como "cole apenas se ainda não estiver lá" — a decisão de duplicar ou não é do
owner, que enxerga o arquivo.

`DEBUG_QSTASH` continua diferido e **não é mencionado no bloco** (ver `<decisoes_do_planner>`
seção 3).

⚠️ **Este passo não fecha o bloco F sozinho.** O `<automated>` abaixo só prova que o artefato
existe e está completo; o requisito só está satisfeito quando o **owner confirmar no Gate 1**
que colou as variáveis no `.env.example`. Está registrado assim em `<verification>` de
propósito, para a tarefa não fechar verde com o arquivo real intocado.

**Passo 4 — Definition of Done do projeto.** Rodar `pnpm lint`, `pnpm test` e `pnpm build` e
**colar a saída real** — nunca afirmar que passou sem evidência. Depois, commit em pt-BR sem push.
  </action>
  <verify>
    <automated>node scripts/smoke-fundacao.mjs 2>&1 | grep -q 'resend: desativado' && node scripts/smoke-fundacao.mjs 2>&1 | grep -qE 'sentry: (desativado|indisponivel)' && echo 'smoke sem credencial: no-op provado pela saida, nao so pelo exit code'</automated>
    <automated>test -f .planning/quick/260721-jif-fundacao-operacional-sentry-posthog-e-re/260721-jif-ENV-BLOCO.md && grep -q 'RESEND_API_KEY' .planning/quick/260721-jif-fundacao-operacional-sentry-posthog-e-re/260721-jif-ENV-BLOCO.md && grep -q 'NEXT_PUBLIC_SENTRY_DSN' .planning/quick/260721-jif-fundacao-operacional-sentry-posthog-e-re/260721-jif-ENV-BLOCO.md && ! grep -q 'DEBUG_QSTASH' .planning/quick/260721-jif-fundacao-operacional-sentry-posthog-e-re/260721-jif-ENV-BLOCO.md</automated>
    <automated>grep -q 'sentry' docs/01-ARQUITETURA_E_STACK.md -i && grep -q 'resend' docs/01-ARQUITETURA_E_STACK.md -i && grep -q 'env.ts' docs/08-ANALYTICS_E_FUNIL.md</automated>
    <!-- `resend` em docs/01 já retorna 1 hoje (consta como fornecedor) — a metade que prova
         trabalho novo é `sentry`, hoje 0. Os dois greps abaixo fecham os arquivos que não
         tinham verificação nenhuma e ambos falham hoje. -->
    <automated>grep -qi 'sentry' CLAUDE.md && grep -qi 'tunnelRoute' docs/PENDENCIAS.md</automated>
    <automated>pnpm lint && pnpm test && pnpm build</automated>
  </verify>
  <done>
`pnpm lint`, `pnpm test` e `pnpm build` passam com a **saída real colada na conversa** — não
afirmada; `scripts/smoke-fundacao.mjs` sem credencial imprime `resend: desativado` (o que prova
o no-op do EML-05 pela saída, e não apenas que o import não estourou) e sai com 0;
`260721-jif-ENV-BLOCO.md` existe com os nomes exatos, sem valor real e sem `DEBUG_QSTASH`;
`docs/08` declara a mudança de contrato das variáveis de analytics apontando para `src/lib/env.ts`;
a stack oficial em `docs/01` e `CLAUDE.md` menciona Sentry e Resend; e `docs/PENDENCIAS.md` lista
os cinco diferidos com gatilho.

⚠️ O bloco F **não** está fechado por esta tarefa: falta a confirmação do owner no Gate 1 de que
as variáveis foram coladas no `.env.example` real.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Gate 1: Owner cria os projetos e provisiona os secrets</name>
  <action>
PARAR e aguardar o owner. Nada aqui é automatizável: depende de conta em terceiro e de acesso
a `.env.local` e ao Railway, que o executor não tem.

Antes de parar, o executor aponta o owner para o artefato
`260721-jif-ENV-BLOCO.md` (escrito no passo 3 da tarefa 3b), que contém o bloco exato do
`.env.example`. Não prosseguir sem o sinal de retomada. **Não pedir nenhum valor de secret** —
os únicos dados que voltam pelo chat são a região do PostHog e os slugs de organização e projeto
do Sentry, que não são secretos.
  </action>
  <what-built>
Todo o código está escrito, testado e buildado sem nenhuma credencial: Sentry server+client com
PII travada no código versionado, fail-fast de env no boot, wrapper do Resend, instrumentação
das falhas silenciosas, script de smoke test, artefatos de planejamento corrigidos. Nada abaixo
depende de o owner esperar código — só de acesso que o executor não tem.
  </what-built>
  <how-to-verify>
São três blocos. Faça na ordem; o terceiro é o que evita crash-loop no próximo deploy.

**1. Criar os dois projetos (5 min)**

a) **Sentry** — criar conta/projeto em sentry.io, plataforma **Next.js**. Copiar o DSN em
   `Settings → Client Keys (DSN)`. O plano Developer é gratuito: 5.000 erros/mês, retenção de
   30 dias e **1 usuário** — o sócio não entra sem plano pago; saiba disso agora, não quando
   for compartilhar. Vale ligar o alerta de spike do próprio Sentry (grátis, por e-mail).
   Anote também o **slug da organização** e o **slug do projeto**: eles vão para `SENTRY_ORG`
   e `SENTRY_PROJECT`.

b) **PostHog Cloud** — criar projeto e copiar a *Project API Key*.
   ⚠️ **Se você escolher a região EU**, a variável `NEXT_PUBLIC_POSTHOG_HOST` passa a ser
   obrigatória com o valor `https://eu.i.posthog.com`. O código tem a região US como padrão;
   errar isso faz nenhum evento aparecer sem nenhuma mensagem de erro.

c) **Resend** — confirmar em `Domains` que `mail.vamoagendar.com.br` continua **Verified**
   (o DNS foi resolvido em `82db24e`, isto é só conferência) e criar uma API Key com permissão
   de envio.

**2. `.env.example` (arquivo versionado, sem valores) — só você consegue fazer**

O executor não tem permissão de leitura nem de escrita em `.env*` nesta sessão, então ele não
edita nem consegue conferir esse arquivo. O bloco exato está em
`.planning/quick/260721-jif-fundacao-operacional-sentry-posthog-e-re/260721-jif-ENV-BLOCO.md`.
Abra o artefato e cole o bloco no fim do `.env.example`: são os **nomes** com valor vazio, sem
nenhum valor real. Três das variáveis estão marcadas como "cole apenas se ainda não estiver lá" —
essa decisão é sua, porque só você enxerga o arquivo.

**3. Secrets no `.env.local` e no Railway — leia antes de fazer**

⚠️ **Este passo é bloqueante e tem efeito no próximo deploy.** A partir desta etapa, subir em
produção sem uma variável obrigatória **derruba o boot de propósito** (é o que OPE-02 e SEG-05
precisam). O log do Railway vai mostrar
`An error occurred while loading instrumentation hook: Variáveis obrigatórias ausentes em produção: …`
com a lista completa. Então confira as treze **antes** do próximo deploy:

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`,
`QSTASH_TOKEN`, `QSTASH_URL`, `QSTASH_CURRENT_SIGNING_KEY`, `EVOLUTION_API_URL`,
`EVOLUTION_GLOBAL_API_KEY`, `APP_URL`, `ANALYTICS_TENANT_SALT`, `NEXT_PUBLIC_POSTHOG_KEY`,
`NEXT_PUBLIC_SENTRY_DSN`, `RESEND_API_KEY`.

Três delas provavelmente **não existem** no Railway hoje e são a causa mais provável de um
crash-loop: `ANALYTICS_TENANT_SALT` (era opcional por design até agora — gere uma string
aleatória longa e **nunca a troque depois**, porque isso desconecta os `distinct_id`
históricos), `NEXT_PUBLIC_SENTRY_DSN` e `RESEND_API_KEY`.

Onde configurar: `.env.local` na sua máquina (para o smoke test) **e** as variáveis do serviço
no Railway (para produção). Se o projeto do PostHog for EU, acrescente `NEXT_PUBLIC_POSTHOG_HOST`
nos dois lugares.

Como confirmar que funcionou: no Railway, o serviço sobe e responde normalmente; no log do
deploy **não** aparece a mensagem de variáveis ausentes. Localmente, `pnpm dev` sobe sem erro
no terminal.

⚠️ **Nunca cole nenhum secret no chat.** O executor não lê `.env.local` e não precisa dos valores.
  </how-to-verify>
  <resume-signal>
Responda "configurado" confirmando explicitamente as três coisas: (a) **as variáveis do bloco
foram coladas no `.env.example`** — esta confirmação é a única forma de fechar o bloco F, porque
o executor não consegue verificar o arquivo; (b) **a região do PostHog** (US ou EU); (c) os
**slugs de organização e projeto do Sentry**, que não são secretos e vão para o `next.config.ts`.
Se algo travou, descreva o quê.
  </resume-signal>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Gate 2: Owner confirma visualmente que evento, erro e e-mail chegaram</name>
  <action>
PARAR e aguardar o owner. Antes de parar, o executor aplica no `next.config.ts` os slugs de
organização e projeto do Sentry informados no gate anterior e, se o projeto do PostHog for da
região EU, registra em `260721-jif-ENV-BLOCO.md` que `NEXT_PUBLIC_POSTHOG_HOST` passou de
opcional a obrigatória com o valor da região EU. O executor continua sem tocar em `.env*`.

O executor **não** roda o smoke test: ele exige credencial, e quem o roda é o owner, no terminal
dele, com `--env-file`. Não prosseguir sem o sinal de retomada. Se o owner reportar falha,
diagnosticar pelo `motivo` impresso antes de mexer em qualquer código.
  </action>
  <what-built>
Com as credenciais no lugar, os três produtos podem ser validados de fato. Esta é a única
verificação que prova OPE-02 e o critério 4 da etapa: nenhum comando automatizado consegue
afirmar que um evento **chegou** — o endpoint do PostHog responde `200 {"status":"Ok"}` até com
api_key inválida, e a entrega de e-mail só existe na caixa de quem recebe.
  </what-built>
  <how-to-verify>
Três verificações independentes. Se alguma falhar, me diga qual e o que apareceu.

**1. PostHog — evento real de funil**
Com `pnpm dev` rodando, abra a landing `/` numa **aba anônima**. No PostHog, menu lateral →
**Activity** (feed de eventos ao vivo). Deve aparecer `landing_viewed` em segundos, até ~1 min.
Se não aparecer em 2 minutos, é key ou host errado — quase sempre projeto criado na região EU
sem a variável de host.
⚠️ Isto **não** é o OPE-03: aquele exige evento de funil com tráfego real em produção e continua
na Phase 11. O que se prova aqui é que a tubulação está ligada.

**2 e 3. Sentry e Resend — um comando só**
No terminal, na raiz do projeto:

`node --env-file=.env.local scripts/smoke-fundacao.mjs SEU-EMAIL@exemplo.com`

Troque pelo e-mail onde você quer receber o teste. O script imprime uma linha por produto e
nunca falha ruidosamente. Depois:

- **Sentry**: abra `Issues` no projeto. Deve haver uma issue nova com a mensagem sintética do
  smoke test. Abra o evento e confira o que **não** está lá: sem endereço de IP, sem cookie, sem
  querystring, sem corpo de requisição. É a trava anti-PII sendo verificada onde ela importa.
- **Resend**: confira sua caixa de entrada. O remetente deve aparecer como
  `... via VamoAgendar` vindo de `naoresponda@mail.vamoagendar.com.br`, e **responder** deve
  endereçar o `reply-to`, não o VamoAgendar. **Anote em qual aba caiu** (Principal, Promoções ou
  Spam) — o domínio é novo e não tem histórico; essa informação é insumo direto da Phase 4.

Se o script imprimir `resend: falha motivo=config_ausente`, a chave está errada ou sem permissão
de envio. Se imprimir `motivo=rejeitado`, o problema é o domínio ou o endereço. Se imprimir
`motivo=falha_transporte`, é rede ou cota.
  </how-to-verify>
  <resume-signal>
Responda "verificado" informando as três coisas: (a) o evento apareceu no PostHog, (b) a issue
apareceu no Sentry e o evento está limpo de PII, (c) o e-mail chegou e **em qual aba**. Se
alguma falhou, descreva a mensagem exata que apareceu.
  </resume-signal>
</task>

</tasks>

<auditoria_de_cobertura>
Todo item das quatro fontes mapeado para a tarefa que o entrega. Nenhum omitido, nenhum reduzido.

| Fonte | Item | Onde é entregue |
|---|---|---|
| REQ | OPE-02 — exceção não tratada chega ao owner | T2 (`onRequestError` + init) + T3a (falhas silenciosas) + Gate 2 (prova) — COBERTO |
| REQ | EML-05 — produto funciona sem credencial de e-mail | T3a (`enviarEmail` → `desativado`) + teste unitário + T3b (saída do smoke) — COBERTO |
| REQ | OPE-03 — funil verificado com tráfego real | **Fora do escopo por D-01** — continua na Phase 11 |
| CONTEXT | D-01 mapeamento de requisitos | T1 — COBERTO |
| CONTEXT | D-02 Sentry server+client, PII desligada no código | T2 — COBERTO |
| CONTEXT | D-03 fail-fast de env no boot | T2 (`src/lib/env.ts` + `register()`) — COBERTO |
| CONTEXT | D-04 assinatura do wrapper, nunca lança | T3a — COBERTO |
| CONTEXT | D-05 falha inesperada vai ao Sentry, esperada não | T3a — COBERTO |
| ESCOPO A | Seção da etapa no ROADMAP, `Depends on` da Phase 1, sem renumerar | T1 (verificação escopada ao bloco da Phase 1) — COBERTO |
| ESCOPO A | OPE-02/EML-05 remapeados nas duas tabelas, contagens, 56 imutável | T1 (soma conferida por `awk`) — COBERTO |
| ESCOPO A | Prosa do ROADMAP coerente com as tabelas ("uma fase" → "um destino"; EML em quatro destinos) | T1 edição A7 — COBERTO |
| ESCOPO A | Artefatos da Phase 1 preservados | T1 (verificação por `git status`) — COBERTO |
| ESCOPO B | `@sentry/nextjs` via pnpm, sem wizard | T2 passo 1 — COBERTO |
| ESCOPO B | `instrumentation.ts` + `instrumentation-client.ts` + `onRequestError` | T2 passo 5 — COBERTO |
| ESCOPO B | No-op explícito sem DSN | T2 passo 5 (guard antes do init) — COBERTO |
| ESCOPO B | `dataCollection`, sem Session Replay, breadcrumbs desligados, `beforeSend`/`beforeBreadcrumb` | T2 passos 3 e 5 + teste + grep — COBERTO |
| ESCOPO B | Sanitizador e classificador puros, sem importar Sentry | T2 passo 3, T3a passo 2 — COBERTO |
| ESCOPO B | Achado #4: alcance da instrumentação, decidido e justificado | `<decisoes_do_planner>` seção 1 + T3a passo 4 — COBERTO |
| ESCOPO B | Sem source maps, sem `tunnelRoute` | `<decisoes_do_planner>` seção 2 + `docs/PENDENCIAS.md` — COBERTO |
| ESCOPO B | `withSentryConfig` não quebra `images`/`bodySizeLimit` | T2 passo 6 + verificação do config resolvido — COBERTO |
| ESCOPO C | `src/lib/env.ts` em TS puro, gatilho do zod registrado | T2 passo 2 — COBERTO |
| ESCOPO C | Disparado pelo `instrumentation.ts`, derruba produção nomeando as variáveis | T2 passos 2 e 5 — COBERTO |
| ESCOPO C | Build local sem secrets segue funcionando (sem guard extra) | T2 (verificado por `pnpm build`) — COBERTO |
| ESCOPO C | Phase 1/SEG-05 acrescenta as chaves do QStash à mesma lista | T2 passo 2, comentário (b) — COBERTO |
| ESCOPO C | `NEXT_PUBLIC_*` em runtime: acesso dinâmico e pressuposto do Railway | T2 passo 2, comentário (e) + caso de teste no `<behavior>` — COBERTO |
| ESCOPO D | `resend` via pnpm | T3a passo 1 — COBERTO |
| ESCOPO D | Achado #1: client construído dentro do guard | T3a passo 3 + teste — COBERTO |
| ESCOPO D | União discriminada exata, nunca lança | T3a passo 3 + testes — COBERTO |
| ESCOPO D | Nenhuma string interna do Resend atravessa; `falha_transporte` ao Sentry | T3a passo 3 — COBERTO |
| ESCOPO D | Remetente, nome de exibição e `reply-to`, sem template de e-mail | T3a passo 2 — COBERTO |
| ESCOPO D | Testes do wrapper e do classificador | T3a `<behavior>` — COBERTO |
| ESCOPO E | PostHog não é reescrito | Nenhuma tarefa toca `src/lib/analytics/` — COBERTO por omissão deliberada |
| ESCOPO E | Impeditivos de evento real + entrada na lista de obrigatórias | T2 passo 2 (`ANALYTICS_TENANT_SALT`, `NEXT_PUBLIC_POSTHOG_KEY`) + T3b passo 2 (`docs/08`) + Gate 2 — COBERTO |
| ESCOPO E | OPE-03 não é entregue aqui | Respeitado — segue na Phase 11 |
| ESCOPO F | `.env.example` com nomes exatos, sem valores | T3b passo 3 (artefato `260721-jif-ENV-BLOCO.md`, verificado por `test -f` + grep) + **confirmação do owner no Gate 1**, que é o que fecha o item — o executor não tem permissão em `.env*` — COBERTO |
| ESCOPO F | Decidir sobre `DEBUG_QSTASH` | `<decisoes_do_planner>` seção 3: **continua diferido, intocado** (grep negativo no artefato garante que não vaza para o bloco) — DECIDIDO |
| GATES | Projetos Sentry/PostHog; secrets; validação visual; smoke de e-mail | Gate 1 e Gate 2 — COBERTO |
| RESEARCH | A3 (`withSentryConfig` preserva config) vira fato ou falha detectada | T2 verificação do config resolvido — COBERTO |
| RESEARCH | A2 (custo de bundle) medido em vez de assumido | T2 passo 0 + `done` — COBERTO |
| RESEARCH | Achados de bounce/supressão do Resend, insumo da Phase 4 | T3a passo 3, comentário — COBERTO |
| RESEARCH | Cache Components + Sentry (não aplicável hoje) | T3b passo 2, `docs/PENDENCIAS.md` item (e) — COBERTO |
</auditoria_de_cobertura>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| aplicação → Sentry (terceiro) | Evento de erro sai do processo carregando o que o SDK coletou; o `/book/[slug]` é onde o cliente final digita nome e telefone |
| aplicação → Resend (terceiro) | Endereço e conteúdo de e-mail saem do processo; a resposta do fornecedor volta com texto que não pode chegar à UI |
| ambiente → boot da aplicação | Variáveis de ambiente decidem se o processo sobe; a lista de obrigatórias passa a ter poder de derrubar produção |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-FO-01 | Information Disclosure | evento do Sentry vindo do client em `/book/[slug]` | critical | mitigate | `opcoesBaseSentry` como fonte única (identidade, querystring e cookies negados), `sanitizarEventoSentry` cortando querystring/corpo/cookie/usuário, breadcrumbs de DOM e console desligados, Session Replay nunca importado; travas asseguradas por teste unitário sobre o objeto versionado + grep negativo no CI local |
| T-FO-02 | Information Disclosure | mensagem interna do Resend chegando a log ou UI | medium | mitigate | wrapper devolve só `motivo` de vocabulário fechado; ao Sentry vai apenas o identificador de erro (enum) e o código HTTP; o SDK só imprime erro fora de produção |
| T-FO-03 | Denial of Service | fail-fast de env derrubando produção por lista errada ou variável não provisionada | high | mitigate | lista contém apenas variáveis já consumidas pelo código hoje; Clerk fica fora porque falha alto e imediato; mensagem lista todos os ausentes de uma vez; Gate 1 (bloqueante) exige conferir as treze no Railway ANTES do próximo deploy, com as três novas nomeadas explicitamente |
| T-FO-04 | Information Disclosure | secret vazando para o chat, para o repositório ou para o transcript | high | mitigate | executor não lê nem escreve `.env*`; `.env.example` é editado pelo owner e só com nomes; smoke test rodado pelo owner com `--env-file`; proibição explícita de pedir secret no chat em `<restricoes_de_execucao>` |
| T-FO-05 | Elevation of Privilege | DSN do Sentry exposto no bundle do browser | low | accept | DSN é público por design (só autoriza ingestão no projeto); o abuso possível é envio de evento falso, contido pela cota e pelo alerta de spike; alternativa (`tunnelRoute`) traz risco maior ao colidir com o matcher de `src/proxy.ts` |
| T-FO-06 | Repudiation | falha inesperada seguindo silenciosa e o owner acreditando que o sistema está de pé | high | mitigate | instrumentação da lista fechada de pontos de falha silenciosa (T3a passo 4); condição esperada deliberadamente fora, para que o sinal não vire ruído e o owner não pare de olhar |
| T-FO-SC | Tampering | instalação de `@sentry/nextjs` e `resend` pelo gerenciador de pacotes | high | mitigate | pesquisa verificou ambos por `npm view` e leitura do código real em `node_modules`/tarball; T2 e T3a conferem `repository.url` e `dist-tags.latest` antes de escrever código, e divergência interrompe a tarefa; `pnpm-lock.yaml` versionado fixa a resolução |
</threat_model>

<verification>
Ao final das seis tarefas, tudo abaixo precisa ser verdade:

1. `pnpm lint`, `pnpm test` e `pnpm build` passam, com a saída real colada na conversa
2. O config resolvido do build contém `imagens-perfis` e `6mb` — `withSentryConfig` não comeu nada
3. Nenhuma variável nova no `vitest.config.ts` (a suíte existente continua verde sem ajuste)
4. Os quatro artefatos da Phase 1 aparecem sem modificação no `git status`
5. As 12 fases continuam numeradas 1 a 12 e a soma da coluna Qtd do REQUIREMENTS dá 56, conferida
   por `awk` — e o `Depends on` verificado é o **do bloco da Phase 1**, não a referência que a
   Phase 4 já tinha antes desta task
6. O owner viu o evento no PostHog, a issue no Sentry (sem PII no payload) e o e-mail na caixa

7. **Confirmação do owner — único item que nenhum comando pode verificar:** o bloco F
   (variáveis novas no `.env.example`) **só está satisfeito quando o owner confirmar, no
   Gate 1, que colou as variáveis no arquivo**. O executor não tem permissão de leitura nem de
   escrita em `.env*` nesta sessão (verificado: `Read` e `Bash` negados), então nenhum
   `<automated>` deste plano toca o arquivo real. O que é automatizável — e está automatizado na
   tarefa 3b — é a existência e a completude do artefato intermediário
   `260721-jif-ENV-BLOCO.md`. **Encerrar a etapa sem essa confirmação explícita deixa o bloco F
   entregue pela metade**, com o plano marcado verde.
</verification>

<success_criteria>
- A etapa preparatória deixou de ser referência órfã: tem seção própria, requisitos atribuídos e critérios de aceite, e a Phase 1 depende dela explicitamente
- OPE-02 é verdadeiro e demonstrável: exceção não tratada e falha silenciosa chegam ao Sentry do owner
- EML-05 é verdadeiro e coberto por teste: sem chave, o envio devolve `desativado` e nada quebra
- A trava anti-PII vive no código versionado e é asserção de teste, não configuração de painel
- Produção não sobe com configuração faltando, e o build local sem secrets continua passando
- Nenhum secret passou pelo chat, pelo repositório ou pelas mãos do executor
</success_criteria>

<output>
Ao concluir, criar `.planning/quick/260721-jif-fundacao-operacional-sentry-posthog-e-re/260721-jif-SUMMARY.md`
registrando: o First Load JS de `/book/[slug]` antes e depois do Sentry; se `dataCollection`
existe na versão instalada do SDK (e o que foi feito se não existir); a região do PostHog e os
slugs do Sentry informados pelo owner; a aba em que o e-mail de teste caiu (insumo da Phase 4);
e a lista fechada de pontos instrumentados, para que as fases seguintes saibam o que já está
coberto e o que continua herdado.

Registrar também, como linha própria: **se o owner confirmou ter colado o bloco de
`260721-jif-ENV-BLOCO.md` no `.env.example`** (item (a) do Gate 1). É o único elo do escopo F
que nenhum comando alcança — o executor não pode ler o arquivo. A Phase 1 (SEG-05) vai
estender essa mesma lista de variáveis obrigatórias e precisa saber se o `.env.example` está
em dia sem ter que perguntar de novo.
</output>
