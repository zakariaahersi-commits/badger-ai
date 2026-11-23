create table public.ai_usage_events (
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

create index ai_usage_events_created_idx
  on public.ai_usage_events (created_at desc);
create index ai_usage_events_feature_created_idx
  on public.ai_usage_events (feature, created_at desc);
create index ai_usage_events_user_created_idx
  on public.ai_usage_events (user_id, created_at desc)
  where user_id is not null;

alter table public.ai_usage_events enable row level security;
revoke all on table public.ai_usage_events from anon, authenticated;
grant all on table public.ai_usage_events to service_role;

-- Preserve the token history already recorded by the durable coach runner.
insert into public.ai_usage_events (
  user_id, feature, provider, model, prompt_tokens, completion_tokens,
  estimated_cost_usd, latency_ms, success, error_code, metadata, created_at
)
select
  user_id,
  'coach_chat',
  'deepseek',
  coalesce(model, 'unknown'),
  prompt_tokens,
  completion_tokens,
  case
    when lower(coalesce(model, '')) like '%pro%'
      then ((prompt_tokens * 0.435 + completion_tokens * 0.87) / 1000000.0)::numeric(14,8)
    else ((prompt_tokens * 0.14 + completion_tokens * 0.28) / 1000000.0)::numeric(14,8)
  end,
  latency_ms,
  status not in ('failed', 'cancelled'),
  error_code,
  jsonb_build_object('backfilled_from', 'coach_runs'),
  started_at
from public.coach_runs
where prompt_tokens > 0 or completion_tokens > 0;
