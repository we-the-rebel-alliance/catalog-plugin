/**
 * The contract's one failure form (contract §12): `CODE: What happened. Next step: What to do.`
 *
 * A failure from the contract's `read` or `act` module is a value; a handler reports it by throwing a `SourceError`,
 * which `register` maps back to the same code and next step. A failure the catalog could not name is `UNAVAILABLE`, and
 * its text is redacted and cut to one line: status and logs never carry a credential.
 */
import { redactReason } from "@we-the-rebel-alliance/plugin-contract/accounts"
import { errorCodeOf, SourceError } from "@we-the-rebel-alliance/plugin-contract/events"
import type { ReadFailure } from "@we-the-rebel-alliance/plugin-contract/read"

const plain = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)

/** The what of a failure, without the code and the next step the message already carries. */
function whatOf(failure: ReadFailure): string {
  const text = failure.message.replace(new RegExp(`^${failure.code}:\\s*`), "").replace(/\.\s*Next step:[\s\S]*$/, "")
  return text.length === 0 ? "the call failed" : text
}

/** Report a contract failure through the register, keeping its code, what and next step. */
export function refuseFailure(failure: ReadFailure): never {
  throw new SourceError({
    code: failure.code,
    what: whatOf(failure),
    next: failure.next,
    ...(failure.retryAfterSec === undefined ? {} : { retryAfterSec: failure.retryAfterSec }),
  })
}

/** An error's contract code and one-line message, for a status the catalog relays rather than throws. */
export interface DescribedError {
  readonly code: string
  readonly message: string
}

/**
 * Describe any error in the contract's form. A contract code in the error's `code`, its `data.code` or its message's
 * prefix is kept; anything else is `UNAVAILABLE`. The message is one redacted line, and the next step is the error's own
 * or the caller's fallback.
 */
export function describeError(error: unknown, fallbackNext: string): DescribedError {
  if (error instanceof SourceError) {
    const code = errorCodeOf(error.code) ?? "UNAVAILABLE"
    return { code, message: `${code}: ${redactReason(error.what)}. Next step: ${redactReason(error.next)}` }
  }
  const record = typeof error === "object" && error !== null ? (error as Record<string, unknown>) : {}
  const data = plain(record["data"]) ? record["data"] : {}
  const message = typeof record["message"] === "string" ? record["message"] : String(error)
  const raw = [record["code"], data["code"], /^([A-Z][A-Z0-9_]*):/.exec(message)?.[1]].find((code): code is string => typeof code === "string")
  const code = (raw === undefined ? undefined : errorCodeOf(raw)) ?? "UNAVAILABLE"
  const next = typeof data["next"] === "string" ? redactReason(data["next"]) : (/Next step:\s*([^\n]*)/.exec(message)?.[1]?.trim() ?? fallbackNext)
  const what = redactReason(message.replace(/^[A-Z][A-Z0-9_]*:\s*/, "").replace(/\s*Next step:[\s\S]*$/, "")) || "the call failed"
  return { code, message: `${code}: ${what}. Next step: ${next}` }
}
