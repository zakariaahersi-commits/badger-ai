-- Bygga cloud schema. Run once in the Supabase SQL editor.
-- Tables: profiles (for nudges), sprints (synced app state), posts, comments.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text not null default '',
  idea_short text not null default '',
  plan_start timestamptz,
  notify boolean not null default true,
  avatar_path text check (avatar_path is null or char_length(avatar_path) <= 1000),
  created_at timestamptz not null default now()
);

create table if not exists public.sprints (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  body text not null check (char_length(body) <= 600),
  tag text check (tag in ('win', 'kill', 'stuck')),
  week text not null default '',
  fire int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  body text not null check (char_length(body) <= 300),
  created_at timestamptz not null default now()
);

-- Row level security
alter table public.profiles enable row level security;
alter table public.sprints enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;

create policy "own profile" on public.profiles
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "own sprint" on public.sprints
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.posts from anon, authenticated;
revoke all on table public.comments from anon, authenticated;
grant select, insert on table public.posts to authenticated;
grant select, insert on table public.comments to authenticated;

-- One fire per signed-in person and post. The trigger function lives outside
-- the exposed API schema and cannot be called directly.
create table if not exists public.post_fires (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.post_fires enable row level security;
revoke all on table public.post_fires from anon, authenticated;
grant insert on table public.post_fires to authenticated;

create schema if not exists private;
create or replace function private.apply_post_fire_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.posts set fire = fire + 1 where id = new.post_id;
  return new;
end;
$$;
revoke all on function private.apply_post_fire_count() from public, anon, authenticated;
create trigger post_fires_increment
after insert on public.post_fires
for each row execute function private.apply_post_fire_count();

-- Cross-user learning signals (anonymized, no PII). Written server-side only
-- (the /api/learn route uses the service role key). RLS is on with no policy,
-- so clients have no access; the service role bypasses RLS. This lets Bo learn
-- which task/coaching patterns actually precede real progress, across everyone.
create table if not exists public.signals (
  id bigint generated always as identity primary key,
  track text not null,
  task_type text,
  day_num int,
  outcome text not null,           -- 'progress' | 'yes' | 'paid' | 'shipped' | 'killed'
  created_at timestamptz not null default now()
);
alter table public.signals enable row level security;

-- Durable Bo orchestration. The model proposes typed turns; these tables are
-- the server-authoritative record of what was considered, approved, run, and
-- learned. Clients may read their own rows. Only server routes write them.
create table if not exists public.coach_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  idempotency_key text not null,
  trigger_type text not null default 'message',
  mode text not null check (mode in ('onboarding', 'sprint', 'checkpoint', 'graduate')),
  status text not null check (status in ('running', 'waiting_approval', 'completed', 'failed', 'cancelled', 'budget_exhausted')),
  attempt int not null default 1 check (attempt between 1 and 3),
  max_steps int not null default 3 check (max_steps between 1 and 3),
  step_count int not null default 0,
  model text,
  prompt_tokens int not null default 0,
  completion_tokens int not null default 0,
  latency_ms int not null default 0,
  fallback boolean not null default false,
  safety_outcome text not null default 'none',
  input_summary jsonb not null default '{}'::jsonb,
  result jsonb,
  error_code text,
  started_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create table if not exists public.domain_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  run_id uuid references public.coach_runs (id) on delete cascade,
  event_type text not null,
  entity_type text,
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create table if not exists public.action_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  run_id uuid not null references public.coach_runs (id) on delete cascade,
  action_type text not null,
  title text not null,
  summary text not null default '',
  payload jsonb not null default '{}'::jsonb,
  risk text not null check (risk in ('read', 'draft', 'external', 'financial', 'code', 'permissions', 'memory')),
  approval_required boolean not null default true,
  status text not null check (status in ('pending', 'approved', 'rejected', 'running', 'completed', 'failed', 'cancelled', 'expired')),
  idempotency_key text not null,
  expires_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create table if not exists public.action_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  action_request_id uuid not null references public.action_requests (id) on delete cascade,
  attempt int not null default 1 check (attempt between 1 and 3),
  status text not null check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  output jsonb,
  error_code text,
  available_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (action_request_id, attempt)
);

