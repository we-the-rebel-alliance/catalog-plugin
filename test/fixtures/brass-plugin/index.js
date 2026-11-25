// The Brass test target's server entry: one `register` call, with the grant verifier wired.
//
// The target is the side that verifies the host-signed grant (contract §8 and §13): it holds the host's public key and
// records each spent `jti`, and its register spends the plan the preview answered. The catalog only passes the token
// through; this plugin is what refuses a replayed grant or a grant for another plan.
import { readFileSync } from "node:fs"
import { assertHost, register } from "../../dist/register.js"
import { createHandlers } from "./handlers.js"

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"))
const manifest = pkg.capabilities

export default {
  id: manifest.plugin.name,
  async setup(context) {
    assertHost(context, manifest)

    const grant = context.options?.grant
    if (typeof grant?.kid !== "string" || typeof grant?.publicKey !== "string") {
      throw new Error("OPTIONS_INVALID: the Brass test target needs grant.kid and grant.publicKey. Next step: pass both in the plugin's options.")
    }

    // Durable and atomic enough for one instance: each spend is appended under one key, and the writes are serialized.
    let chain = Promise.resolve()
    const store = {
      consume(claims) {
        const result = chain.then(async () => {
          const spent = (await context.storage.get("brass.spent")) ?? []
          if (Array.isArray(spent) && spent.includes(claims.jti)) return false
          await context.storage.set("brass.spent", [...(Array.isArray(spent) ? spent : []), claims.jti])
          return true
        })
        chain = result.then(() => undefined, () => undefined)
        return result
      },
    }

    const state = { hostVersion: context.app.version, access: undefined, agents: undefined, writes: [] }
    const registration = await register(context, manifest, createHandlers({ manifest, version: pkg.version, state }), {
      grant: {
        keys: { keys: { [grant.kid]: grant.publicKey } },
        audience: pkg.name,
        store,
      },
    })
    state.access = registration.access
    state.agents = async () => (await context.agent.list()).data
    return () => registration.dispose()
  },
}
