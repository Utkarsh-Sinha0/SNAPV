import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const NETWORK_PATTERNS = [
  { name: 'fetch(', regex: /\bfetch\s*\(/ },
  { name: 'XMLHttpRequest', regex: /\bXMLHttpRequest\b/ },
  { name: 'WebSocket.send', regex: /\.\s*send\s*\(/ },
];
const ALLOW_COMMENT = 'pixel-audit: allow-local-fetch';

function parseArgs(argv) {
  const options = {
    root: path.join(process.cwd(), 'src'),
  };

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--root' && argv[index + 1]) {
      options.root = path.resolve(argv[index + 1]);
      index += 1;
    }
  }

  return options;
}

function listSourceFiles(rootDir) {
  const files = [];
  for (const entry of readdirSync(rootDir)) {
    const fullPath = path.join(rootDir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...listSourceFiles(fullPath));
      continue;
    }

    if (/\.(ts|tsx)$/.test(entry)) {
      files.push(fullPath);
    }
  }

  return files;
}

function getFunctionName(node) {
  if ('name' in node && node.name && ts.isIdentifier(node.name)) {
    return node.name.text;
  }

  return '<anonymous>';
}

function sliceWithComments(sourceFile, node) {
  const ranges = ts.getLeadingCommentRanges(sourceFile.text, node.pos) ?? [];
  const start = ranges.length > 0 ? ranges[0].pos : node.pos;
  return sourceFile.text.slice(start, node.end);
}

function collectViolations(filePath) {
  const sourceText = readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const violations = [];

  function inspectFunction(node) {
    const functionText = sliceWithComments(sourceFile, node);
    const hasGuard = functionText.includes('assertNoPixelPayload(');

    for (const pattern of NETWORK_PATTERNS) {
      const localRegex = new RegExp(pattern.regex.source, 'g');
      let match = localRegex.exec(functionText);
      while (match) {
        const precedingText = functionText.slice(
          Math.max(0, match.index - 200),
          match.index,
        );
        const allowed = precedingText.includes(ALLOW_COMMENT);
        if (!hasGuard && !allowed) {
          const absoluteOffset = sliceWithComments(sourceFile, node).indexOf(match[0]) + node.pos;
          const position = sourceFile.getLineAndCharacterOfPosition(
            sourceText.indexOf(match[0], node.pos),
          );
          violations.push({
            filePath,
            line: position.line + 1,
            pattern: pattern.name,
            functionName: getFunctionName(node),
          });
        }

        match = localRegex.exec(functionText);
      }
    }
  }

  function visit(node) {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node)
    ) {
      inspectFunction(node);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const files = listSourceFiles(options.root);
  const violations = files.flatMap((filePath) => collectViolations(filePath));

  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(
        `${path.relative(process.cwd(), violation.filePath)}:${violation.line} ${violation.pattern} without assertNoPixelPayload in ${violation.functionName}`,
      );
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Pixel payload audit passed for ${files.length} source files.`);
}

main();
