---
phase: quick/260807-ooq
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/seed.sql
  - scripts/verificar-rate-limit-escrita.sh
  - CLAUDE.md
  - docs/RESET_AMBIENTE_DEV.md
  - docs/PENDENCIAS.md
  - .planning/phases/03-anti-abuso-no-booking-p-blico/03-UAT.md
autonomous: true
requirements: [ABU-01, ABU-03]

estimate:
  tokens: 88000
  raw_tokens: 44000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "Depois de `npx supabase db reset --local`, `/book/salao-do-seed` responde 200 com serviços e grade — sem nenhum cadastro manual e sem depender do Clerk."
    - "O seed nunca produz um tenant com `tenant_id` errado em silêncio: ou o owner ligou o GUC e o id é o real, ou o seed avisa no `RAISE NOTICE` que o dashboard não vai enxergar aquele tenant e diz como ligar."
    - "O harness aceita `ALVO_EXTERNO=<url>` e, nesse modo, não roda build, não sobe `next start` e não mata processo nenhum — o servidor que já estava no ar continua vivo depois da execução."
    - "Contra alvo externo, um id de Server Action que não corresponde ao build remoto ABORTA na preparação (exit 2), antes de qualquer sonda de contagem — nunca vira veredito."
    - "Rodar contra alvo externo exige confirmação explícita do custo; sem ela o harness aborta sem disparar uma única sonda."
    - "`MEDIR_HEADER_IP=1` responde, por observação do próprio balde do rate limit, qual header o alvo usou como chave — sem depender de painel e sem depender do sal."
    - "O modo padrão (sem `ALVO_EXTERNO`) e o contrafactual `SABOTAR_FORNECEDOR=1` continuam com os mesmos 7 vereditos e os mesmos códigos de saída de antes."
  artifacts:
    - supabase/seed.sql
    - scripts/verificar-rate-limit-escrita.sh
  key_links:
    - "`supabase/config.toml` (sem bloco `[db.seed]`) → o CLI usa o caminho default `./seed.sql`, então criar o arquivo já o liga ao `db reset --local`."
    - "`obterDadosBookingPublico` → `createAdminClient()` + `resolverPerfilPublicoPorSlug`: é o que faz `/book/<slug>` funcionar com RLS fora do caminho e independente do `org_id` ser real."
    - "`obterSlugEfetivo` (`src/lib/planos.ts`) → sem linha em `assinaturas` o plano é gratuito e o slug efetivo é `slug_gratuito`; o seed iguala as duas colunas por causa disso."
    - "Ordem das guardas em `criarAgendamentoPublico`: `campos_obrigatorios` retorna ANTES do rate limit — é o que torna a sonda de controle de id gratuita em tokens."
    - "`hashChaveRateLimit` (`src/lib/rate-limit.ts`, domínio `ratelimit`) + `hashComSal` (`src/lib/observabilidade/hash.ts`) → a fórmula que o snippet do harness reproduz para imprimir os hashes candidatos."
---

<objective>
Destravar as duas verificações humanas que sobraram da Phase 03 removendo o que as
impede — não marcando nada como aprovado.

1. **`supabase/seed.sql`** — o banco local nasceu hoje e nasceu vazio. Sem seed, o teste 5
   do UAT (ver em tela a copy do bloqueio de leitura) exige que o owner recadastre perfil,
   serviços e horários à mão a cada `db reset --local`. Com seed, `/book/salao-do-seed`
   está de pé um comando depois.
2. **`scripts/verificar-rate-limit-escrita.sh` contra URL externa** — o teste 6 (qual
   header de IP a Railway realmente entrega) só é medível contra o deploy. O harness já
   sabe provocar bloqueio e ler o discriminante; falta poder mirar fora do `127.0.0.1`, e
   falta um jeito de responder "qual header?" sem depender de painel.

Purpose: o teste 6 estava diferido para a Phase 11 com a justificativa "inalcançável sem
deploy em produção". O deploy existe desde hoje (`vamoagendar.com.br`, Railway, commit
`620b9fe` RUNNING). A premissa do adiamento caducou; falta só o instrumento.

Output: um seed, um harness com dois modos novos, e a documentação dizendo o que passou a
ser executável — **sem marcar nenhum item de UAT como `pass`**. Só o owner fecha item de UAT.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md
@supabase/config.toml
@supabase/schemas/01_perfis_empresas.sql
@supabase/schemas/02_servicos.sql
@supabase/schemas/03_horarios_funcionamento.sql
@scripts/verificar-rate-limit-escrita.sh
@src/lib/rate-limit.ts
@.planning/phases/03-anti-abuso-no-booking-p-blico/03-UAT.md
</context>

<decisoes>

Cinco decisões de desenho que o executor NÃO deve reabrir — foram tomadas contra o fonte
lido, e a justificativa é o que impede a próxima sessão de "simplificar" cada uma de volta.

