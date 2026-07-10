
  create table "public"."agendamentos" (
    "id" uuid not null default gen_random_uuid(),
    "tenant_id" text not null,
    "cliente_id" uuid not null,
    "servico_id" uuid not null,
    "data_hora" timestamp with time zone not null,
    "status" text not null default 'pendente'::text,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "updated_at" timestamp with time zone not null default timezone('utc'::text, now())
      );


alter table "public"."agendamentos" enable row level security;


  create table "public"."clientes" (
    "id" uuid not null default gen_random_uuid(),
    "tenant_id" text not null,
    "nome" text not null,
    "telefone" text not null,
    "email" text,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now())
      );


alter table "public"."clientes" enable row level security;


  create table "public"."excecoes_agenda" (
    "id" uuid not null default gen_random_uuid(),
    "tenant_id" text not null,
    "data" date not null,
    "hora_inicio" time without time zone,
    "hora_fim" time without time zone,
    "bloqueado" boolean not null default true,
    "motivo" text,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "updated_at" timestamp with time zone not null default timezone('utc'::text, now())
      );


alter table "public"."excecoes_agenda" enable row level security;


  create table "public"."horarios_funcionamento" (
    "id" uuid not null default gen_random_uuid(),
    "tenant_id" text not null,
    "dia_semana" integer not null,
    "hora_inicio" time without time zone not null default '08:00:00'::time without time zone,
    "hora_fim" time without time zone not null default '18:00:00'::time without time zone,
    "ativo" boolean not null default true,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "updated_at" timestamp with time zone not null default timezone('utc'::text, now())
      );


alter table "public"."horarios_funcionamento" enable row level security;


  create table "public"."perfis_empresas" (
    "tenant_id" text not null,
    "slug" text not null,
    "nome_estabelecimento" text not null,
    "descricao" text,
    "telefone_contato" text,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "updated_at" timestamp with time zone not null default timezone('utc'::text, now())
      );


alter table "public"."perfis_empresas" enable row level security;


  create table "public"."servicos" (
    "id" uuid not null default gen_random_uuid(),
    "tenant_id" text not null,
    "nome" text not null,
    "descricao" text,
    "preco" numeric(10,2) not null default 0.00,
    "duracao_minutos" integer not null default 30,
    "ativo" boolean not null default true,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "updated_at" timestamp with time zone not null default timezone('utc'::text, now())
      );


alter table "public"."servicos" enable row level security;


  create table "public"."whatsapp_configs" (
    "id" uuid not null default gen_random_uuid(),
    "tenant_id" text not null,
    "instance_name" text not null,
    "instance_token" text,
    "status" text not null default 'desconectado'::text,
    "mensagem_confirmacao" text not null default 'Olá {{cliente}}, seu agendamento em {{empresa}} para {{data_hora}} está confirmado!'::text,
    "mensagem_lembrete" text not null default 'Olá {{cliente}}, passando para lembrar do seu agendamento em {{empresa}} no dia {{data}} às {{hora}}.'::text,
    "tempo_lembrete_minutos" integer not null default 120,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "updated_at" timestamp with time zone not null default timezone('utc'::text, now())
      );


alter table "public"."whatsapp_configs" enable row level security;

CREATE UNIQUE INDEX agendamentos_pkey ON public.agendamentos USING btree (id);

CREATE UNIQUE INDEX clientes_pkey ON public.clientes USING btree (id);

CREATE UNIQUE INDEX excecoes_agenda_pkey ON public.excecoes_agenda USING btree (id);

CREATE UNIQUE INDEX horarios_funcionamento_pkey ON public.horarios_funcionamento USING btree (id);

CREATE UNIQUE INDEX perfis_empresas_pkey ON public.perfis_empresas USING btree (tenant_id);

CREATE UNIQUE INDEX perfis_empresas_slug_key ON public.perfis_empresas USING btree (slug);

