# Catalog

One trusted door for apps on [plugin-contract](https://github.com/we-the-rebel-alliance/plugin-contract) v0. The
catalog lists the plugins installed beside OpenCode, reads one plugin's source for a named consumer, and previews and
commits one plugin's action under the host-signed grant — so an app that cannot read the disk trusts one pinned RPC id
instead of every plugin's manifest.

The catalog signs in to nothing and talks to no provider. Every read and every write runs through the target plugin's
own methods, in a session fenced by the person's grant, and the target plugin's `access` setting stays final. The
catalog never verifies a grant, never widens one, and keeps no grant, session or plan beyond one call.

## Install

`dist/` is built by CI and is not committed, so install the packed tarball from this repository's GitHub release, not
the source tree. No release exists yet: the first is `v0.0.0`, cut by the owner once this repository's first pull
request has merged, and its release carries the tarball and `SHA256SUMS`.

```sh
opencode plugin add ./we-the-rebel-alliance-catalog-plugin-0.0.0.tgz
```

The standard's install line, once a release tag exists, pins the repository at the tag that release names:

```sh
opencode plugin add github:we-the-rebel-alliance/catalog-plugin#v<version>
```

## Use it

The namespace and RPC id are `catalog`. A brokered read sends the contract's `BrokerRequest` inside `request`:

```json
POST /api/rpc/catalog/broker_read
{
  "sessionID": "<session>",
  "input": {
    "request": {
      "package": "@example/notes-plugin",
      "version": "0.0.0",
      "manifestHash": "sha256:…",
      "consumer": "notes",
      "source": "notes.messages",
      "account": "work",
      "since": "-1d",
      "limit": 100
    }
  }
}
```

The answer is the contract's `BrokerAnswer`: `{ offered: true, ok: true, value }` with the plugin's page or snapshot
untransformed, or `{ offered: true, ok: false, code, message, next }`. `consumer` is the grant key; a request without
one is `INPUT_INVALID`.

A brokered action previews first and commits second, with the target plugin's plan id and the host-signed grant for it:

```json
POST /api/rpc/catalog/broker_act
{ "sessionID": "<session>", "input": { "request": {
  "package": "…", "version": "…", "manifestHash": "sha256:…",
  "consumer": "notes", "action": "notes.send", "account": "work", "input": { "text": "Deploy finished" }
} } }

POST /api/rpc/catalog/broker_act_commit
{ "sessionID": "<session>", "input": { "request": {
  "package": "…", "version": "…", "manifestHash": "sha256:…",
  "consumer": "notes", "action": "notes.send", "account": "work",
  "planId": "<the preview's planId>", "grant": "<the host-signed token for { planId }>"
} } }
```

The commit is class `write` with `effect: ask`, so the catalog's own door asks the person before it forwards; an app
answers that ask and signs the target's grant for the same confirmation. The target plugin's `register` verifies the
grant, spends the plan and the grant's `jti`, and runs the write. A commit without a grant is `PERMISSION_DENIED`; a
replayed one and one signed for another plan are `GRANT_INVALID`.

`catalog.list` returns every installed package's validated manifest, its `sha256` hash and its own `status`:

```json
POST /api/rpc/catalog/list
{ "sessionID": "<session>", "input": {} }
```

The catalog also emits `rpc.catalog.changed` on `/api/event` whenever the installed set changes. The event carries no
content; re-read through `catalog.list`.

## Access

`access` is `all` (the default), `ask-changes` or `read-only`.

| Level | `catalog.list`, `broker_read`, `broker_act` | `broker_act_commit` |
|---|---|---|
| `all` | runs | asks first |
| `ask-changes` | runs | asks first |
| `read-only` | runs | off |

The commit always asks, because the catalog cannot know how risky the target's action is. The target plugin's own
`access` setting is final on top of this one: a target set to `read-only` refuses its own writes even when the catalog
would forward one.

## Capabilities

<!-- generated:capabilities -->
### Methods

| Method | Class | Accounts | Operations |
|---|---|---|---|
| `status` | read | none | — |
| `list` | read | none | — |
| `broker_read` | read | none | — |
| `broker_act` | read | none | — |
| `broker_act_commit` | write | none | — |

### Sources

| Source | Kind | Reads or output | Method | Cost |
|---|---|---|---|---|

### Actions

None.

### Bus events

`rpc.catalog.changed`
<!-- /generated:capabilities -->

## Errors

<!-- generated:errors -->
| Code | Meaning |
|---|---|
| `NEEDS_SIGN_IN` | the account is not signed in |
| `SCOPE_MISSING` | the call needs a scope the person has not confirmed |
| `ACCOUNT_REQUIRED` | the plugin serves several accounts and the call names none |
| `ACCOUNT_UNKNOWN` | the call names an alias the plugin does not serve |
| `ACCOUNT_MISMATCH` | the item belongs to another account |
| `CURSOR_INVALID` | the cursor is malformed, or belongs to another source, account or scope |
| `CURSOR_EXPIRED` | the provider no longer keeps the history the cursor names |
| `RATE_LIMITED` | the provider asked the plugin to slow down |
| `BUDGET_EXCEEDED` | the read would cost more than the person allows |
| `SOURCE_DISABLED` | the person turned this source or action off |
| `TOO_LARGE` | the answer is larger than the source's maxBytes |
| `INPUT_INVALID` | the input does not match the method's schema |
| `SOURCE_UNKNOWN` | the plugin declares no such source |
| `SCHEMA_VIOLATION` | an answer does not keep the contract's shape |
| `PERMISSION_DENIED` | the person's grant does not cover the call |
| `PLAN_INVALID` | the plan is missing, or belongs to another method |
| `PLAN_USED` | the plan was already used by an earlier commit |
| `GRANT_INVALID` | the action grant did not verify, or was already spent |
| `HOST_UNTESTED` | OpenCode is outside the plugin's tested range |
| `OPTIONS_INVALID` | the plugin's options do not match their schema |
| `UNAVAILABLE` | the provider could not be reached |
<!-- /generated:errors -->

## Docs

- [Capabilities](docs/capabilities.md)
- [Configuration](docs/configuration.md)
- [Accounts](docs/accounts.md)
- [Automations](docs/automations.md)
- [Architecture](docs/architecture.md)
- [Security](docs/security.md)
