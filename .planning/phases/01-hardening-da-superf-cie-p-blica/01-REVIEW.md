---
phase: 01-hardening-da-superficie-publica
reviewed: 2026-07-22T18:55:00Z
depth: deep
diff_base: b50d7e1
rodada: 2 (planos 01-10 a 01-16)
files_reviewed: 19
files_reviewed_list:
  - scripts/verificar-superficie-anon.sh
  - scripts/verificar-travessia-server-action.sh
  - src/app/actions/__tests__/public-booking-escrita.test.ts
  - src/app/actions/agendamentos.ts
  - src/app/actions/perfis-empresas.ts
  - src/app/actions/public-booking.ts
  - src/app/api/webhooks/lembrete/route.ts
  - src/app/book/[slug]/BookingApp.tsx
  - src/app/book/[slug]/mensagens.ts
  - src/app/book/__tests__/mensagens.test.ts
  - src/lib/__tests__/assinaturas.test.ts
  - src/lib/__tests__/whatsapp-helper.test.ts
  - src/lib/assinaturas.ts
  - src/lib/notificacoes-agendamento.ts
  - src/lib/whatsapp-helper.ts
  - supabase/migrations/20260722183153_fecha_data_api_para_funcoes_futuras.sql
  - supabase/migrations/20260722185755_slug_gratuito_unico.sql
  - supabase/schemas/01_perfis_empresas.sql
  - docs/03-PADROES_DE_BANCO_DE_DADOS.md
findings:
  critical: 2
  warning: 10
  info: 0
  total: 12
status: issues_found
---

# Phase 1 — 2ª rodada (01-10 a 01-16): Relatório de Code Review

**Revisado:** 2026-07-22T18:55:00Z
**Profundidade:** deep (grafo de imports, cadeia de chamadas, contratos entre módulos)
**Base do diff:** `b50d7e1..HEAD`
**Arquivos revisados:** 19
**Status:** issues_found

> Este arquivo substitui o relatório da 1ª rodada (achados já fechados; versão
> anterior preservada no histórico do git).

## Resumo

Os cinco objetivos declarados da rodada foram alcançados, e a maioria com prova
real — não com prosa:

- **Retorno discriminado.** A exaustividade é genuína: os dois
  `Record<MotivoPublico, string>` (`mensagens.ts:102,126`) fazem membro novo
  quebrar o `tsc` em vez de renderizar `undefined`. Nenhum caminho da caixa
  vermelha ou do aviso âmbar consegue receber texto que não seja uma das onze
  constantes do módulo. `pnpm test` roda em 442 ms, 228 casos, 15 arquivos, sem
  rede e sem banco — a suíte de integração está de fato fora do glob
  (`vitest.config.ts`) e só entra com `EXIGIR_INTEGRACAO=1`.
- **Chave HMAC fora da query string.** `agendarLembreteQStash` publica
  `${APP_URL}/api/webhooks/lembrete` sem parâmetro, e os quatro `console.error`
  que ecoavam corpo de gateway foram reduzidos a `http_<status>`. As travas de
  `whatsapp-helper.test.ts:205-271` medem isso de forma que pode falhar (o
  fixture injeta a URL de destino e a chave no corpo e assere ausência).
- **Namespace de slug.** As três camadas (constraint, recusa na escrita, recusa
  de ambiguidade na leitura) existem, e a suíte de integração monta o
  sequestrador de verdade com um caso de **CONTROLE** ao lado — sem ele, um
  resolver que recusasse tudo passaria nos dois casos positivos.
- **Eixos separados na degradação.** A metade restritiva
  (`public-booking.ts:528`) força `PLANOS.gratuito.recursos` explicitamente e
  está asserida contra um perfil com `cor_marca`/`logo_url`/`capa_url`
  realmente gravados no banco. Não encontrei caminho em que o ramo permissivo
  libere recurso pago: `dispararNotificacoesAgendamento` e o webhook releem o
  plano e caem no ramo conservador; a personalização é a única superfície paga
  da tela pública e é neutralizada nas duas pontas (`personalizacao` **e** os
  campos crus do `perfil`).