CREATE UNIQUE INDEX servicos_pkey ON public.servicos USING btree (id);

CREATE UNIQUE INDEX uq_tenant_dia_semana ON public.horarios_funcionamento USING btree (tenant_id, dia_semana);

CREATE UNIQUE INDEX whatsapp_configs_instance_name_key ON public.whatsapp_configs USING btree (instance_name);

CREATE UNIQUE INDEX whatsapp_configs_pkey ON public.whatsapp_configs USING btree (id);

CREATE UNIQUE INDEX whatsapp_configs_tenant_id_key ON public.whatsapp_configs USING btree (tenant_id);

alter table "public"."agendamentos" add constraint "agendamentos_pkey" PRIMARY KEY using index "agendamentos_pkey";

alter table "public"."clientes" add constraint "clientes_pkey" PRIMARY KEY using index "clientes_pkey";

alter table "public"."excecoes_agenda" add constraint "excecoes_agenda_pkey" PRIMARY KEY using index "excecoes_agenda_pkey";

alter table "public"."horarios_funcionamento" add constraint "horarios_funcionamento_pkey" PRIMARY KEY using index "horarios_funcionamento_pkey";

alter table "public"."perfis_empresas" add constraint "perfis_empresas_pkey" PRIMARY KEY using index "perfis_empresas_pkey";

alter table "public"."servicos" add constraint "servicos_pkey" PRIMARY KEY using index "servicos_pkey";

alter table "public"."whatsapp_configs" add constraint "whatsapp_configs_pkey" PRIMARY KEY using index "whatsapp_configs_pkey";

alter table "public"."agendamentos" add constraint "agendamentos_status_check" CHECK ((status = ANY (ARRAY['pendente'::text, 'confirmado'::text, 'concluido'::text, 'cancelado'::text]))) not valid;

alter table "public"."agendamentos" validate constraint "agendamentos_status_check";

alter table "public"."agendamentos" add constraint "fk_cliente" FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE not valid;

alter table "public"."agendamentos" validate constraint "fk_cliente";

alter table "public"."agendamentos" add constraint "fk_servico" FOREIGN KEY (servico_id) REFERENCES public.servicos(id) ON DELETE RESTRICT not valid;

alter table "public"."agendamentos" validate constraint "fk_servico";

alter table "public"."agendamentos" add constraint "fk_tenant" FOREIGN KEY (tenant_id) REFERENCES public.perfis_empresas(tenant_id) ON DELETE CASCADE not valid;

alter table "public"."agendamentos" validate constraint "fk_tenant";

alter table "public"."clientes" add constraint "fk_tenant" FOREIGN KEY (tenant_id) REFERENCES public.perfis_empresas(tenant_id) ON DELETE CASCADE not valid;

alter table "public"."clientes" validate constraint "fk_tenant";

alter table "public"."excecoes_agenda" add constraint "fk_tenant" FOREIGN KEY (tenant_id) REFERENCES public.perfis_empresas(tenant_id) ON DELETE CASCADE not valid;

alter table "public"."excecoes_agenda" validate constraint "fk_tenant";

alter table "public"."horarios_funcionamento" add constraint "fk_tenant" FOREIGN KEY (tenant_id) REFERENCES public.perfis_empresas(tenant_id) ON DELETE CASCADE not valid;

alter table "public"."horarios_funcionamento" validate constraint "fk_tenant";

alter table "public"."horarios_funcionamento" add constraint "horarios_funcionamento_dia_semana_check" CHECK (((dia_semana >= 0) AND (dia_semana <= 6))) not valid;

alter table "public"."horarios_funcionamento" validate constraint "horarios_funcionamento_dia_semana_check";

alter table "public"."horarios_funcionamento" add constraint "uq_tenant_dia_semana" UNIQUE using index "uq_tenant_dia_semana";

alter table "public"."perfis_empresas" add constraint "perfis_empresas_slug_key" UNIQUE using index "perfis_empresas_slug_key";

