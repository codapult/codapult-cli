# Security Policy

## Supported versions

Security fixes are applied to the latest published version of `@codapult/cli`. Update to the
latest version before reporting an issue.

## Reporting a vulnerability

Please do not open a public issue for an exploitable vulnerability. Use GitHub's private
vulnerability reporting for this repository, or contact the maintainers privately through the
security contact configured in the repository.

Include:

- the affected CLI version and Node.js version;
- the command, MCP tool, or input that triggers the issue;
- a minimal reproduction without secrets;
- the impact and any suggested mitigation.

Never include API keys, access tokens, passwords, private environment files, or customer data in a
report.

## Scope

The CLI can read project files, execute configured project commands, and perform explicitly
requested mutations such as database or deployment operations. Run it with the least-privileged
account and review mutating commands before use in automation.
