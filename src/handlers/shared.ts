/** The shapes and refusals the handlers share. */
import type { JsonSchema } from "@we-the-rebel-alliance/plugin-contract/manifest"
import { refusal, RegisterError } from "@we-the-rebel-alliance/plugin-contract/register"

/** A method that takes no input. */
export const EMPTY: JsonSchema = { type: "object", properties: {}, additionalProperties: false }

/**
 * A request the handler checks itself. The register validates the outer object; the request's own keys are checked by
 * the contract's `isBrokerRequest` or by the act parser, so a remote caller cannot smuggle a key past either.
 */
export const REQUEST: JsonSchema = {
  type: "object",
  properties: { request: { type: "object", additionalProperties: true } },
  required: ["request"],
  additionalProperties: false,
}

/** An answer the contract's modules describe rather than a second copy of their shapes. */
export const OBJECT: JsonSchema = { type: "object", additionalProperties: true }

/** Refuse a request in the contract's one form. */
export function refuseInput(problems: readonly string[]): never {
  throw new RegisterError(refusal("INPUT_INVALID", problems.join("; "), "Pass only the request the method's schema describes."))
}
