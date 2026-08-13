---
phase: 04-canal-de-e-mail-transacional
reviewed: 2026-08-13T08:10:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - src/app/api/webhooks/resend/route.ts
  - src/app/api/webhooks/resend/__tests__/route.test.ts
  - src/lib/email-boas-vindas.ts
  - src/lib/__tests__/email-boas-vindas.test.ts
  - src/emails/BoasVindas.tsx
  - src/emails/layout/LayoutBase.tsx
  - src/emails/__tests__/BoasVindas.test.tsx
  - src/app/actions/perfis-empresas.ts
  - src/app/actions/__tests__/perfis-empresas.test.ts
  - src/types/database.ts
  - supabase/migrations/20260808000000_create_tb_email_log.sql
  - eslint.config.mjs
  - vitest.config.ts
findings:
  critical: 5
  warning: 10
  info: 6
  total: 21
status: issues_found
---

# Phase 4: Relatório de Code Review

**Revisado:** 2026-08-13T08:10:00Z
**Profundidade:** standard
**Arquivos revisados:** 13
**Status:** issues_found

## Resumo

A Phase 04 entregou o canal de e-mail transacional: template React Email
(`BoasVindas` + `LayoutBase`), orquestrador idempotente (`garantirEnvioBoasVindas`),
tabela de log (`tb_email_log`), webhook do Resend e campo `email_contato` no perfil.
Os gates rodam verdes — `npx tsc --noEmit` sem saída e as 6 suítes tocadas passam
(15 testes) — mas o verde é enganoso em dois eixos independentes.

O primeiro eixo é o **contrato com o fornecedor**: o webhook filtra por
`type === 'suppression.added'`, um evento que **não existe** no Resend SDK 6.17
(`node_modules/resend/dist/index.d.mts:2055` lista `email.suppressed`, nunca
`suppression.added`). O teste passa porque o mock inventa o tipo, e o `as unknown as`
na linha 56 do route handler joga fora justamente o tipo `WebhookEventPayload` que o
`tsc` usaria para reprovar. É o mesmo padrão de falso-verde já registrado no projeto:
o instrumento mede o eixo errado.

O segundo eixo é o **ciclo de vida do disparo**: o gatilho vive no
`src/app/dashboard/layout.tsx:42` e roda a cada renderização de servidor do layout,
enquanto o índice único parcial da migration (`WHERE status != 'falhou'`) libera a
chave de idempotência assim que uma tentativa falha. Junto, isso produz uma linha
nova em `tb_email_log` e uma tentativa de envio por page view enquanto o envio não
der certo — e "não dar certo" é o estado corrente do ambiente (domínio ainda não
verificado no Resend, `RESEND_API_KEY` ausente em dev).

Some-se a isso a ausência de `tb_email_log` e de `email_contato` em
`supabase/schemas/` — o próximo `supabase db diff` emite `DROP TABLE`/`DROP COLUMN`.

## Critical Issues

### CR-01: `tb_email_log` e `email_contato` não existem no schema declarativo — o próximo `db diff` os derruba

**Arquivo:** `supabase/migrations/20260808000000_create_tb_email_log.sql:1-25`
**Issue:** `supabase/schemas/` continua com os arquivos `00_` a `09_` de sempre;
`grep -rn "tb_email_log\|email_contato" supabase/schemas/` não retorna nada. O
CLAUDE.md é explícito: "Toda alteração de schema é feita **apenas** em `.sql` de
`supabase/schemas/`" e a migration é **gerada** por `supabase db diff`, nunca escrita
à mão (Definition of Done, item 2). Aqui a migration foi escrita à mão e o schema
declarativo ficou para trás.

