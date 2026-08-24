# @codapult/cli

CLI tool for managing [Codapult](https://codapult.dev) SaaS projects.

## Installation

This is the maintained CLI package used by Codapult projects. Buyers normally invoke the published package through `npx` or the generated MCP configuration; they do not clone or build this repository. The development and release sections below are for Codapult maintainers.

```shell
npm install -g @codapult/cli
```

Or run directly with npx:

```shell
npx @codapult/cli <command>
```

The command reference below uses the installed `codapult` binary. Project users who do not install the CLI globally should prefix commands with `npx @codapult/cli`, for example `npx @codapult/cli db schema-diff`.

## Commands

### Project

- `codapult setup` — interactive project setup wizard (or non-interactive with `--preset`)
- `codapult update [version]` — update from upstream Codapult releases
- `codapult doctor` — check project health and configuration (exit code 1 on failures for CI)
- `codapult config` — show current project configuration

### Plugins

- `codapult plugins add <name>` — install a plugin from a local directory or remote Git URL
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
- `codapult db schema-diff` — compare SQLite and PostgreSQL schema files
- `codapult db live-diff` — read-only compare active schema with the live database

### Environment

- `codapult env check` — validate .env.local against .env.example
- `codapult env sync` — add missing variables from .env.example

### Deployment

- `codapult deploy vercel` — build and deploy to Vercel
- `codapult deploy docker` — build Docker image
- `codapult deploy status` — check deploy readiness

### AI Integration

- `codapult mcp update [version]` — pin or update the MCP version in `.cursor/mcp.json`
- `codapult mcp doctor` — run shared project health checks plus validate `.cursor/mcp.json`
- `codapult mcp contract-check` — fail CI when `env-schema.ts` drifts from the MCP compatibility contract
- `codapult mcp-server` — start MCP server for AI assistant integration (Cursor, Claude, Codex)

Global options available on every command include `--help` and `--version`. Commands that read project configuration accept `--no-env-file` where applicable. Use `--dry-run` on commands that document it to preview a change without applying it.

Mutation commands (`db push`, `db generate`, `plugins add/remove`, env sync, and code generation) can change project files or databases. Use their dry-run options where available, review the returned plan, and keep them behind an explicit developer/CI step. Diagnostic commands (`doctor`, `env check`, `deploy status`, `mcp contract-check`, `db schema-diff`, and `db live-diff`) are read-only and return non-zero exit codes on failures, except type-only schema parity warnings.

## MCP Server

The CLI includes an MCP (Model Context Protocol) server with 29 tools, 8 resources, and 2 prompt templates for AI-assisted development. The following is the complete MCP surface exposed by the current CLI.

### MCP Tools

#### Project

| Tool                       | Description                                                                     |
| -------------------------- | ------------------------------------------------------------------------------- |
| `codapult_project_status`  | Report adapters, plugins, enabled features, and git status.                     |
| `codapult_project_config`  | Read the application configuration from `src/config/app.ts`.                    |
| `codapult_project_context` | Return a compact project overview for AI-assisted work.                         |
| `codapult_run_checks`      | Run lint, typecheck, and/or tests.                                              |
| `codapult_build`           | Run the production build.                                                       |
| `codapult_doctor`          | Check project files, TypeScript, environment, schema parity, and configuration. |

#### Database

| Tool                         | Description                                                              |
| ---------------------------- | ------------------------------------------------------------------------ |
| `codapult_db_get_tables`     | List database tables with column counts.                                 |
| `codapult_db_get_table_info` | Inspect columns, types, and constraints for a table.                     |
| `codapult_db_status`         | Report the database provider, table count, and migration status.         |
| `codapult_db_schema_diff`    | Compare the SQLite and PostgreSQL host schema files.                     |
| `codapult_db_migration_diff` | Preview pending SQL in a temporary migration directory.                  |
| `codapult_db_live_diff`      | Read-only comparison of the active source schema with the live database. |
| `codapult_db_generate`       | Generate a Drizzle migration.                                            |
| `codapult_db_push`           | Apply the source schema to the database.                                 |
| `codapult_db_seed`           | Run the project's database seed script.                                  |

#### Environment

| Tool                  | Description                                                                          |
| --------------------- | ------------------------------------------------------------------------------------ |
| `codapult_env_schema` | Read documented variables and descriptions from `.env.example`.                      |
| `codapult_env_read`   | Read and validate local environment values with secrets masked by default.           |
| `codapult_env_update` | Set one environment variable in the project env file.                                |
| `codapult_env_check`  | Validate local variables against `.env.example` and effective provider requirements. |
| `codapult_env_sync`   | Add missing variables from `.env.example` to the local env file.                     |

#### Plugins

| Tool                       | Description                                                    |
| -------------------------- | -------------------------------------------------------------- |
| `codapult_plugins_list`    | List installed plugins.                                        |
| `codapult_plugins_add`     | Install a plugin and patch its config and schema declarations. |
| `codapult_plugins_remove`  | Uninstall a plugin.                                            |
| `codapult_plugins_migrate` | Update a plugin schema and prepare a database migration.       |

#### Code Generation

| Tool                       | Description                                                         |
| -------------------------- | ------------------------------------------------------------------- |
| `codapult_generate_page`   | Generate a dashboard page with the project conventions.             |
| `codapult_generate_api`    | Generate an API route with auth, rate limiting, and Zod validation. |
| `codapult_generate_action` | Generate a server action with auth and validation.                  |
| `codapult_generate_plugin` | Scaffold a complete plugin repository.                              |

#### Deployment

| Tool                     | Description                                                     |
| ------------------------ | --------------------------------------------------------------- |
| `codapult_deploy_status` | Check Docker, Helm, Terraform, and Pulumi deployment readiness. |

Mutating MCP tools support `dry_run` where applicable. The tool returns the planned operations without writing project files, changing environment files, running migrations, or applying database changes. `codapult_env_read` masks sensitive values by default; `show_secrets: true` is optional and returns a security warning.

### MCP Resources

Resources are read-only project files or computed context that MCP clients can load automatically.

| Resource                | URI                            | Description                                                                       |
| ----------------------- | ------------------------------ | --------------------------------------------------------------------------------- |
| `codapult_schema`       | `codapult://schema`            | Active Drizzle schema selected by the database provider.                          |
| `codapult_app_config`   | `codapult://config/app`        | Application identity, brand, and company configuration.                           |
| `codapult_env_config`   | `codapult://config/env`        | Typed environment access, AI feature flags, providers, and checkout resolution.   |
| `codapult_agents_md`    | `codapult://agents`            | Project structure, conventions, and AI-agent rules from `AGENTS.md`.              |
| `codapult_env_example`  | `codapult://env-example`       | Environment variable template with descriptions and defaults.                     |
| `codapult_validation`   | `codapult://validation`        | Project Zod validation schemas.                                                   |
| `codapult_navigation`   | `codapult://config/navigation` | Dashboard and admin navigation configuration.                                     |
| `codapult_config_files` | `codapult://config/files`      | All non-test TypeScript files in `src/config`, including marketing configuration. |

### MCP Prompt Templates

| Prompt                   | Description                                                                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `codapult_code_review`   | Review code against Codapult API, adapter, TypeScript, React, security, and database conventions; includes current project context. |
| `codapult_schema_design` | Design matching SQLite and PostgreSQL Drizzle tables using the project's naming, key, timestamp, and relation conventions.          |

`codapult doctor` and MCP use the same health/report core. The regular command is project-focused; `codapult mcp doctor` additionally verifies that the editor configuration points to the Codapult MCP server. Doctor also checks parity between `src/lib/db/schema.ts` and `src/lib/db/schema-pg.ts`; missing tables/columns fail the check and incompatible provider types are warnings. Environment schema drift is detected by parsing `src/config/env-schema.ts` with the TypeScript AST.

The environment, deployment-readiness, doctor, and MCP contract commands expose structured checks internally and render them for the terminal. MCP clients receive the same data as JSON. This keeps CI exit codes and interactive output aligned.

Database live-diff checks only the active schema of the project: `src/lib/db/schema.ts` for Turso/SQLite or `src/lib/db/schema-pg.ts` for PostgreSQL. `plugins add` and `plugins migrate` keep both schema files in sync with the plugin manifest when PostgreSQL tables are provided. A live table that is absent from the active host schema is reported as `missing_in_schema`; review it as a legacy table or install/integrate the plugin before changing the database. The checker does not scan sibling plugin repositories or plugin source files.

## Development

```shell
pnpm install
pnpm dev          # watch mode — rebuild on changes
pnpm test         # run unit tests
pnpm lint         # lint
pnpm typecheck    # type-check without emitting
```

## Releasing

Releases are managed with [release-it](https://github.com/release-it/release-it). The workflow:

1. Run the release command on the `main` branch:

```shell
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

```shell
pnpm run release -- --dry-run
```

### Prerequisites

- npm [trusted publishing](https://docs.npmjs.com/trusted-publishers) must be configured for the `@codapult/cli` package on npmjs.com.
- Commit messages should follow [Conventional Commits](https://www.conventionalcommits.org/) for meaningful changelogs (e.g. `feat:`, `fix:`, `chore:`).

## License

MIT
