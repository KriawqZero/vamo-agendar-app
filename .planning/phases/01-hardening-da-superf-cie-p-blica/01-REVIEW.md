---
phase: 01-hardening-da-superf-cie-p-blica
rodada: 3 (planos 01-17 a 01-19, revisão de fase completa)
reviewed: 2026-07-22T22:01:42Z
depth: standard
diff_base: 22b94f5
head: f97677f
files_reviewed: 43
files_reviewed_list:
  - docs/03-PADROES_DE_BANCO_DE_DADOS.md
  - docs/09-OBSERVABILIDADE_E_EMAIL.md
  - docs/PENDENCIAS.md
  - scripts/verificar-controle-harness-anon.sh
  - scripts/verificar-fail-fast-boot.sh
  - scripts/verificar-superficie-anon.sh
  - scripts/verificar-travessia-server-action.sh
  - src/app/actions/__tests__/public-booking-escrita.test.ts
  - src/app/actions/agendamentos.ts
  - src/app/actions/perfis-empresas.ts
  - src/app/actions/public-booking.ts
  - src/app/api/webhooks/lembrete/route.ts
  - src/app/book/[slug]/BookingApp.tsx
  - src/app/book/[slug]/mensagens.ts
  - src/app/book/[slug]/page.tsx
  - src/app/book/__tests__/mensagens.test.ts
  - src/instrumentation.ts
  - src/lib/__tests__/assinaturas.test.ts
  - src/lib/__tests__/booking-engine.test.ts
  - src/lib/__tests__/env.test.ts
  - src/lib/__tests__/qstash-assinatura.test.ts
  - src/lib/__tests__/whatsapp-helper.test.ts
  - src/lib/assinaturas.ts
  - src/lib/booking-engine.ts
  - src/lib/env.ts
  - src/lib/notificacoes-agendamento.ts
  - src/lib/qstash-assinatura.ts
  - src/lib/supabase/admin.ts
  - src/lib/whatsapp-helper.ts
  - supabase/migrations/20260722044858_revoga_anon_assinaturas.sql
  - supabase/migrations/20260722055941_fecha_policies_anon.sql
  - supabase/migrations/20260722060000_fecha_data_api_para_anon.sql
  - supabase/migrations/20260722145948_fecha_policies_residuais_servicos_horarios.sql
  - supabase/migrations/20260722183153_fecha_data_api_para_funcoes_futuras.sql
  - supabase/migrations/20260722185755_slug_gratuito_unico.sql
  - supabase/schemas/01_perfis_empresas.sql
  - supabase/schemas/02_servicos.sql
  - supabase/schemas/03_horarios_funcionamento.sql
  - supabase/schemas/04_excecoes_agenda.sql
  - supabase/schemas/06_clientes.sql
  - supabase/schemas/07_agendamentos.sql
  - supabase/schemas/08_assinaturas.sql
  - CLAUDE.md
findings:
  critical: 2
  warning: 10
  info: 6
  total: 18
status: issues_found
---

# Phase 1: Relatório de Code Review (3ª rodada)

**Revisado:** 2026-07-22T22:01:42Z
**Profundidade:** standard
**Base do diff:** `22b94f5` → `f97677f`
**Arquivos revisados:** 43
**Status:** issues_found

## Resumo

Esta revisão cobre a fase inteira, com peso na 3ª rodada (planos 01-17 a 01-19). O
fechamento do portão de privilégio está correto e bem argumentado: as cinco migrations
de `REVOKE`/`ALTER DEFAULT PRIVILEGES` são coerentes entre si, `service_role` nunca
entra em linha de revogação, nenhuma policy `TO anon` sobrou nos schemas declarativos,
e a decisão de fazer a revogação de funções **global** (sem `IN SCHEMA`) está certa e
justificada. A guarda de profundidade do plano 01-18 foi conferida por execução:
`gerarSlotsAntiBuraco` recusa duração ≤ 0, não-inteira, `NaN` e `±Infinity`, e a
fronteira de `obterSlotsPublicos` recusa antes de qualquer `await` — o veredito
`ENTRADA_HOSTIL`, exigindo a **ausência** de `slug_invalido` no corpo, realmente prova a
ordem e não só o discriminante. `ehDataDeCalendario` também foi conferido por execução:
`2027-02-30` e `2027-13-45` são recusados.

