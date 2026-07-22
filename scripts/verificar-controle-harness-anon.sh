#!/usr/bin/env bash
#
# Controle do instrumento: prova, por comando re-executável, que
# `scripts/verificar-superficie-anon.sh` CONSEGUE REPROVAR quando não tem como
# medir — e que ainda aprova o alvo real.
#
# Por que existe: um harness que não consegue reprovar é pior que harness
# nenhum, porque documenta uma garantia inexistente. Esta fase já foi queimada
# duas vezes por esse mecanismo exato. Da primeira, o WR-08: qualquer código
# diferente de 200 virava ESPERADO, e um 404 por tabela renomeada era
# indistinguível de fechamento real. Consertado no plano 01-15 — e o falso verde
# apenas MUDOU DE EIXO. Da segunda, o gap medido pelo verificador da 3ª rodada:
# com o alvo inalcançável as 11 checagens registram `HTTP 000`, nenhuma reprova,
# e a última linha do relatório é uma afirmação positiva de fechamento com
# exit 0. Zero medição, verde na tela.
#
# O remédio não é "conferir de novo com atenção": é ter um controle que reprova
# de propósito e mora no repositório. Quem quiser confiar no exit code daquele
# script roda este aqui e vê o instrumento falhar nos três estados em que ele
# não tem o que medir.
#
# ---------------------------------------------------------------------------
# NOTAS TÉCNICAS (leia antes de mexer)
# ---------------------------------------------------------------------------
#
# 1) SEGREDOS. O arquivo de ambiente real da raiz NUNCA é lido, copiado nem
#    sourceado por este script. O ambiente das três sondas negativas é ESCRITO
#    aqui dentro, com uma URL que não resolve e um valor de chave que ninguém
#    confundiria com credencial. Só NOMES de variável aparecem na saída — mesmo
#    contrato dos harnesses irmãos. O veredito CONTROLE não escreve ambiente
#    nenhum: ele roda o harness a partir da raiz, exatamente como um humano
#    rodaria, e quem lê o arquivo de ambiente ali é o próprio harness.
#
# 2) O HOST MORTO É RESERVADO POR RFC. `.invalid` é um TLD reservado pela RFC
#    2606 e garantidamente não resolve em lugar nenhum. É o que torna a sonda
#    ALVO_MORTO determinística sem depender do estado da rede nem de um domínio
#    de terceiro que amanhã pode ser registrado.
#
# 3) LANÇAMENTO E LIMPEZA DO STUB. `set -m` liga job control só na hora de
#    lançar: com ele o job em background ganha um GRUPO DE PROCESSOS PRÓPRIO
#    cujo PGID é igual ao PID capturado em `$!`, e `kill -- -"$PID"` encerra a
#    árvore inteira no `trap`.
#
#    `setsid` está PROIBIDO aqui, em qualquer forma, pelo mesmo motivo dos
#    outros dois harnesses: ele forka e retorna 0 sempre que o chamador já é
#    líder de grupo de processos, e nesse caminho `$!` não é o processo que se
#    quer matar. Não há variante permitida.
#
# 4) NUNCA DEGRADAR PARA APROVAÇÃO. Erro de preparação — `node` ausente, porta
#    ocupada, schemas ilegíveis, `mktemp` falhando, stub que não sobe — ABORTA
#    com código 2. Um controle que se aprova sozinho quando não conseguiu montar
#    o cenário é o mesmo defeito que ele existe para pegar.
#
# ---------------------------------------------------------------------------
# USO
# ---------------------------------------------------------------------------
#   bash scripts/verificar-controle-harness-anon.sh
#   PORTA_CONTROLE=4993 bash scripts/verificar-controle-harness-anon.sh
#
# Quatro vereditos — três estados de falha do instrumento e um positivo:
#   ALVO_MORTO      com a URL apontando para um host que não resolve, o harness
#                   sai 2 e NÃO imprime a frase de fechamento. É a reprodução
#                   por comando do gap medido à mão pelo verificador
#   PROJETO_ERRADO  com a URL apontando para um alvo em que NENHUMA tabela
#                   declarada existe (todo caminho responde fora do schema
#                   cache), o harness sai 2. Quando o alvo não é o banco deste
#                   projeto, o harness confere os nomes contra arquivos LOCAIS e
#                   todas as checagens viram ESPERADO sem nada ter sido medido
#   TUDO_NEGADO     com a URL apontando para um alvo que nega TUDO
#                   indiscriminadamente — inclusive um nome de tabela que não
#                   existe em lugar nenhum —, o harness sai 2. Gateway hostil,
#                   proxy autenticando na frente ou rate limit respondendo 401
#                   são indistinguíveis de fechamento real, e só uma sonda de
#                   canário denuncia. Sem este veredito, o conserto fecharia um
#                   eixo e abriria outro pela terceira vez
#   CONTROLE        contra o alvo REAL, sem tocar em ambiente nenhum, o harness
#                   sai 0 e imprime o veredito de identidade do alvo. Sem ele
#                   este script provaria apenas que tudo reprova
#
# Sai 0 só com os quatro aprovados; 1 com qualquer reprovação; 2 para erro de
# preparação.

