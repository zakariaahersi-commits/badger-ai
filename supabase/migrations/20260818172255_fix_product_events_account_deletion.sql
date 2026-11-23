-- Product events belong to the authenticated account that produced them.
-- SET NULL conflicts with the table's actor check when anonymous_id is
-- also null, which makes account deletion fail after any signed-in event.
-- Cascading these rows both restores account erasure and avoids retaining
-- user-linked behavioural history after the account is deleted.
set lock_timeout = '5s';
set statement_timeout = '30s';

alter table public.product_events
  drop constraint if exists product_events_user_id_fkey;

alter table public.product_events
  add constraint product_events_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade
  not valid;

alter table public.product_events
  validate constraint product_events_user_id_fkey;
