# Automations

The catalog has no events source, so it has no timer recipe of its own and no cursor an app must keep. A brokered read
belongs to the app's own cadence: it calls `broker_read` with the target source's cursor, exactly as it would read the
target plugin embedded.

The one nudge the catalog sends is `rpc.catalog.changed`, emitted when the installed set changes. An automation that
watches the installed set subscribes to that event, then re-reads `catalog.list`; the event carries no manifest and no
content. A missed nudge costs one re-read, never data.
