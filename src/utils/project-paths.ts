/**
 * Paths owned by the Codapult template.
 *
 * Route groups are part of the template contract even though they do not
 * appear in public URLs. Keep generators and plugin manifests on the same
 * route layout as the template itself.
 */
export function dashboardPagePath(name: string): string {
  return `src/app/[locale]/(protected)/(dashboard)/dashboard/${name}/page.tsx`;
}

export function dashboardPageManifestPath(name: string): string {
  return dashboardPagePath(name);
}
