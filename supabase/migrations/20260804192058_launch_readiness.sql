-- Server-authoritative access and first-party launch telemetry.

create table if not exists public.entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  product text not null check (product in ('badger-28-day')),
  status text not null check (status in ('active', 'refunded', 'revoked', 'disputed')),
  stripe_customer_id text,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  granted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists entitlements_payment_intent_idx
  on public.entitlements (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

alter table public.entitlements enable row level security;
create policy "read own entitlement" on public.entitlements
  for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on table public.entitlements from anon, authenticated;
grant select on table public.entitlements to authenticated;
grant all on table public.entitlements to service_role;

create table if not exists public.product_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  anonymous_id uuid,
  event_name text not null check (char_length(event_name) between 1 and 80),
  path text check (path is null or char_length(path) <= 300),
  properties jsonb not null default '{}'::jsonb check (jsonb_typeof(properties) = 'object'),
  created_at timestamptz not null default now(),
  check (user_id is not null or anonymous_id is not null)
);

create index if not exists product_events_name_created_idx
  on public.product_events (event_name, created_at desc);
create index if not exists product_events_user_created_idx
  on public.product_events (user_id, created_at desc)
  where user_id is not null;

alter table public.product_events enable row level security;
revoke all on table public.product_events from anon, authenticated;
grant all on table public.product_events to service_role;;
