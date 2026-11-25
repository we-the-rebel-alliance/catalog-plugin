# Contract examples (test data)

These two directories are the `examples/integration` and `examples/tools` packages of
[plugin-contract](https://github.com/we-the-rebel-alliance/plugin-contract) at release `v0.0.0`
(`f7f0e011f6c036766e721ead9d4d902587e04c44`), copied for the host tests with one local, test-only fix.

They exist for one reason: the catalog's host tests install real package plugins into a temporary OpenCode cache and
prove `catalog.list`, `broker_read` and `rpc.catalog.changed` against them. The installed `plugin-contract` devDependency
ships only `dist`, `bin`, `LICENSE` and `README.md` (its `files` field), so the examples are not available from
`node_modules`; copying them here keeps the tests offline and deterministic.

- They are never imported by `src/`, never bundled into `dist/`, and never published (`files` excludes `test/`).
- They import `../../dist/<module>.js`, exactly as they do in the contract's own repository. The test harness lays the
  installed contract's `dist` beside each temporary generation so those imports resolve.
- When the contract pin moves, copy the same two directories from the new commit and re-apply the fix below.

## Local test-only fix

The v0.0.0 Harbour example resumes an `events_list` cursor without the `since` filter that shaped its first page, so a
page boundary can repeat an event (the contract's own `examples/integration/handlers.js` and `examples/mcp/handlers.js`
have the same bug). In this test copy only:

- `integration/handlers.js`: the cursor state carries `since`, and every cursor page re-applies it, so a filtered page
  keeps its window and no event is repeated or skipped.
- `integration/provider.js`: the work account gains one earlier note (`note-work-0`) so the since-plus-cursor page
  boundary test has a non-empty excluded prefix to reproduce the repeat.

`test/host/catalog.test.ts` pages the work source with `since` and `limit: 1` to the end and asserts every matching
event appears exactly once.

The Brass test target in `../brass-plugin/` is this repository's own: the contract's examples have no action, so the
action-broker tests need a target with a preview, a commit and the host-signed grant verified by its own register.
