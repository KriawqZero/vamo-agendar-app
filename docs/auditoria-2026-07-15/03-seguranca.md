---
status: temporario
gerado: 2026-07-15 18:56
agente: seguranca
modelo: sonnet
---

# Auditoria de Segurança — VamoAgendar

Escopo: análise estática de `supabase/schemas/` (fonte de verdade declarativa), `supabase/migrations/`
(para confirmar que o estado aplicado bate com o schema declarado), todas as Server Actions em
`src/app/actions/`, o único webhook em `src/app/api/webhooks/lembrete/route.ts`, `src/proxy.ts`,
`src/lib/supabase/{server,admin}.ts`, integração Evolution API/QStash, e grep dirigido por segredos,
`NEXT_PUBLIC_*`, `console.log`, `dangerouslySetInnerHTML` e `service_role`. Nenhum comando foi
executado contra banco remoto, nenhum arquivo existente foi alterado, nenhum valor de `.env*` foi
lido (apenas nomes de variáveis e status no `.gitignore`). `docs/lixo/` não foi usado como referência.

**Achado principal**: o maior risco do sistema não está em código de aplicação — está em duas
políticas RLS que permitem que **qualquer requisição HTTP anônima, direto contra a Data API do
Supabase (com a publishable key, que é pública por definição em `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`)**,
contorne inteiramente as Server Actions e leia/escreva dados de **qualquer tenant** da plataforma. A
aplicação Next.js em si é cuidadosa (toda Server Action B2B valida `orgId` e refiltra por
`tenant_id`; os poucos usos de `createAdminClient()` são restritos e bem justificados) — o problema
é que a Data API do Supabase é uma segunda porta de entrada, e a defesa nela (RLS) tem duas lacunas
graves. Isso já está mapeado internamente em `docs/PENDENCIAS.md` (seção "Obrigatório antes do
lançamento público" → "Integridade e pertencimento multi-tenant"), mas segue **sem correção** no
código/banco atual — o que esta auditoria confirma de forma independente.

## Resumo por severidade

| Severidade | Qtde |
|---|---|
| CRITICO | 3 |
| ALTO | 5 |
| MEDIO | 3 |
| BAIXO | 4 |

---

## Tabela-resumo de RLS por tabela

`(SELECT auth.jwt() ->> 'org_id')` abreviado como `jwt.org_id`. "público" = `USING (true)` ou
equivalente, sem filtro de tenant.

| Tabela | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `perfis_empresas` | **anon+authenticated: público** (todas as colunas) | authenticated, `tenant_id=jwt.org_id` | authenticated, `tenant_id=jwt.org_id` | authenticated, `tenant_id=jwt.org_id` |
| `servicos` | **anon+authenticated: público** (`ativo=true`, sem filtro tenant) + authenticated: próprio tenant | authenticated, `tenant_id=jwt.org_id` | authenticated, `tenant_id=jwt.org_id` | authenticated, `tenant_id=jwt.org_id` |
| `horarios_funcionamento` | **anon+authenticated: público** (`ativo=true`, sem filtro tenant) + authenticated: próprio tenant | authenticated, `tenant_id=jwt.org_id` | authenticated, `tenant_id=jwt.org_id` | authenticated, `tenant_id=jwt.org_id` |
| `excecoes_agenda` | **anon+authenticated: público total**, sem nenhum filtro | authenticated, `tenant_id=jwt.org_id` | authenticated, `tenant_id=jwt.org_id` | authenticated, `tenant_id=jwt.org_id` |
| `whatsapp_configs` | authenticated, `tenant_id=jwt.org_id`. Sem `anon`. | authenticated, `tenant_id=jwt.org_id` | authenticated, `tenant_id=jwt.org_id` | authenticated, `tenant_id=jwt.org_id` |
| `clientes` | authenticated, `tenant_id=jwt.org_id`. Sem `anon`. | **anon+authenticated: `WITH CHECK (tenant_id IS NOT NULL)`** — não valida que o tenant existe nem pertença | authenticated, `tenant_id=jwt.org_id` | authenticated, `tenant_id=jwt.org_id` |
| `agendamentos` | **anon+authenticated: público total** (`USING (true)`), sem filtro | **anon+authenticated: `WITH CHECK (tenant_id IS NOT NULL)`** — idem | authenticated, `tenant_id=jwt.org_id` | authenticated, `tenant_id=jwt.org_id` |
| `assinaturas` | authenticated: próprio tenant. anon: público, mas GRANT restrito por coluna a `tenant_id/plano/status` | sem policy (bloqueado por ausência de policy permissiva) | sem policy (bloqueado) | sem policy (bloqueado) |
| `disparos_whatsapp` | authenticated, `tenant_id=jwt.org_id`. Sem `anon`. | authenticated, `tenant_id=jwt.org_id`. Sem `anon`. | sem policy (bloqueado — log append-only) | sem policy (bloqueado) |

Todas as 9 tabelas têm `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` (confirmado em
`supabase/schemas/*.sql` e no `baseline_schema_inicial.sql`), e há um event trigger
(`supabase/schemas/00_funcoes_sistema.sql`, `rls_auto_enable()`) que força RLS em qualquer tabela
nova criada em `public` — boa rede de segurança estrutural. O problema não é "RLS ausente", é
**política RLS presente porém excessivamente permissiva** em `agendamentos` e `clientes` (INSERT) e
em `agendamentos`, `excecoes_agenda`, `perfis_empresas`, `servicos`, `horarios_funcionamento`
(SELECT sem filtro de tenant).

---

## CRITICO

### C1 — INSERT anônimo em `agendamentos`/`clientes` contorna toda a Server Action (fabricação de reservas para qualquer tenant)

**Evidência**: `supabase/schemas/07_agendamentos.sql:24-27` e `supabase/schemas/06_clientes.sql:20-23`:
```sql
CREATE POLICY "Permitir INSERT público para visitantes"
ON agendamentos FOR INSERT TO anon, authenticated
WITH CHECK (tenant_id IS NOT NULL);
```
A política não confere se o `tenant_id` informado existe, se o `servico_id` pertence a ele, se o
horário está livre ou se o `status` é válido para criação — nada disso. Toda a lógica de negócio
(existência do tenant, serviço ativo do mesmo tenant, engine de disponibilidade, prevenção de
double-booking) vive **só** em `src/app/actions/public-booking.ts`, e a Data API do Supabase é
alcançável diretamente com a `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (pública por design, embutida no
bundle do client).

**Cenário de exploração**: um script lê `servico_id` de qualquer tenant via SELECT público em
`servicos` (sem login), cria um `cliente` para esse `tenant_id` via `POST /rest/v1/clientes`
informando um `id` (UUID) escolhido pelo próprio atacante, e então faz `POST /rest/v1/agendamentos`
com `tenant_id`, `cliente_id`, `servico_id`, `data_hora` e `status: 'confirmado'` arbitrários — sem
passar pela engine de slots, sem rate limit, sem qualquer validação. Repetido em loop, lota a agenda
inteira de um concorrente com reservas falsas "confirmadas", bloqueando clientes reais.

**Correção**: remover as políticas de INSERT `anon` nessas duas tabelas (já é a direção registrada em
`docs/PENDENCIAS.md`) e mover a escrita operacional do fluxo público **inteiramente** para
`createAdminClient()` no servidor, como já é feito para o restante do fluxo em
`src/app/actions/public-booking.ts`.

---

### C2 — SELECT público sem filtro de tenant em `agendamentos` expõe a agenda completa de todos os tenants

**Evidência**: `supabase/schemas/07_agendamentos.sql:19-22`:
```sql
CREATE POLICY "Permitir SELECT público para todos"
ON agendamentos FOR SELECT TO anon, authenticated
USING (true);
```
Sem `GRANT` por coluna (diferente do que já foi feito em `assinaturas`), então toda coluna —
incluindo `cliente_id`, `servico_id`, `data_hora`, `status`, `tenant_id` — é legível por qualquer
requisição anônima.

**Cenário de exploração**: `GET /rest/v1/agendamentos?select=*` (sem `Authorization`, só a
publishable key) devolve o histórico completo de agendamentos de **todos os tenants** da plataforma
desde o início — volume de negócio, horários de pico, taxa de ocupação por concorrente, e
`cliente_id`s que, cruzados com qualquer vazamento futuro de `clientes`, reidentificam pessoas.

**Correção**: restringir a política a `GRANT SELECT (tenant_id, data_hora, status, servico_id)` (a
engine não precisa de `cliente_id`) e, se a leitura pública precisar continuar existindo para a
engine de slots funcionar sem sessão, considerar romper a dependência de leitura anônima na tabela e
mover a checagem de slots ocupados para uma função `SECURITY DEFINER`/RPC que devolve só os
intervalos ocupados, nunca as linhas cruas.

---

### C3 — Webhook de lembrete com autenticação fraca: secret em query string + fallback hardcoded

**Evidência**: `src/app/api/webhooks/lembrete/route.ts:12-19`:
```ts
const secret = searchParams.get('secret')
const qstashSecret = process.env.QSTASH_CURRENT_SIGNING_KEY || 'secret-key'
if (secret !== qstashSecret) { ... 401 ... }
```
e o lado que agenda o job, `src/lib/whatsapp-helper.ts:116-117`:
```ts
const secret = process.env.QSTASH_CURRENT_SIGNING_KEY || 'secret-key'
const webhookUrl = `${APP_URL}/api/webhooks/lembrete?secret=${secret}`
```
Duas falhas independentes: (1) o segredo trafega na **query string**, que é rotineiramente
persistida em logs de infraestrutura, ferramentas de APM e histórico de proxy — ao contrário de um
header, não há convenção de redação automática; (2) se `QSTASH_CURRENT_SIGNING_KEY` não estiver
definida no ambiente, os dois lados caem silenciosamente no literal `'secret-key'`, um segredo
**hardcoded no código-fonte**. Além disso, isto não é verificação real da assinatura do QStash — o
mecanismo correto é validar o header `Upstash-Signature` (biblioteca `@upstash/qstash`, ausente do
`package.json`), o que autenticaria a origem real da requisição em vez de comparar um segredo
compartilhado exposto na URL.

**Cenário de exploração**: se a env não estiver setada em algum ambiente (preview, staging, ou
produção mal configurada), qualquer um que leia este arquivo de código (repositório privado
comprometido, colaborador, cópia local) pode chamar `POST /api/webhooks/lembrete?secret=secret-key`
com `{agendamentoId, tenantId}` conhecidos e forçar o reenvio de mensagens de WhatsApp reais a
clientes reais, fora de qualquer controle da aplicação.

**Correção**: migrar para verificação da assinatura real do QStash via `Receiver` do SDK
`@upstash/qstash` (header `Upstash-Signature`), eliminando o segredo customizado e seu fallback.
Já identificado internamente em 2026-07-14 (`docs/PENDENCIAS.md`, "Demais preparações de
lançamento") como pendência pré-existente — confirmado aqui como ainda não corrigido.

---

## ALTO

### A1 — Vazamento do `instance_token` da Evolution API para o navegador via Server Actions

**Evidência**: `src/app/actions/whatsapp.ts:130-147` (`criarInstanciaWhatsApp`, reaproveitado por
`reiniciarConexaoWhatsApp` na linha 448) e `:46-63` (`salvarTemplatesMensagem`):
```ts
const { data, error } = await supabase
    .from('whatsapp_configs')
    .upsert({ ..., instance_token: instanceToken, ... }, { onConflict: 'tenant_id' })
    .select()      // <- sem lista de colunas: traz TODAS, inclusive instance_token
    .single()
...
return data        // <- valor de retorno de Server Action é serializado até o browser
```
O mesmo padrão se repete em `salvarTemplatesMensagem` (linhas 46-63, `.update(...).select().single()`
seguido de `return data`). O próprio arquivo `src/app/dashboard/whatsapp/WhatsappClient.tsx:15-16`
documenta a regra que essas duas funções quebram: *"Nunca incluir instance_token aqui: esta
interface descreve a prop serializada até o browser — o token é segredo e fica restrito ao
servidor."* — `sincronizarStatusWhatsApp()` e `enviarMensagemTesteWhatsApp()`, no mesmo arquivo de
actions, seguem a regra corretamente (`select()` com lista explícita de colunas, ou não retornam
`config`).

**Cenário de exploração**: o profissional abre o DevTools (ou usa um computador compartilhado, ou
compartilha um export de HAR/log de rede para suporte) ao clicar em "Conectar WhatsApp" ou "Salvar
templates" — o payload de resposta da Server Action, visível na aba Network, contém o
`instance_token` em texto puro. Com ele, qualquer pessoa chama diretamente
`POST {EVOLUTION_API_URL}/message/sendText/{instanceName}` e envia mensagens arbitrárias em nome do
número de WhatsApp do estabelecimento, fora de qualquer log ou controle do VamoAgendar.

**Correção**: em ambas as funções, trocar `.select()` por uma lista explícita de colunas sem
`instance_token` (mesmo padrão já usado em `sincronizarStatusWhatsApp`) antes do `return`.

---

### A2 — `excecoes_agenda`: SELECT público sem nenhum filtro expõe `motivo` (texto livre) de todos os tenants

**Evidência**: `supabase/schemas/04_excecoes_agenda.sql:18-21`:
```sql
CREATE POLICY "Permitir SELECT público para todos"
ON excecoes_agenda FOR SELECT TO anon, authenticated
USING (true);
```
Nem sequer há um filtro `bloqueado = true` como em outras tabelas — a linha inteira, incluindo o
campo `motivo` de texto livre preenchido pelo profissional (ex.: "viagem", "médico", "fechado por
reforma"), é pública para qualquer tenant, sem filtro de `tenant_id`.

**Cenário de exploração**: `GET /rest/v1/excecoes_agenda?select=*` lista todos os bloqueios futuros
de agenda de todos os estabelecimentos da plataforma. Além de vazar informação de negócio de
concorrentes, o campo `motivo` pode revelar quando um estabelecimento físico estará vazio (ex.:
"viagem até dia 20") — risco de segurança física para o profissional, não só de dados.

**Correção**: `GRANT SELECT (tenant_id, data, hora_inicio, hora_fim, bloqueado)` para `anon` (a
engine não precisa de `motivo`) e considerar restringir a leitura ao próprio `tenant_id` da consulta
via RPC em vez de SELECT direto na tabela.

---

### A3 — `perfis_empresas`/`servicos`/`horarios_funcionamento`: SELECT público sem filtro de tenant permite raspar todo o diretório de negócios da plataforma

**Evidência**: `supabase/schemas/01_perfis_empresas.sql:20-23`, `02_servicos.sql:18-21` e
`03_horarios_funcionamento.sql:18-21` — todas com `USING (true)` ou `USING (ativo = true)`, mas
**nenhuma delas filtra por `tenant_id`**. Isso é necessário para a página `/book/[slug]` funcionar
sem login, mas a política concede acesso à **tabela inteira**, não à linha do tenant sendo
acessado no momento.

**Cenário de exploração**: `GET /rest/v1/perfis_empresas?select=nome_estabelecimento,telefone_contato,slug`
sem nenhuma autenticação devolve nome, telefone de contato e slug de **todo** cliente pagante do
VamoAgendar de uma vez — um concorrente (ex.: outro SaaS de agendamento) pode extrair a lista
completa de negócios cadastrados e seus telefones para prospecção direta, e cruzar com `servicos`
para obter tabela de preços de cada um.

**Correção**: mover a leitura pública de "perfil + serviços + horários de um slug específico" para
uma função `SECURITY DEFINER` parametrizada pelo slug (o padrão que `obterDadosBookingPublico` já
simula em código, mas sem proteção equivalente na Data API crua), preservando o SELECT direto restrito
a `authenticated` do próprio tenant. Item já registrado em `docs/PENDENCIAS.md` para `telefone_contato`
especificamente; aqui estendido para as três tabelas.

---

### A4 — Nenhuma proteção contra abuso em `criarAgendamentoPublico`: sem rate limit, honeypot ou CAPTCHA

**Evidência**: `src/app/actions/public-booking.ts` (função inteira) não tem nenhum limite de
tentativas por IP, telefone ou tenant; `src/proxy.ts` não aplica rate limiting a nenhuma rota; não há
`@upstash/ratelimit` nem qualquer dependência equivalente no `package.json`. Confirmado por grep: zero
ocorrências de "ratelimit"/"rate-limit"/honeypot em `src/`.

**Cenário de exploração**: um script chama a Server Action repetidamente (ou, pior, contorna-a via
C1) preenchendo toda a agenda disponível de um profissional com reservas de telefones inventados,
tornando o link público inutilizável para clientes reais — negação de serviço direta contra a função
principal do produto, sem precisar de credenciais.

**Correção**: rate limit por IP+telefone+tenant na Server Action (Upstash Ratelimit, já é dependência
natural da stack) + honeypot invisível no formulário, como já planejado em
`docs/PENDENCIAS.md` ("Rate limiting e proteção contra agendamentos falsos/abuso").

---

### A5 — Condição de corrida (TOCTOU) sem proteção atômica no banco permite double-booking malicioso

**Evidência**: nenhuma `EXCLUDE CONSTRAINT`/lock em `supabase/schemas/07_agendamentos.sql` entre a
leitura de slots livres (`obterSlotsDisponiveis`) e o `INSERT` subsequente em
`public-booking.ts:80-97` e `agendamentos.ts:302-314`/`394-406`. Este achado já foi detalhado do
ponto de vista de integridade de dados no relatório `04-banco.md` (achado C1) — citado aqui apenas
pelo ângulo de segurança: **combinado com A4 (sem rate limit)**, um atacante pode disparar N
requisições concorrentes deliberadamente para o mesmo horário, todas passam na checagem de
disponibilidade e todas inserem, e o profissional se vê com múltiplos clientes reais confirmados
para o mesmo slot — um vetor de sabotagem/griefing contra um tenant específico, não só um bug de
concorrência acidental.

**Correção**: ver `04-banco.md` (constraint de exclusão `EXCLUDE USING gist` sobre
`tenant_id` + intervalo `tstzrange`); resolve simultaneamente o bug de concorrência e fecha este
vetor de abuso.

---

## MEDIO

### M1 — Secret hardcoded como fallback: `EVOLUTION_GLOBAL_API_KEY || 'global_key_here'`

**Evidência**: `src/app/actions/whatsapp.ts:15`:
```ts
const EVOLUTION_GLOBAL_API_KEY = process.env.EVOLUTION_GLOBAL_API_KEY || 'global_key_here'
```
Usado em `criarInstanciaWhatsApp`, `obterQrCodeWhatsApp`, `desconectarWhatsApp`,
`sincronizarStatusWhatsApp` e `reiniciarConexaoWhatsApp` — todas as chamadas de gerenciamento de
instância à Evolution API. Mesmo padrão de "fallback silencioso" do achado C3, mas de exploração mais
indireta: exige que o atacante também alcance a Evolution API (que roda em Docker interno, sem
exposição pública documentada) **e** que a chave real da Evolution API seja coincidentemente o
literal `'global_key_here'`.

**Cenário de exploração**: risco principal não é remoto, e sim de **falha silenciosa em produção** —
se a env faltar, toda operação de gerência de WhatsApp passa a usar um literal público do
código-fonte sem erro claro no boot, mascarando um erro de configuração até o profissional tentar
conectar o WhatsApp e falhar sem explicação.

**Correção**: seguir o padrão já usado em `src/lib/supabase/admin.ts` — lançar erro explícito no
import/uso se a env não estiver definida, em vez de um fallback literal.

---

### M2 — Ausência total de headers de segurança HTTP

**Evidência**: `next.config.ts` está vazio (`{ /* config options here */ }`); não há `headers()` em
nenhum `layout.tsx`/`middleware`; `src/proxy.ts` só chama `clerkMiddleware`/`auth.protect()`, sem
injetar headers. Nenhum CSP, `X-Frame-Options`, `Strict-Transport-Security`, `Referrer-Policy` ou
`Permissions-Policy` configurado.

**Cenário de exploração**: sem `X-Frame-Options`/`frame-ancestors`, o `/book/[slug]` (formulário
público que coleta nome + WhatsApp) pode ser embutido em um `<iframe>` de um site malicioso para
clickjacking; sem CSP, qualquer XSS futuro (mesmo pequeno) tem via livre para exfiltrar dados via
`fetch`/`img` para domínio externo.

**Correção**: adicionar `headers()` em `next.config.ts` com no mínimo
`X-Frame-Options: SAMEORIGIN`, `Strict-Transport-Security`, `Referrer-Policy: strict-origin-when-cross-origin`
e um CSP inicial (mesmo que permissivo) cobrindo os domínios já usados (Clerk, Supabase, PostHog).

---

### M3 — Nenhuma validação de schema (zod ou equivalente) em Server Actions/webhook

**Evidência**: `zod` não consta em `package.json` (nem nenhuma lib equivalente). Toda validação de
entrada é manual e ad-hoc: checagens `if (!campo)`, `.replace(/\D/g, '')`, `isNaN(new Date(...))`
espalhadas em cada action. Exemplos de lacuna concreta: `salvarPerfilEmpresa` (`perfis-empresas.ts`)
aceita `corMarca` como qualquer string sem validar formato de cor (`#RRGGBB` ou similar) antes de
gravar; `salvarExcecaoAgenda`/`salvarHorariosFuncionamento` não validam formato de `hora_inicio`/
`hora_fim` além do que o `CHECK` do Postgres pega depois do envio.

**Cenário de exploração**: não é uma falha explorável isoladamente (não há injeção nem XSS
identificado — React escapa por padrão e não há `dangerouslySetInnerHTML` em todo `src/`, confirmado
por grep), mas é uma superfície frágil: cada novo campo exige lembrar de validar manualmente, e o
gating de plano por `if (!recursos.x) throw` é o único freio contra abuso de features pagas — um
esquecimento futuro em qualquer action vira bypass de cobrança ou dado malformado persistido.

**Correção**: introduzir `zod` (ou `valibot`, mais leve) nas Server Actions que recebem input
externo, começando pelas públicas (`public-booking.ts`) e pelo webhook.

---

## BAIXO

### B1 — Sem RBAC dentro do tenant: qualquer membro da organização Clerk tem acesso total

**Evidência**: grep por `orgRole`/`has(`/`checkRole` em `src/` não encontra nenhum uso — todas as
Server Actions verificam apenas `const { orgId } = await auth()`, nunca o papel do usuário dentro da
organização. Clerk Organizations suporta roles (`admin`/`member` customizáveis), mas o produto não os
usa.

**Cenário de exploração**: se o profissional convidar um funcionário para a organização Clerk (o
fluxo de convite é nativo do `OrganizationSwitcher`), esse funcionário pode desconectar o WhatsApp,
apagar serviços, mudar o slug público ou (quando implementado) alterar dados de cobrança — não há
distinção de papel.

**Correção**: avaliar se o modelo de negócio (pequeno negócio, geralmente dono único) torna isso
aceitável por ora; se o convite de funcionários virar recurso ativo, restringir ações sensíveis
(WhatsApp, perfil, plano) ao papel `admin` via `auth().has({ role: 'org:admin' })`.

---

### B2 — `assinaturas`: falta REVOKE explícito de INSERT/UPDATE/DELETE para `anon`/`authenticated`

**Evidência**: a migration `20260709161817_restaura_privilegios_dml_roles_api.sql` concede
`GRANT select, insert, update, delete ... TO anon, authenticated` em **todas** as tabelas do schema
`public`, incluindo `assinaturas`. Hoje isso é inofensivo porque não existe nenhuma `POLICY` RLS
permissiva de INSERT/UPDATE/DELETE em `assinaturas` para essas roles (RLS nega por padrão sem
policy correspondente) — mas é uma segunda camada de defesa ausente, exatamente como o comentário do
próprio schema já reconhece (`supabase/schemas/08_assinaturas.sql:26-28`).

**Cenário de exploração**: nenhum hoje. O risco é de **regressão futura**: se alguém criar por engano
uma policy de UPDATE/INSERT em `assinaturas` (ex.: ao implementar o checkout Asaas) sem revisar o
GRANT de tabela, o plano do tenant se torna editável pelo próprio cliente.

**Correção**: `revoke insert, update, delete on public.assinaturas from anon, authenticated;` — já
identificado em `docs/PENDENCIAS.md`.

---

### B3 — Evolution API local (Docker) roda sem TLS e com senha padrão do Postgres interno

**Evidência**: `docker/evolution/docker-compose.yml:30`: `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-evolution}`
(senha padrão fraca se a env não for definida) e `README.md:41-42` do mesmo diretório já documenta
"porta exposta sem TLS; em produção a Evolution API deve ficar atrás de HTTPS". Mitigante real: os
serviços `postgres` e `redis` não publicam porta para o host (sem `ports:` no compose), só
`evolution-api:8080` é exposto, e o próprio README já assume ambiente **só de desenvolvimento**.

**Cenário de exploração**: relevante apenas se este compose for reaproveitado tal-e-qual em produção
sem revisão (o README já avisa contra isso) ou se a máquina de desenvolvimento estiver em rede
compartilhada/não confiável.

**Correção**: nenhuma ação necessária além do que já está documentado no próprio README para o
go-live; garantir que o checklist de produção (`docs/PENDENCIAS.md`) trate isso ao decidir a topologia
de produção da Evolution API.

---

### B4 — Variável `DEBUG_QSTASH` deve ser removida dos ambientes (página de debug já removida do código)

**Evidência**: a antiga página `/debug/qstash` **não existe mais** em `src/app/` (confirmado —
`find` não encontra `src/app/debug`), mas `docs/PENDENCIAS.md:876` registra um passo manual pendente
do owner para apagar a env `DEBUG_QSTASH` dos ambientes reais. Não é uma vulnerabilidade ativa no
código hoje — a env, se ainda setada em algum ambiente, hoje não tem efeito nenhum (nenhum código a
lê).

**Correção**: nenhuma ação de código; apenas checklist operacional já rastreado.

---

## Auth, rotas e roles

`src/proxy.ts` usa `clerkMiddleware` com `createRouteMatcher` numa lista de **exceções** públicas
(tudo que não casar exige `auth.protect()` — modelo *deny by default*, correto):

| Rota pública | Justificativa | Avaliação |
|---|---|---|
| `/` | Landing | Correto — marketing |
| `/para(.*)` | Landings verticais por nicho (SSG) | Correto — marketing, sem dado de tenant |
| `/sign-in(.*)`, `/sign-up(.*)` | Fluxo de autenticação Clerk | Correto — precisam ser públicas por definição |
| `/book(.*)` | Fricção Zero: cliente final agenda sem login | Correto por design de produto — a proteção real precisa vir do RLS (ver CRITICO acima), não do proxy |
| `/api/webhooks(.*)` | QStash chega sem sessão Clerk | Correto que seja pública no proxy — a autenticação é responsabilidade do handler (ver C3) |

Nenhuma rota de dashboard, API interna ou administrativa está na lista pública — não há
sobre-exposição no matcher. O `matcher` do `config` exclui `_next` e uma lista de extensões
estáticas, e inclui explicitamente `/(api|trpc)(.*)` e `/__clerk/:path*`, cobrindo toda rota de API
não listada como pública.

Sessão/expiração de token: gerenciadas pela plataforma Clerk (configuração de dashboard, fora do
alcance de análise estática de código); nenhuma customização de expiração encontrada em código.

Elevação de privilégio entre tenants: não encontrada nenhuma Server Action B2B que aceite um
`tenant_id`/`orgId` vindo do client em vez de `await auth()` — todas usam o `orgId` da sessão como
única fonte de verdade para tenant_id em escrita, e todas as leituras/escritas B2B re-filtram
explicitamente por `tenant_id` além do RLS (defesa em profundidade consistente — ver, por exemplo,
`atualizarStatusAgendamento`, `salvarServico`, `excluirServico`, `salvarExcecaoAgenda` em
`src/app/actions/`). Os dois pontos que aceitam nome de instância/QR Code do WhatsApp
(`obterQrCodeWhatsApp`, `desconectarWhatsApp`) resolvem o `instance_name` sempre a partir do banco
pelo `orgId` da sessão — o comentário no próprio código (`whatsapp.ts:157-159` e `:248-250`) mostra
consciência deliberada do risco de IDOR ali e o mitiga corretamente.

## `service_role` / chave privilegiada

`SUPABASE_SECRET_KEY` só é lida em `src/lib/supabase/admin.ts:22`, que **lança erro** se a env não
existir (ao contrário dos fallbacks silenciosos de C3/M1 — bom padrão, inconsistente com o resto do
código). `createAdminClient()` é importado em exatamente dois arquivos, ambos Server Actions/route
handlers que rodam só no servidor: `src/app/actions/public-booking.ts` e
`src/app/api/webhooks/lembrete/route.ts` — nunca em Client Component, nunca em código que roda no
browser. Não há nenhuma ocorrência de `service_role` fora de comentários/SQL de `GRANT`. **Nenhum
achado CRITICO de exposição de service_role** — o único vazamento de credencial encontrado é o de
nível inferior descrito em A1 (`instance_token` da Evolution API).

## Input e webhooks — o que valida o quê

| Superfície | Validação hoje |
|---|---|
| `criarAgendamentoPublico` (público) | Manual: campos obrigatórios, telefone 10-11 dígitos, `Date` válida, tenant existe, serviço ativo do mesmo tenant, slot revalidado na engine. Sem schema formal (ver M3). |
| `obterSlotsPublicos`/`obterDadosBookingPublico` (público) | Apenas leitura; sem input perigoso além do `slug`/`tenantId` usados em `.eq()` parametrizado (sem risco de SQL injection — Supabase client usa PostgREST parametrizado, não SQL cru em nenhum ponto do código). |
| Todas as Server Actions B2B | `orgId` via Clerk + checagens manuais de tipo/obrigatoriedade por campo. Sem schema formal. |
| `POST /api/webhooks/lembrete` | Secret fraco (C3) + checagem de presença de `agendamentoId`/`tenantId` no body; sem validação de tipo/formato desses campos além disso. |

Nenhuma ocorrência de SQL cru (`sql\`...\`` ou `.rpc()` com string interpolada) em todo `src/` —
todas as queries passam pelo query builder do `supabase-js`, que parametriza automaticamente. Não há
vetor de SQL injection identificado.

## Integração Evolution API / WhatsApp

- **Autenticação dos webhooks**: o único webhook da aplicação é o de lembrete do QStash (ver C3); a
  Evolution API em si não envia webhooks para o VamoAgendar (`WEBHOOK_GLOBAL_ENABLED=false` no
  `docker/evolution/.env.example`) — não há superfície de webhook da Evolution a validar.
- **Isolamento entre instâncias de tenants diferentes**: cada tenant tem `instance_name` derivado
  deterministicamente do `orgId` (`instancia-${orgId}`) e `instance_token` próprio, gravado em
  `whatsapp_configs` com RLS por `tenant_id`. As duas actions que poderiam aceitar um nome de
  instância vindo do client (`obterQrCodeWhatsApp`, `desconectarWhatsApp`) resolvem o nome sempre a
  partir do banco pelo `orgId` da sessão — sem IDOR encontrado aqui. O vazamento real de credencial
  é o do achado A1 (o próprio tenant recebendo seu token no browser), não cross-tenant.
- **Onde vivem as credenciais**: `EVOLUTION_GLOBAL_API_KEY` (gerência de instâncias, todas as
  organizações) só em variável de ambiente server-side, com fallback hardcoded fraco (M1);
  `instance_token` por tenant fica em `whatsapp_configs.instance_token`, sem criptografia adicional
  no banco (texto plano na coluna, protegido só por RLS) — aceitável dado que o RLS já restringe a
  leitura ao próprio tenant autenticado, mas qualquer acesso futuro via `service_role`/admin
  (backups, dump, um bug em outra query admin) expõe o valor em claro.

## Secrets — varredura geral

- `.env*` está corretamente listado em `.gitignore` (`.gitignore:34`, com exceção explícita só para
  `.env.example`); `git ls-files | grep env` confirma que nenhum `.env`/`.env.local` está versionado
  — só o `docker/evolution/.env.example` (modelo, sem valores reais). Nenhum valor de `.env*` foi
  lido nesta auditoria, conforme regra do escopo.
- Nenhum segredo com aparência de chave real (padrão `[a-zA-Z0-9_-]{8,}` ao lado de
  `apikey`/`secret`/`token`) encontrado hardcoded em `src/`, exceto os dois fallbacks literais já
  reportados (`'secret-key'` em C3, `'global_key_here'` em M1) — que são placeholders óbvios, não
  segredos reais vazados, mas ainda assim são código morto perigoso (ver correções acima).
  `.mcp.json` (versionado) contém apenas um `project_ref` do Supabase, que não é segredo (é o mesmo
  identificador público presente na URL do projeto).
- Todo uso de `NEXT_PUBLIC_*` encontrado é apropriado para exposição pública: URL/publishable key do
  Supabase (por design, ver `docs/02`), chave/host do PostHog (chave de projeto client-side,
  publicamente segura por design do PostHog).
- Nenhum `console.log`/`console.error` foi encontrado logando objetos de configuração completos,
  tokens ou payloads de credencial — os logs de erro passam `.message` de exceções ou strings
  literais, nunca o objeto `config`/`instanceToken` inteiro.

## Superfície geral

- **Rate limiting**: ausente em toda a aplicação (ver A4) — nem no proxy, nem em nenhuma action,
  nem no webhook (que depende só do secret).
- **CORS**: não há configuração explícita de CORS em nenhuma rota (`next.config.ts` vazio); como
  toda mutação é via Server Action (same-origin por padrão no App Router) e a única rota de API é o
  webhook (server-to-server, sem necessidade de CORS), a ausência de configuração explícita não é,
  por si, uma vulnerabilidade — mas também não há verificação adicional de origem além do que o
  Next.js já faz por padrão para Server Actions.
- **Headers de segurança**: ausentes (ver M2).
- **Enumeração de tenants via slug público**: o slug do plano Gratuito é aleatório
  (8 caracteres base36 ≈ 2,8×10¹² combinações — não enumerável por força bruta), gerado em
  `perfis-empresas.ts:226-229` com `crypto.getRandomValues`. Slugs customizados (Plus/Pro) são,
  por definição de produto, feitos para serem descobertos/compartilhados publicamente — não é uma
  falha de enumeração, é o próprio propósito do link. A enumeração massiva **real** de tenants não
  passa pelo slug — passa pelo SELECT público sem filtro em `perfis_empresas` (ver A3), que é
  estritamente pior que adivinhar slugs um a um.

## Notas positivas (sem ação necessária)

- Toda Server Action B2B valida `const { orgId } = await auth()` antes de qualquer leitura/escrita,
  de forma consistente em todos os 7 arquivos de `src/app/actions/`.
- Defesa em profundidade real: mesmo onde o RLS já filtraria por `tenant_id`, praticamente toda
  query B2B repete `.eq('tenant_id', orgId)` explicitamente no código.
- `createAdminClient()` restrito a dois arquivos, ambos server-only, com comentários explícitos no
  próprio código justificando cada uso e alertando contra reuso indevido.
- Nenhuma SQL crua/interpolada em `src/` — sem vetor de SQL injection.
- Nenhum `dangerouslySetInnerHTML` em todo o código-fonte.
- Gravação de sessão do PostHog (`disable_session_recording: true`) travada no código,
  deliberadamente, para não gravar a página pública onde o cliente final digita nome/telefone —
  ver `src/lib/analytics/client.ts:35`.
- Pseudonimização do `tenant_id` (hash SHA-256 truncado) antes de qualquer envio a analytics
  (`src/lib/analytics/tenant.ts`) — o `org_id` cru nunca sai para o PostHog.
- `instance_token` nunca aparece na interface TypeScript de props do `WhatsappClient.tsx` (o
  comentário no código mostra que o time já tem o padrão certo em mente — só não o aplicou de forma
  consistente em todas as Server Actions, ver A1).