Cenário concreto de falha: qualquer fase futura que rode
`npx supabase db diff --linked -f <nome>` compara o banco real com o shadow montado
a partir de `supabase/schemas/`. Como a tabela e a coluna existem só no banco, o
migra emite `DROP TABLE public.tb_email_log;` e
`ALTER TABLE perfis_empresas DROP COLUMN email_contato;` — e quem aplicar a migration
gerada sem ler linha a linha perde o log de idempotência inteiro (todo tenant volta
a receber boas-vindas) e o e-mail de contato de todos os estabelecimentos, que hoje
é lido por `src/lib/notificacoes-agendamento.ts:65` e escrito pelo dashboard.

**Fix:** criar `supabase/schemas/10_email_log.sql` com o DDL completo (tabela, RLS,
policies, índices, `COMMENT ON`), acrescentar `email_contato` a
`supabase/schemas/01_perfis_empresas.sql`, e conferir com `supabase db diff` que o
delta volta vazio:

```sql
-- supabase/schemas/10_email_log.sql
create table if not exists public.email_log (
    id uuid primary key default gen_random_uuid(),
    tenant_id text not null references public.perfis_empresas(tenant_id) on delete cascade,
    chave_idempotencia text not null,
    tipo_email text not null,
    status text not null check (status in ('pendente', 'enviado', 'falhou')),
    resend_id text,
    erro text,
    tentativas integer not null default 1,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now()
);

alter table public.email_log enable row level security;

comment on table public.email_log is
'Log append-only de disparos de e-mail transacional. Serve de trava de idempotência
por (chave_idempotencia) e de auditoria por tenant. Sem PII: não guarda destinatário
nem corpo da mensagem.';
```

---

### CR-02: retentativa sem teto — uma tentativa de envio (e uma linha nova) por renderização do dashboard

**Arquivos:** `src/lib/email-boas-vindas.ts:28-47`,
`supabase/migrations/20260808000000_create_tb_email_log.sql:17-19`,
`src/app/dashboard/layout.tsx:42-48`
**Issue:** três decisões corretas isoladamente compõem um defeito:

1. o índice único é **parcial** (`WHERE status != 'falhou'`), então uma tentativa que
   termina em `falhou` **libera** a chave `boas-vindas/<tenantId>`;
2. `garantirEnvioBoasVindas` grava `falhou` em todo caminho de erro
   (linhas 86-96 e 99-108), inclusive nos motivos **permanentes e recorrentes**
   `desativado` (sem `RESEND_API_KEY`) e `rejeitado` (domínio não verificado, HTTP 403;
   endereço malformado, HTTP 422);
3. o gatilho está no layout do dashboard, que roda a cada renderização de servidor —
   carga direta, F5 e todo `router.refresh()` disparado pelos formulários da agenda.

Resultado: enquanto o envio não der certo, **cada page view do dashboard grava uma
linha em `tb_email_log` e faz uma chamada ao Resend**. Em dev (`RESEND_API_KEY`
ausente, motivo `desativado`) o crescimento é ilimitado e permanente. Em produção,
durante a janela em que o domínio ainda não passou pela verificação SPF/DKIM — uma
dependência externa declarada como bloqueante no contexto do projeto — cada
navegação bate no Resend com um envio que será rejeitado. Isso contradiz frontalmente
o EML-06 ("endereço inválido não degrada a reputação do domínio"): repetir rejeição
síncrona contra o mesmo endereço é exatamente o comportamento que queima reputação.
A coluna `tentativas` existiria para conter isso, mas nunca é incrementada nem lida
(ver WR-06).

**Fix:** separar "falha permanente" de "falha transitória" e pôr teto. Motivo
`desativado` não deveria nem consumir uma linha; `rejeitado` deveria ficar terminal.

```ts
const MOTIVOS_PERMANENTES: MotivoFalhaEmail[] = ['desativado', 'rejeitado', 'config_ausente']
const TETO_TENTATIVAS = 3

// ... no caminho de erro:
const permanente = MOTIVOS_PERMANENTES.includes(res.motivo)
await supabase
    .from('tb_email_log')
    .update({
        // 'descartado' fica FORA do predicado do índice parcial: a chave
        // permanece travada e o retry para de nascer a cada page view.
        status: permanente ? 'descartado' : 'falhou',
        erro: res.motivo,
        atualizado_em: new Date().toISOString(),
    })
    .eq('id', logId)
```

