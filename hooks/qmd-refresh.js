#!/usr/bin/env node

const { spawnSync } = require('child_process');

const result = spawnSync('which', ['qmd'], { encoding: 'utf8' });
if (result.status !== 0) {
  console.log('Install QMD: npm install -g @tobilu/qmd');
  process.exit(0);
}

spawnSync(result.stdout.trim(), ['update'], { stdio: 'inherit' });
