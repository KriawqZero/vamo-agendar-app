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
# 12) MODO ALVO EXTERNO (`ALVO_EXTERNO=<url>`) — o servidor é DE OUTRA PESSOA.
#    Regra que domina todas as outras deste modo: **sem `ALVO_EXTERNO`, nada
#    muda** — mesmos vereditos, mesma ordem, mesmos códigos de saída. Todo
#    comportamento novo entra atrás de `MODO_EXTERNO`.
#
#    Nesse modo o harness NÃO roda `pnpm build`, NÃO sobe `next start`, NÃO
#    confere porta ocupada e NÃO monta complemento de env (não há processo nosso
#    para herdá-lo). `PID` permanece vazio e `encerrar_servidor` retorna cedo:
#    matar processo de terceiro seria transformar um instrumento de medição em
#    incidente. `PORTA` deixa de significar coisa alguma e some do cabeçalho.
#
#    A checagem de `UPSTASH_REDIS_REST_URL`/`_TOKEN` em `.env.local` também vale
#    só no modo local — é ela que impede o harness de medir o no-op do NOSSO
#    processo. O alvo externo tem o ambiente dele, e abortar por causa do nosso
#    seria erro de preparação inventado. A consequência honesta: se o ALVO
#    estiver em no-op, o veredito BLOQUEIO reprova — que é a leitura correta.
#
# 13) PORTÃO DE CUSTO (`CONFIRMO_CUSTO_NO_ALVO=1`). Obrigatório em modo externo.
#    Sem ele o harness aborta (código 2) ANTES de disparar uma única sonda.
#    Motivo: contra alvo externo as sondas consomem orçamento de rate limit DE
#    VERDADE e escrevem contadores no Redis dele; contra produção, deixam o IP
#    que rodou sem poder criar agendamento pela duração da janela. O que NÃO
#    acontece continua valendo (nota 5): as sondas morrem em `slug_invalido`,
#    depois do rate limit e antes da resolução do slug — nenhum agendamento e
#    nenhum cliente são gravados.
#
# 14) `SABOTAR_FORNECEDOR=1` + `ALVO_EXTERNO` é INCOERENTE e aborta (código 2). O
#    contrafactual funciona injetando env no processo que o harness sobe, e em
#    modo externo esse processo não existe. Fingir que funcionaria produziria um
#    "contrafactual" que na verdade mediu o alvo intacto — o pior desfecho
#    possível para um controle.
#
# 15) ⚠️ CONTROLE_DE_ID — a armadilha central do modo externo. O id da Server
#    Action sai do manifesto do build LOCAL; contra o alvo remoto ele pode
#    simplesmente não existir. Id errado não dá erro óbvio: dá uma resposta
#    DIFERENTE, que o harness classificaria como veredito. Por isso, antes de
#    qualquer sonda de contagem, vai uma SONDA DE CONTROLE: mesmo corpo, com
#    `clienteNome` vazio, exigindo HTTP 200 e o discriminante
#    `campos_obrigatorios` no corpo.
#
#    Por que essa sonda especificamente: na ordem das guardas (nota 5) o ramo de
#    campo obrigatório retorna ANTES do rate limit. A sonda custa ZERO token —
#    prova que o id resolve para aquela action no alvo sem consumir orçamento
#    nenhum. E prova que resolve para *aquela* action, não outra: nenhuma outra
#    devolve esse discriminante.
#
#    Em modo externo o harness não constrói. Manifesto ausente ⇒ aborta mandando
#    rodar `pnpm build` **no commit que está deployado**. Construir sozinho aqui
#    seria pior que não construir: geraria um id a partir da árvore de trabalho e
#    daria a ilusão de correspondência com o alvo — e correspondência é
#    exatamente o que o CONTROLE_DE_ID existe para medir.
#
# 16) MODO MEDIÇÃO (`MEDIR_HEADER_IP=1`) — QUAL header de IP o alvo usa como
#    chave. Substitui a bateria normal de vereditos por uma medição, e funciona
#    nos DOIS modos. Rodar em modo LOCAL é o CONTROLE que prova que o instrumento
#    discrimina: sem proxy na frente, a resposta é conhecida de antemão — o
#    `X-Real-IP` que a própria sonda manda é o único candidato possível.
#
#    ⚠️ O ORÁCULO É O PRÓPRIO BALDE DO RATE LIMIT, NÃO O PAINEL. O `chaveHash`
#    não volta na resposta HTTP, então "qual header o app usou" seria, por
#    painel, um teste de crença. Pelo balde vira observação: quem encheu o balde
#    é quem é a chave.
#
#    Dois candidatos de faixas de documentação DIFERENTES, para serem
#    inconfundíveis no relatório e em qualquer painel: `203.0.113.x` (RFC 5737,
#    TEST-NET-3) vai em `X-Real-IP` e `192.0.2.x` (TEST-NET-1) vai em
#    `X-Forwarded-For`. Octeto final derivado do relógio, pelo motivo da nota 4.
#
#    Sequência: BASELINE (sonda sem header forjado; se vier BLOQUEADA, aborta —
#    o balde da chave que o alvo usa para nós já está sujo e nada do que vem
#    depois mede o que diz medir, mesma lógica da nota 8) → ENCHER (sondas com os
#    DOIS headers até bloquear; nunca bloqueou ⇒ inconclusivo e saída 2, porque
#    pode ser rate limit em no-op no alvo) → DISCRIMINAR (três sondas: sem header,
#    só `X-Real-IP`, só `X-Forwarded-For`) → VEREDITO por tabela verdade.
#
# 17) A LINHA `VEREDITO_HEADER:` É LEGÍVEL POR MÁQUINA DE PROPÓSITO. Ela sai como
#    último item do relatório, com exatamente quatro valores possíveis:
#    `ip-da-conexao`, `x-real-ip`, `x-forwarded-for`, `inconclusivo`. Sem ela, a
#    única forma de um script conferir o resultado seria grepar a prosa — e a
#    prosa contém a TABELA VERDADE INTEIRA, que casa com qualquer veredito. Um
#    gate assim ficaria verde independentemente do que foi medido, que é o
#    falso-verde clássico deste projeto.
#
# 18) OS HASHES CANDIDATOS SÃO CORROBORAÇÃO, NUNCA O VEREDITO. A fórmula é
#    reproduzida por um `node -e` inline e é uma DUPLICATA de `hashComSal`
#    (`src/lib/observabilidade/hash.ts`) com o domínio de `hashChaveRateLimit`
#    (`src/lib/rate-limit.ts`) — as duas mudam juntas. Por isso há TRIPWIRE: se o
#    domínio deixar de estar declarado no primeiro ou o truncamento a 16 deixar
#    de estar no segundo, o script PULA a impressão e avisa. Melhor não imprimir
#    do que imprimir hash de fórmula velha.
#
#    Sal ausente ⇒ nada é impresso, e o motivo é dito: hash com sal vazio é hash
#    errado que parece certo. O VALOR do sal nunca aparece em ramo nenhum
#    (nota 1) — o `node -e` o lê do ambiente, jamais de argv, que é público em
#    `ps`. E os hashes impressos não devem ser colados em issue/PR: são
#    pseudônimos, mas de plaintext conhecido.
#
# ---------------------------------------------------------------------------
# USO
# ---------------------------------------------------------------------------
#   bash scripts/verificar-rate-limit-escrita.sh
#   PULAR_BUILD=1 bash scripts/verificar-rate-limit-escrita.sh   # reusa .next/
#   PORTA_RATELIMIT=4003 bash scripts/verificar-rate-limit-escrita.sh
#   SABOTAR_FORNECEDOR=1 bash scripts/verificar-rate-limit-escrita.sh  # contrafactual
#
#   # Alvo externo (servidor que este script não constrói, não sobe e não mata):
#   ALVO_EXTERNO=https://exemplo.com CONFIRMO_CUSTO_NO_ALVO=1 \
#       bash scripts/verificar-rate-limit-escrita.sh
#
#   # Medição de qual header de IP o alvo usa como chave (nota 16):
#   MEDIR_HEADER_IP=1 ALVO_EXTERNO=https://exemplo.com CONFIRMO_CUSTO_NO_ALVO=1 \
#       bash scripts/verificar-rate-limit-escrita.sh
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

