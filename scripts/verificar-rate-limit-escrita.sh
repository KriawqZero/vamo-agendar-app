#!/usr/bin/env bash
#
# Prova, contra um `next start` de verdade e um Upstash Redis de verdade, que a
# camada `escrita_ip` do rate limit BARRA de fato — e que barra por CHAVE, não
# globalmente.
#
# Por que existe: é o SC1 da Phase 3 pelo lado da Server Action, e ele não é
# alcançável por `vitest`. A suíte hermética prova a DECISÃO do app sobre a
# resposta do fornecedor (o limiter é mockado); nunca prova a resposta do
# fornecedor. Pior: sem as credenciais do Upstash o módulo inteiro opera em
# no-op (`LIMITERS` vira `{}` e `verificarLimite` devolve PASSE em toda camada),
# então um sistema COMPLETAMENTE desprotegido e um sistema funcionando são
# indistinguíveis para qualquer teste que não fale com o Redis real.
#
# ---------------------------------------------------------------------------
# NOTAS TÉCNICAS (leia antes de mexer)
# ---------------------------------------------------------------------------
#
# 1) SEGREDOS. O script NÃO lê, não sourceia e não referencia arquivo de
#    ambiente: `next start` carrega o dele sozinho. Nenhum VALOR de variável é
#    impresso em ramo nenhum — só NOMES aparecem no relatório. Mesmo contrato de
#    `verificar-travessia-server-action.sh` e `verificar-fail-fast-boot.sh`.
#
# 2) O ID DA SERVER ACTION É DERIVADO, NUNCA LITERAL. Sai do manifesto do build
#    (`.next/server/server-reference-manifest.json`) a cada execução. Id colado à
#    mão sobrevive à refatoração que o invalida, e o harness ficaria verde
#    medindo nada. Não derivável ⇒ ABORTA (código 2), nunca degrada.
#
# 3) POR QUE A SONDA MANDA `X-Real-IP`. Requisição de `curl` para o loopback não
#    carrega `x-real-ip` nem `x-forwarded-for`. Sem um deles, `ipDoVisitante`
#    devolve `null`, `montarChave` devolve `null` e `verificarLimite` devolve
#    PASSE — o harness nunca veria um bloqueio, e o veredito BLOQUEIO seria
#    insatisfazível por construção. Mandar o header é simular o proxy, que é
#    exatamente o papel dele em produção.
#
#    Efeito colateral desejado: isto também EXERCITA o conserto do CR-01. A
#    ordem implementada é `x-real-ip` → última entrada do `x-forwarded-for`. Se
#    alguém reverter para "primeira entrada do XFF", este harness continua
#    passando (o header é único), mas o veredito ISOLAMENTO_POR_IP quebra na
#    hora em que a chave deixar de variar com o header.
#
# 4) O IP DE TESTE É ÚNICO POR EXECUÇÃO, e isso não é capricho. O teto é
#    10 requisições / 10 minutos POR CHAVE. Com IP fixo, a segunda execução
#    dentro da janela começaria já bloqueada e o veredito PASSAGEM reprovaria
#    por motivo errado — o harness deixaria de ser reexecutável, que é o que o
#    torna útil. Os IPs saem da faixa 198.51.100.0/24 (RFC 5737, TEST-NET-2):
#    reservada para documentação, nunca roteável, jamais o IP de alguém.
#
# 5) A SONDA USA SLUG INEXISTENTE COM OS DEMAIS CAMPOS VÁLIDOS, e a ordem das
#    guardas em `criarAgendamentoPublico` é o que torna isso possível:
#
#        honeypot → campos_obrigatorios → telefone → nome → email → data
#        → RATE LIMIT (escrita_ip) → resolução do slug → … → INSERT
#
#    Campos válidos atravessam todas as validações de forma e CONSOMEM o token;
#    o slug inexistente faz a requisição morrer logo DEPOIS do rate limit, em
#    `slug_invalido`. Resultado: o harness consome tokens de verdade e **nunca
#    cria agendamento, nunca grava cliente, não deixa resíduo no banco**. Um
#    payload com campos vazios NÃO serviria: `campos_obrigatorios` retorna antes
#    do rate limit e nenhum token seria consumido.
#
# 6) POR QUE `slug_invalido` É O SINAL DE PASSAGEM. É a prova de ORDEM, não um
#    detalhe: receber `slug_invalido` significa que a requisição ATRAVESSOU o
#    rate limit e chegou à resolução do slug, que vem depois. Se o veredito
#    fosse escrito como "não veio muitas_tentativas", um erro genérico de build
#    ou uma action inexistente dariam verde.
#
# 7) POR QUE ISOLAMENTO_POR_IP EXISTE (a lição do 01-17: prova por PAR). Um
#    veredito só de BLOQUEIO é satisfeito por um app quebrado que devolve
#    `muitas_tentativas` para tudo — "está barrando corretamente" e "está
#    barrando tudo" produzem exatamente o mesmo relatório. O segundo IP, na
#    MESMA execução e no mesmo servidor, tem de voltar a receber `slug_invalido`.
#    É o que distingue rate limit de pane.
#
# 8) JANELA_LIMPA ABORTA, NÃO REPROVA. Se a PRIMEIRA sonda do IP novo já vier
#    bloqueada, alguma coisa está errada com a premissa do teste (colisão de
#    chave, relógio, contador sujo) — e nesse estado nenhum dos vereditos
#    seguintes mede o que diz medir. Abortar (código 2) é honesto; reprovar
#    atribuiria ao código um defeito que é do harness.
#
# 9) LANÇAMENTO E LIMPEZA. `set -m` liga job control só no lançamento: o job em
#    background ganha grupo de processos próprio cujo PGID é igual ao `$!`, e
#    `kill -- -"$PID"` encerra a árvore inteira. `setsid` está PROIBIDO — ele
#    retorna 0 quando o chamador já é líder de grupo, e nesse caminho `$!` não é
#    o servidor. Mesma proibição, mesmo motivo, dos outros harnesses.
#
# 10) CUSTO NO FORNECEDOR. Uma execução gasta ~13 comandos no Redis de dev. O
#    plano Free da Upstash tem cota diária; rodar em laço apertado a consome. O
#    risco está registrado em `docs/PENDENCIAS.md`.
#
# 11) O CONTRAFACTUAL (`SABOTAR_FORNECEDOR=1`) — LEIA ANTES DE CONFIAR NO VERDE.
#    Este harness nasceu DEPOIS do código que ele mede, e a Phase 01 deixou a
#    lição escrita: harness escrito depois nunca prova, sozinho, que REPROVARIA
#    a falha. Um verde só vale acompanhado da demonstração de que o vermelho é
#    alcançável.
#
#    `SABOTAR_FORNECEDOR=1` aponta `UPSTASH_REDIS_REST_URL` para um host que não
#    existe. O módulo constrói o cliente normalmente (a URL tem forma válida, e o
#    fail-fast de boot do D-04 fica satisfeito), mas toda chamada a `limit()`
#    falha — por rejeição de rede ou pelo `timeout: 500` da própria lib. Os dois
#    caminhos caem no fail-open do D-02/D-03: `verificarLimite` devolve PASSE, e
#    NADA é barrado. Nesse modo o harness INVERTE a expectativa — exige que
#    BLOQUEIO **reprove** — e sai 0 quando reprova, 1 quando não.
#
#    Por que NÃO usar `UPSTASH_REDIS_REST_URL=` vazia, que seria o no-op literal:
#    porque o produto não permite. Medido em 2026-07-27, o `next start` morre no
#    boot com `[boot] Variáveis obrigatórias ausentes em produção:
#    UPSTASH_REDIS_REST_URL` — o fail-fast do D-04 (`src/lib/env.ts`) impede a
#    sabotagem antes de o servidor subir. O no-op só é alcançável FORA de
#    produção, e `next start` é produção. A tentativa frustrada virou evidência
#    do D-04 funcionando; o contrafactual mudou de eixo por causa dela.
#
#    Ganho de escopo: este modo também prova o fail-open contra um fornecedor
#    realmente indisponível — algo que a suíte hermética só alcança com mock.
#    "Upstash fora do ar" é cenário de produção; "env vazia em produção" não é.
#
#    É o mesmo desenho de `verificar-controle-harness-anon.sh` (01-17): o
#    controle nasce vermelho de propósito, e é a asserção sobre o código de saída
#    que prova que o instrumento mede.
#
#        bash scripts/verificar-rate-limit-escrita.sh                        # exige verde
#        SABOTAR_FORNECEDOR=1 bash scripts/verificar-rate-limit-escrita.sh   # exige vermelho
#
# ---------------------------------------------------------------------------
# USO
# ---------------------------------------------------------------------------
#   bash scripts/verificar-rate-limit-escrita.sh
#   PULAR_BUILD=1 bash scripts/verificar-rate-limit-escrita.sh   # reusa .next/
#   PORTA_RATELIMIT=4003 bash scripts/verificar-rate-limit-escrita.sh
#   SABOTAR_NOOP=1 bash scripts/verificar-rate-limit-escrita.sh   # contrafactual
#
# Seis vereditos:
#   PREPARO            id de `criarAgendamentoPublico` derivado do manifesto E as
#                      duas variáveis do Upstash presentes no ambiente (só os
#                      NOMES são impressos, nunca os valores)
#   CONTROLE           `GET /` responde 200 com o processo vivo — sem ele, um 500
#                      de build quebrado seria lido como comportamento do limite
#   JANELA_LIMPA       a 1ª sonda do IP novo NÃO vem bloqueada (premissa do teste)
#   PASSAGEM           as 10 primeiras sondas atravessam o rate limit e morrem em
#                      `slug_invalido` — o teto não barra quem está abaixo dele
#   BLOQUEIO           da 11ª em diante a resposta vira `muitas_tentativas`
#   ISOLAMENTO_POR_IP  um IP DIFERENTE, no mesmo servidor e logo depois do
#                      bloqueio, volta a receber `slug_invalido`
#   SEM_VAZAMENTO      nenhum corpo devolve o IP da sonda cru, nem `org_`, nem
#                      `tenant_id`, nem `PGRST`
#
# Sai 0 só com todos aprovados; 1 com qualquer reprovação; 2 para erro de
# preparação (porta ocupada, build ausente, id não derivável, credenciais
# ausentes, janela suja).

