/**
 * The real OpenCode 2.4.1 host for the catalog's host tests.
 *
 * The harness lays three real plugins into a temporary OpenCode cache — the contract's Harbour and Glyph examples, and
 * the Brass test target — starts the embedded `@opencode/sdk` host with them in its config, and loads the built catalog
 * (`dist/index.js`) as an SDK plugin. It then drives the catalog over the real RPC door, answers a permission ask where
 * an app would, and records the events the catalog emits.
 *
 * `XDG_CACHE_HOME` must be set before `@opencode/util` is first imported, because OpenCode reads its cache root once at
 * module load. The harness therefore imports the SDK and the catalog's bundle dynamically, after it has made the
 * temporary cache; nothing above it imports either statically.
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { inspect } from "node:util"

/** The packages the harness installs and configures. */
export const PACKAGES = {
  harbour: "@we-the-rebel-alliance/harbour-plugin",
  glyph: "@we-the-rebel-alliance/glyph-plugin",
  brass: "@we-the-rebel-alliance/brass-plugin",
} as const

/** The host public key the Brass test target verifies action grants with. */
export interface GrantKey {
  readonly kid: string
  readonly publicKey: string
}

/** One RPC answer, or the contract code the host reported. */
export type RpcResult = { readonly ok: true; readonly output: unknown } | { readonly ok: false; readonly code: string; readonly message: string }

/** A test's handle on the running host. */
export interface Harness {
  /** The project directory the host runs in. */
  readonly directory: string
  /** The temporary OpenCode cache the packages are installed in. */
  readonly cache: string
  /** A fresh session whose agent holds the catalog's generated access rules. */
  session(): Promise<string>
  /** Call one catalog RPC method; `answerAsk` answers the confirmation ask an app would answer. */
  call(method: string, input: unknown, options?: { readonly sessionID?: string; readonly answerAsk?: boolean }): Promise<RpcResult>
  /** Add one SDK plugin to the running host, as an install would change the inventory. */
  addPlugin(): Promise<void>
  /** The host's skill inventory for the project, as `skill.list` answers it. */
  skills(): Promise<readonly { readonly id: string; readonly name: string }[]>
  /** The host's `/api/event` stream, filtered to the types named. */
  events(types: readonly string[]): AsyncIterable<{ readonly type: string; readonly data?: unknown }>
  /** Close the host and remove the temporary cache. */
  close(): Promise<void>
}

/** The piece of the SDK host the harness uses. */
interface SdkHost {
  readonly sessions: {
    create(input: Record<string, unknown>): Promise<{ readonly id: string }>
    prompt(input: Record<string, unknown>): Promise<unknown>
  }
  readonly rpc: { call(input: Record<string, unknown>): Promise<{ readonly output?: unknown }> }
  readonly permission: {
    list(input: { readonly sessionID: string }): Promise<readonly { readonly id: string; readonly action: string }[]>
    reply(input: { readonly sessionID: string; readonly requestID: string; readonly decision: "once" | "always" | "reject" }): Promise<void>
  }
  readonly events: { subscribe(options: { readonly types?: readonly string[]; readonly signal?: AbortSignal }): AsyncIterable<{ readonly type: string; readonly data?: unknown }> }
  readonly skill: { list(input: { readonly location: { readonly directory: string } }): Promise<{ readonly data: readonly { readonly id?: string; readonly name?: string }[] }> }
  readonly plugin: ((plugin: { readonly id: string; setup(): void }) => Promise<void>) & { list(input?: unknown): Promise<{ readonly data: readonly unknown[] }> }
  close(): Promise<void>
}

/** A plugin definition, as the catalog's bundle exports it. */
interface Definition {
  readonly id: string
  setup(context: unknown): unknown
}

const here = fileURLToPath(new URL("../..", import.meta.url))
const contractDist = join(here, "node_modules", "@we-the-rebel-alliance", "plugin-contract", "dist")
const examples = join(here, "test", "fixtures", "contract-examples")

/**
 * Install one package into the OpenCode 2.4.1 cache, with the contract's dist beside it as the examples expect.
 *
 * The contract's examples import `../../dist/<module>.js`, the layout of the contract's own repository, where an example
 * sits at `<root>/examples/<name>`. A scoped package sits at `<generation>/node_modules/@scope/<name>`, one level deeper,
 * so the dist is placed at both `<generation>/dist` and `<generation>/node_modules/dist`; either import resolves.
 */
function install(cache: string, name: string, source: string): void {
  const generation = join(cache, "opencode", "npm", `${name}@latest`, "1")
  mkdirSync(join(generation, "node_modules"), { recursive: true })
  cpSync(source, join(generation, "node_modules", name), { recursive: true })
  for (const dist of [join(generation, "dist"), join(generation, "node_modules", "dist")]) {
    if (!existsSync(dist)) cpSync(contractDist, dist, { recursive: true })
  }
}

