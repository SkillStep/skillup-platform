-- Allow learner unsubscribe and staging premium-bypass commercial event names.
alter table commercial_events
  drop constraint commercial_events_name_allowed;

alter table commercial_events
  add constraint commercial_events_name_allowed check (
    event_name in (
      'premium_offer_viewed',
      'checkout_started',
      'provider_handoff',
      'payment_pending',
      'payment_succeeded',
      'payment_failed',
      'entitlement_activated',
      'entitlement_expired',
      'entitlement_refunded',
      'entitlement_cancelled',
      'premium_activated',
      'premium_unsubscribed',
      'reconciliation_opened'
    )
  );
