const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function commandExists(command) {
  const result = spawnSync('which', [command], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

function detectQmd(env = process.env) {
  const fromPath = commandExists('qmd');
  if (fromPath) return { found: true, path: fromPath };

  const candidates = [
    path.join(os.homedir(), '.npm-global/bin/qmd'),
    path.join(os.homedir(), '.local/bin/qmd'),
    '/usr/local/bin/qmd'
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));

  return found
    ? { found: true, path: found }
    : { found: false, guidance: 'Install QMD: npm install -g @tobilu/qmd' };
}

function detectContinues() {
  const result = spawnSync('continues', ['--version'], { encoding: 'utf8' });
  if (result.status === 0) {
    return { found: true, version: result.stdout.trim() || result.stderr.trim() };
  }

  return { found: false, guidance: '[info] Continues CLI not found. Optional bridge available with: npx continues --help' };
}

module.exports = {
  detectContinues,
  detectQmd
};
