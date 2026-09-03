# Freemium, Premium and Pilot KPI Contract

**Status:** Product-owner approved launch commercial baseline as of September 3, 2026. JazzCash merchant activation, provider-specific contract terms and live transaction verification remain separate payment-provider gates.

## 1. Pricing

- **Monthly Premium:** PKR 599 displayed checkout price.
- **Yearly Premium:** PKR 4,999 displayed checkout price.
- The MVP offers monthly and yearly plans only.
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

## 6. Entitlement lifecycle

### Activation

Premium activates only after the server verifies a successful JazzCash transaction and records an idempotent entitlement operation.

### Duration

- Monthly: one calendar-month-equivalent duration defined in the payment contract.
- Yearly: one year-equivalent duration defined in the payment contract.
- Exact duration arithmetic and timezone are server-defined and tested.

### Renewal

The MVP uses manual renewal unless JazzCash contractually supports a separately approved recurring-payment flow. Renewal reminders may be sent only with consent and clear expiry information.

### Expiry

At expiry:

- the account returns to free limits;
- learning history, earned achievements and profile remain available;
- premium-only future actions become locked;
- previously earned progress is not deleted;
- payment and entitlement audit history is retained according to policy.

### Grace period

No silent paid grace period is assumed. A short operational grace state may be used only for a verified payment-status delay or platform reconciliation incident.

### Refund and reversal

Refund requests are reviewed against JazzCash evidence and SkillUp's authoritative order, payment-event and entitlement records. An approved refund or charge reversal creates a separate auditable transaction and entitlement adjustment; transaction history is never rewritten. Learners use the public SkillUp support page for payment/refund review and must not send PINs, OTPs, passwords or full payment credentials.

### Account deletion

Account deletion explains what can be deleted immediately and what payment, fraud-prevention, legal or privileged audit data must be retained. No entitlement transfer is assumed in the MVP.

## 7. JazzCash pilot funnel

```text
Pricing viewed
→ Plan selected
→ Payment order created
→ JazzCash flow opened
→ Payment pending/success/failed/cancelled
→ Server verification
→ Entitlement activated
→ First premium action
→ Renewal or expiry
```

Every stage requires a stable event definition, server reference and deduplication rule.

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
- Plan selection to payment initiation
- Payment initiation to verified success
- Verified success to first premium action
- Monthly and yearly plan mix
- Entitlement activation delay
- Renewal intent, renewal completion and expiry reactivation

### Payment quality

- Payment success, failure, cancellation and pending rates
- Duplicate callback attempts prevented
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
- Duplicate successful entitlement from one order: **zero**.
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
- automatic recurring debits;
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
- payment/refund support through the public SkillUp support page.

Launch support defaults to `admin@codistan.org` and can be overridden with `PUBLIC_SUPPORT_EMAIL` in the deployment environment. Merchant-specific JazzCash behavior, settlement rules, provider refund mechanics and any future recurring-payment terms remain gated by the approved provider contract and live verification evidence.
