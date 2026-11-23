-- Generated UGC is private company work until a separate publication action
-- is approved. The service role is the only application role with access.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company-content', 'company-content', false, 104857600, array['video/mp4'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop index if exists public.company_actions_execution_idx;
create index company_actions_execution_idx on public.company_actions (available_at, created_at)
where status = 'approved'
  and action_type in ('send_customer_email', 'reply_company_email', 'publish_social_content', 'queue_engineering_work', 'queue_ugc_video');