E, no `WHERE` do índice, manter travada toda a chave que não seja retentável:
`WHERE status IN ('pendente', 'enviado', 'descartado')`. Além disso, o gatilho não
pertence ao layout (ver WR-04 e WR-10): o lugar natural é o momento do
provisionamento do tenant.

---

### CR-03: o webhook escuta um evento que o Resend nunca envia — a supressão (EML-06) nunca é processada

**Arquivo:** `src/app/api/webhooks/resend/route.ts:63`
**Issue:** a condição é
`tipoEvento === 'suppression.added' || tipoEvento === 'email.bounced'`. O union
`WebhookEvent` do SDK instalado (`node_modules/resend/dist/index.d.mts:2055`) é:

```
'email.sent' | 'email.scheduled' | 'email.delivered' | 'email.delivery_delayed'
| 'email.complained' | 'email.bounced' | 'email.opened' | 'email.clicked'
| 'email.received' | 'email.failed' | 'email.suppressed' | 'contact.*' | 'domain.*'
```

`suppression.added` **não existe**. O evento real de supressão é `email.suppressed`
(`EmailSuppressedEvent`, linha 2186 do mesmo arquivo). Ou seja: metade do predicado
é código morto, e o único caminho vivo é `email.bounced` — que reporta ao Sentry uma
mensagem cujo texto afirma o contrário (`resend:supressao_adicionada`, ver WR-05).

Por que os testes não pegam: o mock em
`src/app/api/webhooks/resend/__tests__/route.test.ts:23,30` **fabrica**
`type: 'suppression.added'`. A suíte valida o código contra um Resend imaginário. E o
`tsc` também não pega, porque a linha 56 do route handler faz
`as unknown as ResendEventPayload`, descartando o `WebhookEventPayload` tipado que o
`verify()` devolve (ver WR-08).

**Fix:** usar os literais do SDK e deixar o compilador validar.

```ts
import type { WebhookEventPayload } from 'resend'

const evento = resend.webhooks.verify({ ... }) // já é WebhookEventPayload, sem cast

const EVENTOS_DE_REPUTACAO = ['email.suppressed', 'email.bounced', 'email.complained'] as const
if ((EVENTOS_DE_REPUTACAO as readonly string[]).includes(evento.type)) {
    const resendId = 'email_id' in evento.data ? evento.data.email_id : undefined
    // ...
}
```

E reescrever o mock do teste com um payload real de `email.suppressed`, incluindo
um caso que prove que `suppression.added` **não** é tratado.

---

### CR-04: `reportarExcecao` (fire-and-forget) num route handler que responde na linha seguinte

**Arquivo:** `src/app/api/webhooks/resend/route.ts:5,83`
**Issue:** o CLAUDE.md é explícito: "em Server Action, webhook ou route handler que
pode encerrar logo depois, use as variantes **aguardadas**
`reportarExcecaoAguardando`/`reportarFalhaSilenciosaAguardando` (`Sentry.flush`) — a
versão fire-and-forget perde o evento quando o processo congela". A implementação de
`reportarExcecao` (`src/lib/observabilidade/reportar.ts:23-34`) dispara
`void import('@sentry/nextjs').then(...)` sem ninguém esperar, e o handler devolve
`NextResponse.json` sete linhas depois (linha 90). O docstring de
`reportarExcecaoAguardando` descreve textualmente este cenário, citando o webhook do
lembrete como precedente.

Cenário concreto: em runtime que congela na resposta (edge/serverless), o único sinal
de que o e-mail de um tenant entrou em supressão — o alerta que faz o owner agir —
não sai. O webhook responde 200, o Resend não reenvia, e o evento se perde sem
rastro.

