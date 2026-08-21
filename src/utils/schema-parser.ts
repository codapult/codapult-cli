import ts from 'typescript';

export interface ParsedColumn {
  name: string;
  databaseName: string;
  type: string;
  constraints: string[];
}

export interface ParsedTable {
  name: string;
  columns: ParsedColumn[];
}

function nodeName(node: ts.PropertyName | ts.BindingName): string | undefined {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) {
    return node.text;
  }
  return undefined;
}

function callName(expression: ts.Expression): string | undefined {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return undefined;
}

function baseFactoryName(expression: ts.Expression): string | undefined {
  let current: ts.Expression = expression;
  while (ts.isPropertyAccessExpression(current) || ts.isCallExpression(current)) {
    current = ts.isPropertyAccessExpression(current) ? current.expression : current.expression;
  }
  return ts.isIdentifier(current) ? current.text : undefined;
}

function baseFactoryCall(expression: ts.Expression): ts.CallExpression | undefined {
  if (ts.isCallExpression(expression)) {
    const name = callName(expression.expression);
    const columnFactories = new Set([
      'text',
      'integer',
      'real',
      'blob',
      'boolean',
      'timestamp',
      'serial',
      'bigint',
      'varchar',
      'char',
      'uuid',
      'json',
      'jsonb',
      'numeric',
      'decimal',
      'date',
      'time',
      'vector',
    ]);
    if (name && columnFactories.has(name)) {
      return expression;
    }
    return baseFactoryCall(expression.expression);
  }
  if (ts.isPropertyAccessExpression(expression)) return baseFactoryCall(expression.expression);
  return undefined;
}

function stringArgument(call: ts.CallExpression): string | undefined {
  if (call.arguments.length === 0) return undefined;
  const first = call.arguments[0];
  return ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first)
    ? first.text
    : undefined;
}

function columnConstraints(initializer: ts.Expression): string[] {
  const constraints = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node)) {
      const name = node.name.text;
      if (name === 'primaryKey') constraints.add('PRIMARY KEY');
      if (name === 'notNull') constraints.add('NOT NULL');
      if (name === 'unique') constraints.add('UNIQUE');
      if (name === 'references') constraints.add('FK');
      if (name === '$defaultFn' || name === '$default') constraints.add('DEFAULT');
    }
    ts.forEachChild(node, visit);
  };
  visit(initializer);
  return [...constraints];
}

function parseTable(statement: ts.VariableStatement): ParsedTable | undefined {
  for (const declaration of statement.declarationList.declarations) {
    const initializer = declaration.initializer;
    if (!initializer || !ts.isCallExpression(initializer)) continue;
    const factory = callName(initializer.expression);
    if (factory !== 'sqliteTable' && factory !== 'pgTable') continue;

    const name = stringArgument(initializer);
    const columnsArgument = initializer.arguments[1];
    if (!name || initializer.arguments.length < 2 || !ts.isObjectLiteralExpression(columnsArgument))
      continue;

    const columns: ParsedColumn[] = [];
    for (const property of columnsArgument.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      const columnName = nodeName(property.name);
      const value = property.initializer;
      if (!columnName || !ts.isCallExpression(value)) continue;

      const type = baseFactoryName(value.expression);
      if (!type) continue;
      const databaseName = stringArgument(baseFactoryCall(value) ?? value) ?? columnName;
      const constraints = columnConstraints(value);
      const order = ['PRIMARY KEY', 'NOT NULL', 'UNIQUE', 'FK', 'DEFAULT'];
      constraints.sort((a, b) => order.indexOf(a) - order.indexOf(b));
      columns.push({ name: columnName, databaseName, type, constraints });
    }

    return { name, columns };
  }
  return undefined;
}

/** Parse Drizzle sqliteTable/pgTable declarations without relying on formatting. */
export function parseDatabaseSchema(content: string, fileName = 'schema.ts'): ParsedTable[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const tables: ParsedTable[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isVariableStatement(node)) {
      const table = parseTable(node);
      if (table) tables.push(table);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return tables;
}
