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

## License

MIT
