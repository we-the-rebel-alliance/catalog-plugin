/**
 * `fixtures/conformance.json` is the plugin's own evidence to the kit, and it may not drift from the manifest.
 *
 * The fixture is rebuilt with `npm run fixtures` from the manifest; this test replays the values it records — the status
 * answer through the status handler, the namespace line against the summary, the bus event against the declaration, and
 * the recorded non-read input through the act parser — so a changed handler fails here instead of in CI's T1.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import type { HandlerRuntime } from "../../src/handlers/index.ts"
import { handlersFor } from "../../src/handlers/index.ts"
import { manifest, packageName, version } from "../../src/manifest.ts"
import { checkStatus, parseActCommit } from "../../src/requests.ts"

interface Fixture {
  readonly plugin?: string
  readonly namespace?: string
  readonly events?: { readonly emitted?: readonly string[]; readonly status?: unknown }
  readonly rpc?: { readonly inputs?: Readonly<Record<string, unknown>> }
}

const fixture = JSON.parse(readFileSync(new URL("../../fixtures/conformance.json", import.meta.url), "utf8")) as Fixture

const runtime: HandlerRuntime = {
  manifest,
  version,
  hostVersion: "2.4.1",
  clock: () => Date.parse("2026-11-25T09:00:00.000Z"),
  timeZone: "UTC",
  host: () => {
    throw new Error("no host in this test")
  },
}

test("the fixture records this package and this manifest's namespace line", () => {
  assert.equal(fixture.plugin, packageName)
  assert.equal(fixture.namespace, manifest.plugin.summary)
})

test("the recorded status is the status handler's own answer", async () => {
  const answer = await handlersFor(runtime).status!.run({}, { unguardedAgents: async () => [] } as never)
  assert.deepEqual(fixture.events?.status, answer)
  assert.equal(checkStatus(fixture.events?.status).ok, true)
})

test("the declared bus event is the recorded one, and it is the only one", () => {
  assert.deepEqual(Object.keys(manifest.events), ["changed"])
  assert.deepEqual([...(fixture.events?.emitted ?? [])], ["changed"])
})

test("status reads the announced { ok, agents | error } shape as well as the pinned list", async () => {
  const listed = (await handlersFor(runtime).status!.run({}, { unguardedAgents: async () => ["build"] } as never)) as {
    readonly state: string
    readonly unguardedAgents: readonly string[]
  }
  assert.equal(listed.state, "ready")
  assert.deepEqual(listed.unguardedAgents, ["build"])
  const answered = (await handlersFor(runtime).status!.run({}, { unguardedAgents: async () => ({ ok: true, agents: ["build"] }) } as never)) as {
    readonly state: string
    readonly unguardedAgents: readonly string[]
  }
  assert.equal(answered.state, "ready")
  assert.deepEqual(answered.unguardedAgents, ["build"])
  const failed = (await handlersFor(runtime).status!.run({}, { unguardedAgents: async () => ({ ok: false, error: "the agent list could not be read" }) } as never)) as {
    readonly state: string
    readonly nextStep: string | null
  }
  assert.equal(failed.state, "error")
  assert.match(String(failed.nextStep), /could not be read/)
})

test("the recorded non-read input passes the act parser, so T1 reaches the confirmation refusal", () => {
  const input = fixture.rpc?.inputs?.["broker_act_commit"] as { readonly request?: unknown } | undefined
  assert.ok(input !== undefined)
  const parsed = parseActCommit(input.request)
  assert.equal(parsed.ok, true)
})