/** Wait up to `ms` for `read` to answer a value. */
async function waitFor<T>(read: () => Promise<T | undefined>, ms: number): Promise<T | undefined> {
  const until = Date.now() + ms
  while (Date.now() < until) {
    const value = await read()
    if (value !== undefined) return value
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  return undefined
}

/** The one temporary cache this process uses, packed once with the three packages. */
let sharedCache: string | undefined

/**
 * Lay the packages into the temporary OpenCode cache, once per process.
 *
 * OpenCode reads its cache root when `@opencode/util` first loads, so the environment must be set before the SDK is
 * imported and stays for the process. A second host in the same test file shares the cache; only the project directory
 * and the host instance are per call.
 */
function prepareCache(): string {
  if (sharedCache !== undefined) return sharedCache
  const cache = mkdtempSync(join(tmpdir(), "catalog-cache-"))
  process.env["XDG_CACHE_HOME"] = cache
  install(cache, PACKAGES.harbour, join(examples, "integration"))
  install(cache, PACKAGES.glyph, join(examples, "tools"))
  install(cache, PACKAGES.brass, join(here, "test", "fixtures", "brass-plugin"))
  process.once("exit", () => rmSync(cache, { recursive: true, force: true }))
  sharedCache = cache
  return cache
}

/** A context whose `options` are the catalog options under test, with every other host field passed through. */
function withOptions(context: unknown, options: Readonly<Record<string, unknown>>): unknown {
  return new Proxy(context as Record<PropertyKey, unknown>, {
    get(target, property, receiver) {
      if (property === "options") return { ...(Reflect.get(target, property, receiver) as Record<string, unknown> | undefined), ...options }
      return Reflect.get(target, property, receiver)
    },
  })
}

/** Start the real host with the three installed packages and the catalog's built bundle. */
export async function startHost(options: { readonly grant: GrantKey; readonly catalogOptions?: Readonly<Record<string, unknown>> }): Promise<Harness> {
  const cache = prepareCache()
  const directory = mkdtempSync(join(tmpdir(), "catalog-project-"))

  try {
    const config = {
      plugins: [
        { package: PACKAGES.harbour, options: { accounts: { work: { workspace: "research" }, personal: { workspace: "home" } } } },
        { package: PACKAGES.glyph, options: {} },
        { package: PACKAGES.brass, options: { grant: { kid: options.grant.kid, publicKey: options.grant.publicKey } } },
      ],
    }

    // After this point @opencode/util may be imported, so the temporary cache above is the one it reads.
    const sdk = (await import("@opencode/sdk")) as { readonly OpenCode: { create(options: Record<string, unknown>): Promise<SdkHost> } }
    const catalogModule = (await import(pathToFileURL(join(here, "dist", "index.js")).href)) as { readonly default: Definition }
    const definition = catalogModule.default

    let active = false
    let failure: string | undefined
    const wrapper: Definition = {
      id: definition.id,
      async setup(context) {
        try {
          const cleanup = await definition.setup(withOptions(context, options.catalogOptions ?? {}))
          active = true
          return cleanup
        } catch (error) {
          failure = error instanceof Error ? error.message : String(error)
          throw error
        }
      },
    }

    const host = await sdk.OpenCode.create({
      plugins: [wrapper],
      config: { directory, content: JSON.stringify(config) },
      app: { name: "opencode", version: "2.4.1" },
      // Host logs are off unless the test run asks for them, so a failure can be read without changing the harness.
      log: {
        level: process.env["CATALOG_HOST_LOG"] === "1" ? "debug" : "error",
        emit: (entry: { readonly level: string; readonly message: string; readonly attributes?: unknown; readonly cause?: unknown }) => {
          if (process.env["CATALOG_HOST_LOG"] === "1") console.error(`[host ${entry.level}] ${entry.message}`, entry.attributes ?? "", inspect(entry.cause ?? "", { depth: 6 }))
        },
      },
    })

    const activation = await host.sessions.create({ location: { directory }, agent: "build", permissions: [] })
    await host.sessions.prompt({ sessionID: activation.id, text: "activate the catalog", delivery: "queue" }).catch(() => undefined)
    const ready = await waitFor(async () => (active ? true : undefined), 20_000)
    if (ready === undefined) {
      await host.close().catch(() => undefined)
      throw new Error(`the catalog did not become active: ${failure ?? "no setup error was recorded"}`)
    }

    const session = async (): Promise<string> => (await host.sessions.create({ location: { directory }, agent: "build", permissions: [] })).id

    const call = async (method: string, input: unknown, callOptions: { readonly sessionID?: string; readonly answerAsk?: boolean } = {}): Promise<RpcResult> => {
      const sessionID = callOptions.sessionID ?? (await session())
      const pending = host.rpc
        .call({ rpcID: definition.id, method, input: { sessionID, input }, location: { directory } })
        .then((answer): RpcResult => ({ ok: true, output: answer.output }), (error: unknown): RpcResult => {
          const record = typeof error === "object" && error !== null ? (error as { readonly message?: unknown; readonly data?: { readonly code?: unknown } }) : {}
          const data = record.data ?? {}
          return { ok: false, code: typeof data.code === "string" ? data.code : "UNAVAILABLE", message: typeof record.message === "string" ? record.message : String(error) }
        })
      if (callOptions.answerAsk !== true) return await pending
      const ask = await Promise.race([
        waitFor(async () => (await host.permission.list({ sessionID })).find((request) => request.action === `${definition.id}.${method}`), 5_000),
        pending.then(() => undefined, () => undefined),
      ])
      if (ask !== undefined) await host.permission.reply({ sessionID, requestID: ask.id, decision: "once" })
      return await pending
    }

    return {
      directory,
      cache,
      session,
      call,
      async addPlugin() {
        await host.plugin({ id: "added", setup() {} })
      },
      async skills() {
        const listed = await host.skill.list({ location: { directory } })
        return listed.data.filter((skill): skill is { readonly id: string; readonly name: string } => typeof skill.id === "string" && typeof skill.name === "string")
      },
      events(types) {
        return host.events.subscribe({ types: [...types] })
      },
      async close() {
        await host.close().catch(() => undefined)
        rmSync(directory, { recursive: true, force: true })
      },
    }
  } catch (error) {
    rmSync(directory, { recursive: true, force: true })
    throw error
  }
}