O que **não** está fechado, e por isso o status:

1. As duas Server Actions de slots continuam recebendo `duracaoMinutos` do
   navegador sem validação nenhuma, e esse número alimenta direto a condição de
   parada do laço de `gerarSlotsAntiBuraco`. Um valor negativo grande
   transforma uma requisição anônima em segundos de event loop travado e
   centenas de MB de heap — **medido nesta revisão**, não inferido (CR-01).
2. `verificar-superficie-anon.sh` sai `0` e imprime uma afirmação de fechamento
   mesmo quando nenhuma checagem mediu coisa alguma. O defeito WR-08 foi
   corrigido no eixo do *nome da tabela* e reapareceu no eixo da *identidade do
   endpoint* (CR-02).

O resto são avisos: uma condicional que não pode ser falsa apresentada como
guarda, a `.message` crua do Postgres ainda indo ao log no caminho público
(exatamente o que esta rodada removeu do `whatsapp-helper.ts`) e os dois
harnesses sem porta de entrada nenhuma.

`pnpm lint` e `pnpm test` foram executados nesta revisão e passaram.
`pnpm build` **não** foi executado.

## Critical Issues

### CR-01: `obterSlotsPublicos` aceita `duracaoMinutos` do navegador sem validação — laço praticamente ilimitado numa Server Action anônima

**Arquivo:** `src/app/actions/public-booking.ts:560-591` (consumidor:
`src/lib/booking-engine.ts:144`)

**Issue:**
`obterSlotsPublicos(slug, dateStr, duracaoMinutos)` é um endpoint POST público
— qualquer um lê o `Next-Action` id no bundle de `/book/<slug>` e chama com o
payload que quiser. Os três argumentos são repassados sem nenhuma validação:

```ts
const slots = await obterSlotsDisponiveis({
    tenantId: perfil.tenant_id,
    dateStr,                               // sem validação
    duracaoServicoMinutos: duracaoMinutos, // sem validação
    ...
})
```

Em `booking-engine.ts:144` o valor entra na condição de parada:

```ts
for (let candidato = a; candidato + duracaoMinutos <= b; candidato += 15) {
    candidatos.add(candidato)
}
```

Com `duracaoMinutos` negativo, a condição deixa de limitar a grade ao intervalo
livre e passa a limitá-la a `|duracaoMinutos|`. Medição feita nesta revisão
sobre a função pura, com um único intervalo `[480, 1080]`:

| `duracaoMinutos` | entradas no `Set` | tempo |
|---|---|---|
| `-1_000_000` | 66.708 | 5 ms |
| `-100_000_000` | 6.666.708 | 909 ms |

O crescimento é linear: `-10_000_000_000` produz ~666 M entradas — OOM do
processo Node antes de qualquer resposta, e o event loop bloqueado (não é I/O,
é laço síncrono) durante todo o percurso, o que derruba **todas** as
requisições em voo, não só a do atacante. Depois do laço ainda vem o `.filter()`
com um `intervalos.find()` por candidato, que multiplica o custo.

O caminho é alcançável com qualquer slug público válido (é o produto) e uma
data dentro do horizonte (hoje serve). O produto **proíbe CAPTCHA** por
invariante de Fricção Zero, então não existe camada acima que absorva isso: a
validação de entrada é a única defesa disponível.

Contraste que mostra que a inversão do modelo de confiança é acidental: o fluxo
**autenticado** `obterSlotsDashboard` (`src/app/actions/agendamentos.ts:189`)
valida `dateStr` com regex; o fluxo **público e anônimo** não valida nada.
`dateStr` inválido hoje só não estoura por acaso — a comparação de string
`dateStr > limiteData` (`booking-engine.ts:185`) devolve `[]` para qualquer
lixo alfabético, e `obterSlotsPublicos` responde `{ ok: true, slots: [] }` a uma
entrada malformada: exatamente a "grade calculada errada, sem sintoma" que o
JSDoc da função afirma ter eliminado.

