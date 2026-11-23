-- iMessage pilot: server-only identity linking, consent, delivery telemetry,
-- and idempotent daily sends. Phone numbers and raw webhook payloads are
-- encrypted by the application before they reach these tables.

create table public.messaging_channels (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('linq', 'sendblue')),
  provider_chat_id text not null check (char_length(provider_chat_id) between 1 and 200),
  phone_hash text not null unique check (char_length(phone_hash) = 64),
  phone_ciphertext text not null check (char_length(phone_ciphertext) between 24 and 1000),
  status text not null default 'active' check (status in ('active', 'paused', 'opted_out')),
  consent_at timestamptz not null,
  paused_at timestamptz,
  opted_out_at timestamptz,
  preferred_reminder_time time not null default '09:00',
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 80),
  conversation_state text not null default 'coaching'
    check (conversation_state in ('coaching', 'awaiting_done_learning')),
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider),
  unique (provider, provider_chat_id),
  check ((status = 'paused') = (paused_at is not null)),
  check ((status = 'opted_out') = (opted_out_at is not null))
);

create index messaging_channels_active_schedule_idx
  on public.messaging_channels (timezone, preferred_reminder_time, user_id)
  where status = 'active';

create table public.messaging_link_codes (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('linq', 'sendblue')),
  code_digest text not null unique check (char_length(code_digest) = 64),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, provider),
  check (expires_at > created_at),
  check (used_at is null or used_at >= created_at)
);

create index messaging_link_codes_active_idx
  on public.messaging_link_codes (code_digest, expires_at)
  where used_at is null;

create table public.messaging_webhook_events (
  id bigint generated always as identity primary key,
  provider text not null check (provider in ('linq', 'sendblue')),
  provider_event_id text not null,
  event_type text not null check (char_length(event_type) between 1 and 100),
  payload_digest text not null check (char_length(payload_digest) = 64),
  payload_ciphertext text not null check (char_length(payload_ciphertext) between 24 and 100000),
  status text not null default 'queued' check (status in ('queued', 'processing', 'processed', 'ignored', 'failed')),
  attempt_count smallint not null default 0 check (attempt_count between 0 and 3),
  last_error text check (last_error is null or char_length(last_error) <= 500),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, provider_event_id)
);

create index messaging_webhook_events_queue_idx
  on public.messaging_webhook_events (received_at, id)
  where status in ('queued', 'failed') and attempt_count < 3;

create table public.messaging_activity (
  id bigint generated always as identity primary key,
  channel_id bigint references public.messaging_channels (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  provider text not null check (provider in ('linq', 'sendblue')),
  direction text not null check (direction in ('inbound', 'outbound', 'system')),
  event_kind text not null check (event_kind in ('linked', 'message', 'command', 'evidence', 'delivered', 'read', 'failed', 'paused', 'resumed', 'opted_out')),
  provider_message_id text check (provider_message_id is null or char_length(provider_message_id) <= 200),
  command text check (command is null or command in ('START', 'DONE', 'STUCK', 'TODAY', 'PLAN', 'PAUSE', 'RESUME', 'STOP')),
  body_length_bucket text check (body_length_bucket is null or body_length_bucket in ('0', '1-40', '41-160', '161-500', '501+')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index messaging_activity_user_created_idx
  on public.messaging_activity (user_id, created_at desc)
  where user_id is not null;
create index messaging_activity_channel_created_idx
  on public.messaging_activity (channel_id, created_at desc)
  where channel_id is not null;

create table public.messaging_daily_sends (
  id bigint generated always as identity primary key,
  channel_id bigint not null references public.messaging_channels (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  local_date date not null,
  send_kind text not null check (send_kind in ('morning_task', 'follow_up')),
  status text not null default 'reserved' check (status in ('reserved', 'sent', 'failed', 'cancelled')),
  attempt_count smallint not null default 1 check (attempt_count between 1 and 3),
  provider_message_id text check (provider_message_id is null or char_length(provider_message_id) <= 200),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (channel_id, local_date, send_kind),
  check ((status = 'sent') = (sent_at is not null))
);

create index messaging_daily_sends_user_date_idx
  on public.messaging_daily_sends (user_id, local_date desc);

alter table public.messaging_channels enable row level security;
alter table public.messaging_link_codes enable row level security;
alter table public.messaging_webhook_events enable row level security;
alter table public.messaging_activity enable row level security;
alter table public.messaging_daily_sends enable row level security;

revoke all on table public.messaging_channels from anon, authenticated;
revoke all on table public.messaging_link_codes from anon, authenticated;
revoke all on table public.messaging_webhook_events from anon, authenticated;
revoke all on table public.messaging_activity from anon, authenticated;
revoke all on table public.messaging_daily_sends from anon, authenticated;

grant all on table public.messaging_channels to service_role;
grant all on table public.messaging_link_codes to service_role;
grant all on table public.messaging_webhook_events to service_role;
grant all on table public.messaging_activity to service_role;
grant all on table public.messaging_daily_sends to service_role;
grant usage, select on sequence public.messaging_channels_id_seq to service_role;
grant usage, select on sequence public.messaging_link_codes_id_seq to service_role;
grant usage, select on sequence public.messaging_webhook_events_id_seq to service_role;
grant usage, select on sequence public.messaging_activity_id_seq to service_role;
grant usage, select on sequence public.messaging_daily_sends_id_seq to service_role;
