-- One commercial plan per Stockholm day keeps the specialist agents aligned
-- around a single acquisition hypothesis instead of producing disconnected
-- reports. These tables are server-only Company OS state.
create table public.company_daily_plans (
  id bigint generated always as identity primary key,
  local_date date not null unique,
  goal_id bigint references public.company_goals (id) on delete set null,
  status text not null default 'active' check (status in ('draft', 'active', 'completed', 'abandoned')),
  objective text not null check (char_length(objective) between 1 and 240),
  bottleneck text not null check (char_length(bottleneck) between 1 and 1200),
  hypothesis text not null check (char_length(hypothesis) between 1 and 1200),
  leading_signal text not null check (char_length(leading_signal) between 1 and 500),
  stop_condition text not null check (char_length(stop_condition) between 1 and 500),
  owner_summary text not null check (char_length(owner_summary) between 1 and 2000),
  source_metrics jsonb not null default '{}'::jsonb check (jsonb_typeof(source_metrics) = 'object'),
  created_by_agent_id text not null default 'ceo' references public.company_agents (id) on delete restrict,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'completed') = (completed_at is not null))
);
create index company_daily_plans_goal_idx on public.company_daily_plans (goal_id, local_date desc) where goal_id is not null;
create index company_daily_plans_active_idx on public.company_daily_plans (local_date desc) where status in ('draft', 'active');

create table public.company_experiments (
  id bigint generated always as identity primary key,
  daily_plan_id bigint not null references public.company_daily_plans (id) on delete cascade,
  owner_agent_id text not null references public.company_agents (id) on delete restrict,
  status text not null default 'planned' check (status in ('planned', 'running', 'measuring', 'won', 'lost', 'stopped')),
  title text not null check (char_length(title) between 1 and 180),
  hypothesis text not null check (char_length(hypothesis) between 1 and 1200),
  audience text not null check (char_length(audience) between 1 and 500),
  channel text not null check (channel in ('instagram', 'email', 'product', 'imessage', 'partnership', 'other')),
  cta text not null check (char_length(cta) between 1 and 300),
  source_code text not null unique check (source_code ~ '^[a-z0-9][a-z0-9_-]{5,63}$'),
  target_metric text not null check (char_length(target_metric) between 1 and 100),
  success_threshold numeric(16,4) not null check (success_threshold >= 0),
  stop_condition text not null check (char_length(stop_condition) between 1 and 500),
  starts_at timestamptz,
  ends_at timestamptz,
  result jsonb not null default '{}'::jsonb check (jsonb_typeof(result) = 'object'),
  learning text check (learning is null or char_length(learning) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create index company_experiments_plan_idx on public.company_experiments (daily_plan_id, created_at desc);
create index company_experiments_active_idx on public.company_experiments (status, updated_at desc) where status in ('planned', 'running', 'measuring');

create table public.company_experiment_observations (
  id bigint generated always as identity primary key,
  experiment_id bigint not null references public.company_experiments (id) on delete cascade,
  metric text not null check (char_length(metric) between 1 and 100),
  value numeric(16,4) not null,
  unit text not null default 'count' check (char_length(unit) between 1 and 30),
  source text not null check (source in ('product_events', 'stripe', 'instagram', 'email', 'imessage', 'manual', 'system')),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index company_experiment_observations_experiment_idx on public.company_experiment_observations (experiment_id, observed_at desc);

alter table public.company_actions
  add column daily_plan_id bigint references public.company_daily_plans (id) on delete set null,
  add column experiment_id bigint references public.company_experiments (id) on delete set null;
create index company_actions_daily_plan_idx on public.company_actions (daily_plan_id, created_at desc) where daily_plan_id is not null;
create index company_actions_experiment_idx on public.company_actions (experiment_id, created_at desc) where experiment_id is not null;

alter table public.company_daily_plans enable row level security;
alter table public.company_experiments enable row level security;
alter table public.company_experiment_observations enable row level security;

revoke all on table public.company_daily_plans, public.company_experiments, public.company_experiment_observations from anon, authenticated;
grant all on table public.company_daily_plans, public.company_experiments, public.company_experiment_observations to service_role;
grant usage, select on sequence public.company_daily_plans_id_seq, public.company_experiments_id_seq, public.company_experiment_observations_id_seq to service_role;
