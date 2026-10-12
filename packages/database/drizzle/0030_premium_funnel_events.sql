-- Campaign funnel event names (client allowlist + server commerce).
-- Official Subs reports still use succeeded payment_orders, not these events.

alter table commercial_events
  drop constraint if exists commercial_events_name_allowed;

alter table commercial_events
  add constraint commercial_events_name_allowed check (
    event_name in (
      'premium_offer_viewed',
      'paywall_viewed',
      'plan_selected',
      'add_to_cart',
      'checkout_started',
      'provider_handoff',
      'payment_pending',
      'payment_succeeded',
      'payment_failed',
      'subscribe',
      'purchase',
      'entitlement_activated',
      'entitlement_expired',
      'entitlement_refunded',
      'entitlement_cancelled',
      'premium_activated',
      'premium_unsubscribed',
      'reconciliation_opened'
    )
  );
