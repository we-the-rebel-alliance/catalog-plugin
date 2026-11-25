/**
 * The catalog's host: the one place the plugin reaches OpenCode for a brokered call.
 *
 * A broker call runs through the contract's `ReadHost`: a session whose rules are exactly the grant's, a read of the
 * target plugin's own `status`, and one RPC call to the target. This module implements those three over the public
 * `@opencode/plugin` 2.4.1 context:
 *
 * - `openSession` creates a session with the fenced rules and the caller's agent, and removes it afterwards;
 * - `status` calls the target's `status` in a session that allows only that method;
 * - `call` posts the target's method with `{ sessionID, input }`, and with `{ grant, consumer }` beside them for an act
 *   commit, to the target's RPC id.
 *
 * The target's id is its manifest's `plugin.name`, read from the package on disk, never from the request. The catalog
 * holds no session, no plan and no grant beyond one call.
 */
import type { Plugin } from "@opencode/plugin"
import { DENY_ALL, type PermissionRule } from "@we-the-rebel-alliance/plugin-contract/access"
import { listInstalledPlugins, type CatalogListing, type CatalogPlugin } from "@we-the-rebel-alliance/plugin-contract/catalog"
import { SourceError } from "@we-the-rebel-alliance/plugin-contract/events"
import type { ReadHost } from "@we-the-rebel-alliance/plugin-contract/read"

/** One RPC method of a target plugin, called with the envelope OpenCode's RPC door takes. */
type MethodCall = (envelope: unknown, options?: { readonly signal?: AbortSignal }) => Promise<unknown>

/**
 * A broker call's host, bound to the agent of the session that asked for it. `listing` and `installed` read the host's
 * installed plugins once per call; `openSession`, `status` and `call` are the contract's `ReadHost`, so `read` and `act`
 * drive a target exactly as they drive an embedded plugin.
 */
export interface CallHost extends ReadHost {
  /** The target's own `status` answer, read through the RPC door. Required: the catalog always has it. */
  status(request: { readonly package: string }): Promise<unknown>
  /** The installed packages, validated, hashed and with every package that could not be read beside them. */
  listing(): Promise<CatalogListing>
  /** One installed package, or undefined when no installed package carries that name. */
  installed(packageName: string): Promise<CatalogPlugin | undefined>
}

/** The rules a status read runs under: everything denied, then the target's own `status` method allowed. */
function statusRules(pluginID: string): readonly PermissionRule[] {
  return [DENY_ALL, { action: `${pluginID}.status`, resource: "*", effect: "allow" }]
}

/** A call host over the real plugin context, for the agent of the session that asked. */
export function callHost(context: Plugin.Context, agent: string): CallHost {
  let cached: Promise<CatalogListing> | undefined
  const listing = (): Promise<CatalogListing> => (cached ??= listInstalledPlugins(context))

  const installed = async (packageName: string): Promise<CatalogPlugin | undefined> => (await listing()).plugins.find((entry) => entry.package === packageName)

  /** The target's plugin id: its validated manifest's name, never anything the request said. */
  const pluginID = async (packageName: string): Promise<string> => {
    const target = await installed(packageName)
    if (target === undefined) {
      throw new SourceError({ code: "UNAVAILABLE", what: `${packageName} is not installed`, next: "Read catalog.list to see the installed plugins, then ask for one of them." })
    }
    return target.manifest.plugin.name
  }

  const openSession: ReadHost["openSession"] = async ({ rules, title }) => {
    const session = await context.session.create({ agent, title, permissions: [...rules] })
    return {
      sessionID: session.id,
      async close() {
        await context.session.remove({ sessionID: session.id }).catch(() => undefined)
      },
    }
  }

  const call: ReadHost["call"] = async ({ package: packageName, method, sessionID, input, grant, consumer, signal }) => {
    const id = await pluginID(packageName)
    // One method's portable definition, enough for the client to name the RPC id and method. The schemas are the ones
    // OpenCode checks on the far side; this side only passes the envelope through.
    const definition = { id, methods: { [method]: { input: { type: "object" as const }, output: { type: "object" as const } } }, events: {} }
    const client = context.rpc(definition) as unknown as Record<string, MethodCall | undefined>
    const send = client[method]
    if (send === undefined) {
      throw new SourceError({ code: "UNAVAILABLE", what: `${id} has no RPC method ${method}`, next: "Check the installed plugin's manifest against the source it declares." })
    }
    return send(
      { sessionID, input, ...(grant === undefined ? {} : { grant }), ...(consumer === undefined ? {} : { consumer }) },
      signal === undefined ? undefined : { signal },
    )
  }

  const statuses = new Map<string, Promise<unknown>>()
  const status: NonNullable<ReadHost["status"]> = ({ package: packageName }) => {
    const cached = statuses.get(packageName)
    if (cached !== undefined) return cached
    const pending = (async () => {
      const id = await pluginID(packageName)
      const session = await openSession({ rules: statusRules(id), title: `catalog reads ${id}'s status` })
      try {
        return await call({ package: packageName, method: "status", sessionID: session.sessionID, input: {} })
      } finally {
        await session.close()
      }
    })()
    statuses.set(packageName, pending)
    return pending
  }

  return { listing, installed, openSession, call, status }
}
