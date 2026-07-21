---
quick_id: 260721-jif
status: ready-for-planning
gathered: 2026-07-21
---

# Quick Task 260721-jif: Fundação operacional — Sentry, PostHog e Resend — Context

**Gathered:** 2026-07-21
**Status:** Ready for planning

<domain>
## Task Boundary

Escrever e executar a **etapa preparatória "Fundação operacional"** — hoje referenciada
em `.planning/ROADMAP.md:193` (o `Depends on` da Phase 4, introduzido pelo commit
`82db24e`) e **nunca definida em lugar nenhum**: não há seção, requisitos atribuídos nem
critérios de aceite.

Ela entrega a fundação de observabilidade e de e-mail que as fases seguintes assumem já
existir:

1. **Sentry** — error tracking, hoje inexistente (`@sentry/nextjs` não está no
   `package.json`, não há `instrumentation.ts`)
2. **PostHog** — o código já existe e está correto (`src/lib/analytics/{client,server,tenant}.ts`);
   falta projeto criado, chaves nos ambientes e a verificação de que evento chega
3. **Resend** — SDK não instalado; falta o wrapper de envio que as Phases 4, 5 e 9 vão
   consumir, mais o remetente já verificado no DNS

**Fora do escopo:** qualquer conteúdo de e-mail (templates de boas-vindas, recibo,
confirmação — Phases 4, 5 e 9), o painel de saúde do owner (OPE-01, Phase 11), a
verificação de funil com tráfego real (OPE-03, Phase 11) e todo o hardening da Phase 1.

**Pré-requisito obrigatório da Phase 1** — registrado manualmente no `ROADMAP.md` porque
o workflow `/gsd-quick` não toca o roadmap.

</domain>

<invariants>
## Invariantes — não podem ser violados por esta etapa

Herdados do milestone e do pedido do owner. Qualquer plano que os contrarie está errado,
não criativo.

- **Fricção Zero é inegociável.** Nada aqui pode adicionar fricção visível ao cliente
  final no `/book/[slug]` — sem CAPTCHA, sem login, sem OTP, sem bloqueio de render.
- **Nunca PII.** Nome, telefone e e-mail do cliente final não podem chegar a Sentry nem
  a PostHog, por nenhum caminho — nem em breadcrumb, nem em querystring, nem em corpo de
  Server Action. `src/lib/analytics/client.ts` já trava isso no código (não no painel):
  `disable_session_recording: true`, `autocapture: false`, `person_profiles: 'identified_only'`.
  O Sentry precisa da trava equivalente.
- **Falha de observabilidade nunca quebra o produto.** O padrão vigente do PostHog
  (`server.ts`, `client.ts`: no-op sem key, `try/catch` em tudo, nenhum caminho lança) é
  o contrato a replicar — não a reinventar.
- **Artefatos preservados integralmente:** `.planning/phases/01-.../01-CONTEXT.md`,
  `01-UI-SPEC.md`, `01-RESEARCH.md`, `01-DISCUSSION-LOG.md` e os commits `06965ac`,
  `d23f200`, `82db24e`. Nada de reescrever, renumerar ou "atualizar de passagem".
- **Numeração das fases congelada.** Esta etapa é preparatória e **não recebe número de
  fase** — as 12 fases continuam 1 a 12.
- **Stack banida continua banida:** Prisma/Drizzle, better-auth, Mercado Pago.
- **pnpm sempre.** Nenhuma dependência entra por `npm`/`yarn`.

</invariants>

<decisions>
## Implementation Decisions

### 1. Mapeamento de requisitos

**Decisão:** mover **OPE-02** e **EML-05** para a etapa preparatória; **OPE-03 fica na
Phase 11**.

- `OPE-02` (exceções não tratadas chegam ao owner sem depender de alguém reclamar) passa
  a ser entregue e verificável aqui, porque é exatamente o que o Sentry faz.
- `EML-05` (o produto funciona normalmente sem credencial de e-mail — no-op silencioso)
  é propriedade do wrapper, e o wrapper nasce aqui.
