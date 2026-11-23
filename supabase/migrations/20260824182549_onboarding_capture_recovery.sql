-- Capture a reachable founder before the reflective part of onboarding, then
-- send at most one requested/abandonment reminder. This table is server-only:
-- browser clients never need to read another person's recovery state.
create table public.onboarding_recoveries (
  user_id uuid primary key references auth.users (id) on delete cascade,
  track text not null default 'undecided'
    check (track in ('undecided', 'A', 'B', 'C')),
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'opted_out')),
  remind_at timestamptz not null,
  reminder_count smallint not null default 0
    check (reminder_count between 0 and 1),
  last_reminder_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (completed_at is null or status = 'completed')
);

create index onboarding_recoveries_due_idx
  on public.onboarding_recoveries (remind_at, user_id)
  where status = 'pending' and reminder_count = 0;

alter table public.onboarding_recoveries enable row level security;
revoke all on table public.onboarding_recoveries from anon, authenticated;
grant all on table public.onboarding_recoveries to service_role;
