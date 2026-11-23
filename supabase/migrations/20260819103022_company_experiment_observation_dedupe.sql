-- Company OS re-reads provider and funnel metrics throughout the day. A stable
-- evidence key makes those snapshots idempotent while preserving historical
-- observations from earlier releases.
alter table public.company_experiment_observations
  add column dedupe_key text;

update public.company_experiment_observations
set dedupe_key = 'legacy:' || id::text
where dedupe_key is null;

alter table public.company_experiment_observations
  alter column dedupe_key set not null,
  add constraint company_experiment_observations_dedupe_key_length
    check (char_length(dedupe_key) between 1 and 200);

create unique index company_experiment_observations_dedupe_idx
  on public.company_experiment_observations (dedupe_key);

