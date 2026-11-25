# Capabilities

The catalog declares five methods, no source and no action. The action an app offers to a person is the target plugin's
own `actions` entry, read from the manifest `catalog.list` returns; the catalog's `broker_act` and `broker_act_commit`
are the transport pair that runs that action through the contract's `act` module.

plugin-contract's docs name the broker calls `broker.read` and `broker.act`. A method name is `[a-z][a-z0-9_]*`
(contract §4), so the dot cannot be part of it: the RPC methods are `broker_read`, `broker_act` and
`broker_act_commit`, at `/api/rpc/catalog/broker_read`, `/api/rpc/catalog/broker_act` and
`/api/rpc/catalog/broker_act_commit`.

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

## `status`

The plugin's own state: its version, the OpenCode release and range, an empty account list, the agents that lack the
generated access rules, and a next step. It reads no installed plugin and no content.

## `list`

The contract's `CatalogListing`, from `listInstalledPlugins` (contract §14): every package the host reports, its
manifest read from the package on disk, validated and hashed, and each plugin's own `status` answer. A package that
cannot be read is reported in `problems` beside the ones that were; a plugin whose status cannot be read carries
`status.ok: false` rather than failing the list.

The hash is the same `sha256:…` value a grant stores. A changed manifest changes the hash, so an app asks the person
again before it reads or acts under the new one.

## `broker_read`

One read of a named plugin's source for a consumer, through the contract's `read` module. The request is the contract's
`BrokerRequest` (issue #8): `consumer` is the grant key, and `package`, `version` and `manifestHash` describe the
source's installed manifest. The catalog compares them with the installed copy and refuses another declaration with
`PERMISSION_DENIED`.

Before the target is called, the catalog reads the target's `status` for its account aliases and resolves `account`:
one account may be omitted, several make it required (`ACCOUNT_REQUIRED`), and an alias the target does not have is
`ACCOUNT_UNKNOWN`. The read then runs in a session whose rules are exactly the grant's: deny everything, allow the
source's method and its declared operations for the granted account. The catalog never adds an operation and never
substitutes an account.

The answer is the contract's `BrokerAnswer`. A refused read keeps its contract code in `ok: false`, so a consumer's
`sourceReader` transport passes it through without reading a second shape.

## `broker_act`

The preview of a named plugin's action for a consumer, through the contract's `act` module. The request names the
target action and carries the caller's input, which the target's preview method checks. The answer is the target's
preview: `output`, the optional confirm fields, and the `planId` and `method` the commit will use. A preview writes
nothing.

The plan id is the target plugin's: its own `register` minted it and holds the plan. The catalog keeps no plan of its
own, so a preview and its commit may be separated by a reload of the catalog without losing the target's plan.

## `broker_act_commit`

The commit of the previewed action, through the contract's `act` module. It takes the target's `planId` and the
host-signed grant for exactly `{ planId }`, and passes them to the target's commit method in the target's RPC envelope
(`{ sessionID, input: { planId }, grant, consumer }`).

The catalog does not verify the grant, does not read its claims and keeps no copy. The target plugin's `register`
verifies the audience, consumer, capability, action, account, manifest hash, input digest, lifetime, confirmation and
single use, and spends the plan. A commit without a grant is refused before any target call; a replayed grant and a
grant signed for another plan are `GRANT_INVALID` from the target.

The method is class `write` with `effect: ask`: it changes the target, and it always asks the person before forwarding.
Under `access: read-only` it is off even with a valid grant.
