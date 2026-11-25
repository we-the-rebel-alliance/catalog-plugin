# Changelog

## 0.0.0 (2026-11-25)

The first release: one trusted door for apps on plugin-contract v0.

- `catalog.list`: the installed plugins' validated manifests, their `sha256` hashes and each plugin's own status.
- `broker_read`: a consumer's read of a named plugin's source, through the contract's `read` module and a session fenced
  by exactly the grant's rules. The request is keyed on `consumer`.
- `broker_act` and `broker_act_commit`: the preview and the commit of a named plugin's action, through the contract's
  `act` module. The commit carries the target plugin's plan id and the host-signed grant for `{ planId }`; the target's
  `register` verifies it and the catalog never does.
- `rpc.catalog.changed`: one nudge when the installed set changes.
- No accounts, no source, no action and no provider of its own; the catalog signs in to nothing and makes no network
  call.
