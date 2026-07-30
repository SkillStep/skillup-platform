# Infrastructure

The MVP reference architecture uses reproducible containers, PostgreSQL, S3-compatible object storage, Cloudflare and Railway as documented in ADR 0005.

`compose.yaml` currently provides PostgreSQL only. Queue, object-storage and application containers are added through focused issues after their executable packages exist.

Rules:

- no production secrets or environment-specific credentials;
- no direct production SSH editing;
- immutable artifacts and explicit release metadata;
- preview data is synthetic;
- database migrations, backups, health checks and rollback are release gates;
- production image tags must resolve to an immutable digest.