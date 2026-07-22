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
# Critério de reprovação (nota A2 do 01-RESEARCH.md): o PostgREST responde 404
# com PGRST205 quando a role perde todo privilégio (tabela some do schema cache)
# e 403/42501 quando há privilégio mas falta a coluna. Qual dos dois aparece
# depende de estado de cache — por isso a asserção é "não é 200 com linhas",
# nunca um código HTTP fixo.
#
# Três vereditos, não dois:
#   ESPERADO     o portão respondeu — erro de permissão / tabela fora do cache
#   REPROVADO    a role anon leu linhas, ou a escrita foi aceita
#   INCONCLUSIVO a requisição não provou nada: `200 []` (a role TEM acesso, a
#                tabela é que está vazia) ou POST barrado pela FK (23503, porque
#                o tenant_id de teste não existe). Não derruba o exit code, mas
#                não serve como prova de fechamento — o relatório diz isso em voz
#                alta justamente para ninguém declarar SEG-01 fechado com base
#                num acaso do estado do banco.
#
# Para tornar o POST conclusivo, informe um tenant_id que exista:
#   TENANT_TESTE=org_xxxxx bash scripts/verificar-superficie-anon.sh clientes
#
# Sai com 0 quando nenhuma checagem REPROVOU; 1 quando alguma reprovou.

set -uo pipefail

ARQUIVO_ENV='.env.local'

if [ ! -f "$ARQUIVO_ENV" ]; then
    echo "ERRO: $ARQUIVO_ENV não encontrado. Rode a partir da raiz do projeto." >&2
    exit 2
fi

SUPABASE_URL=$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' "$ARQUIVO_ENV" | head -n1 | cut -d= -f2-)
ANON_KEY=$(grep -E '^NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=' "$ARQUIVO_ENV" | head -n1 | cut -d= -f2-)

SUPABASE_URL=${SUPABASE_URL%\"}
SUPABASE_URL=${SUPABASE_URL#\"}
ANON_KEY=${ANON_KEY%\"}
ANON_KEY=${ANON_KEY#\"}
SUPABASE_URL=${SUPABASE_URL%/}

if [ -z "$SUPABASE_URL" ] || [ -z "$ANON_KEY" ]; then
    echo "ERRO: NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ausentes em $ARQUIVO_ENV." >&2
    exit 2
fi

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

# Recorte curto do corpo para caber no relatório.
resumir() {
    printf '%s' "$1" | tr -d '\n\r' | cut -c1-90
}

checar_leitura() {
    local tabela="$1" query="$2"
    deve_rodar "$tabela" || return 0

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
    else
        registrar ESPERADO "$descricao" "HTTP $codigo: $(resumir "$corpo")"
    fi
}

checar_escrita() {
    local tabela="$1" payload="$2"
    deve_rodar "$tabela" || return 0

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
    case "$corpo" in
    *23503*)
        registrar INCONCLUSIVO "$descricao" \
            "HTTP $codigo por violação de FK (tenant inexistente), não por permissão — reexecute com TENANT_TESTE=<org_id real>"
        return 0
        ;;
    esac

    registrar ESPERADO "$descricao" "HTTP $codigo: $(resumir "$corpo")"
}

echo 'Verificação da superfície anônima da Data API'
echo "Alvo: $SUPABASE_URL"
if [ ${#FILTRO[@]} -eq 0 ]; then
    echo 'Escopo: todas as tabelas operacionais'
else
    echo "Escopo: ${FILTRO[*]}"
fi
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
    echo 'Tabelas conhecidas: perfis_empresas, agendamentos, clientes, excecoes_agenda,'
    echo '                    servicos, horarios_funcionamento, assinaturas,'
    echo '                    whatsapp_configs, disparos_whatsapp'
    exit 2
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
