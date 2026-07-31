# syntax=docker/dockerfile:1.7

FROM python:3.13.5-slim-bookworm AS runtime

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app/src
ENV AI_BUDGET_DB_PATH=/var/lib/skillup-ai/ai-gateway.sqlite3

RUN groupadd --system --gid 10001 skillup-ai \
    && useradd --system --uid 10001 --gid skillup-ai --home-dir /app --shell /usr/sbin/nologin skillup-ai \
    && mkdir -p /app /var/lib/skillup-ai \
    && chown -R skillup-ai:skillup-ai /app /var/lib/skillup-ai

WORKDIR /app

COPY --chown=skillup-ai:skillup-ai services/ai-worker/src ./src
COPY --chown=skillup-ai:skillup-ai services/ai-worker/evaluation ./evaluation

USER skillup-ai

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -m skillup_ai_worker.health >/dev/null

CMD ["python", "-m", "skillup_ai_worker.worker"]
