-- Account creation is not email consent. A founder opts in by explicitly
-- choosing a reminder time or enabling journey emails in Profile.
alter table public.email_preferences
  alter column journey_nudges_enabled set default false;

-- Preserve paid-founder journey settings, but conservatively turn off legacy
-- pre-purchase rows unless an explicit reminder choice was recorded.
update public.email_preferences as preference
set journey_nudges_enabled = false,
    unsubscribed_at = coalesce(preference.unsubscribed_at, now()),
    updated_at = now()
where preference.journey_nudges_enabled = true
  and not exists (
    select 1
    from public.entitlements as entitlement
    where entitlement.user_id = preference.user_id
      and entitlement.product = 'badger-28-day'
      and entitlement.status = 'active'
  )
  and not exists (
    select 1
    from public.product_events as event
    where event.user_id = preference.user_id
      and event.event_name = 'onboarding_resume_scheduled'
  );

update public.onboarding_recoveries as recovery
set status = 'opted_out',
    updated_at = now()
where recovery.status = 'pending'
  and not exists (
    select 1
    from public.email_preferences as preference
    where preference.user_id = recovery.user_id
      and preference.journey_nudges_enabled = true
  );
