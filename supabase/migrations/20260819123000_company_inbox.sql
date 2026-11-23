-- AgentMail is the private company inbox for Badger Company OS. Incoming
-- messages are stored server-side, triaged as untrusted data, and can only
-- become an external reply through the existing owner approval ledger.
create table public.company_email_messages (
  id bigint generated always as identity primary key,
  provider text not null default 'agentmail' check (provider = 'agentmail'),
  provider_event_id text not null unique check (char_length(provider_event_id) between 1 and 240),
  inbox_id text not null check (char_length(inbox_id) between 1 and 240),
  thread_id text not null check (char_length(thread_id) between 1 and 240),
  message_id text not null check (char_length(message_id) between 1 and 240),
  sender_email text not null check (char_length(sender_email) between 3 and 320),
  sender_name text check (sender_name is null or char_length(sender_name) <= 200),
  subject text not null default '(no subject)' check (char_length(subject) between 1 and 500),
  preview text not null default '' check (char_length(preview) <= 1000),
  body_text text not null default '' check (char_length(body_text) <= 20000),
  received_at timestamptz not null,
  status text not null default 'new' check (status in ('new', 'triaging', 'waiting_approval', 'replied', 'ignored', 'escalated', 'failed')),
  triage jsonb not null default '{}'::jsonb check (jsonb_typeof(triage) = 'object'),
  action_id uuid references public.company_actions (id) on delete set null,
  attempt_count smallint not null default 0 check (attempt_count between 0 and 3),
  available_at timestamptz not null default now(),
  error_code text check (error_code is null or char_length(error_code) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inbox_id, message_id)
);

create index company_email_messages_due_idx
  on public.company_email_messages (available_at, received_at)
  where status in ('new', 'failed') and attempt_count < 3;
create index company_email_messages_status_idx
  on public.company_email_messages (status, received_at desc);

drop index if exists public.company_actions_execution_idx;
create index company_actions_execution_idx
  on public.company_actions (available_at, created_at)
  where status = 'approved'
    and action_type in ('send_customer_email', 'reply_company_email', 'publish_social_content', 'queue_engineering_work');

alter table public.company_email_messages enable row level security;
revoke all on table public.company_email_messages from anon, authenticated;
grant all on table public.company_email_messages to service_role;
grant usage, select on sequence public.company_email_messages_id_seq to service_role;
