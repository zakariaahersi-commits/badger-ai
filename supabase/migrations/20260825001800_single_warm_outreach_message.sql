-- The cohort panel owns one deterministic, tested message. Specialist agents
-- measure the experiment; they do not generate competing placeholder copy.
create or replace function public.wake_company_warm_outreach_agents()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'active' then
    update public.company_agents
    set next_run_at = now(), updated_at = now()
    where id in ('growth', 'revenue') and status = 'active';
  end if;
  return new;
end;
$$;

update public.company_actions as action
set status = 'rejected',
    result = coalesce(action.result, '{}'::jsonb) || jsonb_build_object(
      'stored', true,
      'sent', false,
      'superseded', true,
      'reason', 'deterministic_warm_message_is_source_of_truth'
    ),
    error_code = null,
    executed_at = now()
from public.company_experiments as experiment
where experiment.id = action.experiment_id
  and experiment.channel = 'warm_dm'
  and action.status = 'completed'
  and (
    (action.agent_id = 'content' and action.action_type = 'draft_campaign')
    or (action.agent_id = 'growth' and action.action_type = 'create_internal_report')
  );

insert into public.company_audit_log (
  actor_type, actor_id, event_type, object_type, object_id, details
) values (
  'system', 'warm_outreach_copy_gate', 'warm_outreach.copy_source_locked',
  'company_os', 'badger',
  jsonb_build_object('source', 'company_outreach_batches', 'competingDraftsSent', false)
);

