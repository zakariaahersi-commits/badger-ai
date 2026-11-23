-- Growth knowledge is versioned and experiments record the exact playbook
-- they used. Trend signals are evidence, not instructions: Company OS ranks
-- them, then runs one bounded experiment against the verified funnel.
create table public.company_growth_playbooks (
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{2,63}$'),
  version smallint not null check (version between 1 and 1000),
  title text not null check (char_length(title) between 1 and 120),
  stage text not null check (stage in ('discover', 'validate', 'sell', 'compound')),
  status text not null default 'active' check (status in ('watch', 'active', 'retired')),
  promise text not null check (char_length(promise) between 1 and 500),
  steps jsonb not null check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) between 1 and 12),
  primary_metric text not null check (char_length(primary_metric) between 1 and 100),
  stop_rule text not null check (char_length(stop_rule) between 1 and 500),
  source_urls jsonb not null check (jsonb_typeof(source_urls) = 'array' and jsonb_array_length(source_urls) between 1 and 8),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (slug, version)
);

create table public.company_trend_signals (
  id bigint generated always as identity primary key,
  fingerprint text not null unique check (fingerprint ~ '^[a-f0-9]{64}$'),
  source_type text not null check (source_type in ('hacker_news', 'customer', 'payment', 'product', 'founder', 'manual')),
  source_item_id text check (source_item_id is null or char_length(source_item_id) <= 160),
  source_url text not null check (source_url ~ '^https://'),
  title text not null check (char_length(title) between 1 and 300),
  summary text not null default '' check (char_length(summary) <= 2000),
  category text not null default 'founder_problem' check (category in ('founder_problem', 'market_shift', 'distribution', 'competitor', 'product_behaviour')),
  velocity smallint not null default 0 check (velocity between 0 and 5),
  payment_evidence smallint not null default 0 check (payment_evidence between 0 and 5),
  badger_relevance smallint not null default 0 check (badger_relevance between 0 and 5),
  reachability smallint not null default 0 check (reachability between 0 and 5),
  freshness smallint not null default 0 check (freshness between 0 and 5),
  saturation smallint not null default 0 check (saturation between 0 and 5),
  risk smallint not null default 0 check (risk between 0 and 5),
  score numeric(6,2) generated always as (
    velocity * 2 + payment_evidence * 3 + badger_relevance * 3 + reachability * 2 + freshness * 2 - saturation * 1.5 - risk * 2
  ) stored,
  status text not null default 'fresh' check (status in ('fresh', 'watch', 'testing', 'used', 'retired')),
  observed_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index company_trend_signals_rank_idx on public.company_trend_signals (status, score desc, observed_at desc);
create index company_trend_signals_source_idx on public.company_trend_signals (source_type, observed_at desc);

alter table public.company_experiments
  add column playbook_slug text,
  add column playbook_version smallint,
  add constraint company_experiments_playbook_fk
    foreign key (playbook_slug, playbook_version)
    references public.company_growth_playbooks (slug, version)
    on delete restrict,
  add constraint company_experiments_playbook_pair_check
    check ((playbook_slug is null) = (playbook_version is null));
create index company_experiments_playbook_idx on public.company_experiments (playbook_slug, playbook_version, created_at desc)
  where playbook_slug is not null;

create table public.company_experiment_signals (
  experiment_id bigint not null references public.company_experiments (id) on delete cascade,
  signal_id bigint not null references public.company_trend_signals (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (experiment_id, signal_id)
);
create index company_experiment_signals_signal_idx on public.company_experiment_signals (signal_id, experiment_id);

alter table public.company_growth_playbooks enable row level security;
alter table public.company_trend_signals enable row level security;
alter table public.company_experiment_signals enable row level security;
revoke all on table public.company_growth_playbooks, public.company_trend_signals, public.company_experiment_signals from anon, authenticated;
grant all on table public.company_growth_playbooks, public.company_trend_signals, public.company_experiment_signals to service_role;
grant usage, select on sequence public.company_trend_signals_id_seq to service_role;

insert into public.company_growth_playbooks
  (slug, version, title, stage, promise, steps, primary_metric, stop_rule, source_urls)
values
  (
    'donnelly-code', 1, 'Find a rising tide before building', 'discover',
    'Turn a broad wish to make money into one reachable problem with visible demand.',
    '["Name the consumer shift","Define the narrow opportunity","Find direct demand evidence","Estimate whether the market is large enough","Offer a small next step"]'::jsonb,
    'qualified_problem_signals',
    'Stop or narrow the idea when three separate checks show no repeated problem or reachable buyer.',
    '["https://www.linkedin.com/posts/donnellychris_we-took-searchable-from-0-85m-in-5-months-activity-7473705360567181312-5wM1"]'::jsonb
  ),
  (
    'yc-customer-interviews', 1, 'Ask about what people already do', 'validate',
    'Replace guesses with specific examples from real people before deciding what to make.',
    '["Recruit one reachable person","Ask about the last time the problem happened","Listen for current workarounds and cost","Record the exact behaviour","Change the next question from the evidence"]'::jsonb,
    'customer_conversations',
    'Do not progress on compliments or hypothetical interest; require repeated past behaviour from at least three conversations.',
    '["https://www.youtube.com/watch?v=MT4Ig2uqjTc","https://www.ycombinator.com/blog/ycs-essential-startup-advice/"]'::jsonb
  ),
  (
    'yc-manual-first-customers', 1, 'Do the first sales by hand', 'sell',
    'Find the first paying founders through direct conversations before automating acquisition.',
    '["Choose one narrow founder type","Write one plain sentence about the useful outcome","Contact people individually","Deliver the first result manually","Record objections and payment evidence"]'::jsonb,
    'verified_payments',
    'Change the audience or promise after twenty relevant, individual conversations produce no serious next step.',
    '["https://www.ycombinator.com/blog/ycs-essential-startup-advice/"]'::jsonb
  ),
  (
    'polsia-build-in-public', 1, 'Make the company work visible', 'sell',
    'Turn real company decisions, failures and customer work into a story people can follow.',
    '["Choose one real company event","Show the evidence without private data","Explain the decision in plain language","Invite one concrete response","Measure conversations and product starts"]'::jsonb,
    'attributed_onboarding_starts',
    'Stop the format after three posts if it creates no relevant conversations or attributed product start.',
    '["https://gtmnow.com/gtm-192-inside-the-company-that-raised-30m-at-a-250m-valuation-with-0-employees-ben-cera-polsia/","https://www.youtube.com/watch?v=q1OA7LFg-ak"]'::jsonb
  ),
  (
    'reforge-proof-loop', 1, 'Turn completed work into the next introduction', 'compound',
    'Let a founder action create honest, shareable proof that can bring the next founder into Badger.',
    '["Create a useful result inside the product","Turn it into a private-by-default progress receipt","Let the founder choose to share","Attribute the visit and signup","Keep the loop only if it compounds"]'::jsonb,
    'referred_onboarding_starts',
    'Retire the sharing treatment after twenty completed tasks if fewer than two founders choose to share or no attributed start follows.',
    '["https://www.reforge.com/blog/growth-loops","https://outbid.lol/about"]'::jsonb
  );