- `OPE-03` (métricas de funil chegando em produção, **verificadas com evento real**)
  **não** vem junto: o critério exige tráfego real em produção. Movê-lo para cá criaria
  um critério de aceite que não dá para provar hoje.

Consequência a aplicar no `REQUIREMENTS.md`: a tabela requisito→fase passa a apontar
OPE-02 e EML-05 para a etapa preparatória; Phase 4 vai de 4 para 3 requisitos e Phase 11
de 5 para 4. A contagem total de 56 requisitos v1 **não muda** — nenhum requisito é
criado ou removido.

### 2. Superfície do Sentry

**Decisão do owner (contrariando a recomendação inicial de server-only):** **server +
client com PII desligada**, cobrindo **também** o `/book/[slug]`.

**Razão dada:** o booking público é a superfície crítica de conversão; server-only
deixaria invisíveis erros de JavaScript, hidratação, navegação e incompatibilidade de
navegador — exatamente as falhas que fazem um agendamento real não acontecer, que é o
critério de sucesso do milestone.

**O que essa escolha torna obrigatório no plano** (não é opcional, é a condição que
mantém o invariante "nunca PII" de pé):

- `sendDefaultPii: false` explícito
- Session Replay **não instalado** — não basta desligar no painel
- `autocapture`/breadcrumbs de input desligados no código
- um `beforeSend` que remove valor de campo de formulário, querystring e corpo de Server
  Action antes do evento sair
- a trava vive no código versionado, nunca em toggle de painel — mesma regra que
  `client.ts:36` já aplica ao PostHog

### 3. Fail-fast de configuração em produção

**Decisão:** criar `src/lib/env.ts` com validação **no boot**, disparada pelo
`instrumentation.ts`.

- Em `NODE_ENV=production`, variável obrigatória ausente **derruba o processo** com
  mensagem nomeando a variável que falta.
- Em desenvolvimento sem credenciais, a integração fica **explicitamente desativada** —
  desligada de propósito, não quebrada por acidente.
- **Motivo de existir aqui e não na Phase 1:** a Phase 1 (SEG-05) já vai exigir que a
  aplicação não suba sem as chaves de assinatura do QStash. As duas coisas querem o mesmo
  mecanismo. Esta etapa cria o mecanismo; a Phase 1 só acrescenta as chaves dela à mesma
  lista, em vez de inventar um segundo caminho.
- Validação **no build** foi descartada: no Railway o build roda com o env do serviço, e
  isso tornaria o build local sem secrets impossível.

### 4. Assinatura do wrapper do Resend

**Decisão:** união discriminada com motivos de vocabulário fechado. A função **nunca
lança**.

```ts
type ResultadoEmail =
    | { ok: true; id: string }
    | { ok: false; motivo: MotivoFalhaEmail }

type MotivoFalhaEmail =
    | 'desativado'       // sem RESEND_API_KEY em dev — esperado, silencioso
    | 'config_ausente'   // faltou remetente/destinatário — erro de programação
    | 'rejeitado'        // Resend recusou (endereço inválido, bounce)
    | 'falha_transporte' // rede/5xx — inesperado, vai ao Sentry
```

Por quê:

- O SDK do Resend **não lança** — devolve `{ data, error }` (`ROADMAP.md:213`). Sem
  wrapper, basta um chamador esquecer de olhar `error` para o e-mail sumir em silêncio.
