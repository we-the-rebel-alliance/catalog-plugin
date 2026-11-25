/**
 * The plugin's one entry: `Plugin.define({ id, setup })`, the host gate, one `register` call and the installed-set
 * watcher.
 *
 * `register` wires doors 1–3 from `handlers`, generates the access rules and builds the typed bus from its one RPC
 * registration; this file never calls `ctx.tool`, `ctx.rpc.register` or `ctx.permission` itself. `src/host/` is the one
 * place the catalog opens a session or calls a target plugin's RPC.
 */
import { Plugin } from "@opencode/plugin"
import { assertHost, register } from "@we-the-rebel-alliance/plugin-contract/register"
import { handlersFor, type HandlerRuntime } from "./handlers/index.ts"
import { callHost } from "./host/broker.ts"
import { manifest, version } from "./manifest.ts"
import { loadSkills, registerSkills } from "./skills.ts"
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

    const runtime: HandlerRuntime = {
      manifest,
      version,
      hostVersion: context.app.version,
      clock: Date.now,
      timeZone: timeZone(),
      host: (call) => callHost(context, call.agent),
    }

    const registration = await register(context, manifest, handlersFor(runtime))
    let skillRegistration: Awaited<ReturnType<typeof registerSkills>> | undefined
    let stopWatching: (() => void) | undefined
    try {
      // `register` wires methods, not skills: a skill file nothing adds is a file no agent ever sees.
      const loaded = loadSkills()
      if (loaded.problems.length > 0) throw new Error(loaded.problems.join("; "))
      skillRegistration = await registerSkills(context.skill, loaded.skills)
      stopWatching = await watchInstalledSet({ context, bus: registration.bus })
    } catch (error) {
      await skillRegistration?.dispose().catch(() => undefined)
      await registration.dispose()
      throw error
    }
    return async () => {
      stopWatching?.()
      await skillRegistration?.dispose().catch(() => undefined)
      await registration.dispose()
    }
  },
})
