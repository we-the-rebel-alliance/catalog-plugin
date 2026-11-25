/**
 * The plugin's one entry: `Plugin.define({ id, setup })`, the host gate, one `register` call and the installed-set
 * watcher.
 *
 * `register` wires doors 1–3 from `handlers` and generates the access rules; this file never calls `ctx.tool`,
 * `ctx.rpc.register` or `ctx.permission` itself. `src/host/` is the one place the catalog opens a session or calls a
 * target plugin's RPC.
 */
import { Plugin } from "@opencode/plugin"
import type { AgentLike, PermissionRule } from "@we-the-rebel-alliance/plugin-contract/access"
import { assertHost, register } from "@we-the-rebel-alliance/plugin-contract/register"
import { handlersFor, type HandlerRuntime } from "./handlers/index.ts"
import { callHost } from "./host/broker.ts"
import { manifest, version } from "./manifest.ts"
import { watchInstalledSet } from "./watch.ts"

/** The host's time zone; a relative `since` is resolved in it. */
function timeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return zone === "" ? "UTC" : zone
  } catch {
    return "UTC"
  }
}

export default Plugin.define({
  id: manifest.plugin.name,
  async setup(context) {
    assertHost(context, manifest)

    let rules: readonly PermissionRule[] = []
    const runtime: HandlerRuntime = {
      plugin: manifest.plugin.name,
      version,
      hostVersion: context.app.version,
      tested: manifest.plugin.host.tested,
      clock: Date.now,
      timeZone: timeZone(),
      agents: async () => (await context.agent.list()).data.map((agent): AgentLike => ({ id: agent.id, permissions: agent.permissions })),
      rules: () => rules,
      host: (call) => callHost(context, call.agent),
    }

    const registration = await register(context, manifest, handlersFor(runtime), { bus: true })
    rules = registration.access.rules
    const stopWatching = await watchInstalledSet({ context, bus: registration.bus })
    return async () => {
      stopWatching()
      await registration.dispose()
    }
  },
})
