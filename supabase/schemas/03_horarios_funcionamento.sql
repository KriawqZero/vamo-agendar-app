CREATE TABLE horarios_funcionamento (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id text NOT NULL,
    dia_semana integer NOT NULL CHECK (dia_semana BETWEEN 0 AND 6), -- 0 = Domingo, 1 = Segunda, ..., 6 = Sábado
    hora_inicio time without time zone NOT NULL DEFAULT '08:00:00',
    hora_fim time without time zone NOT NULL DEFAULT '18:00:00',
    ativo boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES perfis_empresas(tenant_id) ON DELETE CASCADE,
    CONSTRAINT ck_hora_fim_apos_inicio CHECK (hora_fim > hora_inicio)
);

CREATE INDEX idx_horarios_funcionamento_tenant_dia ON horarios_funcionamento (tenant_id, dia_semana);

-- Habilitar RLS
ALTER TABLE horarios_funcionamento ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
-- 1. Leitura pública para quem vai realizar o agendamento
CREATE POLICY "Permitir SELECT público para todos"
ON horarios_funcionamento FOR SELECT TO anon, authenticated
USING (ativo = true);

-- 1b. O dono precisa enxergar também as linhas inativas (dias desativados),
-- tanto para listá-las no dashboard quanto porque INSERT/UPDATE ... RETURNING
-- (usado pelo .select() do supabase-js) exige que a linha passe no SELECT.
CREATE POLICY "Permitir SELECT do próprio tenant para autenticados"
ON horarios_funcionamento FOR SELECT TO authenticated
USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

-- 2. Escrita protegida para o tenant dono do horário
CREATE POLICY "Permitir INSERT para donos da org autenticados" 
ON horarios_funcionamento FOR INSERT TO authenticated
WITH CHECK (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

CREATE POLICY "Permitir UPDATE para donos da org autenticados" 
ON horarios_funcionamento FOR UPDATE TO authenticated
USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'))
WITH CHECK (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

CREATE POLICY "Permitir DELETE para donos da org autenticados" 
ON horarios_funcionamento FOR DELETE TO authenticated
USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

-- Comentários
COMMENT ON TABLE horarios_funcionamento IS 'Define os horários comerciais de funcionamento de cada tenant. Um tenant pode ter N janelas por dia da semana (ex.: 08–12h e 14–18h). A não-sobreposição de janelas do mesmo dia é validada na Server Action, não no banco — um EXCLUDE via GiST com range de time exigiria expressão rebuscada e a extensão btree_gist, e a única via de escrita é a action autenticada do próprio tenant.';
COMMENT ON COLUMN horarios_funcionamento.dia_semana IS 'Dia da semana codificado (0=Domingo, 1=Segunda, ..., 6=Sábado).';
COMMENT ON COLUMN horarios_funcionamento.hora_inicio IS 'Horário de abertura de atendimento.';
COMMENT ON COLUMN horarios_funcionamento.hora_fim IS 'Horário de encerramento de atendimento.';

-- Salva a semana inteira de horários de funcionamento numa transação atômica.
-- Sem a UNIQUE (tenant_id, dia_semana), o upsert onConflict do supabase-js
-- deixou de funcionar; e um DELETE seguido de INSERT como duas chamadas
-- separadas da action poderia perder os horários do tenant se o INSERT
-- falhasse depois do DELETE já ter sido confirmado. Esta função faz os dois
-- passos como uma única transação. Vive neste arquivo (e não em
-- 00_funcoes_sistema.sql) porque os schemas são aplicados em ordem
-- lexicográfica e a função referencia o tipo da tabela horarios_funcionamento,
-- que só existe a partir deste arquivo.
CREATE OR REPLACE FUNCTION public.substituir_horarios_funcionamento(p_horarios jsonb)
RETURNS SETOF public.horarios_funcionamento
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
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
$function$;

REVOKE ALL ON FUNCTION public.substituir_horarios_funcionamento(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.substituir_horarios_funcionamento(jsonb) TO authenticated;

COMMENT ON FUNCTION public.substituir_horarios_funcionamento(jsonb) IS 'Substitui atomicamente todos os horários de funcionamento do tenant autenticado (delete + insert numa única transação), evitando perda de dados se o insert falhar após o delete. SECURITY INVOKER: respeita o RLS do chamador; tenant_id é sempre derivado do JWT (auth.jwt() ->> org_id), nunca aceito do payload.';
