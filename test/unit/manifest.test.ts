/** The manifest, the package and the handler table name the same five methods. */
import assert from "node:assert/strict"
import { test } from "node:test"
import type { HandlerRuntime } from "../../src/handlers/index.ts"
import { handlersFor } from "../../src/handlers/index.ts"
import { manifest, packageName } from "../../src/manifest.ts"

/** A runtime the table can be built from; no handler runs in this test. */
const runtime: HandlerRuntime = {
  plugin: "catalog",
  version: "0.0.0",
  hostVersion: "2.4.1",
  tested: ["2.4.1"],
  clock: () => 0,
  timeZone: "UTC",
  agents: async () => [],
  rules: () => [],
  host: () => {
    throw new Error("no host in this test")
  },
}

test("one name everywhere: package, plugin, RPC id, capability ids", () => {
  assert.equal(packageName, "@we-the-rebel-alliance/catalog-plugin")
  assert.equal(manifest.plugin.name, "catalog")
  assert.equal(manifest.plugin.host.opencode, ">=2.4.1 <2.5.0")
  assert.deepEqual(manifest.plugin.host.tested, ["2.4.1"])
  assert.ok(manifest.plugin.summary.length <= 300)
})

test("the manifest declares exactly the methods the handlers implement", () => {
  assert.deepEqual(Object.keys(manifest.methods).sort(), ["broker_act", "broker_act_commit", "broker_read", "list", "status"])
  assert.deepEqual(Object.keys(handlersFor(runtime)).sort(), Object.keys(manifest.methods).sort())
})

test("every method takes no account, and only the commit is a change", () => {
  for (const [method, item] of Object.entries(manifest.methods)) {
    assert.equal(item.accounts, "none", `${method} takes no account`)
    if (method === "broker_act_commit") {
      assert.equal(item.class, "write")
      assert.equal(item.effect, "ask")
    } else {
      assert.equal(item.class, "read", `${method} is a read`)
    }
  }
})

test("the catalog declares no source and no action: the action an app offers is the target plugin's", () => {
  assert.deepEqual(manifest.sources, [])
  assert.deepEqual(manifest.actions, [])
  assert.deepEqual(Object.keys(manifest.events), ["changed"])
})
