#!/usr/bin/env bash
#
# Prova, com um `next start` de verdade, que variável obrigatória ausente MATA o
# processo de produção — em vez de deixá-lo vivo respondendo 500 em toda rota.
#
# Por que existe: privilégio de boot não é testável em unidade. Não há como um
# `vitest` observar um processo que deveria morrer, e afirmar "o boot morre" sem
# comando executado é exatamente o que a Phase 1 fez uma vez: o critério 5 foi
# lido como satisfeito enquanto a medição do plano 01-05 dizia o contrário — o
# Next 16.2.10 converte a rejeição saída de `instrumentation.register()` em
# `unhandledRejection` e SEGUE ESCUTANDO. Um healthcheck de liveness marca esse
# deploy como verde com 100% do tráfego falhando. Este script é o artefato que
# impede a afirmação voltar a valer sem prova.
#
# ---------------------------------------------------------------------------
# NOTAS TÉCNICAS (leia antes de mexer)
# ---------------------------------------------------------------------------
#
# 1) SEGREDOS. O script NÃO lê, não sourceia e não referencia arquivo de env:
#    `next start` carrega o `.env.local` sozinho. Nenhum valor de variável é
#    impresso em ramo nenhum — só NOMES aparecem no relatório. A sonda do
#    webhook com "secret" na query string usa uma literal INVÁLIDA escrita aqui
#    dentro; a variante com o secret real já foi provada no plano 01-03 e não se
#    repete aqui justamente para não manusear segredo.
#
# 2) STDERR SAI INTEIRO ANTES DA MORTE. `process.stderr` é síncrono no Linux
#    para arquivo, TTY e pipe (assíncrono só no macOS e em parte dos casos de
#    Windows). É por isso que a mensagem nomeando a variável chega completa ao
#    log antes de `process.exit` — o operador descobre a causa no log do deploy,
#    não por bissecção.
#
# 3) LANÇAMENTO E COLETA DO STATUS — é isto que decide se o veredito MORTE mede
#    o que diz medir. `set -m` liga job control só na hora de lançar: com ele o
#    job em background ganha um GRUPO DE PROCESSOS PRÓPRIO cujo PGID é igual ao
#    PID capturado em `$!`. Isso dá as duas coisas de uma vez — `kill -- -"$PID"`
#    encerra a árvore inteira na limpeza, e `wait "$PID"` devolve o código de
#    saída DO PROCESSO DO SERVIDOR. O código assertado no veredito MORTE é o do
#    `next`, nunca o de um envoltório.
#
#    `setsid` está PROIBIDO aqui, em qualquer forma. Ele forka e retorna 0
#    sempre que o chamador já é líder de grupo de processos — e nesse caminho
#    `$!` não é o servidor: o código observado seria o do envoltório. Falha para
#    o lado seguro (MORTE reprovaria), mas torna o harness impossível de passar,
#    e um executor frustrado afrouxaria a asserção. Não há variante permitida.
#
# 4) COMPLEMENTO DE DEV. Quatro das quatorze obrigatórias não existem no
#    `.env.local` deste projeto (APP_URL, ANALYTICS_TENANT_SALT,
#    NEXT_PUBLIC_SENTRY_DSN, RESEND_API_KEY). Sem tratá-las, TODA execução de
#    `next start` cairia na validação, o veredito CONTROLE nunca poderia passar,
#    e a mensagem do veredito MORTE listaria cinco nomes em vez de um — o
#    contrafactual deixaria de isolar a variável alvo. O script injeta valores
#    obviamente falsos para essas quatro, IDÊNTICOS nas duas execuções, de modo
#    que a ÚNICA diferença entre MORTE e CONTROLE seja a variável alvo. É o
#    mesmo controle que o plano 01-05 usou ("mesmo build com as quatorze
#    presentes"). Nenhuma delas entra no `pnpm build`: o artefato do veredito
#    BUILD é o build normal do projeto.
#
# ---------------------------------------------------------------------------
# USO
# ---------------------------------------------------------------------------
#   bash scripts/verificar-fail-fast-boot.sh
#   PULAR_BUILD=1 bash scripts/verificar-fail-fast-boot.sh      # reusa .next/
#   VARIAVEL_ALVO=RESEND_API_KEY bash scripts/verificar-fail-fast-boot.sh
#
# Quatro vereditos:
#   BUILD     `pnpm build` com a variável alvo vazia continua saindo 0
#   MORTE     `next start` com a variável alvo vazia ENCERRA (código ≠ 0),
#             nomeia a variável em stderr, e a porta para de aceitar conexão
#             (curl 7 = recusa de conexão; um HTTP 500 aqui é REPROVAÇÃO)
#   CONTROLE  o MESMO build, sem sobrescrever a alvo, responde 200 e segue vivo
#   WEBHOOK   contra o servidor que o CONTROLE deixou de pé: as três sondas
#             inválidas do webhook de lembrete dão 401 e o controle `GET /` dá
#             200 — trava de regressão de que o encerramento novo não quebrou o
#             caminho autenticado
#
# Sai 0 só com os quatro aprovados; 1 com qualquer reprovação; 2 para erro de
# preparação (porta ocupada, build ausente, pnpm indisponível).

