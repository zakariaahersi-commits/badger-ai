-- Durable Stripe delivery ledger. Only server-side service-role code can read
-- or write it; browser clients have no policy and no table privileges.

create table public.stripe_webhook_events (
  id bigint generated always as identity primary key,
  stripe_event_id text not null unique,
  event_type text not null check (char_length(event_type) between 1 and 120),
  status text not null default 'processing'
    check (status in ('processing', 'processed', 'failed')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  last_error text check (last_error is null or char_length(last_error) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz
);

create index stripe_webhook_events_status_updated_idx
  on public.stripe_webhook_events (status, updated_at desc);

alter table public.stripe_webhook_events enable row level security;
revoke all on table public.stripe_webhook_events from anon, authenticated;
grant all on table public.stripe_webhook_events to service_role;
grant usage, select on sequence public.stripe_webhook_events_id_seq to service_role;
