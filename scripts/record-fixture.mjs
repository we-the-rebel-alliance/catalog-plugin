// Rewrites fixtures/conformance.json from the plugin's own manifest.
//
//   npm run fixtures
//
// The catalog has no accounts and no provider, so its recording is its declaration: the status answer, the one bus
// event it emits, the namespace line, and a valid non-read input so T1 can prove the RPC confirmation. Every value is
// rebuilt from the manifest and the package, never copied by hand.
import { mkdirSync, writeFileSync } from "node:fs"
import { manifest, packageName, version } from "../src/manifest.ts"

const fixture = {
  plugin: packageName,
  events: {
    emitted: ["changed"],
    status: {
      name: manifest.plugin.name,
      version,
      host: { version: "2.4.1", range: manifest.plugin.host.opencode, tested: manifest.plugin.host.tested },
      state: "ready",
      accounts: [],
      unguardedAgents: [],
      nextStep: null,
    },
  },
  rpc: {
    inputs: {
      broker_act_commit: {
        request: {
          package: "@we-the-rebel-alliance/brass-plugin",
          version: "0.0.0",
          manifestHash: `sha256:${"0".repeat(64)}`,
          consumer: "conformance",
          action: "brass.note",
          planId: "the-plan-the-preview-answered",
          grant: "the-host-signed-grant",
        },
      },
    },
    calls: [{ method: "broker_act_commit", ask: "denied", expect: { code: "PERMISSION_DENIED" } }],
  },
  namespace: manifest.plugin.summary,
}

mkdirSync("fixtures", { recursive: true })
writeFileSync("fixtures/conformance.json", `${JSON.stringify(fixture, null, 2)}\n`)
console.log(`recorded fixtures/conformance.json for ${packageName}`)
