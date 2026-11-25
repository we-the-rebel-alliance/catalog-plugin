/**
 * The catalog on the real OpenCode 2.4.1 host, over the real RPC door.
 *
 * The harness installs the contract's Harbour and Glyph examples and the Brass test target in a temporary OpenCode
 * cache and loads the built catalog. The tests then prove, against those real packages:
 *
 * - `catalog.list` sees every installed package, with its validated manifest, hash and its own status;
 * - `broker.read` reads Harbour's source for a consumer, and refuses a request without a consumer or under another
 *   manifest;
 * - `broker.act` previews Brass's action and commits it with a host-signed grant, and refuses a commit without a grant,
 *   with a replayed `jti`, and with a grant signed for another plan;
 * - `rpc.catalog.changed` fires when a plugin joins the inventory.
 */
import assert from "node:assert/strict"
import { generateKeyPairSync, randomUUID } from "node:crypto"
import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { after, before, test } from "node:test"
import { fileURLToPath } from "node:url"
import { signGrant } from "@we-the-rebel-alliance/plugin-contract/grant"
import { startHost, PACKAGES, type Harness } from "./harness.ts"

const here = fileURLToPath(new URL("../..", import.meta.url))
const KID = "host_lane"
const CONSUMER = "test-app"
const keys = generateKeyPairSync("ed25519")
const privateKey = keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString()
const publicKey = keys.publicKey.export({ type: "spki", format: "pem" }).toString()

let harness: Harness
let listing: {
  readonly trust: string
  readonly plugins: readonly {
    readonly package: string
    readonly version: string
    readonly hash: string
    readonly status: { readonly ok: boolean; readonly status?: { readonly name?: string; readonly state?: string } }
  }[]
}

before(async () => {
  harness = await startHost({ grant: { kid: KID, publicKey } })
})

after(async () => {
  await harness.close()
})

/** One installed package as `catalog.list` reported it. */
function listed(name: string): (typeof listing.plugins)[number] {
  const found = listing.plugins.find((plugin) => plugin.package === name)
  assert.ok(found, `${name} is listed`)
  return found
}

/** A target grant signed the way an app's host signs one, after the person confirmed. */
function grantFor(input: { readonly planId: string; readonly manifest: string; readonly jti?: string; readonly exp?: number }): string {
  const now = Math.floor(Date.now() / 1000)
  return signGrant({
    key: privateKey,
    kid: KID,
    audience: PACKAGES.brass,
    consumer: CONSUMER,
    capability: "brass.save_note",
    account: "default",
    scope: {},
    act: "brass.note",
    input: { planId: input.planId },
    manifest: input.manifest,
    iat: now,
    exp: input.exp ?? now + 60,
    jti: input.jti ?? randomUUID(),
    cfm: true,
  })
}

test("catalog.list sees the examples installed in a temp cache, with each plugin's status", async () => {
  const answer = await harness.call("list", {})
  assert.equal(answer.ok, true, answer.ok ? "" : answer.message)
  assert.ok(answer.ok)
  listing = answer.output as typeof listing
  assert.equal(listing.trust, "untrusted")
  const packages = listing.plugins.map((plugin) => plugin.package).sort()
  assert.deepEqual(packages, [PACKAGES.brass, PACKAGES.glyph, PACKAGES.harbour].sort())
  for (const plugin of listing.plugins) {
    assert.equal(plugin.status.ok, true, `${plugin.package}'s status is readable`)
    assert.equal(plugin.status.status?.name, plugin.package.split("/")[1]?.replace("-plugin", ""))
  }
  const harbour = listed(PACKAGES.harbour)
  assert.equal(harbour.status.status?.state, "ready")
  assert.equal(listed(PACKAGES.brass).status.status?.state, "ready")
  assert.equal(listing.plugins.length, 3)
  assert.deepEqual(listing.plugins.map((plugin) => plugin.version), listing.plugins.map(() => "0.0.0"))
})

