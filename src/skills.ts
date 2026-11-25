/**
 * The plugin's skills, registered at setup.
 *
 * The contract's `register` wires methods, not skills, so a plugin that ships `skills/*\/SKILL.md` must read them and
 * add them to OpenCode's skill editor itself: `ctx.skill.transform((editor) => editor.add({ id, name, description,
 * path, content }))`. Otherwise the files sit in the package and no agent ever sees them.
 *
 * Each directory under `skills/` is one skill. Its `SKILL.md` starts with `---` frontmatter carrying `name` (which must
 * equal the directory) and `description`; the body after the frontmatter is the content. A description is either a
 * quoted or plain one-line value, or a YAML block scalar (`>` folded, `|` literal, with `-`/`+` chomping), which is
 * read in full: a first-line-only reader answers `>` for a folded description, and an agent cannot see such a skill.
 * A missing, malformed or empty skill refuses setup rather than shipping a skill nothing registered.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { Skill, type Plugin } from "@opencode/plugin"

/** `skills/` at the package root, next to `dist/` (and next to `src/` in the repository). */
export const SKILLS_DIR = fileURLToPath(new URL("../skills/", import.meta.url))

/** One invalid skill, in the contract's `CODE: what happened. Next step: what to do.` form. */
const skillError = (name: string, problem: string): Error =>
  new Error(`OPTIONS_INVALID: The "${name}" skill was not loaded: skills/${name}/SKILL.md ${problem}. Next step: fix the skill's frontmatter or file.`)

/** A YAML block scalar's style and its chomping indicator. */
const BLOCK_SCALAR = /^([>|])([+-]?)$/

/** A plain or quoted scalar's value, without its quotes. */
function unquote(value: string): string {
  const trimmed = value.trim()
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) return trimmed.slice(1, -1)
  return trimmed
}

/**
 * A YAML block scalar's value: the body lines with their common indentation removed, folded for `>` or kept for `|`,
 * then chomped (`-` strips the final break, `+` keeps it, the default clips to one).
 */
function blockScalar(style: string, body: readonly string[]): string {
  const nonEmpty = body.find((line) => line.trim() !== "")
  const indent = nonEmpty === undefined ? 0 : (nonEmpty.match(/^\s*/)?.[0].length ?? 0)
  const lines = body.map((line) => line.slice(Math.min(indent, line.match(/^\s*/)?.[0].length ?? 0)))
  let text: string
  if (style.startsWith(">")) {
    const folded: string[] = []
    for (const line of lines) {
      if (line.trim() === "") {
        if (folded.length > 0) folded.push("")
        continue
      }
      if (folded.length === 0 || folded[folded.length - 1] === "") folded.push(line.trim())
      else folded[folded.length - 1] += ` ${line.trim()}`
    }
    text = folded.join("\n")
  } else {
    text = lines.join("\n")
  }
  text = text.replace(/\n+$/, "")
  return style.endsWith("-") ? text : `${text}\n`
}

/** The frontmatter fields and the body, or the error that names the file. */
function splitSkill(text: string): { readonly fields: Map<string, string>; readonly content: string } {
  const normalised = text.replace(/\r\n/g, "\n")
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(normalised)
  if (match === null) throw new Error("has no frontmatter")
  const lines = match[1]!.split("\n")
  const fields = new Map<string, string>()
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!
    if (line.trim() === "" || line.trimStart().startsWith("#") || /^\s/.test(line)) continue
    const at = line.indexOf(":")
    if (at <= 0) continue
    const key = line.slice(0, at).trim()
    const raw = line.slice(at + 1).trim()
    const block = BLOCK_SCALAR.exec(raw)
    if (block !== null) {
      const body: string[] = []
      let next = index + 1
      for (; next < lines.length; next += 1) {
        const candidate = lines[next]!
        if (candidate.trim() !== "" && !/^\s/.test(candidate)) break
        body.push(candidate)
      }
      fields.set(key, blockScalar(`${block[1] ?? ""}${block[2] ?? ""}`, body))
      index = next - 1
      continue
    }
    fields.set(key, unquote(raw))
  }
  return { fields, content: match[2]!.trim() }
}

/** Parse one `SKILL.md`: the frontmatter's `name` and `description`, then the body. */
export function parseSkill(name: string, path: string, text: string): Skill.Info {
  let split: ReturnType<typeof splitSkill>
  try {
    split = splitSkill(text)
  } catch (error) {
    throw skillError(name, error instanceof Error ? error.message : String(error))
  }
  if (split.fields.get("name") !== name) throw skillError(name, `must be named "${name}" in its frontmatter`)
  const description = split.fields.get("description")
  if (description === undefined || description.trim() === "") throw skillError(name, "has no description")
  if (split.content === "") throw skillError(name, "has no content")
  return {
    id: Skill.ID.make(name),
    name: Skill.Name.make(name),
    description,
    path: Skill.Info.fields.path.make(path),
    content: split.content,
  }
}

/** Every `skills/<name>/SKILL.md`, parsed; a broken file is a problem, never a silent skip. */
export function loadSkills(directory: string = SKILLS_DIR): { readonly skills: readonly Skill.Info[]; readonly problems: readonly string[] } {
  const skills: Skill.Info[] = []
  const problems: string[] = []
  let entries: string[]
  try {
    entries = readdirSync(directory).sort()
  } catch (error) {
    return { skills, problems: [`OPTIONS_INVALID: The skills directory could not be read (${String((error as { code?: unknown }).code ?? error)}). Next step: reinstall the plugin.`] }
  }
  for (const name of entries) {
    const path = join(directory, name, "SKILL.md")
    try {
      if (!statSync(path).isFile()) continue
      skills.push(parseSkill(name, path, readFileSync(path, "utf8")))
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error))
    }
  }
  return { skills, problems }
}

/** Add every parsed skill to OpenCode's skill editor; the registration disposes with the plugin. */
export function registerSkills(skill: Pick<Plugin.Context["skill"], "transform">, skills: readonly Skill.Info[]) {
  return skill.transform((editor) => {
    for (const info of skills) editor.add(info)
  })
}