set -uo pipefail

PORTA=3991
BASE_URL="http://127.0.0.1:$PORTA"
VARIAVEL_ALVO="${VARIAVEL_ALVO:-QSTASH_NEXT_SIGNING_KEY}"
LIMITE_MORTE=20
LIMITE_CONTROLE=30
ROTA_WEBHOOK='/api/webhooks/lembrete'
CORPO_WEBHOOK='{"agendamentoId":"00000000-0000-0000-0000-000000000000","tenantId":"org_harness"}'
SECRET_INVALIDO='harness-secret-invalido-nao-e-credencial'
ASSINATURA_FORJADA='harness.assinatura.forjada'

# Valores obviamente falsos para as obrigatórias que não existem no `.env.local`
# de dev (ver nota 4). Idênticos nas duas execuções — o delta é só a alvo.
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
        printf '  [APROVADO]  %-10s %s\n' "$nome" "$detalhe"
    else
        REPROVADOS=$((REPROVADOS + 1))
        LISTA_REPROVADOS+=("$nome — $detalhe")
        printf '  [REPROVADO] %-10s %s\n' "$nome" "$detalhe"
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

# Lança `next start` em segundo plano. O primeiro argumento é o rótulo usado
# para nomear os arquivos de log; os demais são pares NOME=valor injetados no
# ambiente do servidor (nunca ecoados).
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

# Sonda o processo a cada 0,5 s até o limite em segundos. 0 = morreu.
esperar_morte() {
    local limite="$1" i=0 maximo
    maximo=$((limite * 2))
    while [ "$i" -lt "$maximo" ]; do
        kill -0 "$PID" 2>/dev/null || return 0
        sleep 0.5
        i=$((i + 1))
    done
    return 1
}

codigo_http() {
    curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$@" 2>/dev/null
}

echo 'Verificação do fail-fast de boot em produção'
echo "Variável alvo: $VARIAVEL_ALVO   |   Porta: $PORTA"
echo

command -v pnpm >/dev/null 2>&1 || abortar 'pnpm não encontrado no PATH.'
[ -f package.json ] || abortar 'rode a partir da raiz do projeto (package.json não encontrado).'
porta_ocupada && abortar "a porta $PORTA já está ocupada — encerre o processo antes de medir."

# --- Veredito 1: BUILD -------------------------------------------------------
# Primeiro porque o artefato gerado aqui serve aos outros três.
if [ "${PULAR_BUILD:-}" = '1' ]; then
    [ -f .next/BUILD_ID ] || abortar 'PULAR_BUILD=1 mas .next/BUILD_ID não existe — rode uma vez sem pular.'
    registrar APROVADO BUILD 'pulado por PULAR_BUILD=1 (.next/BUILD_ID presente)'
else
    echo "  … rodando pnpm build com $VARIAVEL_ALVO vazia (pode levar ~1 min)"
    env "$VARIAVEL_ALVO=" pnpm build >"$DIR_TEMP/build.log" 2>&1
    CODIGO_BUILD=$?
    if [ "$CODIGO_BUILD" -eq 0 ] && [ -f .next/BUILD_ID ]; then
        registrar APROVADO BUILD "pnpm build saiu 0 com $VARIAVEL_ALVO vazia"
    else
        registrar REPROVADO BUILD "pnpm build saiu $CODIGO_BUILD — veja $DIR_TEMP/build.log"
        tail -n 20 "$DIR_TEMP/build.log" >&2
    fi
fi

# --- Veredito 2: MORTE -------------------------------------------------------
iniciar_servidor morte "${COMPLEMENTO_DEV[@]}" "$VARIAVEL_ALVO="
ARQUIVO_ERRO="$DIR_TEMP/morte.err"

if ! esperar_morte "$LIMITE_MORTE"; then
    CODIGO_CURL_VIVO=$(codigo_http "$BASE_URL/")
    registrar REPROVADO MORTE \
        "o processo continuou VIVO após ${LIMITE_MORTE}s servindo HTTP ${CODIGO_CURL_VIVO} — deploy verde com 100% do tráfego falhando"
    encerrar_servidor
