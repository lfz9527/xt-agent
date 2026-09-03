import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

function runBin(...args: string[]) {
  return new Promise<{ status: number | null; stderr: string }>((resolveResult, reject) => {
    const child = spawn(process.execPath, [resolve(here, 'bin.mjs'), ...args], {
      cwd: resolve(here, '..'),
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (status) => resolveResult({ status, stderr }));
  });
}

describe('Loop CLI executable', () => {
  it('declares the loop binary and launcher script', async () => {
    const packageJson = JSON.parse(await readFile(resolve(here, '../package.json'), 'utf8')) as {
      bin?: { loop?: string };
      scripts?: { loop?: string };
    };

    expect(packageJson.bin?.loop).toBe('cli/bin.mjs');
    expect(packageJson.scripts?.loop).toBe('tsx cli/index.ts');
  });

  it('boots the real CLI through the executable launcher', async () => {
    const result = await runBin('unknown-command');

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('[LOOP_BLOCKED]');
  });
});
