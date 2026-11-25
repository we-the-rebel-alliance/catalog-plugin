/**
 * `list`: the installed plugins, their validated manifests, their hashes, and each plugin's own status.
 *
 * The manifests come from the contract's `catalog` module, which reads `ctx.plugin.list()`, finds each package through
 * the OpenCode 2.4.1 cache, validates `capabilities` and hashes it (contract §14). A package that cannot be read is
 * reported in `problems`; every other plugin is still listed.
 *
 * The per-plugin status is the plugin's own `status` answer (contract §11), read through the same door an app would use.
 * A status the catalog cannot read is reported as refused beside its plugin, never guessed and never fatal to the list.
 */
import type { MethodHandler } from "@we-the-rebel-alliance/plugin-contract/register"
import { describeError } from "../failure.ts"
import { checkStatus } from "../requests.ts"
import { EMPTY, OBJECT } from "./shared.ts"
import type { HandlerRuntime } from "./index.ts"

/** One plugin's status, as the catalog relays it: the answer, or the refusal. */
type ListedStatus =
  | { readonly ok: true; readonly status: unknown }
  | { readonly ok: false; readonly code: string; readonly message: string }

/** `list`: every installed plugin's manifest and status. */
export function listHandler(runtime: HandlerRuntime): MethodHandler {
  return {
    description: "List the installed plugins: each package's manifest and hash, and each plugin's own status.",
    input: EMPTY,
    output: OBJECT,
    async run(_input, call) {
      const host = runtime.host(call)
      const listing = await host.listing()
      const plugins = []
      for (const target of listing.plugins) {
        let status: ListedStatus
        try {
          const answer = await host.status({ package: target.package })
          status = checkStatus(answer)
        } catch (error) {
          const described = describeError(error, "Check the plugin's status and try again.")
          status = { ok: false, code: described.code, message: described.message }
        }
        plugins.push({
          target: target.target,
          package: target.package,
          version: target.version,
          directory: target.directory,
          manifest: target.manifest,
          hash: target.hash,
          status,
        })
      }
      return { trust: "untrusted", asOf: new Date(runtime.clock()).toISOString(), plugins, problems: listing.problems }
    },
  }
}
