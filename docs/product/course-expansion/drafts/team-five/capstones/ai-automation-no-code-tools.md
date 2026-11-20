# Capstone — Reviewed No-Code Reporting Workflow

**Course identity:** `applied-ai-workflows` (reused); learner title **AI Automation & No-Code Tools** · **State:** unreviewed draft · **Publication:** forbidden

## Fictional use case
A community sports club collects match-volunteer availability via a **sample** form. Every Friday it needs a draft summary for a coordinator. The workflow may **prepare** a message but must not automatically send it or make a volunteer assignment.

### Synthetic events to test
| event_id | submitted_at | preferred_shift | status |
| --- | --- | --- | --- |
| evt-101 | Friday 09:10 | Morning | available |
| evt-102 | Friday 10:05 | Evening | available |
| evt-103 | Friday 10:20 | Morning | unavailable |
| evt-102 | Friday 10:05 | Evening | available |
| evt-104 | Friday 10:31 | *(missing)* | available |

The repeated `evt-102` is a simulated webhook retry, not a second volunteer. No names or contact details are provided.

## Build and document
1. Draw a flow: **form submitted → validate schema → deduplicate event ID → compute counts → draft summary → human approval → (optional authorized manual send)**.
2. Identify each connector's required access and reject any broad mailbox, drive or deletion permissions not needed.
3. Define required `event_id`, status allowed values, missing-shift exception and error/timeout behavior. A repeated event must not increase counts.
4. Provide a sample JSON or CSV input, normalized output and a sample approval message. Keep automation disabled for actual external delivery.
5. Test **normal input, duplicate event, missing field, empty batch, invalid status and simulated connector failure**. For each, record expected behavior and observed result (or explicitly label a design-only test unexecuted).
6. Provide a stop-and-review control for uncertain output and explain retry/idempotency strategy.
7. Compare manual minutes with proposed handling + reviewer minutes using fictional estimates; do not present projections as measured savings.

## Required deliverable
A 2–4 page flow diagram description or screenshot from a test-only no-code tool, input/output schema, permission matrix, exception table, six test case results, audit record example, and reviewer sign-off field left blank.

## Rubric (self/human review)
| Criterion | Points |
| --- | ---: |
| Trigger, mapping and schema are reproducible | 0–2 |
| Privacy permissions and side-effect restrictions are clear | 0–2 |
| Duplicate/missing/error cases are handled | 0–2 |
| Human review is placed before any send | 0–2 |
| Six transparent tests, limitations and cost trade-off are recorded | 0–2 |

**Target for draft quality:** 8/10. This is not an automatically graded connector integration or a platform-approved certificate threshold. Do not claim the workflow is live without real environment evidence.