# Ver nota 12: o alvo externo é um servidor de outra pessoa. `MODO_EXTERNO` é o
# único interruptor deste modo — tudo o que muda está guardado por ele, para que
# a execução padrão continue byte a byte a mesma.
MODO_EXTERNO=0
BASE_URL="http://127.0.0.1:$PORTA"
if [ -n "${ALVO_EXTERNO:-}" ]; then
    MODO_EXTERNO=1
    # Barra final removida: `$BASE_URL$ROTA_SONDA` produziria `//book/...`.
    BASE_URL="${ALVO_EXTERNO%/}"
fi

# Ver nota 16: substitui a bateria de vereditos por uma medição. Vale nos dois
# modos — em modo local ele é o CONTROLE de resposta conhecida.
MODO_MEDICAO=0
[ "${MEDIR_HEADER_IP:-}" = '1' ] && MODO_MEDICAO=1

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

# Ver nota 16: candidatos do modo medição, em faixas de documentação DIFERENTES
# entre si e diferentes da usada pelas sondas normais. Faixas distintas tornam a
# leitura inconfundível — no relatório e em qualquer painel, `203.0.113.x` só
# pode ter chegado por `X-Real-IP` e `192.0.2.x` só por `X-Forwarded-For`.
CANDIDATO_REAL_IP="203.0.113.$SEMENTE"   # RFC 5737 TEST-NET-3
CANDIDATO_XFF="192.0.2.$SEMENTE"         # RFC 5737 TEST-NET-1