alter table "public"."servicos" add constraint "fk_tenant" FOREIGN KEY (tenant_id) REFERENCES public.perfis_empresas(tenant_id) ON DELETE CASCADE not valid;

alter table "public"."servicos" validate constraint "fk_tenant";

alter table "public"."whatsapp_configs" add constraint "fk_tenant" FOREIGN KEY (tenant_id) REFERENCES public.perfis_empresas(tenant_id) ON DELETE CASCADE not valid;

alter table "public"."whatsapp_configs" validate constraint "fk_tenant";

alter table "public"."whatsapp_configs" add constraint "whatsapp_configs_instance_name_key" UNIQUE using index "whatsapp_configs_instance_name_key";

alter table "public"."whatsapp_configs" add constraint "whatsapp_configs_status_check" CHECK ((status = ANY (ARRAY['desconectado'::text, 'aguardando_qrcode'::text, 'conectado'::text]))) not valid;

alter table "public"."whatsapp_configs" validate constraint "whatsapp_configs_status_check";

alter table "public"."whatsapp_configs" add constraint "whatsapp_configs_tenant_id_key" UNIQUE using index "whatsapp_configs_tenant_id_key";

grant references on table "public"."agendamentos" to "anon";

grant trigger on table "public"."agendamentos" to "anon";

grant truncate on table "public"."agendamentos" to "anon";

grant references on table "public"."agendamentos" to "authenticated";

grant trigger on table "public"."agendamentos" to "authenticated";

grant truncate on table "public"."agendamentos" to "authenticated";

grant references on table "public"."agendamentos" to "service_role";

grant trigger on table "public"."agendamentos" to "service_role";

grant truncate on table "public"."agendamentos" to "service_role";

grant references on table "public"."clientes" to "anon";

grant trigger on table "public"."clientes" to "anon";

grant truncate on table "public"."clientes" to "anon";

grant references on table "public"."clientes" to "authenticated";

grant trigger on table "public"."clientes" to "authenticated";

grant truncate on table "public"."clientes" to "authenticated";

grant references on table "public"."clientes" to "service_role";

grant trigger on table "public"."clientes" to "service_role";

grant truncate on table "public"."clientes" to "service_role";

grant references on table "public"."excecoes_agenda" to "anon";

grant trigger on table "public"."excecoes_agenda" to "anon";

grant truncate on table "public"."excecoes_agenda" to "anon";

grant references on table "public"."excecoes_agenda" to "authenticated";

grant trigger on table "public"."excecoes_agenda" to "authenticated";

grant truncate on table "public"."excecoes_agenda" to "authenticated";

grant references on table "public"."excecoes_agenda" to "service_role";

grant trigger on table "public"."excecoes_agenda" to "service_role";

grant truncate on table "public"."excecoes_agenda" to "service_role";

grant references on table "public"."horarios_funcionamento" to "anon";

grant trigger on table "public"."horarios_funcionamento" to "anon";

grant truncate on table "public"."horarios_funcionamento" to "anon";

grant references on table "public"."horarios_funcionamento" to "authenticated";

grant trigger on table "public"."horarios_funcionamento" to "authenticated";

grant truncate on table "public"."horarios_funcionamento" to "authenticated";

grant references on table "public"."horarios_funcionamento" to "service_role";

grant trigger on table "public"."horarios_funcionamento" to "service_role";

grant truncate on table "public"."horarios_funcionamento" to "service_role";

grant references on table "public"."perfis_empresas" to "anon";

grant trigger on table "public"."perfis_empresas" to "anon";

grant truncate on table "public"."perfis_empresas" to "anon";

grant references on table "public"."perfis_empresas" to "authenticated";

grant trigger on table "public"."perfis_empresas" to "authenticated";

grant truncate on table "public"."perfis_empresas" to "authenticated";

grant references on table "public"."perfis_empresas" to "service_role";