set -uo pipefail

PORTA="${PORTA_RATELIMIT:-3993}"
BASE_URL="http://127.0.0.1:$PORTA"
LIMITE_CONTROLE=30
MANIFESTO='.next/server/server-reference-manifest.json'
MODULO_ACTION='src/app/actions/public-booking.ts'
NOME_ACTION_ESCRITA='criarAgendamentoPublico'
ROTA_SONDA='/book/rota-do-harness-de-rate-limit'

# Teto real da camada `escrita_ip` (src/lib/rate-limit.ts): slidingWindow(10, '10 m').
# Deriva o número de sondas: TETO passagens + EXCEDENTE bloqueios.
TETO_ESCRITA_IP=10
EXCEDENTE=2

SLUG_INEXISTENTE='slug-que-nao-existe-harness-rl-7c4d1e'

# Ver nota 4: IPs únicos por execução, faixa de documentação RFC 5737.
# Dois octetos finais derivados do relógio para não colidir entre execuções
# próximas nem entre si.
SEMENTE=$(( ($(date +%s) / 7) % 250 + 1 ))
IP_SONDA="198.51.100.$SEMENTE"
IP_VIZINHO="198.51.100.$(( (SEMENTE % 250) + 1 ))"
if [ "$IP_SONDA" = "$IP_VIZINHO" ]; then
    IP_VIZINHO="198.51.100.$(( (SEMENTE + 7) % 250 + 1 ))"
