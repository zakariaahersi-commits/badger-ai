-- The model can only propose actions assigned to its specialist role. The app
-- enforces this before persistence; this trigger is the fail-closed backstop
-- for future workers that use the service role directly.
create or replace function private.enforce_company_action_allowlist()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  permitted_actions text[];
begin
  select agent.allowed_actions
    into permitted_actions
    from public.company_agents as agent
    where agent.id = new.agent_id;

  if permitted_actions is null or not (new.action_type = any(permitted_actions)) then
    raise exception 'company action is outside the agent allowlist'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_company_action_allowlist() from public, anon, authenticated;
grant execute on function private.enforce_company_action_allowlist() to service_role;

-- Cancel the fail-closed proposal discovered by the first production smoke,
-- and preserve why it disappeared from the owner queue in the audit trail.
with cancelled as (
  update public.company_actions as action
    set status = 'cancelled',
        error_code = 'outside_agent_allowlist',
        result = jsonb_build_object('reason', 'outside_agent_allowlist')
    from public.company_agents as agent
    where action.agent_id = agent.id
      and not (action.action_type = any(agent.allowed_actions))
      and action.status in ('proposed', 'approved')
    returning action.id, action.agent_id, action.action_type
)
insert into public.company_audit_log (
  actor_type, actor_id, event_type, object_type, object_id, details
)
select
  'system',
  'allowlist_migration',
  'action.cancelled',
  'company_action',
  cancelled.id::text,
  jsonb_build_object(
    'agentId', cancelled.agent_id,
    'actionType', cancelled.action_type,
    'reason', 'outside_agent_allowlist'
  )
from cancelled;

drop trigger if exists company_actions_enforce_allowlist on public.company_actions;
create trigger company_actions_enforce_allowlist
before insert or update of agent_id, action_type on public.company_actions
for each row execute function private.enforce_company_action_allowlist();
