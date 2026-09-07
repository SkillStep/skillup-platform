# Freemium, Premium and Pilot KPI Contract

**Status:** Product-owner approved launch commercial baseline as of September 7, 2026. SkillUp's preferred payment architecture is browser → SkillUp BFF/API → external payment service → JazzCash hosted wallet portal. External payment-service staging configuration and live JazzCash sandbox verification remain separate gates.

## 1. Pricing

- **Monthly Premium:** PKR 599 displayed checkout price (`59900` paisas).
- **Yearly Premium:** PKR 4,999 displayed checkout price (`499900` paisas).
- The MVP offers monthly and yearly plans only.
- The payment-service product catalog must use the configured monthly/yearly plan codes and the exact prices above.
- Step-down billing is disabled for launch by setting `stepAmountMinor` equal to `fullAmountMinor` unless a later product approval changes that decision.
- Launch billing uses `trialHours: 0` so successful wallet linking queues the first charge rather than silently introducing a free trial.
- No token packs, lifetime plans, family plans, school plans or costume marketplace are included in the first payment pilot.

## 2. Product principle

The free plan must provide a complete and useful learning experience. Premium is sold through depth, personalization and convenience—not by making free learning intentionally frustrating.

## 3. Free plan

Free learners receive:

- access to all public skill and path summaries;
- onboarding and baseline assessment;
- up to **three learning missions per day** across available free paths;
- standard challenge types;
- immediate correctness feedback and reviewed explanations;
- basic progress, streak and achievement tracking;
- standard avatars and badges;
- weekly leaderboard participation where eligible;
- limited personalized recommendations based on deterministic progress rules;
- account deletion and privacy controls equivalent to premium users.

A mission is one server-recorded level attempt that can produce progress or reward. Retries caused by a verified platform failure do not consume an additional mission.

## 4. Premium plan

Premium learners receive:

- unlimited access to published learning missions, subject to fair-use and abuse controls;
- all available learning paths;
- advanced scenarios and challenge variants;
- personalized weak-area revision and next-level recommendations;
- detailed mastery and progress insights;
- premium avatars, badges and cosmetic perks available in the MVP;
- ad-free experience if advertising is introduced later;
- priority access to selected new paths or beta features;
- premium support routing for payment and entitlement problems.

The launch pricing surface summarizes these benefits as expanded learning levels, detailed progress insights, advanced reviewed AI-assisted challenges and premium profile avatars.

“Unlimited” refers to learner access to approved product content. It does not permit unbounded live model calls, automated scraping, account sharing, denial-of-service behavior or bypass of safety limits.

## 5. Upgrade triggers

Upgrade prompts may appear after:

- completing the daily free mission allowance;
- attempting to open a premium path or challenge;
- viewing a locked detailed insight;
- completing a meaningful milestone where premium value can be explained;
- choosing a personalized path that requires premium generation.

Upgrade prompts must not:

- block access to already-earned progress;
- use false countdowns or misleading scarcity;
- threaten loss of streak solely for not paying;
- disguise payment as a required learning step;
- repeatedly interrupt the same session after dismissal.

## 6. Payment and entitlement lifecycle

### Architecture and authority

The browser never calls the payment service directly and never receives the product API key. SkillUp's authenticated BFF derives `userId` from the learner session and calls the payment service server-to-server. JazzCash MPIN entry happens only on JazzCash's hosted wallet page.

Premium access is never granted from a browser redirect, query parameter or screenshot. Signed payment-service webhooks and authoritative payment-service status reconciliation drive SkillUp's local entitlement state.

### Wallet link and first charge

- The learner selects monthly or yearly Premium, enters a JazzCash MSISDN and explicitly consents to automatic billing.
- SkillUp starts wallet linking through the payment service and submits the returned hosted-form fields to JazzCash.
- On successful wallet link, the payment service owns the wallet token and subscription lifecycle.
- Launch plans use `trialHours: 0`, so the first charge is queued immediately after successful linking.
- SkillUp must not create a duplicate first subscription after wallet-link success. `already_linked` and `already_subscribed` are recovery states, not reasons to charge twice.

### Duration and renewal

- Monthly billing uses the payment service's monthly interval contract (30-day interval in the supplied integration contract).
- Yearly billing uses the payment service's yearly interval contract.
- After a successful paid period, the payment service automatically bills the linked wallet on the next due date until the subscription is canceled or the wallet is unlinked.
- The account surface shows the authoritative current period and next-due information returned by the payment service.

### Cancel subscription

Canceling a subscription stops future renewal for that subscription while the JazzCash wallet stays linked. Payment-service cancellation is immediate in the billing ledger, but SkillUp product access remains available through the already-paid `current_period_end`.

