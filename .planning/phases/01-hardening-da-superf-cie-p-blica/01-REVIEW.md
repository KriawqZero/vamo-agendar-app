---
phase: 01-hardening-da-superficie-publica
reviewed: 2026-07-22T00:00:00Z
depth: standard
files_reviewed: 29
files_reviewed_list:
  - docs/03-PADROES_DE_BANCO_DE_DADOS.md
  - docs/09-OBSERVABILIDADE_E_EMAIL.md
  - docs/PENDENCIAS.md
  - scripts/verificar-fail-fast-boot.sh
  - scripts/verificar-superficie-anon.sh
  - src/app/actions/public-booking.ts
  - src/app/actions/__tests__/public-booking-escrita.test.ts
  - src/app/api/webhooks/lembrete/route.ts
  - src/app/book/[slug]/BookingApp.tsx
  - src/app/book/[slug]/page.tsx
  - src/instrumentation.ts
  - src/lib/assinaturas.ts
  - src/lib/env.ts
  - src/lib/qstash-assinatura.ts
  - src/lib/supabase/admin.ts
  - src/lib/__tests__/env.test.ts
  - src/lib/__tests__/qstash-assinatura.test.ts
  - src/lib/whatsapp-helper.ts
  - supabase/migrations/20260722044858_revoga_anon_assinaturas.sql
  - supabase/migrations/20260722055941_fecha_policies_anon.sql
  - supabase/migrations/20260722060000_fecha_data_api_para_anon.sql
  - supabase/migrations/20260722145948_fecha_policies_residuais_servicos_horarios.sql
  - supabase/schemas/01_perfis_empresas.sql
  - supabase/schemas/02_servicos.sql
  - supabase/schemas/03_horarios_funcionamento.sql
  - supabase/schemas/04_excecoes_agenda.sql
  - supabase/schemas/06_clientes.sql
  - supabase/schemas/07_agendamentos.sql
  - supabase/schemas/08_assinaturas.sql
findings:
  critical: 4
  warning: 8
  info: 0
  total: 12
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-07-22
**Depth:** standard
**Files Reviewed:** 29
**Status:** issues_found

## Summary

O núcleo do que a fase se propôs a fazer está bem feito e verificável: `tenant_id`
saiu do navegador e passa a ser resolvido no servidor a partir do slug
(`resolverPerfilPublicoPorSlug`), o serviço passou a ser filtrado pelo tenant
resolvido (o código anterior aceitava `servicoId` de qualquer tenant), a role `anon`
perdeu privilégio na Data API com `service_role` corretamente fora das linhas de
revoke, e a projeção de colunas é explícita. O fail-fast de boot foi conferido contra
o comportamento real do `@next/env@16.2.10` (variável exportada como string vazia
**não** é sobrescrita pelo `.env.local` — `processEnv` só preenche quando
`typeof initialEnv[chave] === 'undefined'`), então o veredito MORTE do harness mede
mesmo o que diz medir.

O que reprova são quatro coisas de natureza diferente do trabalho de RLS/privilégio,
todas dentro dos arquivos entregues:

1. a chave que **autentica** o webhook continua sendo publicada em texto claro na
   query string de toda mensagem do QStash — e, ao contrário do que o comentário
   afirma, manter o parâmetro nas publicações **novas** não é exigido por
   compatibilidade nenhuma;
2. toda a copy de erro do booking público — inclusive a recuperação de
   double-booking, que é o contrato anti-race da fase — depende de `err.message`
   atravessando uma Server Action, e em build de produção o React substitui essa
   mensagem por um texto genérico em inglês;
3. o link público de um tenant pode ser sequestrado por outro tenant, porque
   `slug_gratuito` não tem UNIQUE e nada impede que um slug customizado colida com
   ele — e a resolução tenta `slug` primeiro;
4. o log da aplicação recebe nome e telefone do cliente final, fato que a própria
   `docs/09` documenta ao justificar a trava de breadcrumb do Sentry, sem que o log
   em si tenha sido corrigido.

