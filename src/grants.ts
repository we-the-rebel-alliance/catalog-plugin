/**
 * The consumer grants the person consented to, and the lookup a broker call runs before it opens a fence.
 *
 * A grant is the person's durable configuration: `options.grants`, one consumer, one source **or** action, one account,
 * the scope the person confirmed, the installed manifest hash and an optional `disabled` switch. The catalog never
 * accepts a grant from a request: a broker request can only name a consumer, and the catalog looks that consumer's grant
 * up here. An ungranted consumer, another consumer's grant, another account, another manifest, or a scope outside the
 * grant is `PERMISSION_DENIED`; a disabled grant is `SOURCE_DISABLED`. The target's manifest hash binds the grant: a
 * changed manifest asks the person again.
 */
import type { ActGrant, Grant } from "@we-the-rebel-alliance/plugin-contract/access"
import { refusal, RegisterError } from "@we-the-rebel-alliance/plugin-contract/register"

/** One consumer's consent: the source or action, account, scope and manifest hash the person confirmed. */
export interface GrantSpec {
  readonly consumer: string
  readonly source?: string
  readonly action?: string
  readonly account: string
  /** The confirmed scope; absent means the whole source. */
  readonly scope?: Readonly<Record<string, readonly string[]>>
  readonly manifestHash: string
  readonly disabled?: boolean
}

const HASH = /^sha256:[0-9a-f]{64}$/
const KEYS = new Set(["consumer", "source", "action", "account", "scope", "manifestHash", "disabled"])
const plain = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)

function optionError(problem: string): Error {
  return new Error(`OPTIONS_INVALID: options.grants ${problem}. Next step: fix the plugin's grants option.`)
}

function text(value: unknown, where: string): string {
  if (typeof value !== "string" || value.trim() === "") throw optionError(`${where} must be a non-empty string`)
  return value
}

/** A scope as the contract reads it: keys to non-empty lists of non-empty strings, or undefined for the whole source. */
function scopeOf(value: unknown, where: string): Readonly<Record<string, readonly string[]>> | undefined {
  if (value === undefined) return undefined
  if (!plain(value)) throw optionError(`${where} must be an object`)
  const scope: Record<string, readonly string[]> = {}
  for (const [key, values] of Object.entries(value)) {
    if (!Array.isArray(values) || values.length === 0 || values.some((entry) => typeof entry !== "string" || entry.trim() === "")) {
      throw optionError(`${where}.${key} must be a non-empty list of non-empty strings`)
    }
    scope[key] = [...values] as string[]
  }
  return Object.keys(scope).length === 0 ? undefined : scope
}

/** The grants from the plugin options, validated; a malformed grant refuses setup with `OPTIONS_INVALID`. */
export function grantsOf(options: Readonly<Record<string, unknown>>): readonly GrantSpec[] {
  const raw = options["grants"]
  if (raw === undefined) return []
  if (!Array.isArray(raw)) throw optionError("must be a list")
  return raw.map((entry, index) => {
    const where = `[${index}]`
    if (!plain(entry)) throw optionError(`${where} must be an object`)
    for (const key of Object.keys(entry)) if (!KEYS.has(key)) throw optionError(`${where} carries ${key}`)
    const consumer = text(entry["consumer"], `${where}.consumer`)
    const account = text(entry["account"], `${where}.account`)
    const manifestHash = text(entry["manifestHash"], `${where}.manifestHash`)
    if (!HASH.test(manifestHash)) throw optionError(`${where}.manifestHash must be sha256: followed by 64 lowercase hex characters`)
    const source = entry["source"] === undefined ? undefined : text(entry["source"], `${where}.source`)
    const action = entry["action"] === undefined ? undefined : text(entry["action"], `${where}.action`)
    if ((source === undefined) === (action === undefined)) throw optionError(`${where} must name exactly one of source and action`)
    const scope = scopeOf(entry["scope"], `${where}.scope`)
    const disabled = entry["disabled"]
    if (disabled !== undefined && typeof disabled !== "boolean") throw optionError(`${where}.disabled must be a boolean`)
    return {
      consumer,
      ...(source === undefined ? {} : { source }),
      ...(action === undefined ? {} : { action }),
      account,
      ...(scope === undefined ? {} : { scope }),
      manifestHash,
      ...(disabled === true ? { disabled: true } : {}),
    }
  })
}

