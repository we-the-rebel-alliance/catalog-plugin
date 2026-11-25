/** The two wire requests and the relayed status, checked strictly. */
import assert from "node:assert/strict"
import { test } from "node:test"
import { checkStatus, isBrokerRequest, parseActCommit, parseActPreview } from "../../src/requests.ts"

const HASH = `sha256:${"a".repeat(64)}`

const read = {
  package: "@we-the-rebel-alliance/example-plugin",
  version: "0.0.0",
  manifestHash: HASH,
  consumer: "notes",
  source: "example.messages",
  account: "work",
  limit: 10,
}

const base = {
  package: "@we-the-rebel-alliance/example-plugin",
  version: "0.0.0",
  manifestHash: HASH,
  consumer: "notes",
  action: "example.send",
}

test("a broker request needs a consumer, a manifest hash and no key outside the request", () => {
  assert.equal(isBrokerRequest(read), true)
  assert.equal(isBrokerRequest({ ...read, consumer: undefined }), false)
  assert.equal(isBrokerRequest({ ...read, consumer: "" }), false)
  assert.equal(isBrokerRequest({ ...read, manifestHash: "sha256:short" }), false)
  assert.equal(isBrokerRequest({ ...read, extra: 1 }), false)
  assert.equal(isBrokerRequest(null), false)
})

test("a preview request takes the action's input and refuses an unknown key", () => {
  const parsed = parseActPreview({ ...base, input: { text: "hello" } })
  assert.equal(parsed.ok, true)
  assert.ok(parsed.ok)
  assert.deepEqual(parsed.value.input, { text: "hello" })
  const extra = parseActPreview({ ...base, extra: true })
  assert.equal(extra.ok, false)
  const noConsumer = parseActPreview({ ...base, consumer: "" })
  assert.equal(noConsumer.ok, false)
  const badHash = parseActPreview({ ...base, manifestHash: "sha256:x" })
  assert.equal(badHash.ok, false)
})

test("a commit request takes the plan and the grant, never an input", () => {
  const commit = { ...base, planId: "plan-1", grant: "token" }
  const parsed = parseActCommit(commit)
  assert.equal(parsed.ok, true)
  assert.ok(parsed.ok)
  assert.equal(parsed.value.planId, "plan-1")
  assert.equal(parsed.value.grant, "token")
  // A missing grant is the contract's refusal when the commit is attempted, not a malformed request.
  const withoutGrant = parseActCommit({ ...base, planId: "plan-1" })
  assert.equal(withoutGrant.ok, true)
  assert.equal(parseActCommit({ ...commit, grant: "" }).ok, false)
  assert.equal(parseActCommit({ ...commit, input: { text: "x" } }).ok, false)
  assert.equal(parseActCommit({ ...base }).ok, false)
  assert.equal(parseActCommit({ ...commit, extra: 1 }).ok, false)
})

test("a status answer is relayed only when it keeps contract §11's shape", () => {
  const status = {
    name: "harbour",
    version: "0.0.0",
    host: { version: "2.4.1", range: ">=2.4.1 <2.5.0", tested: ["2.4.1"] },
    state: "ready",
    accounts: [{ alias: "work", state: "ready" }],
    unguardedAgents: [],
    nextStep: null,
  }
  assert.equal(checkStatus(status).ok, true)
  assert.equal(checkStatus({ ...status, state: "fine" }).ok, false)
  assert.equal(checkStatus({ ...status, accounts: "work" }).ok, false)
  assert.equal(checkStatus({ ...status, host: { version: "2.4.1" } }).ok, false)
  assert.equal(checkStatus({ ...status, nextStep: 3 }).ok, false)
  assert.equal(checkStatus("ready").ok, false)
})
