const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const test = require('node:test');
const {
  createRegistry,
  loadOrCreateRegistry,
  mergeProjects,
  resolveProject
} = require('../src/registry');

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'sos-registry-'));
}

test('creates registry schema v1', () => {
  const registry = createRegistry({
    documentsRoot: '/tmp/docs',
    vaultRoot: '/tmp/docs/vault',
    pendingRoot: '/tmp/pending'
  });

  assert.equal(registry.version, 1);
  assert.deepEqual(registry.projects, []);
});

test('merges v1 projects without overwriting existing entries', () => {
  const existing = {
    version: 1,
    documents_root: '/docs',
    vault_root: '/docs/vault',
    pending_root: '/pending',
    projects: [{ name: 'A', path: '/docs/A' }]
  };

  const merged = mergeProjects(existing, [
    { name: 'A duplicate', path: '/docs/A' },
    { name: 'B', path: '/docs/B' }
  ]);

  assert.equal(merged.projects.length, 2);
  assert.equal(merged.projects[0].name, 'A');
  assert.equal(merged.projects[1].name, 'B');
});

test('resolves project by longest matching source path', () => {
  const registry = {
    version: 1,
    projects: [
      { name: 'Root', path: '/docs/06-AI-Workspace' },
      { name: 'Nested', path: '/docs/06-AI-Workspace/sos-memory' }
    ]
  };

  const project = resolveProject(registry, '/docs/06-AI-Workspace/sos-memory/src');
  assert.equal(project.name, 'Nested');
});

test('unsupported existing registry is backed up and rejected', async () => {
  const root = await tempDir();
  const registryPath = path.join(root, 'projects.json');
  const backupRoot = path.join(root, 'backups');
  await fs.writeFile(registryPath, '{"version":2}\n');

  await assert.rejects(
    () => loadOrCreateRegistry(registryPath, {
      documentsRoot: root,
      vaultRoot: path.join(root, 'vault'),
      pendingRoot: path.join(root, 'pending')
    }, { backupRoot }),
    /Unsupported registry version/
  );

  const backups = await fs.readdir(backupRoot);
  assert.equal(backups.length, 1);
});
