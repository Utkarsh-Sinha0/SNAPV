import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const REQUIRED_FILES = ['manifest.json', 'background.js'];
const REQUIRED_ML_ASSETS = [
  'assets/ml/redaction/config.json',
  'assets/ml/redaction/preprocessor_config.json',
  'assets/ml/redaction/onnx/model_quantized.onnx',
  'assets/ml/wasm/ort-wasm-simd-threaded.mjs',
  'assets/ml/wasm/ort-wasm-simd-threaded.wasm',
];
const FORBIDDEN_ML_ASSETS = [
  'assets/ml/wasm/ort-wasm-simd-threaded.jsep.mjs',
  'assets/ml/wasm/ort-wasm-simd-threaded.jsep.wasm',
];
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
  const normalizedFiles = files.map((file) => file.replaceAll('\\', '/'));

  for (const requiredFile of REQUIRED_FILES) {
    assert(
      normalizedFiles.includes(requiredFile),
      `${label} is missing required file ${requiredFile}`,
    );
  }

  for (const requiredAsset of REQUIRED_ML_ASSETS) {
    assert(
      normalizedFiles.includes(requiredAsset),
      `${label} is missing required ML asset ${requiredAsset}`,
    );
  }

  for (const forbiddenAsset of FORBIDDEN_ML_ASSETS) {
    assert(
      !normalizedFiles.includes(forbiddenAsset),
      `${label} contains deprecated ML runtime asset ${forbiddenAsset}`,
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

function readManifest(rootDir) {
  return JSON.parse(readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'));
}

function getLicensingMatchPattern() {
  const baseUrl = process.env.SNAPVAULT_LICENSING_BASE_URL?.trim();
  if (!baseUrl) {
    return null;
  }

  const url = new URL(baseUrl);
  return `${url.protocol}//${url.host}/*`;
}

function validateManifest(browser, rootDir, label) {
  const manifest = readManifest(rootDir);
  const licensingMatchPattern = getLicensingMatchPattern();

  if (browser === 'firefox') {
    assert(manifest.manifest_version === 2, `${label} must use MV2 for Firefox`);
    assert(
      !manifest.permissions?.includes('offscreen'),
      `${label} must not request the offscreen permission on Firefox`,
    );
    assert(
      Array.isArray(manifest.background?.scripts) && manifest.background.scripts.includes('background.js'),
      `${label} must expose background.js as a Firefox background page`,
    );
    assert(
      manifest.browser_specific_settings?.gecko?.id === 'snapvault@snapvault.app',
      `${label} must declare a stable Firefox add-on id`,
    );
    assert(
      Array.isArray(manifest.browser_specific_settings?.gecko?.data_collection_permissions?.required)
        && manifest.browser_specific_settings.gecko.data_collection_permissions.required.includes('none'),
      `${label} must declare Firefox data collection permissions as none`,
    );
    if (licensingMatchPattern) {
      assert(
        Array.isArray(manifest.permissions) && manifest.permissions.includes(licensingMatchPattern),
        `${label} must include the licensing host permission ${licensingMatchPattern}`,
      );
    }
    return;
  }

  assert(manifest.manifest_version === 3, `${label} must use MV3 for Chromium targets`);
  assert(
    manifest.permissions?.includes('offscreen'),
    `${label} must request the offscreen permission for Chromium targets`,
  );
  assert(
    manifest.background?.service_worker === 'background.js',
    `${label} must expose background.js as an MV3 service worker`,
  );
  if (licensingMatchPattern) {
    assert(
      Array.isArray(manifest.host_permissions) && manifest.host_permissions.includes(licensingMatchPattern),
      `${label} must include the licensing host permission ${licensingMatchPattern}`,
    );
  }
}

function validateBuildDirectory(browser) {
  const buildDir = path.join(process.cwd(), 'dist', browser);
  assert(existsSync(buildDir), `Build directory not found: ${buildDir}`);
  assert(statSync(buildDir).isDirectory(), `Expected a directory at ${buildDir}`);

  const files = collectRelativeFiles(buildDir);
  validateFileList(files, `${browser} build directory`);
  validateManifest(browser, buildDir, `${browser} build directory`);
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
  const expectedZipName = `snapvault-${version}-${browser}.zip`;
  const zipFiles = readdirSync(browserDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.zip'))
    .map((entry) => entry.name);

  assert(
    zipFiles.includes(expectedZipName),
    `ZIP archive not found: ${path.join(browserDir, expectedZipName)}`,
  );
  assert(
    zipFiles.length === 1,
    `${browser} build directory contains unexpected ZIP archives: ${zipFiles.join(', ')}`,
  );

  const zipPath = path.join(browserDir, expectedZipName);

  const extractedDir = expandZipArchive(zipPath);
  try {
    const files = collectRelativeFiles(extractedDir);
    validateFileList(files, `${browser} ZIP archive`);
    validateManifest(browser, extractedDir, `${browser} ZIP archive`);
  } finally {
    rmSync(extractedDir, { recursive: true, force: true });
  }
}

async function main() {
  const browsers = process.argv.slice(2);
  const targets = browsers.length > 0 ? browsers : ['chrome', 'firefox', 'edge'];
  const version = await getPackageVersion();

  for (const browser of targets) {
    validateBuildDirectory(browser);
    validateZipArchive(browser, version);
  }

  console.log(`Validated build artifacts for ${targets.join(', ')}`);
}

await main();
