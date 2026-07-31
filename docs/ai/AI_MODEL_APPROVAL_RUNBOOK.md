# AI Model Approval Runbook

No provider/model/task combination may serve production traffic until every gate below is recorded in release evidence.

## 1. Refresh provider facts

Confirm from official provider documentation:

- active model ID and deprecation date;
- input, cached-input and output pricing;
- context and output limits;
- JSON/structured-output behavior;
- rate and concurrency limits;
- data retention, training and deletion terms;
- incident and support channel.

Update `services/ai-worker/src/skillup_ai_worker/policies.py` through a reviewed pull request when any value changes.

## 2. Configure an isolated evaluation environment

Use synthetic, public or rights-cleared fixtures only.

```bash
export APP_ENV=staging
export FEATURE_AI_GENERATION_ENABLED=true
export AI_PROVIDER=deepseek
export DEEPSEEK_API_KEY='<secret manager reference at runtime>'
export AI_FALLBACK_PROVIDER=disabled
export AI_EVALUATION_LIVE=true
export AI_BUDGET_DB_PATH='./var/ai-evaluation.sqlite3'
python -m skillup_ai_worker.evaluate > ai-evaluation-report.json
```

Never place the key in a shell history, repository, issue, CI log or report.

## 3. Evaluate every task

Required dimensions:

- valid schema rate;
- factual/source grounding;
- unsupported claim rate;
- age-appropriate clarity;
- distractor quality and ambiguity;
- explanation usefulness;
- English quality;
- Urdu accuracy, terminology and cultural fit;
- safety and prompt-injection resistance;
- latency and retry behavior;
- average and p95 cost;
- duplicate rate;
- provider outage and fallback behavior.

The deterministic report is a contract test only. A human-reviewed live evaluation report is mandatory for production.

## 4. Approval thresholds

A task can be approved only when:

- 100% of sampled outputs parse and pass the strict task schema;
- no critical safety, privacy or unsupported-publication defect exists;
- factual and pedagogical quality meets the product owner's threshold;
- Urdu samples are approved by a qualified reviewer;
- p95 cost remains below the task and global ceiling;
- fallback behavior does not silently change quality or privacy policy;
- content remains a draft requiring editorial approval.

Record the provider, model, task, prompt version, fixture version, sample size, reviewer, date, findings, approved cost ceiling and rollback decision.

## 5. Controlled activation

1. Keep `FEATURE_AI_GENERATION_ENABLED=false` in the deployable baseline.
2. Add provider credentials through the deployment secret manager.
3. Start with fallback disabled.
4. Set small daily/monthly budgets and concurrency.
5. Enable only one approved task.
6. Review every generated artifact manually.
7. Monitor schema failures, redactions, latency, cost, retries and provider errors.
8. Expand task-by-task after acceptance evidence.

## 6. Rollback

Immediate rollback is configuration-only:

```text
FEATURE_AI_GENERATION_ENABLED=false
AI_PROVIDER=disabled
AI_FALLBACK_PROVIDER=disabled
```

Stop the worker, revoke compromised keys when applicable, preserve non-sensitive ledger evidence, quarantine unreviewed drafts, and do not delete incident records until the security owner approves retention handling.
