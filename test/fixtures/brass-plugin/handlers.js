// The Brass test target's handler table: status, a note read, the action's plan and its commit.
import { NO_ACCOUNTS, redactReason, STATUS_SCHEMA } from "../../dist/accounts.js"
import { unguardedAgents } from "../../dist/access.js"
import { COMMIT_INPUT, refusal, RegisterError } from "../../dist/register.js"

const PLUGIN = "brass"
const OBJECT = { type: "object", additionalProperties: true }
const EMPTY = { type: "object", properties: {}, additionalProperties: false }
const NOTE = {
  type: "object",
  properties: { text: { type: "string" } },
  required: ["text"],
  additionalProperties: false,
}

/** The target's handlers, over an in-memory note the commit writes. */
export function createHandlers({ manifest, version, state }) {
  const range = manifest.plugin.host.opencode
  const tested = manifest.plugin.host.tested

  return {
    status: {
      description: "Read Brass's state, its host range and its (empty) account list.",
      input: EMPTY,
      output: STATUS_SCHEMA,
      async run() {
        let unguarded = []
        let nextStep = null
        if (state.access !== undefined && state.agents !== undefined) {
          try {
            unguarded = [...unguardedAgents(await state.agents(), state.access.rules)]
          } catch (error) {
            nextStep = redactReason(error instanceof Error ? error.message : String(error)).slice(0, 200)
          }
        }
        return {
          name: PLUGIN,
          version,
          host: { version: state.hostVersion ?? tested[0], range, tested },
          state: nextStep === null ? "ready" : "error",
          accounts: [...NO_ACCOUNTS],
          unguardedAgents: unguarded,
          nextStep,
        }
      },
    },

    read_note: {
      description: "Read the note Brass last committed.",
      input: EMPTY,
      output: NOTE,
      async run() {
        const text = state.writes.at(-1)
        if (text === undefined) {
          throw new RegisterError(refusal("INPUT_INVALID", "Brass has no note yet", "Plan the note, then commit it."))
        }
        return { text }
      },
    },

    plan_note: {
      description: "Plan a note write: the preview carries the exact text the commit will write, and writes nothing.",
      input: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
        additionalProperties: false,
      },
      output: OBJECT,
      async run(input) {
        return {
          method: "save_note",
          output: { text: input.text },
          changes: ["Replace the Brass note."],
          trust: "untrusted",
        }
      },
    },

    save_note: {
      description: "Commit a planned note write.",
      input: COMMIT_INPUT,
      output: OBJECT,
      async run(_input, call) {
        const planned = call.plan?.output
        if (planned === undefined || typeof planned.text !== "string") {
          throw new RegisterError(refusal("PLAN_INVALID", "Brass holds no plan for this commit", "Plan the note again, then commit the new planId."))
        }
        state.writes.push(planned.text)
        return { trust: "untrusted", output: { text: planned.text } }
      },
    },
  }
}