- O TypeScript obriga o chamador a passar pelo caso de falha antes de usar o `id`.
- `motivo` é vocabulário **nosso**: nenhuma frase interna do Resend ("Domain is not
  verified", "Rate limit exceeded") atravessa a fronteira nem chega à tela de ninguém.
- `rejeitado` vs `falha_transporte` é a distinção que a supressão de bounce (EML-06,
  Phase 4) vai precisar — se não existir agora, o tipo teria que ser refeito lá.
- `Result<T,E>` genérico foi descartado: teria um único consumidor hoje, e o `CLAUDE.md`
  proíbe camada de abstração sem justificativa concreta.

### 5. Onde as falhas inesperadas são registradas

**Decisão:** falha esperada devolve `motivo` e não interrompe nada; falha **inesperada**
vai ao Sentry sanitizada.

Motivo de os três produtos virem na mesma etapa e não em fases separadas: se o wrapper do
Resend nascesse antes do Sentry existir, nasceria com `console.error` — que em produção
no Railway é uma linha de log que ninguém lê — e a Phase 4 herdaria a dívida de trocar
depois. É o modo de falha silencioso que o próprio `ROADMAP.md:390` descreve.

### Claude's Discretion

- Estrutura de arquivos e nomes dos módulos (`src/lib/email/`, `src/lib/env.ts`,
  `src/lib/observabilidade/` ou equivalente), respeitando kebab-case e domínio em pt-BR
- Como o `beforeSend` de sanitização é implementado e o que exatamente ele remove
- Quais variáveis entram na lista de obrigatórias em produção nesta etapa
- Cobertura de teste do wrapper e do sanitizador (funções puras, `src/lib/__tests__/`)
- Se o `instrumentation.ts` do Sentry e o de validação de env são o mesmo arquivo

</decisions>

<manual_gates>
## Gates manuais — o que depende do owner

Regra desta sessão: **parar apenas** no que exige ação externa do owner. Em cada parada,
informar (1) o nome exato da variável, (2) onde configurá-la, (3) como confirmar que
funcionou, (4) quando mandar continuar.

**Nunca pedir que o owner cole secret no chat.**

Gates previstos:

1. Criação do projeto no Sentry e do projeto no PostHog Cloud
2. Inserção dos secrets no `.env.local` e no Railway
3. Confirmação de que evento chega no PostHog e erro chega no Sentry (validação visual)
4. Confirmação de recebimento do smoke test de e-mail

O DNS do Resend **já foi resolvido** em 2026-07-21 (`82db24e`): `mail.vamoagendar.com.br`
verificado, DKIM propagado, remetente `naoresponda@mail.vamoagendar.com.br`. Não é gate.

</manual_gates>

<specifics>
## Specific Ideas

- Padrão a replicar, não reinventar: `src/lib/analytics/server.ts` e `client.ts` — no-op
  sem key, `try/catch` em tudo, nenhum caminho lança, `after()` do `next/server` para não
  bloquear resposta
- Remetente já verificado: `naoresponda@mail.vamoagendar.com.br`, com nome
  `"<Estabelecimento> via VamoAgendar"` e `reply-to` indo ao profissional (EML-04, Phase 4)
- Teto do Free do Resend: 100 e-mails/dia, 3.000/mês, 1 domínio
- Next.js 16 tem breaking changes vs. conhecimento de treinamento — consultar
  `node_modules/next/dist/docs/` antes de usar API de framework (`instrumentation.ts`,
  `onRequestError`)
- Execução **sequencial na árvore principal**: worktree auto-degradado
  (`shouldDegrade: true`, `head-diverged-from-fork` — `master` local 10 commits à frente
  de `origin/master`)

</specifics>

<canonical_refs>
## Canonical References

- `.planning/ROADMAP.md` — linha 193 (a referência órfã), 205–215 (Phase 4), 372–395
  (Phase 11), 390 (modos de falha silenciosos)
- `.planning/REQUIREMENTS.md` — OPE-01..05 (linhas 95–99), EML-01..06 (58–63), tabela
  requisito→fase (173–198), tabela fase→requisitos (210–217)
- `.planning/phases/01-hardening-da-superf-cie-p-blica/01-CONTEXT.md` e `01-UI-SPEC.md`
  — **preservar**; A2 do UI-SPEC (linha 180) fixa que o `tenantHash` continua sendo
  calculado no servidor
- `docs/08-ANALYTICS_E_FUNIL.md` — contrato vigente do PostHog
- `CLAUDE.md` / `AGENTS.md` — Definition of Done, stack oficial e proibições

</canonical_refs>
