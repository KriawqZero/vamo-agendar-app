-- A política de SELECT para anon em assinaturas libera a linha inteira, mas o
-- fluxo público só precisa de tenant_id/plano/status (verificação de recursos
-- do plano). Restringe o privilégio de anon a essas colunas para que os campos
-- de pagamento (valor, ids Asaas, url de fatura) nunca sejam legíveis sem login.
revoke select on public.assinaturas from anon;
grant select (tenant_id, plano, status) on public.assinaturas to anon;

comment on policy "Permitir SELECT público para verificação de recursos" on public.assinaturas is
'O fluxo público de booking precisa saber se o tenant tem WhatsApp habilitado no plano. O GRANT por coluna limita anon a tenant_id/plano/status — campos de pagamento ficam invisíveis sem login.';
