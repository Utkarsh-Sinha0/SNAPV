import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const REQUIRED_FILES = ['manifest.json', 'background.js'];
const FORBIDDEN_PATH_SEGMENTS = ['node_modules'];
const FORBIDDEN_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.map'];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function collectRelativeFiles(rootDir, currentDir = rootDir) {
  const files = [];

  for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectRelativeFiles(rootDir, absolutePath));
      continue;
    }

    if (entry.isFile()) {
      files.push(path.relative(rootDir, absolutePath));
    }
  }

  return files;
}

function validateFileList(files, label) {
  for (const requiredFile of REQUIRED_FILES) {
    assert(
      files.includes(requiredFile),
      `${label} is missing required file ${requiredFile}`,
    );
  }

  for (const file of files) {
    const normalized = file.replaceAll('\\', '/');
    const extension = path.extname(normalized).toLowerCase();

    assert(
      !FORBIDDEN_EXTENSIONS.includes(extension),
      `${label} contains forbidden source artifact ${normalized}`,
    );
    assert(
      !FORBIDDEN_PATH_SEGMENTS.some((segment) => normalized.split('/').includes(segment)),
      `${label} contains forbidden path segment in ${normalized}`,
    );
  }
}

function validateBuildDirectory(browser) {
  const buildDir = path.join(process.cwd(), 'dist', browser);
  assert(existsSync(buildDir), `Build directory not found: ${buildDir}`);
  assert(statSync(buildDir).isDirectory(), `Expected a directory at ${buildDir}`);

  const files = collectRelativeFiles(buildDir);
  validateFileList(files, `${browser} build directory`);
}

function expandZipArchive(zipPath) {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'snapvault-artifacts-'));
  execFileSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${tempDir.replace(/'/g, "''")}' -Force`,
    ],
    {
      stdio: 'pipe',
    },
  );
  return tempDir;
}

async function getPackageVersion() {
  const raw = await readFile(path.join(process.cwd(), 'package.json'), 'utf8');
  return JSON.parse(raw).version;
}

function validateZipArchive(browser, version) {
  const browserDir = path.join(process.cwd(), 'dist', browser);
  const zipPath = path.join(browserDir, `snapvault-${version}-${browser}.zip`);

  assert(existsSync(zipPath), `ZIP archive not found: ${zipPath}`);

  const extractedDir = expandZipArchive(zipPath);
  try {
    const files = collectRelativeFiles(extractedDir);
    validateFileList(files, `${browser} ZIP archive`);
  } finally {
    rmSync(extractedDir, { recursive: true, force: true });
  }
}

async function main() {
  const browsers = process.argv.slice(2);
  const targets = browsers.length > 0 ? browsers : ['chrome', 'firefox'];
  const version = await getPackageVersion();

  for (const browser of targets) {
    validateBuildDirectory(browser);
    validateZipArchive(browser, version);
  }

  console.log(`Validated build artifacts for ${targets.join(', ')}`);
}

await main();
