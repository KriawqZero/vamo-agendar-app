#!/usr/bin/env bash
#
# Verifica, com curl anônimo real contra a Data API do Supabase, o que a chave
# publicável (role `anon`) ainda consegue ler ou escrever nas tabelas
# operacionais.
#
# Por que existe: privilégio de banco não é testável em unidade sem um banco, e
# este projeto não tem banco local. Afirmar "fechei a superfície" sem uma
# requisição anônima de verdade é achismo — este script é o artefato de prova da
# Phase 1 e continua servindo nas fases seguintes.
#
# Credenciais: lê APENAS as duas variáveis públicas de `.env.local`
# (`NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) — são as
# mesmas que qualquer visitante recebe no bundle do navegador. Nenhum segredo é
# lido; nenhuma variável secreta é referenciada neste arquivo.
#
# Uso:
#   bash scripts/verificar-superficie-anon.sh                 # todas as tabelas
#   bash scripts/verificar-superficie-anon.sh assinaturas     # só uma
#   bash scripts/verificar-superficie-anon.sh clientes agendamentos
#
# ── Vereditos ─────────────────────────────────────────────────────────────
#   ESPERADO     o portão respondeu com PROVA POSITIVA: 42501 (permission
#                denied), ou PGRST205/404 no nome de uma tabela que consta dos
#                schemas declarativos (perda total de privilégio tira a tabela
#                do schema cache do PostgREST — fechamento legítimo)
#   REPROVADO    a role anon leu linhas, a escrita foi aceita, ou a checagem
#                não prova nada (ver COBERTURA e "nome desconhecido" abaixo)
#   INCONCLUSIVO a requisição não provou nada de permissão: `200 []` (a role TEM
#                acesso, a tabela é que está vazia), POST barrado pela FK (23503,
#                porque o tenant_id de teste não existe) ou qualquer outro código
#                que não seja o de permissão negada — pode ser rede, gateway ou
#                rate limit. Não derruba o exit code, mas não serve como prova de
#                fechamento, e o relatório diz isso em voz alta justamente para
#                ninguém declarar SEG-01 fechado com base num acaso.
#   COBERTURA    veredito de bateria: toda tabela declarada em supabase/schemas/
#                precisa aparecer em pelo menos uma checagem. Pulado quando há
#                filtro na linha de comando (execução de escopo reduzido não
#                reprova por cobertura).
#
# ── Por que nome desconhecido REPROVA em vez de ficar inconclusivo ────────
# Até 2026-07-22 este script classificava como ESPERADO QUALQUER código diferente
# de 200 (defeito WR-08 do code review). Um 404 por tabela renomeada, por typo ou
# por schema trocado era indistinguível de um 404 por fechamento real: renomeie
# uma tabela numa fase futura sem atualizar a bateria e a checagem fica verde
# para sempre, enquanto a tabela nova fica sem cobertura nenhuma. Nome que não
# consta dos schemas declarativos é defeito DO HARNESS, e um INCONCLUSIVO não
# derrubaria o exit code — ou seja, deixaria o falso verde de pé. Checagem que
# não prova nada não pode passar.
#
# Para tornar o POST conclusivo, informe um tenant_id que exista:
#   TENANT_TESTE=org_xxxxx bash scripts/verificar-superficie-anon.sh clientes
#
# Sai com 0 quando nenhuma checagem REPROVOU; 1 quando alguma reprovou; 2 quando
# o próprio harness não tem como medir (env ausente, schemas ilegíveis).

set -uo pipefail

ARQUIVO_ENV='.env.local'
DIR_SCHEMAS='supabase/schemas'

# Nove tabelas operacionais na data desta escrita. O piso existe para que uma
# derivação vazia ou truncada (mudança de formatação nos schemas, script rodado
# da pasta errada) falhe ALTO: com a lista quebrada, todo veredito viraria acaso.
MINIMO_TABELAS_DECLARADAS=9