set -uo pipefail

HARNESS='scripts/verificar-superficie-anon.sh'
DIR_SCHEMAS='supabase/schemas'
PORTA="${PORTA_CONTROLE:-3993}"
BASE_STUB="http://127.0.0.1:$PORTA"

# Rótulo do veredito de identidade do alvo. O CONTROLE exige a presença dele na
# saída do harness: exit 0 sozinho não distingue "o alvo é este banco" de "o
# instrumento não sabe olhar para o alvo".
ROTULO_ALVO='[ALVO]'

# Frase que o harness imprime quando declara fechamento. Nenhuma das três sondas
# negativas pode vê-la: relatório que sai 2 e ainda assim afirma fechamento é
# contradição, e contradição no relatório é o defeito por outra porta.
FRASE_FECHAMENTO='a role anon não devolveu linha nenhuma'

# Ver nota 2. Host reservado por RFC, não resolve em lugar nenhum.
URL_MORTA='https://alvo-que-nao-existe-9f3a2b.invalid'

# Ver nota 1. Valor sintético, escrito aqui, obviamente não-credencial.
CHAVE_SINTETICA='controle-harness-valor-falso-nao-e-credencial'

DIR_TEMP="$(mktemp -d)" || {
    echo 'ERRO DE PREPARAÇÃO: mktemp -d falhou.' >&2
    exit 2
}
PID_STUB=''

encerrar_stub() {
    [ -z "$PID_STUB" ] && return 0
    kill -- -"$PID_STUB" 2>/dev/null
    local i=0
    while [ "$i" -lt 20 ] && kill -0 "$PID_STUB" 2>/dev/null; do
        sleep 0.25
        i=$((i + 1))
    done
    kill -9 -- -"$PID_STUB" 2>/dev/null
    wait "$PID_STUB" 2>/dev/null
    PID_STUB=''
}

