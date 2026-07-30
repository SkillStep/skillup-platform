# SkillUp SEO, AEO, and GEO Standard

**Status:** Mandatory product and engineering standard

## 1. Principle

SkillUp treats discoverability as part of the platform architecture. SEO, answer engine optimization (AEO), and generative engine optimization (GEO) share one foundation: crawlable and understandable pages, original useful content, clear answers, structured relationships, strong performance, trustworthy authorship/review, and measurable user outcomes.

No feature may postpone discoverability to a later marketing phase where it affects public information architecture, rendering, URLs, content data, or analytics.

## 2. Required public information architecture

Initial public content families:

```text
/en/skills/{skill-slug}
/en/courses/{path-slug}
/en/learn/{topic-slug}
/en/guides/{guide-slug}
/en/questions/{question-slug}
/en/glossary/{term-slug}
/en/compare/{comparison-slug}
```

Urdu must use a separate, stable language path when launched:

```text
/ur/skills/{skill-slug}
/ur/courses/{path-slug}
...
```

Rules:

- URLs are lowercase, human-readable, stable, and independent of internal database IDs.
- Each indexable URL has one canonical version.
- Language alternates use correct `hreflang` relationships.
- Do not hide translations behind client-only state or automatically force language solely by IP.
- Redirects are deliberate, tested, and preserved when slugs change.
- Pagination, faceting, parameters, internal search, previews, and drafts have explicit index rules.

## 3. Rendering and crawlability

- Public learning pages use server rendering or static generation.
- Core meaning, answer, headings, links, and metadata must exist in returned HTML.
- Essential content must not depend on a user gesture, canvas, inaccessible animation, or delayed client-only API call.
- Authenticated learner and admin surfaces are excluded through route controls and metadata, not only robots.txt.
- Every public page must be reachable through internal links; sitemaps do not replace navigation.

## 4. Page content contract

Every indexable page defines:

- primary learner intent;
- page type and target audience;
- one clear H1;
- concise direct answer or definition near the beginning where relevant;
- summary and learning outcomes;
- logically ordered sections with descriptive headings;
- examples and exercises relevant to the topic and, where appropriate, Pakistan;
- related questions, terms, skills, and deeper lessons;
- source/reference metadata for factual claims;
- author or reviewer identity and expertise context;
- publication and reviewed dates;
- language and translation relationships;
- conversion path to start learning without obscuring the answer;
- index/noindex decision and canonical URL.

Content must not be padded to reach arbitrary length.

## 5. AEO requirements

Pages intended to answer questions must:

- answer the main question directly before lengthy background;
- use concise definitions, ordered steps, tables, examples, and comparisons only where they improve understanding;
- distinguish facts, guidance, assumptions, and opinions;
- define ambiguous terminology;
- provide follow-up questions and concept relationships;
- keep the answer consistent with the underlying lesson and current reviewed content version;
- use FAQ-style content only when questions are genuine and visible, not as schema-only keyword stuffing.

## 6. GEO requirements

To improve reliable citation and representation by generative systems:

- publish original, specific, well-structured explanations rather than generic rewrites;
- include identifiable authors/reviewers, dates, sources, and content version where useful;
- make factual claims easy to verify;
- expose stable textual summaries and semantic relationships between skills, prerequisites, outcomes, and lessons;
- avoid unsupported superlatives and fabricated statistics;
- maintain consistent entity naming and organization information;
- make key content accessible without login while protecting private learner data;
- monitor AI referral and citation patterns where measurable, but do not optimize by creating thin pages or hidden AI-only content.

No special `llms.txt`, AI-specific markup, or generative-search file is considered a substitute for indexable quality content. Any such optional mechanism requires an ADR and evidence of value before adoption.

## 7. Structured data

Use JSON-LD only when the visible page supports it. Candidate types include:

- `Organization`
- `WebSite`
- `BreadcrumbList`
- `Course`
- `LearningResource`
- `Person`
- `VideoObject`