**Fix:** validar na fronteira da action pública (e replicar em
`obterSlotsDashboard`), devolvendo discriminante em vez de lançar:

```ts
// src/app/actions/public-booking.ts
const DURACAO_MAXIMA_MINUTOS = 24 * 60

export async function obterSlotsPublicos(
    slug: string,
    dateStr: string,
    duracaoMinutos: number,
): Promise<ResultadoSlots> {
    // Os três argumentos vêm do navegador de um visitante sem sessão: entrada
    // hostil por definição. `duracaoMinutos` alimenta a condição de parada do
    // laço de gerarSlotsAntiBuraco — valor negativo vira laço praticamente
    // ilimitado, e basta uma requisição para travar o processo.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return { ok: false, motivo: 'data_invalida' }
    }
    if (
        !Number.isInteger(duracaoMinutos) ||
        duracaoMinutos <= 0 ||
        duracaoMinutos > DURACAO_MAXIMA_MINUTOS
    ) {
        return { ok: false, motivo: 'servico_invalido' }
    }
    ...
}
```

`data_invalida` e `servico_invalido` já são membros de `MotivoPublico`, então
os dois `Record` de `mensagens.ts` continuam compilando sem edição, e
`mensagemDeMotivo` mapeia ambos para `COPY_ERRO_SLOTS` — a cópia contratada da
caixa de horários. Recomendo **também** a guarda de profundidade na função
pura, porque ela é o invariante de verdade e sobrevive a um terceiro chamador
futuro:

```ts
// src/lib/booking-engine.ts, topo de gerarSlotsAntiBuraco
if (!Number.isInteger(duracaoMinutos) || duracaoMinutos <= 0) return []
```

---

### CR-02: `verificar-superficie-anon.sh` sai 0 afirmando fechamento quando não mediu nada — o falso verde do WR-08 mudou de eixo

**Arquivo:** `scripts/verificar-superficie-anon.sh:390-407` (classificação em
`:236-273` e `:290-329`)

**Issue:**
O script é o artefato de prova de SEG-01 e o cabeçalho diz, corretamente, que
"checagem que não prova nada não pode passar". O código não implementa isso em
dois cenários concretos.

**(a) Alvo inalcançável ⇒ tudo INCONCLUSIVO ⇒ exit 0 com frase de sucesso.**
`INCONCLUSIVO` por decisão explícita não derruba o exit code (`:33-35`). Se o
host não resolver ou a rede cair, `curl -s -w '%{http_code}'` devolve `000`;
`[ -z "$codigo" ]` é **falso** (a string `000` não é vazia), a execução cai no
ramo final e registra INCONCLUSIVO. Com as 11 checagens nesse estado,
`REPROVADAS` é `0` e a linha 399 imprime:

> `Resumo: 11 checagem(ns), 0 reprovada(s) — a role anon não devolveu linha nenhuma.`

Uma afirmação positiva de segurança emitida a partir de zero medição, com
`exit 0`. É o que um agente, um `&&` de shell ou um humano com pressa lê.

**(b) Projeto errado ⇒ tudo ESPERADO ⇒ exit 0 com linguagem de "prova
positiva".** Basta `NEXT_PUBLIC_SUPABASE_URL` apontar para outro projeto
Supabase (troca de ambiente, `.env.local` desatualizado, staging): nenhuma das
nove tabelas existe lá, o PostgREST devolve `PGRST205`, `tabela_declarada`
confirma o nome contra `supabase/schemas/*.sql` — que é **local**, não remoto —
e todas as checagens viram ESPERADO. A COBERTURA também passa. O WR-08 foi
fechado no eixo "o nome da tabela envelheceu"; o mesmo falso verde segue aberto
no eixo "o alvo não é o banco que eu penso que é".