fi

# Ver nota 5: forma válida em todos os campos, slug que não resolve.
corpo_sonda() {
    printf '[{"slug":"%s","servicoId":"00000000-0000-0000-0000-000000000000","dataHora":"2030-01-01T13:00:00.000Z","clienteNome":"Harness Rate Limit","clienteTelefone":"11999998888"}]' \
        "$SLUG_INEXISTENTE"
}

# Valores obviamente falsos para as obrigatórias ausentes em dev. Nenhum é
# credencial. As duas do Upstash NÃO estão aqui de propósito: elas têm de vir do
# ambiente real, senão o harness mediria o no-op em vez do limite.
COMPLEMENTO_DEV=(
    "APP_URL=http://127.0.0.1:$PORTA"
    'ANALYTICS_TENANT_SALT=harness-sal-de-teste'
    'NEXT_PUBLIC_SENTRY_DSN=https://harness@localhost.invalid/1'
    'RESEND_API_KEY=harness-chave-invalida'
)

# Ver nota 11. Variável de ambiente vence o `.env.local` no Next. A URL tem forma
# válida (satisfaz o fail-fast do D-04) e aponta para host inexistente: o cliente
# é construído, `limit()` falha, e o fail-open devolve PASSE em tudo.
MODO_CONTRAFACTUAL=0
if [ "${SABOTAR_FORNECEDOR:-}" = '1' ]; then
    MODO_CONTRAFACTUAL=1
    COMPLEMENTO_DEV+=('UPSTASH_REDIS_REST_URL=https://harness-inalcancavel.localhost.invalid')
