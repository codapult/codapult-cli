# @codapult/cli

CLI tool for managing [Codapult](https://codapult.dev) SaaS projects.

## Installation

```bash
npm install -g @codapult/cli
```

Or run directly with npx:

```bash
npx @codapult/cli <command>
```

## Commands

### Project

- `codapult setup` — interactive project setup wizard (or non-interactive with `--preset`)
- `codapult update [version]` — update from upstream Codapult releases
- `codapult doctor` — check project health and configuration
- `codapult config` — show current project configuration

### Plugins

- `codapult plugins add <name>` — install a plugin from a local directory
- `codapult plugins remove <name>` — uninstall a plugin
- `codapult plugins migrate [name]` — update plugin schema and generate DB migration (`--push` for dev mode)
- `codapult plugins list` — list installed plugins

### Code Generation

- `codapult generate page <name>` — create a dashboard page
- `codapult generate api <name>` — create an API route (auth + rate limit + Zod)
- `codapult generate action <name>` — create a server action
- `codapult generate plugin <name>` — scaffold a new plugin repository

### Database

- `codapult db push` — apply schema to database
- `codapult db generate` — generate migration files
- `codapult db seed` — seed sample data
- `codapult db studio` — open Drizzle Studio
- `codapult db status` — show schema info and migration count

### Environment

- `codapult env check` — validate .env.local against .env.example
- `codapult env sync` — add missing variables from .env.example

### Deployment

- `codapult deploy vercel` — build and deploy to Vercel
- `codapult deploy docker` — build Docker image
- `codapult deploy status` — check deploy readiness

### AI Integration

- `codapult mcp-server` — start MCP server for AI assistant integration (Cursor, Claude, Codex)

## MCP Server

The CLI includes an MCP (Model Context Protocol) server with 19 tools, 6 resources, and 2 prompt templates for AI-assisted development. See the [MCP documentation](https://codapult.dev/docs/developer-tools/mcp) for details.

## Development

```bash
pnpm install
pnpm dev          # watch mode — rebuild on changes
pnpm test         # run unit tests
pnpm lint         # lint
pnpm typecheck    # type-check without emitting
```

## Releasing

Releases are managed with [release-it](https://github.com/release-it/release-it). The workflow:

1. Run the release command on the `main` branch:

```bash
pnpm run release          # interactive — prompts for version bump type
pnpm run release -- patch # non-interactive patch bump (0.1.0 → 0.1.1)
pnpm run release -- minor # minor bump (0.1.0 → 0.2.0)
pnpm run release -- major # major bump (0.1.0 → 1.0.0)
```

2. `release-it` will automatically:
   - Run pre-release checks (lint, typecheck, test)
   - Bump the version in `package.json`
   - Update `CHANGELOG.md` from [Conventional Commits](https://www.conventionalcommits.org/)
   - Commit the changes (`chore: release v<version>`)
   - Create a Git tag (`v<version>`)
   - Push the commit and tag to `origin`

3. The `v*` tag push triggers the **Publish** GitHub Actions workflow, which builds and publishes the package to npm.

### Dry run

Preview what a release would do without making any changes:

```bash
pnpm run release --dry-run
```

### Prerequisites

- **`GITHUB_TOKEN`** — required for creating GitHub Releases. Set it before running the release command:
  ```bash
  export GITHUB_TOKEN=$(gh auth token)
  ```
  Or add this line to your shell profile (`~/.bashrc`, `~/.zshrc`) to have it always available.
- **`NPM_TOKEN`** — GitHub repo secret, required for the publish workflow.
- Commit messages should follow [Conventional Commits](https://www.conventionalcommits.org/) for meaningful changelogs (e.g. `feat:`, `fix:`, `chore:`).

## License

MIT