**Fix:**

```ts
import { reportarExcecaoAguardando } from '@/lib/observabilidade/reportar'
// ...
await reportarExcecaoAguardando(new Error('resend:supressao_adicionada'), {
    tenantHash,
    tipoEvento,
})
```

---

### CR-05: `RESEND_WEBHOOK_SECRET` fora de `OBRIGATORIAS_EM_PRODUCAO` — webhook morto em silêncio

**Arquivos:** `src/app/api/webhooks/resend/route.ts:30-36`, `src/lib/env.ts:40-59`
**Issue:** a lista de fail-fast tem `RESEND_API_KEY` (linha 54) mas não
`RESEND_WEBHOOK_SECRET`. O CLAUDE.md fecha essa porta explicitamente: "ao adicionar
variável nova que falhe em silêncio, acrescente-a àquela lista", e o critério (a)
do próprio `env.ts` é "a ausência desta variável falha em silêncio ou falha tarde" —
que é exatamente este caso.

Cenário concreto: deploy em produção com o secret ausente ou digitado errado. O boot
sobe normalmente, o dashboard funciona, os e-mails saem. Todo POST do Resend recebe
`503` (linha 34), o Resend retenta, desiste e acaba desabilitando o endpoint. Nenhuma
Issue no Sentry, nenhum log: o canal de reputação (EML-06) fica desligado e ninguém
descobre até um incidente de entregabilidade. Note ainda que o `503` é devolvido
**sem** nenhum reporte — pior que o `401` de assinatura inválida, que ao menos é um
estado esperado.

**Fix:**

```ts
// src/lib/env.ts
    'RESEND_API_KEY',
    // Phase 4: sem o secret, TODO webhook do Resend responde 503 e o canal de
    // supressão/bounce (EML-06) fica desligado sem nenhum sinal (critério (a)).
    'RESEND_WEBHOOK_SECRET',
```

E, no handler, reportar o 503 com rótulo sintético
(`reportarFalhaSilenciosaAguardando('resend:webhook_secret_ausente')`) para que a
condição seja visível mesmo se o fail-fast for burlado.

## Warnings

### WR-01: `tb_email_log` sem RLS explícito, sem policies, sem `COMMENT ON` e com nome fora da convenção

**Arquivo:** `supabase/migrations/20260808000000_create_tb_email_log.sql:2-13`
**Issue:** quatro desvios do padrão de banco do projeto na mesma tabela:

- **RLS não é declarado.** A tabela só nasce protegida porque o event trigger
  `ensure_rls` (`supabase/schemas/00_funcoes_sistema.sql`) roda o
  `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` por baixo. Aquele trigger é *rede de
  segurança*, não substituto do `ALTER TABLE` explícito — o próprio comentário dele
  diz "mesmo que o autor da migration esqueça". Além disso, o trigger engole a exceção
  (`WHEN OTHERS THEN RAISE LOG`): se falhar, a tabela nasce sem RLS e nada estoura.
- **Zero policies.** O comportamento efetivo é fail-closed (ninguém além de
  `service_role` lê), o que é aceitável hoje, mas nada disso está escrito: a próxima
  fase que precisar mostrar o histórico de e-mails no dashboard vai criar uma policy
  no escuro.
- **Sem `COMMENT ON TABLE`**, exigido pela Definition of Done (item 2).
- **Nome fora da convenção**: o padrão do projeto é plural, pt-BR, `snake_case`, sem
  prefixo (`agendamentos`, `disparos_whatsapp`). `tb_email_log` é prefixado, em inglês
  e no singular — é a única tabela do banco assim.

**Fix:** ver o DDL sugerido em CR-01 (tabela `email_log`, RLS explícito, `COMMENT ON`),
e acrescentar a policy `TO authenticated` com `(SELECT auth.jwt() ->> 'org_id')` em
subquery quando houver consumidor.

---