# Códigos que sustentam os vereditos. 42501 é o SQLSTATE de permission denied do
# Postgres — é a prova POSITIVA de que o portão (GRANT) respondeu. PGRST205 é o
# "não achei a tabela no schema cache" do PostgREST.
CODIGO_PERMISSAO_NEGADA='42501'
CODIGO_FORA_DO_CACHE='PGRST205'

abortar() {
    echo "ERRO: $1" >&2
    exit 2
}

# Trava anti-afrouxamento: editar as constantes acima é o jeito mais barato de
# fazer este harness passar sem consertar nada. A comparação literal denuncia.
if [ "$CODIGO_PERMISSAO_NEGADA" != '42501' ] || [ "$CODIGO_FORA_DO_CACHE" != 'PGRST205' ]; then
    abortar 'as constantes de veredito foram alteradas — harness afrouxado não é harness.'
fi

if [ ! -f "$ARQUIVO_ENV" ]; then
    abortar "$ARQUIVO_ENV não encontrado. Rode a partir da raiz do projeto."
fi

SUPABASE_URL=$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' "$ARQUIVO_ENV" | head -n1 | cut -d= -f2-)
ANON_KEY=$(grep -E '^NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=' "$ARQUIVO_ENV" | head -n1 | cut -d= -f2-)

