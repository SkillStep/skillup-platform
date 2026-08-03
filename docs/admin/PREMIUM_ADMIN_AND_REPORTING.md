# Premium administration and reporting

## Status

Implemented repository-side for the SkillUp Premium monthly and yearly launch model.

## Authority

- Currency: PKR.
- Reporting timezone: `Asia/Karachi`.
- Timestamp storage: UTC `timestamptz`.
- Approved plans: PKR 599 monthly and PKR 4,999 yearly.
- Current payment model: user-initiated JazzCash term purchase.
- Automatic recurring debit and auto-renew consent: not applicable until separately approved and implemented.

## Administrative surface

The Premium workspace is available at `/en/admin/premium` and reuses the existing Next.js admin application and Fastify administrative authorization.

Sections:

1. Summary
2. Payments
3. Memberships
4. Recurring customers
5. Reconciliation
6. Plans
7. Exports

## Metric definitions

- Gross collections: completed capture effects in the selected period.
- Refunds: completed refund or reversal effects in the selected period.
- Net collections: gross collections minus refunds.
- New paid activation: the first paid membership period for a learner.
- Successful renewal: a paid period classified and linked as a renewal.
- Recurring customer: a learner with at least one completed paid renewal.
- MRR: normalized value of active paid membership periods at the report end; monthly plans use the full stored price and yearly plans use the stored yearly price divided by 12.
- ARR: MRR multiplied by 12.
- Calendar-month cash collections are not MRR.
- Manual grants are never presented as paid activations or revenue.

Every report response includes the schema version, timezone, effective range and backend metric definitions.

## Data model

- `payment_financial_effects` preserves append-only capture, refund and reversal effects.
- `membership_periods` distinguishes paid versus manual origin and activation, renewal, reactivation or manual-grant purpose.
- Payment orders retain immutable plan-version linkage and authoritative payment purpose.
- Plan versions are immutable; new prices, benefits or terms create a new draft version.
- Scheduled plan activation uses `effective_at` and the API maintenance runner.
- Export files are generated on the backend, stored temporarily with a SHA-256 digest and expire after 24 hours.

## Authorization

The Premium layer derives explicit capabilities from the existing server-side roles:

- analyst: report and subscription read, plan read;
- payment operator: report read/export, subscription read/adjust, plan read, payment reconciliation;
- security administrator: report read/export, subscription read/adjust and plan management.

The API remains the final authority. UI visibility does not grant access.

## Exports

Supported UTF-8 CSV exports:

- summary and buckets;
- payment ledger;
- membership ledger;
- recurring customers;
- reconciliation exceptions.

Exports reuse the same backend filters and formulas as the screen, include formula-injection protection, use bounded rows and are audit-recorded without placing customer rows in the privileged audit event.

## Provider boundary

Repository tests and deterministic fixtures do not activate JazzCash. Merchant-specific status queries, refund/reversal adapters, live settlement reconciliation and controlled provider evidence remain under the JazzCash staging and go-live workstream.