### WR-02: erro do SELECT no webhook é descartado — evento perdido com 200 OK

**Arquivo:** `src/app/api/webhooks/resend/route.ts:74-78`
**Issue:** `const { data: logEntry } = await supabase...` ignora `error` por completo.
Dois caminhos de falha ficam invisíveis:

1. banco indisponível ou `permission denied` → `logEntry` é `undefined`, o `if` da
   linha 80 não entra, o handler devolve `200 OK`, o Resend considera entregue e
   **não retenta**. O evento de supressão some;
2. `resend_id` não é único (o índice da linha 22 da migration é comum, não `UNIQUE`).
   Com duas linhas para o mesmo `resend_id` — cenário real assim que houver reenvio,
   ver CR-02 — `maybeSingle()` retorna erro `PGRST116`, também descartado.

**Fix:**

```ts
const { data: logEntry, error: erroLog } = await supabase
    .from('tb_email_log')
    .select('tenant_id')
    .eq('resend_id', resendId)
    .maybeSingle()

if (erroLog) {
    await reportarFalhaSilenciosaAguardando('resend:webhook_lookup_falhou', {
        codigo: erroLog.code,
    })
    // 500 faz o Resend retentar; 200 aqui é perda definitiva do evento.
    return NextResponse.json({ erro: 'Falha temporária' }, { status: 500 })
}
```

---

### WR-03: resultado dos `UPDATE` do log nunca é verificado

**Arquivo:** `src/lib/email-boas-vindas.ts:75-82, 86-93, 99-106`
**Issue:** os três `.update(...).eq('id', logId)` descartam o retorno inteiro. Se o
`UPDATE` de sucesso (linha 75) falhar, a linha fica `pendente` para sempre. Como
`pendente` está **dentro** do predicado do índice parcial, a chave permanece travada:
toda chamada futura devolve `{ ok: true, ignoradoPorIdempotencia: true }` — verde,
mas o registro mente sobre o estado do envio e o `resend_id` nunca é gravado, o que
quebra o cruzamento do webhook (CR-03/WR-02) para aquele tenant.

**Fix:** capturar `error` em cada `update` e, quando presente, reportar com rótulo
sintético (`email:log_update_falhou`) via `reportarFalhaSilenciosa`, sem alterar o
valor de retorno da função.

---

### WR-04: gatilho de e-mail em Server Component sem `after()`, com `.catch(() => {})` engolindo tudo

**Arquivo:** `src/app/dashboard/layout.tsx:42-48`
**Issue:** `garantirEnvioBoasVindas({...}).catch(() => {})` é fire-and-forget durante
a renderização de um Server Component. Dois problemas:

1. **Sem `after()`.** O projeto já tem o padrão estabelecido e testado para trabalho
   pós-resposta — `src/lib/analytics/server.ts:67` e
   `src/lib/observabilidade/apos-resposta.ts:29` usam `after()` do `next/server`, e a
   Phase 05 seguiu o mesmo caminho. Uma promise solta na renderização pode ser
   cancelada quando o RSC termina, deixando a linha travada em `pendente` (ver WR-03).
2. **`.catch(() => {})` cego.** Descarta tanto a exceção quanto o retorno
   `{ ok: false, motivo }`. Nenhuma falha de boas-vindas chega ao Sentry, ao
   `logOperacional` ou ao console. A "Regra de Falha Silenciosa" do CLAUDE.md diz
   justamente que falhar em silêncio para o cliente **não** significa esconder do
   owner nem omitir Sentry Issue.

**Fix:**

```ts
import { after } from 'next/server'
// ...
after(async () => {
    const r = await garantirEnvioBoasVindas({ ... }).catch((e) => {
        reportarFalhaSilenciosa('email:boas_vindas_excecao', { tenantHash: hashTenantId(orgId) })
        return null
    })
    if (r && !r.ok) {
        reportarFalhaSilenciosa('email:boas_vindas_falhou', {
            motivo: r.motivo,
            tenantHash: hashTenantId(orgId),
        })
    }
})
```

