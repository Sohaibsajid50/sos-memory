const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const test = require('node:test');
const { scanNumberedFolders } = require('../src/bootstrap');
const { detectQmd } = require('../src/detect');
const { getRepoRoot } = require('../src/paths');

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'sos-paths-'));
}

test('repo root is derived from cli entrypoint location', () => {
  const root = getRepoRoot(path.join(__dirname, '..', 'bin', 'sos.js'));
  assert.equal(path.basename(root), 'sos-memory');
});

test('numbered folder scanner excludes 00-* folders', async () => {
  const root = await tempDir();
  await fs.mkdir(path.join(root, '00-Inbox'));
  await fs.mkdir(path.join(root, '01-Client'));
  await fs.mkdir(path.join(root, '06-Workspace'));
  await fs.mkdir(path.join(root, 'misc'));

  const folders = await scanNumberedFolders(root);
  assert.deepEqual(folders.map((folder) => path.basename(folder)).sort(), ['01-Client', '06-Workspace']);
});

test('QMD detection checks npm-global fallback before guidance', async () => {
  const originalPath = process.env.PATH;
  const originalHome = process.env.HOME;
  const dir = await tempDir();

  process.env.PATH = '/definitely/missing';
  process.env.HOME = dir;

  await fs.mkdir(path.join(dir, '.npm-global/bin'), { recursive: true });
  await fs.writeFile(path.join(dir, '.npm-global/bin/qmd'), '');

  const found = detectQmd();
  assert.equal(found.found, true);
  assert.equal(found.path, path.join(dir, '.npm-global/bin/qmd'));

  await fs.rm(path.join(dir, '.npm-global/bin/qmd'));
  const missing = detectQmd();

  process.env.PATH = originalPath;
  process.env.HOME = originalHome;

  if (!missing.found) {
    assert.equal(missing.guidance, 'Install QMD: npm install -g @tobilu/qmd');
  }
});