/** True when every requested scope value is in the grant's scope; an absent grant scope is the whole source. */
export function scopeCovers(grant: GrantSpec, scope: Readonly<Record<string, readonly string[]>> | undefined): boolean {
  if (grant.scope === undefined) return true
  for (const [key, values] of Object.entries(scope ?? {})) {
    const granted = grant.scope[key]
    if (granted === undefined || values.some((value) => !granted.includes(value))) return false
  }
  return true
}

/** The grants one consumer holds for one source, after the hash, account and disabled checks. */
function readGrants(grants: readonly GrantSpec[], request: { readonly consumer: string; readonly source: string; readonly account: string; readonly manifestHash: string; readonly scope?: Readonly<Record<string, readonly string[]>> }): readonly GrantSpec[] {
  const named = grants.filter((grant) => grant.consumer === request.consumer && grant.source === request.source)
  if (named.length === 0) {
    throw new RegisterError(refusal("PERMISSION_DENIED", `no grant for ${request.consumer} on ${request.source}`, "Ask the person to grant this consumer the source, then read again."))
  }
  const current = named.filter((grant) => grant.manifestHash === request.manifestHash)
  if (current.length === 0) {
    throw new RegisterError(refusal("PERMISSION_DENIED", `the grant for ${request.consumer} on ${request.source} was for another manifest`, "Ask the person to review the installed manifest and grant it again."))
  }
  const account = current.filter((grant) => grant.account === request.account)
  if (account.length === 0) {
    throw new RegisterError(refusal("PERMISSION_DENIED", `the grant for ${request.consumer} on ${request.source} is for another account`, `Ask the person to grant ${request.account}, or read the granted account.`))
  }
  const enabled = account.filter((grant) => grant.disabled !== true)
  if (enabled.length === 0) {
    throw new RegisterError(refusal("SOURCE_DISABLED", `${request.source} is turned off for ${request.consumer}`, "Turn the grant on again to read it."))
  }
  if (!enabled.some((grant) => scopeCovers(grant, request.scope))) {
    throw new RegisterError(refusal("PERMISSION_DENIED", `the read asks for more of ${request.source} than ${request.consumer} was granted`, "Read within the granted scope, or ask the person to widen it."))
  }
  return enabled
}

/** The one read grant a consumer's read runs under: the source, account, merged scope and manifest hash the person confirmed. */
export function readGrant(grants: readonly GrantSpec[], request: { readonly consumer: string; readonly source: string; readonly account: string; readonly manifestHash: string; readonly scope?: Readonly<Record<string, readonly string[]>> }): Grant {
  const enabled = readGrants(grants, request)
  const whole = enabled.some((grant) => grant.scope === undefined)
  let scope: Record<string, readonly string[]> | undefined
  if (!whole) {
    const merged: Record<string, Set<string>> = {}
    for (const grant of enabled) for (const [key, values] of Object.entries(grant.scope ?? {})) {
      const held = (merged[key] ??= new Set())
      for (const value of values) held.add(value)
    }
    scope = Object.fromEntries(Object.entries(merged).map(([key, values]) => [key, [...values]]))
  }
  return { consumer: request.consumer, source: request.source, account: request.account, ...(scope === undefined ? {} : { scope }), manifestHash: request.manifestHash }
}

/** The one act grant a consumer's preview or commit runs under. */
export function actGrant(grants: readonly GrantSpec[], request: { readonly consumer: string; readonly action: string; readonly account: string; readonly manifestHash: string }): ActGrant {
  const named = grants.filter((grant) => grant.consumer === request.consumer && grant.action === request.action)
  if (named.length === 0) {
    throw new RegisterError(refusal("PERMISSION_DENIED", `no grant for ${request.consumer} on ${request.action}`, "Ask the person to grant this consumer the action, then preview it again."))
  }
  const current = named.filter((grant) => grant.manifestHash === request.manifestHash)
  if (current.length === 0) {
    throw new RegisterError(refusal("PERMISSION_DENIED", `the grant for ${request.consumer} on ${request.action} was for another manifest`, "Ask the person to review the installed manifest and grant it again."))
  }
  const account = current.filter((grant) => grant.account === request.account)
  if (account.length === 0) {
    throw new RegisterError(refusal("PERMISSION_DENIED", `the grant for ${request.consumer} on ${request.action} is for another account`, `Ask the person to grant ${request.account}, or act on the granted account.`))
  }
  const enabled = account.filter((grant) => grant.disabled !== true)
  if (enabled.length === 0) {
    throw new RegisterError(refusal("SOURCE_DISABLED", `${request.action} is turned off for ${request.consumer}`, "Turn the grant on again to act on it."))
  }
  return { consumer: request.consumer, action: request.action, account: request.account, manifestHash: request.manifestHash }
}
