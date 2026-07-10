create policy "Permitir SELECT público para verificação de recursos"
on public.assinaturas for select to anon
using (true);

comment on policy "Permitir SELECT público para verificação de recursos" on public.assinaturas is
'O fluxo público de booking precisa saber se o tenant tem WhatsApp habilitado no plano. Exposição aceitável: plano/status não são dados sensíveis.';
