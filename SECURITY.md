# Security

## Reporting a vulnerability

Report a vulnerability through GitHub's private vulnerability reporting on this repository. Do not open a public issue
with a credential, a token or a person's data in it.

## What this plugin holds

No credential and no token. The catalog has no provider and no network call. It passes one target plugin's action grant
through to that plugin and keeps no copy; the target's own `register` verifies it, spends it once, and refuses a
replayed one.

See [docs/security.md](docs/security.md) for the data flow, the grant and confirmation rules, and the redaction.
