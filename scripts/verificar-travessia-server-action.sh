#!/usr/bin/env bash
#
# Prova, contra um `next start` de verdade, que um erro ESPERADO de Server Action
# atravessa a fronteira de flight com IDENTIDADE PRESERVADA — em vez de virar um
# `digest` opaco que o cliente não consegue interpretar.
#
# Por que existe: a fronteira de uma Server Action em produção não é observável
# por teste de unidade. `vitest` chama a função EM PROCESSO, sem serialização de
# flight, então uma asserção sobre a mensagem lançada dá verde mesmo quando essa
# mensagem nunca chega ao navegador. Foi exatamente isso que aconteceu nesta fase:
# o verificador invocou `obterSlotsPublicos` contra o build de produção com um
# slug inexistente e recebeu, na íntegra, `1:E{"digest":"…"}` — mensagem nenhuma.
# Em `react-server-dom-webpack-server.node.production.js` a assinatura é
# `emitErrorChunk(request, id, digest)`; na versão de desenvolvimento é
# `(request, id, digest, error, debug, owner)`. Em `pnpm dev` funciona, e é por
# isso que o defeito atravessou nove planos, um code review e uma verificação.
#
# ---------------------------------------------------------------------------
# NOTAS TÉCNICAS (leia antes de mexer)
# ---------------------------------------------------------------------------
#
# 1) SEGREDOS. O script NÃO lê, não sourceia e não referencia arquivo de
#    ambiente: `next start` carrega o dele sozinho. Nenhum VALOR de variável é
#    impresso em ramo nenhum — só NOMES aparecem no relatório. Mesmo contrato de
#    `scripts/verificar-fail-fast-boot.sh`.
#
# 2) O ID DA SERVER ACTION É DERIVADO, NUNCA LITERAL. O id vem do manifesto do
#    build (`.next/server/server-reference-manifest.json`) a cada execução,
#    casando `exportedName` com o `filename` do módulo. Id colado à mão sobrevive
#    a uma refatoração que o invalida: a sonda passaria a bater numa action que
#    não existe mais, o servidor devolveria um erro genérico, e o harness ficaria
#    verde para sempre medindo nada. Se o id não for derivável, o script ABORTA
#    (código 2) — nunca degrada para aprovação.
#
# 3) LANÇAMENTO E LIMPEZA. `set -m` liga job control só na hora de lançar: com
#    ele o job em background ganha um GRUPO DE PROCESSOS PRÓPRIO cujo PGID é
#    igual ao PID capturado em `$!`, e `kill -- -"$PID"` encerra a árvore inteira.
#
#    `setsid` está PROIBIDO aqui, em qualquer forma. Ele forka e retorna 0 sempre
#    que o chamador já é líder de grupo de processos — e nesse caminho `$!` não é
#    o servidor. Mesma proibição, pelo mesmo motivo, do harness de boot.
#
# 4) COMPLEMENTO DE DEV. Quatro variáveis obrigatórias não existem no ambiente de
#    dev deste projeto (APP_URL, ANALYTICS_TENANT_SALT, NEXT_PUBLIC_SENTRY_DSN,
#    RESEND_API_KEY). Sem tratá-las, o fail-fast de boot mataria o `next start` e
#    o veredito CONTROLE nunca poderia passar. O script injeta valores
#    obviamente falsos, escritos aqui dentro — nenhum deles é credencial.
#
# 5) A SONDA NÃO MANDA `Next-Router-State-Tree`. Sem esse cabeçalho o Next
#    responde SÓ o resultado da action, sem re-renderizar a árvore da rota. É o
#    que torna o corpo da resposta pequeno e legível — e o que permite assertar
#    ausência da literal `digest` sem risco de casar com um erro de render de
#    outra parte da página.
#
# ---------------------------------------------------------------------------
# USO
# ---------------------------------------------------------------------------
#   bash scripts/verificar-travessia-server-action.sh
#   PULAR_BUILD=1 bash scripts/verificar-travessia-server-action.sh   # reusa .next/
#   PORTA_TRAVESSIA=4002 bash scripts/verificar-travessia-server-action.sh
#
# Quatro vereditos:
#   PREPARO       o id da Server Action `obterSlotsPublicos` foi derivado do
#                 manifesto do build (nunca de literal colada à mão)
#   CONTROLE      `GET /` responde 200 com o processo vivo — sem ele, um 500 de
#                 build quebrado seria lido como falha da travessia
#   SLOTS_ERRO    o corpo da resposta da action com slug inexistente CONTÉM o
#                 discriminante `slug_invalido` e NÃO contém a literal `digest`
#   SEM_VAZAMENTO o mesmo corpo não contém o slug enviado, nem `org_`, nem
#                 `PGRST`, nem `tenant_id`
#
# Sai 0 só com os quatro aprovados; 1 com qualquer reprovação; 2 para erro de
# preparação (porta ocupada, build ausente, id não derivável, pnpm indisponível).

set -uo pipefail

PORTA="${PORTA_TRAVESSIA:-3992}"
BASE_URL="http://127.0.0.1:$PORTA"
LIMITE_CONTROLE=30
MANIFESTO='.next/server/server-reference-manifest.json'
MODULO_ACTION='src/app/actions/public-booking.ts'
NOME_ACTION='obterSlotsPublicos'
ROTA_SONDA='/book/rota-do-harness-de-travessia'
SLUG_INEXISTENTE='slug-que-nao-existe-harness-9f3a2b'
CORPO_SONDA="[\"$SLUG_INEXISTENTE\",\"2030-01-01\",30]"