fi

DIR_TEMP="$(mktemp -d)"
PID=''

encerrar_servidor() {
    [ -z "$PID" ] && return 0
    kill -- -"$PID" 2>/dev/null
    local i=0
    while [ "$i" -lt 20 ] && kill -0 "$PID" 2>/dev/null; do
        sleep 0.25
        i=$((i + 1))
    done
    kill -9 -- -"$PID" 2>/dev/null
    wait "$PID" 2>/dev/null
    PID=''
}

limpar() {
    local codigo=$?
    encerrar_servidor
    rm -rf "$DIR_TEMP"
    return "$codigo"
}
trap limpar EXIT INT TERM

TOTAL=0
REPROVADOS=0
LISTA_REPROVADOS=()

registrar() {
    local veredito="$1" nome="$2" detalhe="$3"
    TOTAL=$((TOTAL + 1))
    if [ "$veredito" = 'APROVADO' ]; then
        printf '  [APROVADO]  %-18s %s\n' "$nome" "$detalhe"
    else
        REPROVADOS=$((REPROVADOS + 1))
        LISTA_REPROVADOS+=("$nome — $detalhe")
        printf '  [REPROVADO] %-18s %s\n' "$nome" "$detalhe"
    fi
}

abortar() {
    echo "ERRO DE PREPARAÇÃO: $1" >&2
    exit 2
}

porta_ocupada() {
    (exec 3<>"/dev/tcp/127.0.0.1/$PORTA") 2>/dev/null || return 1
    exec 3<&-
    return 0
}

iniciar_servidor() {
    local rotulo="$1"
    shift
    local saida="$DIR_TEMP/$rotulo.out" erro="$DIR_TEMP/$rotulo.err"
    : >"$saida"
    : >"$erro"
    # Ver nota 9: job control ligado SÓ para o lançamento.
    set -m
    env "$@" pnpm exec next start --port "$PORTA" >"$saida" 2>"$erro" &
    PID=$!
    set +m
}

codigo_http() {
    curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$@" 2>/dev/null
}

if [ "$MODO_CONTRAFACTUAL" -eq 1 ]; then
    echo 'CONTRAFACTUAL (SABOTAR_FORNECEDOR=1) — Upstash apontado para host inexistente'
    echo 'Este modo EXIGE que o veredito BLOQUEIO reprove. Verde aqui significa instrumento cego.'
else
    echo 'Verificação do rate limit de ESCRITA por IP contra Upstash Redis real'
fi
echo "Action alvo: $NOME_ACTION_ESCRITA   |   Porta: $PORTA   |   Teto: $TETO_ESCRITA_IP/10min"
echo "IPs de sonda (RFC 5737, não roteáveis): $IP_SONDA e $IP_VIZINHO"
echo

command -v pnpm >/dev/null 2>&1 || abortar 'pnpm não encontrado no PATH.'
[ -f package.json ] || abortar 'rode a partir da raiz do projeto (package.json não encontrado).'
porta_ocupada && abortar "a porta $PORTA já está ocupada — encerre o processo antes de medir."

# --- Build (preparação, não é veredito) --------------------------------------
if [ "${PULAR_BUILD:-}" = '1' ]; then
    [ -f .next/BUILD_ID ] || abortar 'PULAR_BUILD=1 mas .next/BUILD_ID não existe — rode uma vez sem pular.'
    echo '  … build pulado por PULAR_BUILD=1 (.next/BUILD_ID presente)'
