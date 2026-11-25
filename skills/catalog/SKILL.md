---
name: catalog
description: Discover the installed plugins and broker a read or a confirmed action through the catalog's one RPC id when you cannot read the plugin packages. Not for calling an installed plugin directly.
---

# Catalog

Use the catalog when you need what apps cannot get on their own: the installed plugins' validated manifests, a read of
one plugin's source for a named consumer, or a preview and commit of one plugin's action under a host-signed grant.
When you run beside OpenCode and can call a plugin's tools directly, call them; the catalog exists for the remote door,
not as a replacement for a plugin's own methods.

## What it looks like

- `tools.catalog.list` — every installed package: its manifest, its `sha256` hash and its own status. Re-read it after
  `rpc.catalog.changed`.
- `tools.catalog.broker_read` — one source read for `consumer`, as the contract's `BrokerRequest` inside `request`.
- `tools.catalog.broker_act` — the preview of one action; it answers the target's `planId`, which the commit spends.
- `tools.catalog.broker_act_commit` — the commit, with the host-signed grant for exactly `{ planId }`.

## Accounts

The account is the **target plugin's** alias, read from its own status, not the catalog's (it has none). Name it inside
the broker request. A target with several aliases and no `account` is `ACCOUNT_REQUIRED`; an alias it does not serve is
`ACCOUNT_UNKNOWN`.

## Access levels

`catalog.list`, `broker.read` and `broker.act` are reads and run at every level. `broker.act_commit` is a write with
`effect: ask`: it asks at `all` and `ask-changes`, and is off at `read-only`. The target plugin's own access setting is
final on top.

## Errors

- `INPUT_INVALID` — the request is not the broker request or act request shape; pass only the keys it names.
- `PERMISSION_DENIED` — the request's version or manifest hash is not the installed one, the account is not granted, the
  commit has no grant, or the access level is `read-only`. Consent again; do not widen it yourself.
- `ACCOUNT_REQUIRED`, `ACCOUNT_UNKNOWN` — pick an alias from the target's status next step.
- `GRANT_INVALID` — the target refused the grant: replayed, expired, for another plan, another account or another
  manifest. Preview again and confirm a fresh one.
- `PLAN_INVALID`, `PLAN_USED` — the target's plan expired, was already committed, or belongs to another method. Preview
  again.
- `SOURCE_UNKNOWN`, `UNAVAILABLE` — the target declares no such source or action, or the package is not installed.
  Re-read `catalog.list`.
