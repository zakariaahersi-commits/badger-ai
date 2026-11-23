-- Community updates can contain commercially sensitive founder context. Keep
-- the feed inside the paid product and require the writer to own every row.

drop policy if exists "read posts" on public.posts;
drop policy if exists "write own posts" on public.posts;
drop policy if exists "read comments" on public.comments;
drop policy if exists "write own comments" on public.comments;
drop policy if exists "write own post fires" on public.post_fires;

revoke all on table public.posts from anon, authenticated;
revoke all on table public.comments from anon, authenticated;
revoke all on table public.post_fires from anon, authenticated;
grant select, insert on table public.posts to authenticated;
grant select, insert on table public.comments to authenticated;
grant insert on table public.post_fires to authenticated;

create policy "paid members read posts" on public.posts
  for select to authenticated
  using (
    exists (
      select 1
      from public.entitlements
      where user_id = (select auth.uid())
        and product = 'badger-28-day'
        and status = 'active'
    )
  );

create policy "paid members write own posts" on public.posts
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.entitlements
      where user_id = (select auth.uid())
        and product = 'badger-28-day'
        and status = 'active'
    )
  );

create policy "paid members read comments" on public.comments
  for select to authenticated
  using (
    exists (
      select 1
      from public.entitlements
      where user_id = (select auth.uid())
        and product = 'badger-28-day'
        and status = 'active'
    )
  );

create policy "paid members write own comments" on public.comments
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.entitlements
      where user_id = (select auth.uid())
        and product = 'badger-28-day'
        and status = 'active'
    )
  );

create policy "paid members write own post fires" on public.post_fires
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.entitlements
      where user_id = (select auth.uid())
        and product = 'badger-28-day'
        and status = 'active'
    )
  );