else
    echo '  … rodando pnpm build (pode levar ~1 min)'
    pnpm build >"$DIR_TEMP/build.log" 2>&1
    CODIGO_BUILD=$?
    if [ "$CODIGO_BUILD" -ne 0 ] || [ ! -f .next/BUILD_ID ]; then
        tail -n 20 "$DIR_TEMP/build.log" >&2
        abortar "pnpm build saiu $CODIGO_BUILD — sem artefato de produção não há o que medir."
    fi
fi

# --- Veredito 1: PREPARO -----------------------------------------------------
[ -f "$MANIFESTO" ] || abortar "manifesto não encontrado: $MANIFESTO"

derivar_id() {
    node -e '
const [caminho, modulo, nomeExportado] = process.argv.slice(1)
const manifesto = require(require("node:path").resolve(caminho))
for (const [id, entrada] of Object.entries(manifesto.node || {})) {
    for (const worker of Object.values(entrada.workers || {})) {
        if (worker.exportedName === nomeExportado && String(worker.filename).endsWith(modulo)) {
            process.stdout.write(id)
            process.exit(0)
        }
    }
}
process.exit(1)
' "$MANIFESTO" "$MODULO_ACTION" "$1" 2>/dev/null
}

ID_ACTION_ESCRITA=$(derivar_id "$NOME_ACTION_ESCRITA")
if [ -z "$ID_ACTION_ESCRITA" ]; then
    abortar "não foi possível derivar o id de $NOME_ACTION_ESCRITA a partir de $MANIFESTO. Nunca colar id à mão — ver nota 2."
fi

# As credenciais têm de existir no ambiente que o `next start` vai herdar. Sem
# elas o módulo opera em no-op e TODAS as sondas passariam: o harness reportaria
# "nada foi barrado" sem distinguir isso de "o limite não existe". Ver nota 1:
# só os NOMES aparecem, jamais os valores.
FALTANDO=()
if [ -f .env.local ]; then
    for NOME_VAR in UPSTASH_REDIS_REST_URL UPSTASH_REDIS_REST_TOKEN; do
        grep -qE "^${NOME_VAR}=." .env.local 2>/dev/null || FALTANDO+=("$NOME_VAR")
    done
else
    FALTANDO=(UPSTASH_REDIS_REST_URL UPSTASH_REDIS_REST_TOKEN '(.env.local ausente)')
fi
if [ "${#FALTANDO[@]}" -gt 0 ]; then
    abortar "credenciais do Upstash ausentes em .env.local: ${FALTANDO[*]}. Sem elas o rate limit opera em NO-OP e este harness mediria o nada — abortar é o único desfecho honesto."
fi

registrar APROVADO PREPARO \
    "id de $NOME_ACTION_ESCRITA (prefixo ${ID_ACTION_ESCRITA:0:8}…) derivado de $MANIFESTO; UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN presentes"

# --- Veredito 2: CONTROLE ----------------------------------------------------
iniciar_servidor ratelimit "${COMPLEMENTO_DEV[@]}"

CODIGO_RAIZ=000
i=0
while [ "$i" -lt $((LIMITE_CONTROLE * 2)) ]; do
    if ! kill -0 "$PID" 2>/dev/null; then
        CODIGO_RAIZ='processo-morreu'
        break
    fi
    CODIGO_RAIZ=$(codigo_http "$BASE_URL/")
    [ "$CODIGO_RAIZ" = '200' ] && break
    sleep 0.5
    i=$((i + 1))
done

if [ "$CODIGO_RAIZ" = '200' ] && kill -0 "$PID" 2>/dev/null; then
    registrar APROVADO CONTROLE 'GET / devolveu 200 e o processo seguiu vivo'
else
    registrar REPROVADO CONTROLE \
        "GET / devolveu '$CODIGO_RAIZ' (exigido 200 com o processo vivo) — o build pode estar quebrado"
    tail -n 12 "$DIR_TEMP/ratelimit.err" >&2
    echo
    echo "Sem servidor saudável não há o que medir — os vereditos seguintes seriam ruído."
    exit 1
fi

# --- Sonda -------------------------------------------------------------------
# Ver nota 3: o `X-Real-IP` é o que dá chave ao limitador. Sem
# `Next-Router-State-Tree` o Next responde só o resultado da action.
sondar() {
    curl -s --max-time 15 -X POST \
        -H "Next-Action: $ID_ACTION_ESCRITA" \
        -H 'Content-Type: text/plain;charset=UTF-8' \
        -H "X-Real-IP: $1" \
        --data-raw "$(corpo_sonda)" \
        "$BASE_URL$ROTA_SONDA" 2>/dev/null
}

