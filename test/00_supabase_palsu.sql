-- Tiruan lingkungan Supabase secukupnya untuk menguji berkas SQL RME
-- di PostgreSQL biasa: skema auth, auth.uid(), dan peran bawaan.

create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";
create extension if not exists "pgcrypto";

do $$ begin create role anon nologin;          exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin;  exception when duplicate_object then null; end $$;

create schema if not exists auth;

create table if not exists auth.users (
  id                  uuid primary key default uuid_generate_v4(),
  email               text unique,
  raw_user_meta_data  jsonb default '{}'::jsonb,
  created_at          timestamptz default now()
);

-- auth.uid() di Supabase membaca klaim JWT. Di sini dibaca dari
-- setelan sesi supaya pengujian bisa berpura-pura jadi siapa saja:
--   select set_config('request.jwt.claim.sub', '<uuid>', false);
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

grant usage on schema auth to authenticated, anon, service_role;
grant select on auth.users to authenticated, service_role;
