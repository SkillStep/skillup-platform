# Web Application

Target: Next.js 16.2.x App Router mobile-first web/PWA.

Responsibilities:

- public server-rendered discovery pages;
- learner account, onboarding, gameplay and progress UI;
- pricing, checkout handoff and payment-status UI;
- protected admin route surface for the MVP;
- metadata, structured data, canonical, locale and noindex behavior;
- accessibility, PWA and performance budgets.

The web application does not make payment, entitlement, scoring, publication or authorization decisions locally. Those remain authoritative in `apps/api`.

Scaffolding the executable Next.js package and committed dependency lock update remains part of issue #15.