# Ver nota 5: forma válida em todos os campos, slug que não resolve.
corpo_sonda() {
    printf '[{"slug":"%s","servicoId":"00000000-0000-0000-0000-000000000000","dataHora":"2030-01-01T13:00:00.000Z","clienteNome":"Harness Rate Limit","clienteTelefone":"11999998888"}]' \
        "$SLUG_INEXISTENTE"
}

# Ver nota 15: MESMO corpo, com `clienteNome` vazio. `campos_obrigatorios`
# retorna ANTES do rate limit, então esta sonda custa ZERO token — é o que
# permite conferir a correspondência do id sem consumir orçamento do alvo.
corpo_sonda_controle() {
    printf '[{"slug":"%s","servicoId":"00000000-0000-0000-0000-000000000000","dataHora":"2030-01-01T13:00:00.000Z","clienteNome":"","clienteTelefone":"11999998888"}]' \
        "$SLUG_INEXISTENTE"
}

# Complemento para as obrigatórias que faltarem em dev — e SÓ para as que
# faltarem. Nenhum valor aqui é credencial.
#
# O harness modelo (`verificar-travessia-server-action.sh`) injeta as quatro
# incondicionalmente, porque quando ele foi escrito nenhuma existia no `.env.local`
# deste projeto. Três passaram a existir desde então, e injetar por cima delas tem
# um custo que só aparece neste harness: sobrescrever `NEXT_PUBLIC_SENTRY_DSN` com
# um host inválido faz os bloqueios que o harness provoca NÃO chegarem ao painel,
# e sobrescrever `ANALYTICS_TENANT_SALT` faz o `chaveHash` sair com sal diferente
# do de produção. Ou seja: o harness destruiria justamente a evidência de
# observabilidade que uma execução dele deveria produzir (SC3 / ABU-03).
#
# Por isso o complemento é condicional: só entra o que realmente falta no
# ambiente. Ver nota 1 — nenhum VALOR é impresso, aqui ou em qualquer ramo.
#
# ⚠️ SÓ FAZ SENTIDO NO MODO LOCAL (nota 12): complemento de env é injetado no
# processo que ESTE script sobe. Em modo externo não existe processo nosso, e o
# alvo carrega o ambiente dele — as duas listas ficam vazias e nada é montado.
COMPLEMENTO_DEV=()
COMPLEMENTADAS=()
if [ "$MODO_EXTERNO" -eq 0 ]; then
    COMPLEMENTO_DEV=("APP_URL=http://127.0.0.1:$PORTA")
    for NOME_VAR in ANALYTICS_TENANT_SALT NEXT_PUBLIC_SENTRY_DSN RESEND_API_KEY; do
        if grep -qE "^${NOME_VAR}=." .env.local 2>/dev/null; then
            continue
        fi
        case "$NOME_VAR" in
            ANALYTICS_TENANT_SALT) COMPLEMENTO_DEV+=('ANALYTICS_TENANT_SALT=harness-sal-de-teste') ;;
            NEXT_PUBLIC_SENTRY_DSN) COMPLEMENTO_DEV+=('NEXT_PUBLIC_SENTRY_DSN=https://harness@localhost.invalid/1') ;;
            RESEND_API_KEY) COMPLEMENTO_DEV+=('RESEND_API_KEY=harness-chave-invalida') ;;
        esac
        COMPLEMENTADAS+=("$NOME_VAR")
    done
