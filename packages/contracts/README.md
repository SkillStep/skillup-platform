# Contracts Package

Authoritative versioned request, response, event and job schemas shared by the web, API and AI worker.

Rules:

- contracts contain no secrets, runtime clients or domain side effects;
- backward-incompatible changes require a version and migration plan;
- OpenAPI is generated from or verified against these schemas;
- examples use synthetic data only;
- protected answers, internal prompts and private payment fields are never exposed through learner-facing contracts.