# Not a secure secret store

This directory is **gitignored only**. It is NOT an approved place to
hold, share, back up or import final answer keys. Files on local or CI
workspaces may still leak through backups, tools, forced commits or logs.

Use a separately provisioned, restricted **external** repository, CMS or mount
outside the public Git checkout. Before use, Security must verify actual access
controls, storage encryption, audit logs and restore procedures.

The read-only private-bank preflight requires `AIFS_PRIVATE_BANK_ROOT` to
point to that external location. It must contain 10 JSON files covering five
courses; run `pnpm catalog:assessment-bank:validate` without printing secrets.

See `docs/product/course-expansion/PRIVATE_ASSESSMENT_BANK_OPERATIONS.md`
and [#281](https://github.com/SkillStep/skillup-platform/issues/281).

**Do not place real answer keys in this repository.**
