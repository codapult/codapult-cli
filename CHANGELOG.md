# Changelog

## [0.20.0](https://github.com/codapult/codapult-cli/compare/v0.19.2...v0.20.0) (2026-09-25)

### Features

* add promotions feature to FEATURE_ENV ([37c9777](https://github.com/codapult/codapult-cli/commit/37c9777c255c9af01dd9374f16e46bf6c1dfa220))

## [0.19.2](https://github.com/codapult/codapult-cli/compare/v0.19.1...v0.19.2) (2026-09-23)

### Bug Fixes

* harden cli command and plugin inputs ([6d7690a](https://github.com/codapult/codapult-cli/commit/6d7690a548fb269e91631738b3b5caba3987816c))

## [0.19.1](https://github.com/codapult/codapult-cli/compare/v0.19.0...v0.19.1) (2026-09-18)

### Bug Fixes

* **ci:** update CI workflow to use Node.js version 24 only and enhance release process with provenance flag ([6d9deac](https://github.com/codapult/codapult-cli/commit/6d9deac68ee5f684122133b22563b83dbfeff9c9))

## [0.19.0](https://github.com/codapult/codapult-cli/compare/v0.18.1...v0.19.0) (2026-09-18)

### Features

* add contributing and security policy documentation ([4a615de](https://github.com/codapult/codapult-cli/commit/4a615de0aa5b521be1c769d2865c0b4fe08e5490))
* add dependabot configuration for automated dependency updates ([68fe5c6](https://github.com/codapult/codapult-cli/commit/68fe5c61b204b27f36f8decff26806aa787632b4))
* implement CI release workflow and clean distribution directory ([3b93411](https://github.com/codapult/codapult-cli/commit/3b93411c33572cef94b335f5160689386fba978f))
* update README with additional usage details and installation instructions ([11aea78](https://github.com/codapult/codapult-cli/commit/11aea78ade58e7797eb19a3a3023bffb6abf7e59))

## [0.18.1](https://github.com/codapult/codapult-cli/compare/v0.18.0...v0.18.1) (2026-09-18)

### Bug Fixes

* remove --provenance flag from npm publish command ([e16e2a7](https://github.com/codapult/codapult-cli/commit/e16e2a7e8c046006b6af450db698486504efdf98))

## [0.18.0](https://github.com/codapult/codapult-cli/compare/v0.17.2...v0.18.0) (2026-09-18)

### Features

* enhance publish workflow with package verification and provenance flag ([f5266aa](https://github.com/codapult/codapult-cli/commit/f5266aa14c8d4b2a49f4a24553940545d9fb992e))
* integrate @codapult/guard for architecture protection commands ([6c9a0d6](https://github.com/codapult/codapult-cli/commit/6c9a0d6e0adc2b7c43da4bd7d9236bd9e93b9f86))

### Bug Fixes

* ensure test exclusions include dist and node_modules directories ([e8b9c2f](https://github.com/codapult/codapult-cli/commit/e8b9c2f3086ba292e1d4e00d01dd4a3e2a2667a0))

## [0.17.2](https://github.com/codapult/codapult-cli/compare/v0.17.1...v0.17.2) (2026-09-14)

### Bug Fixes

* **cli:** update version retrieval to use package.json dynamically ([c7ad3fa](https://github.com/codapult/codapult-cli/commit/c7ad3fa58a3bb39e7bae23ce546efe71a14754c1))

## [0.17.1](https://github.com/codapult/codapult-cli/compare/v0.17.0...v0.17.1) (2026-08-26)

### Bug Fixes

* **setup:** add AI Chat and RAG pipeline options to project configuration ([283e4b4](https://github.com/codapult/codapult-cli/commit/283e4b460ece593ea5e3cb2a935ad02f9a2c8500))
* **setup:** update module removals and prune marker files ([a25868c](https://github.com/codapult/codapult-cli/commit/a25868c7802b20da26051fe5ca081d3b5f747184))

## [0.17.0](https://github.com/codapult/codapult-cli/compare/v0.16.2...v0.17.0) (2026-08-26)

### Features

* **cli:** update AI configuration and MCP integration ([4c5f968](https://github.com/codapult/codapult-cli/commit/4c5f968b647dbc61b5faf466fe887a723d515401))

## [0.16.2](https://github.com/codapult/codapult-cli/compare/v0.16.1...v0.16.2) (2026-08-22)

### Bug Fixes

* improve type safety and simplify environment variable checks ([4cc83c3](https://github.com/codapult/codapult-cli/commit/4cc83c390aa0f1235fa642aca939eb16c002df59))

## [0.16.1](https://github.com/codapult/codapult-cli/compare/v0.16.0...v0.16.1) (2026-08-21)

### Bug Fixes

* enhance error message format in project health checks ([bc3724b](https://github.com/codapult/codapult-cli/commit/bc3724b8c839cf89ba6efb3e1a6d8257afcb860a))

## [0.16.0](https://github.com/codapult/codapult-cli/compare/v0.15.3...v0.16.0) (2026-08-21)

### Features

* expand CLI and MCP project tooling ([1be5700](https://github.com/codapult/codapult-cli/commit/1be57007041b36badb5c145d2be0db7a7353b437))

## [0.15.3](https://github.com/codapult/codapult-cli/compare/v0.15.2...v0.15.3) (2026-08-20)

### Bug Fixes

* update paths for plugin removals and clarify plugin marketplace prompt ([6a2b7df](https://github.com/codapult/codapult-cli/commit/6a2b7dfeb697d62fae6c57cfcf8128cf21486b8d))

## [0.15.2](https://github.com/codapult/codapult-cli/compare/v0.15.1...v0.15.2) (2026-08-19)

### Bug Fixes

* ensure barrel file exports an empty object when no imports are present ([dd5596a](https://github.com/codapult/codapult-cli/commit/dd5596a42fe588abe7cfa1e53cb42195533be8bb))
* update comment for marketing preset in setup configuration ([3fcf5eb](https://github.com/codapult/codapult-cli/commit/3fcf5eba22388b64f20eb67f3205da2ef754501e))

## [0.15.1](https://github.com/codapult/codapult-cli/compare/v0.15.0...v0.15.1) (2026-08-17)

### Bug Fixes

* correct variable names in environment configuration description ([1b845a6](https://github.com/codapult/codapult-cli/commit/1b845a6be4bd3b52b107524b790c10e346e2a7d2))

## [0.15.0](https://github.com/codapult/codapult-cli/compare/v0.14.5...v0.15.0) (2026-08-12)

### Features

* add support for SSO and update payment/job providers in project configuration ([c26ca88](https://github.com/codapult/codapult-cli/commit/c26ca88cf88d106f2c2b90eb5019a97d5aa1bce9))

## [0.14.5](https://github.com/codapult/codapult-cli/compare/v0.14.4...v0.14.5) (2026-08-08)

### Bug Fixes

* sync with main project ([4de4661](https://github.com/codapult/codapult-cli/commit/4de4661e7cdeccde8116a3abf424796e0ab3bc4e))

## [0.14.4](https://github.com/codapult/codapult-cli/compare/v0.14.3...v0.14.4) (2026-08-07)

## [0.14.3](https://github.com/codapult/codapult-cli/compare/v0.14.2...v0.14.3) (2026-07-26)

### Bug Fixes

* update removable paths (enableRAG) ([558b07f](https://github.com/codapult/codapult-cli/commit/558b07f4a6d2eeb0fff2f9b30e1e34db6582e2f1))

## [0.14.2](https://github.com/codapult/codapult-cli/compare/v0.14.1...v0.14.2) (2026-07-25)

### Bug Fixes

* update MODULE_REMOVALS paths ([5ac47ea](https://github.com/codapult/codapult-cli/commit/5ac47eabe007a5d1933a9b2dfaaf07efeeebaca2))

## [0.14.1](https://github.com/codapult/codapult-cli/compare/v0.14.0...v0.14.1) (2026-07-22)

### Bug Fixes

* update module removal paths for branding and custom domain components ([4979827](https://github.com/codapult/codapult-cli/commit/4979827c17385c25c9bf2cf54a61af5efc1702a3))

## [0.14.0](https://github.com/codapult/codapult-cli/compare/v0.13.0...v0.14.0) (2026-07-19)

### Features

* update module removal paths and improve null checks in tests ([0e9a80c](https://github.com/codapult/codapult-cli/commit/0e9a80cc8182e720d5491d29d597802b542e20e9))

### Bug Fixes

* replace null with undefined in project-related mocks ([96e3235](https://github.com/codapult/codapult-cli/commit/96e32354d302da8b25c6ae795edb4c14ed3a52f5))
* update module removals paths ([6f76888](https://github.com/codapult/codapult-cli/commit/6f76888ba2aa4bbfdd2e79ec2e10af3193e644fc))

## [0.13.0](https://github.com/codapult/codapult-cli/compare/v0.12.1...v0.13.0) (2026-07-04)

### Features

* add mcp resource for env config ([4383e7b](https://github.com/codapult/codapult-cli/commit/4383e7bc99d465118cc422b59d6bedd0aa6ba70f))

## [0.12.1](https://github.com/codapult/codapult-cli/compare/v0.12.0...v0.12.1) (2026-07-03)

### Bug Fixes

* update configuration references from src/config/app.ts to src/lib/config.ts ([71b0f4a](https://github.com/codapult/codapult-cli/commit/71b0f4a4add895ace17cb3dd103507ee55605321))

## [0.12.0](https://github.com/codapult/codapult-cli/compare/v0.11.0...v0.12.0) (2026-07-02)

### Features

* add replace block on pruning ([a5ac8fd](https://github.com/codapult/codapult-cli/commit/a5ac8fd67c3956d757ac9ef6a63d136b5e3ede39))

### Bug Fixes

* improve removing and pruning modules ([e60f9d0](https://github.com/codapult/codapult-cli/commit/e60f9d05438a039d947cd097a3db165f6976203e))

## [0.11.0](https://github.com/codapult/codapult-cli/compare/v0.10.3...v0.11.0) (2026-07-01)

### Features

* add total removed info ([5292dc8](https://github.com/codapult/codapult-cli/commit/5292dc83e4a4d537eb2a388fd09e74e29e26aa81))

## [0.10.3](https://github.com/codapult/codapult-cli/compare/v0.10.2...v0.10.3) (2026-07-01)

### Bug Fixes

* emty lines ([175831a](https://github.com/codapult/codapult-cli/commit/175831a8db2671ef4b740700a36b193f4303f124))

## [0.10.2](https://github.com/codapult/codapult-cli/compare/v0.10.1...v0.10.2) (2026-07-01)

### Bug Fixes

* output line formating ([90d0a5f](https://github.com/codapult/codapult-cli/commit/90d0a5f4c0a25b37e27f06e1d836a2f4b7ba50a9))

## [0.10.1](https://github.com/codapult/codapult-cli/compare/v0.10.0...v0.10.1) (2026-07-01)

## [0.10.0](https://github.com/codapult/codapult-cli/compare/v0.9.5...v0.10.0) (2026-06-30)

### Features

* add enableCompare prompt and fix removeUnusedCode prompt ([02d78d9](https://github.com/codapult/codapult-cli/commit/02d78d977ad803d32bb441f98048cf38b6841d5b))

## [0.9.5](https://github.com/codapult/codapult-cli/compare/v0.9.4...v0.9.5) (2026-06-17)

### Bug Fixes

* remove NEXT_PUBLIC_ANALYTICS_ENABLED ([c6e03bc](https://github.com/codapult/codapult-cli/commit/c6e03bcdedd96e5f49111b2d436e12d8bf8e2682))

## [0.9.4](https://github.com/codapult/codapult-cli/compare/v0.9.3...v0.9.4) (2026-06-11)

### Bug Fixes

* remove obsolete /vs path ([827ff34](https://github.com/codapult/codapult-cli/commit/827ff349651c8d867fe218e348888745aa50b1e6))

## [0.9.3](https://github.com/codapult/codapult-cli/compare/v0.9.2...v0.9.3) (2026-06-02)

## [0.9.2](https://github.com/codapult/codapult-cli/compare/v0.9.1...v0.9.2) (2026-05-28)

### Bug Fixes

* update PRUNE_MARKER_FILES and update module label ([263f658](https://github.com/codapult/codapult-cli/commit/263f6580129e159303139034ca08b75e9d6dadfa))

## [0.9.1](https://github.com/codapult/codapult-cli/compare/v0.9.0...v0.9.1) (2026-05-28)

### Bug Fixes

* add process.exit after action completed ([3000666](https://github.com/codapult/codapult-cli/commit/300066634eea55884b135fdb59de9289d59f4893))

## [0.9.0](https://github.com/codapult/codapult-cli/compare/v0.8.4...v0.9.0) (2026-05-28)

### Features

* add compare feature toggle to project configuration ([5eff1e8](https://github.com/codapult/codapult-cli/commit/5eff1e816032a62eb465f8a1cf6efd4a014c11ab))

## [0.8.4](https://github.com/codapult/codapult-cli/compare/v0.8.3...v0.8.4) (2026-05-28)

### Bug Fixes

* enable blog in built-in presets ([4a92486](https://github.com/codapult/codapult-cli/commit/4a92486fc019189dcf2811ea6b0707193898f13c))

## [0.8.3](https://github.com/codapult/codapult-cli/compare/v0.8.2...v0.8.3) (2026-05-23)

### Bug Fixes

* update removable paths ([41da17c](https://github.com/codapult/codapult-cli/commit/41da17c1df4af03350c87f0dfab8903fc0d07aeb))

## [0.8.2](https://github.com/codapult/codapult-cli/compare/v0.8.1...v0.8.2) (2026-05-15)

### Bug Fixes

* update removable paths ([6169e6e](https://github.com/codapult/codapult-cli/commit/6169e6e1811d73ab63bbc091f4ee0eb8d78a1618))

## [0.8.1](https://github.com/codapult/codapult-cli/compare/v0.8.0...v0.8.1) (2026-05-14)

### Bug Fixes

* update removable paths ([e632409](https://github.com/codapult/codapult-cli/commit/e6324093343faf77809c5f13503f2fddbaab7ff5))

## [0.8.0](https://github.com/codapult/codapult-cli/compare/v0.7.2...v0.8.0) (2026-04-26)

### Features

* add --clean option to remove plugin cache dir ([155502b](https://github.com/codapult/codapult-cli/commit/155502bab84e6eace9c09e00e1c3291e58d3b643))

## [0.7.2](https://github.com/codapult/codapult-cli/compare/v0.7.1...v0.7.2) (2026-04-26)

### Bug Fixes

* remove obsolete message ([43911f5](https://github.com/codapult/codapult-cli/commit/43911f5d455fcc3586c0faa6696fa2381aec4ed1))

## [0.7.1](https://github.com/codapult/codapult-cli/compare/v0.7.0...v0.7.1) (2026-04-24)

### Bug Fixes

* add install deps step in ci mode; fix resolve manifest ([10c682c](https://github.com/codapult/codapult-cli/commit/10c682cfa23c5c56214290692b955a3ecc1ff78c))

## [0.7.0](https://github.com/codapult/codapult-cli/compare/v0.6.1...v0.7.0) (2026-04-24)

### Features

* add pruning blocks in files on remove feature ([e98ac79](https://github.com/codapult/codapult-cli/commit/e98ac7979c34b319751220eaee916c36fc9b17ed))

## [0.6.1](https://github.com/codapult/codapult-cli/compare/v0.6.0...v0.6.1) (2026-04-24)

### Bug Fixes

* update removable paths ([4fdeb02](https://github.com/codapult/codapult-cli/commit/4fdeb022ade6edb295016cb0c68a4ba8972a9dc4))

## [0.6.0](https://github.com/codapult/codapult-cli/compare/v0.5.0...v0.6.0) (2026-04-23)

### Features

* add explicit env source support to MCP tools ([d5078c0](https://github.com/codapult/codapult-cli/commit/d5078c0ab1e91a525b5f026e7aecc1ea508802f6))

### Bug Fixes

* --no-env-file option ([a8d1dc8](https://github.com/codapult/codapult-cli/commit/a8d1dc8ff57aef4f5d4316b00cf26d42078bf48d))

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
