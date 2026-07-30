# SkillUp Pakistan Launch Brief

**Status:** Working product decision for implementation; primary user research and legal/domain clearance remain required.

## 1. Product promise

SkillUp helps Pakistani learners build practical, employable and everyday skills through short mobile-first learning games.

**Primary promise:** Learn one useful thing, prove it through a challenge, and see measurable progress in minutes.

SkillUp is not positioned as:

- a generic chatbot;
- a large undifferentiated course marketplace;
- an exam-cramming application;
- a mass-generated SEO content site;
- a replacement for accredited education or professional advice.

## 2. Initial audience

The launch audience is Pakistani learners ages 16–30, initially concentrated in urban and peri-urban areas with regular smartphone or shared-computer access.

### Persona A — Career starter

- **Profile:** Student or recent graduate, usually 18–24.
- **Job to be done:** Become more confident in interviews, workplace communication and practical digital work.
- **Primary barriers:** Does not know where to start, long courses feel overwhelming, weak feedback loop, limited confidence in English.
- **Value trigger:** A clear path, short challenges, visible mastery and realistic practice.
- **Premium trigger:** Unlimited practice, personalized weak-area revision and deeper progress insights.

### Persona B — Early freelancer

- **Profile:** Learner or junior professional, usually 18–28, exploring remote work or side income.
- **Job to be done:** Learn client communication, proposal basics, productivity, digital marketing and responsible AI use.
- **Primary barriers:** Fragmented free content, hype-heavy advice and difficulty judging readiness.
- **Value trigger:** Scenario practice, practical templates and evidence of skill progression.
- **Premium trigger:** Personalized paths, advanced scenarios and structured revision.

### Persona C — Skill-switcher

- **Profile:** Early-career employee or job seeker, usually 22–30.
- **Job to be done:** Build an adjacent skill without committing to a long formal program.
- **Primary barriers:** Low time, inconsistent motivation, uncertainty about which skill matters next.
- **Value trigger:** Five-to-ten-minute sessions, a recommended next step and progress that survives interruptions.
- **Premium trigger:** Unlimited paths, cross-skill recommendations and detailed mastery reports.

## 3. Evidence and assumptions

The product must treat the following as implementation inputs, not as excuses for poor experience:

- Chrome dominates mobile browsing in Pakistan, but UC Browser, Safari and Opera remain meaningful enough to justify standards-based compatibility and progressive enhancement.
- Pakistan's payments ecosystem supports mobile wallets, mobile banking, Raast, QR payments and branchless banking, but trust, failed transactions and complex payment experiences remain material concerns.
- The first release must work on low-to-mid-range Android devices, constrained memory, intermittent connectivity and prepaid data plans.
- English-first does not mean English-only. Urdu and Roman Urdu support should be researched separately by workflow and content type.

### Sources used for the initial hypotheses

- [State Bank of Pakistan — Payment Systems](https://www.sbp.org.pk/our-operations/payment-systems)
- [State Bank of Pakistan — Payments Ecosystem and Infrastructure](https://www.sbp.org.pk/our-operations/payments-ecosystem-and-infrastructure)
- [StatCounter — Mobile Browser Market Share in Pakistan](https://gs.statcounter.com/browser-market-share/mobile/pakistan)
- [Pakistan Economic Survey 2025–26](https://www.finance.gov.pk/survey_2026.html)

These sources do not replace interviews, usability testing or payment-pilot evidence.

## 4. Supported launch matrix

### Priority 1

- Android mobile browsers: latest two Chrome major versions plus a practical lower-version floor established through beta analytics.
- Desktop: latest two Chrome and Edge major versions.
- iPhone/iPad: latest two Safari major versions.
- Viewports from 320 CSS pixels upward.
- Touch, keyboard and screen-reader operation for all core journeys.

### Priority 2

- Opera Mobile and Samsung Internet through standards-compliant progressive enhancement.
- UC Browser receives a readable, functional baseline where technically feasible; advanced PWA features may be unavailable.

### Network and device budgets

- Public landing pages must remain useful before hydration.
- No autoplay video or 3D asset is allowed in the critical path.
- Core learning interactions must tolerate temporary connectivity loss without duplicating attempts or rewards.
- Initial public-page JavaScript and image budgets are governed by the design/performance standard.
- The application must show explicit offline, retry and recovery states rather than indefinite spinners.

## 5. Brand direction

### Working name

**SkillUp** is the owner-approved working product name.

A separate domain, trademark and social-handle clearance is mandatory before public launch. `SkillUp.com.pk` has historical public usage by another learning provider, so ownership must not be assumed and the brand must not copy that service's visual identity, content or claims.

### Positioning statement

> For Pakistani learners who want practical progress without committing to long courses, SkillUp is a mobile-first learning game that turns useful skills into short challenges, feedback and visible mastery.

### Tagline

**Learn. Play. Level Up.**

### Brand characteristics

- optimistic, practical and energetic;
- youthful without appearing childish;
- locally relevant without relying on stereotypes;
- trustworthy about AI, outcomes and limitations;
- clear enough for first-time digital learners.

## 6. Acquisition and discoverability assumptions

The first public information architecture must support:

- skill, path, guide, question and glossary discovery through search;
- direct-answer content suitable for conventional search and answer engines;
- English routes first with Urdu-ready records and URLs;
- social sharing of public achievements and reviewed learning resources;
- conversion measurement from discovery to registration, first completed level and premium activation.

No public page may exist solely as a keyword permutation. Every indexable page requires a real learner purpose, reviewed content, internal links and an owner.

## 7. Research plan before broad beta

Run at least 12 anonymized interviews across the three personas and at least two cities or remote cohorts. Include a mix of genders, education levels and device quality.

Validate:

- preferred session length;
- English, Urdu and Roman Urdu expectations;
- trust in AI-generated explanations;
- willingness to register before first play;
- JazzCash familiarity and payment concerns;
- usefulness of points, streaks and leaderboards;
- free-limit tolerance and premium value perception;
- accessibility and shared-device concerns.

Do not collect CNICs, financial credentials or unnecessary personal identifiers.

## 8. Decisions and open gates

### Approved for implementation

- Pakistan-first, ages 16–30.
- Responsive web/PWA first.
- English-first and Urdu-ready.
- Short challenge-based practical learning.
- Freemium with monthly/yearly premium.
- JazzCash-first payment pilot.
- SEO, AEO and GEO as product architecture.

### Must be confirmed before public launch

- domain and trademark clearance;
- exact age/consent policy;
- Urdu rollout order;
- supported browser floor based on beta telemetry;
- participant-tested free limits and premium messaging;
- production payment contract and refund wording.