Learning metadata may include:

- `teaches`
- `assesses`
- `educationalLevel`
- `learningResourceType`
- `inLanguage` or available-language relationships
- course/path structure and provider information where supported

Requirements:

- schema output is generated from the same authoritative content model as the visible page;
- required and recommended properties are validated in CI;
- schema must not claim ratings, prices, availability, authorship, or content absent from the page;
- structured data changes receive regression tests.

## 8. Technical requirements

Each applicable route must implement and test:

- title and meta description;
- canonical URL;
- robots directive;
- Open Graph and share metadata;
- breadcrumb relationship;
- language and `hreflang` output;
- structured data;
- sitemap inclusion/exclusion;
- status code and redirect behavior;
- internal links;
- accessible headings and landmarks;
- image dimensions, responsive sources, descriptive alternatives, and lazy-loading policy;
- performance budgets.

Sitemap indexes should separate content families and languages. Publishing, meaningful updating, and removal should update sitemaps and may notify supported search engines through IndexNow after review.

## 9. Performance standard

Production targets at the 75th percentile on mobile and desktop:

- LCP: 2.5 seconds or less;
- INP: below 200 milliseconds;
- CLS: below 0.1.

Each route family receives budgets for:

- initial JavaScript;
- total transferred bytes;
- fonts and images;
- third-party scripts;
- server response time;
- API waterfalls;
- hydration and interaction cost.

Learning-game functionality must not make the public landing page heavy. Marketing and analytics scripts require performance and privacy review.

## 10. AI-generated content policy

AI may assist with drafts, variants, questions, explanations, translations, summaries, and metadata, but:

- public/indexable content must pass schema, duplication, accuracy, safety, usefulness, and editorial policy checks;
- model/provider/prompt version and review decision are retained;
- bulk generation cannot automatically publish thousands of pages;
- near-duplicate location, skill, keyword, or question permutations are prohibited;
- generated content must add distinct learner value;
- low-confidence or unsupported facts are rejected or sent for human verification;
- translation is reviewed for meaning, tone, and educational accuracy.

## 11. Analytics and measurement

Track discovery without collecting unnecessary personal data:

- search landing page and content family;
- branded/non-branded query group where available;
- conventional search and identifiable AI referral source;
- page engagement and answer usefulness signals;
- registration, first skill selection, first level start, first completion;
- search-to-registration, search-to-first-completion, and search-to-premium conversion;
- English versus Urdu discovery and progression;
- index coverage, crawl errors, rich-result validity, Core Web Vitals, broken links, and orphan pages.

Search Console and product analytics must be connected through a documented measurement plan. Rankings alone are not a success metric.

## 12. CI and release gates

The discoverability test suite must detect:

- missing or duplicate titles/H1/canonicals;
- invalid canonical or `hreflang` clusters;
- accidental indexability of private pages;
- accidental noindex of public pages;
- structured-data validation failures;
- broken internal links or breadcrumbs;
- orphan public pages;
- sitemap drift and non-200 sitemap URLs;
- route-level performance budget regression;
- inaccessible headings, links, images, or landmarks;
- thin or duplicate content warnings for editorial review.

A public feature is not complete until its discoverability acceptance criteria pass.

## 13. Definition of done for public content

- [ ] Search intent and learner outcome are explicit.
- [ ] Stable URL, canonical, language, and index policy are implemented.
- [ ] Page is useful and understandable in returned HTML.
- [ ] Direct answer/summary and deeper learning path are present where appropriate.
- [ ] Structured data matches visible content.
- [ ] Internal links and breadcrumbs are present.
- [ ] Author/reviewer, sources, and review date are recorded.
- [ ] Mobile performance and accessibility gates pass.
- [ ] Analytics events and conversion path are verified.
- [ ] No private data, unsupported claim, thin AI content, or search manipulation is present.