---

### WR-05: rótulo estático do Sentry mente sobre metade dos eventos que ele cobre

**Arquivo:** `src/app/api/webhooks/resend/route.ts:83`
**Issue:** a mensagem sintética é `resend:supressao_adicionada`, mas o único evento
que hoje chega ao bloco é `email.bounced` (por CR-03). A escolha de mensagem
estática está certa — é o que preserva o agrupamento — mas o texto descreve outro
fato. Quem abrir a Issue vai investigar supressão quando o que houve foi bounce.
O `tipoEvento` vai no contexto, mas o título é o que o owner lê primeiro.

**Fix:** rótulo por evento, ainda estático e sem interpolação de dado:

```ts
const ROTULOS: Record<string, string> = {
    'email.suppressed': 'resend:email_suprimido',
    'email.bounced': 'resend:email_bounce',
    'email.complained': 'resend:email_spam',
}
await reportarFalhaSilenciosaAguardando(ROTULOS[evento.type], { tenantHash })
```

---

### WR-06: coluna `tentativas` é gravada uma vez e nunca lida — não há contagem nem backoff

**Arquivos:** `src/lib/email-boas-vindas.ts:35`,
`supabase/migrations/20260808000000_create_tb_email_log.sql:10`
**Issue:** `tentativas: 1` é escrito no INSERT e nenhum ponto do código incrementa ou
consulta o campo. Como a linha anterior de status `falhou` **não** é reaproveitada
(o fluxo sempre faz um INSERT novo), o valor é literalmente sempre `1` e a coluna não
informa nada. É a peça que faltava para dar teto ao retry de CR-02.

**Fix:** ou remover a coluna (menos estado mentindo), ou fazer o caminho de retry
atualizar a linha existente com `tentativas = tentativas + 1` e recusar o envio acima
do teto. A segunda opção é a que fecha CR-02.

---

### WR-07: `email_contato` sem limite de tamanho na action e sem `CHECK` no banco

