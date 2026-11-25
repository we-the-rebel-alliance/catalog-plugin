/**
 * The installed-set watcher behind `rpc.catalog.changed` (contract §10 and §14).
 *
 * OpenCode publishes `plugin.updated` whenever its plugin inventory changes. The catalog records the inventory's
 * signature, and on a change emits its `changed` nudge: `{ capability: "catalog.list", account: "default", reason:
 * "installed" }`. The nudge carries no content; an app re-reads `catalog.list` through the RPC door.
 *
 * The signature covers every plugin the host lists — package targets and versions, local paths, and a failed plugin's
 * error — so an install, an update, a removal and a load failure each count. The watcher is one subscription for the
 * plugin's lifetime; it is not a per-request hook.
 */
import type { Plugin } from "@opencode/plugin"
import type { Bus } from "@we-the-rebel-alliance/plugin-contract/bus"

/** What the watcher reads from the host: its plugin inventory and its event stream. */
export type WatchContext = Pick<Plugin.Context, "plugin" | "event">

/** One inventory entry as the signature reads it: identity, source and state, never content. */
function entryOf(plugin: Awaited<ReturnType<WatchContext["plugin"]["list"]>>["data"][number]): string {
  const source = plugin.source
  const target = source.type === "package" ? source.target : source.type === "local" ? source.path : ""
  const version = source.type === "package" ? (source.version ?? "") : ""
  const failure = plugin.state.status === "failed" ? plugin.state.error : ""
  return [plugin.id ?? "", source.type, target, version, plugin.state.status, failure].join("\u0000")
}

/** The inventory's signature: its entries, sorted so the host's order cannot fake a change. */
async function inventorySignature(context: Pick<WatchContext, "plugin">): Promise<string> {
  const listed = (await context.plugin.list()).data
  return JSON.stringify(listed.map(entryOf).sort())
}

/**
 * Watch the installed set and emit one `changed` per change. Returns the stop function; a closed host ends the stream
 * and the nudge is lost, which is what the contract expects: pull is the truth, push is only a nudge.
 */
export async function watchInstalledSet(options: { readonly context: WatchContext; readonly bus: Bus }): Promise<() => void> {
  const controller = new AbortController()
  const emit = async (): Promise<void> => {
    await options.bus.emit("changed", { capability: "catalog.list", account: "default", reason: "installed" })
  }
  let previous = await inventorySignature(options.context)
  const loop = async (): Promise<void> => {
    // A change between the baseline and the subscription is still reported, once.
    const atSubscription = await inventorySignature(options.context)
    if (atSubscription !== previous) {
      previous = atSubscription
      await emit()
    }
    for await (const event of options.context.event.subscribe({ types: ["plugin.updated"], signal: controller.signal })) {
      if (event.type !== "plugin.updated") continue
      const next = await inventorySignature(options.context)
      if (next === previous) continue
      previous = next
      await emit()
    }
  }
  void loop().catch(() => undefined)
  return () => controller.abort()
}
