# Capstone — Operational Dashboard with Decision Memo

**Course identity:** `data-analytics-dashboards` (reused), learner title **Data Analytics & Decision Making**. **State:** unreviewed draft, not for publication.

## Fictional case
**Maple Bakery** has a synthetic twelve-order extract (see `sample-bakery-orders.csv`) representing two weeks. The data deliberately include delivered, cancelled and pending orders. Currency is **PKR**; every date, ID and amount is fictional. No real customer data.

## Learner tasks
1. Import the CSV and state data types, date range, row count, status values and what "amount_pkr" represents.
2. Flag and document missing or suspicious values without silently inventing replacements; in this sample, no ID is repeated. Keep cancellations and pending orders in the source.
3. Define three KPIs with precise calculation: **fulfilled order count** (status = delivered), **fulfilled order revenue** (sum of amounts for delivered rows only) and **delivery completion rate** (delivered count / all recorded orders, with the denominator stated and a caveat that pending items may later complete).
4. Compare Week 1 versus Week 2 using the date column. Add a category comparison (cakes vs bread vs drinks). Label currency, timeframe and count units.
5. Build one readable summary card row and two charts: (a) delivered orders by week and (b) delivered revenue by category. Bar charts use a zero baseline.
6. Draft a 150–250 word decision memo distinguishing observed facts from unverified explanations. Recommend one small operational experiment and name the measure that would show success.
7. Attach a cleaning/reconciliation log and describe why an association between week and performance does not prove causation.

## Required answer-check references
There are **12 records**, no repeated `order_id`, and some rows are cancelled/pending. Your calculation must not count cancelled order amounts as fulfilled sales. Reviewers should derive the expected counts independently from the CSV; students should show formulas, filters and a reproducible method rather than copy opaque values.

## Deliverable
A workbook or CSV-derived report with source tab, cleaned view, formulas, KPI cards, two charts, decision memo, caveats and source reconciliation.

## Rubric (human/self-assessment, not automatically scored)
| Criterion | Points |
| --- | ---: |
| Accurate record checks and no invented data | 0–2 |
| Correct KPI definitions, denominators and arithmetic | 0–2 |
| Clear, non-misleading chart labels and scales | 0–2 |
| Source-traceable summary with honest caveats | 0–2 |
| Evidence-based next experiment and action owner | 0–2 |

**Proposed quality benchmark:** 8/10 with zero fabricated source records. Requires independent answer check, accessibility review and publisher approval; not an accredited qualification.