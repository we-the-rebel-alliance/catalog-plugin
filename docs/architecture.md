# Architecture

## Layers

| Layer | Files | Does |
|---|---|---|
| Entry | `src/index.ts` | `Plugin.define({ id, setup })`, the host gate, the one `register` call and the installed-set watcher |
| Manifest | `src/manifest.ts` | reads `package.json` `capabilities` and checks it with the contract's validator |
| Requests | `src/requests.ts` | the two wire requests and the relayed status shape, checked strictly |
| Handlers | `src/handlers/` | one handler per method: the input, the answer schema, the description and the work |
| Host | `src/host/` | the contract's `ReadHost` over OpenCode, the target resolution and the account resolution |
| Watch | `src/watch.ts` | the installed-set signature and the one `changed` nudge |
| Failures | `src/failure.ts` | a contract failure reported in the contract's form, and a redacted unknown one |

`register` from the contract wires doors 1–3: one agent tool per method in the `catalog` namespace, the same tools in
Code Mode, one RPC registration under `catalog`, the permission assertions, and the access rules inserted into every
agent. This repository never calls `ctx.tool`, `ctx.rpc.register` or `ctx.permission` itself. `src/host/` is the one
place that opens a session or calls another plugin's RPC.

## The call path

1. OpenCode loads `dist/index.js` through the package's `./server` export and calls `setup(ctx)`.
2. `assertHost` refuses an OpenCode release outside `>=2.4.1 <2.5.0`, unless `allowUntestedHost` is set.
3. `register` checks the handler table against `capabilities.methods`, generates the access rules into every agent, and
   registers the tools and the single RPC id.
4. The installed-set watcher records the host's plugin inventory and subscribes to `plugin.updated`.
5. A call passes the register's one gate (`<name>.<method>` on the method's resources), is validated against the
   handler's schema, and runs the handler.
6. A broker handler resolves the target package, version and manifest hash; reads the target's `status` for its account
   aliases; and calls the contract's `read` or `act` module with a `ReadHost` bound to the calling session's agent.
7. `read`/`act` opens a session whose rules are exactly the grant's, calls the target's `status` and its method over RPC,
   checks the answer, and closes the session in a `finally`.
8. An act commit sends `{ sessionID, input: { planId }, grant, consumer }` to the target; the target's `register`
   verifies the grant and spends the plan.

## The host

`src/host/broker.ts` implements the contract's three `ReadHost` calls over `@opencode/plugin` 2.4.1:

| `ReadHost` call | OpenCode call |
|---|---|
| `openSession({ rules, title })` | `ctx.session.create({ agent, title, permissions })`; `close` is `ctx.session.remove` |
| `status({ package })` | a session that allows only `<id>.status`, then that method over RPC |
| `call({ package, method, sessionID, input, grant?, consumer? })` | `ctx.rpc({ id, methods, events })` and the method, with the envelope OpenCode's RPC door takes |

The target's RPC id is its validated manifest's `plugin.name`, read from the package on disk. The request's `package`
is a lookup key, never an RPC id: a package that is not installed cannot name a plugin.

`src/host/target.ts` compares the request's `version` and `manifestHash` with the installed copy, and resolves the
account alias against the target's own `status.accounts` through the contract's `statusAliases`.

## `catalog.list`

`listInstalledPlugins(ctx)` reads `ctx.plugin.list()`, resolves each package through the OpenCode 2.4.1 cache, and reads,
validates and hashes its manifest with the contract's `manifest` module. Each listed plugin's status is read through the
same RPC door an app would use; a status that fails is reported as `status.ok: false`, and the list still answers.

## State and caching

The catalog keeps no content cache and no credential. Per broker call it reads the installed list once (a disk read per
package), and it opens and closes one session per target call — one more for the target's status. It holds no grant, no
plan and no session after the call returns. The watcher keeps one inventory signature and one event subscription for the
plugin's lifetime; that subscription is not a per-request hook.

## OpenCode APIs

| API | Who calls it |
|---|---|
| `ctx.app.version` | `src/index.ts`, for the host gate and status |
| `ctx.plugin.list` | `list` and the watcher |
| `ctx.session.create`, `ctx.session.remove` | `src/host/broker.ts` |
| `ctx.rpc(definition)` | `src/host/broker.ts` |
| `ctx.event.subscribe` | `src/watch.ts` |
| `ctx.agent.list` | status, for `unguardedAgents` |
| `ctx.agent.transform`, `ctx.tool.transform`, `ctx.rpc.register`, `ctx.permission.assert` | `register` only |

## Build

`scripts/build.mjs` bundles `src/index.ts` into `dist/index.js` with esbuild. `@opencode/*` stays external, because
OpenCode provides it; the contract modules are bundled, so a tag installs and runs with no build and no runtime
dependency. `dist/` is generated and is not committed.
