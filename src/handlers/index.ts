/**
 * The handler table: one entry per method the manifest declares, by the method's name.
 *
 * A handler says what one method looks like and does the work; `register` adds the doors, the account resolution, the
 * permission assertions and the answer checks. The catalog has no provider: its "provider" is OpenCode's own host, and
 * `src/host/` is the only place that touches sessions and the target plugins' RPC.
 */
import type { Manifest } from "@we-the-rebel-alliance/plugin-contract/manifest"
import type { HandlerTable, MethodCall } from "@we-the-rebel-alliance/plugin-contract/register"
import type { CallHost } from "../host/broker.ts"
import { brokerActCommitHandler } from "./broker-act-commit.ts"
import { brokerActHandler } from "./broker-act.ts"
import { brokerReadHandler } from "./broker-read.ts"
import { listHandler } from "./list.ts"
import { statusHandler } from "./status.ts"

/** The plugin state the handlers may read, built once in `setup`. */
export interface HandlerRuntime {
  /** The installed manifest, which `statusAnswer` states and which names the plugin. */
  readonly manifest: Manifest
  /** The package version, which `status` reports. */
  readonly version: string
  /** The OpenCode release the plugin runs on. */
  readonly hostVersion: string
  /** The clock a listing's `asOf` is stamped with; tests pass a fixed one. */
  readonly clock: () => number
  /** The host's time zone, in which a relative `since` is resolved. */
  readonly timeZone: string
  /** The host a brokered call runs through, bound to the calling session's agent. */
  readonly host: (call: MethodCall) => CallHost
}

/** Every method's handler. */
export function handlersFor(runtime: HandlerRuntime): HandlerTable {
  return {
    status: statusHandler(runtime),
    list: listHandler(runtime),
    broker_read: brokerReadHandler(runtime),
    broker_act: brokerActHandler(runtime),
    broker_act_commit: brokerActCommitHandler(runtime),
  }
}
