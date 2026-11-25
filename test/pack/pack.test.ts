/**
 * The packed tarball installs and starts.
 *
 * `npm pack` produces exactly the files a tag installs. The test extracts it, makes a local Git package from those
 * files, installs it with the real `opencode plugin add` (OpenCode 2.4.1 accepts npm and Git specs; a local Git package
 * is the local-path form it supports), starts the real `opencode serve` from the installed CLI, and reads the server's
 * `/api/plugin` and `/api/skill`: the catalog must be active and its skill registered from the tarball's own `dist/`,
 * not from the repository. The CLI must be OpenCode 2.4.1 on `PATH`; CI installs it.
 */
import assert from "node:assert/strict"
import { execFileSync, spawn, type ChildProcess } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../..", import.meta.url))
const TIMEOUT_MS = 30_000

/** One CLI call with the isolated home, answering stdout. */
function cli(env: NodeJS.ProcessEnv, cwd: string, ...args: string[]): string {
  return execFileSync("opencode", args, { env, cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
}

/** A free loopback port for the test server. */
async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => resolve())
  })
  const address = server.address()
  assert.ok(address !== null && typeof address === "object", "the free port has an address")
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return address.port
}

/** Wait up to the timeout for `read` to answer a value. */
async function until<T>(read: () => T | undefined | Promise<T | undefined>, timeoutMs = TIMEOUT_MS): Promise<T | undefined> {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    const value = await read()
    if (value !== undefined) return value
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return undefined
}

/** Stop the server and wait for it to exit. */
async function stop(server: ChildProcess): Promise<void> {
  if (server.exitCode !== null || server.signalCode !== null) return
  server.kill("SIGTERM")
  const exited = await until(() => (server.exitCode !== null || server.signalCode !== null ? true : undefined), 10_000)
  if (exited === undefined) server.kill("SIGKILL")
}

test("the packed tarball installs with opencode plugin add and starts", async () => {
  const work = mkdtempSync(join(tmpdir(), "catalog-pack-"))
  const home = join(work, "home")
  const project = join(work, "project")
  const prepared = join(work, "package")
  mkdirSync(project, { recursive: true })
  mkdirSync(prepared, { recursive: true })
  const env = {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: join(home, "config"),
    XDG_CACHE_HOME: join(home, "cache"),
    XDG_DATA_HOME: join(home, "data"),
    XDG_STATE_HOME: join(home, "state"),
    NO_COLOR: "1",
  }
  let server: ChildProcess | undefined
  try {
    const packed = execFileSync("npm", ["pack", "--json", "--pack-destination", work], { cwd: root, encoding: "utf8" })
    const filename = (JSON.parse(packed) as { readonly filename?: unknown }[])[0]?.filename
    assert.equal(typeof filename, "string", "npm pack names its tarball")
    execFileSync("tar", ["-xzf", join(work, filename as string), "-C", prepared])

    const pkg = join(prepared, "package")
    const git = (...args: string[]) =>
      execFileSync("git", ["-c", "user.email=install@example.test", "-c", "user.name=Install", ...args], { cwd: pkg, encoding: "utf8" })
    git("init", "-q")
    git("add", "-A")
    git("commit", "-qm", "packed plugin")

    cli(env, work, "plugin", "add", `git+file://${pkg}`)
    const config = readFileSync(join(home, "config", "opencode", "opencode.json"), "utf8")
    assert.match(config, /git\+file:/, "the plugin add wrote the installed target")

    const port = await freePort()
    server = spawn("opencode", ["serve", "--hostname", "127.0.0.1", "--port", String(port)], {
      cwd: project,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let output = ""
    server.stdout?.setEncoding("utf8").on("data", (chunk: string) => (output += chunk))
    server.stderr?.setEncoding("utf8").on("data", (chunk: string) => (output += chunk))
    const listening = await until(() => (output.includes("server listening") ? true : undefined))
    assert.equal(listening, true, `opencode serve did not start: ${output}`)

    const url = `http://127.0.0.1:${port}`
    const list = async (): Promise<readonly { readonly id?: string; readonly state?: { readonly status?: string } }[]> => {
      try {
        const answer = JSON.parse(cli(env, project, "api", "GET", "/api/plugin", "--server", url)) as {
          readonly data?: readonly { readonly id?: string; readonly state?: { readonly status?: string } }[]
        }
        return answer.data ?? []
      } catch {
        return []
      }
    }
    const active = await until(async () => {
      const plugins = await list()
      return plugins.some((plugin) => plugin.id === "catalog" && plugin.state?.status === "active") ? plugins : undefined
    })
    assert.ok(active !== undefined, `the installed catalog did not become active: ${output}`)

    const skills = JSON.parse(cli(env, project, "api", "GET", "/api/skill", "--server", url)) as { readonly data?: readonly { readonly id?: string }[] }
    assert.ok(skills.data?.some((skill) => skill.id === "catalog") === true, "the installed bundle registered its skill")
  } finally {
    if (server !== undefined) await stop(server)
    rmSync(work, { recursive: true, force: true })
  }
})
