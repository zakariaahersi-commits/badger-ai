
alter table public.profiles
  add column if not exists avatar_path text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_avatar_path_length_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_avatar_path_length_check
      check (avatar_path is null or char_length(avatar_path) <= 1000);
  end if;
end $$;

alter table public.venture_entities
  drop constraint if exists venture_entities_kind_check;
alter table public.venture_entities
  add constraint venture_entities_kind_check
  check (kind in ('customer', 'problem', 'hypothesis', 'experiment', 'evidence', 'decision', 'promise', 'task', 'skill', 'payment'));

create table public.evidence_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  day_num smallint check (day_num between 1 and 28),
  claim_type text not null check (claim_type in ('validate', 'build', 'market', 'revenue', 'reflection', 'call', 'kill', 'payment', 'other')),
  source_type text not null check (source_type in ('self_report', 'public_url', 'screenshot', 'stripe', 'gmail', 'social', 'manual_review')),
  status text not null default 'self_reported' check (status in ('self_reported', 'submitted', 'checked', 'verified', 'rejected')),
  claim_summary text not null check (char_length(claim_summary) between 1 and 1000),
  source_url text check (source_url is null or char_length(source_url) <= 2000),
  verifier text check (verifier is null or char_length(verifier) <= 120),
  verdict_note text check (verdict_note is null or char_length(verdict_note) <= 500),
  external_ref text check (external_ref is null or char_length(external_ref) <= 500),
  occurred_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index evidence_records_user_created_idx on public.evidence_records (user_id, created_at desc);
create index evidence_records_user_status_created_idx on public.evidence_records (user_id, status, created_at desc);
alter table public.evidence_records enable row level security;
create policy "read own evidence records" on public.evidence_records
  for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on table public.evidence_records from anon, authenticated;
grant select on table public.evidence_records to authenticated;
grant all on table public.evidence_records to service_role;

create table public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null check (category in ('bug', 'confusing', 'idea', 'billing')),
  severity text not null check (severity in ('low', 'medium', 'high', 'blocking')),
  status text not null default 'new' check (status in ('new', 'triaged', 'in_progress', 'resolved', 'closed')),
  summary text not null check (char_length(summary) between 1 and 180),
  details text not null check (char_length(details) between 1 and 3000),
  path text check (path is null or char_length(path) <= 300),
  browser text check (browser is null or char_length(browser) <= 500),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index bug_reports_status_created_idx on public.bug_reports (status, created_at desc);
create index bug_reports_user_created_idx on public.bug_reports (user_id, created_at desc);
alter table public.bug_reports enable row level security;
revoke all on table public.bug_reports from anon, authenticated;
grant all on table public.bug_reports to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 4000000, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "avatar uploads own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatar updates own folder" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatar deletes own folder" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
;
