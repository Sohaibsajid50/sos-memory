const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const test = require('node:test');
const { auditVault } = require('../src/audit');
const { bootstrapProject } = require('../src/bootstrap');
const { install } = require('../src/install');
const { exists } = require('../src/fs-utils');

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'sos-install-'));
}

function envFor(root) {
  return {
    ...process.env,
    CLAUDE_CONFIG_DIR: path.join(root, '.claude'),
    SOS_MEMORY_HOME: path.join(root, '.sos-memory'),
    SOS_DOCUMENTS_ROOT: root,
    SOS_VAULT_ROOT: path.join(root, '05-Personal', 'vault'),
    SOS_PENDING_ROOT: path.join(root, '.claude', 'pending-projects')
  };
}

test('install dry-run writes nothing', async () => {
  const root = await tempDir();
  const env = envFor(root);

  await install({ dryRun: true, yes: true, env, repoRoot: path.join(__dirname, '..') });

  assert.equal(await exists(path.join(env.CLAUDE_CONFIG_DIR, 'projects.json')), false);
  assert.equal(await exists(env.SOS_MEMORY_HOME), false);
});

test('install creates registry, vault folders, installed version, and templates', async () => {
  const root = await tempDir();
  const env = envFor(root);

  await install({ auto: true, env, repoRoot: path.join(__dirname, '..') });

  assert.equal(await exists(path.join(env.CLAUDE_CONFIG_DIR, 'projects.json')), true);
  assert.equal(await exists(path.join(env.SOS_VAULT_ROOT, 'Daily')), true);
  assert.equal(await exists(path.join(env.SOS_MEMORY_HOME, 'installed-version')), true);
  assert.equal(await exists(path.join(env.SOS_MEMORY_HOME, 'hooks', '_common.js')), true);
  assert.equal(await exists(path.join(env.SOS_MEMORY_HOME, 'adapters', 'CLAUDE.md')), true);
  assert.equal(await exists(path.join(env.SOS_MEMORY_HOME, 'templates', '.continues.yml')), true);
});

test('bootstrap-project registers once and audit only reports suggestions', async () => {
  const root = await tempDir();
  const env = envFor(root);
  const projectPath = path.join(root, '07-Project-Managers');
  await fs.mkdir(projectPath, { recursive: true });

  await install({ auto: true, env, repoRoot: path.join(__dirname, '..') });
  await bootstrapProject(projectPath, {
    env,
    registryPath: path.join(env.CLAUDE_CONFIG_DIR, 'projects.json'),
    backupRoot: path.join(env.SOS_MEMORY_HOME, 'backups')
  });
  await bootstrapProject(projectPath, {
    env,
    registryPath: path.join(env.CLAUDE_CONFIG_DIR, 'projects.json'),
    backupRoot: path.join(env.SOS_MEMORY_HOME, 'backups')
  });

  const registry = JSON.parse(await fs.readFile(path.join(env.CLAUDE_CONFIG_DIR, 'projects.json'), 'utf8'));
  assert.equal(registry.projects.length, 1);

  const suggestions = await auditVault({
    env,
    registryPath: path.join(env.CLAUDE_CONFIG_DIR, 'projects.json')
  });
  assert.ok(Array.isArray(suggestions));
});