fi

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
    # Ver nota 12: em modo externo `PID` NUNCA é atribuído, então esta função é
    # inerte e o `trap`/`limpar` não toca em processo nenhum. É requisito, não
    # detalhe — o servidor medido é de outra pessoa.
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
elif [ "$MODO_EXTERNO" -eq 1 ]; then
    echo '################################################################'
    echo '#  ALVO EXTERNO — O SERVIDOR NÃO É GERENCIADO POR ESTE SCRIPT  #'
    echo '################################################################'
    echo "  Medindo: $BASE_URL"
    echo '  Este script NÃO constrói, NÃO sobe e NÃO encerra esse servidor.'
    echo '  As sondas consomem orçamento de rate limit REAL do alvo.'
else
    echo 'Verificação do rate limit de ESCRITA por IP contra Upstash Redis real'
fi
if [ "$MODO_EXTERNO" -eq 1 ]; then
    # `PORTA` não significa nada aqui e sairia do cabeçalho como ruído.
    echo "Action alvo: $NOME_ACTION_ESCRITA   |   Teto esperado: $TETO_ESCRITA_IP/10min"
else
    echo "Action alvo: $NOME_ACTION_ESCRITA   |   Porta: $PORTA   |   Teto: $TETO_ESCRITA_IP/10min"
fi
if [ "$MODO_MEDICAO" -eq 1 ]; then
    echo 'MODO MEDIÇÃO (MEDIR_HEADER_IP=1) — a bateria de vereditos dá lugar a UMA pergunta:'
    echo 'qual header de IP o alvo usa como chave do rate limit? O oráculo é o próprio balde.'
    echo "Candidatos: X-Real-IP=$CANDIDATO_REAL_IP (TEST-NET-3) e X-Forwarded-For=$CANDIDATO_XFF (TEST-NET-1)"
else
    echo "IPs de sonda (RFC 5737, não roteáveis): $IP_SONDA e $IP_VIZINHO"
fi
echo

command -v pnpm >/dev/null 2>&1 || abortar 'pnpm não encontrado no PATH.'
[ -f package.json ] || abortar 'rode a partir da raiz do projeto (package.json não encontrado).'

# --- Portões do modo externo (ver notas 13 e 14) ------------------------------
# Os dois abortam ANTES de qualquer sonda — inclusive antes da sonda de controle,
# que é gratuita em token mas ainda assim é tráfego contra servidor de terceiro.
if [ "$MODO_EXTERNO" -eq 1 ]; then
    if [ "$MODO_CONTRAFACTUAL" -eq 1 ]; then
        abortar "SABOTAR_FORNECEDOR=1 é INCOERENTE com ALVO_EXTERNO. O contrafactual sabota o processo que ESTE script sobe, e em modo externo esse processo não existe: o harness mediria o alvo INTACTO e chamaria o resultado de contrafactual — o pior desfecho possível para um controle (nota 14). Rode o contrafactual em modo local."
    fi

    if [ "${CONFIRMO_CUSTO_NO_ALVO:-}" != '1' ]; then
        CUSTO_EXTRA=''
        if [ "$MODO_MEDICAO" -eq 1 ]; then
            # Ver nota 16: a medição gasta mais, e no desfecho BOM (proxy
            # sobrepondo os nossos headers) quem enche o balde é o IP REAL de
            # quem rodou — a máquina que executa fica sem poder criar
            # agendamento pela janela inteira.
            CUSTO_EXTRA=" CUSTO ADICIONAL DO MEDIR_HEADER_IP=1: até ~16 sondas de escrita em vez de ~13; e se o alvo IGNORAR os headers forjados (o desfecho bom, proxy sobrepondo), quem enche o balde é o IP REAL desta máquina — ela fica sem poder criar agendamento no alvo pela janela inteira."
        fi
        abortar "modo externo exige CONFIRMO_CUSTO_NO_ALVO=1 (nota 13). O QUE ISSO CUSTA em $BASE_URL: as sondas consomem orçamento de rate limit de verdade e escrevem contadores no Redis do alvo; se o alvo for produção, o IP que rodar este script pode ficar sem poder criar agendamento pela duração da janela ($TETO_ESCRITA_IP/10min).$CUSTO_EXTRA O QUE NÃO ACONTECE: as sondas usam slug inexistente com os demais campos válidos e morrem em \`slug_invalido\`, depois do rate limit e antes da resolução do slug — nenhum agendamento e nenhum cliente são gravados (nota 5). Nenhuma sonda foi disparada."
    fi
