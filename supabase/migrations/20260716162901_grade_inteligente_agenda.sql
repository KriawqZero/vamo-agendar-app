-- Gerada via `supabase db diff -f grade_inteligente_agenda` e editada
-- manualmente:
--
-- 1. REMOVIDO o bloco de REVOKE/GRANT espúrio emitido pelo migra: o diff
--    bruto revogava SELECT/INSERT/UPDATE/DELETE de anon/authenticated/
--    service_role e concedia apenas REFERENCES/TRIGGER/TRUNCATE de volta a
--    anon/authenticated, nas 9 tabelas do schema public — inclusive tabelas
--    não tocadas por esta migration (agendamentos, assinaturas, clientes,
--    disparos_whatsapp, excecoes_agenda, servicos, whatsapp_configs).
--    Isso é o caveat documentado em docs/SUPABASE_DECLARATIVE-DATABASE-SCHEMA.md
--    ("grant statements are duplicated from default privileges"): os schemas
--    declarativos não carregam GRANTs, então o diff entre o shadow db
--    (reconstruído via replay das migrations) e o db declarativo (schemas
--    puros) enxerga uma divergência de privilégios que não existe de fato.
--    Aplicar esse bloco reverteria a normalização feita em
--    20260709161817_restaura_privilegios_dml_roles_api.sql e quebraria o
--    acesso via PostgREST no projeto inteiro. Nenhuma tabela de privilégio
--    aqui faz parte do escopo desta migration.
--
-- 2. ADICIONADO o REVOKE/GRANT da função nova substituir_horarios_funcionamento,
--    que o diff omitiu por completo (funções também não têm GRANT rastreado
--    pelo migra).
--
-- 3. ADICIONADOS os COMMENTs (colunas, tabela, função), que o diff não
--    rastreia.
--
-- Todo o DDL estrutural abaixo (colunas, constraints, índice, corpo da
-- função) veio integralmente do diff, sem edição.

alter table "public"."horarios_funcionamento" drop constraint "uq_tenant_dia_semana";

drop index if exists "public"."uq_tenant_dia_semana";

alter table "public"."perfis_empresas" add column "antecedencia_minima_minutos" integer not null default 15;

alter table "public"."perfis_empresas" add column "horizonte_maximo_dias" integer not null default 14;

CREATE INDEX idx_horarios_funcionamento_tenant_dia ON public.horarios_funcionamento USING btree (tenant_id, dia_semana);

alter table "public"."horarios_funcionamento" add constraint "ck_hora_fim_apos_inicio" CHECK ((hora_fim > hora_inicio)) not valid;

alter table "public"."horarios_funcionamento" validate constraint "ck_hora_fim_apos_inicio";

alter table "public"."perfis_empresas" add constraint "perfis_empresas_antecedencia_minima_minutos_check" CHECK ((antecedencia_minima_minutos >= 0)) not valid;

alter table "public"."perfis_empresas" validate constraint "perfis_empresas_antecedencia_minima_minutos_check";

alter table "public"."perfis_empresas" add constraint "perfis_empresas_horizonte_maximo_dias_check" CHECK (((horizonte_maximo_dias >= 1) AND (horizonte_maximo_dias <= 365))) not valid;

alter table "public"."perfis_empresas" validate constraint "perfis_empresas_horizonte_maximo_dias_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.substituir_horarios_funcionamento(p_horarios jsonb)
 RETURNS SETOF public.horarios_funcionamento
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_tenant_id text := (SELECT auth.jwt() ->> 'org_id');
BEGIN
  DELETE FROM public.horarios_funcionamento WHERE tenant_id = v_tenant_id;

  RETURN QUERY
  INSERT INTO public.horarios_funcionamento (tenant_id, dia_semana, hora_inicio, hora_fim, ativo)
  SELECT
    v_tenant_id,
    (item ->> 'dia_semana')::integer,
    (item ->> 'hora_inicio')::time,
    (item ->> 'hora_fim')::time,
    (item ->> 'ativo')::boolean
  FROM jsonb_array_elements(p_horarios) AS item
  RETURNING *;
END;
$function$
;

-- Permissões da função (ausentes do diff — não rastreadas pelo migra)
REVOKE ALL ON FUNCTION public.substituir_horarios_funcionamento(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.substituir_horarios_funcionamento(jsonb) TO authenticated;

-- Comentários (não rastreados pelo diff — mantidos em sincronia com
-- supabase/schemas/01_perfis_empresas.sql e 03_horarios_funcionamento.sql)
COMMENT ON COLUMN perfis_empresas.antecedencia_minima_minutos IS 'Tempo mínimo, em minutos, entre o momento da reserva e o horário agendável no booking público (ex.: 15 = só permite agendar a partir de 15 min à frente). O fluxo de agendamento manual do dashboard ignora esta regra.';
COMMENT ON COLUMN perfis_empresas.horizonte_maximo_dias IS 'Até quantos dias no futuro o booking público aceita agendamento (ex.: 14 = duas semanas de antecedência máxima). O fluxo de agendamento manual do dashboard ignora esta regra.';

COMMENT ON TABLE horarios_funcionamento IS 'Define os horários comerciais de funcionamento de cada tenant. Um tenant pode ter N janelas por dia da semana (ex.: 08–12h e 14–18h). A não-sobreposição de janelas do mesmo dia é validada na Server Action, não no banco — um EXCLUDE via GiST com range de time exigiria expressão rebuscada e a extensão btree_gist, e a única via de escrita é a action autenticada do próprio tenant.';

COMMENT ON FUNCTION public.substituir_horarios_funcionamento(jsonb) IS 'Substitui atomicamente todos os horários de funcionamento do tenant autenticado (delete + insert numa única transação), evitando perda de dados se o insert falhar após o delete. SECURITY INVOKER: respeita o RLS do chamador; tenant_id é sempre derivado do JWT (auth.jwt() ->> org_id), nunca aceito do payload.';