create table if not exists public.coach_artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  run_id uuid not null references public.coach_runs (id) on delete cascade,
  action_request_id uuid references public.action_requests (id) on delete set null,
  kind text not null,
  content jsonb not null default '{}'::jsonb,
  content_digest text,
  created_at timestamptz not null default now()
);

create table if not exists public.coach_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  run_id uuid references public.coach_runs (id) on delete set null,
  kind text not null check (kind in ('fact', 'preference', 'commitment', 'blocker', 'intervention', 'lesson')),
  content text not null check (char_length(content) <= 1000),
  confidence numeric(3,2) not null default 0.50 check (confidence between 0 and 1),
  status text not null check (status in ('pending', 'approved', 'rejected')),
  source_event_id uuid references public.domain_events (id) on delete set null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unique (user_id, idempotency_key)
);

create index if not exists coach_runs_user_started_idx on public.coach_runs (user_id, started_at desc);
create index if not exists domain_events_user_created_idx on public.domain_events (user_id, created_at desc);
create index if not exists action_requests_user_status_idx on public.action_requests (user_id, status, created_at desc);
create index if not exists coach_memories_user_status_idx on public.coach_memories (user_id, status, created_at desc);
create index if not exists posts_user_id_idx on public.posts (user_id);
create index if not exists post_fires_user_id_idx on public.post_fires (user_id);
create index if not exists comments_post_id_idx on public.comments (post_id);
create index if not exists comments_user_id_idx on public.comments (user_id);
create index if not exists domain_events_run_id_idx on public.domain_events (run_id);
create index if not exists action_requests_run_id_idx on public.action_requests (run_id);
create index if not exists action_runs_user_id_idx on public.action_runs (user_id);
create index if not exists action_runs_queue_idx on public.action_runs (status, available_at) where status = 'queued';
create index if not exists coach_artifacts_user_id_idx on public.coach_artifacts (user_id);
create index if not exists coach_artifacts_run_id_idx on public.coach_artifacts (run_id);
create index if not exists coach_artifacts_action_request_id_idx on public.coach_artifacts (action_request_id);
create index if not exists coach_memories_run_id_idx on public.coach_memories (run_id);
create index if not exists coach_memories_source_event_id_idx on public.coach_memories (source_event_id);

alter table public.coach_runs enable row level security;
alter table public.domain_events enable row level security;
alter table public.action_requests enable row level security;
alter table public.action_runs enable row level security;
alter table public.coach_artifacts enable row level security;
alter table public.coach_memories enable row level security;

create policy "read own coach runs" on public.coach_runs for select to authenticated using ((select auth.uid()) = user_id);
create policy "read own domain events" on public.domain_events for select to authenticated using ((select auth.uid()) = user_id);
create policy "read own action requests" on public.action_requests for select to authenticated using ((select auth.uid()) = user_id);
create policy "read own action runs" on public.action_runs for select to authenticated using ((select auth.uid()) = user_id);
create policy "read own coach artifacts" on public.coach_artifacts for select to authenticated using ((select auth.uid()) = user_id);
create policy "read own coach memories" on public.coach_memories for select to authenticated using ((select auth.uid()) = user_id);

-- Explicit Data API grants. RLS still decides which rows are visible.
grant select, insert, update on public.profiles, public.sprints to authenticated;
grant select on public.posts, public.comments to anon, authenticated;
grant insert on public.posts, public.comments to authenticated;
grant insert on public.post_fires to authenticated;
grant select on public.coach_runs, public.domain_events, public.action_requests,
  public.action_runs, public.coach_artifacts, public.coach_memories to authenticated;

-- Device-level Web Push opt-in. Server routes use the service key; clients
-- receive no table grants or RLS policies, keeping subscription keys private.
create table if not exists public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) between 12 and 2048),
  p256dh text not null check (char_length(p256dh) between 8 and 512),
  auth text not null check (char_length(auth) between 8 and 512),
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from anon, authenticated;