else
    porta_ocupada && abortar "a porta $PORTA já está ocupada — encerre o processo antes de medir."
fi

# --- Build (preparação, não é veredito) --------------------------------------
if [ "$MODO_EXTERNO" -eq 1 ]; then
    # Ver nota 15: construir aqui geraria um id a partir da árvore de trabalho e
    # daria a ilusão de correspondência com o alvo. Não construir e ABORTAR é o
    # único desfecho que preserva o significado do CONTROLE_DE_ID.
    [ -f "$MANIFESTO" ] || abortar "modo externo não constrói, e $MANIFESTO não existe. Rode \`pnpm build\` NO COMMIT QUE ESTÁ DEPLOYADO no alvo e tente de novo — o id da Server Action sai desse manifesto e só vale se corresponder ao build remoto."
    echo '  … build NÃO executado (modo externo) — o manifesto local é o do commit que você construiu'
elif [ "${PULAR_BUILD:-}" = '1' ]; then
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
#
# ⚠️ Só vale no modo LOCAL (nota 12). Em modo externo o ambiente que importa é o
# do ALVO, e abortar por causa do nosso `.env.local` seria erro de preparação
# inventado. A consequência honesta: se o alvo estiver em no-op, o veredito
# BLOQUEIO reprova — e reprovar é a leitura correta desse estado.
if [ "$MODO_EXTERNO" -eq 0 ]; then
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
fi

if [ "$MODO_EXTERNO" -eq 1 ]; then
    NOTA_COMPLEMENTO='ambiente do ALVO (nenhuma variável nossa é injetada — não há processo nosso)'
elif [ "${#COMPLEMENTADAS[@]}" -eq 0 ]; then
    NOTA_COMPLEMENTO='nenhuma variável precisou de complemento falso — a telemetria deste run vai para os painéis reais'
else
    NOTA_COMPLEMENTO="complementadas com valor falso por ausência em .env.local: ${COMPLEMENTADAS[*]}"
fi

if [ "$MODO_EXTERNO" -eq 1 ]; then
    registrar APROVADO PREPARO \
        "id de $NOME_ACTION_ESCRITA (prefixo ${ID_ACTION_ESCRITA:0:8}…) derivado do manifesto LOCAL — a correspondência com o alvo é medida no CONTROLE_DE_ID, não assumida; $NOTA_COMPLEMENTO"
else
    registrar APROVADO PREPARO \
        "id de $NOME_ACTION_ESCRITA (prefixo ${ID_ACTION_ESCRITA:0:8}…) derivado de $MANIFESTO; UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN presentes; $NOTA_COMPLEMENTO"
fi

# --- Veredito 2: CONTROLE ----------------------------------------------------
# Em modo externo o servidor já está no ar e não é nosso: `iniciar_servidor` não
# é chamado, `PID` fica vazio, e o CONTROLE vira só a checagem de que o alvo
# responde 200 na raiz.
[ "$MODO_EXTERNO" -eq 0 ] && iniciar_servidor ratelimit ${COMPLEMENTO_DEV[@]+"${COMPLEMENTO_DEV[@]}"}

CODIGO_RAIZ=000
i=0
while [ "$i" -lt $((LIMITE_CONTROLE * 2)) ]; do
    if [ "$MODO_EXTERNO" -eq 0 ] && ! kill -0 "$PID" 2>/dev/null; then
        CODIGO_RAIZ='processo-morreu'
        break
    fi
    CODIGO_RAIZ=$(codigo_http "$BASE_URL/")
    [ "$CODIGO_RAIZ" = '200' ] && break
    sleep 0.5
    i=$((i + 1))
done

PROCESSO_VIVO=0
if [ "$MODO_EXTERNO" -eq 1 ] || kill -0 "$PID" 2>/dev/null; then
    PROCESSO_VIVO=1
fi

if [ "$CODIGO_RAIZ" = '200' ] && [ "$PROCESSO_VIVO" -eq 1 ]; then
    if [ "$MODO_EXTERNO" -eq 1 ]; then
        registrar APROVADO CONTROLE "GET $BASE_URL/ devolveu 200 — o alvo externo está no ar"
    else
        registrar APROVADO CONTROLE 'GET / devolveu 200 e o processo seguiu vivo'
    fi