Os dois blockers estão em cima do que a fase mais promete. O primeiro é no instrumento
de medição: o conserto do 01-17 fechou o falso verde no eixo "bateria inteira" e o
deixou aberto no eixo "tabela a tabela" — o gate de prova positiva é um contador
**global** e a `COBERTURA` conta *tentativas de curl*, não provas. Uma tabela que
regredir para aberta-mas-vazia (`200 []`) ou que existir só no schema declarativo
(`PGRST205` num nome declarado) é contabilizada como coberta, não reprova, e a última
linha do relatório continua sendo uma afirmação positiva de fechamento com exit 0. É o
WR-08 de novo, uma granularidade abaixo. O segundo está no caminho de ESCRITA anônimo,
que ficou de fora do endurecimento de entrada que o caminho de LEITURA recebeu:
`clienteNome` e `clienteEmail` chegam sem limite de tamanho e sem validação de formato e
vão direto para `INSERT` com cliente privilegiado (RLS bypassado), tendo
`serverActions.bodySizeLimit` de 6 MB como único teto.

Além disso, a guarda de horizonte da engine é uma comparação **lexicográfica** de
strings, e o caminho de escrita — que não valida o formato de `dataHora` — consegue
alimentá-la com um `dateStr` de ano com 5 dígitos que a derrota (medido:
`"19999-12-31" > "2026-08-05"` é `false`).

## Structural Findings (fallow)

Nenhum bloco `<structural_findings>` foi fornecido nesta execução. Todas as observações
abaixo são narrativas.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: O harness de superfície anônima ainda sai 0 declarando fechamento com tabelas que não provaram nada

**Arquivo:** `scripts/verificar-superficie-anon.sh:167-184, 227-231, 282-292, 302-311, 490-507, 519-528`

**Issue:**
O conserto do plano 01-17 acrescentou um gate de prova positiva, mas ele é um contador
**global** (`ESPERADAS`), não por tabela. Combinado com outros três pontos, isso
reintroduz o falso verde do WR-08 na granularidade de tabela:

1. `marcar_checada "$tabela"` (linhas 168 e 320) é chamado **antes** do `curl`. A
   `COBERTURA` (linha 493) só pergunta `tabela_foi_checada` — ou seja, mede "houve
   tentativa de requisição", não "houve prova de fechamento".
2. `HTTP 200` com array vazio vira `INCONCLUSIVO` (linhas 286-291), e `INCONCLUSIVAS`
   não entra em gate nenhum de exit code.
3. `PGRST205`/`404` num nome **declarado** vira `ESPERADO` e **incrementa `ESPERADAS`**
   (linhas 303-306). Uma tabela que existe em `supabase/schemas/` mas nunca chegou ao
   banco (drift entre schema declarativo e ledger de migrations — modo de falha que o
   próprio `CLAUDE.md` documenta em cima de `apply_migration`) conta como prova positiva
   de fechamento.
4. O gate final só exige `ESPERADAS -gt 0` (linha 519) e `REPROVADAS -eq 0` (linha 526).

Cenário concreto que passa hoje: uma fase futura reconcede `SELECT` a `anon` em
`clientes`; a tabela está vazia no ambiente medido → `200 []` → `INCONCLUSIVO`;
`perfis_empresas` continua devolvendo `42501` → `ESPERADAS = 1`; nenhuma reprovação →
**exit 0**, com `[COBERTURA] todas as tabelas declaradas` na tela e a frase
`a role anon não devolveu linha nenhuma` na última linha. A afirmação é literalmente
verdadeira (a tabela estava vazia) e operacionalmente falsa (o portão está aberto).

O veredito `[ALVO]` não cobre isso — ele só exige que **uma** tabela responda `42501`. E
`verificar-controle-harness-anon.sh` também não: seus três cenários negativos são
estados globais do alvo (morto, projeto errado, nega tudo), e nenhum deles monta um alvo
**parcialmente** aberto.

**Fix:**
Tornar prova positiva e cobertura **por tabela**, e marcar a tabela só depois de saber o
veredito:

```bash
declare -A VEREDITO_POR_TABELA=()

registrar_tabela() { # $1 = tabela, $2 = veredito
    local anterior="${VEREDITO_POR_TABELA[$1]:-}"
    # ESPERADO ganha de tudo; os demais só preenchem vazio
    if [ "$2" = 'ESPERADO' ] || [ -z "$anterior" ]; then
        VEREDITO_POR_TABELA[$1]="$2"
    fi
}

# COBERTURA passa a exigir PROVA, não tentativa
for tabela in "${TABELAS_DECLARADAS[@]}"; do
    if [ "${VEREDITO_POR_TABELA[$tabela]:-AUSENTE}" != 'ESPERADO' ]; then
        registrar REPROVADO "COBERTURA — $tabela" \
            "veredito ${VEREDITO_POR_TABELA[$tabela]:-AUSENTE} — nenhuma checagem PROVOU fechamento nesta tabela"
    fi
done
```

