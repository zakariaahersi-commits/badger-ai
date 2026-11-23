-- Guarded mode should complete harmless internal work without filling the
-- chairman's approval queue. This does not grant any external, code,
-- financial, permission, or legal authority.

update public.company_agents
set
  autonomy = 'draft',
  updated_at = now()
where id in ('ceo', 'revenue', 'compliance')
  and autonomy = 'observe';

insert into public.company_audit_log (
  actor_type,
  actor_id,
  event_type,
  object_type,
  object_id,
  details
)
values (
  'system',
  'migration_20260818190944',
  'authority.defaults_updated',
  'company_os_settings',
  'badger',
  jsonb_build_object(
    'agents', jsonb_build_array('ceo', 'revenue', 'compliance'),
    'autonomy', 'draft',
    'scope', 'internal_and_draft_actions_only'
  )
);

-- Safe internal artifacts created while these agents were observe-only are
-- already stored. Settle them without pretending that anything external ran.
insert into public.company_audit_log (
  actor_type,
  actor_id,
  event_type,
  object_type,
  object_id,
  details
)
select
  'system',
  'migration_20260818190944',
  'action.completed',
  'company_action',
  action.id,
  jsonb_build_object('reason', 'guarded_internal_authority_enabled')
from public.company_actions as action
where action.status = 'proposed'
  and action.agent_id in ('ceo', 'revenue', 'compliance')
  and action.action_type in (
    'record_observation',
    'create_internal_report',
    'draft_customer_message',
    'draft_campaign',
    'prepare_bug_fix',
    'propose_experiment'
  );

update public.company_actions
set
  status = 'completed',
  requires_approval = false,
  result = coalesce(result, '{}'::jsonb) || jsonb_build_object(
    'stored', true,
    'settledBy', 'guarded_internal_authority_enabled'
  ),
  error_code = null,
  executed_at = now()
where status = 'proposed'
  and agent_id in ('ceo', 'revenue', 'compliance')
  and action_type in (
    'record_observation',
    'create_internal_report',
    'draft_customer_message',
    'draft_campaign',
    'prepare_bug_fix',
    'propose_experiment'
  );

-- Old owner alerts may describe conditions that have already changed (for
-- example, the now-resolved no-active-goal warning). Expire rather than send
-- them during the authority transition.
insert into public.company_audit_log (
  actor_type,
  actor_id,
  event_type,
  object_type,
  object_id,
  details
)
select
  'system',
  'migration_20260818190944',
  'action.expired',
  'company_action',
  action.id,
  jsonb_build_object('reason', 'stale_owner_alert_after_authority_update')
from public.company_actions as action
where action.status = 'proposed'
  and action.agent_id in ('ceo', 'revenue', 'compliance')
  and action.action_type = 'send_owner_alert';

update public.company_actions
set
  status = 'expired',
  error_code = 'stale_after_authority_update',
  executed_at = now()
where status = 'proposed'
  and agent_id in ('ceo', 'revenue', 'compliance')
  and action_type = 'send_owner_alert';

update public.company_runs as run
set
  status = 'completed',
  completed_at = coalesce(run.completed_at, now())
where run.status = 'waiting_approval'
  and not exists (
    select 1
    from public.company_actions as action
    where action.run_id = run.id
      and action.status = 'proposed'
  );