**D-Q1 — o `tenant_id` do seed sai de um GUC opcional, com literal sintético como padrão.
Nunca de um `UPDATE` posterior.**

O `tenant_id` é o `org_id` do Clerk (`org_...`), vem da organização real do owner e não é
gerável. Três caminhos foram considerados:

- ❌ **`UPDATE perfis_empresas SET tenant_id = 'org_real'` depois do seed.** *Não existe.*
  `perfis_empresas.tenant_id` é PK referenciada pelas FKs `fk_tenant` das tabelas filhas com
  `ON DELETE CASCADE` e **sem** `ON UPDATE CASCADE` — o `UPDATE` falha por violação de FK.
  Ou o id nasce certo, ou não nasce.
- ❌ **`psql -v` / `\set`.** O seed é executado pelo CLI, não por um `psql` que o owner
  controla; depender de meta-comando é depender de detalhe interno de ferramenta.
- ✅ **GUC de role, com fallback literal.** O valor sai de
  `coalesce(nullif(current_setting('vamoagendar.org_id', true), ''), 'org_seed_local')`.
  Sem GUC ligado, `current_setting(..., true)` devolve NULL e o seed usa o literal
  sintético — degrada, nunca quebra. Com GUC ligado (`ALTER ROLE postgres SET
  vamoagendar.org_id = 'org_...'`, feito UMA vez), o tenant nasce com o id real; o ajuste
  mora em `pg_db_role_setting` com `datid = 0`, escopo de cluster, e por isso **sobrevive ao
  drop/create de database que o `db reset` faz**.

Por que o literal sintético nunca vira um `org_...` real no arquivo: `seed.sql` é versionado.
O `org_id` do owner não é segredo, mas é identificador de conta e não tem por que morar no
repositório.

**O aviso é parte da decisão, não enfeite.** Com `tenant_id` sintético o **dashboard** não
enxerga o tenant do seed (o RLS compara com o claim `org_id` do JWT) e o owner perde tempo
achando que o seed quebrou. Então o seed termina com `RAISE NOTICE` dizendo qual caminho foi
usado, e no caso do literal explica em uma linha que o booking público funciona assim mesmo e
como ligar o GUC se quiser o dashboard também.

**O booking público funciona com qualquer `tenant_id` — verificado no fonte, não assumido.**
`obterDadosBookingPublico` (`src/app/actions/public-booking.ts:945`) usa `createAdminClient()`
(service role, RLS bypassado) e resolve o tenant pelo slug em `resolverPerfilPublicoPorSlug`.
Nada no caminho de `/book/<slug>` consulta o Clerk. **Consequência direta: o teste 5 do UAT
não precisa do Clerk — precisa só do seed.**

**D-Q2 — `slug` = `slug_gratuito` = `salao-do-seed`, plano gratuito (sem linha em `assinaturas`).**

