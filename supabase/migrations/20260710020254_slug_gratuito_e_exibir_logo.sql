-- Slug do plano Gratuito: guarda o slug aleatório gerado no provisionamento.
-- Quando o plano não inclui link personalizado, ele é o slug efetivo — o slug
-- customizado fica reservado em `slug` e volta a valer no re-upgrade.
alter table public.perfis_empresas add column slug_gratuito text;
update public.perfis_empresas set slug_gratuito = slug where slug_gratuito is null;
alter table public.perfis_empresas alter column slug_gratuito set not null;

-- Preferência do tenant (plano Pro): exibir ou não o logo na página pública.
alter table public.perfis_empresas add column exibir_logo boolean not null default true;

comment on column public.perfis_empresas.slug_gratuito is 'Slug aleatório gerado no provisionamento do perfil. É o slug efetivo quando o plano não inclui link personalizado; o slug customizado fica reservado em `slug` e volta a valer no re-upgrade.';
comment on column public.perfis_empresas.exibir_logo is 'Preferência do tenant (plano Pro): exibir ou não o logo na página pública de booking.';
comment on column public.perfis_empresas.logo_url is 'URL do logo exibido na página pública de booking, sincronizado do logo da organização no Clerk (recurso do plano Pro). Ainda não aplicada na UI pública.';
