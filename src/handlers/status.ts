/**
 * `status`: what a person and an app read before anything else. It carries no content and no credential.
 *
 * `statusAnswer` from the contract assembles the whole answer: the manifest's identity and host range, the installed and
 * host versions, the empty account list, the problems this handler knows, and the agents whose rules no longer give the
 * generated access rules their effect. The agent list comes from `call.unguardedAgents()`, so the plugin keeps no state
 * between `register` and the handler.
 */
import { NO_ACCOUNTS, redactReason, STATUS_SCHEMA, statusAnswer } from "@we-the-rebel-alliance/plugin-contract/accounts"
import type { MethodCall, MethodHandler } from "@we-the-rebel-alliance/plugin-contract/register"
import { EMPTY } from "./shared.ts"
import type { HandlerRuntime } from "./index.ts"

/**
 * The agents the generated rules miss, as `call.unguardedAgents()` answers them.
 *
 * The pinned contract (79da83c) answers the list or throws; the freeze before v0.0.0 answers `{ ok, agents | error }`.
 * Reading either shape keeps status working across that re-pin, and an unreadable agent list is unknown, never zero:
 * it becomes a redacted problem and the status state is `error`.
 */
async function unguardedOf(call: MethodCall): Promise<{ readonly agents: readonly string[]; readonly problems: readonly string[] }> {
  let result: unknown
  try {
    result = await call.unguardedAgents()
  } catch (error) {
    return { agents: [], problems: [redactReason(error instanceof Error ? error.message : String(error))] }
  }
  if (Array.isArray(result)) return { agents: result.filter((value): value is string => typeof value === "string"), problems: [] }
  if (typeof result === "object" && result !== null) {
    const record = result as Record<string, unknown>
    if (record["ok"] === true && Array.isArray(record["agents"])) return { agents: record["agents"].filter((value): value is string => typeof value === "string"), problems: [] }
    if (record["ok"] === false && typeof record["error"] === "string") return { agents: [], problems: [redactReason(record["error"])] }
  }
  return { agents: [], problems: ["the agent list could not be read"] }
}

/** `status`: name, version, host, state, no accounts, unguarded agents and a next step. */
export function statusHandler(runtime: HandlerRuntime): MethodHandler {
  return {
    description: "Read the catalog's version, OpenCode host, state and any next step.",
    input: EMPTY,
    output: STATUS_SCHEMA,
    async run(_input, call) {
      const unguarded = await unguardedOf(call)
      return statusAnswer({
        manifest: runtime.manifest,
        version: runtime.version,
        hostVersion: runtime.hostVersion,
        accounts: NO_ACCOUNTS,
        problems: [...unguarded.problems],
        unguardedAgents: unguarded.agents,
      })
    },
  }
}
