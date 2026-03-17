import { execSync } from 'node:child_process';

const APPROVED_WARNINGS = [
  {
    code: 'UNSAFE_VAR_ASSIGNMENT',
    message: 'Unsafe assignment to innerHTML',
    filePattern: /^chunks\/webextension-namespace-.*\.js$/,
    line: 1,
    rationale: 'Bundled Preact runtime branch for dangerouslySetInnerHTML support moved into the shared UI/runtime chunk.',
  },
  {
    code: 'UNSAFE_VAR_ASSIGNMENT',
    message: 'Unsafe call to import for argument 0',
    filePattern: /^background\.js$/,
    line: 1,
    column: 1579,
    rationale: 'Background bootstrap dynamically imports the packaged content-script bundle on demand so Firefox tabs can receive extension page messages.',
  },
  {
    code: 'DANGEROUS_EVAL',
    message: 'The Function constructor is eval.',
    filePattern: /^background\.js$/,
    line: 2,
    rationale: 'Bundled Transformers/ONNX Runtime Web loader bootstrap.',
  },
  {
    code: 'UNSAFE_VAR_ASSIGNMENT',
    message: 'Unsafe call to import for argument 0',
    filePattern: /^background\.js$/,
    line: 9,
    column: 7769,
    rationale: 'Bundled Transformers/ONNX Runtime Web dynamic module loader.',
  },
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function runFirefoxLint() {
  const stdout = execSync(
    'npx web-ext lint --source-dir dist/firefox --output json',
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  return JSON.parse(stdout);
}

function matchesApprovedWarning(warning, approved) {
  return warning.code === approved.code
    && warning.message === approved.message
    && approved.filePattern.test(warning.file)
    && (approved.line === undefined || warning.line === approved.line)
    && (approved.column === undefined || warning.column === approved.column);
}

function main() {
  const report = runFirefoxLint();

  assert(report.summary.errors === 0, `Firefox lint reported ${report.summary.errors} errors`);
  assert(report.summary.notices === 0, `Firefox lint reported ${report.summary.notices} notices`);
  assert(
    report.warnings.length === APPROVED_WARNINGS.length,
    `Firefox lint warning baseline changed: expected ${APPROVED_WARNINGS.length}, got ${report.warnings.length}`,
  );

  for (const approved of APPROVED_WARNINGS) {
    const match = report.warnings.find((warning) => matchesApprovedWarning(warning, approved));
    assert(
      match,
      `Firefox lint warning baseline is missing expected warning: ${approved.code} ${approved.message}`,
    );
  }

  for (const warning of report.warnings) {
    const isApproved = APPROVED_WARNINGS.some((approved) => matchesApprovedWarning(warning, approved));
    assert(
      isApproved,
      `Firefox lint reported an unapproved warning: ${warning.code} ${warning.file}:${warning.line}:${warning.column} ${warning.message}`,
    );
  }

  console.log('Validated Firefox lint baseline:');
  for (const approved of APPROVED_WARNINGS) {
    console.log(`- ${approved.code} ${approved.message} (${approved.rationale})`);
  }
}

main();
