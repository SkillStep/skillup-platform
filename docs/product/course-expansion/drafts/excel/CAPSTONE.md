# Excel for Work — original synthetic capstone datasets

**DRAFT: not approved content.** Both CSV files contain only fictional business records, with no real learner or customer data. Numbers are synthetic, not a financial forecast. Imported data must be checked by an approved course reviewer before publication.

## Learner capstone instructions

1. Import both CSV files into a new Excel or Google Sheets workbook, keeping separate `Orders` and `Expenses` worksheets.
2. Check the 25 order identifiers, date parsing, numeric unit prices, quantities and payment-status spelling.
3. Add an `OrderTotalPKR` column using a numeric formula, and compute the total of all order values.
4. Count paid orders, pending orders and refunded orders separately; never include refunded amounts in paid revenue.
5. Summarize sales by item, calculate the expenses total, and create one labelled chart.
6. Mark shipments `DaysTaken > 7` as overdue. Ensure a text label accompanies any colour highlighting.
7. Write two concise conclusions, one limitation (e.g. costs are not complete profitability data), and a note on safe sharing permissions.

## Self-check rubric

- Order IDs preserved; no deletion or duplicate creation: mandatory.
- All quantities, dates, amounts and statuses evaluated correctly: mandatory.
- Paid revenue excludes refunded and pending orders: mandatory.
- Expense totals and charts reconcile to source records: mandatory.
- One chart includes units and labelled categories, with no misleading scale: mandatory.
- Summary distinguishes measured facts from possible causes and acknowledges data limitations: mandatory.
- Shared workbook uses fictional data and least-privilege viewer access: mandatory.

## Private subject-review reference values (not for unaudited public display)

- Source order rows: 25; Paid: 22; Pending: 2; Refunded: 1.
- Gross order-value total (all statuses): PKR 14050.
- Paid order-value total (excluding Pending/Refunded): PKR 12860.
- Ten sample expenses total: PKR 37250.
- Reviewer must independently recompute figures and check formulas in both spreadsheet products before final approval.

**Publication gate:** An authorized subject reviewer and independent publisher must sign off; CI or AI generation must not invent reviewer identity or change the draft state.