**Arquivos:** `src/app/actions/perfis-empresas.ts:270-273`,
`supabase/migrations/20260808000000_create_tb_email_log.sql:25`
**Issue:** a regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` valida formato mas não comprimento
— uma string de 100 KB sem espaços e com um `@` passa. A coluna é `TEXT` puro, sem
`CHECK`, ao contrário de todas as outras colunas validadas do perfil
(`cor_marca` tem `perfis_empresas_cor_marca_check`, `instagram` tem
`perfis_empresas_instagram_check`) e ao contrário do próprio `endereco`, que a mesma
função limita a 200 caracteres na linha 240. O valor vai direto para `replyTo` em
`src/lib/notificacoes-agendamento.ts:99`, onde vira rejeição do Resend classificada
como `rejeitado` — culpa do dado, sem Sentry, difícil de rastrear.

Nota positiva: a exclusão de `\s` na regex fecha injeção de header SMTP via `replyTo`
(nenhum `\r`/`\n` passa). Isso é acerto, não achado.

**Fix:** `if (emailContatoNovo && emailContatoNovo.length > 254) throw new Error('E-mail de contato muito longo.')`
(254 é o limite do RFC 5321) e `CHECK (char_length(email_contato) <= 254)` no schema
declarativo, junto com o `COMMENT ON COLUMN`.

---

### WR-08: tipagem artesanal + `as unknown as` descartam o tipo do SDK que teria pego CR-03

**Arquivo:** `src/app/api/webhooks/resend/route.ts:7-16,56,62,65`
**Issue:** `verify()` já devolve `WebhookEventPayload` (union discriminada por `type`,
`node_modules/resend/dist/index.d.mts:2305`). O código o joga fora com
`as unknown as ResendEventPayload`, onde `ResendEventPayload` tem tudo opcional e um
`[key: string]: unknown`. Consequências mensuráveis:

- `tsc --noEmit` passa com `'suppression.added'`, que não é membro do union — é o
  mecanismo direto de CR-03;
- `evento?.event` (linha 62) é caminho morto: nenhum evento do Resend tem campo
  `event`, só `type`;
- `data.source_id || data.id` (linha 65) também é morto: `BaseEmailEventData` expõe
  `email_id`, e nenhum dos 17 tipos de evento tem `source_id` ou `id`. O teste
  "retorna 200 sem I/O quando source_id é nulo" valida uma situação que não ocorre.

**Fix:** remover a interface local, importar `WebhookEventPayload` do `resend`,
eliminar o cast e usar narrowing por `evento.type`. O compilador passa a ser o gate.

---

### WR-09: todos os 9 arquivos novos/alterados estão fora do Prettier do projeto

**Arquivos:** os 9 arquivos `.ts`/`.tsx` da fase
**Issue:** `.prettierrc` define `tabWidth: 4` e `semi: false`; os arquivos da fase usam
2 espaços e ponto e vírgula. Prova:

```
$ npx prettier --check <os 9 arquivos>
[warn] src/app/api/webhooks/resend/route.ts
[warn] src/lib/email-boas-vindas.ts
[warn] src/emails/BoasVindas.tsx
[warn] src/emails/layout/LayoutBase.tsx
[warn] src/types/database.ts
[warn] src/app/actions/__tests__/perfis-empresas.test.ts
[warn] src/app/api/webhooks/resend/__tests__/route.test.ts
[warn] src/lib/__tests__/email-boas-vindas.test.ts
[warn] src/emails/__tests__/BoasVindas.test.tsx
[warn] Code style issues found in 9 files.
```

Isso indica que o hook de pré-commit não rodou nesses commits. O custo não é estético:
o próximo commit que tocar qualquer um deles vai reformatar o arquivo inteiro e
produzir um diff enorme, escondendo a mudança real na revisão.

**Fix:** `npx prettier --write` nos 9 arquivos, em commit isolado de formatação, e
verificar por que o hook não disparou.

---

### WR-10: o layout do dashboard passou a fazer auto-provisionamento e chamada ao Clerk a cada renderização

**Arquivo:** `src/app/dashboard/layout.tsx:33-50`
**Issue:** para montar o e-mail de boas-vindas, o layout agora chama
`obterPerfilEmpresa()` (linha 35) em **toda** renderização. Aquela função não é uma
leitura barata: ela consulta `perfis_empresas`, resolve a assinatura vigente e, quando
não acha perfil, chama a API do Clerk (`clerk.organizations.getOrganization`) e faz um
`upsert`. Ou seja, o caminho de provisionamento — pensado para acontecer uma vez —
virou parte do caminho quente de todo carregamento do dashboard. Some-se o
`await currentUser()` duplicado (linhas 33 e 59) e o INSERT de CR-02.

Além disso, o `.catch(() => null)` na linha 35 esconde falha real de perfil: se
`obterPerfilEmpresa` lançar, o layout segue como se o tenant não tivesse perfil, sem
sinal nenhum.

**Fix:** mover o gatilho de boas-vindas para o ponto onde o tenant é provisionado
(dentro de `obterPerfilEmpresa`, no ramo em que `novoPerfil` é criado), envolto em
`after()`. Ali ele roda uma vez por tenant, com os dados já em mãos, sem custo por
page view e sem consulta extra.

## Info

### IN-01: `src/types/database.ts` é código morto — nenhum arquivo o importa

**Arquivo:** `src/types/database.ts:1-41`
**Issue:** `grep -rn "types/database\|TbEmailLog" src/` não encontra nenhum consumidor.
Os tipos não são usados por `email-boas-vindas.ts` nem pelo webhook, que usam objetos
literais não tipados. O arquivo também contraria a convenção registrada em
`.claude/CLAUDE.md` ("Sem arquivo central de tipos... tipos escritos à mão por módulo")
e usa nomes em inglês (`TbEmailLog`, `EmailLogStatus`) num codebase de domínio pt-BR.
**Fix:** ou apagar o arquivo, ou (preferível) aplicar os tipos nos `insert`/`update`
de `email-boas-vindas.ts` e renomear para pt-BR (`RegistroEmailLog`, `StatusEmailLog`)
junto do rename da tabela de WR-01.

---

### IN-02: `email.complained` (marcação de spam) não é tratado

**Arquivo:** `src/app/api/webhooks/resend/route.ts:63`
**Issue:** reclamação de spam degrada reputação de domínio tanto quanto bounce e é
justamente o sinal que o EML-06 quer capturar. O evento existe no SDK
(`EmailComplainedEvent`) e não é considerado.
**Fix:** incluir no conjunto de eventos de reputação (ver o snippet de CR-03).

---

### IN-03: nome de migration em inglês, destoando da vizinha

**Arquivo:** `supabase/migrations/20260808000000_create_tb_email_log.sql`
**Issue:** `create_tb_email_log` contra `20260808100000_contato_flexivel_clientes.sql`
e todas as demais, em pt-BR e sem verbo em inglês.
**Fix:** renomear para `email_log_e_email_contato` ao regerar a migration a partir do
schema declarativo (CR-01).

---

### IN-04: a asserção NUNCA-PII do teste do webhook é mais fraca do que aparenta

**Arquivo:** `src/app/api/webhooks/resend/__tests__/route.test.ts:154-159`
**Issue:** o teste verifica `JSON.stringify(meta)` — só o segundo argumento de
`reportarExcecao`. Não cobre a mensagem do `Error` (primeiro argumento), nem o corpo
da resposta HTTP, nem eventual log. Se alguém amanhã interpolar o destinatário no
rótulo (`new Error(\`resend:bounce:${data.to}\`)`), o teste continua verde. É a mesma
classe de falso-verde do bug de Phase 03 citado no contexto: valida-se a chave/campo
errado. Além disso, o cenário testado usa um tipo de evento inexistente (CR-03).
**Fix:** afirmar sobre a chamada inteira —
`expect(JSON.stringify(vi.mocked(reportarExcecao).mock.calls)).not.toContain('@')` —
e sobre o corpo da resposta.

