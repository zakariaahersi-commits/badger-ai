-- Founder/Venture Brain and event-driven accountability.
-- Server routes are authoritative writers. Signed-in users may read their own
-- venture knowledge and commitments; wake and delivery internals stay private.

create table public.venture_entities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('customer', 'problem', 'hypothesis', 'experiment', 'evidence', 'decision', 'promise', 'task', 'payment')),
  name text not null check (char_length(name) between 1 and 160),
  summary text not null check (char_length(summary) between 1 and 2000),
  status text not null default 'active' check (status in ('active', 'stale', 'contradicted', 'archived')),
  confidence numeric(3,2) not null default 0.50 check (confidence between 0 and 1),
  source_type text not null check (source_type in ('onboarding', 'task_log', 'proof', 'coach_chat', 'customer_reply', 'payment', 'user', 'system')),
  source_ref text check (source_ref is null or char_length(source_ref) <= 500),
  source_event_id uuid references public.domain_events (id) on delete set null,
  canonical_key text not null check (char_length(canonical_key) between 1 and 300),
  occurred_at timestamptz,
  last_verified_at timestamptz,
  stale_after timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, canonical_key)
);

create table public.venture_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  from_entity_id uuid not null references public.venture_entities (id) on delete cascade,
  to_entity_id uuid not null references public.venture_entities (id) on delete cascade,
  relation text not null check (char_length(relation) between 1 and 80),
  confidence numeric(3,2) not null default 0.50 check (confidence between 0 and 1),
  source_event_id uuid references public.domain_events (id) on delete set null,
  created_at timestamptz not null default now(),
  check (from_entity_id <> to_entity_id),
  unique (user_id, from_entity_id, to_entity_id, relation)
);

create table public.founder_commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  outcome text not null check (char_length(outcome) between 1 and 1000),
  due_at timestamptz not null,
  evidence_required text not null default '' check (char_length(evidence_required) <= 1000),
  evidence_status text not null default 'pending' check (evidence_status in ('pending', 'submitted', 'verified', 'rejected')),
  status text not null default 'open' check (status in ('open', 'completed', 'missed', 'cancelled')),
  follow_up_policy text not null default 'challenge' check (follow_up_policy in ('remind', 'challenge', 'checkpoint')),
  source_event_id uuid references public.domain_events (id) on delete set null,
  completed_event_id uuid references public.domain_events (id) on delete set null,
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 300),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create table public.coach_standing_orders (
  user_id uuid primary key references auth.users (id) on delete cascade,
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 80),
  quiet_start time not null default '21:00',
  quiet_end time not null default '08:00',
  max_daily_nudges smallint not null default 2 check (max_daily_nudges between 0 and 6),
  min_interval_minutes smallint not null default 180 check (min_interval_minutes between 15 and 1440),
  accountability_level text not null default 'direct' check (accountability_level in ('gentle', 'direct', 'firm')),
  email_enabled boolean not null default true,
  push_enabled boolean not null default true,
  instructions text[] not null default '{}'::text[] check (cardinality(instructions) <= 10),
  permissions jsonb not null default '{}'::jsonb check (jsonb_typeof(permissions) = 'object'),
  paused_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.coach_wakes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  commitment_id uuid references public.founder_commitments (id) on delete cascade,
  trigger_type text not null check (trigger_type in ('daily_morning', 'daily_evening', 'commitment_due', 'commitment_missed', 'customer_reply', 'payment_received', 'evidence_gap', 'contradiction', 'community_pattern', 'manual')),
  status text not null default 'queued' check (status in ('queued', 'evaluating', 'suppressed', 'delivering', 'delivered', 'failed', 'cancelled')),
  scheduled_for timestamptz not null,
  reason jsonb not null default '{}'::jsonb check (jsonb_typeof(reason) = 'object'),
  policy_outcome text,
  attempt smallint not null default 0 check (attempt between 0 and 5),
  reschedule_count smallint not null default 0 check (reschedule_count between 0 and 24),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 300),
  claimed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create table public.coach_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  wake_id uuid not null references public.coach_wakes (id) on delete cascade,
  channel text not null check (channel in ('in_app', 'push', 'email')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'suppressed')),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 400),
  provider_id text,
  error_code text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wake_id, channel),
  unique (user_id, idempotency_key)
);

create index venture_entities_user_kind_updated_idx on public.venture_entities (user_id, kind, updated_at desc);
create index venture_entities_source_event_id_idx on public.venture_entities (source_event_id) where source_event_id is not null;
create index venture_entities_active_verified_idx on public.venture_entities (user_id, last_verified_at desc) where status = 'active';
create index venture_links_user_from_idx on public.venture_links (user_id, from_entity_id, relation);
create index venture_links_user_to_idx on public.venture_links (user_id, to_entity_id, relation);
create index venture_links_source_event_id_idx on public.venture_links (source_event_id) where source_event_id is not null;
create index founder_commitments_user_status_due_idx on public.founder_commitments (user_id, status, due_at);
create index founder_commitments_source_event_id_idx on public.founder_commitments (source_event_id) where source_event_id is not null;
create index founder_commitments_completed_event_id_idx on public.founder_commitments (completed_event_id) where completed_event_id is not null;
create index coach_wakes_due_idx on public.coach_wakes (scheduled_for, created_at) where status = 'queued';
create index coach_wakes_user_status_idx on public.coach_wakes (user_id, status, scheduled_for desc);
create index coach_wakes_commitment_id_idx on public.coach_wakes (commitment_id) where commitment_id is not null;
create index coach_deliveries_user_sent_idx on public.coach_deliveries (user_id, sent_at desc) where status = 'sent';
create index coach_deliveries_wake_id_idx on public.coach_deliveries (wake_id);

alter table public.venture_entities enable row level security;
alter table public.venture_links enable row level security;
alter table public.founder_commitments enable row level security;
alter table public.coach_standing_orders enable row level security;
alter table public.coach_wakes enable row level security;
alter table public.coach_deliveries enable row level security;

create policy "read own venture entities" on public.venture_entities for select to authenticated using ((select auth.uid()) = user_id);
create policy "read own venture links" on public.venture_links for select to authenticated using ((select auth.uid()) = user_id);
create policy "read own founder commitments" on public.founder_commitments for select to authenticated using ((select auth.uid()) = user_id);
create policy "read own coach standing orders" on public.coach_standing_orders for select to authenticated using ((select auth.uid()) = user_id);

revoke all on table public.venture_entities, public.venture_links, public.founder_commitments,
  public.coach_standing_orders, public.coach_wakes, public.coach_deliveries from anon, authenticated;
grant select on table public.venture_entities, public.venture_links, public.founder_commitments,
  public.coach_standing_orders to authenticated;
grant all on table public.venture_entities, public.venture_links, public.founder_commitments,
  public.coach_standing_orders, public.coach_wakes, public.coach_deliveries to service_role;
;
