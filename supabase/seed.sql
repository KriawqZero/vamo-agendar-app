-- =============================================================================
-- SEED DO BANCO **LOCAL** DE DESENVOLVIMENTO
-- =============================================================================
--
-- Este arquivo roda automaticamente em TODO `npx supabase db reset --local`, e
-- só nele. Não existe bloco `[db.seed]` em `supabase/config.toml`, então o CLI
-- usa o caminho default `./seed.sql` — criar o arquivo já o liga ao reset.
--
-- ⚠️ O banco em NUVEM nunca é semeado por aqui. `db reset --linked` recria o
-- remoto a partir das migrations; o seed do CLI é do fluxo local.
--
-- Por que ele existe: sem seed, o banco local nasce vazio e qualquer verificação
-- de tela do booking público (`/book/<slug>`) exige recadastrar perfil, serviços
-- e horários à mão a cada reset. Com ele, `/book/salao-do-seed` está de pé um
-- comando depois.
--
-- -----------------------------------------------------------------------------
-- DE ONDE SAI O `tenant_id` (decisão D-Q1) — leia antes de "simplificar"
-- -----------------------------------------------------------------------------
--
-- `perfis_empresas.tenant_id` é o `org_id` do Clerk (`org_...`). Ele vem de uma
-- organização real e não é gerável por SQL. Três caminhos foram considerados:
--
--   ❌ `UPDATE perfis_empresas SET tenant_id = 'org_real'` depois do seed.
--      NÃO EXISTE. `tenant_id` é a PK referenciada pelas FKs `fk_tenant` das
--      tabelas filhas com `ON DELETE CASCADE` e **sem** `ON UPDATE CASCADE` — o
--      UPDATE falha por violação de FK. Ou o id nasce certo, ou não nasce.
--
--   ❌ `psql -v` / `\set`. O seed é executado pelo CLI, não por um `psql` que o
--      owner controla; depender de meta-comando é depender de detalhe interno de
--      ferramenta.
--
--   ✅ GUC de role, com fallback literal (o que está implementado abaixo).
--      `current_setting('vamoagendar.org_id', true)` devolve NULL quando o GUC
--      não está ligado — degrada, nunca quebra.
--
-- Para o tenant do seed nascer com o `org_id` REAL (e assim aparecer também no
-- dashboard), rode UMA vez, contra o banco local:
--
--     ALTER ROLE postgres SET vamoagendar.org_id = 'org_...';
--
-- O ajuste mora em `pg_db_role_setting` com `datid = 0` (escopo de cluster) e por
-- isso **sobrevive ao drop/create de database que o `db reset` faz** — configura
-- uma vez, vale para todos os resets seguintes.
--
-- Por que o literal deste arquivo é sintético (`org_seed_local`) e nunca um
-- `org_...` real: `seed.sql` é versionado. O `org_id` do owner não é segredo, mas
-- é identificador de conta e não tem por que morar no repositório.
--
-- -----------------------------------------------------------------------------
-- ⚠️ O DELETE DE ABERTURA (decisão D-Q4)
-- -----------------------------------------------------------------------------
--
-- O seed é idempotente por escopo de tenant: começa apagando `perfis_empresas`
-- do `tenant_id` alvo (o CASCADE leva serviços, horários e agendamentos junto) e
-- insere de novo. Serve tanto ao `db reset --local` (banco limpo, o DELETE não
-- acha nada) quanto a um `psql -f supabase/seed.sql` avulso.
--
-- Consequência a ter em mente: **se o GUC apontar para a organização REAL, um
-- `psql -f` avulso apaga os dados LOCAIS daquele tenant.** É banco local, é o
-- comportamento pretendido, e por isso está escrito aqui em vez de descoberto
-- depois.
-- =============================================================================

DO $$
DECLARE
    -- D-Q1: GUC quando ligado, literal sintético quando não. O terceiro
    -- argumento `true` de current_setting é o que faz a ausência devolver NULL
    -- em vez de lançar erro.
    v_tenant_id text := coalesce(
        nullif(current_setting('vamoagendar.org_id', true), ''),
        'org_seed_local'
    );
    v_usou_guc boolean := nullif(current_setting('vamoagendar.org_id', true), '') IS NOT NULL;
    v_servicos integer;
    v_janelas integer;
