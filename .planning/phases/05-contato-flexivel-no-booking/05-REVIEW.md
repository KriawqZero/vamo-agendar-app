---
phase: 05-contato-flexivel-no-booking
reviewed: 2026-08-13T08:15:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - src/app/actions/public-booking.ts
  - src/app/actions/__tests__/public-booking-dedupe.test.ts
  - src/app/actions/__tests__/public-booking-notificacoes.test.ts
  - src/lib/notificacoes-agendamento.ts
  - src/app/book/[slug]/BookingApp.tsx
  - src/app/book/[slug]/etapas/EtapaContato.tsx
  - src/app/book/__tests__/EtapaContato.test.ts
  - src/emails/ConfirmacaoAgendamento.tsx
  - src/emails/__tests__/ConfirmacaoAgendamento.test.tsx
  - supabase/migrations/20260808100000_contato_flexivel_clientes.sql
findings:
  critical: 3
  warning: 10
  info: 5
  total: 18
status: issues_found
---

# Phase 05: Code Review Report

**Reviewed:** 2026-08-13T08:15:00Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

A fase entrega o que prometeu na superfície: o formulário público aceita WhatsApp,
e-mail ou ambos, a action revalida no servidor, o slot continua sendo validado por
igualdade exata de `datetime` contra a engine antes do INSERT, o honeypot segue intacto e
nenhum dado pessoal novo atravessa para Sentry ou PostHog (`contextoMeta` só carrega
`fluxo`/`tenantHash`/`agendamentoHash`, e a allowlist valida a FORMA dos hashes desde o
WR-07 da Phase 3). `pnpm lint`, `pnpm test` (430 testes) e `tsc --noEmit` passam.

O problema não está no caminho feliz — está em três eixos que o verde não mede.

Primeiro, o **schema declarativo não acompanhou a migration**: `supabase/schemas/06_clientes.sql`
ainda declara `telefone text NOT NULL` e a RPC antiga com `ON CONFLICT`. O próximo
`supabase db diff` gera a migration que DESFAZ a Phase 05.

Segundo, a **RPC perdeu a atomicidade** que a Phase de integridade tinha comprado: o
`INSERT … ON CONFLICT` virou select-then-insert, e o índice de e-mail criado é NÃO-único —
ou seja, a dedupe por e-mail não tem nenhuma trava no banco.

Terceiro, e é o achado que a pergunta de escopo antecipou: **tornar o telefone opcional
abriu um caminho de escrita pública sem a camada de anti-abuso por contato**, e o mesmo
caminho passou a mandar e-mail transacional para um endereço escolhido pelo visitante, a
partir de um domínio verificado compartilhado por todos os tenants.

A cobertura de teste da fase é o sintoma que amarra tudo: o único teste "de deduplicação"
exercita uma função simulada declarada dentro do próprio arquivo de teste — nenhuma linha
do SQL entregue e nenhuma linha da action são exercitadas por ele.

## Critical Issues

### CR-01: Schema declarativo não atualizado — o próximo `db diff` reverte a Phase 05

**File:** `supabase/schemas/06_clientes.sql:6,65-87` (contra `supabase/migrations/20260808100000_contato_flexivel_clientes.sql:8-84`)