# Valores obviamente falsos para as obrigatórias ausentes em dev (ver nota 4).
COMPLEMENTO_DEV=(
    "APP_URL=http://127.0.0.1:$PORTA"
    'ANALYTICS_TENANT_SALT=harness-sal-de-teste'
    'NEXT_PUBLIC_SENTRY_DSN=https://harness@localhost.invalid/1'
    'RESEND_API_KEY=harness-chave-invalida'
)

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
        printf '  [APROVADO]  %-14s %s\n' "$nome" "$detalhe"
    else
        REPROVADOS=$((REPROVADOS + 1))
        LISTA_REPROVADOS+=("$nome — $detalhe")
        printf '  [REPROVADO] %-14s %s\n' "$nome" "$detalhe"
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
    # Ver nota 3 do cabeçalho: job control ligado SÓ para o lançamento.
    set -m
    env "$@" pnpm exec next start --port "$PORTA" >"$saida" 2>"$erro" &
    PID=$!
    set +m
}

codigo_http() {
    curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$@" 2>/dev/null
}

echo 'Verificação da travessia de erro esperado pela fronteira de Server Action'
echo "Action alvo: $NOME_ACTION   |   Porta: $PORTA"
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
# O id sai do manifesto do build (ver nota 2). `node` é garantido pelo projeto;
# `jq` não é, então a extração é feita com node mesmo.
[ -f "$MANIFESTO" ] || abortar "manifesto não encontrado: $MANIFESTO"

ID_ACTION=$(node -e '
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
' "$MANIFESTO" "$MODULO_ACTION" "$NOME_ACTION" 2>/dev/null)

if [ -z "$ID_ACTION" ]; then
    abortar "não foi possível derivar o id de $NOME_ACTION a partir de $MANIFESTO (exportedName + filename terminando em $MODULO_ACTION). Nunca colar id à mão — ver nota 2."
fi
registrar APROVADO PREPARO "id de $NOME_ACTION derivado de $MANIFESTO (prefixo ${ID_ACTION:0:8}…)"

# --- Veredito 2: CONTROLE ----------------------------------------------------
iniciar_servidor travessia "${COMPLEMENTO_DEV[@]}"

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
    SERVIDOR_SAUDAVEL=1
else
    registrar REPROVADO CONTROLE \
        "GET / devolveu '$CODIGO_RAIZ' (exigido 200 com o processo vivo) — o build pode estar quebrado"
    tail -n 12 "$DIR_TEMP/travessia.err" >&2
    SERVIDOR_SAUDAVEL=0
fi

# --- Vereditos 3 e 4: SLOTS_ERRO e SEM_VAZAMENTO -----------------------------
if [ "$SERVIDOR_SAUDAVEL" -eq 1 ]; then
    CORPO_RESPOSTA=$(curl -s --max-time 15 -X POST \
        -H "Next-Action: $ID_ACTION" \
        -H 'Content-Type: text/plain;charset=UTF-8' \
        --data-raw "$CORPO_SONDA" \
        "$BASE_URL$ROTA_SONDA" 2>/dev/null)

    # Recorte para o relatório: corpo de flight pode ser longo, e o que interessa
    # como evidência é o começo (onde mora o chunk de resultado da action).
    CORPO_CURTO=$(printf '%s' "$CORPO_RESPOSTA" | head -c 400 | tr '\n' '|')

    TEM_DISCRIMINANTE=0
    TEM_DIGEST=0
    case "$CORPO_RESPOSTA" in *slug_invalido*) TEM_DISCRIMINANTE=1 ;; esac
    case "$CORPO_RESPOSTA" in *digest*) TEM_DIGEST=1 ;; esac

    if [ "$TEM_DISCRIMINANTE" -eq 1 ] && [ "$TEM_DIGEST" -eq 0 ]; then
        registrar APROVADO SLOTS_ERRO \
            'o corpo da resposta carrega o discriminante `slug_invalido` e nenhum `digest` opaco'
    else
        registrar REPROVADO SLOTS_ERRO \
            "contém slug_invalido=$TEM_DISCRIMINANTE (exigido 1), contém digest=$TEM_DIGEST (exigido 0) — corpo observado: $CORPO_CURTO"
    fi

    VAZAMENTOS=()
    case "$CORPO_RESPOSTA" in *"$SLUG_INEXISTENTE"*) VAZAMENTOS+=('slug enviado') ;; esac
    case "$CORPO_RESPOSTA" in *org_*) VAZAMENTOS+=('org_') ;; esac
    case "$CORPO_RESPOSTA" in *PGRST*) VAZAMENTOS+=('PGRST') ;; esac
    case "$CORPO_RESPOSTA" in *tenant_id*) VAZAMENTOS+=('tenant_id') ;; esac

    if [ "${#VAZAMENTOS[@]}" -eq 0 ]; then
        registrar APROVADO SEM_VAZAMENTO \
            'o corpo não carrega o slug do visitante, nem org_, nem PGRST, nem tenant_id'
    else
        registrar REPROVADO SEM_VAZAMENTO \
            "identificador interno na resposta: ${VAZAMENTOS[*]} — corpo observado: $CORPO_CURTO"
    fi
else
    registrar REPROVADO SLOTS_ERRO 'não medido: o CONTROLE não deixou servidor saudável de pé'
    registrar REPROVADO SEM_VAZAMENTO 'não medido: o CONTROLE não deixou servidor saudável de pé'
fi

encerrar_servidor

echo
if [ "$REPROVADOS" -eq 0 ]; then
    echo "Resumo: $TOTAL vereditos, 0 reprovados — o erro esperado atravessa a fronteira com identidade preservada."
    exit 0
fi

echo "Resumo: $TOTAL vereditos, $REPROVADOS REPROVADO(S):"
for item in "${LISTA_REPROVADOS[@]}"; do
    echo "  - $item"
done
exit 1
