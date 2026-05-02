-- ═══════════════════════════════════════════════════════════════════
-- MyApartment Intercom — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Run
-- ═══════════════════════════════════════════════════════════════════

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ── FLATS ────────────────────────────────────────────────────────────
create table if not exists public.flats (
  id          text primary key,         -- e.g. 'A-101'
  block       text not null,
  floor       int  not null,
  unit        int  not null,
  resident_name text not null,
  phone       text,
  active      boolean default true,
  created_at  timestamptz default now()
);
comment on table public.flats is 'All 200 society flats. Managed by admin only.';

-- ── PROFILES ─────────────────────────────────────────────────────────
-- Extended user info linked to Supabase Auth
create table if not exists public.profiles (
  id          uuid references auth.users on delete cascade primary key,
  role        text not null check (role in ('admin', 'guard', 'resident')),
  name        text not null,
  flat_id     text references public.flats(id),   -- null for guard/admin
  created_at  timestamptz default now()
);
comment on table public.profiles is 'User roles: admin, guard, resident. Resident must have flat_id.';

-- Auto-create profile after signup (triggered by auth.users insert)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Profile is created manually by admin via seed/setup — this is a safety fallback
  insert into public.profiles (id, role, name)
  values (new.id, 'resident', coalesce(new.raw_user_meta_data->>'name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── VISITOR LOG ───────────────────────────────────────────────────────
create table if not exists public.visitor_log (
  id            uuid primary key default uuid_generate_v4(),
  visitor_name  text not null,
  purpose       text,
  flat_id       text not null references public.flats(id),
  resident_name text,
  status        text not null check (status in ('allowed', 'denied', 'pending')),
  logged_by     uuid references auth.users,
  notes         text,
  vehicle_no    text,
  created_at    timestamptz default now()
);
comment on table public.visitor_log is 'Immutable audit log of all visitor entries. Guard writes, resident reads own flat.';

-- ── CALLS ────────────────────────────────────────────────────────────
-- Realtime notification channel: guard → resident
create table if not exists public.calls (
  id              uuid primary key default uuid_generate_v4(),
  flat_id         text not null references public.flats(id),
  resident_name   text,
  visitor_name    text,
  visitor_purpose text,
  status          text not null check (status in ('ringing', 'connected', 'allowed', 'denied', 'ended', 'missed')),
  initiated_by    uuid references auth.users,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
comment on table public.calls is 'Active and historical calls. Guard inserts, resident updates status. Realtime subscribed.';

-- Auto-update updated_at
create or replace function public.update_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger calls_updated_at before update on public.calls
  for each row execute procedure public.update_updated_at();

-- ── ANNOUNCEMENTS ─────────────────────────────────────────────────────
create table if not exists public.announcements (
  id              uuid primary key default uuid_generate_v4(),
  text            text not null,
  type            text not null check (type in ('info', 'warning', 'emergency')),
  created_by      uuid references auth.users,
  created_by_name text,
  created_at      timestamptz default now()
);
comment on table public.announcements is 'Society-wide announcements. Guard/admin write, all residents read.';

-- ── EMERGENCY ALERTS ──────────────────────────────────────────────────
create table if not exists public.emergency_alerts (
  id              uuid primary key default uuid_generate_v4(),
  flat_id         text not null references public.flats(id),
  resident_name   text,
  message         text default 'SOS — Immediate assistance required',
  acknowledged    boolean default false,
  acknowledged_by uuid references auth.users,
  acknowledged_at timestamptz,
  created_at      timestamptz default now()
);
comment on table public.emergency_alerts is 'Emergency SOS alerts. Resident writes, guard/admin reads and acknowledges.';

-- ── INDEXES ───────────────────────────────────────────────────────────
create index if not exists idx_visitor_log_flat    on public.visitor_log(flat_id);
create index if not exists idx_visitor_log_created on public.visitor_log(created_at desc);
create index if not exists idx_calls_flat          on public.calls(flat_id);
create index if not exists idx_calls_status        on public.calls(status);
create index if not exists idx_calls_created       on public.calls(created_at desc);
create index if not exists idx_announcements_created on public.announcements(created_at desc);
create index if not exists idx_emergency_flat      on public.emergency_alerts(flat_id);
