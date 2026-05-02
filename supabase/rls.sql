-- ═══════════════════════════════════════════════════════════════════
-- MyApartment Intercom — Row Level Security (RLS) Policies
-- Run AFTER schema.sql in: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- Helper function: get current user's role
create or replace function public.get_my_role()
returns text language sql stable security definer as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Helper function: get current user's flat
create or replace function public.get_my_flat()
returns text language sql stable security definer as $$
  select flat_id from public.profiles where id = auth.uid();
$$;

-- ── ENABLE RLS ON ALL TABLES ─────────────────────────────────────────
alter table public.flats             enable row level security;
alter table public.profiles          enable row level security;
alter table public.visitor_log       enable row level security;
alter table public.calls             enable row level security;
alter table public.announcements     enable row level security;
alter table public.emergency_alerts  enable row level security;

-- ── FLATS ────────────────────────────────────────────────────────────
-- All authenticated users can read flats (needed for directory)
create policy "flats_read_all" on public.flats
  for select using (auth.uid() is not null);

-- Only admin can insert/update flats
create policy "flats_admin_write" on public.flats
  for all using (public.get_my_role() = 'admin');

-- ── PROFILES ─────────────────────────────────────────────────────────
-- Users can read their own profile
create policy "profiles_read_own" on public.profiles
  for select using (id = auth.uid());

-- Admin can read all profiles
create policy "profiles_admin_read_all" on public.profiles
  for select using (public.get_my_role() = 'admin');

-- Admin can insert/update profiles (user management)
create policy "profiles_admin_write" on public.profiles
  for all using (public.get_my_role() = 'admin');

-- ── VISITOR LOG ───────────────────────────────────────────────────────
-- Guard and admin can read all visitor logs
create policy "visitor_log_guard_admin_read" on public.visitor_log
  for select using (public.get_my_role() in ('guard', 'admin'));

-- Residents can only read their own flat's visitor log
create policy "visitor_log_resident_read_own" on public.visitor_log
  for select using (
    public.get_my_role() = 'resident'
    and flat_id = public.get_my_flat()
  );

-- Guard and admin can insert visitor log entries
create policy "visitor_log_guard_insert" on public.visitor_log
  for insert with check (public.get_my_role() in ('guard', 'admin'));

-- Residents can insert (when they allow/deny via call)
create policy "visitor_log_resident_insert" on public.visitor_log
  for insert with check (
    public.get_my_role() = 'resident'
    and flat_id = public.get_my_flat()
  );

-- No one can update or delete visitor logs (immutable audit trail)
-- This is intentional for RWA compliance

-- ── CALLS ────────────────────────────────────────────────────────────
-- Guard can read and insert all calls
create policy "calls_guard_all" on public.calls
  for all using (public.get_my_role() in ('guard', 'admin'));

-- Residents can read calls for their flat only
create policy "calls_resident_read_own" on public.calls
  for select using (
    public.get_my_role() = 'resident'
    and flat_id = public.get_my_flat()
  );

-- Residents can update call status (accept/deny) for their flat only
create policy "calls_resident_update_own" on public.calls
  for update using (
    public.get_my_role() = 'resident'
    and flat_id = public.get_my_flat()
  );

-- ── ANNOUNCEMENTS ─────────────────────────────────────────────────────
-- All authenticated users can read announcements
create policy "announcements_read_all" on public.announcements
  for select using (auth.uid() is not null);

-- Guard and admin can create announcements
create policy "announcements_guard_admin_insert" on public.announcements
  for insert with check (public.get_my_role() in ('guard', 'admin'));

-- Only admin can delete announcements
create policy "announcements_admin_delete" on public.announcements
  for delete using (public.get_my_role() = 'admin');

-- ── EMERGENCY ALERTS ──────────────────────────────────────────────────
-- Guard and admin can read all emergency alerts
create policy "emergency_guard_admin_read" on public.emergency_alerts
  for select using (public.get_my_role() in ('guard', 'admin'));

-- Residents can read their own flat's alerts
create policy "emergency_resident_read_own" on public.emergency_alerts
  for select using (
    public.get_my_role() = 'resident'
    and flat_id = public.get_my_flat()
  );

-- Residents can insert emergency alert for their own flat only
create policy "emergency_resident_insert" on public.emergency_alerts
  for insert with check (
    public.get_my_role() = 'resident'
    and flat_id = public.get_my_flat()
  );

-- Guard and admin can acknowledge (update) alerts
create policy "emergency_guard_acknowledge" on public.emergency_alerts
  for update using (public.get_my_role() in ('guard', 'admin'));

-- ── ENABLE REALTIME ───────────────────────────────────────────────────
-- Run this to enable realtime on the calls and emergency_alerts tables
-- Required for cross-device ringing to work

alter publication supabase_realtime add table public.calls;
alter publication supabase_realtime add table public.emergency_alerts;
alter publication supabase_realtime add table public.announcements;