-- Founder/Venture Brain: sourced business knowledge, explicit promises and
-- event-driven accountability. Server routes write; founders read their own
-- knowledge and commitments.
create table if not exists public.venture_entities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('customer', 'problem', 'hypothesis', 'experiment', 'evidence', 'decision', 'promise', 'task', 'skill', 'payment')),
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

create table if not exists public.venture_links (
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

create table if not exists public.founder_commitments (
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

create table if not exists public.coach_standing_orders (
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

create table if not exists public.coach_wakes (
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

create table if not exists public.coach_deliveries (
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

create index if not exists venture_entities_user_kind_updated_idx on public.venture_entities (user_id, kind, updated_at desc);
create index if not exists venture_entities_source_event_id_idx on public.venture_entities (source_event_id) where source_event_id is not null;
create index if not exists venture_entities_active_verified_idx on public.venture_entities (user_id, last_verified_at desc) where status = 'active';
create index if not exists venture_links_user_from_idx on public.venture_links (user_id, from_entity_id, relation);
create index if not exists venture_links_user_to_idx on public.venture_links (user_id, to_entity_id, relation);
create index if not exists venture_links_from_entity_id_idx on public.venture_links (from_entity_id);
create index if not exists venture_links_to_entity_id_idx on public.venture_links (to_entity_id);
create index if not exists venture_links_source_event_id_idx on public.venture_links (source_event_id) where source_event_id is not null;
create index if not exists founder_commitments_user_status_due_idx on public.founder_commitments (user_id, status, due_at);
create index if not exists founder_commitments_source_event_id_idx on public.founder_commitments (source_event_id) where source_event_id is not null;
create index if not exists founder_commitments_completed_event_id_idx on public.founder_commitments (completed_event_id) where completed_event_id is not null;
create index if not exists coach_wakes_due_idx on public.coach_wakes (scheduled_for, created_at) where status = 'queued';
create index if not exists coach_wakes_user_status_idx on public.coach_wakes (user_id, status, scheduled_for desc);
create index if not exists coach_wakes_commitment_id_idx on public.coach_wakes (commitment_id) where commitment_id is not null;
create index if not exists coach_deliveries_user_sent_idx on public.coach_deliveries (user_id, sent_at desc) where status = 'sent';
create index if not exists coach_deliveries_wake_id_idx on public.coach_deliveries (wake_id);

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

-- Server-authoritative access. Checkout and Stripe webhooks write with the
-- service role; signed-in users may only read their own entitlement.
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
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on table public.entitlements from anon, authenticated;
grant select on table public.entitlements to authenticated;
grant all on table public.entitlements to service_role;

-- Community rows may contain commercially sensitive founder context. The
-- public tables are available only to accounts with an active paid journey.
create policy "paid members read posts" on public.posts
  for select to authenticated using (
    exists (
      select 1 from public.entitlements
      where user_id = (select auth.uid()) and product = 'badger-28-day' and status = 'active'
    )
  );
create policy "paid members write own posts" on public.posts
  for insert to authenticated with check (
    (select auth.uid()) = user_id and exists (
      select 1 from public.entitlements
      where user_id = (select auth.uid()) and product = 'badger-28-day' and status = 'active'
    )
  );
create policy "paid members read comments" on public.comments
  for select to authenticated using (
    exists (
      select 1 from public.entitlements
      where user_id = (select auth.uid()) and product = 'badger-28-day' and status = 'active'
    )
  );
create policy "paid members write own comments" on public.comments
  for insert to authenticated with check (
    (select auth.uid()) = user_id and exists (
      select 1 from public.entitlements
      where user_id = (select auth.uid()) and product = 'badger-28-day' and status = 'active'
    )
  );
create policy "paid members write own post fires" on public.post_fires
  for insert to authenticated with check (
    (select auth.uid()) = user_id and exists (
      select 1 from public.entitlements
      where user_id = (select auth.uid()) and product = 'badger-28-day' and status = 'active'
    )
  );

-- Users control journey reminders independently from the paid product. The
-- authenticated role may read/update only its own row; server routes create it.
create table if not exists public.email_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  journey_nudges_enabled boolean not null default false,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((journey_nudges_enabled and unsubscribed_at is null) or (not journey_nudges_enabled and unsubscribed_at is not null))
);
alter table public.email_preferences enable row level security;
create policy "read own email preferences" on public.email_preferences for select to authenticated using ((select auth.uid()) = user_id);
create policy "update own email preferences" on public.email_preferences for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on table public.email_preferences from anon, authenticated;
grant select, update on table public.email_preferences to authenticated;
grant all on table public.email_preferences to service_role;

-- A founder who reaches Stripe but does not pay receives at most two useful
-- reminders. This table never grants access and is not client-readable.
create table if not exists public.checkout_recoveries (
  user_id uuid primary key references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'converted', 'opted_out')),
  checkout_started_at timestamptz not null,
  last_checkout_session_id text not null unique,
  reminder_count smallint not null default 0 check (reminder_count between 0 and 2),
  first_reminder_at timestamptz,
  final_reminder_at timestamptz,
  converted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (converted_at is null or status = 'converted')
);
create index if not exists checkout_recoveries_pending_idx on public.checkout_recoveries (checkout_started_at, user_id) where status = 'pending' and reminder_count < 2;
alter table public.checkout_recoveries enable row level security;
revoke all on table public.checkout_recoveries from anon, authenticated;
grant all on table public.checkout_recoveries to service_role;

-- Verified Resend webhook events for per-user send/open/click reporting.
create table if not exists public.email_events (
  id bigint generated always as identity primary key,
  svix_id text not null unique,
  resend_email_id text not null,
  user_id uuid references auth.users (id) on delete set null,
  recipient text not null check (char_length(recipient) between 3 and 320),
  event_type text not null check (event_type in ('email.sent', 'email.delivered', 'email.delivery_delayed', 'email.opened', 'email.clicked', 'email.bounced', 'email.complained', 'email.failed', 'email.suppressed')),
  subject text check (subject is null or char_length(subject) <= 300),
  link_url text check (link_url is null or char_length(link_url) <= 2000),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists email_events_user_occurred_idx on public.email_events (user_id, occurred_at desc) where user_id is not null;
create index if not exists email_events_email_type_idx on public.email_events (resend_email_id, event_type, occurred_at desc);
alter table public.email_events enable row level security;
revoke all on table public.email_events from anon, authenticated;
grant all on table public.email_events to service_role;
grant usage, select on sequence public.email_events_id_seq to service_role;

create table if not exists public.stripe_webhook_events (
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
create index if not exists stripe_webhook_events_status_updated_idx
  on public.stripe_webhook_events (status, updated_at desc);
alter table public.stripe_webhook_events enable row level security;
revoke all on table public.stripe_webhook_events from anon, authenticated;
grant all on table public.stripe_webhook_events to service_role;
grant usage, select on sequence public.stripe_webhook_events_id_seq to service_role;

-- Minimal first-party product events and client error reports. The browser
-- writes through a bounded API route; raw event rows are server-only.
create table if not exists public.product_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete cascade,
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
  on public.product_events (user_id, created_at desc) where user_id is not null;
alter table public.product_events enable row level security;
revoke all on table public.product_events from anon, authenticated;
grant all on table public.product_events to service_role;

-- Server-only AI usage ledger. This powers owner cost and reliability views.
-- Clients receive no grants or RLS policies, so normal users cannot read it.
create table if not exists public.ai_usage_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  feature text not null check (char_length(feature) between 1 and 80),
  provider text not null check (char_length(provider) between 1 and 40),
  model text not null check (char_length(model) between 1 and 120),
  prompt_tokens integer not null default 0 check (prompt_tokens >= 0),
  completion_tokens integer not null default 0 check (completion_tokens >= 0),
  audio_seconds numeric(10,2) not null default 0 check (audio_seconds >= 0),
  estimated_cost_usd numeric(14,8) not null default 0 check (estimated_cost_usd >= 0),
  latency_ms integer not null default 0 check (latency_ms >= 0),
  success boolean not null default true,
  error_code text check (error_code is null or char_length(error_code) <= 120),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_events_created_idx on public.ai_usage_events (created_at desc);
create index if not exists ai_usage_events_feature_created_idx on public.ai_usage_events (feature, created_at desc);
create index if not exists ai_usage_events_user_created_idx on public.ai_usage_events (user_id, created_at desc) where user_id is not null;
alter table public.ai_usage_events enable row level security;
revoke all on table public.ai_usage_events from anon, authenticated;
grant all on table public.ai_usage_events to service_role;

-- Founder Activity Graph. Public URLs can be checked immediately; direct
-- Stripe, email and social connectors can add verified rows later.
create table if not exists public.evidence_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  day_num smallint check (day_num between 1 and 28),
  claim_type text not null check (claim_type in ('validate', 'build', 'market', 'revenue', 'reflection', 'call', 'kill', 'payment', 'other')),
  source_type text not null check (source_type in ('self_report', 'public_url', 'screenshot', 'stripe', 'gmail', 'social', 'manual_review')),
  status text not null default 'self_reported' check (status in ('self_reported', 'submitted', 'checked', 'verified', 'rejected')),
  claim_summary text not null check (char_length(claim_summary) between 1 and 1000),
  source_url text check (source_url is null or char_length(source_url) <= 2000),
  verifier text check (verifier is null or char_length(verifier) <= 120),
  verdict_note text check (verdict_note is null or char_length(verdict_note) <= 500),
  external_ref text check (external_ref is null or char_length(external_ref) <= 500),
  occurred_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists evidence_records_user_created_idx on public.evidence_records (user_id, created_at desc);
create index if not exists evidence_records_user_status_created_idx on public.evidence_records (user_id, status, created_at desc);
alter table public.evidence_records enable row level security;
create policy "read own evidence records" on public.evidence_records for select to authenticated using ((select auth.uid()) = user_id);
revoke all on table public.evidence_records from anon, authenticated;
grant select on table public.evidence_records to authenticated;
grant all on table public.evidence_records to service_role;

create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null check (category in ('bug', 'confusing', 'idea', 'billing')),
  severity text not null check (severity in ('low', 'medium', 'high', 'blocking')),
  status text not null default 'new' check (status in ('new', 'triaged', 'in_progress', 'resolved', 'closed')),
  summary text not null check (char_length(summary) between 1 and 180),
  details text not null check (char_length(details) between 1 and 3000),
  path text check (path is null or char_length(path) <= 300),
  browser text check (browser is null or char_length(browser) <= 500),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bug_reports_status_created_idx on public.bug_reports (status, created_at desc);
create index if not exists bug_reports_user_created_idx on public.bug_reports (user_id, created_at desc);
alter table public.bug_reports enable row level security;
revoke all on table public.bug_reports from anon, authenticated;
grant all on table public.bug_reports to service_role;

-- iMessage pilot: server-only identity linking, consent, delivery telemetry,
-- and idempotent daily sends. Phone numbers and raw webhook payloads are
-- encrypted by the application before they reach these tables.
create table if not exists public.messaging_channels (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('linq', 'sendblue')),
  provider_chat_id text not null check (char_length(provider_chat_id) between 1 and 200),
  phone_hash text not null unique check (char_length(phone_hash) = 64),
  phone_ciphertext text not null check (char_length(phone_ciphertext) between 24 and 1000),
  status text not null default 'active' check (status in ('active', 'paused', 'opted_out')),
  consent_at timestamptz not null,
  paused_at timestamptz,
  opted_out_at timestamptz,
  preferred_reminder_time time not null default '09:00',
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 80),
  conversation_state text not null default 'coaching'
    check (conversation_state in ('coaching', 'awaiting_done_learning')),
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider),
  unique (provider, provider_chat_id),
  check ((status = 'paused') = (paused_at is not null)),
  check ((status = 'opted_out') = (opted_out_at is not null))
);
create index if not exists messaging_channels_active_schedule_idx
  on public.messaging_channels (timezone, preferred_reminder_time, user_id)
  where status = 'active';

create table if not exists public.messaging_link_codes (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('linq', 'sendblue')),
  code_digest text not null unique check (char_length(code_digest) = 64),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, provider),
  check (expires_at > created_at),
  check (used_at is null or used_at >= created_at)
);
create index if not exists messaging_link_codes_active_idx
  on public.messaging_link_codes (code_digest, expires_at)
  where used_at is null;