**Issue:** A migration foi escrita à mão e o schema declarativo, que o `CLAUDE.md` define
como fonte única (`DoD` item 2: "arquivo em `supabase/schemas/` + migration gerada via
`supabase db diff`"), continua no estado pré-fase:

- `06_clientes.sql:6` → `telefone text NOT NULL` (a migration derrubou o NOT NULL)
- ausente: `CONSTRAINT ck_clientes_contato_obrigatorio`
- ausente: `idx_clientes_tenant_email`
- `06_clientes.sql:65-87` → a RPC ainda é a versão `LANGUAGE sql` com `ON CONFLICT (tenant_id, telefone)`, sem lookup por e-mail

Cenário de falha concreto, e não hipotético: na próxima alteração de schema qualquer
(`npx supabase db diff --linked -f <nome>`), o diff compara o banco real contra
`supabase/schemas/` e emite, dentro da migration nova e sem ninguém pedir:
`ALTER TABLE clientes ALTER COLUMN telefone SET NOT NULL`,
`DROP CONSTRAINT ck_clientes_contato_obrigatorio`,
`DROP INDEX idx_clientes_tenant_email` e um `CREATE OR REPLACE FUNCTION` devolvendo a RPC
antiga. Aplicada, essa migration mata todo agendamento com e-mail-only em produção
(`null value in column "telefone" violates not-null constraint`) e apaga o lookup por
e-mail. O `SET NOT NULL` só falha se já existir linha com telefone nulo — ou seja, ou o
deploy quebra, ou passa e a feature some.

O mesmo vale para `db reset --local`: as migrations rodam e o banco fica certo, o que
esconde a divergência até o momento em que ela custa caro.

**Fix:** replicar em `supabase/schemas/06_clientes.sql` exatamente o que a migration fez —
`telefone text` (sem NOT NULL), a `CONSTRAINT ck_clientes_contato_obrigatorio`, o índice de
e-mail e o corpo novo da função — e conferir que `npx supabase db diff --linked` volta
VAZIO. Enquanto o diff não sair vazio, a fase não está fechada.

```sql
-- supabase/schemas/06_clientes.sql
CREATE TABLE clientes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id text NOT NULL,
    nome text NOT NULL,
    telefone text,                      -- nullable desde a Phase 05
    email text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES perfis_empresas(tenant_id) ON DELETE CASCADE,
    CONSTRAINT clientes_tenant_telefone_key UNIQUE (tenant_id, telefone),
    CONSTRAINT ck_clientes_contato_obrigatorio CHECK (telefone IS NOT NULL OR email IS NOT NULL)
);
-- + o índice único de e-mail (ver CR-02) e o corpo novo da RPC
```

---

### CR-02: A RPC perdeu a atomicidade e a dedupe por e-mail não tem trava no banco

**File:** `supabase/migrations/20260808100000_contato_flexivel_clientes.sql:14-16,33-73`

**Issue:** Dois defeitos que se somam.

**(a) O índice de e-mail é NÃO-único** (`:14-16`):

```sql
CREATE INDEX IF NOT EXISTS idx_clientes_tenant_email
  ON public.clientes (tenant_id, lower(email))
  WHERE email IS NOT NULL;
```

**(b) O upsert atômico virou select-then-insert** (`:33-62`): a versão anterior era
`INSERT … ON CONFLICT (tenant_id, telefone) DO UPDATE … COALESCE`, uma única ida ao banco,
e o comentário que a acompanhava no schema é explícito sobre o porquê ("duas requisições
simultâneas com o mesmo telefone criavam duas linhas na janela entre o SELECT e o
INSERT" — D-01/AGE-05). A nova versão faz `SELECT … LIMIT 1`, depois `UPDATE` ou `INSERT`.

Para o telefone, a `UNIQUE (tenant_id, telefone)` ainda existe, então a corrida é
capturada pelo `EXCEPTION WHEN unique_violation` — mais fraco que o original, mas coberto.
**Para o e-mail não existe cobertura nenhuma.** Cenário: cliente informa só o e-mail e
o formulário é submetido duas vezes em paralelo (duplo toque no CTA em rede lenta, retry
do navegador, ou o script de sempre). Ambas as transações executam o `SELECT` da linha 41
antes de qualquer `INSERT` comitar, ambas não encontram nada, ambas inserem — **duas linhas
`clientes` para a mesma pessoa**, exatamente a regressão que a `UNIQUE` de telefone foi
criada para impedir. A partir daí o `LIMIT 1` sem `ORDER BY` da linha 44 devolve uma das
duas de forma não-determinística, e o histórico do cliente se parte em dois no dashboard.

Um terceiro efeito, menor mas real: o handler de exceção (`:65-73`) pode devolver `NULL`
quando a `unique_violation` vier de uma constraint que não é nenhuma das duas consultadas.
`NULL` cai em `public-booking.ts:828` (`cError || !clienteId`) e o visitante recebe
`erro_interno` — agendamento perdido, com Sentry Issue de causa opaca.

**Fix:** dar ao e-mail a mesma trava que o telefone tem e restaurar a atomicidade:

```sql
-- 1. UNIQUE, não INDEX simples — é o alvo de inferência que falta
CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_tenant_email
  ON public.clientes (tenant_id, lower(email))
  WHERE email IS NOT NULL;

-- 2. e-mail normalizado na ESCRITA, para o índice e o lookup concordarem
--    (public-booking.ts: emailLimpo = clienteEmail?.trim().toLowerCase() || null)

-- 3. o INSERT volta a ser atômico; o lookup por e-mail continua como passo 1
INSERT INTO public.clientes (tenant_id, telefone, nome, email)
VALUES (p_tenant_id, p_telefone, p_nome, p_email)
ON CONFLICT (tenant_id, telefone) DO UPDATE
    SET email = COALESCE(public.clientes.email, EXCLUDED.email)
RETURNING id INTO v_cliente_id;
```

Se a atomicidade plena não couber no prazo, o mínimo inegociável é o índice ÚNICO: sem ele
o `EXCEPTION WHEN unique_violation` do caminho de e-mail é código morto que nunca dispara.

---

### CR-03: O caminho de e-mail-only não tem camada de anti-abuso por contato e virou relay de e-mail

**File:** `src/app/actions/public-booking.ts:671-674` + `src/lib/notificacoes-agendamento.ts:83-116`

**Issue:**

```ts
const passouTelefone = telefoneLimpo
    ? await verificarLimite('escrita_telefone', [telefoneLimpo, tenantId])
    : true
```

Sem telefone, o balde `escrita_telefone` é **pulado inteiro** — e nenhum balde
`escrita_email` foi criado para ocupar o lugar (`src/lib/rate-limit.ts:55` continua com as
quatro camadas da Phase 3). Restam na escrita: `escrita_ip` (10/10 min) e `teto_tenant`
(30 criações/hora, e ele conta CRIAÇÕES, não tentativas). O honeypot cobre bot genérico de
formulário, não script dirigido — quem lê o id da Server Action no bundle simplesmente não
manda o campo.

Isso já seria assimetria de defesa. O que torna o achado crítico é o que a Phase 05
plugou nesse caminho: `dispararNotificacoesAgendamento` agora **envia e-mail transacional
para o endereço que o visitante digitou** (`notificacoes-agendamento.ts:96-103`), via
Resend, a partir de `naoresponda@mail.vamoagendar.com.br` — domínio verificado
COMPARTILHADO por todos os tenants — com um nome de exibição de até 120 caracteres
controlado pelo atacante (`nomeCliente`, renderizado em `ConfirmacaoAgendamento.tsx:28`).

Cenário concreto: script escolhe um tenant qualquer, `email = vitima@dominio.com`,
`nome = <texto que o atacante quiser>`, sem telefone. Cada requisição bem-sucedida entrega
um e-mail na caixa da vítima. O teto por IP permite 10 a cada 10 min por IP (60/h), e o
`teto_tenant` corta em 30/h **por tenant** — com N tenants públicos, o teto agregado é
30·N por hora. Os e-mails saem todos do mesmo domínio verificado: marcações de spam e hard
bounces derrubam a reputação do remetente e, com ela, **todo o e-mail transacional de todos
os tenants**, incluindo os de boas-vindas da Phase 04. Não há verificação de posse do
endereço (a Fricção Zero proíbe OTP, e com razão), então o único controle disponível é o
teto — e é justamente ele que não existe nesse eixo.

Efeito colateral no mesmo ramo: o agendamento fantasma também entra na agenda do
profissional, e sem telefone o `teto_tenant` é a única coisa entre o atacante e o horizonte
lotado de nomes falsos.

**Fix:** criar o balde simétrico e aplicá-lo quando houver e-mail — chave por
(e-mail normalizado, tenant), igual ao de telefone, e CONSUMINDO (a assimetria consultar/
consumir do CR-02 da Phase 3 vale para o `teto_tenant`, não para o balde de contato):

```ts
// src/lib/rate-limit.ts
export type CamadaRateLimit =
    | 'escrita_ip' | 'escrita_telefone' | 'escrita_email' | 'teto_tenant' | 'leitura_ip'
// escrita_email: mesma janela do escrita_telefone

// src/app/actions/public-booking.ts
const [passouTelefone, passouEmail] = await Promise.all([
    telefoneLimpo ? verificarLimite('escrita_telefone', [telefoneLimpo, tenantId]) : true,
    emailLimpo ? verificarLimite('escrita_email', [emailLimpo.toLowerCase(), tenantId]) : true,
])
if (!passouTelefone || !passouEmail) {
    // mesma telemetria de rotina já existente, trocando `camada`
    return { ok: false, motivo: 'muitas_tentativas' }
}
```

O `chaveHash` do log continua sendo `hashChaveRateLimit(...)` — o e-mail nunca entra no
Sentry nem no Redis em claro, mesmo invariante do telefone.

## Warnings

### WR-01: O teste de deduplicação não exercita nada do que foi entregue

**File:** `src/app/actions/__tests__/public-booking-dedupe.test.ts:4-55`

**Issue:** O teste declara `simularLookup` — uma reimplementação em TypeScript da ordem de
busca — e depois faz asserções sobre essa reimplementação. Nem a RPC em SQL, nem
`criarAgendamentoPublico`, nem qualquer artefato da fase são carregados: o arquivo não tem
um único `import` de código de produção. Ele passaria com o banco vazio, com a migration
revertida (CR-01) e com a RPC deletada. É verde que não mede nada — o mesmo mecanismo de
falso-verde que já reprovou fase anterior neste repositório.

Pior: o comportamento CENTRAL da fase não tem teste de servidor nenhum. Em
`public-booking-validacao.test.ts` o `PARAMS_VALIDOS` (`:281-289`) sempre traz telefone E
e-mail; não existe caso para (a) telefone ausente + e-mail presente → `ok: true`, (b) ambos
ausentes → `campos_obrigatorios`, (c) e-mail-only não consome `escrita_telefone`.

**Fix:** apagar `simularLookup` e escrever, no arquivo de validação que já tem toda a
infraestrutura de mocks montada, os três casos acima — afirmando sobre o retorno real da
action e sobre os argumentos passados a `admin.rpc('reaproveitar_ou_criar_cliente', …)`
(`p_telefone: null`, `p_email: '…'`). Para a RPC em si, o teste honesto é de integração
contra o banco local (`npx supabase start`), não uma simulação.

---

### WR-02: As asserções de `EtapaContato.test.ts` não provam o que o título afirma

**File:** `src/app/book/__tests__/EtapaContato.test.ts:36-41,62-66`

**Issue:** O caso chamado "aplica atributo required no Nome, enquanto WhatsApp e E-mail são
opcionais" faz `expect(FONTE_ETAPA_CONTATO).toContain('required')` sobre o texto-fonte do
arquivo. A string `required` aparece no arquivo independentemente de em QUAL input ela
está: o teste continuaria verde se `required` voltasse para o campo de telefone — que é
exatamente a regressão que ele deveria pegar. O mesmo vale para `toContain('id="contato-telefone"')`,
que só prova que o input existe.

**Fix:** afirmar sobre o HTML renderizado, que já está disponível no primeiro caso:

```ts
const html = renderToStaticMarkup(React.createElement(EtapaContato, { /* … */ }))
expect(html).toMatch(/<input[^>]*id="contato-nome"[^>]*required/)
expect(html).not.toMatch(/<input[^>]*id="contato-telefone"[^>]*required/)
expect(html).not.toMatch(/<input[^>]*id="contato-email"[^>]*required/)
```

---

### WR-03: A confirmação não passa por `tb_email_log` — bounce e supressão ficam órfãos

**File:** `src/lib/notificacoes-agendamento.ts:96-111`

**Issue:** O envio chama `enviarEmail` direto, sem gravar nada em `tb_email_log`. O
webhook do Resend (`src/app/api/webhooks/resend/route.ts:72-88`) resolve o tenant de um
evento de bounce/supressão **exclusivamente** por `tb_email_log.resend_id`. Consequência:
todo `email.bounced` / `suppression.added` de um e-mail de confirmação cai no
`if (logEntry?.tenant_id)` como falso e o evento é descartado em silêncio — o profissional
nunca fica sabendo que a confirmação do cliente dele não chegou, e o `reportarExcecao`
de supressão só existe para os e-mails de boas-vindas.

Efeito secundário: a idempotência passa a depender só do `idempotencyKey` do Resend
(janela do fornecedor), sem registro próprio — ao contrário do fluxo de boas-vindas
(`src/lib/email-boas-vindas.ts:29,76-100`), que grava `pendente`/`enviado`/`falhou`.

**Fix:** reusar o padrão de `email-boas-vindas.ts` — inserir a linha `pendente` com
`chave_idempotencia = 'confirmacao-booking/<agendamentoId>'` e `tipo_email = 'confirmacao_agendamento'`
antes do envio, e atualizar com `resend_id`/`status` depois. Vale extrair essa gravação
para um helper compartilhado em vez de duplicá-la no segundo call site.

---

### WR-04: `replyTo` de fallback aponta para um endereço que não existe

**File:** `src/lib/notificacoes-agendamento.ts:78`

**Issue:**

```ts
const emailContato = perfil?.email_contato || 'nao-responda@vamoagendar.com.br'
```

O único endereço do produto é `ENDERECO_REMETENTE = 'naoresponda@mail.vamoagendar.com.br'`
(`src/lib/email/remetente.ts:9`) — sem hífen e no subdomínio `mail.`, que é o verificado no
Resend. O literal usado aqui difere nos dois pontos. `email_contato` é opcional
(`perfis-empresas.ts:284`, coluna adicionada sem NOT NULL), então **todo tenant que ainda
não preencheu o campo** manda confirmações cujo "Responder" vai para um endereço
inexistente: o cliente final responde pedindo para remarcar e recebe um bounce. Num
produto cuja regra de ouro é o cliente final nunca ter atrito, essa é uma perda de contato
real, e ela é silenciosa nas duas pontas.

**Fix:** usar a constante já centralizada e, de preferência, não fingir um canal de resposta
que não existe:

```ts
import { ENDERECO_REMETENTE } from './email/remetente'
const emailContato = perfil?.email_contato?.trim() || ENDERECO_REMETENTE
```

E registrar em `docs/PENDENCIAS.md` que tenant sem `email_contato` não tem canal de
resposta — ou tornar o campo obrigatório no onboarding.

---

### WR-05: O assunto monta o nome do tenant sem a sanitização que o remetente exige

**File:** `src/lib/notificacoes-agendamento.ts:100`

**Issue:**

```ts
assunto: `${empresaNome} via VamoAgendar: Agendamento Confirmado`,
```

`nome_estabelecimento` é input de usuário: `salvarPerfilEmpresa` só faz `.trim()`
(`src/app/actions/perfis-empresas.ts:136,281`) — sem teto de tamanho e sem remoção de
caracteres de controle. O mesmo valor, quando vai para o header `From`, passa por
`sanitizarNome` (`src/lib/email/remetente.ts:44-52`), que existe precisamente porque
"o nome vem do banco e é input de usuário". O assunto criado nesta fase não recebeu esse
tratamento.

O impacto imediato e certo é assunto malformado (CR/LF, caractere de controle, nome de 2 mil
caracteres truncado de forma imprevisível pelo cliente de e-mail). O impacto potencial —
que depende de o Resend codificar o header, o que provavelmente faz — é injeção de header.
Não é seguro depender do comportamento do fornecedor quando a sanitização já existe pronta
no repositório e custa uma chamada.

**Fix:** exportar `sanitizarNome` de `remetente.ts` (ou criar `rotuloSeguroDoTenant`) e
usá-la nos dois lugares, com teto de comprimento explícito:

```ts
const rotulo = rotuloSeguroDoTenant(empresaNome).slice(0, 78) // RFC 5322 recomenda linha curta
assunto: `${rotulo} via VamoAgendar: Agendamento Confirmado`,
```

---

### WR-06: As duas camadas de rate limit deixaram de correr em paralelo, e o comentário acima delas passou a mentir

**File:** `src/app/actions/public-booking.ts:658-674`

**Issue:** O bloco de comentário imediatamente acima do código afirma, como decisão
registrada:

> "As duas correm em PARALELO de propósito: o cliente legítimo paga a latência de UMA ida
> ao Redis, não de duas somadas (ABU-02/D-06)."

O `Promise.all` que sustentava a frase foi removido nesta fase; hoje são dois `await`
sequenciais. No caminho legítimo (com telefone) o visitante paga as duas idas ao Redis
somadas — a decisão ABU-02/D-06 foi desfeita sem ser discutida, e a documentação inline
agora descreve um código que não existe. Comentário que mente é pior que comentário
ausente: a próxima pessoa vai confiar nele.

**Fix:** restaurar o paralelismo mantendo o telefone condicional (a forma proposta no CR-03
já resolve os dois de uma vez):

```ts
const [passouTelefone, passouTenant] = await Promise.all([
    telefoneLimpo ? verificarLimite('escrita_telefone', [telefoneLimpo, tenantId]) : Promise.resolve(true),
    verificarLimiteSemConsumir('teto_tenant', [tenantId]),
])
```

---

### WR-07: Agendamento sem telefone não deixa rastro nenhum na auditoria de mensageria

**File:** `src/lib/notificacoes-agendamento.ts:121` (guarda `if (clienteTelefone && clienteTelefone.trim())`)

**Issue:** O ramo anterior, quando o telefone faltava, gravava em `disparos_whatsapp`
(`status: 'falha'`, `motivo: 'telefone_ausente'`), emitia log e evento. Agora o bloco de
WhatsApp inteiro é pulado **em silêncio**: nenhum log, nenhuma linha de auditoria, nenhum
evento. Para um tenant Pro que recebe um agendamento por e-mail, a auditoria
append-only de `disparos_whatsapp` fica indistinguível do caso em que o código de
notificação nunca rodou (deploy quebrado, `after()` perdido — ver IN-03). O `CLAUDE.md` é
explícito: falha silenciosa para o cliente final "NÃO significa … omitir auditoria em
`disparos_whatsapp`".

Como resíduo, `'whatsapp.telefone.ausente'` (`src/lib/observabilidade/log.ts:28`) virou
entrada morta em `MENSAGENS_LOG` — nenhum chamador restante.

**Fix:** registrar a condição esperada em vez de ignorá-la, com status próprio (não
`falha` — não é falha, é ausência de canal):

```ts
} else {
    logOperacional.info('whatsapp.canal.ausente', contextoMeta)
    await registrarDisparo(client, {
        tenantId, agendamentoId, tipo: 'confirmacao',
        status: 'ignorado', motivo: 'sem_telefone',
    })
}
```

E remover ou repropor `'whatsapp.telefone.ausente'` em `MENSAGENS_LOG`.

---

### WR-08: Cliente sem telefone é invisível no dashboard, e o tipo do dashboard virou mentira

**File:** `src/app/dashboard/DashboardClient.tsx:13,505-570` (consequência de `supabase/migrations/20260808100000_contato_flexivel_clientes.sql:8`)

**Issue:** Duas metades do mesmo problema.

(a) `interface Cliente { telefone: string }` (`:13`) declara não-nulo uma coluna que a
migration tornou nullable. Como os tipos são escritos à mão (sem ORM), o compilador não
acusa; a linha continua a compilar e a mentir. `DashboardClient` se defende por acaso
(`ag.clientes?.telefone || ''`, `:505`), mas qualquer consumidor futuro que escreva
`cliente.telefone.replace(...)` — padrão que já existe em `whatsapp-helper.ts:74` e
`actions/whatsapp.ts:474` — quebra em runtime.

(b) A agenda **não exibe e-mail em lugar nenhum**: o único contato renderizado é o link
`wa.me` (`:505-506,566`), condicionado a `telLimpo`. Um agendamento e-mail-only aparece
para o profissional como nome + horário e **nenhuma forma de falar com a pessoa** — apesar
de o e-mail estar gravado em `clientes.email`. A fase entregou a captura do contato e não
entregou a entrega dele a quem precisa: o Core Value do projeto é o agendamento chegar
inteiro na agenda do profissional.

**Fix:** `telefone: string | null` na interface (alinhando com `NovoAgendamentoModal.tsx:23`,
que já está correto), e renderizar o e-mail como `mailto:` no mesmo lugar do link de
WhatsApp quando o telefone for nulo:

```tsx
{telLimpo ? (
    <a href={waLink!} …>{ag.clientes?.telefone} ↗</a>
) : ag.clientes?.email ? (
    <a href={`mailto:${ag.clientes.email}`} …>{ag.clientes.email} ↗</a>
) : null}
```

(`src/app/dashboard/page.tsx:77` já projeta `email`, então o dado chega ao componente.)

---

### WR-09: Os códigos de log novos não existem em `MENSAGENS_LOG`

**File:** `src/lib/notificacoes-agendamento.ts:106,109`

**Issue:** `'email.confirmacao.enviado'` e `'email.confirmacao.falhou'` não estão em
`MENSAGENS_LOG` (`src/lib/observabilidade/log.ts:26-77`). `prepararLog` faz
`MENSAGENS_LOG[codigo] ?? codigo` (`log.ts:123`), então o título do Sentry Log vira o código
cru — quebrando o contrato 3 do módulo ("mensagens amigáveis em português no título,
preservando o código técnico no atributo `codigo`") e a busca por título que o resto da
mensageria assume. Não estoura nada; só degrada, e degrada em silêncio, que é o modo de
falha que este repositório vem combatendo.

**Fix:** acrescentar as duas entradas ao mapa, junto das do canal de WhatsApp:

```ts
'email.confirmacao.enviado': 'E-mail de confirmação do agendamento enviado',
'email.confirmacao.falhou': 'Falha ao enviar e-mail de confirmação do agendamento',
```

---

### WR-10: Oito dos arquivos da fase violam o Prettier do projeto

**File:** `src/emails/ConfirmacaoAgendamento.tsx:1-111`, `src/emails/__tests__/ConfirmacaoAgendamento.test.tsx:1-26`, `src/lib/notificacoes-agendamento.ts`, `src/app/book/[slug]/BookingApp.tsx`, `src/app/book/[slug]/etapas/EtapaContato.tsx`, os três arquivos de teste novos

**Issue:** `npx prettier --check` reprova os 8 arquivos. Os dois de `src/emails/` são os
piores: usam ponto e vírgula e indentação de 2 espaços, contra `.prettierrc`
(`semi: false`, `tabWidth: 4`) — ou seja, foram escritos fora da convenção e nunca passaram
pelo hook. `pnpm lint` passa porque o ESLint flat config não integra Prettier, então esse
desvio não tem gate automático.

O custo não é estético: o hook de pré-commit reformata arquivo inteiro, então o próximo
toque em qualquer um desses arquivos produz um diff gigante que enterra a mudança real na
revisão.

**Fix:** `npx prettier --write` nos oito arquivos, num commit isolado de formatação. Vale
avaliar acrescentar `prettier --check` ao gate junto de `pnpm lint`, já que o `CLAUDE.md`
trata os três comandos como DoD mas nenhum deles cobre formatação.

## Info

### IN-01: Asserção de não-nulo em vez de estreitamento

**File:** `src/app/actions/public-booking.ts:688`
**Issue:** `hashChaveRateLimit(telefoneLimpo!)`. Hoje é correto (só se chega ali com
`passouTelefone === false`, que exige `telefoneLimpo` truthy), mas o `!` desliga a única
verificação que garantiria isso depois de qualquer refatoração do bloco de camadas.
**Fix:** trocar a guarda por `if (telefoneLimpo && !passouTelefone) { … }`, que estreita o
tipo naturalmente e dispensa a asserção.

### IN-02: Regex de e-mail duplicada entre cliente e servidor

**File:** `src/app/book/[slug]/BookingApp.tsx:316`
**Issue:** `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` é uma cópia literal de `FORMATO_EMAIL`
(`public-booking.ts:110`). Duas cópias divergem: se o servidor apertar a regra, o cliente
segue aceitando e o visitante recebe `email_invalido` sem entender por quê. O teto de 254
caracteres, aliás, já só existe no servidor.
**Fix:** exportar `FORMATO_EMAIL` e `EMAIL_MAXIMO_CARACTERES` de um módulo compartilhado
(`src/lib/contato.ts`) e consumir nos dois lados. O servidor continua sendo a autoridade;
o cliente vira só a cópia amigável da mesma regra.

### IN-03: Notificações dentro de `after()` não têm retry nem persistência

**File:** `src/app/actions/public-booking.ts:929-944`
**Issue:** O desacoplamento é a decisão certa para a tela de sucesso (BOO-02), mas o
`after()` do Next roda dentro da mesma invocação e não é fila: se o container for
reiniciado (deploy na Railway) entre a resposta e o término do callback, a confirmação por
e-mail E o agendamento do lembrete no QStash somem **sem nenhum registro** — o
`registrarDisparo` também vive dentro do callback perdido. Não há reconciliação posterior.
**Fix:** por ora, registrar o risco residual em `docs/PENDENCIAS.md` (o padrão do
repositório é riscos aceitos ficarem escritos). A solução estrutural é publicar um job no
QStash para a confirmação também, em vez de executá-la in-process.

### IN-04: O template é renderizado antes de saber se o Resend está habilitado

**File:** `src/lib/notificacoes-agendamento.ts:86-103`
**Issue:** `render(...)` do React Email roda sempre; `enviarEmail` só então descobre que
não há `RESEND_API_KEY` e devolve `{ ok: false, motivo: 'desativado' }` — estado ESPERADO
em dev (EML-05). Todo booking local paga uma renderização completa de HTML jogada fora, e
o log emitido diz "falhou" para uma condição que é normal.
**Fix:** consultar o mesmo guard antes de renderizar, ou expor `emailHabilitado()` de
`src/lib/email/enviar.ts` e envolver o bloco.

### IN-05: O handler de exceção da RPC não reaplica o preenchimento de campos faltantes

**File:** `supabase/migrations/20260808100000_contato_flexivel_clientes.sql:65-73`
**Issue:** Quando a corrida é capturada, o handler apenas re-seleciona e retorna: o
`UPDATE … COALESCE` do passo 3 não é reexecutado. O cliente que perdeu a corrida informando
um e-mail novo tem o e-mail descartado silenciosamente.
**Fix:** com o upsert atômico restaurado (CR-02) o problema deixa de existir. Enquanto
isso, repetir o `UPDATE` dentro do handler antes do `RETURN`.

---

_Reviewed: 2026-08-13T08:15:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