Os achados 3 e 4 são pré-existentes; entram aqui porque vivem nos arquivos
entregues, porque a fase é justamente o hardening da superfície pública e porque
o achado 3 é o único furo de isolamento entre tenants que sobrou depois do
fechamento da Data API.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: A chave de verificação do webhook é publicada em texto claro na URL de cada lembrete

**File:** `src/lib/whatsapp-helper.ts:131-148`
**Issue:**
`agendarLembreteQStash` lê `QSTASH_CURRENT_SIGNING_KEY` e a concatena na URL de
destino publicada no QStash:

```ts
const chaveAssinatura = process.env.QSTASH_CURRENT_SIGNING_KEY
const webhookUrl = `${APP_URL}/api/webhooks/lembrete?secret=${chaveAssinatura}`
const publishUrl = `${QSTASH_URL}/v2/publish/${webhookUrl}`
```

Essa mesma variável é, desde esta fase, a chave HMAC com que
`verificarAssinaturaQstash` (`src/lib/qstash-assinatura.ts:34-54`) **autentica** o
webhook via `Receiver`. Ou seja: o segredo que prova "quem chama é o QStash" viaja
como parâmetro de URL em toda publicação e em toda entrega. Quem obtiver o valor
forja um `Upstash-Signature` válido e dispara WhatsApp em nome de qualquer tenant —
exatamente o risco que o comentário desta função nomeia ("quem adivinhasse o valor
disparava WhatsApp em nome de qualquer tenant"), só que sem precisar adivinhar.

Caminhos concretos de exposição, todos fora do alcance da sanitização do Sentry
(que cobre breadcrumb e `request.url`, não log de infraestrutura nem terceiro):

- log de acesso HTTP de qualquer hop entre QStash e Railway — a linha de requisição
  inclui a query string;
- armazenamento e console do QStash: a URL de destino fica visível na listagem de
  mensagens por até 14 dias (e um `QSTASH_TOKEN` vazado devolve a chave de assinatura
  junto);
- `console.error('Falha ao registrar agendamento no QStash (…):', await response.text())`
  (`src/lib/whatsapp-helper.ts:164-167`) — corpo de erro do QStash costuma ecoar a
  URL de destino.

A justificativa escrita no código não se sustenta para publicações novas: o webhook
casa a assinatura contra `req.url` (`src/app/api/webhooks/lembrete/route.ts:27-31`),
que é o que a requisição de fato trouxer. Mensagens **já em voo** continuam validando
com a URL antiga automaticamente; nada exige que as **novas** carreguem o parâmetro.
O webhook nem lê mais `?secret=`.

**Fix:**
```ts
// Publicar sem o parâmetro. Lembretes já enfileirados continuam validando porque a
// verificação usa `req.url` — a URL antiga chega inteira e casa com a claim `sub`.
const webhookUrl = `${APP_URL}/api/webhooks/lembrete`
const publishUrl = `${QSTASH_URL}/v2/publish/${webhookUrl}`
```
E, depois que a fila secar (≤ 14 dias), rotacionar as signing keys no painel da
Upstash: a chave atual precisa ser considerada comprometida, porque já circulou em
log e em URL publicada.

---

### CR-02: Em produção o cliente não recebe as mensagens de erro das Server Actions — a recuperação de double-booking morre

**File:** `src/app/actions/public-booking.ts:170-181,366-374`, `src/app/book/[slug]/BookingApp.tsx:157-165,271-287`
**Issue:**
Todo o tratamento de erro do booking público depende de `err.message` sobreviver à
travessia da Server Action:

```ts
// BookingApp.tsx:276
if (mensagem.includes('já foi preenchido')) { /* volta para a grade */ }
// BookingApp.tsx:159-163
setErroSlots(err instanceof Error ? err.message : '…')
```

Em build de produção isso não acontece. Verificado no runtime instalado:
`react-server-dom-webpack-server.node.production.js` expõe
`function emitErrorChunk(request, id, digest)` — só o digest atravessa — e o bundle
de cliente correspondente contém a string
`"An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details."`.
A documentação do Next instalada diz o mesmo em outras palavras
(`node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md:25`):
"avoid using try/catch blocks and throw errors. Instead, model expected errors as
return values".

Cenário concreto (entrada → estado → saída errada): dois clientes escolhem o mesmo
horário; o segundo confirma; a action lança "Este horário já foi preenchido…";
o cliente recebe um `Error` cuja `.message` é o texto genérico em inglês;
`includes('já foi preenchido')` dá `false`; o `else` executa e o visitante fica
travado na etapa de contato com um texto de framework em inglês na caixa vermelha,
apontando para um horário que não existe mais. A grade nunca é refeita. O mesmo vale
para a copy `'Não foi possível carregar os horários. Tente de novo.'`, que o
01-UI-SPEC trata como contrato de copy verbatim.

Em `pnpm dev` o comportamento é o esperado (mensagem preservada), o que é
precisamente o que faz esse defeito passar despercebido. A suíte de integração
(`public-booking-escrita.test.ts:363-435`) chama a action **em processo**, sem
serialização de flight — ela prova que a action produz a string certa e o próprio
comentário admite que não prova a renderização, mas o efeito prático é dar sinal
verde a um caminho que não funciona em produção.

**Fix:** modelar erro esperado como valor de retorno em vez de `throw`, mantendo
`throw` só para o inesperado:
```ts
type ResultadoAgendamento =
    | { ok: true; agendamento: { id: string; data_hora: string; status: string } }
    | { ok: false; motivo: 'slot_indisponivel' | 'slug_invalido' | 'erro_interno'; mensagem: string }

// BookingApp decide pelo `motivo` (discriminante estável), nunca por substring:
if (!res.ok && res.motivo === 'slot_indisponivel') { /* volta para a grade */ }
```
O teste de acoplamento por substring
(`public-booking-escrita.test.ts:390-399`) deixa de ser necessário — some junto com
o acoplamento que ele existia para vigiar.

---

### CR-03: O link público de um tenant pode ser sequestrado por outro tenant (colisão `slug` × `slug_gratuito`)

**File:** `supabase/schemas/01_perfis_empresas.sql:3-4`, `src/app/actions/public-booking.ts:36-50`
**Issue:**
`slug` é `NOT NULL UNIQUE`; `slug_gratuito` é apenas `NOT NULL` — **sem UNIQUE** e sem
nenhuma checagem cruzada entre as duas colunas. `resolverPerfilPublicoPorSlug` busca
primeiro por `slug` e só cai em `slug_gratuito` quando a primeira não retorna linha.

Cenário concreto:

1. Tenant B (pago) escolhe slug customizado `bela-unhas`; seu `slug_gratuito`
   continua sendo o aleatório `k3f9x2ab` (`perfis-empresas.ts:150-163` preserva o
   `slug_gratuito` existente).
2. B cancela a assinatura. O slug efetivo de B passa a ser `k3f9x2ab`
   (`obterSlugEfetivo`), e é esse link que B divulga. A coluna `slug` de B continua
   valendo `bela-unhas`.
3. Tenant A (pago, concorrente) grava `slug = 'k3f9x2ab'`. O `UNIQUE` de `slug` não
   reclama: ninguém tem `slug = 'k3f9x2ab'` — o de B é `bela-unhas`.
4. Uma visita a `/book/k3f9x2ab` casa na **primeira** query, encontra A,
   `obterSlugEfetivo(A, 'pro') === 'k3f9x2ab'`, e a página de A é servida.

Resultado: o link público de B passa a exibir a página de A, e os agendamentos —
com nome e telefone dos clientes finais de B — caem na base de A. Nada na UI de B dá
sinal. O mesmo vale para todo perfil criado já em plano pago
(`perfis-empresas.ts:165-167` gera um `slug_gratuito` diferente do `slug` desde o
primeiro save), cujo `slug_gratuito` fica reclamável por qualquer outro tenant a
qualquer momento.

Sem UNIQUE, há ainda o caso degenerado de dois tenants com o mesmo `slug_gratuito`:
o `.maybeSingle()` do fallback (`public-booking.ts:43-47`) devolve erro por múltiplas
linhas e os **dois** links viram 404.

Não foi introduzido pela Phase 1 (a ordem de resolução e o schema são anteriores),
mas é o furo de isolamento entre tenants que sobrou depois de a Data API ser fechada,
e vive em dois arquivos entregues nesta fase.

**Fix:** fechar no banco e na action.
```sql
-- migration nova
create unique index uq_perfis_empresas_slug_gratuito
  on public.perfis_empresas (slug_gratuito);

-- e o namespace compartilhado entre as duas colunas:
alter table public.perfis_empresas
  add constraint ck_slug_nao_colide_com_gratuito
  check (slug = slug_gratuito or true); -- placeholder: ver nota abaixo
```
A checagem cruzada não cabe num CHECK de linha (é entre linhas). Duas saídas
compatíveis com o projeto: (a) prefixar os slugs de provisionamento com um marcador
reservado (ex.: `g-<aleatório>`) e rejeitar na action qualquer slug customizado com
esse prefixo — resolve por construção, sem query extra; ou (b) validar em
`salvarPerfilEmpresa` com `select tenant_id from perfis_empresas where slug_gratuito = $1 and tenant_id <> $2`
antes de gravar. Em qualquer das duas, vale inverter a precedência em
`resolverPerfilPublicoPorSlug` ou exigir que a resolução seja não-ambígua (buscar
`or(slug.eq.X,slug_gratuito.eq.X)` e recusar quando vier mais de uma linha).

---

### CR-04: Nome e telefone do cliente final vão para o log da aplicação

**File:** `src/lib/whatsapp-helper.ts:87-99`
**Issue:**
```ts
console.error(
    `Erro ao disparar WhatsApp via Evolution (${response.status}):`,
    await response.text(),
)
```
O corpo de erro da Evolution é despejado cru no log. A própria
`docs/09-OBSERVABILIDADE_E_EMAIL.md:123-125` e o cabeçalho de
`src/lib/observabilidade/sanitizacao.ts:96-101` afirmam, como fato observado, que
esse payload "ecoa telefone e o texto já com `{{cliente}}` substituído" — e usam esse
fato para justificar o descarte do breadcrumb de console no Sentry. A trava foi
aplicada ao Sentry; o log da aplicação (Railway) continua recebendo o dado. O
invariante do projeto é "nunca PII em telemetria/log", e log está explicitamente na
lista.

O reporte ao Sentry logo abaixo (`reportarFalhaSilenciosa('whatsapp:falha_transporte', { statusCode })`)
está correto e mostra que o padrão seguro já é conhecido — só não foi aplicado à
linha de `console.error`.

O `console.error` gêmeo em `src/lib/whatsapp-helper.ts:164-167` tem o mesmo problema
com outro dado: o corpo de erro do QStash pode ecoar a URL de destino, que carrega a
chave de assinatura (CR-01).

**Fix:**
```ts
if (!response.ok) {
    // Corpo do gateway NUNCA é logado: ecoa número e o texto já personalizado.
    console.error(`Erro ao disparar WhatsApp via Evolution: http_${response.status}`)
    reportarFalhaSilenciosa('whatsapp:falha_transporte', { statusCode: response.status })
    return { ok: false, motivo: `http_${response.status}` }
}
```
Mesmo tratamento na chamada do QStash: logar só `response.status`.

## Warnings

### WR-01: A Server Action pública devolve `tenant_id` e `slug_gratuito` ao chamador

**File:** `src/app/actions/public-booking.ts:20-21,348-352`
**Issue:** `COLUNAS_PERFIL_PUBLICO` inclui `tenant_id`, e `obterDadosBookingPublico`
devolve `{ ...perfil }` inteiro. `page.tsx:79-80` tem o cuidado explícito de nunca
passar o `org_id` cru ao browser (envia `hashTenantId(perfil.tenant_id)`), mas a
action é, por definição, um endpoint de rede: quem invocá-la diretamente com um slug
válido recebe o `org_id` do Clerk daquele tenant e o `slug_gratuito`. Fechar
`assinaturas` para `anon` (migration `20260722044858`) teve como motivo declarado
justamente impedir que o `org_id` fosse obtido por quem tem só a chave publicável;
esta é a mesma informação por outra porta, uma requisição por slug. Não é BLOCKER
porque exige o action id (`obterDadosBookingPublico` não é referenciada por nenhum
client component, então não está no manifesto do bundle) e não permite enumeração em
massa — só a consulta dirigida a um slug conhecido.
**Fix:** estreitar o retorno em vez do `select`. Manter `tenant_id` na projeção (o
filtro por tenant depende dele) e não devolvê-lo:
```ts
const { tenant_id, slug_gratuito, ...perfilPublico } = perfil
return { perfil: { ...perfilPublico, cor_marca: null, logo_url: null, capa_url: null },
         tenantHash: hashTenantId(tenant_id), personalizacao, servicos: servicos || [] }
```

---

### WR-02: O `ALTER DEFAULT PRIVILEGES` fecha tabelas e sequences, mas não funções — RPC nova nasce executável por `anon`

**File:** `supabase/migrations/20260722060000_fecha_data_api_para_anon.sql:55-68`
**Issue:** O cabeçalho promete que "a default privilege torna o futuro seguro por
padrão", mas só cobre `TABLES` e `SEQUENCES`. No Postgres, função nova nasce com
`EXECUTE` concedido a `PUBLIC` — e o PostgREST expõe funções do schema `public` como
RPC. Uma função criada numa fase futura (o padrão já existe: a Phase 1 fala em
`perfis_cobranca` e `eventos_asaas`) fica chamável por `POST /rest/v1/rpc/<func>` com
a chave publicável, sem que nenhuma policy nem GRANT novo precise existir — o mesmo
modo de falha da "armadilha carregada" descrito na migration `20260722145948`. O
projeto já conhece o remédio: `03_horarios_funcionamento.sql:101` faz
`REVOKE ALL ON FUNCTION … FROM public, anon` à mão, um por função.
**Fix:** migration manual acrescentando a default privilege de funções (revogar de
`PUBLIC`, não de `anon` — a concessão padrão é a `PUBLIC`, revogar só de `anon` não
tem efeito):
```sql
alter default privileges for role postgres in schema public
  revoke all on functions from public;
alter default privileges for role postgres in schema public
  grant execute on functions to service_role;
```
E acrescentar a linha ao checklist de `docs/03-PADROES_DE_BANCO_DE_DADOS.md §e`.

---

### WR-03: Caminho de escrita público sem limite de tamanho e sem validação de e-mail

**File:** `src/app/actions/public-booking.ts:103-115,217-227`
**Issue:** `criarAgendamentoPublico` valida presença dos campos e sanitiza o telefone
(10–11 dígitos), mas `clienteNome` não tem limite de comprimento e `clienteEmail` não
tem validação de formato nem de tamanho — e as colunas `clientes.nome` / `.email` são
`text` sem CHECK. A UI nem envia mais `clienteEmail` (`BookingApp.tsx:262-268`), o que
significa que o único caminho que ainda alimenta esse campo é a invocação direta da
action. Consequências concretas: linhas de tamanho arbitrário na tabela `clientes` de
qualquer tenant, e `clienteNome` entra direto no template do WhatsApp
(`whatsapp-helper.ts:35`) — um nome de 100 kB vira uma mensagem de 100 kB disparada
na instância Evolution do profissional. Este item é distinto do rate limiting
registrado em `docs/PENDENCIAS.md:773` (que permanece aberto por decisão) e custa
quatro linhas.
**Fix:**
```ts
const nomeLimpo = clienteNome.trim().slice(0, 80)
if (nomeLimpo.length < 2) throw new Error('Informe seu nome.')
const emailLimpo = clienteEmail?.trim().slice(0, 120) || null
if (emailLimpo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailLimpo)) {
    throw new Error('E-mail inválido.')
}
```
(e o CHECK equivalente em `supabase/schemas/06_clientes.sql`, já que o RLS não filtra
mais nada neste caminho).

---

### WR-04: A verificação por `req.url` pode matar todos os lembretes em silêncio atrás do proxy

**File:** `src/app/api/webhooks/lembrete/route.ts:27-36`, `src/lib/qstash-assinatura.ts:57`
**Issue:** A claim `sub` do JWT casa contra `req.url`. Atrás do proxy da Railway, a URL
que o Next reconstrói depende de `host`/`x-forwarded-proto`; qualquer divergência de
protocolo, host ou barra final em relação a `APP_URL` (que foi o que o QStash assinou)
faz `receiver.verify` recusar **todas** as requisições. O caminho de falha é
inteiramente silencioso: `console.warn` mais um 401, sem linha em `disparos_whatsapp`,
sem reporte ao Sentry, e o cliente final não reclama de mensagem que não chegou — que
é o modo de falha que a `docs/09` diz querer eliminar. O harness só prova negativas
(401 para sonda inválida, `scripts/verificar-fail-fast-boot.sh:272-289`); nenhum
artefato automatizado prova o positivo.
**Fix:** duas coisas independentes.
1. Detectar: contabilizar a recusa antes do 401 —
   `await registrarDisparo(supabase, { tenantId: 'desconhecido', tipo: 'lembrete', status: 'ignorado', motivo: 'assinatura_invalida' })`
   não serve (não há tenant ainda), então o caminho é
   `reportarFalhaSilenciosa('qstash:assinatura_recusada')`, com a ressalva de ruído
   sob varredura — ou, mais barato, um contador de eventos PostHog sem PII.
2. Robustecer: normalizar o protocolo a partir de `x-forwarded-proto` antes de
   verificar, ou tentar a verificação com `req.url` e, em caso de falha, com a mesma
   URL sob `https`.

---

### WR-05: `docs/PENDENCIAS.md` descreve como aberto o que esta fase fechou, e não registra o resíduo

**File:** `docs/PENDENCIAS.md:1071-1077`
**Issue:** O item de revisão de segurança ainda afirma: "o secret trafega em query
string **e o fallback `'secret-key'` vale nos dois lados** quando
`QSTASH_CURRENT_SIGNING_KEY` não está setada […]; o ideal é migrar para verificação
da assinatura real do QStash (header `Upstash-Signature`)". O fallback foi extinto no
commit `a63a143` e a verificação por assinatura foi implementada nesta fase — as duas
afirmações são falsas hoje. Ao mesmo tempo, a parte que **continua** verdadeira e
agora é o achado mais grave da fase (a chave de assinatura na query string, CR-01) não
aparece em nenhuma seção como pendência viva pós-Phase 1. O resto do documento é
exemplar nesse aspecto (as seções de superfície remanescente e de enumeração de
`org_id` têm registro de fechamento com medição), o que torna esta entrada uma
inconsistência isolada — e o item 6 da Definition of Done do `CLAUDE.md` exige a
atualização.
**Fix:** reescrever o item: marcar a autenticação por assinatura como fechada
(apontando `src/lib/qstash-assinatura.ts` e a migration de env), e abrir um item novo
para a chave na query string, com o plano de duas etapas do CR-01 (parar de publicar
com o parâmetro agora; rotacionar as signing keys depois de a fila secar).

---

### WR-06: Falha de transporte do WhatsApp devolve 500 e o QStash reenvia — lembrete duplicado para o cliente final

**File:** `src/app/api/webhooks/lembrete/route.ts:170-192`
**Issue:** Quando `enviarMensagemWhatsApp` devolve `{ok:false}`, o handler registra a
falha e devolve 500 explicitamente para que o QStash tente de novo. Só que
`{ok:false}` cobre também `motivo: 'erro_rede'` (`whatsapp-helper.ts:102-106`), isto
é, timeout — o caso em que a Evolution pode ter entregado a mensagem e a resposta
é que se perdeu. Não há checagem de idempotência: nada consulta
`disparos_whatsapp` por um lembrete já `executado` para o mesmo `agendamento_id`
antes de disparar. Resultado concreto: o cliente final recebe o mesmo lembrete duas
ou três vezes, o que num produto cujo diferencial é o WhatsApp custa reputação do
profissional. O comentário no código antecipa a duplicidade só no log ("linhas
duplicadas de log entre tentativas são aceitáveis"), não na mensagem.
**Fix:** antes do envio, curto-circuitar quando já houver disparo executado:
```ts
const { data: jaExecutado } = await supabase
    .from('disparos_whatsapp')
    .select('id')
    .eq('agendamento_id', agendamentoId)
    .eq('tipo', 'lembrete')
    .eq('status', 'executado')
    .maybeSingle()
if (jaExecutado) return NextResponse.json({ success: true, message: 'Lembrete já enviado.' })
```
E devolver 200 (sem retry) para motivos que o retry não conserta, reservando o 500
para `erro_rede`.

---

### WR-07: Erro de leitura em `assinaturas` degrada um tenant pago a gratuito em silêncio — e derruba o link público dele

**File:** `src/lib/assinaturas.ts:78-81`
**Issue:** `obterPlanoVigentePublico` trata qualquer erro como `'gratuito'`, com um
`console.error` e nada mais. O JSDoc alerta para o caso do cliente errado, mas a
degradação vale para **qualquer** falha de leitura (indisponibilidade transitória,
`permission denied` depois de uma migration de privilégio, timeout). A consequência
mudou de escala nesta fase: `resolverPerfilPublicoPorSlug` agora compara
`obterSlugEfetivo(perfil, plano) !== slug` e devolve `null` quando não bate. Cenário:
tenant Pro com slug customizado `bela-unhas`; a leitura de `assinaturas` falha; o
plano vira `'gratuito'`; o slug efetivo vira o `slug_gratuito`; `/book/bela-unhas`
responde **404** para os clientes de um cliente pagante — sem alerta, sem evento,
sem linha no Sentry. Isso contradiz a política da própria fase, que instrumentou três
pontos de `public-booking.ts` exatamente porque "a causa raiz é apagada num fluxo sem
sessão"; erro de infraestrutura em `assinaturas` não é condição esperada de negócio.
**Fix:**
```ts
if (error) {
    console.error('Erro ao buscar plano vigente (público):', error.message)
    reportarFalhaSilenciosa('assinaturas:leitura_publica_falhou', { rotulo: error.code ?? 'sem_codigo' })
    return 'gratuito'
}
```
Vale considerar, além disso, propagar o erro em `resolverPerfilPublicoPorSlug` em vez
de deixar o 404 acontecer: 404 é a resposta para "slug não existe", não para "não
consegui ler o plano".

---

### WR-08: O harness de superfície anônima não distingue "tabela fechada" de "tabela inexistente"

**File:** `scripts/verificar-superficie-anon.sh:148-158,210-225`
**Issue:** `checar_leitura` classifica como ESPERADO **qualquer** código diferente de
200. Um 404/PGRST205 por tabela renomeada, por typo no nome ou por schema trocado é
indistinguível de um 404 por "a role perdeu o privilégio e a tabela sumiu do cache".
Como este script é o artefato de prova da fase (e é citado como evidência de
fechamento em `docs/PENDENCIAS.md`), o modo de falha é caro: renomeie
`whatsapp_configs` numa fase futura sem atualizar a lista da linha 223 e a checagem
continua verde para sempre, enquanto a tabela nova fica sem cobertura nenhuma.
**Fix:** provar que a tabela existe antes de afirmar que está fechada — uma checagem
de sanidade com a secret key (a única do script que precisaria dela) ou, sem tocar em
segredo, um veredito INCONCLUSIVO para `PGRST205`/404 quando o nome não constar de uma
lista de tabelas conhecidas mantida no próprio script e conferida contra
`supabase/schemas/*.sql`:
```bash
# ex.: derivar a lista dos schemas declarativos, em vez de redigitá-la
mapfile -t TABELAS_CONHECIDAS < <(grep -hoiP '(?<=^create table )\w+' supabase/schemas/*.sql)
```

---

_Reviewed: 2026-07-22_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