recorte() {
    printf '%s' "$1" | head -c 300 | tr '\n' '|'
}

CORPOS_VISTOS=''

classificar() {
    case "$1" in
        *muitas_tentativas*) printf 'BLOQUEADO' ;;
        *slug_invalido*) printf 'PASSOU' ;;
        *) printf 'INDEFINIDO' ;;
    esac
}

# --- Veredito 3: JANELA_LIMPA (ver nota 8) -----------------------------------
CORPO_PRIMEIRA=$(sondar "$IP_SONDA")
CORPOS_VISTOS="$CORPOS_VISTOS$CORPO_PRIMEIRA"
ESTADO_PRIMEIRA=$(classificar "$CORPO_PRIMEIRA")

if [ "$ESTADO_PRIMEIRA" = 'BLOQUEADO' ]; then
    encerrar_servidor
    abortar "a PRIMEIRA sonda de $IP_SONDA já veio bloqueada — a janela deste IP não está limpa (colisão de semente, contador sujo ou relógio). Rode de novo em alguns minutos; reprovar aqui atribuiria ao código um defeito do harness (nota 8)."
fi
if [ "$ESTADO_PRIMEIRA" = 'INDEFINIDO' ]; then
    encerrar_servidor
    abortar "a PRIMEIRA sonda não devolveu nem \`slug_invalido\` nem \`muitas_tentativas\`. Corpo: $(recorte "$CORPO_PRIMEIRA")"
fi

registrar APROVADO JANELA_LIMPA \
    "1ª sonda de $IP_SONDA respondeu \`slug_invalido\` — janela zerada, premissa do teste válida"

# --- Veredito 4: PASSAGEM (ver nota 6) ---------------------------------------
# Já gastamos 1 token no JANELA_LIMPA; faltam TETO-1 para completar o teto.
PASSAGENS=1
FALHA_PASSAGEM=''
n=2
while [ "$n" -le "$TETO_ESCRITA_IP" ]; do
    CORPO=$(sondar "$IP_SONDA")
    CORPOS_VISTOS="$CORPOS_VISTOS$CORPO"
    ESTADO=$(classificar "$CORPO")
    if [ "$ESTADO" = 'PASSOU' ]; then
        PASSAGENS=$((PASSAGENS + 1))
    else
        FALHA_PASSAGEM="sonda #$n devolveu $ESTADO (esperado PASSOU): $(recorte "$CORPO")"
        break
    fi
    n=$((n + 1))
done

if [ -z "$FALHA_PASSAGEM" ] && [ "$PASSAGENS" -eq "$TETO_ESCRITA_IP" ]; then
    registrar APROVADO PASSAGEM \
        "as $TETO_ESCRITA_IP sondas dentro do teto atravessaram o rate limit e morreram em \`slug_invalido\` (a guarda não barra quem está abaixo do limite)"
else
    registrar REPROVADO PASSAGEM \
        "só $PASSAGENS de $TETO_ESCRITA_IP sondas atravessaram — $FALHA_PASSAGEM"
fi

# --- Veredito 5: BLOQUEIO ----------------------------------------------------
BLOQUEIOS=0
DETALHE_BLOQUEIO=''
n=1
while [ "$n" -le "$EXCEDENTE" ]; do
    CORPO=$(sondar "$IP_SONDA")
    CORPOS_VISTOS="$CORPOS_VISTOS$CORPO"
    ESTADO=$(classificar "$CORPO")
    if [ "$ESTADO" = 'BLOQUEADO' ]; then
        BLOQUEIOS=$((BLOQUEIOS + 1))
    else
        DETALHE_BLOQUEIO="sonda excedente #$n devolveu $ESTADO: $(recorte "$CORPO")"
    fi
    n=$((n + 1))
done

if [ "$BLOQUEIOS" -eq "$EXCEDENTE" ]; then
    registrar APROVADO BLOQUEIO \
        "as $EXCEDENTE sondas acima do teto devolveram \`muitas_tentativas\` — o limite BARRA de verdade, contra Redis real"
