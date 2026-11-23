-- X and TikTok share one prepared-content experiment channel. This does not
-- grant publishing authority and deliberately excludes LinkedIn.
alter table public.company_experiments
  drop constraint if exists company_experiments_channel_check;

alter table public.company_experiments
  add constraint company_experiments_channel_check
  check (channel in ('instagram', 'social', 'email', 'product', 'imessage', 'partnership', 'other'))
  not valid;

alter table public.company_experiments
  validate constraint company_experiments_channel_check;
