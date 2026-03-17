import { execSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const browser = process.env.TARGET_BROWSER ?? 'chrome';
const nestedDirCandidates = browser === 'firefox'
  ? ['firefox-mv2']
  : [`${browser}-mv3`, 'chrome-mv3'];
const packageJson = JSON.parse(
  readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
);
const version = packageJson.version;
const normalizedDistDir = join(process.cwd(), 'dist', browser);
const UNUSED_WASM_ARTIFACTS = [
  join(normalizedDistDir, 'assets', 'ml', 'wasm', 'ort-wasm-simd-threaded.jsep.mjs'),
  join(normalizedDistDir, 'assets', 'ml', 'wasm', 'ort-wasm-simd-threaded.jsep.wasm'),
];

const TRANSIENT_WXT_ERROR_PATTERNS = [
  /ENOENT: no such file or directory, lstat/i,
  /ENOENT: no such file or directory, rename/i,
];

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isTransientWxtError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return TRANSIENT_WXT_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

function runWxtZipWithRetry(command, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      execSync(command, {
        cwd: process.cwd(),
        env: process.env,
        shell: true,
        stdio: 'inherit',
      });
      return;
    } catch (error) {
      if (!isTransientWxtError(error) || attempt === attempts) {
        throw error;
      }

      const retryDelayMs = attempt * 750;
      console.warn(
        `Transient WXT zip failure detected (${attempt}/${attempts}). Retrying in ${retryDelayMs}ms...`,
      );
      sleep(retryDelayMs);
    }
  }
}

rmSync(normalizedDistDir, { force: true, recursive: true });

execSync('node scripts/sync-browser-shells.mjs', {
  cwd: process.cwd(),
  env: process.env,
  shell: true,
  stdio: 'inherit',
});

runWxtZipWithRetry(`npx wxt zip -b ${browser}`);

const nestedDistDir = nestedDirCandidates
  .map((dirName) => join(normalizedDistDir, dirName))
  .find((candidate) => existsSync(candidate));

if (!nestedDistDir) {
  throw new Error(
    `Expected build output at one of: ${nestedDirCandidates.map((dirName) => join(normalizedDistDir, dirName)).join(', ')}`,
  );
}

for (const entry of readdirSync(nestedDistDir, { withFileTypes: true })) {
  cpSync(join(nestedDistDir, entry.name), join(normalizedDistDir, entry.name), {
    force: true,
    recursive: entry.isDirectory(),
  });
}

rmSync(nestedDistDir, { force: true, recursive: true });

for (const artifactPath of UNUSED_WASM_ARTIFACTS) {
  rmSync(artifactPath, { force: true });
}

if (browser === 'firefox') {
  const sourcesZip = join(
    process.cwd(),
    'dist',
    browser,
    `snapvault-${version}-sources.zip`,
  );
  if (existsSync(sourcesZip)) {
    rmSync(sourcesZip, { force: true });
  }
}