O script irmão desta mesma rodada já tem o remédio e não o compartilhou: o
veredito `CONTROLE` de `verificar-travessia-server-action.sh:253-261` existe
justamente para que um build quebrado não seja lido como falha (ou sucesso) do
que se queria medir. Aqui não há controle positivo nenhum.

**Fix:** exigir prova positiva antes de permitir o exit 0, e acrescentar um
controle de identidade do alvo:

```bash
# Contador novo, ao lado de REPROVADAS/INCONCLUSIVAS
ESPERADAS=0
# ...em registrar(), no ramo *)
ESPERADAS=$((ESPERADAS + 1))

# ...antes do "Resumo:" final
if [ "$ESPERADAS" -eq 0 ]; then
    echo 'ERRO: nenhuma checagem produziu PROVA POSITIVA de fechamento.' >&2
    echo 'Alvo inalcançável, projeto errado ou rede caída — isto NÃO é um verde.' >&2
    exit 2
fi
```

E um controle de alvo: um nome de tabela sabidamente inexistente
(`tabela_canario_que_nao_existe`) tem de responder o **mesmo** `PGRST205` que
uma tabela declarada e fechada. Se os dois forem indistinguíveis para o script,
a bateria não está medindo fechamento — está medindo ausência, e precisa dizer
isso em voz alta (exit 2) em vez de exibir ESPERADO.

Enquanto isso não existir, o exit code deste script não deve ser usado como
evidência de que a superfície anônima está fechada — só a leitura linha a linha
do relatório serve, e é exatamente isso que ele foi escrito para evitar.

## Warnings

### WR-01: a condicional que sustenta a "janela de plano indeterminado" não pode ser falsa

**Arquivo:** `src/app/actions/public-booking.ts:224-226`