E fechar o buraco 3 junto (ver WR-06): `PGRST205` num nome declarado deve ser
`INCONCLUSIVO`, nunca prova positiva. Acrescentar em
`verificar-controle-harness-anon.sh` um quinto veredito `ALVO_PARCIAL` — um stub que
responde `42501` num caminho e `200 []` nos demais —, exigindo que o harness **reprove**.

---

### CR-02: Escrita anônima grava campos de texto sem limite de tamanho nem validação, com RLS bypassado

**Arquivo:** `src/app/actions/public-booking.ts:313-334, 444-464`

**Issue:**
`criarAgendamentoPublico` endureceu `clienteTelefone` (10–11 dígitos) e `dataHora`
(`isNaN`), mas `clienteNome` e `clienteEmail` só passam por `!clienteNome` (truthy) e
`?.trim() || null`. Não há limite de comprimento, não há validação de formato de e-mail,
e `clientes.nome`/`clientes.email` são `text` sem `CHECK`
(`supabase/schemas/06_clientes.sql:4-6`). O `INSERT` usa `createAdminClient()` — o RLS
não filtra nada ali, e a própria action é, por desenho, "o porteiro que substitui o RLS"
(comentário das linhas 408-413).

Consequência: qualquer visitante que conheça um slug público pode gravar, por
requisição, até o teto de `serverActions.bodySizeLimit` (6 MB) de texto arbitrário na
tabela `clientes` de um profissional qualquer, sem sessão e sem freio. O e-mail entra sem
checagem sintática e é o campo que os e-mails transacionais do Resend vão consumir na
fase seguinte.

Esta é exatamente a assimetria que a 3ª rodada se propôs a eliminar: o caminho de
LEITURA ganhou teto (`DURACAO_MAXIMA_MINUTOS`), formato (`FORMATO_DATA_ISO`) e semântica
(`ehDataDeCalendario`) antes do primeiro `await`; o caminho de ESCRITA — o único que
**persiste** dado de terceiro — não ganhou nenhum dos três para os campos que grava. O
rate limiting está deferido em `docs/PENDENCIAS.md` e isso é decisão do owner; o limite
de campo não está deferido em lugar nenhum e não depende de infraestrutura nova.

**Fix:**

```ts
// junto de DURACAO_MAXIMA_MINUTOS, na mesma seção de constantes de fronteira
const MAX_NOME_CLIENTE = 120
const MAX_EMAIL_CLIENTE = 254 // RFC 5321
const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// dentro de criarAgendamentoPublico, junto das guardas das linhas 321-334
const nomeLimpo = clienteNome.trim()
if (!nomeLimpo || nomeLimpo.length > MAX_NOME_CLIENTE) {
    return { ok: false, motivo: 'campos_obrigatorios' }
}

const emailLimpo = clienteEmail?.trim() || null
if (emailLimpo && (emailLimpo.length > MAX_EMAIL_CLIENTE || !FORMATO_EMAIL.test(emailLimpo))) {
    return { ok: false, motivo: 'campos_obrigatorios' }
}
```

Usar `nomeLimpo`/`emailLimpo` no `INSERT` (linhas 448-450) e na chamada de
`dispararNotificacoesAgendamento` (linha 513). Espelhar o teto no banco
(`CHECK (char_length(nome) <= 120)` em `supabase/schemas/06_clientes.sql`, migration via
`db diff`) — mesmo padrão já usado em `perfis_empresas.endereco`. Acrescentar ao
`verificar-travessia-server-action.sh` uma sonda com `clienteNome` de tamanho absurdo
exigindo `campos_obrigatorios`, para a guarda não sumir sem aviso.

## Warnings

### WR-01: A guarda de horizonte da engine é comparação lexicográfica, e o caminho de escrita a derrota

**Arquivo:** `src/lib/booking-engine.ts:197-202`; `src/app/actions/public-booking.ts:331-334, 382`

**Issue:**
`if (dateStr > limiteData) return []` compara **strings**. A comparação só equivale à
ordem cronológica enquanto os dois lados forem exatamente `YYYY-MM-DD` com 4 dígitos de
ano — o que `obterSlotsPublicos` garante com `FORMATO_DATA_ISO`, mas
`criarAgendamentoPublico` **não** garante.

Ali `dataHora` só é checado com `isNaN(new Date(dataHora).getTime())`, e `dateStr` sai de
`diaLocal(dataLocal, timezone)`, que usa `Intl.DateTimeFormat` com `year: 'numeric'` e
emite anos de 5 dígitos sem preencher. Medido:

