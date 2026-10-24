import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const apiRoot = fileURLToPath(new URL('..', import.meta.url));
const repositoryRoot = resolve(apiRoot, '../..');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(path)
      : entry.name.endsWith('.ts') ? [path] : [];
  });
}

function importsOf(path: string): string[] {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest);
  const imports: string[] = [];
  function visit(node: ts.Node): void {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
        node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      imports.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return imports;
}

describe('Fronteira entre o desktop fiscal e a API', () => {
  it('mantém a API sem dependência dos pacotes fiscais ou de arquivos externos ao seu pacote', () => {
    const manifest = JSON.parse(readFileSync(join(apiRoot, 'package.json'), 'utf8'));
    const dependencies = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
    const violations: string[] = [];
    const isFiscalPackage = (name: string) => name.startsWith('@motor/') && name !== '@motor/payments';
    violations.push(...dependencies.filter(isFiscalPackage));
    for (const file of sourceFiles(join(apiRoot, 'src'))) {
      for (const specifier of importsOf(file)) {
        if (isFiscalPackage(specifier)) violations.push(`${relative(apiRoot, file)}: ${specifier}`);
        if (specifier.startsWith('.') && relative(apiRoot, resolve(dirname(file), specifier)).startsWith('..')) {
          violations.push(`${relative(apiRoot, file)}: ${specifier}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('mantém o desktop e os pacotes fiscais sem os adaptadores do servidor de pagamentos', () => {
    const directories = [join(repositoryRoot, 'apps/desktop'), ...readdirSync(join(repositoryRoot, 'packages'))
      .filter((name) => name !== 'payments')
      .map((name) => join(repositoryRoot, 'packages', name))];
    const violations = directories.flatMap((directory) => {
      const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
      return Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })
        .filter((name) => name === '@motor/api' || name === 'prisma' || name === 'pg' || name === 'stripe' ||
          name.startsWith('@prisma/') || name.startsWith('@nestjs/'))
        .map((name) => `${manifest.name}: ${name}`);
    });
    expect(violations).toEqual([]);
  });

  it('mantém o schema Prisma sem entidades e sem migrations na Atividade 08', () => {
    const schema = readFileSync(join(apiRoot, 'prisma/schema.prisma'), 'utf8');
    expect(schema).not.toMatch(/^\s*(model|view)\s+\w+/m);
    expect(existsSync(join(apiRoot, 'prisma/migrations'))).toBe(false);
  });
});
