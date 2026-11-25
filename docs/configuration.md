# Configuration

The catalog has three options. It declares no account.

<!-- generated:configuration -->
| Option | Type | Default | Description |
|---|---|---|---|
| `access` | `all` \| `ask-changes` \| `read-only` | `"all"` | How much the plugin's methods may do. |
| `allowUntestedHost` | boolean | `false` | Start outside the tested OpenCode range. |
| `grants` | array | `[]` | The consumer grants this person consented to: one consumer, one source or action, one account, one scope and the installed manifest hash. |
<!-- /generated:configuration -->

## Examples

The defaults, in `opencode.json`:

```json
{
  "plugins": [
    { "package": "@we-the-rebel-alliance/catalog-plugin", "options": { "access": "all" } }
  ]
}
```

A person who wants every brokered write to ask, and no other change:

```json
{
  "plugins": [
    { "package": "@we-the-rebel-alliance/catalog-plugin", "options": { "access": "ask-changes" } }
  ]
}
```

A read-only catalog: `catalog.list`, `broker_read` and `broker_act` still run, and `broker_act_commit` is refused with
`PERMISSION_DENIED` before any target call.

`allowUntestedHost` starts the plugin on an OpenCode release outside `>=2.4.1 <2.5.0`. It does not make that release
tested, and status still reports the release it runs on.

`grants` is the person's consent: one entry per consumer and source or action. The `manifestHash` is the installed target's `sha256:…` value from `catalog.list`; a changed manifest changes the hash, so the person grants it again. A grant is read only from this configuration; a broker request can never supply or widen one.

```json
{
  "plugins": [
    {
      "package": "@we-the-rebel-alliance/catalog-plugin",
      "options": {
        "access": "all",
        "grants": [
          { "consumer": "notes", "source": "harbour.notes", "account": "work", "scope": { "spaces": ["space-research"] }, "manifestHash": "sha256:…" },
          { "consumer": "notes", "action": "brass.note", "account": "default", "manifestHash": "sha256:…" }
        ]
      }
    }
  ]
}
```
