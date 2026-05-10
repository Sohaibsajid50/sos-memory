const fs = require('fs/promises');
const path = require('path');
const { spawnSync } = require('child_process');
const { detectContinues, detectQmd } = require('./detect');
const { exists, readJson } = require('./fs-utils');
const { assertSupportedRegistry } = require('./registry');
const { getInstalledVersionPath, getRegistryPath } = require('./paths');

async function getLatestTag() {
  const result = spawnSync('git', ['ls-remote', '--tags', 'origin'], { encoding: 'utf8' });
  if (result.status !== 0) return null;
  return result.stdout
    .split('\n')
    .map((line) => line.split('/').pop())
    .filter(Boolean)
    .sort()
    .pop() || null;
}

async function validate(options = {}) {
  const env = options.env || process.env;
  const repoRoot = options.repoRoot || path.resolve(__dirname, '..');
  const registryPath = options.registryPath || getRegistryPath(env);
  const issues = [];
  const notes = [];

  if (await exists(registryPath)) {
    const registry = await readJson(registryPath);
    assertSupportedRegistry(registry);
    notes.push(`[ok] Registry: ${registryPath}`);
    notes.push(`[ok] Registered projects: ${registry.projects.length}`);
    for (const key of ['documents_root', 'vault_root', 'pending_root']) {
      if (await exists(registry[key])) notes.push(`[ok] ${key}: ${registry[key]}`);
      else issues.push(`[warn] Missing ${key}: ${registry[key]}`);
    }
  } else {
    issues.push(`[warn] Missing registry: ${registryPath}`);
  }

  const packageJson = JSON.parse(await fs.readFile(path.join(repoRoot, 'package.json'), 'utf8'));
  const installedPath = getInstalledVersionPath(env);
  const installedVersion = (await exists(installedPath))
    ? (await fs.readFile(installedPath, 'utf8')).trim()
    : null;
  notes.push(`[ok] Toolkit version: ${packageJson.version}`);
  if (installedVersion) notes.push(`[ok] Installed version: ${installedVersion}`);

  if (installedVersion && installedVersion !== packageJson.version) {
    issues.push('[warn] SOS toolkit is behind. Run: sos update');
  }

  const latestTag = await getLatestTag();
  if (latestTag && latestTag.replace(/^v/, '') !== packageJson.version) {
    issues.push('[warn] SOS toolkit is behind. Run: sos update');
  }

  const qmd = detectQmd(env);
  if (qmd.found) notes.push(`[ok] QMD: ${qmd.path}`);
  else issues.push(qmd.guidance);

  const continues = detectContinues();
  if (continues.found) notes.push(`[ok] Continues: ${continues.version}`);
  else notes.push(continues.guidance);

  for (const note of notes) console.log(note);
  for (const issue of issues) console.log(issue);
  if (!issues.length) console.log('SOS memory validation passed.');
  return { issues, qmd, continues, installedVersion };
}

module.exports = {
  validate
};
