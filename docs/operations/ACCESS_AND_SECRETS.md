# Production Access and Secrets

## Access

- use named human accounts and dedicated service identities; never share credentials;
- grant the minimum role required and separate deployment, database and billing privileges;
- require multi-factor authentication wherever supported;
- review production and vendor access at least quarterly and after every role change;
- log privileged actions and preserve audit records;
- maintain one documented, monitored break-glass path with immediate post-use rotation.

## Secrets

- inject secrets through the selected platform; never commit them or place them in build arguments;
- scope credentials per environment and service;
- rotate immediately after suspected exposure, staff departure or break-glass use;
- schedule routine rotation based on provider capability and risk;
- redact cookies, tokens, verification codes, passwords and provider keys from logs and evidence;
- revoke old credentials only after the replacement is verified.

## Deployment review

Before first production deployment, record the owner, purpose, privilege, expiry/rotation date and recovery contact for every production credential. Unowned or undocumented access blocks release.
