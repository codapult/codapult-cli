const SAFE_NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

/**
 * Validate a user-provided name used in code generation (page, API route,
 * action, plugin). Rejects names that contain characters unsafe for
 * interpolation into file paths or TypeScript template strings.
 */
export function validateGeneratedName(name: string): void {
  if (!SAFE_NAME_REGEX.test(name)) {
    throw new Error(
      `Invalid name "${name}": must start with a letter and contain only letters, digits, hyphens, or underscores.`,
    );
  }
}
