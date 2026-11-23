-- Private owner-only metadata for launch-test cohorts. Customer-facing clients
-- never receive table privileges; the authenticated owner API uses service_role.

create table public.tester_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  cohort text not null default 'private-beta-2026-08'
    check (char_length(cohort) between 1 and 80),
  status text not null default 'active'
    check (status in ('active', 'paused', 'completed', 'withdrawn')),
  feedback_tags text[] not null default '{}'::text[]
    check (cardinality(feedback_tags) <= 12),
  owner_notes text not null default ''
    check (char_length(owner_notes) <= 3000),
  invited_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tester_accounts_cohort_status_idx
  on public.tester_accounts (cohort, status, invited_at desc);

alter table public.tester_accounts enable row level security;
revoke all on table public.tester_accounts from anon, authenticated;
grant all on table public.tester_accounts to service_role;