grant trigger on table "public"."perfis_empresas" to "service_role";

grant truncate on table "public"."perfis_empresas" to "service_role";

grant references on table "public"."servicos" to "anon";

grant trigger on table "public"."servicos" to "anon";

grant truncate on table "public"."servicos" to "anon";

grant references on table "public"."servicos" to "authenticated";

grant trigger on table "public"."servicos" to "authenticated";

grant truncate on table "public"."servicos" to "authenticated";

grant references on table "public"."servicos" to "service_role";

grant trigger on table "public"."servicos" to "service_role";

grant truncate on table "public"."servicos" to "service_role";

grant references on table "public"."whatsapp_configs" to "anon";

grant trigger on table "public"."whatsapp_configs" to "anon";

grant truncate on table "public"."whatsapp_configs" to "anon";

grant references on table "public"."whatsapp_configs" to "authenticated";

grant trigger on table "public"."whatsapp_configs" to "authenticated";

grant truncate on table "public"."whatsapp_configs" to "authenticated";

grant references on table "public"."whatsapp_configs" to "service_role";

grant trigger on table "public"."whatsapp_configs" to "service_role";

grant truncate on table "public"."whatsapp_configs" to "service_role";


  create policy "Permitir DELETE para membros da org autenticados"
  on "public"."agendamentos"
  as permissive
  for delete
  to authenticated
using ((tenant_id = ( SELECT (auth.jwt() ->> 'org_id'::text))));



  create policy "Permitir INSERT público para visitantes"
  on "public"."agendamentos"
  as permissive
  for insert
  to anon, authenticated
with check ((tenant_id IS NOT NULL));



  create policy "Permitir SELECT público para todos"
  on "public"."agendamentos"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "Permitir UPDATE para membros da org autenticados"
  on "public"."agendamentos"
  as permissive
  for update
  to authenticated
using ((tenant_id = ( SELECT (auth.jwt() ->> 'org_id'::text))))
with check ((tenant_id = ( SELECT (auth.jwt() ->> 'org_id'::text))));



  create policy "Permitir DELETE para membros da org autenticados"
  on "public"."clientes"
  as permissive
  for delete
  to authenticated
using ((tenant_id = ( SELECT (auth.jwt() ->> 'org_id'::text))));



  create policy "Permitir INSERT público para visitantes"
  on "public"."clientes"
  as permissive
  for insert
  to anon, authenticated
with check ((tenant_id IS NOT NULL));



  create policy "Permitir SELECT para membros da org autenticados"
  on "public"."clientes"
  as permissive
  for select
  to authenticated
using ((tenant_id = ( SELECT (auth.jwt() ->> 'org_id'::text))));



  create policy "Permitir UPDATE para membros da org autenticados"
  on "public"."clientes"
  as permissive
  for update
  to authenticated
using ((tenant_id = ( SELECT (auth.jwt() ->> 'org_id'::text))))
with check ((tenant_id = ( SELECT (auth.jwt() ->> 'org_id'::text))));



  create policy "Permitir DELETE para donos da org autenticados"
  on "public"."excecoes_agenda"
  as permissive
  for delete
  to authenticated
using ((tenant_id = ( SELECT (auth.jwt() ->> 'org_id'::text))));



  create policy "Permitir INSERT para donos da org autenticados"
  on "public"."excecoes_agenda"
  as permissive
  for insert
  to authenticated
with check ((tenant_id = ( SELECT (auth.jwt() ->> 'org_id'::text))));



  create policy "Permitir SELECT público para todos"
  on "public"."excecoes_agenda"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "Permitir UPDATE para donos da org autenticados"
  on "public"."excecoes_agenda"
  as permissive
  for update
  to authenticated
