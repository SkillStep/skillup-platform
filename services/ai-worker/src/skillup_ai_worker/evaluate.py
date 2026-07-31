"""Deterministic and optional live model evaluation gate."""

from __future__ import annotations

import json
import os
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from .config import read_worker_config
from .contracts import AiJob, TaskName
from .gateway import AiGateway
from .store import GatewayStore


@dataclass(frozen=True)
class EvaluationCaseResult:
    case_id: str
    task: str
    passed: bool
    provider: str | None
    model: str | None
    estimated_cost_usd: str | None
    error_type: str | None


@dataclass(frozen=True)
class EvaluationReport:
    status: str
    mode: str
    cases: int
    passed: int
    failed: int
    results: tuple[EvaluationCaseResult, ...]


def _fixtures_path() -> Path:
    return Path(__file__).resolve().parents[2] / "evaluation" / "fixtures.jsonl"


def _load_fixtures() -> list[dict[str, Any]]:
    fixtures: list[dict[str, Any]] = []
    for line_number, line in enumerate(_fixtures_path().read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        value = json.loads(line)
        if not isinstance(value, dict):
            raise ValueError(f"Evaluation fixture line {line_number} must be an object.")
        fixtures.append(value)
    return fixtures


def _deterministic_config():
    return read_worker_config(
        {
            "APP_ENV": "test",
            "FEATURE_AI_GENERATION_ENABLED": "true",
            "AI_PROVIDER": "deterministic",
            "AI_MAX_COST_USD_PER_JOB": "0.02",
            "AI_DAILY_BUDGET_USD": "1",
            "AI_MONTHLY_BUDGET_USD": "1",
            "AI_BUDGET_DB_PATH": ":memory:",
            "RELEASE_SHA": os.getenv("RELEASE_SHA", "local"),
        }
    )


def run_evaluation(*, live: bool = False) -> EvaluationReport:
    config = read_worker_config() if live else _deterministic_config()
    store = GatewayStore(config.budget_db_path)
    gateway = AiGateway(config, store=store, event_sink=lambda *_: None)
    results: list[EvaluationCaseResult] = []
    try:
        for fixture in _load_fixtures():
            case_id = str(fixture["id"])
            task = TaskName(str(fixture["task"]))
            try:
                result = gateway.execute(
                    AiJob(
                        task=task,
                        payload=dict(fixture["payload"]),
                        correlation_id=f"evaluation:{case_id}",
                        content_version=str(fixture["content_version"]),
                    )
                )
                results.append(
                    EvaluationCaseResult(
                        case_id=case_id,
                        task=task.value,
                        passed=bool(result.payload),
                        provider=result.provider.value,
                        model=result.model,
                        estimated_cost_usd=result.estimated_cost_usd,
                        error_type=None,
                    )
                )
            except Exception as error:
                results.append(
                    EvaluationCaseResult(
                        case_id=case_id,
                        task=task.value,
                        passed=False,
                        provider=None,
                        model=None,
                        estimated_cost_usd=None,
                        error_type=type(error).__name__,
                    )
                )
    finally:
        store.close()
    passed = sum(1 for result in results if result.passed)
    return EvaluationReport(
        status="passed" if passed == len(results) else "failed",
        mode="live" if live else "deterministic",
        cases=len(results),
        passed=passed,
        failed=len(results) - passed,
        results=tuple(results),
    )


def main() -> int:
    live = os.getenv("AI_EVALUATION_LIVE", "false").lower() == "true"
    report = run_evaluation(live=live)
    json.dump(asdict(report), sys.stdout, sort_keys=True)
    sys.stdout.write("\n")
    return 0 if report.failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
