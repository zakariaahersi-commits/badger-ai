-- Bygga cloud schema. Run once in the Supabase SQL editor.
-- Tables: profiles (for nudges), sprints (synced app state), posts, comments.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text not null default '',
  idea_short text not null default '',
  plan_start timestamptz,
  notify boolean not null default true,
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
create policy "read posts" on public.posts for select to anon, authenticated using (true);
create policy "write own posts" on public.posts
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "read comments" on public.comments for select to anon, authenticated using (true);
create policy "write own comments" on public.comments
  for insert to authenticated with check ((select auth.uid()) = user_id);
-- One fire per signed-in person and post. The trigger function lives outside
-- the exposed API schema and cannot be called directly.
create table if not exists public.post_fires (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.post_fires enable row level security;
create policy "write own post fires" on public.post_fires
  for insert to authenticated with check ((select auth.uid()) = user_id);
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
