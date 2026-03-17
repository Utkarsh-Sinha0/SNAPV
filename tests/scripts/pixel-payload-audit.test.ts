import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

describe('audit-pixel-payload script', () => {
  it('fails when a function contains a bare fetch without a guard', async () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), 'snapvault-audit-'));
    const srcDir = path.join(rootDir, 'src');
    mkdirSync(srcDir);
    writeFileSync(
      path.join(srcDir, 'unsafe.ts'),
      `
        export async function unsafeCall() {
          return fetch('https://example.com');
        }
      `,
      'utf8',
    );

    try {
      await expect(
        execFileAsync('node', ['scripts/audit-pixel-payload.mjs', '--root', srcDir], {
          cwd: process.cwd(),
        }),
      ).rejects.toMatchObject({
        stderr: expect.stringContaining('unsafe.ts'),
      });
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });
});