limpar() {
    local codigo=$?
    encerrar_stub
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
        printf '  [APROVADO]  %-15s %s\n' "$nome" "$detalhe"
    else
        REPROVADOS=$((REPROVADOS + 1))
        LISTA_REPROVADOS+=("$nome — $detalhe")
        printf '  [REPROVADO] %-15s %s\n' "$nome" "$detalhe"
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

# --- Preparação --------------------------------------------------------------
echo 'Controle do harness de superfície anônima'
echo "Harness sob controle: $HARNESS   |   Porta do stub: $PORTA"
echo

command -v node >/dev/null 2>&1 || abortar 'node não encontrado no PATH — o stub HTTP usa node:http.'
command -v curl >/dev/null 2>&1 || abortar 'curl não encontrado no PATH.'
[ -f "$HARNESS" ] || abortar "rode a partir da raiz do projeto ($HARNESS não encontrado)."
[ -d "$DIR_SCHEMAS" ] || abortar "$DIR_SCHEMAS não encontrado — sem os schemas declarativos o harness aborta e não há o que medir."
ls "$DIR_SCHEMAS"/*.sql >/dev/null 2>&1 || abortar "$DIR_SCHEMAS não tem .sql legível."
porta_ocupada && abortar "a porta $PORTA já está ocupada — encerre o processo ou informe PORTA_CONTROLE."

# --- Stub HTTP, escrito aqui dentro (ver nota 3) -----------------------------
cat >"$DIR_TEMP/stub.cjs" <<'FIM_DO_STUB'
// Stub do controle: finge ser a Data API para medir como o harness reage.
// Responde a QUALQUER caminho com o mesmo par status/corpo, escolhido por
// argumento. Não há roteamento de propósito: a graça do cenário é justamente
// o alvo tratar toda tabela do mesmo jeito.
const http = require('node:http')

const MODOS = {
    // Alvo que não é o banco deste projeto: nenhuma tabela declarada existe lá.
    'fora-do-cache': {
        status: 404,
        corpo: {
            code: 'PGRST205',
            details: null,
            hint: null,
            message: 'Could not find the table in the schema cache',
        },
    },
    // Alvo que nega tudo indiscriminadamente, inclusive nome inexistente.
    'nega-tudo': {
        status: 401,
        corpo: {
            code: '42501',
            details: null,
            hint: 'Grant the required privileges to the current role',
            message: 'permission denied',
        },
    },
}

const modo = process.argv[2]
const porta = Number(process.argv[3])
const resposta = MODOS[modo]

if (!resposta) {
    console.error(`modo desconhecido: ${modo}`)
    process.exit(1)
}

const corpo = JSON.stringify(resposta.corpo)

http.createServer((req, res) => {
    res.writeHead(resposta.status, { 'Content-Type': 'application/json' })
    res.end(corpo)
}).listen(porta, '127.0.0.1')
FIM_DO_STUB

subir_stub() {
    local modo="$1"
    local log="$DIR_TEMP/stub-$modo.log"
    : >"$log"
    # Ver nota 3: job control ligado SÓ para o lançamento.
    set -m
    node "$DIR_TEMP/stub.cjs" "$modo" "$PORTA" >"$log" 2>&1 &
    PID_STUB=$!
    set +m

    local i=0 codigo
    while [ "$i" -lt 40 ]; do
        if ! kill -0 "$PID_STUB" 2>/dev/null; then
            tail -n 5 "$log" >&2
            abortar "o stub morreu antes de aceitar conexão (modo $modo)."
        fi
        codigo=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "$BASE_STUB/rest/v1/sonda" 2>/dev/null)
        [ "$codigo" != '000' ] && return 0
        sleep 0.25
        i=$((i + 1))
    done
    abortar "o stub não respondeu em 10s (modo $modo) — abortar é obrigatório, degradar para aprovação é o defeito."
}

# --- Ambiente sintético (ver nota 1) -----------------------------------------
# Escreve um diretório de trabalho auto-suficiente: o harness, os schemas
# declarativos (que ele deriva para montar a lista de tabelas) e um arquivo de
# ambiente com duas linhas escritas por este script.
montar_ambiente() {
    local dir="$1" url="$2"
    rm -rf "$dir"
    mkdir -p "$dir/scripts" "$dir/supabase" || abortar "não consegui preparar $dir."
    cp "$HARNESS" "$dir/scripts/" || abortar "não consegui copiar $HARNESS."
    cp -R "$DIR_SCHEMAS" "$dir/supabase/" || abortar "não consegui copiar $DIR_SCHEMAS."
    {
        printf 'NEXT_PUBLIC_SUPABASE_URL=%s\n' "$url"
        printf 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=%s\n' "$CHAVE_SINTETICA"
    } >"$dir/.env.local" || abortar "não consegui escrever o ambiente sintético em $dir."
}

CODIGO_HARNESS=0
ARQUIVO_SAIDA=''

rodar_harness_em() {
    local dir="$1"
    ARQUIVO_SAIDA="$dir/saida.txt"
    (cd "$dir" && bash scripts/verificar-superficie-anon.sh) >"$ARQUIVO_SAIDA" 2>&1
    CODIGO_HARNESS=$?
}

# Os três cenários negativos partilham o mesmo critério: o harness tem de sair 2
# e não pode imprimir a frase de fechamento.
avaliar_cenario_negativo() {
    local nome="$1" racional="$2"
    local tem_frase=0
    grep -qF "$FRASE_FECHAMENTO" "$ARQUIVO_SAIDA" && tem_frase=1

    if [ "$CODIGO_HARNESS" -eq 2 ] && [ "$tem_frase" -eq 0 ]; then
        registrar APROVADO "$nome" \
            "o harness saiu 2 e não afirmou fechamento — $racional"
    else
        registrar REPROVADO "$nome" \
            "o harness saiu $CODIGO_HARNESS (exigido 2) e imprimiu a frase de fechamento=$tem_frase (exigido 0) — $racional"
        echo "  --- últimas linhas do relatório do harness ($nome) ---" >&2
        tail -n 4 "$ARQUIVO_SAIDA" >&2
    fi
}

# --- Veredito 1: ALVO_MORTO --------------------------------------------------
DIR_MORTO="$DIR_TEMP/alvo-morto"
montar_ambiente "$DIR_MORTO" "$URL_MORTA"
rodar_harness_em "$DIR_MORTO"
avaliar_cenario_negativo ALVO_MORTO \
    'host reservado por RFC 2606 que não resolve: toda checagem vira HTTP 000 e nada foi medido'

# --- Veredito 2: PROJETO_ERRADO ----------------------------------------------
subir_stub 'fora-do-cache'
DIR_ERRADO="$DIR_TEMP/projeto-errado"
montar_ambiente "$DIR_ERRADO" "$BASE_STUB"
rodar_harness_em "$DIR_ERRADO"
encerrar_stub
avaliar_cenario_negativo PROJETO_ERRADO \
    'alvo em que nenhuma tabela declarada existe: o harness confere os nomes contra arquivos LOCAIS, então tudo vira ESPERADO sem que o banco deste projeto tenha sido tocado'

# --- Veredito 3: TUDO_NEGADO -------------------------------------------------
subir_stub 'nega-tudo'
DIR_NEGADO="$DIR_TEMP/tudo-negado"
montar_ambiente "$DIR_NEGADO" "$BASE_STUB"
rodar_harness_em "$DIR_NEGADO"
encerrar_stub
avaliar_cenario_negativo TUDO_NEGADO \
    'alvo que nega TUDO indiscriminadamente, inclusive nome inexistente: gateway hostil e fechamento real ficam indistinguíveis sem sonda de canário'

# --- Veredito 4: CONTROLE ----------------------------------------------------
# Contra o alvo real, a partir da raiz, sem tocar em ambiente nenhum.
ARQUIVO_CONTROLE="$DIR_TEMP/controle.txt"
bash "$HARNESS" >"$ARQUIVO_CONTROLE" 2>&1
CODIGO_CONTROLE=$?
TEM_ROTULO=0
grep -qF "$ROTULO_ALVO" "$ARQUIVO_CONTROLE" && TEM_ROTULO=1

if [ "$CODIGO_CONTROLE" -eq 0 ] && [ "$TEM_ROTULO" -eq 1 ]; then
    registrar APROVADO CONTROLE \
        "contra o alvo real o harness saiu 0 e imprimiu o veredito $ROTULO_ALVO — o instrumento aprova o que deve aprovar"
else
    registrar REPROVADO CONTROLE \
        "o harness real saiu $CODIGO_CONTROLE (exigido 0) e imprimiu o rótulo $ROTULO_ALVO=$TEM_ROTULO (exigido 1) — exit 0 sem veredito de identidade do alvo não distingue 'é este banco' de 'o instrumento não olha para o alvo'"
fi

echo
if [ "$REPROVADOS" -eq 0 ]; then
    echo "Resumo: $TOTAL vereditos, 0 reprovados — o harness reprova nos três estados em que não tem o que medir e aprova o alvo real."
    exit 0
fi

echo "Resumo: $TOTAL vereditos, $REPROVADOS REPROVADO(S):"
for item in "${LISTA_REPROVADOS[@]}"; do
    echo "  - $item"
done
exit 1
