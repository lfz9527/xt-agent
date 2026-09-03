#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('./index.ts', import.meta.url));
const tsx = fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url));

const result = spawnSync(process.execPath, [tsx, cli, ...process.argv.slice(2)], {
  stdio: 'inherit',
  windowsHide: false,
});

if (result.error) {
  console.error(`[LOOP_BLOCKED] failed to start Loop CLI: ${result.error.message}`);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
