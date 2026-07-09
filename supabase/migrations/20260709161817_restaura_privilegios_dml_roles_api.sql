-- Um "ALTER DEFAULT PRIVILEGES ... REVOKE" ad hoc removeu os privilégios DML
-- das roles de API (anon/authenticated/service_role), quebrando todo acesso
-- via PostgREST ("permission denied for table ..."). RLS não substitui GRANT:
-- a role precisa do privilégio na tabela E de passar na política.
-- Normaliza: anon/authenticated recebem exatamente SELECT/INSERT/UPDATE/DELETE
-- (as políticas RLS granulares fazem o filtro real); TRUNCATE/REFERENCES/TRIGGER
-- são removidos (TRUNCATE inclusive ignora RLS). service_role volta a ter tudo.

-- Tabelas existentes
revoke all on all tables in schema public from anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant all on all tables in schema public to service_role;

-- Tabelas futuras criadas pelo role postgres (via migrations)
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges for role postgres in schema public grant all on tables to service_role;