using ((tenant_id = ( SELECT (auth.jwt() ->> 'org_id'::text))))
with check ((tenant_id = ( SELECT (auth.jwt() ->> 'org_id'::text))));



  create policy "Permitir DELETE para donos da org autenticados"
  on "public"."horarios_funcionamento"
  as permissive
  for delete
  to authenticated
using ((tenant_id = ( SELECT (auth.jwt() ->> 'org_id'::text))));



  create policy "Permitir INSERT para donos da org autenticados"
  on "public"."horarios_funcionamento"
  as permissive
  for insert
  to authenticated
with check ((tenant_id = ( SELECT (auth.jwt() ->> 'org_id'::text))));



  create policy "Permitir SELECT público para todos"
  on "public"."horarios_funcionamento"
  as permissive
  for select
  to anon, authenticated
using ((ativo = true));



  create policy "Permitir UPDATE para donos da org autenticados"
  on "public"."horarios_funcionamento"
  as permissive
  for update
  to authenticated
using ((tenant_id = ( SELECT (auth.jwt() ->> 'org_id'::text))))
with check ((tenant_id = ( SELECT (auth.jwt() ->> 'org_id'::text))));



  create policy "Permitir DELETE para donos da org autenticados"
  on "public"."perfis_empresas"
  as permissive
  for delete
  to authenticated
using ((tenant_id = ( SELECT (auth.jwt() ->> 'org_id'::text))));



  create policy "Permitir INSERT para donos da org autenticados"
  on "public"."perfis_empresas"
  as permissive
  for insert
  to authenticated
with check ((tenant_id = ( SELECT (auth.jwt() ->> 'org_id'::text))));



  create policy "Permitir SELECT público para todos"
  on "public"."perfis_empresas"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "Permitir UPDATE para donos da org autenticados"
  on "public"."perfis_empresas"
  as permissive
  for update
  to authenticated
using ((tenant_id = ( SELECT (auth.jwt() ->> 'org_id'::text))))
with check ((tenant_id = ( SELECT (auth.jwt() ->> 'org_id'::text))));



  create policy "Permitir DELETE para donos da org autenticados"
  on "public"."servicos"
  as permissive
  for delete
  to authenticated
using ((tenant_id = ( SELECT (auth.jwt() ->> 'org_id'::text))));



  create policy "Permitir INSERT para donos da org autenticados"
  on "public"."servicos"
  as permissive
  for insert
  to authenticated
with check ((tenant_id = ( SELECT (auth.jwt() ->> 'org_id'::text))));



  create policy "Permitir SELECT público para todos"
  on "public"."servicos"
  as permissive
  for select
  to anon, authenticated
using ((ativo = true));



  create policy "Permitir UPDATE para donos da org autenticados"
  on "public"."servicos"
  as permissive
  for update
  to authenticated
using ((tenant_id = ( SELECT (auth.jwt() ->> 'org_id'::text))))
with check ((tenant_id = ( SELECT (auth.jwt() ->> 'org_id'::text))));



  create policy "Permitir DELETE para membros da org autenticados"
  on "public"."whatsapp_configs"
  as permissive
  for delete
  to authenticated
using ((tenant_id = ( SELECT (auth.jwt() ->> 'org_id'::text))));



  create policy "Permitir INSERT para membros da org autenticados"
  on "public"."whatsapp_configs"
  as permissive
  for insert
  to authenticated
with check ((tenant_id = ( SELECT (auth.jwt() ->> 'org_id'::text))));



  create policy "Permitir SELECT para membros da org autenticados"
  on "public"."whatsapp_configs"
  as permissive
  for select
  to authenticated
using ((tenant_id = ( SELECT (auth.jwt() ->> 'org_id'::text))));



  create policy "Permitir UPDATE para membros da org autenticados"
  on "public"."whatsapp_configs"
  as permissive
  for update
  to authenticated
using ((tenant_id = ( SELECT (auth.jwt() ->> 'org_id'::text))))
with check ((tenant_id = ( SELECT (auth.jwt() ->> 'org_id'::text))));



