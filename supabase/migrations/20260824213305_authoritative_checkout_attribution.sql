-- Stripe can deliver more than one completion-shaped event for the same
-- one-time payment. Keep the authoritative source-to-payment event idempotent
-- even when the browser never returns from Checkout.
create unique index if not exists product_events_checkout_transaction_unique
  on public.product_events ((properties ->> 'transaction_id'))
  where event_name = 'checkout_completed'
    and nullif(properties ->> 'transaction_id', '') is not null;
