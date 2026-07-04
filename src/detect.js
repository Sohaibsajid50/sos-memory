const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function commandExists(command) {
  const lookup = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(lookup, [command], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim().split(/\r?\n/)[0] : null;
}

function findInCandidates(name, extraDirs = []) {
  const fromPath = commandExists(name);
  if (fromPath) return fromPath;
  const dirs = [
    ...extraDirs,
    path.join(os.homedir(), '.bun/bin'),
    path.join(os.homedir(), '.local/bin'),
    path.join(os.homedir(), '.npm-global/bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin'
  ];
  return dirs.map((dir) => path.join(dir, name)).find((candidate) => fs.existsSync(candidate)) || null;
}

function detectQmd(env = process.env) {
  const found = findInCandidates('qmd');
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

function detectBun() {
  const found = findInCandidates('bun');
  return found
    ? { found: true, path: found }
    : { found: false, guidance: 'Install bun: curl -fsSL https://bun.sh/install | bash (or: brew install oven-sh/bun/bun)' };
}

function detectGbrain() {
  const found = findInCandidates('gbrain');
  if (!found) {
    return { found: false, guidance: 'Install GBrain: bun install -g github:garrytan/gbrain (then: gbrain apply-migrations --yes)' };
  }
  const configPath = path.join(os.homedir(), '.gbrain', 'config.json');
  let config = null;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (_) {}
  return { found: true, path: found, configPath, config };
}

function detectOllama() {
  const found = findInCandidates('ollama');
  if (!found) {
    return {
      found: false,
      models: [],
      guidance: 'Install Ollama: brew install ollama (macOS) or curl -fsSL https://ollama.com/install.sh | sh (Linux)'
    };
  }
  // `ollama pull` can exit 0 after a failed download — trust `ollama list` only.
  const list = spawnSync(found, ['list'], { encoding: 'utf8', timeout: 15000 });
  const models = list.status === 0
    ? list.stdout.split('\n').slice(1).map((line) => line.split(/\s+/)[0]).filter(Boolean)
    : [];
  return { found: true, path: found, running: list.status === 0, models };
}

function detectPostgres(databaseUrl) {
  const psql = findInCandidates('psql', ['/opt/homebrew/opt/postgresql@17/bin']);
  if (!psql) {
    return { found: false, guidance: 'Install PostgreSQL 17 + pgvector: brew install postgresql@17 pgvector (macOS) or apt install postgresql-17 postgresql-17-pgvector (Linux)' };
  }
  if (!databaseUrl) return { found: true, path: psql, reachable: null };
  const probe = spawnSync(psql, [databaseUrl, '-tAc', "SELECT extversion FROM pg_extension WHERE extname='vector'"], {
    encoding: 'utf8',
    timeout: 10000
  });
  return {
    found: true,
    path: psql,
    reachable: probe.status === 0,
    pgvectorVersion: probe.status === 0 ? probe.stdout.trim() || null : null
  };
}

function detectAgents() {
  return {
    claude: findInCandidates('claude'),
    codex: findInCandidates('codex'),
    gemini: findInCandidates('gemini')
  };
}

module.exports = {
  detectAgents,
  detectBun,
  detectContinues,
  detectGbrain,
  detectOllama,
  detectPostgres,
  detectQmd,
  findInCandidates
};
