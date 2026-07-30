# SkillUp Brand System V1

**Status:** Approved working direction for product design and prototyping. Final trademark/domain clearance and visual review remain required before public launch.

## 1. Brand idea

SkillUp turns practical learning into visible momentum.

The brand should communicate three ideas at once:

1. **Useful learning** — not entertainment without outcomes.
2. **Progress** — every session moves the learner forward.
3. **Playful confidence** — challenges feel energetic, not intimidating.

## 2. Name and tagline

- **Product name:** SkillUp
- **Primary tagline:** Learn. Play. Level Up.
- **Supporting statement:** Build practical skills through short learning games.

Do not describe SkillUp as a chatbot. AI supports generation, feedback and personalization behind a structured learning experience.

## 3. Voice and tone

### Voice

- Clear
- Encouraging
- Practical
- Respectful
- Honest about limits

### Tone examples

| Situation | Preferred | Avoid |
|---|---|---|
| First visit | “Choose a skill and complete your first challenge.” | “Unlock the infinite power of AI learning.” |
| Correct answer | “Correct. You identified the strongest response.” | “Genius! You are unstoppable!” |
| Incorrect answer | “Not quite. Here is the clue you missed.” | “Wrong.” |
| Upgrade | “Get unlimited paths and deeper progress insights.” | “Pay now or lose your streak.” |
| AI limitation | “This explanation was AI-assisted and reviewed for this path.” | “Our AI is always accurate.” |

## 4. Visual direction

### Logo concept

A simple upward path made from two or three rounded learning tiles. The final tile subtly forms an arrow. The mark should work at favicon size and must not rely on gradients for recognition.

Avoid:

- graduation caps;
- robot heads;
- chat bubbles as the primary symbol;
- controller imagery that makes the product look like pure gaming;
- neon cyberpunk styling;
- visual similarity to existing SkillUp-branded learning providers.

### Primary palette

| Token | Hex | Use |
|---|---:|---|
| `brand-indigo-700` | `#4338CA` | Primary actions, active navigation, key brand areas |
| `brand-indigo-600` | `#4F46E5` | Default primary button and links |
| `brand-indigo-100` | `#E0E7FF` | Soft selected states and backgrounds |
| `progress-lime-500` | `#84CC16` | Progress, earned status and positive accents |
| `progress-lime-100` | `#ECFCCB` | Light progress surfaces |
| `energy-cyan-500` | `#06B6D4` | Secondary highlights and learning-path accents |
| `ink-950` | `#0F172A` | Primary text |
| `ink-700` | `#334155` | Secondary text |
| `surface-50` | `#F8FAFC` | Main page background |
| `surface-0` | `#FFFFFF` | Cards and elevated surfaces |
| `danger-600` | `#DC2626` | Errors and destructive actions |
| `warning-600` | `#D97706` | Warnings and pending states |

Color never acts as the only indicator of status. Contrast must meet WCAG 2.2 AA for supported text and controls.

### Typography

Use a variable, locally served or privacy-approved web font with strong Latin and Urdu support. The first implementation should evaluate:

- **Inter** or a system sans stack for English UI;
- **Noto Nastaliq Urdu** or **Noto Sans Arabic** for Urdu content, depending readability testing and product tone.

The UI must not download fonts from an unapproved third-party origin at runtime.

### Shape and spacing

- Rounded corners: 12–16 px for cards, 10–12 px for controls.
- Minimum touch target: 44 × 44 CSS pixels.
- Base spacing unit: 4 px.
- Content width: readable text columns, not full-width paragraphs.
- Use whitespace to reduce cognitive load; do not pack dashboards with every metric.

### Motion

- Motion explains state changes or progress; it does not decorate every interaction.
- Respect `prefers-reduced-motion`.
- Avoid long entrance animations, parallax and autoplay effects.
- A learner must be able to submit the next action without waiting for an animation.

## 5. Imagery and illustration

Use lightweight vector illustrations and simple geometric learning motifs. Represent Pakistani learners through varied, contemporary contexts without tokenism.

Approved themes:

- study desk and mobile learning;
- interview and workplace practice;
- freelancing and remote collaboration;
- progress paths, cards, badges and milestones;
- locally familiar but non-stereotyped environments.

Do not use AI-generated human imagery publicly without a review for anatomy, bias, cultural suitability, provenance and licensing.

## 6. Product language

Preferred terms:

- Skill
- Learning path
- Module
- Level
- Challenge
- Explanation
- Mastery
- Progress
- Streak
- Achievement

Avoid using “course” as the only mental model. It may be used for discoverability where users search for courses, but the in-product experience should emphasize paths, levels and practice.

## 7. Accessibility requirements

- Visible focus indicators.
- Keyboard operation for every core interaction.
- Text resizing to 200% without loss of function.
- Non-color status indicators.
- Plain-language validation and recovery instructions.
- Urdu/RTL mirroring rules documented before Urdu UI release.
- Game mechanics cannot require precise dragging as the only input method.

## 8. Brand governance

Any new public visual or copy pattern must answer:

- Does it make the learning outcome clearer?
- Does it preserve trust and avoid exaggerated claims?
- Does it remain fast on a low-to-mid-range phone?
- Does it work for English and future Urdu layouts?
- Does it meet accessibility requirements?
- Could it be confused with another SkillUp-branded service?

The design-system package will convert this document into versioned tokens and accessible components.