BEGIN
    -- D-Q4: idempotência por escopo de tenant. CASCADE leva os filhos.
    DELETE FROM perfis_empresas WHERE tenant_id = v_tenant_id;

    -- D-Q2: `slug` e `slug_gratuito` propositalmente IGUAIS.
    --
    -- Sem linha em `assinaturas` o plano vigente é `gratuito`, e nesse plano
    -- `obterSlugEfetivo` (src/lib/planos.ts) devolve `slug_gratuito`. Se as duas
    -- colunas divergissem, `/book/salao-do-seed` daria 404 e o link útil seria um
    -- slug aleatório que ninguém decora. As duas UNIQUE são índices distintos, e
    -- o mesmo texto nas duas colunas da MESMA linha não colide.
    --
    -- Bônus: reproduz o estado do profissional recém-provisionado, que é o
    -- caminho que mais gente vai percorrer.
    INSERT INTO perfis_empresas (
        tenant_id,
        slug,
        slug_gratuito,
        nome_estabelecimento,
        descricao,
        timezone,
        antecedencia_minima_minutos,
        horizonte_maximo_dias
    ) VALUES (
        v_tenant_id,
        'salao-do-seed',
        'salao-do-seed',
        'Salão do Seed (ambiente local)',
        'Estabelecimento fictício criado pelo seed do banco local. Serve para abrir o booking público sem cadastrar nada à mão.',
        -- Explícito de propósito, mesmo coincidindo com o DEFAULT da coluna: o
        -- arquivo tem de ser auto-explicativo para quem lê o fuso na grade.
        'America/Sao_Paulo',
        15,
        14
    );

    -- Sem cor_marca, logo_url nem capa_url: são exclusivos do Pro, o seed é
    -- gratuito, e `obterDadosBookingPublico` sanitiza esses campos pelo plano
    -- vigente — a página pública os ignoraria de qualquer jeito.

    -- D-Q3: DOIS serviços ativos, com durações DIFERENTES.
    --
    -- As durações diferentes não são enfeite: `gerarSlotsAntiBuraco`
    -- (src/lib/booking-engine.ts) usa a MENOR duração ativa do tenant para
    -- decidir se uma sobra de agenda é invendável. Com um serviço só,
    -- `gapAntes >= menorDuração` vira trivialmente a própria duração e a regra
    -- nunca é exercitada de verdade.
    --
    -- Dois é também o teto de serviços ativos do plano gratuito
    -- (`limiteServicosAtivos: 2` em src/lib/planos.ts) — o seed encosta no teto
    -- de propósito, porque é o estado real de quem entra pelo plano de entrada.
    INSERT INTO servicos (tenant_id, nome, descricao, preco, duracao_minutos, ativo) VALUES
        (v_tenant_id, 'Design de sobrancelha', 'Modelagem com pinça e correção de formato.', 60.00, 30, true),
        (v_tenant_id, 'Design com henna', 'Modelagem completa com aplicação de henna.', 95.00, 60, true);

    -- N janelas por dia é o que a tabela suporta e o que o seed precisa
    -- exercitar (a engine calcula intervalos livres janela a janela).
    -- dia_semana: 0 = domingo, 1 = segunda, ..., 6 = sábado.
    -- Segunda a sexta com DUAS janelas (almoço fechado), sábado com UMA,
    -- domingo sem linha nenhuma = fechado.
    INSERT INTO horarios_funcionamento (tenant_id, dia_semana, hora_inicio, hora_fim, ativo)
    SELECT v_tenant_id, dia, '09:00'::time, '12:00'::time, true FROM generate_series(1, 5) AS dia;

    INSERT INTO horarios_funcionamento (tenant_id, dia_semana, hora_inicio, hora_fim, ativo)
    SELECT v_tenant_id, dia, '13:00'::time, '18:00'::time, true FROM generate_series(1, 5) AS dia;

    INSERT INTO horarios_funcionamento (tenant_id, dia_semana, hora_inicio, hora_fim, ativo)
    VALUES (v_tenant_id, 6, '09:00'::time, '13:00'::time, true);

    -- D-Q5: sem `agendamentos` e sem `clientes` de propósito. Data fixa apodrece
    -- (vira passado e some da grade) e data relativa faria o seed produzir estado
    -- diferente a cada execução, colidindo com o que o owner acabou de testar à
    -- mão. Grade vazia é o estado que as verificações de tela precisam.

    SELECT count(*) INTO v_servicos FROM servicos WHERE tenant_id = v_tenant_id AND ativo;
    SELECT count(*) INTO v_janelas FROM horarios_funcionamento WHERE tenant_id = v_tenant_id AND ativo;

    RAISE NOTICE '';
    RAISE NOTICE '=== seed do banco local ===';
    RAISE NOTICE 'Booking público: /book/salao-do-seed';
    RAISE NOTICE 'Criados: % serviço(s) ativo(s) e % janela(s) de funcionamento.', v_servicos, v_janelas;

    IF v_usou_guc THEN
        RAISE NOTICE 'tenant_id veio do GUC vamoagendar.org_id — o dashboard enxerga este tenant.';
    ELSE
        -- O aviso é parte da decisão D-Q1, não enfeite: com tenant_id sintético o
        -- DASHBOARD não enxerga o tenant do seed (o RLS compara com o claim
        -- `org_id` do JWT do Clerk) e sem este texto o owner perde tempo achando
        -- que o seed quebrou.
        RAISE NOTICE 'tenant_id = org_seed_local (literal sintético — nenhum GUC ligado).';
        RAISE NOTICE '  ⚠️  O DASHBOARD NÃO vai enxergar este tenant: o RLS compara tenant_id';
        RAISE NOTICE '      com o claim org_id do JWT do Clerk, e este id não é de nenhuma org.';
        RAISE NOTICE '      O BOOKING PÚBLICO funciona assim mesmo (a leitura pública roda com';
        RAISE NOTICE '      cliente privilegiado, resolvendo o tenant pelo slug — sem Clerk).';
        RAISE NOTICE '      Para o dashboard também enxergar, rode UMA vez no banco local:';
        RAISE NOTICE '        ALTER ROLE postgres SET vamoagendar.org_id = ''<seu org_...>'';';
        RAISE NOTICE '      e depois npx supabase db reset --local (o ajuste sobrevive ao reset).';
    END IF;
    RAISE NOTICE '';
END $$;