---

### IN-05: credencial falsa hardcoded no route handler

**Arquivo:** `src/app/api/webhooks/resend/route.ts:47`
**Issue:** `new Resend(process.env.RESEND_API_KEY || 're_dummy')`. Não é vazamento
(é um placeholder), mas o construtor é instanciado por requisição só para alcançar
`webhooks.verify`, que não usa a chave — internamente delega ao `svix` com o
`webhookSecret` (`node_modules/resend/dist/index.mjs:1111`). O literal `re_dummy`
também mascara a ausência de `RESEND_API_KEY` sem nenhum comentário explicando por
que ele existe.
**Fix:** `new Resend(process.env.RESEND_API_KEY ?? 're_placeholder_verify_nao_usa_chave')`
com comentário em pt-BR, ou instanciar uma vez em escopo de módulo.

---

### IN-06: a migration mistura dois escopos sem relação

**Arquivo:** `supabase/migrations/20260808000000_create_tb_email_log.sql:24-25`
**Issue:** o `ALTER TABLE perfis_empresas ADD COLUMN email_contato` (EML-04) viaja
dentro da migration cujo nome anuncia só a criação de `tb_email_log`. Quem procurar a
origem da coluna pelo nome do arquivo não a encontra.
**Fix:** ao regerar via `db diff` (CR-01), o próprio `-f <nome>` resolve — usar um
nome que cubra os dois fatos ou gerar duas migrations.

---

_Revisado: 2026-08-13T08:10:00Z_
_Revisor: Claude (gsd-code-reviewer)_
_Profundidade: standard_