else
    if [ "$MODO_EXTERNO" -eq 1 ]; then
        registrar REPROVADO CONTROLE \
            "GET $BASE_URL/ devolveu '$CODIGO_RAIZ' (exigido 200) — o alvo externo não está respondendo"
    else
        registrar REPROVADO CONTROLE \
            "GET / devolveu '$CODIGO_RAIZ' (exigido 200 com o processo vivo) — o build pode estar quebrado"
        tail -n 12 "$DIR_TEMP/ratelimit.err" >&2
    fi
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

# Sonda com controle TOTAL sobre os headers de IP — inclusive nenhum. É o que o
# modo medição precisa e o que `sondar` (que sempre manda `X-Real-IP`) não pode
# oferecer sem mudar o comportamento da bateria normal.
sondar_livre() {
    local args=() h
    for h in "$@"; do args+=(-H "$h"); done
    curl -s --max-time 15 -X POST \
        -H "Next-Action: $ID_ACTION_ESCRITA" \
        -H 'Content-Type: text/plain;charset=UTF-8' \
        ${args[@]+"${args[@]}"} \
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

# --- Aborto CONTROLE_DE_ID (ver nota 15) -------------------------------------
# NÃO é veredito, é preparação: um id que o alvo não tem produziria uma resposta
# diferente, que os vereditos seguintes classificariam como comportamento do
# rate limit. Nunca produzir veredito sobre um id que o alvo não tem.
if [ "$MODO_EXTERNO" -eq 1 ]; then
    ARQ_CONTROLE_ID="$DIR_TEMP/controle-id.out"
    CODIGO_CONTROLE_ID=$(curl -s -o "$ARQ_CONTROLE_ID" -w '%{http_code}' --max-time 15 -X POST \
        -H "Next-Action: $ID_ACTION_ESCRITA" \
        -H 'Content-Type: text/plain;charset=UTF-8' \
        -H "X-Real-IP: $IP_SONDA" \
        --data-raw "$(corpo_sonda_controle)" \
        "$BASE_URL$ROTA_SONDA" 2>/dev/null)
    CORPO_CONTROLE_ID=$(cat "$ARQ_CONTROLE_ID" 2>/dev/null)

    CONTROLE_ID_OK=0
    case "$CORPO_CONTROLE_ID" in *campos_obrigatorios*) CONTROLE_ID_OK=1 ;; esac

    if [ "$CODIGO_CONTROLE_ID" != '200' ] || [ "$CONTROLE_ID_OK" -eq 0 ]; then
        abortar "CONTROLE_DE_ID falhou: a sonda de controle devolveu HTTP $CODIGO_CONTROLE_ID e o corpo NÃO trouxe \`campos_obrigatorios\`. Corpo: $(printf '%s' "$CORPO_CONTROLE_ID" | head -c 300 | tr '\n' '|')
  Hipótese mais provável: a árvore de trabalho local NÃO é o commit deployado em $BASE_URL, então o id derivado do manifesto local não existe no alvo. Rode \`pnpm build\` no commit que está deployado.
  Segunda hipótese, para 403/500 em vez de um corpo de action: a proteção de origem das Server Actions do Next barrou a requisição (Origin/Host divergentes) — suspeite disso ANTES de suspeitar do id.
  Nenhuma sonda de contagem foi disparada: este ramo do fluxo morre em \`campos_obrigatorios\`, antes do rate limit, e portanto não consumiu token nenhum."
    fi

    echo "  … CONTROLE_DE_ID OK: o alvo resolveu o id para \`$NOME_ACTION_ESCRITA\` (devolveu \`campos_obrigatorios\`, sem gastar token)"
fi

# =============================================================================
# MODO MEDIÇÃO (ver notas 16, 17 e 18) — substitui a bateria de vereditos
# =============================================================================
if [ "$MODO_MEDICAO" -eq 1 ]; then
    echo
    echo '--- 1. BASELINE: a chave que o alvo usa para NÓS está limpa? -------------'
    CORPO_BASE=$(sondar_livre)
    ESTADO_BASE=$(classificar "$CORPO_BASE")

    if [ "$ESTADO_BASE" = 'BLOQUEADO' ]; then
        encerrar_servidor
        abortar "a sonda BASELINE (sem header forjado nenhum) já veio BLOQUEADA. O balde da chave que o alvo usa para nós está sujo, e nesse estado nada do que vem depois mede o que diz medir — as três sondas de discriminação viriam bloqueadas por herança, não por causa dos headers. Aguarde a janela virar e rode de novo. Abortar aqui é a mesma lógica do JANELA_LIMPA (nota 8)."
    fi
    if [ "$ESTADO_BASE" = 'INDEFINIDO' ]; then
        encerrar_servidor
        abortar "a sonda BASELINE não devolveu nem \`slug_invalido\` nem \`muitas_tentativas\`. Sem classificar a linha de base não há medição. Corpo: $(recorte "$CORPO_BASE")"
    fi
    echo "    BASELINE passou (\`slug_invalido\`) — linha de base válida."

    echo
    echo '--- 2. ENCHER: sondas com os DOIS headers forjados ------------------------'
    TENTATIVAS_ENCHER=$((TETO_ESCRITA_IP + EXCEDENTE))
    ENCHEU=0
    n=1
    while [ "$n" -le "$TENTATIVAS_ENCHER" ]; do
        CORPO=$(sondar_livre "X-Real-IP: $CANDIDATO_REAL_IP" "X-Forwarded-For: $CANDIDATO_XFF")
        if [ "$(classificar "$CORPO")" = 'BLOQUEADO' ]; then
            ENCHEU=1
            break
        fi
        n=$((n + 1))
    done

    if [ "$ENCHEU" -eq 0 ]; then
        echo "    NUNCA bloqueou em $TENTATIVAS_ENCHER sondas."
        echo
        echo 'INCONCLUSIVO — sem bloqueio não existe balde cheio, e sem balde cheio não há'
        echo 'oráculo. A causa mais provável é o rate limit em NO-OP no alvo (sem as'
        echo 'credenciais do Upstash no ambiente DELE). Nesse estado a medição não existe;'
        echo 'relatar inconclusivo é o único desfecho honesto.'
        echo
        echo 'VEREDITO_HEADER: inconclusivo'
        encerrar_servidor
        exit 2
    fi
    echo "    Bloqueou na sonda #$n — há um balde cheio para interrogar."

    echo
    echo '--- 3. DISCRIMINAR: três sondas, uma de cada forma -----------------------'
    CORPO_SEM=$(sondar_livre)
    ESTADO_SEM=$(classificar "$CORPO_SEM")
    CORPO_REAL=$(sondar_livre "X-Real-IP: $CANDIDATO_REAL_IP")
    ESTADO_REAL=$(classificar "$CORPO_REAL")
    CORPO_XFF=$(sondar_livre "X-Forwarded-For: $CANDIDATO_XFF")
    ESTADO_XFF=$(classificar "$CORPO_XFF")

    printf '    sem header forjado ................. %s\n' "$ESTADO_SEM"
    printf '    só X-Real-IP (%s) ....... %s\n' "$CANDIDATO_REAL_IP" "$ESTADO_REAL"
    printf '    só X-Forwarded-For (%s) . %s\n' "$CANDIDATO_XFF" "$ESTADO_XFF"

    # --- Tabela verdade ------------------------------------------------------
    # A ordem dos ramos importa: a sonda SEM header é a primeira pergunta porque
    # ela separa "o alvo ignorou os nossos headers" de todo o resto.
    if [ "$ESTADO_SEM" = 'BLOQUEADO' ]; then
        VEREDITO_HEADER='ip-da-conexao'
        LEITURA='O alvo IGNOROU os headers que mandamos e chaveou pelo IP REAL da conexão.
É o DESFECHO BOM: a camada de IP não é forjável de fora. (Neste mundo as três sondas
costumam vir bloqueadas, porque todas caem no mesmo balde — o nosso IP real.)'
    elif [ "$ESTADO_REAL" = 'BLOQUEADO' ] && [ "$ESTADO_XFF" = 'PASSOU' ]; then
        VEREDITO_HEADER='x-real-ip'
        LEITURA='O `x-real-ip` que o CLIENTE manda chega intacto ao app: só a sonda que o
repetiu caiu no balde cheio. FORJÁVEL — quem escolhe a chave do rate limit é quem faz a
requisição, então a camada de IP precisa ser recalibrada (ou o proxy precisa sobrescrever
o header).'
    elif [ "$ESTADO_XFF" = 'BLOQUEADO' ] && [ "$ESTADO_REAL" = 'PASSOU' ]; then
        VEREDITO_HEADER='x-forwarded-for'
        LEITURA='A ÚLTIMA entrada do `x-forwarded-for` é texto do CLIENTE, ou seja, o proxy
não anexa a dele. FORJÁVEL pelo outro eixo — mesma consequência do caso anterior.'
    else
        VEREDITO_HEADER='inconclusivo'
        LEITURA='Nenhuma das três combinações separa os candidatos. A janela pode ter virado
no meio da medição, ou o alvo tem comportamento não previsto pela tabela. Rode de novo; se
repetir, investigue antes de concluir qualquer coisa. Isto NÃO é aprovação.'
    fi

    echo
    echo '--- 4. VEREDITO ---------------------------------------------------------'
    echo "$LEITURA"
    echo
    echo 'Tabela verdade aplicada:'
    echo '  sem header BLOQUEADA .................... ip-da-conexao   (bom: não forjável)'
    echo '  só X-Real-IP BLOQUEADA, sem-header passou  x-real-ip       (forjável)'
    echo '  só X-Forwarded-For BLOQUEADA, idem ......  x-forwarded-for (forjável)'
    echo '  nenhuma bloqueada ......................  inconclusivo    (nunca é aprovação)'
    echo
    echo '⚠️ Ressalva que a nota 7 ensinou: "as três bloqueadas" e "o app está barrando'
    echo 'tudo" só se separam com o BASELINE do passo 1 (que passou) e com o veredito'
    echo 'ISOLAMENTO_POR_IP de uma execução NORMAL. Sem esses dois, um app em pane'
    echo 'produziria este mesmo relatório.'

    # --- 5. Hashes candidatos (corroboração, nunca o veredito) — ver nota 18 --
    echo
    echo '--- 5. Hashes candidatos (para comparar com o `chaveHash` do Sentry Log) --'
    TRIPWIRE_OK=1
    grep -q "DOMINIO_HASH = 'ratelimit'" src/lib/rate-limit.ts 2>/dev/null || TRIPWIRE_OK=0
    grep -q '\.slice(0, 16)' src/lib/observabilidade/hash.ts 2>/dev/null || TRIPWIRE_OK=0

    if [ "$TRIPWIRE_OK" -eq 0 ]; then
        echo '    TRIPWIRE DISPAROU: a forma do hash mudou no código (domínio em'
        echo '    src/lib/rate-limit.ts ou truncamento em src/lib/observabilidade/hash.ts).'
        echo '    Nenhum hash impresso — hash de fórmula velha é pior que hash nenhum.'
        echo '    Atualize o snippet deste script junto com o código.'
    elif [ -z "${ANALYTICS_TENANT_SALT:-}" ]; then
        echo '    ANALYTICS_TENANT_SALT ausente no ambiente deste shell: nenhum hash'
        echo '    impresso. Hash com sal vazio é hash errado que PARECE certo, e comparar'
        echo '    um desses com o painel produziria conclusão invertida.'
    else
        node -e '
const { createHash } = require("node:crypto")
// Sal lido do AMBIENTE, jamais de argv (argv é público em `ps`). Ver nota 1.
const sal = process.env.ANALYTICS_TENANT_SALT ?? ""
const dominio = "ratelimit"
for (const [rotulo, valor] of JSON.parse(process.argv[1])) {
    const hash = createHash("sha256").update(`${sal}|${dominio}|${valor}`).digest("hex").slice(0, 16)
    process.stdout.write(`    ${rotulo.padEnd(17)} ${valor.padEnd(15)} -> ${hash}\n`)
}
' "$(printf '[["X-Real-IP","%s"],["X-Forwarded-For","%s"]]' "$CANDIDATO_REAL_IP" "$CANDIDATO_XFF")"
        echo
        echo '    ⚠️ Se o sal deste shell NÃO for o mesmo do alvo, os dois hashes vão'
        echo '    diferir do painel — e isso NÃO significa que nenhum dos candidatos foi'
        echo '    usado. Quem manda é o veredito do balde, acima. Estes hashes só'
        echo '    corroboram.'
        echo '    Não cole estes hashes em issue/PR: são pseudônimos, mas de plaintext'
        echo '    conhecido (os dois candidatos estão escritos aqui do lado).'
    fi

    encerrar_servidor
    echo
    # Ver nota 17: última linha, formato fechado, quatro valores possíveis.
    echo "VEREDITO_HEADER: $VEREDITO_HEADER"
    [ "$VEREDITO_HEADER" = 'inconclusivo' ] && exit 2
    exit 0
fi

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
