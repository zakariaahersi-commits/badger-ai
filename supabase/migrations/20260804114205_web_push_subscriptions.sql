-- Device-level Web Push opt-in. Only authenticated server routes write this
-- table. RLS is enabled with no client policy so subscription credentials are
-- never exposed through the Data API.
create table public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) between 12 and 2048),
  p256dh text not null check (char_length(p256dh) between 8 and 512),
  auth text not null check (char_length(auth) between 8 and 512),
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;;