```
new Date('+020000-01-01T00:00:00Z')  → válido
diaLocal(...)                        → '19999-12-31'
'19999-12-31' > '2026-08-05'         → false   // horizonte NÃO barra
```

A igualdade exata `sl.datetime === dataHora` ainda impede a gravação, então não há
escrita indevida — mas a guarda de horizonte é contornável por entrada anônima e a
requisição compra a cadeia inteira de consultas (perfil ×2, assinatura, serviço,
horários, exceções, serviços ativos, agendamentos) antes de ser recusada. Mesma classe do
defeito que o 01-18 corrigiu em `duracaoMinutos`, só que no operador em vez de na
ausência de guarda.

**Fix:**

```ts
// public-booking.ts — as mesmas guardas de fronteira do caminho de leitura
const dataLocal = new Date(dataHora)
if (isNaN(dataLocal.getTime())) return { ok: false, motivo: 'data_invalida' }
const dateStr = diaLocal(dataLocal, timezone)
if (!FORMATO_DATA_ISO.test(dateStr) || !ehDataDeCalendario(dateStr)) {
    return { ok: false, motivo: 'data_invalida' }
}

// booking-engine.ts — comparação por instante, não por string
if (regrasAcesso?.horizonteDias != null) {
    const limiteData = somarDias(diaLocal(agora, timezone), regrasAcesso.horizonteDias)
    if (Date.parse(`${dateStr}T00:00:00Z`) > Date.parse(`${limiteData}T00:00:00Z`)) return []
}
```

---

### WR-02: `processarMensagemTemplate` expande padrões `$` vindos do nome digitado pelo visitante

**Arquivo:** `src/lib/whatsapp-helper.ts:34-40`

**Issue:**
`String.prototype.replace` com *replacement string* interpreta `$&`, `` $` ``, `$'` e
`$n`. `clienteNome` é digitado por um visitante anônimo em `/book/[slug]` e vai cru para
o `replace`. Medido:

```js
'Ola {{cliente}}, tudo bem?'.replace(/{{cliente}}/g, "$`")  // → 'Ola Ola , tudo bem?'
'Ola {{cliente}}!'.replace(/{{cliente}}/g, '$&')            // → 'Ola {{cliente}}!'
'Ola {{cliente}}!'.replace(/{{cliente}}/g, "$'")            // → 'Ola !!'
```

O impacto direto é baixo (a mensagem vai para o WhatsApp do próprio visitante), mas é
entrada hostil produzindo saída não prevista num caminho anônimo, e com `/g` mais um
template que repete `{{cliente}}` a expansão se amplifica. Vale para os três valores
substituídos, e a suíte `whatsapp-helper.test.ts` não tem nenhum caso com `$`.

**Fix:** usar a forma de função, que não interpreta padrões:

```ts
return template
    .replace(/{{cliente}}/g, () => clienteNome)
    .replace(/{{empresa}}/g, () => empresaNome)
    .replace(/{{data_hora}}/g, () => dataHoraStr)
    .replace(/{{data}}/g, () => dataPart || '')
    .replace(/{{hora}}/g, () => horaPart || '')
```

```ts
// whatsapp-helper.test.ts
it('não expande padrões de replacement vindos do nome do cliente', () => {
    expect(processarMensagemTemplate({
        template: 'Ola {{cliente}}, tudo bem?', clienteNome: "$`",
        empresaNome: 'E', dataHoraStr: '01/01/2027 às 10:00',
    })).toBe('Ola $`, tudo bem?')
})
```

---

### WR-03: A justificativa do deferimento do rate limiting em PENDENCIAS ficou falsa depois desta fase

**Arquivo:** `docs/PENDENCIAS.md:807-838`

**Issue:**
A seção "Rate limiting e proteção contra agendamentos falsos/abuso" não foi tocada no
diff da fase (`git diff 22b94f5..HEAD -- docs/PENDENCIAS.md` não a traz) e continua
afirmando:

> **Pior:** o INSERT direto pela Data API contorna qualquer proteção que fosse colocada
> na action — **este item depende do item de integridade acima**.

Isso deixou de ser verdade em `20260722060000_fecha_data_api_para_anon.sql`
(`revoke all on all tables in schema public from anon`) somado a
`20260722055941_fecha_policies_anon.sql`, que removeu as policies de `INSERT` anônimo de
`clientes` e `agendamentos`. Não existe mais caminho de escrita anônima pela Data API,
então a dependência declarada não existe e o rate limit na action passou a ser
suficiente — ou seja, este item foi **destravado** por esta fase.

O `CLAUDE.md` §"Definition of Done" item 6 exige atualizar `docs/PENDENCIAS.md` quando a
mudança criar ou adiar tarefas; aqui ela destravou uma, e o documento segue descrevendo o
mundo anterior. Quem ler o backlog na próxima fase vai deferir de novo pelo motivo errado.

**Fix:**

```md
**Estado atual verificado (Phase 1, 2026-07-22):** nenhuma proteção existe (sem rate
limit, honeypot ou CAPTCHA). O bypass pela Data API **deixou de existir**: a role `anon`
perdeu todo privilégio (`20260722060000`) e as policies de INSERT anônimo foram removidas
(`20260722055941`), então `criarAgendamentoPublico` é hoje o único caminho de escrita
pública — proteção posta na action não é mais contornável.

