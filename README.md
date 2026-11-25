# Catalog

One trusted door for apps on [plugin-contract](https://github.com/we-the-rebel-alliance/plugin-contract) v0. The
catalog lists the plugins installed beside OpenCode, reads one plugin's source for a named consumer, and previews and
commits one plugin's action under the host-signed grant — so an app that cannot read the disk trusts one pinned RPC id
instead of every plugin's manifest.

The catalog signs in to nothing and talks to no provider. Every read and every write runs through the target plugin's
own methods, in a session fenced by the person's grant, and the target plugin's `access` setting stays final. The
catalog never verifies a grant and keeps no grant, session or plan beyond one call; its fence is exactly the person's
grant. One known contract issue still lets a target method-level `deny` be overridden by a fenced read
(plugin-contract#76).

## Install

```sh
opencode plugin add github:we-the-rebel-alliance/catalog-plugin#v0.0.0
```

`v0.0.0` is the first release on plugin-contract v0, cut from `master` by the release workflow. Pin it, because a Git
install does not update by itself. Until the tag is published, pin the commit you reviewed instead; the release
workflow packs the tag's committed `dist/index.js`.

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

## Accounts

The catalog signs in to nothing and has no `accounts` option. A broker request's `account` is the **target plugin's**
alias, resolved against that plugin's own `status`; the catalog never invents one. See [Accounts](docs/accounts.md).

## Options

| Option | Default | Meaning |
|---|---|---|
| `access` | `all` | How much the catalog's methods may do; see Access below. |
| `allowUntestedHost` | `false` | Start on an OpenCode release outside `>=2.4.1 <2.5.0`. Leave it `false`. |
| `grants` | `[]` | The consumer grants this person consented to; see Grants below. |

Set them under the plugin's entry in `opencode.json`; see [Configuration](docs/configuration.md).

## Grants

A **grant** is the person's consent, kept in the plugin's configuration: one `consumer`, one `source` or `action`, one `account`, the confirmed `scope`, the installed `manifestHash` and an optional `disabled` switch. A broker request only names its consumer; the catalog looks that consumer's grant up before it opens a fence, and a request can never supply or widen one. An ungranted consumer, another consumer's grant, another account, another manifest or a scope outside the grant is `PERMISSION_DENIED`; a disabled grant is `SOURCE_DISABLED`. A changed target manifest changes its hash, so the person grants it again.

```json
{
  "grants": [
    { "consumer": "notes", "source": "harbour.notes", "account": "work", "scope": { "spaces": ["space-research"] }, "manifestHash": "sha256:…" }
  ]
}
```

## Access

`access` is `all` (the default), `ask-changes` or `read-only`.

| Level | `catalog.list`, `broker_read`, `broker_act` | `broker_act_commit` |
|---|---|---|
| `all` | runs | asks first |
| `ask-changes` | runs | asks first |
| `read-only` | runs | off |

The commit always asks, because the catalog cannot know how risky the target's action is. The target plugin's own
`access` setting is final on top of this one: a target set to `read-only` refuses its own writes even when the catalog
would forward one. A target method-level `deny` on a read is the one known exception until plugin-contract#76 is fixed.

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

## Troubleshooting

- **`HOST_UNTESTED`** — the running OpenCode is outside `>=2.4.1 <2.5.0`. Install a tested release.
- **`INPUT_INVALID`** — the request is not the contract's `BrokerRequest`, or an act request has an unknown key. Send it
  inside `request`, with `consumer`, `package`, `version`, `manifestHash` and `source` or `action`, and nothing else.
- **`ACCOUNT_REQUIRED` / `ACCOUNT_UNKNOWN`** — the target serves several accounts and the request names none, or names
  an alias it does not serve. Re-read `catalog.list` for the target's status and pass one of its aliases.
- **`PERMISSION_DENIED`** — the request's `version` or `manifestHash` is not the installed one, the catalog's `access`
  is `read-only`, or the commit carried no grant. Read the installed manifest again, or ask the person to consent; do not
  widen anything yourself.
- **`GRANT_INVALID`** — the target refused the grant: replayed, expired, for another plan, another account or another
  manifest. Preview again and confirm a fresh grant.
- **`UNAVAILABLE`** — the named package is not installed, or the target's status cannot be read. Re-read `catalog.list`
  and check that plugin's `status`.
- **A plugin's `status` is `ok: false`** — that plugin's own status failed and the rest of the list is still valid;
  follow that plugin's `nextStep`.

## Contract

The catalog implements [plugin-contract](https://github.com/we-the-rebel-alliance/plugin-contract) v0. The `capabilities`
manifest in `package.json` is the declaration, and `plugin-kit` checks it, the built bundle on the real OpenCode 2.4.1
host, and the generated docs in CI.

## Docs

- [Capabilities](docs/capabilities.md)
- [Configuration](docs/configuration.md)
- [Accounts](docs/accounts.md)
- [Automations](docs/automations.md)
- [Architecture](docs/architecture.md)
- [Security](docs/security.md)
