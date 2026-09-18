# Contributing to `@codapult/cli`

Thanks for contributing. The repository contains the Codapult-specific CLI and MCP integration;
the universal architecture engine lives in [`@codapult/guard`](https://github.com/codapult/codapult-guard).

## Development

Requirements: Node.js `>=20.19` and pnpm `11`.

```bash
pnpm install
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Run `pnpm run release:check` before opening a release-related pull request. It runs the complete
validation and package dry-run used by CI.

## Pull requests

- Keep changes focused and explain the user-visible behavior.
- Add or update tests for changed commands, MCP tools, adapters, and parsers.
- Do not duplicate Guard implementation in this repository; change `@codapult/guard` and keep the
  CLI adapter thin.
- Do not commit `.env` files, credentials, generated `dist`, coverage, or local project state.
- Use Conventional Commit prefixes such as `feat:`, `fix:`, `docs:`, `test:`, and `chore:`.

## Release-sensitive changes

Changes to `package.json`, `pnpm-lock.yaml`, `.github/workflows/`, MCP contracts, or public command
behavior need an explicit note in the pull request. Published versions are immutable, so verify
the package with `npm pack --dry-run` before release.

## License

By contributing, you agree that your contribution is provided under the repository's [MIT
License](LICENSE).
