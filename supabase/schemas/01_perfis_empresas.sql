CREATE TABLE perfis_empresas (
    tenant_id text PRIMARY KEY, -- O org_id do Clerk
    slug text NOT NULL UNIQUE, -- O slug para o link público, ex: 'barbearia-do-ze'
    slug_gratuito text NOT NULL UNIQUE, -- Slug aleatório gerado na criação; é o slug efetivo quando o plano não tem link personalizado
    nome_estabelecimento text NOT NULL,
    descricao text,
    telefone_contato text,
    cor_marca text CHECK (cor_marca ~* '^#[0-9a-f]{6}$'),  -- cor de destaque da página pública (recurso Pro)
    logo_url text,   -- URL pública do logo no bucket imagens-perfis (recurso Pro; upload próprio)
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    timezone text NOT NULL DEFAULT 'America/Sao_Paulo', -- Fuso IANA do estabelecimento
    antecedencia_minima_minutos integer NOT NULL DEFAULT 15 CHECK (antecedencia_minima_minutos >= 0),
    horizonte_maximo_dias integer NOT NULL DEFAULT 14 CHECK (horizonte_maximo_dias BETWEEN 1 AND 365),
    capa_url text,   -- URL pública da imagem de capa no bucket imagens-perfis (recurso Pro; upload próprio)
    instagram text CHECK (instagram ~ '^[a-z0-9._]{1,30}$'), -- handle sem @, normalizado na action (todos os planos)
    endereco text CHECK (char_length(endereco) <= 200) -- endereço em texto livre exibido no booking (todos os planos)
);

-- Habilitar RLS
ALTER TABLE perfis_empresas ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
-- 1. Leitura restrita ao próprio tenant. A página pública lê o perfil pelo
--    servidor com cliente privilegiado (createAdminClient), resolvendo o
--    tenant a partir do slug — a role anônima não tem (e não deve ter) como
--    enumerar os profissionais da plataforma.
--    Também segura o RETURNING: upsert(...).select() das actions de perfil
--    exige que a linha passe no SELECT.
CREATE POLICY "Permitir SELECT do próprio tenant para autenticados"
ON perfis_empresas FOR SELECT TO authenticated
USING (tenant_id = (SELECT auth.jwt() ->> 'org_id'));

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
COMMENT ON POLICY "Permitir SELECT do próprio tenant para autenticados" ON perfis_empresas IS
'O perfil é a identidade pública do estabelecimento, mas a LISTA de estabelecimentos não é pública: com SELECT liberado para a role anônima, qualquer um com a chave publicável raspava nome, telefone_contato e o org_id do Clerk de todos os profissionais da plataforma. A página pública lê o perfil pelo servidor com cliente privilegiado, resolvendo o tenant a partir do slug.';

COMMENT ON TABLE perfis_empresas IS 'Armazena as informações públicas de perfil de cada estabelecimento/tenant.';
COMMENT ON COLUMN perfis_empresas.tenant_id IS 'Identificador único da organização no Clerk (tenant).';
COMMENT ON COLUMN perfis_empresas.slug IS 'Slug único utilizado na URL pública de agendamento.';
COMMENT ON COLUMN perfis_empresas.nome_estabelecimento IS 'Nome fantasia exibido no cabeçalho do agendamento.';
COMMENT ON COLUMN perfis_empresas.cor_marca IS 'Cor de destaque (#rrggbb) aplicada como acento na página pública de booking (recurso do plano Pro). A página pública ignora o valor quando o plano vigente não inclui o recurso.';
COMMENT ON COLUMN perfis_empresas.logo_url IS 'URL pública do logo no bucket imagens-perfis (upload próprio do tenant no dashboard; recurso do plano Pro). A página pública ignora o valor quando o plano vigente não inclui o recurso.';
COMMENT ON COLUMN perfis_empresas.slug_gratuito IS 'Slug aleatório gerado no provisionamento do perfil. É o slug efetivo quando o plano não inclui link personalizado; o slug customizado fica reservado em `slug` e volta a valer no re-upgrade. ÚNICO (perfis_empresas_slug_gratuito_key): compartilha com `slug` um só namespace público.';

COMMENT ON CONSTRAINT perfis_empresas_slug_gratuito_key ON perfis_empresas IS
'`slug` e `slug_gratuito` não são duas colunas independentes: são dois membros de UM namespace público — o identificador do tenant na URL /book/<slug>. Sem esta constraint, dois tenants podiam carregar o mesmo `slug_gratuito` e os DOIS links viravam 404 (o maybeSingle do fallback erra com múltiplas linhas). Ela é a camada de baixo de três: a colisão `slug` de um tenant contra `slug_gratuito` de OUTRO é entre linhas e não cabe em constraint — fica em salvarPerfilEmpresa (recusa na escrita) e em resolverPerfilPublicoPorSlug (recusa de ambiguidade na leitura). O furo que as três fecham: o tenant A reivindicava o link de provisionamento do tenant B e passava a receber os agendamentos de B, com nome e telefone dos clientes finais dele.';
COMMENT ON COLUMN perfis_empresas.capa_url IS 'URL pública da imagem de capa no bucket imagens-perfis (upload próprio do tenant no dashboard; recurso do plano Pro). A página pública ignora o valor quando o plano vigente não inclui o recurso.';
COMMENT ON COLUMN perfis_empresas.instagram IS 'Handle do Instagram do estabelecimento, sem @ e em minúsculas (normalizado na action). Exibido como link na página pública; disponível em todos os planos.';
COMMENT ON COLUMN perfis_empresas.endereco IS 'Endereço em texto livre exibido na página pública (vira link de busca no Google Maps). Disponível em todos os planos.';
COMMENT ON COLUMN perfis_empresas.timezone IS 'Fuso horário IANA do estabelecimento (ex.: America/Sao_Paulo, America/Campo_Grande). Slots de disponibilidade são calculados e as mensagens de WhatsApp formatadas neste fuso; os timestamps continuam gravados em UTC. Validado na action com Intl.supportedValuesOf(timeZone) — sem CHECK no banco.';
COMMENT ON COLUMN perfis_empresas.antecedencia_minima_minutos IS 'Tempo mínimo, em minutos, entre o momento da reserva e o horário agendável no booking público (ex.: 15 = só permite agendar a partir de 15 min à frente). O fluxo de agendamento manual do dashboard ignora esta regra.';
COMMENT ON COLUMN perfis_empresas.horizonte_maximo_dias IS 'Até quantos dias no futuro o booking público aceita agendamento (ex.: 14 = duas semanas de antecedência máxima). O fluxo de agendamento manual do dashboard ignora esta regra.';