else
    wait "$PID"
    CODIGO_SERVIDOR=$?
    PID=''

    curl -s -o /dev/null --max-time 5 "$BASE_URL/" 2>/dev/null
    CODIGO_CURL=$?

    NOMEOU_VARIAVEL=0
    grep -q "Variáveis obrigatórias ausentes em produção: $VARIAVEL_ALVO" "$ARQUIVO_ERRO" && NOMEOU_VARIAVEL=1

    if [ "$CODIGO_SERVIDOR" -ne 0 ] && [ "$NOMEOU_VARIAVEL" -eq 1 ] && [ "$CODIGO_CURL" -eq 7 ]; then
        registrar APROVADO MORTE \
            "o processo do next encerrou com código $CODIGO_SERVIDOR, nomeou $VARIAVEL_ALVO em stderr e a porta recusou conexão (curl $CODIGO_CURL)"
    else
        registrar REPROVADO MORTE \
            "código do next=$CODIGO_SERVIDOR (exigido ≠ 0), nomeou a variável=$NOMEOU_VARIAVEL (exigido 1), curl=$CODIGO_CURL (exigido 7 = recusa de conexão)"
        echo '  --- stderr do servidor (últimas linhas) ---' >&2
        tail -n 12 "$ARQUIVO_ERRO" >&2
    fi
fi

# --- Veredito 3: CONTROLE ----------------------------------------------------
# Sem ele, um 500 ou uma morte poderiam vir de build quebrado em vez da
# variável. Deixa o servidor DE PÉ — o veredito WEBHOOK usa este mesmo processo.
iniciar_servidor controle "${COMPLEMENTO_DEV[@]}"

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
    registrar APROVADO CONTROLE 'com as quatorze presentes, GET / devolveu 200 e o processo seguiu vivo'
    SERVIDOR_SAUDAVEL=1
else
    registrar REPROVADO CONTROLE \
        "GET / devolveu '$CODIGO_RAIZ' (exigido 200 com o processo vivo) — o build pode estar quebrado"
    tail -n 12 "$DIR_TEMP/controle.err" >&2
    SERVIDOR_SAUDAVEL=0
fi

# --- Veredito 4: WEBHOOK -----------------------------------------------------
# Metade de SEG-05 fechada desde o plano 01-03 e reconferida contra build de
# produção no 01-05. Rodar aqui a cada execução é a trava de regressão de que o
# encerramento novo não quebrou o caminho autenticado. Propriedade DESTE plano:
# o 01-09 executa o harness e lê o código de saída, sem redigitar sonda nenhuma.
if [ "$SERVIDOR_SAUDAVEL" -eq 1 ]; then
    CODIGO_SEM_ASSINATURA=$(codigo_http -X POST -H 'Content-Type: application/json' \
        -d "$CORPO_WEBHOOK" "$BASE_URL$ROTA_WEBHOOK")
    CODIGO_SECRET_LEGADO=$(codigo_http -X POST -H 'Content-Type: application/json' \
        -d "$CORPO_WEBHOOK" "$BASE_URL$ROTA_WEBHOOK?secret=$SECRET_INVALIDO")
    CODIGO_ASSINATURA_FORJADA=$(codigo_http -X POST -H 'Content-Type: application/json' \
        -H "Upstash-Signature: $ASSINATURA_FORJADA" \
        -d "$CORPO_WEBHOOK" "$BASE_URL$ROTA_WEBHOOK")
    CODIGO_CONTROLE_RAIZ=$(codigo_http "$BASE_URL/")

    OBSERVADO="$CODIGO_SEM_ASSINATURA,$CODIGO_SECRET_LEGADO,$CODIGO_ASSINATURA_FORJADA,$CODIGO_CONTROLE_RAIZ"
    if [ "$OBSERVADO" = '401,401,401,200' ]; then
        registrar APROVADO WEBHOOK \
            'sem assinatura 401 | secret em query 401 | assinatura forjada 401 | GET / 200'
    else
        registrar REPROVADO WEBHOOK \
            "observado $OBSERVADO (exigido 401,401,401,200 — sem assinatura, secret em query, assinatura forjada, controle)"
    fi
else
    registrar REPROVADO WEBHOOK 'não medido: o CONTROLE não deixou servidor saudável de pé'
fi

encerrar_servidor

echo
if [ "$REPROVADOS" -eq 0 ]; then
    echo "Resumo: $TOTAL vereditos, 0 reprovados — o boot morre de verdade e o webhook segue fechado."
    exit 0
fi

echo "Resumo: $TOTAL vereditos, $REPROVADOS REPROVADO(S):"
for item in "${LISTA_REPROVADOS[@]}"; do
    echo "  - $item"
done
exit 1