**Issue:** o bloco é apresentado como o limite exato do afrouxamento ("O
afrouxamento é ESTE e nada mais: aceita-se o slug acessado se ele for uma das
duas colunas do namespace público do perfil já encontrado"), mas a condição é
tautologicamente falsa. `perfil` só pode ter vindo de `lerPerfilPor(admin,
'slug', slug)` — e então `perfil.slug === slug` — ou de `lerPerfilPor(admin,
'slug_gratuito', slug)` — e então `perfil.slug_gratuito === slug`. Não existe
terceira origem: `const perfil = porCustomizado.data ?? porProvisionamento.data`
(`:173`). Logo `slug !== perfil.slug && slug !== perfil.slug_gratuito` nunca é
verdadeira, e o `return` interno é código morto.

O comportamento resultante é o pretendido (durante a degradação aceita-se
qualquer slug do namespace do perfil encontrado), mas quem ler depois vai
acreditar que existe uma restrição ali. Regra permanente desta fase: asserção
que não pode falhar não é asserção — e isso vale para o código de produção
também, não só para os harnesses.

**Fix:** apagar o `if` interno e deixar o ramo explícito sobre o que de fato
acontece.

```ts
if (degradadoPorErro) {
    // Plano desconhecido: NENHUMA comparação por slug efetivo. O perfil já foi
    // encontrado por uma das duas colunas do namespace (é o invariante de
    // `resolverPerfilPublicoPorSlug`), e a recusa de ambiguidade entre tenants
    // já rodou acima — não há restrição adicional a aplicar aqui.
} else if (obterSlugEfetivo(perfil, plano) !== slug) {
    return { ok: false, motivo: 'slug_invalido' }
}
```

---

### WR-02: a `.message` crua do Postgres continua indo ao log no caminho público — a mesma higiene que esta rodada aplicou ao `whatsapp-helper.ts`

**Arquivos:** `src/app/actions/public-booking.ts:179, 368, 398, 422, 500`;
`src/lib/assinaturas.ts:65, 133`

**Issue:** o projeto tem o helper certo, criado exatamente para isto —
`erroSinteticoSupabase()` reduz o erro a `supabase:<sqlstate>` porque, nas
palavras do próprio arquivo, "mensagem do Postgres embute literais do input". O
contexto do Sentry usa o helper; o `console.error` da linha imediatamente
anterior manda a `.message` inteira ao log do Railway.

`public-booking.ts:368` é o caso mais grave: a consulta é
`.eq('telefone', telefoneLimpo)`, ou seja, o literal que um erro de sintaxe do
Postgres ecoaria é o **telefone do cliente final** — PII de terceiro num log de
aplicação, contra o invariante permanente do projeto. E a ironia está escrita
três linhas abaixo, no comentário que justifica o `erroSinteticoSupabase`.

É a mesma contradição que a rodada acabou de resolver em
`whatsapp-helper.ts:88-95` ("o `console.error` contradizia o próprio vizinho, e
a trava anti-PII do Sentry não alcança o log do Railway"). O raciocínio está
escrito, o remédio existe e foi aplicado em um arquivo só.

**Fix:** logar o rótulo derivado, não a mensagem — o `import` já está no
arquivo.

```ts
console.error('Erro ao buscar cliente existente:', erroSinteticoSupabase(cError).message)
```

Vale para as sete ocorrências. `booking-engine.ts:203,226,253,292` está na mesma
cadeia de chamada pública e merece a mesma passagem.

---

### WR-03: nenhum dos dois harnesses tem porta de entrada — não há script, hook nem CI

**Arquivos:** `scripts/verificar-superficie-anon.sh`,
`scripts/verificar-travessia-server-action.sh`, `package.json`

**Issue:** `package.json` tem `test` e `test:integracao`; não tem nada para os
dois scripts. Não existe `.husky/` nem `.github/workflows/`. A única menção fora
de `.planning/` é um comentário dentro de um teste. Os dois arquivos declaram no
cabeçalho que existem para impedir uma regressão de voltar "sem ninguém ver" — e
ambos dependem de alguém lembrar do caminho completo e digitar
`bash scripts/...`. Trava que ninguém roda não trava nada, e a suíte de
integração desta mesma rodada mostra que o padrão certo é conhecido (ganhou
`pnpm test:integracao`).

**Fix:** dar entrada nomeada aos dois e citá-los na Definition of Done do
`CLAUDE.md` (ou em `docs/PENDENCIAS.md`, se o gate for manual por decisão
consciente):

```json
"verificar:anon": "bash scripts/verificar-superficie-anon.sh",
"verificar:travessia": "bash scripts/verificar-travessia-server-action.sh"
```

---

### WR-04: a "trava anti-afrouxamento" do harness anônimo não protege nada

**Arquivo:** `scripts/verificar-superficie-anon.sh:78-82`

**Issue:** a guarda compara `CODIGO_PERMISSAO_NEGADA` com a literal `'42501'` —
escrita duas linhas acima, no mesmo arquivo. Quem afrouxar a constante lê a
comparação no mesmo parágrafo e edita as duas; e um revisor que olhe o diff veria
a mudança da constante de qualquer forma. Custo zero, benefício zero — e o
efeito colateral não é neutro: dá a impressão de que o harness é auto-protegido,
o que reduz a atenção de quem revisa o próximo diff dele.

**Fix:** remover o bloco, ou trocá-lo por proteção real — tirar os códigos do
arquivo (fixture versionado com hash conferido) ou simplesmente usar os literais
inline nos pontos de uso, deixando óbvio que não há indireção a afrouxar.

---

### WR-05: `TODOS_OS_MOTIVOS` não é exaustivo por construção, e o JSDoc do teste promete que é

**Arquivo:** `src/app/book/__tests__/mensagens.test.ts:45-53, 127-153`

**Issue:** `as const satisfies readonly MotivoPublico[]` reprova um literal que
**não pertence** à união (renomeação quebra — essa parte do comentário está
certa), mas não exige que todos os membros estejam presentes. Acrescente um
oitavo membro a `MotivoPublico` e este array continua compilando: os três casos
que dizem "para TODOS os membros" passariam cobrindo sete de oito, em silêncio.

A exaustividade real existe e está no lugar certo — os dois
`Record<MotivoPublico, string>` de `mensagens.ts` quebram o `tsc` —, então **não
há buraco no comportamento entregue**. O buraco é na promessa do teste, que é
justamente onde a próxima pessoa vai confiar em vez de reler o mapeador.

**Fix:** derivar a lista do próprio mapeamento, em vez de redigitá-la:

```ts
// mensagens.ts
export const MOTIVOS_CONHECIDOS = Object.keys(COPIA_DO_ENVIO) as MotivoPublico[]

// mensagens.test.ts
import { MOTIVOS_CONHECIDOS } from '@/app/book/[slug]/mensagens'
```

Membro novo entra na iteração sem ninguém lembrar, e o `Record` continua sendo o
portão de compilação.

---

### WR-06: a guarda cruzada de namespace em `salvarPerfilEmpresa` é unidirecional

**Arquivo:** `src/app/actions/perfis-empresas.ts:206-221` (origem dos valores não
checados em `:184` e `:82-93`)

**Issue:** a checagem cobre `slugFinal` (o que vai para a coluna `slug`) contra o
`slug_gratuito` dos outros tenants. A direção oposta não é coberta por ninguém: o
`slug_gratuito` **recém-sorteado** nunca é comparado com o `slug` de outro
tenant, e nenhuma constraint expressa esse cruzamento
(`perfis_empresas_slug_gratuito_key` é `slug_gratuito` × `slug_gratuito`;
`perfis_empresas_slug_key` é `slug` × `slug`). Duas origens:

- `:184` — perfil novo já em plano pago: `slugGratuito = gerarSlugAleatorio()`, e
  o `if (slugFinal !== slugGratuito)` roda a checagem só sobre `slugFinal`;
- `:82-93` (`obterPerfilEmpresa`, auto-provisionamento) — grava o mesmo sorteio
  nas duas colunas sem checagem cruzada alguma.

A probabilidade é baixa (8 caracteres base36, com um leve viés de módulo em
`gerarSlugAleatorio`), mas a consequência não é benigna nem simétrica ao CR-03
original: com o resolver novo, a colisão não entrega a página ao tenant errado —
ela faz `resolverPerfilPublicoPorSlug` recusar por ambiguidade e **os dois links
caem em 404**, sem sintoma no dashboard de nenhum dos dois profissionais. É o
"caso degenerado" que a própria migration `20260722185755` descreve, por uma
porta que ela não fecha.

**Fix:** checar as duas direções (duas queries `.eq()` separadas — nunca um
`or()` montado com o valor) e re-sortear em caso de colisão:

```ts
const { count: colideComoGratuito } = await admin
    .from('perfis_empresas').select('tenant_id', { count: 'exact', head: true })
    .eq('slug_gratuito', slugFinal).neq('tenant_id', orgId)

const { count: colideComoCustomizado } = await admin
    .from('perfis_empresas').select('tenant_id', { count: 'exact', head: true })
    .eq('slug', slugGratuito).neq('tenant_id', orgId)
```

---

### WR-07: três cópias visíveis ao cliente final ficaram fora de `mensagens.ts`

**Arquivo:** `src/app/book/[slug]/BookingApp.tsx:258, 264, 268`

**Issue:** `mensagens.ts:121` afirma "fonte única de cópia continua valendo: cada
string existe uma vez, neste arquivo". Três strings que o cliente final lê na
caixa vermelha do formulário de contato continuam inline no componente:
`'Escolha o serviço e o horário antes de confirmar.'`, `'Informe seu nome.'` e
`'Informe o WhatsApp com DDD (10 ou 11 dígitos).'`. Não vazam nada, mas ficam
fora do pino byte a byte de `mensagens.test.ts` e fora da varredura de
identificadores proibidos que itera o módulo (`:163-174`) — que é exatamente a
garantia que o arquivo diz oferecer.

**Fix:** movê-las para `mensagens.ts` como `COPY_*` e importá-las; entram
automaticamente nas duas asserções de módulo já existentes.

---

### WR-08: `ResolucaoPerfil` é exportado e nunca importado

**Arquivo:** `src/app/actions/public-booking.ts:70`

**Issue:** é o tipo de retorno de uma função **privada** do módulo
(`resolverPerfilPublicoPorSlug`). Nenhum arquivo do repositório o importa. Num
arquivo `'use server'`, superfície exportada é a coisa que menos deve crescer por
inércia — e o vizinho `MotivoLeituraPublica` (`:51`), do mesmo escopo,
corretamente não é exportado.

**Fix:** remover o `export` de `ResolucaoPerfil`. `MotivoPublico`,
`ResultadoSlots`, `ResultadoAgendamentoPublico` e `AgendamentoCriado` têm
consumidor e ficam.

---

### WR-09: na migration de funções, o REVOKE é global e o GRANT para `service_role` é por schema

**Arquivo:** `supabase/migrations/20260722183153_fecha_data_api_para_funcoes_futuras.sql:93-101`

**Issue:** o raciocínio da alínea (iii) está certo e é bem medido — a revogação
precisa mesmo ser global. Mas o par ficou assimétrico:

```sql
alter default privileges for role postgres
  revoke all on functions from public;              -- GLOBAL, todos os schemas

alter default privileges for role postgres in schema public
  grant execute on functions to service_role;       -- só o schema public
```

A alínea "Custo aceito" nomeia a consequência global apenas para
`anon`/`authenticated`. Ela vale igualmente para `service_role`: função criada
pelo `postgres` em qualquer schema que não `public` nasce inexecutável também
pelo `createAdminClient()` — e desde a D-02 é ele que atende **todo** o caminho
público (perfil, plano, serviços, engine, cliente, escrita do agendamento). É
precisamente a role que a alínea (iv) diz que nunca pode ficar de fora, ficando
de fora por um caminho lateral.

**Fix:** tornar o GRANT global (simétrico ao REVOKE), ou acrescentar
`service_role` ao parágrafo de custo da migration **e** ao checklist de
`docs/03-PADROES_DE_BANCO_DE_DADOS.md`, para que a próxima função fora de
`public` não descubra isso em produção.

---

### WR-10: `plano_indeterminado` não entrou no vocabulário documentado de `disparos_whatsapp.motivo`

**Arquivos:** `src/app/api/webhooks/lembrete/route.ts:124`;
`supabase/schemas/09_disparos_whatsapp.sql` (`COMMENT ON COLUMN ... motivo`)

**Issue:** o `COMMENT ON COLUMN` enumera o vocabulário de motivos
(`agendamento_cancelado`, `plano_sem_whatsapp`, `whatsapp_desconectado`,
`erro_rede`, `http_<código>`) e a rodada acrescentou um sexto sem atualizá-lo. O
`CLAUDE.md` exige `COMMENT ON` com a intenção de negócio justamente para o banco
ser legível sem o código ao lado — e este motivo é o único do conjunto que
significa "a tentativa vai se repetir", o que muda como um painel de auditoria
deve contá-lo.

Correlato, e igualmente não documentado: esse ramo devolve 500 e grava uma linha
de auditoria **por retentativa** do QStash. É append-only por design e o volume é
irrelevante, mas quem construir o painel da Phase 11 precisa saber que essa é a
única linha que duplica legitimamente.

**Fix:** acrescentar `plano_indeterminado` ao `COMMENT ON COLUMN`, marcando que é
transitório, e registrar a duplicação esperada em `docs/PENDENCIAS.md` junto do
WR-06 já deferido.

---

_Revisado: 2026-07-22T18:55:00Z_
_Revisor: Claude (gsd-code-reviewer)_
_Profundidade: deep_
