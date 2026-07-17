-- P0.12(b): personalização do booking público.
-- Migration gerada por `supabase db diff` e LIMPA manualmente: o migra emitiu
-- REVOKE/GRANT de privilégios default de todas as tabelas (caveat documentado em
-- docs/SUPABASE_DECLARATIVE-DATABASE-SCHEMA.md — aplicá-los quebraria o banco e a
-- camada de GRANTs por coluna de `assinaturas`). Comments adicionados à mão
-- (o diff não rastreia COMMENT ON).

-- Com upload próprio de logo, subir/remover o arquivo já expressa a intenção do
-- tenant; a preferência separada perdeu a função.
alter table "public"."perfis_empresas" drop column "exibir_logo";

-- logo_url muda de proveniência: antes era sincronizado do Clerk (img.clerk.com),
-- agora é upload próprio no bucket imagens-perfis. URLs legadas do Clerk quebrariam
-- o next/image da página pública (host fora de images.remotePatterns) — zera tudo
-- que não seja do bucket novo; o tenant Pro sobe o logo de novo no dashboard.
update "public"."perfis_empresas"
set logo_url = null
where logo_url is not null
  and logo_url not like '%/storage/v1/object/public/imagens-perfis/%';

alter table "public"."perfis_empresas" add column "capa_url" text;

alter table "public"."perfis_empresas" add column "endereco" text;

alter table "public"."perfis_empresas" add column "instagram" text;

alter table "public"."perfis_empresas" add constraint "perfis_empresas_cor_marca_check" CHECK ((cor_marca ~* '^#[0-9a-f]{6}$'::text)) not valid;

alter table "public"."perfis_empresas" validate constraint "perfis_empresas_cor_marca_check";

alter table "public"."perfis_empresas" add constraint "perfis_empresas_endereco_check" CHECK ((char_length(endereco) <= 200)) not valid;

alter table "public"."perfis_empresas" validate constraint "perfis_empresas_endereco_check";

alter table "public"."perfis_empresas" add constraint "perfis_empresas_instagram_check" CHECK ((instagram ~ '^[a-z0-9._]{1,30}$'::text)) not valid;

alter table "public"."perfis_empresas" validate constraint "perfis_empresas_instagram_check";

comment on column "public"."perfis_empresas"."cor_marca" is 'Cor de destaque (#rrggbb) aplicada como acento na página pública de booking (recurso do plano Pro). A página pública ignora o valor quando o plano vigente não inclui o recurso.';

comment on column "public"."perfis_empresas"."logo_url" is 'URL pública do logo no bucket imagens-perfis (upload próprio do tenant no dashboard; recurso do plano Pro). A página pública ignora o valor quando o plano vigente não inclui o recurso.';

comment on column "public"."perfis_empresas"."capa_url" is 'URL pública da imagem de capa no bucket imagens-perfis (upload próprio do tenant no dashboard; recurso do plano Pro). A página pública ignora o valor quando o plano vigente não inclui o recurso.';

comment on column "public"."perfis_empresas"."instagram" is 'Handle do Instagram do estabelecimento, sem @ e em minúsculas (normalizado na action). Exibido como link na página pública; disponível em todos os planos.';

comment on column "public"."perfis_empresas"."endereco" is 'Endereço em texto livre exibido na página pública (vira link de busca no Google Maps). Disponível em todos os planos.';
