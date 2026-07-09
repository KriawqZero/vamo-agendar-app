create table public.assinaturas (
    id uuid default gen_random_uuid() primary key,
    tenant_id text not null,
    plano text not null check (plano in ('plus', 'pro')),
    ciclo text not null check (ciclo in ('MONTHLY', 'YEARLY')), -- enum idêntico ao cycle do Asaas
    valor numeric(10,2) not null,
    status text not null check (status in ('ativa', 'inadimplente', 'cancelada')),
    asaas_customer_id text,      -- cus_..., preenchido quando o checkout Asaas existir
    asaas_subscription_id text,  -- sub_..., idem
    proximo_vencimento date,     -- espelho do nextDueDate do Asaas
    url_fatura_pendente text,    -- invoiceUrl do pagamento em atraso (banner de inadimplência)
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    constraint fk_tenant foreign key (tenant_id) references public.perfis_empresas(tenant_id) on delete cascade
);

-- Uma única assinatura vigente (ativa ou inadimplente) por tenant
create unique index uq_assinatura_vigente_por_tenant
on public.assinaturas (tenant_id)
where status in ('ativa', 'inadimplente');

-- Habilitar RLS
alter table public.assinaturas enable row level security;

-- Política: o tenant autenticado só LÊ a própria assinatura.
-- Não há políticas de INSERT/UPDATE/DELETE para authenticated/anon de propósito:
-- quem escreve é o dono do banco (SQL manual na fase de testes; webhook Asaas com
-- service_role no futuro). Isso torna o plano infraudável pelo cliente.
create policy "Permitir SELECT do próprio tenant para autenticados"
on public.assinaturas for select to authenticated
using (tenant_id = (select auth.jwt() ->> 'org_id'));

-- Comentários
comment on table public.assinaturas is 'Assinatura de plano pago (plus/pro) de cada tenant, no formato da integração Asaas. Plano Gratuito = ausência de linha vigente.';
comment on column public.assinaturas.ciclo is 'Ciclo de cobrança no enum do Asaas (MONTHLY/YEARLY).';
comment on column public.assinaturas.status is 'ativa = em dia; inadimplente = mantém benefícios + banner de pagamento pendente; cancelada = volta ao Gratuito.';
comment on column public.assinaturas.url_fatura_pendente is 'invoiceUrl da cobrança em atraso no Asaas, usada no banner de inadimplência.';
comment on policy "Permitir SELECT do próprio tenant para autenticados" on public.assinaturas is 'Leitura restrita ao tenant; escrita reservada ao backend (SQL manual/webhook Asaas), sem política para roles de API.';

alter table public.perfis_empresas add column cor_marca text;
alter table public.perfis_empresas add column logo_url text;
comment on column public.perfis_empresas.cor_marca is 'Cor de destaque da página pública de booking (recurso do plano Plus+). Ainda não aplicada na UI pública.';
comment on column public.perfis_empresas.logo_url is 'URL do logo exibido na página pública de booking (recurso do plano Pro). Ainda não aplicada na UI pública.';