test("broker.read reads a plugin's source for a consumer, and refuses a request without one", async () => {
  const harbour = listed(PACKAGES.harbour)
  const request = {
    package: PACKAGES.harbour,
    version: harbour.version,
    manifestHash: harbour.hash,
    consumer: CONSUMER,
    source: "harbour.notes",
    account: "work",
    limit: 10,
  }
  const answer = await harness.call("broker_read", { request })
  assert.equal(answer.ok, true)
  assert.ok(answer.ok)
  const broker = answer.output as { readonly offered: boolean; readonly ok: boolean; readonly value?: { readonly account?: string; readonly events?: readonly unknown[] } }
  assert.equal(broker.offered, true)
  assert.equal(broker.ok, true)
  assert.equal(broker.value?.account, "work")
  assert.ok((broker.value?.events?.length ?? 0) > 0)

  const noConsumer = await harness.call("broker_read", { request: { ...request, consumer: undefined } })
  assert.equal(noConsumer.ok, false)
  assert.ok(!noConsumer.ok)
  assert.equal(noConsumer.code, "INPUT_INVALID")

  const otherManifest = await harness.call("broker_read", { request: { ...request, manifestHash: `sha256:${"0".repeat(64)}` } })
  assert.equal(otherManifest.ok, false)
  assert.ok(!otherManifest.ok)
  assert.equal(otherManifest.code, "PERMISSION_DENIED")

  const noAccount = await harness.call("broker_read", { request: { ...request, account: undefined } })
  assert.equal(noAccount.ok, false)
  assert.ok(!noAccount.ok)
  assert.equal(noAccount.code, "ACCOUNT_REQUIRED")
})

