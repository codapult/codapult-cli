# Changelog

## [0.5.0](https://github.com/codapult/codapult-cli/compare/v0.4.2...v0.5.0) (2026-04-23)

### Features

* add runtime env source support to CLI ([3ea445a](https://github.com/codapult/codapult-cli/commit/3ea445acb703c2feeb70c82dbe87106c7712a9f7))

## [0.4.2](https://github.com/codapult/codapult-cli/compare/v0.4.1...v0.4.2) (2026-04-21)

## [0.4.1](https://github.com/codapult/codapult-cli/compare/v0.4.0...v0.4.1) (2026-04-21)

### Bug Fixes

* remove extra newline symbol from barrel ([1c052ef](https://github.com/codapult/codapult-cli/commit/1c052efb4b537d1bb389f58bacf0afc33114b5e8))

## [0.4.0](///compare/v0.3.0...v0.4.0) (2026-04-20)

### Features

* **cli:** add enablePlugins to setup wizard and ENABLE_PLUGINS mapping b65ce0a

## [0.3.0](///compare/v0.2.0...v0.3.0) (2026-04-17)

### Features

* **plugins:** detect and back up page conflicts on install 9ed8c13

## [0.2.0](///compare/v0.1.4...v0.2.0) (2026-04-16)

### Features

* **plugins:** add --ci flag to `plugins add` for Vercel/CI builds 97d8627

## [0.1.4](///compare/v0.1.3...v0.1.4) (2026-04-16)

## [0.1.3](///compare/v0.1.2...v0.1.3) (2026-04-16)

## [0.1.2](///compare/v0.1.1...v0.1.2) (2026-04-16)

## 0.1.1 (2026-04-16)

### Features

* **cli:** add generate, db, env, and deploy commands a9b9ea2
* **cli:** add MCP server for AI assistant integration 415e25e
* initial launchkit-cli release 137e94c
* **mcp:** add resources, context-aware prompts, auto-generate mcp.json 8950efd
* **plugins:** add `plugins migrate` command for schema updates 4ce3219
* **plugins:** add git clone utility and manifest validation improvements 667c227
* **plugins:** add plugins add/remove/list commands 0268ffd
* **setup:** add --preset flag for non-interactive builds e06c0f4
* **setup:** add feature toggle env vars and changelog to CLI presets 86e7d0e

### Bug Fixes

* **deps:** align @js-toolkit/eslint-config and @types/node with codapult 59437a3
* fix UPSTREAM_URL ec1ec56
* **plugins:** prevent duplicate transpilePackages and dbReExports 5edb529
* **plugins:** skip confirm prompt when stdin is not a TTY 7c48937
* resolve type errors from lint auto-fixes ae445d5
* **security:** mask secrets in MCP, prevent injection, path traversal ba41ecc
* **setup:** disable changelog in marketing preset 7337abf
* **setup:** update FeatureBoard path after component relocation 9ed538f
