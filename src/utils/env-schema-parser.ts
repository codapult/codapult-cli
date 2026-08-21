import ts from 'typescript';

function propertyName(node: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node))
    return node.text;
  return undefined;
}

/** Extract keys from the z.object({...}) assigned to envSchema, independent of formatting/chaining. */
export function extractEnvSchemaKeys(content: string): string[] {
  const sourceFile = ts.createSourceFile(
    'env-schema.ts',
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const keys: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'object'
    ) {
      const object = node.arguments[0];
      if (node.arguments.length > 0 && ts.isObjectLiteralExpression(object)) {
        for (const property of object.properties) {
          if (
            ts.isPropertyAssignment(property) ||
            ts.isMethodDeclaration(property) ||
            ts.isGetAccessorDeclaration(property)
          ) {
            const name = propertyName(property.name);
            if (name) keys.push(name);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...new Set(keys)];
}
