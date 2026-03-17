import { execSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const browser = process.env.TARGET_BROWSER === 'firefox' ? 'firefox' : 'chrome';
const nestedDirName = browser === 'firefox' ? 'firefox-mv2' : 'chrome-mv3';
const normalizedDistDir = join(process.cwd(), 'dist', browser);
const nestedDistDir = join(normalizedDistDir, nestedDirName);

execSync(`npx wxt build -b ${browser}`, {
  cwd: process.cwd(),
  env: process.env,
  shell: true,
  stdio: 'inherit',
});

if (!existsSync(nestedDistDir)) {
  throw new Error(`Expected build output at ${nestedDistDir}`);
}

for (const entry of readdirSync(nestedDistDir, { withFileTypes: true })) {
  cpSync(join(nestedDistDir, entry.name), join(normalizedDistDir, entry.name), {
    force: true,
    recursive: entry.isDirectory(),
  });
}