create table if not exists public.messaging_webhook_events (
  id bigint generated always as identity primary key,
  provider text not null check (provider in ('linq', 'sendblue')),
  provider_event_id text not null,
  event_type text not null check (char_length(event_type) between 1 and 100),
  payload_digest text not null check (char_length(payload_digest) = 64),
  payload_ciphertext text not null check (char_length(payload_ciphertext) between 24 and 100000),
  status text not null default 'queued' check (status in ('queued', 'processing', 'processed', 'ignored', 'failed')),
  attempt_count smallint not null default 0 check (attempt_count between 0 and 3),
  last_error text check (last_error is null or char_length(last_error) <= 500),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, provider_event_id)
);
create index if not exists messaging_webhook_events_queue_idx
  on public.messaging_webhook_events (received_at, id)
  where status in ('queued', 'failed') and attempt_count < 3;

create table if not exists public.messaging_activity (
  id bigint generated always as identity primary key,
  channel_id bigint references public.messaging_channels (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  provider text not null check (provider in ('linq', 'sendblue')),
  direction text not null check (direction in ('inbound', 'outbound', 'system')),
  event_kind text not null check (event_kind in ('linked', 'message', 'command', 'evidence', 'delivered', 'read', 'failed', 'paused', 'resumed', 'opted_out')),
  provider_message_id text check (provider_message_id is null or char_length(provider_message_id) <= 200),
  command text check (command is null or command in ('START', 'DONE', 'STUCK', 'TODAY', 'PLAN', 'PAUSE', 'RESUME', 'STOP')),
  body_length_bucket text check (body_length_bucket is null or body_length_bucket in ('0', '1-40', '41-160', '161-500', '501+')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);
create index if not exists messaging_activity_user_created_idx
  on public.messaging_activity (user_id, created_at desc)
  where user_id is not null;
create index if not exists messaging_activity_channel_created_idx
  on public.messaging_activity (channel_id, created_at desc)
  where channel_id is not null;

create table if not exists public.messaging_daily_sends (
  id bigint generated always as identity primary key,
  channel_id bigint not null references public.messaging_channels (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  local_date date not null,
  send_kind text not null check (send_kind in ('morning_task', 'follow_up')),
  status text not null default 'reserved' check (status in ('reserved', 'sent', 'failed', 'cancelled')),
  attempt_count smallint not null default 1 check (attempt_count between 1 and 3),
  provider_message_id text check (provider_message_id is null or char_length(provider_message_id) <= 200),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (channel_id, local_date, send_kind),
  check ((status = 'sent') = (sent_at is not null))
);
create index if not exists messaging_daily_sends_user_date_idx
  on public.messaging_daily_sends (user_id, local_date desc);

alter table public.messaging_channels enable row level security;
alter table public.messaging_link_codes enable row level security;
alter table public.messaging_webhook_events enable row level security;
alter table public.messaging_activity enable row level security;
alter table public.messaging_daily_sends enable row level security;
revoke all on table public.messaging_channels from anon, authenticated;
revoke all on table public.messaging_link_codes from anon, authenticated;
revoke all on table public.messaging_webhook_events from anon, authenticated;
revoke all on table public.messaging_activity from anon, authenticated;
revoke all on table public.messaging_daily_sends from anon, authenticated;
grant all on table public.messaging_channels to service_role;
grant all on table public.messaging_link_codes to service_role;
grant all on table public.messaging_webhook_events to service_role;
grant all on table public.messaging_activity to service_role;
grant all on table public.messaging_daily_sends to service_role;
grant usage, select on sequence public.messaging_channels_id_seq to service_role;
grant usage, select on sequence public.messaging_link_codes_id_seq to service_role;
grant usage, select on sequence public.messaging_webhook_events_id_seq to service_role;
grant usage, select on sequence public.messaging_activity_id_seq to service_role;
grant usage, select on sequence public.messaging_daily_sends_id_seq to service_role;