SUPABASE_URL=${SUPABASE_URL%\"}
SUPABASE_URL=${SUPABASE_URL#\"}
ANON_KEY=${ANON_KEY%\"}
ANON_KEY=${ANON_KEY#\"}
SUPABASE_URL=${SUPABASE_URL%/}

if [ -z "$SUPABASE_URL" ] || [ -z "$ANON_KEY" ]; then
    abortar "NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ausentes em $ARQUIVO_ENV."
fi

# --- Lista de tabelas DERIVADA dos schemas declarativos, nunca redigitada -----
# Redigitar a lista é como o WR-08 nasce: o nome envelhece no script e ninguém
# percebe. A fonte da verdade é o mesmo arquivo que cria a tabela.
if [ ! -d "$DIR_SCHEMAS" ]; then
    abortar "$DIR_SCHEMAS não encontrado. Rode a partir da raiz do projeto."
fi

mapfile -t TABELAS_DECLARADAS < <(
    grep -hoiE '^[[:space:]]*create[[:space:]]+table[[:space:]]+(if[[:space:]]+not[[:space:]]+exists[[:space:]]+)?(public\.)?[a-z_][a-z0-9_]*' "$DIR_SCHEMAS"/*.sql |
        sed -E 's/.*[[:space:]]//' |
        sed -E 's/^public\.//' |
        tr '[:upper:]' '[:lower:]' |
        sort -u
)

if [ "${#TABELAS_DECLARADAS[@]}" -lt "$MINIMO_TABELAS_DECLARADAS" ]; then
    abortar "a derivação encontrou ${#TABELAS_DECLARADAS[@]} tabela(s) em $DIR_SCHEMAS/*.sql, menos que o piso de $MINIMO_TABELAS_DECLARADAS — lista truncada torna todo veredito acaso."
fi

tabela_declarada() {
    local alvo="$1" nome
    for nome in "${TABELAS_DECLARADAS[@]}"; do
        [ "$nome" = "$alvo" ] && return 0
    done
    return 1
}

# Tabelas efetivamente exercitadas nesta execução — insumo do veredito COBERTURA.
TABELAS_CHECADAS=()

marcar_checada() {
    local alvo="$1" nome
    if [ "${#TABELAS_CHECADAS[@]}" -gt 0 ]; then
        for nome in "${TABELAS_CHECADAS[@]}"; do
            [ "$nome" = "$alvo" ] && return 0
        done
    fi
    TABELAS_CHECADAS+=("$alvo")
}

tabela_foi_checada() {
    local alvo="$1" nome
    [ "${#TABELAS_CHECADAS[@]}" -eq 0 ] && return 1
    for nome in "${TABELAS_CHECADAS[@]}"; do
        [ "$nome" = "$alvo" ] && return 0
    done
    return 1
}

# Tabelas pedidas na linha de comando; vazio = todas.
FILTRO=("$@")

deve_rodar() {
    local tabela="$1"
    [ ${#FILTRO[@]} -eq 0 ] && return 0
    local pedida
    for pedida in "${FILTRO[@]}"; do
        [ "$pedida" = "$tabela" ] && return 0
    done
    return 1
}

# tenant_id usado nos POSTs. Sem um tenant real a FK barra a escrita antes de o
# portão de privilégio ser exercitado — daí o veredito INCONCLUSIVO.
TENANT_TESTE=${TENANT_TESTE:-org_teste}

TOTAL=0
REPROVADAS=0
INCONCLUSIVAS=0
LISTA_REPROVADAS=()
LISTA_INCONCLUSIVAS=()

registrar() {
    local veredito="$1" descricao="$2" detalhe="$3"
    TOTAL=$((TOTAL + 1))
    case "$veredito" in
    REPROVADO)
        REPROVADAS=$((REPROVADAS + 1))
        LISTA_REPROVADAS+=("$descricao — $detalhe")
        printf '  [REPROVADO]    %-55s %s\n' "$descricao" "$detalhe"
        ;;
    INCONCLUSIVO)
        INCONCLUSIVAS=$((INCONCLUSIVAS + 1))
        LISTA_INCONCLUSIVAS+=("$descricao — $detalhe")
        printf '  [INCONCLUSIVO] %-55s %s\n' "$descricao" "$detalhe"
        ;;
    *)
        printf '  [ESPERADO]     %-55s %s\n' "$descricao" "$detalhe"
        ;;
    esac
}

# Verdadeiro quando o corpo da resposta traz linhas de dados: array JSON
# não-vazio ou qualquer ocorrência de um org_id do Clerk.
tem_linhas() {
    local corpo="$1"
    local enxuto
    enxuto=$(printf '%s' "$corpo" | tr -d ' \n\r\t')
    [ -z "$enxuto" ] && return 1
    [ "$enxuto" = '[]' ] && return 1
    case "$corpo" in
    *org_*) return 0 ;;
    esac
    case "$enxuto" in
    \[*\]) return 0 ;; # array não-vazio
    esac
    return 1
}

# Verdadeiro quando o corpo carrega o código informado (42501 / PGRST205).
corpo_tem_codigo() {
    case "$1" in
    *"$2"*) return 0 ;;
    esac
    return 1
}

# Recorte curto do corpo para caber no relatório.
resumir() {
    printf '%s' "$1" | tr -d '\n\r' | cut -c1-90
}

checar_leitura() {
    local tabela="$1" query="$2"
    deve_rodar "$tabela" || return 0
    marcar_checada "$tabela"

    local resposta corpo codigo
    resposta=$(curl -s -w $'\n%{http_code}' "$SUPABASE_URL/rest/v1/$tabela?$query" \
        -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" 2>/dev/null)
    codigo=$(printf '%s' "$resposta" | tail -n1)
    corpo=$(printf '%s' "$resposta" | sed '$d')

    local descricao="$tabela — GET ?$query"

    if [ -z "$codigo" ]; then
        registrar REPROVADO "$descricao" 'sem resposta da Data API (falha de rede?)'
        return 0
    fi

    if [ "$codigo" = '200' ]; then
        if tem_linhas "$corpo"; then
            registrar REPROVADO "$descricao" "HTTP 200 COM LINHAS: $(resumir "$corpo")"
        else
            # A role ainda enxerga a tabela; só não havia linha para devolver.
            registrar INCONCLUSIVO "$descricao" \
                'HTTP 200 com array vazio — anon TEM acesso, a tabela é que está sem linha visível'
        fi
        return 0
    fi

    # Prova positiva: o portão respondeu que falta privilégio.
    if corpo_tem_codigo "$corpo" "$CODIGO_PERMISSAO_NEGADA"; then
        registrar ESPERADO "$descricao" "HTTP $codigo/$CODIGO_PERMISSAO_NEGADA: $(resumir "$corpo")"
        return 0
    fi

    # Tabela fora do schema cache: fechamento legítimo SE o nome existir nos
    # schemas declarativos. Se não existir, a checagem mira um alvo inexistente e
    # não prova nada — defeito do harness, e defeito do harness REPROVA.
    if corpo_tem_codigo "$corpo" "$CODIGO_FORA_DO_CACHE" || [ "$codigo" = '404' ]; then
        if tabela_declarada "$tabela"; then
            registrar ESPERADO "$descricao" \
                "HTTP $codigo/$CODIGO_FORA_DO_CACHE — tabela declarada saiu do schema cache por perda total de privilégio"
        else
            registrar REPROVADO "$descricao" \
                "HTTP $codigo/$CODIGO_FORA_DO_CACHE e '$tabela' NÃO consta de $DIR_SCHEMAS/*.sql — a checagem não prova fechamento nenhum"
        fi
        return 0
    fi

    registrar INCONCLUSIVO "$descricao" \
        "HTTP $codigo sem $CODIGO_PERMISSAO_NEGADA — não provou permissão negada (rede/gateway/rate limit?): $(resumir "$corpo")"
}

checar_escrita() {
    local tabela="$1" payload="$2"
    deve_rodar "$tabela" || return 0
    marcar_checada "$tabela"

    local resposta corpo codigo
    resposta=$(curl -s -w $'\n%{http_code}' -X POST "$SUPABASE_URL/rest/v1/$tabela" \
        -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
        -H 'Content-Type: application/json' -d "$payload" 2>/dev/null)
    codigo=$(printf '%s' "$resposta" | tail -n1)
    corpo=$(printf '%s' "$resposta" | sed '$d')

    local descricao="$tabela — POST anônimo"

    if [ -z "$codigo" ]; then
        registrar REPROVADO "$descricao" 'sem resposta da Data API (falha de rede?)'
        return 0
    fi

    # Em escrita, qualquer 2xx é reprovação: significa que a linha entrou.
    case "$codigo" in
    2*)
        registrar REPROVADO "$descricao" "HTTP $codigo — a linha foi ACEITA: $(resumir "$corpo")"
        return 0
        ;;
    esac

    # 23503 = violação de FK: o banco recusou porque `$TENANT_TESTE` não existe
    # em perfis_empresas, e não porque anon esteja sem privilégio. Isso NÃO prova
    # portão fechado — com um tenant_id real a escrita passaria.
    if corpo_tem_codigo "$corpo" '23503'; then
        registrar INCONCLUSIVO "$descricao" \
            "HTTP $codigo por violação de FK (tenant inexistente), não por permissão — reexecute com TENANT_TESTE=<org_id real>"
        return 0
    fi

    if corpo_tem_codigo "$corpo" "$CODIGO_PERMISSAO_NEGADA"; then
        registrar ESPERADO "$descricao" "HTTP $codigo/$CODIGO_PERMISSAO_NEGADA: $(resumir "$corpo")"
        return 0
    fi

    if corpo_tem_codigo "$corpo" "$CODIGO_FORA_DO_CACHE" || [ "$codigo" = '404' ]; then
        if tabela_declarada "$tabela"; then
            registrar ESPERADO "$descricao" \
                "HTTP $codigo/$CODIGO_FORA_DO_CACHE — tabela declarada saiu do schema cache por perda total de privilégio"
        else
            registrar REPROVADO "$descricao" \
                "HTTP $codigo/$CODIGO_FORA_DO_CACHE e '$tabela' NÃO consta de $DIR_SCHEMAS/*.sql — a checagem não prova fechamento nenhum"
        fi
        return 0
    fi

    registrar INCONCLUSIVO "$descricao" \
        "HTTP $codigo sem $CODIGO_PERMISSAO_NEGADA — não provou permissão negada (rede/gateway/rate limit?): $(resumir "$corpo")"
}

echo 'Verificação da superfície anônima da Data API'
echo "Alvo: $SUPABASE_URL"
if [ ${#FILTRO[@]} -eq 0 ]; then
    echo 'Escopo: todas as tabelas operacionais'
else
    echo "Escopo: ${FILTRO[*]}"
fi
echo "Tabelas derivadas de $DIR_SCHEMAS/*.sql (${#TABELAS_DECLARADAS[@]}): ${TABELAS_DECLARADAS[*]}"
echo "ESPERADO exige $CODIGO_PERMISSAO_NEGADA no corpo, ou $CODIGO_FORA_DO_CACHE/404 em nome declarado."
echo

# --- Critério 1: perfis_empresas não é enumerável ---
checar_leitura perfis_empresas 'select=*'
checar_leitura perfis_empresas 'select=tenant_id,telefone_contato'

# --- Critério 2: escrita anônima é rejeitada ---
checar_escrita agendamentos "{\"tenant_id\":\"$TENANT_TESTE\",\"cliente_id\":\"00000000-0000-0000-0000-000000000000\",\"servico_id\":\"00000000-0000-0000-0000-000000000000\",\"data_hora\":\"2030-01-01T12:00:00Z\"}"
checar_escrita clientes "{\"tenant_id\":\"$TENANT_TESTE\",\"nome\":\"bot\",\"telefone\":\"11999999999\"}"

# --- Critério 3: agendamentos e excecoes_agenda sem colunas sensíveis ---
checar_leitura agendamentos 'select=cliente_id'
checar_leitura excecoes_agenda 'select=motivo'

# --- Critério 3b: as demais tabelas do fluxo também não vazam o org_id ---
for tabela in servicos horarios_funcionamento assinaturas whatsapp_configs disparos_whatsapp; do
    checar_leitura "$tabela" 'select=tenant_id&limit=1'
done

echo
if [ "$TOTAL" -eq 0 ]; then
    echo 'Nenhuma checagem correspondeu ao filtro informado.'
    echo "Tabelas declaradas em $DIR_SCHEMAS/*.sql: ${TABELAS_DECLARADAS[*]}"
    exit 2
fi

# --- Veredito COBERTURA: tabela declarada sem checagem é buraco no artefato ---
# Do outro lado do WR-08: uma tabela criada numa fase futura (Phase 7:
# perfis_cobranca; Phase 9: eventos_asaas) não pode nascer fora da bateria de
# prova sem que nada reclame.
if [ ${#FILTRO[@]} -eq 0 ]; then
    SEM_COBERTURA=0
    for tabela in "${TABELAS_DECLARADAS[@]}"; do
        if ! tabela_foi_checada "$tabela"; then
            SEM_COBERTURA=$((SEM_COBERTURA + 1))
            registrar REPROVADO "COBERTURA — $tabela" \
                "declarada em $DIR_SCHEMAS/*.sql e sem nenhuma checagem nesta bateria"
        fi
    done
    if [ "$SEM_COBERTURA" -eq 0 ]; then
        printf '  [COBERTURA]    %-55s %s\n' 'todas as tabelas declaradas' \
            "${#TABELAS_DECLARADAS[@]} declarada(s), ${#TABELAS_CHECADAS[@]} coberta(s) por pelo menos uma checagem"
    fi
    echo
else
    echo "COBERTURA pulada — execução com filtro (${FILTRO[*]}); escopo reduzido não reprova por cobertura."
    echo
fi

if [ "$INCONCLUSIVAS" -gt 0 ]; then
    echo "$INCONCLUSIVAS checagem(ns) INCONCLUSIVA(S) — não provam fechamento nenhum:"
    for item in "${LISTA_INCONCLUSIVAS[@]}"; do
        echo "  - $item"
    done
    echo
fi

if [ "$REPROVADAS" -eq 0 ]; then
    echo "Resumo: $TOTAL checagem(ns), $REPROVADAS reprovada(s) — a role anon não devolveu linha nenhuma."
    exit 0
fi

echo "Resumo: $TOTAL checagem(ns), $REPROVADAS REPROVADA(S) — a superfície segue aberta:"
for item in "${LISTA_REPROVADAS[@]}"; do
    echo "  - $item"
done
exit 1
