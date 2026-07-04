const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const readline = require('readline/promises');
const { stdin: input, stdout: output } = require('process');
const { loadOrCreateRegistry } = require('./registry');
const { ensureDir, exists, writeFileWithBackup } = require('./fs-utils');
const { getClaudeConfigDir, getInstalledVersionPath, getRegistryPath, getSosHome } = require('./paths');

const INSTALL_FILES = [
  ['hooks/_common.js', 'hooks/_common.js'],
  ['hooks/vault-daily.js', 'hooks/vault-daily.js'],
  ['hooks/vault-identity.js', 'hooks/vault-identity.js'],
  ['hooks/vault-autosave.js', 'hooks/vault-autosave.js'],
  ['hooks/qmd-refresh.js', 'hooks/qmd-refresh.js'],
  ['hooks/sos-health-check.js', 'hooks/sos-health-check.js'],
  ['hooks/action-log.js', 'hooks/action-log.js'],
  ['hooks/gbrain-sync.js', 'hooks/gbrain-sync.js'],
  ['hooks/transcript-distiller.js', 'hooks/transcript-distiller.js'],
  ['skills/sos-memory/SKILL.md', 'skills/sos-memory/SKILL.md'],
  ['skills/sos-bootstrap/SKILL.md', 'skills/sos-bootstrap/SKILL.md'],
  ['skills/sos-vault-maintenance/SKILL.md', 'skills/sos-vault-maintenance/SKILL.md'],
  ['templates/adapters/CLAUDE.md', 'adapters/CLAUDE.md'],
  ['templates/adapters/AGENTS.md', 'adapters/AGENTS.md'],
  ['templates/adapters/GEMINI.md', 'adapters/GEMINI.md'],
  ['templates/continues/.continues.yml', 'templates/.continues.yml'],
  ['templates/vault/how-we-work.md', 'templates/how-we-work.md']
];

function defaultInstallConfig(env = process.env) {
  const documentsRoot = env.SOS_DOCUMENTS_ROOT || path.join(os.homedir(), 'Documents');
  return {
    documentsRoot,
    vaultRoot: env.SOS_VAULT_ROOT || path.join(documentsRoot, '05-Personal/vault'),
    pendingRoot: env.SOS_PENDING_ROOT || path.join(getClaudeConfigDir(env), 'pending-projects')
  };
}

async function confirm(message, assumeYes) {
  if (assumeYes) return true;
  const rl = readline.createInterface({ input, output });
  const answer = await rl.question(`${message} [y/N] `);
  rl.close();
  return answer.trim().toLowerCase() === 'y';
}

async function install(options = {}) {
  const repoRoot = options.repoRoot || path.resolve(__dirname, '..');
  const env = options.env || process.env;
  const auto = Boolean(options.auto);
  const dryRun = Boolean(options.dryRun);
  const assumeYes = Boolean(options.yes || auto);
  const registryPath = options.registryPath || getRegistryPath(env);
  const sosHome = getSosHome(env);
  const backupRoot = path.join(sosHome, 'backups');
  const config = defaultInstallConfig(env);
  const plannedTargets = INSTALL_FILES.map(([, target]) => path.join(sosHome, target));

  console.log(`Registry: ${registryPath}`);
  console.log(`Vault: ${config.vaultRoot}`);
  console.log(`Files to install: ${plannedTargets.length}`);
  if (dryRun) {
    for (const target of plannedTargets) console.log(`[dry-run] ${target}`);
    return { dryRun: true, files: plannedTargets };
  }

  if (!(await confirm('Proceed with SOS memory install?', assumeYes))) {
    console.log('Install cancelled.');
    return { cancelled: true };
  }

  await ensureDir(backupRoot);
  await loadOrCreateRegistry(registryPath, config, { backupRoot });
  await ensureDir(path.join(config.vaultRoot, 'Daily'));
  await ensureDir(path.join(config.vaultRoot, 'Projects'));
  await ensureDir(path.join(config.vaultRoot, 'Intelligence/decisions'));
  await ensureDir(path.join(config.vaultRoot, 'Context'));

  for (const [source, target] of INSTALL_FILES) {
    const sourcePath = path.join(repoRoot, source);
    if (!(await exists(sourcePath))) continue;
    const content = await fs.readFile(sourcePath, 'utf8');
    const mode = source.endsWith('.js') ? 0o755 : undefined;
    await writeFileWithBackup(path.join(sosHome, target), content, { backupRoot, mode });
  }

  const pkg = JSON.parse(await fs.readFile(path.join(repoRoot, 'package.json'), 'utf8'));
  await writeFileWithBackup(getInstalledVersionPath(env), `${pkg.version}\n`, { backupRoot });
  console.log(`Installed SOS memory ${pkg.version}`);
  return { installed: true, version: pkg.version };
}

module.exports = {
  INSTALL_FILES,
  defaultInstallConfig,
  install
};
