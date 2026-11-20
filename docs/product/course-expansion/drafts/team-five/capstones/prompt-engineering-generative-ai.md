# Capstone — Five-Prompt Toolkit

**Course:** Prompt Engineering & Generative AI · **Status:** AI-assisted original draft, human subject/language review pending · **Publication:** forbidden

## Learner goal
Create **five distinct and reusable task prompts**, evaluate each on two synthetic inputs, correct failures, and deliver one tidy toolkit with a verification checklist and error log. This is a practical **self-reviewed** project, not an independently graded AI certificate.

## Fictional brief
A small neighbourhood reading club needs help preparing: (1) a study timetable, (2) an event announcement, (3) a member FAQ, (4) a meeting summary, and (5) a supplier comparison. No real person, phone number, email, or private customer record may be supplied.

### Approved input set A
- Reading club: **Elm Street Reading Club** (fictional)
- Event: **Saturday reading circle**, 11:00–12:00, Room B, free admission
- FAQ policy: seats reserved by completing a short signup form; no fee; no confirmed online booking
- Meeting: 8 attendees agreed to buy two reusable noticeboards; venue confirmation remains pending
- Supplies: fictional offers **A: 2 boards × PKR 2,400, pickup free**; **B: 2 boards × PKR 2,250 + PKR 500 delivery**; no quality information

### Approved input set B (edge case)
- Event time missing; attendee count not provided; venue permission still uncertain; supplier prices lack tax details.
- The model must say what is unknown, not invent times, counts, prices or approval.

## Work
1. For each of the five tasks, write a structured prompt containing **goal, audience, permitted input, constraints, required format and missing-data rule**.
2. Run each with **set A** and **set B** (ten tests). Save both outputs without real personal information.
3. Build a five-row **claim-check table**: claim, source line, verified/unverified, correction.
4. Make an **error log** containing test ID, observed failure, revised instruction and retest result. Record at least one meaningful correction; if no failure occurs, document a deliberately ambiguous case and how the revised prompt handles it.
5. Explain where human review remains mandatory. Do not claim the tool can guarantee an answer's correctness.

## Deliverable
A 3–5 page Markdown or document pack containing five named prompts, ten synthetic outputs or concise excerpts, verification checklist, error log and a short limitations paragraph.

## Transparent evaluation rubric (human/self-review only)
| Criterion | 0 | 1 | 2 |
| --- | --- | --- | --- |
| Five distinct reusable tasks | fewer than three | three or four | all five |
| Defined input, audience and format | mostly absent | partial | complete for every prompt |
| Missing-data/claim safety | inventions unflagged | partial | unknowns explicitly marked |
| Ten input tests and corrections | absent | incomplete | 10 tests with a correction log |
| Privacy and provenance | unsafe data | partial | fictional only, claims traceable |

**Target:** 8/10 with no serious uncorrected unsafe or invented claims. Scoring threshold is **suggested for editorial discussion, not an approved platform certificate rule**.

## Review gate
Independent subject review checks that prompts produce appropriate outputs and all answers have been verified; language/accessibility review checks clarity; publisher signs off only after staging gameplay/entitlement QA. No automatic approval.