Sem assinatura vigente o plano é `gratuito`, e `obterSlugEfetivo` (`src/lib/planos.ts`)
devolve `slug_gratuito`. Se as duas colunas divergissem, `/book/salao-do-seed` daria 404 e o
link útil seria um slug aleatório que ninguém decora. Igualar as duas é o caso que
`resolverPerfilPublicoPorSlug` já trata explicitamente como trivial ("quem nunca personalizou
o link"), e as duas UNIQUE são índices **distintos** — o mesmo texto nas duas colunas da MESMA
linha não colide. Bônus: reproduz o estado do usuário recém-provisionado, que é o caminho que
mais gente vai percorrer.

**D-Q3 — dois serviços ativos, com durações diferentes (30 e 60 min).**

Duas durações porque `gerarSlotsAntiBuraco` usa a **menor duração ativa do tenant** para
decidir se uma sobra é invendável: com um serviço só, `gapAntes >= menorDuração` é
trivialmente a própria duração e a regra nunca é exercitada de verdade. Dois é também o teto
de serviços ativos do plano gratuito (`limiteServicosAtivos: 2`) — o seed encosta no teto de
propósito, porque é o estado real de quem entra pelo plano de entrada.

**D-Q4 — idempotente por escopo de tenant.**

`DELETE FROM perfis_empresas WHERE tenant_id = <o do seed>` na abertura (cascateia para
serviços, horários e agendamentos daquele tenant) e insere de novo. Serve tanto ao
`db reset --local` (banco limpo, o DELETE não acha nada) quanto a um `psql -f` avulso.
⚠️ Se o GUC apontar para a org REAL, um `psql -f` avulso apaga os dados LOCAIS daquele tenant.
É local, é o comportamento pretendido, e está escrito no cabeçalho do arquivo.

**D-Q5 — sem `agendamentos` e sem `clientes` no seed.**

Data fixa apodrece (vira passado e some da grade); data relativa faz o seed produzir estado
diferente a cada execução e colidir com o que o owner acabou de testar à mão. A grade vazia é
o estado que os testes 5 e 6 precisam.

</decisoes>

<tasks>

<task type="tracer">
  <name>Task 1: seed do banco local — um tenant utilizável a um `db reset` de distância</name>
  <files>supabase/seed.sql, CLAUDE.md, docs/RESET_AMBIENTE_DEV.md</files>
  <precondition>A stack local do Supabase está de pé (`npx supabase status` responde com Postgres em 54422). Se não estiver, `npx supabase start` antes — o seed não é verificável contra banco que não existe.</precondition>
  <action>
Criar `supabase/seed.sql`. Não existe bloco `[db.seed]` em `supabase/config.toml`, então o
CLI já usa o caminho default `./seed.sql` — criar o arquivo basta para ligá-lo ao
`db reset --local`.

Estrutura do arquivo, nesta ordem:

1. **Cabeçalho em pt-BR** explicando: que este arquivo roda em TODO `db reset --local` e só
   nele (a nuvem nunca é semeada por aqui); a decisão D-Q1 inteira (por que GUC, por que o
   `UPDATE` posterior não existe por causa da FK sem `ON UPDATE CASCADE`, por que o literal é
   sintético); e a ressalva do D-Q4 sobre o DELETE de abertura apagar dados locais do tenant
   alvo quando rodado à mão.
2. Um bloco `DO $$ ... $$` único, com `v_tenant_id text` resolvido por
   `coalesce(nullif(current_setting('vamoagendar.org_id', true), ''), 'org_seed_local')` e um
   `v_usou_guc boolean` derivado da mesma checagem.
3. `DELETE FROM perfis_empresas WHERE tenant_id = v_tenant_id;` (D-Q4).
4. `INSERT INTO perfis_empresas` com: `tenant_id = v_tenant_id`, `slug` e `slug_gratuito`
   ambos `'salao-do-seed'` (D-Q2), `nome_estabelecimento` identificando que é dado de seed
   (algo como `Salão do Seed (ambiente local)`), `descricao` curta, `timezone`
   `'America/Sao_Paulo'` explícito (não deixar implícito no default — o arquivo tem de ser
   auto-explicativo), `antecedencia_minima_minutos` 15 e `horizonte_maximo_dias` 14. Nada de
   `cor_marca`/`logo_url`/`capa_url`: são exclusivos do Pro e o seed é gratuito, então a
   página pública os ignoraria de qualquer jeito.
5. `INSERT INTO servicos` com dois serviços ativos de durações diferentes (D-Q3): um de
   30 min e um de 60 min, preços plausíveis, nomes de domínio em pt-BR do nicho real do
   produto (design de sobrancelha, por exemplo). Comentar no SQL POR QUE são duas durações
   (a regra anti-buraco usa a menor duração ativa do tenant).
6. `INSERT INTO horarios_funcionamento` cobrindo a semana com N janelas por dia (é o que a
   tabela suporta e o que o seed precisa exercitar): segunda a sexta (`dia_semana` 1..5) com
   DUAS janelas — `09:00`–`12:00` e `13:00`–`18:00`; sábado (`6`) com UMA janela
   `09:00`–`13:00`; domingo (`0`) sem linha nenhuma (fechado). Comentar que 0 = domingo.
7. `RAISE NOTICE` final: sempre imprime o slug público (`/book/salao-do-seed`) e quantos
   serviços/janelas foram criados. Quando `v_usou_guc` for falso, imprime também que o
   dashboard NÃO vai enxergar este tenant (o RLS compara com o claim `org_id` do JWT), que o
   booking público funciona assim mesmo, e a linha exata do `ALTER ROLE postgres SET
   vamoagendar.org_id = '<seu org_...>'` seguida de novo `db reset --local`. Quando for
   verdadeiro, imprime que o id veio do GUC (sem repetir o valor — quem ligou já sabe qual é).

Depois: acrescentar em `CLAUDE.md`, na seção "Infraestrutura", um bloco curto sobre o seed
(existe, roda em todo `db reset --local`, cria `salao-do-seed`, e o GUC opcional para o
tenant nascer com o `org_id` real). E uma seção nova em `docs/RESET_AMBIENTE_DEV.md`
documentando o passo do seed no procedimento de reset — incluindo a advertência de que o
`ALTER ROLE` é feito uma vez e sobrevive ao reset.
  </action>
  <verify>
    <automated>npx supabase db reset --local &amp;&amp; psql "postgresql://postgres:postgres@127.0.0.1:54422/postgres" -v ON_ERROR_STOP=1 -c "DO \$\$ DECLARE v_t text; BEGIN SELECT tenant_id INTO v_t FROM perfis_empresas WHERE slug = 'salao-do-seed'; IF v_t IS NULL THEN RAISE EXCEPTION 'o seed nao criou o perfil'; END IF; IF (SELECT slug_gratuito FROM perfis_empresas WHERE tenant_id = v_t) <> 'salao-do-seed' THEN RAISE EXCEPTION 'slug e slug_gratuito divergem — o link do plano gratuito nao seria o esperado'; END IF; IF (SELECT count(*) FROM servicos WHERE tenant_id = v_t AND ativo) <> 2 THEN RAISE EXCEPTION 'servicos ativos != 2'; END IF; IF (SELECT count(DISTINCT duracao_minutos) FROM servicos WHERE tenant_id = v_t AND ativo) <> 2 THEN RAISE EXCEPTION 'as duas duracoes sao iguais — a regra anti-buraco nao seria exercitada'; END IF; IF (SELECT count(DISTINCT dia_semana) FROM horarios_funcionamento WHERE tenant_id = v_t AND ativo) < 6 THEN RAISE EXCEPTION 'menos de 6 dias com janela ativa'; END IF; END \$\$;"</automated>
    <automated>set -m; pnpm exec next dev --port 3994 >/tmp/seed-dev.log 2>&amp;1 &amp; DEV=$!; set +m; for i in $(seq 1 60); do [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:3994/book/salao-do-seed)" = "200" ] &amp;&amp; break; sleep 2; done; CORPO=$(curl -s --max-time 30 http://127.0.0.1:3994/book/salao-do-seed); kill -- -$DEV 2>/dev/null; printf '%s' "$CORPO" | grep -q 'Salão do Seed' &amp;&amp; echo 'PAGINA PUBLICA OK' || { echo 'FALHOU: /book/salao-do-seed nao renderizou o estabelecimento'; exit 1; }</automated>
    <automated>psql "postgresql://postgres:postgres@127.0.0.1:54422/postgres" -v ON_ERROR_STOP=1 -qtAc "set vamoagendar.org_id = 'org_teste_do_guc'; select coalesce(nullif(current_setting('vamoagendar.org_id', true), ''), 'org_seed_local');" | grep -qx 'org_teste_do_guc' &amp;&amp; echo 'EXPRESSAO DO GUC OK'</automated>
  </verify>
  <done>`npx supabase db reset --local` deixa `/book/salao-do-seed` respondendo 200 com o nome do estabelecimento no HTML, dois serviços ativos de durações diferentes e seis dias com janela. Sem GUC ligado o seed avisa, no NOTICE, que o dashboard não enxergará o tenant e como corrigir. `CLAUDE.md` e `docs/RESET_AMBIENTE_DEV.md` descrevem o seed e o `ALTER ROLE`.</done>
</task>

<task type="auto">
  <name>Task 2: harness aceita alvo externo — sem build, sem subir servidor, sem matar processo, e com controle de id</name>
  <files>scripts/verificar-rate-limit-escrita.sh</files>
  <action>
Acrescentar o modo `ALVO_EXTERNO=<url>` ao harness. Regra que domina todas as outras: **sem
`ALVO_EXTERNO`, nada muda** — mesmos 7 vereditos, mesma ordem, mesmo texto, mesmos códigos de
saída. Todo comportamento novo entra atrás de `MODO_EXTERNO`.

Mudanças, todas com comentário em pt-BR explicando a INTENÇÃO (o arquivo já tem 11 notas
técnicas numeradas no cabeçalho; as notas novas entram na mesma numeração e no mesmo tom):

1. **Alvo.** `MODO_EXTERNO=1` quando `ALVO_EXTERNO` está definido; `BASE_URL` passa a ser a
   URL informada, com barra final removida. `PORTA` deixa de significar coisa alguma nesse
   modo e não deve aparecer no cabeçalho do relatório.

2. **Ciclo de vida.** Em modo externo: não roda `pnpm build`, não chama `iniciar_servidor`,
   não checa `porta_ocupada` e não monta `COMPLEMENTO_DEV` (não há processo nosso para herdar
   env). `PID` permanece vazio, e `encerrar_servidor` já retorna cedo nesse caso — confirmar
   que o `trap`/`limpar` não toca em processo nenhum. Isto é requisito, não detalhe: o alvo
   externo é um servidor de outra pessoa.

3. **Credenciais.** A checagem de `UPSTASH_REDIS_REST_URL`/`_TOKEN` em `.env.local` vale só
   no modo local — é ela que impede o harness de medir o no-op. Em modo externo ela é
   irrelevante (o alvo tem o ambiente dele) e **abortar por causa dela seria erro de
   preparação inventado**. Comentar isso; e comentar a consequência honesta: se o ALVO
   estiver em no-op, o veredito BLOQUEIO reprova, que é a leitura correta.

4. **Portão de custo.** Modo externo exige `CONFIRMO_CUSTO_NO_ALVO=1`. Sem isso, abortar
   (exit 2) ANTES de qualquer sonda, com mensagem declarando o custo real: consome orçamento
   de rate limit de verdade no alvo, escreve contadores no Redis dele, e — quando o alvo é
   produção — pode deixar o IP que rodou sem poder criar agendamento pela duração da janela.
   Declarar também o que NÃO acontece: as sondas usam slug inexistente com os demais campos
   válidos e morrem em `slug_invalido`, depois do rate limit e antes da resolução do slug, então
   nenhum agendamento e nenhum cliente são gravados (é a nota 5 do cabeçalho, que continua valendo).

5. **Incoerência proibida.** `SABOTAR_FORNECEDOR=1` junto de `ALVO_EXTERNO` aborta (exit 2):
   o contrafactual funciona injetando env no processo que o harness sobe, e em modo externo
   não existe esse processo. Fingir que funcionaria produziria um "contrafactual" que na
   verdade mediu o alvo intacto — o pior desfecho possível para um controle.

6. **Manifesto.** Em modo externo o harness NÃO constrói: se `.next/server/server-reference-manifest.json`
   não existir, abortar (exit 2) mandando rodar `pnpm build` **no commit que está deployado**.
   Construir sozinho aqui seria pior que não construir: geraria um id a partir da árvore de
   trabalho e daria a ilusão de correspondência com o alvo — e correspondência é exatamente o
   que o passo seguinte existe para medir.

7. **⚠️ Novo aborto CONTROLE_DE_ID — a armadilha central deste modo.** O id vem do manifesto
   do build LOCAL; contra o alvo remoto ele pode simplesmente não existir. Id errado não dá
   erro óbvio: dá uma resposta diferente, que o harness classificaria como veredito. Antes de
   qualquer sonda de contagem, mandar uma **sonda de controle**:

   - mesmo corpo de `corpo_sonda`, com `clienteNome` vazio;
   - esperar HTTP 200 e corpo contendo o discriminante de campos obrigatórios.

   Por que essa sonda especificamente: a ordem das guardas em `criarAgendamentoPublico` é
   `honeypot → campos obrigatórios → telefone → nome → e-mail → data → RATE LIMIT → slug`. O
   ramo de campo obrigatório retorna **antes** do rate limit, então a sonda de controle custa
   ZERO token — ela prova que o id resolve para aquela action no alvo sem consumir orçamento
   nenhum. Prova também que resolve para *aquela* action, e não para outra: nenhuma outra
   devolve esse discriminante.

   Falhou ⇒ abortar (exit 2) com a hipótese mais provável escrita na mensagem: a árvore de
   trabalho local não é o commit deployado. E uma segunda hipótese, para quem receber 403/500
   em vez de um corpo de action: a proteção de origem das Server Actions do Next, antes de
   suspeitar do id. **Nunca produzir veredito sobre um id que o alvo não tem.**

8. **Cabeçalho do relatório** em modo externo: dizer, em letras grandes, qual URL está sendo
   medida e que o servidor não é gerenciado por este script.
  </action>
  <verify>
    <automated>bash -n scripts/verificar-rate-limit-escrita.sh</automated>
    <automated>ALVO_EXTERNO=https://vamoagendar.com.br bash scripts/verificar-rate-limit-escrita.sh; [ $? -eq 2 ] &amp;&amp; echo 'PORTAO DE CUSTO OK (abortou sem sondar)'</automated>
    <automated>ALVO_EXTERNO=https://vamoagendar.com.br CONFIRMO_CUSTO_NO_ALVO=1 SABOTAR_FORNECEDOR=1 bash scripts/verificar-rate-limit-escrita.sh; [ $? -eq 2 ] &amp;&amp; echo 'INCOERENCIA RECUSADA OK'</automated>
    <automated>PULAR_BUILD=1 bash scripts/verificar-rate-limit-escrita.sh; echo "modo padrao saiu $?"</automated>
    <automated>set -m; pnpm exec next start --port 3993 >/tmp/alvo-local.log 2>&amp;1 &amp; SRV=$!; set +m; sleep 8; ALVO_EXTERNO=http://127.0.0.1:3993 CONFIRMO_CUSTO_NO_ALVO=1 bash scripts/verificar-rate-limit-escrita.sh; CODIGO=$?; kill -0 $SRV 2>/dev/null &amp;&amp; echo 'SERVIDOR SOBREVIVEU AO HARNESS (modo externo nao mata processo)' || echo 'FALHOU: o harness matou um processo que nao era dele'; kill -- -$SRV 2>/dev/null; [ "$CODIGO" -eq 0 ]</automated>
  </verify>
  <done>Modo padrão inalterado (7 vereditos, exit 0). Modo externo contra um `next start` local: exit 0, mesmos vereditos, sem build, e o servidor continua vivo depois. Sem `CONFIRMO_CUSTO_NO_ALVO` aborta 2 sem disparar sonda; com `SABOTAR_FORNECEDOR` aborta 2. Id que não corresponde ao alvo aborta 2 no CONTROLE_DE_ID.</done>
</task>

<task type="auto">
  <name>Task 3: medir qual header de IP o alvo usa, pelo próprio balde — e registrar o que passou a ser executável</name>
  <files>scripts/verificar-rate-limit-escrita.sh, docs/PENDENCIAS.md, .planning/phases/03-anti-abuso-no-booking-p-blico/03-UAT.md</files>
  <action>
Acrescentar o modo `MEDIR_HEADER_IP=1`, que substitui a bateria normal de vereditos por uma
medição. Funciona nos DOIS modos (local e externo) — e rodar local é o controle que prova que
o instrumento discrimina, porque local a resposta é conhecida de antemão: sem proxy na frente,
o `X-Real-IP` que a sonda manda é o único candidato possível.

**O oráculo é o próprio balde do rate limit, não o painel.** O `chaveHash` não volta na
resposta HTTP, então "qual header o app usou" seria, por painel, um teste de crença. Pelo
balde vira observação: quem encheu o balde é quem é a chave.

Dois candidatos de faixas de documentação diferentes, para serem inconfundíveis no relatório e
em qualquer painel: um `203.0.113.x` (RFC 5737 TEST-NET-3) que vai em `X-Real-IP` e um
`192.0.2.x` (TEST-NET-1) que vai em `X-Forwarded-For`. Octeto final derivado do relógio, pelo
mesmo motivo da nota 4 do cabeçalho.

Sequência:

1. **BASELINE** — uma sonda SEM header forjado nenhum. Tem de PASSAR. Se vier bloqueada,
   abortar (exit 2): o balde da chave que o alvo usa para nós já está sujo e nada do que vem
   depois mede o que diz medir. É a mesma lógica da nota 8 (JANELA_LIMPA aborta, não reprova).
2. **ENCHER** — sondas com os DOIS headers forjados, com valores diferentes entre si, até vir
   bloqueado ou até esgotar `TETO_ESCRITA_IP + EXCEDENTE` tentativas. Nunca bloqueou ⇒
   relatar inconclusivo e sair 2: pode ser rate limit em no-op no alvo, e nesse estado a
   medição não existe.
3. **DISCRIMINAR** — três sondas, uma de cada forma, classificadas com o `classificar` que já
   existe:
   - sem header forjado nenhum;
   - só `X-Real-IP` com o candidato TEST-NET-3;
   - só `X-Forwarded-For` com o candidato TEST-NET-1.
4. **VEREDITO** por tabela verdade, escrita como comentário no script e impressa no relatório:
   - a sonda **sem header** bloqueada ⇒ o alvo ignorou os nossos headers e chaveou pelo IP real
     da conexão. **É o desfecho bom**: a camada de IP não é forjável de fora. (Nesse mundo as
     três costumam vir bloqueadas, porque todas caem no mesmo balde.)
   - só a de **`X-Real-IP`** bloqueada, com a sem-header passando ⇒ o `x-real-ip` que o cliente
     manda chega intacto ao app. **Forjável** — a camada de IP precisa ser recalibrada.
   - só a de **`X-Forwarded-For`** bloqueada ⇒ a última entrada do XFF é texto do cliente, ou
     seja, o proxy não anexa. **Forjável**, pelo outro eixo.
   - nenhuma bloqueada ⇒ inconclusivo (a janela virou no meio da medição, ou o alvo tem
     comportamento não previsto). Relatar como inconclusivo, jamais como aprovação.
   Registrar no relatório a ressalva de que "as três bloqueadas" e "o app está barrando tudo"
   só se separam com o BASELINE do passo 1 e com o veredito ISOLAMENTO_POR_IP de uma execução
   normal — a lição da nota 7, aplicada ao instrumento novo.

   **O veredito sai também em UMA linha legível por máquina**, como último item do relatório,
   no formato `VEREDITO_HEADER: <valor>` com exatamente quatro valores possíveis:
   `ip-da-conexao`, `x-real-ip`, `x-forwarded-for`, `inconclusivo`. Sem essa linha, a única
   forma de um script conferir o resultado é grepar a prosa do relatório — e a prosa contém a
   tabela verdade inteira, que casa com qualquer veredito. Um gate assim ficaria verde
   independentemente do que foi medido, que é o falso-verde clássico deste projeto.
5. **Hashes candidatos, como corroboração — nunca como o veredito.** Imprimir
   `hashChaveRateLimit` de cada um dos dois candidatos, para o owner comparar com o `chaveHash`
   do Sentry Log. Regras:
   - fórmula reproduzida por um `node -e` inline: sha256 de sal, domínio e valor separados por
     barra vertical, truncado a 16 hex — é uma DUPLICATA de `hashComSal`
     (`src/lib/observabilidade/hash.ts`) com o domínio de `hashChaveRateLimit`
     (`src/lib/rate-limit.ts`). Comentar que as duas mudam juntas.
   - **tripwire** contra a duplicata envelhecer em silêncio: antes de imprimir, exigir por
     `grep` que o domínio de hash continue declarado em `src/lib/rate-limit.ts` e que o
     truncamento a 16 continue em `src/lib/observabilidade/hash.ts`. Qualquer um dos dois
     falhando ⇒ pular a impressão e avisar que a forma do hash mudou e o snippet precisa ser
     atualizado. Melhor não imprimir do que imprimir hash de fórmula velha.
   - o sal sai de `ANALYTICS_TENANT_SALT` do ambiente. Ausente ⇒ não imprimir hash nenhum e
     dizer por quê (hash com sal vazio é hash errado que parece certo). Presente ⇒ imprimir os
     hashes com a ressalva explícita: **se o sal deste shell não for o mesmo do alvo, os dois
     hashes vão diferir do painel e isso NÃO significa que nenhum dos candidatos foi usado** —
     o veredito do balde é que manda.
   - o VALOR do sal nunca é impresso, em ramo nenhum (nota 1 do cabeçalho). Acrescentar uma
     linha pedindo que os hashes não sejam colados em issue/PR: são pseudônimos, mas de
     plaintext conhecido.
6. **Custo.** O modo de medição gasta mais que uma execução normal (até ~16 sondas de escrita)
   e, no desfecho bom (proxy sobrepondo), quem enche o balde é o **IP real de quem rodou** — o
   que deixa esse IP sem poder criar agendamento pela janela inteira. Declarar isso na mesma
   mensagem do portão `CONFIRMO_CUSTO_NO_ALVO`, que continua obrigatório em modo externo.

**Depois do script, a documentação** — registrando o que passou a ser executável, e nada além
disso. Não marcar item de UAT como `pass` em nenhuma hipótese; não mudar o `result:` de
nenhum teste.

- `03-UAT.md`, teste 5: acrescentar uma nota curta dizendo que o pré-requisito de ambiente
  caiu — `npx supabase db reset --local` entrega `/book/salao-do-seed` pronto, e o Clerk não é
  necessário para essa tela porque a leitura pública roda com cliente privilegiado resolvido
  por slug. Mantém `result: [pending]`.
- `03-UAT.md`, teste 6: acrescentar um bloco `instrumento_disponivel:` com os comandos exatos
  (execução normal contra o deploy e execução com `MEDIR_HEADER_IP=1`), a tabela verdade
  resumida, o custo declarado, e a observação de que a justificativa do adiamento
  ("inalcançável sem deploy em produção") caducou — o deploy existe. **Manter `result: deferred`:
  reclassificar é decisão do owner, não do executor.**
- `docs/PENDENCIAS.md`: nos itens correspondentes de "Verificações manuais da Phase 03" e
  "Diferidos para o go-live", registrar que o instrumento passou a existir, com o comando e o
  custo. As caixas continuam desmarcadas.
  </action>
  <verify>
    <automated>bash -n scripts/verificar-rate-limit-escrita.sh</automated>
    <automated>set -m; pnpm exec next start --port 3993 >/tmp/alvo-medicao.log 2>&amp;1 &amp; SRV=$!; set +m; sleep 8; MEDIR_HEADER_IP=1 ALVO_EXTERNO=http://127.0.0.1:3993 CONFIRMO_CUSTO_NO_ALVO=1 bash scripts/verificar-rate-limit-escrita.sh | tee /tmp/medicao.out; kill -- -$SRV 2>/dev/null; grep -qx 'VEREDITO_HEADER: x-real-ip' /tmp/medicao.out &amp;&amp; echo 'CONTROLE DE RESPOSTA CONHECIDA OK: sem proxy na frente, o instrumento apontou o header que a sonda mandou' || { echo "FALHOU: veredito inesperado — $(grep '^VEREDITO_HEADER:' /tmp/medicao.out)"; exit 1; }</automated>
    <automated>grep -c 'result: pass' .planning/phases/03-anti-abuso-no-booking-p-blico/03-UAT.md | grep -qx '3' &amp;&amp; echo 'NENHUM TESTE NOVO MARCADO COMO APROVADO (continuam os mesmos 3)'</automated>
  </verify>
  <done>`MEDIR_HEADER_IP=1` contra um alvo local (resposta conhecida: sem proxy, o header da sonda é o único candidato) conclui apontando o `x-real-ip`. Sal ausente não imprime hash. `03-UAT.md` e `docs/PENDENCIAS.md` descrevem o instrumento novo e seu custo, com todos os `result:` intactos e o total de aprovados ainda em 3.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| harness → deploy de produção | tráfego sintético gerado por este repo atravessa a internet e escreve contadores no Redis de produção do alvo |
| `seed.sql` → banco local | DDL/DML executado com privilégio total a cada `db reset --local` |
| terminal do owner → repositório | valores impressos pelo harness podem acabar colados em issue/PR |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-ooq-01 | Denial of Service | `escrita_ip` do alvo em produção | medium | mitigate | portão `CONFIRMO_CUSTO_NO_ALVO=1` obrigatório em modo externo, com o custo (janela do IP queimada por 10 min) escrito na mensagem de aborto; nenhuma sonda dispara antes da confirmação |
| T-ooq-02 | Tampering | veredito sobre id de Server Action inexistente no alvo | high | mitigate | sonda de controle gratuita (morre no ramo de campos obrigatórios, antes do rate limit) exigindo 200 + discriminante da própria action; falha ⇒ exit 2 antes de qualquer contagem |
| T-ooq-03 | Information Disclosure | `ANALYTICS_TENANT_SALT` no relatório | high | mitigate | só hashes são impressos, nunca o sal; sal ausente ⇒ nada é impresso em vez de hash com sal vazio; aviso para não colar hashes em issue/PR |
| T-ooq-04 | Information Disclosure | `org_id` real do owner versionado em `seed.sql` | medium | mitigate | literal do seed é sintético (`org_seed_local`); o id real entra por GUC de role, fora do arquivo versionado (D-Q1) |
| T-ooq-05 | Denial of Service | processo de terceiro morto pelo `trap` do harness | medium | mitigate | em modo externo `PID` nunca é atribuído e `encerrar_servidor` retorna cedo; verificado com asserção de que o servidor alvo continua vivo depois da execução |
| T-ooq-06 | Tampering | `DELETE` de abertura do seed contra tenant real | low | accept | escopo é banco LOCAL e apenas o `tenant_id` do seed; comportamento pretendido do D-Q4, documentado no cabeçalho do arquivo |
</threat_model>

<verification>
Definition of Done do projeto, com saída real mostrada (nenhuma das quatro é opcional):

```bash
pnpm lint
pnpm test
pnpm build
npx tsc --noEmit
```

Nem o seed (SQL) nem o harness (bash) são cobertos por essas quatro — elas provam ausência de
regressão, não a entrega. A prova da entrega são os `<verify>` das tarefas, e em especial:

- o modo padrão do harness saindo 0 com os mesmos 7 vereditos (não-regressão do instrumento);
- o contrafactual `SABOTAR_FORNECEDOR=1` continuando a exigir vermelho e saindo 0 ao obtê-lo;
- o modo externo apontado para um `next start` local, que exercita cada ramo novo sem gastar
  um único token do alvo de produção.

⚠️ **Custo declarado destas verificações:** cada execução completa do harness gasta ~13
comandos no Redis de DEV; o plano roda o harness quatro vezes (padrão, contrafactual, externo
local, medição), ou seja ~55 comandos. O plano Free da Upstash tem cota diária — se ela
estourar no meio, o sintoma é o veredito BLOQUEIO reprovando por motivo errado. Nesse caso,
parar e relatar, nunca "tentar de novo até ficar verde".

⚠️ **Modo de falha conhecido do harness local depois da mudança de ambiente de hoje:** o
`.env.local` passou a apontar para o Supabase LOCAL. As sondas morrem em `slug_invalido`, o
que exige que `createAdminClient()` consiga consultar o banco. Se as chaves locais não
estiverem certas, a resolução devolve erro interno em vez de slug inválido e o harness aborta
em JANELA_LIMPA com corpo indefinido. Isso é problema de ambiente, não do script — diagnosticar
antes de mexer no harness.
</verification>

<success_criteria>
- `npx supabase db reset --local` entrega `/book/salao-do-seed` respondendo 200, com dois
  serviços de durações diferentes e seis dias com janela — zero cadastro manual.
- O seed nunca deixa o `tenant_id` errado passar em silêncio: sem GUC, o `RAISE NOTICE` diz
  que o dashboard não vai enxergar e como corrigir.
- `ALVO_EXTERNO=<url>` mede um servidor que o harness não construiu, não subiu e não matou.
- Id de Server Action que não corresponde ao alvo aborta com exit 2 antes de qualquer sonda de
  contagem; sem confirmação de custo, o modo externo não dispara nada.
- `MEDIR_HEADER_IP=1` responde qual header o alvo usou por observação do balde, e prova que
  discrimina rodando contra um alvo de resposta conhecida.
- `03-UAT.md` e `docs/PENDENCIAS.md` registram o que passou a ser executável, com o total de
  testes aprovados ainda em 3 e nenhum `result:` alterado.
- `pnpm lint`, `pnpm test`, `pnpm build` e `npx tsc --noEmit` passam, com saída real mostrada.
</success_criteria>

<output>
Criar `.planning/quick/260807-ooq-seed-local-de-desenvolvimento-e-harness-/260807-ooq-SUMMARY.md` ao terminar.
</output>