else
    registrar REPROVADO BLOQUEIO \
        "só $BLOQUEIOS de $EXCEDENTE sondas acima do teto foram barradas — $DETALHE_BLOQUEIO"
fi

# --- Veredito 6: ISOLAMENTO_POR_IP (ver nota 7) ------------------------------
CORPO_VIZINHO=$(sondar "$IP_VIZINHO")
CORPOS_VISTOS="$CORPOS_VISTOS$CORPO_VIZINHO"
ESTADO_VIZINHO=$(classificar "$CORPO_VIZINHO")

if [ "$ESTADO_VIZINHO" = 'PASSOU' ]; then
    registrar APROVADO ISOLAMENTO_POR_IP \
        "com $IP_SONDA bloqueado, $IP_VIZINHO respondeu \`slug_invalido\` no MESMO servidor — o bloqueio é por chave, não uma pane global"
else
    registrar REPROVADO ISOLAMENTO_POR_IP \
        "$IP_VIZINHO devolveu $ESTADO_VIZINHO logo após o bloqueio de $IP_SONDA — 'barrando certo' e 'barrando tudo' ficam indistinguíveis: $(recorte "$CORPO_VIZINHO")"
fi

# --- Veredito 7: SEM_VAZAMENTO -----------------------------------------------
VAZOU=''
case "$CORPOS_VISTOS" in *"$IP_SONDA"*) VAZOU="$VAZOU o IP da sonda;" ;; esac
case "$CORPOS_VISTOS" in *"$IP_VIZINHO"*) VAZOU="$VAZOU o IP vizinho;" ;; esac
case "$CORPOS_VISTOS" in *org_*) VAZOU="$VAZOU a literal org_;" ;; esac
case "$CORPOS_VISTOS" in *tenant_id*) VAZOU="$VAZOU a literal tenant_id;" ;; esac
case "$CORPOS_VISTOS" in *PGRST*) VAZOU="$VAZOU a literal PGRST;" ;; esac

if [ -z "$VAZOU" ]; then
    registrar APROVADO SEM_VAZAMENTO \
        'nenhum corpo devolveu o IP cru da sonda, nem org_, nem tenant_id, nem PGRST'
else
    registrar REPROVADO SEM_VAZAMENTO "os corpos devolveram:$VAZOU"
fi

# --- Relatório ---------------------------------------------------------------
encerrar_servidor

echo

# --- Modo contrafactual: a expectativa INVERTE (ver nota 11) -----------------
if [ "$MODO_CONTRAFACTUAL" -eq 1 ]; then
    BLOQUEIO_REPROVOU=0
    for item in ${LISTA_REPROVADOS[@]+"${LISTA_REPROVADOS[@]}"}; do
        case "$item" in BLOQUEIO*) BLOQUEIO_REPROVOU=1 ;; esac
    done

    if [ "$BLOQUEIO_REPROVOU" -eq 1 ]; then
        echo 'CONTRAFACTUAL OK — com o Upstash inalcançável, o veredito BLOQUEIO REPROVOU.'
        echo 'Duas coisas ficam provadas de uma vez: o instrumento mede (o verde da execução'
        echo 'normal não é verde de instrumento cego), e o fail-open do D-02/D-03 deixa o'
        echo 'booking passar quando o fornecedor cai — contra um host de verdade, não um mock.'
        exit 0
    fi

    echo 'CONTRAFACTUAL FALHOU — com o Upstash inalcançável, BLOQUEIO ainda passou.'
    echo 'Isso significa que o harness daria verde sobre um sistema DESPROTEGIDO. Conserte o'
    echo 'harness antes de citar qualquer execução dele como prova de fechamento.'
    exit 1
fi

if [ "$REPROVADOS" -eq 0 ]; then
    echo "$TOTAL vereditos, 0 reprovações — a camada \`escrita_ip\` barra de verdade e barra por chave."
    echo 'Nenhum agendamento foi criado: as sondas morrem em `slug_invalido`, depois do limite (nota 5).'
    exit 0
fi

echo "$TOTAL vereditos, $REPROVADOS reprovação(ões):"
for item in ${LISTA_REPROVADOS[@]+"${LISTA_REPROVADOS[@]}"}; do
    echo "  - $item"
done
exit 1
