/**
 * One broker request's target and account, checked before anything runs.
 *
 * `package`, `version` and `manifestHash` describe the source's manifest (contract §14, issue #8). The installed copy
 * decides: a request for another version or another manifest hash is refused, so a consumer never reads under a
 * declaration the person did not consent to. The target's id and manifest always come from the package on disk.
 *
 * The account alias is resolved against the target's own `status.accounts`, never a caller-supplied list. One account
 * may be omitted; several make it required; an unknown alias is refused. A plugin with no accounts has the one implicit
 * `default`.
 */
import { DEFAULT_ALIAS } from "@we-the-rebel-alliance/plugin-contract/accounts"
import type { CatalogPlugin } from "@we-the-rebel-alliance/plugin-contract/catalog"
import { refusal, RegisterError } from "@we-the-rebel-alliance/plugin-contract/register"
import { statusAliases, type ReadHost } from "@we-the-rebel-alliance/plugin-contract/read"
import { refuseFailure } from "../failure.ts"
import type { CallHost } from "./broker.ts"

/** The request's three references to the source's installed manifest. */
export interface TargetRef {
  readonly package: string
  readonly version: string
  readonly manifestHash: string
}

/** The installed target the request names, or why it cannot be served. */
export async function resolveTarget(host: CallHost, request: TargetRef): Promise<CatalogPlugin> {
  const target = await host.installed(request.package)
  if (target === undefined) {
    throw new RegisterError(refusal("UNAVAILABLE", `${request.package} is not installed`, "Read catalog.list to see the installed plugins, then ask for one of them."))
  }
  if (target.version !== request.version) {
    throw new RegisterError(
      refusal("PERMISSION_DENIED", `${request.package} is installed at ${target.version}, not ${request.version}`, "Read the installed manifest again and consent to the installed version."),
    )
  }
  if (target.hash !== request.manifestHash) {
    throw new RegisterError(
      refusal("PERMISSION_DENIED", `${request.package}'s installed manifest is not the one the person consented to`, "Review the installed plugin's manifest, then consent again."),
    )
  }
  return target
}

/** The account alias a brokered call runs as, resolved against the target's own status. */
export async function accountFor(host: ReadHost, target: CatalogPlugin, alias: string | undefined): Promise<string> {
  const aliases = await statusAliases(host, target)
  if (!aliases.ok) refuseFailure(aliases.failure)
  const known = aliases.value
  if (alias === undefined) {
    if (known.length > 1) {
      throw new RegisterError(
        refusal("ACCOUNT_REQUIRED", `${target.package} serves ${known.join(", ")}, and the request names none`, `Pass account as one of ${known.join(", ")}.`),
      )
    }
    return known[0] ?? DEFAULT_ALIAS
  }
  if (!known.includes(alias)) {
    throw new RegisterError(refusal("ACCOUNT_UNKNOWN", `${target.package} has no account ${alias}`, `Pass account as one of ${known.join(", ")}.`))
  }
  return alias
}
