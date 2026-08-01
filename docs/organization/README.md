# SkillStep Organization Governance

This directory is the authoritative GitHub record for repository ownership, legacy containment, controlled migration and final disposition.

## Canonical-source decision

`SkillStep/skillup-platform` is the only repository authorized to contain current SkillUp product development or deploy SkillUp staging and production.

The following repositories are legacy evidence only until archived or transferred:

- `SkillStep/python`
- `SkillStep/frontend`
- `SkillStep/web-admin`
- `SkillStep/backend`
- `SkillStep/mobile-app`

No feature, data contract, prompt, design or asset may enter the canonical platform without a completed migration-register decision.

## Registers

- [Repository inventory](REPOSITORY_INVENTORY.md)
- [Legacy migration register](LEGACY_MIGRATION_REGISTER.md)
- [Credential and provider register](CREDENTIAL_AND_PROVIDER_REGISTER.md)
- [Deployment and domain register](DEPLOYMENT_AND_DOMAIN_REGISTER.md)
- [Datastore and retention register](DATASTORE_AND_RETENTION_REGISTER.md)
- [Asset and licence register](ASSET_AND_LICENCE_REGISTER.md)
- [Ownership and access register](OWNERSHIP_AND_ACCESS_REGISTER.md)
- [Repository disposition log](REPOSITORY_DISPOSITION_LOG.md)

## GitHub control issues

- `#80` — organization audit and consolidation
- `#81` — credential, token and signing-material rotation
- `#82` — deployment, domain, webhook and scheduler shutdown
- `#83` — canonical repository governance
- `#84` — organization and migration registers
- `#85` — final archival/transfer closure

## Rules

1. Never place secret values, private keys, OTP secrets or passwords in these documents.
2. Treat every credential committed to legacy history as compromised until disposition is verified.
3. Preserve evidence before disabling a service or deleting data.
4. Do not copy legacy authentication, authorization, payment, provider, networking, database or deployment code.
5. Link every approved migration item to a canonical issue and pull request.
6. Archive or transfer legacy repositories only after the closure packet in `#85` is approved.
