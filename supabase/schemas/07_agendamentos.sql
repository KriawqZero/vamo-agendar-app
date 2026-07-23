CREATE TABLE agendamentos (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id text NOT NULL,
    cliente_id uuid NOT NULL,
    servico_id uuid NOT NULL,
    data_hora timestamp with time zone NOT NULL,
    data_hora_fim timestamp with time zone NOT NULL,
    -- Período reservado, derivado por CONSTRUÇÃO de [data_hora, data_hora_fim).
    -- Coluna GENERATED (não escrita pela app, não trigger) — decidido por sonda
    -- empírica DDL neste banco (PostgreSQL 17.6): o construtor tstzrange é imutável,
    -- então a coluna gerada é aceita. Nunca pode divergir do intervalo real; é o
    -- que a exclusion constraint compara.
    periodo tstzrange GENERATED ALWAYS AS (tstzrange(data_hora, data_hora_fim, '[)')) STORED,
    status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'confirmado', 'concluido', 'cancelado')),
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES perfis_empresas(tenant_id) ON DELETE CASCADE,
    CONSTRAINT fk_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
    CONSTRAINT fk_servico FOREIGN KEY (servico_id) REFERENCES servicos(id) ON DELETE RESTRICT,
    -- Término sempre depois do início — garante que tstzrange nunca receba limites
    -- invertidos (que lançariam "range lower bound must be less than or equal to
    -- range upper bound"). Análogo ao ck_hora_fim_apos_inicio de horarios_funcionamento.
    CONSTRAINT ck_agendamento_fim_apos_inicio CHECK (data_hora_fim > data_hora),
    -- Impede double-booking de forma ATÔMICA: fecha a janela TOCTOU entre validar
    -- o slot na engine e inserir. tenant_id WITH = é obrigatório (a checagem de
    -- integridade bypassa RLS por design; sem ele um visitante mapearia a agenda de
    -- qualquer tenant). WHERE status <> 'cancelado' é obrigatório (senão um horário
    -- cancelado bloquearia o slot para sempre). Exige a extension btree_gist (para o
    -- operador = de text conviver com && de range no mesmo índice GiST).
    CONSTRAINT ag_sem_sobreposicao EXCLUDE USING gist (tenant_id WITH =, periodo WITH &&) WHERE (status <> 'cancelado')
);

-- Habilitar RLS
ALTER TABLE agendamentos ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
-- 1. Leitura restrita ao profissional dono da agenda. A página pública lê a
--    ocupação pelo servidor com cliente privilegiado — a role anônima não
--    precisa (e não deve) enxergar agendamento nenhum: cliente_id e servico_id
--    permitem pivotar a agenda de qualquer tenant.
CREATE POLICY "Permitir SELECT do próprio tenant para autenticados"
ON agendamentos FOR SELECT TO authenticated
USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

-- 2. Criação restrita ao profissional (agendamento manual do dashboard).
--    O booking público (B2C) escreve pela Server Action com createAdminClient()
--    após validar tenant, serviço e slot — nunca pela Data API.
CREATE POLICY "Permitir INSERT para membros da org autenticados"
ON agendamentos FOR INSERT TO authenticated
WITH CHECK (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

-- 3. Edição e cancelamento restritos ao profissional (B2B)
CREATE POLICY "Permitir UPDATE para membros da org autenticados" 
ON agendamentos FOR UPDATE TO authenticated
USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'))
WITH CHECK (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

CREATE POLICY "Permitir DELETE para membros da org autenticados" 
ON agendamentos FOR DELETE TO authenticated
USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

-- Comentários
COMMENT ON POLICY "Permitir SELECT do próprio tenant para autenticados" ON agendamentos IS
'A agenda é dado operacional do tenant. O fluxo público de booking obtém ocupação pelo servidor, não pela role anônima.';
COMMENT ON POLICY "Permitir INSERT para membros da org autenticados" ON agendamentos IS
'Agendamento manual do dashboard. A criação pelo cliente final passa pela Server Action pública, que valida slot contra double-booking e escreve com privilégio de serviço.';

COMMENT ON TABLE agendamentos IS 'Registra os agendamentos realizados pelos clientes finais.';
COMMENT ON COLUMN agendamentos.tenant_id IS 'Identificador do tenant dono deste agendamento.';
COMMENT ON COLUMN agendamentos.status IS 'Status da reserva (pendente, confirmado, concluido, cancelado).';
COMMENT ON COLUMN agendamentos.data_hora IS 'Data e hora em que o atendimento está marcado.';
COMMENT ON COLUMN agendamentos.data_hora_fim IS 'Término congelado no ato da reserva (data_hora + duração do serviço no momento). Imune a edições posteriores da duração do serviço — a engine de disponibilidade lê a ocupação daqui, não do join com servicos (AGE-01/AGE-02, D-02).';
COMMENT ON COLUMN agendamentos.periodo IS 'Intervalo [data_hora, data_hora_fim) derivado por coluna GENERATED — integridade por construção, nunca escrito pela aplicação. É o que a exclusion constraint ag_sem_sobreposicao compara para impedir double-booking.';

COMMENT ON CONSTRAINT ck_agendamento_fim_apos_inicio ON agendamentos IS
'Garante data_hora_fim > data_hora, impedindo que o construtor tstzrange da coluna periodo receba limites invertidos. Análogo ao ck_hora_fim_apos_inicio de horarios_funcionamento.';

COMMENT ON CONSTRAINT ag_sem_sobreposicao ON agendamentos IS
'Impede que duas requisições simultâneas resultem em dois agendamentos ativos sobrepostos no mesmo tenant (AGE-03). Fecha a janela TOCTOU que a validação da engine deixa aberta — a 1ª linha é a engine, a 2ª (definitiva) é esta constraint. tenant_id WITH = isola por tenant (a checagem bypassa RLS por design); WHERE status <> cancelado libera o slot de um horário cancelado. A perda de corrida devolve o SQLSTATE 23P01, discriminado nas actions para slot_indisponivel (público) e slot_ocupado (walk-in), nunca a mensagem crua do Postgres.';
