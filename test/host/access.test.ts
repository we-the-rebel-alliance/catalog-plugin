/**
 * The catalog's own access ceiling, on the real OpenCode 2.4.1 host.
 *
 * T1 proves the rules the catalog generates for each level. These tests prove the ceiling itself, on a running catalog:
 * at `read-only` the commit is refused before any target call even with a valid grant, and at `ask-changes` the same
 * commit runs only after the person's ask is answered. The read methods run at both levels.
 */
import assert from "node:assert/strict"
import { generateKeyPairSync, randomUUID } from "node:crypto"
import { after, test } from "node:test"
import { signGrant } from "@we-the-rebel-alliance/plugin-contract/grant"
import { startHost, PACKAGES, type Harness } from "./harness.ts"

const KID = "host_access_lane"
const CONSUMER = "access-test"
const keys = generateKeyPairSync("ed25519")
const privateKey = keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString()
const publicKey = keys.publicKey.export({ type: "spki", format: "pem" }).toString()

let open: Harness | undefined

after(async () => {
  await open?.close()
})

/** The Brass target's references, from the catalog's own listing. */
async function brassOf(harness: Harness): Promise<{ readonly version: string; readonly hash: string }> {
  const answer = await harness.call("list", {})
  assert.equal(answer.ok, true, answer.ok ? "" : answer.message)
  assert.ok(answer.ok)
  const listing = answer.output as { readonly plugins: readonly { readonly package: string; readonly version: string; readonly hash: string }[] }
  const brass = listing.plugins.find((plugin) => plugin.package === PACKAGES.brass)
  assert.ok(brass, "the Brass target is installed")
  return brass
}

/** A preview, then a grant for its plan, the way an app's host signs one after the person confirms. */
async function previewAndGrant(harness: Harness): Promise<{ readonly request: Record<string, unknown>; readonly grant: string }> {
  const brass = await brassOf(harness)
  const base = { package: PACKAGES.brass, version: brass.version, manifestHash: brass.hash, consumer: CONSUMER, action: "brass.note" }
  const preview = await harness.call("broker_act", { request: { ...base, input: { text: "Access level" } } })
  assert.equal(preview.ok, true, preview.ok ? "" : preview.message)
  assert.ok(preview.ok)
  const body = preview.output as { readonly preview: { readonly planId: string } }
  const now = Math.floor(Date.now() / 1000)
  const grant = signGrant({
    key: privateKey,
    kid: KID,
    audience: PACKAGES.brass,
    consumer: CONSUMER,
    capability: "brass.save_note",
    account: "default",
    scope: {},
    act: "brass.note",
    input: { planId: body.preview.planId },
    manifest: brass.hash,
    iat: now,
    exp: now + 60,
    jti: randomUUID(),
    cfm: true,
  })
  return { request: { ...base, planId: body.preview.planId, grant }, grant }
}

test("read-only runs the reads and refuses the commit even with a valid grant", async () => {
  const harness = await startHost({
    grant: { kid: KID, publicKey },
    catalogOptions: { access: "read-only" },
    grants: ({ brass }) => [{ consumer: CONSUMER, action: "brass.note", account: "default", manifestHash: brass.hash }],
  })
  open = harness
  try {
    const brass = await brassOf(harness)
    assert.equal(brass.version, "0.0.0")
    const { request } = await previewAndGrant(harness)
    const commit = await harness.call("broker_act_commit", { request })
    assert.equal(commit.ok, false)
    assert.ok(!commit.ok)
    assert.equal(commit.code, "PERMISSION_DENIED")
  } finally {
    await harness.close()
    open = undefined
  }
})

test("ask-changes runs the commit once the person's ask is answered", async () => {
  const harness = await startHost({
    grant: { kid: KID, publicKey },
    catalogOptions: { access: "ask-changes" },
    grants: ({ brass }) => [{ consumer: CONSUMER, action: "brass.note", account: "default", manifestHash: brass.hash }],
  })
  open = harness
  try {
    const { request } = await previewAndGrant(harness)
    const answered = await harness.call("broker_act_commit", { request }, { answerAsk: true })
    assert.equal(answered.ok, true, answered.ok ? "" : answered.message)
    const body = answered.ok ? (answered.output as { readonly phase: string; readonly result: { readonly output: { readonly text: string } } }) : undefined
    assert.equal(body?.phase, "commit")
    assert.equal(body?.result.output.text, "Access level")
  } finally {
    await harness.close()
    open = undefined
  }
})

test("a session with no agent is refused before the commit, so the app needs a session whose agent exists", async () => {
  const harness = await startHost({
    grant: { kid: KID, publicKey },
    catalogOptions: { access: "ask-changes" },
    grants: ({ brass }) => [{ consumer: CONSUMER, action: "brass.note", account: "default", manifestHash: brass.hash }],
  })
  open = harness
  try {
    const { request } = await previewAndGrant(harness)
    const sessionID = await harness.session({})
    const commit = await harness.call("broker_act_commit", { request }, { sessionID, answerAsk: true })
    assert.equal(commit.ok, false)
    assert.ok(!commit.ok)
    assert.equal(commit.code, "PERMISSION_DENIED")
    assert.match(commit.message, /names no agent/i)
  } finally {
    await harness.close()
    open = undefined
  }
})
