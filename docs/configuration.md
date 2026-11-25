# Configuration

The catalog has two options. It declares no account and no plugin-specific setting.

<!-- generated:configuration -->
| Option | Type | Default | Description |
|---|---|---|---|
| `access` | `all` \| `ask-changes` \| `read-only` | `"all"` | How much the plugin's methods may do. |
| `allowUntestedHost` | boolean | `false` | Start outside the tested OpenCode range. |
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
