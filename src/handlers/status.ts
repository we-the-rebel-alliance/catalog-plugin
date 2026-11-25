/**
 * `status`: what a person and an app read before anything else. It carries no content and no credential.
 *
 * `statusAnswer` from the contract assembles the whole answer: the manifest's identity and host range, the installed and
 * host versions, the empty account list, and what `call.unguardedAgents()` answered — the agents whose rules no longer
 * give the generated access rules their effect, or the one line why the list could not be read. The status builder turns
 * a failed list into an `error` state with a redacted next step, so the handler keeps no state between `register` and
 * the call and catches nothing itself.
 */
import { NO_ACCOUNTS, STATUS_SCHEMA, statusAnswer } from "@we-the-rebel-alliance/plugin-contract/accounts"
import type { MethodHandler } from "@we-the-rebel-alliance/plugin-contract/register"
import { EMPTY } from "./shared.ts"
import type { HandlerRuntime } from "./index.ts"

/** `status`: name, version, host, state, no accounts, unguarded agents and a next step. */
export function statusHandler(runtime: HandlerRuntime): MethodHandler {
  return {
    description: "Read the catalog's version, OpenCode host, state and any next step.",
    input: EMPTY,
    output: STATUS_SCHEMA,
    async run(_input, call) {
      return statusAnswer({
        manifest: runtime.manifest,
        version: runtime.version,
        hostVersion: runtime.hostVersion,
        accounts: NO_ACCOUNTS,
        unguardedAgents: await call.unguardedAgents(),
      })
    },
  }
}