**Dependências/decisões:** ~~item de integridade primeiro~~ — **destravado pela Phase 1**.
Falta escolher os limites iniciais e a chave (IP, telefone, tenant).
```

---

### WR-04: A confirmação síncrona de WhatsApp é aguardada no caminho anônimo sem timeout

**Arquivo:** `src/app/actions/public-booking.ts:510-517`; `src/lib/whatsapp-helper.ts:75-85, 161-172, 210-215`

**Issue:**
`await dispararNotificacoesAgendamento(...)` acontece depois de o `INSERT` já ter sido
confirmado, mas antes de `criarAgendamentoPublico` retornar. Dentro dele há dois `fetch`
para terceiros (Evolution API na Railway e QStash) sem `AbortSignal` e sem timeout. O
`fetch` do Node (undici) usa `headersTimeout`/`bodyTimeout` padrão de 300 s: um gateway
pendurado segura a requisição de um visitante anônimo por até cinco minutos, com o
agendamento já gravado.

O invariante "mensageria jamais quebra a criação de um agendamento"
(`notificacoes-agendamento.ts:28`) é respeitado no *erro*, mas não na *latência*. Como o
link é público e sem sessão, isso é superfície de esgotamento de conexões acessível a
qualquer um.

**Fix:**

```ts
const TIMEOUT_GATEWAY_MS = 8_000

