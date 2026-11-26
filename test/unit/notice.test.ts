// The release tarball ships NOTICE next to a bundle that inlines third-party code. This test builds the server entry
// with the same esbuild options as scripts/build.mjs, collects the packages that actually end up in the bundle
// (including packages inlined by a bundled dist, such as zod inside plugin-contract), and requires a NOTICE section for
// each. The second test proves the section check reports a missing package.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"
import { build } from "esbuild"

const root = fileURLToPath(new URL("../..", import.meta.url))
const PLUGIN = "@we-the-rebel-alliance/catalog-plugin"

/** A package name from an esbuild input path, or undefined for the plugin's own sources. */
function packageOf(path: string): string | undefined {
  return /^node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(path)?.[1]
}

function keep(name: string | undefined): name is string {
  return name !== undefined && name !== PLUGIN && !name.startsWith("@opencode/")
}

function section(name: string): RegExp {
  return new RegExp(`^## ${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`, "m")
}

/** The packages a NOTICE does not name, in the order they were found. */
export function missingNoticeSections(notice: string, packages: readonly string[]): string[] {
  return packages.filter((name) => !section(name).test(notice))
}

/** Every package esbuild actually inlines into the server bundle. */
async function bundledPackages(): Promise<string[]> {
  const result = await build({
    absWorkingDir: root,
    entryPoints: [{ in: join(root, "src", "index.ts"), out: "index" }],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    target: "node24",
    external: ["@opencode/*"],
    legalComments: "none",
    metafile: true,
    logLevel: "silent",
  })
  const metafile = result.metafile
  assert.ok(metafile !== undefined, "esbuild returned a metafile")
  const found = new Set<string>()
  const inputs = Object.keys(metafile.inputs)
  for (const path of inputs) {
    const name = packageOf(path)
    if (keep(name)) found.add(name)
  }
  // A bundled dist can inline its own dependencies; plugin-contract's chunks carry the original module path in a
  // comment (`// node_modules/zod/v4/...`). Those packages are redistributed by this bundle too.
  for (const path of inputs) {
    if (!path.startsWith("node_modules/")) continue
    const text = readFileSync(join(root, path), "utf8")
    for (const match of text.matchAll(/\/\/\s*node_modules\/((?:@[^/\s]+\/)?[^/\s]+)\//g)) {
      if (keep(match[1])) found.add(match[1])
    }
  }
  return [...found].sort()
}

test("every bundled package has a NOTICE section", async () => {
  const packages = await bundledPackages()
  assert.ok(packages.includes("@we-the-rebel-alliance/plugin-contract"), "the contract is inlined")
  assert.ok(packages.includes("yaml"), "yaml is inlined")
  assert.ok(packages.includes("zod"), "zod is inlined")
  const notice = readFileSync(join(root, "NOTICE"), "utf8")
  assert.deepEqual(missingNoticeSections(notice, packages), [])
})

test("a missing section is reported", () => {
  const notice = readFileSync(join(root, "NOTICE"), "utf8")
  const withoutYaml = notice.replace(/^## yaml[\s\S]*?(?=^## |\s*$)/m, "")
  assert.deepEqual(missingNoticeSections(withoutYaml, ["yaml"]), ["yaml"])
})
