/**
 * The catalog's consent boundary, on the real OpenCode 2.4.1 host.
 *
 * A grant is the person's configuration (`options.grants`); a broker request only names a consumer. These tests prove
 * the lookup refuses an ungranted consumer, another consumer's grant, an account or scope outside the grant, a disabled
 * grant and an ungranted action, before the target's source or action runs.
 */
import assert from "node:assert/strict"
import { generateKeyPairSync } from "node:crypto"
import { test } from "node:test"
import { startHost, PACKAGES, type Harness, type InstalledTargets } from "./harness.ts"

const keys = generateKeyPairSync("ed25519")
const publicKey = keys.publicKey.export({ type: "spki", format: "pem" }).toString()
const CONSUMER = "test-app"

/** One read as `consumer`, and the contract code when it is refused. */
async function readAs(harness: Harness, consumer: string, account: string, scope?: Readonly<Record<string, readonly string[]>>): Promise<string | undefined> {
  const listing = await harness.call("list", {})
  assert.equal(listing.ok, true, listing.ok ? "" : listing.message)
  assert.ok(listing.ok)
  const plugins = (listing.output as { readonly plugins: readonly { readonly package: string; readonly version: string; readonly hash: string }[] }).plugins
  const harbour = plugins.find((plugin) => plugin.package === PACKAGES.harbour)
  assert.ok(harbour !== undefined, "Harbour is installed")
  const answer = await harness.call("broker_read", {
    request: {
      package: PACKAGES.harbour,
      version: harbour.version,
      manifestHash: harbour.hash,
      consumer,
      source: "harbour.notes",
      account,
      ...(scope === undefined ? {} : { scope }),
      limit: 10,
    },
  })
  return answer.ok ? undefined : answer.code
}

/** One preview as `consumer`, and the contract code when it is refused. */
async function previewAs(harness: Harness, consumer: string): Promise<string | undefined> {
  const listing = await harness.call("list", {})
  assert.equal(listing.ok, true, listing.ok ? "" : listing.message)
  assert.ok(listing.ok)
  const plugins = (listing.output as { readonly plugins: readonly { readonly package: string; readonly version: string; readonly hash: string }[] }).plugins
  const brass = plugins.find((plugin) => plugin.package === PACKAGES.brass)
  assert.ok(brass !== undefined, "Brass is installed")
  const answer = await harness.call("broker_act", {
    request: { package: PACKAGES.brass, version: brass.version, manifestHash: brass.hash, consumer, action: "brass.note", input: { text: "No grant" } },
  })
  return answer.ok ? undefined : answer.code
}

/** Start a host with the grants a test names, and close it afterwards. */
async function withHost(grants: (installed: InstalledTargets) => readonly unknown[], run: (harness: Harness) => Promise<void>): Promise<void> {
  const harness = await startHost({ grant: { kid: "host_grants", publicKey }, grants })
  try {
    await run(harness)
  } finally {
    await harness.close()
  }
}

const WorkGrant = (installed: InstalledTargets, extra: Readonly<Record<string, unknown>> = {}) => ({
  consumer: CONSUMER,
  source: "harbour.notes",
  account: "work",
  manifestHash: installed.harbour.hash,
  ...extra,
})

test("an ungranted consumer is refused before the fence opens", async () => {
  await withHost((installed) => [{ ...WorkGrant(installed), consumer: "someone-else" }], async (harness) => {
    assert.equal(await readAs(harness, CONSUMER, "work"), "PERMISSION_DENIED")
  })
})

test("another consumer's grant does not serve this consumer", async () => {
  await withHost((installed) => [{ ...WorkGrant(installed), consumer: "other-app" }], async (harness) => {
    assert.equal(await readAs(harness, CONSUMER, "work"), "PERMISSION_DENIED")
  })
})

test("a scope outside the grant is refused", async () => {
  await withHost((installed) => [WorkGrant(installed, { scope: { spaces: ["space-research"] } })], async (harness) => {
    assert.equal(await readAs(harness, CONSUMER, "work", { spaces: ["space-operations"] }), "PERMISSION_DENIED")
    assert.equal(await readAs(harness, CONSUMER, "work", { spaces: ["space-research"] }), undefined)
  })
})

test("an account outside the grant is refused", async () => {
  await withHost((installed) => [WorkGrant(installed)], async (harness) => {
    assert.equal(await readAs(harness, CONSUMER, "personal"), "PERMISSION_DENIED")
  })
})

test("a disabled grant is SOURCE_DISABLED", async () => {
  await withHost((installed) => [WorkGrant(installed, { disabled: true })], async (harness) => {
    assert.equal(await readAs(harness, CONSUMER, "work"), "SOURCE_DISABLED")
  })
})

test("an action without a grant is refused before the fence opens", async () => {
  await withHost((installed) => [WorkGrant(installed)], async (harness) => {
    assert.equal(await previewAs(harness, CONSUMER), "PERMISSION_DENIED")
  })
})
