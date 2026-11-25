/**
 * `broker_act_commit`: the commit of a named plugin's action, for a consumer.
 *
 * The commit runs through the contract's `act` module. It takes the plan id the target's preview answered and the
 * host-signed grant for that plan; the target's `register` verifies the grant and spends the plan, and the catalog never
 * verifies a grant, never widens the grant's account or scope, and never holds either beyond this call. The grant travels
 * in the target's RPC envelope as `{ sessionID, input: { planId }, grant, consumer }` (docs/consumers.md §4 and §5).
 *
 * The method itself is class `write` with `effect: ask`, so the catalog's own door asks the person before it forwards;
 * an app answers that ask and signs the target grant for the same confirmation. Under `access: read-only` the commit is
 * off, whatever grant it carries.
 */
import { act } from "@we-the-rebel-alliance/plugin-contract/act"
import { SourceError } from "@we-the-rebel-alliance/plugin-contract/events"
import type { MethodHandler } from "@we-the-rebel-alliance/plugin-contract/register"
import { refuseFailure } from "../failure.ts"
import { accountFor, resolveTarget } from "../host/target.ts"
import { parseActCommit } from "../requests.ts"
import { OBJECT, REQUEST, refuseInput } from "./shared.ts"
import type { HandlerRuntime } from "./index.ts"

/** `broker_act_commit`: the target's commit, under the grant the request carries. */
export function brokerActCommitHandler(runtime: HandlerRuntime): MethodHandler {
  return {
    description: "Commit one previewed action of an installed plugin for a consumer, with the host-signed grant for the plan the preview answered.",
    input: REQUEST,
    output: OBJECT,
    async run(input, call) {
      const parsed = parseActCommit(input["request"])
      if (!parsed.ok) refuseInput(parsed.problems)
      const request = parsed.value
      const host = runtime.host(call)
      const target = await resolveTarget(host, request)
      const account = await accountFor(host, target, request.account)
      const grant = { consumer: request.consumer, action: request.action, account, manifestHash: request.manifestHash }
      const outcome = await act(host, {
        installed: target,
        action: request.action,
        grant,
        consumer: request.consumer,
        phase: "commit",
        planId: request.planId,
        // The target's own register verifies this token; the catalog passes it through and keeps no copy. An absent
        // token is the contract's refusal before any target call, not this request's.
        ...(request.grant === undefined ? {} : { grantToken: request.grant }),
        signal: call.signal,
      })
      if (!outcome.ok) refuseFailure(outcome.failure)
      if (outcome.phase !== "commit") {
        throw new SourceError({ code: "UNAVAILABLE", what: "the commit answered a preview", next: "Try again; if it keeps failing, report it to the plugin's maintainers." })
      }
      return { phase: "commit", result: outcome.result }
    },
  }
}
