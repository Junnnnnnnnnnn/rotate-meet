-- 2026-05-19 event_sessions table + signups.event_session_label
-- Moves the previously hardcoded event session list (steps.tsx / submit /
-- format-notification) into the DB so operators can manage it from Telegram
-- via /date. Run this in the Supabase SQL Editor.

create table public.event_sessions (
  id          text primary key,
  event_date  date not null,
  venue       text not null check (char_length(venue) between 1 and 50),
  time_label  text not null check (char_length(time_label) between 1 and 30),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- The form lists active sessions ordered by date.
create index event_sessions_active_date_idx
  on public.event_sessions (event_date)
  where is_active;

-- Same security posture as signups: RLS on, zero policies, service_role only
-- (all access goes through Next.js API routes with the service role key).
alter table public.event_sessions enable row level security;
grant select, insert, update, delete on public.event_sessions to service_role;

-- Seed the existing hardcoded session so historical signups still resolve and
-- the form keeps showing it after the cutover.
insert into public.event_sessions (id, event_date, venue, time_label)
values ('2025-05-23-sinchon', '2025-05-23', '신촌점', '오후 7시');

-- Denormalized human label captured at submit time, so operator notifications
-- show "5/23(토) 신촌점 오후 7시" instead of the opaque slug. Nullable: rows
-- created before this migration fall back to the static SESSION_LABEL map in
-- lib/format-notification.ts.
alter table public.signups
  add column event_session_label text;
