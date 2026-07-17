CREATE TABLE perfis_empresas (
    tenant_id text PRIMARY KEY, -- O org_id do Clerk
    slug text NOT NULL UNIQUE, -- O slug para o link público, ex: 'barbearia-do-ze'
    slug_gratuito text NOT NULL, -- Slug aleatório gerado na criação; é o slug efetivo quando o plano não tem link personalizado
    nome_estabelecimento text NOT NULL,
    descricao text,
    telefone_contato text,
    cor_marca text,  -- cor de destaque da página pública (recurso Plus+; ainda não consumido pelo booking)
    logo_url text,   -- URL do logo na página pública, sincronizado do logo da organização no Clerk (recurso Pro)
    exibir_logo boolean NOT NULL DEFAULT true, -- Preferência do tenant: exibir ou não o logo na página pública
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    timezone text NOT NULL DEFAULT 'America/Sao_Paulo', -- Fuso IANA do estabelecimento
    antecedencia_minima_minutos integer NOT NULL DEFAULT 15 CHECK (antecedencia_minima_minutos >= 0),
    horizonte_maximo_dias integer NOT NULL DEFAULT 14 CHECK (horizonte_maximo_dias BETWEEN 1 AND 365)
);

-- Habilitar RLS
ALTER TABLE perfis_empresas ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
-- 1. Leitura pública para quem vai realizar o agendamento
CREATE POLICY "Permitir SELECT público para todos" 
ON perfis_empresas FOR SELECT TO anon, authenticated
USING (true);

-- 2. Escrita protegida para o tenant autenticado
CREATE POLICY "Permitir INSERT para donos da org autenticados" 
ON perfis_empresas FOR INSERT TO authenticated
WITH CHECK (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

CREATE POLICY "Permitir UPDATE para donos da org autenticados" 
ON perfis_empresas FOR UPDATE TO authenticated
USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'))
WITH CHECK (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

CREATE POLICY "Permitir DELETE para donos da org autenticados" 
ON perfis_empresas FOR DELETE TO authenticated
USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

-- Comentários
COMMENT ON TABLE perfis_empresas IS 'Armazena as informações públicas de perfil de cada estabelecimento/tenant.';
COMMENT ON COLUMN perfis_empresas.tenant_id IS 'Identificador único da organização no Clerk (tenant).';
COMMENT ON COLUMN perfis_empresas.slug IS 'Slug único utilizado na URL pública de agendamento.';
COMMENT ON COLUMN perfis_empresas.nome_estabelecimento IS 'Nome fantasia exibido no cabeçalho do agendamento.';
COMMENT ON COLUMN perfis_empresas.cor_marca IS 'Cor de destaque da página pública de booking (recurso do plano Plus+). Ainda não aplicada na UI pública.';
COMMENT ON COLUMN perfis_empresas.logo_url IS 'URL do logo exibido na página pública de booking, sincronizado do logo da organização no Clerk (recurso do plano Pro). Ainda não aplicada na UI pública.';
COMMENT ON COLUMN perfis_empresas.slug_gratuito IS 'Slug aleatório gerado no provisionamento do perfil. É o slug efetivo quando o plano não inclui link personalizado; o slug customizado fica reservado em `slug` e volta a valer no re-upgrade.';
COMMENT ON COLUMN perfis_empresas.exibir_logo IS 'Preferência do tenant (plano Pro): exibir ou não o logo na página pública de booking.';
COMMENT ON COLUMN perfis_empresas.timezone IS 'Fuso horário IANA do estabelecimento (ex.: America/Sao_Paulo, America/Campo_Grande). Slots de disponibilidade são calculados e as mensagens de WhatsApp formatadas neste fuso; os timestamps continuam gravados em UTC. Validado na action com Intl.supportedValuesOf(timeZone) — sem CHECK no banco.';
COMMENT ON COLUMN perfis_empresas.antecedencia_minima_minutos IS 'Tempo mínimo, em minutos, entre o momento da reserva e o horário agendável no booking público (ex.: 15 = só permite agendar a partir de 15 min à frente). O fluxo de agendamento manual do dashboard ignora esta regra.';
COMMENT ON COLUMN perfis_empresas.horizonte_maximo_dias IS 'Até quantos dias no futuro o booking público aceita agendamento (ex.: 14 = duas semanas de antecedência máxima). O fluxo de agendamento manual do dashboard ignora esta regra.';