### Unlink wallet

Unlinking removes the saved wallet token/authorization and stops all future SkillUp debits for that user. The payment service cancels open subscriptions. SkillUp retains already-paid access through the recorded current-period end.

### Past due, payment failure and expiry

- `past_due` may retain bounded grace/access through an already-paid period while payment-service dunning continues.
- `payment_failed` after retries and `expired` remove Premium access when no paid period remains.
- Pending provider outcomes are reconciled through the payment service; SkillUp does not offer a second “charge now” action for the same billing period.

### Refund and reversal

Refunds are operations/backend actions, not checkout controls. Refund/reversal events are reconciled against the authoritative payment-service status and SkillUp's local entitlement/audit history. An approved refund may revoke the affected Premium entitlement; completed learning history and required transaction evidence are retained.

### Account deletion

Account deletion explains what can be deleted immediately and what payment, fraud-prevention, legal or privileged audit data must be retained. No entitlement transfer is assumed in the MVP.

## 7. Launch wallet billing funnel

```text
Pricing viewed
→ Plan selected
→ MSISDN + auto-pay consent
→ Wallet link requested through SkillUp BFF
→ JazzCash hosted wallet page
→ Wallet linked
→ Subscription/first charge queued
→ Payment-service status + signed webhook
→ SkillUp entitlement reconciled
→ First premium action
→ Automatic renewal, cancellation/unlink, failure or refund
```

Every stage requires a stable server reference and deduplication rule.

## 8. 60–90 day pilot KPIs

### Acquisition and activation

- Visitor-to-registration conversion
- Registration-to-first-level-start conversion
- First-level completion rate
- First-session completion of at least three levels
- Time to first completed level

### Learning and retention

- Day-1, Day-7 and Day-30 learning return
- Weekly active learners
- Levels completed per active learner
- Module and path completion
- Baseline-to-end-assessment improvement
- Streak continuation without coercive messaging

### Premium funnel

- Free learner to pricing-view rate
- Pricing view to plan selection
- Plan selection to wallet-link initiation
- Wallet-link initiation to linked wallet
- Linked wallet to successful first charge
- Successful first charge to first premium action
- Monthly and yearly plan mix
- Entitlement activation delay
- Renewal success, past-due recovery, cancellation/unlink and expiry/reactivation

### Payment quality

- Wallet-link success/failure rate
- Payment success, failure, pending and refund rates
- Duplicate webhook attempts prevented
- Stale/out-of-order webhook events ignored
- Reconciliation mismatch count
- Manual correction count and reason
- Refund/reversal rate
- Support contacts per 100 payment attempts

### AI and content economics

- AI cost per drafted level
- AI cost per approved level
- AI cost per played premium level
- Cache/reuse ratio
- Rejection and regeneration rate
- Quality-review time
- Learner report rate by content version

### Discoverability

- Indexed eligible pages versus submitted pages
- Organic impressions and clicks by content family
- Search/AI referral to registration
- Search/AI referral to first completed level
- Branded versus non-branded discovery
- English versus Urdu route performance when Urdu launches
- Core Web Vitals pass rate

## 9. Initial decision thresholds

These are planning thresholds for the pilot, not guaranteed forecasts:

- Payment/entitlement mismatch: **zero tolerated as an unresolved systemic defect**.
- Duplicate successful entitlement from one billing period/event: **zero**.
- Critical payment or account-security incident: pause affected flow and follow incident runbook.
- Content with repeated accuracy reports: automatically remove from recommendation and enter review.
- Premium conversion should be interpreted alongside learning retention; a high conversion rate caused by an unusable free plan is not success.

## 10. Deferred commercial features

The following require separate approval:

- advertisements;
- token or credit packs;
- paid cosmetic marketplace;
- certificates or external verification;
- family, institution or corporate subscriptions;
- referral cash rewards;
- influencer commissions;
- pause/resume controls in the customer UI;
- monthly↔yearly in-place plan switching or proration;
- third-party course marketplace.

## 11. Launch policy set

The public launch policy set is versioned and published in the product. Current launch coverage includes:

- Terms of Use;
- Privacy Notice;
- Refund and Cancellation Policy;
- AI Use Disclosure;
- Fair Use Policy;
- leaderboard and achievement-sharing privacy controls;
- account export/deletion/retention disclosures;
- automatic wallet-billing consent and cancel/unlink disclosures;
- payment/refund support through the public SkillUp support page.

Launch support defaults to `admin@codistan.org` and can be overridden with `PUBLIC_SUPPORT_EMAIL` in the deployment environment. Payment-service/JazzCash sandbox behavior, settlement behavior and provider refund mechanics remain gated by the live external staging contract and verification evidence.
