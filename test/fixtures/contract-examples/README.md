# Contract examples (test data)

These two directories are the `examples/integration` and `examples/tools` packages of
[plugin-contract](https://github.com/we-the-rebel-alliance/plugin-contract) at commit
`0833f61a5ddc7a4583b360145cc8e9cd8cf989f2`, copied verbatim.

They exist for one reason: the catalog's host tests install real package plugins into a temporary OpenCode cache and
prove `catalog.list`, `broker_read` and `rpc.catalog.changed` against them. The installed `plugin-contract` devDependency
ships only `dist`, `bin`, `LICENSE` and `README.md` (its `files` field), so the examples are not available from
`node_modules`; copying them here keeps the tests offline and deterministic.

- They are never imported by `src/`, never bundled into `dist/`, and never published (`files` excludes `test/`).
- They import `../../dist/<module>.js`, exactly as they do in the contract's own repository. The test harness lays the
  installed contract's `dist` beside each temporary generation so those imports resolve.
- Do not edit them. When the contract pin moves, copy the same two directories from the new commit.

The Brass test target in `../brass-plugin/` is this repository's own: the contract's examples have no action, so the
action-broker tests need a target with a preview, a commit and the host-signed grant verified by its own register.
