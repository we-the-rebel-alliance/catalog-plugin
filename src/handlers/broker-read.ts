/**
 * `broker_read`: one read of a named plugin's source, for a consumer.
 *
 * The request is the contract's one `BrokerRequest` (contract §14, issue #8): `consumer` is the grant key, and
 * `package`, `version` and `manifestHash` describe the source's installed manifest. The read runs through the
 * contract's `read` module: the source is declared, the person's grant (looked up by consumer in `options.grants`)
 * covers the source, account and scope, and the call runs in a session fenced by exactly that grant's rules. The
 * request can narrow the grant but never supply or widen it, and the target's own `access` setting stays final.
 *
 * A refused read is the contract's `BrokerAnswer` with `ok: false`, so a consumer's broker transport can pass it
 * through without reading a second shape. A malformed request, or one for a plugin or manifest that is not installed,
 * is a refusal from this method itself.
 */
import { read } from "@we-the-rebel-alliance/plugin-contract/read"
import type { MethodHandler } from "@we-the-rebel-alliance/plugin-contract/register"
import { isBrokerRequest } from "../requests.ts"
import { readGrant } from "../grants.ts"
import { accountFor, resolveTarget } from "../host/target.ts"
import { OBJECT, REQUEST, refuseInput } from "./shared.ts"
import type { HandlerRuntime } from "./index.ts"

/** `broker_read`: the target's page or snapshot, under the request's grant. */
export function brokerReadHandler(runtime: HandlerRuntime): MethodHandler {
  return {
    description: "Read one source of an installed plugin for a consumer, under that consumer's grant: events with a cursor, or a snapshot.",
    input: REQUEST,
    output: OBJECT,
    async run(input, call) {
      const request = input["request"]
      if (!isBrokerRequest(request)) {
        refuseInput(["request is not the broker request shape: consumer, package, version, manifestHash and source are required, and no key outside the request is allowed"])
      }
      const host = runtime.host(call)
      const target = await resolveTarget(host, request)
      const account = await accountFor(host, target, request.account)
      // The person's grant is looked up by consumer; the request can never supply one.
      const grant = readGrant(runtime.grants, {
        consumer: request.consumer,
        source: request.source,
        account,
        manifestHash: target.hash,
        ...(request.scope === undefined ? {} : { scope: request.scope }),
      })
      const outcome = await read(host, {
        installed: target,
        source: request.source,
        grant,
        consumer: request.consumer,
        ...(request.scope === undefined ? {} : { scope: request.scope }),
        ...(request.cursor === undefined ? {} : { cursor: request.cursor }),
        ...(request.since === undefined ? {} : { since: request.since }),
        ...(request.limit === undefined ? {} : { limit: request.limit }),
        ...(request.pick === undefined ? {} : { pick: request.pick }),
        context: { now: runtime.clock(), timeZone: runtime.timeZone },
        signal: call.signal,
      })
      if (!outcome.ok) {
        return {
          offered: true,
          ok: false,
          code: outcome.failure.code,
          message: outcome.failure.message,
          next: outcome.failure.next,
          ...(outcome.failure.retryAfterSec === undefined ? {} : { retryAfterSec: outcome.failure.retryAfterSec }),
        }
      }
      return { offered: true, ok: true, value: outcome.kind === "events" ? outcome.page : outcome.snapshot }
    },
  }
}
