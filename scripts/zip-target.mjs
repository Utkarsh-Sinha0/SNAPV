import { execSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const browser = process.env.TARGET_BROWSER === 'firefox' ? 'firefox' : 'chrome';
const packageJson = JSON.parse(
  readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
);
const version = packageJson.version;

execSync(`npx wxt zip -b ${browser}`, {
  cwd: process.cwd(),
  env: process.env,
  shell: true,
  stdio: 'inherit',
});

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
