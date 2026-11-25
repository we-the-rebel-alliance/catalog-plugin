/**
 * The plugin's skills, registered at setup.
 *
 * The contract's `register` wires methods, not skills, so a plugin that ships `skills/*\/SKILL.md` must read them and
 * add them to OpenCode's skill editor itself: `ctx.skill.transform((editor) => editor.add({ id, name, description,
 * path, content }))`. Otherwise the files sit in the package and no agent ever sees them.
 *
 * Each directory under `skills/` is one skill. Its `SKILL.md` starts with `---` frontmatter carrying `name` (which must
 * equal the directory) and `description`; the body after the frontmatter is the content. A missing, malformed or empty
 * skill refuses setup rather than shipping a skill nothing registered.
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

/**
 * Parse one `SKILL.md`: `---` frontmatter with `name` and `description`, then the body. The name must be the directory
 * name, the description must be present, and the body must not be empty.
 */
export function parseSkill(name: string, path: string, text: string): Skill.Info {
  const normalised = text.replace(/\r\n/g, "\n")
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(normalised)
  if (match === null) throw skillError(name, "has no frontmatter")
  const fields = new Map(
    match[1]!
      .split("\n")
      .filter((line) => line.includes(":"))
      .map((line) => [line.slice(0, line.indexOf(":")).trim(), line.slice(line.indexOf(":") + 1).trim().replace(/^(["'])(.*)\1$/, "$2")]),
  )
  if (fields.get("name") !== name) throw skillError(name, `must be named "${name}" in its frontmatter`)
  const description = fields.get("description")
  if (description === undefined || description === "") throw skillError(name, "has no description")
  const content = match[2]!.trim()
  if (content === "") throw skillError(name, "has no content")
  return {
    id: Skill.ID.make(name),
    name: Skill.Name.make(name),
    description,
    path: Skill.Info.fields.path.make(path),
    content,
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
