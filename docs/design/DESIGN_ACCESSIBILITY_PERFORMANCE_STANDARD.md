# Design, Accessibility and Performance Standard

**Status:** Mandatory for MVP implementation.

## 1. Product experience

SkillUp must feel fast, focused and rewarding on a low-to-mid-range phone. The experience should be playful without hiding learning outcomes or overwhelming the learner.

## 2. Responsive baseline

- Minimum supported viewport: 320 CSS pixels.
- Core layouts use one-column mobile flow first.
- Tablet and desktop add space and context; they do not create a separate product.
- Touch targets are at least 44 × 44 CSS pixels.
- Primary actions remain reachable without precision tapping.
- Layouts are RTL-ready even while English launches first.

## 3. Accessibility target

Meet WCAG 2.2 AA for all launch journeys.

Required:

- semantic HTML and correct heading order;
- keyboard access and visible focus;
- screen-reader names, states and errors;
- 4.5:1 contrast for normal text and 3:1 for large text/UI components where applicable;
- text zoom to 200% without loss of function;
- reduced-motion support;
- non-color indicators for status and correctness;
- captions/transcripts for meaningful audio/video;
- alternatives to drag-only, timed-only and motion-only game interactions;
- clear validation and recovery instructions;
- accessible authentication, checkout and payment-status flows.

## 4. Core Web Vitals targets

At the 75th percentile for supported mobile and desktop users:

- **LCP:** ≤ 2.5 seconds
- **INP:** ≤ 200 milliseconds
- **CLS:** ≤ 0.1

These are release targets for public pages and monitored goals for authenticated journeys.

## 5. Initial performance budgets

### Public landing and skill pages

- Initial route JavaScript downloaded: target ≤ 170 KB compressed; hard review gate at 220 KB.
- Critical CSS: target ≤ 35 KB compressed.
- Largest above-the-fold image: ≤ 120 KB on the default mobile variant.
- Total above-the-fold image transfer: ≤ 250 KB.
- No autoplay video, 3D model or large animation in the critical path.
- Meaningful server-rendered HTML must be available before client hydration.

### Learning level

- Initial level payload: target ≤ 80 KB JSON excluding separately cached media.
- Audio/image assets load only when required.
- Submission response target: p75 ≤ 800 ms excluding a live generative task.
- Learner scoring does not wait for a model call where deterministic evaluation is possible.

### Admin

Admin pages may be heavier than learner pages but still require route-level code splitting, accessible loading states and measurable budgets. Large editors/charts load only on relevant routes.

## 6. Font policy

- Prefer system fonts until the final brand font is performance-tested.
- Self-host approved fonts with subset and preload controls.
- Do not block useful text while a font downloads.
- Urdu font strategy must be tested for readability, rendering weight and fallback behavior.

## 7. Images and media

- Use responsive modern formats and explicit dimensions.
- Decorative images have empty alt text.
- Informative images have concise meaningful alternatives.
- Do not upload public media without ownership/licensing metadata.
- Avoid text baked into images.
- Achievement cards may be rendered separately from accessible text content.

## 8. Motion

- Default micro-interactions complete quickly and never block the next action.
- Respect `prefers-reduced-motion`.
- Avoid repeated confetti or celebratory motion after every answer.
- Do not use motion to create urgency around payment.

## 9. Learning interaction states

Every challenge component supports:

- loading;
- ready;
- selected/entered;
- submitting;
- correct;
- incorrect;
- partially correct where supported;
- explanation;
- retry/remediation;
- offline;
- recoverable error;
- unavailable/permission state.

State is announced accessibly and cannot be conveyed by color alone.

## 10. Content readability

- One clear task per screen where practical.
- Short paragraphs and visible hierarchy.
- Plain language before jargon.
- Explanations focus on why an answer works.
- Avoid dense dashboards during learning.
- Do not reduce font size to fit excessive content.

## 11. Validation gates

Pull requests affecting UI must include appropriate evidence from:

- automated accessibility checks;
- keyboard review;
- screen-reader review for new interaction patterns;
- responsive screenshots at mobile and desktop widths;
- bundle and route-size comparison;
- Lighthouse or equivalent lab measurement;
- slow-network and offline recovery test where relevant;
- no-JavaScript review for public indexable routes.

## 12. Failure policy

A performance or accessibility budget may be temporarily exceeded only through a documented, time-bounded exception containing:

- measured reason;
- learner impact;
- owner;
- compensating control;
- removal issue and expiry date.

Exceptions are not allowed for inaccessible authentication, payment, account deletion or the core learning challenge.