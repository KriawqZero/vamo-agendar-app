-- A função rls_auto_enable() é acionada apenas pelo event trigger `ensure_rls`
-- (contexto interno do Postgres) e nunca precisa ser chamada via API/RPC.
-- Por padrão o Postgres concede EXECUTE a PUBLIC, o que a expõe indevidamente
-- para os papéis anon/authenticated via PostgREST (achado do advisor de segurança).
revoke execute on function public.rls_auto_enable() from public;
