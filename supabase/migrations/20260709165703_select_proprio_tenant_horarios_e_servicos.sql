-- A política de SELECT público "USING (ativo = true)" esconde linhas inativas
-- inclusive do próprio dono, o que quebra INSERT/UPDATE ... RETURNING (o
-- .select() do supabase-js) para linhas com ativo = false e impede o dashboard
-- de listar dias/serviços desativados. Estas políticas (permissivas, combinam
-- por OR com a pública) garantem que o tenant autenticado sempre enxergue as
-- próprias linhas.

create policy "Permitir SELECT do próprio tenant para autenticados"
on public.horarios_funcionamento for select to authenticated
using (tenant_id = (select auth.jwt() ->> 'org_id'));

create policy "Permitir SELECT do próprio tenant para autenticados"
on public.servicos for select to authenticated
using (tenant_id = (select auth.jwt() ->> 'org_id'));

comment on policy "Permitir SELECT do próprio tenant para autenticados" on public.horarios_funcionamento is
'O dono precisa ver linhas inativas: listagem no dashboard e RETURNING de INSERT/UPDATE exigem passar no SELECT.';

comment on policy "Permitir SELECT do próprio tenant para autenticados" on public.servicos is
'O dono precisa ver serviços inativos para reativá-los; RETURNING de INSERT/UPDATE exige passar no SELECT.';
