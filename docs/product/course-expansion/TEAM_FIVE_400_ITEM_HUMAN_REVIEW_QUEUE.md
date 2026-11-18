# Team-five human review queue — 120 lessons, 400 replacement assessment slots

**Engineering review worksheet; not a course approval or evidence of 400 rewritten questions.**

Source: draft content PR [#280](https://github.com/SkillStep/skillup-platform/pull/280) at **d70b919ffe00392651832e82271bf335d35833e4**. The source's historical answer keys are PUBLIC and must never be reused for completion certificates or final scored release. All item slots below are **PENDING NEW PRIVATE AUTHORING, SME verification and QA**. Only level names and module order are cited; no private answers are reproduced.

## Reviewer assignment and approval record (all pending)

| Scope | Editor (submitter) | Subject reviewer | Accessibility reviewer | Independent publisher | Private-bank status |
| --- | --- | --- | --- | --- | --- |
| [Prompt Engineering & Generative AI](https://github.com/SkillStep/skillup-platform/issues/263) | NOT ASSIGNED | NOT ASSIGNED | NOT ASSIGNED | NOT ASSIGNED | NOT PROVISIONED |
| [Cybersecurity & Digital Safety](https://github.com/SkillStep/skillup-platform/issues/264) | NOT ASSIGNED | NOT ASSIGNED | NOT ASSIGNED | NOT ASSIGNED | NOT PROVISIONED |
| [Data Analytics & Decision Making](https://github.com/SkillStep/skillup-platform/issues/242) | NOT ASSIGNED | NOT ASSIGNED | NOT ASSIGNED | NOT ASSIGNED | NOT PROVISIONED |
| [AI Automation & No-Code Tools](https://github.com/SkillStep/skillup-platform/issues/244) | NOT ASSIGNED | NOT ASSIGNED | NOT ASSIGNED | NOT ASSIGNED | NOT PROVISIONED |
| [Sales, Negotiation & Client Management](https://github.com/SkillStep/skillup-platform/issues/247) | NOT ASSIGNED | NOT ASSIGNED | NOT ASSIGNED | NOT ASSIGNED | NOT PROVISIONED |

**Human controls:** editor, subject reviewer, accessibility reviewer and publisher must be **four different authorized humans** on the same frozen course digest. Any content edit invalidates preceding reviews; official signed decisions belong in the protected `/en/admin/course-editorial` console, not this worksheet.

## Scoring slots and secure-bank contract

- Each of five courses: **24 levels × 3 distinct practice questions = 72**; plus **4 baseline + 4 endline = 8**; total **80 private item slots per course**.
- Across five: **120 levels; 360 practice and 40 paired formative assessment items; 400 proposed replacement questions**.
- Use a separately access-controlled storage root **outside** the public Git checkout, backed by a real private repository/CMS. Structural preflight: `AIFS_PRIVATE_BANK_ROOT=/external/secured/path pnpm catalog:assessment-bank:validate` after #284 is reviewed. It will never approve subject accuracy.
- Authoring criteria: each replacement must be actually new (not merely answer shuffling), subject-relevant, source-backed, feedback-rich, accessible, and free from personally identifying data. Quiz results must be server evaluated and protected.
- Each level row below requires a **genuinely authored and independently tested** set of three private questions. The 8 assessment slots per course are separately assigned to formative baseline/endline until Product Owner signs #265.
- No imported draft, review, certificate issuance, or published status should be asserted from the existence of this tracking file.

## Prompt Engineering & Generative AI

**Issue:** [#263](https://github.com/SkillStep/skillup-platform/issues/263) · **Canonical slug:** `prompt-engineering-generative-ai` · **SME focus:** AI outputs, source-checking, prompts.

| Level | Module | Lesson to independently verify | 3 NEW private items | Subject review | Accessibility | QA |
| ---: | ---: | --- | --- | --- | --- | --- |
| 1 | 1 | Set a Goal Before Writing a Prompt | P01-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 2 | 1 | Identify the Intended Audience | P02-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 3 | 1 | Supply Relevant Source Material | P03-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 4 | 1 | Separate Instructions From Background | P04-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 5 | 1 | Specify an Answer Format | P05-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 6 | 1 | Checkpoint: Write a Complete Task Brief | P06-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 7 | 2 | Prioritize Constraints | P07-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 8 | 2 | Choose Helpful Examples | P08-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 9 | 2 | Control Tone Without Changing Facts | P09-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 10 | 2 | Break Large Tasks Into Parts | P10-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 11 | 2 | Ask for Clarifying Assumptions | P11-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 12 | 2 | Checkpoint: Improve a Weak Prompt | P12-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 13 | 3 | Recognize Hallucinated References | P13-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 14 | 3 | Check Numeric Results Independently | P14-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 15 | 3 | Distinguish Facts From Suggestions | P15-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 16 | 3 | Verify Dates and Current Policies | P16-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 17 | 3 | Protect Confidential Inputs | P17-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 18 | 3 | Checkpoint: Audit an AI Answer | P18-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 19 | 4 | Build Reusable Prompt Variables | P19-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 20 | 4 | Design a Verification Checklist | P20-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 21 | 4 | Compare Prompt Variants Fairly | P21-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 22 | 4 | Record Failure Cases | P22-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 23 | 4 | Test Across More Than One Example | P23-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 24 | 4 | Capstone: Deliver a Five-Prompt Toolkit | P24-A/B/C: PENDING | PENDING | PENDING | PENDING |

**Assessment bank:** B01–B04 = four independently authored baseline questions; E01–E04 = four endline questions of matched difficulty. **All eight PENDING.**

**Capstone:** review the separately drafted course capstone for clear scoring rubric, original synthetic evidence, accessibility, privacy, affordability and feasible platform implementation. **PENDING.**

**Required artifacts to add as links (not answer keys):** final bank secure-location reference + validator aggregates; subject reviewer signed record + frozen digest; language/accessibility signed record; course-specific exact-SHA browser QA link; final publisher decision. **ALL PENDING.**

## Cybersecurity & Digital Safety

**Issue:** [#264](https://github.com/SkillStep/skillup-platform/issues/264) · **Canonical slug:** `cybersecurity-digital-safety` · **SME focus:** Fictional safe examples, verified security facts.

| Level | Module | Lesson to independently verify | 3 NEW private items | Subject review | Accessibility | QA |
| ---: | ---: | --- | --- | --- | --- | --- |
| 1 | 1 | Spot Urgency in Phishing Messages | P01-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 2 | 1 | Inspect Sender and Domain Clues | P02-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 3 | 1 | Recognize Suspicious Link Targets | P03-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 4 | 1 | Check Impersonation Claims | P04-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 5 | 1 | Protect One-Time Codes | P05-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 6 | 1 | Checkpoint: Triage a Suspected Scam | P06-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 7 | 2 | Create Long Unique Passphrases | P07-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 8 | 2 | Understand Multi-Factor Authentication | P08-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 9 | 2 | Use Password Managers Safely | P09-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 10 | 2 | Plan Account Recovery | P10-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 11 | 2 | Keep Devices and Apps Updated | P11-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 12 | 2 | Checkpoint: Secure a New Account | P12-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 13 | 3 | Limit Unnecessary App Permissions | P13-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 14 | 3 | Identify Sensitive Personal Data | P14-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 15 | 3 | Review File Sharing Access | P15-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 16 | 3 | Use Safer Public Wi-Fi Habits | P16-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 17 | 3 | Understand Backups and Device Loss | P17-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 18 | 3 | Checkpoint: Minimize Exposure | P18-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 19 | 4 | Respond to a Suspected Account Takeover | P19-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 20 | 4 | Report Fraud Without Spreading It | P20-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 21 | 4 | Protect Financial Transactions | P21-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 22 | 4 | Communicate a Breach Calmly | P22-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 23 | 4 | Prepare an Incident Playbook | P23-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 24 | 4 | Capstone: Build a Digital Safety Plan | P24-A/B/C: PENDING | PENDING | PENDING | PENDING |

**Assessment bank:** B01–B04 = four independently authored baseline questions; E01–E04 = four endline questions of matched difficulty. **All eight PENDING.**

**Capstone:** review the separately drafted course capstone for clear scoring rubric, original synthetic evidence, accessibility, privacy, affordability and feasible platform implementation. **PENDING.**

**Required artifacts to add as links (not answer keys):** final bank secure-location reference + validator aggregates; subject reviewer signed record + frozen digest; language/accessibility signed record; course-specific exact-SHA browser QA link; final publisher decision. **ALL PENDING.**

## Data Analytics & Decision Making

**Issue:** [#242](https://github.com/SkillStep/skillup-platform/issues/242) · **Canonical slug:** `data-analytics-dashboards` · **SME focus:** Recalculate numerical samples and charts.

| Level | Module | Lesson to independently verify | 3 NEW private items | Subject review | Accessibility | QA |
| ---: | ---: | --- | --- | --- | --- | --- |
| 1 | 1 | Translate a Business Concern into Data Questions | P01-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 2 | 1 | Define an Outcome Metric | P02-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 3 | 1 | Choose a Useful Comparison Period | P03-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 4 | 1 | Identify Missing Data Requirements | P04-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 5 | 1 | Avoid Vanity Metric Traps | P05-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 6 | 1 | Checkpoint: Write a KPI Brief | P06-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 7 | 2 | Distinguish Numeric and Text Data | P07-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 8 | 2 | Identify Invalid Dates and Values | P08-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 9 | 2 | Detect True Versus False Duplicates | P09-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 10 | 2 | Check Outliers Against Sources | P10-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 11 | 2 | Reconcile Totals After Cleaning | P11-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 12 | 2 | Checkpoint: Verify a Small Dataset | P12-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 13 | 3 | Choose a Fair Comparison Chart | P13-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 14 | 3 | Label Axes and Units Clearly | P14-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 15 | 3 | Compare Categories Without Distorting Scale | P15-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 16 | 3 | Interpret a Trend with Context | P16-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 17 | 3 | Describe Limitations and Missing Drivers | P17-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 18 | 3 | Checkpoint: Explain a Dashboard | P18-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 19 | 4 | Select Three Meaningful KPIs | P19-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 20 | 4 | Design a Readable Dashboard Layout | P20-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 21 | 4 | Connect Charts to Accurate Source Tables | P21-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 22 | 4 | Add Caveats to Summary Insights | P22-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 23 | 4 | Prioritize Actions Supported by Evidence | P23-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 24 | 4 | Capstone: Present an Operational Dashboard | P24-A/B/C: PENDING | PENDING | PENDING | PENDING |

**Assessment bank:** B01–B04 = four independently authored baseline questions; E01–E04 = four endline questions of matched difficulty. **All eight PENDING.**

**Capstone:** review the separately drafted course capstone for clear scoring rubric, original synthetic evidence, accessibility, privacy, affordability and feasible platform implementation. **PENDING.**

**Required artifacts to add as links (not answer keys):** final bank secure-location reference + validator aggregates; subject reviewer signed record + frozen digest; language/accessibility signed record; course-specific exact-SHA browser QA link; final publisher decision. **ALL PENDING.**

## AI Automation & No-Code Tools

**Issue:** [#244](https://github.com/SkillStep/skillup-platform/issues/244) · **Canonical slug:** `applied-ai-workflows` · **SME focus:** Consent, human approval and failure recovery.

| Level | Module | Lesson to independently verify | 3 NEW private items | Subject review | Accessibility | QA |
| ---: | ---: | --- | --- | --- | --- | --- |
| 1 | 1 | List Repeatable Low-Risk Work Tasks | P01-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 2 | 1 | Recognize Tasks Needing Human Judgment | P02-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 3 | 1 | Define a Clear Workflow Outcome | P03-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 4 | 1 | Identify Inputs and Access Requirements | P04-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 5 | 1 | Estimate the Cost of a Bad Answer | P05-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 6 | 1 | Checkpoint: Select a Safe AI Workflow | P06-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 7 | 2 | Write a Structured Task Brief | P07-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 8 | 2 | Specify Format and Quality Standards | P08-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 9 | 2 | Add Relevant Context Without Secrets | P09-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 10 | 2 | Break Complex Work into Verified Steps | P10-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 11 | 2 | Design a Reusable Prompt Template | P11-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 12 | 2 | Checkpoint: Improve a Reporting Prompt | P12-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 13 | 3 | Recognize Unsupported AI Claims | P13-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 14 | 3 | Verify Facts with Primary Sources | P14-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 15 | 3 | Protect Private Work Materials | P15-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 16 | 3 | Document Sources and Assumptions | P16-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 17 | 3 | Escalate Sensitive or High-Stakes Decisions | P17-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 18 | 3 | Checkpoint: Audit an AI-Generated Report | P18-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 19 | 4 | Map Human Review Checkpoints | P19-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 20 | 4 | Define Repeatable Inputs and Outputs | P20-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 21 | 4 | Write a Simple Quality Checklist | P21-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 22 | 4 | Test a Workflow on Fictional Data | P22-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 23 | 4 | Measure Corrections and Time Saved | P23-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 24 | 4 | Capstone: Document a Reviewed AI Process | P24-A/B/C: PENDING | PENDING | PENDING | PENDING |

**Assessment bank:** B01–B04 = four independently authored baseline questions; E01–E04 = four endline questions of matched difficulty. **All eight PENDING.**

**Capstone:** review the separately drafted course capstone for clear scoring rubric, original synthetic evidence, accessibility, privacy, affordability and feasible platform implementation. **PENDING.**

**Required artifacts to add as links (not answer keys):** final bank secure-location reference + validator aggregates; subject reviewer signed record + frozen digest; language/accessibility signed record; course-specific exact-SHA browser QA link; final publisher decision. **ALL PENDING.**

## Sales, Negotiation & Client Management

**Issue:** [#247](https://github.com/SkillStep/skillup-platform/issues/247) · **Canonical slug:** `sales-client-negotiation` · **SME focus:** Honest pricing, permission and fair claims.

| Level | Module | Lesson to independently verify | 3 NEW private items | Subject review | Accessibility | QA |
| ---: | ---: | --- | --- | --- | --- | --- |
| 1 | 1 | Research an Appropriate Client Fit | P01-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 2 | 1 | Open a Respectful Discovery Conversation | P02-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 3 | 1 | Ask Specific Needs Questions | P03-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 4 | 1 | Confirm Decision Criteria | P04-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 5 | 1 | Summarize a Client's Actual Request | P05-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 6 | 1 | Checkpoint: Prepare a Discovery Script | P06-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 7 | 2 | Describe Scope and Deliverables Clearly | P07-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 8 | 2 | Estimate Effort and Dependencies | P08-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 9 | 2 | Explain Pricing Assumptions | P09-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 10 | 2 | Compare Proposals Transparently | P10-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 11 | 2 | Specify Exclusions and Revision Limits | P11-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 12 | 2 | Checkpoint: Write a Two-Option Offer | P12-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 13 | 3 | Handle a Budget Concern Calmly | P13-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 14 | 3 | Respond to a Scope-Creep Request | P14-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 15 | 3 | Explain a Realistic Deadline | P15-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 16 | 3 | Avoid False Scarcity and Pressure | P16-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 17 | 3 | Know When to Decline a Bad Fit | P17-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 18 | 3 | Checkpoint: Practice an Objection Response | P18-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 19 | 4 | Build a Consultative Sales Sequence | P19-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 20 | 4 | Prepare an Accurate Written Proposal | P20-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 21 | 4 | Write a Practical Follow-up Message | P21-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 22 | 4 | Plan a Transparent Handover | P22-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 23 | 4 | Audit Claims and Commercial Terms | P23-A/B/C: PENDING | PENDING | PENDING | PENDING |
| 24 | 4 | Capstone: Deliver a Client Offer Pack | P24-A/B/C: PENDING | PENDING | PENDING | PENDING |

**Assessment bank:** B01–B04 = four independently authored baseline questions; E01–E04 = four endline questions of matched difficulty. **All eight PENDING.**

**Capstone:** review the separately drafted course capstone for clear scoring rubric, original synthetic evidence, accessibility, privacy, affordability and feasible platform implementation. **PENDING.**

**Required artifacts to add as links (not answer keys):** final bank secure-location reference + validator aggregates; subject reviewer signed record + frozen digest; language/accessibility signed record; course-specific exact-SHA browser QA link; final publisher decision. **ALL PENDING.**

## Global GO / NO-GO checkpoints

- [ ] Security: external private storage, ACLs, backup/audit verified; old historical answer keys are superseded and final new keys never appear in public tree/bundles/APIs ([#281](https://github.com/SkillStep/skillup-platform/issues/281)).
- [ ] Content: all 400 new private items pass structural validation; every item has independent subject-signoff; all five capstones reviewed.
- [ ] Policy: named Product Owner and Legal/Privacy approve exact scoring/retake/legal version ([#265](https://github.com/SkillStep/skillup-platform/issues/265)).
- [ ] QA: all five courses are real runnable staged content; exact deployed SHA has browser/Free/Premium/expired/accessibility/PDF/negative tests and historical dry-run.
- [ ] Publisher: authenticated four-human approvals on identical frozen course content versions; no comments/checkmarks substitute.
- [ ] Release: project owner separately signs [#271](https://github.com/SkillStep/skillup-platform/issues/271) with rollback reference. **No production or certificate action from this worksheet.**
