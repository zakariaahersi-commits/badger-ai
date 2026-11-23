-- Badger Company OS is a server-only control plane. Models can propose work,
-- but immutable application policy and an authenticated owner grant authority.
create table public.company_os_settings (
  id text primary key check (id = 'badger'),
  mode text not null default 'guarded' check (mode in ('observe', 'guarded', 'active')),
  paused boolean not null default false,
  pause_reason text check (pause_reason is null or char_length(pause_reason) <= 500),
  max_daily_ai_spend_usd numeric(10,2) not null default 3 check (max_daily_ai_spend_usd between 0 and 10000),
  max_daily_emails integer not null default 25 check (max_daily_emails between 0 and 100000),
  max_daily_social_posts integer not null default 2 check (max_daily_social_posts between 0 and 1000),
  max_daily_deploys integer not null default 1 check (max_daily_deploys between 0 and 100),
  max_daily_engineering_jobs integer not null default 3 check (max_daily_engineering_jobs between 0 and 1000),
  autonomous_customer_emails boolean not null default false,
  autonomous_social_posts boolean not null default false,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.company_agents (
  id text primary key,
  label text not null check (char_length(label) between 1 and 80),
  mission text not null check (char_length(mission) between 1 and 1000),
  status text not null default 'active' check (status in ('active', 'paused', 'degraded')),
  autonomy text not null default 'observe' check (autonomy in ('observe', 'draft', 'bounded', 'disabled')),
  schedule_minutes integer not null default 60 check (schedule_minutes between 15 and 10080),
  daily_budget_usd numeric(10,2) not null default 0.50 check (daily_budget_usd between 0 and 1000),
  allowed_actions text[] not null default '{}',
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  last_run_at timestamptz,
  next_run_at timestamptz not null default now(),
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index company_agents_due_idx on public.company_agents (next_run_at, id) where status = 'active' and autonomy <> 'disabled';

create table public.company_goals (
  id bigint generated always as identity primary key,
  title text not null check (char_length(title) between 1 and 180),
  metric text not null check (char_length(metric) between 1 and 100),
  target_value numeric(16,4) not null,
  current_value numeric(16,4) not null default 0,
  unit text not null default 'count' check (char_length(unit) between 1 and 30),
  status text not null default 'active' check (status in ('draft', 'active', 'achieved', 'paused', 'cancelled')),
  owner_agent_id text references public.company_agents (id) on delete set null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
create index company_goals_owner_idx on public.company_goals (owner_agent_id) where owner_agent_id is not null;
create index company_goals_active_idx on public.company_goals (status, ends_at) where status in ('draft', 'active');

create table public.company_runs (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null references public.company_agents (id) on delete restrict,
  trigger_type text not null check (trigger_type in ('schedule', 'manual', 'event', 'recovery')),
  status text not null default 'queued' check (status in ('queued', 'running', 'waiting_approval', 'completed', 'failed', 'cancelled', 'budget_exhausted')),
  summary text check (summary is null or char_length(summary) <= 2000),
  input jsonb not null default '{}'::jsonb check (jsonb_typeof(input) = 'object'),
  output jsonb not null default '{}'::jsonb check (jsonb_typeof(output) = 'object'),
  estimated_cost_usd numeric(14,8) not null default 0 check (estimated_cost_usd >= 0),
  prompt_tokens integer not null default 0 check (prompt_tokens >= 0),
  completion_tokens integer not null default 0 check (completion_tokens >= 0),
  latency_ms integer not null default 0 check (latency_ms >= 0),
  idempotency_key text not null unique check (char_length(idempotency_key) between 8 and 240),
  error_code text check (error_code is null or char_length(error_code) <= 120),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index company_runs_agent_created_idx on public.company_runs (agent_id, created_at desc);
create index company_runs_status_created_idx on public.company_runs (status, created_at desc);

create table public.company_actions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.company_runs (id) on delete cascade,
  agent_id text not null references public.company_agents (id) on delete restrict,
  action_type text not null check (char_length(action_type) between 1 and 80),
  risk text not null check (risk in ('read', 'draft', 'internal', 'external', 'code', 'financial', 'permissions', 'legal')),
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected', 'executing', 'delegated', 'completed', 'failed', 'cancelled', 'expired')),
  requires_approval boolean not null default true,
  title text not null check (char_length(title) between 1 and 180),
  rationale text not null check (char_length(rationale) between 1 and 1200),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  result jsonb not null default '{}'::jsonb check (jsonb_typeof(result) = 'object'),
  idempotency_key text not null unique check (char_length(idempotency_key) between 8 and 240),
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  rejected_by uuid references auth.users (id) on delete set null,
  rejected_at timestamptz,
  expires_at timestamptz,
  executed_at timestamptz,
  error_code text check (error_code is null or char_length(error_code) <= 120),
  attempt_count smallint not null default 0 check (attempt_count between 0 and 3),
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index company_actions_run_idx on public.company_actions (run_id, created_at);
create index company_actions_agent_idx on public.company_actions (agent_id, created_at desc);
create index company_actions_approval_idx on public.company_actions (status, created_at desc) where requires_approval and status = 'proposed';
create index company_actions_execution_idx on public.company_actions (available_at, created_at) where status = 'approved' and action_type in ('send_customer_email', 'publish_social_content', 'queue_engineering_work');

create table public.company_audit_log (
  id bigint generated always as identity primary key,
  actor_type text not null check (actor_type in ('system', 'agent', 'owner', 'cron')),
  actor_id text not null check (char_length(actor_id) between 1 and 160),
  event_type text not null check (char_length(event_type) between 1 and 120),
  object_type text not null check (char_length(object_type) between 1 and 80),
  object_id text not null check (char_length(object_id) between 1 and 240),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);
create index company_audit_recent_idx on public.company_audit_log (created_at desc);
create index company_audit_object_idx on public.company_audit_log (object_type, object_id, created_at desc);

alter table public.company_os_settings enable row level security;
alter table public.company_agents enable row level security;
alter table public.company_goals enable row level security;
alter table public.company_runs enable row level security;
alter table public.company_actions enable row level security;
alter table public.company_audit_log enable row level security;

revoke all on table public.company_os_settings, public.company_agents, public.company_goals, public.company_runs, public.company_actions, public.company_audit_log from anon, authenticated;
grant all on table public.company_os_settings, public.company_agents, public.company_goals, public.company_runs, public.company_actions, public.company_audit_log to service_role;
grant usage, select on sequence public.company_goals_id_seq, public.company_audit_log_id_seq to service_role;

insert into public.company_os_settings (id) values ('badger') on conflict (id) do nothing;
insert into public.company_agents (id, label, mission, autonomy, schedule_minutes, daily_budget_usd, allowed_actions) values
  ('ceo', 'CEO', 'Prioritise company goals, detect cross-functional risks and turn evidence into a short owner decision brief.', 'observe', 240, 0.40, array['record_observation','create_internal_report','send_owner_alert']),
  ('engineering', 'Engineering', 'Protect product reliability, investigate failures and prepare small, testable fixes without deploying them.', 'draft', 60, 0.60, array['record_observation','create_internal_report','send_owner_alert','prepare_bug_fix','queue_engineering_work']),
  ('customer_success', 'Customer success', 'Detect founders who are stuck, understand their journey and draft considerate recovery help.', 'draft', 60, 0.50, array['record_observation','create_internal_report','draft_customer_message','send_customer_email','send_owner_alert']),
  ('growth', 'Growth', 'Find evidence-backed conversion opportunities and propose measurable experiments.', 'draft', 240, 0.40, array['record_observation','create_internal_report','propose_experiment','draft_campaign']),
  ('content', 'Content', 'Turn real product evidence and founder progress into specific, non-generic draft content.', 'draft', 480, 0.35, array['record_observation','create_internal_report','draft_campaign','publish_social_content']),
  ('revenue', 'Revenue', 'Monitor checkout, payments and recovery signals, then surface revenue risks without changing price or issuing refunds.', 'observe', 120, 0.35, array['record_observation','create_internal_report','send_owner_alert']),
  ('compliance', 'Compliance', 'Audit privacy, consent, permissions and consequential actions; escalate rather than assume authority.', 'observe', 1440, 0.25, array['record_observation','create_internal_report','send_owner_alert']),
  ('qa', 'QA', 'Continuously inspect reliability signals, regressions and launch-critical user journeys.', 'draft', 60, 0.50, array['record_observation','create_internal_report','send_owner_alert','prepare_bug_fix','queue_engineering_work'])
on conflict (id) do nothing;
