/** A contract failure is reported in the contract's form, and an unknown one is redacted. */
import assert from "node:assert/strict"
import { test } from "node:test"
import type { ReadFailure } from "@we-the-rebel-alliance/plugin-contract/read"
import { describeError, refuseFailure } from "../../src/failure.ts"

test("a read failure keeps its code, what and next step", () => {
  const original: ReadFailure = {
    code: "PERMISSION_DENIED",
    message: "PERMISSION_DENIED: the read asks for more of harbour.notes than the person granted. Next step: Read within the granted scope, or ask the person to widen it.",
    next: "Read within the granted scope, or ask the person to widen it.",
  }
  assert.throws(
    () => refuseFailure(original),
    (error: unknown) => {
      const record = error as { readonly code?: string; readonly what?: string; readonly next?: string; readonly message?: string }
      assert.equal(record.code, "PERMISSION_DENIED")
      assert.equal(record.what, "the read asks for more of harbour.notes than the person granted")
      assert.equal(record.next, "Read within the granted scope, or ask the person to widen it.")
      assert.equal(record.message, original.message)
      return true
    },
  )
})

test("a host RPC error becomes the same code and one redacted line", () => {
  const described = describeError(
    { type: "failed", message: "GRANT_INVALID: That confirmation has already been used. Next step: confirm the action again.", data: { code: "GRANT_INVALID", next: "confirm the action again" } },
    "Confirm the action again.",
  )
  assert.equal(described.code, "GRANT_INVALID")
  assert.match(described.message, /^GRANT_INVALID: /)
  assert.match(described.message, /Next step: /)
})

test("an unknown failure is UNAVAILABLE, and a token-shaped value never reaches the message", () => {
  // An invented credential for the redaction test: assembled from parts, so the repository holds no credential-shaped
  // literal and the test still exercises the detector and the redaction it feeds.
  const credential = ["sk", "live", "a".repeat(24)].join("_")
  const described = describeError(new Error(`boom: Bearer ${credential}?signature=secret`), "Try again later.")
  assert.equal(described.code, "UNAVAILABLE")
  assert.doesNotMatch(described.message, /sk_live_/)
  assert.doesNotMatch(described.message, /signature=secret/)
  assert.match(described.message, /Next step: /)
})
