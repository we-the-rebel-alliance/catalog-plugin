/**
 * `status`: what a person and an app read before anything else. It carries no content and no credential.
 *
 * The host range, the version and the (empty) account list come from the manifest and the options;
 * `unguardedAgents` names an agent that no longer holds the rules `register` generated, and is never patched.
 */
import { NO_ACCOUNTS, STATUS_SCHEMA } from "@we-the-rebel-alliance/plugin-contract/accounts"
import { unguardedAgents } from "@we-the-rebel-alliance/plugin-contract/access"
import { OPENCODE_RANGE } from "@we-the-rebel-alliance/plugin-contract/manifest"
import type { MethodHandler } from "@we-the-rebel-alliance/plugin-contract/register"
import { EMPTY } from "./shared.ts"
import type { HandlerRuntime } from "./index.ts"

/** `status`: name, version, host, state, no accounts, unguarded agents and a next step. */
export function statusHandler(runtime: HandlerRuntime): MethodHandler {
  return {
    description: "Read the catalog's version, OpenCode host, state and any next step.",
    input: EMPTY,
    output: STATUS_SCHEMA,
    async run() {
      return {
        name: runtime.plugin,
        version: runtime.version,
        host: { version: runtime.hostVersion, range: OPENCODE_RANGE, tested: runtime.tested },
        state: "ready",
        accounts: [...NO_ACCOUNTS],
        unguardedAgents: unguardedAgents(await runtime.agents(), runtime.rules()),
        nextStep: null,
      }
    },
  }
}