test("every skills/*/SKILL.md is registered on the real host", async () => {
  // The host runs in an empty temporary project, so OpenCode's own discovery of `<project>/skills/` cannot supply the
  // skill: only the plugin's ctx.skill.transform can. The negative check (registerSkills removed) fails at the next
  // assertion with "the catalog skill is registered after load".
  assert.equal(existsSync(join(harness.directory, "skills")), false, "the host project has no skills/ of its own")
  const registered = new Set((await harness.skills()).map((skill) => skill.id))
  const directories = readdirSync(join(here, "skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
  assert.ok(directories.length > 0, "the package ships at least one skill")
  for (const name of directories) assert.ok(registered.has(name), `the ${name} skill is registered after load`)
})

test("a since read paged with a cursor keeps its window and returns each event once", async () => {
  const harbour = listed(PACKAGES.harbour)
  const base = { package: PACKAGES.harbour, version: harbour.version, manifestHash: harbour.hash, consumer: CONSUMER, source: "harbour.notes", account: "work", limit: 1 }
  const seen: string[] = []
  let cursor: string | undefined
  for (let page = 0; page < 5; page += 1) {
    const request = cursor === undefined ? { ...base, since: "2026-11-18T09:30:00.000Z" } : { ...base, cursor }
    const answer = await harness.call("broker_read", { request })
    assert.equal(answer.ok, true, answer.ok ? "" : answer.message)
    assert.ok(answer.ok)
    const body = answer.output as {
      readonly offered: boolean
      readonly ok: boolean
      readonly value?: { readonly events?: readonly { readonly external_id: string }[]; readonly cursor?: string; readonly more?: boolean }
    }
    assert.equal(body.offered, true)
    assert.equal(body.ok, true)
    seen.push(...(body.value?.events ?? []).map((event) => event.external_id))
    cursor = body.value?.cursor
    if (body.value?.more !== true) break
    assert.ok(typeof cursor === "string" && cursor.length > 0, "a page with more events answers a cursor")
  }
  assert.deepEqual(seen, ["note-work-1", "note-work-2"])
  assert.equal(new Set(seen).size, seen.length, "no event is repeated across the page boundary")
})

test("broker.act previews, then commits with a valid grant, and refuses without one, with a replayed grant, and with a grant for another plan", async () => {
  const brass = listed(PACKAGES.brass)
  const base = { package: PACKAGES.brass, version: brass.version, manifestHash: brass.hash, consumer: CONSUMER, action: "brass.note" }

  const preview = async (text: string): Promise<{ readonly planId: string; readonly method: string; readonly output: unknown }> => {
    const answer = await harness.call("broker_act", { request: { ...base, input: { text } } })
    assert.equal(answer.ok, true, answer.ok ? "" : answer.message)
    assert.ok(answer.ok)
    const body = answer.output as { readonly phase: string; readonly preview: { readonly planId: string; readonly method: string; readonly output: unknown; readonly trust: string } }
    assert.equal(body.phase, "preview")
    assert.equal(body.preview.method, "save_note")
    assert.equal(body.preview.trust, "untrusted")
    return body.preview
  }

  // A preview writes nothing and answers the plan the commit spends.
  const first = await preview("Deploy finished")
  assert.deepEqual(first.output, { text: "Deploy finished" })

  // With a valid grant the target's register verifies it, spends the plan and answers the write.
  const valid = await harness.call(
    "broker_act_commit",
    { request: { ...base, planId: first.planId, grant: grantFor({ planId: first.planId, manifest: brass.hash }) } },
    { answerAsk: true },
  )
  assert.equal(valid.ok, true, valid.ok ? "" : valid.message)
  assert.ok(valid.ok)
  const committed = valid.output as { readonly phase: string; readonly result: { readonly output: { readonly text: string } } }
  assert.equal(committed.phase, "commit")
  assert.equal(committed.result.output.text, "Deploy finished")

  // Without a grant, the catalog's own door is answered, and the contract's act module refuses before any target call.
  const second = await preview("No grant")
  const without = await harness.call("broker_act_commit", { request: { ...base, planId: second.planId } }, { answerAsk: true })
  assert.equal(without.ok, false)
  assert.ok(!without.ok)
  assert.equal(without.code, "PERMISSION_DENIED")

  // A replayed jti is refused by the target's durable single-use store.
  const replayJti = randomUUID()
  const third = await preview("Replay")
  const replayValid = await harness.call(
    "broker_act_commit",
    { request: { ...base, planId: third.planId, grant: grantFor({ planId: third.planId, manifest: brass.hash, jti: replayJti }) } },
    { answerAsk: true },
  )
  assert.equal(replayValid.ok, true, replayValid.ok ? "" : replayValid.message)
  const fourth = await preview("Replay again")
  const replayed = await harness.call(
    "broker_act_commit",
    { request: { ...base, planId: fourth.planId, grant: grantFor({ planId: fourth.planId, manifest: brass.hash, jti: replayJti }) } },
    { answerAsk: true },
  )
  assert.equal(replayed.ok, false)
  assert.ok(!replayed.ok)
  assert.equal(replayed.code, "GRANT_INVALID")
  assert.match(replayed.message, /already been used|has already been used|replayed/i)

  // A grant signed for another plan does not commit this one: its digest is bound to `{ planId }`.
  const fifth = await preview("First plan")
  const sixth = await preview("Second plan")
  const wrongPlan = await harness.call(
    "broker_act_commit",
    { request: { ...base, planId: sixth.planId, grant: grantFor({ planId: fifth.planId, manifest: brass.hash }) } },
    { answerAsk: true },
  )
  assert.equal(wrongPlan.ok, false)
  assert.ok(!wrongPlan.ok)
  assert.equal(wrongPlan.code, "GRANT_INVALID")
})

test("rpc.catalog.changed fires when a plugin is added to the installed set", async () => {
  const events = harness.events(["rpc.catalog.changed"])[Symbol.asyncIterator]()
  const next = async (): Promise<{ readonly type: string; readonly data?: unknown }> => {
    for (;;) {
      const received = await Promise.race([
        events.next(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("no rpc.catalog.changed within 5 seconds")), 5_000)),
      ])
      if (received.done) throw new Error("the event stream ended before rpc.catalog.changed")
      // Every filtered stream starts with `server.connected`; only the catalog's own nudge is the subject here.
      if ((received.value as { readonly type?: string }).type !== "server.connected") return received.value as { readonly type: string; readonly data?: unknown }
    }
  }
  const received = next()
  await harness.addPlugin()
  const event = await received
  assert.equal(event.type, "rpc.catalog.changed")
  const data = event.data as { readonly capability: string; readonly account: string; readonly reason: string }
  assert.equal(data.capability, "catalog.plugins")
  assert.equal(data.account, "default")
  assert.equal(data.reason, "installed")
  await events.return?.(undefined)
})
