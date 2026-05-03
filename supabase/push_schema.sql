-- ═══════════════════════════════════════════════════════════════════
-- Push Subscriptions Table
-- Run this in Supabase SQL Editor AFTER schema.sql
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.push_subscriptions (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references auth.users on delete cascade not null,
  flat_id     text references public.flats(id),
  role        text not null,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists idx_push_flat on public.push_subscriptions(flat_id);
create index if not exists idx_push_role on public.push_subscriptions(role);

-- RLS
alter table public.push_subscriptions enable row level security;

-- Users manage their own subscriptions
create policy "push_own_insert" on public.push_subscriptions
  for insert with check (user_id = auth.uid());

create policy "push_own_delete" on public.push_subscriptions
  for delete using (user_id = auth.uid());

create policy "push_own_select" on public.push_subscriptions
  for select using (user_id = auth.uid());

-- Edge function (service role) reads all — handled via service_role key in edge fn
-- Guard/admin can see subscription count (not keys) — not needed in UI
