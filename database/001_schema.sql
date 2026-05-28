-- Barbearia Agenda V1 - Schema inicial
-- Execute este arquivo no SQL Editor do Supabase.

create extension if not exists pgcrypto;

create table if not exists public.barbershops (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  phone text,
  address text,
  default_slot_minutes integer not null default 30,
  public_booking_enabled boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  name text not null,
  phone text,
  role text not null default 'BARBER' check (role in ('ADMIN', 'BARBER')),
  pin_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_sessions (
  token uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '12 hours'),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  name text not null,
  duration_min integer not null check (duration_min > 0),
  price numeric(12,2) not null default 0,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.barbers (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  user_id uuid references public.app_users(id) on delete set null,
  name text not null,
  phone text,
  role text not null default 'BARBER' check (role in ('ADMIN', 'BARBER')),
  active boolean not null default true,
  start_time time not null default '08:00',
  end_time time not null default '19:00',
  days_working text[] not null default array['SEG','TER','QUA','QUI','SEX','SAB'],
  service_ids uuid[],
  color text not null default '#d4a857',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  name text not null,
  phone text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (barbershop_id, phone)
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  barber_id uuid not null references public.barbers(id) on delete restrict,
  service_id uuid not null references public.services(id) on delete restrict,
  date date not null,
  start_time time not null,
  end_time time not null,
  client_name text not null,
  client_phone text,
  barber_name text not null,
  service_name text not null,
  duration_min integer not null,
  price numeric(12,2) not null default 0,
  status text not null default 'AGENDADO' check (status in ('PENDENTE_CONFIRMACAO','AGENDADO','CONFIRMADO','EM_ATENDIMENTO','CONCLUIDO','CANCELADO','FALTOU')),
  notes text,
  source text not null default 'BALCAO' check (source in ('BALCAO','PUBLICO','SISTEMA')),
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  canceled_reason text
);

create index if not exists idx_appointments_shop_date on public.appointments(barbershop_id, date);
create index if not exists idx_appointments_barber_date on public.appointments(barber_id, date);
create index if not exists idx_appointments_status on public.appointments(status);

create table if not exists public.business_hours (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  barber_id uuid references public.barbers(id) on delete cascade,
  weekday text not null check (weekday in ('SEG','TER','QUA','QUI','SEX','SAB','DOM')),
  start_time time not null,
  end_time time not null,
  break_start time,
  break_end time,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.financial_entries (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  barber_id uuid references public.barbers(id) on delete set null,
  service_id uuid references public.services(id) on delete set null,
  date date not null,
  description text not null,
  amount numeric(12,2) not null default 0,
  status text not null default 'RECEBIDO' check (status in ('PREVISTO','RECEBIDO','CANCELADO')),
  created_at timestamptz not null default now()
);

create table if not exists public.logs (
  id bigserial primary key,
  barbershop_id uuid references public.barbershops(id) on delete cascade,
  user_id uuid references public.app_users(id) on delete set null,
  action text not null,
  detail text,
  reference_id uuid,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_barbershops_updated_at on public.barbershops;
create trigger trg_barbershops_updated_at before update on public.barbershops for each row execute function public.set_updated_at();

drop trigger if exists trg_app_users_updated_at on public.app_users;
create trigger trg_app_users_updated_at before update on public.app_users for each row execute function public.set_updated_at();

drop trigger if exists trg_services_updated_at on public.services;
create trigger trg_services_updated_at before update on public.services for each row execute function public.set_updated_at();

drop trigger if exists trg_barbers_updated_at on public.barbers;
create trigger trg_barbers_updated_at before update on public.barbers for each row execute function public.set_updated_at();

drop trigger if exists trg_clients_updated_at on public.clients;
create trigger trg_clients_updated_at before update on public.clients for each row execute function public.set_updated_at();

drop trigger if exists trg_appointments_updated_at on public.appointments;
create trigger trg_appointments_updated_at before update on public.appointments for each row execute function public.set_updated_at();

alter table public.barbershops enable row level security;
alter table public.app_users enable row level security;
alter table public.app_sessions enable row level security;
alter table public.services enable row level security;
alter table public.barbers enable row level security;
alter table public.clients enable row level security;
alter table public.appointments enable row level security;
alter table public.business_hours enable row level security;
alter table public.financial_entries enable row level security;
alter table public.logs enable row level security;

create unique index if not exists ux_financial_entries_appointment on public.financial_entries(appointment_id) where appointment_id is not null;
