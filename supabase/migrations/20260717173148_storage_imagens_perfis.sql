-- P0.12(b): infraestrutura de Storage para as imagens de perfil dos tenants
-- (logo e capa da página pública de booking).
--
-- Migration MANUAL (exceção documentada em docs/SUPABASE_DECLARATIVE-DATABASE-SCHEMA.md):
-- bucket é DML (insert em storage.buckets) — o diff declarativo não cobre.
--
-- Desenho:
-- - Bucket público `imagens-perfis`: a página de booking é pública, a leitura das
--   imagens vai direto pela CDN do bucket.
-- - Paths por tenant: <org_id>/logo-<epoch>.<ext> e <org_id>/capa-<epoch>.<ext>
--   (timestamp no nome = cache-busting; a action remove os arquivos antigos do prefixo).
-- - Sem SVG (superfície de XSS desnecessária). 5MB é o limite duro do bucket; a
--   action aplica limites menores por tipo (logo 2MB, capa 5MB).
--
-- SEM políticas RLS em storage.objects — decisão registrada em 2026-07-17:
-- neste projeto (Supabase atual), storage.objects pertence a supabase_storage_admin
-- e a role postgres (MCP/SQL) não pode criar políticas ali ("must be owner of
-- relation objects"; postgres não é membro de supabase_storage_admin). Consequência
-- deliberada: storage API fica default-deny para anon/authenticated — TODA escrita
-- passa pela Server Action `enviarImagemPerfil`/`removerImagemPerfil`
-- (src/app/actions/imagens-perfil.ts), que valida auth() + gating de plano + deriva
-- o path do org_id no servidor e usa createAdminClient() (service_role). É o
-- fallback previsto no plano do P0.12(b); postura mais restritiva que RLS de pasta.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'imagens-perfis',
    'imagens-perfis',
    true,
    5242880, -- 5MB (limite duro do bucket; a action aplica limites menores por tipo)
    array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;
