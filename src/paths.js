const os = require('os');
const path = require('path');

function getClaudeConfigDir(env = process.env) {
  return env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

function getRegistryPath(env = process.env) {
  return path.join(getClaudeConfigDir(env), 'projects.json');
}

function getSosHome(env = process.env) {
  return env.SOS_MEMORY_HOME || path.join(os.homedir(), '.sos-memory');
}

function getInstalledVersionPath(env = process.env) {
  return path.join(getSosHome(env), 'installed-version');
}

function getRepoRoot(entrypoint = __filename) {
  let current = path.resolve(entrypoint);
  if (!current.endsWith(path.sep)) current = path.dirname(current);

  while (current !== path.dirname(current)) {
    const candidate = path.join(current, 'package.json');
    if (require('fs').existsSync(candidate)) return current;
    current = path.dirname(current);
  }

  throw new Error('Could not derive sos-memory repo root from entrypoint');
}

module.exports = {
  getClaudeConfigDir,
  getInstalledVersionPath,
  getRegistryPath,
  getRepoRoot,
  getSosHome
};