const response = await fetch(`${EVOLUTION_API_URL}/message/sendText/${instanceName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: instanceToken },
    body: JSON.stringify({ number: destinatario, text: texto }),
    signal: AbortSignal.timeout(TIMEOUT_GATEWAY_MS),
})
```

O `catch` existente já converte o `TimeoutError` em `{ ok: false, motivo: 'erro_rede' }`;
vale um `motivo: 'timeout'` próprio para distinguir em `disparos_whatsapp`. Aplicar o
mesmo em `agendarLembreteQStash` e `cancelarLembreteQStash`.

---

### WR-05: A sonda `[ALVO]` descarta em silêncio a evidência mais forte de superfície aberta

**Arquivo:** `scripts/verificar-superficie-anon.sh:398-430`

**Issue:**
`sondar_tabela` faz `GET /rest/v1/<tabela>?select=*&limit=1` em **todas** as tabelas
declaradas até achar uma que responda `42501`. Se alguma responder `HTTP 200` com linhas
— o pior resultado possível, e com `select=*` — o corpo é jogado fora: o laço só testa
`corpo_tem_codigo "$SONDA_CORPO" "$CODIGO_PERMISSAO_NEGADA"` e segue adiante.
`SONDA_CORPO` só chega ao relatório no ramo de falha do `[ALVO]`, que nem é alcançado se
outra tabela responder `42501`.

Ou seja: o instrumento já faz uma varredura completa de leitura com `select=*` e, se ela
encontrar dado vazado numa tabela cuja `checar_leitura` usa outra query, não diz nada.

**Fix:** avaliar o resultado da sonda em vez de descartá-lo:

```bash
for tabela in "${TABELAS_DECLARADAS[@]}"; do
    sondar_tabela "$tabela"
    if [ "$SONDA_CODIGO" = '200' ] && tem_linhas "$SONDA_CORPO"; then
        registrar REPROVADO "$tabela — sonda ALVO ?select=*&limit=1" \
            "HTTP 200 COM LINHAS: $(resumir "$SONDA_CORPO")"
    fi
    ...
done
```

Ganho de cobertura de graça: a varredura já acontece, hoje só não é lida.

---

### WR-06: O harness afirma duas coisas incompatíveis sobre como uma tabela totalmente fechada responde

**Arquivo:** `scripts/verificar-superficie-anon.sh:22-27, 70-78, 302-311, 413-430`

**Issue:**
O cabeçalho (linhas 24-27) afirma que "perda total de privilégio tira a tabela do schema
cache do PostgREST", e a linha 303 aceita `PGRST205`/`404` num nome declarado como
`ESPERADO` **e** como prova positiva. Mas a sonda de referência do `[ALVO]` (linhas
418-430) exige explicitamente `42501` de uma tabela declarada e diz, no comentário da
linha 417, que `PGRST205`/`404` na referência "NÃO serve".

As duas afirmações não podem ser o estado de repouso ao mesmo tempo. Depois de
`revoke all on all tables in schema public from anon`, as nove tabelas estão no mesmo
estado — ou todas devolvem `42501` (e o ramo `PGRST205` é código morto que só serve para
aceitar tabela **inexistente** como fechada, o buraco 3 do CR-01), ou todas devolvem
`PGRST205` (e o `[ALVO]` nunca acha referência, o harness sai 2 para sempre e o veredito
`CONTROLE` de `verificar-controle-harness-anon.sh` reprova permanentemente).

Como a rodada reporta o harness passando, o estado real é `42501` — logo, o ramo
`PGRST205` documentado como "fechamento legítimo" é, na prática, o ramo que aceita drift
de schema como prova.

**Fix:** decidir o contrato e escrevê-lo uma vez só. Recomendado: manter `42501` como a
**única** prova positiva de fechamento (é a resposta do sistema de privilégios do
Postgres, que é o objeto de medição) e rebaixar `PGRST205`/`404` em nome declarado a
`INCONCLUSIVO`, com mensagem explícita: "a tabela consta dos schemas declarativos mas não
está no schema cache — schema drift entre `supabase/schemas/` e o banco, não fechamento".
Isso alinha os dois vereditos e fecha o buraco 3 do CR-01 na mesma edição.

---

### WR-07: A porta do harness de fail-fast não é sobrescrevível, ao contrário dos dois irmãos

**Arquivo:** `scripts/verificar-fail-fast-boot.sh:81`

**Issue:**
`PORTA=3991` é literal. `verificar-travessia-server-action.sh:113` usa
`${PORTA_TRAVESSIA:-3992}` e `verificar-controle-harness-anon.sh:87` usa
`${PORTA_CONTROLE:-3993}`. Com 3991 ocupada, este harness aborta com código 2 (linha 189)
e não há saída documentada — o operador precisa editar o script, que é justamente o que
os cabeçalhos dos três pedem para não acontecer ("harness afrouxado não é harness"). Numa
máquina onde uma execução anterior deixou um `next start` órfão, o instrumento fica
inutilizável.

**Fix:**

```bash
PORTA="${PORTA_FAIL_FAST:-3991}"
```

e acrescentar a variante na seção `USO` do cabeçalho, como os dois irmãos já fazem.

---

### WR-08: `slug` é o único argumento das actions públicas que atravessa sem limite antes de virar consulta

**Arquivo:** `src/app/actions/public-booking.ts:157-163, 528-537, 618-660`

**Issue:**
`obterSlotsPublicos` valida `dateStr` e `duracaoMinutos` antes do primeiro `await` — e o
comentário das linhas 623-641 explica bem por quê —, mas `slug` não passa por validação
nenhuma. Ele vai direto para `resolverPerfilPublicoPorSlug`, que dispara **duas**
consultas `.eq()` em paralelo com `createAdminClient()`.

`slug` chega de um navegador sem sessão pelo corpo de uma Server Action (teto de 6 MB) e a
coluna é `text` sem `CHECK` de tamanho (`supabase/schemas/01_perfis_empresas.sql:3-4`).
Não há injeção — o `.eq()` parametriza corretamente, e o comentário das linhas 197-200
explica bem por que não se usa `.or(...)` —, mas a requisição compra duas consultas
indexadas com uma chave arbitrariamente grande. O formato legítimo é conhecido e estreito:
`salvarPerfilEmpresa` sanitiza para `[a-z0-9-_]` com mínimo de 3, e `gerarSlugAleatorio`
produz 8 caracteres base36.

**Fix:** guarda de fronteira nas três funções públicas, antes de `createAdminClient()`:

```ts
/** Mesmo alfabeto que `salvarPerfilEmpresa` produz, com teto folgado. */
const FORMATO_SLUG_PUBLICO = /^[a-z0-9_-]{3,64}$/

// no topo de obterSlotsPublicos, criarAgendamentoPublico e obterDadosBookingPublico
if (!FORMATO_SLUG_PUBLICO.test(slug)) {
    return { ok: false, motivo: 'slug_invalido' } // ou `null` em obterDadosBookingPublico
}
```

Acrescentar uma sonda `SLUG_HOSTIL` em `verificar-travessia-server-action.sh`, no mesmo
molde de `ENTRADA_HOSTIL` (exigindo o discriminante e a ausência de qualquer sinal de que
o banco foi consultado).

---

### WR-09: Nenhuma das provas do namespace de slug, da degradação de plano e da escrita pública roda no gate de DoD

**Arquivo:** `src/app/actions/__tests__/public-booking-escrita.test.ts:1-33`; `vitest.config.ts:10-30`

**Issue:**
A suíte que prova o CR-03 (namespace ambíguo entre tenants), o WR-07 (degradação por
falha de leitura de plano), a sanitização de personalização paga e o contrato anti
double-booking está excluída do glob padrão e só roda com `EXIGIR_INTEGRACAO=1`. O
`CLAUDE.md` §"Definition of Done" item 1 define o gate como `pnpm lint`, `pnpm test` e
`pnpm build` — e `pnpm test` não executa nenhuma delas.

A exclusão é bem justificada (a suíte escreve no Supabase compartilhado) e a sentinela das
linhas 302-317 é uma boa ideia, mas ela só reprova quando `EXIGIR_INTEGRACAO=1`; sob
`pnpm test` cai no ramo de escape. O resultado prático: o invariante mais caro que a fase
produziu — o sequestro de link entre tenants — pode ser desfeito por uma fase futura sem
que o gate que o projeto usa diga uma palavra.

**Fix:** não misturar as suítes; tornar a segunda obrigatória onde importa.

```jsonc
// package.json
"test:tudo": "vitest run && EXIGIR_INTEGRACAO=1 vitest run src/app/actions/__tests__/public-booking-escrita.test.ts"
```

E registrar em `CLAUDE.md` §"Definition of Done" que mudança em
`src/app/actions/public-booking.ts`, `src/lib/assinaturas.ts` ou nos schemas de
`perfis_empresas` exige `pnpm test:integracao` além dos três — com o motivo escrito (a
suíte é a única prova executável do invariante de namespace).

---

### WR-10: `menorDuracaoAtiva` não tem guarda, e serviço com duração 0 é alcançável pelo dashboard

**Arquivo:** `src/lib/booking-engine.ts:148-180, 271-274`; `supabase/schemas/02_servicos.sql:7`

**Issue:**
A guarda de profundidade do 01-18 protege `duracaoMinutos`, mas `menorDuracaoAtiva` entra
sem checagem na regra anti-buraco (`gapAntes >= menorDuracaoAtiva`, linha 177). Ela vem de
`Math.min(...duracoesAtivas)` sobre `servicos.duracao_minutos`, coluna
`integer NOT NULL DEFAULT 30` **sem `CHECK`**. Do lado da action, `salvarServico`
(`src/app/actions/servicos.ts:52`) valida apenas `input.duracaoMinutos <= 0` — sem
`Number.isInteger` —, então `0.4` passa a validação e o Postgres arredonda para `0` ao
gravar em `integer`.

Com um único serviço de duração 0 no tenant, `menorDuracaoAtiva = 0` e `gapAntes >= 0` é
sempre verdadeiro: a regra anti-buraco é anulada para **todos** os serviços daquele
tenant, e a grade volta a ser de 15 em 15 minutos com sobras invendáveis — exatamente o
que `gerarSlotsAntiBuraco` existe para evitar, degradando em silêncio. Com duração `NaN`
(join que falhe) o efeito é o inverso: só os candidatos colados nas bordas sobrevivem.

**Fix:**

```ts
// booking-engine.ts, junto da guarda de contrato
if (!Number.isInteger(duracaoMinutos) || duracaoMinutos <= 0) return []
if (!Number.isInteger(menorDuracaoAtiva) || menorDuracaoAtiva <= 0) {
    // Dado de origem inconsistente: cai para a própria duração pedida — mesmo
    // fallback já usado quando o tenant não tem serviço ativo.
    menorDuracaoAtiva = duracaoMinutos
}
```

```sql
-- supabase/schemas/02_servicos.sql (migration via db diff)
duracao_minutos integer NOT NULL DEFAULT 30 CHECK (duracao_minutos BETWEEN 5 AND 1440),
```

E acrescentar `Number.isInteger(input.duracaoMinutos)` mais teto em `salvarServico`, para
o erro chegar ao profissional com mensagem em vez de virar `23514` cru.

## Info

### IN-01: Ponteiro de linha desatualizado no handoff da Phase 2

**Arquivo:** `docs/PENDENCIAS.md:765-767`

**Issue:** O handoff afirma que "o ponteiro correto hoje é `src/lib/booking-engine.ts:303`"
para `const duracao = ag.servicos?.duracao_minutos || 30`. Depois da guarda do 01-18 o
trecho está na linha **317**. O parágrafo existe justamente para corrigir um ponteiro que
envelheceu — e envelheceu de novo na mesma rodada.

**Fix:** citar o símbolo em vez do número (o `map` de `slotsOcupados` em
`booking-engine.ts`), ou revalidar o número no fechamento de cada plano que toque o arquivo.

---

### IN-02: Referência do projeto Supabase gravada em documentação versionada

**Arquivo:** `docs/03-PADROES_DE_BANCO_DE_DADOS.md` (§"Procedência da medição")

**Issue:** A URL completa do projeto (`https://<ref>.supabase.co`) foi escrita na doc. Não
é segredo — a mesma URL vai para o bundle do navegador via `NEXT_PUBLIC_SUPABASE_URL` —,
mas pina a referência do projeto de DEV num artefato que sobrevive à troca de credenciais
prevista antes do lançamento, e o histórico do git não esquece.

**Fix:** trocar por `<ref-do-projeto-de-dev>` ou pelo nome da variável, como os três
harnesses já fazem ("só NOMES aparecem na saída").

---

### IN-03: `try/catch` em torno de `capturarEventoTenant` é código morto (5 ocorrências)

**Arquivo:** `src/app/actions/public-booking.ts:397-401, 489-493, 498-504`; `src/app/actions/agendamentos.ts:153-157, 381-389, 543-549`

**Issue:** `capturarEventoTenant` → `hashTenantId` (`createHash().update().digest()`, não
lança) → `capturarEventoServidor`, que já tem `try/catch` interno e é documentado como
"Nenhum caminho lança" (`src/lib/analytics/server.ts:22`). Os blocos são inalcançáveis.
Não é dano, mas o webhook de lembrete chama a mesma função **sem** `try/catch`
(`route.ts:229, 242`) — o repositório documenta duas crenças opostas sobre o mesmo contrato.

**Fix:** escolher uma. Se "nunca lança" vale, remover os cinco blocos e apontar o JSDoc; se
não vale, o webhook precisa dos seus — e ali importa: uma exceção na linha 242 cairia no
`catch` externo, viraria 500, o QStash retentaria e o lembrete **já enviado** seria
duplicado.

---

### IN-04: Ramo de escape da sentinela assere a condição que acabou de testar

**Arquivo:** `src/app/actions/__tests__/public-booking-escrita.test.ts:303-307`

**Issue:**

```ts
if (process.env.EXIGIR_INTEGRACAO !== '1') {
    expect(process.env.EXIGIR_INTEGRACAO).not.toBe('1')
    return
}
```

A asserção é a negação literal da condição do `if` — não pode falhar. Serve só para o caso
não ficar sem `expect`.

**Fix:** `it.skipIf(process.env.EXIGIR_INTEGRACAO !== '1')(...)`, que deixa o caso
visivelmente pulado no relatório em vez de verde por tautologia.

---

### IN-05: Viés de módulo em `gerarSlugAleatorio`

**Arquivo:** `src/app/actions/perfis-empresas.ts:363-367`

**Issue:** `b % 36` sobre bytes 0–255: como `256 = 7×36 + 4`, os dígitos `0`–`3` saem com
probabilidade 8/256 e os demais com 7/256. O slug do plano Gratuito é descrito como "link
opaco" e funciona como capacidade — o viés reduz (pouco) a entropia efetiva dos 8
caracteres.

**Fix:** rejeição de amostra (descartar bytes ≥ 252) ou `crypto.randomInt(0, 36)` por
caractere.

---

### IN-06: Nome e telefone não sanitizados vão à mensageria enquanto as versões limpas vão ao banco

**Arquivo:** `src/app/actions/public-booking.ts:444-464, 510-517`

**Issue:** O `INSERT` grava `clienteNome.trim()` e `telefoneLimpo`;
`dispararNotificacoesAgendamento` recebe `clienteNome` e `clienteTelefone` crus. Não há
dano hoje (`enviarMensagemWhatsApp` refaz `replace(/\D/g, '')` e o nome só é interpolado),
mas duas representações do mesmo dado divergindo dentro da mesma função é o tipo de detalhe
que fica errado quando alguém acrescentar um consumidor no meio — e é o vetor do WR-02.

**Fix:** extrair `nomeLimpo`/`telefoneLimpo` uma vez (junto do fix do CR-02) e usar as
mesmas variáveis nos dois lugares.

---

_Revisado: 2026-07-22T22:01:42Z_
_Revisor: Claude (gsd-code-reviewer)_
_Profundidade: standard_
