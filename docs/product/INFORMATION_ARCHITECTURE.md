# SkillUp Information Architecture

**Status:** MVP route and content-family baseline.

## 1. Principles

- Public learning discovery is server-rendered and useful without authentication.
- Authenticated learner, payment and admin areas are private and `noindex`.
- English launches first, but locale is represented in the URL and content model from the first implementation.
- One canonical URL represents one clear learner intent.
- Public pages are created because they help learners, not to manufacture keyword permutations.

## 2. Public route families

```text
/{locale}
/{locale}/skills
/{locale}/skills/{skillSlug}
/{locale}/paths/{pathSlug}
/{locale}/guides/{guideSlug}
/{locale}/questions/{questionSlug}
/{locale}/glossary/{termSlug}
/{locale}/about
/{locale}/pricing
/{locale}/help
/{locale}/privacy
/{locale}/terms
```

Initial locales:

- `en` — published at launch.
- `ur` — route and data support exists, but URLs are published only when reviewed Urdu content is available.

Roman Urdu is a content and search-research question; it is not treated as a separate locale without evidence.

## 3. Private route families

```text
/app
/app/onboarding
/app/learn/{pathId}
/app/level/{levelId}
/app/progress
/app/achievements
/app/profile
/app/settings
/app/billing
/app/payments/{orderId}
/admin
/admin/content
/admin/review
/admin/ai-jobs
/admin/payments
/admin/analytics
```

All private routes require authentication or authorized admin access and must return explicit noindex controls. Sensitive content must not appear in public metadata, sitemaps, error pages or share previews.

## 4. Public page requirements

Every public learning page must define:

- page purpose and primary learner question;
- title, description and H1;
- concise direct answer or summary;
- learning outcomes;
- prerequisite and intended level where relevant;
- reviewed main content;
- author/reviewer and freshness metadata;
- related skills, paths, guides or questions;
- breadcrumbs and internal links;
- canonical URL and locale alternatives;
- visible-content-matched structured data;
- registration or start-learning call to action;
- analytics events and conversion goal.

## 5. Content relationships

```text
Skill category
→ Skill
→ Learning path
→ Module
→ Lesson
→ Level
→ Challenge
```

Public discovery normally stops at reviewed summaries and selected examples. Full progression, attempts, answers, personalized recommendations and detailed learner results stay private.

Supporting public content:

```text
Guide → teaches a concept or process
Question → answers one specific learner question
Glossary term → defines one concept
Comparison → permitted only when evidence-based and genuinely useful
Author/reviewer → establishes editorial responsibility
```

## 6. Search and navigation

The MVP navigation includes:

- Home
- Explore skills
- How it works
- Pricing
- Sign in / Start learning

Authenticated navigation includes:

- Continue learning
- Explore
- Progress
- Achievements
- Profile

Search initially covers published skills, paths, guides, questions and glossary terms. It must not expose private profiles, draft content, payment data or admin records.

## 7. Sitemap strategy

Use separate sitemap indexes for:

- static pages;
- skills and paths;
- guides;
- questions;
- glossary;
- Urdu content when published.

Only canonical, published, index-eligible URLs appear. Removed or redirected pages leave the sitemap promptly.

## 8. Structured data baseline

Use only supported types that match visible content:

- `Organization`
- `WebSite`
- `BreadcrumbList`
- `Course`
- `LearningResource`
- `Person`
- `VideoObject` where a real public video exists

Structured data does not include claims, prices, ratings, authors or outcomes that are not visible and verified on the page.

## 9. Share behavior

Public skill, path, guide and approved achievement-card URLs may be shared.

Private learner data is never encoded into a public URL. Achievement sharing uses a separate consented share artifact containing only approved fields, expiry and revocation behavior.

## 10. Redirect and lifecycle rules

- Slug changes require permanent redirects.
- Locale alternatives point to equivalent reviewed content, not the nearest unrelated page.
- Draft, rejected or low-quality content returns no public route.
- Archived content either redirects to a relevant replacement or returns a clear retired state.
- Correcting content creates a new version without rewriting historical learner attempts.

## 11. Analytics events

Minimum public events:

- `public_page_viewed`
- `skill_viewed`
- `path_viewed`
- `guide_viewed`
- `question_viewed`
- `internal_search_used`
- `start_learning_clicked`
- `pricing_viewed`
- `registration_started`

Events must include a stable content identifier and version where applicable, locale, referrer category and consent state; they must not include free-text private data.

## 12. Acceptance gate for a new public route

A new public route family is approved only when:

- it has a distinct learner purpose;
- ownership and review workflow exist;
- canonical, robots, sitemap and locale behavior are defined;
- structured data is valid and matched to visible content;
- mobile performance and accessibility budgets pass;
- analytics and conversion purpose are defined;
- no private or thin AI-generated content can enter it automatically.