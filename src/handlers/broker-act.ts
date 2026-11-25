/**
 * `broker_act`: the preview of a named plugin's action, for a consumer.
 *
 * The preview runs through the contract's `act` module: the action is declared by the target, the person's grant is
 * looked up by consumer in `options.grants` and names the target action, account and installed manifest hash, and the
 * call runs in a session fenced to the preview method and its operations. The request can never supply or widen the
 * grant. The target's preview writes nothing. Its answer carries the plan id the person's confirmation will bind: the
 * catalog returns it untouched, because the target's `register` minted it and holds the plan.
 */
import { act } from "@we-the-rebel-alliance/plugin-contract/act"
import { SourceError } from "@we-the-rebel-alliance/plugin-contract/events"
import type { MethodHandler } from "@we-the-rebel-alliance/plugin-contract/register"
import { refuseFailure } from "../failure.ts"
import { actGrant } from "../grants.ts"
import { accountFor, resolveTarget } from "../host/target.ts"
import { parseActPreview } from "../requests.ts"
import { OBJECT, REQUEST, refuseInput } from "./shared.ts"
import type { HandlerRuntime } from "./index.ts"

/** `broker_act`: the target's preview, with the plan id its commit will spend. */
export function brokerActHandler(runtime: HandlerRuntime): MethodHandler {
  return {
    description: "Preview one action of an installed plugin for a consumer: the confirm fields and the plan id its commit takes. It writes nothing.",
    input: REQUEST,
    output: OBJECT,
    async run(input, call) {
      const parsed = parseActPreview(input["request"])
      if (!parsed.ok) refuseInput(parsed.problems)
      const request = parsed.value
      const host = runtime.host(call)
      const target = await resolveTarget(host, request)
      const account = await accountFor(host, target, request.account)
      // The person's grant is looked up by consumer; the request can never supply one.
      const grant = actGrant(runtime.grants, { consumer: request.consumer, action: request.action, account, manifestHash: target.hash })
      const outcome = await act(host, {
        installed: target,
        action: request.action,
        grant,
        consumer: request.consumer,
        phase: "preview",
        ...(request.input === undefined ? {} : { input: request.input }),
        signal: call.signal,
      })
      if (!outcome.ok) refuseFailure(outcome.failure)
      if (outcome.phase !== "preview") {
        throw new SourceError({ code: "UNAVAILABLE", what: "the preview answered a commit", next: "Try again; if it keeps failing, report it to the plugin's maintainers." })
      }
      const preview = outcome.preview
      return {
        phase: "preview",
        preview: {
          planId: preview.planId,
          method: preview.method,
          output: preview.output,
          ...(preview.reaches === undefined ? {} : { reaches: preview.reaches }),
          ...(preview.changes === undefined ? {} : { changes: preview.changes }),
          ...(preview.cost === undefined ? {} : { cost: preview.cost }),
          ...(preview.account === undefined ? {} : { account: preview.account }),
          trust: preview.trust,
        },
      }
    },
  }
}
