-- A five-person warm-message cohort is the smallest channel test that matches
-- the owner's observed acquisition signal. Company OS stores no recipient PII:
-- contacts are anonymous numbered slots and the owner records only outcomes.
alter table public.company_experiments
  drop constraint if exists company_experiments_channel_check;

alter table public.company_experiments
  add constraint company_experiments_channel_check
  check (channel in ('instagram', 'social', 'email', 'product', 'imessage', 'partnership', 'warm_dm', 'other'))
  not valid;

alter table public.company_experiments
  validate constraint company_experiments_channel_check;

create table public.company_outreach_batches (
  id bigint generated always as identity primary key,
  experiment_id bigint not null unique references public.company_experiments (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'completed', 'stopped')),
  max_contacts smallint not null default 5 check (max_contacts between 1 and 5),
  opener text not null check (char_length(opener) between 1 and 1000),
  follow_up text not null check (char_length(follow_up) between 1 and 1000),
  starts_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'completed') = (completed_at is not null))
);

create table public.company_outreach_contacts (
  id bigint generated always as identity primary key,
  batch_id bigint not null references public.company_outreach_batches (id) on delete cascade,
  slot smallint not null check (slot between 1 and 5),
  status text not null default 'ready' check (status in ('ready', 'sent', 'replied', 'interested', 'not_interested')),
  sent_at timestamptz,
  replied_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (batch_id, slot),
  check (status = 'ready' or sent_at is not null),
  check (status not in ('replied', 'interested', 'not_interested') or replied_at is not null)
);

create index company_outreach_batches_active_idx on public.company_outreach_batches (updated_at desc) where status = 'active';
create index company_outreach_contacts_batch_idx on public.company_outreach_contacts (batch_id, slot);

alter table public.company_outreach_batches enable row level security;
alter table public.company_outreach_contacts enable row level security;

revoke all on table public.company_outreach_batches, public.company_outreach_contacts from anon, authenticated;
grant all on table public.company_outreach_batches, public.company_outreach_contacts to service_role;
grant usage, select on sequence public.company_outreach_batches_id_seq, public.company_outreach_contacts_id_seq to service_role;

create or replace function public.start_company_warm_outreach(
  p_actor_id uuid,
  p_local_date date,
  p_source_code text,
  p_source_metrics jsonb,
  p_opener text,
  p_follow_up text
)
returns table (plan_id bigint, experiment_id bigint, batch_id bigint)
language plpgsql
set search_path = public
as $$
declare
  v_plan_id bigint;
  v_experiment_id bigint;
  v_batch_id bigint;
  v_goal_id bigint;
  v_now timestamptz := now();
begin
  select batch.id, batch.experiment_id, experiment.daily_plan_id
    into v_batch_id, v_experiment_id, v_plan_id
  from public.company_outreach_batches as batch
  join public.company_experiments as experiment on experiment.id = batch.experiment_id
  where batch.status = 'active'
  order by batch.created_at desc
  limit 1;
  if v_batch_id is not null then
    return query select v_plan_id, v_experiment_id, v_batch_id;
    return;
  end if;

  select goal.id into v_goal_id
  from public.company_goals as goal
  where goal.status = 'active' and goal.metric = 'paying_founders'
  order by goal.created_at desc
  limit 1;

  update public.company_daily_plans
  set status = 'abandoned', updated_at = v_now
  where status in ('draft', 'active') and local_date < p_local_date;

  select plan.id into v_plan_id
  from public.company_daily_plans as plan
  where plan.local_date = p_local_date
  for update;

  if v_plan_id is null then
    insert into public.company_daily_plans (
      local_date, goal_id, status, objective, bottleneck, hypothesis,
      leading_signal, stop_condition, owner_summary, source_metrics, created_by_agent_id
    ) values (
      p_local_date, v_goal_id, 'active',
      'Turn five warm conversations into the next verified paying founder.',
      'Direct messages are the only owner-observed channel that has produced new Badger users so far.',
      'If five people who already know the founder receive one short personal question, interested people will ask for the link and start the diagnostic.',
      'Replies first, then attributed onboarding starts, paywall views and payments.',
      'Stop after five messages. Review every reply and attributed product event before another batch.',
      'Run one five-person warm-message cohort. No scraping, bulk sends or recipient details are stored.',
      coalesce(p_source_metrics, '{}'::jsonb), 'ceo'
    ) returning id into v_plan_id;
  else
    update public.company_experiments
    set status = 'stopped', ends_at = v_now,
        learning = 'Stopped when the owner chose the verified warm-message channel for the next bounded cohort.',
        updated_at = v_now
    where daily_plan_id = v_plan_id and status in ('planned', 'running', 'measuring');

    update public.company_daily_plans
    set status = 'active', completed_at = null, goal_id = coalesce(v_goal_id, goal_id),
        objective = 'Turn five warm conversations into the next verified paying founder.',
        bottleneck = 'Direct messages are the only owner-observed channel that has produced new Badger users so far.',
        hypothesis = 'If five people who already know the founder receive one short personal question, interested people will ask for the link and start the diagnostic.',
        leading_signal = 'Replies first, then attributed onboarding starts, paywall views and payments.',
        stop_condition = 'Stop after five messages. Review every reply and attributed product event before another batch.',
        owner_summary = 'Run one five-person warm-message cohort. No scraping, bulk sends or recipient details are stored.',
        source_metrics = coalesce(p_source_metrics, '{}'::jsonb), updated_at = v_now
    where id = v_plan_id;
  end if;

  insert into public.company_experiments (
    daily_plan_id, owner_agent_id, status, title, hypothesis, audience, channel,
    cta, source_code, target_metric, success_threshold, stop_condition, starts_at
  ) values (
    v_plan_id, 'growth', 'running', 'Five warm founder conversations',
    'If five people who already know the founder receive one short personal question, interested people will ask for the link and start the diagnostic.',
    'Five people who already know the founder and have shown interest in starting something',
    'warm_dm', 'Ask whether they want the link; share it only after they say yes',
    p_source_code, 'attributed_onboarding_starts', 1,
    'Stop after five messages. Review every reply and attributed product event before another batch.', v_now
  ) returning id into v_experiment_id;

  insert into public.company_outreach_batches (experiment_id, opener, follow_up)
  values (v_experiment_id, p_opener, p_follow_up)
  returning id into v_batch_id;

  insert into public.company_outreach_contacts (batch_id, slot)
  select v_batch_id, slot from generate_series(1, 5) as slot;

  insert into public.company_audit_log (
    actor_type, actor_id, event_type, object_type, object_id, details
  ) values (
    'owner', p_actor_id::text, 'warm_outreach.started', 'company_outreach_batch', v_batch_id::text,
    jsonb_build_object('planId', v_plan_id, 'experimentId', v_experiment_id, 'maxContacts', 5, 'storesRecipientPii', false)
  );

  return query select v_plan_id, v_experiment_id, v_batch_id;
end;
$$;

revoke all on function public.start_company_warm_outreach(uuid, date, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.start_company_warm_outreach(uuid, date, text, jsonb, text, text) to service_role;
