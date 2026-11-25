/**
 * The two wire requests the catalog accepts, and the status answer it relays.
 *
 * A read request is the contract's own `BrokerRequest` (contract §14, issue #8): `consumer` is the grant key, and
 * `package`, `version` and `manifestHash` describe the source's installed manifest. `isBrokerRequest` checks it,
 * refusing unknown keys and a request without a consumer.
 *
 * An act request names the plugin's action instead of its source. The preview carries the caller's input; the commit
 * carries the plan id the target's preview answered and the host-signed grant for that plan. The request is kept
 * separate from the RPC envelope: the envelope is OpenCode's, and the grant inside this request is the target plugin's,
 * never the catalog's.
 */
import { isBrokerRequest } from "@we-the-rebel-alliance/plugin-contract/catalog"

/** A value checked, or every problem with it. */
export type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly problems: readonly string[] }

/** The fields every act request carries, beside the action. */
interface ActBase {
  readonly package: string
  readonly version: string
  readonly manifestHash: string
  /** The grant key: who previews and commits. */
  readonly consumer: string
  /** The target action, such as `acme.messages.send`. */
  readonly action: string
  /** The target account alias; absent for a plugin's one default account. */
  readonly account?: string
}

/** A preview request: the action's input, checked by the target plugin. */
export interface ActPreviewRequest extends ActBase {
  readonly input?: Readonly<Record<string, unknown>>
}

/** A commit request: the plan the target's preview answered, and the host-signed grant for it. */
export interface ActCommitRequest extends ActBase {
  readonly planId: string
  /** The target's grant; absent is refused by the contract's `act` before any target call. */
  readonly grant?: string
}

const HASH = /^sha256:[0-9a-f]{64}$/
const PREVIEW_KEYS = new Set(["package", "version", "manifestHash", "consumer", "action", "account", "input"])
const COMMIT_KEYS = new Set(["package", "version", "manifestHash", "consumer", "action", "account", "planId", "grant"])

const plain = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)

function text(value: unknown, key: string, problems: string[]): string | undefined {
  if (typeof value !== "string" || value.length === 0) {
    problems.push(`${key} must be a non-empty string`)
    return undefined
  }
  return value
}

/** The fields every act request shares; undefined while a problem already names them. */
function actBase(value: Record<string, unknown>, problems: string[]): Partial<ActBase> {
  const packageName = text(value["package"], "package", problems)
  const version = text(value["version"], "version", problems)
  const manifestHash = text(value["manifestHash"], "manifestHash", problems)
  if (manifestHash !== undefined && !HASH.test(manifestHash)) problems.push("manifestHash must be sha256: followed by 64 lowercase hex characters")
  const consumer = text(value["consumer"], "consumer", problems)
  const action = text(value["action"], "action", problems)
  const account = value["account"] === undefined ? undefined : text(value["account"], "account", problems)
  return {
    ...(packageName === undefined ? {} : { package: packageName }),
    ...(version === undefined ? {} : { version }),
    ...(manifestHash === undefined ? {} : { manifestHash }),
    ...(consumer === undefined ? {} : { consumer }),
    ...(action === undefined ? {} : { action }),
    ...(account === undefined ? {} : { account }),
  }
}

/** A preview request, checked strictly: no key outside the request, and an object input. */
export function parseActPreview(value: unknown): Parsed<ActPreviewRequest> {
  if (!plain(value)) return { ok: false, problems: ["the request must be an object"] }
  const problems: string[] = []
  for (const key of Object.keys(value)) if (!PREVIEW_KEYS.has(key)) problems.push(`${key} is not a key a preview request carries`)
  const base = actBase(value, problems)
  const input = value["input"]
  if (input !== undefined && !plain(input)) problems.push("input must be an object")
  if (problems.length > 0) return { ok: false, problems }
  return {
    ok: true,
    value: { ...(base as ActBase), ...(input === undefined ? {} : { input: input as Readonly<Record<string, unknown>> }) },
  }
}

/** A commit request, checked strictly: no key outside the request, and a plan id and grant to spend. */
export function parseActCommit(value: unknown): Parsed<ActCommitRequest> {
  if (!plain(value)) return { ok: false, problems: ["the request must be an object"] }
  const problems: string[] = []
  for (const key of Object.keys(value)) {
    if (key === "input") problems.push("a commit takes the planId and the grant, not an input")
    else if (!COMMIT_KEYS.has(key)) problems.push(`${key} is not a key a commit request carries`)
  }
  const base = actBase(value, problems)
  const planId = text(value["planId"], "planId", problems)
  const grant = value["grant"] === undefined ? undefined : text(value["grant"], "grant", problems)
  if (problems.length > 0) return { ok: false, problems }
  return { ok: true, value: { ...(base as ActBase), planId: planId!, ...(grant === undefined ? {} : { grant }) } }
}

/** Re-exported so one module names the read request's checker. */
export { isBrokerRequest }

/** The account states a status answer reports (contract §5). */
const STATES = new Set(["ready", "needs_sign_in", "error"])

/**
 * A target plugin's `status` answer, checked against the keys contract §11 defines. The catalog relays it; it does not
 * invent one, and a status it cannot read is reported as refused rather than guessed.
 */
export function checkStatus(value: unknown): { readonly ok: true; readonly status: unknown } | { readonly ok: false; readonly code: "SCHEMA_VIOLATION"; readonly message: string } {
  const problems: string[] = []
  if (!plain(value)) problems.push("status is not an object")
  else {
    if (typeof value["name"] !== "string" || value["name"].length === 0) problems.push("status.name must be a non-empty string")
    if (typeof value["version"] !== "string" || value["version"].length === 0) problems.push("status.version must be a non-empty string")
    if (!STATES.has(String(value["state"]))) problems.push("status.state must be ready, needs_sign_in or error")
    const host = value["host"]
    if (!plain(host) || typeof host["version"] !== "string" || typeof host["range"] !== "string" || !Array.isArray(host["tested"])) problems.push("status.host must be { version, range, tested }")
    const accounts = value["accounts"]
    if (!Array.isArray(accounts)) problems.push("status.accounts must be a list")
    else {
      for (const [index, entry] of accounts.entries()) {
        if (!plain(entry) || typeof entry["alias"] !== "string" || !STATES.has(String(entry["state"]))) {
          problems.push(`status.accounts[${index}] must be { alias, state }`)
          break
        }
      }
    }
    if (!Array.isArray(value["unguardedAgents"])) problems.push("status.unguardedAgents must be a list")
    if (value["nextStep"] !== null && value["nextStep"] !== undefined && typeof value["nextStep"] !== "string") problems.push("status.nextStep must be a string or null")
  }
  if (problems.length > 0) return { ok: false, code: "SCHEMA_VIOLATION", message: `SCHEMA_VIOLATION: the status answer breaks contract §11: ${problems[0]}. Next step: report it to the plugin's maintainers.` }
  return { ok: true, status: value }
}
