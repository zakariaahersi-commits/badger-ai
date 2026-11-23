-- Upfront one-time purchase recovery and email engagement tracking.
-- Checkout recovery is deliberately server-authoritative: it records that a
-- signed-in founder reached Stripe, but never grants product access.
create table public.email_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  journey_nudges_enabled boolean not null default true,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (journey_nudges_enabled and unsubscribed_at is null)
    or (not journey_nudges_enabled and unsubscribed_at is not null)
  )
);

alter table public.email_preferences enable row level security;
create policy "read own email preferences" on public.email_preferences
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "update own email preferences" on public.email_preferences
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
revoke all on table public.email_preferences from anon, authenticated;
grant select, update on table public.email_preferences to authenticated;
grant all on table public.email_preferences to service_role;

create table public.checkout_recoveries (
  user_id uuid primary key references auth.users (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'converted', 'opted_out')),
  checkout_started_at timestamptz not null,
  last_checkout_session_id text not null unique,
  reminder_count smallint not null default 0
    check (reminder_count between 0 and 2),
  first_reminder_at timestamptz,
  final_reminder_at timestamptz,
  converted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (converted_at is null or status = 'converted')
);

create index checkout_recoveries_pending_idx
  on public.checkout_recoveries (checkout_started_at, user_id)
  where status = 'pending' and reminder_count < 2;
alter table public.checkout_recoveries enable row level security;
revoke all on table public.checkout_recoveries from anon, authenticated;
grant all on table public.checkout_recoveries to service_role;

-- Resend sends these events at least once and may deliver them out of order.
-- svix_id makes ingestion idempotent; occurred_at preserves provider order.
create table public.email_events (
  id bigint generated always as identity primary key,
  svix_id text not null unique,
  resend_email_id text not null,
  user_id uuid references auth.users (id) on delete set null,
  recipient text not null check (char_length(recipient) between 3 and 320),
  event_type text not null
    check (event_type in (
      'email.sent', 'email.delivered', 'email.delivery_delayed',
      'email.opened', 'email.clicked', 'email.bounced',
      'email.complained', 'email.failed', 'email.suppressed'
    )),
  subject text check (subject is null or char_length(subject) <= 300),
  link_url text check (link_url is null or char_length(link_url) <= 2000),
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index email_events_user_occurred_idx
  on public.email_events (user_id, occurred_at desc)
  where user_id is not null;
create index email_events_email_type_idx
  on public.email_events (resend_email_id, event_type, occurred_at desc);
alter table public.email_events enable row level security;
revoke all on table public.email_events from anon, authenticated;
grant all on table public.email_events to service_role;
grant usage, select on sequence public.email_events_id_seq to service_role;
