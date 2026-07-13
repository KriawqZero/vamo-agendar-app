-- P0.4: fuso horário IANA por tenant.
-- Slots de disponibilidade calculados e mensagens de WhatsApp formatadas neste
-- fuso; os timestamps continuam gravados em UTC. Sem CHECK de IANA no banco —
-- a validação ocorre na action com Intl.supportedValuesOf('timeZone').
alter table "public"."perfis_empresas" add column "timezone" text not null default 'America/Sao_Paulo'::text;

comment on column "public"."perfis_empresas"."timezone" is 'Fuso horário IANA do estabelecimento (ex.: America/Sao_Paulo, America/Campo_Grande). Slots de disponibilidade são calculados e as mensagens de WhatsApp formatadas neste fuso; os timestamps continuam gravados em UTC. Validado na action com Intl.supportedValuesOf(timeZone) — sem CHECK no banco.';
