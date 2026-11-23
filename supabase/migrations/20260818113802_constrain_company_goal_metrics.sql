-- Company OS goals must be backed by a deterministic metric implementation.
-- This prevents models, future workers, or owner tooling from persisting a
-- direction that the control plane cannot measure from authoritative data.
alter table public.company_goals
  add constraint company_goals_metric_verified_check
  check (metric in (
    'paying_founders',
    'active_entitlements',
    'total_users',
    'tasks_completed_24h',
    'coach_messages_24h',
    'product_events_24h',
    'pending_checkouts',
    'open_bugs',
    'ai_failures_today'
  ));
